from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("applications", "0006_application_latest_remark"),
    ]

    operations = [
        migrations.AlterField(
            model_name="application",
            name="status",
            field=models.CharField(
                choices=[
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
                ],
                default="draft",
                max_length=30,
            ),
        ),
    ]
