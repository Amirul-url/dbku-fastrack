import json
import logging
import re
import urllib.error
import urllib.request
from hashlib import sha1

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.utils import timezone

from .models import NotificationDelivery

logger = logging.getLogger(__name__)

APP_BRAND_NAME = "ALiS"


STATUS_MESSAGES = {
    "submitted": (
        "Application submitted",
        "Your application {reference} has been submitted successfully.",
        "New application {reference} has been submitted and is waiting for review.",
    ),
    "incomplete": (
        "Application requires amendment",
        "Your application {reference} requires amendment. Please review the remark below and update your application.",
        "Application {reference} has been returned to the applicant for amendment.",
    ),
    "ku_ikl_review": (
        "Application moved to KU(IKL) review",
        "Your application {reference} is now in KU(IKL) review.",
        "Application {reference} is now in KU(IKL) review.",
    ),
    "technical_review": (
        "Application moved to technical review",
        "Your application {reference} is now in technical review.",
        "Application {reference} is ready for technical review.",
    ),
    "technical_site_visit": (
        "Technical site visit required",
        "Your application {reference} requires a technical site visit.",
        "Application {reference} requires a technical site visit.",
    ),
    "technical_amendment": (
        "Technical amendment required",
        "Your application {reference} requires technical amendment. Please review the remark below.",
        "Application {reference} requires technical amendment.",
    ),
    "technical_review_completed": (
        "Technical review completed",
        "Technical review for application {reference} has been completed.",
        "Technical review for application {reference} has been completed.",
    ),
    "management_review": (
        "Application moved to management review",
        "Your application {reference} is now in management review.",
        "Application {reference} is now in management review.",
    ),
    "mphlg_processing": (
        "Application moved to MPHLG processing",
        "Your application {reference} is now in MPHLG processing.",
        "Application {reference} is now in MPHLG processing.",
    ),
    "mphlg_decision_received": (
        "MPHLG decision received",
        "MPHLG decision for application {reference} has been received.",
        "MPHLG decision for application {reference} has been received.",
    ),
    "approved": (
        "Application approved",
        "Your application {reference} has been approved.",
        "Application {reference} has been approved.",
    ),
    "approved_with_conditions": (
        "Application approved with conditions",
        "Your application {reference} has been approved with conditions. Please review the condition below.",
        "Application {reference} has been approved with conditions. Please review the condition below.",
    ),
    "rejected": (
        "Application rejected",
        "Your application {reference} has been rejected. Please review the remark below.",
        "Application {reference} has been rejected.",
    ),
    "invoice_generated": (
        "Invoice generated",
        "Invoice for application {reference} has been generated. Please proceed with payment.",
        "Invoice for application {reference} has been generated.",
    ),
    "payment_submitted": (
        "Payment proof submitted",
        "Payment proof for application {reference} has been submitted.",
        "Payment proof for application {reference} has been submitted and needs verification.",
    ),
    "payment_verified": (
        "Payment verified",
        "Payment for application {reference} has been verified. Please review any verification note below.",
        "Payment for application {reference} has been verified. Please review any verification note below.",
    ),
    "license_issued": (
        "E-license issued",
        "Your e-license for application {reference} has been issued.",
        "E-license for application {reference} has been issued.",
    ),
    "license_revoked": (
        "License revoked",
        "License for application {reference} has been revoked.",
        "License for application {reference} has been revoked.",
    ),
}

STATUS_UI = {
    "submitted": ("progress", "info"),
    "incomplete": ("correction", "error"),
    "ku_ikl_review": ("progress", "info"),
    "technical_review": ("technical", "info"),
    "technical_site_visit": ("technical", "warning"),
    "technical_amendment": ("correction", "error"),
    "technical_review_completed": ("technical", "success"),
    "management_review": ("approval", "info"),
    "mphlg_processing": ("approval", "info"),
    "mphlg_decision_received": ("approval", "info"),
    "approved": ("decision", "success"),
    "approved_with_conditions": ("decision", "warning"),
    "rejected": ("decision", "error"),
    "invoice_generated": ("payment", "warning"),
    "payment_submitted": ("payment", "warning"),
    "payment_verified": ("payment", "success"),
    "license_issued": ("license", "success"),
    "license_revoked": ("license", "error"),
}

