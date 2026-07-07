from copy import deepcopy

from django.utils import timezone

from notifications.services import normalize_department


MAX_ACTIVITY_LOG_ITEMS = 80
STAFF_ACTIVITY_ROLES = {"admin", "supervisor", "staff"}
APPLICANT_ACTIVITY_ROLES = {"applicant", "user"}
APPLICANT_SAFE_ACTIVITY_TITLES = {
    "application draft created",
    "application submitted",
    "application resubmitted",
    "payment receipt submitted",
}
STAFF_SAFE_APPLICANT_ACTIVITY_TITLES = {
    "application submitted",
    "application resubmitted",
    "payment receipt submitted",
}


def append_application_activity(application, actor, title, description="", category="user", metadata=None):
    form_data = deepcopy(application.form_data or {})
    activity_log = form_data.get("activity_log")

    if not isinstance(activity_log, list):
        activity_log = []

    activity = {
        "title": title,
        "description": description,
        "category": category,
        "actor": get_activity_actor_name(actor),
        "actor_id": getattr(actor, "id", None),
        "actor_role": getattr(actor, "role", ""),
        "actor_department": get_user_workflow_department(actor),
        "created_at": timezone_now_iso(),
    }
    if isinstance(metadata, dict) and metadata:
        activity["metadata"] = metadata

    activity_log.insert(0, activity)
    form_data["activity_log"] = activity_log[:MAX_ACTIVITY_LOG_ITEMS]
    application.form_data = form_data
    application.save(update_fields=["form_data", "updated_at"])


def get_activity_actor_name(user):
    full_name = " ".join(
        part for part in [getattr(user, "first_name", ""), getattr(user, "last_name", "")] if part
    ).strip()

    return full_name or getattr(user, "username", "") or "Applicant"


def get_user_workflow_department(user):
    identity_department = get_user_identity_workflow_department(user)
    if identity_department == "SUT":
        return identity_department

    department = normalize_department(getattr(user, "department", ""))
    if department:
        return department

    return identity_department


def get_user_identity_workflow_department(user):
    for value in [
        getattr(user, "full_name", ""),
        getattr(user, "username", ""),
        " ".join(
            part
            for part in [getattr(user, "first_name", ""), getattr(user, "last_name", "")]
            if part
        ),
    ]:
        department = normalize_department(value)
        if department:
            return department

    return ""


def timezone_now_iso():
    return timezone.now().isoformat()


def get_request_user(serializer):
    request = serializer.context.get("request") if hasattr(serializer, "context") else None
    user = getattr(request, "user", None)
    return user if getattr(user, "is_authenticated", False) else None


def is_applicant_safe_activity(activity):
    title = str(activity.get("title") or "").strip().lower()
    category = str(activity.get("category") or "").strip().lower()
    actor_role = str(activity.get("actor_role") or "").strip().lower()

    return (
        category == "user"
        or actor_role in APPLICANT_ACTIVITY_ROLES
        or title in APPLICANT_SAFE_ACTIVITY_TITLES
        or title.endswith(" details saved")
        or title.endswith(" uploaded")
        or title.endswith(" removed")
    )


def scope_activity_log_for_user(activity_log, user):
    if not user:
        return []

    role = str(getattr(user, "role", "") or "").strip().lower()
    user_id = getattr(user, "id", None)

    scoped = []
    for activity in activity_log:
        if not isinstance(activity, dict):
            continue

        actor_id = activity.get("actor_id")
        actor_role = str(activity.get("actor_role") or "").strip().lower()

        actor_matches_user = (
            actor_id not in {None, ""}
            and user_id not in {None, ""}
            and str(actor_id) == str(user_id)
        )

        if role in APPLICANT_ACTIVITY_ROLES:
            if actor_matches_user or (
                actor_id in {None, ""}
                and actor_role in APPLICANT_ACTIVITY_ROLES
                and is_applicant_safe_activity(activity)
            ):
                scoped.append(activity)
            continue

        if role in STAFF_ACTIVITY_ROLES:
            if actor_matches_user or is_rejected_activity(activity) or is_staff_safe_applicant_activity(activity):
                scoped.append(activity)
            continue

        if role == "superadmin":
            scoped.append(activity)

    return scoped


def is_rejected_activity(activity):
    title = str(activity.get("title") or "").strip().lower()
    return title == "application rejected" or title.startswith("application rejected by")


def is_staff_safe_applicant_activity(activity):
    title = str(activity.get("title") or "").strip().lower()
    actor_role = str(activity.get("actor_role") or "").strip().lower()
    category = str(activity.get("category") or "").strip().lower()

    return (
        title in STAFF_SAFE_APPLICANT_ACTIVITY_TITLES
        and (category == "user" or actor_role in APPLICANT_ACTIVITY_ROLES)
    )


def clean_remark(value):
    remark = str(value or "").strip()
    if remark in {"", "-", "[]"}:
        return ""

    return remark
