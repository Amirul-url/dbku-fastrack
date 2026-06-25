import os
from pathlib import Path
from dotenv import load_dotenv
from datetime import timedelta
from urllib.parse import urlparse, unquote

# Load .env
load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

# ENV
SECRET_KEY = os.getenv("SECRET_KEY", "fallback-secret")
DEBUG = os.getenv("DEBUG", "True") == "True"

def env_list(name, default=""):
    return [
        value.strip()
        for value in os.getenv(name, default).split(",")
        if value.strip()
    ]


def env_bool(name, default="False"):
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


ALLOWED_HOSTS = env_list(
    "ALLOWED_HOSTS",
    "localhost,127.0.0.1,t13ibowgmqv1q5b97ctxtd3t.sapotlokal.my",
)

RECAPTCHA_SECRET_KEY = os.getenv("RECAPTCHA_SECRET_KEY", "")
RECAPTCHA_REQUIRED = os.getenv("RECAPTCHA_REQUIRED", "False" if DEBUG else "True") == "True"
REGISTRATION_RECAPTCHA_ENABLED = os.getenv("REGISTRATION_RECAPTCHA_ENABLED", "False") == "True"

# Apps
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Third party
    'rest_framework',
    'corsheaders',

    # Local apps
    'accounts',
    'applications',
    'notifications',
]

# Middleware
MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',

    'whitenoise.middleware.WhiteNoiseMiddleware',

    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',

    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# DATABASE SWITCH (SQLite local / PostgreSQL production)
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
USE_SQLITE = os.getenv("USE_SQLITE", "True") == "True" and not DATABASE_URL
DB_CONNECT_TIMEOUT = int(os.getenv("DB_CONNECT_TIMEOUT", "10"))
DB_HOST = os.getenv("DB_HOST", "").strip()
DB_PORT = os.getenv("DB_PORT", "5432").strip()
COOLIFY_INTERNAL_DB_HOST = os.getenv(
    "COOLIFY_INTERNAL_DB_HOST",
    "i3mafgphfv3ym7q5uvwjev2a",
).strip()
COOLIFY_INTERNAL_DB_PORT = os.getenv("COOLIFY_INTERNAL_DB_PORT", "5432").strip()


def use_coolify_internal_db(host, port):
    host = (host or "").strip().lower()
    port = str(port or "").strip()
    return host == "coolify.petradigital.my" or port == "55432"


if use_coolify_internal_db(DB_HOST, DB_PORT):
    DB_HOST = COOLIFY_INTERNAL_DB_HOST
    DB_PORT = COOLIFY_INTERNAL_DB_PORT

if USE_SQLITE:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }
elif DATABASE_URL:
    database = urlparse(DATABASE_URL)
    database_host = database.hostname or ""
    database_port = str(database.port or "5432")

    if use_coolify_internal_db(database_host, database_port):
        database_host = COOLIFY_INTERNAL_DB_HOST
        database_port = COOLIFY_INTERNAL_DB_PORT

    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': unquote(database.path.lstrip("/")),
            'USER': unquote(database.username or ""),
            'PASSWORD': unquote(database.password or ""),
            'HOST': database_host,
            'PORT': database_port,
            'OPTIONS': {
                'connect_timeout': DB_CONNECT_TIMEOUT,
            },
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.getenv("DB_NAME"),
            'USER': os.getenv("DB_USER"),
            'PASSWORD': os.getenv("DB_PASSWORD"),
            'HOST': DB_HOST,
            'PORT': DB_PORT,
            'OPTIONS': {
                'connect_timeout': DB_CONNECT_TIMEOUT,
            },
        }
    }

# Password validation
AUTH_PASSWORD_VALIDATORS = []

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.BCryptSHA256PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher",
]

