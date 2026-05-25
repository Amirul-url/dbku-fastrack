from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser
from rest_framework.response import Response
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.db.models import Q
from copy import deepcopy
import mimetypes
from .models import Application, SupportingDocument
from .serializers import (
    ApplicationListSerializer,
    ApplicationDetailSerializer,
    SupportingDocumentSerializer,
)
from notifications.services import (
    apply_license_renewal_action,
    normalize_department,
    notify_application_status_change,
)

STAFF_ROLES = ["admin", "supervisor", "staff"]


class ApplicationViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_serializer_class(self):
        if self.action == "list":
            return ApplicationListSerializer

        return ApplicationDetailSerializer

    def get_queryset(self):
        user = self.request.user

        if user.role in STAFF_ROLES:
            queryset = Application.objects.filter(~Q(status="draft") | Q(applicant=user))
        else:
            queryset = Application.objects.filter(applicant=user)

        queryset = queryset.select_related("applicant").order_by("-updated_at")

        if self.action == "list":
            return queryset

        return queryset.prefetch_related("supporting_documents")

    def perform_create(self, serializer):
        if self.request.user.role not in ["applicant", "user"]:
            raise PermissionDenied("Only applicants can create applications.")

        serializer.save(applicant=self.request.user)

    def perform_update(self, serializer):
        self.ensure_applicant_can_update(serializer.instance)
        old_status = serializer.instance.status
        old_remark = serializer.instance.latest_remark
        old_form_data = deepcopy(serializer.instance.form_data or {})
        self.ensure_staff_can_update_workflow(serializer.instance)
        application = serializer.save()
        notify_application_status_change(
            application,
            old_status,
            old_remark,
            old_form_data=old_form_data,
        )

    def perform_destroy(self, instance):
        documents = list(instance.supporting_documents.all())
        for document in documents:
            if document.file:
                document.file.delete(save=False)

        instance.delete()

    def ensure_staff_can_update_workflow(self, application):
        user = self.request.user
        if user.role not in STAFF_ROLES:
            return

        requested_status = str(self.request.data.get("status", application.status) or "").strip().lower()
        current_status = str(application.status or "").strip().lower()
        department = normalize_department(getattr(user, "department", ""))

        if requested_status == "management_review" and current_status == "mphlg_decision_received":
            if department != "SUT":
                raise PermissionDenied("Only SUT can record the SUT result for this application.")
            return

        if requested_status == "management_review" and current_status == "management_review":
            if self.is_management_support_memo_save(application, department):
                return

        if requested_status == "management_review" and current_status == "management_review":
            if department != "KB(LES)":
                raise PermissionDenied("Only KB(LES) can verify the application at this stage.")
            return

        if requested_status == "technical_review_completed" and current_status == "management_review":
            if department not in {"KB(LES)", "TP(RES)", "PGH", "TP(RES)/PGH", "TP/PGH"}:
                raise PermissionDenied("Only KB(LES) or TP(RES)/PGH can return the application to KU(IKL) at this stage.")
            return

        if requested_status == "technical_review_completed" and current_status == "mphlg_processing":
            if department != "MPHLG":
                raise PermissionDenied("Only MPHLG can return the application to KU(IKL) at this stage.")
            return

        if requested_status == "approved" and current_status == "management_review":
            if department not in {"TP(RES)", "PGH", "TP(RES)/PGH", "TP/PGH"}:
                raise PermissionDenied("Only TP(RES)/PGH can make the final approval decision.")
            return

        if requested_status == "rejected" and current_status == "management_review":
            if department not in {"TP(RES)", "PGH", "TP(RES)/PGH", "TP/PGH"}:
                raise PermissionDenied("Only TP(RES)/PGH can reject at this approval stage.")
            return

        if requested_status == "bill_pending_ku":
            if department != "PT(IKL)":
                raise PermissionDenied("Only PT(IKL) can generate the approval letter and bill.")
            return

        if requested_status == "invoice_generated" and current_status == "bill_pending_ku":
            if department != "KU(IKL)":
                raise PermissionDenied("Only KU(IKL) can confirm the bill.")
            return

        if requested_status == "invoice_generated" and current_status == "payment_submitted":
            if department != "PT(IKL)":
                raise PermissionDenied("Only PT(IKL) can reject payment proof.")
            return

        if requested_status in {"payment_verified", "license_issued", "license_revoked"}:
            if department != "PT(IKL)":
                raise PermissionDenied("Only PT(IKL) can complete payment and license actions.")

    def is_management_support_memo_save(self, application, department):
        if department not in {"TP(RES)", "PGH", "TP(RES)/PGH", "TP/PGH"}:
            return False

        form_data = self.request.data.get("form_data") or {}
        if not isinstance(form_data, dict):
            return False

        current_form_data = application.form_data or {}
        changed_keys = {
            key
            for key, value in form_data.items()
            if value != current_form_data.get(key)
        }

        if not changed_keys.issubset({"management_recommendation"}):
            return False

        support_section = form_data.get("management_recommendation") or {}
        if not isinstance(support_section, dict):
            return False

        support_status = str(support_section.get("status") or "").strip().lower()
        support_decision = str(support_section.get("decision") or "").strip().lower()
        completed_statuses = {"approved", "supported", "completed", "rejected"}
        completed_decisions = {"approve", "approved", "support", "supported", "reject", "rejected", "not supported"}

        if support_status in completed_statuses or support_decision in completed_decisions:
            return False

        return bool(
            support_section.get("approval_note_html")
            or support_section.get("approval_note_saved_at")
        )

    def ensure_applicant_can_update(self, application):
        user = self.request.user

        if user.role in STAFF_ROLES:
            return

        editable_statuses = {"draft", "incomplete", "technical_amendment", "rejected"}
        current_status = str(application.status or "").strip().lower()
        requested_status = str(self.request.data.get("status", application.status) or "").strip().lower()
        form_data = self.request.data.get("form_data") or {}
        form_keys = set(form_data.keys()) if isinstance(form_data, dict) else set()
        is_payment_only_update = form_keys and form_keys.issubset({"payment"})
        is_payment_proof_update = (
            is_payment_only_update
            and requested_status == "payment_submitted"
            and current_status in {"invoice_generated", "payment_submitted"}
        )

        if current_status in editable_statuses or is_payment_proof_update:
            return

        if form_keys or "current_step" in self.request.data or "status" in self.request.data:
            raise PermissionDenied(
                "Submitted applications can only be viewed unless they are returned for correction."
            )

    @action(detail=True, methods=["post"])
    def upload_document(self, request, pk=None):
        application = self.get_object()

        uploaded_file = request.FILES.get("file")
        title = request.data.get("title", "Document")

        if not uploaded_file:
            return Response(
                {"error": "No file uploaded."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if (
            request.user.role not in STAFF_ROLES
            and application.status not in {"draft", "incomplete", "technical_amendment", "rejected"}
            and not (
                title == "Payment Receipt"
                and application.status in {"invoice_generated", "payment_submitted"}
            )
        ):
            return Response(
                {
                    "error": "Submitted applications can only be viewed unless they are returned for correction."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        document = SupportingDocument.objects.create(
            application=application,
            title=title,
            file=uploaded_file,
        )

        serializer = SupportingDocumentSerializer(
            document,
            context={"request": request},
        )

        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=["get"],
        url_path=r"documents/(?P<document_id>[^/.]+)/download",
    )
    def download_document(self, request, pk=None, document_id=None):
        application = self.get_object()
        document = get_object_or_404(
            SupportingDocument,
            id=document_id,
            application=application,
        )

        return self.file_response(document)

    @action(
        detail=True,
        methods=["delete"],
        url_path=r"documents/(?P<document_id>[^/.]+)",
    )
    def delete_document(self, request, pk=None, document_id=None):
        application = self.get_object()
        document = get_object_or_404(
            SupportingDocument,
            id=document_id,
            application=application,
        )

        if (
            request.user.role not in STAFF_ROLES
            and application.status not in {
                "draft",
                "incomplete",
                "technical_amendment",
                "rejected",
                "invoice_generated",
                "payment_submitted",
            }
        ):
            return Response(
                {
                    "error": "Submitted applications can only be viewed unless they are returned for correction."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        if document.file:
            document.file.delete(save=False)

        document.delete()

        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["get"], url_path="site-image/download")
    def download_site_image(self, request, pk=None):
        application = self.get_object()
        step_1 = (application.form_data or {}).get("step_1", {})
        saved_site_image = step_1.get("site_image") or {}
        saved_document_ids = [
            step_1.get("site_image_document_id"),
            saved_site_image.get("document_id") if isinstance(saved_site_image, dict) else None,
            saved_site_image.get("id") if isinstance(saved_site_image, dict) else None,
        ]
        documents = list(
            application.supporting_documents.filter(title="Site Image").order_by(
                "-uploaded_at"
            )
        )

        for document_id in saved_document_ids:
            if not document_id:
                continue

            try:
                document = application.supporting_documents.get(id=document_id)
            except (SupportingDocument.DoesNotExist, ValueError, TypeError):
                continue

            if document not in documents:
                documents.append(document)

        for document in documents:
            if document.file and document.file.storage.exists(document.file.name):
                return self.file_response(document)

        raise Http404("Site image file not found.")

    def file_response(self, document):
        try:
            content_type = (
                mimetypes.guess_type(document.file.name)[0]
                or "application/octet-stream"
            )
            return FileResponse(
                document.file.open("rb"),
                as_attachment=False,
                filename=document.file.name.rsplit("/", 1)[-1],
                content_type=content_type,
            )
        except FileNotFoundError as exc:
            raise Http404("File not found.") from exc

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        application = self.get_object()

        if application.status != "draft":
            return Response(
                {"error": "Only draft applications can be submitted."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_status = application.status
        old_remark = application.latest_remark
        application.status = "submitted"
        application.current_step = max(application.current_step, 11)
        application.save()
        notify_application_status_change(application, old_status, old_remark)

        return Response(
            {
                "message": "Application submitted successfully.",
                "data": ApplicationDetailSerializer(
                    application,
                    context={"request": request},
                ).data,
            }
        )

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        application = self.get_object()

        department = normalize_department(getattr(request.user, "department", ""))

        if request.user.role not in STAFF_ROLES or department not in {"TP(RES)", "PGH", "TP(RES)/PGH", "TP/PGH"}:
            return Response(
                {
                    "error": "You do not have permission to approve applications."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        old_status = application.status
        old_remark = application.latest_remark
        application.status = "approved"
        application.save()
        notify_application_status_change(application, old_status, old_remark)

        return Response(
            {
                "message": "Application approved successfully.",
                "data": ApplicationDetailSerializer(
                    application,
                    context={"request": request},
                ).data,
            }
        )

    @action(detail=True, methods=["post"], url_path="license-renewal-action")
    def license_renewal_action(self, request, pk=None):
        application = self.get_object()
        action_name = request.data.get("action")
        note = request.data.get("note", "")
        months = request.data.get("months")

        try:
            months = int(months) if months is not None else None
            application = apply_license_renewal_action(
                application=application,
                action=action_name,
                user=request.user,
                months=months,
                note=note,
            )
        except PermissionError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)
        except (TypeError, ValueError) as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "message": "License renewal workflow updated.",
                "data": ApplicationDetailSerializer(
                    application,
                    context={"request": request},
                ).data,
            }
        )

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        application = self.get_object()

        if request.user.role not in STAFF_ROLES:
            return Response(
                {
                    "error": "You do not have permission to reject applications."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        old_status = application.status
        old_remark = application.latest_remark
        application.status = "rejected"
        application.save()
        notify_application_status_change(application, old_status, old_remark)

        return Response(
            {
                "message": "Application rejected successfully.",
                "data": ApplicationDetailSerializer(
                    application,
                    context={"request": request},
                ).data,
            }
        )
