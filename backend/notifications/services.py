import json
import logging
import re
import urllib.error
import urllib.request
from calendar import monthrange
from copy import deepcopy
from datetime import datetime, time
from hashlib import sha1

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.utils.dateparse import parse_datetime, parse_date
from django.utils import timezone

from .models import NotificationDelivery

logger = logging.getLogger(__name__)

APP_BRAND_NAME = "ALiS"
KU_TECHNICAL_MEMO_RECIPIENT = "IKL(TECHNICAL)"
NOTIFICATION_SIDE_EFFECTS_ENABLED = False


TECHNICAL_DEPARTMENT_ORDER = ("BLG", "GPM", "MNE", "IMT", "LNP", "ENG")
TECHNICAL_DEPARTMENTS = set(TECHNICAL_DEPARTMENT_ORDER)
PT_IKL_DEPARTMENTS = {"PT(IKL)", "PT IKL", "UNIT IKLAN"}
KU_IKL_DEPARTMENTS = {"KU(IKL)", "KU IKL"}
IKL_TECHNICAL_DEPARTMENTS = {"IKL (TECHNICAL)", "IKL(TECHNICAL)", "IKL TECHNICAL"}
APPROVAL_VERIFICATION_DEPARTMENTS = {"KB(LES)"}
APPROVAL_SUPPORT_DEPARTMENTS = {"TP(RES)", "PGH", "TP(RES)/PGH", "TP/PGH"}
MPHLG_REVIEW_DEPARTMENTS = {"MPHLG"}
SUT_APPROVAL_DEPARTMENTS = {"SUT", "SUT APPROVAL"}
KB_LES_COMPLETE_STATUSES = {"verified", "supported", "completed"}
MANAGEMENT_SUPPORT_COMPLETE_STATUSES = {"supported", "approved", "completed"}
ADMIN_TECHNICAL_TASK_STATUSES = {
    "technical_review",
    "technical_site_visit",
    "technical_amendment",
    "technical_review_completed",
}


STATUS_MESSAGES = {
    "submitted": (
        "Application {reference} requires KU(IKL) review",
        "Your application {reference} has been submitted successfully.",
        "Application {reference} has been submitted and is ready for KU(IKL) review.",
    ),
    "incomplete": (
        "Application rejected",
        "Your application {reference} was rejected by ALiS. Please review the remark below and update your application.",
        "",
    ),
    "rejected": (
        "Application rejected",
        "Your application {reference} has been rejected. Please review the remark below.",
        "",
    ),
    "invoice_generated": (
        "Payment proof required",
        "Bill for application {reference} has been confirmed. Please upload your proof of payment.",
        "",
    ),
    "approved": (
        "Final approval received",
        "",
        "Application {reference} has final TP(RES)/PGH approval. Please generate the approval letter and bill.",
    ),
    "bill_pending_ku": (
        "Bill confirmation required",
        "",
        "Application {reference} has a generated bill waiting for KU(IKL) confirmation.",
    ),
    "payment_submitted": (
        "Payment proof submitted",
        "",
        "Applicant has uploaded payment proof for application {reference}. Please verify the receipt.",
    ),
    "payment_verified": (
        "License issuance required",
        "",
        "Payment for application {reference} has been verified. Please generate the advertisement license and QR code.",
    ),
    "license_issued": (
        "QR e-license generated",
        "Your QR e-license for application {reference} has been generated successfully.",
        "",
    ),
    "technical_review": (
        "Technical task assigned",
        "",
        "Application {reference} is ready for your department technical review.",
    ),
    "ku_ikl_review": (
        "KU(IKL) review required",
        "",
        "Application {reference} is ready for KU(IKL) verification.",
    ),
    "technical_site_visit": (
        "Application {reference} requires IKL(TECHNICAL) review",
        "",
        "Application {reference} has completed selected unit technical review and is ready for IKL(TECHNICAL) review.",
    ),
    "technical_amendment": (
        "Application {reference} requires technical amendment",
        "",
        "Application {reference} requires IKL(TECHNICAL) amendment before KU(IKL) can continue.",
    ),
    "technical_review_completed": (
        "Application {reference} requires KU(IKL) technical review",
        "",
        "Application {reference} has completed technical department feedback and is ready for KU(IKL) review.",
    ),
    "management_review": (
        "Application {reference} requires KB(LES) verification",
        "",
        "Application {reference} has completed KU(IKL) final checking and is ready for KB(LES) verification.",
    ),
    "mphlg_processing": (
        "Application {reference} requires MPHLG approval",
        "",
        "Application {reference} is ready for MPHLG approval.",
    ),
    "mphlg_decision_received": (
        "Application {reference} requires SUT approval",
        "",
        "Application {reference} is ready for SUT approval.",
    ),
}

STATUS_UI = {
    "submitted": ("submission", "success"),
    "incomplete": ("correction", "error"),
    "rejected": ("decision", "error"),
    "invoice_generated": ("payment", "warning"),
    "approved": ("approval", "success"),
    "bill_pending_ku": ("payment", "warning"),
    "payment_submitted": ("payment", "warning"),
    "payment_verified": ("payment", "success"),
    "license_issued": ("license", "success"),
    "ku_ikl_review": ("screening", "warning"),
    "technical_review": ("technical", "warning"),
    "technical_site_visit": ("technical", "warning"),
    "technical_amendment": ("technical", "warning"),
    "technical_review_completed": ("technical", "info"),
    "management_review": ("approval", "warning"),
    "mphlg_processing": ("approval", "warning"),
    "mphlg_decision_received": ("approval", "warning"),
}

APPLICANT_NOTIFICATION_STATUSES = {
    "registration_success",
    "applicant_submitted",
    "applicant_resubmitted",
    "submitted",
    "incomplete",
    "rejected",
    "invoice_generated",
    "license_issued",
}

ADMIN_NOTIFICATION_STATUSES = {
    "submitted",
    "ku_ikl_review",
    "approved",
    "bill_pending_ku",
    "payment_submitted",
    "payment_verified",
    "management_review",
    "mphlg_processing",
    "mphlg_decision_received",
    *ADMIN_TECHNICAL_TASK_STATUSES,
}

SUPERADMIN_NOTIFICATION_STATUSES = {"account_created"}
LICENSE_RENEWAL_NOTIFICATION_STATUSES = {
    "license_renewal_3m",
    "license_renewal_2m",
    "license_renewal_1m",
    "license_renewal_supervisor_confirmation",
    "license_renewal_released",
    "license_cancellation_pending",
    "license_cancellation_supervisor_confirmation",
    "license_cancellation_kb_support",
    "license_cancellation_released",
}

NOTIFIABLE_STATUSES = APPLICANT_NOTIFICATION_STATUSES | ADMIN_NOTIFICATION_STATUSES

REMARK_REPEAT_STATUSES = {
    "incomplete",
    "rejected",
    "technical_amendment",
}


def notify_application_status_change(
    application,
    old_status=None,
    old_remark=None,
    old_form_data=None,
    force=False,
):
    if not force and not notification_side_effects_enabled():
        return

    new_status = str(application.status or "").strip().lower()
    previous_status = str(old_status or "").strip().lower()
    current_remark = str(getattr(application, "latest_remark", "") or "").strip()
    previous_remark = str(old_remark or "").strip()
    status_changed = previous_status != new_status
    remark_changed = current_remark != previous_remark
    routing_changed = has_notification_route_changed(
        application,
        previous_status,
        new_status,
        old_form_data,
    )

    if new_status not in NOTIFIABLE_STATUSES:
        return

    if not status_changed and not routing_changed and not (
        new_status in REMARK_REPEAT_STATUSES and remark_changed
    ):
        return

    messages = build_status_messages(application)
    event_key = build_event_key(application, new_status, remark_changed)

    for recipient in build_recipients(application, messages):
        create_and_send_delivery(
            application=application,
            event_key=event_key,
            force=force,
            **recipient,
        )


def notify_account_created(account, created_by=None):
    if not notification_side_effects_enabled():
        return

    if not getattr(account, "pk", None):
        return

    subject, message, metadata = build_account_created_message(account, created_by)
    event_key = f"account:{account.pk}:created"

    for user in get_superadmin_web_recipients():
        create_and_send_delivery(
            application=None,
            event_key=event_key,
            user=user,
            recipient_role="superadmin",
            channel="web",
            recipient=get_web_recipient(user),
            subject=subject,
            message=message,
            metadata=metadata,
        )


def notify_applicant_registration_success(account):
    if not getattr(account, "pk", None):
        return

    role = normalize_account_role(getattr(account, "role", ""))
    if role != "applicant":
        return

    subject, message, metadata = build_applicant_registration_success_message(account)
    event_key = f"account:{account.pk}:registration_success"

    create_and_send_delivery(
        application=None,
        event_key=event_key,
        user=account,
        recipient_role="applicant",
        channel="web",
        recipient=get_web_recipient(account),
        subject=subject,
        message=message,
        metadata=metadata,
        force=True,
    )

    email = normalize_email(getattr(account, "email", ""))
    if email:
        create_and_send_delivery(
            application=None,
            event_key=event_key,
            user=account,
            recipient_role="applicant",
            channel="email",
            recipient=email,
            subject=subject,
            message=message,
            metadata=metadata,
            force=True,
        )

    phone = normalize_phone(getattr(account, "mobile_number", ""))
    if phone:
        create_and_send_delivery(
            application=None,
            event_key=event_key,
            user=account,
            recipient_role="applicant",
            channel="whatsapp",
            recipient=phone,
            subject=subject,
            message=message,
            metadata=metadata,
            force=True,
        )


