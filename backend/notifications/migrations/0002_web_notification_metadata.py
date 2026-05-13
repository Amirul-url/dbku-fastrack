from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("notifications", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="notificationdelivery",
            name="metadata",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="notificationdelivery",
            name="read_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name="notificationdelivery",
            name="channel",
            field=models.CharField(
                choices=[
                    ("web", "Web"),
                    ("email", "Email"),
                    ("whatsapp", "WhatsApp"),
                ],
                max_length=20,
            ),
        ),
    ]
