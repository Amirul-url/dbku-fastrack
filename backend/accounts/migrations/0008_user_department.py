from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0007_superadmin_account"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="department",
            field=models.CharField(blank=True, max_length=20),
        ),
    ]
