from django.contrib.auth import get_user_model
from django.test import TestCase

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
