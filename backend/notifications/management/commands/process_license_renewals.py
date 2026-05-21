from django.core.management.base import BaseCommand

from notifications.services import process_license_renewal_reminders


class Command(BaseCommand):
    help = "Detect advertisement licenses due for renewal reminders or cancellation notices."

    def handle(self, *args, **options):
        processed = process_license_renewal_reminders()
        self.stdout.write(
            self.style.SUCCESS(
                "Processed license renewal workflow: "
                f"{processed['reminders']} reminder(s), "
                f"{processed['cancellations']} cancellation notice(s)."
            )
        )
