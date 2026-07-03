from types import SimpleNamespace

from django.test import SimpleTestCase

from applications.services.summary import (
    get_application_applicant_name,
    get_application_applicant_profile,
    get_application_display_remark,
    get_application_registered_applicant_name,
    get_latest_remark_from_form_data,
    get_project_location_from_form_data,
    join_user_address,
    sync_application_summary,
)


def user(**overrides):
    data = {
        "id": 1,
        "username": "900101131234",
        "first_name": "Siti",
        "last_name": "Aminah",
        "mykad_number": "",
        "address_line1": "Jalan Satok",
        "address_line2": "Lot 12",
        "postcode": "93400",
        "city": "Kuching",
        "state": "Sarawak",
        "address": "",
    }
    data.update(overrides)
    return SimpleNamespace(**data)


def application(**overrides):
    data = {
        "applicant": user(),
        "form_data": {},
        "latest_remark": "",
        "project_location": "",
        "status": "submitted",
        "title": "",
    }
    data.update(overrides)
    return SimpleNamespace(**data)


class ApplicationSummaryServiceTests(SimpleTestCase):
    def test_applicant_name_prefers_form_data_before_registered_user(self):
        app = application(
            form_data={
                "step_2": {"full_name": "ACME SDN BHD"},
            },
        )

        self.assertEqual(get_application_applicant_name(app), "ACME SDN BHD")
        self.assertEqual(get_application_registered_applicant_name(app), "Siti Aminah")

    def test_applicant_profile_normalizes_address_fields(self):
        profile = get_application_applicant_profile(application())

        self.assertEqual(profile["full_name"], "Siti Aminah")
        self.assertEqual(profile["mykad_number"], "900101131234")
        self.assertEqual(profile["address"], "JALAN SATOK, LOT 12, 93400, KUCHING, SARAWAK")

    def test_join_user_address_falls_back_to_legacy_address(self):
        legacy_user = user(
            address_line1="",
            address_line2="",
            postcode="",
            city="",
            state="",
            address="kampung baru",
        )

        self.assertEqual(join_user_address(legacy_user), "KAMPUNG BARU")

    def test_project_location_prefers_step_one_location_fields(self):
        form_data = {
            "step_1": {
                "locality_address": "",
                "map_address": "Map Address",
                "site_address": "Site Address",
            },
            "step_4": {"land_location": "Land Location"},
        }

        self.assertEqual(get_project_location_from_form_data(form_data), "Map Address")

    def test_latest_remark_uses_status_specific_payment_sources(self):
        form_data = {
            "approval_letter": {"remarks": "  Approval letter note  "},
            "payment": {"verification_notes": "Payment note"},
        }

        self.assertEqual(
            get_latest_remark_from_form_data(form_data, "invoice_generated"),
            "Approval letter note",
        )

    def test_latest_remark_uses_mphlg_approved_remark(self):
        form_data = {
            "mphlg_gateway": {
                "officer": "MPHLG",
                "decision": "approved",
                "remarks": "MPHLG approved",
            },
            "approval": {"remarks": "Fallback approval"},
        }

        self.assertEqual(
            get_latest_remark_from_form_data(form_data, "approved"),
            "MPHLG approved",
        )

    def test_latest_remark_uses_technical_correction_for_ku(self):
        form_data = {
            "correction_request": {
                "target": "KU(IKL)",
                "remarks": "Need correction",
            },
        }

        self.assertEqual(
            get_latest_remark_from_form_data(form_data, "technical_review_completed"),
            "Need correction",
        )

    def test_display_remark_falls_back_to_saved_latest_remark(self):
        app = application(latest_remark=" Saved remark ", status="submitted")

        self.assertEqual(get_application_display_remark(app), "Saved remark")

    def test_sync_application_summary_updates_title_location_and_remark(self):
        app = application(
            form_data={
                "step_1": {
                    "project_name": "Billboard Upgrade",
                    "selected_address": "Waterfront",
                },
                "approval": {"comment": "Approved by officer"},
            },
            status="approved",
        )

        sync_application_summary(app)

        self.assertEqual(app.title, "Billboard Upgrade")
        self.assertEqual(app.project_location, "Waterfront")
        self.assertEqual(app.latest_remark, "Approved by officer")
