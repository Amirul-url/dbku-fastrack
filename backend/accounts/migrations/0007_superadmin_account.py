from django.contrib.auth.hashers import make_password
from django.db import migrations, models


def seed_superadmin_account(apps, schema_editor):
    User = apps.get_model("accounts", "User")

    User.objects.update_or_create(
        username="superadmin",
        defaults={
            "password": make_password("SuperAdmin@12345"),
            "email": "",
            "first_name": "Super",
            "last_name": "Administrator",
            "role": "superadmin",
            "is_staff": True,
            "is_superuser": True,
            "is_active": True,
        },
    )


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0006_user_address_line1_user_address_line2_user_city_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="user",
            name="role",
            field=models.CharField(
                choices=[
                    ("superadmin", "Super Admin"),
                    ("admin", "Admin"),
                    ("staff", "Staff"),
                    ("applicant", "Applicant"),
                ],
                default="applicant",
                max_length=20,
            ),
        ),
        migrations.RunPython(seed_superadmin_account, migrations.RunPython.noop),
    ]
