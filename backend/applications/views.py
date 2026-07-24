from django.http import HttpResponse
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser
from rest_framework.response import Response
from copy import deepcopy
from .models import Application
from .serializers import (
    ApplicationListSerializer,
    ApplicationDetailSerializer,
    SupportingDocumentSerializer,
)
from .services.activity import (
    append_application_activity,
    clean_remark,
    get_activity_actor_name,
    get_user_workflow_department,
    timezone_now_iso,
)
from .services.documents import (
    build_document_file_response,
    can_delete_application_document,
    can_upload_application_document,
    create_application_document,
    delete_document_file,
    get_application_document,
    get_application_site_image_document,
    get_document_filename,
)
from .services.license_verification import get_public_license_document
from .services.queries import build_application_queryset, parse_list_query_values
from .services.workflow import (
    ensure_applicant_can_update,
    ensure_staff_can_update_workflow,
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
    notify_license_revocation_request,
    notify_license_renewal_issued,
    notify_license_renewal_payment_submitted,
    notify_staff_application_resubmitted,
)

STAFF_ROLES = ["admin", "supervisor", "staff"]
APPLICANT_CORRECTION_STATUSES = {"incomplete", "rejected", "technical_amendment"}
APPLICANT_RESUBMIT_STATUSES = {"submitted", "ku_ikl_review", "mphlg_processing"}
LICENSE_RENEWAL_ACTIVITY_ACTIONS = {
    "verify_early_payment": {
        "title": "Renewal early payment receipt approved",
        "recommendation": "Approve Renewal Receipt",
        "fallback": "FIN approved the renewal early payment receipt.",
    },
    "reject_early_payment": {
        "title": "Renewal early payment receipt rejected",
        "recommendation": "Reject Renewal Receipt",
        "fallback": "FIN rejected the renewal early payment receipt.",
    },
    "complete_early_payment": {
        "title": "Renewal official receipt and license generated",
        "recommendation": "Generate Renewal Official Receipt and Advertisement License",
        "fallback": "PT(IKL) generated the renewal official receipt and advertisement license.",
    },
}
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


def get_license_renewal_payment(form_data):
    if not isinstance(form_data, dict):
        return {}

    renewal = form_data.get("license_renewal")
    if not isinstance(renewal, dict):
        return {}

    payment = renewal.get("payment")
    return payment if isinstance(payment, dict) else {}


def maybe_notify_completed_license_renewal(application, old_form_data):
    old_payment = get_license_renewal_payment(old_form_data)
    new_payment = get_license_renewal_payment(application.form_data or {})
    old_status = str(old_payment.get("status") or "").strip().lower()
    new_status = str(new_payment.get("status") or "").strip().lower()

    if old_status == "completed" or new_status != "completed":
        return

    notify_license_renewal_issued(
        application,
        new_payment.get("months_before_expiry") or old_payment.get("months_before_expiry") or 3,
        occurrence=new_payment.get("completed_at") or new_payment.get("sent_at"),
    )


def append_license_renewal_action_activity(application, actor, action_name, note="", digital_signature=None):
    activity_config = LICENSE_RENEWAL_ACTIVITY_ACTIONS.get(str(action_name or "").strip())
    if not activity_config:
        return application

    clean_note = clean_remark(note)
    metadata = {
        "recommendation": activity_config["recommendation"],
        "remarks": clean_note,
    }
    if digital_signature:
        metadata["digital_signature"] = digital_signature

    append_application_activity(
        application,
        actor,
        activity_config["title"],
        clean_note or activity_config["fallback"],
        category="workflow",
        metadata=metadata,
    )
    return Application.objects.get(pk=application.pk)


