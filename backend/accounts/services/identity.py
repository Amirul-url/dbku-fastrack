import re
from datetime import date

from rest_framework_simplejwt.tokens import RefreshToken


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
        "notify_whatsapp": getattr(user, "notify_whatsapp", True),
        "notify_email": getattr(user, "notify_email", True),
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


def normalize_full_name(value):
    return " ".join(str(value or "").strip().upper().split())


def normalize_mykad_identifier(value):
    text = str(value or "").strip()
    digits = re.sub(r"\D", "", text)
    return digits if len(digits) == 12 else text


def clean_mobile_number(value):
    text = str(value or "").strip()
    return "" if text == "-" else text


def split_full_name(full_name):
    name_parts = normalize_full_name(full_name).split(" ", 1)
    return (
        name_parts[0] if name_parts else "",
        name_parts[1] if len(name_parts) > 1 else "",
    )
