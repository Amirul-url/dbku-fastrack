from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from notifications.services import process_license_renewal_reminders


class Command(BaseCommand):
    help = "Detect advertisement licenses due for renewal reminders or cancellation notices."

    def add_arguments(self, parser):
        parser.add_argument(
            "--now",
            help=(
                "Optional ISO datetime used as the current time, for testing. "
                "Example: 2027-02-21T08:30:00+08:00"
            ),
        )

    def handle(self, *args, **options):
        now = self.parse_now(options.get("now"))
        processed = process_license_renewal_reminders(now=now)
        self.stdout.write(
            self.style.SUCCESS(
                "Processed license renewal workflow: "
                f"{processed['reminders']} reminder(s), "
                f"{processed['cancellations']} cancellation notice(s)."
            )
        )

    def parse_now(self, value):
        if not value:
            return None

        parsed = parse_datetime(value)
        if parsed is None:
            raise CommandError("--now must be a valid ISO datetime.")

        if timezone.is_naive(parsed):
            parsed = timezone.make_aware(parsed, timezone.get_current_timezone())

        return parsed
