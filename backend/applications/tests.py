from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import Application


class ApplicationReferenceTests(TestCase):
    def test_reference_generation_does_not_reuse_deleted_count_gap(self):
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

        self.assertEqual(second.reference_no, "FT-00002")
        self.assertEqual(draft.reference_no, "FT-00003")

    def test_reference_generation_uses_highest_existing_reference_number(self):
        User = get_user_model()
        applicant = User.objects.create_user(
            username="high-reference-user",
            password="testpass123",
            role="applicant",
        )

        Application.objects.create(
            applicant=applicant,
            reference_no="FT-00100",
            title="Existing imported application",
        )

        draft = Application.objects.create(
            applicant=applicant,
            title="Draft Sitting Application",
        )

        self.assertEqual(draft.reference_no, "FT-00101")

    def test_application_list_includes_applicant_full_name(self):
        User = get_user_model()
        applicant = User.objects.create_user(
            username="020215130135",
            password="testpass123",
            role="applicant",
            first_name="ALI",
            last_name="AHMAD",
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
        )

        client = APIClient()
        client.force_authenticate(user=staff)
        response = client.get("/api/applications/")

        self.assertEqual(response.status_code, 200)
        data = response.data if isinstance(response.data, list) else response.data["results"]
        self.assertEqual(data[0]["applicant_username"], "020215130135")
        self.assertEqual(data[0]["applicant_full_name"], "ALI AHMAD")
