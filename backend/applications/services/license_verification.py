from django.http import Http404
from django.shortcuts import get_object_or_404

from applications.models import Application, SupportingDocument


def normalize_license_id(value):
    return str(value or "").strip().upper()


def get_public_license_document(license_id):
    normalized_id = normalize_license_id(license_id)

    for application in Application.objects.exclude(form_data={}):
        form_data = application.form_data or {}
        license_data = form_data.get("license") or {}
        if not isinstance(license_data, dict):
            continue

        stored_license_id = normalize_license_id(license_data.get("license_id"))
        if stored_license_id != normalized_id:
            continue

        license_file = license_data.get("license_file") or {}
        if not isinstance(license_file, dict):
            license_file = {}

        document_id = license_file.get("document_id") or license_file.get("id")
        if not document_id:
            raise Http404("Advertisement license document not found.")

        document = get_object_or_404(
            SupportingDocument,
            id=document_id,
            application=application,
        )
        return application, document

    raise Http404("Advertisement license not found.")
