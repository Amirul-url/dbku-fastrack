from types import SimpleNamespace

from django.test import SimpleTestCase
from rest_framework.exceptions import PermissionDenied

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

    def test_applicant_cannot_update_submitted_application_form(self):
        with self.assertRaises(PermissionDenied):
            ensure_applicant_can_update(
                application("submitted"),
                user("applicant"),
                {"form_data": {"step_1": {"project_name": "Updated"}}},
            )
