from dataclasses import dataclass

from django.http import Http404
from django.shortcuts import get_object_or_404

from applications.models import Application, SupportingDocument


@dataclass
class PublicLicenseDocument:
    supporting_document: SupportingDocument | None = None
    html: str = ""
    name: str = "Advertisement License.html"

    @property
    def is_generated(self):
        return bool(self.html)


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
        if document_id:
            document = get_object_or_404(
                SupportingDocument,
                id=document_id,
                application=application,
            )
            return application, PublicLicenseDocument(
                supporting_document=document,
                name=document.file.name.rsplit("/", 1)[-1],
            )

        manual_license = license_data.get("manual_license") or {}
        if not isinstance(manual_license, dict):
            manual_license = {}

        document_html = str(manual_license.get("document_html") or "").strip()
        if document_html:
            return application, PublicLicenseDocument(
                html=document_html,
                name=manual_license.get("name") or "Advertisement License.html",
            )

        raise Http404("Advertisement license document not found.")

    raise Http404("Advertisement license not found.")
