from rest_framework import serializers
from .models import Application, SupportingDocument


class SupportingDocumentSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = SupportingDocument
        fields = [
            "id",
            "title",
            "file",
            "file_url",
            "uploaded_at",
        ]
        read_only_fields = ["id", "file_url", "uploaded_at"]

    def get_file_url(self, obj):
        request = self.context.get("request")

        if request:
            return request.build_absolute_uri(obj.file.url)

        return obj.file.url


class ApplicationListSerializer(serializers.ModelSerializer):
    applicant_username = serializers.CharField(
        source="applicant.username",
        read_only=True,
    )
    application_type_label = serializers.SerializerMethodField()
    project_location = serializers.SerializerMethodField()

    class Meta:
        model = Application
        fields = [
            "id",
            "reference_no",
            "applicant",
            "applicant_username",
            "application_type",
            "application_type_label",
            "project_location",
            "title",
            "status",
            "current_step",
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

    def get_application_type_label(self, obj):
        step1 = (obj.form_data or {}).get("step_1", {})

        return (
            step1.get("application_type_label")
            or step1.get("application_type")
            or obj.get_application_type_display()
        )

    def get_project_location(self, obj):
        form_data = obj.form_data or {}
        step1 = form_data.get("step_1", {})
        step4 = form_data.get("step_4", {})

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


class ApplicationDetailSerializer(serializers.ModelSerializer):
    applicant_username = serializers.CharField(
        source="applicant.username",
        read_only=True,
    )

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
            "application_type",
            "title",
            "status",
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
            "supporting_documents",
            "created_at",
            "updated_at",
        ]
