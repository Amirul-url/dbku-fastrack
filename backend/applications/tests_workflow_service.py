from types import SimpleNamespace

from django.test import SimpleTestCase
from rest_framework.exceptions import PermissionDenied, ValidationError

from applications.services.workflow import (
    ensure_applicant_can_update,
    ensure_staff_can_update_workflow,
    is_management_support_memo_save,
)


def user(role, department=""):
    return SimpleNamespace(role=role, department=department, username=department)


def application(status, form_data=None):
    return SimpleNamespace(status=status, form_data=form_data or {})


class ApplicationWorkflowServiceTests(SimpleTestCase):
    def test_staff_update_is_ignored_for_applicants(self):
        ensure_staff_can_update_workflow(
            application("management_review"),
            user("applicant"),
            {"status": "approved"},
        )

    def test_only_pt_ikl_can_generate_bill(self):
        ensure_staff_can_update_workflow(
            application("approved"),
            user("admin", "PT(IKL)"),
            {"status": "bill_pending_ku"},
        )

        with self.assertRaises(PermissionDenied):
            ensure_staff_can_update_workflow(
                application("approved"),
                user("admin", "KU(IKL)"),
                {"status": "bill_pending_ku"},
            )

    def test_only_mphlg_can_approve_during_mphlg_processing(self):
        ensure_staff_can_update_workflow(
            application("mphlg_processing"),
            user("admin", "MPHLG"),
            {"status": "approved"},
        )

        with self.assertRaises(PermissionDenied):
            ensure_staff_can_update_workflow(
                application("mphlg_processing"),
                user("admin", "PT(IKL)"),
                {"status": "approved"},
            )

    def test_management_support_memo_save_allows_draft_note_only(self):
        app = application(
            "management_review",
            form_data={
                "management_recommendation": {
                    "approval_note_html": "",
                    "status": "",
                    "decision": "",
                }
            },
        )
        request_data = {
            "form_data": {
                "management_recommendation": {
                    "approval_note_html": "<p>Draft note</p>",
                    "status": "",
                    "decision": "",
                }
            }
        }

        self.assertTrue(
            is_management_support_memo_save(app, "TP(RES)", request_data)
        )

    def test_applicant_can_update_payment_proof_after_invoice(self):
        ensure_applicant_can_update(
            application("invoice_generated"),
            user("applicant"),
            {"status": "payment_submitted", "form_data": {"payment": {"receipt_reference": "R1"}}},
        )

    def test_only_fin_can_verify_or_reject_payment_receipt(self):
        ensure_staff_can_update_workflow(
            application("payment_submitted"),
            user("admin", "FIN"),
            {"status": "payment_verified"},
        )
        ensure_staff_can_update_workflow(
            application("payment_submitted"),
            user("admin", "FIN"),
            {"status": "invoice_generated"},
        )

        with self.assertRaises(PermissionDenied):
            ensure_staff_can_update_workflow(
                application("payment_submitted"),
                user("admin", "PT(IKL)"),
                {"status": "payment_verified"},
            )

        with self.assertRaises(PermissionDenied):
            ensure_staff_can_update_workflow(
                application("payment_submitted"),
                user("admin", "PT(IKL)"),
                {"status": "invoice_generated"},
            )

    def test_only_pt_ikl_can_issue_license_after_payment_verified(self):
        ensure_staff_can_update_workflow(
            application("payment_verified"),
            user("admin", "PT(IKL)"),
            {"status": "license_issued"},
        )

        with self.assertRaises(PermissionDenied):
            ensure_staff_can_update_workflow(
                application("payment_verified"),
                user("admin", "FIN"),
                {"status": "license_issued"},
            )

    def test_applicant_can_request_license_revocation_after_license_issued(self):
        ensure_applicant_can_update(
            application("license_issued"),
            user("applicant"),
            {"form_data": {"license_revocation_request": {"status": "pending"}}},
        )

    def test_applicant_cannot_request_license_revocation_before_license_issued(self):
        with self.assertRaises(PermissionDenied):
            ensure_applicant_can_update(
                application("approved"),
                user("applicant"),
                {"form_data": {"license_revocation_request": {"status": "pending"}}},
            )

    def test_ikl_technical_cannot_complete_review_without_site_photo(self):
        app = application(
            "technical_site_visit",
            form_data={
                "technical_site_visit": {
                    "application_subtype": "free_standing_billboard",
                    "fee_total": "7600",
                    "payable_total": "12610",
                    "site_remarks": "Supported.",
                    "advertisement_rows": [
                        {
                            "display_type": "non_led",
                            "subtype": "free_standing_billboard",
                            "width_ft": "11.7",
                            "height_ft": "92",
                        }
                    ],
                },
                "technical_review": {
                    "digital_signature": {"document_id": 1},
                },
            },
        )

        with self.assertRaises(ValidationError):
            ensure_staff_can_update_workflow(
                app,
                user("admin", "IKL (TECHNICAL)"),
                {
                    "status": "technical_review_completed",
                    "form_data": app.form_data,
                },
            )

    def test_ikl_technical_can_complete_review_when_site_visit_is_complete(self):
        app = application(
            "technical_site_visit",
            form_data={
                "technical_site_visit": {
                    "site_photos": [{"document_id": 1, "name": "site.jpg"}],
                    "application_subtype": "free_standing_billboard",
                    "fee_total": "7600",
                    "payable_total": "12610",
                    "site_remarks": "Supported.",
                    "advertisement_rows": [
                        {
                            "display_type": "non_led",
                            "subtype": "free_standing_billboard",
                            "width_ft": "11.7",
                            "height_ft": "92",
                        }
                    ],
                },
                "technical_review": {
                    "digital_signature": {"document_id": 1},
                },
            },
        )

        ensure_staff_can_update_workflow(
            app,
            user("admin", "IKL (TECHNICAL)"),
            {
                "status": "technical_review_completed",
                "form_data": app.form_data,
            },
        )

    def test_applicant_cannot_update_submitted_application_form(self):
        with self.assertRaises(PermissionDenied):
            ensure_applicant_can_update(
                application("submitted"),
                user("applicant"),
                {"form_data": {"step_1": {"project_name": "Updated"}}},
            )
