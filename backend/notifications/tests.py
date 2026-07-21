from unittest.mock import patch
from datetime import datetime

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from applications.models import Application

from .models import NotificationDelivery
from .services import (
    notify_applicant_application_submitted,
    notify_applicant_registration_success,
    notify_account_created,
    notify_application_status_change,
    notify_license_revocation_request,
    process_license_renewal_reminders,
)
from .channels import send_brevo_email, send_smtp_email, send_webhook_whatsapp


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

    @override_settings(DEFAULT_FROM_EMAIL="noreply@dbku.gov.my")
    def test_smtp_sender_uses_default_from_email(self):
        with patch("notifications.channels.EmailMultiAlternatives") as email_class:
            send_smtp_email("applicant@example.com", "Subject", "Message")

        email_class.assert_called_once_with(
            subject="Subject",
            body="Message",
            from_email="noreply@dbku.gov.my",
            to=["applicant@example.com"],
        )

    @override_settings(BREVO_FROM_EMAIL="sender@example.com", BREVO_FROM_NAME="ALiS")
    def test_brevo_sender_uses_brevo_from_email(self):
        with patch("notifications.channels.post_json") as post_json:
            send_brevo_email("applicant@example.com", "Subject", "Message")

        payload = post_json.call_args.args[1]
        self.assertEqual(payload["sender"]["email"], "sender@example.com")

    @override_settings(WHATSAPP_WEBHOOK_URL="https://example.com/webhook", WHATSAPP_WEBHOOK_TOKEN="")
    def test_webhook_whatsapp_uses_superadmin_mobile_as_sender(self):
        with patch("notifications.channels.post_json") as post_json:
            send_webhook_whatsapp("60198765432", "Message")

        payload = post_json.call_args.args[1]
        self.assertEqual(payload["from"], "60123456789")