REMARK_REPEAT_STATUSES = {
    "incomplete",
    "technical_amendment",
    "approved_with_conditions",
    "rejected",
    "payment_verified",
}


def notify_application_status_change(application, old_status=None, old_remark=None):
    new_status = str(application.status or "").strip().lower()
    previous_status = str(old_status or "").strip().lower()
    current_remark = str(getattr(application, "latest_remark", "") or "").strip()
    previous_remark = str(old_remark or "").strip()
    status_changed = previous_status != new_status
    remark_changed = current_remark != previous_remark

    if not new_status or new_status == "draft":
        return

    if not status_changed and not (
        new_status in REMARK_REPEAT_STATUSES and remark_changed
    ):
        return

    messages = build_status_messages(application)
    event_key = build_event_key(application, new_status, remark_changed)

    for recipient in build_recipients(application, messages):
        create_and_send_delivery(
            application=application,
            event_key=event_key,
            **recipient,
        )


def build_event_key(application, status_key, remark_changed=False):
    updated_at = getattr(application, "updated_at", None)
    if updated_at:
        occurrence = updated_at.isoformat()
    else:
        occurrence = timezone.now().isoformat()

    if remark_changed:
        remark = str(getattr(application, "latest_remark", "") or "")
        occurrence = sha1(f"{occurrence}:{remark}".encode("utf-8")).hexdigest()[:12]

    return f"application:{application.id}:status:{status_key}:event:{occurrence}"


def build_status_messages(application):
    status_key = str(application.status or "").strip().lower()
    fallback_label = application.get_status_display()
    subject_template, applicant_template, admin_template = STATUS_MESSAGES.get(
        status_key,
        (
            f"Application status updated: {fallback_label}",
            "Your application {reference} status is now {status_label}.",
            "Application {reference} status is now {status_label}.",
        ),
    )

    context = {
        "reference": application.reference_no,
        "status_label": fallback_label,
        "title": application.title or application.get_application_type_display(),
    }

    title = subject_template.format(**context)
    subject = f"{APP_BRAND_NAME} - {title} ({application.reference_no})"
    applicant_body = applicant_template.format(**context)
    admin_body = admin_template.format(**context)
    applicant_metadata = build_web_metadata(
        application=application,
        title=title,
        body=applicant_body,
        recipient_role="applicant",
    )
    admin_metadata = build_web_metadata(
        application=application,
        title=title,
        body=admin_body,
        recipient_role="admin",
    )
    applicant_message = format_notification_message(
        title=title,
        body=applicant_body,
        application=application,
        recipient_role="applicant",
    )
    admin_message = format_notification_message(
        title=title,
        body=admin_body,
        application=application,
        recipient_role="admin",
    )

    return {
        "subject": subject,
        "applicant_message": applicant_message,
        "admin_message": admin_message,
        "applicant_metadata": applicant_metadata,
        "admin_metadata": admin_metadata,
    }


def build_web_metadata(application, title, body, recipient_role):
    category, notification_type = STATUS_UI.get(
        str(application.status or "").strip().lower(),
        ("progress", "info"),
    )
    remark = get_message_remark(application)
    display_message = body

    if remark:
        display_message = f"{display_message} Remark: {remark}"

    return {
        "category": category,
        "type": notification_type,
        "title": title,
        "title_en": title,
        "message": display_message,
        "message_en": display_message,
        "recipient_role": recipient_role,
    }


def format_notification_message(title, body, application, recipient_role):
    lines = [
        APP_BRAND_NAME,
        "",
        title,
        f"Reference: {application.reference_no}",
        f"Status: {application.get_status_display()}",
    ]

    if application.title:
        lines.append(f"Project: {application.title}")

    lines.extend(["", body])

    remark = get_message_remark(application)
    if remark:
        lines.extend(["", f"Remark: {remark}"])

    return "\n".join(lines)


def get_message_remark(application):
    status_key = str(application.status or "").strip().lower()
    if status_key not in REMARK_REPEAT_STATUSES:
        return ""

    return get_latest_remark(application)


