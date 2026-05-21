from rest_framework import serializers
from .models import Application, SupportingDocument


def strip_inline_file_data(value):
    if isinstance(value, dict):
        cleaned = {}

        for key, item in value.items():
            if key in ["dataUrl", "site_image_preview"] and isinstance(item, str):
                cleaned[key] = "" if item.startswith("data:") else item
                continue

            cleaned[key] = strip_inline_file_data(item)

        return cleaned

    if isinstance(value, list):
        return [strip_inline_file_data(item) for item in value]

    if isinstance(value, str) and value.startswith("data:"):
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


def get_application_applicant_name(application):
    form_data = application.form_data or {}
    sections = [
        form_data.get("step_1") or {},
        form_data.get("step_2") or {},
        form_data.get("step_3") or {},
    ]
    form_candidates = []

    for section in sections:
        if not isinstance(section, dict):
            continue

        form_candidates.extend(
            [
                section.get("applicant"),
                section.get("org_name"),
                section.get("full_name"),
            ]
        )

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
    applicant_full_name = serializers.SerializerMethodField()
    application_type_label = serializers.SerializerMethodField()
    technical_department_reviews = serializers.SerializerMethodField()
    kb_les_verification = serializers.SerializerMethodField()
    management_recommendation = serializers.SerializerMethodField()
    mphlg_gateway = serializers.SerializerMethodField()
    approval = serializers.SerializerMethodField()

    class Meta:
        model = Application
        fields = [
            "id",
            "reference_no",
            "applicant",
            "applicant_username",
            "applicant_full_name",
            "application_type",
            "application_type_label",
            "project_location",
            "title",
            "status",
            "latest_remark",
            "current_step",
            "technical_department_reviews",
            "kb_les_verification",
            "management_recommendation",
            "mphlg_gateway",
            "approval",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "reference_no",
            "applicant",
            "applicant_username",
            "applicant_full_name",
            "created_at",
            "updated_at",
        ]

    def get_applicant_full_name(self, obj):
        return get_application_applicant_name(obj)

    def get_application_type_label(self, obj):
        return obj.get_application_type_display()

    def get_technical_department_reviews(self, obj):
        return (obj.form_data or {}).get("technical_department_reviews", {})

    def get_kb_les_verification(self, obj):
        return (obj.form_data or {}).get("kb_les_verification", {})

    def get_management_recommendation(self, obj):
        return (obj.form_data or {}).get("management_recommendation", {})

    def get_mphlg_gateway(self, obj):
        return (obj.form_data or {}).get("mphlg_gateway", {})

    def get_approval(self, obj):
        return (obj.form_data or {}).get("approval", {})


class ApplicationDetailSerializer(serializers.ModelSerializer):
    applicant_username = serializers.CharField(
        source="applicant.username",
        read_only=True,
    )
    applicant_full_name = serializers.SerializerMethodField()

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
            "project_location",
            "supporting_documents",
            "created_at",
            "updated_at",
        ]

    def get_applicant_full_name(self, obj):
        return get_application_applicant_name(obj)

    def create(self, validated_data):
        instance = Application(**validated_data)
        sync_application_summary(instance)
        instance.save()
        return instance

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["form_data"] = strip_inline_file_data(data.get("form_data") or {})
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
    instance.latest_remark = get_latest_remark_from_form_data(form_data)


def get_latest_remark_from_form_data(form_data):
    form_data = form_data or {}

    def section(name):
        value = form_data.get(name) or {}
        return value if isinstance(value, dict) else {}

    candidates = [
        section("correction_request").get("remarks"),
        section("auto_screening").get("remarks"),
        section("technical_review").get("comment"),
        section("technical_review").get("remarks"),
        section("approval").get("notes"),
        section("approval").get("comment"),
        section("payment").get("verification_notes"),
    ]

    for value in candidates:
        remark = clean_remark(value)
        if remark:
            return remark

    return ""


def clean_remark(value):
    remark = str(value or "").strip()
    if remark in {"", "-", "[]"}:
        return ""

    return remark
