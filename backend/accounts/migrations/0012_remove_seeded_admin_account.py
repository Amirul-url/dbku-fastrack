from django.db import migrations


def remove_seeded_accounts(apps, schema_editor):
    User = apps.get_model("accounts", "User")

    User.objects.filter(
        username="admin",
        email="",
        first_name="System",
        last_name="Administrator",
        role="admin",
        is_staff=True,
        is_superuser=True,
    ).delete()

    User.objects.filter(
        username="superadmin",
        email="",
        first_name="Super",
        last_name="Administrator",
        role="superadmin",
        is_staff=True,
        is_superuser=True,
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0011_user_notification_preferences"),
    ]

    operations = [
        migrations.RunPython(remove_seeded_accounts, migrations.RunPython.noop),
    ]
