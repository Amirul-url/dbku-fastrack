import mimetypes

from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404

from applications.models import SupportingDocument


STAFF_ROLES = {"admin", "supervisor", "staff"}
APPLICANT_EDITABLE_STATUSES = {"draft", "incomplete", "technical_amendment", "rejected"}
APPLICANT_DOCUMENT_DELETE_STATUSES = {
    "draft",
    "incomplete",
    "technical_amendment",
    "rejected",
    "invoice_generated",
    "payment_submitted",
}


def can_upload_application_document(user, application, title):
    if getattr(user, "role", "") in STAFF_ROLES:
        return True

    if application.status in APPLICANT_EDITABLE_STATUSES:
        return True

    return title == "Payment Receipt" and application.status in {
        "invoice_generated",
        "payment_submitted",
    }


def can_delete_application_document(user, application):
    if getattr(user, "role", "") in STAFF_ROLES:
        return True

    return application.status in APPLICANT_DOCUMENT_DELETE_STATUSES


def create_application_document(application, title, uploaded_file):
    return SupportingDocument.objects.create(
        application=application,
        title=title,
        file=uploaded_file,
    )


def get_application_document(application, document_id):
    return get_object_or_404(
        SupportingDocument,
        id=document_id,
        application=application,
    )


def get_application_site_image_document(application):
    step_1 = (application.form_data or {}).get("step_1", {})
    saved_site_image = step_1.get("site_image") or {}
    saved_document_ids = [
        step_1.get("site_image_document_id"),
        saved_site_image.get("document_id") if isinstance(saved_site_image, dict) else None,
        saved_site_image.get("id") if isinstance(saved_site_image, dict) else None,
    ]
    documents = list(
        application.supporting_documents.filter(title="Site Image").order_by(
            "-uploaded_at"
        )
    )

    for document_id in saved_document_ids:
        if not document_id:
            continue

        try:
            document = application.supporting_documents.get(id=document_id)
        except (SupportingDocument.DoesNotExist, ValueError, TypeError):
            continue

        if document not in documents:
            documents.append(document)

    for document in documents:
        if document.file and document.file.storage.exists(document.file.name):
            return document

    raise Http404("Site image file not found.")


def delete_document_file(document):
    if document.file:
        document.file.delete(save=False)


def get_document_filename(document):
    return document.file.name.rsplit("/", 1)[-1] if document.file else ""


def build_document_file_response(document):
    try:
        content_type = (
            mimetypes.guess_type(document.file.name)[0]
            or "application/octet-stream"
        )
        return FileResponse(
            document.file.open("rb"),
            as_attachment=False,
            filename=get_document_filename(document),
            content_type=content_type,
        )
    except FileNotFoundError as exc:
        raise Http404("File not found.") from exc
