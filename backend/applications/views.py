from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser
from rest_framework.response import Response
from .models import Application, SupportingDocument
from .serializers import (
    ApplicationListSerializer,
    ApplicationDetailSerializer,
    SupportingDocumentSerializer,
)


class ApplicationViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_serializer_class(self):
        if self.action == "list":
            return ApplicationListSerializer

        return ApplicationDetailSerializer

    def get_queryset(self):
        user = self.request.user

        if user.role in ["admin", "staff"]:
            queryset = Application.objects.all()
        else:
            queryset = Application.objects.filter(applicant=user)

        queryset = queryset.select_related("applicant").order_by("-updated_at")

        if self.action == "list":
            return queryset.defer("form_data")

        return queryset.prefetch_related("supporting_documents")

    def perform_create(self, serializer):
        serializer.save(applicant=self.request.user)

    @action(detail=True, methods=["post"])
    def upload_document(self, request, pk=None):
        application = self.get_object()

        uploaded_file = request.FILES.get("file")
        title = request.data.get("title", "Document")

        if not uploaded_file:
            return Response(
                {"error": "No file uploaded."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        document = SupportingDocument.objects.create(
            application=application,
            title=title,
            file=uploaded_file,
        )

        serializer = SupportingDocumentSerializer(
            document,
            context={"request": request},
        )

        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        application = self.get_object()

        if application.status != "draft":
            return Response(
                {"error": "Only draft applications can be submitted."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        application.status = "submitted"
        application.current_step = max(application.current_step, 11)
        application.save()

        return Response(
            {
                "message": "Application submitted successfully.",
                "data": ApplicationDetailSerializer(
                    application,
                    context={"request": request},
                ).data,
            }
        )

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        application = self.get_object()

        if request.user.role not in ["admin", "staff"]:
            return Response(
                {
                    "error": "You do not have permission to approve applications."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        application.status = "approved"
        application.save()

        return Response(
            {
                "message": "Application approved successfully.",
                "data": ApplicationDetailSerializer(
                    application,
                    context={"request": request},
                ).data,
            }
        )

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        application = self.get_object()

        if request.user.role not in ["admin", "staff"]:
            return Response(
                {
                    "error": "You do not have permission to reject applications."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        application.status = "rejected"
        application.save()

        return Response(
            {
                "message": "Application rejected successfully.",
                "data": ApplicationDetailSerializer(
                    application,
                    context={"request": request},
                ).data,
            }
        )
