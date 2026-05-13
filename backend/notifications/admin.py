from django.contrib import admin
from .models import NotificationDelivery


@admin.register(NotificationDelivery)
class NotificationDeliveryAdmin(admin.ModelAdmin):
    list_display = [
        "application",
        "recipient_role",
        "channel",
        "recipient",
        "status",
        "created_at",
        "sent_at",
    ]
    list_filter = ["channel", "status", "recipient_role", "created_at"]
    search_fields = [
        "application__reference_no",
        "recipient",
        "subject",
        "message",
        "error",
    ]
    readonly_fields = [
        "application",
        "user",
        "event_key",
        "recipient_role",
        "channel",
        "recipient",
        "subject",
        "message",
        "status",
        "error",
        "created_at",
        "sent_at",
    ]
