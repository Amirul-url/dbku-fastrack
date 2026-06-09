import json
import random
import re
import urllib.error
import urllib.parse
import urllib.request

from django.contrib.auth import authenticate, get_user_model
from django.conf import settings
from datetime import date

from django.core.cache import cache
from django.core import signing
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from config.throttles import (
    LoginIdentifierRateThrottle,
    LoginIPRateThrottle,
    PasswordResetConfirmRateThrottle,
    PasswordResetRequestRateThrottle,
    PasswordResetVerifyRateThrottle,
    RegistrationRateThrottle,
)
from notifications.services import notify_account_created
from .models import LoginSession

User = get_user_model()

PASSWORD_RESET_TTL_SECONDS = 10 * 60
PASSWORD_RESET_TOKEN_TTL_SECONDS = 15 * 60
PASSWORD_RESET_MAX_ATTEMPTS = 5
PASSWORD_RESET_PURPOSE = "password_reset"
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
MANAGED_ACCOUNT_ROLES = {"superadmin", "admin", "supervisor", "staff", "applicant"}


class IsSuperAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == "superadmin"
        )


def verify_recaptcha(token, remote_ip=""):
    if not settings.RECAPTCHA_SECRET_KEY:
        return not settings.RECAPTCHA_REQUIRED, "reCAPTCHA is not configured."

    if not token:
        return False, "Please complete the reCAPTCHA verification."

    payload = {
        "secret": settings.RECAPTCHA_SECRET_KEY,
        "response": token,
    }

    if remote_ip:
        payload["remoteip"] = remote_ip

    request = urllib.request.Request(
        "https://www.google.com/recaptcha/api/siteverify",
        data=urllib.parse.urlencode(payload).encode("utf-8"),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            result = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, json.JSONDecodeError):
        return False, "Unable to verify reCAPTCHA. Please try again."

    if result.get("success"):
        return True, ""

    return False, "reCAPTCHA verification failed. Please try again."


def infer_date_of_birth_from_mykad(mykad_number):
    mykad_number = str(mykad_number or "").strip()
    if len(mykad_number) != 12 or not mykad_number.isdigit():
        return ""

    try:
        year = int(mykad_number[:2])
        month = int(mykad_number[2:4])
        day = int(mykad_number[4:6])
        century = 2000 if year <= date.today().year % 100 else 1900
        return date(century + year, month, day).isoformat()
    except ValueError:
        return ""


def infer_gender_from_mykad(mykad_number):
    mykad_number = str(mykad_number or "").strip()
    if len(mykad_number) != 12 or not mykad_number.isdigit():
        return ""
    return "male" if int(mykad_number[-1]) % 2 else "female"


def build_address_from_parts(data):
    return ", ".join(
        part
        for part in [
            str(data.get("address_line1", "")).strip(),
            str(data.get("address_line2", "")).strip(),
            str(data.get("postcode", "")).strip(),
            str(data.get("city", "")).strip(),
            str(data.get("state", "")).strip(),
        ]
        if part
    )


def get_user_address_parts(user):
    if any(
        [
            user.address_line1,
            user.address_line2,
            user.postcode,
            user.city,
            user.state,
        ]
    ):
        return {
            "address_line1": user.address_line1,
            "address_line2": user.address_line2,
            "postcode": user.postcode,
            "city": user.city,
            "state": user.state,
        }

    parts = [
        part.strip()
        for part in str(user.address or "").split(",")
        if part.strip()
    ]

    if len(parts) >= 5:
        return {
            "address_line1": parts[0],
            "address_line2": ", ".join(parts[1:-3]),
            "postcode": parts[-3],
            "city": parts[-2],
            "state": parts[-1],
        }

    return {
        "address_line1": user.address,
        "address_line2": "",
        "postcode": "",
        "city": "",
        "state": "",
    }


def build_login_session_payload(session):
    return {
        "id": session.id,
        "login_at": session.login_at.isoformat() if session.login_at else "",
        "logout_at": session.logout_at.isoformat() if session.logout_at else "",
        "duration_seconds": session.duration_seconds,
    }


def get_login_duration_seconds(login_at, logout_at):
    if not login_at:
        return 0

    return max(0, int((logout_at - login_at).total_seconds()))


def close_login_session(session, logout_at):
    session.logout_at = logout_at
    session.duration_seconds = get_login_duration_seconds(session.login_at, logout_at)
    session.save(update_fields=["logout_at", "duration_seconds"])


