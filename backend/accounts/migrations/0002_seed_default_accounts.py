from django.db import migrations


ADMIN_PASSWORD_HASH = (
    "pbkdf2_sha256$1000000$4Ys5fzqiLSS6C4L1KOuM8w$"
    "aOJUfQejiLKJWc82mmjsvPbmK0SvzoDQuQAij8uD12Q="
)
APPLICANT_PASSWORD_HASH = (
    "pbkdf2_sha256$1000000$pB9ZNgBXiPLMVfCy4EvTsb$"
    "mlyLIUUuyDQofAu2h6kFL4xWQ4hZh+Y+JEnxiD8bD9g="
)


def seed_default_accounts(apps, schema_editor):
    User = apps.get_model("accounts", "User")

    defaults = [
        {
            "username": "admin",
            "password": ADMIN_PASSWORD_HASH,
            "email": "admin@dbku.local",
            "first_name": "System",
            "last_name": "Administrator",
            "role": "admin",
            "is_staff": True,
            "is_superuser": True,
            "is_active": True,
        },
        {
            "username": "applicant",
            "password": APPLICANT_PASSWORD_HASH,
            "email": "applicant@dbku.local",
            "first_name": "Demo",
            "last_name": "Applicant",
            "role": "applicant",
            "is_staff": False,
            "is_superuser": False,
            "is_active": True,
        },
    ]

    for account in defaults:
        username = account.pop("username")
        User.objects.update_or_create(username=username, defaults=account)


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_default_accounts, migrations.RunPython.noop),
    ]
