from django.db import migrations, models


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
    ]
