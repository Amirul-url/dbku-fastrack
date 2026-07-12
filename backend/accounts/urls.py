from django.urls import path
from .views import (
    login_view,
    logout_view,
    managed_account_detail_view,
    managed_accounts_view,
    me_view,
    password_reset_confirm_view,
    password_reset_request_view,
    password_reset_verify_view,
    register_view,
)

urlpatterns = [
    path("accounts/", managed_accounts_view),
    path("accounts/<int:user_id>/", managed_account_detail_view),
    path("login/", login_view),
    path("logout/", logout_view),
    path("me/", me_view),
    path("password-reset/request/", password_reset_request_view),
    path("password-reset/verify/", password_reset_verify_view),
    path("password-reset/confirm/", password_reset_confirm_view),
    path("register/", register_view),
]
