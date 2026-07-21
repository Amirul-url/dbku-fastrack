import tempfile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
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
            first_name="REGISTERED",
            last_name="NAME",
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
                "auto_screening": {
                    "result": "PT(IKL) Send to KU(IKL)",
                    "checked_at": "2026-06-12T01:00:00Z",
                },
                "technical_review": {
                    "decision": "Supported",
                    "reviewed_at": "2026-06-12T02:00:00Z",
                },
                "technical_ku_review": {
                    "decision": "KU(IKL) Confirm - Send to KB(LES)",
                    "reviewed_at": "2026-06-12T03:00:00Z",
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
        self.assertEqual(data[0]["applicant_registered_name"], "REGISTERED NAME")
        self.assertEqual(data[0]["auto_screening"]["result"], "PT(IKL) Send to KU(IKL)")
        self.assertEqual(data[0]["technical_review"]["decision"], "Supported")
        self.assertEqual(
            data[0]["technical_ku_review"]["decision"],
            "KU(IKL) Confirm - Send to KB(LES)",
        )

    def test_application_list_uses_submitting_person_before_organisation_name(self):
        User = get_user_model()
        applicant = User.objects.create_user(
            username="020215130135",
            password="testpass123",
            role="applicant",
            first_name="REGISTERED",
            last_name="NAME",
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
            title="Waterfront hotel signage",
            status="submitted",
            form_data={
                "step_1": {
                    "applicant": "WATERFRONT HOTEL",
                    "project_name": "PERMOHONAN PEMASANGAN BILLBOARD WATERFRONT HOTEL KUCHING",
                },
                "step_3": {
                    "org_name": "THE WATERFRONT HOTEL",
                    "full_name": "MUHAMMAD AMIRUL AQMAL BIN ABDUL LATIP",
                },
            },
        )

        client = APIClient()
        client.force_authenticate(user=staff)
        response = client.get("/api/applications/")

        self.assertEqual(response.status_code, 200)
        data = response.data if isinstance(response.data, list) else response.data["results"]
        self.assertEqual(
            data[0]["applicant_full_name"],
            "MUHAMMAD AMIRUL AQMAL BIN ABDUL LATIP",
        )
        self.assertNotEqual(data[0]["applicant_full_name"], "THE WATERFRONT HOTEL")

    def test_application_detail_strips_digital_signature_data_url(self):
        User = get_user_model()
        applicant = User.objects.create_user(
            username="signature-applicant",
            password="testpass123",
            role="applicant",
        )
        staff = User.objects.create_user(
            username="tp-res",
            password="testpass123",
            role="admin",
            department="TP(RES)",
            is_staff=True,
        )
        signature_data_url = "data:image/png;base64,abc123"
        preview_data_url = "data:image/png;base64,preview123"
        application = Application.objects.create(
            applicant=applicant,
            title="LED signage",
            status="management_review",
            form_data={
                "management_recommendation": {
                    "status": "Approved",
                    "digital_signature": {
                        "mode": "draw",
                        "dataUrl": signature_data_url,
                    },
                },
                "technical_site_visit": {
                    "site_image_preview": preview_data_url,
                },
            },
        )

        client = APIClient()
        client.force_authenticate(user=staff)
        response = client.get(f"/api/applications/{application.id}/")

        self.assertEqual(response.status_code, 200)
        form_data = response.data["form_data"]
        self.assertEqual(
            form_data["management_recommendation"]["digital_signature"]["dataUrl"],
            "",
        )
        self.assertEqual(form_data["technical_site_visit"]["site_image_preview"], "")

    def test_digital_signature_update_replaces_legacy_data_url(self):
        User = get_user_model()
        applicant = User.objects.create_user(
            username="signature-update-applicant",
            password="testpass123",
            role="applicant",
        )
        staff = User.objects.create_user(
            username="signature-update-staff",
            password="testpass123",
            role="admin",
            department="KB(LES)",
            is_staff=True,
        )
        application = Application.objects.create(
            applicant=applicant,
            title="LED signage",
            status="management_review",
            form_data={
                "management_recommendation": {
                    "digital_signature": {
                        "mode": "draw",
                        "dataUrl": "data:image/png;base64,abc123",
                    },
                },
            },
        )

        client = APIClient()
        client.force_authenticate(user=staff)
        response = client.patch(
            f"/api/applications/{application.id}/",
            {
                "form_data": {
                    "management_recommendation": {
                        "digital_signature": {
                            "mode": "draw",
                            "document_id": 123,
                            "file_url": "/media/supporting_documents/signature.png",
                        },
                    },
                },
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        application.refresh_from_db()
        signature = application.form_data["management_recommendation"]["digital_signature"]
        self.assertNotIn("dataUrl", signature)
        self.assertEqual(signature["document_id"], 123)

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


class LicenseRenewalEarlyPaymentReceiptUploadTests(TestCase):
    def setUp(self):
        self.media_root = tempfile.TemporaryDirectory()
        self.override = override_settings(MEDIA_ROOT=self.media_root.name)
        self.override.enable()
        User = get_user_model()
        self.applicant = User.objects.create_user(
            username="renewal-receipt-applicant",
            password="testpass123",
            role="applicant",
        )
        self.application = Application.objects.create(
            applicant=self.applicant,
            title="Renewal receipt application",
            status="license_issued",
            form_data={
                "payment": {
                    "receipt_file": {
                        "name": "OriginalReceipt.jpg",
                        "document_id": 111,
                    },
                },
                "license_renewal": {
                    "reminders": {
                        "3": {
                            "status": "released_to_applicant",
                            "letter": {
                                "title": "1st Reminder",
                                "document_html": "<html><body>Reminder</body></html>",
                            },
                        },
                    },
                },
            },
        )

    def tearDown(self):
        self.override.disable()
        self.media_root.cleanup()

    def test_applicant_upload_renewal_early_payment_receipt_appends_without_replacing_original(self):
        client = APIClient()
        client.force_authenticate(user=self.applicant)
        upload = SimpleUploadedFile(
            "RenewalReceipt.jpg",
            b"receipt-content",
            content_type="image/jpeg",
        )

        response = client.post(
            f"/api/applications/{self.application.id}/license-renewal-early-payment/",
            {"months": "3", "file": upload},
            format="multipart",
        )

        self.assertEqual(response.status_code, 201)
        self.application.refresh_from_db()
        payment = self.application.form_data["payment"]
        renewal = self.application.form_data["license_renewal"]
        self.assertEqual(payment["receipt_file"]["name"], "OriginalReceipt.jpg")
        self.assertEqual(len(renewal["early_payment_receipts"]), 1)
        self.assertEqual(renewal["early_payment_receipts"][0]["name"], "RenewalReceipt.jpg")
        self.assertEqual(
            renewal["reminders"]["3"]["early_payment_receipts"][0]["document_id"],
            renewal["early_payment_receipts"][0]["document_id"],
        )


class ApplicationActivityVisibilityTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.applicant = User.objects.create_user(
            username="activity-applicant",
            password="testpass123",
            role="applicant",
        )
        self.ku_ikl = User.objects.create_user(
            username="activity-ku-ikl",
            password="testpass123",
            role="admin",
            department="KU(IKL)",
        )
        self.other_ku_ikl = User.objects.create_user(
            username="activity-other-ku-ikl",
            password="testpass123",
            role="admin",
            department="KU(IKL)",
        )
        self.mphlg = User.objects.create_user(
            username="activity-mphlg",
            password="testpass123",
            role="admin",
            department="MPHLG",
        )
        self.application = Application.objects.create(
            applicant=self.applicant,
            title="Scoped activity application",
            status="license_issued",
            form_data={
                "activity_log": [
                    {
                        "title": "Application approved",
                        "description": "Approved by MPHLG.",
                        "category": "workflow",
                        "actor_id": self.mphlg.id,
                        "actor_role": "admin",
                        "actor_department": "MPHLG",
                        "created_at": "2026-06-24T01:00:00Z",
                    },
                    {
                        "title": "Application sent to technical review",
                        "description": "Reviewed by other KU(IKL).",
                        "category": "workflow",
                        "actor_id": self.other_ku_ikl.id,
                        "actor_role": "admin",
                        "actor_department": "KU(IKL)",
                        "created_at": "2026-06-24T00:30:00Z",
                    },
                    {
                        "title": "Application sent to technical review",
                        "description": "Reviewed by KU(IKL).",
                        "category": "workflow",
                        "actor_id": self.ku_ikl.id,
                        "actor_role": "admin",
                        "actor_department": "KU(IKL)",
                        "created_at": "2026-06-24T00:20:00Z",
                    },
                    {
                        "title": "Application submitted",
                        "description": "You sent your application to ALiS for review.",
                        "category": "user",
                        "actor_id": self.applicant.id,
                        "actor_role": "applicant",
                        "actor_department": self.applicant.username,
                        "created_at": "2026-06-24T00:10:00Z",
                    },
                    {
                        "title": "Application draft created",
                        "description": "The applicant started a new advertisement license application.",
                        "category": "user",
                        "actor_id": self.applicant.id,
                        "actor_role": "applicant",
                        "actor_department": self.applicant.username,
                        "created_at": "2026-06-24T00:00:00Z",
                    },
                ],
            },
        )

    def get_first_list_item(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        response = client.get("/api/applications/")
        self.assertEqual(response.status_code, 200)
        data = response.data if isinstance(response.data, list) else response.data["results"]
        return data[0]

    def test_applicant_activity_log_hides_internal_workflow_rows(self):
        item = self.get_first_list_item(self.applicant)

        self.assertEqual(
            [activity["title"] for activity in item["activity_log"]],
            ["Application submitted", "Application draft created"],
        )

        client = APIClient()
        client.force_authenticate(user=self.applicant)
        response = client.get(f"/api/applications/{self.application.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [activity["title"] for activity in response.data["form_data"]["activity_log"]],
            ["Application submitted", "Application draft created"],
        )

    def test_staff_activity_log_hides_other_staff_accounts(self):
        item = self.get_first_list_item(self.ku_ikl)

        self.assertEqual(
            [activity["description"] for activity in item["activity_log"]],
            [
                "Reviewed by KU(IKL).",
                "You sent your application to ALiS for review.",
            ],
        )


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
        activity_log = application.form_data.get("activity_log", [])
        self.assertEqual(activity_log[0]["title"], "Application resubmitted")
        self.assertEqual(activity_log[0]["metadata"]["previous_remark"], "Please update.")
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

    def test_applicant_resubmit_clears_stale_technical_workflow(self):
        application = Application.objects.create(
            applicant=self.applicant,
            title="Technical correction application",
            status="rejected",
            form_data={
                "correction_request": {
                    "source": "IKL(TECHNICAL)",
                    "target": "Applicant",
                    "remarks": "Please update.",
                },
                "technical_review_cycle": 1,
                "technical_referral": {"cycle_id": 1, "participating_departments": ["BLG"]},
                "technical_department_selection": {"cycle_id": 1, "departments": ["BLG"]},
                "technical_department_reviews": {
                    "BLG": {
                        "cycle_id": 1,
                        "decision": "Supported",
                        "remarks": "Old BLG review.",
                    }
                },
                "technical_review": {"decision": "Not Supported", "remarks": "Old IKL review."},
                "technical_ku_review": {"decision": "KU(IKL) Request Technical Amendment"},
                "kb_les_verification": {"decision": "Not Verify"},
            },
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
        self.assertEqual(application.latest_remark, "")
        self.assertIsNone(application.form_data.get("technical_review_cycle"))
        self.assertEqual(application.form_data.get("technical_department_reviews"), {})
        self.assertIsNone(application.form_data.get("technical_department_selection"))
        self.assertIsNone(application.form_data.get("technical_referral"))
        self.assertIsNone(application.form_data.get("technical_review"))
        self.assertIsNone(application.form_data.get("technical_ku_review"))
        self.assertIsNone(application.form_data.get("kb_les_verification"))

    def test_mphlg_reject_resubmit_routes_back_to_mphlg(self):
        User = get_user_model()
        mphlg_user = User.objects.create_user(
            username="mphlg-resubmit-reviewer",
            email="mphlg-resubmit@example.com",
            password="testpass123",
            mobile_number="0175151830",
            role="admin",
            department="MPHLG",
            is_active=True,
        )
        application = Application.objects.create(
            applicant=self.applicant,
            title="MPHLG correction application",
            status="mphlg_processing",
            form_data={
                "mphlg_gateway": {
                    "status": "Pending MPHLG Approval",
                    "routed_from": "TP(RES)",
                }
            },
        )

        client = APIClient()
        client.force_authenticate(user=mphlg_user)
        response = client.patch(
            f"/api/applications/{application.id}/",
            {
                "status": "rejected",
                "latest_remark": "Please update MPHLG details.",
                "form_data": {
                    "mphlg_gateway": {
                        "officer": "MPHLG",
                        "status": "Returned to Applicant",
                        "decision": "Reject",
                        "remarks": "Please update MPHLG details.",
                        "decided_at": "2026-06-24T01:40:00Z",
                    },
                    "correction_request": {
                        "source": "MPHLG",
                        "target": "Applicant",
                        "remarks": "Please update MPHLG details.",
                    },
                },
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        application.refresh_from_db()
        self.assertEqual(application.status, "rejected")

        client.force_authenticate(user=self.applicant)
        response = client.patch(
            f"/api/applications/{application.id}/",
            {
                "status": "mphlg_processing",
                "form_data": {
                    "step_11": {"submitted": True},
                    "correction_request": None,
                    "mphlg_gateway": {
                        "status": "Pending MPHLG Approval",
                        "decision": "",
                        "remarks": "",
                    },
                },
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        application.refresh_from_db()
        self.assertEqual(application.status, "mphlg_processing")
        self.assertIsNone(application.form_data.get("correction_request"))
        self.assertEqual(application.form_data["mphlg_gateway"]["status"], "Pending MPHLG Approval")
        self.assertEqual(application.form_data["mphlg_gateway"]["decision"], "")
        self.assertEqual(application.form_data["mphlg_gateway"]["reviewed_at"], "")
        self.assertEqual(application.form_data["mphlg_gateway"]["decided_at"], "")

        staff_deliveries = NotificationDelivery.objects.filter(
            application=application,
            user=mphlg_user,
            recipient_role="admin",
            metadata__event_status="mphlg_processing",
        )
        self.assertEqual(staff_deliveries.count(), 3)
        self.assertEqual(set(staff_deliveries.values_list("channel", flat=True)), {"web", "email", "whatsapp"})
        for delivery in staff_deliveries:
            self.assertIn("ready for MPHLG review", delivery.message)
            self.assertNotIn("Remark:", delivery.message)
            self.assertNotIn("Remark:", delivery.metadata["message_en"])
            self.assertNotIn("Please update MPHLG details.", delivery.message)
            self.assertNotIn("Please update MPHLG details.", delivery.metadata["message_en"])
            self.assertEqual(delivery.subject, f"ALiS - Application {application.reference_no} resubmitted")
            self.assertEqual(delivery.metadata["title_en"], f"Application {application.reference_no} resubmitted")
            self.assertEqual(delivery.metadata["from"], "ALiS Notification Center")
            self.assertEqual(delivery.metadata["to"], "MPHLG")
            self.assertTrue(delivery.metadata["suppress_remark"])
            self.assertNotIn("memo_html", delivery.metadata)
            self.assertNotIn("memo_template", delivery.metadata)

        client.force_authenticate(user=mphlg_user)
        response = client.get("/api/notifications/")
        self.assertEqual(response.status_code, 200)
        notification = next(
            item for item in response.data
            if item["metadata"].get("title_en") == f"Application {application.reference_no} resubmitted"
        )
        self.assertEqual(notification["latest_remark"], "")

    def test_pt_ikl_letter_bill_submit_routes_directly_to_applicant_payment(self):
        User = get_user_model()
        pt_ikl = User.objects.create_user(
            username="pt-ikl-letter-bill",
            email="pt-ikl-letter-bill@example.com",
            password="testpass123",
            role="admin",
            department="PT(IKL)",
            is_active=True,
        )
        application = Application.objects.create(
            applicant=self.applicant,
            title="Approved application",
            status="approved",
            form_data={
                "approval_letter": {
                    "manual_letter": {
                        "name": "Approval Letter",
                        "document_html": "<html><body>Approval Letter</body></html>",
                    },
                    "manual_bill": {
                        "name": "Bill",
                        "document_html": "<html><body>Bill</body></html>",
                    },
                }
            },
        )

        client = APIClient()
        client.force_authenticate(user=pt_ikl)
        response = client.patch(
            f"/api/applications/{application.id}/",
            {
                "status": "invoice_generated",
                "form_data": {
                    "approval_letter": {
                        "manual_letter": {
                            "name": "Approval Letter",
                            "document_html": "<html><body>Approval Letter</body></html>",
                        },
                        "manual_bill": {
                            "name": "Bill",
                            "document_html": "<html><body>Bill</body></html>",
                        },
                        "status": "Sent to Applicant",
                        "submitted_by": "PT(IKL)",
                    },
                    "payment": {
                        "status": "Awaiting Payment",
                    },
                },
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        application.refresh_from_db()
        self.assertEqual(application.status, "invoice_generated")
        self.assertEqual(application.form_data["payment"]["status"], "Awaiting Payment")
        self.assertFalse(
            NotificationDelivery.objects.filter(
                application=application,
                recipient_role="admin",
                metadata__event_status="invoice_generated",
            ).exists()
        )

        applicant_deliveries = NotificationDelivery.objects.filter(
            application=application,
            recipient_role="applicant",
            metadata__event_status="invoice_generated",
        )
        self.assertEqual(applicant_deliveries.count(), 3)
        self.assertEqual(set(applicant_deliveries.values_list("channel", flat=True)), {"web", "email", "whatsapp"})
        self.assertIn("proof of payment", applicant_deliveries.get(channel="email").message)

    def test_applicant_submit_receipt_notifies_fin_all_channels(self):
        User = get_user_model()
        fin = User.objects.create_user(
            username="fin-receipt-review",
            email="fin-receipt-review@example.com",
            password="testpass123",
            mobile_number="0162223333",
            role="admin",
            department="FIN",
            is_active=True,
        )
        application = Application.objects.create(
            applicant=self.applicant,
            title="Payment proof application",
            status="invoice_generated",
            form_data={
                "approval_letter": {
                    "manual_letter": {
                        "name": "Approval Letter",
                        "document_html": "<html><body>Approval Letter</body></html>",
                    },
                    "manual_bill": {
                        "name": "Bill",
                        "document_html": "<html><body>Bill</body></html>",
                    },
                    "status": "Sent to Applicant",
                },
                "payment": {
                    "status": "Awaiting Payment",
                    "receipt_file": {"name": "Receipt.png"},
                },
            },
        )

        client = APIClient()
        client.force_authenticate(user=self.applicant)
        response = client.patch(
            f"/api/applications/{application.id}/",
            {
                "status": "payment_submitted",
                "form_data": {
                    "payment": {
                        "status": "Payment Submitted",
                        "receipt_reference": "Receipt.png",
                        "receipt_file": {"name": "Receipt.png"},
                    },
                },
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        application.refresh_from_db()
        self.assertEqual(application.status, "payment_submitted")

        staff_deliveries = NotificationDelivery.objects.filter(
            application=application,
            recipient_role="admin",
            metadata__event_status="payment_submitted",
        )
        self.assertEqual(staff_deliveries.count(), 3)
        self.assertEqual(set(staff_deliveries.values_list("channel", flat=True)), {"web", "email", "whatsapp"})
        self.assertEqual(staff_deliveries.get(channel="web").user, fin)
        self.assertIn("uploaded payment proof", staff_deliveries.get(channel="email").message)

    def test_applicant_submit_creates_safe_applicant_and_internal_staff_notifications(self):
        application = Application.objects.create(
            applicant=self.applicant,
            title="Fresh application",
            status="draft",
            form_data={},
        )

        client = APIClient()
        client.force_authenticate(user=self.applicant)
        response = client.post(f"/api/applications/{application.id}/submit/")

        self.assertEqual(response.status_code, 200)
        application.refresh_from_db()
        self.assertEqual(application.status, "submitted")

        applicant_deliveries = NotificationDelivery.objects.filter(
            application=application,
            recipient_role="applicant",
        )
        self.assertEqual(applicant_deliveries.count(), 3)
        self.assertEqual(
            set(applicant_deliveries.values_list("metadata__event_status", flat=True)),
            {"applicant_submitted"},
        )
        for delivery in applicant_deliveries:
            combined = f"{delivery.subject}\n{delivery.message}\n{delivery.metadata}"
            self.assertNotIn("KU(IKL)", combined)
            self.assertIn("submitted successfully", combined)

        staff_deliveries = NotificationDelivery.objects.filter(
            application=application,
            recipient_role="admin",
            metadata__event_status="submitted",
        )
        self.assertEqual(staff_deliveries.count(), 3)
        self.assertTrue(any("KU(IKL)" in delivery.message for delivery in staff_deliveries))

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
        self.assertEqual(activity_log[0]["actor_id"], self.ku_ikl.id)
        self.assertEqual(activity_log[0]["actor_role"], "admin")
        self.assertEqual(activity_log[0]["actor_department"], "KU(IKL)")
        self.assertIn("reviewed and rejected by KU(IKL)", activity_log[0]["description"])
        self.assertIn("Remark: Please revise the application.", activity_log[0]["description"])
        deliveries = NotificationDelivery.objects.filter(
            application=application,
            recipient_role="applicant",
            metadata__event_status="rejected",
        )
        self.assertEqual(deliveries.count(), 3)
        self.assertEqual(set(deliveries.values_list("channel", flat=True)), {"web", "email", "whatsapp"})
