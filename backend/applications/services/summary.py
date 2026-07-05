from applications.services.activity import clean_remark


def get_application_applicant_name(application):
    form_data = application.form_data or {}
    step2 = form_data.get("step_2") or {}
    step3 = form_data.get("step_3") or {}
    step1 = form_data.get("step_1") or {}
    if not isinstance(step2, dict):
        step2 = {}
    if not isinstance(step3, dict):
        step3 = {}
    if not isinstance(step1, dict):
        step1 = {}

    form_candidates = [
        step2.get("full_name"),
        step3.get("full_name"),
        step2.get("applicant"),
        step3.get("applicant"),
        step2.get("org_name"),
        step3.get("org_name"),
        step1.get("applicant"),
    ]

    for value in form_candidates:
        name = str(value or "").strip()
        if name:
            return name

    user = getattr(application, "applicant", None)
    if not user:
        return ""

    name = " ".join(
        part
        for part in [getattr(user, "first_name", ""), getattr(user, "last_name", "")]
        if part
    ).strip()
    return name or ""


def get_application_registered_applicant_name(application):
    user = getattr(application, "applicant", None)
    if not user:
        return ""

    name = " ".join(
        part
        for part in [getattr(user, "first_name", ""), getattr(user, "last_name", "")]
        if part
    ).strip()
    return name or ""


def join_user_address(user):
    if not user:
        return ""

    parts = [
        getattr(user, "address_line1", ""),
        getattr(user, "address_line2", ""),
        getattr(user, "postcode", ""),
        getattr(user, "city", ""),
        getattr(user, "state", ""),
    ]
    address = ", ".join(
        str(part or "").strip().upper() for part in parts if str(part or "").strip()
    )
    return address or str(getattr(user, "address", "") or "").strip().upper()


def get_application_applicant_profile(application):
    user = getattr(application, "applicant", None)
    if not user:
        return {}

    full_name = " ".join(
        part
        for part in [getattr(user, "first_name", ""), getattr(user, "last_name", "")]
        if part
    ).strip()

    return {
        "id": getattr(user, "id", None),
        "username": getattr(user, "username", ""),
        "full_name": full_name,
        "mykad_number": getattr(user, "mykad_number", "") or getattr(user, "username", ""),
        "address": join_user_address(user),
        "address_line1": str(getattr(user, "address_line1", "") or "").strip().upper(),
        "address_line2": str(getattr(user, "address_line2", "") or "").strip().upper(),
        "postcode": str(getattr(user, "postcode", "") or "").strip().upper(),
        "city": str(getattr(user, "city", "") or "").strip().upper(),
        "state": str(getattr(user, "state", "") or "").strip().upper(),
    }


def get_project_location_from_form_data(form_data):
    step1 = (form_data or {}).get("step_1", {})
    step4 = (form_data or {}).get("step_4", {})

    return (
        step1.get("locality_address")
        or step1.get("map_address")
        or step1.get("site_address")
        or step1.get("address")
        or step1.get("selected_address")
        or step4.get("land_location")
        or step4.get("location")
        or ""
    )


def sync_application_summary(instance):
    form_data = instance.form_data or {}
    step1 = form_data.get("step_1", {})

    if not instance.title and step1.get("project_name"):
        instance.title = step1.get("project_name")

    instance.project_location = get_project_location_from_form_data(form_data)[:500]
    instance.latest_remark = get_latest_remark_from_form_data(form_data, instance.status)


def get_application_display_remark(application):
    return (
        get_latest_remark_from_form_data(application.form_data, application.status)
        or clean_remark(application.latest_remark)
    )


def get_public_application_display_remark(application):
    form_data = application.form_data or {}
    status_key = str(application.status or "").strip().lower()

    def section(name):
        value = form_data.get(name) or {}
        return value if isinstance(value, dict) else {}

    if status_key in {"invoice_generated", "payment_submitted"}:
        approval_letter = section("approval_letter")
        payment = section("payment")
        payment_rejected = (
            str(payment.get("receipt_decision") or payment.get("recommendation") or "").strip().lower()
            == "reject receipt"
            or str(payment.get("verification_result") or "").strip().lower() in {"invalid", "invalid/fake"}
            or str(payment.get("status") or "").strip().lower() == "receipt rejected"
        )
        remark = clean_remark(
            approval_letter.get("remarks")
            or approval_letter.get("comment")
            or approval_letter.get("notes")
            or (payment.get("verification_notes") if payment_rejected else "")
        )
        if remark:
            return remark

    if status_key in {"payment_verified", "license_issued"}:
        license_data = section("license")
        remark = clean_remark(
            section("payment").get("verification_notes")
            or license_data.get("remarks")
            or license_data.get("notes")
        )
        if remark:
            return remark

    if status_key in {"incomplete", "rejected"}:
        remark = clean_remark(
            section("correction_request").get("remarks")
            or clean_remark(application.latest_remark)
            or section("auto_screening").get("remarks")
        )
        if remark:
            return remark

    return ""


def get_latest_remark_from_form_data(form_data, status=""):
    form_data = form_data or {}
    status_key = str(status or "").strip().lower()

    def section(name):
        value = form_data.get(name) or {}
        return value if isinstance(value, dict) else {}

    if status_key in {"invoice_generated", "payment_submitted"}:
        approval_letter = section("approval_letter")
        remark = clean_remark(
            approval_letter.get("remarks")
            or approval_letter.get("comment")
            or approval_letter.get("notes")
            or section("payment").get("verification_notes")
        )
        if remark:
            return remark

    if status_key in {"payment_verified", "license_issued"}:
        license_data = section("license")
        remark = clean_remark(
            section("payment").get("verification_notes")
            or license_data.get("remarks")
            or license_data.get("notes")
        )
        if remark:
            return remark

    if status_key == "mphlg_processing":
        remark = clean_remark(
            section("management_recommendation").get("remarks")
            or section("mphlg_gateway").get("remarks")
        )
        if remark:
            return remark

    if status_key == "approved":
        mphlg_gateway = section("mphlg_gateway")
        mphlg_officer = str(mphlg_gateway.get("officer") or "").strip().upper()
        mphlg_decision = str(mphlg_gateway.get("decision") or "").strip().lower()
        mphlg_status = str(mphlg_gateway.get("status") or "").strip().lower()
        if mphlg_officer == "MPHLG" and (
            mphlg_decision in {"approve", "approved"} or mphlg_status == "approved"
        ):
            remark = clean_remark(
                mphlg_gateway.get("remarks")
                or section("approval").get("remarks")
            )
            if remark:
                return remark

    if status_key == "technical_review_completed":
        correction = section("correction_request")
        if str(correction.get("target") or "").strip().upper() == "KU(IKL)":
            remark = clean_remark(correction.get("remarks"))
            if remark:
                return remark

    candidates = [
        section("correction_request").get("remarks"),
        section("auto_screening").get("remarks"),
        section("technical_review").get("comment"),
        section("technical_review").get("remarks"),
        section("management_recommendation").get("remarks"),
        section("approval").get("notes"),
        section("approval").get("comment"),
        section("payment").get("verification_notes"),
    ]

    for value in candidates:
        remark = clean_remark(value)
        if remark:
            return remark

    return ""
