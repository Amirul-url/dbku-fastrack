from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Application
from .serializers import ApplicationSerializer


class ApplicationViewSet(viewsets.ModelViewSet):
    serializer_class = ApplicationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user

        if user.role in ["admin", "staff"]:
            return Application.objects.all()

        return Application.objects.filter(applicant=user)

    def perform_create(self, serializer):
        serializer.save(applicant=self.request.user)

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        application = self.get_object()

        if application.status != "draft":
            return Response(
                {"error": "Only draft applications can be submitted."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        application.status = "submitted"
        application.save()

        return Response({
            "message": "Application submitted successfully.",
            "data": ApplicationSerializer(application).data,
        })

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        application = self.get_object()

        if request.user.role not in ["admin", "staff"]:
            return Response(
                {"error": "You do not have permission to approve applications."},
                status=status.HTTP_403_FORBIDDEN,
            )

        application.status = "approved"
        application.save()

        return Response({
            "message": "Application approved successfully.",
            "data": ApplicationSerializer(application).data,
        })

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        application = self.get_object()

        if request.user.role not in ["admin", "staff"]:
            return Response(
                {"error": "You do not have permission to reject applications."},
                status=status.HTTP_403_FORBIDDEN,
            )

        application.status = "rejected"
        application.save()

        return Response({
            "message": "Application rejected successfully.",
            "data": ApplicationSerializer(application).data,
        })