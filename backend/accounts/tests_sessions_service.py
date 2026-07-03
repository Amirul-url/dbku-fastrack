from datetime import timedelta

from django.test import TestCase, override_settings
from django.utils import timezone

from accounts.models import LoginSession, User
from accounts.services.sessions import (
    close_login_session,
    close_open_login_sessions,
    close_stale_open_login_sessions,
    get_login_session_close_at,
    get_login_session_expiry_at,
    get_login_session_timeout_seconds,
)


class AccountSessionServiceTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="900101131234",
            email="applicant@example.com",
            password="Password123",
            role="applicant",
        )

    @override_settings(LOGIN_SESSION_TIMEOUT_SECONDS=30)
    def test_timeout_has_one_minute_floor(self):
        self.assertEqual(get_login_session_timeout_seconds(), 60)

    @override_settings(LOGIN_SESSION_TIMEOUT_SECONDS=300)
    def test_expiry_and_close_time_use_configured_timeout(self):
        login_at = timezone.now() - timedelta(minutes=10)
        session = LoginSession.objects.create(user=self.user, login_at=login_at)
        logout_at = login_at + timedelta(minutes=20)

        self.assertEqual(get_login_session_expiry_at(session), login_at + timedelta(minutes=5))
        self.assertEqual(get_login_session_close_at(session, logout_at), login_at + timedelta(minutes=5))

    def test_close_login_session_sets_logout_and_duration(self):
        login_at = timezone.now() - timedelta(minutes=3)
        logout_at = timezone.now()
        session = LoginSession.objects.create(user=self.user, login_at=login_at)

        close_login_session(session, logout_at)
        session.refresh_from_db()

        self.assertEqual(session.logout_at, logout_at)
        self.assertGreaterEqual(session.duration_seconds, 0)

    def test_close_open_login_sessions_closes_only_open_sessions_for_user(self):
        other = User.objects.create_user(
            username="other",
            email="other@example.com",
            password="Password123",
        )
        own_open = LoginSession.objects.create(
            user=self.user,
            login_at=timezone.now() - timedelta(minutes=3),
        )
        own_closed = LoginSession.objects.create(
            user=self.user,
            login_at=timezone.now() - timedelta(minutes=3),
            logout_at=timezone.now(),
        )
        other_open = LoginSession.objects.create(
            user=other,
            login_at=timezone.now() - timedelta(minutes=3),
        )

        close_open_login_sessions(self.user, timezone.now())

        own_open.refresh_from_db()
        own_closed.refresh_from_db()
        other_open.refresh_from_db()

        self.assertIsNotNone(own_open.logout_at)
        self.assertIsNotNone(own_closed.logout_at)
        self.assertIsNone(other_open.logout_at)

    @override_settings(LOGIN_SESSION_TIMEOUT_SECONDS=300)
    def test_close_stale_open_login_sessions_closes_expired_sessions(self):
        stale = LoginSession.objects.create(
            user=self.user,
            login_at=timezone.now() - timedelta(minutes=10),
        )
        fresh = LoginSession.objects.create(
            user=self.user,
            login_at=timezone.now() - timedelta(minutes=1),
        )

        close_stale_open_login_sessions(now=timezone.now(), user=self.user)

        stale.refresh_from_db()
        fresh.refresh_from_db()

        self.assertIsNotNone(stale.logout_at)
        self.assertIsNone(fresh.logout_at)
