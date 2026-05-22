from django.utils import timezone
from django.db.models import Q
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import NotificationDelivery
from .serializers import NotificationDeliverySerializer
from .services import (
    APPLICANT_NOTIFICATION_STATUSES,
    SUPERADMIN_NOTIFICATION_STATUSES,
    ADMIN_TECHNICAL_TASK_STATUSES,
    LICENSE_RENEWAL_NOTIFICATION_STATUSES,
    ensure_user_pending_web_notifications,
    normalize_department,
)


class NotificationDeliveryViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = NotificationDeliverySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        use_department_inbox = False
        ensure_user_pending_web_notifications(self.request.user)

        if self.request.user.role == "superadmin":
            allowed_event_statuses = SUPERADMIN_NOTIFICATION_STATUSES
            recipient_filter = Q(user=self.request.user)
        elif self.request.user.role in ["admin", "supervisor", "staff"]:
            department = normalize_department(getattr(self.request.user, "department", ""))
            use_department_inbox = bool(department)
            if department == "PT(IKL)":
                allowed_event_statuses = {
                    "submitted",
                    "approved",
                    "payment_submitted",
                    "payment_verified",
                    "license_renewal_3m",
                    "license_renewal_2m",
                    "license_renewal_1m",
                    "license_cancellation_pending",
                }
            elif department == "KU(IKL)":
                allowed_event_statuses = {
                    "ku_ikl_review",
                    "technical_review_completed",
                    "bill_pending_ku",
                }
            elif department == "IKL (TECHNICAL)":
                allowed_event_statuses = {
                    "technical_review",
                    "technical_site_visit",
                    "technical_amendment",
                }
            elif department in {"BLG", "GPM", "MNE", "IMT", "LNP", "ENG"}:
                allowed_event_statuses = ADMIN_TECHNICAL_TASK_STATUSES
            elif department in {"KB(LES)", "TP(RES)", "PGH", "TP(RES)/PGH", "TP/PGH"}:
                allowed_event_statuses = {"management_review"}
                if department == "KB(LES)":
                    allowed_event_statuses = {
                        "management_review",
                        "license_cancellation_kb_support",
                        "license_renewal_3m",
                        "license_renewal_2m",
                        "license_renewal_1m",
                        "license_renewal_supervisor_confirmation",
                        "license_cancellation_supervisor_confirmation",
                    }
            elif department == "MPHLG":
                allowed_event_statuses = {"mphlg_processing"}
            elif department == "SUT":
                allowed_event_statuses = {"mphlg_decision_received"}
            else:
                allowed_event_statuses = set()
            if self.request.user.role == "supervisor":
                allowed_event_statuses = set(allowed_event_statuses) | {
                    "license_renewal_3m",
                    "license_renewal_2m",
                    "license_renewal_1m",
                    "license_renewal_supervisor_confirmation",
                    "license_cancellation_supervisor_confirmation",
                }
            recipient_filter = Q(user=self.request.user) | Q(
                user__role__in=["admin", "supervisor", "staff"],
            )
        else:
            allowed_event_statuses = APPLICANT_NOTIFICATION_STATUSES | {
                "license_renewal_released",
                "license_cancellation_released",
            }
            recipient_filter = Q(user=self.request.user)

        queryset = (
            NotificationDelivery.objects.filter(
                recipient_filter,
                channel="web",
                metadata__event_status__in=allowed_event_statuses,
            )
            .select_related("application", "user")
            .order_by("-created_at")
        )

        if not use_department_inbox:
            return queryset

        selected_deliveries = {}
        for delivery in queryset:
            delivery_department = normalize_department(getattr(delivery.user, "department", ""))
            if delivery.user_id != self.request.user.id and delivery_department != department:
                continue

            current = selected_deliveries.get(delivery.event_key)
            if current is None or delivery.user_id == self.request.user.id:
                selected_deliveries[delivery.event_key] = delivery

        return (
            NotificationDelivery.objects.filter(
                id__in=[delivery.id for delivery in selected_deliveries.values()]
            )
            .select_related("application", "user")
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