def close_open_login_sessions(user, logout_at):
    for session in LoginSession.objects.filter(user=user, logout_at__isnull=True):
        close_login_session(session, logout_at)


def build_user_payload(user, include_login_sessions=False):
    full_name = normalize_full_name(f"{user.first_name} {user.last_name}")
    mykad_number = user.mykad_number or user.username
    date_of_birth = user.date_of_birth
    if date_of_birth and hasattr(date_of_birth, "isoformat"):
        date_of_birth = date_of_birth.isoformat()
    else:
        date_of_birth = infer_date_of_birth_from_mykad(mykad_number)

    gender = user.gender or infer_gender_from_mykad(mykad_number)
    nationality = user.nationality or (
        "Malaysian" if user.role in {"applicant", "user"} else ""
    )
    address_parts = get_user_address_parts(user)

    payload = {
        "id": user.id,
        "username": user.username,
        "full_name": full_name,
        "email": user.email,
        "role": user.role,
        "department": user.department,
        "mykad_number": mykad_number,
        "mobile_number": clean_mobile_number(user.mobile_number),
        "address": user.address,
        **address_parts,
        "gender": gender,
        "date_of_birth": date_of_birth or "",
        "nationality": nationality,
        "is_staff": user.is_staff,
        "is_superuser": user.is_superuser,
        "is_active": user.is_active,
        "date_joined": user.date_joined.isoformat() if user.date_joined else "",
        "last_login": user.last_login.isoformat() if user.last_login else "",
    }

    if include_login_sessions:
        payload["login_sessions"] = [
            build_login_session_payload(session)
            for session in user.login_sessions.all()[:20]
        ]

    return payload


def build_auth_response(user, login_session=None):
    refresh = RefreshToken.for_user(user)

    return {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "user": build_user_payload(user),
        "login_session_id": login_session.id if login_session else None,
    }


def normalize_phone_number(value):
    return re.sub(r"\D", "", str(value or ""))


def normalize_email_address(value):
    text = str(value or "").strip().lower()
    return "" if text == "-" else text


def normalize_full_name(value):
    return " ".join(str(value or "").strip().upper().split())


def normalize_mykad_identifier(value):
    text = str(value or "").strip()
    digits = re.sub(r"\D", "", text)
    return digits if len(digits) == 12 else text


def clean_mobile_number(value):
    text = str(value or "").strip()
    return "" if text == "-" else text


def find_user_by_normalized_email(identifier):
    email = normalize_email_address(identifier)
    if not email:
        return None

    user = User.objects.filter(email__iexact=email).first()
    if user:
        return user

    for user in User.objects.exclude(email=""):
        if normalize_email_address(user.email) == email:
            return user

    return None


def find_user_for_login(identifier):
    raw_identifier = str(identifier or "").strip()
    if not raw_identifier:
        return None

    if EMAIL_PATTERN.match(raw_identifier):
        user = find_user_by_normalized_email(raw_identifier)
        if user:
            return user

    normalized_identifier = normalize_mykad_identifier(raw_identifier)
    user = (
        User.objects.filter(username=raw_identifier).first()
        or User.objects.filter(username=normalized_identifier).first()
        or User.objects.filter(mykad_number=raw_identifier).first()
        or User.objects.filter(mykad_number=normalized_identifier).first()
    )
    if user:
        return user

    for user in User.objects.all():
        if (
            normalize_mykad_identifier(user.username) == normalized_identifier
            or normalize_mykad_identifier(user.mykad_number) == normalized_identifier
        ):
            return user

    return None


def format_whatsapp_recipient(value):
    digits = normalize_phone_number(value)

    if digits.startswith("60"):
        return digits

    if digits.startswith("0") and len(digits) > 1:
        return f"60{digits[1:]}"

    if digits.startswith("1"):
        return f"60{digits}"

    return digits


def phone_number_variants(value):
    digits = normalize_phone_number(value)
    variants = {digits} if digits else set()

    if digits.startswith("60") and len(digits) > 2:
        variants.add(f"0{digits[2:]}")
        variants.add(digits[2:])
    elif digits.startswith("0") and len(digits) > 1:
        variants.add(f"60{digits[1:]}")
        variants.add(digits[1:])

    return {variant for variant in variants if variant}


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

    for user in User.objects.exclude(mobile_number=""):
        if phone_number_variants(user.mobile_number) & requested_numbers:
            return user

    return None


