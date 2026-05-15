from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("notifications", "0002_web_notification_metadata"),
    ]

    operations = [
        migrations.AlterField(
            model_name="notificationdelivery",
            name="application",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.CASCADE,
                related_name="notification_deliveries",
                to="applications.application",
            ),
        ),
    ]