def get_latest_remark(application):
    form_data = application.form_data or {}

    if getattr(application, "latest_remark", ""):
        return clean_remark(application.latest_remark)

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


def build_recipients(application, messages):
    recipients = []
    subject = messages["subject"]
    applicant_message = messages["applicant_message"]
    admin_message = messages["admin_message"]
    applicant_metadata = messages["applicant_metadata"]
    admin_metadata = messages["admin_metadata"]

    if application.applicant_id:
        recipients.append({
            "user": application.applicant,
            "recipient_role": "applicant",
            "channel": "web",
            "recipient": get_web_recipient(application.applicant),
            "subject": subject,
            "message": applicant_message,
            "metadata": applicant_metadata,
        })

    for email in get_applicant_emails(application):
        recipients.append({
            "user": application.applicant,
            "recipient_role": "applicant",
            "channel": "email",
            "recipient": email,
            "subject": subject,
            "message": applicant_message,
            "metadata": applicant_metadata,
        })

    for phone in get_applicant_whatsapp_numbers(application):
        recipients.append({
            "user": application.applicant,
            "recipient_role": "applicant",
            "channel": "whatsapp",
            "recipient": phone,
            "subject": subject,
            "message": applicant_message,
            "metadata": applicant_metadata,
        })

    for user in get_admin_web_recipients():
        recipients.append({
            "user": user,
            "recipient_role": "admin",
            "channel": "web",
            "recipient": get_web_recipient(user),
            "subject": subject,
            "message": admin_message,
            "metadata": admin_metadata,
        })

    for user, email in get_admin_email_recipients():
        recipients.append({
            "user": user,
            "recipient_role": "admin",
            "channel": "email",
            "recipient": email,
            "subject": subject,
            "message": admin_message,
            "metadata": admin_metadata,
        })

    for phone in get_admin_whatsapp_numbers():
        recipients.append({
            "user": None,
            "recipient_role": "admin",
            "channel": "whatsapp",
            "recipient": phone,
            "subject": subject,
            "message": admin_message,
            "metadata": admin_metadata,
        })

    return dedupe_recipients(recipients)


def get_applicant_emails(application):
    values = [
        get_nested(application.form_data, "step_2", "email"),
        get_nested(application.form_data, "step_3", "email"),
        getattr(application.applicant, "email", ""),
    ]

    return [
        value
        for value in dedupe_values(normalize_email(value) for value in values)
        if value
    ]


def get_applicant_whatsapp_numbers(application):
    form_data = application.form_data or {}
    candidates = [
        join_phone(
            get_nested(form_data, "step_2", "mobile_country_code"),
            get_nested(form_data, "step_2", "mobile_no"),
        ),
        join_phone(
            get_nested(form_data, "step_3", "mobile_country_code"),
            get_nested(form_data, "step_3", "mobile_no"),
        ),
        get_nested(form_data, "step_1", "tel_no"),
    ]

    return [value for value in dedupe_values(normalize_phone(value) for value in candidates) if value]


def get_admin_email_recipients():
    User = get_user_model()
    recipients = []

    for user in User.objects.filter(role__in=["admin", "staff"]).exclude(email=""):
        email = normalize_email(user.email)
        if email:
            recipients.append((user, email))

    for email in settings.NOTIFICATION_ADMIN_EMAILS:
        email = normalize_email(email)
        if email:
            recipients.append((None, email))

    return recipients


def get_default_superadmin():
    User = get_user_model()
    return (
        User.objects.filter(role="superadmin", is_active=True)
        .order_by("id")
        .first()
    )


def get_notification_sender_email():
    superadmin = get_default_superadmin()
    email = normalize_email(getattr(superadmin, "email", ""))
    return email or getattr(settings, "BREVO_FROM_EMAIL", "")


def get_notification_sender_phone():
    superadmin = get_default_superadmin()
    return normalize_phone(getattr(superadmin, "mobile_number", ""))


def get_admin_web_recipients():
    User = get_user_model()
    return list(User.objects.filter(role__in=["admin", "staff"]))


def get_web_recipient(user):
    return f"user:{user.id}"


