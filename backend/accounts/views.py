import json
import urllib.error
import urllib.parse
import urllib.request

from django.contrib.auth import authenticate, get_user_model
from django.conf import settings
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


def build_auth_response(user):
    refresh = RefreshToken.for_user(user)

    full_name = f"{user.first_name} {user.last_name}".strip()

    return {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "user": {
            "id": user.id,
            "username": user.username,
            "full_name": full_name,
            "email": user.email,
            "role": user.role,
        },
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


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me_view(request):
    user = request.user

    return Response({
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
            "is_staff": user.is_staff,
            "is_superuser": user.is_superuser,
        }
    })
