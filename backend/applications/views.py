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
from config.pagination import ApplicationPagination
from config.throttles import UploadRateThrottle
from notifications.services import (
    apply_license_renewal_action,
    normalize_department,
    notify_applicant_application_rejected,
    notify_applicant_application_resubmitted,
    notify_applicant_application_submitted,
    notify_application_status_change,
    notify_staff_application_resubmitted,
)

STAFF_ROLES = ["admin", "supervisor", "staff"]
MAX_ACTIVITY_LOG_ITEMS = 80
APPLICANT_CORRECTION_STATUSES = {"incomplete", "rejected", "technical_amendment"}
APPLICANT_RESUBMIT_STATUSES = {"submitted", "ku_ikl_review", "mphlg_processing"}
RESUBMIT_WORKFLOW_RESET_FIELDS = [
    "auto_screening",
    "correction_request",
    "technical_referral",
    "technical_department_selection",
    "technical_department_reviews",
    "technical_department_reviews_updated_at",
    "technical_review",
    "technical_site_visit",
    "technical_ku_review",
    "technical_review_cycle",
    "kb_les_verification",
    "management_recommendation",
    "mphlg_gateway",
    "sut_approval",
    "approval",
]


def append_application_activity(application, actor, title, description="", category="user"):
    form_data = deepcopy(application.form_data or {})
    activity_log = form_data.get("activity_log")

    if not isinstance(activity_log, list):
        activity_log = []

    activity_log.insert(
        0,
        {
            "title": title,
            "description": description,
            "category": category,
            "actor": get_activity_actor_name(actor),
            "actor_id": getattr(actor, "id", None),
            "actor_role": getattr(actor, "role", ""),
            "actor_department": get_user_workflow_department(actor),
            "created_at": timezone_now_iso(),
        },
    )
    form_data["activity_log"] = activity_log[:MAX_ACTIVITY_LOG_ITEMS]
    application.form_data = form_data
    application.save(update_fields=["form_data", "updated_at"])


def reset_workflow_on_applicant_resubmit(application, old_status, old_form_data=None):
    status_key = str(getattr(application, "status", "") or "").strip().lower()
    old_status_key = str(old_status or "").strip().lower()
    if old_status_key not in APPLICANT_CORRECTION_STATUSES or status_key not in APPLICANT_RESUBMIT_STATUSES:
        return

    form_data = deepcopy(application.form_data or {})
    correction = form_data.get("correction_request")
    if not isinstance(correction, dict):
        correction = (old_form_data or {}).get("correction_request") or {}
    source = normalize_department(correction.get("source"))
    target = normalize_department(correction.get("target"))

    if status_key == "mphlg_processing" and source == "MPHLG" and target == "APPLICANT":
        form_data["correction_request"] = None
        mphlg_gateway = form_data.get("mphlg_gateway") if isinstance(form_data.get("mphlg_gateway"), dict) else {}
        form_data["mphlg_gateway"] = {
            **mphlg_gateway,
            "status": "Pending MPHLG Approval",
            "decision": "",
            "remarks": "",
            "reviewed_at": "",
        }
    else:
        for field in RESUBMIT_WORKFLOW_RESET_FIELDS:
            form_data[field] = {} if field == "technical_department_reviews" else None
        form_data["technical_department_reviews_updated_at"] = ""

    application.form_data = form_data
    application.latest_remark = ""
    application.save(update_fields=["form_data", "latest_remark", "updated_at"])


def get_activity_actor_name(user):
    full_name = " ".join(
        part for part in [getattr(user, "first_name", ""), getattr(user, "last_name", "")] if part
    ).strip()

    return full_name or getattr(user, "username", "") or "Applicant"


def get_user_workflow_department(user):
    identity_department = get_user_identity_workflow_department(user)
    if identity_department == "SUT":
        return identity_department

    department = normalize_department(getattr(user, "department", ""))
    if department:
        return department

    return identity_department


def get_user_identity_workflow_department(user):
    for value in [
        getattr(user, "full_name", ""),
        getattr(user, "username", ""),
        " ".join(
            part
            for part in [getattr(user, "first_name", ""), getattr(user, "last_name", "")]
            if part
        ),
    ]:
        department = normalize_department(value)
        if department:
            return department

    return ""


