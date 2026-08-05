param(
    [int]$Port = 8000
)

$ErrorActionPreference = "Stop"

python manage.py migrate --noinput
python manage.py runserver "0.0.0.0:$Port"
