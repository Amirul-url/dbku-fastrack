from django.conf import settings
from django.db import models


class Application(models.Model):
    STATUS_CHOICES = (
        ("draft", "Draft"),
        ("incomplete", "Incomplete"),
        ("submitted", "Submitted"),
        ("under_review", "Under Review"),
        ("auto_screened", "S2 Verification"),
        ("ku_ikl_review", "KU(IKL) Verification"),
        ("technical_review", "Technical Review"),
        ("technical_site_visit", "Technical Site Visit"),
        ("technical_amendment", "Technical Amendment Required"),
        ("technical_review_completed", "Technical Review Completed"),
        ("management_review", "Management Review"),
        ("mphlg_processing", "MPHLG Processing"),
        ("mphlg_decision_received", "MPHLG Decision Received"),
        ("approved", "Approved"),
        ("approved_with_conditions", "Approved with Conditions"),
        ("rejected", "Rejected"),
        ("bill_pending_ku", "Bill Pending KU(IKL) Confirmation"),
        ("invoice_generated", "Invoice Generated"),
        ("payment_submitted", "Payment Submitted"),
        ("payment_verified", "Payment Verified"),
        ("license_issued", "License Issued"),
        ("license_revoked", "License Revoked"),
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
    project_location = models.CharField(max_length=500, blank=True)
    latest_remark = models.TextField(blank=True)

    status = models.CharField(
        max_length=30,
        choices=STATUS_CHOICES,
        default="draft",
    )

    current_step = models.PositiveIntegerField(default=1)

    form_data = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    @classmethod
    def next_reference_no(cls):
        last_application = cls.objects.order_by("-id").only("id").first()
        next_number = (last_application.id if last_application else 0) + 1

        while True:
            reference_no = f"FT-{next_number:05d}"
            if not cls.objects.filter(reference_no=reference_no).exists():
                return reference_no

            next_number += 1

    def save(self, *args, **kwargs):
        if not self.reference_no:
            self.reference_no = self.next_reference_no()

        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.reference_no} - {self.title or self.application_type}"


class SupportingDocument(models.Model):
    application = models.ForeignKey(
        Application,
        on_delete=models.CASCADE,
        related_name="supporting_documents",
    )

    title = models.CharField(max_length=255)

    file = models.FileField(
        upload_to="supporting_documents/"
    )

    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title
