from rest_framework import serializers

from .models import NotificationDelivery


class NotificationDeliverySerializer(serializers.ModelSerializer):
    application_id = serializers.IntegerField(source="application.id", read_only=True)
    reference_no = serializers.CharField(
        source="application.reference_no",
        read_only=True,
    )
    project = serializers.CharField(source="application.title", read_only=True)
    status = serializers.CharField(source="application.status", read_only=True)
    latest_remark = serializers.CharField(
        source="application.latest_remark",
        read_only=True,
    )
    application_updated_at = serializers.DateTimeField(
        source="application.updated_at",
        read_only=True,
    )

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
