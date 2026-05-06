from django.conf import settings
from django.db import models


class Application(models.Model):
    STATUS_CHOICES = (
        ("draft", "Draft"),
        ("submitted", "Submitted"),
        ("under_review", "Under Review"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
    )

    APPLICATION_TYPE_CHOICES = (
        ("sitting_application", "Sitting Application"),
        ("signboard_license", "Signboard License"),
        ("building_plan", "Building Plan"),
        ("other", "Other"),
    )

    reference_no = models.CharField(max_length=50, unique=True, blank=True)
    applicant = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="applications",
    )
    application_type = models.CharField(
        max_length=50,
        choices=APPLICATION_TYPE_CHOICES,
        default="sitting_application",
    )
    title = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default="draft")
    current_step = models.PositiveIntegerField(default=1)
    form_data = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.reference_no:
            last_id = Application.objects.count() + 1
            self.reference_no = f"FT-{last_id:05d}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.reference_no} - {self.title or self.application_type}"