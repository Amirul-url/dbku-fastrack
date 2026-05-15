from django.conf import settings
from django.db import models


class NotificationDelivery(models.Model):
    CHANNEL_CHOICES = (
        ("web", "Web"),
        ("email", "Email"),
        ("whatsapp", "WhatsApp"),
    )

    STATUS_CHOICES = (
        ("pending", "Pending"),
        ("sent", "Sent"),
        ("skipped", "Skipped"),
        ("failed", "Failed"),
    )

    application = models.ForeignKey(
        "applications.Application",
        on_delete=models.CASCADE,
        blank=True,
        null=True,
        related_name="notification_deliveries",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="notification_deliveries",
    )
    event_key = models.CharField(max_length=120)
    recipient_role = models.CharField(max_length=30)
    channel = models.CharField(max_length=20, choices=CHANNEL_CHOICES)
    recipient = models.CharField(max_length=255)
    subject = models.CharField(max_length=255, blank=True)
    message = models.TextField()
    metadata = models.JSONField(default=dict, blank=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="pending",
    )
    error = models.TextField(blank=True)
    read_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["event_key", "channel", "recipient"],
                name="unique_notification_delivery_event_recipient",
            )
        ]

    def __str__(self):
        return f"{self.channel} to {self.recipient} ({self.status})"
