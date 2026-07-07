from rest_framework import serializers
from .models import Application, SupportingDocument
from .services.activity import (
    enrich_activity_log_with_rejection_remarks,
    get_request_user,
    scope_activity_log_for_user,
)
from .services.summary import (
    get_application_applicant_name,
    get_application_applicant_profile,
    get_application_display_remark,
    get_public_application_display_remark,
    get_application_registered_applicant_name,
    sync_application_summary,
)


STAFF_ROLES = {"admin", "supervisor", "staff"}


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


COMPACT_LIST_OMIT_KEYS = {
    "dataUrl",
    "drawDataUrl",
    "editable_body_html",
    "document_html",
    "digital_signature",
    "site_image_preview",
}


def strip_compact_list_data(value):
    if isinstance(value, dict):
        return {
            key: strip_compact_list_data(item)
            for key, item in value.items()
            if key not in COMPACT_LIST_OMIT_KEYS
        }

    if isinstance(value, list):
        return [strip_compact_list_data(item) for item in value]

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
    payment = serializers.SerializerMethodField()
    license_revocation_request = serializers.SerializerMethodField()
    latest_remark = serializers.SerializerMethodField()
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
            "payment",
            "license_revocation_request",
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

    def is_compact(self):
        request = self.context.get("request")
        if not request:
            return False

        query_params = getattr(request, "query_params", None) or getattr(request, "GET", {})
        value = str(
            query_params.get("compact")
            or query_params.get("list_mode")
            or ""
        ).strip().lower()
        return value in {"1", "true", "yes", "compact"}

    def get_form_section(self, obj, key):
        section = (obj.form_data or {}).get(key, {})
        if self.is_compact():
            return strip_compact_list_data(section)

        return section

    def get_auto_screening(self, obj):
        return self.get_form_section(obj, "auto_screening")

    def get_technical_review(self, obj):
        return self.get_form_section(obj, "technical_review")

    def get_technical_ku_review(self, obj):
        return self.get_form_section(obj, "technical_ku_review")

    def get_technical_department_reviews(self, obj):
        return self.get_form_section(obj, "technical_department_reviews")

    def get_technical_department_selection(self, obj):
        return self.get_form_section(obj, "technical_department_selection")

    def get_technical_referral(self, obj):
        return self.get_form_section(obj, "technical_referral")

    def get_kb_les_verification(self, obj):
        return self.get_form_section(obj, "kb_les_verification")

    def get_management_recommendation(self, obj):
        return self.get_form_section(obj, "management_recommendation")

    def get_mphlg_gateway(self, obj):
        return self.get_form_section(obj, "mphlg_gateway")

    def get_sut_approval(self, obj):
        return self.get_form_section(obj, "sut_approval")

    def get_approval(self, obj):
        return self.get_form_section(obj, "approval")

    def get_payment(self, obj):
        return self.get_form_section(obj, "payment")

    def get_license_revocation_request(self, obj):
        return self.get_form_section(obj, "license_revocation_request")

    def get_approval_letter(self, obj):
        approval_letter = (obj.form_data or {}).get("approval_letter", {})
        if not isinstance(approval_letter, dict):
            return {}

        if self.is_compact():
            return strip_compact_list_data(approval_letter)

        return strip_inline_file_data(approval_letter)

    def get_display_remark(self, obj):
        if self.is_applicant_view():
            return get_public_application_display_remark(obj)

        return get_application_display_remark(obj)

    def get_latest_remark(self, obj):
        if self.is_applicant_view():
            return get_public_application_display_remark(obj)

        return obj.latest_remark

    def is_applicant_view(self):
        user = get_request_user(self)
        return getattr(user, "role", "") not in STAFF_ROLES

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

