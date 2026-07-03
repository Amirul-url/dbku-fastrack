from datetime import datetime, timedelta
from types import SimpleNamespace

from django.test import SimpleTestCase

from accounts.services.identity import (
    build_address_from_parts,
    build_login_session_payload,
    build_user_payload,
    clean_mobile_number,
    get_login_duration_seconds,
    infer_date_of_birth_from_mykad,
    infer_gender_from_mykad,
    normalize_full_name,
    normalize_mykad_identifier,
    split_full_name,
)


class _LoginSessions:
    def __init__(self, sessions):
        self.sessions = sessions

    def all(self):
        return self.sessions


class AccountIdentityServiceTests(SimpleTestCase):
    def test_infers_mykad_birth_date_and_gender(self):
        self.assertEqual(infer_date_of_birth_from_mykad("900101131234"), "1990-01-01")
        self.assertEqual(infer_gender_from_mykad("900101131234"), "female")
        self.assertEqual(infer_gender_from_mykad("900101131235"), "male")

    def test_normalizes_identity_fields(self):
        self.assertEqual(normalize_full_name("  ali   bin abu "), "ALI BIN ABU")
        self.assertEqual(normalize_mykad_identifier("900101-13-1234"), "900101131234")
        self.assertEqual(clean_mobile_number("-"), "")
        self.assertEqual(split_full_name("ALI BIN ABU"), ("ALI", "BIN ABU"))

    def test_builds_address_from_parts(self):
        self.assertEqual(
            build_address_from_parts(
                {
                    "address_line1": "Line 1",
                    "address_line2": "",
                    "postcode": "93050",
                    "city": "Kuching",
                    "state": "Sarawak",
                }
            ),
            "Line 1, 93050, Kuching, Sarawak",
        )

    def test_login_session_payload_and_duration(self):
        login_at = datetime(2026, 7, 3, 8, 0, 0)
        logout_at = login_at + timedelta(minutes=5)
        session = SimpleNamespace(
            id=7,
            login_at=login_at,
            logout_at=logout_at,
            duration_seconds=300,
        )

        self.assertEqual(get_login_duration_seconds(login_at, logout_at), 300)
        self.assertEqual(
            build_login_session_payload(session),
            {
                "id": 7,
                "login_at": "2026-07-03T08:00:00",
                "logout_at": "2026-07-03T08:05:00",
                "duration_seconds": 300,
            },
        )

    def test_builds_user_payload_with_fallback_profile_data(self):
        user = SimpleNamespace(
            id=1,
            username="900101131235",
            first_name="Ali",
            last_name="Bin Abu",
            email="ali@example.com",
            role="applicant",
            department="",
            mykad_number="",
            mobile_number="-",
            address="Line 1, Line 2, 93050, Kuching, Sarawak",
            address_line1="",
            address_line2="",
            postcode="",
            city="",
            state="",
            gender="",
            date_of_birth=None,
            nationality="",
            is_staff=False,
            is_superuser=False,
            is_active=True,
            date_joined=None,
            last_login=None,
            login_sessions=_LoginSessions([]),
        )

        payload = build_user_payload(user)

        self.assertEqual(payload["full_name"], "ALI BIN ABU")
        self.assertEqual(payload["mykad_number"], "900101131235")
        self.assertEqual(payload["mobile_number"], "")
        self.assertEqual(payload["gender"], "male")
        self.assertEqual(payload["date_of_birth"], "1990-01-01")
        self.assertEqual(payload["nationality"], "Malaysian")
        self.assertEqual(payload["postcode"], "93050")
