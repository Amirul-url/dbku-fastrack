from unittest.mock import patch
from datetime import datetime

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from applications.models import Application

from .models import NotificationDelivery
from .services import (
    notify_account_created,
    notify_application_status_change,
    process_license_renewal_reminders,
)
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
            mobile_number="0168889999",
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

    def test_notification_endpoint_includes_registered_pt_ikl_contact(self):
        self.notify_status("submitted")

        client = APIClient()
        client.force_authenticate(user=self.admin)
        response = client.get("/api/notifications/")

        self.assertEqual(response.status_code, 200)
        data = response.data if isinstance(response.data, list) else response.data["results"]
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["recipient_email"], "admin@sample.com")
        self.assertEqual(data[0]["recipient_mobile_number"], "0168889999")

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

    def test_pt_ikl_rejection_notifies_applicant_all_channels(self):
        self.application.latest_remark = "Please correct the applicant details."
        self.application.form_data = {
            **self.application.form_data,
            "correction_request": {
                "source": "PT(IKL)",
                "remarks": self.application.latest_remark,
            },
        }
        self.application.save(update_fields=["latest_remark", "form_data"])

        self.notify_status("incomplete", old_status="submitted")

        applicant_channels = set(
            NotificationDelivery.objects.filter(
                recipient_role="applicant",
                metadata__event_status="incomplete",
            ).values_list("channel", flat=True)
        )
        self.assertEqual(applicant_channels, {"web", "email", "whatsapp"})
        web_delivery = NotificationDelivery.objects.get(
            channel="web",
            recipient_role="applicant",
            metadata__event_status="incomplete",
        )
        self.assertIn("Please correct the applicant details.", web_delivery.message)

    def test_pt_ikl_approval_memo_is_sent_to_ku_ikl_notification(self):
        ku_user = User.objects.create_user(
            username="ku-memo",
            email="ku@example.com",
            password="Password123",
            role="admin",
            department="KU(IKL)",
            is_active=True,
        )
        memo_html = "<p>PT(IKL) memo for KU(IKL)</p>"
        self.application.form_data = {
            **self.application.form_data,
            "auto_screening": {
                "status": "Screened",
                "result": "PT(IKL) Send to KU(IKL)",
                "memo_html": memo_html,
            },
        }
        self.application.save(update_fields=["form_data"])

        self.notify_status("ku_ikl_review", old_status="submitted")

        delivery = NotificationDelivery.objects.get(
            channel="web",
            recipient_role="admin",
            metadata__event_status="ku_ikl_review",
        )
        self.assertEqual(delivery.user, ku_user)
        self.assertEqual(delivery.metadata["memo_html"], memo_html)
        self.assertEqual(delivery.metadata["memo_template"], "pt_ikl_to_ku_ikl")
        self.assertEqual(delivery.metadata["from"], "PT(IKL)")

    def test_ku_ikl_approval_memo_is_sent_to_ikl_technical_notification(self):
        technical_user = User.objects.create_user(
            username="ikl-technical-memo",
            email="technical@example.com",
            password="Password123",
            role="admin",
            department="IKL (TECHNICAL)",
            is_active=True,
        )
        memo_html = "<p>KU(IKL) memo for IKL(TECHNICAL)</p>"
        self.application.form_data = {
            **self.application.form_data,
            "technical_referral": {
                "status": "Referred",
                "source": "KU(IKL)",
                "target": "IKL(TECHNICAL)",
                "memo_html": memo_html,
            },
        }
        self.application.save(update_fields=["form_data"])

        self.notify_status("technical_review", old_status="ku_ikl_review")

        delivery = NotificationDelivery.objects.get(
            channel="web",
            recipient_role="admin",
            metadata__event_status="technical_review",
            user=technical_user,
        )
        self.assertEqual(delivery.metadata["memo_html"], memo_html)
        self.assertEqual(delivery.metadata["memo_template"], "ku_ikl_to_technical")
        self.assertEqual(delivery.metadata["from"], "KU(IKL)")
        self.assertEqual(delivery.metadata["to"], "IKL(TECHNICAL) / BLG / GPM / MNE / IMT / LNP / ENG")

    def test_ku_ikl_rejection_notifies_applicant_all_channels(self):
        self.application.latest_remark = "Rejected by KU(IKL). Please update the site details."
        self.application.form_data = {
            **self.application.form_data,
            "correction_request": {
                "source": "KU(IKL)",
                "remarks": self.application.latest_remark,
            },
        }
        self.application.save(update_fields=["latest_remark", "form_data"])

        self.notify_status("incomplete", old_status="ku_ikl_review")

        applicant_channels = set(
            NotificationDelivery.objects.filter(
                recipient_role="applicant",
                metadata__event_status="incomplete",
            ).values_list("channel", flat=True)
        )
        self.assertEqual(applicant_channels, {"web", "email", "whatsapp"})
        web_delivery = NotificationDelivery.objects.get(
            channel="web",
            recipient_role="applicant",
            metadata__event_status="incomplete",
        )
        self.assertIn("Rejected by KU(IKL)", web_delivery.message)

    def test_ikl_technical_support_memo_is_sent_to_ku_ikl_notification(self):
        ku_user = User.objects.create_user(
            username="ku-technical-memo",
            email="ku-technical@example.com",
            password="Password123",
            role="admin",
            department="KU(IKL)",
            is_active=True,
        )
        memo_html = "<p>IKL(TECHNICAL) memo for KU(IKL)</p>"
        self.application.form_data = {
            **self.application.form_data,
            "technical_review": {
                "status": "Completed",
                "decision": "Supported",
                "memo_html": memo_html,
            },
        }
        self.application.save(update_fields=["form_data"])

        self.notify_status("technical_review_completed", old_status="technical_review")

        delivery = NotificationDelivery.objects.get(
            channel="web",
            recipient_role="admin",
            metadata__event_status="technical_review_completed",
            user=ku_user,
        )
        self.assertEqual(delivery.metadata["memo_html"], memo_html)
        self.assertEqual(delivery.metadata["memo_template"], "technical_to_ku_ikl")
        self.assertEqual(delivery.metadata["from"], "IKL(TECHNICAL)")
        self.assertEqual(delivery.metadata["to"], "KU(IKL)")

    def test_ikl_technical_not_supported_notifies_applicant_all_channels(self):
        self.application.latest_remark = "Technical review not supported due to site clearance issue."
        self.application.form_data = {
            **self.application.form_data,
            "technical_review": {
                "status": "Not Supported",
                "decision": "Not Supported",
                "comment": self.application.latest_remark,
            },
            "correction_request": {
                "source": "IKL(TECHNICAL)",
                "target": "Applicant",
                "remarks": self.application.latest_remark,
            },
        }
        self.application.save(update_fields=["latest_remark", "form_data"])

        self.notify_status("incomplete", old_status="technical_review")

        applicant_channels = set(
            NotificationDelivery.objects.filter(
                recipient_role="applicant",
                metadata__event_status="incomplete",
            ).values_list("channel", flat=True)
        )
        self.assertEqual(applicant_channels, {"web", "email", "whatsapp"})
        web_delivery = NotificationDelivery.objects.get(
            channel="web",
            recipient_role="applicant",
            metadata__event_status="incomplete",
        )
        self.assertIn("Technical review not supported", web_delivery.message)

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

    def test_technical_amendment_notification_includes_ku_remark_for_ikl_technical(self):
        ikl_technical_user = User.objects.create_user(
            username="ikl-technical",
            email="",
            password="Password123",
            role="admin",
            department="IKL (TECHNICAL)",
            is_active=True,
        )
        amendment_remark = "Please revise the technical fee calculation."
        memo_html = "<p>KU(IKL) amendment memo</p>"
        self.application.latest_remark = ""
        self.application.form_data = {
            **self.application.form_data,
            "technical_ku_review": {
                "decision": "KU(IKL) Request Technical Amendment",
                "remarks": amendment_remark,
                "memo_html": memo_html,
            },
            "correction_request": {
                "source": "KU(IKL)",
                "target": "IKL(TECHNICAL)",
                "remarks": amendment_remark,
                "memo_html": memo_html,
            },
        }
        self.application.save(update_fields=["latest_remark", "form_data"])

        self.notify_status("technical_amendment", old_status="technical_review_completed")

        delivery = NotificationDelivery.objects.get(
            channel="web",
            recipient_role="admin",
            metadata__event_status="technical_amendment",
        )
        self.assertEqual(delivery.user, ikl_technical_user)
        self.assertIn(f"Remark: {amendment_remark}", delivery.message)
        self.assertIn(f"Remark: {amendment_remark}", delivery.metadata["message_en"])
        self.assertEqual(delivery.metadata["from"], "KU(IKL)")
        self.assertEqual(delivery.metadata["to"], "IKL(TECHNICAL)")
        self.assertEqual(delivery.metadata["memo_html"], memo_html)
        self.assertEqual(delivery.metadata["memo_template"], "ku_ikl_final_review")

        client = APIClient()
        client.force_authenticate(user=ikl_technical_user)
        response = client.get("/api/notifications/")
        self.assertEqual(response.status_code, 200)
        data = response.data if isinstance(response.data, list) else response.data["results"]
        self.assertEqual(data[0]["latest_remark"], amendment_remark)

    def test_ku_ikl_final_approval_memo_is_sent_to_kb_les_notification(self):
        kb_user = User.objects.create_user(
            username="kb-les-ku-final",
            email="",
            password="Password123",
            role="supervisor",
            department="KB(LES)",
            is_active=True,
        )
        memo_html = "<p>KU(IKL) final review memo</p>"
        self.application.form_data = {
            **self.application.form_data,
            "technical_ku_review": {
                "decision": "KU(IKL) Confirm - Send to KB(LES)",
                "memo_html": memo_html,
            },
            "kb_les_verification": {
                "status": "Pending KB(LES) Verification",
                "routed_from": "KU(IKL)",
                "memo_html": memo_html,
            },
        }
        self.application.save(update_fields=["form_data"])

        self.notify_status("management_review", old_status="technical_review_completed")

        delivery = NotificationDelivery.objects.get(
            channel="web",
            recipient_role="admin",
            metadata__event_status="management_review",
            user=kb_user,
        )
        self.assertEqual(delivery.metadata["memo_html"], memo_html)
        self.assertEqual(delivery.metadata["memo_template"], "ku_ikl_final_review")
        self.assertEqual(delivery.metadata["from"], "KU(IKL)")
        self.assertEqual(delivery.metadata["to"], "KB(LES)")

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
        web_delivery = deliveries.get(channel="web", user=kb_user)
        self.assertIn("KU(IKL) final checking", web_delivery.metadata["message_en"])
        self.assertIn("KB(LES) verification", web_delivery.metadata["message_en"])
        self.assertNotIn("SUT approval recorded", web_delivery.metadata["message_en"])
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

    def test_sut_approval_result_notifies_kb_les_for_support(self):
        kb_user = User.objects.create_user(
            username="kb-les-sut-result",
            email="",
            password="Password123",
            mobile_number="",
            role="supervisor",
            department="KB(LES)",
            is_active=True,
        )
        User.objects.create_user(
            username="sut-result",
            email="",
            password="Password123",
            role="admin",
            department="SUT",
            is_active=True,
        )
        self.application.form_data = {
            **self.application.form_data,
            "sut_approval": {
                "status": "Approved",
                "officer": "SUT",
                "decision": "Approve",
                "remarks": "SUT approved",
            },
            "kb_les_verification": {
                "status": "Pending KB(LES) Support",
                "routed_from": "SUT",
            },
            "management_recommendation": None,
        }
        self.application.save(update_fields=["form_data"])

        self.notify_status("management_review", old_status="mphlg_decision_received")

        deliveries = NotificationDelivery.objects.filter(
            channel="web",
            recipient_role="admin",
            metadata__event_status="management_review",
        )
        self.assertTrue(deliveries.filter(user=kb_user).exists())
        self.assertEqual(deliveries.count(), 1)
        delivery = deliveries.get(user=kb_user)
        self.assertIn("KB(LES) support", delivery.metadata["title_en"])
        self.assertIn("SUT approval result", delivery.metadata["message_en"])

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

    def test_kb_les_rejection_notifies_ku_ikl_for_amendment(self):
        ku_user = User.objects.create_user(
            username="ku-ikl-return",
            email="ku-return@example.com",
            password="Password123",
            role="admin",
            department="KU(IKL)",
            is_active=True,
        )
        self.application.form_data = {
            **self.application.form_data,
            "kb_les_verification": {
                "status": "Rejected",
                "decision": "Reject",
                "remarks": "Please amend the recommendation.",
                "memo_html": "<p>KB(LES) return memo</p>",
            },
            "correction_request": {
                "source": "KB(LES)",
                "target": "KU(IKL)",
                "remarks": "Please amend the recommendation.",
                "memo_html": "<p>KB(LES) return memo</p>",
            },
            "management_recommendation": None,
            "approval": None,
        }
        self.application.latest_remark = "Please amend the recommendation."
        self.application.save(update_fields=["form_data", "latest_remark"])

        self.notify_status("technical_review_completed", old_status="management_review")

        delivery = NotificationDelivery.objects.get(
            channel="web",
            user=ku_user,
            metadata__event_status="technical_review_completed",
        )
        self.assertIn("KU(IKL) amendment required", delivery.metadata["title_en"])
        self.assertIn("returned by KB(LES)", delivery.metadata["message_en"])
        self.assertEqual(delivery.metadata["from"], "KB(LES)")
        self.assertEqual(delivery.metadata["to"], "KU(IKL)")
        self.assertEqual(delivery.metadata["memo_html"], "<p>KB(LES) return memo</p>")
        self.assertEqual(delivery.metadata["memo_template"], "kb_les_to_ku_ikl")

    def test_mphlg_rejection_notifies_ku_ikl_for_amendment(self):
        ku_user = User.objects.create_user(
            username="ku-ikl-mphlg-return",
            email="ku-mphlg-return@example.com",
            password="Password123",
            role="admin",
            department="KU(IKL)",
            is_active=True,
        )
        memo_html = "<p>MPHLG return memo</p>"
        self.application.form_data = {
            **self.application.form_data,
            "mphlg_gateway": {
                "status": "Returned to KU(IKL)",
                "decision": "Reject",
                "remarks": "Please amend for MPHLG.",
                "memo_html": memo_html,
            },
            "correction_request": {
                "source": "MPHLG",
                "target": "KU(IKL)",
                "remarks": "Please amend for MPHLG.",
                "memo_html": memo_html,
            },
            "approval": None,
        }
        self.application.latest_remark = "Please amend for MPHLG."
        self.application.save(update_fields=["form_data", "latest_remark"])

        self.notify_status("technical_review_completed", old_status="mphlg_processing")

        delivery = NotificationDelivery.objects.get(
            channel="web",
            user=ku_user,
            metadata__event_status="technical_review_completed",
        )
        self.assertIn("KU(IKL) amendment required", delivery.metadata["title_en"])
        self.assertIn("returned by MPHLG", delivery.metadata["message_en"])
        self.assertEqual(delivery.metadata["from"], "MPHLG")
        self.assertEqual(delivery.metadata["to"], "KU(IKL)")
        self.assertEqual(delivery.metadata["memo_html"], memo_html)
        self.assertEqual(delivery.metadata["memo_template"], "kb_les_to_ku_ikl")

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
        memo_html = "<p>TP(RES) memo for MPHLG approval</p>"
        self.application.form_data = {
            **self.application.form_data,
            "management_recommendation": {
                "officer": "TP(RES)",
                "status": "Approved",
            },
            "mphlg_gateway": {
                "status": "Pending MPHLG Approval",
                "routed_from": "TP(RES)",
                "memo_html": memo_html,
            },
        }

        self.notify_status("mphlg_processing", old_status="management_review")

        deliveries = NotificationDelivery.objects.filter(
            channel="web",
            recipient_role="admin",
            metadata__event_status="mphlg_processing",
        )
        self.assertTrue(deliveries.filter(user=mphlg_user).exists())
        self.assertEqual(deliveries.count(), 1)
        delivery = deliveries.get(user=mphlg_user)
        self.assertEqual(delivery.metadata["memo_html"], memo_html)
        self.assertEqual(delivery.metadata["memo_template"], "tp_pgh_to_mphlg")
        self.assertEqual(delivery.metadata["from"], "TP(RES)")
        self.assertEqual(delivery.metadata["to"], "MPHLG")

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
        memo_html = "<p>MPHLG memo for SUT approval</p>"
        self.application.form_data = {
            **self.application.form_data,
            "sut_approval": {
                "status": "Pending SUT Approval",
                "routed_from": "MPHLG",
                "memo_html": memo_html,
            },
        }
        self.application.save(update_fields=["form_data"])

        self.notify_status("mphlg_decision_received", old_status="mphlg_processing")

        deliveries = NotificationDelivery.objects.filter(
            channel="web",
            recipient_role="admin",
            metadata__event_status="mphlg_decision_received",
        )
        self.assertTrue(deliveries.filter(user=sut_user).exists())
        self.assertEqual(deliveries.count(), 1)
        delivery = deliveries.get(user=sut_user)
        self.assertEqual(delivery.metadata["memo_html"], memo_html)
        self.assertEqual(delivery.metadata["memo_template"], "mphlg_to_sut")
        self.assertEqual(delivery.metadata["from"], "MPHLG")
        self.assertEqual(delivery.metadata["to"], "SUT")

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
        self.assertIn("KB(LES) verification", data[0]["metadata"]["title_en"])

    def test_kb_les_verified_memo_is_sent_to_tp_pgh_notification(self):
        tp_user = User.objects.create_user(
            username="tp-res",
            email="tp@example.com",
            password="Password123",
            role="admin",
            department="TP(RES)",
            is_active=True,
        )
        User.objects.create_user(
            username="kb-les",
            email="kb@example.com",
            password="Password123",
            role="admin",
            department="KB(LES)",
            is_active=True,
        )
        old_form_data = {
            **self.application.form_data,
            "kb_les_verification": {"status": "Pending KB(LES) Verification"},
        }
        memo_html = "<h2>DEWAN BANDARAYA KUCHING UTARA</h2><p>Memo kelulusan</p>"
        self.application.status = "management_review"
        self.application.form_data = {
            **old_form_data,
            "kb_les_verification": {
                "status": "Verified",
                "memo_html": memo_html,
            },
            "management_recommendation": {"status": "Pending TP(RES)/PGH Approval"},
        }
        self.application.save(update_fields=["status", "form_data"])

        notify_application_status_change(
            self.application,
            old_status="management_review",
            old_form_data=old_form_data,
        )

        delivery = NotificationDelivery.objects.get(
            channel="web",
            recipient_role="admin",
            metadata__event_status="management_review",
            user=tp_user,
        )
        self.assertEqual(delivery.metadata["memo_html"], memo_html)
        self.assertEqual(delivery.metadata["sender"], "KB(LES) <ALiS Notification Center>")
        self.assertEqual(delivery.metadata["to"], "TP(RES)")
        self.assertIn("TP(RES)/PGH approval", delivery.metadata["title_en"])


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