def notify_applicant_application_submitted(application):
    if not getattr(application, "pk", None) or not getattr(application, "applicant_id", None):
        return

    subject, message, metadata = build_applicant_application_submitted_message(application)
    event_key = f"application:{application.pk}:applicant_submitted"
    send_forced_applicant_application_notification(application, event_key, subject, message, metadata)


def notify_applicant_application_resubmitted(application):
    if not getattr(application, "pk", None) or not getattr(application, "applicant_id", None):
        return

    subject, message, metadata = build_applicant_application_resubmitted_message(application)
    event_key = build_applicant_event_key(application, "applicant_resubmitted")
    send_forced_applicant_application_notification(application, event_key, subject, message, metadata)


def notify_staff_application_resubmitted(application):
    if not getattr(application, "pk", None):
        return

    recipients = get_admin_task_web_recipients(application)
    subject, message, metadata = build_staff_application_resubmitted_message(application)
    event_key = build_applicant_event_key(application, "staff_applicant_resubmitted")
    send_forced_staff_application_notification(
        application,
        event_key,
        subject,
        message,
        metadata,
        recipients,
    )


def notify_applicant_application_rejected(application, remark_changed=False):
    if not getattr(application, "pk", None) or not getattr(application, "applicant_id", None):
        return

    subject, message, metadata = build_applicant_application_rejected_message(application)
    event_key = build_event_key(application, "rejected", remark_changed=remark_changed)
    send_forced_applicant_application_notification(application, event_key, subject, message, metadata)


def send_forced_applicant_application_notification(application, event_key, subject, message, metadata):
    create_and_send_delivery(
        application=application,
        event_key=event_key,
        user=application.applicant,
        recipient_role="applicant",
        channel="web",
        recipient=get_web_recipient(application.applicant),
        subject=subject,
        message=message,
        metadata=metadata,
        force=True,
    )

    for email in get_applicant_emails(application):
        create_and_send_delivery(
            application=application,
            event_key=event_key,
            user=application.applicant,
            recipient_role="applicant",
            channel="email",
            recipient=email,
            subject=subject,
            message=message,
            metadata=metadata,
            force=True,
        )

    for phone in get_applicant_whatsapp_numbers(application):
        create_and_send_delivery(
            application=application,
            event_key=event_key,
            user=application.applicant,
            recipient_role="applicant",
            channel="whatsapp",
            recipient=phone,
            subject=subject,
            message=message,
            metadata=metadata,
            force=True,
        )


def send_forced_staff_application_notification(application, event_key, subject, message, metadata, users):
    for user in users:
        create_and_send_delivery(
            application=application,
            event_key=event_key,
            user=user,
            recipient_role="admin",
            channel="web",
            recipient=get_web_recipient(user),
            subject=subject,
            message=message,
            metadata=metadata,
            force=True,
        )

    for user, email in get_admin_task_email_recipients(application, users):
        create_and_send_delivery(
            application=application,
            event_key=event_key,
            user=user,
            recipient_role="admin",
            channel="email",
            recipient=email,
            subject=subject,
            message=message,
            metadata=metadata,
            force=True,
        )

    for user, phone in get_admin_task_whatsapp_numbers(application, users):
        create_and_send_delivery(
            application=application,
            event_key=event_key,
            user=user,
            recipient_role="admin",
            channel="whatsapp",
            recipient=phone,
            subject=subject,
            message=message,
            metadata=metadata,
            force=True,
        )


def build_applicant_event_key(application, event_status):
    updated_at = getattr(application, "updated_at", None)
    occurrence = updated_at.isoformat() if updated_at else timezone.now().isoformat()
    return f"application:{application.pk}:{event_status}:event:{occurrence}"


def process_license_renewal_reminders(now=None):
    from applications.models import Application

    current_time = now or timezone.now()
    processed = {
        "reminders": 0,
        "cancellations": 0,
    }

    applications = Application.objects.select_related("applicant").filter(status="license_issued")

    for application in applications:
        changed = False
        form_data = deepcopy(application.form_data or {})
        license_data = get_form_data_section(form_data, "license")
        expiry = parse_license_datetime(license_data.get("expiry_date"))

        if not expiry or normalize_status_value(license_data.get("status")) != "active":
            continue

        renewal = get_form_data_section(form_data, "license_renewal")
        reminders = renewal.get("reminders") if isinstance(renewal.get("reminders"), dict) else {}

        for months in (3, 2, 1):
            key = str(months)
            if reminders.get(key):
                continue

            if current_time >= subtract_calendar_months(expiry, months):
                reminders[key] = build_renewal_reminder_record(months, expiry, current_time)
                notify_license_renewal_detected(application, months, expiry)
                processed["reminders"] += 1
                changed = True

        renewal["reminders"] = reminders

        if current_time > expiry and not has_verified_renewal_payment(renewal):
            cancellation = renewal.get("cancellation") if isinstance(renewal.get("cancellation"), dict) else {}
            if not cancellation:
                renewal["cancellation"] = {
                    "status": "pending_pt_notice",
                    "detected_at": current_time.isoformat(),
                    "expiry_date": expiry.isoformat(),
                }
                notify_license_cancellation_task(application, "license_cancellation_pending")
                processed["cancellations"] += 1
                changed = True

        if changed:
            form_data["license_renewal"] = renewal
            application.form_data = form_data
            application.save(update_fields=["form_data"])

    return processed


def apply_license_renewal_action(application, action, user, months=None, note=""):
    action = str(action or "").strip().lower()
    form_data = deepcopy(application.form_data or {})
    renewal = get_form_data_section(form_data, "license_renewal")

    if action in {"generate_reminder_letter", "confirm_reminder_letter"}:
        if months not in {1, 2, 3}:
            raise ValueError("Reminder month must be 1, 2, or 3.")

        result = apply_license_reminder_action(application, renewal, action, user, months, note)
    elif action in {
        "generate_cancellation_notice",
        "confirm_cancellation_notice",
        "support_cancellation_notice",
    }:
        result = apply_license_cancellation_action(application, form_data, renewal, action, user, note)
    else:
        raise ValueError("Unsupported license renewal action.")

    form_data["license_renewal"] = renewal
    application.form_data = form_data
    update_fields = ["form_data"]

    if result.get("status"):
        application.status = result["status"]
        update_fields.append("status")

    application.save(update_fields=update_fields)
    return application


def apply_license_reminder_action(application, renewal, action, user, months, note):
    reminders = renewal.get("reminders") if isinstance(renewal.get("reminders"), dict) else {}
    key = str(months)
    reminder = reminders.get(key)
    if not isinstance(reminder, dict):
        raise ValueError(f"The {months}-month renewal reminder has not been detected yet.")

    if action == "generate_reminder_letter":
        if not is_pt_ikl_user(user):
            raise PermissionError("Only PT(IKL) can generate renewal reminder letters.")

        reminder["status"] = "pending_supervisor_confirmation"
        reminder["letter"] = {
            "type": "renewal_reminder",
            "months_before_expiry": months,
            "generated_at": timezone.now().isoformat(),
            "generated_by": get_web_recipient(user),
            "note": clean_remark(note),
            "content": build_renewal_letter_text(application, months),
        }
        reminders[key] = reminder
        renewal["reminders"] = reminders
        notify_license_renewal_supervisor_task(application, months)
        return {}

    if action == "confirm_reminder_letter":
        if not is_supervisor_user(user):
            raise PermissionError("Only a supervisor can confirm renewal reminder letters.")

        if reminder.get("status") != "pending_supervisor_confirmation":
            raise ValueError("The reminder letter is not waiting for supervisor confirmation.")

        reminder["status"] = "released_to_applicant"
        reminder["confirmed_at"] = timezone.now().isoformat()
        reminder["confirmed_by"] = get_web_recipient(user)
        reminder["confirmation_note"] = clean_remark(note)
        reminders[key] = reminder
        renewal["reminders"] = reminders
        notify_license_renewal_released(application, months)
        return {}

    raise ValueError("Unsupported reminder action.")


