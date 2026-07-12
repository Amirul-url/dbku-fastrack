from unittest.mock import patch
from datetime import timedelta

from django.contrib.auth.hashers import identify_hasher
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from .models import LoginSession, User
from .views import apply_managed_account_data, build_user_payload, get_password_reset_user


class PasswordHashingTests(TestCase):
    def test_new_passwords_are_stored_as_bcrypt_hashes(self):
        user = User.objects.create_user(username="bcryptuser", password="Password123")

        self.assertNotEqual(user.password, "Password123")
        self.assertEqual(identify_hasher(user.password).algorithm, "bcrypt_sha256")
        self.assertTrue(user.check_password("Password123"))


class ManagedAccountImportTests(TestCase):
    def test_imported_account_normalizes_identifiers_for_login_and_reset(self):
        user = User()
        error = apply_managed_account_data(
            user,
            {
                "username": "020215-13-0135",
                "full_name": "CSV Imported User",
                "email": " ImportedUser@Example.COM ",
                "mobile_number": "017-515 1829",
                "department": "imt",
                "role": "admin",
                "password": "Password123",
                "password2": "Password123",
                "is_active": True,
            },
            require_password=True,
        )

        self.assertEqual(error, "")
        user.save()

        self.assertEqual(user.username, "020215130135")
        self.assertEqual(user.mykad_number, "020215130135")
        self.assertEqual(user.first_name, "CSV")
        self.assertEqual(user.last_name, "IMPORTED USER")
        self.assertEqual(build_user_payload(user)["full_name"], "CSV IMPORTED USER")
        self.assertEqual(user.email, "importeduser@example.com")
        self.assertTrue(user.check_password("Password123"))
        self.assertEqual(get_password_reset_user("email", "importeduser@example.com"), user)
        self.assertEqual(get_password_reset_user("whatsapp", "0175151829"), user)

        response = APIClient().post(
            "/api/auth/login/",
            {"username": "020215-13-0135", "password": "Password123"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)

    def test_legacy_formatted_imported_account_can_login_and_reset(self):
        user = User.objects.create_user(
            username="020215-13-0135",
            email="legacy@example.com",
            password="Password123",
            mobile_number="+60 17-515 1829",
        )
        user.email = " Legacy@Example.COM "
        user.save(update_fields=["email"])

        self.assertEqual(get_password_reset_user("email", "legacy@example.com"), user)
        self.assertEqual(get_password_reset_user("whatsapp", "0175151829"), user)

        response = APIClient().post(
            "/api/auth/login/",
            {"username": "020215130135", "password": "Password123"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)

    @override_settings(
        DEBUG=True,
        WHATSAPP_ENABLED=True,
    )
    @patch("notifications.services.send_whatsapp", side_effect=RuntimeError("Connection Closed"))
    def test_password_reset_whatsapp_failure_does_not_reveal_otp(self, _send_whatsapp):
        User.objects.create_user(
            username="debugotp",
            password="Password123",
            role="applicant",
            mobile_number="0175151829",
        )

        response = APIClient().post(
            "/api/auth/password-reset/request/",
            {"identifier": "0175151829", "channel": "whatsapp"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertNotIn("dev_otp", response.data)
        self.assertIn("disconnected", response.data["error"].lower())

    def test_login_ignores_invalid_existing_bearer_token(self):
        User.objects.create_user(
            username="validuser",
            password="Password123",
            role="applicant",
        )
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION="Bearer invalid-token")

        response = client.post(
            "/api/auth/login/",
            {"username": "validuser", "password": "Password123"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)

    def test_login_creates_session_and_logout_closes_it(self):
        user = User.objects.create_user(
            username="sessionuser",
            password="Password123",
            role="applicant",
        )
        client = APIClient()

        login_response = client.post(
            "/api/auth/login/",
            {"username": "sessionuser", "password": "Password123"},
            format="json",
        )

        self.assertEqual(login_response.status_code, 200)
        session_id = login_response.data["login_session_id"]
        session = LoginSession.objects.get(pk=session_id)
        self.assertEqual(session.user, user)
        self.assertIsNone(session.logout_at)

        client.credentials(HTTP_AUTHORIZATION=f"Bearer {login_response.data['access']}")
        logout_response = client.post(
            "/api/auth/logout/",
            {"login_session_id": session_id},
            format="json",
        )

        self.assertEqual(logout_response.status_code, 200)
        session.refresh_from_db()
        self.assertIsNotNone(session.logout_at)
        self.assertIsNotNone(session.duration_seconds)

    def test_login_again_closes_existing_open_session_and_starts_new_one(self):
        user = User.objects.create_user(
            username="repeatlogin",
            password="Password123",
            role="applicant",
        )
        client = APIClient()

        first_login = client.post(
            "/api/auth/login/",
            {"username": "repeatlogin", "password": "Password123"},
            format="json",
        )
        second_login = client.post(
            "/api/auth/login/",
            {"username": "repeatlogin", "password": "Password123"},
            format="json",
        )

        self.assertEqual(first_login.status_code, 200)
        self.assertEqual(second_login.status_code, 200)
        first_session = LoginSession.objects.get(pk=first_login.data["login_session_id"])
        second_session = LoginSession.objects.get(pk=second_login.data["login_session_id"])
        self.assertEqual(first_session.user, user)
        self.assertEqual(second_session.user, user)
        self.assertIsNotNone(first_session.logout_at)
        self.assertIsNotNone(first_session.duration_seconds)
        self.assertIsNone(second_session.logout_at)
        self.assertIsNone(second_session.duration_seconds)

    @override_settings(LOGIN_SESSION_TIMEOUT_SECONDS=3600)
    def test_login_again_caps_stale_session_duration_at_timeout(self):
        user = User.objects.create_user(
            username="stalelogin",
            password="Password123",
            role="applicant",
        )
        stale_login_at = timezone.now() - timedelta(hours=15)
        stale_session = LoginSession.objects.create(user=user, login_at=stale_login_at)

        response = APIClient().post(
            "/api/auth/login/",
            {"username": "stalelogin", "password": "Password123"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        stale_session.refresh_from_db()
        self.assertEqual(stale_session.logout_at, stale_login_at + timedelta(hours=1))
        self.assertEqual(stale_session.duration_seconds, 3600)

    @override_settings(LOGIN_SESSION_TIMEOUT_SECONDS=3600)
    def test_superadmin_account_list_closes_stale_open_sessions(self):
        superadmin = User.objects.create_user(
            username="sessionadmin",
            password="Password123",
            role="superadmin",
            is_staff=True,
            is_superuser=True,
        )
        user = User.objects.create_user(
            username="listedstale",
            password="Password123",
            role="applicant",
        )
        stale_login_at = timezone.now() - timedelta(hours=2)
        stale_session = LoginSession.objects.create(user=user, login_at=stale_login_at)
        client = APIClient()
        client.force_authenticate(user=superadmin)

        response = client.get("/api/auth/accounts/")

        self.assertEqual(response.status_code, 200)
        stale_session.refresh_from_db()
        self.assertEqual(stale_session.logout_at, stale_login_at + timedelta(hours=1))
        self.assertEqual(stale_session.duration_seconds, 3600)

    def test_registration_rejects_existing_mykad_number(self):
        User.objects.create_user(
            username="020215-13-0135",
            password="Password123",
            role="applicant",
        )

        response = APIClient().post(
            "/api/auth/register/",
            {
                "username": "020215130135",
                "mykad_number": "020215130135",
                "email": "new-mykad@example.com",
                "mobile_number": "0171112222",
                "password": "Password123",
                "password2": "Password123",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("MyKad Number is already registered", response.data["error"])

    def test_registration_rejects_existing_mobile_number(self):
        User.objects.create_user(
            username="020215130136",
            password="Password123",
            role="applicant",
            mobile_number="+60 17-515 1829",
        )

        response = APIClient().post(
            "/api/auth/register/",
            {
                "username": "020215130137",
                "mykad_number": "020215130137",
                "email": "new-mobile@example.com",
                "mobile_number": "0175151829",
                "password": "Password123",
                "password2": "Password123",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("mobile number is already registered", response.data["error"])

    def test_registration_rejects_existing_email_case_insensitive(self):
        User.objects.create_user(
            username="020215130138",
            password="Password123",
            role="applicant",
            email="Existing@Example.COM",
        )

        response = APIClient().post(
            "/api/auth/register/",
            {
                "username": "020215130139",
                "mykad_number": "020215130139",
                "email": "existing@example.com",
                "mobile_number": "0173334444",
                "password": "Password123",
                "password2": "Password123",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("email address is already registered", response.data["error"])

    def test_registration_forces_malaysia_nationality(self):
        response = APIClient().post(
            "/api/auth/register/",
            {
                "username": "020215130141",
                "mykad_number": "020215130141",
                "email": "malaysia-default@example.com",
                "mobile_number": "0175556666",
                "nationality": "Singapore",
                "password": "Password123",
                "password2": "Password123",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        user = User.objects.get(username="020215130141")
        self.assertEqual(user.nationality, "Malaysia")
        self.assertEqual(response.data["user"]["nationality"], "Malaysia")

    def test_login_rejects_unregistered_mykad_before_password_check(self):
        response = APIClient().post(
            "/api/auth/login/",
            {"username": "020215130140", "password": "Password123"},
            format="json",
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["error"], "This account does not exist. Please register first.")

    def test_superadmin_account_list_includes_login_sessions(self):
        superadmin = User.objects.get(username="superadmin")
        superadmin.role = "superadmin"
        superadmin.is_staff = True
        superadmin.is_superuser = True
        superadmin.save(update_fields=["role", "is_staff", "is_superuser"])
        account = User.objects.create_user(
            username="sessionlisted",
            password="Password123",
            role="applicant",
        )
        session = LoginSession.objects.create(user=account, login_at=account.date_joined)
        client = APIClient()
        client.force_authenticate(user=superadmin)

        response = client.get("/api/auth/accounts/?role=applicant")

        self.assertEqual(response.status_code, 200)
        session_account = next(
            item for item in response.data["accounts"] if item["username"] == account.username
        )
        self.assertEqual(session_account["login_sessions"][0]["id"], session.id)

    def test_managed_account_dash_mobile_is_saved_as_empty(self):
        user = User()
        error = apply_managed_account_data(
            user,
            {
                "username": "admin2",
                "full_name": "Second Admin",
                "email": "admin2@example.com",
                "mobile_number": "-",
                "department": "ikl",
                "role": "admin",
                "password": "Password123",
                "password2": "Password123",
                "is_active": True,
            },
            require_password=True,
        )

        self.assertEqual(error, "")
        self.assertEqual(user.first_name, "SECOND")
        self.assertEqual(user.last_name, "ADMIN")
        self.assertEqual(user.mobile_number, "")

    def test_managed_account_dash_email_is_saved_as_empty(self):
        user = User()
        error = apply_managed_account_data(
            user,
            {
                "username": "admin3",
                "full_name": "Third Admin",
                "email": "-",
                "mobile_number": "-",
                "department": "blg",
                "role": "admin",
                "password": "Password123",
                "password2": "Password123",
                "is_active": True,
            },
            require_password=True,
        )

        self.assertEqual(error, "")
        self.assertEqual(user.email, "")

    def test_managed_account_rejects_invalid_email(self):
        user = User()
        error = apply_managed_account_data(
            user,
            {
                "username": "admin4",
                "full_name": "Fourth Admin",
                "email": "not-an-email",
                "mobile_number": "",
                "department": "blg",
                "role": "admin",
                "password": "Password123",
                "password2": "Password123",
                "is_active": True,
            },
            require_password=True,
        )

        self.assertEqual(error, "Please enter a valid email address.")

    def test_managed_account_accepts_supervisor_role(self):
        user = User()
        error = apply_managed_account_data(
            user,
            {
                "username": "supervisor1",
                "full_name": "Supervisor Account",
                "email": "supervisor@example.com",
                "mobile_number": "",
                "department": "KB(LES)",
                "role": "supervisor",
                "password": "Password123",
                "password2": "Password123",
                "is_active": True,
            },
            require_password=True,
        )

        self.assertEqual(error, "")
        self.assertEqual(user.role, "supervisor")
        self.assertEqual(user.department, "KB(LES)")
        self.assertTrue(user.is_staff)
        self.assertFalse(user.is_superuser)

    def test_superadmin_can_update_applicant_profile_and_password(self):
        superadmin = User.objects.get(username="superadmin")
        superadmin.role = "superadmin"
        superadmin.is_staff = True
        superadmin.is_superuser = True
        superadmin.save(update_fields=["role", "is_staff", "is_superuser"])
        applicant = User.objects.create_user(
            username="020215130135",
            password="OldPassword123",
            role="applicant",
            first_name="OLD",
            last_name="NAME",
            email="old@example.com",
        )
        client = APIClient()
        client.force_authenticate(user=superadmin)

        response = client.patch(
            f"/api/auth/accounts/{applicant.id}/",
            {
                "username": "020215130135",
                "mykad_number": "020215130135",
                "full_name": "Updated Applicant",
                "email": "new@example.com",
                "mobile_number": "0175151829",
                "role": "applicant",
                "gender": "male",
                "date_of_birth": "2002-02-15",
                "nationality": "Malaysian",
                "address_line1": "Lot 945",
                "address_line2": "Jalan Sultan Tengah",
                "postcode": "93050",
                "city": "Kuching",
                "state": "Sarawak",
                "password": "NewPassword123",
                "password2": "NewPassword123",
                "is_active": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        applicant.refresh_from_db()
        self.assertEqual(applicant.first_name, "UPDATED")
        self.assertEqual(applicant.last_name, "APPLICANT")
        self.assertEqual(applicant.email, "new@example.com")
        self.assertEqual(applicant.mobile_number, "0175151829")
        self.assertEqual(applicant.gender, "male")
        self.assertEqual(applicant.date_of_birth.isoformat(), "2002-02-15")
        self.assertEqual(applicant.nationality, "Malaysian")
        self.assertEqual(applicant.address_line1, "Lot 945")
        self.assertEqual(applicant.address_line2, "Jalan Sultan Tengah")
        self.assertEqual(applicant.postcode, "93050")
        self.assertEqual(applicant.city, "Kuching")
        self.assertEqual(applicant.state, "Sarawak")
        self.assertTrue(applicant.check_password("NewPassword123"))

    def test_managed_user_list_includes_legacy_user_role(self):
        superadmin = User.objects.get(username="superadmin")
        superadmin.role = "superadmin"
        superadmin.is_staff = True
        superadmin.is_superuser = True
        superadmin.save(update_fields=["role", "is_staff", "is_superuser"])
        legacy_user = User.objects.create_user(
            username="legacyuser",
            email="legacy@example.com",
            password="Password123",
            role="user",
        )
        applicant = User.objects.create_user(
            username="applicant",
            email="applicant@example.com",
            password="Password123",
            role="applicant",
        )
        admin = User.objects.create_user(
            username="admin2",
            email="admin2@example.com",
            password="Password123",
            role="admin",
            is_staff=True,
        )
        client = APIClient()
        client.force_authenticate(user=superadmin)

        response = client.get("/api/auth/accounts/?role=applicant")

        self.assertEqual(response.status_code, 200)
        usernames = {account["username"] for account in response.data["accounts"]}
        self.assertIn(legacy_user.username, usernames)
        self.assertIn(applicant.username, usernames)
        self.assertNotIn(admin.username, usernames)
        self.assertEqual(response.data["summary"]["users"], 2)
