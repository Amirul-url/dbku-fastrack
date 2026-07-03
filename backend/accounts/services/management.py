from django.contrib.auth import get_user_model
from django.utils.dateparse import parse_date

from accounts.services.identity import (
    build_address_from_parts,
    clean_mobile_number,
    normalize_full_name,
    normalize_mykad_identifier,
    split_full_name,
)
from accounts.services.lookup import EMAIL_PATTERN, normalize_email_address


User = get_user_model()

MANAGED_ACCOUNT_ROLES = {"superadmin", "admin", "supervisor", "staff", "applicant"}


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
    mykad_number = normalize_mykad_identifier(data.get("mykad_number", username))
    user.mykad_number = "" if role == "superadmin" and mykad_number == username else mykad_number
    user.mobile_number = clean_mobile_number(data.get("mobile_number", user.mobile_number or ""))
    user.is_active = bool(data.get("is_active", True))

    if role in {"applicant", "user"}:
        user.gender = str(data.get("gender", user.gender or "")).strip()
        user.nationality = str(data.get("nationality", user.nationality or "")).strip()
        user.address_line1 = str(data.get("address_line1", user.address_line1 or "")).strip()
        user.address_line2 = str(data.get("address_line2", user.address_line2 or "")).strip()
        user.postcode = str(data.get("postcode", user.postcode or "")).strip()
        user.city = str(data.get("city", user.city or "")).strip()
        user.state = str(data.get("state", user.state or "")).strip()
        user.address = str(data.get("address", build_address_from_parts(data) or user.address or "")).strip()

        if "date_of_birth" in data:
            raw_date_of_birth = str(data.get("date_of_birth", "")).strip()
            user.date_of_birth = parse_date(raw_date_of_birth) if raw_date_of_birth else None

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
