from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0008_user_department"),
    ]

    operations = [
        migrations.AlterField(
            model_name="user",
            name="role",
            field=models.CharField(
                choices=[
                    ("superadmin", "Super Admin"),
                    ("admin", "Admin"),
                    ("supervisor", "Supervisor"),
                    ("staff", "Staff"),
                    ("applicant", "Applicant"),
                ],
                default="applicant",
                max_length=20,
            ),
        ),
    ]
