from django.utils import timezone
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import NotificationDelivery
from .serializers import NotificationDeliverySerializer
from .services import ADMIN_NOTIFICATION_STATUSES, APPLICANT_NOTIFICATION_STATUSES


class NotificationDeliveryViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = NotificationDeliverySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        allowed_event_statuses = (
            ADMIN_NOTIFICATION_STATUSES
            if self.request.user.role in ["admin", "staff"]
            else APPLICANT_NOTIFICATION_STATUSES
        )

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
