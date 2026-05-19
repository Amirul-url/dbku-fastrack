from django.utils import timezone
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import NotificationDelivery
from .serializers import NotificationDeliverySerializer
from .services import (
    APPLICANT_NOTIFICATION_STATUSES,
    SUPERADMIN_NOTIFICATION_STATUSES,
    ADMIN_TECHNICAL_TASK_STATUSES,
    normalize_department,
)


class NotificationDeliveryViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = NotificationDeliverySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if self.request.user.role == "superadmin":
            allowed_event_statuses = SUPERADMIN_NOTIFICATION_STATUSES
        elif self.request.user.role in ["admin", "supervisor", "staff"]:
            department = normalize_department(getattr(self.request.user, "department", ""))
            if department == "PT(IKL)":
                allowed_event_statuses = {"submitted", "technical_amendment"}
            elif department == "KU(IKL)":
                allowed_event_statuses = {"ku_ikl_review", "technical_review_completed"}
            elif department == "IKL (TECHNICAL)":
                allowed_event_statuses = {
                    "technical_review",
                    "technical_site_visit",
                }
            elif department in {"BLG", "GPM", "MNE", "IMT", "LNP", "ENG"}:
                allowed_event_statuses = ADMIN_TECHNICAL_TASK_STATUSES
            elif department in {"KB(LES)", "TP(RES)", "PGH", "TP(RES)/PGH", "TP/PGH"}:
                allowed_event_statuses = {"management_review"}
            else:
                allowed_event_statuses = set()
        else:
            allowed_event_statuses = APPLICANT_NOTIFICATION_STATUSES

        return (
            NotificationDelivery.objects.filter(
                channel="web",
                user=self.request.user,
                metadata__event_status__in=allowed_event_statuses,
            )
            .select_related("application")
            .order_by("-created_at")
        )

    @action(detail=True, methods=["post"])
    def mark_read(self, request, pk=None):
        notification = self.get_object()

        if not notification.read_at:
            notification.read_at = timezone.now()
            notification.save(update_fields=["read_at"])

        return Response(self.get_serializer(notification).data)

    @action(detail=False, methods=["post"])
    def mark_all_read(self, request):
        now = timezone.now()
        updated = self.get_queryset().filter(read_at__isnull=True).update(read_at=now)

        return Response({"updated": updated})