def apply_license_cancellation_action(application, form_data, renewal, action, user, note):
    cancellation = renewal.get("cancellation") if isinstance(renewal.get("cancellation"), dict) else {}

    if action == "generate_cancellation_notice":
        if not is_pt_ikl_user(user):
            raise PermissionError("Only PT(IKL) can generate cancellation notices.")

        cancellation.update({
            "status": "pending_supervisor_confirmation",
            "generated_at": timezone.now().isoformat(),
            "generated_by": get_web_recipient(user),
            "note": clean_remark(note),
            "content": build_cancellation_notice_text(application),
        })
        renewal["cancellation"] = cancellation
        notify_license_cancellation_task(application, "license_cancellation_supervisor_confirmation")
        return {}

    if action == "confirm_cancellation_notice":
        if not is_supervisor_user(user):
            raise PermissionError("Only a supervisor can confirm cancellation notices.")

        if cancellation.get("status") != "pending_supervisor_confirmation":
            raise ValueError("The cancellation notice is not waiting for supervisor confirmation.")

        cancellation.update({
            "status": "pending_kb_les_support",
            "confirmed_at": timezone.now().isoformat(),
            "confirmed_by": get_web_recipient(user),
            "confirmation_note": clean_remark(note),
        })
        renewal["cancellation"] = cancellation
        notify_license_cancellation_task(application, "license_cancellation_kb_support")
        return {}

    if action == "support_cancellation_notice":
        if not is_kb_les_user(user):
            raise PermissionError("Only KB(LES) can support cancellation notices.")

        if cancellation.get("status") != "pending_kb_les_support":
            raise ValueError("The cancellation notice is not waiting for KB(LES) support.")

        cancellation.update({
            "status": "released_to_applicant",
            "supported_at": timezone.now().isoformat(),
            "supported_by": get_web_recipient(user),
            "support_note": clean_remark(note),
        })
        renewal["cancellation"] = cancellation
        license_data = get_form_data_section(form_data, "license")
        license_data.update({
            "status": "Revoked",
            "revoked_at": timezone.now().isoformat(),
            "revocation_reason": "No renewal payment after expiry.",
        })
        form_data["license"] = license_data
        notify_license_cancellation_released(application)
        return {"status": "license_revoked"}

    raise ValueError("Unsupported cancellation action.")


def build_account_created_message(account, created_by=None):
    role = normalize_account_role(getattr(account, "role", ""))
    account_name = normalize_account_name(account)
    username = str(getattr(account, "username", "") or "").strip()
    creator_name = normalize_account_name(created_by) if created_by else ""
    role_label = get_account_role_label(role)
    title = f"New {role_label} account created"
    body = f"{role_label} account {account_name} was created successfully."

    if creator_name:
        body = f"{body} Created by {creator_name}."

    subject = f"{APP_BRAND_NAME} - {title}"
    lines = [
        APP_BRAND_NAME,
        "",
        title,
        f"Name: {account_name}",
        f"Role: {role_label}",
    ]

    if username:
        lines.append(f"Login ID: {username}")

    if creator_name:
        lines.append(f"Created by: {creator_name}")

    lines.extend(["", body])

    metadata = {
        "category": "account",
        "type": "success",
        "title": title,
        "title_en": title,
        "message": body,
        "message_en": body,
        "recipient_role": "superadmin",
        "event_status": "account_created",
        "account_id": account.pk,
        "account_role": role,
        "account_name": account_name,
        "account_username": username,
        "action_url": get_account_management_url(role),
    }

    return subject, "\n".join(lines), metadata


def build_applicant_registration_success_message(account):
    account_name = normalize_account_name(account)
    username = str(getattr(account, "username", "") or "").strip()
    title = "Account registration successful"
    body = "Your ALiS account has been registered successfully. You can now log in and submit advertisement license applications."
    subject = f"{APP_BRAND_NAME} - {title}"
    lines = [
        APP_BRAND_NAME,
        "",
        title,
        f"Name: {account_name}",
    ]

    if username:
        lines.append(f"Login ID: {username}")

    lines.extend(["", body])

    metadata = {
        "category": "account",
        "type": "success",
        "title": title,
        "title_en": title,
        "message": body,
        "message_en": body,
        "recipient_role": "applicant",
        "event_status": "registration_success",
        "account_id": account.pk,
        "account_role": "applicant",
        "account_name": account_name,
        "account_username": username,
        "action_url": "/login",
    }

    return subject, "\n".join(lines), metadata


def build_applicant_application_submitted_message(application):
    reference = getattr(application, "reference_no", "") or "-"
    title = str(getattr(application, "title", "") or "").strip() or "Application"
    subject = f"{APP_BRAND_NAME} - Application submitted ({reference})"
    body = (
        f"Your application {reference} has been submitted successfully. "
        "ALiS will review your application and notify you when there is an update."
    )
    lines = [
        APP_BRAND_NAME,
        "",
        body,
    ]
    metadata = {
        "category": "submission",
        "type": "success",
        "title": "Application submitted successfully",
        "title_en": "Application submitted successfully",
        "message": body,
        "message_en": body,
        "recipient_role": "applicant",
        "event_status": "applicant_submitted",
        "application_id": application.pk,
        "reference_no": reference,
        "project_title": title,
        "action_url": f"/applications/{application.pk}",
    }

    return subject, "\n".join(lines), metadata


def build_applicant_application_resubmitted_message(application):
    reference = getattr(application, "reference_no", "") or "-"
    title = str(getattr(application, "title", "") or "").strip() or "Application"
    subject = f"{APP_BRAND_NAME} - Application resubmitted ({reference})"
    body = (
        f"Your application {reference} has been resubmitted successfully. "
        "ALiS will review your updated application and notify you when there is an update."
    )
    lines = [
        APP_BRAND_NAME,
        "",
        body,
    ]
    metadata = {
        "category": "submission",
        "type": "success",
        "title": "Application resubmitted successfully",
        "title_en": "Application resubmitted successfully",
        "message": body,
        "message_en": body,
        "recipient_role": "applicant",
        "event_status": "applicant_resubmitted",
        "application_id": application.pk,
        "reference_no": reference,
        "project_title": title,
        "action_url": f"/applications/{application.pk}",
    }

    return subject, "\n".join(lines), metadata


def build_staff_application_resubmitted_message(application):
    reference = getattr(application, "reference_no", "") or "-"
    title = "Application resubmitted"
    review_target = "MPHLG" if str(getattr(application, "status", "") or "").strip().lower() == "mphlg_processing" else "KU(IKL)"
    body = f"Application {reference} has been resubmitted by the applicant and is ready for {review_target} review."
    subject = f"{APP_BRAND_NAME} - {title} ({reference})"
    metadata = build_web_metadata(
        application=application,
        title=title,
        body=body,
        recipient_role="admin",
    )
    message = format_notification_message(
        title=title,
        body=body,
        application=application,
        recipient_role="admin",
    )

    return subject, message, metadata


def build_applicant_application_rejected_message(application):
    reference = getattr(application, "reference_no", "") or "-"
    title = str(getattr(application, "title", "") or "").strip() or "Application"
    subject = f"{APP_BRAND_NAME} - Application rejected ({reference})"
    body = f"Your application {reference} has been rejected. Please review the remark and update your application."
    remark = get_latest_remark(application)
    if remark:
        body = f"{body}\n\nRemark: {remark}"
    lines = [
        APP_BRAND_NAME,
        "",
        body,
    ]
    metadata = {
        "category": "decision",
        "type": "error",
        "title": "Application rejected",
        "title_en": "Application rejected",
        "message": body,
        "message_en": body,
        "recipient_role": "applicant",
        "event_status": "rejected",
        "application_id": application.pk,
        "reference_no": reference,
        "project_title": title,
        "action_url": f"/applications/{application.pk}",
    }

    return subject, "\n".join(lines), metadata


def build_renewal_reminder_record(months, expiry, current_time):
    return {
        "months_before_expiry": months,
        "status": "pending_pt_letter",
        "detected_at": current_time.isoformat(),
        "expiry_date": expiry.isoformat(),
    }


def notify_license_renewal_detected(application, months, expiry):
    title = f"{months}-month license renewal reminder"
    body = (
        f"License {get_license_id(application)} for application {application.reference_no} "
        f"will expire on {format_notification_datetime(expiry)}. PT(IKL) must generate "
        "the renewal reminder letter and a supervisor must confirm it before release."
    )
    event_status = f"license_renewal_{months}m"
    send_license_workflow_notification(
        application=application,
        event_status=event_status,
        title=title,
        body=body,
        recipients=get_pt_ikl_and_supervisor_recipients(),
        recipient_role="admin",
        action_url=f"/admin/e-licenses/license?id={application.id}",
    )


def notify_license_renewal_supervisor_task(application, months):
    title = f"{months}-month renewal letter awaiting supervisor confirmation"
    body = (
        f"PT(IKL) has generated the {months}-month renewal reminder letter for "
        f"application {application.reference_no}. Please verify and confirm the letter."
    )
    send_license_workflow_notification(
        application=application,
        event_status="license_renewal_supervisor_confirmation",
        title=title,
        body=body,
        recipients=get_supervisor_recipients(),
        recipient_role="supervisor",
        action_url=f"/admin/e-licenses/license?id={application.id}",
        extra_metadata={"months_before_expiry": months},
    )


def notify_license_renewal_released(application, months):
    title = f"{months}-month license renewal reminder released"
    body = (
        f"Your advertisement license for application {application.reference_no} "
        f"is due to expire. Please complete the renewal process before the expiry date."
    )
    send_license_workflow_notification(
        application=application,
        event_status="license_renewal_released",
        title=title,
        body=body,
        recipients=[application.applicant] if getattr(application, "applicant_id", None) else [],
        recipient_role="applicant",
        action_url="/user/dashboard?tab=license",
        extra_metadata={"months_before_expiry": months},
        include_external=True,
    )