# DRF + JWT
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_THROTTLE_CLASSES': (
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ),
    'DEFAULT_THROTTLE_RATES': {
        'anon': os.getenv("DRF_THROTTLE_ANON", "120/min"),
        'user': os.getenv("DRF_THROTTLE_USER", "1000/min"),
        'login_ip': os.getenv("DRF_THROTTLE_LOGIN_IP", "120/min"),
        'login': os.getenv("DRF_THROTTLE_LOGIN", "10/min"),
        'registration': os.getenv("DRF_THROTTLE_REGISTRATION", "20/hour"),
        'password_reset_request': os.getenv(
            "DRF_THROTTLE_PASSWORD_RESET_REQUEST",
            "5/hour",
        ),
        'password_reset_verify': os.getenv(
            "DRF_THROTTLE_PASSWORD_RESET_VERIFY",
            "30/hour",
        ),
        'password_reset_confirm': os.getenv(
            "DRF_THROTTLE_PASSWORD_RESET_CONFIRM",
            "10/hour",
        ),
        'upload': os.getenv("DRF_THROTTLE_UPLOAD", "60/hour"),
    },
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(
        hours=int(os.getenv("JWT_ACCESS_TOKEN_HOURS", "1"))
    ),
    'REFRESH_TOKEN_LIFETIME': timedelta(
        days=int(os.getenv("JWT_REFRESH_TOKEN_DAYS", "1"))
    ),
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# CORS
CORS_ALLOWED_ORIGINS = env_list(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,https://fastrack.sapotlokal.my",
)

# Static
STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# Outbound notifications
FRONTEND_URL = os.getenv("FRONTEND_URL", "").rstrip("/")

DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "noreply@dbku.gov.my")

EMAIL_BACKEND = os.getenv("EMAIL_BACKEND", "django.core.mail.backends.smtp.EmailBackend")
EMAIL_HOST = os.getenv("EMAIL_HOST", "58.26.203.101")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "25"))
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", "False")
EMAIL_USE_SSL = env_bool("EMAIL_USE_SSL", "False")
EMAIL_TIMEOUT = int(os.getenv("EMAIL_TIMEOUT", "10"))

NOTIFICATION_SIDE_EFFECTS_ENABLED = os.getenv("NOTIFICATION_SIDE_EFFECTS_ENABLED", "False") == "True"
NOTIFICATION_EMAIL_ENABLED = os.getenv("NOTIFICATION_EMAIL_ENABLED", "False") == "True"
NOTIFICATION_EMAIL_PROVIDER = os.getenv("NOTIFICATION_EMAIL_PROVIDER", "brevo").strip().lower()
BREVO_API_KEY = os.getenv("BREVO_API_KEY", "")
BREVO_FROM_EMAIL = os.getenv("BREVO_FROM_EMAIL", DEFAULT_FROM_EMAIL)
BREVO_FROM_NAME = os.getenv("BREVO_FROM_NAME", "DBKU fasTrack")
NOTIFICATION_EMAIL_REDIRECT_TO = os.getenv("NOTIFICATION_EMAIL_REDIRECT_TO", "")
NOTIFICATION_ADMIN_EMAILS = [
    value.strip()
    for value in os.getenv("NOTIFICATION_ADMIN_EMAILS", "").split(",")
    if value.strip()
]

WHATSAPP_ENABLED = os.getenv("WHATSAPP_ENABLED", "False") == "True"
WHATSAPP_PROVIDER = os.getenv("WHATSAPP_PROVIDER", "webhook").strip().lower()
WHATSAPP_WEBHOOK_URL = os.getenv("WHATSAPP_WEBHOOK_URL", "")
WHATSAPP_WEBHOOK_TOKEN = os.getenv("WHATSAPP_WEBHOOK_TOKEN", "")
EVOLUTION_API_URL = os.getenv("EVOLUTION_API_URL", "").rstrip("/")
EVOLUTION_API_KEY = os.getenv("EVOLUTION_API_KEY", "")
EVOLUTION_INSTANCE_NAME = os.getenv("EVOLUTION_INSTANCE_NAME", "")
WHATSAPP_META_PHONE_NUMBER_ID = os.getenv("WHATSAPP_META_PHONE_NUMBER_ID", "")
WHATSAPP_META_ACCESS_TOKEN = os.getenv("WHATSAPP_META_ACCESS_TOKEN", "")
NOTIFICATION_ADMIN_WHATSAPP_NUMBERS = [
    value.strip()
    for value in os.getenv("NOTIFICATION_ADMIN_WHATSAPP_NUMBERS", "").split(",")
    if value.strip()
]

# Default PK
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
AUTH_USER_MODEL = 'accounts.User'
