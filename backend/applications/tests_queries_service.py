from django.test import TestCase

from accounts.models import User
from applications.models import Application, SupportingDocument
from applications.services.queries import (
    build_application_queryset,
    parse_list_query_values,
)


class ApplicationQueryServiceTests(TestCase):
    def setUp(self):
        self.applicant = User.objects.create_user(
            username="900101131234",
            email="applicant@example.com",
            password="Password123",
            first_name="Siti",
            last_name="Aminah",
            role="applicant",
        )
        self.other_applicant = User.objects.create_user(
            username="900101131235",
            email="other@example.com",
            password="Password123",
            first_name="Ali",
            last_name="Rahman",
            role="applicant",
        )
        self.staff = User.objects.create_user(
            username="staff",
            email="staff@example.com",
            password="Password123",
            role="admin",
            department="PT(IKL)",
        )
        self.own_draft = Application.objects.create(
            applicant=self.applicant,
            title="Own draft",
            status="draft",
            application_type="sitting_application",
        )
        self.own_submitted = Application.objects.create(
            applicant=self.applicant,
            title="Waterfront LED",
            project_location="Kuching Waterfront",
            status="submitted",
            application_type="signboard_license",
        )
        self.other_submitted = Application.objects.create(
            applicant=self.other_applicant,
            title="Mall Banner",
            project_location="Satok Mall",
            status="submitted",
            application_type="sitting_application",
        )

    def test_parse_list_query_values_splits_commas_and_ignores_blanks(self):
        self.assertEqual(
            parse_list_query_values(["submitted, approved", "", "draft"]),
            ["submitted", "approved", "draft"],
        )

    def test_applicant_queryset_only_includes_own_applications(self):
        queryset = build_application_queryset(self.applicant)

        self.assertEqual(
            set(queryset.values_list("id", flat=True)),
            {self.own_draft.id, self.own_submitted.id},
        )

    def test_staff_queryset_includes_non_drafts_and_own_drafts_only(self):
        staff_draft = Application.objects.create(
            applicant=self.staff,
            title="Staff draft",
            status="draft",
        )

        queryset = build_application_queryset(self.staff)

        self.assertEqual(
            set(queryset.values_list("id", flat=True)),
            {staff_draft.id, self.own_submitted.id, self.other_submitted.id},
        )

    def test_filters_status_application_type_and_search(self):
        queryset = build_application_queryset(
            self.staff,
            statuses=["submitted"],
            application_types=["signboard_license"],
            search="waterfront",
        )

        self.assertEqual(list(queryset), [self.own_submitted])

    def test_search_matches_applicant_identity(self):
        queryset = build_application_queryset(self.staff, search="other@example.com")

        self.assertEqual(list(queryset), [self.other_submitted])

    def test_detail_queryset_prefetches_supporting_documents(self):
        SupportingDocument.objects.create(
            application=self.own_submitted,
            title="Site Image",
            file="supporting_documents/site.jpg",
        )

        queryset = build_application_queryset(self.applicant, include_documents=True)

        self.assertIn("supporting_documents", queryset._prefetch_related_lookups)
