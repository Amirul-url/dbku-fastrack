import re

from django.utils.dateparse import parse_datetime
from rest_framework import serializers
from .models import Application, SupportingDocument


def strip_inline_file_data(value, preserve_inline_data=False):
    if isinstance(value, dict):
        cleaned = {}

        for key, item in value.items():
            keep_inline_data = preserve_inline_data or key == "digital_signature"
            if key in ["dataUrl", "site_image_preview"] and isinstance(item, str):
                cleaned[key] = item if keep_inline_data or not item.startswith("data:") else ""
                continue

            cleaned[key] = strip_inline_file_data(item, preserve_inline_data=keep_inline_data)

        return cleaned

    if isinstance(value, list):
        return [
            strip_inline_file_data(item, preserve_inline_data=preserve_inline_data)
            for item in value
        ]

    if isinstance(value, str) and value.startswith("data:") and not preserve_inline_data:
        return ""

    return value


def merge_dicts(current, updates):
    merged = dict(current or {})

    for key, value in (updates or {}).items():
        if isinstance(merged.get(key), dict) and isinstance(value, dict):
            merged[key] = merge_dicts(merged[key], value)
        else:
            merged[key] = value

    return merged


STAFF_ACTIVITY_ROLES = {"admin", "supervisor", "staff"}
APPLICANT_ACTIVITY_ROLES = {"applicant", "user"}
APPLICANT_SAFE_ACTIVITY_TITLES = {
    "application draft created",
    "application submitted",
    "application resubmitted",
    "payment receipt submitted",
}


def get_request_user(serializer):
    request = serializer.context.get("request") if hasattr(serializer, "context") else None
    user = getattr(request, "user", None)
    return user if getattr(user, "is_authenticated", False) else None


def is_applicant_safe_activity(activity):
    title = str(activity.get("title") or "").strip().lower()
    category = str(activity.get("category") or "").strip().lower()
    actor_role = str(activity.get("actor_role") or "").strip().lower()

    return (
        category == "user"
        or actor_role in APPLICANT_ACTIVITY_ROLES
        or title in APPLICANT_SAFE_ACTIVITY_TITLES
        or title.endswith(" details saved")
        or title.endswith(" uploaded")
        or title.endswith(" removed")
    )


def scope_activity_log_for_user(activity_log, user):
    if not user:
        return []

    role = str(getattr(user, "role", "") or "").strip().lower()
    user_id = getattr(user, "id", None)

    scoped = []
    for activity in activity_log:
        if not isinstance(activity, dict):
            continue

        actor_id = activity.get("actor_id")
        actor_role = str(activity.get("actor_role") or "").strip().lower()

        actor_matches_user = (
            actor_id not in {None, ""}
            and user_id not in {None, ""}
            and str(actor_id) == str(user_id)
        )

        if role in APPLICANT_ACTIVITY_ROLES:
            if actor_matches_user or (
                actor_id in {None, ""}
                and actor_role in APPLICANT_ACTIVITY_ROLES
                and is_applicant_safe_activity(activity)
            ):
                scoped.append(activity)
            continue

        if role in STAFF_ACTIVITY_ROLES:
            title = str(activity.get("title") or "").strip().lower()
            if actor_matches_user or title in APPLICANT_SAFE_ACTIVITY_TITLES or is_rejected_activity(activity):
                scoped.append(activity)
            continue

        if role == "superadmin":
            scoped.append(activity)

    return scoped


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
        part for part in [getattr(user, "first_name", ""), getattr(user, "last_name", "")] if part
    ).strip()
    return name or ""


