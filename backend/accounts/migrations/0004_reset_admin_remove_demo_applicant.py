from django.contrib.auth.hashers import make_password
from django.db import migrations


def reset_admin_remove_demo_applicant(apps, schema_editor):
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
    User.objects.filter(username="applicant").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0003_ensure_admin_account"),
    ]

    operations = [
        migrations.RunPython(reset_admin_remove_demo_applicant, migrations.RunPython.noop),
    ]
