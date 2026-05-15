from unittest.mock import patch

from django.test import TestCase, override_settings

from accounts.models import User
from applications.models import Application

from .models import NotificationDelivery
from .services import notify_application_status_change
from .services import send_brevo_email, send_webhook_whatsapp


class NotificationSenderDefaultsTests(TestCase):
    def setUp(self):
        User.objects.filter(role="superadmin").delete()
        self.superadmin = User.objects.create_user(
            username="superadmin",
            email="superadmin@example.com",
            password="Password123",
            mobile_number="012-345 6789",
            role="superadmin",
            is_active=True,
        )

    @override_settings(BREVO_FROM_EMAIL="fallback@example.com", BREVO_FROM_NAME="ALiS")
    def test_brevo_sender_uses_superadmin_email(self):
        with patch("notifications.services.post_json") as post_json:
            send_brevo_email("applicant@example.com", "Subject", "Message")

        payload = post_json.call_args.args[1]
        self.assertEqual(payload["sender"]["email"], "superadmin@example.com")

    @override_settings(WHATSAPP_WEBHOOK_URL="https://example.com/webhook", WHATSAPP_WEBHOOK_TOKEN="")
    def test_webhook_whatsapp_uses_superadmin_mobile_as_sender(self):
        with patch("notifications.services.post_json") as post_json:
            send_webhook_whatsapp("60198765432", "Message")

        payload = post_json.call_args.args[1]
        self.assertEqual(payload["from"], "60123456789")


@override_settings(
    NOTIFICATION_EMAIL_ENABLED=False,
    WHATSAPP_ENABLED=False,
    NOTIFICATION_ADMIN_EMAILS=["admin-notify@sample.com"],
    NOTIFICATION_ADMIN_WHATSAPP_NUMBERS=["60111111111"],
)
class NotificationRoutingTests(TestCase):
    def setUp(self):
        self.applicant = User.objects.create_user(
            username="applicant",
            email="applicant@sample.com",
            password="Password123",
            mobile_number="0175151829",
            role="applicant",
        )
        self.admin = User.objects.create_user(
            username="admin2",
            email="admin@sample.com",
            password="Password123",
            role="admin",
            is_active=True,
        )
        self.application = Application.objects.create(
            applicant=self.applicant,
            title="LED signage",
            status="draft",
            form_data={
                "step_2": {
                    "email": "applicant-form@sample.com",
                    "mobile_country_code": "60",
                    "mobile_no": "175151829",
                }
            },
        )

    def notify_status(self, status_key, old_status="draft"):
        NotificationDelivery.objects.all().delete()
        self.application.status = status_key
        self.application.save(update_fields=["status"])
        notify_application_status_change(self.application, old_status)

    def test_submitted_notifies_applicant_and_admin(self):
        self.notify_status("submitted")

        applicant_channels = set(
            NotificationDelivery.objects.filter(
                recipient_role="applicant",
                metadata__event_status="submitted",
            ).values_list("channel", flat=True)
        )
        admin_channels = set(
            NotificationDelivery.objects.filter(
                recipient_role="admin",
                metadata__event_status="submitted",
            ).values_list("channel", flat=True)
        )
        self.assertEqual(applicant_channels, {"web", "email", "whatsapp"})
        self.assertEqual(admin_channels, {"web", "email", "whatsapp"})

    def test_payment_request_notifies_applicant_only(self):
        self.notify_status("invoice_generated", old_status="approved")

        applicant_channels = set(
            NotificationDelivery.objects.filter(
                recipient_role="applicant",
                metadata__event_status="invoice_generated",
            ).values_list("channel", flat=True)
        )
        self.assertEqual(applicant_channels, {"web", "email", "whatsapp"})
        self.assertFalse(NotificationDelivery.objects.filter(recipient_role="admin").exists())

    def test_unlisted_status_does_not_create_notifications(self):
        self.notify_status("payment_verified", old_status="payment_submitted")

        self.assertFalse(NotificationDelivery.objects.exists())
