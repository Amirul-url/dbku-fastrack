from django.contrib import admin
from .models import Application


@admin.register(Application)
class ApplicationAdmin(admin.ModelAdmin):
    list_display = (
        "reference_no",
        "applicant",
        "application_type",
        "title",
        "status",
        "current_step",
        "created_at",
    )
    list_filter = ("status", "application_type", "created_at")
    search_fields = ("reference_no", "title", "applicant__username")
    readonly_fields = ("reference_no", "created_at", "updated_at")