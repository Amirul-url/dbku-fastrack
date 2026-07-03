from unittest.mock import patch

from django.test import SimpleTestCase, override_settings

from notifications.channels import (
    get_channel_skip_reason,
    get_notification_email_provider,
    is_channel_configured,
    prepare_email_delivery,
    send_email,
    send_whatsapp,
)


class NotificationChannelTests(SimpleTestCase):
    @override_settings(NOTIFICATION_EMAIL_PROVIDER="invalid")
    def test_invalid_email_provider_falls_back_to_smtp(self):
        self.assertEqual(get_notification_email_provider(), "smtp")

    @override_settings(NOTIFICATION_EMAIL_REDIRECT_TO="test@example.com")
    def test_prepare_email_delivery_redirects_test_email(self):
        recipient, subject, message = prepare_email_delivery(
            "real@example.com",
            "Subject",
            "Message",
        )

        self.assertEqual(recipient, "test@example.com")
        self.assertEqual(subject, "[fasTrack test] Subject")
        self.assertIn("Original recipient: real@example.com", message)

    @override_settings(
        NOTIFICATION_EMAIL_PROVIDER="smtp",
        NOTIFICATION_EMAIL_ENABLED=True,
        EMAIL_HOST="smtp.example.com",
        DEFAULT_FROM_EMAIL="noreply@dbku.gov.my",
    )
    def test_smtp_email_channel_is_configured(self):
        self.assertTrue(is_channel_configured("email"))

    @override_settings(
        NOTIFICATION_EMAIL_PROVIDER="brevo",
        NOTIFICATION_EMAIL_ENABLED=True,
        BREVO_API_KEY="secret",
        BREVO_FROM_EMAIL="sender@example.com",
    )
    def test_brevo_email_channel_is_configured(self):
        self.assertTrue(is_channel_configured("email"))

    @override_settings(WHATSAPP_ENABLED=False)
    def test_disabled_whatsapp_channel_has_clear_skip_reason(self):
        self.assertFalse(is_channel_configured("whatsapp"))
        self.assertEqual(
            get_channel_skip_reason("whatsapp"),
            "WhatsApp notifications are disabled.",
        )

    @override_settings(NOTIFICATION_EMAIL_PROVIDER="brevo")
    def test_send_email_routes_to_brevo_provider(self):
        with patch("notifications.channels.send_brevo_email") as send_brevo, patch(
            "notifications.channels.send_smtp_email"
        ) as send_smtp:
            send_email("user@example.com", "Subject", "Message")

        send_brevo.assert_called_once_with("user@example.com", "Subject", "Message")
        send_smtp.assert_not_called()

    @override_settings(WHATSAPP_PROVIDER="meta")
    def test_send_whatsapp_routes_to_meta_provider(self):
        with patch("notifications.channels.send_meta_whatsapp") as send_meta, patch(
            "notifications.channels.send_webhook_whatsapp"
        ) as send_webhook:
            send_whatsapp("60175151829", "Message")

        send_meta.assert_called_once_with("60175151829", "Message")
        send_webhook.assert_not_called()