def notify_license_cancellation_task(application, event_status):
    copy = {
        "license_cancellation_pending": (
            "Cancellation notice required",
            f"License {get_license_id(application)} has expired without verified renewal payment. PT(IKL) must generate the cancellation and enforcement notice.",
            get_pt_ikl_recipients(),
            "admin",
        ),
        "license_cancellation_supervisor_confirmation": (
            "Cancellation notice awaiting supervisor confirmation",
            f"PT(IKL) has generated the cancellation and enforcement notice for application {application.reference_no}. Please verify and confirm the notice.",
            get_supervisor_recipients(),
            "supervisor",
        ),
        "license_cancellation_kb_support": (
            "Cancellation notice awaiting KB(LES) support",
            f"The cancellation and enforcement notice for application {application.reference_no} has been confirmed by a supervisor. KB(LES) support is required before release.",
            get_kb_les_recipients(),
            "supervisor",
        ),
    }
    title, body, recipients, recipient_role = copy[event_status]
    send_license_workflow_notification(
        application=application,
        event_status=event_status,
        title=title,
        body=body,
        recipients=recipients,
        recipient_role=recipient_role,
        action_url=f"/admin/e-licenses/license?id={application.id}",
    )


def notify_license_cancellation_released(application):
    title = "License cancellation notice released"
    body = (
        f"Your advertisement license for application {application.reference_no} "
        "has been cancelled and enforcement action may proceed because renewal payment was not completed after expiry."
    )
    send_license_workflow_notification(
        application=application,
        event_status="license_cancellation_released",
        title=title,
        body=body,
        recipients=[application.applicant] if getattr(application, "applicant_id", None) else [],
        recipient_role="applicant",
        action_url="/user/dashboard?tab=license",
        include_external=True,
    )


def send_license_workflow_notification(
    application,
    event_status,
    title,
    body,
    recipients,
    recipient_role,
    action_url,
    extra_metadata=None,
    include_external=False,
):
    subject = f"{APP_BRAND_NAME} - {title} ({application.reference_no})"
    message = format_license_workflow_message(title, body, application, recipient_role)
    metadata = {
        "category": "license",
        "type": "warning" if "cancellation" not in event_status else "error",
        "title": title,
        "title_en": title,
        "message": body,
        "message_en": body,
        "recipient_role": recipient_role,
        "event_status": event_status,
        "action_url": action_url,
        **(extra_metadata or {}),
    }
    event_key = f"application:{application.id}:{event_status}"
    if extra_metadata and extra_metadata.get("months_before_expiry"):
        event_key = f"{event_key}:{extra_metadata['months_before_expiry']}"

    for user in recipients:
        if not user:
            continue
        create_and_send_delivery(
            application=application,
            event_key=event_key,
            user=user,
            recipient_role=recipient_role,
            channel="web",
            recipient=get_web_recipient(user),
            subject=subject,
            message=message,
            metadata=metadata,
        )

    if include_external and recipient_role == "applicant":
        for email in get_applicant_emails(application):
            create_and_send_delivery(
                application=application,
                event_key=event_key,
                user=application.applicant,
                recipient_role=recipient_role,
                channel="email",
                recipient=email,
                subject=subject,
                message=message,
                metadata=metadata,
            )
        for phone in get_applicant_whatsapp_numbers(application):
            create_and_send_delivery(
                application=application,
                event_key=event_key,
                user=application.applicant,
                recipient_role=recipient_role,
                channel="whatsapp",
                recipient=phone,
                subject=subject,
                message=message,
                metadata=metadata,
            )
        return

    for user in recipients:
        email = normalize_email(getattr(user, "email", ""))
        if email:
            create_and_send_delivery(
                application=application,
                event_key=event_key,
                user=user,
                recipient_role=recipient_role,
                channel="email",
                recipient=email,
                subject=subject,
                message=message,
                metadata=metadata,
            )
        phone = normalize_phone(getattr(user, "mobile_number", ""))
        if phone:
            create_and_send_delivery(
                application=application,
                event_key=event_key,
                user=user,
                recipient_role=recipient_role,
                channel="whatsapp",
                recipient=phone,
                subject=subject,
                message=message,
                metadata=metadata,
            )


def format_license_workflow_message(title, body, application, recipient_role="admin"):
    if recipient_role != "applicant":
        return format_simple_internal_notification_message(body)

    return "\n".join([
        APP_BRAND_NAME,
        "",
        title,
        f"Reference: {application.reference_no}",
        f"License ID: {get_license_id(application)}",
        "",
        body,
    ])


def get_account_management_url(role):
    if role in {"applicant", "user"}:
        return "/superadmin/users"
    if role == "supervisor":
        return "/superadmin/supervisors"
    return "/superadmin/admins"


def build_event_key(application, status_key, remark_changed=False):
    updated_at = getattr(application, "updated_at", None)
    if updated_at:
        occurrence = updated_at.isoformat()
    else:
        occurrence = timezone.now().isoformat()

    if remark_changed:
        remark = str(getattr(application, "latest_remark", "") or "")
        occurrence = sha1(f"{occurrence}:{remark}".encode("utf-8")).hexdigest()[:12]

    return f"application:{application.id}:status:{status_key}:event:{occurrence}"


def has_notification_route_changed(application, previous_status, new_status, old_form_data):
    if previous_status != new_status:
        return False

    if new_status in ADMIN_TECHNICAL_TASK_STATUSES:
        previous_route = get_technical_review_route_key(old_form_data or {})
        current_route = get_technical_review_route_key(getattr(application, "form_data", None) or {})
        return previous_route != current_route

    if new_status != "management_review":
        return False

    previous_route = get_management_review_route_key(old_form_data or {})
    current_route = get_management_review_route_key(getattr(application, "form_data", None) or {})
    return previous_route != current_route


def get_technical_review_route_key(form_data):
    return ",".join(sorted(get_selected_technical_departments_from_form_data(form_data)))


def get_management_review_route_key(form_data):
    kb_section = get_form_data_section(form_data, "kb_les_verification")
    support_section = get_form_data_section(form_data, "management_recommendation")
    kb_status = normalize_status_value(kb_section.get("status"))
    support_status = normalize_status_value(support_section.get("status"))

    if kb_status in KB_LES_COMPLETE_STATUSES and support_status not in MANAGEMENT_SUPPORT_COMPLETE_STATUSES:
        return "tp_pgh"

    return "kb_les"


def build_status_messages(application):
    status_key = str(application.status or "").strip().lower()
    fallback_label = get_notification_status_label(application)
    subject_template, applicant_template, admin_template = STATUS_MESSAGES.get(
        status_key,
        (
            f"Application status updated: {fallback_label}",
            "Your application {reference} status is now {status_label}.",
            "Application {reference} status is now {status_label}.",
        ),
    )

    context = {
        "reference": application.reference_no,
        "status_label": fallback_label,
        "title": application.title or application.get_application_type_display(),
    }

    title = subject_template.format(**context)
    subject = build_notification_subject(title, application.reference_no)
    applicant_body = applicant_template.format(**context)
    admin_body = admin_template.format(**context)

    if status_key == "management_review":
        title, admin_body = get_management_review_admin_text(application)
        subject = build_notification_subject(title, application.reference_no)
    elif status_key == "technical_review":
        department_text = format_selected_technical_departments(application)
        title = f"Application {application.reference_no} requires {department_text} review."
        admin_body = f"Application {application.reference_no} is ready for {department_text} review."
        subject = build_notification_subject(title, application.reference_no)
    elif status_key == "technical_review_completed" and is_kb_les_returned_to_ku(application):
        amendment_source = get_ku_amendment_source(application) or "KB(LES)"
        title = "KU(IKL) amendment required"
        admin_body = (
            f"Application {application.reference_no} was returned by {amendment_source} and requires "
            "KU(IKL) amendment before verification can continue."
        )
        remark = get_latest_remark(application)
        if remark:
            admin_body = f"{admin_body}\n\nRemark: {remark}"
        subject = build_notification_subject(title, application.reference_no)
    elif status_key == "mphlg_processing":
        title = f"Application {application.reference_no} requires MPHLG approval"
        admin_body = f"Application {application.reference_no} is ready for MPHLG approval."
        subject = build_notification_subject(title, application.reference_no)
    elif status_key == "mphlg_decision_received":
        title = f"Application {application.reference_no} requires SUT approval"
        admin_body = f"Application {application.reference_no} is ready for SUT approval."
        subject = build_notification_subject(title, application.reference_no)
    elif status_key == "approved" and is_mphlg_approved(application):
        title = f"Application {application.reference_no} approved by MPHLG"
        admin_body = f"Application {application.reference_no} has been approved by MPHLG."
        subject = build_notification_subject(title, application.reference_no)

    applicant_metadata = build_web_metadata(
        application=application,
        title=title,
        body=applicant_body,
        recipient_role="applicant",
    )
    admin_metadata = build_web_metadata(
        application=application,
        title=title,
        body=admin_body,
        recipient_role="admin",
    )
    applicant_message = format_notification_message(
        title=title,
        body=applicant_body,
        application=application,
        recipient_role="applicant",
    )
    admin_message = format_notification_message(
        title=title,
        body=admin_body,
        application=application,
        recipient_role="admin",
    )

    return {
        "subject": subject,
        "applicant_message": applicant_message,
        "admin_message": admin_message,
        "applicant_metadata": applicant_metadata,
        "admin_metadata": admin_metadata,
    }


