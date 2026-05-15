from rest_framework import serializers

from .models import NotificationDelivery


class NotificationDeliverySerializer(serializers.ModelSerializer):
    application_id = serializers.SerializerMethodField()
    reference_no = serializers.SerializerMethodField()
    project = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    latest_remark = serializers.SerializerMethodField()
    application_updated_at = serializers.SerializerMethodField()

    def get_application_id(self, obj):
        return obj.application_id

    def get_reference_no(self, obj):
        return getattr(obj.application, "reference_no", None)

    def get_project(self, obj):
        return getattr(obj.application, "title", None)

    def get_status(self, obj):
        return getattr(obj.application, "status", None)

    def get_latest_remark(self, obj):
        return getattr(obj.application, "latest_remark", None)

    def get_application_updated_at(self, obj):
        return getattr(obj.application, "updated_at", None)

    class Meta:
        model = NotificationDelivery
        fields = [
            "id",
            "application_id",
            "reference_no",
            "project",
            "status",
            "latest_remark",
            "application_updated_at",
            "recipient_role",
            "subject",
            "message",
            "metadata",
            "created_at",
            "read_at",
        ]