@override_settings(
    NOTIFICATION_SIDE_EFFECTS_ENABLED=True,
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

    def test_submitted_notifies_admin_only(self):
        ku_user = User.objects.create_user(
            username="ku-submitted",
            email="ku-submitted@sample.com",
            password="Password123",
            mobile_number="0161112222",
            role="admin",
            department="KU(IKL)",
            is_active=True,
        )
        self.notify_status("submitted")

        admin_channels = set(
            NotificationDelivery.objects.filter(
                recipient_role="admin",
                metadata__event_status="submitted",
            ).values_list("channel", flat=True)
        )
        self.assertFalse(
            NotificationDelivery.objects.filter(
                recipient_role="applicant",
                metadata__event_status="submitted",
            ).exists()
        )
        self.assertEqual(admin_channels, {"web", "email", "whatsapp"})
        email_delivery = NotificationDelivery.objects.get(
            user=ku_user,
            recipient_role="admin",
            channel="email",
            metadata__event_status="submitted",
        )
        whatsapp_delivery = NotificationDelivery.objects.get(
            user=ku_user,
            recipient_role="admin",
            channel="whatsapp",
            metadata__event_status="submitted",
        )
        expected_subject = f"ALiS - Application {self.application.reference_no} requires KU(IKL) review"
        expected_message = (
            f"Application {self.application.reference_no} has been submitted "
            "and is ready for KU(IKL) review."
        )
        self.assertEqual(email_delivery.subject, expected_subject)
        self.assertEqual(whatsapp_delivery.message, expected_message)

    def test_submitted_does_not_use_official_superadmin_contact_as_recipient_fallback(self):
        self.notify_status("submitted")

        self.assertFalse(NotificationDelivery.objects.filter(recipient_role="admin").exists())
        self.assertFalse(NotificationDelivery.objects.filter(recipient="admin-notify@sample.com").exists())
        self.assertFalse(NotificationDelivery.objects.filter(recipient="60111111111").exists())

    def test_forced_applicant_submit_uses_registered_applicant_mobile_when_form_phone_is_empty(self):
        self.application.form_data = {}
        self.application.save(update_fields=["form_data"])

        notify_applicant_application_submitted(self.application)

        self.assertTrue(
            NotificationDelivery.objects.filter(
                recipient_role="applicant",
                channel="whatsapp",
                recipient="60175151829",
                metadata__event_status="applicant_submitted",
            ).exists()
        )

    def test_forced_applicant_submit_normalizes_registered_applicant_mobile_without_leading_zero(self):
        self.applicant.mobile_number = "175151829"
        self.applicant.save(update_fields=["mobile_number"])
        self.application.form_data = {}
        self.application.save(update_fields=["form_data"])

        notify_applicant_application_submitted(self.application)

        self.assertTrue(
            NotificationDelivery.objects.filter(
                recipient_role="applicant",
                channel="whatsapp",
                recipient="60175151829",
                metadata__event_status="applicant_submitted",
            ).exists()
        )

    def test_forced_applicant_submit_uses_registered_applicant_profile_contact(self):
        self.application.form_data = {
            "step_1": {"tel_no": "0199999999"},
            "step_2": {
                "email": "form-contact@sample.com",
                "mobile_country_code": "60",
                "mobile_no": "199999999",
            },
            "step_3": {
                "email": "submitting-person@sample.com",
                "mobile_country_code": "60",
                "mobile_no": "188888888",
            },
        }
        self.application.save(update_fields=["form_data"])

        notify_applicant_application_submitted(self.application)

        self.assertTrue(
            NotificationDelivery.objects.filter(
                recipient_role="applicant",
                channel="email",
                recipient="applicant@sample.com",
                metadata__event_status="applicant_submitted",
            ).exists()
        )
        self.assertTrue(
            NotificationDelivery.objects.filter(
                recipient_role="applicant",
                channel="whatsapp",
                recipient="60175151829",
                metadata__event_status="applicant_submitted",
            ).exists()
        )
        self.assertFalse(
            NotificationDelivery.objects.filter(
                recipient_role="applicant",
                recipient__in=[
                    "form-contact@sample.com",
                    "submitting-person@sample.com",
                    "60199999999",
                    "60188888888",
                ],
                metadata__event_status="applicant_submitted",
            ).exists()
        )

    def test_notification_endpoint_includes_registered_ku_ikl_contact(self):
        ku_admin = User.objects.create_user(
            username="ku-admin",
            email="ku-admin@sample.com",
            password="Password123",
            mobile_number="0161112222",
            role="admin",
            department="KU(IKL)",
            is_active=True,
        )
        self.notify_status("submitted")

        client = APIClient()
        client.force_authenticate(user=ku_admin)
        response = client.get("/api/notifications/")

        self.assertEqual(response.status_code, 200)
        data = response.data if isinstance(response.data, list) else response.data["results"]
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["recipient_email"], "ku-admin@sample.com")
        self.assertEqual(data[0]["recipient_mobile_number"], "0161112222")

    def test_payment_request_notifies_applicant_only(self):
        self.application.form_data = {
            **self.application.form_data,
            "approval_letter": {
                "remarks": "please download",
            },
        }
        self.application.save(update_fields=["form_data"])

        self.notify_status("invoice_generated", old_status="approved")

        applicant_channels = set(
            NotificationDelivery.objects.filter(
                recipient_role="applicant",
                metadata__event_status="invoice_generated",
            ).values_list("channel", flat=True)
        )
        self.assertEqual(applicant_channels, {"web", "email", "whatsapp"})
        self.assertFalse(NotificationDelivery.objects.filter(recipient_role="admin").exists())
        for delivery in NotificationDelivery.objects.filter(
            recipient_role="applicant",
            metadata__event_status="invoice_generated",
        ):
            self.assertEqual(
                delivery.message,
                "ALiS\n\n"
                "Bill for application ALiS.2026-0001 is ready. Please upload your proof of payment."
            )
            self.assertNotIn("please download", delivery.message)
            self.assertNotIn("please download", delivery.metadata["message"])
            self.assertTrue(delivery.metadata["suppress_remark"])

    def test_license_revocation_request_notifies_pt_ikl_web(self):
        ku_admin = User.objects.create_user(
            username="ku-revocation",
            email="ku-revocation@sample.com",
            password="Password123",
            role="admin",
            department="KU(IKL)",
            is_active=True,
        )
        self.application.status = "license_issued"
        self.application.save(update_fields=["status"])

        notify_license_revocation_request(self.application, "pending")

        delivery = NotificationDelivery.objects.get(
            channel="web",
            recipient_role="admin",
            metadata__event_status="license_revocation_requested",
        )
        self.assertEqual(delivery.user, self.admin)
        self.assertIn(self.application.reference_no, delivery.message)
        self.assertFalse(
            NotificationDelivery.objects.filter(
                channel="web",
                user=ku_admin,
                metadata__event_status="license_revocation_requested",
            ).exists()
        )

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

    def test_applicant_rejection_external_message_is_plain_notice(self):
        self.application.latest_remark = "resubmit"
        self.application.save(update_fields=["latest_remark"])

        self.notify_status("rejected", old_status="submitted")

        deliveries = NotificationDelivery.objects.filter(
            recipient_role="applicant",
            metadata__event_status="rejected",
            channel__in=["email", "whatsapp"],
        )
        self.assertEqual(deliveries.count(), 2)

        for delivery in deliveries:
            self.assertIn("Your application", delivery.message)
            self.assertIn("Remark: resubmit", delivery.message)
            self.assertNotIn("Reference:", delivery.message)
            self.assertNotIn("Status:", delivery.message)
            self.assertNotIn("Project:", delivery.message)
            self.assertNotIn("KU(IKL)", delivery.message)

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

    def test_ku_ikl_approval_memo_is_sent_to_selected_technical_unit_first(self):
        blg_user = User.objects.create_user(
            username="blg-technical-memo",
            email="blg-technical@example.com",
            password="Password123",
            role="admin",
            department="BLG",
            is_active=True,
        )
        ikl_user = User.objects.create_user(
            username="ikl-technical-memo",
            email="technical@example.com",
            password="Password123",
            role="admin",
            department="IKL (TECHNICAL)",
            is_active=True,
        )
        memo_html = "<p>KU(IKL) memo for BLG</p>"
        self.application.form_data = {
            **self.application.form_data,
            "technical_referral": {
                "status": "Referred",
                "source": "KU(IKL)",
                "target": "BLG",
                "participating_departments": ["BLG"],
                "memo_html": memo_html,
            },
            "technical_department_selection": {
                "departments": ["BLG"],
                "selected_by": "Application Type",
            },
        }
        self.application.save(update_fields=["form_data"])

        self.notify_status("technical_review", old_status="ku_ikl_review")

        delivery = NotificationDelivery.objects.get(
            channel="web",
            recipient_role="admin",
            metadata__event_status="technical_review",
            user=blg_user,
        )
        self.assertEqual(delivery.metadata["memo_html"], memo_html)
        self.assertEqual(delivery.metadata["memo_template"], "ku_ikl_to_technical")
        self.assertEqual(delivery.metadata["from"], "KU(IKL)")
        self.assertEqual(delivery.metadata["to"], "BLG")
        self.assertFalse(
            NotificationDelivery.objects.filter(
                channel="web",
                recipient_role="admin",
                metadata__event_status="technical_review",
                user=ikl_user,
            ).exists()
        )

    @override_settings(
        NOTIFICATION_EMAIL_ENABLED=True,
        NOTIFICATION_EMAIL_PROVIDER="smtp",
        EMAIL_HOST="58.26.203.101",
        DEFAULT_FROM_EMAIL="noreply@dbku.gov.my",
        WHATSAPP_ENABLED=True,
        WHATSAPP_PROVIDER="evolution",
        EVOLUTION_API_URL="https://whatsapp.example.com",
        EVOLUTION_API_KEY="test-key",
        EVOLUTION_INSTANCE_NAME="alis",
    )
    @patch("notifications.services.send_whatsapp")
    @patch("notifications.services.send_email")
    def test_ku_ikl_remarks_are_sent_to_next_technical_task_channels(
        self,
        send_email,
        send_whatsapp,
    ):
        blg_user = User.objects.create_user(
            username="blg-technical-remarks",
            email="blg-remarks@example.com",
            password="Password123",
            mobile_number="0125557788",
            role="admin",
            department="BLG",
            is_active=True,
        )
        ku_remark = "Please review the building sign placement before site visit."
        self.application.latest_remark = ""
        self.application.form_data = {
            **self.application.form_data,
            "auto_screening": {
                "status": "Screened",
                "result": "KU(IKL) Confirm - Send to Technical Units",
                "remarks": ku_remark,
            },
            "technical_referral": {
                "status": "Referred",
                "source": "KU(IKL)",
                "target": "BLG",
                "participating_departments": ["BLG"],
            },
            "technical_department_selection": {
                "departments": ["BLG"],
                "selected_by": "Application Type",
            },
        }
        self.application.save(update_fields=["latest_remark", "form_data"])

        self.notify_status("technical_review", old_status="ku_ikl_review")

        deliveries = NotificationDelivery.objects.filter(
            recipient_role="admin",
            metadata__event_status="technical_review",
            user=blg_user,
        )
        self.assertEqual(
            set(deliveries.values_list("channel", flat=True)),
            {"web", "email", "whatsapp"},
        )
        for delivery in deliveries:
            self.assertIn(f"Remark: {ku_remark}", delivery.message)
            self.assertIn(f"Remark: {ku_remark}", delivery.metadata["message_en"])

        send_email.assert_called_once()
        send_whatsapp.assert_called_once()

    def test_technical_review_notification_uses_open_space_department_list(self):
        gpm_user = User.objects.create_user(
            username="gpm-open-space",
            email="gpm-open-space@example.com",
            password="Password123",
            role="admin",
            department="GPM",
            is_active=True,
        )
        selected_departments = ["GPM", "MNE", "IMT", "LNP", "ENG"]
        self.application.status = "technical_review"
        self.application.form_data = {
            **self.application.form_data,
            "technical_referral": {
                "status": "Referred",
                "source": "KU(IKL)",
                "target": "Technical Units",
                "participating_departments": selected_departments,
            },
            "technical_department_selection": {
                "departments": selected_departments,
                "selected_by": "Application Type",
            },
        }
        self.application.save(update_fields=["status", "form_data"])

        self.notify_status("technical_review", old_status="ku_ikl_review")

        delivery = NotificationDelivery.objects.get(
            channel="web",
            recipient_role="admin",
            metadata__event_status="technical_review",
            user=gpm_user,
        )
        expected_body = f"Application {self.application.reference_no} is ready for GPM, MNE, IMT, LNP, ENG review."
        expected_title = (
            f"Application {self.application.reference_no} requires GPM, MNE, IMT, LNP, ENG review."
        )
        self.assertEqual(delivery.metadata["from"], "KU(IKL)")
        self.assertEqual(delivery.metadata["to"], "GPM, MNE, IMT, LNP, ENG")
        self.assertEqual(delivery.metadata["title_en"], expected_title)
        self.assertEqual(delivery.metadata["message_en"], expected_body)
        self.assertEqual(delivery.message, expected_body)

    def test_technical_review_notification_uses_building_department_list(self):
        blg_user = User.objects.create_user(
            username="blg-building",
            email="blg-building@example.com",
            password="Password123",
            role="admin",
            department="BLG",
            is_active=True,
        )
        self.application.status = "technical_review"
        self.application.form_data = {
            **self.application.form_data,
            "technical_referral": {
                "status": "Referred",
                "source": "KU(IKL)",
                "target": "BLG",
                "participating_departments": ["BLG"],
            },
            "technical_department_selection": {
                "departments": ["BLG"],
                "selected_by": "Application Type",
            },
        }
        self.application.save(update_fields=["status", "form_data"])

        self.notify_status("technical_review", old_status="ku_ikl_review")

        delivery = NotificationDelivery.objects.get(
            channel="web",
            recipient_role="admin",
            metadata__event_status="technical_review",
            user=blg_user,
        )
        expected_body = f"Application {self.application.reference_no} is ready for BLG review."
        expected_title = f"Application {self.application.reference_no} requires BLG review."
        self.assertEqual(delivery.metadata["from"], "KU(IKL)")
        self.assertEqual(delivery.metadata["to"], "BLG")
        self.assertEqual(delivery.metadata["title_en"], expected_title)
        self.assertEqual(delivery.metadata["message_en"], expected_body)
        self.assertEqual(delivery.message, expected_body)

    @override_settings(
        NOTIFICATION_SIDE_EFFECTS_ENABLED=False,
        NOTIFICATION_EMAIL_ENABLED=True,
        NOTIFICATION_EMAIL_PROVIDER="smtp",
        EMAIL_HOST="58.26.203.101",
        DEFAULT_FROM_EMAIL="noreply@dbku.gov.my",
        WHATSAPP_ENABLED=True,
        WHATSAPP_PROVIDER="evolution",
        EVOLUTION_API_URL="https://whatsapp.example.com",
        EVOLUTION_API_KEY="test-key",
        EVOLUTION_INSTANCE_NAME="alis",
    )
    @patch("notifications.services.send_whatsapp")
    @patch("notifications.services.send_email")
    def test_forced_staff_status_sends_web_email_and_whatsapp(
        self,
        send_email,
        send_whatsapp,
    ):
        blg_user = User.objects.create_user(
            username="blg-forced-delivery",
            email="blg-forced@example.com",
            password="Password123",
            mobile_number="0123456789",
            role="admin",
            department="BLG",
            is_active=True,
        )
        self.application.status = "technical_review"
        self.application.form_data = {
            **self.application.form_data,
            "technical_department_selection": {
                "departments": ["BLG"],
                "selected_by": "Application Type",
            },
        }
        self.application.save(update_fields=["status", "form_data"])

        notify_application_status_change(
            self.application,
            old_status="ku_ikl_review",
            force=True,
        )

        deliveries = NotificationDelivery.objects.filter(
            user=blg_user,
            metadata__event_status="technical_review",
        )
        self.assertEqual(
            set(deliveries.values_list("channel", flat=True)),
            {"web", "email", "whatsapp"},
        )
        send_email.assert_called_once()
        send_whatsapp.assert_called_once()

    @override_settings(
        NOTIFICATION_SIDE_EFFECTS_ENABLED=False,
        NOTIFICATION_EMAIL_ENABLED=True,
        NOTIFICATION_EMAIL_PROVIDER="smtp",
        EMAIL_HOST="58.26.203.101",
        DEFAULT_FROM_EMAIL="noreply@dbku.gov.my",
        WHATSAPP_ENABLED=True,
        WHATSAPP_PROVIDER="evolution",
        EVOLUTION_API_URL="https://whatsapp.example.com",
        EVOLUTION_API_KEY="test-key",
        EVOLUTION_INSTANCE_NAME="alis",
    )
    @patch("notifications.services.send_whatsapp")
    @patch("notifications.services.send_email")
    def test_all_dbku_mphlg_routes_create_external_deliveries(
        self,
        _send_email,
        _send_whatsapp,
    ):
        users = {"PT(IKL)": self.admin}
        departments = [
            "KU(IKL)",
            "BLG",
            "GPM",
            "MNE",
            "IMT",
            "LNP",
            "ENG",
            "IKL (TECHNICAL)",
            "KB(LES)",
            "TP(RES)",
            "FIN",
            "MPHLG",
            "SUT",
        ]
        for index, department in enumerate(departments, start=1):
            users[department] = User.objects.create_user(
                username=f"route-user-{index}",
                email=f"route-{index}@example.com",
                password="Password123",
                mobile_number=f"012345{index:04d}",
                role="supervisor" if department in {"KB(LES)", "TP(RES)"} else "admin",
                department=department,
                is_active=True,
            )

        route_cases = [
            ("submitted", "draft", {}, ["KU(IKL)"]),
            ("ku_ikl_review", "submitted", {}, ["KU(IKL)"]),
            (
                "technical_review",
                "ku_ikl_review",
                {
                    "technical_department_selection": {
                        "departments": ["BLG"],
                        "selected_by": "Application Type",
                    },
                },
                ["BLG"],
            ),
            (
                "technical_review",
                "ku_ikl_review",
                {
                    "technical_department_selection": {
                        "departments": ["GPM", "MNE", "IMT", "LNP", "ENG"],
                        "selected_by": "Application Type",
                    },
                },
                ["GPM", "MNE", "IMT", "LNP", "ENG"],
            ),
            (
                "technical_site_visit",
                "technical_review",
                {
                    "technical_department_selection": {
                        "departments": ["BLG"],
                        "selected_by": "Application Type",
                    },
                    "technical_department_reviews": {
                        "BLG": {"decision": "Supported"},
                    },
                },
                ["IKL (TECHNICAL)"],
            ),
            ("technical_amendment", "technical_review_completed", {}, ["IKL (TECHNICAL)"]),
            ("technical_review_completed", "technical_site_visit", {}, ["KU(IKL)"]),
            (
                "management_review",
                "technical_review_completed",
                {"kb_les_verification": {"status": "Pending KB(LES) Verification"}},
                ["KB(LES)"],
            ),
            (
                "management_review",
                "management_review",
                {
                    "kb_les_verification": {"status": "Supported"},
                    "management_recommendation": {"status": "Pending TP(RES)/PGH Approval"},
                },
                ["TP(RES)"],
            ),
            ("mphlg_processing", "management_review", {}, ["MPHLG"]),
            ("mphlg_decision_received", "mphlg_processing", {}, ["SUT"]),
            ("approved", "management_review", {}, ["PT(IKL)"]),
            ("bill_pending_ku", "approved", {}, ["PT(IKL)"]),
            ("payment_submitted", "invoice_generated", {}, ["FIN"]),
            ("payment_verified", "payment_submitted", {}, ["PT(IKL)"]),
        ]

        for status_key, old_status, form_updates, expected_departments in route_cases:
            with self.subTest(status=status_key, recipients=expected_departments):
                NotificationDelivery.objects.all().delete()
                old_form_data = dict(self.application.form_data or {})
                self.application.status = status_key
                self.application.form_data = {
                    **old_form_data,
                    **form_updates,
                }
                self.application.save()

                notify_application_status_change(
                    self.application,
                    old_status=old_status,
                    old_form_data=old_form_data,
                    force=True,
                )

                for department in expected_departments:
                    channels = set(
                        NotificationDelivery.objects.filter(
                            user=users[department],
                            recipient_role="admin",
                            metadata__event_status=status_key,
                        ).values_list("channel", flat=True)
                    )
                    self.assertEqual(channels, {"web", "email", "whatsapp"})

    def test_selected_technical_departments_receive_tasks_after_ikl_selection(self):
        ikl_user = User.objects.create_user(
            username="ikl-technical-selection",
            email="ikl-selection@example.com",
            password="Password123",
            role="admin",
            department="IKL (TECHNICAL)",
            is_active=True,
        )
        blg_user = User.objects.create_user(
            username="blg-reviewer",
            email="blg@example.com",
            password="Password123",
            role="admin",
            department="BLG",
            is_active=True,
        )
        gpm_user = User.objects.create_user(
            username="gpm-reviewer",
            email="gpm@example.com",
            password="Password123",
            role="admin",
            department="GPM",
            is_active=True,
        )
        old_form_data = {
            **self.application.form_data,
            "technical_referral": {
                "status": "Referred",
                "source": "KU(IKL)",
                "target": "IKL(TECHNICAL)",
                "participating_departments": [],
            },
        }
        self.application.status = "technical_review"
        self.application.form_data = {
            **old_form_data,
            "technical_department_selection": {
                "departments": ["BLG"],
                "selected_by": "IKL (TECHNICAL)",
            },
        }
        self.application.save(update_fields=["status", "form_data"])

        notify_application_status_change(
            self.application,
            old_status="technical_review",
            old_form_data=old_form_data,
        )

        notified_users = set(
            NotificationDelivery.objects.filter(
                channel="web",
                recipient_role="admin",
                metadata__event_status="technical_review",
            ).values_list("user", flat=True)
        )
        self.assertIn(blg_user.id, notified_users)
        self.assertNotIn(ikl_user.id, notified_users)
        self.assertNotIn(gpm_user.id, notified_users)

    def test_ikl_technical_receives_task_after_selected_units_complete(self):
        ikl_user = User.objects.create_user(
            username="ikl-after-units",
            email="ikl-after-units@example.com",
            password="Password123",
            mobile_number="0123456789",
            role="admin",
            department="IKL (TECHNICAL)",
            is_active=True,
        )
        blg_user = User.objects.create_user(
            username="blg-complete",
            email="blg-complete@example.com",
            password="Password123",
            role="admin",
            department="BLG",
            is_active=True,
        )
        memo_html = "<p>Selected unit review completed</p>"
        blg_remark = "Building sign placement is acceptable."
        self.application.status = "technical_site_visit"
        self.application.form_data = {
            **self.application.form_data,
            "technical_referral": {
                "status": "Department Reviews Completed",
                "source": "KU(IKL)",
                "target": "IKL(TECHNICAL)",
                "participating_departments": ["BLG"],
                "memo_html": memo_html,
            },
            "technical_department_selection": {
                "departments": ["BLG"],
                "selected_by": "Application Type",
            },
            "technical_department_reviews": {
                "BLG": {
                    "department": "BLG",
                    "decision": "Supported",
                    "remarks": blg_remark,
                    "reviewed_at": timezone.now().isoformat(),
                }
            },
        }
        self.application.save(update_fields=["status", "form_data"])

        self.notify_status("technical_site_visit", old_status="technical_review")

        deliveries = NotificationDelivery.objects.filter(
            recipient_role="admin",
            metadata__event_status="technical_site_visit",
        )
        notified_users = set(deliveries.values_list("user", flat=True))
        ikl_channels = set(
            deliveries.filter(user=ikl_user).values_list("channel", flat=True)
        )

        self.assertIn(ikl_user.id, notified_users)
        self.assertNotIn(blg_user.id, notified_users)
        self.assertEqual(ikl_channels, {"web", "email", "whatsapp"})
        email_delivery = deliveries.get(user=ikl_user, channel="email")
        self.assertEqual(
            email_delivery.subject,
            f"ALiS - Application {self.application.reference_no} requires IKL(TECHNICAL) review",
        )
        for delivery in deliveries.filter(user=ikl_user):
            self.assertIn(f"Remark: BLG: {blg_remark}", delivery.message)
            self.assertIn(f"Remark: BLG: {blg_remark}", delivery.metadata["message_en"])

    def test_ku_ikl_final_check_values_are_visible_to_kb_les(self):
        ku_user = User.objects.create_user(
            username="ku-final-check",
            email="ku-final@example.com",
            password="Password123",
            role="admin",
            department="KU(IKL)",
            is_active=True,
        )
        self.application.status = "technical_review_completed"
        self.application.form_data = {
            **self.application.form_data,
            "technical_ku_review": {
                "status": "Verified",
                "decision": "KU(IKL) Confirm - Send to KB(LES)",
                "checks": {
                    "application": True,
                    "sitePhoto": True,
                    "fees": True,
                    "departments": True,
                },
                "reviewed_by": "KU(IKL)",
            },
            "kb_les_verification": {
                "status": "Pending KB(LES) Verification",
                "routed_from": "KU(IKL)",
            },
        }
        self.application.save(update_fields=["status", "form_data"])

        client = APIClient()
        client.force_authenticate(user=ku_user)
        response = client.get(f"/api/applications/{self.application.id}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data["form_data"]["technical_ku_review"]["checks"],
            {
                "application": True,
                "sitePhoto": True,
                "fees": True,
                "departments": True,
            },
        )

    def test_ku_ikl_final_check_remarks_are_sent_to_kb_les_channels(self):
        kb_user = User.objects.create_user(
            username="kb-final-check",
            email="kb-final@example.com",
            password="Password123",
            mobile_number="0125557799",
            role="admin",
            department="KB(LES)",
            is_active=True,
        )
        ku_remark = "KU(IKL) final check completed. Please verify the fee and site documents."
        self.application.latest_remark = ku_remark
        self.application.form_data = {
            **self.application.form_data,
            "technical_ku_review": {
                "status": "Verified",
                "decision": "KU(IKL) Confirm - Send to KB(LES)",
                "remarks": ku_remark,
                "reviewed_by": "KU(IKL)",
            },
            "kb_les_verification": {
                "status": "Pending KB(LES) Verification",
                "routed_from": "KU(IKL)",
            },
        }
        self.application.save(update_fields=["latest_remark", "form_data"])

        self.notify_status("management_review", old_status="technical_review_completed")

        deliveries = NotificationDelivery.objects.filter(
            recipient_role="admin",
            metadata__event_status="management_review",
            user=kb_user,
        )
        self.assertEqual(
            set(deliveries.values_list("channel", flat=True)),
            {"web", "email", "whatsapp"},
        )
        for delivery in deliveries:
            self.assertIn(f"Remark: {ku_remark}", delivery.message)
            self.assertIn(f"Remark: {ku_remark}", delivery.metadata["message_en"])

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

    def test_ku_ikl_final_rejection_notifies_applicant_all_channels(self):
        self.application.latest_remark = "Rejected by KU(IKL). Please update the site details."
        self.application.form_data = {
            **self.application.form_data,
            "correction_request": {
                "source": "KU(IKL)",
                "target": "Applicant",
                "remarks": self.application.latest_remark,
            },
        }
        self.application.save(update_fields=["latest_remark", "form_data"])

        self.notify_status("rejected", old_status="ku_ikl_review")

        applicant_channels = set(
            NotificationDelivery.objects.filter(
                recipient_role="applicant",
                metadata__event_status="rejected",
            ).values_list("channel", flat=True)
        )
        self.assertEqual(applicant_channels, {"web", "email", "whatsapp"})
        web_delivery = NotificationDelivery.objects.get(
            channel="web",
            recipient_role="applicant",
            metadata__event_status="rejected",
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
        old_ku_remark = "i approve this"
        ikl_remark = "We have no objection to this application.2"
        self.application.latest_remark = old_ku_remark
        self.application.form_data = {
            **self.application.form_data,
            "technical_ku_review": {
                "remarks": old_ku_remark,
            },
            "technical_review": {
                "status": "Completed",
                "decision": "Supported",
                "remarks": ikl_remark,
                "memo_html": memo_html,
            },
        }
        self.application.save(update_fields=["latest_remark", "form_data"])

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
        for delivery in NotificationDelivery.objects.filter(
            recipient_role="admin",
            metadata__event_status="technical_review_completed",
            user=ku_user,
        ):
            self.assertIn(f"Remark: {ikl_remark}", delivery.message)
            self.assertIn(f"Remark: {ikl_remark}", delivery.metadata["message_en"])
            self.assertNotIn(old_ku_remark, delivery.message)

        client = APIClient()
        client.force_authenticate(user=ku_user)
        response = client.get("/api/notifications/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]["latest_remark"], ikl_remark)

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

    def test_rejected_payment_receipt_notifies_applicant_to_reupload_all_channels(self):
        NotificationDelivery.objects.all().delete()
        self.application.status = "invoice_generated"
        self.application.latest_remark = "Receipt image is unclear."
        self.application.form_data = {
            **self.application.form_data,
            "approval_letter": {
                "remarks": "We have no objection to this application.",
            },
            "payment": {
                "status": "Receipt Rejected",
                "receipt_decision": "Reject Receipt",
                "verification_result": "Invalid/Fake",
                "verification_notes": self.application.latest_remark,
            },
        }
        self.application.save(update_fields=["status", "latest_remark", "form_data"])

        notify_application_status_change(self.application, "payment_submitted")

        deliveries = NotificationDelivery.objects.filter(
            recipient_role="applicant",
            metadata__event_status="invoice_generated",
        )
        self.assertEqual(set(deliveries.values_list("channel", flat=True)), {"web", "email", "whatsapp"})
        self.assertIn("upload a new proof of payment", deliveries.get(channel="email").message)
        self.assertIn("Receipt image is unclear", deliveries.get(channel="web").message)
        self.assertNotIn("We have no objection", deliveries.get(channel="email").message)
        self.assertNotIn("We have no objection", deliveries.get(channel="whatsapp").message)

    def test_license_issued_notifies_applicant_ready_to_download_all_channels(self):
        self.notify_status("license_issued", old_status="payment_submitted")

        deliveries = NotificationDelivery.objects.filter(
            recipient_role="applicant",
            metadata__event_status="license_issued",
        )
        self.assertEqual(set(deliveries.values_list("channel", flat=True)), {"web", "email", "whatsapp"})
        self.assertIn("ready to download", deliveries.get(channel="email").message)

    def test_license_revoked_notifies_applicant_all_channels(self):
        self.notify_status("license_revoked", old_status="license_issued")

        deliveries = NotificationDelivery.objects.filter(
            recipient_role="applicant",
            metadata__event_status="license_revoked",
        )
        self.assertEqual(set(deliveries.values_list("channel", flat=True)), {"web", "email", "whatsapp"})
        self.assertIn("has been revoked", deliveries.get(channel="email").message)

    def test_license_restored_notifies_applicant_ready_to_download_all_channels(self):
        self.notify_status("license_issued", old_status="license_revoked")

        deliveries = NotificationDelivery.objects.filter(
            recipient_role="applicant",
            metadata__event_status="license_issued",
        )
        self.assertEqual(set(deliveries.values_list("channel", flat=True)), {"web", "email", "whatsapp"})
        self.assertIn("ready to download", deliveries.get(channel="whatsapp").message)

    def test_final_approval_notifies_pt_ikl_for_billing(self):
        memo_html = "<p>TP final approval memo for PT(IKL)</p>"
        self.application.form_data = {
            **self.application.form_data,
            "approval": {
                "status": "Approved",
                "memo_html": memo_html,
            },
        }
        self.application.save(update_fields=["form_data"])

        self.notify_status("approved", old_status="management_review")

        delivery = NotificationDelivery.objects.get(
            channel="web",
            recipient_role="admin",
            metadata__event_status="approved",
        )
        self.assertEqual(delivery.user, self.admin)
        self.assertIn("Final approval", delivery.metadata["title_en"])
        self.assertEqual(delivery.metadata["memo_html"], memo_html)
        self.assertEqual(delivery.metadata["memo_template"], "tp_pgh_to_pt_ikl")
        self.assertEqual(delivery.metadata["from"], "TP(RES)/PGH")
        self.assertEqual(delivery.metadata["to"], "PT(IKL)")

    def test_legacy_bill_pending_notifies_pt_ikl(self):
        self.notify_status("bill_pending_ku", old_status="approved")

        delivery = NotificationDelivery.objects.get(
            channel="web",
            recipient_role="admin",
            metadata__event_status="bill_pending_ku",
        )
        self.assertEqual(delivery.user, self.admin)
        self.assertIn("Bill ready", delivery.metadata["title_en"])

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
                "remarks": "proceed next",
                "memo_html": memo_html,
            },
            "kb_les_verification": {
                "status": "Pending KB(LES) Verification",
                "routed_from": "KU(IKL)",
                "memo_html": memo_html,
            },
        }
        self.application.latest_remark = "okay"
        self.application.save(update_fields=["form_data", "latest_remark"])

        self.notify_status("management_review", old_status="technical_review_completed")

        delivery = NotificationDelivery.objects.get(
            channel="web",
            recipient_role="admin",
            metadata__event_status="management_review",
            user=kb_user,
        )
        self.assertEqual(delivery.metadata["memo_html"], memo_html)
        self.assertEqual(delivery.metadata["memo_template"], "ku_ikl_final_review")
        self.assertEqual(delivery.metadata["display_status"], "management_review")
        self.assertEqual(delivery.metadata["from"], "KU(IKL)")
        self.assertEqual(delivery.metadata["to"], "KB(LES)")
        self.assertIn("Remark: proceed next", delivery.message)
        self.assertIn("Remark: proceed next", delivery.metadata["message_en"])
        self.assertNotIn("Remark: okay", delivery.message)

        client = APIClient()
        client.force_authenticate(user=kb_user)
        response = client.get("/api/notifications/")
        self.assertEqual(response.status_code, 200)
        data = response.data if isinstance(response.data, list) else response.data["results"]
        self.assertEqual(data[0]["latest_remark"], "proceed next")

    def test_management_review_does_not_use_fallback_when_staff_account_has_no_contacts(self):
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
            {"web"},
        )
        self.assertTrue(deliveries.filter(channel="web", user=kb_user).exists())
        web_delivery = deliveries.get(channel="web", user=kb_user)
        self.assertIn("KU(IKL) final checking", web_delivery.metadata["message_en"])
        self.assertIn("KB(LES) verification", web_delivery.metadata["message_en"])
        self.assertNotIn("SUT approval recorded", web_delivery.metadata["message_en"])
        self.assertFalse(deliveries.filter(channel="email").exists())
        self.assertFalse(deliveries.filter(channel="whatsapp").exists())

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
            email="tp-res@example.com",
            password="Password123",
            mobile_number="60123450001",
            role="supervisor",
            department="TP(RES)",
            is_active=True,
        )
        fin_user = User.objects.create_user(
            username="fin-approval-routing",
            email="fin-routing@example.com",
            password="Password123",
            mobile_number="60123450002",
            role="admin",
            department="FIN",
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
            "kb_les_verification": {
                "status": "Supported",
                "decision": "Verify",
                "remarks": "Verified by KB(LES), please proceed.",
            },
            "management_recommendation": {"status": "Pending TP(RES)/PGH Approval"},
        }
        self.application.latest_remark = "older remark"
        self.application.save(update_fields=["form_data", "latest_remark"])

        self.notify_status("management_review")

        deliveries = NotificationDelivery.objects.filter(
            recipient_role="admin",
            metadata__event_status="management_review",
            user=tp_user,
        )
        self.assertEqual(set(deliveries.values_list("channel", flat=True)), {"web", "email", "whatsapp"})
        self.assertFalse(
            NotificationDelivery.objects.filter(
                recipient_role="admin",
                metadata__event_status="management_review",
                user=fin_user,
            ).exists()
        )
        for delivery in deliveries:
            self.assertIn("Verified by KB(LES), please proceed.", delivery.message)
            self.assertIn("Verified by KB(LES), please proceed.", delivery.metadata["message_en"])
            self.assertNotIn("older remark", delivery.message)
        delivery = deliveries.get(channel="web")
        self.assertEqual(delivery.metadata["display_status"], "approval_support")
        self.assertEqual(delivery.metadata["to"], "TP(RES)/PGH")
        self.assertIn("TP(RES)/PGH approval", delivery.metadata["title_en"])
        self.assertIn("TP(RES)/PGH final approval", delivery.metadata["message_en"])
        self.assertNotIn("KB(LES) support", delivery.metadata["title_en"])

    def test_fin_inbox_excludes_approval_support_notifications(self):
        fin_user = User.objects.create_user(
            username="fin-inbox-filter",
            email="fin-inbox@example.com",
            password="Password123",
            mobile_number="60123450003",
            role="admin",
            department="FIN",
            is_active=True,
        )
        NotificationDelivery.objects.create(
            application=self.application,
            user=fin_user,
            event_key=f"legacy-management-review:{self.application.id}",
            recipient_role="admin",
            channel="web",
            recipient=fin_user.email,
            subject="ALiS - legacy management review",
            message=f"Application {self.application.reference_no} requires TP(RES)/PGH approval.",
            metadata={
                "event_status": "management_review",
                "display_status": "approval_support",
                "title_en": f"Application {self.application.reference_no} requires TP(RES)/PGH approval",
            },
            status="sent",
        )
        NotificationDelivery.objects.create(
            application=self.application,
            user=fin_user,
            event_key=f"payment-submitted:{self.application.id}",
            recipient_role="admin",
            channel="web",
            recipient=fin_user.email,
            subject="ALiS - payment proof submitted",
            message=f"Applicant has uploaded payment proof for application {self.application.reference_no}.",
            metadata={"event_status": "payment_submitted"},
            status="sent",
        )

        client = APIClient()
        client.force_authenticate(user=fin_user)
        response = client.get("/api/notifications/")

        self.assertEqual(response.status_code, 200)
        data = response.data if isinstance(response.data, list) else response.data["results"]
        self.assertEqual([item["metadata"]["event_status"] for item in data], ["payment_submitted"])

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
            mobile_number="60123450002",
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

        deliveries = NotificationDelivery.objects.filter(
            user=ku_user,
            metadata__event_status="technical_review_completed",
        )
        self.assertEqual(set(deliveries.values_list("channel", flat=True)), {"web", "email", "whatsapp"})
        for delivery in deliveries:
            self.assertIn("Please amend the recommendation.", delivery.message)
            self.assertIn("Please amend the recommendation.", delivery.metadata["message_en"])
            self.assertEqual(delivery.message.count("Remark:"), 1)
            self.assertEqual(delivery.metadata["message_en"].count("Remark:"), 1)
        delivery = deliveries.get(channel="web")
        self.assertEqual(
            delivery.metadata["title_en"],
            f"Application {self.application.reference_no} amendment required",
        )
        self.assertEqual(
            delivery.subject,
            f"ALiS - Application {self.application.reference_no} amendment required",
        )
        self.assertIn("returned by KB(LES)", delivery.metadata["message_en"])
        self.assertEqual(delivery.metadata["from"], "KB(LES)")
        self.assertEqual(delivery.metadata["to"], "KU(IKL)")
        self.assertEqual(delivery.metadata["memo_html"], "<p>KB(LES) return memo</p>")
        self.assertEqual(delivery.metadata["memo_template"], "kb_les_to_ku_ikl")

    def test_tp_pgh_not_support_notifies_ku_ikl_with_remarks(self):
        ku_user = User.objects.create_user(
            username="ku-ikl-tp-pgh-return",
            email="ku-tp-pgh-return@example.com",
            password="Password123",
            mobile_number="60123450003",
            role="admin",
            department="KU(IKL)",
            is_active=True,
        )
        remark = "Please revise the management recommendation."
        self.application.form_data = {
            **self.application.form_data,
            "management_recommendation": {
                "officer": "TP(RES)",
                "status": "Rejected",
                "decision": "Reject",
                "remarks": remark,
            },
            "correction_request": {
                "source": "TP(RES)",
                "target": "KU(IKL)",
                "remarks": remark,
                "memo_html": "",
            },
            "mphlg_gateway": None,
            "approval": None,
        }
        self.application.latest_remark = "older KU(IKL) remark"
        self.application.save(update_fields=["form_data", "latest_remark"])

        self.notify_status("technical_review_completed", old_status="management_review")

        deliveries = NotificationDelivery.objects.filter(
            user=ku_user,
            metadata__event_status="technical_review_completed",
        )
        self.assertEqual(set(deliveries.values_list("channel", flat=True)), {"web", "email", "whatsapp"})
        for delivery in deliveries:
            self.assertIn(remark, delivery.message)
            self.assertIn(remark, delivery.metadata["message_en"])
            self.assertNotIn("older KU(IKL) remark", delivery.message)
        delivery = deliveries.get(channel="web")
        self.assertEqual(
            delivery.metadata["title_en"],
            f"Application {self.application.reference_no} amendment required",
        )
        self.assertEqual(
            delivery.subject,
            f"ALiS - Application {self.application.reference_no} amendment required",
        )
        self.assertIn("returned by TP(RES)", delivery.metadata["message_en"])
        self.assertEqual(delivery.metadata["from"], "TP(RES)")
        self.assertEqual(delivery.metadata["to"], "KU(IKL)")

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
        self.assertEqual(
            delivery.metadata["title_en"],
            f"Application {self.application.reference_no} amendment required",
        )
        self.assertEqual(
            delivery.subject,
            f"ALiS - Application {self.application.reference_no} amendment required",
        )
        self.assertIn("returned by MPHLG", delivery.metadata["message_en"])
        self.assertEqual(delivery.metadata["from"], "MPHLG")
        self.assertEqual(delivery.metadata["to"], "KU(IKL)")
        self.assertEqual(delivery.metadata["memo_html"], memo_html)
        self.assertEqual(delivery.metadata["memo_template"], "kb_les_to_ku_ikl")

    def test_mphlg_processing_notifies_mphlg_admin(self):
        mphlg_user = User.objects.create_user(
            username="mphlg",
            email="mphlg@example.com",
            password="Password123",
            mobile_number="60123459999",
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
        remark = "I support this application."
        self.application.form_data = {
            **self.application.form_data,
            "management_recommendation": {
                "officer": "TP(RES)",
                "status": "Approved",
                "remarks": remark,
            },
            "mphlg_gateway": {
                "status": "Pending MPHLG Approval",
                "routed_from": "TP(RES)",
                "memo_html": memo_html,
            },
        }
        self.application.latest_remark = "older KU(IKL) remark"
        self.application.save(update_fields=["form_data", "latest_remark"])

        self.notify_status("mphlg_processing", old_status="management_review")

        deliveries = NotificationDelivery.objects.filter(
            recipient_role="admin",
            metadata__event_status="mphlg_processing",
            user=mphlg_user,
        )
        self.assertEqual(set(deliveries.values_list("channel", flat=True)), {"web", "email", "whatsapp"})
        for delivery in deliveries:
            self.assertIn(remark, delivery.message)
            self.assertIn(remark, delivery.metadata["message_en"])
            self.assertNotIn("older KU(IKL) remark", delivery.message)
        delivery = deliveries.get(channel="web")
        self.assertEqual(delivery.metadata["memo_html"], memo_html)
        self.assertEqual(delivery.metadata["memo_template"], "tp_pgh_to_mphlg")
        self.assertEqual(delivery.metadata["from"], "TP(RES)")
        self.assertEqual(delivery.metadata["to"], "MPHLG")

        client = APIClient()
        client.force_authenticate(user=mphlg_user)
        response = client.get("/api/notifications/")
        self.assertEqual(response.status_code, 200)
        data = response.data if isinstance(response.data, list) else response.data["results"]
        self.assertEqual(data[0]["latest_remark"], remark)

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

    def test_mphlg_approval_notifies_pt_and_dbku_management(self):
        recipients = {
            "PT(IKL)": self.admin,
        }
        for index, department in enumerate(["KU(IKL)", "KB(LES)", "TP(RES)", "PGH"], start=1):
            recipients[department] = User.objects.create_user(
                username=f"mphlg-approved-{index}",
                email=f"mphlg-approved-{index}@example.com",
                password="Password123",
                mobile_number=f"01751518{index:02d}",
                role="supervisor" if department in {"KB(LES)", "TP(RES)", "PGH"} else "admin",
                department=department,
                is_active=True,
            )

        memo_html = "<p>MPHLG approved the application</p>"
        remark = "i give approval"
        self.application.form_data = {
            **self.application.form_data,
            "mphlg_gateway": {
                "officer": "MPHLG",
                "status": "Approved",
                "decision": "Approve",
                "remarks": remark,
                "memo_html": memo_html,
            },
            "approval": {
                "officer": "MPHLG",
                "status": "Approved",
                "decision": "Approve",
                "remarks": remark,
            },
        }
        self.application.latest_remark = "older approval remark"
        self.application.save(update_fields=["form_data", "latest_remark"])

        self.notify_status("approved", old_status="mphlg_processing")

        for department, user in recipients.items():
            with self.subTest(department=department):
                deliveries = NotificationDelivery.objects.filter(
                    user=user,
                    recipient_role="admin",
                    metadata__event_status="approved",
                )
                self.assertEqual(
                    set(deliveries.values_list("channel", flat=True)),
                    {"web", "email", "whatsapp"},
                )
                for delivery in deliveries:
                    self.assertIn(remark, delivery.message)
                    self.assertIn(remark, delivery.metadata["message_en"])
                    self.assertNotIn("older approval remark", delivery.message)
                web_delivery = deliveries.get(channel="web")
                self.assertIn("approved by MPHLG", web_delivery.metadata["title_en"])
                self.assertIn("approved by MPHLG", web_delivery.metadata["message_en"])
                self.assertIn(remark, web_delivery.metadata["message_ms"])
                self.assertEqual(web_delivery.metadata["from"], "MPHLG")

                client = APIClient()
                client.force_authenticate(user=user)
                response = client.get("/api/notifications/")
                self.assertEqual(response.status_code, 200)
                data = response.data if isinstance(response.data, list) else response.data["results"]
                approved_notifications = [
                    item for item in data
                    if item.get("reference_no") == self.application.reference_no
                    and item.get("status") == "approved"
                ]
                self.assertTrue(approved_notifications)
                self.assertEqual(approved_notifications[0]["latest_remark"], remark)

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
        self.assertEqual(delivery.metadata["to"], "TP(RES)/PGH")
        self.assertIn("TP(RES)/PGH approval", delivery.metadata["title_en"])


@override_settings(NOTIFICATION_SIDE_EFFECTS_ENABLED=True)
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


class ApplicantRegistrationNotificationTests(TestCase):
    @override_settings(NOTIFICATION_EMAIL_ENABLED=False, WHATSAPP_ENABLED=False)
    def test_registration_success_creates_applicant_email_and_whatsapp_deliveries(self):
        account = User.objects.create_user(
            username="950101135555",
            email="applicant@example.com",
            password="Password123",
            mobile_number="0175151829",
            role="applicant",
            first_name="NEW",
            last_name="APPLICANT",
        )

        notify_applicant_registration_success(account)

        deliveries = NotificationDelivery.objects.filter(
            metadata__event_status="registration_success",
            recipient_role="applicant",
        )
        self.assertEqual(deliveries.count(), 3)
        self.assertEqual(set(deliveries.values_list("channel", flat=True)), {"web", "email", "whatsapp"})
        self.assertEqual(NotificationDelivery.objects.get(channel="web").status, "sent")
        self.assertEqual(set(deliveries.exclude(channel="web").values_list("status", flat=True)), {"skipped"})

        client = APIClient()
        client.force_authenticate(user=account)
        response = client.get("/api/notifications/")

        self.assertEqual(response.status_code, 200)
        data = response.data if isinstance(response.data, list) else response.data["results"]
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["metadata"]["event_status"], "registration_success")


