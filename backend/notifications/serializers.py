from rest_framework import serializers

from .models import NotificationDelivery


class NotificationDeliverySerializer(serializers.ModelSerializer):
    application_id = serializers.SerializerMethodField()
    reference_no = serializers.SerializerMethodField()
    project = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    recipient_name = serializers.SerializerMethodField()
    recipient_email = serializers.SerializerMethodField()
    recipient_mobile_number = serializers.SerializerMethodField()
    recipient_department = serializers.SerializerMethodField()
    latest_remark = serializers.SerializerMethodField()
    application_updated_at = serializers.SerializerMethodField()
    technical_department_reviews = serializers.SerializerMethodField()
    kb_les_verification = serializers.SerializerMethodField()
    management_recommendation = serializers.SerializerMethodField()

    def get_application_id(self, obj):
        return obj.application_id

    def get_reference_no(self, obj):
        return getattr(obj.application, "reference_no", None)

    def get_project(self, obj):
        return getattr(obj.application, "title", None)

    def get_status(self, obj):
        return getattr(obj.application, "status", None)

    def get_recipient_name(self, obj):
        user = getattr(obj, "user", None)
        if not user:
            return ""

        name = " ".join(
            part for part in [getattr(user, "first_name", ""), getattr(user, "last_name", "")] if part
        ).strip()
        return name or getattr(user, "username", "") or ""

    def get_recipient_email(self, obj):
        user = getattr(obj, "user", None)
        return getattr(user, "email", "") if user else ""

    def get_recipient_mobile_number(self, obj):
        user = getattr(obj, "user", None)
        return getattr(user, "mobile_number", "") if user else ""

    def get_recipient_department(self, obj):
        user = getattr(obj, "user", None)
        return getattr(user, "department", "") if user else ""

    def get_latest_remark(self, obj):
        metadata = obj.metadata or {}
        if metadata.get("suppress_remark"):
            return ""

        application = getattr(obj, "application", None)
        form_data = getattr(application, "form_data", None) or {}

        def section(name):
            value = form_data.get(name) or {}
            return value if isinstance(value, dict) else {}

        event_status = str(metadata.get("event_status") or getattr(application, "status", "") or "").strip().lower()
        kb_status = normalize_notification_status(section("kb_les_verification").get("status"))
        support_status = normalize_notification_status(section("management_recommendation").get("status"))

        if event_status == "mphlg_processing":
            return first_notification_remark(
                section("management_recommendation").get("remarks"),
                section("mphlg_gateway").get("remarks"),
                getattr(application, "latest_remark", ""),
            )

        if event_status == "approved" and normalize_notification_status(section("mphlg_gateway").get("officer")) == "mphlg":
            return first_notification_remark(
                section("mphlg_gateway").get("remarks"),
                section("approval").get("remarks"),
                getattr(application, "latest_remark", ""),
            )

        if event_status == "technical_review_completed":
            return first_notification_remark(
                section("technical_review").get("remarks"),
                section("technical_review").get("comment"),
                section("technical_review").get("site_remarks"),
                section("technical_review").get("findings"),
                section("correction_request").get("remarks"),
                section("kb_les_verification").get("remarks"),
                section("management_recommendation").get("remarks"),
                section("mphlg_gateway").get("remarks"),
                getattr(application, "latest_remark", ""),
            )

        if event_status == "management_review" and kb_status not in {"verified", "supported", "completed"}:
            return first_notification_remark(
                section("technical_ku_review").get("remarks"),
                section("technical_ku_review").get("comment"),
                getattr(application, "latest_remark", ""),
            )

        if (
            event_status == "management_review"
            and kb_status in {"verified", "supported", "completed"}
            and support_status not in {"supported", "approved", "completed"}
        ):
            return first_notification_remark(
                section("kb_les_verification").get("remarks"),
                section("management_recommendation").get("remarks"),
                getattr(application, "latest_remark", ""),
            )

        remark = clean_notification_remark(getattr(application, "latest_remark", ""))
        if remark:
            return remark

        candidates = [
            section("correction_request").get("remarks"),
            section("technical_ku_review").get("remarks"),
            section("technical_ku_review").get("comment"),
            section("auto_screening").get("remarks"),
            section("technical_review").get("comment"),
            section("technical_review").get("remarks"),
        ]

        for value in candidates:
            remark = clean_notification_remark(value)
            if remark:
                return remark

        return ""

    def get_application_updated_at(self, obj):
        return getattr(obj.application, "updated_at", None)

    def get_technical_department_reviews(self, obj):
        form_data = getattr(obj.application, "form_data", None) or {}
        reviews = form_data.get("technical_department_reviews") or {}
        return reviews if isinstance(reviews, dict) else {}

    def get_kb_les_verification(self, obj):
        form_data = getattr(obj.application, "form_data", None) or {}
        section = form_data.get("kb_les_verification") or {}
        return section if isinstance(section, dict) else {}

    def get_management_recommendation(self, obj):
        form_data = getattr(obj.application, "form_data", None) or {}
        section = form_data.get("management_recommendation") or {}
        return section if isinstance(section, dict) else {}

    class Meta:
        model = NotificationDelivery
        fields = [
            "id",
            "application_id",
            "reference_no",
            "project",
            "status",
            "recipient",
            "recipient_name",
            "recipient_email",
            "recipient_mobile_number",
            "recipient_department",
            "latest_remark",
            "application_updated_at",
            "technical_department_reviews",
            "kb_les_verification",
            "management_recommendation",
            "recipient_role",
            "subject",
            "message",
            "metadata",
            "created_at",
            "read_at",
        ]


def first_notification_remark(*values):
    for value in values:
        remark = clean_notification_remark(value)
        if remark:
            return remark

    return ""


def clean_notification_remark(value):
    remark = str(value or "").strip()
    return "" if remark in {"", "-", "[]"} else remark


def normalize_notification_status(value):
    return str(value or "").strip().lower()