def build_password_reset_message(user, otp):
    name = normalize_full_name(f"{user.first_name} {user.last_name}") or normalize_full_name(user.username)
    return (
        f"Hello {name},\n\n"
        f"Your ALiS password reset OTP is {otp}.\n"
        "This OTP will expire in 10 minutes. If you did not request this, please ignore this message."
    )


def deliver_password_reset_otp(user, channel, otp):
    message = build_password_reset_message(user, otp)

    if channel == "email":
        if not user.email:
            return False, "This account does not have an email address saved."

        if getattr(settings, "NOTIFICATION_EMAIL_ENABLED", False) and settings.BREVO_API_KEY:
            from notifications.services import send_email

            try:
                send_email(user.email, "ALiS Password Reset OTP", message)
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


def friendly_password_validation(password, password2):
    if not password:
        return "Please enter your new password."

    if not password2:
        return "Please confirm your new password."

    if password != password2:
        return "New Password and Confirm Password do not match."

    if len(password) < 8:
        return "Password must be at least 8 characters long."

    return ""


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([RegistrationRateThrottle])
def register_view(request):
    data = request.data

    username = normalize_mykad_identifier(data.get("username", ""))
    email = normalize_email_address(data.get("email", ""))
    password = data.get("password", "")
    password2 = data.get("password2", "")

    full_name = normalize_full_name(data.get("full_name", ""))
    role = str(data.get("role", "applicant")).strip().lower()

    allowed_public_roles = ["applicant", "user"]

    if role not in allowed_public_roles:
        return Response(
            {"error": "Public registration is only allowed for user accounts."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not username:
        return Response(
            {"error": "Username is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not email:
        return Response(
            {"error": "Email is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not password:
        return Response(
            {"error": "Password is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if password != password2:
        return Response(
            {"error": "Password and Retype Password do not match."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if settings.RECAPTCHA_REQUIRED or settings.RECAPTCHA_SECRET_KEY:
        recaptcha_token = str(data.get("recaptcha_token", "")).strip()
        recaptcha_valid, recaptcha_error = verify_recaptcha(
            recaptcha_token,
            request.META.get("REMOTE_ADDR", ""),
        )

        if not recaptcha_valid:
            return Response(
                {"error": recaptcha_error},
                status=status.HTTP_400_BAD_REQUEST,
            )

    if User.objects.filter(username=username).exists():
        return Response(
            {"error": "Username already exists."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if User.objects.filter(email=email).exists():
        return Response(
            {"error": "Email already exists."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = User.objects.create_user(
        username=username,
        email=email,
        password=password,
    )

    user.role = "applicant"
    user.mykad_number = normalize_mykad_identifier(data.get("mykad_number", username))
    user.mobile_number = clean_mobile_number(data.get("mobile_number", ""))
    user.address_line1 = str(data.get("address_line1", "")).strip()
    user.address_line2 = str(data.get("address_line2", "")).strip()
    user.postcode = str(data.get("postcode", "")).strip()
    user.city = str(data.get("city", "")).strip()
    user.state = str(data.get("state", "")).strip()
    user.address = build_address_from_parts(data) or str(data.get("address", "")).strip()
    user.gender = str(data.get("gender", "")).strip()
    user.nationality = str(data.get("nationality", "")).strip()

    date_of_birth = str(data.get("date_of_birth", "")).strip()
    if date_of_birth:
        user.date_of_birth = parse_date(date_of_birth)

    if full_name:
        user.first_name, user.last_name = split_full_name(full_name)

    user.save()
    notify_account_created(user)

    return Response(build_auth_response(user), status=status.HTTP_201_CREATED)


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([LoginIPRateThrottle, LoginIdentifierRateThrottle])
def login_view(request):
    username = str(request.data.get("username", "")).strip()
    password = request.data.get("password", "")

    login_user = find_user_for_login(username)
    auth_username = login_user.username if login_user else username
    user = authenticate(username=auth_username, password=password)

    if user is None:
        return Response(
            {"error": "Invalid credentials"},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    now = timezone.now()
    close_open_login_sessions(user, now)
    login_session = LoginSession.objects.create(user=user, login_at=now)
    user.last_login = now
    user.save(update_fields=["last_login"])

    return Response(build_auth_response(user, login_session), status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_view(request):
    session_id = request.data.get("login_session_id")
    session = None

    if session_id:
        session = LoginSession.objects.filter(
            pk=session_id,
            user=request.user,
            logout_at__isnull=True,
        ).first()

    if not session:
        session = LoginSession.objects.filter(
            user=request.user,
            logout_at__isnull=True,
        ).order_by("-login_at").first()

    if session:
        logout_at = timezone.now()
        close_login_session(session, logout_at)

    return Response({"message": "Logged out."}, status=status.HTTP_200_OK)


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([PasswordResetRequestRateThrottle])
def password_reset_request_view(request):
    channel = normalize_reset_channel(request.data.get("channel"))
    raw_identifier = request.data.get("identifier", request.data.get("email", ""))
    identifier = str(raw_identifier).strip().lower() if channel == "email" else normalize_phone_number(raw_identifier)

    if not channel:
        return Response(
            {"error": "Please choose email or WhatsApp to receive your OTP."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not identifier:
        return Response(
            {"error": "Please enter your registered email address." if channel == "email" else "Please enter your registered WhatsApp/mobile number."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if channel == "email" and not EMAIL_PATTERN.match(identifier):
        return Response(
            {"error": "Please enter a valid email address."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if channel == "whatsapp" and len(identifier) < 8:
        return Response(
            {"error": "Please enter a valid WhatsApp/mobile number."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = get_password_reset_user(channel, identifier)
    if not user:
        if channel == "whatsapp":
            error_message = "We could not find an ALiS account with that WhatsApp number."
        else:
            error_message = "We could not find an ALiS account with that email address."

        return Response(
            {"error": error_message},
            status=status.HTTP_404_NOT_FOUND,
        )

    otp = generate_password_reset_otp()
    try:
        delivered, delivery_message = deliver_password_reset_otp(user, channel, otp)
    except Exception:
        delivered = False
        delivery_message = "We could not send the OTP right now. Please try again in a moment."

    if not delivered:
        return Response(
            {"error": delivery_message},
            status=status.HTTP_400_BAD_REQUEST,
        )

    cache.set(
        password_reset_cache_key(identifier),
        {
            "user_id": user.id,
            "identifier": identifier,
            "otp": otp,
            "channel": channel,
            "attempts": 0,
            "verified": False,
        },
        PASSWORD_RESET_TTL_SECONDS,
    )

    response = {
        "message": delivery_message,
        "reset_id": identifier,
        "expires_in": PASSWORD_RESET_TTL_SECONDS,
    }

    return Response(response, status=status.HTTP_200_OK)


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([PasswordResetVerifyRateThrottle])
def password_reset_verify_view(request):
    identifier = str(request.data.get("identifier", request.data.get("email", ""))).strip().lower()
    otp = re.sub(r"\D", "", str(request.data.get("otp", "")))

    if not identifier:
        return Response(
            {"error": "Please enter the email or WhatsApp number used to request the OTP."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if len(otp) != 6:
        return Response(
            {"error": "Please enter the 6-digit OTP sent to you."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    cache_key = password_reset_cache_key(identifier)
    payload = cache.get(cache_key)

    if not payload:
        return Response(
            {"error": "Your OTP has expired. Please request a new OTP."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    attempts = int(payload.get("attempts", 0))
    if attempts >= PASSWORD_RESET_MAX_ATTEMPTS:
        cache.delete(cache_key)
        return Response(
            {"error": "Too many incorrect OTP attempts. Please request a new OTP."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if otp != payload.get("otp"):
        payload["attempts"] = attempts + 1
        cache.set(cache_key, payload, PASSWORD_RESET_TTL_SECONDS)
        remaining = max(PASSWORD_RESET_MAX_ATTEMPTS - payload["attempts"], 0)
        return Response(
            {"error": f"The OTP is incorrect. You have {remaining} attempt(s) left."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    token = signing.dumps(
        {
            "user_id": payload.get("user_id"),
            "identifier": identifier,
            "purpose": PASSWORD_RESET_PURPOSE,
        },
        salt=PASSWORD_RESET_PURPOSE,
    )
    payload["verified"] = True
    payload["reset_token"] = token
    cache.set(cache_key, payload, PASSWORD_RESET_TOKEN_TTL_SECONDS)

    return Response(
        {
            "message": "OTP verified. You can now create a new password.",
            "reset_token": token,
            "expires_in": PASSWORD_RESET_TOKEN_TTL_SECONDS,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([PasswordResetConfirmRateThrottle])
def password_reset_confirm_view(request):
    token = str(request.data.get("reset_token", "")).strip()
    password = request.data.get("password", "")
    password2 = request.data.get("password2", "")
    validation_error = friendly_password_validation(password, password2)

    if validation_error:
        return Response(
            {"error": validation_error},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not token:
        return Response(
            {"error": "Password reset session is missing. Please verify your OTP again."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        payload = signing.loads(
            token,
            salt=PASSWORD_RESET_PURPOSE,
            max_age=PASSWORD_RESET_TOKEN_TTL_SECONDS,
        )
    except signing.SignatureExpired:
        return Response(
            {"error": "Your password reset session has expired. Please request a new OTP."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    except signing.BadSignature:
        return Response(
            {"error": "This password reset link is no longer valid. Please request a new OTP."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if payload.get("purpose") != PASSWORD_RESET_PURPOSE:
        return Response(
            {"error": "This password reset session is invalid. Please request a new OTP."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    identifier = str(payload.get("identifier", payload.get("email", ""))).strip().lower()
    cache_payload = cache.get(password_reset_cache_key(identifier))
    if not cache_payload or cache_payload.get("reset_token") != token:
        return Response(
            {"error": "Please verify your OTP before setting a new password."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = User.objects.filter(pk=payload.get("user_id")).first()
    if not user:
        return Response(
            {"error": "We could not find the account for this reset request."},
            status=status.HTTP_404_NOT_FOUND,
        )

    user.set_password(password)
    user.save(update_fields=["password"])
    cache.delete(password_reset_cache_key(identifier))

    return Response(
        {"message": "Password reset successful. Please login with your new password."},
        status=status.HTTP_200_OK,
    )


def split_full_name(full_name):
    name_parts = normalize_full_name(full_name).split(" ", 1)
    return (
        name_parts[0] if name_parts else "",
        name_parts[1] if len(name_parts) > 1 else "",
    )


def normalize_managed_role(value):
    role = str(value or "").strip().lower()
    if role == "user":
        return "applicant"
    return role


def apply_managed_account_data(user, data, require_password=False):
    username = normalize_mykad_identifier(data.get("username", user.username or ""))
    email = normalize_email_address(data.get("email", user.email or ""))
    full_name = normalize_full_name(data.get("full_name", ""))
    role = normalize_managed_role(data.get("role", user.role))
    password = data.get("password", "")
    password2 = data.get("password2", password)

    if not username:
        return "Username is required."

    if not full_name:
        return "Full name is required."

    if role not in MANAGED_ACCOUNT_ROLES:
        return "SuperAdmin can only manage user, admin, and supervisor accounts."

    if email and not EMAIL_PATTERN.match(email):
        return "Please enter a valid email address."

    if require_password and not password:
        return "Password is required."

    if password or password2:
        if password != password2:
            return "Password and Confirm Password do not match."
        if len(password) < 8:
            return "Password must be at least 8 characters long."

    duplicate_username = User.objects.exclude(pk=user.pk).filter(username=username).exists()
    if duplicate_username:
        return "Username already exists."

    if email and User.objects.exclude(pk=user.pk).filter(email__iexact=email).exists():
        return "Email already exists."

    first_name, last_name = split_full_name(full_name)
    user.username = username
    user.email = email
    user.first_name = first_name
    user.last_name = last_name
    user.role = role
    user.department = str(data.get("department", user.department or "")).strip().upper()
    user.mykad_number = normalize_mykad_identifier(data.get("mykad_number", username))
    user.mobile_number = clean_mobile_number(data.get("mobile_number", user.mobile_number or ""))
    user.is_active = bool(data.get("is_active", True))

    if role == "superadmin":
        user.is_staff = True
        user.is_superuser = True
    elif role in {"admin", "supervisor", "staff"}:
        user.is_staff = True
        user.is_superuser = False
    else:
        user.is_staff = False
        user.is_superuser = False

    if password:
        user.set_password(password)

    return ""


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsSuperAdmin])
def managed_accounts_view(request):
    if request.method == "GET":
        role_filter = str(request.query_params.get("role", "")).strip().lower()
        search = str(request.query_params.get("search", "")).strip()
        queryset = User.objects.all().order_by("first_name", "username")

        if role_filter in {"applicant", "user"}:
            queryset = queryset.filter(role__in=["applicant", "user"])
        elif role_filter == "admin":
            queryset = queryset.filter(role__in=["admin", "staff"])
        elif role_filter == "superadmin":
            queryset = queryset.filter(role="superadmin")
        elif role_filter == "supervisor":
            queryset = queryset.filter(role="supervisor")

        if search:
            search_query = (
                Q(username__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(email__icontains=search)
                | Q(department__icontains=search)
                | Q(mobile_number__icontains=search)
            )
            search_digits = normalize_phone_number(search)
            if search_digits:
                local_digits = search_digits[2:] if search_digits.startswith("60") else search_digits
                local_with_zero = local_digits if local_digits.startswith("0") else f"0{local_digits}"
                local_without_zero = local_digits[1:] if local_digits.startswith("0") else local_digits
                country_digits = f"60{local_without_zero}"

                for phone_variant in {search_digits, local_digits, local_with_zero, local_without_zero, country_digits}:
                    search_query |= Q(mobile_number__icontains=phone_variant)

            queryset = queryset.filter(search_query).order_by("first_name", "username")

        return Response(
            {
                "accounts": [
                    build_user_payload(user, include_login_sessions=True)
                    for user in queryset.prefetch_related("login_sessions")
                ],
                "summary": {
                    "users": User.objects.filter(role__in=["applicant", "user"]).count(),
                    "admins": User.objects.filter(role__in=["superadmin", "admin", "staff"]).count(),
                    "supervisors": User.objects.filter(role="supervisor").count(),
                    "active": User.objects.filter(is_active=True).count(),
                },
            }
        )

    user = User()
    error = apply_managed_account_data(user, request.data, require_password=True)
    if error:
        return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)

    user.save()
    notify_account_created(user, created_by=request.user)
    return Response({"account": build_user_payload(user)}, status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated, IsSuperAdmin])
def managed_account_detail_view(request, user_id):
    account = User.objects.filter(pk=user_id).first()

    if not account:
        return Response(
            {"error": "Account not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    if request.method == "DELETE":
        if account.pk == request.user.pk:
            return Response(
                {"error": "You cannot delete your own superadmin account."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        account.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    error = apply_managed_account_data(account, request.data)
    if error:
        return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)

    account.save()
    return Response({"account": build_user_payload(account)})


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def me_view(request):
    user = request.user

    if request.method == "PATCH":
        data = request.data
        full_name = normalize_full_name(data.get("full_name", ""))
        email = str(data.get("email", "")).strip()
        mykad_number = str(data.get("mykad_number", "")).strip()

        if not full_name:
            return Response(
                {"error": "Full name is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not email:
            return Response(
                {"error": "Email is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not mykad_number:
            return Response(
                {"error": "MyKad Number is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if (
            User.objects.exclude(pk=user.pk)
            .filter(email__iexact=email)
            .exists()
        ):
            return Response(
                {"error": "Email already exists."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if (
            User.objects.exclude(pk=user.pk)
            .filter(username=mykad_number)
            .exists()
        ):
            return Response(
                {"error": "Username already exists."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.first_name, user.last_name = split_full_name(full_name)
        user.email = email
        user.username = mykad_number
        user.mykad_number = mykad_number
        user.mobile_number = clean_mobile_number(data.get("mobile_number", ""))
        user.address_line1 = str(data.get("address_line1", "")).strip()
        user.address_line2 = str(data.get("address_line2", "")).strip()
        user.postcode = str(data.get("postcode", "")).strip()
        user.city = str(data.get("city", "")).strip()
        user.state = str(data.get("state", "")).strip()
        user.address = build_address_from_parts(data) or str(data.get("address", "")).strip()
        user.gender = str(data.get("gender", "")).strip()
        date_of_birth = str(data.get("date_of_birth", "")).strip()
        user.date_of_birth = parse_date(date_of_birth) if date_of_birth else None
        user.nationality = str(data.get("nationality", "")).strip()

        password = data.get("password", "")
        password2 = data.get("password2", "")
        if password or password2:
            if password != password2:
                return Response(
                    {"error": "Password and Retype Password do not match."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            user.set_password(password)

        user.save()

    return Response({"user": build_user_payload(user)})