@override_settings(
    NOTIFICATION_EMAIL_ENABLED=False,
    WHATSAPP_ENABLED=False,
)
class LicenseRenewalWorkflowTests(TestCase):
    def setUp(self):
        self.applicant = User.objects.create_user(
            username="license-applicant",
            email="applicant@sample.com",
            password="Password123",
            mobile_number="0175151829",
            role="applicant",
        )
        self.pt_ikl = User.objects.create_user(
            username="pt-ikl-renewal",
            email="pt@example.com",
            password="Password123",
            role="admin",
            department="PT(IKL)",
            is_active=True,
        )
        self.supervisor = User.objects.create_user(
            username="supervisor-renewal",
            email="supervisor@example.com",
            password="Password123",
            role="supervisor",
            department="KB(LES)",
            is_active=True,
        )
        self.application = Application.objects.create(
            applicant=self.applicant,
            title="Renewal signage",
            status="license_issued",
            form_data={
                "step_1": {"project_name": "Renewal signage"},
                "license": {
                    "license_id": "ALIS202600001",
                    "status": "Active",
                    "issue_date": "2026-05-21T08:30:00+08:00",
                    "expiry_date": "2027-05-21T08:30:00+08:00",
                },
            },
        )

    def test_detects_three_month_renewal_reminder(self):
        process_license_renewal_reminders(now=self.local_time(2027, 2, 21, 8, 30))

        self.application.refresh_from_db()
        reminder = self.application.form_data["license_renewal"]["reminders"]["3"]
        self.assertEqual(reminder["status"], "pending_pt_letter")
        self.assertEqual(reminder["months_before_expiry"], 3)
        self.assertTrue(
            NotificationDelivery.objects.filter(
                channel="web",
                user=self.pt_ikl,
                metadata__event_status="license_renewal_3m",
            ).exists()
        )
        self.assertTrue(
            NotificationDelivery.objects.filter(
                channel="web",
                user=self.supervisor,
                metadata__event_status="license_renewal_3m",
            ).exists()
        )

    def test_reminder_letter_progresses_to_applicant_release(self):
        process_license_renewal_reminders(now=self.local_time(2027, 2, 21, 8, 30))

        client = APIClient()
        client.force_authenticate(user=self.pt_ikl)
        response = client.post(
            f"/api/applications/{self.application.id}/license-renewal-action/",
            {"action": "generate_reminder_letter", "months": 3},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

        client.force_authenticate(user=self.supervisor)
        response = client.post(
            f"/api/applications/{self.application.id}/license-renewal-action/",
            {"action": "confirm_reminder_letter", "months": 3},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

        self.application.refresh_from_db()
        reminder = self.application.form_data["license_renewal"]["reminders"]["3"]
        self.assertEqual(reminder["status"], "released_to_applicant")
        self.assertTrue(
            NotificationDelivery.objects.filter(
                channel="web",
                user=self.applicant,
                metadata__event_status="license_renewal_released",
            ).exists()
        )

    def local_time(self, year, month, day, hour, minute):
        return timezone.make_aware(
            datetime(year, month, day, hour, minute),
            timezone.get_current_timezone(),
        )
