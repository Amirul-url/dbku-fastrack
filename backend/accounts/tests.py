from django.test import TestCase
from rest_framework.test import APIClient

from .models import User
from .views import apply_managed_account_data, build_user_payload, get_password_reset_user


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
