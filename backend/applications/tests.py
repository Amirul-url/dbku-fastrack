from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from notifications.models import NotificationDelivery

from .models import Application


class ApplicationReferenceTests(TestCase):
    def test_reference_generation_does_not_reuse_deleted_count_gap(self):
        year = timezone.now().year
        User = get_user_model()
        applicant = User.objects.create_user(
            username="draft-user",
            password="testpass123",
            role="applicant",
        )

        first = Application.objects.create(
            applicant=applicant,
            title="First",
        )
        second = Application.objects.create(
            applicant=applicant,
            title="Second",
        )

        first.delete()

        draft = Application.objects.create(
            applicant=applicant,
            title="Draft Sitting Application",
        )

        self.assertEqual(second.reference_no, f"ALiS.{year}-0002")
        self.assertEqual(draft.reference_no, f"ALiS.{year}-0003")

    def test_reference_generation_uses_highest_existing_reference_number(self):
        year = timezone.now().year
        User = get_user_model()
        applicant = User.objects.create_user(
            username="high-reference-user",
            password="testpass123",
            role="applicant",
        )

        Application.objects.create(
            applicant=applicant,
            reference_no=f"ALiS.{year}-0100",
            title="Existing imported application",
        )

        draft = Application.objects.create(
            applicant=applicant,
            title="Draft Sitting Application",
        )

        self.assertEqual(draft.reference_no, f"ALiS.{year}-0101")

    def test_application_list_includes_form_applicant_name_before_nric_username(self):
        User = get_user_model()
        applicant = User.objects.create_user(
            username="020215130135",
            password="testpass123",
            role="applicant",
        )
        staff = User.objects.create_user(
            username="pt-ikl",
            password="testpass123",
            role="admin",
            department="PT(IKL)",
            is_staff=True,
        )
        Application.objects.create(
            applicant=applicant,
            title="LED signage",
            status="submitted",
            form_data={
                "step_1": {
                    "applicant": "ALI AHMAD",
                },
            },
        )

        client = APIClient()
        client.force_authenticate(user=staff)
        response = client.get("/api/applications/")

        self.assertEqual(response.status_code, 200)
        data = response.data if isinstance(response.data, list) else response.data["results"]
        self.assertEqual(data[0]["applicant_username"], "020215130135")
        self.assertEqual(data[0]["applicant_full_name"], "ALI AHMAD")

    def test_applicant_submit_marks_application_submitted(self):
        User = get_user_model()
        applicant = User.objects.create_user(
            username="route-to-ku",
            password="testpass123",
            role="applicant",
        )
        application = Application.objects.create(
            applicant=applicant,
            title="LED signage",
            status="draft",
        )

        client = APIClient()
        client.force_authenticate(user=applicant)
        response = client.post(f"/api/applications/{application.id}/submit/")

        self.assertEqual(response.status_code, 200)
        application.refresh_from_db()
        self.assertEqual(application.status, "submitted")


@override_settings(NOTIFICATION_SIDE_EFFECTS_ENABLED=False, NOTIFICATION_EMAIL_ENABLED=False, WHATSAPP_ENABLED=False)
class ApplicantForcedNotificationWorkflowTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.applicant = User.objects.create_user(
            username="applicant-notify",
            email="applicant-notify@example.com",
            password="testpass123",
            mobile_number="0175151829",
            role="applicant",
        )
        self.ku_ikl = User.objects.create_user(
            username="ku-ikl-notify",
            email="ku-ikl@example.com",
            password="testpass123",
            mobile_number="0161112222",
            role="admin",
            department="KU(IKL)",
            is_active=True,
        )

    def test_applicant_resubmit_creates_web_email_and_whatsapp_deliveries(self):
        application = Application.objects.create(
            applicant=self.applicant,
            title="Rejected application",
            status="rejected",
            form_data={"correction_request": {"remarks": "Please update."}},
        )

        client = APIClient()
        client.force_authenticate(user=self.applicant)
        response = client.patch(
            f"/api/applications/{application.id}/",
            {
                "status": "submitted",
                "form_data": {
                    "step_11": {"submitted": True},
                    "correction_request": None,
                },
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        application.refresh_from_db()
        self.assertEqual(application.status, "submitted")
        deliveries = NotificationDelivery.objects.filter(
            application=application,
            recipient_role="applicant",
            metadata__event_status="applicant_resubmitted",
        )
        self.assertEqual(deliveries.count(), 3)
        self.assertEqual(set(deliveries.values_list("channel", flat=True)), {"web", "email", "whatsapp"})

        staff_deliveries = NotificationDelivery.objects.filter(
            application=application,
            recipient_role="admin",
            metadata__event_status="submitted",
        )
        self.assertEqual(staff_deliveries.count(), 3)
        self.assertEqual(set(staff_deliveries.values_list("channel", flat=True)), {"web", "email", "whatsapp"})
        self.assertEqual(staff_deliveries.get(channel="web").user, self.ku_ikl)
        staff_message = staff_deliveries.get(channel="email").message
        self.assertEqual(
            staff_message,
            f"Application {application.reference_no} has been resubmitted by the applicant and is ready for KU(IKL) review.",
        )
        self.assertNotIn("Reference:", staff_message)
        self.assertNotIn("Status:", staff_message)
        self.assertNotIn("Project:", staff_message)

    def test_ku_ikl_reject_creates_applicant_web_email_and_whatsapp_deliveries(self):
        application = Application.objects.create(
            applicant=self.applicant,
            title="KU(IKL) review application",
            status="ku_ikl_review",
        )

        client = APIClient()
        client.force_authenticate(user=self.ku_ikl)
        response = client.patch(
            f"/api/applications/{application.id}/",
            {
                "status": "rejected",
                "latest_remark": "Please revise the application.",
                "form_data": {
                    "correction_request": {
                        "source": "KU(IKL)",
                        "target": "Applicant",
                        "remarks": "Please revise the application.",
                    }
                },
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        application.refresh_from_db()
        self.assertEqual(application.status, "rejected")
        activity_log = application.form_data.get("activity_log", [])
        self.assertEqual(activity_log[0]["title"], "Application rejected by KU(IKL)")
        self.assertEqual(activity_log[0]["category"], "workflow")
        self.assertIn("reviewed and rejected by KU(IKL)", activity_log[0]["description"])
        deliveries = NotificationDelivery.objects.filter(
            application=application,
            recipient_role="applicant",
            metadata__event_status="rejected",
        )
        self.assertEqual(deliveries.count(), 3)
        self.assertEqual(set(deliveries.values_list("channel", flat=True)), {"web", "email", "whatsapp"})