def timezone_now_iso():
    from django.utils import timezone

    return timezone.now().isoformat()


def get_applicant_activity_message(application, request_data, old_status=""):
    requested_status = str(request_data.get("status", application.status) or "").strip().lower()
    old_status_key = str(old_status or "").strip().lower()
    form_data = request_data.get("form_data") or {}
    form_keys = set(form_data.keys()) if isinstance(form_data, dict) else set()
    step_11 = form_data.get("step_11") if isinstance(form_data, dict) else {}

    if requested_status == "payment_submitted" and form_keys.issubset({"payment"}):
        return (
            "Payment receipt submitted",
            "You submitted your payment receipt. ALiS will verify it before issuing the e-license.",
        )

    if old_status_key in APPLICANT_CORRECTION_STATUSES and requested_status in APPLICANT_RESUBMIT_STATUSES:
        return (
            "Application resubmitted",
            "You sent your updated application back for review.",
        )

    if isinstance(step_11, dict) and step_11.get("submitted"):
        return (
            "Application submitted",
            "You sent your application to ALiS for review.",
        )

    if requested_status in {"submitted", "ku_ikl_review"}:
        return (
            "Application submitted",
            "You sent your application to ALiS for review.",
        )

    if requested_status in {"draft", "incomplete", "technical_amendment", "rejected"}:
        saved_step = get_applicant_saved_step_label(form_keys)
        if saved_step:
            return (
                f"{saved_step} details saved",
                f"You saved changes in {saved_step}.",
            )

        return (
            "Application details saved",
            "You saved changes to your application.",
        )

    if form_keys:
        saved_step = get_applicant_saved_step_label(form_keys)
        if saved_step:
            return (
                f"{saved_step} details saved",
                f"You saved changes in {saved_step}.",
            )

        return (
            "Application details saved",
            "You saved changes to your application.",
        )

    return (
        "Application updated",
        "Your application record was updated.",
    )


def get_staff_workflow_activity_message(application, old_status, new_status, actor):
    department = get_user_workflow_department(actor)
    created_year = getattr(getattr(application, "created_at", None), "year", None)
    reference = application.reference_no or f"ALiS.{created_year or timezone_now_iso()[:4]}-{application.id:04d}"
    old_status_key = str(old_status or "").strip().lower()
    new_status_key = str(new_status or "").strip().lower()

    if new_status_key == "rejected":
        actor_label = department or "ALiS"
        remark = str(getattr(application, "latest_remark", "") or "").strip()
        description = f"{reference} was reviewed and rejected by {actor_label}."
        if remark:
            description = f"{description} Remark: {remark}"

        return (
            f"Application rejected by {actor_label}",
            description,
        )

    if old_status_key == "submitted" and new_status_key == "ku_ikl_review":
        return (
            "Application sent to KU(IKL)",
            f"{reference} was reviewed and sent to KU(IKL).",
        )

    if new_status_key == "technical_review":
        return (
            "Application sent to technical review",
            f"{reference} was reviewed by KU(IKL) and sent to technical review.",
        )

    if new_status_key == "technical_review_completed":
        return (
            "Technical review completed",
            f"{reference} completed technical review.",
        )

    if new_status_key == "technical_amendment":
        return (
            "Technical amendment requested",
            f"{reference} requires technical amendment.",
        )

    if new_status_key == "management_review":
        return (
            "Application sent for management review",
            f"{reference} was reviewed and sent for management review.",
        )

    if new_status_key == "bill_pending_ku":
        return (
            "Bill ready for applicant",
            f"{reference} has a generated bill ready to be sent to the applicant.",
        )

    if new_status_key == "approved":
        return (
            "Application approved",
            f"{reference} was approved.",
        )

    return (
        "Application reviewed",
        f"{reference} was reviewed by {department or get_activity_actor_name(actor)}.",
    )


def get_applicant_saved_step_label(form_keys):
    step_labels = {
        "step_1": "Sitting Application",
        "step_3": "Submitting Person",
        "step_10": "Supporting Documents",
        "step_11": "Declaration",
    }

    for key in sorted(form_keys):
        label = step_labels.get(key)
        if label:
            return label

    return ""


class ApplicationViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    pagination_class = ApplicationPagination

    def get_throttles(self):
        throttles = super().get_throttles()
        if getattr(self, "action", None) == "upload_document":
            return [UploadRateThrottle(), *throttles]

        return throttles

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

        statuses = self.get_list_values("status") or self.get_list_values("statuses")
        if statuses:
            queryset = queryset.filter(status__in=statuses)

        application_types = self.get_list_values("application_type")
        if application_types:
            queryset = queryset.filter(application_type__in=application_types)

        search = str(self.request.query_params.get("search", "") or "").strip()
        if search:
            queryset = queryset.filter(
                Q(reference_no__icontains=search)
                | Q(title__icontains=search)
                | Q(project_location__icontains=search)
                | Q(applicant__username__icontains=search)
                | Q(applicant__first_name__icontains=search)
                | Q(applicant__last_name__icontains=search)
                | Q(applicant__email__icontains=search)
            )

        if self.action == "list":
            return queryset

        return queryset.prefetch_related("supporting_documents")

    @action(
        detail=False,
        methods=["get"],
        url_path=r"license-verification/(?P<license_id>[^/.]+)",
        permission_classes=[permissions.AllowAny],
        authentication_classes=[],
    )
    def license_verification(self, request, license_id=None):
        application, document = self.get_public_license_document(license_id)

        return Response(
            {
                "license_id": str(license_id or ""),
                "reference_no": application.reference_no,
                "status": application.status,
                "document_url": (
                    f"/applications/license-verification/"
                    f"{license_id}/document/"
                ),
                "document_name": document.file.name.rsplit("/", 1)[-1],
            }
        )

    @action(
        detail=False,
        methods=["get"],
        url_path=r"license-verification/(?P<license_id>[^/.]+)/document",
        permission_classes=[permissions.AllowAny],
        authentication_classes=[],
    )
    def license_verification_document(self, request, license_id=None):
        _application, document = self.get_public_license_document(license_id)
        return self.file_response(document)

    def get_public_license_document(self, license_id):
        normalized_id = str(license_id or "").strip().upper()

        for application in Application.objects.exclude(form_data={}):
            form_data = application.form_data or {}
            license_data = form_data.get("license") or {}
            stored_license_id = str(license_data.get("license_id") or "").strip().upper()

            if stored_license_id != normalized_id:
                continue

            license_file = license_data.get("license_file") or {}
            document_id = license_file.get("document_id") or license_file.get("id")
            if not document_id:
                raise Http404("Advertisement license document not found.")

            document = get_object_or_404(
                SupportingDocument,
                id=document_id,
                application=application,
            )
            return application, document

        raise Http404("Advertisement license not found.")

    def get_list_values(self, key):
        values = []

        for item in self.request.query_params.getlist(key):
            values.extend(
                part.strip()
                for part in str(item or "").split(",")
                if part.strip()
            )

        return values

    def perform_create(self, serializer):
        if self.request.user.role not in ["applicant", "user"]:
            raise PermissionDenied("Only applicants can create applications.")

        application = serializer.save(applicant=self.request.user)
        append_application_activity(
            application,
            self.request.user,
            "Application draft created",
            "The applicant started a new advertisement license application.",
        )

    def perform_update(self, serializer):
        self.ensure_applicant_can_update(serializer.instance)
        old_status = serializer.instance.status
        old_remark = serializer.instance.latest_remark
        old_form_data = deepcopy(serializer.instance.form_data or {})
        self.ensure_staff_can_update_workflow(serializer.instance)
        application = serializer.save()
        if self.request.user.role not in STAFF_ROLES:
            reset_workflow_on_applicant_resubmit(application, old_status, old_form_data)
        old_status_key = str(old_status or "").strip().lower()
        new_status_key = str(application.status or "").strip().lower()
        remark_changed = str(application.latest_remark or "").strip() != str(old_remark or "").strip()
        request_form_data = self.request.data.get("form_data") or {}
        request_form_keys = set(request_form_data.keys()) if isinstance(request_form_data, dict) else set()
        applicant_payment_submitted = (
            self.request.user.role not in STAFF_ROLES
            and old_status_key in {"invoice_generated", "payment_submitted"}
            and new_status_key == "payment_submitted"
            and request_form_keys
            and request_form_keys.issubset({"payment"})
        )
        if self.request.user.role not in STAFF_ROLES:
            if old_status_key in APPLICANT_CORRECTION_STATUSES and new_status_key in APPLICANT_RESUBMIT_STATUSES:
                notify_applicant_application_resubmitted(application)
                notify_staff_application_resubmitted(application)
            elif old_status_key != "submitted" and new_status_key == "submitted":
                notify_applicant_application_submitted(application)
        if self.request.user.role not in STAFF_ROLES:
            activity_title, activity_description = get_applicant_activity_message(
                application,
                self.request.data,
                old_status,
            )
            append_application_activity(
                application,
                self.request.user,
                activity_title,
                activity_description,
            )
        if self.request.user.role in STAFF_ROLES and (
            old_status_key != new_status_key or remark_changed
        ):
            activity_title, activity_description = get_staff_workflow_activity_message(
                application,
                old_status,
                application.status,
                self.request.user,
            )
            append_application_activity(
                application,
                self.request.user,
                activity_title,
                activity_description,
                category="workflow",
            )
        notify_application_status_change(
            application,
            old_status,
            old_remark,
            old_form_data=old_form_data,
            force=(
                self.request.user.role in STAFF_ROLES
                or (old_status_key == "draft" and new_status_key == "submitted")
                or applicant_payment_submitted
            ),
        )
        if (
            self.request.user.role in STAFF_ROLES
            and new_status_key == "rejected"
            and (old_status_key != new_status_key or remark_changed)
        ):
            notify_applicant_application_rejected(application, remark_changed=remark_changed)

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
        department = get_user_workflow_department(user)

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

        if requested_status in {"incomplete", "rejected"} and current_status == "mphlg_processing":
            if department != "MPHLG":
                raise PermissionDenied("Only MPHLG can return the application to the applicant at this stage.")
            return

        if requested_status == "approved" and current_status == "mphlg_processing":
            if department != "MPHLG":
                raise PermissionDenied("Only MPHLG can approve the application at this stage.")
            return

        if requested_status == "rejected" and current_status == "ku_ikl_review":
            if department != "KU(IKL)":
                raise PermissionDenied("Only KU(IKL) can reject the application at this stage.")
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

        if requested_status == "invoice_generated" and current_status in {"approved", "bill_pending_ku"}:
            if department != "PT(IKL)":
                raise PermissionDenied("Only PT(IKL) can send the approval letter and bill to the applicant.")
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
        if request.user.role not in STAFF_ROLES:
            append_application_activity(
                application,
                request.user,
                f"{title} uploaded",
                uploaded_file.name,
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

        removed_filename = document.file.name.rsplit("/", 1)[-1] if document.file else ""

        if document.file:
            document.file.delete(save=False)

        if request.user.role not in STAFF_ROLES:
            append_application_activity(
                application,
                request.user,
                f"{document.title} removed",
                removed_filename,
            )

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
        append_application_activity(
            application,
            request.user,
            "Application submitted",
            "The applicant submitted the application for review.",
        )
        notify_applicant_application_submitted(application)
        notify_application_status_change(application, old_status, old_remark, force=True)

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
        notify_application_status_change(application, old_status, old_remark, force=True)

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
        activity_title, activity_description = get_staff_workflow_activity_message(
            application,
            old_status,
            application.status,
            request.user,
        )
        append_application_activity(
            application,
            request.user,
            activity_title,
            activity_description,
            category="workflow",
        )
        notify_application_status_change(application, old_status, old_remark, force=True)
        notify_applicant_application_rejected(
            application,
            remark_changed=str(application.latest_remark or "").strip() != str(old_remark or "").strip(),
        )

        return Response(
            {
                "message": "Application rejected successfully.",
                "data": ApplicationDetailSerializer(
                    application,
                    context={"request": request},
                ).data,
            }
        )
