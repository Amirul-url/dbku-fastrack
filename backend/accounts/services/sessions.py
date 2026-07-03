from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from accounts.models import LoginSession
from accounts.services.identity import get_login_duration_seconds


def get_login_session_timeout_seconds():
    try:
        timeout_seconds = int(getattr(settings, "LOGIN_SESSION_TIMEOUT_SECONDS", 60 * 60))
    except (TypeError, ValueError):
        timeout_seconds = 60 * 60

    return max(60, timeout_seconds)


def get_login_session_expiry_at(session):
    if not session.login_at:
        return None

    return session.login_at + timedelta(seconds=get_login_session_timeout_seconds())


def get_login_session_close_at(session, logout_at):
    expiry_at = get_login_session_expiry_at(session)
    if not expiry_at:
        return logout_at

    return min(logout_at, expiry_at)


def close_login_session(session, logout_at):
    session.logout_at = get_login_session_close_at(session, logout_at)
    session.duration_seconds = get_login_duration_seconds(session.login_at, session.logout_at)
    session.save(update_fields=["logout_at", "duration_seconds"])


def close_open_login_sessions(user, logout_at):
    for session in LoginSession.objects.filter(user=user, logout_at__isnull=True):
        close_login_session(session, logout_at)


def close_stale_open_login_sessions(now=None, user=None):
    now = now or timezone.now()
    cutoff = now - timedelta(seconds=get_login_session_timeout_seconds())
    queryset = LoginSession.objects.filter(logout_at__isnull=True, login_at__lte=cutoff)
    if user is not None:
        queryset = queryset.filter(user=user)

    for session in queryset:
        close_login_session(session, now)
