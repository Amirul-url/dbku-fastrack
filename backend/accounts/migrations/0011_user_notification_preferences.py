from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0010_loginsession"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="notify_whatsapp",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="user",
            name="notify_email",
            field=models.BooleanField(default=True),
        ),
    ]
