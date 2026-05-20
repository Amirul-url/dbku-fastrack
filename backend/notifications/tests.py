from unittest.mock import patch

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import User
from applications.models import Application

from .models import NotificationDelivery
from .services import notify_account_created, notify_application_status_change
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
            department="PT(IKL)",
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

    def test_payment_verified_notifies_pt_ikl_for_license_generation(self):
        self.notify_status("payment_verified", old_status="payment_submitted")

        delivery = NotificationDelivery.objects.get(
            channel="web",
            recipient_role="admin",
            metadata__event_status="payment_verified",
        )
        self.assertEqual(delivery.user, self.admin)
        self.assertIn("License issuance", delivery.metadata["title_en"])

    def test_final_approval_notifies_pt_ikl_for_billing(self):
        self.notify_status("approved", old_status="management_review")

        delivery = NotificationDelivery.objects.get(
            channel="web",
            recipient_role="admin",
            metadata__event_status="approved",
        )
        self.assertEqual(delivery.user, self.admin)
        self.assertIn("Final approval", delivery.metadata["title_en"])

    def test_generated_bill_notifies_ku_ikl_for_confirmation(self):
        ku_user = User.objects.create_user(
            username="ku-ikl",
            email="",
            password="Password123",
            role="admin",
            department="KU(IKL)",
            is_active=True,
        )

        self.notify_status("bill_pending_ku", old_status="approved")

        delivery = NotificationDelivery.objects.get(
            channel="web",
            recipient_role="admin",
            metadata__event_status="bill_pending_ku",
        )
        self.assertEqual(delivery.user, ku_user)
        self.assertIn("Bill confirmation", delivery.metadata["title_en"])

    def test_management_review_notifies_kb_les_with_fallback_contacts(self):
        kb_user = User.objects.create_user(
            username="kb-les",
            email="",
            password="Password123",
            mobile_number="",
            role="supervisor",
            department="KB(LES)",
            is_active=True,
        )
        self.application.form_data = {
            **self.application.form_data,
            "kb_les_verification": {"status": "Pending KB(LES) Support"},
        }
        self.application.save(update_fields=["form_data"])

        self.notify_status("management_review")

        deliveries = NotificationDelivery.objects.filter(
            recipient_role="admin",
            metadata__event_status="management_review",
        )
        self.assertEqual(
            set(deliveries.values_list("channel", flat=True)),
            {"web", "email", "whatsapp"},
        )
        self.assertTrue(deliveries.filter(channel="web", user=kb_user).exists())
        self.assertTrue(
            deliveries.filter(
                channel="email",
                recipient="admin-notify@sample.com",
            ).exists()
        )
        self.assertTrue(
            deliveries.filter(
                channel="whatsapp",
                recipient="60111111111",
            ).exists()
        )

    def test_management_review_notifies_tp_pgh_after_kb_les_support(self):
        tp_user = User.objects.create_user(
            username="tp-res",
            email="",
            password="Password123",
            mobile_number="",
            role="supervisor",
            department="TP(RES)",
            is_active=True,
        )
        User.objects.create_user(
            username="kb-les",
            email="",
            password="Password123",
            mobile_number="",
            role="supervisor",
            department="KB(LES)",
            is_active=True,
        )
        self.application.form_data = {
            **self.application.form_data,
            "kb_les_verification": {"status": "Supported"},
            "management_recommendation": {"status": "Pending TP(RES)/PGH Approval"},
        }
        self.application.save(update_fields=["form_data"])

        self.notify_status("management_review")

        deliveries = NotificationDelivery.objects.filter(
            channel="web",
            recipient_role="admin",
            metadata__event_status="management_review",
        )
        self.assertTrue(deliveries.filter(user=tp_user).exists())
        delivery = deliveries.get(user=tp_user)
        self.assertIn("TP(RES)/PGH approval", delivery.metadata["title_en"])
        self.assertIn("TP(RES)/PGH final approval", delivery.metadata["message_en"])
        self.assertNotIn("KB(LES) support", delivery.metadata["title_en"])

    def test_management_review_same_status_reroute_notifies_tp_pgh(self):
        tp_user = User.objects.create_user(
            username="tp-res-reroute",
            email="",
            password="Password123",
            mobile_number="",
            role="supervisor",
            department="TP(RES)",
            is_active=True,
        )
        old_form_data = {
            **self.application.form_data,
            "kb_les_verification": {"status": "Pending KB(LES) Support"},
        }
        self.application.status = "management_review"
        self.application.form_data = {
            **self.application.form_data,
            "kb_les_verification": {"status": "Supported"},
            "management_recommendation": {"status": "Pending TP(RES)/PGH Approval"},
        }
        self.application.save(update_fields=["status", "form_data"])

        notify_application_status_change(
            self.application,
            old_status="management_review",
            old_form_data=old_form_data,
        )

        self.assertTrue(
            NotificationDelivery.objects.filter(
                channel="web",
                user=tp_user,
                metadata__event_status="management_review",
            ).exists()
        )

    def test_mphlg_processing_notifies_mphlg_admin(self):
        mphlg_user = User.objects.create_user(
            username="mphlg",
            email="",
            password="Password123",
            role="admin",
            department="MPHLG",
            is_active=True,
        )
        User.objects.create_user(
            username="sut",
            email="",
            password="Password123",
            role="admin",
            department="SUT",
            is_active=True,
        )

        self.notify_status("mphlg_processing", old_status="management_review")

        deliveries = NotificationDelivery.objects.filter(
            channel="web",
            recipient_role="admin",
            metadata__event_status="mphlg_processing",
        )
        self.assertTrue(deliveries.filter(user=mphlg_user).exists())
        self.assertEqual(deliveries.count(), 1)

    def test_mphlg_decision_received_notifies_sut_admin(self):
        sut_user = User.objects.create_user(
            username="sut",
            email="",
            password="Password123",
            role="admin",
            department="SUT",
            is_active=True,
        )
        User.objects.create_user(
            username="mphlg",
            email="",
            password="Password123",
            role="admin",
            department="MPHLG",
            is_active=True,
        )

        self.notify_status("mphlg_decision_received", old_status="mphlg_processing")

        deliveries = NotificationDelivery.objects.filter(
            channel="web",
            recipient_role="admin",
            metadata__event_status="mphlg_decision_received",
        )
        self.assertTrue(deliveries.filter(user=sut_user).exists())
        self.assertEqual(deliveries.count(), 1)

    def test_department_inbox_keeps_old_kb_les_memos(self):
        User.objects.create_user(
            username="kb-les-original",
            email="",
            password="Password123",
            role="supervisor",
            department="KB(LES)",
            is_active=True,
        )
        self.application.form_data = {
            **self.application.form_data,
            "kb_les_verification": {"status": "Pending KB(LES) Support"},
        }
        self.application.save(update_fields=["form_data"])

        self.notify_status("management_review")

        kb_viewer = User.objects.create_user(
            username="kb-les-viewer",
            email="",
            password="Password123",
            role="supervisor",
            department="KB(LES)",
            is_active=True,
        )
        self.application.form_data = {
            **self.application.form_data,
            "kb_les_verification": {"status": "Supported"},
            "management_recommendation": {"status": "Pending TP(RES)/PGH Approval"},
        }
        self.application.save(update_fields=["form_data"])

        client = APIClient()
        client.force_authenticate(user=kb_viewer)
        response = client.get("/api/notifications/")

        self.assertEqual(response.status_code, 200)
        data = response.data if isinstance(response.data, list) else response.data["results"]
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["metadata"]["event_status"], "management_review")
        self.assertIn("KB(LES) support", data[0]["metadata"]["title_en"])


