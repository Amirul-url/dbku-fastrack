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


TECHNICAL_DEPARTMENTS = {"BLG", "GPM", "MNE", "IMT", "LNP", "ENG"}
IKL_DEPARTMENTS = {"IKL", "UNIT IKLAN"}
ADMIN_TECHNICAL_TASK_STATUSES = {
    "technical_review",
    "technical_site_visit",
    "technical_review_completed",
}


STATUS_MESSAGES = {
    "submitted": (
        "Application submitted",
        "Your application {reference} has been submitted successfully.",
        "New application {reference} has been submitted and is waiting for review.",
    ),
    "incomplete": (
        "Application rejected",
        "Your application {reference} was rejected by ALiS. Please review the remark below and update your application.",
        "",
    ),
    "rejected": (
        "Application rejected",
        "Your application {reference} has been rejected. Please review the remark below.",
        "",
    ),
    "invoice_generated": (
        "Payment proof required",
        "Invoice for application {reference} has been generated. Please upload your proof of payment.",
        "",
    ),
    "license_issued": (
        "QR e-license generated",
        "Your QR e-license for application {reference} has been generated successfully.",
        "",
    ),
    "technical_review": (
        "Technical task assigned",
        "",
        "Application {reference} is ready for your department technical review.",
    ),
    "technical_site_visit": (
        "Technical site visit assigned",
        "",
        "Application {reference} is ready for your department site visit review.",
    ),
    "technical_review_completed": (
        "Technical review updated",
        "",
        "Application {reference} has technical review updates for your department.",
    ),
}

STATUS_UI = {
    "submitted": ("submission", "success"),
    "incomplete": ("correction", "error"),
    "rejected": ("decision", "error"),
    "invoice_generated": ("payment", "warning"),
    "license_issued": ("license", "success"),
    "technical_review": ("technical", "warning"),
    "technical_site_visit": ("technical", "warning"),
    "technical_review_completed": ("technical", "info"),
}

APPLICANT_NOTIFICATION_STATUSES = {
    "submitted",
    "incomplete",
    "rejected",
    "invoice_generated",
    "license_issued",
}

ADMIN_NOTIFICATION_STATUSES = {"submitted", *ADMIN_TECHNICAL_TASK_STATUSES}

SUPERADMIN_NOTIFICATION_STATUSES = {"account_created"}

NOTIFIABLE_STATUSES = APPLICANT_NOTIFICATION_STATUSES | ADMIN_NOTIFICATION_STATUSES

REMARK_REPEAT_STATUSES = {
    "incomplete",
    "rejected",
}


def notify_application_status_change(application, old_status=None, old_remark=None):
    new_status = str(application.status or "").strip().lower()
    previous_status = str(old_status or "").strip().lower()
    current_remark = str(getattr(application, "latest_remark", "") or "").strip()
    previous_remark = str(old_remark or "").strip()
    status_changed = previous_status != new_status
    remark_changed = current_remark != previous_remark

    if new_status not in NOTIFIABLE_STATUSES:
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


def notify_account_created(account, created_by=None):
    if not getattr(account, "pk", None):
        return

    subject, message, metadata = build_account_created_message(account, created_by)
    event_key = f"account:{account.pk}:created"

    for user in get_superadmin_web_recipients():
        create_and_send_delivery(
            application=None,
            event_key=event_key,
            user=user,
            recipient_role="superadmin",
            channel="web",
            recipient=get_web_recipient(user),
            subject=subject,
            message=message,
            metadata=metadata,
        )


def build_account_created_message(account, created_by=None):
    role = normalize_account_role(getattr(account, "role", ""))
    account_name = normalize_account_name(account)
    username = str(getattr(account, "username", "") or "").strip()
    creator_name = normalize_account_name(created_by) if created_by else ""
    role_label = get_account_role_label(role)
    title = f"New {role_label} account created"
    body = f"{role_label} account {account_name} was created successfully."

    if creator_name:
        body = f"{body} Created by {creator_name}."

    subject = f"{APP_BRAND_NAME} - {title}"
    lines = [
        APP_BRAND_NAME,
        "",
        title,
        f"Name: {account_name}",
        f"Role: {role_label}",
    ]

    if username:
        lines.append(f"Login ID: {username}")

    if creator_name:
        lines.append(f"Created by: {creator_name}")

    lines.extend(["", body])

    metadata = {
        "category": "account",
        "type": "success",
        "title": title,
        "title_en": title,
        "message": body,
        "message_en": body,
        "recipient_role": "superadmin",
        "event_status": "account_created",
        "account_id": account.pk,
        "account_role": role,
        "account_name": account_name,
        "account_username": username,
        "action_url": "/superadmin/users" if role in {"applicant", "user"} else "/superadmin/admins",
    }

    return subject, "\n".join(lines), metadata


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
    fallback_label = get_notification_status_label(application)
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
    status_key = str(application.status or "").strip().lower()
    category, notification_type = STATUS_UI.get(status_key, ("progress", "info"))
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
        "event_status": status_key,
    }


