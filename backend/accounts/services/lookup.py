import re

from django.contrib.auth import get_user_model

from accounts.services.identity import normalize_mykad_identifier


User = get_user_model()

EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def normalize_phone_number(value):
    return re.sub(r"\D", "", str(value or ""))


def normalize_email_address(value):
    text = str(value or "").strip().lower()
    return "" if text == "-" else text


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


def format_whatsapp_recipient(value):
    digits = normalize_phone_number(value)

    if digits.startswith("60"):
        return digits

    if digits.startswith("0") and len(digits) > 1:
        return f"60{digits[1:]}"

    if digits.startswith("1"):
        return f"60{digits}"

    return digits


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


def find_user_by_mykad_identifier(identifier):
    raw_identifier = str(identifier or "").strip()
    if not raw_identifier:
        return None

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


def find_user_by_mobile_number(identifier):
    requested_numbers = phone_number_variants(identifier)
    if not requested_numbers:
        return None

    for user in User.objects.exclude(mobile_number=""):
        if phone_number_variants(user.mobile_number) & requested_numbers:
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

    return find_user_by_mykad_identifier(raw_identifier)