class SuperAdminAccountNotificationTests(TestCase):
    def setUp(self):
        User.objects.filter(role="superadmin").delete()
        self.superadmin = User.objects.create_user(
            username="superadmin",
            email="superadmin@example.com",
            password="Password123",
            role="superadmin",
            is_active=True,
        )
        self.admin = User.objects.create_user(
            username="admin2",
            email="admin@example.com",
            password="Password123",
            role="admin",
            is_active=True,
        )

    def test_account_created_notification_is_web_only_for_superadmin(self):
        account = User.objects.create_user(
            username="newuser",
            email="newuser@example.com",
            password="Password123",
            role="applicant",
            first_name="NEW",
            last_name="USER",
        )

        notify_account_created(account, created_by=self.admin)

        deliveries = NotificationDelivery.objects.filter(metadata__event_status="account_created")
        self.assertEqual(deliveries.count(), 1)
        delivery = deliveries.get()
        self.assertIsNone(delivery.application_id)
        self.assertEqual(delivery.user, self.superadmin)
        self.assertEqual(delivery.recipient_role, "superadmin")
        self.assertEqual(delivery.channel, "web")
        self.assertEqual(delivery.status, "sent")
        self.assertEqual(delivery.metadata["account_name"], "NEW USER")
        self.assertFalse(NotificationDelivery.objects.filter(channel__in=["email", "whatsapp"]).exists())

    def test_superadmin_notification_endpoint_includes_account_created(self):
        account = User.objects.create_user(
            username="newadmin",
            email="newadmin@example.com",
            password="Password123",
            role="admin",
            first_name="NEW",
            last_name="ADMIN",
        )
        notify_account_created(account)

        client = APIClient()
        client.force_authenticate(user=self.superadmin)
        response = client.get("/api/notifications/")

        self.assertEqual(response.status_code, 200)
        data = response.data if isinstance(response.data, list) else response.data["results"]
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["application_id"], None)
        self.assertEqual(data[0]["metadata"]["event_status"], "account_created")
        self.assertEqual(data[0]["metadata"]["action_url"], "/superadmin/admins")