class FreshApplicantSubmitNotificationTests(TestCase):
    @override_settings(NOTIFICATION_SIDE_EFFECTS_ENABLED=False, NOTIFICATION_EMAIL_ENABLED=False, WHATSAPP_ENABLED=False)
    def test_fresh_submit_notification_works_without_legacy_workflow_switch(self):
        applicant = User.objects.create_user(
            username="fresh-applicant",
            email="fresh@example.com",
            password="Password123",
            mobile_number="0175151829",
            role="applicant",
        )
        application = Application.objects.create(
            applicant=applicant,
            title="Fresh application",
            status="submitted",
            form_data={},
        )

        notify_applicant_application_submitted(application)

        deliveries = NotificationDelivery.objects.filter(
            metadata__event_status="applicant_submitted",
            recipient_role="applicant",
        )
        self.assertEqual(deliveries.count(), 3)
        self.assertEqual(set(deliveries.values_list("channel", flat=True)), {"web", "email", "whatsapp"})
        self.assertEqual(NotificationDelivery.objects.get(channel="web").status, "sent")
        self.assertEqual(set(deliveries.exclude(channel="web").values_list("status", flat=True)), {"skipped"})

        client = APIClient()
        client.force_authenticate(user=applicant)
        response = client.get("/api/notifications/")

        self.assertEqual(response.status_code, 200)
        data = response.data if isinstance(response.data, list) else response.data["results"]
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["metadata"]["event_status"], "applicant_submitted")


@override_settings(
    NOTIFICATION_SIDE_EFFECTS_ENABLED=True,
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
        self.tp_res_supervisor = User.objects.create_user(
            username="tp-res-renewal",
            email="tp-res@example.com",
            password="Password123",
            role="supervisor",
            department="TP(RES)",
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
        self.assertFalse(
            NotificationDelivery.objects.filter(
                channel="web",
                user=self.tp_res_supervisor,
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
