from rest_framework import serializers
from .models import Application


class ApplicationSerializer(serializers.ModelSerializer):
    applicant_username = serializers.CharField(source="applicant.username", read_only=True)

    class Meta:
        model = Application
        fields = [
            "id",
            "reference_no",
            "applicant",
            "applicant_username",
            "application_type",
            "title",
            "status",
            "current_step",
            "form_data",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "reference_no",
            "applicant",
            "applicant_username",
            "created_at",
            "updated_at",
        ]