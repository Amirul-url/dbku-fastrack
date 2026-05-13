import json
import urllib.error
import urllib.parse
import urllib.request

from django.contrib.auth import authenticate, get_user_model
from django.conf import settings
from datetime import date

from django.utils.dateparse import parse_date
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()


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
