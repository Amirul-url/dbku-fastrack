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
        return getattr(obj.application, "latest_remark", None)

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
