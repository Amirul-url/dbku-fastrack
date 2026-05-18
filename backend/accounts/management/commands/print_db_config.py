import os
import sys
from importlib import import_module
from urllib.parse import urlparse

from django.conf import settings
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Print the active database target without exposing credentials."

    def handle(self, *args, **options):
        database_url = os.getenv("DATABASE_URL", "").strip()
        parsed_database_url = urlparse(database_url) if database_url else None
        database_url_host = parsed_database_url.hostname if parsed_database_url else ""
        database_url_port = parsed_database_url.port if parsed_database_url else ""
        settings_module = import_module(os.getenv("DJANGO_SETTINGS_MODULE", "config.settings"))

        self.stdout.write(f"Python: {sys.version.split()[0]}")
        self.stdout.write(f"Settings file: {settings_module.__file__}")
        self.stdout.write(
            "Env database inputs: "
            f"USE_SQLITE={os.getenv('USE_SQLITE', '-') or '-'} "
            f"DATABASE_URL={'set' if database_url else 'unset'} "
            f"DATABASE_URL_HOST={database_url_host or '-'} "
            f"DATABASE_URL_PORT={database_url_port or '-'} "
            f"DB_HOST={os.getenv('DB_HOST', '-') or '-'} "
            f"DB_PORT={os.getenv('DB_PORT', '-') or '-'} "
            f"COOLIFY_INTERNAL_DB_HOST={os.getenv('COOLIFY_INTERNAL_DB_HOST', '-') or '-'} "
            f"COOLIFY_INTERNAL_DB_PORT={os.getenv('COOLIFY_INTERNAL_DB_PORT', '-') or '-'}"
        )

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