def build_notification_subject(title, reference):
    clean_title = str(title or "").strip()
    clean_reference = str(reference or "").strip()
    if clean_reference and clean_reference.lower() not in clean_title.lower():
        clean_title = f"{clean_title} ({clean_reference})"

    return f"{APP_BRAND_NAME} - {clean_title}"


def build_web_metadata(application, title, body, recipient_role):
    status_key = str(application.status or "").strip().lower()
    category, notification_type = STATUS_UI.get(status_key, ("progress", "info"))
    remark = get_message_remark(application)
    display_message = body
    memo_html = get_admin_memo_html(application) if recipient_role == "admin" else ""

    if remark:
        display_message = f"{display_message}\n\nRemark: {remark}"

    metadata = {
        "category": category,
        "type": notification_type,
        "title": title,
        "title_en": title,
        "message": display_message,
        "message_en": display_message,
        "recipient_role": recipient_role,
        "event_status": status_key,
    }
    sender = get_web_metadata_sender(application, recipient_role)
    if sender:
        metadata["from"] = sender
        metadata["sender"] = sender
    if memo_html and status_key == "management_review" and is_kb_les_verification_pending(application):
        metadata["memo_html"] = memo_html
        metadata["memo_template"] = "ku_ikl_final_review"
        metadata["from"] = "KU(IKL)"
        metadata["sender"] = "KU(IKL)"
        metadata["to"] = "KB(LES)"
    elif memo_html and is_management_support_pending(application):
        metadata["memo_html"] = memo_html
        metadata["memo_template"] = "kb_les_to_tp_pgh"
        metadata["display_status"] = "approval_support"
        metadata["from"] = "KB(LES)"
        metadata["sender"] = "KB(LES)"
        metadata["to"] = "TP(RES)/PGH"
    elif memo_html and status_key == "ku_ikl_review":
        metadata["memo_html"] = memo_html
        metadata["memo_template"] = "pt_ikl_to_ku_ikl"
        metadata["from"] = "PT(IKL)"
        metadata["sender"] = "PT(IKL)"
    elif status_key == "technical_review":
        if memo_html:
            metadata["memo_html"] = memo_html
            metadata["memo_template"] = "ku_ikl_to_technical"
        metadata["from"] = "KU(IKL)"
        metadata["sender"] = "KU(IKL)"
        metadata["to"] = format_selected_technical_departments(application)
    elif status_key == "technical_site_visit":
        if memo_html:
            metadata["memo_html"] = memo_html
            metadata["memo_template"] = "technical_units_to_ikl"
        metadata["from"] = "Technical Units"
        metadata["sender"] = "Technical Units"
        metadata["to"] = KU_TECHNICAL_MEMO_RECIPIENT
    elif memo_html and status_key == "technical_review_completed" and is_kb_les_returned_to_ku(application):
        amendment_source = get_ku_amendment_source(application) or "KB(LES)"
        metadata["memo_html"] = memo_html
        metadata["memo_template"] = "kb_les_to_ku_ikl"
        metadata["from"] = amendment_source
        metadata["sender"] = amendment_source
        metadata["to"] = "KU(IKL)"
    elif memo_html and status_key == "technical_review_completed":
        metadata["memo_html"] = memo_html
        metadata["memo_template"] = "technical_to_ku_ikl"
        metadata["from"] = "IKL(TECHNICAL)"
        metadata["sender"] = "IKL(TECHNICAL)"
        metadata["to"] = "KU(IKL)"
    elif status_key == "technical_amendment":
        if memo_html:
            metadata["memo_html"] = memo_html
            metadata["memo_template"] = "ku_ikl_final_review"
        metadata["from"] = "KU(IKL)"
        metadata["sender"] = "KU(IKL)"
        metadata["to"] = "IKL(TECHNICAL)"
    elif memo_html and status_key == "mphlg_processing":
        mphlg_gateway = get_form_section(application, "mphlg_gateway")
        management_recommendation = get_form_section(application, "management_recommendation")
        sender = (
            mphlg_gateway.get("routed_from")
            or management_recommendation.get("officer")
            or "TP(RES)/PGH"
        )
        metadata["memo_html"] = memo_html
        metadata["memo_template"] = "tp_pgh_to_mphlg"
        metadata["from"] = str(sender).strip() or "TP(RES)/PGH"
        metadata["sender"] = metadata["from"]
        metadata["to"] = "MPHLG"
    elif memo_html and status_key == "mphlg_decision_received":
        metadata["memo_html"] = memo_html
        metadata["memo_template"] = "mphlg_to_sut"
        metadata["from"] = "MPHLG"
        metadata["sender"] = "MPHLG"
        metadata["to"] = "SUT"
    elif status_key == "approved" and is_mphlg_approved(application):
        if memo_html:
            metadata["memo_html"] = memo_html
            metadata["memo_template"] = "mphlg_to_pt_ikl"
        metadata["title_ms"] = "Permohonan diluluskan oleh MPHLG"
        metadata["message_ms"] = f"Permohonan {application.reference_no} telah diluluskan oleh MPHLG."
        metadata["mphlg_approved"] = True
        metadata["from"] = "MPHLG"
        metadata["sender"] = "MPHLG"
        metadata["to"] = "PT(IKL), KU(IKL), KB(LES), TP(RES)/PGH"
    elif memo_html and status_key == "approved":
        metadata["memo_html"] = memo_html
        metadata["memo_template"] = "tp_pgh_to_pt_ikl"
        metadata["from"] = "TP(RES)/PGH"
        metadata["sender"] = "TP(RES)/PGH"
        metadata["to"] = "PT(IKL)"

    return metadata


def get_web_metadata_sender(application, recipient_role):
    if recipient_role == "admin" and is_management_support_pending(application):
        return "KB(LES) <ALiS Notification Center>"

    if recipient_role == "admin" and is_kb_les_returned_to_ku(application):
        return "KB(LES) <ALiS Notification Center>"

    return ""


def get_kb_les_memo_html(application):
    section = get_form_section(application, "kb_les_verification")
    memo_html = section.get("memo_html")
    return str(memo_html or "").strip()


def get_mphlg_gateway_memo_html(application):
    section = get_form_section(application, "mphlg_gateway")
    memo_html = section.get("memo_html")
    return str(memo_html or "").strip()


def get_sut_approval_memo_html(application):
    section = get_form_section(application, "sut_approval")
    memo_html = section.get("memo_html")
    return str(memo_html or "").strip()


def get_final_approval_memo_html(application):
    section = get_form_section(application, "approval")
    memo_html = section.get("memo_html") or section.get("approval_note_html")
    return str(memo_html or "").strip()


def get_kb_les_return_to_ku_memo_html(application):
    correction = get_form_section(application, "correction_request")
    kb_les_verification = get_form_section(application, "kb_les_verification")
    memo_html = correction.get("memo_html") or kb_les_verification.get("memo_html")
    return str(memo_html or "").strip()


def get_pt_ikl_to_ku_memo_html(application):
    section = get_form_section(application, "auto_screening")
    memo_html = section.get("memo_html")
    return str(memo_html or "").strip()


def get_ku_ikl_to_technical_memo_html(application):
    section = get_form_section(application, "technical_referral")
    memo_html = section.get("memo_html")
    return str(memo_html or "").strip()


def get_ikl_technical_to_ku_memo_html(application):
    section = get_form_section(application, "technical_review")
    memo_html = section.get("memo_html")
    return str(memo_html or "").strip()


def get_ku_final_review_memo_html(application):
    status_key = str(getattr(application, "status", "") or "").strip().lower()
    if status_key == "technical_amendment":
        correction = get_form_section(application, "correction_request")
        technical_ku_review = get_form_section(application, "technical_ku_review")
        memo_html = correction.get("memo_html") or technical_ku_review.get("memo_html")
        return str(memo_html or "").strip()

    kb_les_verification = get_form_section(application, "kb_les_verification")
    technical_ku_review = get_form_section(application, "technical_ku_review")
    memo_html = kb_les_verification.get("memo_html") or technical_ku_review.get("memo_html")
    return str(memo_html or "").strip()


def get_admin_memo_html(application):
    status_key = str(getattr(application, "status", "") or "").strip().lower()

    if status_key == "ku_ikl_review":
        return get_pt_ikl_to_ku_memo_html(application)

    if status_key == "technical_review":
        return get_ku_ikl_to_technical_memo_html(application)

    if status_key == "technical_review_completed" and is_kb_les_returned_to_ku(application):
        return get_kb_les_return_to_ku_memo_html(application)

    if status_key == "technical_review_completed":
        return get_ikl_technical_to_ku_memo_html(application)

    if status_key in {"management_review", "technical_amendment"}:
        ku_final_memo = get_ku_final_review_memo_html(application)
        if ku_final_memo:
            return ku_final_memo

    if status_key == "mphlg_processing":
        return get_mphlg_gateway_memo_html(application)

    if status_key == "mphlg_decision_received":
        return get_sut_approval_memo_html(application)

    if status_key == "approved" and is_mphlg_approved(application):
        return get_mphlg_gateway_memo_html(application) or get_final_approval_memo_html(application)

    if status_key == "approved":
        return get_final_approval_memo_html(application)

    return get_kb_les_memo_html(application)


