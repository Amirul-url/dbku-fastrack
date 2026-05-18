from django.conf import settings
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Print the active database target without exposing credentials."

    def handle(self, *args, **options):
        config = settings.DATABASES["default"]
        engine = config.get("ENGINE", "")
        name = config.get("NAME", "")
        user = config.get("USER", "")
        host = config.get("HOST", "")
        port = config.get("PORT", "")

        if "sqlite" in engine:
            self.stdout.write(f"Database target: sqlite name={name}")
            return

        self.stdout.write(
            "Database target: "
            f"engine={engine} host={host or '-'} port={port or '-'} "
            f"name={name or '-'} user={user or '-'}"
        )