def get_previous_correction_remark(old_remark="", old_form_data=None):
    correction = (old_form_data or {}).get("correction_request")
    if not isinstance(correction, dict):
        correction = {}

    for value in [
        old_remark,
        correction.get("remarks"),
        correction.get("remark"),
        correction.get("comment"),
    ]:
        remark = str(value or "").strip()
        if remark and remark not in {"-", "[]"}:
            return remark

    return ""


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
            "decided_at": "",
        }
    else:
        for field in RESUBMIT_WORKFLOW_RESET_FIELDS:
            form_data[field] = {} if field == "technical_department_reviews" else None
        form_data["technical_department_reviews_updated_at"] = ""

    application.form_data = form_data
    application.latest_remark = ""
    application.save(update_fields=["form_data", "latest_remark", "updated_at"])


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

    if form_keys and form_keys.issubset({"license_revocation_request"}):
        revocation_request = form_data.get("license_revocation_request") or {}
        revocation_status = str(revocation_request.get("status") or "").strip().lower()
        if revocation_status == "withdrawn":
            return (
                "License revocation request cancelled",
                "You cancelled your license revocation request.",
            )
        return (
            "License revocation requested",
            "You requested PT(IKL) to revoke your e-license.",
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
        if getattr(self, "action", None) in {
            "upload_document",
            "license_renewal_early_payment",
        }:
            return [UploadRateThrottle(), *throttles]

        return throttles

    def get_serializer_class(self):
        if self.action == "list":
            return ApplicationListSerializer

        return ApplicationDetailSerializer

    def get_queryset(self):
        statuses = self.get_list_values("status") or self.get_list_values("statuses")
        application_types = self.get_list_values("application_type")
        search = str(self.request.query_params.get("search", "") or "").strip()

        return build_application_queryset(
            self.request.user,
            statuses=statuses,
            application_types=application_types,
            search=search,
            include_documents=self.action != "list",
        )

    @action(
        detail=False,
        methods=["get"],
        url_path=r"license-verification/(?P<license_id>[^/.]+)",
        permission_classes=[permissions.AllowAny],
        authentication_classes=[],
    )
    def license_verification(self, request, license_id=None):
        application, document = get_public_license_document(license_id)

        return Response(
            {
                "license_id": str(license_id or ""),
                "reference_no": application.reference_no,
                "status": application.status,
                "document_url": (
                    f"/applications/license-verification/"
                    f"{license_id}/document/"
                ),
                "document_name": document.name,
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
        _application, document = get_public_license_document(license_id)
        if document.is_generated:
            return HttpResponse(document.html, content_type="text/html; charset=utf-8")
        return self.file_response(document.supporting_document)

    def get_list_values(self, key):
        return parse_list_query_values(self.request.query_params.getlist(key))

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
        ensure_applicant_can_update(serializer.instance, self.request.user, self.request.data)
        old_status = serializer.instance.status
        old_remark = serializer.instance.latest_remark
        old_form_data = deepcopy(serializer.instance.form_data or {})
        ensure_staff_can_update_workflow(serializer.instance, self.request.user, self.request.data)
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
        old_revocation_request = (
            old_form_data.get("license_revocation_request")
            if isinstance(old_form_data, dict)
            else {}
        ) or {}
        new_revocation_request = (application.form_data or {}).get("license_revocation_request") or {}
        old_revocation_status = str(old_revocation_request.get("status") or "").strip().lower()
        new_revocation_status = str(new_revocation_request.get("status") or "").strip().lower()
        applicant_revocation_request_changed = (
            self.request.user.role not in STAFF_ROLES
            and "license_revocation_request" in request_form_keys
            and new_revocation_status in {"pending", "withdrawn"}
            and old_revocation_status != new_revocation_status
        )
        if self.request.user.role not in STAFF_ROLES:
            if old_status_key in APPLICANT_CORRECTION_STATUSES and new_status_key in APPLICANT_RESUBMIT_STATUSES:
                notify_applicant_application_resubmitted(application)
                notify_staff_application_resubmitted(application)
            elif old_status_key != "submitted" and new_status_key == "submitted":
                notify_applicant_application_submitted(application)
            if applicant_revocation_request_changed:
                notify_license_revocation_request(application, new_revocation_status)
        if self.request.user.role not in STAFF_ROLES:
            activity_title, activity_description = get_applicant_activity_message(
                application,
                self.request.data,
                old_status,
            )
            activity_metadata = {}
            if old_status_key in APPLICANT_CORRECTION_STATUSES and new_status_key in APPLICANT_RESUBMIT_STATUSES:
                previous_remark = get_previous_correction_remark(old_remark, old_form_data)
                if previous_remark:
                    activity_metadata["previous_remark"] = previous_remark
            append_application_activity(
                application,
                self.request.user,
                activity_title,
                activity_description,
                metadata=activity_metadata,
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
        maybe_notify_completed_license_renewal(application, old_form_data)
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

        if not can_upload_application_document(request.user, application, title):
            return Response(
                {
                    "error": "Submitted applications can only be viewed unless they are returned for correction."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        document = create_application_document(application, title, uploaded_file)
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

    @action(detail=True, methods=["post"], url_path="license-renewal-early-payment")
    def license_renewal_early_payment(self, request, pk=None):
        application = self.get_object()
        uploaded_file = request.FILES.get("file")
        months = request.data.get("months") or "3"

        if getattr(request.user, "role", "") in STAFF_ROLES or application.applicant_id != request.user.id:
            return Response(
                {"error": "Only the applicant can upload renewal payment receipts."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if not uploaded_file:
            return Response(
                {"error": "No file uploaded."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            months = int(months)
        except (TypeError, ValueError):
            return Response(
                {"error": "Reminder month must be a number."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        form_data = deepcopy(application.form_data or {})
        renewal = form_data.get("license_renewal") if isinstance(form_data.get("license_renewal"), dict) else {}
        reminders = renewal.get("reminders") if isinstance(renewal.get("reminders"), dict) else {}
        reminder = reminders.get(str(months)) if isinstance(reminders.get(str(months)), dict) else {}

        if str(reminder.get("status") or "").strip().lower() != "released_to_applicant":
            return Response(
                {"error": "Renewal reminder letter has not been released to the applicant."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payment = renewal.get("payment") if isinstance(renewal.get("payment"), dict) else {}
        payment_status = str(payment.get("status") or "").strip().lower()
        has_reference_details = all(
            str(payment.get(key) or "").strip()
            for key in ("reference_id", "recipient_reference", "payment_details")
        )
        if payment_status in {"verified", "completed"} or (
            payment_status == "submitted" and has_reference_details
        ):
            return Response(
                {"error": "Submitted renewal payment receipts cannot be replaced."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        title = f"{months}-Month Renewal Early Payment Receipt"
        document = create_application_document(application, title, uploaded_file)
        serializer = SupportingDocumentSerializer(
            document,
            context={"request": request},
        )
        document_data = serializer.data
        timestamp = timezone_now_iso()
        document_url = request.build_absolute_uri(
            f"/api/applications/{application.id}/documents/{document.id}/download/"
        )
        receipt = {
            "document_id": document_data["id"],
            "title": document_data["title"],
            "name": uploaded_file.name,
            "size": document_data.get("size") or getattr(uploaded_file, "size", 0),
            "type": getattr(uploaded_file, "content_type", "") or "",
            "url": document_url,
            "file_url": document_data.get("file_url", ""),
            "file": document_data.get("file", ""),
            "uploaded_at": document_data.get("uploaded_at") or timestamp,
            "months_before_expiry": months,
        }

        existing_receipts = renewal.get("early_payment_receipts")
        if not isinstance(existing_receipts, list):
            existing_receipts = []
        renewal["early_payment_receipts"] = [*existing_receipts, receipt]

        reminder_receipts = reminder.get("early_payment_receipts")
        if not isinstance(reminder_receipts, list):
            reminder_receipts = []
        reminder["early_payment_receipts"] = [*reminder_receipts, receipt]
        reminders[str(months)] = reminder
        renewal["reminders"] = reminders
        renewal["payment"] = {
            **payment,
            "status": "uploaded",
            "months_before_expiry": months,
            "receipt": receipt,
            "receipt_document_id": receipt["document_id"],
            "uploaded_at": timestamp,
            "uploaded_by": get_activity_actor_name(request.user),
            "submitted_at": "",
            "submitted_by": "",
            "verification_result": "",
            "verification_notes": "",
            "internal_verification_notes": "",
            "verified_by": "",
            "verified_at": "",
            "rejected_by": "",
            "rejected_at": "",
        }
        form_data["license_renewal"] = renewal
        application.form_data = form_data
        application.save(update_fields=["form_data", "updated_at"])

        append_application_activity(
            application,
            request.user,
            "Renewal early payment receipt uploaded",
            f"{uploaded_file.name} uploaded for {months}-month renewal reminder.",
        )

        return Response(
            {
                "message": "Renewal early payment receipt uploaded.",
                "receipt": receipt,
                "data": ApplicationDetailSerializer(
                    application,
                    context={"request": request},
                ).data,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="license-renewal-early-payment-submit")
    def submit_license_renewal_early_payment(self, request, pk=None):
        application = self.get_object()

        if getattr(request.user, "role", "") in STAFF_ROLES or application.applicant_id != request.user.id:
            return Response(
                {"error": "Only the applicant can submit renewal payment receipts."},
                status=status.HTTP_403_FORBIDDEN,
            )

        form_data = deepcopy(application.form_data or {})
        renewal = form_data.get("license_renewal") if isinstance(form_data.get("license_renewal"), dict) else {}
        reminders = renewal.get("reminders") if isinstance(renewal.get("reminders"), dict) else {}
        payment = renewal.get("payment") if isinstance(renewal.get("payment"), dict) else {}
        payment_status = str(payment.get("status") or "").strip().lower()

        has_reference_details = all(
            str(payment.get(key) or "").strip()
            for key in ("reference_id", "recipient_reference", "payment_details")
        )
        if payment_status in {"verified", "completed"} or (
            payment_status == "submitted" and has_reference_details
        ):
            return Response(
                {"error": "This renewal payment receipt has already been submitted."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        months = request.data.get("months") or payment.get("months_before_expiry") or 3
        try:
            months = int(months)
        except (TypeError, ValueError):
            return Response(
                {"error": "Reminder month must be a number."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reminder = reminders.get(str(months)) if isinstance(reminders.get(str(months)), dict) else {}
        if str(reminder.get("status") or "").strip().lower() != "released_to_applicant":
            return Response(
                {"error": "Renewal reminder letter has not been released to the applicant."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reference_id = str(request.data.get("reference_id") or "").strip()
        recipient_reference = str(request.data.get("recipient_reference") or "").strip()
        payment_details = str(request.data.get("payment_details") or "").strip()

        if not all([reference_id, recipient_reference, payment_details]):
            return Response(
                {"error": "Payment reference details are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        receipts = renewal.get("early_payment_receipts")
        if not isinstance(receipts, list):
            receipts = []

        receipt_document_id = str(
            request.data.get("receipt_document_id")
            or payment.get("receipt_document_id")
            or ""
        ).strip()
        if not receipt_document_id and receipts:
            receipt_document_id = str(
                receipts[-1].get("document_id")
                or receipts[-1].get("id")
                or ""
            ).strip()

        receipt_index = None
        selected_receipt = None
        for index, receipt in enumerate(receipts):
            current_id = str(
                (receipt or {}).get("document_id")
                or (receipt or {}).get("id")
                or ""
            ).strip()
            if current_id == receipt_document_id:
                receipt_index = index
                selected_receipt = receipt
                break

        if selected_receipt is None:
            return Response(
                {"error": "Renewal payment receipt is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        timestamp = timezone_now_iso()
        selected_receipt = {
            **selected_receipt,
            "reference_id": reference_id,
            "recipient_reference": recipient_reference,
            "payment_details": payment_details,
            "submitted_at": timestamp,
        }
        receipts[receipt_index] = selected_receipt
        renewal["early_payment_receipts"] = receipts

        reminder_receipts = reminder.get("early_payment_receipts")
        if isinstance(reminder_receipts, list):
            reminder["early_payment_receipts"] = [
                selected_receipt
                if str((receipt or {}).get("document_id") or (receipt or {}).get("id") or "").strip() == receipt_document_id
                else receipt
                for receipt in reminder_receipts
            ]
            reminders[str(months)] = reminder
            renewal["reminders"] = reminders

        renewal["payment"] = {
            **payment,
            "status": "submitted",
            "months_before_expiry": months,
            "receipt": selected_receipt,
            "receipt_document_id": receipt_document_id,
            "reference_id": reference_id,
            "recipient_reference": recipient_reference,
            "payment_details": payment_details,
            "submitted_at": timestamp,
            "submitted_by": get_activity_actor_name(request.user),
            "verification_result": "",
            "verification_notes": "",
            "internal_verification_notes": "",
            "verified_by": "",
            "verified_at": "",
            "rejected_by": "",
            "rejected_at": "",
        }
        form_data["license_renewal"] = renewal
        application.form_data = form_data
        application.save(update_fields=["form_data", "updated_at"])
        notify_license_renewal_payment_submitted(application, months)

        append_application_activity(
            application,
            request.user,
            "Renewal early payment receipt submitted",
            f"Renewal payment reference submitted for {months}-month reminder.",
        )

        return Response(
            {
                "message": "Renewal early payment receipt submitted for verification.",
                "receipt": selected_receipt,
                "data": ApplicationDetailSerializer(
                    application,
                    context={"request": request},
                ).data,
            },
            status=status.HTTP_200_OK,
        )

    @action(
        detail=True,
        methods=["delete"],
        url_path=r"license-renewal-early-payment/(?P<receipt_id>[^/.]+)",
    )
    def delete_license_renewal_early_payment(self, request, pk=None, receipt_id=None):
        application = self.get_object()

        if getattr(request.user, "role", "") in STAFF_ROLES or application.applicant_id != request.user.id:
            return Response(
                {"error": "Only the applicant can remove renewal payment receipts."},
                status=status.HTTP_403_FORBIDDEN,
            )

        form_data = deepcopy(application.form_data or {})
        renewal = form_data.get("license_renewal") if isinstance(form_data.get("license_renewal"), dict) else {}
        payment = renewal.get("payment") if isinstance(renewal.get("payment"), dict) else {}
        payment_status = str(payment.get("status") or "").strip().lower()

        has_reference_details = all(
            str(payment.get(key) or "").strip()
            for key in ("reference_id", "recipient_reference", "payment_details")
        )
        if payment_status in {"verified", "completed"} or (
            payment_status == "submitted" and has_reference_details
        ):
            return Response(
                {"error": "Submitted renewal payment receipts cannot be removed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        receipt_id_text = str(receipt_id or "").strip()
        receipts = renewal.get("early_payment_receipts")
        if not isinstance(receipts, list):
            receipts = []

        removed_receipt = None
        remaining_receipts = []
        for receipt in receipts:
            current_id = str(
                (receipt or {}).get("document_id")
                or (receipt or {}).get("id")
                or ""
            ).strip()
            if current_id == receipt_id_text:
                removed_receipt = receipt
                continue
            remaining_receipts.append(receipt)

        if removed_receipt is None:
            return Response(
                {"error": "Renewal payment receipt not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        document = get_application_document(application, receipt_id_text)
        removed_filename = get_document_filename(document)
        renewal["early_payment_receipts"] = remaining_receipts

        reminders = renewal.get("reminders") if isinstance(renewal.get("reminders"), dict) else {}
        for key, reminder in list(reminders.items()):
            if not isinstance(reminder, dict):
                continue
            reminder_receipts = reminder.get("early_payment_receipts")
            if not isinstance(reminder_receipts, list):
                continue
            reminder["early_payment_receipts"] = [
                receipt for receipt in reminder_receipts
                if str((receipt or {}).get("document_id") or (receipt or {}).get("id") or "").strip() != receipt_id_text
            ]
            reminders[key] = reminder
        renewal["reminders"] = reminders

        latest_receipt = remaining_receipts[-1] if remaining_receipts else None
        if latest_receipt:
            renewal["payment"] = {
                **payment,
                "status": "uploaded",
                "months_before_expiry": latest_receipt.get("months_before_expiry") or payment.get("months_before_expiry") or 3,
                "receipt": latest_receipt,
                "receipt_document_id": latest_receipt.get("document_id") or latest_receipt.get("id") or "",
                "submitted_at": "",
                "submitted_by": "",
                "reference_id": latest_receipt.get("reference_id") or "",
                "recipient_reference": latest_receipt.get("recipient_reference") or "",
                "payment_details": latest_receipt.get("payment_details") or "",
                "verification_result": "",
                "verification_notes": "",
                "internal_verification_notes": "",
                "verified_by": "",
                "verified_at": "",
                "rejected_by": "",
                "rejected_at": "",
            }
        else:
            renewal["payment"] = {
                **payment,
                "status": "",
                "receipt": None,
                "receipt_document_id": "",
                "submitted_at": "",
                "submitted_by": "",
                "reference_id": "",
                "recipient_reference": "",
                "payment_details": "",
                "verification_result": "",
                "verification_notes": "",
                "internal_verification_notes": "",
                "verified_by": "",
                "verified_at": "",
                "rejected_by": "",
                "rejected_at": "",
            }

        form_data["license_renewal"] = renewal
        application.form_data = form_data
        application.save(update_fields=["form_data", "updated_at"])

        delete_document_file(document)
        document.delete()

        append_application_activity(
            application,
            request.user,
            "Renewal early payment receipt removed",
            removed_filename or str(removed_receipt.get("name") or ""),
        )

        return Response(
            {
                "message": "Renewal early payment receipt removed.",
                "data": ApplicationDetailSerializer(
                    application,
                    context={"request": request},
                ).data,
            },
            status=status.HTTP_200_OK,
        )

    @action(
        detail=True,
        methods=["get"],
        url_path=r"documents/(?P<document_id>[^/.]+)/download",
    )
    def download_document(self, request, pk=None, document_id=None):
        application = self.get_object()
        document = get_application_document(application, document_id)

        return self.file_response(document)

    @action(
        detail=True,
        methods=["delete"],
        url_path=r"documents/(?P<document_id>[^/.]+)",
    )
    def delete_document(self, request, pk=None, document_id=None):
        application = self.get_object()
        document = get_application_document(application, document_id)

        if not can_delete_application_document(request.user, application):
            return Response(
                {
                    "error": "Submitted applications can only be viewed unless they are returned for correction."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        removed_filename = get_document_filename(document)
        delete_document_file(document)

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
        document = get_application_site_image_document(application)
        return self.file_response(document)

    def file_response(self, document):
        return build_document_file_response(document)

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

        if request.user.role not in STAFF_ROLES or department not in {"TP(RES)", "PGH", "FIN", "TP(RES)/PGH", "TP/PGH"}:
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
        document_html = request.data.get("document_html", "")
        digital_signature = request.data.get("digital_signature")

        try:
            months = int(months) if months is not None else None
            application = apply_license_renewal_action(
                application=application,
                action=action_name,
                user=request.user,
                months=months,
                note=note,
                document_html=document_html,
                digital_signature=digital_signature,
            )
            application = append_license_renewal_action_activity(
                application,
                request.user,
                action_name,
                note,
                digital_signature,
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
