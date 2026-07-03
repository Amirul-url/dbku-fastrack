import json
import urllib.error
import urllib.request

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import EmailMultiAlternatives

from notifications.formatting import escape_html, normalize_email, normalize_phone


def get_default_superadmin():
    User = get_user_model()
    return (
        User.objects.filter(role="superadmin", is_active=True)
        .order_by("id")
        .first()
    )


def get_notification_sender_email():
    return normalize_email(getattr(settings, "DEFAULT_FROM_EMAIL", ""))


def get_brevo_sender_email():
    return normalize_email(getattr(settings, "BREVO_FROM_EMAIL", ""))


def get_notification_email_provider():
    provider = str(getattr(settings, "NOTIFICATION_EMAIL_PROVIDER", "smtp") or "").strip().lower()
    if provider in {"brevo", "smtp"}:
        return provider
    return "smtp"


def get_notification_sender_phone():
    superadmin = get_default_superadmin()
    return normalize_phone(getattr(superadmin, "mobile_number", ""))


def send_email(recipient, subject, message):
    actual_recipient, actual_subject, actual_message = prepare_email_delivery(
        recipient,
        subject,
        message,
    )

    if get_notification_email_provider() == "brevo":
        send_brevo_email(actual_recipient, actual_subject, actual_message)
        return

    send_smtp_email(actual_recipient, actual_subject, actual_message)


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


def send_smtp_email(recipient, subject, message):
    html_message = "<br>".join(escape_html(message).splitlines())
    email = EmailMultiAlternatives(
        subject=subject,
        body=message,
        from_email=get_notification_sender_email(),
        to=[recipient],
    )
    email.attach_alternative(f"<p>{html_message}</p>", "text/html")
    email.send(fail_silently=False)


def send_brevo_email(recipient, subject, message):
    html_message = "<br>".join(escape_html(message).splitlines())
    payload = {
        "sender": {
            "name": settings.BREVO_FROM_NAME,
            "email": get_brevo_sender_email(),
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
        if get_notification_email_provider() == "brevo":
            return bool(
                settings.NOTIFICATION_EMAIL_ENABLED
                and settings.BREVO_API_KEY
                and get_brevo_sender_email()
            )

        return bool(
            settings.NOTIFICATION_EMAIL_ENABLED
            and settings.EMAIL_HOST
            and get_notification_sender_email()
        )

    if channel == "whatsapp":
        if not settings.WHATSAPP_ENABLED:
            return False

        if settings.WHATSAPP_PROVIDER == "meta":
            return bool(
                settings.WHATSAPP_META_PHONE_NUMBER_ID
                and settings.WHATSAPP_META_ACCESS_TOKEN
            )

        if settings.WHATSAPP_PROVIDER == "evolution":
            return bool(
                settings.EVOLUTION_API_URL
                and settings.EVOLUTION_API_KEY
                and settings.EVOLUTION_INSTANCE_NAME
            )

        return bool(settings.WHATSAPP_WEBHOOK_URL)

    return False


def get_channel_skip_reason(channel):
    if channel == "email":
        if get_notification_email_provider() == "brevo":
            return "Brevo email credentials are not configured."

        return "SMTP email service is not configured."

    if channel == "whatsapp" and not settings.WHATSAPP_ENABLED:
        return "WhatsApp notifications are disabled."

    if channel == "whatsapp" and settings.WHATSAPP_PROVIDER == "meta":
        return "Meta WhatsApp credentials are not configured."

    if channel == "whatsapp" and settings.WHATSAPP_PROVIDER == "evolution":
        return "Evolution API credentials are not configured."

    if channel == "whatsapp":
        return "WHATSAPP_WEBHOOK_URL is not configured."

    return "Notification channel is not configured."