def format_notification_message(title, body, application, recipient_role):
    lines = [
        APP_BRAND_NAME,
        "",
        title,
        f"Reference: {application.reference_no}",
        f"Status: {get_notification_status_label(application)}",
    ]

    if application.title:
        lines.append(f"Project: {application.title}")

    lines.extend(["", body])

    remark = get_message_remark(application)
    if remark:
        lines.extend(["", f"Remark: {remark}"])

    return "\n".join(lines)


def get_notification_status_label(application):
    status_key = str(application.status or "").strip().lower()

    if status_key == "incomplete":
        return "Rejected"

    return application.get_status_display()


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
    status_key = str(application.status or "").strip().lower()
    subject = messages["subject"]
    applicant_message = messages["applicant_message"]
    admin_message = messages["admin_message"]
    applicant_metadata = messages["applicant_metadata"]
    admin_metadata = messages["admin_metadata"]

    if status_key in APPLICANT_NOTIFICATION_STATUSES and application.applicant_id:
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

    if status_key not in ADMIN_NOTIFICATION_STATUSES:
        return dedupe_recipients(recipients)

    admin_users = get_admin_task_web_recipients(application)

    for user in admin_users:
        recipients.append({
            "user": user,
            "recipient_role": "admin",
            "channel": "web",
            "recipient": get_web_recipient(user),
            "subject": subject,
            "message": admin_message,
            "metadata": admin_metadata,
        })

    for user, email in get_admin_task_email_recipients(application, admin_users):
        recipients.append({
            "user": user,
            "recipient_role": "admin",
            "channel": "email",
            "recipient": email,
            "subject": subject,
            "message": admin_message,
            "metadata": admin_metadata,
        })

    for user, phone in get_admin_task_whatsapp_numbers(application, admin_users):
        recipients.append({
            "user": user,
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


def get_admin_task_web_recipients(application):
    User = get_user_model()
    status_key = str(getattr(application, "status", "") or "").strip().lower()
    users = User.objects.filter(role__in=["admin", "staff"], is_active=True)

    if status_key == "submitted":
        return [user for user in users if is_ikl_user(user)]

    if status_key in ADMIN_TECHNICAL_TASK_STATUSES:
        pending_departments = get_pending_technical_departments(application)
        return [
            user
            for user in users
            if normalize_department(getattr(user, "department", "")) in pending_departments
        ]

    return []


def get_admin_task_email_recipients(application, users):
    status_key = str(getattr(application, "status", "") or "").strip().lower()
    recipients = []

    for user in users:
        email = normalize_email(getattr(user, "email", ""))
        if email:
            recipients.append((user, email))

    if status_key == "submitted" and not recipients:
        for email in settings.NOTIFICATION_ADMIN_EMAILS:
            email = normalize_email(email)
            if email:
                recipients.append((None, email))

    return recipients


def get_admin_task_whatsapp_numbers(application, users):
    status_key = str(getattr(application, "status", "") or "").strip().lower()
    recipients = []

    for user in users:
        phone = normalize_phone(getattr(user, "mobile_number", ""))
        if phone:
            recipients.append((user, phone))

    if status_key == "submitted" and not recipients:
        recipients.extend((None, phone) for phone in get_admin_whatsapp_numbers())

    return recipients


def get_pending_technical_departments(application):
    reviews = get_technical_department_reviews(application)
    return {
        department
        for department in TECHNICAL_DEPARTMENTS
        if not isinstance(reviews.get(department), dict) or not reviews.get(department)
    }


def get_technical_department_reviews(application):
    form_data = getattr(application, "form_data", None) or {}
    reviews = form_data.get("technical_department_reviews") or {}
    if not isinstance(reviews, dict):
        return {}

    return {
        normalize_department(department): value
        for department, value in reviews.items()
        if normalize_department(department)
    }


def is_ikl_user(user):
    return normalize_department(getattr(user, "department", "")) == "IKL"


def normalize_department(value):
    department = str(value or "").strip().upper().replace("-", " ")
    department = " ".join(department.split())

    if department in IKL_DEPARTMENTS:
        return "IKL"

    if department == "INP":
        return "LNP"

    return department


def should_user_receive_admin_notification(user, application, status_key=None):
    status = str(status_key or getattr(application, "status", "") or "").strip().lower()
    department = normalize_department(getattr(user, "department", ""))

    if status == "submitted":
        return department == "IKL"

    if status in ADMIN_TECHNICAL_TASK_STATUSES:
        return department in get_pending_technical_departments(application)

    return False


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


def get_superadmin_web_recipients():
    User = get_user_model()
    return list(User.objects.filter(role="superadmin", is_active=True))


def get_web_recipient(user):
    return f"user:{user.id}"


def normalize_account_role(value):
    role = str(value or "").strip().lower()
    if role == "user":
        return "applicant"
    if role in {"superadmin", "admin", "staff", "applicant"}:
        return role
    return "account"


def get_account_role_label(role):
    if role in {"applicant", "user"}:
        return "USER"
    if role == "superadmin":
        return "SUPERADMIN"
    if role == "admin":
        return "ADMIN"
    if role == "staff":
        return "STAFF"
    return "ACCOUNT"


def normalize_account_name(user):
    if not user:
        return ""

    name = f"{getattr(user, 'first_name', '')} {getattr(user, 'last_name', '')}"
    normalized = " ".join(str(name or "").strip().upper().split())
    return normalized or str(getattr(user, "username", "") or "").strip().upper()


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
