from types import SimpleNamespace

from django.test import SimpleTestCase

from applications.services.documents import (
    can_delete_application_document,
    can_upload_application_document,
)


def user(role):
    return SimpleNamespace(role=role)


def application(status):
    return SimpleNamespace(status=status)


class ApplicationDocumentServiceTests(SimpleTestCase):
    def test_staff_can_upload_and_delete_documents(self):
        staff_user = user("admin")
        submitted_application = application("submitted")

        self.assertTrue(
            can_upload_application_document(staff_user, submitted_application, "Document")
        )
        self.assertTrue(can_delete_application_document(staff_user, submitted_application))

    def test_applicant_can_upload_documents_only_during_editable_statuses(self):
        applicant = user("applicant")

        self.assertTrue(
            can_upload_application_document(applicant, application("draft"), "Document")
        )
        self.assertFalse(
            can_upload_application_document(applicant, application("submitted"), "Document")
        )

    def test_applicant_can_upload_payment_receipt_after_invoice(self):
        applicant = user("applicant")

        self.assertTrue(
            can_upload_application_document(
                applicant,
                application("invoice_generated"),
                "Payment Receipt",
            )
        )
        self.assertFalse(
            can_upload_application_document(
                applicant,
                application("invoice_generated"),
                "Supporting Document",
            )
        )

    def test_applicant_can_delete_documents_during_payment_receipt_statuses(self):
        applicant = user("applicant")

        self.assertTrue(can_delete_application_document(applicant, application("payment_submitted")))
        self.assertFalse(can_delete_application_document(applicant, application("submitted")))
