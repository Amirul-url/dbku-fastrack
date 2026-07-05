from django.http import Http404
from django.test import TestCase

from accounts.models import User
from applications.models import Application, SupportingDocument
from applications.services.license_verification import (
    get_public_license_document,
    normalize_license_id,
)


class ApplicationLicenseVerificationServiceTests(TestCase):
    def setUp(self):
        self.applicant = User.objects.create_user(
            username="900101131234",
            email="applicant@example.com",
            password="Password123",
            role="applicant",
        )
        self.application = Application.objects.create(
            applicant=self.applicant,
            title="Verified license",
            status="license_issued",
        )
        self.document = SupportingDocument.objects.create(
            application=self.application,
            title="Advertisement License",
            file="supporting_documents/license.pdf",
        )
        self.application.form_data = {
            "license": {
                "license_id": "alis202600001",
                "license_file": {"document_id": self.document.id},
            }
        }
        self.application.save(update_fields=["form_data"])

    def test_normalizes_license_id(self):
        self.assertEqual(normalize_license_id(" alis202600001 "), "ALIS202600001")

    def test_finds_license_document_case_insensitively(self):
        application, document = get_public_license_document(" ALIS202600001 ")

        self.assertEqual(application, self.application)
        self.assertEqual(document, self.document)

    def test_supports_legacy_license_file_id_key(self):
        self.application.form_data = {
            "license": {
                "license_id": "ALIS202600002",
                "license_file": {"id": self.document.id},
            }
        }
        self.application.save(update_fields=["form_data"])

        _application, document = get_public_license_document("alis202600002")

        self.assertEqual(document, self.document)

    def test_raises_404_when_license_is_missing(self):
        with self.assertRaisesMessage(Http404, "Advertisement license not found."):
            get_public_license_document("UNKNOWN")

    def test_raises_404_when_matching_license_has_no_document(self):
        self.application.form_data = {
            "license": {
                "license_id": "ALIS202600003",
                "license_file": {},
            }
        }
        self.application.save(update_fields=["form_data"])

        with self.assertRaisesMessage(Http404, "Advertisement license document not found."):
            get_public_license_document("ALIS202600003")

    def test_raises_404_when_document_belongs_to_another_application(self):
        other_application = Application.objects.create(
            applicant=self.applicant,
            title="Other license",
            status="license_issued",
        )
        other_document = SupportingDocument.objects.create(
            application=other_application,
            title="Advertisement License",
            file="supporting_documents/other-license.pdf",
        )
        self.application.form_data = {
            "license": {
                "license_id": "ALIS202600004",
                "license_file": {"document_id": other_document.id},
            }
        }
        self.application.save(update_fields=["form_data"])

        with self.assertRaises(Http404):
            get_public_license_document("ALIS202600004")