def is_kb_les_returned_to_ku(application):
    if str(getattr(application, "status", "") or "").strip().lower() != "technical_review_completed":
        return False

    correction = get_form_section(application, "correction_request")
    source = normalize_department(correction.get("source"))
    return (
        source in {"KB(LES)", "TP(RES)", "PGH", "TP(RES)/PGH", "TP/PGH", "MPHLG"}
        and normalize_department(correction.get("target")) == "KU(IKL)"
    )


def get_ku_amendment_source(application):
    correction = get_form_section(application, "correction_request")
    return str(correction.get("source") or "").strip()


def format_notification_message(title, body, application, recipient_role):
    if recipient_role != "applicant":
        return format_simple_internal_notification_message(body, application)

    message = str(body or "").strip()
    remark = get_message_remark(application)
    if remark and not re.search(r"\bRemark\s*:", message, flags=re.IGNORECASE):
        message = f"{message}\n\nRemark: {remark}" if message else f"Remark: {remark}"

    lines = [
        APP_BRAND_NAME,
        "",
        message,
    ]

    return "\n".join(lines)


def format_simple_internal_notification_message(body, application=None):
    message = str(body or "").strip()
    remark = get_message_remark(application) if application is not None else ""

    if remark and not re.search(r"\bRemark\s*:", message, flags=re.IGNORECASE):
        message = f"{message}\n\nRemark: {remark}" if message else f"Remark: {remark}"

    return message


def get_notification_status_label(application):
    status_key = str(application.status or "").strip().lower()

    if status_key == "incomplete":
        return "Rejected"

    return application.get_status_display()


def get_message_remark(application):
    status_key = str(application.status or "").strip().lower()
    if status_key not in REMARK_REPEAT_STATUSES:
        return ""

    return get_latest_remark(application)


def get_latest_remark(application):
    form_data = application.form_data or {}

    if getattr(application, "latest_remark", ""):
        return clean_remark(application.latest_remark)

    def section(name):
        value = form_data.get(name) or {}
        return value if isinstance(value, dict) else {}

    candidates = [
        section("correction_request").get("remarks"),
        section("auto_screening").get("remarks"),
        section("technical_ku_review").get("remarks"),
        section("technical_ku_review").get("comment"),
        section("technical_review").get("comment"),
        section("technical_review").get("remarks"),
        section("approval").get("notes"),
        section("approval").get("comment"),
        section("payment").get("verification_notes"),
    ]

    for value in candidates:
        remark = clean_remark(value)
        if remark:
            return remark

    return ""


def clean_remark(value):
    remark = str(value or "").strip()
    if remark in {"", "-", "[]"}:
        return ""

    return remark


def build_recipients(application, messages):
    recipients = []
    status_key = str(application.status or "").strip().lower()
    subject = messages["subject"]
    applicant_message = messages["applicant_message"]
    admin_message = messages["admin_message"]
    applicant_metadata = messages["applicant_metadata"]
    admin_metadata = messages["admin_metadata"]

    if (
        status_key in APPLICANT_NOTIFICATION_STATUSES
        and status_key != "submitted"
        and application.applicant_id
    ):
        recipients.append({
            "user": application.applicant,
            "recipient_role": "applicant",
            "channel": "web",
            "recipient": get_web_recipient(application.applicant),
            "subject": subject,
            "message": applicant_message,
            "metadata": applicant_metadata,
        })

        for email in get_applicant_emails(application):
            recipients.append({
                "user": application.applicant,
                "recipient_role": "applicant",
                "channel": "email",
                "recipient": email,
                "subject": subject,
                "message": applicant_message,
                "metadata": applicant_metadata,
            })

        for phone in get_applicant_whatsapp_numbers(application):
            recipients.append({
                "user": application.applicant,
                "recipient_role": "applicant",
                "channel": "whatsapp",
                "recipient": phone,
                "subject": subject,
                "message": applicant_message,
                "metadata": applicant_metadata,
            })

    if status_key not in ADMIN_NOTIFICATION_STATUSES:
        return dedupe_recipients(recipients)

    admin_users = get_admin_task_web_recipients(application)

    for user in admin_users:
        recipients.append({
            "user": user,
            "recipient_role": "admin",
            "channel": "web",
            "recipient": get_web_recipient(user),
            "subject": subject,
            "message": admin_message,
            "metadata": admin_metadata,
        })

    for user, email in get_admin_task_email_recipients(application, admin_users):
        recipients.append({
            "user": user,
            "recipient_role": "admin",
            "channel": "email",
            "recipient": email,
            "subject": subject,
            "message": admin_message,
            "metadata": admin_metadata,
        })

    for user, phone in get_admin_task_whatsapp_numbers(application, admin_users):
        recipients.append({
            "user": user,
            "recipient_role": "admin",
            "channel": "whatsapp",
            "recipient": phone,
            "subject": subject,
            "message": admin_message,
            "metadata": admin_metadata,
        })

    return dedupe_recipients(recipients)


def get_applicant_emails(application):
    email = normalize_email(getattr(application.applicant, "email", ""))
    return [email] if email else []


def get_applicant_whatsapp_numbers(application):
    phone = normalize_phone(getattr(application.applicant, "mobile_number", ""))
    return [phone] if phone else []


def get_admin_task_web_recipients(application):
    User = get_user_model()
    status_key = str(getattr(application, "status", "") or "").strip().lower()
    users = User.objects.filter(role__in=["admin", "supervisor", "staff"], is_active=True)

    if status_key == "submitted":
        return [user for user in users if is_ku_ikl_user(user)]

    if status_key == "approved":
        if is_mphlg_approved(application):
            return [
                user
                for user in users
                if is_pt_ikl_user(user) or is_dbku_mphlg_approval_notice_user(user)
            ]

        return [user for user in users if is_pt_ikl_user(user)]

    if status_key == "bill_pending_ku":
        return [user for user in users if is_ku_ikl_user(user)]

    if status_key in {"payment_submitted", "payment_verified"}:
        return [user for user in users if is_pt_ikl_user(user)]

    if status_key == "ku_ikl_review":
        return [user for user in users if is_ku_ikl_user(user)]

    if status_key == "technical_review_completed":
        return [user for user in users if is_ku_ikl_user(user)]

    if status_key == "technical_amendment":
        return [user for user in users if is_ikl_technical_user(user)]

    if status_key == "management_review":
        if is_kb_les_verification_pending(application):
            return [user for user in users if is_kb_les_user(user)]

        if is_management_support_pending(application):
            return [user for user in users if is_approval_support_user(user)]

        return []

    if status_key == "mphlg_processing":
        return [user for user in users if is_mphlg_review_user(user)]

    if status_key == "mphlg_decision_received":
        return [user for user in users if is_sut_approval_user(user)]

    if status_key in {"technical_review", "technical_site_visit"}:
        pending_departments = get_pending_technical_departments(application)
        if pending_departments:
            return [
                user
                for user in users
                if normalize_department(getattr(user, "department", "")) in pending_departments
            ]

        return [user for user in users if is_ikl_technical_user(user)]

    if status_key in ADMIN_TECHNICAL_TASK_STATUSES:
        pending_departments = get_pending_technical_departments(application)
        return [
            user
            for user in users
            if normalize_department(getattr(user, "department", "")) in pending_departments
            or is_ikl_technical_user(user)
        ]

    return []


def get_admin_task_email_recipients(application, users):
    recipients = []

    for user in users:
        email = normalize_email(getattr(user, "email", ""))
        if email:
            recipients.append((user, email))

    return recipients


def get_admin_task_whatsapp_numbers(application, users):
    recipients = []

    for user in users:
        phone = normalize_phone(getattr(user, "mobile_number", ""))
        if phone:
            recipients.append((user, phone))

    return recipients


def get_management_review_admin_text(application):
    reference = getattr(application, "reference_no", "") or "-"

    if is_management_support_pending(application):
        return (
            f"Application {reference} requires TP(RES)/PGH approval",
            f"Application {reference} is ready for TP(RES)/PGH final approval.",
        )

    if is_sut_result_recorded(application):
        return (
            f"Application {reference} requires KB(LES) support",
            f"SUT approval result for application {reference} has been recorded. KB(LES) support is required before TP(RES)/PGH final approval.",
        )

    return (
        f"Application {reference} requires KB(LES) verification",
        f"Application {reference} has completed KU(IKL) final checking and is ready for KB(LES) verification.",
    )


def get_pending_technical_departments(application):
    reviews = get_technical_department_reviews(application)
    selected_departments = get_selected_technical_departments(application)
    return {
        department
        for department in selected_departments
        if not isinstance(reviews.get(department), dict) or not reviews.get(department)
    }


def format_selected_technical_departments(application):
    selected_departments = get_selected_technical_departments(application)
    ordered_departments = [
        department
        for department in TECHNICAL_DEPARTMENT_ORDER
        if department in selected_departments
    ]

    return ", ".join(ordered_departments) or "technical units"


def get_selected_technical_departments(application):
    form_data = getattr(application, "form_data", None) or {}
    return get_selected_technical_departments_from_form_data(form_data)


