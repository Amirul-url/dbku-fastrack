from dataclasses import dataclass

from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime

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


def is_public_license_active(application, license_data):
    if application.status != "license_issued":
        return False

    license_status = str(license_data.get("status") or "").strip().lower()
    return license_status in {"", "active"} and not is_license_expired(license_data)


def get_public_license_unavailable_message(license_data):
    license_status = str(license_data.get("status") or "").strip().lower()
    if license_status == "expired" or is_license_expired(license_data):
        return "Advertisement license has expired."

    return "Advertisement license is not active."


def get_dict(value):
    return value if isinstance(value, dict) else {}


def parse_license_expiry(value):
    raw_value = str(value or "").strip()
    if not raw_value:
        return None

    parsed_datetime = parse_datetime(raw_value)
    if parsed_datetime:
        if timezone.is_naive(parsed_datetime):
            parsed_datetime = timezone.make_aware(parsed_datetime, timezone.get_current_timezone())
        return parsed_datetime

    parsed_date = parse_date(raw_value)
    if parsed_date:
        return parsed_date

    return None


def is_expiry_in_past(value):
    parsed_expiry = parse_license_expiry(value)
    if not parsed_expiry:
        return False

    now = timezone.localtime(timezone.now())
    if hasattr(parsed_expiry, "date"):
        parsed_expiry = timezone.localtime(parsed_expiry)
        return parsed_expiry <= now

    return parsed_expiry < now.date()


def is_license_expired(license_data):
    return is_expiry_in_past(license_data.get("expiry_date")) or is_expiry_in_past(
        license_data.get("expired_at")
    )


def get_document_from_file(application, license_file):
    license_file = get_dict(license_file)
    document_id = license_file.get("document_id") or license_file.get("id")
    if not document_id:
        return None

    document = get_object_or_404(
        SupportingDocument,
        id=document_id,
        application=application,
    )
    return PublicLicenseDocument(
        supporting_document=document,
        name=document.file.name.rsplit("/", 1)[-1],
    )


def get_document_from_generated_license(manual_license):
    manual_license = get_dict(manual_license)
    document_html = str(manual_license.get("document_html") or "").strip()
    if not document_html:
        return None

    return PublicLicenseDocument(
        html=document_html,
        name=manual_license.get("name") or "Advertisement License.html",
    )


def get_latest_renewal_license_document(application, form_data):
    renewal = get_dict(form_data.get("license_renewal"))
    payment = get_dict(renewal.get("payment"))
    payment_status = str(payment.get("status") or "").strip().lower()
    if payment_status != "completed":
        return None

    for file_key in (
        "advertisement_license_file",
        "renewed_license_file",
        "license_file",
    ):
        document = get_document_from_file(application, payment.get(file_key))
        if document:
            return document

    for license_key in (
        "renewed_license",
        "manual_advertisement_license",
        "renewed_license_draft",
        "manual_advertisement_license_draft",
    ):
        document = get_document_from_generated_license(payment.get(license_key))
        if document:
            return document

    return None


def get_public_license_document(license_id):
    normalized_id = normalize_license_id(license_id)

    for application in Application.objects.exclude(form_data={}):
        form_data = application.form_data or {}
        license_data = get_dict(form_data.get("license"))
        if not license_data:
            continue

        stored_license_id = normalize_license_id(license_data.get("license_id"))
        if stored_license_id != normalized_id:
            continue

        if not is_public_license_active(application, license_data):
            raise Http404(get_public_license_unavailable_message(license_data))

        renewal_document = get_latest_renewal_license_document(application, form_data)
        if renewal_document:
            return application, renewal_document

        file_document = get_document_from_file(application, license_data.get("license_file"))
        if file_document:
            return application, file_document

        generated_document = get_document_from_generated_license(license_data.get("manual_license"))
        if generated_document:
            return application, generated_document

        raise Http404("Advertisement license document not found.")

    raise Http404("Advertisement license not found.")
