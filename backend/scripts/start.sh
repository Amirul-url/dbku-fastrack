#!/usr/bin/env sh
set -eu

python manage.py print_db_config
python manage.py migrate --noinput
gunicorn config.wsgi:application --bind "0.0.0.0:${PORT:-8000}" --workers "${GUNICORN_WORKERS:-3}" --timeout "${GUNICORN_TIMEOUT:-120}"
