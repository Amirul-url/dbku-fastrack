from datetime import date

from django.test import TestCase

from accounts.models import User
from accounts.services.management import (
    apply_managed_account_data,
    normalize_managed_department,
    normalize_managed_role,
)


class AccountManagementServiceTests(TestCase):
    def test_normalizes_user_role_to_applicant(self):
        self.assertEqual(normalize_managed_role(" user "), "applicant")

    def test_normalizes_finance_department_to_fin(self):
        self.assertEqual(normalize_managed_department("Bahagian Kewangan"), "FIN")

    def test_requires_password_when_creating_account(self):
        user = User()

        error = apply_managed_account_data(
            user,
            {
                "username": "900101131234",
                "full_name": "Siti Aminah",
                "role": "applicant",
                "email": "siti@example.com",
            },
            require_password=True,
        )

        self.assertEqual(error, "Password is required.")

    def test_rejects_duplicate_username(self):
        User.objects.create_user(
            username="900101131234",
            email="existing@example.com",
            password="Password123",
        )
        user = User()

        error = apply_managed_account_data(
            user,
            {
                "username": "900101131234",
                "full_name": "Siti Aminah",
                "role": "applicant",
                "email": "new@example.com",
                "password": "Password123",
            },
        )

        self.assertEqual(error, "Username already exists.")

    def test_applies_applicant_profile_fields(self):
        user = User()

        error = apply_managed_account_data(
            user,
            {
                "username": "900101-13-1234",
                "mykad_number": "900101-13-1234",
                "full_name": "Siti Aminah",
                "role": "user",
                "email": "Siti@Example.COM",
                "password": "Password123",
                "mobile_number": "0175151829",
                "gender": "female",
                "nationality": "Malaysian",
                "address_line1": "Jalan Satok",
                "postcode": "93400",
                "city": "Kuching",
                "state": "Sarawak",
                "date_of_birth": "1990-01-01",
            },
            require_password=True,
        )

        self.assertEqual(error, "")
        self.assertEqual(user.username, "900101131234")
        self.assertEqual(user.email, "siti@example.com")
        self.assertEqual(user.first_name, "SITI")
        self.assertEqual(user.last_name, "AMINAH")
        self.assertEqual(user.role, "applicant")
        self.assertEqual(user.mykad_number, "900101131234")
        self.assertEqual(user.date_of_birth, date(1990, 1, 1))
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertTrue(user.check_password("Password123"))

    def test_applies_superadmin_flags_and_blank_mykad_when_same_as_username(self):
        user = User()

        error = apply_managed_account_data(
            user,
            {
                "username": "system-admin-2",
                "mykad_number": "system-admin-2",
                "full_name": "System Admin",
                "role": "superadmin",
                "email": "",
                "password": "Password123",
            },
            require_password=True,
        )

        self.assertEqual(error, "")
        self.assertEqual(user.role, "superadmin")
        self.assertEqual(user.mykad_number, "")
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_superuser)
