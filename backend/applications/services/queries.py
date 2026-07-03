from django.db.models import Q

from applications.models import Application


STAFF_ROLES = {"admin", "supervisor", "staff"}


def parse_list_query_values(raw_values):
    values = []

    for item in raw_values:
        values.extend(
            part.strip()
            for part in str(item or "").split(",")
            if part.strip()
        )

    return values


def get_user_application_queryset(user):
    if getattr(user, "role", "") in STAFF_ROLES:
        return Application.objects.filter(~Q(status="draft") | Q(applicant=user))

    return Application.objects.filter(applicant=user)


def apply_application_filters(queryset, statuses=None, application_types=None, search=""):
    if statuses:
        queryset = queryset.filter(status__in=statuses)

    if application_types:
        queryset = queryset.filter(application_type__in=application_types)

    search = str(search or "").strip()
    if search:
        queryset = queryset.filter(
            Q(reference_no__icontains=search)
            | Q(title__icontains=search)
            | Q(project_location__icontains=search)
            | Q(applicant__username__icontains=search)
            | Q(applicant__first_name__icontains=search)
            | Q(applicant__last_name__icontains=search)
            | Q(applicant__email__icontains=search)
        )

    return queryset


def build_application_queryset(
    user,
    statuses=None,
    application_types=None,
    search="",
    include_documents=False,
):
    queryset = get_user_application_queryset(user)
    queryset = queryset.select_related("applicant").order_by("-updated_at")
    queryset = apply_application_filters(
        queryset,
        statuses=statuses,
        application_types=application_types,
        search=search,
    )

    if include_documents:
        return queryset.prefetch_related("supporting_documents")

    return queryset