def get_selected_technical_departments_from_form_data(form_data):
    form_data = form_data or {}
    selection = form_data.get("technical_department_selection") or {}
    departments = []

    if isinstance(selection, dict):
        departments = selection.get("departments") or []

    if not departments:
        referral = form_data.get("technical_referral") or {}
        if isinstance(referral, dict):
            departments = referral.get("participating_departments") or []

    if not isinstance(departments, (list, tuple, set)):
        return set()

    return {
        department
        for department in (normalize_department(value) for value in departments)
        if department in TECHNICAL_DEPARTMENTS
    }


def get_technical_department_reviews(application):
    form_data = getattr(application, "form_data", None) or {}
    reviews = form_data.get("technical_department_reviews") or {}
    if not isinstance(reviews, dict):
        return {}

    return {
        normalize_department(department): value
        for department, value in reviews.items()
        if normalize_department(department)
    }


def is_pt_ikl_user(user):
    return normalize_department(getattr(user, "department", "")) == "PT(IKL)"


def is_ku_ikl_user(user):
    return normalize_department(getattr(user, "department", "")) == "KU(IKL)"


def is_ikl_technical_user(user):
    return normalize_department(getattr(user, "department", "")) == "IKL (TECHNICAL)"


def is_kb_les_user(user):
    return normalize_department(getattr(user, "department", "")) == "KB(LES)"


def is_supervisor_user(user):
    return str(getattr(user, "role", "") or "").strip().lower() == "supervisor"


def is_approval_support_user(user):
    return normalize_department(getattr(user, "department", "")) in APPROVAL_SUPPORT_DEPARTMENTS


def is_mphlg_review_user(user):
    return normalize_department(getattr(user, "department", "")) in MPHLG_REVIEW_DEPARTMENTS


def is_sut_approval_user(user):
    return normalize_department(getattr(user, "department", "")) in SUT_APPROVAL_DEPARTMENTS


def is_dbku_mphlg_approval_notice_user(user):
    department = normalize_department(getattr(user, "department", ""))
    return (
        department == "KU(IKL)"
        or department == "KB(LES)"
        or department in APPROVAL_SUPPORT_DEPARTMENTS
    )


def get_form_section(application, key):
    form_data = getattr(application, "form_data", None) or {}
    return get_form_data_section(form_data, key)


def get_form_data_section(form_data, key):
    section = (form_data or {}).get(key) or {}
    return section if isinstance(section, dict) else {}


def normalize_status_value(value):
    return str(value or "").strip().lower()


def is_kb_les_verification_pending(application):
    status = normalize_status_value(get_form_section(application, "kb_les_verification").get("status"))
    return status not in KB_LES_COMPLETE_STATUSES


def is_management_support_pending(application):
    kb_status = normalize_status_value(get_form_section(application, "kb_les_verification").get("status"))
    support_status = normalize_status_value(get_form_section(application, "management_recommendation").get("status"))
    return kb_status in KB_LES_COMPLETE_STATUSES and support_status not in MANAGEMENT_SUPPORT_COMPLETE_STATUSES


def is_sut_result_recorded(application):
    status = normalize_status_value(get_form_section(application, "sut_approval").get("status"))
    return status in {"approved", "supported", "completed"}


def is_mphlg_approved(application):
    mphlg_gateway = get_form_section(application, "mphlg_gateway")
    status = normalize_status_value(mphlg_gateway.get("status"))
    decision = normalize_status_value(mphlg_gateway.get("decision"))
    officer = normalize_department(mphlg_gateway.get("officer"))
    return officer == "MPHLG" and (status == "approved" or decision == "approve")


def normalize_department(value):
    department = str(value or "").strip().upper().replace("-", " ")
    department = " ".join(department.split())

    if department in PT_IKL_DEPARTMENTS:
        return "PT(IKL)"

    if department in KU_IKL_DEPARTMENTS:
        return "KU(IKL)"

    if department in IKL_TECHNICAL_DEPARTMENTS:
        return "IKL (TECHNICAL)"

    if department in APPROVAL_VERIFICATION_DEPARTMENTS:
        return "KB(LES)"

    if department in APPROVAL_SUPPORT_DEPARTMENTS:
        return department

    if department in MPHLG_REVIEW_DEPARTMENTS:
        return "MPHLG"

    if department in SUT_APPROVAL_DEPARTMENTS or "SETIAUSAHA TETAP" in department:
        return "SUT"

    if department == "INP":
        return "LNP"

    return department


def should_user_receive_admin_notification(user, application, status_key=None):
    status = str(status_key or getattr(application, "status", "") or "").strip().lower()
    department = normalize_department(getattr(user, "department", ""))

    if status == "submitted":
        return department == "KU(IKL)"

    if status == "approved":
        if is_mphlg_approved(application):
            return department == "PT(IKL)" or is_dbku_mphlg_approval_notice_user(user)
        return department == "PT(IKL)"

    if status == "bill_pending_ku":
        return department == "KU(IKL)"

    if status in {"payment_submitted", "payment_verified"}:
        return department == "PT(IKL)"

    if status == "technical_review_completed":
        return department == "KU(IKL)"

    if status == "ku_ikl_review":
        return department == "KU(IKL)"

    if status == "management_review":
        if is_kb_les_verification_pending(application):
            return department == "KB(LES)"
        return department in APPROVAL_SUPPORT_DEPARTMENTS and is_management_support_pending(application)

    if status == "mphlg_processing":
        return department in MPHLG_REVIEW_DEPARTMENTS

    if status == "mphlg_decision_received":
        return department in SUT_APPROVAL_DEPARTMENTS

    if status == "technical_amendment":
        return department == "IKL (TECHNICAL)"

    if status == "technical_site_visit":
        pending_departments = get_pending_technical_departments(application)
        if pending_departments:
            return department in pending_departments

        return department == "IKL (TECHNICAL)"

    if status in ADMIN_TECHNICAL_TASK_STATUSES:
        return department in get_pending_technical_departments(application)

    return False


def get_default_superadmin():
    User = get_user_model()
    return (
        User.objects.filter(role="superadmin", is_active=True)
        .order_by("id")
        .first()
    )


def get_notification_sender_email():
    superadmin = get_default_superadmin()
    email = normalize_email(getattr(superadmin, "email", ""))
    return email or getattr(settings, "BREVO_FROM_EMAIL", "")


def get_notification_sender_phone():
    superadmin = get_default_superadmin()
    return normalize_phone(getattr(superadmin, "mobile_number", ""))


def get_admin_web_recipients():
    User = get_user_model()
    return list(User.objects.filter(role__in=["admin", "supervisor", "staff"]))


def get_pt_ikl_recipients():
    User = get_user_model()
    return [user for user in User.objects.filter(role__in=["admin", "staff"], is_active=True) if is_pt_ikl_user(user)]


def get_supervisor_recipients():
    User = get_user_model()
    return list(User.objects.filter(role="supervisor", is_active=True))


def get_kb_les_recipients():
    User = get_user_model()
    return [user for user in User.objects.filter(role__in=["admin", "supervisor", "staff"], is_active=True) if is_kb_les_user(user)]


def get_pt_ikl_and_supervisor_recipients():
    return dedupe_users([*get_pt_ikl_recipients(), *get_supervisor_recipients()])


def dedupe_users(users):
    seen = set()
    result = []
    for user in users:
        if not getattr(user, "id", None) or user.id in seen:
            continue
        seen.add(user.id)
        result.append(user)
    return result


def get_superadmin_web_recipients():
    User = get_user_model()
    return list(User.objects.filter(role="superadmin", is_active=True))


def get_web_recipient(user):
    return f"user:{user.id}"


def normalize_account_role(value):
    role = str(value or "").strip().lower()
    if role == "user":
        return "applicant"
    if role in {"superadmin", "admin", "supervisor", "staff", "applicant"}:
        return role
    return "account"


def get_account_role_label(role):
    if role in {"applicant", "user"}:
        return "USER"
    if role == "superadmin":
        return "SUPERADMIN"
    if role == "admin":
        return "ADMIN"
    if role == "supervisor":
        return "SUPERVISOR"
    if role == "staff":
        return "STAFF"
    return "ACCOUNT"


def normalize_account_name(user):
    if not user:
        return ""

    name = f"{getattr(user, 'first_name', '')} {getattr(user, 'last_name', '')}"
    normalized = " ".join(str(name or "").strip().upper().split())
    return normalized or str(getattr(user, "username", "") or "").strip().upper()


def notification_side_effects_enabled():
    return getattr(
        settings,
        "NOTIFICATION_SIDE_EFFECTS_ENABLED",
        NOTIFICATION_SIDE_EFFECTS_ENABLED,
    )


