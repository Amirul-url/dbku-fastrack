from unittest.mock import patch

from django.test import SimpleTestCase, TestCase, override_settings

from accounts.models import User
from accounts.services.password_reset import (
    build_password_reset_message,
    deliver_password_reset_otp,
    generate_password_reset_otp,
    get_password_reset_user,
    normalize_reset_channel,
    password_reset_cache_key,
)


class PasswordResetValueServiceTests(SimpleTestCase):
    def test_cache_key_and_channel_normalization(self):
        self.assertEqual(password_reset_cache_key(" User@Example.COM "), "password-reset:user@example.com")
        self.assertEqual(normalize_reset_channel(" Email "), "email")
        self.assertEqual(normalize_reset_channel("sms"), "")

    def test_generated_otp_is_six_digits(self):
        otp = generate_password_reset_otp()

        self.assertEqual(len(otp), 6)
        self.assertTrue(otp.isdigit())


class PasswordResetDeliveryServiceTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="900101131234",
            email="applicant@example.com",
            password="Password123",
            mobile_number="0175151829",
            first_name="Siti",
            last_name="Aminah",
            role="applicant",
        )

    def test_password_reset_user_can_be_found_by_email_or_whatsapp(self):
        self.assertEqual(get_password_reset_user("email", "applicant@example.com"), self.user)
        self.assertEqual(get_password_reset_user("whatsapp", "60175151829"), self.user)

    def test_builds_password_reset_message_with_normalized_name(self):
        message = build_password_reset_message(self.user, "123456")

        self.assertIn("Hello SITI AMINAH", message)
        self.assertIn("123456", message)

    @override_settings(NOTIFICATION_EMAIL_ENABLED=True)
    def test_deliver_password_reset_email_uses_notification_sender(self):
        with patch("notifications.services.is_channel_configured", return_value=True), patch(
            "notifications.services.send_email"
        ) as send_email:
            delivered, message = deliver_password_reset_otp(self.user, "email", "123456")

        self.assertTrue(delivered)
        self.assertEqual(message, "OTP sent to your registered email address.")
        send_email.assert_called_once()

    @override_settings(WHATSAPP_ENABLED=True)
    def test_deliver_password_reset_whatsapp_handles_disconnected_provider(self):
        with patch(
            "notifications.services.send_whatsapp",
            side_effect=RuntimeError("Connection Closed"),
        ):
            delivered, message = deliver_password_reset_otp(self.user, "whatsapp", "123456")

        self.assertFalse(delivered)
        self.assertIn("WhatsApp service is disconnected", message)
