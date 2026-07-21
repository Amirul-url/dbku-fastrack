import random

from django.conf import settings

from accounts.services.identity import normalize_full_name
from accounts.services.lookup import (
    find_user_by_normalized_email,
    format_whatsapp_recipient,
    phone_number_variants,
)
from notifications import message_templates as notify_messages


PASSWORD_RESET_TTL_SECONDS = 10 * 60
PASSWORD_RESET_TOKEN_TTL_SECONDS = 15 * 60
PASSWORD_RESET_MAX_ATTEMPTS = 5
PASSWORD_RESET_PURPOSE = "password_reset"


def password_reset_cache_key(identifier):
    return f"password-reset:{identifier.strip().lower()}"


def generate_password_reset_otp():
    return f"{random.SystemRandom().randint(0, 999999):06d}"


def normalize_reset_channel(value):
    channel = str(value or "").strip().lower()
    return channel if channel in {"email", "whatsapp"} else ""


def get_password_reset_user(channel, identifier):
    if channel == "email":
        return find_user_by_normalized_email(identifier)

    requested_numbers = phone_number_variants(identifier)
    if not requested_numbers:
        return None

    from django.contrib.auth import get_user_model

    User = get_user_model()
    for user in User.objects.exclude(mobile_number=""):
        if phone_number_variants(user.mobile_number) & requested_numbers:
            return user

    return None


def build_password_reset_message(user, otp):
    name = normalize_full_name(f"{user.first_name} {user.last_name}") or normalize_full_name(user.username)
    return notify_messages.PASSWORD_RESET_BODY_TEMPLATE.format(name=name, otp=otp)


def deliver_password_reset_otp(user, channel, otp):
    message = build_password_reset_message(user, otp)

    if channel == "email":
        if not user.email:
            return False, "This account does not have an email address saved."

        if getattr(settings, "NOTIFICATION_EMAIL_ENABLED", False):
            from notifications.services import is_channel_configured, send_email

            if not is_channel_configured("email"):
                return False, "Email OTP service is not configured right now. Please try WhatsApp or contact support."

            try:
                send_email(user.email, notify_messages.PASSWORD_RESET_SUBJECT, message)
            except Exception as exc:
                return False, f"Email OTP could not be sent right now. Please try again. ({exc})"
            return True, "OTP sent to your registered email address."

        return False, "Email OTP service is not configured right now. Please try WhatsApp or contact support."

    if channel == "whatsapp":
        if not user.mobile_number:
            return False, "This account does not have a WhatsApp/mobile number saved."

        if getattr(settings, "WHATSAPP_ENABLED", False):
            from notifications.services import send_whatsapp

            try:
                send_whatsapp(format_whatsapp_recipient(user.mobile_number), message)
            except Exception as exc:
                if "connection closed" in str(exc).lower():
                    return False, (
                        "WhatsApp OTP could not be sent because the WhatsApp service is disconnected. "
                        "Please reconnect the WhatsApp provider and try again."
                    )
                return False, "WhatsApp OTP could not be sent right now. Please try again."
            return True, "OTP sent to your registered WhatsApp number."

        return False, "WhatsApp OTP service is not configured right now. Please try email or contact support."

    return False, "Please choose whether to receive the OTP by email or WhatsApp."