def create_and_send_delivery(
    application,
    event_key,
    user,
    recipient_role,
    channel,
    recipient,
    subject,
    message,
    metadata=None,
    force=False,
):
    if not force and not notification_side_effects_enabled():
        return

    try:
        delivery, created = NotificationDelivery.objects.get_or_create(
            event_key=event_key,
            channel=channel,
            recipient=recipient,
            defaults={
                "application": application,
                "user": user,
                "recipient_role": recipient_role,
                "subject": subject,
                "message": message,
                "metadata": metadata or {},
            },
        )
    except IntegrityError:
        return

    if not created and delivery.status == "sent":
        return

    if channel == "web":
        delivery.status = "sent"
        delivery.error = ""
        delivery.sent_at = timezone.now()
        delivery.save(update_fields=["status", "error", "sent_at"])
        return

    if not is_channel_configured(channel):
        delivery.status = "skipped"
        delivery.error = get_channel_skip_reason(channel)
        delivery.save(update_fields=["status", "error"])
        return

    try:
        if channel == "email":
            send_email(recipient, subject, message)
        elif channel == "whatsapp":
            send_whatsapp(recipient, message)
        else:
            raise ValueError(f"Unsupported notification channel: {channel}")
    except Exception as exc:
        logger.exception("Unable to send %s notification to %s", channel, recipient)
        delivery.status = "failed"
        delivery.error = str(exc)
        delivery.save(update_fields=["status", "error"])
        return

    delivery.status = "sent"
    delivery.error = ""
    delivery.sent_at = timezone.now()
    delivery.save(update_fields=["status", "error", "sent_at"])


def send_email(recipient, subject, message):
    actual_recipient, actual_subject, actual_message = prepare_email_delivery(
        recipient,
        subject,
        message,
    )

    send_brevo_email(actual_recipient, actual_subject, actual_message)


def prepare_email_delivery(recipient, subject, message):
    redirect_to = getattr(settings, "NOTIFICATION_EMAIL_REDIRECT_TO", "").strip()
    if not redirect_to:
        return recipient, subject, message

    redirected_message = (
        f"Test email redirect\n"
        f"Original recipient: {recipient}\n\n"
        f"{message}"
    )
    return redirect_to, f"[fasTrack test] {subject}", redirected_message


def send_brevo_email(recipient, subject, message):
    html_message = "<br>".join(escape_html(message).splitlines())
    payload = {
        "sender": {
            "name": settings.BREVO_FROM_NAME,
            "email": get_notification_sender_email(),
        },
        "to": [{"email": recipient}],
        "subject": subject,
        "textContent": message,
        "htmlContent": f"<p>{html_message}</p>",
    }
    headers = {
        "Content-Type": "application/json",
        "api-key": settings.BREVO_API_KEY,
    }

    post_json("https://api.brevo.com/v3/smtp/email", payload, headers)


def send_whatsapp(recipient, message):
    if settings.WHATSAPP_PROVIDER == "evolution":
        send_evolution_whatsapp(recipient, message)
        return

    if settings.WHATSAPP_PROVIDER == "meta":
        send_meta_whatsapp(recipient, message)
        return

    send_webhook_whatsapp(recipient, message)


def send_webhook_whatsapp(recipient, message):
    headers = {"Content-Type": "application/json"}
    if settings.WHATSAPP_WEBHOOK_TOKEN:
        headers["Authorization"] = f"Bearer {settings.WHATSAPP_WEBHOOK_TOKEN}"

    payload = {"to": recipient, "message": message}
    sender_phone = get_notification_sender_phone()
    if sender_phone:
        payload["from"] = sender_phone

    post_json(settings.WHATSAPP_WEBHOOK_URL, payload, headers)


def send_evolution_whatsapp(recipient, message):
    url = (
        f"{settings.EVOLUTION_API_URL}/message/sendText/"
        f"{settings.EVOLUTION_INSTANCE_NAME}"
    )
    payload = {
        "number": recipient,
        "text": message,
        "delay": 1000,
        "linkPreview": True,
    }
    headers = {
        "Content-Type": "application/json",
        "apikey": settings.EVOLUTION_API_KEY,
    }

    post_json(url, payload, headers)


def send_meta_whatsapp(recipient, message):
    url = (
        "https://graph.facebook.com/v19.0/"
        f"{settings.WHATSAPP_META_PHONE_NUMBER_ID}/messages"
    )
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {settings.WHATSAPP_META_ACCESS_TOKEN}",
    }
    payload = {
        "messaging_product": "whatsapp",
        "to": recipient,
        "type": "text",
        "text": {"body": message},
    }

    post_json(url, payload, headers)


def post_json(url, payload, headers):
    request_headers = {
        "Accept": "application/json",
        "User-Agent": "DBKU-fasTrack/1.0",
        **headers,
    }
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=request_headers,
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            if response.status >= 400:
                raise RuntimeError(f"HTTP {response.status}")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"HTTP {exc.code}: {body}") from exc


def is_channel_configured(channel):
    if channel == "web":
        return True

    if channel == "email":
        return bool(
            settings.NOTIFICATION_EMAIL_ENABLED
            and settings.BREVO_API_KEY
            and get_notification_sender_email()
        )

    if channel == "whatsapp":
        if not settings.WHATSAPP_ENABLED:
            return False

        if settings.WHATSAPP_PROVIDER == "meta":
            return bool(settings.WHATSAPP_META_PHONE_NUMBER_ID and settings.WHATSAPP_META_ACCESS_TOKEN)

        if settings.WHATSAPP_PROVIDER == "evolution":
            return bool(settings.EVOLUTION_API_URL and settings.EVOLUTION_API_KEY and settings.EVOLUTION_INSTANCE_NAME)

        return bool(settings.WHATSAPP_WEBHOOK_URL)

    return False


def get_channel_skip_reason(channel):
    if channel == "email":
        return "Brevo email credentials are not configured."

    if channel == "whatsapp" and not settings.WHATSAPP_ENABLED:
        return "WhatsApp notifications are disabled."

    if channel == "whatsapp" and settings.WHATSAPP_PROVIDER == "meta":
        return "Meta WhatsApp credentials are not configured."

    if channel == "whatsapp" and settings.WHATSAPP_PROVIDER == "evolution":
        return "Evolution API credentials are not configured."

    if channel == "whatsapp":
        return "WHATSAPP_WEBHOOK_URL is not configured."

    return "Notification channel is not configured."


def get_nested(data, *keys):
    current = data or {}
    for key in keys:
        if not isinstance(current, dict):
            return ""
        current = current.get(key, "")
    return str(current or "").strip()


def parse_license_datetime(value):
    if not value:
        return None

    parsed = parse_datetime(str(value))
    if parsed is None:
        parsed_date = parse_date(str(value))
        if parsed_date is None:
            return None
        parsed = datetime.combine(parsed_date, time.min)

    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed, timezone.get_current_timezone())

    return parsed


def subtract_calendar_months(value, months):
    month_index = value.month - months
    year = value.year
    while month_index <= 0:
        month_index += 12
        year -= 1

    day = min(value.day, monthrange(year, month_index)[1])
    return value.replace(year=year, month=month_index, day=day)


def has_verified_renewal_payment(renewal):
    payment = renewal.get("payment") if isinstance(renewal, dict) else {}
    if not isinstance(payment, dict):
        return False

    return normalize_status_value(payment.get("status")) in {"payment verified", "verified", "paid"}


def get_license_id(application):
    license_data = get_form_section(application, "license")
    return str(license_data.get("license_id") or "").strip() or "-"


def format_notification_datetime(value):
    if not value:
        return "-"

    local_value = timezone.localtime(value)
    return local_value.strftime("%d %b %Y, %I:%M %p")


def build_renewal_letter_text(application, months):
    return (
        f"Renewal Reminder {months}: Advertisement license {get_license_id(application)} "
        f"for application {application.reference_no} is approaching expiry. "
        "Please renew the license before the expiry date to avoid cancellation or enforcement action."
    )


def build_cancellation_notice_text(application):
    return (
        f"Cancellation and Enforcement Notice: Advertisement license {get_license_id(application)} "
        f"for application {application.reference_no} has expired and renewal payment has not been completed. "
        "The license will be cancelled and enforcement action may proceed."
    )


def join_phone(country_code, number):
    country_digits = re.sub(r"\D+", "", str(country_code or ""))
    number_digits = re.sub(r"\D+", "", str(number or ""))

    if not country_digits:
        return number_digits

    if number_digits.startswith("0"):
        number_digits = number_digits[1:]

    return f"{country_digits}{number_digits}"


def normalize_email(value):
    email = str(value or "").strip()
    if not email or "@" not in email:
        return ""

    domain = email.rsplit("@", 1)[-1].lower()
    if domain in {"dbku.local", "fastrack.local", "example.test"}:
        return ""

    return email


def normalize_phone(value):
    digits = re.sub(r"\D+", "", str(value or ""))

    if not digits or len(digits) < 8:
        return ""

    if digits.startswith("60"):
        return digits

    if digits.startswith("0"):
        return f"60{digits[1:]}"

    if digits.startswith("1") and len(digits) in {9, 10}:
        return f"60{digits}"

    return digits


def escape_html(value):
    return (
        str(value or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#x27;")
    )


def dedupe_values(values):
    seen = set()
    result = []

    for value in values:
        normalized = str(value or "").strip()
        key = normalized.lower()

        if not normalized or key in seen:
            continue

        seen.add(key)
        result.append(normalized)

    return result


def dedupe_recipients(recipients):
    seen = set()
    result = []

    for recipient in recipients:
        key = (
            recipient["channel"],
            recipient["recipient_role"],
            recipient["recipient"].lower(),
        )

        if key in seen:
            continue

        seen.add(key)
        result.append(recipient)

    return result
