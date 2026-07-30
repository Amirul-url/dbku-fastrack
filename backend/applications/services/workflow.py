from copy import deepcopy

from rest_framework.exceptions import PermissionDenied, ValidationError

from applications.services.activity import get_user_workflow_department


STAFF_ROLES = {"admin", "supervisor", "staff"}
APPLICANT_EDITABLE_STATUSES = {"draft", "incomplete", "technical_amendment", "rejected"}
IKL_TECHNICAL_REVIEW_STATUSES = {
    "technical_review",
    "technical_site_visit",
    "technical_amendment",
}


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

    if (
        requested_status == "technical_review_completed"
        and current_status in IKL_TECHNICAL_REVIEW_STATUSES
    ):
        if department != "IKL (TECHNICAL)":
            raise PermissionDenied("Only IKL(TECHNICAL) can complete the technical review.")
        ensure_ikl_technical_review_is_complete(application, request_data)
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


def ensure_ikl_technical_review_is_complete(application, request_data):
    form_data = merge_form_data(
        getattr(application, "form_data", None) or {},
        request_data.get("form_data") or {},
    )
    technical_site = get_section(form_data, "technical_site_visit")
    technical_review = get_section(form_data, "technical_review")

    if not has_site_photo(technical_site):
        raise ValidationError({"technical_site_visit": "Site photo is required."})

    rows = get_technical_site_rows(technical_site)
    if not rows:
        raise ValidationError({"technical_site_visit": "Advertisement size details are required."})

    for row in rows:
        width = parse_number(first_present(row.get("width_ft"), row.get("widthFt"), technical_site.get("width_ft")))
        height = parse_number(first_present(row.get("height_ft"), row.get("heightFt"), technical_site.get("height_ft")))
        subtype = first_present(row.get("subtype"), row.get("application_subtype"), technical_site.get("application_subtype"))
        display_type = first_present(row.get("displayType"), row.get("display_type"))

        if not subtype or not display_type:
            raise ValidationError({"technical_site_visit": "Advertisement type details are required."})

        if width <= 0 or height <= 0:
            raise ValidationError({"technical_site_visit": "Advertisement width and height are required."})

    payable_total = parse_number(technical_site.get("payable_total"))
    fee_total = parse_number(technical_site.get("fee_total") or technical_site.get("license_fee_calculation"))
    if payable_total <= 0 or fee_total <= 0:
        raise ValidationError({"technical_site_visit": "Fee calculation is required."})

    remarks = first_present(
        technical_site.get("site_remarks"),
        technical_review.get("comment"),
        technical_review.get("remarks"),
    )
    if not remarks:
        raise ValidationError({"technical_site_visit": "Site findings are required."})

    if not has_digital_signature(technical_review.get("digital_signature")):
        raise ValidationError({"technical_review": "Digital signature is required."})


def merge_form_data(current, updates):
    merged = deepcopy(current or {})

    for key, value in (updates or {}).items():
        if isinstance(merged.get(key), dict) and isinstance(value, dict):
            merged[key] = merge_form_data(merged[key], value)
        else:
            merged[key] = value

    return merged


def get_section(form_data, key):
    section = form_data.get(key) if isinstance(form_data, dict) else {}
    return section if isinstance(section, dict) else {}


def has_site_photo(technical_site):
    photos = technical_site.get("site_photos")
    if isinstance(photos, list) and any(is_document_reference(photo) for photo in photos):
        return True

    return is_document_reference(technical_site.get("site_photo"))


def is_document_reference(value):
    if not isinstance(value, dict):
        return False

    return any(value.get(key) for key in ("document_id", "url", "file_url", "file", "name"))


def get_technical_site_rows(technical_site):
    rows = technical_site.get("advertisement_rows")
    if isinstance(rows, list):
        return [row for row in rows if isinstance(row, dict)]

    return [technical_site] if technical_site else []


def parse_number(value):
    text = str(value or "").strip()
    if not text:
        return 0

    cleaned = "".join(char for char in text if char.isdigit() or char in ".-")
    try:
        return float(cleaned)
    except ValueError:
        return 0


def first_present(*values):
    for value in values:
        text = str(value or "").strip()
        if text and text not in {"-", "[]"}:
            return text

    return ""


def has_digital_signature(signature):
    if not isinstance(signature, dict):
        return False

    return any(signature.get(key) for key in ("document_id", "url", "file_url", "file", "dataUrl", "drawDataUrl"))


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
