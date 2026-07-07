from rest_framework.exceptions import PermissionDenied

from applications.services.activity import get_user_workflow_department


STAFF_ROLES = {"admin", "supervisor", "staff"}
APPLICANT_EDITABLE_STATUSES = {"draft", "incomplete", "technical_amendment", "rejected"}


def ensure_staff_can_update_workflow(application, user, request_data):
    if getattr(user, "role", "") not in STAFF_ROLES:
        return

    requested_status = str(request_data.get("status", application.status) or "").strip().lower()
    current_status = str(application.status or "").strip().lower()
    department = get_user_workflow_department(user)

    if requested_status == "management_review" and current_status == "mphlg_decision_received":
        if department != "SUT":
            raise PermissionDenied("Only SUT can record the SUT result for this application.")
        return

    if requested_status == "management_review" and current_status == "management_review":
        if is_management_support_memo_save(application, department, request_data):
            return

    if requested_status == "management_review" and current_status == "management_review":
        if department != "KB(LES)":
            raise PermissionDenied("Only KB(LES) can verify the application at this stage.")
        return

    if requested_status == "technical_review_completed" and current_status == "management_review":
        if department not in {"KB(LES)", "TP(RES)", "PGH", "FIN", "TP(RES)/PGH", "TP/PGH"}:
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
        if department not in {"TP(RES)", "PGH", "FIN", "TP(RES)/PGH", "TP/PGH"}:
            raise PermissionDenied("Only TP(RES)/PGH can make the final approval decision.")
        return

    if requested_status == "rejected" and current_status == "management_review":
        if department not in {"TP(RES)", "PGH", "FIN", "TP(RES)/PGH", "TP/PGH"}:
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
        if department != "FIN":
            raise PermissionDenied("Only FIN can reject payment proof.")
        return

    if requested_status == "payment_verified" and current_status == "payment_submitted":
        if department != "FIN":
            raise PermissionDenied("Only FIN can approve payment proof.")
        return

    if requested_status in {"license_issued", "license_revoked"}:
        if department != "PT(IKL)":
            raise PermissionDenied("Only PT(IKL) can complete license actions.")


def is_management_support_memo_save(application, department, request_data):
    if department not in {"TP(RES)", "PGH", "FIN", "TP(RES)/PGH", "TP/PGH"}:
        return False

    form_data = request_data.get("form_data") or {}
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


def ensure_applicant_can_update(application, user, request_data):
    if getattr(user, "role", "") in STAFF_ROLES:
        return

    current_status = str(application.status or "").strip().lower()
    requested_status = str(request_data.get("status", application.status) or "").strip().lower()
    form_data = request_data.get("form_data") or {}
    form_keys = set(form_data.keys()) if isinstance(form_data, dict) else set()
    is_payment_only_update = form_keys and form_keys.issubset({"payment"})
    is_license_revocation_request_update = (
        form_keys
        and form_keys.issubset({"license_revocation_request"})
        and requested_status == current_status
        and current_status in {"license_issued", "license_revoked"}
    )
    is_payment_proof_update = (
        is_payment_only_update
        and requested_status == "payment_submitted"
        and current_status in {"invoice_generated", "payment_submitted"}
    )

    if (
        current_status in APPLICANT_EDITABLE_STATUSES
        or is_payment_proof_update
        or is_license_revocation_request_update
    ):
        return

    if form_keys or "current_step" in request_data or "status" in request_data:
        raise PermissionDenied(
            "Submitted applications can only be viewed unless they are returned for correction."
        )
