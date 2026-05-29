import hashlib

from rest_framework.throttling import SimpleRateThrottle


class ScopedActionRateThrottle(SimpleRateThrottle):
    scope = None

    def get_cache_key(self, request, view):
        if not self.scope:
            return None

        user = getattr(request, "user", None)
        if user and user.is_authenticated:
            ident = str(user.pk)
        else:
            ident = self.get_ident(request)

        return self.cache_format % {
            "scope": self.scope,
            "ident": ident,
        }


class LoginIPRateThrottle(ScopedActionRateThrottle):
    scope = "login_ip"


class LoginIdentifierRateThrottle(ScopedActionRateThrottle):
    scope = "login"

    def get_cache_key(self, request, view):
        username = str(request.data.get("username", "")).strip().lower()
        ident = self.get_ident(request)
        hashed_ident = hashlib.sha256(f"{ident}:{username}".encode("utf-8")).hexdigest()

        return self.cache_format % {
            "scope": self.scope,
            "ident": hashed_ident,
        }


class RegistrationRateThrottle(ScopedActionRateThrottle):
    scope = "registration"


class PasswordResetRequestRateThrottle(ScopedActionRateThrottle):
    scope = "password_reset_request"


class PasswordResetVerifyRateThrottle(ScopedActionRateThrottle):
    scope = "password_reset_verify"


class PasswordResetConfirmRateThrottle(ScopedActionRateThrottle):
    scope = "password_reset_confirm"


class UploadRateThrottle(ScopedActionRateThrottle):
    scope = "upload"
