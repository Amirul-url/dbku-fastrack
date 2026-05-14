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
from django.utils.dateparse import parse_date
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()

PASSWORD_RESET_TTL_SECONDS = 10 * 60
PASSWORD_RESET_TOKEN_TTL_SECONDS = 15 * 60
PASSWORD_RESET_MAX_ATTEMPTS = 5
PASSWORD_RESET_PURPOSE = "password_reset"
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


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


def build_user_payload(user):
    full_name = f"{user.first_name} {user.last_name}".strip()
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

    return {
        "id": user.id,
        "username": user.username,
        "full_name": full_name,
        "email": user.email,
        "role": user.role,
        "mykad_number": mykad_number,
        "mobile_number": user.mobile_number,
        "address": user.address,
        **address_parts,
        "gender": gender,
        "date_of_birth": date_of_birth or "",
        "nationality": nationality,
        "is_staff": user.is_staff,
        "is_superuser": user.is_superuser,
    }


def build_auth_response(user):
    refresh = RefreshToken.for_user(user)

    return {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "user": build_user_payload(user),
    }


def normalize_phone_number(value):
    return re.sub(r"\D", "", str(value or ""))


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
        return User.objects.filter(email__iexact=identifier).first()

    requested_numbers = phone_number_variants(identifier)
    if not requested_numbers:
        return None

    for user in User.objects.exclude(mobile_number=""):
        if phone_number_variants(user.mobile_number) & requested_numbers:
            return user

    return None


def build_password_reset_message(user, otp):
    name = f"{user.first_name} {user.last_name}".strip() or user.username
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
            except Exception:
                if settings.DEBUG:
                    return True, "OTP prepared for your registered email address."
                raise
            return True, "OTP sent to your registered email address."

        if settings.DEBUG:
            return True, "OTP prepared for your registered email address."

        return False, "Email OTP service is not available right now. Please try WhatsApp or contact support."

    if channel == "whatsapp":
        if not user.mobile_number:
            return False, "This account does not have a WhatsApp/mobile number saved."

        if getattr(settings, "WHATSAPP_ENABLED", False):
            from notifications.services import send_whatsapp

            try:
                send_whatsapp(user.mobile_number, message)
            except Exception:
                if settings.DEBUG:
                    return True, "OTP prepared for your registered WhatsApp number."
                raise
            return True, "OTP sent to your registered WhatsApp number."

        if settings.DEBUG:
            return True, "OTP prepared for your registered WhatsApp number."

        return False, "WhatsApp OTP service is not available right now. Please try email or contact support."

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
def register_view(request):
    data = request.data

    username = str(data.get("username", "")).strip()
    email = str(data.get("email", "")).strip()
    password = data.get("password", "")
    password2 = data.get("password2", "")

    full_name = str(data.get("full_name", "")).strip()
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
    user.mykad_number = str(data.get("mykad_number", username)).strip()
    user.mobile_number = str(data.get("mobile_number", "")).strip()
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
        name_parts = full_name.split(" ", 1)
        user.first_name = name_parts[0]
        user.last_name = name_parts[1] if len(name_parts) > 1 else ""

    user.save()

    return Response(build_auth_response(user), status=status.HTTP_201_CREATED)


@api_view(["POST"])
def login_view(request):
    username = str(request.data.get("username", "")).strip()
    password = request.data.get("password", "")

    user = authenticate(username=username, password=password)

    if user is None:
        return Response(
            {"error": "Invalid credentials"},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    return Response(build_auth_response(user), status=status.HTTP_200_OK)


@api_view(["POST"])
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

    if settings.DEBUG:
        response["debug_otp"] = otp

    return Response(response, status=status.HTTP_200_OK)


@api_view(["POST"])
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


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def me_view(request):
    user = request.user

    if request.method == "PATCH":
        data = request.data
        full_name = str(data.get("full_name", "")).strip()
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

        name_parts = full_name.split(" ", 1)
        user.first_name = name_parts[0]
        user.last_name = name_parts[1] if len(name_parts) > 1 else ""
        user.email = email
        user.username = mykad_number
        user.mykad_number = mykad_number
        user.mobile_number = str(data.get("mobile_number", "")).strip()
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