def get_application_registered_applicant_name(application):
    user = getattr(application, "applicant", None)
    if not user:
        return ""

    name = " ".join(
        part for part in [getattr(user, "first_name", ""), getattr(user, "last_name", "")] if part
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
        part for part in [getattr(user, "first_name", ""), getattr(user, "last_name", "")] if part
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


class SupportingDocumentSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    size = serializers.SerializerMethodField()

    class Meta:
        model = SupportingDocument
        fields = [
            "id",
            "title",
            "file",
            "file_url",
            "size",
            "uploaded_at",
        ]
        read_only_fields = ["id", "file_url", "size", "uploaded_at"]

    def get_file_url(self, obj):
        request = self.context.get("request")

        if request:
            return request.build_absolute_uri(obj.file.url)

        return obj.file.url

    def get_size(self, obj):
        try:
            return obj.file.size if obj.file else 0
        except (OSError, ValueError):
            return 0


class ApplicationListSerializer(serializers.ModelSerializer):
    applicant_username = serializers.CharField(
        source="applicant.username",
        read_only=True,
    )
    applicant_full_name = serializers.SerializerMethodField()
    applicant_registered_name = serializers.SerializerMethodField()
    application_type_label = serializers.SerializerMethodField()
    auto_screening = serializers.SerializerMethodField()
    technical_review = serializers.SerializerMethodField()
    technical_ku_review = serializers.SerializerMethodField()
    technical_department_reviews = serializers.SerializerMethodField()
    technical_department_selection = serializers.SerializerMethodField()
    technical_referral = serializers.SerializerMethodField()
    kb_les_verification = serializers.SerializerMethodField()
    management_recommendation = serializers.SerializerMethodField()
    mphlg_gateway = serializers.SerializerMethodField()
    sut_approval = serializers.SerializerMethodField()
    approval = serializers.SerializerMethodField()
    approval_letter = serializers.SerializerMethodField()
    display_remark = serializers.SerializerMethodField()
    activity_log = serializers.SerializerMethodField()

    class Meta:
        model = Application
        fields = [
            "id",
            "reference_no",
            "applicant",
            "applicant_username",
            "applicant_full_name",
            "applicant_registered_name",
            "application_type",
            "application_type_label",
            "project_location",
            "title",
            "status",
            "latest_remark",
            "current_step",
            "auto_screening",
            "technical_review",
            "technical_ku_review",
            "technical_department_reviews",
            "technical_department_selection",
            "technical_referral",
            "kb_les_verification",
            "management_recommendation",
            "mphlg_gateway",
            "sut_approval",
            "approval",
            "approval_letter",
            "display_remark",
            "activity_log",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "reference_no",
            "applicant",
            "applicant_username",
            "applicant_full_name",
            "applicant_registered_name",
            "created_at",
            "updated_at",
        ]

    def get_applicant_full_name(self, obj):
        return get_application_applicant_name(obj)

    def get_applicant_registered_name(self, obj):
        return get_application_registered_applicant_name(obj)

    def get_application_type_label(self, obj):
        step1 = (obj.form_data or {}).get("step_1") or {}
        if isinstance(step1, dict):
            for key in ["application_type_label", "project_category"]:
                value = str(step1.get(key) or "").strip()
                if value:
                    return value

        return obj.get_application_type_display()

    def get_auto_screening(self, obj):
        return (obj.form_data or {}).get("auto_screening", {})

    def get_technical_review(self, obj):
        return (obj.form_data or {}).get("technical_review", {})

    def get_technical_ku_review(self, obj):
        return (obj.form_data or {}).get("technical_ku_review", {})

    def get_technical_department_reviews(self, obj):
        return (obj.form_data or {}).get("technical_department_reviews", {})

    def get_technical_department_selection(self, obj):
        return (obj.form_data or {}).get("technical_department_selection", {})

    def get_technical_referral(self, obj):
        return (obj.form_data or {}).get("technical_referral", {})

    def get_kb_les_verification(self, obj):
        return (obj.form_data or {}).get("kb_les_verification", {})

    def get_management_recommendation(self, obj):
        return (obj.form_data or {}).get("management_recommendation", {})

    def get_mphlg_gateway(self, obj):
        return (obj.form_data or {}).get("mphlg_gateway", {})

    def get_sut_approval(self, obj):
        return (obj.form_data or {}).get("sut_approval", {})

    def get_approval(self, obj):
        return (obj.form_data or {}).get("approval", {})

    def get_approval_letter(self, obj):
        approval_letter = (obj.form_data or {}).get("approval_letter", {})
        if not isinstance(approval_letter, dict):
            return {}

        return strip_inline_file_data(approval_letter)

    def get_display_remark(self, obj):
        return (
            get_latest_remark_from_form_data(obj.form_data, obj.status)
            or clean_remark(obj.latest_remark)
        )

    def get_activity_log(self, obj):
        activity_log = (obj.form_data or {}).get("activity_log", [])
        if not isinstance(activity_log, list):
            return []

        scoped_log = scope_activity_log_for_user(activity_log, get_request_user(self))
        return enrich_activity_log_with_rejection_remarks(obj, scoped_log[:80])


class ApplicationDetailSerializer(serializers.ModelSerializer):
    applicant_username = serializers.CharField(
        source="applicant.username",
        read_only=True,
    )
    applicant_full_name = serializers.SerializerMethodField()
    applicant_registered_name = serializers.SerializerMethodField()
    applicant_profile = serializers.SerializerMethodField()

    supporting_documents = SupportingDocumentSerializer(
        many=True,
        read_only=True,
    )

    class Meta:
        model = Application
        fields = [
            "id",
            "reference_no",
            "applicant",
            "applicant_username",
            "applicant_full_name",
            "applicant_registered_name",
            "applicant_profile",
            "application_type",
            "project_location",
            "title",
            "status",
            "latest_remark",
            "current_step",
            "form_data",
            "supporting_documents",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "reference_no",
            "applicant",
            "applicant_username",
            "applicant_full_name",
            "applicant_registered_name",
            "applicant_profile",
            "project_location",
            "supporting_documents",
            "created_at",
            "updated_at",
        ]

    def get_applicant_full_name(self, obj):
        return get_application_applicant_name(obj)

    def get_applicant_registered_name(self, obj):
        return get_application_registered_applicant_name(obj)

    def get_applicant_profile(self, obj):
        return get_application_applicant_profile(obj)

    def create(self, validated_data):
        instance = Application(**validated_data)
        sync_application_summary(instance)
        instance.save()
        return instance

    def to_representation(self, instance):
        data = super().to_representation(instance)
        form_data = strip_inline_file_data(data.get("form_data") or {})
        activity_log = form_data.get("activity_log")
        if isinstance(activity_log, list):
            form_data["activity_log"] = scope_activity_log_for_user(
                activity_log,
                get_request_user(self),
            )
        data["form_data"] = form_data
        return data

    def update(self, instance, validated_data):
        next_form_data = validated_data.pop("form_data", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if next_form_data is not None:
            instance.form_data = merge_dicts(instance.form_data, next_form_data)
            sync_application_summary(instance)

        instance.save()
        return instance


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
        if mphlg_officer == "MPHLG" and (mphlg_decision in {"approve", "approved"} or mphlg_status == "approved"):
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


def enrich_activity_log_with_rejection_remarks(application, activity_log):
    rejection_remarks = get_rejection_delivery_remarks(application)
    if not rejection_remarks:
        return activity_log

    enriched = []
    for activity in activity_log:
        if not isinstance(activity, dict):
            enriched.append(activity)
            continue

        item = dict(activity)
        if is_rejected_activity(item) and not clean_remark(item.get("remark") or item.get("remarks")):
            remark = get_closest_rejection_remark(item, rejection_remarks)
            if remark:
                item["remark"] = remark

        enriched.append(item)

    return enriched


def get_rejection_delivery_remarks(application):
    try:
        from notifications.models import NotificationDelivery
    except Exception:
        return []

    deliveries = (
        NotificationDelivery.objects.filter(
            application=application,
            metadata__event_status="rejected",
        )
        .order_by("-created_at")
        .only("created_at", "message", "metadata")
    )
    remarks = []

    for delivery in deliveries:
        remark = clean_remark(
            extract_remark_from_text((delivery.metadata or {}).get("message"))
            or extract_remark_from_text((delivery.metadata or {}).get("message_en"))
            or extract_remark_from_text(delivery.message)
        )
        if remark:
            remarks.append({"created_at": delivery.created_at, "remark": remark})

    return remarks


def get_closest_rejection_remark(activity, rejection_remarks):
    activity_time = parse_datetime(str(activity.get("created_at") or ""))
    if not activity_time:
        return rejection_remarks[0]["remark"]

    closest = sorted(
        rejection_remarks,
        key=lambda item: abs((item["created_at"] - activity_time).total_seconds()),
    )[0]
    return closest["remark"]


def is_rejected_activity(activity):
    title = str(activity.get("title") or "").strip().lower()
    return title == "application rejected" or title.startswith("application rejected by")


def extract_remark_from_text(value):
    text = str(value or "")
    match = re.search(r"\bRemark:\s*(.+)", text, flags=re.IGNORECASE | re.DOTALL)
    return clean_remark(match.group(1) if match else "")


def clean_remark(value):
    remark = str(value or "").strip()
    if remark in {"", "-", "[]"}:
        return ""

    return remark
