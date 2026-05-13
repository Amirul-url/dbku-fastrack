from django.contrib.auth.hashers import make_password
from django.db import migrations


def ensure_admin_account(apps, schema_editor):
    User = apps.get_model("accounts", "User")

    User.objects.update_or_create(
        username="admin",
        defaults={
            "password": make_password("Admin@12345"),
            "email": "",
            "first_name": "System",
            "last_name": "Administrator",
            "role": "admin",
            "is_staff": True,
            "is_superuser": True,
            "is_active": True,
        },
    )


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_seed_default_accounts"),
    ]

    operations = [
        migrations.RunPython(ensure_admin_account, migrations.RunPython.noop),
    ]
