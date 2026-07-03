from datetime import datetime

from django.test import SimpleTestCase, override_settings
from django.utils import timezone

from notifications.formatting import (
    dedupe_recipients,
    dedupe_values,
    escape_html,
    format_notification_datetime,
    get_nested,
    join_phone,
    normalize_email,
    normalize_phone,
    parse_license_datetime,
    subtract_calendar_months,
)


class NotificationFormattingTests(SimpleTestCase):
    def test_join_phone_removes_leading_zero_after_country_code(self):
        self.assertEqual(join_phone("+60", "017-515 1829"), "60175151829")

    def test_normalize_email_rejects_placeholder_domains(self):
        self.assertEqual(normalize_email(" User@Example.COM "), "User@Example.COM")
        self.assertEqual(normalize_email("user@dbku.local"), "")
        self.assertEqual(normalize_email("not-an-email"), "")

    def test_normalize_phone_formats_malaysian_mobile_numbers(self):
        self.assertEqual(normalize_phone("017-515 1829"), "60175151829")
        self.assertEqual(normalize_phone("175151829"), "60175151829")
        self.assertEqual(normalize_phone("60175151829"), "60175151829")
        self.assertEqual(normalize_phone("123"), "")

    def test_escape_html_escapes_notification_message_content(self):
        self.assertEqual(
            escape_html("<b>Tom & Jerry's</b>"),
            "&lt;b&gt;Tom &amp; Jerry&#x27;s&lt;/b&gt;",
        )

    def test_dedupe_values_keeps_first_case_variant(self):
        self.assertEqual(
            dedupe_values([" Admin@Sample.com ", "admin@sample.com", "", "Other"]),
            ["Admin@Sample.com", "Other"],
        )

    def test_dedupe_recipients_uses_channel_role_and_recipient(self):
        first = {
            "channel": "email",
            "recipient_role": "applicant",
            "recipient": "User@Sample.com",
        }
        duplicate = {
            "channel": "email",
            "recipient_role": "applicant",
            "recipient": "user@sample.com",
        }
        other_channel = {
            "channel": "whatsapp",
            "recipient_role": "applicant",
            "recipient": "user@sample.com",
        }

        self.assertEqual(dedupe_recipients([first, duplicate, other_channel]), [first, other_channel])

    def test_get_nested_returns_empty_string_for_missing_or_non_dict_path(self):
        self.assertEqual(get_nested({"a": {"b": " value "}}, "a", "b"), "value")
        self.assertEqual(get_nested({"a": "not dict"}, "a", "b"), "")

    def test_parse_license_datetime_accepts_date_and_datetime_strings(self):
        parsed_date = parse_license_datetime("2026-07-03")
        parsed_datetime = parse_license_datetime("2026-07-03T10:30:00+08:00")

        self.assertIsNotNone(parsed_date)
        self.assertIsNotNone(parsed_datetime)
        self.assertTrue(timezone.is_aware(parsed_date))
        self.assertTrue(timezone.is_aware(parsed_datetime))

    def test_subtract_calendar_months_clamps_to_last_day_of_month(self):
        value = timezone.make_aware(datetime(2026, 3, 31, 12, 0, 0))

        self.assertEqual(subtract_calendar_months(value, 1).day, 28)

    @override_settings(TIME_ZONE="Asia/Kuala_Lumpur", USE_TZ=True)
    def test_format_notification_datetime_uses_local_display_format(self):
        value = timezone.make_aware(datetime(2026, 7, 3, 10, 30, 0))

        self.assertEqual(format_notification_datetime(value), "03 Jul 2026, 10:30 AM")
        self.assertEqual(format_notification_datetime(None), "-")
