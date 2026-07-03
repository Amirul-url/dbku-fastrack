from django.test import TestCase

from accounts.models import User
from accounts.services.lookup import (
    find_user_by_mobile_number,
    find_user_by_mykad_identifier,
    find_user_by_normalized_email,
    find_user_for_login,
    format_whatsapp_recipient,
    normalize_email_address,
    normalize_phone_number,
    phone_number_variants,
)


class AccountLookupServiceTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="900101131234",
            email="Applicant@Example.COM",
            password="Password123",
            mobile_number="017-515 1829",
            mykad_number="900101131234",
            role="applicant",
        )

    def test_normalizes_email_and_phone_identifiers(self):
        self.assertEqual(normalize_email_address(" User@Example.COM "), "user@example.com")
        self.assertEqual(normalize_email_address("-"), "")
        self.assertEqual(normalize_phone_number("017-515 1829"), "0175151829")

    def test_phone_variants_match_local_and_country_code_forms(self):
        self.assertEqual(
            phone_number_variants("60175151829"),
            {"60175151829", "0175151829", "175151829"},
        )
        self.assertEqual(format_whatsapp_recipient("017-515 1829"), "60175151829")

    def test_finds_user_by_email_mykad_mobile_and_login_identifier(self):
        self.assertEqual(find_user_by_normalized_email("applicant@example.com"), self.user)
        self.assertEqual(find_user_by_mykad_identifier("900101-13-1234"), self.user)
        self.assertEqual(find_user_by_mobile_number("60175151829"), self.user)
        self.assertEqual(find_user_for_login("Applicant@Example.COM"), self.user)
        self.assertEqual(find_user_for_login("900101-13-1234"), self.user)
