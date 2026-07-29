from django.http import Http404
from django.test import TestCase

from accounts.models import User
from applications.models import Application, SupportingDocument
from applications.services.license_verification import (
    get_public_license_document,
    normalize_license_id,
)


class ApplicationLicenseVerificationServiceTests(TestCase):
    generated_license_html = (
        "<html>"
        "<body>"
        "<h1>Borang B</h1>"
        "<p>Lesen Pengiklanan</p>"
        "<h2>LAMPIRAN A</h2>"
        "<p>SYARAT-SYARAT LESEN PENGIKLANAN</p>"
        "</body>"
        "</html>"
    )

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
        self.application.form_data = {
            "license": {
                "license_id": "alis202600001",
                "license_file": None,
                "manual_license": {
                    "name": "Advertisement License",
                    "document_html": self.generated_license_html,
                },
            }
        }
        self.application.save(update_fields=["form_data"])

    def test_normalizes_license_id(self):
        self.assertEqual(normalize_license_id(" alis202600001 "), "ALIS202600001")

    def test_finds_generated_license_document_case_insensitively(self):
        application, document = get_public_license_document(" ALIS202600001 ")

        self.assertEqual(application, self.application)
        self.assertTrue(document.is_generated)
        self.assertEqual(document.html, self.generated_license_html)
        self.assertEqual(document.name, "Advertisement License")

    def test_supports_legacy_license_file_id_key(self):
        stored_document = SupportingDocument.objects.create(
            application=self.application,
            title="Advertisement License",
            file="supporting_documents/legacy-license.pdf",
        )
        self.application.form_data = {
            "license": {
                "license_id": "ALIS202600002",
                "license_file": {"id": stored_document.id},
            }
        }
        self.application.save(update_fields=["form_data"])

        _application, document = get_public_license_document("alis202600002")

        self.assertEqual(document.supporting_document, stored_document)
        self.assertFalse(document.is_generated)

    def test_supports_generated_manual_license_document(self):
        self.application.form_data = {
            "license": {
                "license_id": "ALIS202600005",
                "license_file": None,
                "manual_license": {
                    "name": "Advertisement License",
                    "document_html": self.generated_license_html,
                },
            }
        }
        self.application.save(update_fields=["form_data"])

        _application, document = get_public_license_document("alis202600005")

        self.assertTrue(document.is_generated)
        self.assertEqual(document.html, self.generated_license_html)
        self.assertEqual(document.name, "Advertisement License")

    def test_prefers_completed_renewal_license_document(self):
        old_license_html = "<html><body>Old Advertisement License</body></html>"
        renewed_license_html = "<html><body>Renewed Advertisement License</body></html>"
        self.application.form_data = {
            "license": {
                "license_id": "ALIS202600006",
                "status": "Active",
                "license_file": None,
                "manual_license": {
                    "name": "Advertisement License",
                    "document_html": old_license_html,
                },
            },
            "license_renewal": {
                "payment": {
                    "status": "completed",
                    "manual_advertisement_license": {
                        "name": "Renewal Advertisement License",
                        "document_html": renewed_license_html,
                    },
                },
            },
        }
        self.application.save(update_fields=["form_data"])

        _application, document = get_public_license_document("alis202600006")

        self.assertTrue(document.is_generated)
        self.assertEqual(document.html, renewed_license_html)
        self.assertEqual(document.name, "Renewal Advertisement License")

    def test_ignores_uncompleted_renewal_license_document(self):
        old_license_html = "<html><body>Old Advertisement License</body></html>"
        renewed_license_html = "<html><body>Draft Renewal Advertisement License</body></html>"
        self.application.form_data = {
            "license": {
                "license_id": "ALIS202600007",
                "status": "Active",
                "license_file": None,
                "manual_license": {
                    "name": "Advertisement License",
                    "document_html": old_license_html,
                },
            },
            "license_renewal": {
                "payment": {
                    "status": "verified",
                    "manual_advertisement_license": {
                        "name": "Draft Renewal Advertisement License",
                        "document_html": renewed_license_html,
                    },
                },
            },
        }
        self.application.save(update_fields=["form_data"])

        _application, document = get_public_license_document("alis202600007")

        self.assertTrue(document.is_generated)
        self.assertEqual(document.html, old_license_html)
        self.assertEqual(document.name, "Advertisement License")

    def test_raises_404_when_license_is_missing(self):
        with self.assertRaisesMessage(Http404, "Advertisement license not found."):
            get_public_license_document("UNKNOWN")

    def test_raises_404_when_application_license_is_revoked(self):
        self.application.status = "license_revoked"
        self.application.form_data["license"]["status"] = "Revoked"
        self.application.save(update_fields=["status", "form_data"])

        with self.assertRaisesMessage(Http404, "Advertisement license is not active."):
            get_public_license_document("ALIS202600001")

    def test_raises_404_when_license_data_is_revoked(self):
        self.application.form_data["license"]["status"] = "Revoked"
        self.application.save(update_fields=["form_data"])

        with self.assertRaisesMessage(Http404, "Advertisement license is not active."):
            get_public_license_document("ALIS202600001")

    def test_raises_404_when_license_data_is_expired(self):
        self.application.form_data["license"]["status"] = "Expired"
        self.application.save(update_fields=["form_data"])

        with self.assertRaisesMessage(Http404, "Advertisement license has expired."):
            get_public_license_document("ALIS202600001")

    def test_raises_404_when_active_license_expiry_date_has_passed(self):
        self.application.form_data["license"]["status"] = "Active"
        self.application.form_data["license"]["expiry_date"] = "2000-01-01T00:00:00+00:00"
        self.application.save(update_fields=["form_data"])

        with self.assertRaisesMessage(Http404, "Advertisement license has expired."):
            get_public_license_document("ALIS202600001")

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