def get_admin_whatsapp_numbers():
    return [
        value
        for value in dedupe_values(normalize_phone(value) for value in settings.NOTIFICATION_ADMIN_WHATSAPP_NUMBERS)
        if value
    ]


def create_and_send_delivery(
    application,
    event_key,
    user,
    recipient_role,
    channel,
    recipient,
    subject,
    message,
    metadata=None,
):
    try:
        delivery, created = NotificationDelivery.objects.get_or_create(
            event_key=event_key,
            channel=channel,
            recipient=recipient,
            defaults={
                "application": application,
                "user": user,
                "recipient_role": recipient_role,
                "subject": subject,
                "message": message,
                "metadata": metadata or {},
            },
        )
    except IntegrityError:
        return

    if not created and delivery.status == "sent":
        return

    if channel == "web":
        delivery.status = "sent"
        delivery.error = ""
        delivery.sent_at = timezone.now()
        delivery.save(update_fields=["status", "error", "sent_at"])
        return

    if not is_channel_configured(channel):
        delivery.status = "skipped"
        delivery.error = get_channel_skip_reason(channel)
        delivery.save(update_fields=["status", "error"])
        return

    try:
        if channel == "email":
            send_email(recipient, subject, message)
        elif channel == "whatsapp":
            send_whatsapp(recipient, message)
        else:
            raise ValueError(f"Unsupported notification channel: {channel}")
    except Exception as exc:
        logger.exception("Unable to send %s notification to %s", channel, recipient)
        delivery.status = "failed"
        delivery.error = str(exc)
        delivery.save(update_fields=["status", "error"])
        return

    delivery.status = "sent"
    delivery.error = ""
    delivery.sent_at = timezone.now()
    delivery.save(update_fields=["status", "error", "sent_at"])


def send_email(recipient, subject, message):
    actual_recipient, actual_subject, actual_message = prepare_email_delivery(
        recipient,
        subject,
        message,
    )

    send_brevo_email(actual_recipient, actual_subject, actual_message)


def prepare_email_delivery(recipient, subject, message):
    redirect_to = getattr(settings, "NOTIFICATION_EMAIL_REDIRECT_TO", "").strip()
    if not redirect_to:
        return recipient, subject, message

    redirected_message = (
        f"Test email redirect\n"
        f"Original recipient: {recipient}\n\n"
        f"{message}"
    )
    return redirect_to, f"[fasTrack test] {subject}", redirected_message


def send_brevo_email(recipient, subject, message):
    html_message = "<br>".join(escape_html(message).splitlines())
    payload = {
        "sender": {
            "name": settings.BREVO_FROM_NAME,
            "email": get_notification_sender_email(),
        },
        "to": [{"email": recipient}],
        "subject": subject,
        "textContent": message,
        "htmlContent": f"<p>{html_message}</p>",
    }
    headers = {
        "Content-Type": "application/json",
        "api-key": settings.BREVO_API_KEY,
    }

    post_json("https://api.brevo.com/v3/smtp/email", payload, headers)


def send_whatsapp(recipient, message):
    if settings.WHATSAPP_PROVIDER == "evolution":
        send_evolution_whatsapp(recipient, message)
        return

    if settings.WHATSAPP_PROVIDER == "meta":
        send_meta_whatsapp(recipient, message)
        return

    send_webhook_whatsapp(recipient, message)


def send_webhook_whatsapp(recipient, message):
    headers = {"Content-Type": "application/json"}
    if settings.WHATSAPP_WEBHOOK_TOKEN:
        headers["Authorization"] = f"Bearer {settings.WHATSAPP_WEBHOOK_TOKEN}"

    payload = {"to": recipient, "message": message}
    sender_phone = get_notification_sender_phone()
    if sender_phone:
        payload["from"] = sender_phone

    post_json(settings.WHATSAPP_WEBHOOK_URL, payload, headers)


def send_evolution_whatsapp(recipient, message):
    url = (
        f"{settings.EVOLUTION_API_URL}/message/sendText/"
        f"{settings.EVOLUTION_INSTANCE_NAME}"
    )
    payload = {
        "number": recipient,
        "text": message,
        "delay": 1000,
        "linkPreview": True,
    }
    headers = {
        "Content-Type": "application/json",
        "apikey": settings.EVOLUTION_API_KEY,
    }

    post_json(url, payload, headers)


