from copy import deepcopy
from datetime import datetime
import re

from django.db import migrations
from django.utils import timezone


def add_calendar_year(value, years=1):
    try:
        return value.replace(year=value.year + years)
    except ValueError:
        return value.replace(month=2, day=28, year=value.year + years)


def parse_datetime(value, fallback):
    if not value:
        return fallback

    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return fallback

    if timezone.is_naive(parsed):
        return timezone.make_aware(parsed)
    return parsed


def has_document(file_data):
    if not isinstance(file_data, dict):
        return False

    return bool(
        file_data.get("document_id")
        or file_data.get("id")
        or file_data.get("file_url")
        or file_data.get("url")
        or file_data.get("file")
    )


def build_license_id(application):
    reference = str(application.reference_no or "")
    match = re.search(r"(\d{4})-(\d+)$", reference)
    if match:
        year, sequence = match.groups()
        return f"ALIS{year}{int(sequence):05d}"
    return f"ALIS{timezone.now().year}{application.pk:05d}"


def issue_ready_licenses(apps, schema_editor):
    Application = apps.get_model("applications", "Application")
    now = timezone.now()

    for application in Application.objects.filter(status="payment_verified").iterator():
        form_data = deepcopy(application.form_data or {})
        approval_letter = form_data.get("approval_letter") or {}
        official_receipt = approval_letter.get("official_receipt_file") or {}
        license_data = form_data.get("license") or {}
        license_file = license_data.get("license_file") or {}

        if not has_document(official_receipt) or not has_document(license_file):
            continue

        validity_years = int(license_data.get("validity_years") or 1)
        issue_date = parse_datetime(license_data.get("issue_date"), now)
        expiry_date = parse_datetime(
            license_data.get("expiry_date"),
            add_calendar_year(issue_date, validity_years),
        )
        license_id = license_data.get("license_id") or build_license_id(application)

        approval_letter["official_receipt_file"] = {
            **official_receipt,
            "status": "Sent to Applicant",
            "sent_at": official_receipt.get("sent_at") or now.isoformat(),
        }
        form_data["approval_letter"] = approval_letter
        form_data["license"] = {
            **license_data,
            "creation_mode": "upload",
            "license_id": license_id,
            "status": "Active",
            "issue_date": issue_date.isoformat(),
            "expiry_date": expiry_date.isoformat(),
            "validity_years": validity_years,
            "issued_at": license_data.get("issued_at") or now.isoformat(),
            "renewal_reminders": license_data.get("renewal_reminders")
            or [
                {"months_before_expiry": 3, "status": "Scheduled"},
                {"months_before_expiry": 2, "status": "Scheduled"},
                {"months_before_expiry": 1, "status": "Scheduled"},
            ],
        }

        application.status = "license_issued"
        application.form_data = form_data
        application.save(update_fields=["status", "form_data", "updated_at"])


class Migration(migrations.Migration):
    dependencies = [
        ("applications", "0009_alter_application_status"),
    ]

    operations = [
        migrations.RunPython(issue_ready_licenses, migrations.RunPython.noop),
    ]
