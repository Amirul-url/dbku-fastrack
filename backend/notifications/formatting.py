import re
from calendar import monthrange
from datetime import datetime, time

from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime


def get_nested(data, *keys):
    current = data or {}
    for key in keys:
        if not isinstance(current, dict):
            return ""
        current = current.get(key, "")
    return str(current or "").strip()


def parse_license_datetime(value):
    if not value:
        return None

    parsed = parse_datetime(str(value))
    if parsed is None:
        parsed_date = parse_date(str(value))
        if parsed_date is None:
            return None
        parsed = datetime.combine(parsed_date, time.min)

    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed, timezone.get_current_timezone())

    return parsed


def subtract_calendar_months(value, months):
    month_index = value.month - months
    year = value.year
    while month_index <= 0:
        month_index += 12
        year -= 1

    day = min(value.day, monthrange(year, month_index)[1])
    return value.replace(year=year, month=month_index, day=day)


def format_notification_datetime(value):
    if not value:
        return "-"

    local_value = timezone.localtime(value)
    return local_value.strftime("%d %b %Y, %I:%M %p")


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

    if digits.startswith("60"):
        return digits

    if digits.startswith("0"):
        return f"60{digits[1:]}"

    if digits.startswith("1") and len(digits) in {9, 10}:
        return f"60{digits}"

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
