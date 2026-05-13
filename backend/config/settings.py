import os
from pathlib import Path
from dotenv import load_dotenv
from datetime import timedelta

# Load .env
load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

# ENV
SECRET_KEY = os.getenv("SECRET_KEY", "fallback-secret")
DEBUG = os.getenv("DEBUG", "True") == "True"

ALLOWED_HOSTS = os.getenv("ALLOWED_HOSTS", "").split(",")

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
USE_SQLITE = os.getenv("USE_SQLITE", "True") == "True"

if USE_SQLITE:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.getenv("DB_NAME"),
            'USER': os.getenv("DB_USER"),
            'PASSWORD': os.getenv("DB_PASSWORD"),
            'HOST': os.getenv("DB_HOST"),
            'PORT': os.getenv("DB_PORT", "5432"),
        }
    }

# Password validation
AUTH_PASSWORD_VALIDATORS = []

# DRF + JWT
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=1),
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# CORS
CORS_ALLOWED_ORIGINS = os.getenv("CORS_ALLOWED_ORIGINS", "").split(",")

# Static
STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# Outbound notifications
FRONTEND_URL = os.getenv("FRONTEND_URL", "").rstrip("/")

DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "")

NOTIFICATION_EMAIL_ENABLED = os.getenv("NOTIFICATION_EMAIL_ENABLED", "False") == "True"
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
