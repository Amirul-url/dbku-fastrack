from django.conf import settings
from django.db import IntegrityError, models
from django.utils import timezone
import re


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
        indexes = [
            models.Index(fields=["status", "-updated_at"], name="app_status_updated_idx"),
            models.Index(fields=["applicant", "-updated_at"], name="app_applicant_updated_idx"),
            models.Index(fields=["application_type"], name="app_type_idx"),
            models.Index(fields=["-updated_at"], name="app_updated_idx"),
        ]

    @classmethod
    def next_reference_no(cls, year=None):
        reference_year = int(year or timezone.now().year)
        prefix = f"ALiS.{reference_year}-"
        references = cls.objects.exclude(reference_no="").values_list(
            "reference_no",
            flat=True,
        )
        highest_number = 0

        for reference_no in references:
            match = re.fullmatch(
                rf"{re.escape(prefix)}(\d{{4}})",
                str(reference_no or ""),
            )
            if match:
                highest_number = max(highest_number, int(match.group(1)))

        next_number = highest_number + 1

        while True:
            reference_no = f"{prefix}{next_number:04d}"
            if not cls.objects.filter(reference_no=reference_no).exists():
                return reference_no

            next_number += 1

    def save(self, *args, **kwargs):
        should_generate_reference = not self.reference_no

        if should_generate_reference:
            for _ in range(5):
                self.reference_no = self.next_reference_no()

                try:
                    return super().save(*args, **kwargs)
                except IntegrityError as exc:
                    if "reference_no" not in str(exc):
                        raise

                    self.reference_no = ""

            raise IntegrityError("Unable to generate a unique application reference number.")

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

    class Meta:
        indexes = [
            models.Index(fields=["application", "title"], name="doc_app_title_idx"),
            models.Index(fields=["application", "-uploaded_at"], name="doc_app_uploaded_idx"),
        ]

    def __str__(self):
        return self.title