def send_meta_whatsapp(recipient, message):
    url = (
        "https://graph.facebook.com/v19.0/"
        f"{settings.WHATSAPP_META_PHONE_NUMBER_ID}/messages"
    )
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {settings.WHATSAPP_META_ACCESS_TOKEN}",
    }
    payload = {
        "messaging_product": "whatsapp",
        "to": recipient,
        "type": "text",
        "text": {"body": message},
    }

    post_json(url, payload, headers)


def post_json(url, payload, headers):
    request_headers = {
        "Accept": "application/json",
        "User-Agent": "DBKU-fasTrack/1.0",
        **headers,
    }
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=request_headers,
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            if response.status >= 400:
                raise RuntimeError(f"HTTP {response.status}")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"HTTP {exc.code}: {body}") from exc


def is_channel_configured(channel):
    if channel == "web":
        return True

    if channel == "email":
        return bool(
            settings.NOTIFICATION_EMAIL_ENABLED
            and settings.BREVO_API_KEY
            and get_notification_sender_email()
        )

    if channel == "whatsapp":
        if not settings.WHATSAPP_ENABLED:
            return False

        if settings.WHATSAPP_PROVIDER == "meta":
            return bool(settings.WHATSAPP_META_PHONE_NUMBER_ID and settings.WHATSAPP_META_ACCESS_TOKEN)

        if settings.WHATSAPP_PROVIDER == "evolution":
            return bool(settings.EVOLUTION_API_URL and settings.EVOLUTION_API_KEY and settings.EVOLUTION_INSTANCE_NAME)

        return bool(settings.WHATSAPP_WEBHOOK_URL)

    return False


def get_channel_skip_reason(channel):
    if channel == "email":
        return "Brevo email credentials are not configured."

    if channel == "whatsapp" and not settings.WHATSAPP_ENABLED:
        return "WhatsApp notifications are disabled."

    if channel == "whatsapp" and settings.WHATSAPP_PROVIDER == "meta":
        return "Meta WhatsApp credentials are not configured."

    if channel == "whatsapp" and settings.WHATSAPP_PROVIDER == "evolution":
        return "Evolution API credentials are not configured."

    if channel == "whatsapp":
        return "WHATSAPP_WEBHOOK_URL is not configured."

    return "Notification channel is not configured."


def get_nested(data, *keys):
    current = data or {}
    for key in keys:
        if not isinstance(current, dict):
            return ""
        current = current.get(key, "")
    return str(current or "").strip()


def join_phone(country_code, number):
    country_digits = re.sub(r"\D+", "", str(country_code or ""))
    number_digits = re.sub(r"\D+", "", str(number or ""))

    if not country_digits:
        return number_digits

    if number_digits.startswith("0"):
        number_digits = number_digits[1:]

    return f"{country_digits}{number_digits}"


def normalize_email(value):
    email = str(value or "").strip()
    if not email or "@" not in email:
        return ""

    domain = email.rsplit("@", 1)[-1].lower()
    if domain in {"dbku.local", "fastrack.local", "example.test"}:
        return ""

    return email


def normalize_phone(value):
    digits = re.sub(r"\D+", "", str(value or ""))

    if not digits or len(digits) < 8:
        return ""

    if digits.startswith("0"):
        return f"60{digits[1:]}"

    return digits


def escape_html(value):
    return (
        str(value or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#x27;")
    )


def dedupe_values(values):
    seen = set()
    result = []

    for value in values:
        normalized = str(value or "").strip()
        key = normalized.lower()

        if not normalized or key in seen:
            continue

        seen.add(key)
        result.append(normalized)

    return result


def dedupe_recipients(recipients):
    seen = set()
    result = []

    for recipient in recipients:
        key = (
            recipient["channel"],
            recipient["recipient_role"],
            recipient["recipient"].lower(),
        )

        if key in seen:
            continue

        seen.add(key)
        result.append(recipient)

    return result
