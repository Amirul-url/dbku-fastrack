import logging
import re
from datetime import timedelta
from copy import deepcopy
from hashlib import sha1

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.utils import timezone
from django.utils.html import strip_tags

from .channels import (
    get_channel_skip_reason,
    get_default_superadmin,
    get_notification_email_provider,
    get_notification_sender_email,
    get_notification_sender_phone,
    get_brevo_sender_email,
    is_channel_configured,
    post_json,
    prepare_email_delivery,
    send_brevo_email,
    send_email,
    send_evolution_whatsapp,
    send_meta_whatsapp,
    send_smtp_email,
    send_webhook_whatsapp,
    send_whatsapp,
)
from .formatting import (
    dedupe_recipients,
    dedupe_values,
    escape_html,
    format_notification_datetime,
    get_nested,
    join_phone,
    normalize_email,
    normalize_phone,
    parse_license_datetime,
    subtract_calendar_months,
)
from . import message_templates as notify_messages
from .models import NotificationDelivery

logger = logging.getLogger(__name__)

APP_BRAND_NAME = notify_messages.APP_BRAND_NAME
KU_TECHNICAL_MEMO_RECIPIENT = "IKL(TECHNICAL)"
NOTIFICATION_SIDE_EFFECTS_ENABLED = False


def user_allows_notification_channel(user, channel):
    if channel == "email":
        return getattr(user, "notify_email", True) is not False
    if channel == "whatsapp":
        return getattr(user, "notify_whatsapp", True) is not False
    return True


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


STATUS_MESSAGES = notify_messages.STATUS_MESSAGES

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
    "license_revoked": ("license", "error"),
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
    "license_revoked",
}

ADMIN_NOTIFICATION_STATUSES = {
    "submitted",
    "ku_ikl_review",
    "approved",
    "bill_pending_ku",
    "payment_submitted",
    "payment_verified",
    "license_revocation_requested",
    "license_revocation_withdrawn",
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
    "license_renewal_issued",
    "license_renewal_payment_submitted",
    "license_renewal_payment_verified",
    "license_renewal_payment_rejected",
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
    "mphlg_processing",
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
            message=get_channel_message(message, "web"),
            metadata=metadata,
        )


def notify_applicant_registration_success(account):
    if not getattr(account, "pk", None):
        return

    role = normalize_account_role(getattr(account, "role", ""))
    if role != "applicant":
        return

    subject, messages, metadata = build_applicant_registration_success_message(account)
    event_key = f"account:{account.pk}:registration_success"

    create_and_send_delivery(
        application=None,
        event_key=event_key,
        user=account,
        recipient_role="applicant",
        channel="web",
        recipient=get_web_recipient(account),
        subject=subject,
        message=get_channel_message(messages, "web"),
        metadata=metadata,
        force=True,
    )

    email = normalize_email(getattr(account, "email", ""))
    if email and user_allows_notification_channel(account, "email"):
        create_and_send_delivery(
            application=None,
            event_key=event_key,
            user=account,
            recipient_role="applicant",
            channel="email",
            recipient=email,
            subject=subject,
            message=get_channel_message(messages, "email"),
            metadata=metadata,
            force=True,
        )

    phone = normalize_phone(getattr(account, "mobile_number", ""))
    if phone and user_allows_notification_channel(account, "whatsapp"):
        create_and_send_delivery(
            application=None,
            event_key=event_key,
            user=account,
            recipient_role="applicant",
            channel="whatsapp",
            recipient=phone,
            subject=subject,
            message=get_channel_message(messages, "whatsapp"),
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
        message=get_channel_message(message, "web"),
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
            message=get_channel_message(message, "email"),
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
            message=get_channel_message(message, "whatsapp"),
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
            message=get_channel_message(message, "web"),
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
            message=get_channel_message(message, "email"),
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
            message=get_channel_message(message, "whatsapp"),
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
        if has_active_renewal_payment(renewal):
            continue

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


def apply_license_renewal_action(
    application,
    action,
    user,
    months=None,
    note="",
    document_html="",
    digital_signature=None,
):
    action = str(action or "").strip().lower()
    form_data = deepcopy(application.form_data or {})
    renewal = get_form_data_section(form_data, "license_renewal")

    if action in {"generate_reminder_letter", "confirm_reminder_letter"}:
        if months not in {1, 2, 3}:
            raise ValueError("Reminder month must be 1, 2, or 3.")

        result = apply_license_reminder_action(
            application,
            renewal,
            action,
            user,
            months,
            note,
            document_html=document_html,
            digital_signature=digital_signature,
        )
    elif action in {
        "generate_cancellation_notice",
        "confirm_cancellation_notice",
        "support_cancellation_notice",
    }:
        result = apply_license_cancellation_action(application, form_data, renewal, action, user, note)
    elif action in {
        "verify_early_payment",
        "reject_early_payment",
        "complete_early_payment",
    }:
        result = apply_license_renewal_payment_action(
            application,
            renewal,
            action,
            user,
            months,
            note,
            digital_signature=digital_signature,
        )
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


def apply_license_reminder_action(
    application,
    renewal,
    action,
    user,
    months,
    note,
    document_html="",
    digital_signature=None,
):
    reminders = renewal.get("reminders") if isinstance(renewal.get("reminders"), dict) else {}
    key = str(months)
    reminder = reminders.get(key)
    if not isinstance(reminder, dict):
        raise ValueError(f"The {months}-month renewal reminder has not been detected yet.")

    if action == "generate_reminder_letter":
        if not is_pt_ikl_user(user):
            raise PermissionError("Only PT(IKL) can generate renewal reminder letters.")

        clean_note = clean_remark(note)
        if not clean_note:
            raise ValueError("Remarks are required.")

        if not has_digital_signature_content(digital_signature):
            raise ValueError("Digital signature is required.")

        letter_html = clean_document_html(document_html) or build_renewal_letter_document_html(application, months)
        reminder["status"] = "pending_supervisor_confirmation"
        reminder["letter"] = {
            "type": "renewal_reminder",
            "template": f"dbku_license_renewal_{months}m_reminder_v1",
            "months_before_expiry": months,
            "title": get_renewal_reminder_title(months),
            "generated_at": timezone.now().isoformat(),
            "generated_by": get_web_recipient(user),
            "note": clean_note,
            "remarks": clean_note,
            "digital_signature": digital_signature,
            "content": html_to_text(letter_html),
            "document_html": letter_html,
        }
        reminders[key] = reminder
        renewal["reminders"] = reminders
        notify_license_renewal_kb_confirmation_task(application, months)
        return {}

    if action == "confirm_reminder_letter":
        if not is_kb_les_user(user):
            raise PermissionError("Only KB(LES) can confirm renewal reminder letters.")

        if reminder.get("status") != "pending_supervisor_confirmation":
            raise ValueError("The reminder letter is not waiting for KB(LES) confirmation.")

        clean_note = clean_remark(note)
        if not clean_note:
            raise ValueError("Remarks are required.")

        if not has_digital_signature_content(digital_signature):
            raise ValueError("Digital signature is required.")

        reminder["status"] = "released_to_applicant"
        reminder["confirmed_at"] = timezone.now().isoformat()
        reminder["confirmed_by"] = get_web_recipient(user)
        reminder["confirmation_note"] = clean_note
        reminder["confirmation_remarks"] = clean_note
        reminder["confirmation_digital_signature"] = digital_signature
        reminders[key] = reminder
        renewal["reminders"] = reminders
        notify_license_renewal_released(application, months)
        return {}

    raise ValueError("Unsupported reminder action.")


def apply_license_renewal_payment_action(
    application,
    renewal,
    action,
    user,
    months,
    note,
    digital_signature=None,
):
    payment = renewal.get("payment") if isinstance(renewal.get("payment"), dict) else {}
    payment_status = normalize_status_value(payment.get("status"))
    clean_note = clean_remark(note)

    if action in {"verify_early_payment", "reject_early_payment"}:
        if not is_fin_user(user):
            raise PermissionError("Only FIN can verify renewal payment receipts.")

        if payment_status != "submitted":
            raise ValueError("Renewal payment receipt is not waiting for FIN verification.")

        if not clean_note:
            raise ValueError("Remarks are required.")

        now = timezone.now().isoformat()
        if action == "verify_early_payment":
            if not has_digital_signature_content(digital_signature):
                raise ValueError("Digital signature is required.")

            payment.update({
                "status": "verified",
                "recommendation": "Approve Renewal Receipt",
                "receipt_decision": "Approve Renewal Receipt",
                "verification_result": "Valid",
                "verification_notes": "",
                "internal_verification_notes": clean_note,
                "digital_signature": digital_signature,
                "verified_by": get_web_recipient(user),
                "verified_at": now,
                "rejected_at": "",
                "rejected_by": "",
            })
            renewal["payment"] = payment
            notify_license_renewal_payment_verified(application, payment.get("months_before_expiry") or months or 3)
            return {}

        receipt = payment.get("receipt") if isinstance(payment.get("receipt"), dict) else {}
        rejected_receipt_id = str(
            payment.get("receipt_document_id")
            or receipt.get("document_id")
            or receipt.get("id")
            or ""
        ).strip()
        rejected_receipt = None
        active_receipts = []
        receipts = renewal.get("early_payment_receipts")
        if isinstance(receipts, list):
            for current_receipt in receipts:
                current_id = str(
                    (current_receipt or {}).get("document_id")
                    or (current_receipt or {}).get("id")
                    or ""
                ).strip()
                if rejected_receipt_id and current_id == rejected_receipt_id:
                    rejected_receipt = current_receipt
                    continue
                active_receipts.append(current_receipt)
            renewal["early_payment_receipts"] = active_receipts

        if rejected_receipt is None and receipt:
            rejected_receipt = receipt

        if rejected_receipt:
            rejected_receipt = {
                **rejected_receipt,
                "status": "rejected",
                "reference_id": payment.get("reference_id") or rejected_receipt.get("reference_id") or "",
                "recipient_reference": payment.get("recipient_reference") or rejected_receipt.get("recipient_reference") or "",
                "payment_details": payment.get("payment_details") or rejected_receipt.get("payment_details") or "",
                "verification_notes": clean_note,
                "internal_verification_notes": clean_note,
                "rejected_by": get_web_recipient(user),
                "rejected_at": now,
            }
            rejected_receipts = renewal.get("rejected_early_payment_receipts")
            if not isinstance(rejected_receipts, list):
                rejected_receipts = []
            renewal["rejected_early_payment_receipts"] = [*rejected_receipts, rejected_receipt]

        reminders = renewal.get("reminders") if isinstance(renewal.get("reminders"), dict) else {}
        for reminder_key, reminder in list(reminders.items()):
            if not isinstance(reminder, dict):
                continue

            reminder_receipts = reminder.get("early_payment_receipts")
            if isinstance(reminder_receipts, list):
                reminder["early_payment_receipts"] = [
                    current_receipt
                    for current_receipt in reminder_receipts
                    if str(
                        (current_receipt or {}).get("document_id")
                        or (current_receipt or {}).get("id")
                        or ""
                    ).strip() != rejected_receipt_id
                ]

            if rejected_receipt:
                reminder_rejected_receipts = reminder.get("rejected_early_payment_receipts")
                if not isinstance(reminder_rejected_receipts, list):
                    reminder_rejected_receipts = []
                reminder["rejected_early_payment_receipts"] = [
                    *reminder_rejected_receipts,
                    rejected_receipt,
                ]
            reminders[reminder_key] = reminder
        renewal["reminders"] = reminders

        payment.update({
            "status": "rejected",
            "recommendation": "Reject Renewal Receipt",
            "receipt_decision": "Reject Renewal Receipt",
            "verification_result": "Invalid",
            "verification_notes": clean_note,
            "internal_verification_notes": clean_note,
            "receipt": None,
            "receipt_document_id": "",
            "reference_id": "",
            "recipient_reference": "",
            "payment_details": "",
            "submitted_by": "",
            "submitted_at": "",
            "verified_by": "",
            "verified_at": "",
            "rejected_by": get_web_recipient(user),
            "rejected_at": now,
        })
        renewal["payment"] = payment
        notify_license_renewal_payment_rejected(
            application,
            payment.get("months_before_expiry") or months or 3,
            clean_note,
        )
        return {}

    if action == "complete_early_payment":
        if not is_pt_ikl_user(user):
            raise PermissionError("Only PT(IKL) can complete renewal payment processing.")

        if payment_status != "verified":
            raise ValueError("Renewal payment must be verified by FIN first.")

        payment.update({
            "status": "completed",
            "recommendation": "Generate Renewal Official Receipt and Advertisement License",
            "completed_by": get_web_recipient(user),
            "completed_at": timezone.now().isoformat(),
            "completion_note": clean_note,
        })
        renewal["payment"] = payment
        notify_license_renewal_issued(
            application,
            payment.get("months_before_expiry") or months or 3,
            occurrence=payment.get("completed_at"),
        )
        return {}

    raise ValueError("Unsupported renewal payment action.")


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
    title = notify_messages.SUPERADMIN_ACCOUNT_CREATED_TITLE_TEMPLATE.format(
        role_label=role_label
    )
    channel_bodies = {
        "web": notify_messages.SUPERADMIN_ACCOUNT_CREATED_WEB_BODY_TEMPLATE.format(
            role_label=role_label,
            account_name=account_name,
        ),
        "email": notify_messages.SUPERADMIN_ACCOUNT_CREATED_EMAIL_BODY_TEMPLATE.format(
            role_label=role_label,
            account_name=account_name,
        ),
        "whatsapp": notify_messages.SUPERADMIN_ACCOUNT_CREATED_WHATSAPP_BODY_TEMPLATE.format(
            role_label=role_label,
            account_name=account_name,
        ),
    }

    if creator_name:
        creator_sentence = notify_messages.SUPERADMIN_ACCOUNT_CREATED_BY_SENTENCE_TEMPLATE.format(
            creator_name=creator_name
        )
        channel_bodies = {
            channel: f"{body} {creator_sentence}"
            for channel, body in channel_bodies.items()
        }

    body = channel_bodies["web"]
    subject = f"{APP_BRAND_NAME} - {title}"
    messages = {
        channel: format_account_created_message(
            title,
            account_name,
            role_label,
            username,
            creator_name,
            channel_body,
        )
        for channel, channel_body in channel_bodies.items()
    }

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

    return subject, messages, metadata


def build_applicant_registration_success_message(account):
    account_name = normalize_account_name(account)
    username = str(getattr(account, "username", "") or "").strip()
    title = notify_messages.APPLICANT_REGISTRATION_SUCCESS_TITLE
    body = notify_messages.APPLICANT_REGISTRATION_SUCCESS_WEB_BODY
    subject = f"{APP_BRAND_NAME} - {title}"
    messages = {
        "web": format_applicant_registration_message(
            title,
            account_name,
            username,
            notify_messages.APPLICANT_REGISTRATION_SUCCESS_WEB_BODY,
        ),
        "email": format_applicant_registration_message(
            title,
            account_name,
            username,
            notify_messages.APPLICANT_REGISTRATION_SUCCESS_EMAIL_BODY,
        ),
        "whatsapp": format_applicant_registration_message(
            title,
            account_name,
            username,
            notify_messages.APPLICANT_REGISTRATION_SUCCESS_WHATSAPP_BODY,
        ),
    }

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

    return subject, messages, metadata


def build_applicant_application_submitted_message(application):
    reference = getattr(application, "reference_no", "") or "-"
    title = str(getattr(application, "title", "") or "").strip() or "Application"
    subject = notify_messages.APPLICANT_APPLICATION_SUBMITTED_EMAIL_SUBJECT_TEMPLATE.format(
        brand=APP_BRAND_NAME,
        reference=reference,
    )
    body = notify_messages.APPLICANT_APPLICATION_SUBMITTED_WEB_BODY_TEMPLATE.format(
        reference=reference
    )
    messages = format_applicant_channel_messages({
        "web": notify_messages.APPLICANT_APPLICATION_SUBMITTED_WEB_BODY_TEMPLATE.format(
            reference=reference
        ),
        "email": notify_messages.APPLICANT_APPLICATION_SUBMITTED_EMAIL_BODY_TEMPLATE.format(
            reference=reference
        ),
        "whatsapp": notify_messages.APPLICANT_APPLICATION_SUBMITTED_WHATSAPP_BODY_TEMPLATE.format(
            reference=reference
        ),
    })
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

    return subject, messages, metadata


def build_applicant_application_resubmitted_message(application):
    reference = getattr(application, "reference_no", "") or "-"
    title = str(getattr(application, "title", "") or "").strip() or "Application"
    subject = notify_messages.APPLICANT_APPLICATION_RESUBMITTED_EMAIL_SUBJECT_TEMPLATE.format(
        brand=APP_BRAND_NAME,
        reference=reference,
    )
    body = notify_messages.APPLICANT_APPLICATION_RESUBMITTED_WEB_BODY_TEMPLATE.format(
        reference=reference
    )
    messages = format_applicant_channel_messages({
        "web": notify_messages.APPLICANT_APPLICATION_RESUBMITTED_WEB_BODY_TEMPLATE.format(
            reference=reference
        ),
        "email": notify_messages.APPLICANT_APPLICATION_RESUBMITTED_EMAIL_BODY_TEMPLATE.format(
            reference=reference
        ),
        "whatsapp": notify_messages.APPLICANT_APPLICATION_RESUBMITTED_WHATSAPP_BODY_TEMPLATE.format(
            reference=reference
        ),
    })
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

    return subject, messages, metadata


def build_staff_application_resubmitted_message(application):
    reference = getattr(application, "reference_no", "") or "-"
    review_target = "MPHLG" if str(getattr(application, "status", "") or "").strip().lower() == "mphlg_processing" else "KU(IKL)"
    title = notify_messages.APPLICATION_RESUBMITTED_TITLE_TEMPLATE.format(reference=reference)
    body = notify_messages.KU_IKL_STAFF_RESUBMITTED_WEB_BODY_TEMPLATE.format(
        reference=reference,
        review_target=review_target,
    )
    subject = f"{APP_BRAND_NAME} - {title}"
    metadata = build_web_metadata(
        application=application,
        title=title,
        body=body,
        recipient_role="admin",
        include_remark=False,
    )
    metadata.update({
        "title": title,
        "title_en": title,
        "message": body,
        "message_en": body,
        "from": "ALiS Notification Center",
        "sender": "ALiS Notification Center",
        "to": review_target,
        "suppress_remark": True,
    })
    for key in ["memo_html", "memo_template", "display_status"]:
        metadata.pop(key, None)
    channel_bodies = {
        "web": body,
        "email": notify_messages.KU_IKL_STAFF_RESUBMITTED_EMAIL_BODY_TEMPLATE.format(
            reference=reference,
            review_target=review_target,
        ),
        "whatsapp": notify_messages.KU_IKL_STAFF_RESUBMITTED_WHATSAPP_BODY_TEMPLATE.format(
            reference=reference,
            review_target=review_target,
        ),
    }
    messages = {
        channel: format_notification_message(
            title=title,
            body=channel_body,
            application=application,
            recipient_role="admin",
            include_remark=False,
        )
        for channel, channel_body in channel_bodies.items()
    }

    return subject, messages, metadata


def build_applicant_application_rejected_message(application):
    reference = getattr(application, "reference_no", "") or "-"
    title = str(getattr(application, "title", "") or "").strip() or "Application"
    subject = notify_messages.APPLICANT_APPLICATION_REJECTED_EMAIL_SUBJECT_TEMPLATE.format(
        brand=APP_BRAND_NAME,
        reference=reference,
    )
    body = notify_messages.APPLICANT_APPLICATION_REJECTED_WEB_BODY_TEMPLATE.format(reference=reference)
    channel_bodies = {
        "web": body,
        "email": notify_messages.APPLICANT_APPLICATION_REJECTED_EMAIL_BODY_TEMPLATE.format(
            reference=reference
        ),
        "whatsapp": notify_messages.APPLICANT_APPLICATION_REJECTED_WHATSAPP_BODY_TEMPLATE.format(
            reference=reference
        ),
    }
    remark = get_latest_remark(application)
    if remark:
        channel_bodies = {
            channel: append_remark_block(channel_body, remark)
            for channel, channel_body in channel_bodies.items()
        }
        body = channel_bodies["web"]
    messages = format_applicant_channel_messages(channel_bodies)
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

    return subject, messages, metadata


def build_renewal_reminder_record(months, expiry, current_time):
    return {
        "months_before_expiry": months,
        "status": "pending_pt_letter",
        "detected_at": current_time.isoformat(),
        "expiry_date": expiry.isoformat(),
    }


def notify_license_renewal_detected(application, months, expiry):
    context = {
        "license_id": get_license_id(application),
        "reference": application.reference_no,
        "expiry": format_notification_datetime(expiry),
    }
    pt_title = notify_messages.PT_IKL_RENEWAL_DETECTED_TITLE_TEMPLATE.format(months=months)
    pt_body = {
        "web": notify_messages.PT_IKL_RENEWAL_DETECTED_WEB_BODY_TEMPLATE.format(**context),
        "email": notify_messages.PT_IKL_RENEWAL_DETECTED_EMAIL_BODY_TEMPLATE.format(**context),
        "whatsapp": notify_messages.PT_IKL_RENEWAL_DETECTED_WHATSAPP_BODY_TEMPLATE.format(**context),
    }
    event_status = f"license_renewal_{months}m"
    send_license_workflow_notification(
        application=application,
        event_status=event_status,
        title=pt_title,
        body=pt_body,
        recipients=get_pt_ikl_recipients(),
        recipient_role="admin",
        action_url=f"/admin/e-licenses/license?id={application.id}",
    )


def notify_license_renewal_kb_confirmation_task(application, months):
    title = notify_messages.SUPERVISOR_RENEWAL_CONFIRMATION_TITLE_TEMPLATE.format(
        months=months
    )
    reminder_label = get_renewal_reminder_title(months).lower()
    context = {
        "months": months,
        "reference": application.reference_no,
        "reminder_label": reminder_label,
    }
    body = {
        "web": notify_messages.SUPERVISOR_RENEWAL_CONFIRMATION_WEB_BODY_TEMPLATE.format(**context),
        "email": notify_messages.SUPERVISOR_RENEWAL_CONFIRMATION_EMAIL_BODY_TEMPLATE.format(**context),
        "whatsapp": notify_messages.SUPERVISOR_RENEWAL_CONFIRMATION_WHATSAPP_BODY_TEMPLATE.format(**context),
    }
    send_license_workflow_notification(
        application=application,
        event_status="license_renewal_supervisor_confirmation",
        title=title,
        body=body,
        recipients=get_kb_les_recipients(),
        recipient_role="supervisor",
        action_url=f"/admin/approval?id={application.id}&from=personal",
        extra_metadata={"months_before_expiry": months},
        force_web=True,
    )


def notify_license_renewal_released(application, months):
    title = notify_messages.APPLICANT_RENEWAL_RELEASED_TITLE_TEMPLATE.format(months=months)
    occurrence = timezone.now().isoformat()
    body = {
        "web": notify_messages.APPLICANT_RENEWAL_RELEASED_WEB_BODY_TEMPLATE.format(
            reference=application.reference_no
        ),
        "email": notify_messages.APPLICANT_RENEWAL_RELEASED_EMAIL_BODY_TEMPLATE.format(
            reference=application.reference_no
        ),
        "whatsapp": notify_messages.APPLICANT_RENEWAL_RELEASED_WHATSAPP_BODY_TEMPLATE.format(
            reference=application.reference_no
        ),
    }
    send_license_workflow_notification(
        application=application,
        event_status="license_renewal_released",
        title=title,
        body=body,
        recipients=[application.applicant] if getattr(application, "applicant_id", None) else [],
        recipient_role="applicant",
        action_url="/user/dashboard?tab=status",
        extra_metadata={"months_before_expiry": months, "occurrence": occurrence},
        include_external=True,
        force_web=True,
        force_external=True,
        include_license_id=False,
    )


def notify_license_renewal_payment_submitted(application, months):
    body = {
        "web": notify_messages.FIN_RENEWAL_EARLY_PAYMENT_SUBMITTED_WEB_BODY_TEMPLATE.format(
            reference=application.reference_no
        ),
        "email": notify_messages.FIN_RENEWAL_EARLY_PAYMENT_SUBMITTED_EMAIL_BODY_TEMPLATE.format(
            reference=application.reference_no
        ),
        "whatsapp": notify_messages.FIN_RENEWAL_EARLY_PAYMENT_SUBMITTED_WHATSAPP_BODY_TEMPLATE.format(
            reference=application.reference_no
        ),
    }
    send_license_workflow_notification(
        application=application,
        event_status="license_renewal_payment_submitted",
        title=notify_messages.FIN_RENEWAL_EARLY_PAYMENT_SUBMITTED_TITLE,
        body=body,
        recipients=get_fin_recipients(),
        recipient_role="admin",
        action_url=f"/admin/e-licenses/payment?id={application.id}",
        extra_metadata={
            "months_before_expiry": months,
            "occurrence": timezone.now().isoformat(),
        },
        force_web=True,
    )


def notify_license_renewal_payment_verified(application, months):
    body = {
        "web": notify_messages.PT_IKL_RENEWAL_PAYMENT_VERIFIED_WEB_BODY_TEMPLATE.format(
            reference=application.reference_no
        ),
        "email": notify_messages.PT_IKL_RENEWAL_PAYMENT_VERIFIED_EMAIL_BODY_TEMPLATE.format(
            reference=application.reference_no
        ),
        "whatsapp": notify_messages.PT_IKL_RENEWAL_PAYMENT_VERIFIED_WHATSAPP_BODY_TEMPLATE.format(
            reference=application.reference_no
        ),
    }
    send_license_workflow_notification(
        application=application,
        event_status="license_renewal_payment_verified",
        title=notify_messages.PT_IKL_RENEWAL_PAYMENT_VERIFIED_TITLE,
        body=body,
        recipients=get_pt_ikl_recipients(),
        recipient_role="admin",
        action_url=f"/admin/e-licenses/license?id={application.id}",
        extra_metadata={
            "months_before_expiry": months,
            "occurrence": timezone.now().isoformat(),
        },
        force_web=True,
    )


def notify_license_renewal_issued(application, months, occurrence=None):
    applicant = application.applicant if getattr(application, "applicant_id", None) else None
    if not applicant:
        return

    title = notify_messages.APPLICANT_RENEWAL_LICENSE_ISSUED_TITLE
    body = {
        "web": notify_messages.APPLICANT_RENEWAL_LICENSE_ISSUED_WEB_BODY_TEMPLATE.format(
            reference=application.reference_no
        ),
        "email": notify_messages.APPLICANT_RENEWAL_LICENSE_ISSUED_EMAIL_BODY_TEMPLATE.format(
            reference=application.reference_no
        ),
        "whatsapp": notify_messages.APPLICANT_RENEWAL_LICENSE_ISSUED_WHATSAPP_BODY_TEMPLATE.format(
            reference=application.reference_no
        ),
    }
    send_license_workflow_notification(
        application=application,
        event_status="license_renewal_issued",
        title=title,
        body=body,
        recipients=[applicant],
        recipient_role="applicant",
        action_url="/user/dashboard?tab=status",
        extra_metadata={
            "months_before_expiry": months,
            "occurrence": occurrence or timezone.now().isoformat(),
        },
        include_external=True,
        force_web=True,
        force_external=True,
        include_license_id=False,
    )


def notify_license_renewal_payment_rejected(application, months, remark):
    applicant = application.applicant if getattr(application, "applicant_id", None) else None
    if not applicant:
        return

    clean_note = clean_remark(remark) or "-"
    form_data = application.form_data if isinstance(application.form_data, dict) else {}
    renewal = form_data.get("license_renewal") if isinstance(form_data.get("license_renewal"), dict) else {}
    payment = renewal.get("payment") if isinstance(renewal.get("payment"), dict) else {}
    receipt = payment.get("receipt") if isinstance(payment.get("receipt"), dict) else {}
    receipt_fingerprint = sha1(
        "|".join(
            str(value or "")
            for value in (
                payment.get("receipt_id"),
                payment.get("receipt_name"),
                payment.get("submitted_at"),
                payment.get("reference_id"),
                payment.get("recipient_reference"),
                payment.get("payment_details"),
                receipt.get("id"),
                receipt.get("name"),
                clean_note,
            )
        ).encode("utf-8")
    ).hexdigest()[:12]
    title = notify_messages.APPLICANT_RENEWAL_PAYMENT_RECEIPT_REJECTED_TITLE
    channel_bodies = {
        "web": notify_messages.APPLICANT_RENEWAL_PAYMENT_RECEIPT_REJECTED_WEB_BODY_TEMPLATE.format(
            reference=application.reference_no,
            remark=clean_note,
        ),
        "email": notify_messages.APPLICANT_RENEWAL_PAYMENT_RECEIPT_REJECTED_EMAIL_BODY_TEMPLATE.format(
            reference=application.reference_no,
            remark=clean_note,
        ),
        "whatsapp": notify_messages.APPLICANT_RENEWAL_PAYMENT_RECEIPT_REJECTED_WHATSAPP_BODY_TEMPLATE.format(
            reference=application.reference_no,
            remark=clean_note,
        ),
    }
    subject = build_notification_subject(title, application.reference_no)
    metadata = {
        "category": "payment",
        "type": "error",
        "title": title,
        "title_en": title,
        "message": channel_bodies["web"],
        "message_en": channel_bodies["web"],
        "recipient_role": "applicant",
        "event_status": "license_renewal_payment_rejected",
        "action_url": "/user/dashboard?tab=status",
        "months_before_expiry": months,
        "remark": clean_note,
        "occurrence": timezone.now().isoformat(),
        "suppress_remark": True,
    }
    event_key = (
        f"application:{application.id}:license_renewal_payment_rejected:"
        f"{months}:{receipt_fingerprint}"
    )

    create_and_send_delivery(
        application=application,
        event_key=event_key,
        user=applicant,
        recipient_role="applicant",
        channel="web",
        recipient=get_web_recipient(applicant),
        subject=subject,
        message=format_notification_message(
            title=title,
            body=channel_bodies["web"],
            application=application,
            recipient_role="applicant",
            include_remark=False,
        ),
        metadata=metadata,
        force=True,
    )
    for email in get_applicant_emails(application):
        create_and_send_delivery(
            application=application,
            event_key=event_key,
            user=applicant,
            recipient_role="applicant",
            channel="email",
            recipient=email,
            subject=subject,
            message=format_notification_message(
                title=title,
                body=channel_bodies["email"],
                application=application,
                recipient_role="applicant",
                include_remark=False,
            ),
            metadata=metadata,
            force=True,
        )
    for phone in get_applicant_whatsapp_numbers(application):
        create_and_send_delivery(
            application=application,
            event_key=event_key,
            user=applicant,
            recipient_role="applicant",
            channel="whatsapp",
            recipient=phone,
            subject=subject,
            message=format_notification_message(
                title=title,
                body=channel_bodies["whatsapp"],
                application=application,
                recipient_role="applicant",
                include_remark=False,
            ),
            metadata=metadata,
            force=True,
        )


def notify_license_cancellation_task(application, event_status):
    copy = {
        "license_cancellation_pending": (
            notify_messages.PT_IKL_CANCELLATION_PENDING_TITLE,
            {
                "web": notify_messages.PT_IKL_CANCELLATION_PENDING_WEB_BODY_TEMPLATE.format(
                    license_id=get_license_id(application)
                ),
                "email": notify_messages.PT_IKL_CANCELLATION_PENDING_EMAIL_BODY_TEMPLATE.format(
                    license_id=get_license_id(application)
                ),
                "whatsapp": notify_messages.PT_IKL_CANCELLATION_PENDING_WHATSAPP_BODY_TEMPLATE.format(
                    license_id=get_license_id(application)
                ),
            },
            get_pt_ikl_recipients(),
            "admin",
        ),
        "license_cancellation_supervisor_confirmation": (
            notify_messages.SUPERVISOR_CANCELLATION_CONFIRMATION_TITLE,
            {
                "web": notify_messages.SUPERVISOR_CANCELLATION_CONFIRMATION_WEB_BODY_TEMPLATE.format(
                    reference=application.reference_no
                ),
                "email": notify_messages.SUPERVISOR_CANCELLATION_CONFIRMATION_EMAIL_BODY_TEMPLATE.format(
                    reference=application.reference_no
                ),
                "whatsapp": notify_messages.SUPERVISOR_CANCELLATION_CONFIRMATION_WHATSAPP_BODY_TEMPLATE.format(
                    reference=application.reference_no
                ),
            },
            get_supervisor_recipients(),
            "supervisor",
        ),
        "license_cancellation_kb_support": (
            notify_messages.KB_LES_CANCELLATION_SUPPORT_TITLE,
            {
                "web": notify_messages.KB_LES_CANCELLATION_SUPPORT_WEB_BODY_TEMPLATE.format(
                    reference=application.reference_no
                ),
                "email": notify_messages.KB_LES_CANCELLATION_SUPPORT_EMAIL_BODY_TEMPLATE.format(
                    reference=application.reference_no
                ),
                "whatsapp": notify_messages.KB_LES_CANCELLATION_SUPPORT_WHATSAPP_BODY_TEMPLATE.format(
                    reference=application.reference_no
                ),
            },
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
    title = notify_messages.APPLICANT_LICENSE_CANCELLATION_RELEASED_TITLE
    body = {
        "web": notify_messages.APPLICANT_LICENSE_CANCELLATION_RELEASED_WEB_BODY_TEMPLATE.format(
            reference=application.reference_no
        ),
        "email": notify_messages.APPLICANT_LICENSE_CANCELLATION_RELEASED_EMAIL_BODY_TEMPLATE.format(
            reference=application.reference_no
        ),
        "whatsapp": notify_messages.APPLICANT_LICENSE_CANCELLATION_RELEASED_WHATSAPP_BODY_TEMPLATE.format(
            reference=application.reference_no
        ),
    }
    send_license_workflow_notification(
        application=application,
        event_status="license_cancellation_released",
        title=title,
        body=body,
        recipients=[application.applicant] if getattr(application, "applicant_id", None) else [],
        recipient_role="applicant",
        action_url="/user/dashboard?tab=status",
        include_external=True,
    )


def notify_license_revocation_request(application, request_status="pending"):
    normalized_status = str(request_status or "").strip().lower()
    if normalized_status not in {"pending", "withdrawn"}:
        return

    event_status = (
        "license_revocation_withdrawn"
        if normalized_status == "withdrawn"
        else "license_revocation_requested"
    )
    title = (
        notify_messages.PT_IKL_LICENSE_REVOCATION_WITHDRAWN_TITLE
        if normalized_status == "withdrawn"
        else notify_messages.PT_IKL_LICENSE_REVOCATION_REQUESTED_TITLE
    )
    if normalized_status == "withdrawn":
        body = {
            "web": notify_messages.PT_IKL_LICENSE_REVOCATION_WITHDRAWN_WEB_BODY_TEMPLATE.format(
                reference=application.reference_no
            ),
            "email": notify_messages.PT_IKL_LICENSE_REVOCATION_WITHDRAWN_EMAIL_BODY_TEMPLATE.format(
                reference=application.reference_no
            ),
            "whatsapp": notify_messages.PT_IKL_LICENSE_REVOCATION_WITHDRAWN_WHATSAPP_BODY_TEMPLATE.format(
                reference=application.reference_no
            ),
        }
    else:
        body = {
            "web": notify_messages.PT_IKL_LICENSE_REVOCATION_REQUESTED_WEB_BODY_TEMPLATE.format(
                reference=application.reference_no
            ),
            "email": notify_messages.PT_IKL_LICENSE_REVOCATION_REQUESTED_EMAIL_BODY_TEMPLATE.format(
                reference=application.reference_no
            ),
            "whatsapp": notify_messages.PT_IKL_LICENSE_REVOCATION_REQUESTED_WHATSAPP_BODY_TEMPLATE.format(
                reference=application.reference_no
            ),
        }

    send_license_workflow_notification(
        application=application,
        event_status=event_status,
        title=title,
        body=body,
        recipients=get_pt_ikl_web_recipients(),
        recipient_role="admin",
        action_url=f"/admin/e-licenses/payment?id={application.id}",
        extra_metadata={"occurrence": timezone.now().isoformat()},
        force_web=True,
    )


def get_pt_ikl_web_recipients():
    User = get_user_model()
    users = User.objects.filter(role__in=["admin", "supervisor", "staff"], is_active=True)
    return [user for user in users if is_pt_ikl_user(user)]


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
    force_web=False,
    force_external=False,
    include_license_id=True,
):
    subject = f"{APP_BRAND_NAME} - {title} ({application.reference_no})"
    web_body = get_channel_message(body, "web")
    message = format_license_workflow_message(
        title,
        web_body,
        application,
        recipient_role,
        include_license_id=include_license_id,
    )
    metadata = {
        "category": "license",
        "type": "warning" if "cancellation" not in event_status else "error",
        "title": title,
        "title_en": title,
        "message": web_body,
        "message_en": web_body,
        "recipient_role": recipient_role,
        "event_status": event_status,
        "action_url": action_url,
        **(extra_metadata or {}),
    }
    event_key = f"application:{application.id}:{event_status}"
    if extra_metadata and extra_metadata.get("months_before_expiry"):
        event_key = f"{event_key}:{extra_metadata['months_before_expiry']}"
    if extra_metadata and extra_metadata.get("occurrence"):
        event_key = f"{event_key}:{extra_metadata['occurrence']}"

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
            force=force_web,
        )

    if include_external and recipient_role == "applicant":
        for email in get_applicant_emails(application):
            email_message = format_license_workflow_message(
                title,
                get_channel_message(body, "email"),
                application,
                recipient_role,
                include_license_id=include_license_id,
            )
            create_and_send_delivery(
                application=application,
                event_key=event_key,
                user=application.applicant,
                recipient_role=recipient_role,
                channel="email",
                recipient=email,
                subject=subject,
                message=email_message,
                metadata=metadata,
                force=force_external,
            )
        for phone in get_applicant_whatsapp_numbers(application):
            whatsapp_message = format_license_workflow_message(
                title,
                get_channel_message(body, "whatsapp"),
                application,
                recipient_role,
                include_license_id=include_license_id,
            )
            create_and_send_delivery(
                application=application,
                event_key=event_key,
                user=application.applicant,
                recipient_role=recipient_role,
                channel="whatsapp",
                recipient=phone,
                subject=subject,
                message=whatsapp_message,
                metadata=metadata,
                force=force_external,
            )
        return

    for user in recipients:
        email = normalize_email(getattr(user, "email", ""))
        if email and user_allows_notification_channel(user, "email"):
            email_message = format_license_workflow_message(
                title,
                get_channel_message(body, "email"),
                application,
                recipient_role,
                include_license_id=include_license_id,
            )
            create_and_send_delivery(
                application=application,
                event_key=event_key,
                user=user,
                recipient_role=recipient_role,
                channel="email",
                recipient=email,
                subject=subject,
                message=email_message,
                metadata=metadata,
            )
        phone = normalize_phone(getattr(user, "mobile_number", ""))
        if phone and user_allows_notification_channel(user, "whatsapp"):
            whatsapp_message = format_license_workflow_message(
                title,
                get_channel_message(body, "whatsapp"),
                application,
                recipient_role,
                include_license_id=include_license_id,
            )
            create_and_send_delivery(
                application=application,
                event_key=event_key,
                user=user,
                recipient_role=recipient_role,
                channel="whatsapp",
                recipient=phone,
                subject=subject,
                message=whatsapp_message,
                metadata=metadata,
            )


def format_license_workflow_message(
    title,
    body,
    application,
    recipient_role="admin",
    include_license_id=True,
):
    if recipient_role != "applicant":
        return format_simple_internal_notification_message(body)

    lines = [
        APP_BRAND_NAME,
        "",
        title,
        notify_messages.APPLICATION_REFERENCE_LINE_TEMPLATE.format(
            reference=application.reference_no
        ),
    ]

    if include_license_id:
        lines.append(notify_messages.LICENSE_ID_LINE_TEMPLATE.format(
            license_id=get_license_id(application)
        ))

    lines.extend(["", body])
    return "\n".join(lines)


def format_applicant_registration_message(title, account_name, username, body):
    lines = [
        APP_BRAND_NAME,
        "",
        title,
        notify_messages.ACCOUNT_NAME_LINE_TEMPLATE.format(account_name=account_name),
    ]

    if username:
        lines.append(notify_messages.ACCOUNT_LOGIN_ID_LINE_TEMPLATE.format(username=username))

    lines.extend(["", body])
    return "\n".join(lines)


def format_account_created_message(title, account_name, role_label, username, creator_name, body):
    lines = [
        APP_BRAND_NAME,
        "",
        title,
        notify_messages.ACCOUNT_NAME_LINE_TEMPLATE.format(account_name=account_name),
        notify_messages.ACCOUNT_ROLE_LINE_TEMPLATE.format(role_label=role_label),
    ]

    if username:
        lines.append(notify_messages.ACCOUNT_LOGIN_ID_LINE_TEMPLATE.format(username=username))

    if creator_name:
        lines.append(
            notify_messages.ACCOUNT_CREATED_BY_LINE_TEMPLATE.format(
                creator_name=creator_name
            )
        )

    lines.extend(["", body])
    return "\n".join(lines)


def format_applicant_channel_messages(channel_bodies):
    return {
        channel: "\n".join([APP_BRAND_NAME, "", str(body or "").strip()])
        for channel, body in channel_bodies.items()
    }


def get_channel_message(message, channel):
    if isinstance(message, dict):
        return message.get(channel) or message.get("web") or next(iter(message.values()), "")

    return message


def append_remark_block(message, remark):
    remark_line = notify_messages.REMARK_BLOCK_TEMPLATE.format(remark=remark)
    return f"{message}\n\n{remark_line}" if message else remark_line


def append_catatan_block(message, remark):
    catatan_line = notify_messages.CATATAN_BLOCK_TEMPLATE.format(remark=remark)
    return f"{message}\n\n{catatan_line}" if message else catatan_line


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
    applicant_include_remark = True
    fallback_label = get_notification_status_label(application)
    subject_template, applicant_template, admin_template = STATUS_MESSAGES.get(
        status_key,
        notify_messages.DEFAULT_STATUS_MESSAGE,
    )

    context = {
        "reference": application.reference_no,
        "status_label": fallback_label,
        "title": application.title or application.get_application_type_display(),
    }

    title = subject_template.format(**context)
    subject = build_notification_subject(title, application.reference_no)
    applicant_body = applicant_template.format(**context)
    applicant_channel_bodies = format_applicant_status_channel_bodies(
        status_key,
        context,
    )
    admin_body = admin_template.format(**context)
    admin_channel_bodies = format_admin_status_channel_bodies(
        status_key,
        {
            **context,
            "department_text": "technical units",
        },
    )

    if status_key == "management_review":
        title, admin_body = get_management_review_admin_text(application)
        admin_channel_bodies = get_management_review_admin_channel_bodies(application)
        subject = build_notification_subject(title, application.reference_no)
    elif status_key == "technical_review":
        department_text = format_selected_technical_departments(application)
        title = notify_messages.KU_IKL_TECHNICAL_REVIEW_TITLE_TEMPLATE.format(
            reference=application.reference_no,
            department_text=department_text,
        )
        admin_body = notify_messages.KU_IKL_TECHNICAL_REVIEW_BODY_TEMPLATE.format(
            reference=application.reference_no,
            department_text=department_text,
        )
        admin_channel_bodies = format_admin_status_channel_bodies(
            status_key,
            {
                **context,
                "department_text": department_text,
            },
        )
        subject = build_notification_subject(title, application.reference_no)
    elif status_key == "technical_review_completed" and is_kb_les_returned_to_ku(application):
        amendment_source = get_ku_amendment_source(application) or "KB(LES)"
        title = notify_messages.KU_IKL_TECHNICAL_REVIEW_COMPLETED_RETURNED_TITLE_TEMPLATE.format(
            reference=application.reference_no
        )
        admin_body = notify_messages.KU_IKL_TECHNICAL_REVIEW_COMPLETED_RETURNED_BODY_TEMPLATE.format(
            reference=application.reference_no,
            amendment_source=amendment_source,
        )
        admin_channel_bodies = {
            "web": notify_messages.KU_IKL_TECHNICAL_REVIEW_COMPLETED_RETURNED_WEB_BODY_TEMPLATE.format(
                reference=application.reference_no,
                amendment_source=amendment_source,
            ),
            "email": notify_messages.KU_IKL_TECHNICAL_REVIEW_COMPLETED_RETURNED_EMAIL_BODY_TEMPLATE.format(
                reference=application.reference_no,
                amendment_source=amendment_source,
            ),
            "whatsapp": notify_messages.KU_IKL_TECHNICAL_REVIEW_COMPLETED_RETURNED_WHATSAPP_BODY_TEMPLATE.format(
                reference=application.reference_no,
                amendment_source=amendment_source,
            ),
        }
        remark = get_ku_amendment_remark(application)
        if remark:
            admin_body = append_remark_block(admin_body, remark)
            admin_channel_bodies = {
                channel: append_remark_block(channel_body, remark)
                for channel, channel_body in admin_channel_bodies.items()
            }
        subject = build_notification_subject(title, application.reference_no)
    elif status_key == "mphlg_processing":
        title, _, admin_template = notify_messages.MPHLG_PROCESSING_STATUS
        title = title.format(reference=application.reference_no)
        admin_body = admin_template.format(reference=application.reference_no)
        admin_channel_bodies = format_admin_status_channel_bodies(status_key, context)
        subject = build_notification_subject(title, application.reference_no)
    elif status_key == "mphlg_decision_received":
        title, _, admin_template = notify_messages.MPHLG_DECISION_RECEIVED_STATUS
        title = title.format(reference=application.reference_no)
        admin_body = admin_template.format(reference=application.reference_no)
        admin_channel_bodies = format_admin_status_channel_bodies(status_key, context)
        subject = build_notification_subject(title, application.reference_no)
    elif status_key == "approved" and is_mphlg_approved(application):
        title = notify_messages.MPHLG_APPROVED_TITLE_TEMPLATE.format(
            reference=application.reference_no
        )
        admin_body = notify_messages.MPHLG_APPROVED_BODY_TEMPLATE.format(
            reference=application.reference_no
        )
        admin_channel_bodies = {
            "web": notify_messages.MPHLG_APPROVED_WEB_BODY_TEMPLATE.format(
                reference=application.reference_no
            ),
            "email": notify_messages.MPHLG_APPROVED_EMAIL_BODY_TEMPLATE.format(
                reference=application.reference_no
            ),
            "whatsapp": notify_messages.MPHLG_APPROVED_WHATSAPP_BODY_TEMPLATE.format(
                reference=application.reference_no
            ),
        }
        subject = build_notification_subject(title, application.reference_no)
    elif status_key == "invoice_generated" and is_payment_receipt_rejected(application):
        title = notify_messages.APPLICANT_PAYMENT_RECEIPT_REJECTED_TITLE
        applicant_channel_bodies = {
            "web": notify_messages.APPLICANT_PAYMENT_RECEIPT_REJECTED_WEB_BODY_TEMPLATE.format(
                reference=application.reference_no
            ),
            "email": notify_messages.APPLICANT_PAYMENT_RECEIPT_REJECTED_EMAIL_BODY_TEMPLATE.format(
                reference=application.reference_no
            ),
            "whatsapp": notify_messages.APPLICANT_PAYMENT_RECEIPT_REJECTED_WHATSAPP_BODY_TEMPLATE.format(
                reference=application.reference_no
            ),
        }
        applicant_body = applicant_channel_bodies["web"]
        subject = build_notification_subject(title, application.reference_no)
    elif status_key == "invoice_generated":
        applicant_include_remark = False

    applicant_metadata = build_web_metadata(
        application=application,
        title=title,
        body=applicant_body,
        recipient_role="applicant",
        include_remark=applicant_include_remark,
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
        include_remark=applicant_include_remark,
    )
    applicant_channel_messages = {
        channel: format_notification_message(
            title=title,
            body=body,
            application=application,
            recipient_role="applicant",
            include_remark=applicant_include_remark,
        )
        for channel, body in applicant_channel_bodies.items()
    }
    admin_message = format_notification_message(
        title=title,
        body=admin_body,
        application=application,
        recipient_role="admin",
    )
    admin_channel_messages = {
        channel: format_notification_message(
            title=title,
            body=body,
            application=application,
            recipient_role="admin",
        )
        for channel, body in admin_channel_bodies.items()
    }

    return {
        "subject": subject,
        "applicant_message": applicant_message,
        "applicant_messages": applicant_channel_messages,
        "admin_message": admin_message,
        "admin_messages": admin_channel_messages,
        "applicant_metadata": applicant_metadata,
        "admin_metadata": admin_metadata,
    }


def build_notification_subject(title, reference):
    clean_title = str(title or "").strip()
    clean_reference = str(reference or "").strip()
    if clean_reference and clean_reference.lower() not in clean_title.lower():
        clean_title = f"{clean_title} ({clean_reference})"

    return f"{APP_BRAND_NAME} - {clean_title}"


def format_applicant_status_channel_bodies(status_key, context):
    templates = notify_messages.APPLICANT_STATUS_CHANNEL_MESSAGES.get(
        status_key,
        notify_messages.APPLICANT_DEFAULT_STATUS_CHANNEL_MESSAGES,
    )
    return {
        channel: template.format(**context)
        for channel, template in templates.items()
    }


def format_admin_status_channel_bodies(status_key, context):
    templates = notify_messages.ADMIN_STATUS_CHANNEL_MESSAGES.get(status_key)
    if not templates:
        templates = notify_messages.ADMIN_DEFAULT_STATUS_CHANNEL_MESSAGES
        context = {**context, "status_label": str(context.get("status_label") or "").strip()}

    return {
        channel: template.format(**context)
        for channel, template in templates.items()
    }


def build_web_metadata(application, title, body, recipient_role, include_remark=True):
    status_key = str(application.status or "").strip().lower()
    category, notification_type = STATUS_UI.get(status_key, ("progress", "info"))
    remark = get_message_remark(application) if include_remark else ""
    display_message = body
    memo_html = get_admin_memo_html(application) if recipient_role == "admin" else ""

    if remark and not re.search(r"\bRemark\s*:", display_message, flags=re.IGNORECASE):
        display_message = append_remark_block(display_message, remark)

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
    if not include_remark:
        metadata["suppress_remark"] = True
    sender = get_web_metadata_sender(application, recipient_role)
    if sender:
        metadata["from"] = sender
        metadata["sender"] = sender
    if status_key == "management_review" and is_kb_les_verification_pending(application):
        metadata["display_status"] = "management_review"
        if memo_html:
            metadata["memo_html"] = memo_html
            metadata["memo_template"] = "ku_ikl_final_review"
        metadata["from"] = "KU(IKL)"
        metadata["sender"] = "KU(IKL)"
        metadata["to"] = "KB(LES)"
    elif status_key == "management_review" and is_management_support_pending(application):
        if memo_html:
            metadata["memo_html"] = memo_html
            metadata["memo_template"] = "kb_les_to_tp_pgh"
        metadata["display_status"] = "approval_support"
        metadata["from"] = "KB(LES)"
        metadata["sender"] = sender or "KB(LES) <ALiS Notification Center>"
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
    elif status_key == "technical_review_completed" and is_kb_les_returned_to_ku(application):
        amendment_source = get_ku_amendment_source(application) or "KB(LES)"
        if memo_html:
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
    elif status_key == "mphlg_processing":
        mphlg_gateway = get_form_section(application, "mphlg_gateway")
        management_recommendation = get_form_section(application, "management_recommendation")
        sender = (
            mphlg_gateway.get("routed_from")
            or management_recommendation.get("officer")
            or "TP(RES)/PGH"
        )
        if memo_html:
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
        metadata["title_ms"] = notify_messages.MPHLG_APPROVED_TITLE_MS
        message_ms = notify_messages.MPHLG_APPROVED_MESSAGE_MS_TEMPLATE.format(
            reference=application.reference_no
        )
        if remark:
            message_ms = append_catatan_block(message_ms, remark)
        metadata["message_ms"] = message_ms
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
        return get_ku_amendment_source(application) or "KB(LES)"

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
        source in {"KB(LES)", "TP(RES)", "PGH", "FIN", "TP(RES)/PGH", "TP/PGH", "MPHLG"}
        and normalize_department(correction.get("target")) == "KU(IKL)"
    )


def get_ku_amendment_source(application):
    correction = get_form_section(application, "correction_request")
    return str(correction.get("source") or "").strip()


def format_notification_message(title, body, application, recipient_role, include_remark=True):
    if recipient_role != "applicant":
        return format_simple_internal_notification_message(body, application, include_remark=include_remark)

    message = str(body or "").strip()
    remark = get_message_remark(application) if include_remark else ""
    if remark and not re.search(r"\bRemark\s*:", message, flags=re.IGNORECASE):
        message = append_remark_block(message, remark)

    lines = [
        APP_BRAND_NAME,
        "",
        message,
    ]

    return "\n".join(lines)


def format_simple_internal_notification_message(body, application=None, include_remark=True):
    message = str(body or "").strip()
    remark = get_message_remark(application) if include_remark and application is not None else ""

    if remark and not re.search(r"\bRemark\s*:", message, flags=re.IGNORECASE):
        message = append_remark_block(message, remark)

    return message


def get_notification_status_label(application):
    status_key = str(application.status or "").strip().lower()

    if status_key == "incomplete":
        return "Rejected"

    return application.get_status_display()


def get_message_remark(application):
    status_key = str(application.status or "").strip().lower()
    if status_key == "technical_site_visit":
        return get_technical_department_review_remark(application)

    if status_key == "management_review" and is_kb_les_verification_pending(application):
        return get_kb_les_verification_remark(application)

    if status_key == "management_review" and is_management_support_pending(application):
        return get_management_support_remark(application)

    if status_key == "mphlg_processing":
        return get_mphlg_processing_remark(application)

    if status_key == "approved" and is_mphlg_approved(application):
        return get_mphlg_approval_remark(application)

    if status_key == "technical_review_completed" and is_kb_les_returned_to_ku(application):
        return get_ku_amendment_remark(application)

    if status_key == "technical_review_completed":
        return get_ikl_technical_review_remark(application)

    if status_key == "invoice_generated":
        if is_payment_receipt_rejected(application):
            return get_latest_remark(application)

        return get_payment_request_remark(application)

    if status_key not in REMARK_REPEAT_STATUSES and not (
        status_key == "invoice_generated" and is_payment_receipt_rejected(application)
    ) and not (
        status_key == "technical_review" and is_ku_ikl_technical_referral(application)
    ):
        return ""

    return get_latest_remark(application)


def get_kb_les_verification_remark(application):
    return first_clean_remark(
        get_form_section(application, "technical_ku_review").get("remarks"),
        get_form_section(application, "technical_ku_review").get("comment"),
        getattr(application, "latest_remark", ""),
    )


def get_management_support_remark(application):
    return first_clean_remark(
        get_form_section(application, "kb_les_verification").get("remarks"),
        get_form_section(application, "management_recommendation").get("remarks"),
        getattr(application, "latest_remark", ""),
    )


def get_mphlg_processing_remark(application):
    return first_clean_remark(
        get_form_section(application, "management_recommendation").get("remarks"),
        get_form_section(application, "mphlg_gateway").get("remarks"),
        getattr(application, "latest_remark", ""),
    )


def get_mphlg_approval_remark(application):
    return first_clean_remark(
        get_form_section(application, "mphlg_gateway").get("remarks"),
        get_form_section(application, "approval").get("remarks"),
        getattr(application, "latest_remark", ""),
    )


def get_payment_request_remark(application):
    approval_letter = get_form_section(application, "approval_letter")
    return first_clean_remark(
        approval_letter.get("remarks"),
        approval_letter.get("comment"),
        approval_letter.get("notes"),
    )


def get_ku_amendment_remark(application):
    return first_clean_remark(
        get_form_section(application, "correction_request").get("remarks"),
        get_form_section(application, "kb_les_verification").get("remarks"),
        get_form_section(application, "management_recommendation").get("remarks"),
        get_form_section(application, "mphlg_gateway").get("remarks"),
        getattr(application, "latest_remark", ""),
    )


def get_ikl_technical_review_remark(application):
    technical_review = get_form_section(application, "technical_review")
    return first_clean_remark(
        technical_review.get("remarks"),
        technical_review.get("comment"),
        technical_review.get("site_remarks"),
        technical_review.get("findings"),
    )


def get_technical_department_review_remark(application):
    reviews = get_technical_department_reviews(application)
    selected_departments = get_selected_technical_departments(application)
    ordered_departments = [
        department
        for department in TECHNICAL_DEPARTMENT_ORDER
        if not selected_departments or department in selected_departments
    ]
    remarks = []

    for department in ordered_departments:
        review = reviews.get(department)
        if not isinstance(review, dict):
            continue

        remark = first_clean_remark(
            review.get("remarks"),
            review.get("comment"),
            review.get("notes"),
            review.get("site_remarks"),
            review.get("findings"),
        )
        if remark:
            remarks.append(f"{department}: {remark}")

    return "\n".join(remarks)


def is_ku_ikl_technical_referral(application):
    referral = get_form_section(application, "technical_referral")
    return normalize_department(referral.get("source")) == "KU(IKL)"


def get_latest_remark(application):
    status_key = str(getattr(application, "status", "") or "").strip().lower()
    if status_key == "mphlg_processing":
        remark = get_mphlg_processing_remark(application)
        if remark:
            return remark

    if status_key == "approved" and is_mphlg_approved(application):
        remark = get_mphlg_approval_remark(application)
        if remark:
            return remark

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
        section("kb_les_verification").get("remarks"),
        section("management_recommendation").get("remarks"),
        section("approval").get("notes"),
        section("approval").get("comment"),
        section("payment").get("verification_notes"),
    ]

    for value in candidates:
        remark = clean_remark(value)
        if remark:
            return remark

    return ""


def first_clean_remark(*values):
    for value in values:
        remark = clean_remark(value)
        if remark:
            return remark

    return ""


def clean_remark(value):
    remark = str(value or "").strip()
    if remark in {"", "-", "[]"}:
        return ""

    return remark


def has_digital_signature_content(signature):
    if not signature:
        return False

    if isinstance(signature, str):
        return bool(signature.strip())

    if not isinstance(signature, dict):
        return False

    for key in (
        "file_url",
        "url",
        "file",
        "preview_url",
        "source",
        "dataUrl",
        "drawDataUrl",
        "data_url",
    ):
        if str(signature.get(key) or "").strip():
            return True

    items = signature.get("items")
    if isinstance(items, list):
        return any(has_digital_signature_content(item) for item in items)

    return False


def build_recipients(application, messages):
    recipients = []
    status_key = str(application.status or "").strip().lower()
    subject = messages["subject"]
    applicant_message = messages["applicant_message"]
    applicant_messages = messages.get("applicant_messages") or {}
    admin_message = messages["admin_message"]
    admin_messages = messages.get("admin_messages") or {}
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
            "message": get_channel_message(applicant_messages or applicant_message, "web"),
            "metadata": applicant_metadata,
        })

        for email in get_applicant_emails(application):
            recipients.append({
                "user": application.applicant,
                "recipient_role": "applicant",
                "channel": "email",
                "recipient": email,
                "subject": subject,
                "message": get_channel_message(applicant_messages or applicant_message, "email"),
                "metadata": applicant_metadata,
            })

        for phone in get_applicant_whatsapp_numbers(application):
            recipients.append({
                "user": application.applicant,
                "recipient_role": "applicant",
                "channel": "whatsapp",
                "recipient": phone,
                "subject": subject,
                "message": get_channel_message(applicant_messages or applicant_message, "whatsapp"),
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
            "message": get_channel_message(admin_messages or admin_message, "web"),
            "metadata": admin_metadata,
        })

    for user, email in get_admin_task_email_recipients(application, admin_users):
        recipients.append({
            "user": user,
            "recipient_role": "admin",
                "channel": "email",
                "recipient": email,
                "subject": subject,
                "message": get_channel_message(admin_messages or admin_message, "email"),
                "metadata": admin_metadata,
            })

    for user, phone in get_admin_task_whatsapp_numbers(application, admin_users):
        recipients.append({
            "user": user,
            "recipient_role": "admin",
                "channel": "whatsapp",
                "recipient": phone,
                "subject": subject,
                "message": get_channel_message(admin_messages or admin_message, "whatsapp"),
                "metadata": admin_metadata,
            })

    return dedupe_recipients(recipients)


def get_applicant_emails(application):
    if not user_allows_notification_channel(application.applicant, "email"):
        return []
    email = normalize_email(getattr(application.applicant, "email", ""))
    return [email] if email else []


def get_applicant_whatsapp_numbers(application):
    if not user_allows_notification_channel(application.applicant, "whatsapp"):
        return []
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
        return [user for user in users if is_pt_ikl_user(user)]

    if status_key == "payment_submitted":
        return [user for user in users if is_fin_user(user)]

    if status_key == "payment_verified":
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
        if not user_allows_notification_channel(user, "email"):
            continue
        email = normalize_email(getattr(user, "email", ""))
        if email:
            recipients.append((user, email))

    return recipients


def get_admin_task_whatsapp_numbers(application, users):
    recipients = []

    for user in users:
        if not user_allows_notification_channel(user, "whatsapp"):
            continue
        phone = normalize_phone(getattr(user, "mobile_number", ""))
        if phone:
            recipients.append((user, phone))

    return recipients


def get_management_review_admin_text(application):
    reference = getattr(application, "reference_no", "") or "-"

    if is_management_support_pending(application):
        return (
            notify_messages.TP_PGH_MANAGEMENT_SUPPORT_TITLE_TEMPLATE.format(
                reference=reference
            ),
            notify_messages.TP_PGH_MANAGEMENT_SUPPORT_BODY_TEMPLATE.format(
                reference=reference
            ),
        )

    if is_sut_result_recorded(application):
        return (
            notify_messages.KB_LES_SUPPORT_AFTER_SUT_TITLE_TEMPLATE.format(
                reference=reference
            ),
            notify_messages.KB_LES_SUPPORT_AFTER_SUT_BODY_TEMPLATE.format(
                reference=reference
            ),
        )

    title, _, admin_template = notify_messages.KU_IKL_MANAGEMENT_REVIEW_STATUS
    return (
        title.format(reference=reference),
        admin_template.format(reference=reference),
    )


def get_management_review_admin_channel_bodies(application):
    reference = getattr(application, "reference_no", "") or "-"

    if is_management_support_pending(application):
        return {
            "web": notify_messages.TP_PGH_MANAGEMENT_SUPPORT_WEB_BODY_TEMPLATE.format(
                reference=reference
            ),
            "email": notify_messages.TP_PGH_MANAGEMENT_SUPPORT_EMAIL_BODY_TEMPLATE.format(
                reference=reference
            ),
            "whatsapp": notify_messages.TP_PGH_MANAGEMENT_SUPPORT_WHATSAPP_BODY_TEMPLATE.format(
                reference=reference
            ),
        }

    if is_sut_result_recorded(application):
        return {
            "web": notify_messages.KB_LES_SUPPORT_AFTER_SUT_WEB_BODY_TEMPLATE.format(
                reference=reference
            ),
            "email": notify_messages.KB_LES_SUPPORT_AFTER_SUT_EMAIL_BODY_TEMPLATE.format(
                reference=reference
            ),
            "whatsapp": notify_messages.KB_LES_SUPPORT_AFTER_SUT_WHATSAPP_BODY_TEMPLATE.format(
                reference=reference
            ),
        }

    return {
        "web": notify_messages.KB_LES_VERIFICATION_WEB_BODY_TEMPLATE.format(
            reference=reference
        ),
        "email": notify_messages.KB_LES_VERIFICATION_EMAIL_BODY_TEMPLATE.format(
            reference=reference
        ),
        "whatsapp": notify_messages.KB_LES_VERIFICATION_WHATSAPP_BODY_TEMPLATE.format(
            reference=reference
        ),
    }


def get_pending_technical_departments(application):
    reviews = get_technical_department_reviews(application)
    selected_departments = get_selected_technical_departments(application)
    return {
        department
        for department in selected_departments
        if not isinstance(reviews.get(department), dict) or not reviews.get(department)
    }


def is_payment_receipt_rejected(application):
    payment = get_form_section(application, "payment")
    return normalize_status_value(payment.get("status")) == "receipt rejected"


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


def is_fin_user(user):
    return normalize_department(getattr(user, "department", "")) == "FIN"


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
        return department == "PT(IKL)"

    if status == "payment_submitted":
        return department == "FIN"

    if status == "payment_verified":
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


def get_admin_web_recipients():
    User = get_user_model()
    return list(User.objects.filter(role__in=["admin", "supervisor", "staff"]))


def get_pt_ikl_recipients():
    User = get_user_model()
    return [user for user in User.objects.filter(role__in=["admin", "staff"], is_active=True) if is_pt_ikl_user(user)]


def get_fin_recipients():
    User = get_user_model()
    return [user for user in User.objects.filter(role__in=["admin", "supervisor", "staff"], is_active=True) if is_fin_user(user)]


def get_supervisor_recipients():
    User = get_user_model()
    return list(User.objects.filter(role="supervisor", is_active=True))


def get_kb_les_recipients():
    User = get_user_model()
    return [user for user in User.objects.filter(role__in=["admin", "supervisor", "staff"], is_active=True) if is_kb_les_user(user)]


def get_pt_ikl_and_kb_les_recipients():
    return dedupe_users([*get_pt_ikl_recipients(), *get_kb_les_recipients()])


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


def has_verified_renewal_payment(renewal):
    payment = renewal.get("payment") if isinstance(renewal, dict) else {}
    if not isinstance(payment, dict):
        return False

    return normalize_status_value(payment.get("status")) in {
        "payment verified",
        "verified",
        "paid",
        "completed",
        "payment completed",
    }


def has_active_renewal_payment(renewal):
    payment = renewal.get("payment") if isinstance(renewal, dict) else {}
    if not isinstance(payment, dict):
        return False

    return normalize_status_value(payment.get("status")) in {
        "submitted",
        "payment submitted",
        "payment verified",
        "verified",
        "paid",
        "completed",
        "payment completed",
    }


def get_license_id(application):
    license_data = get_form_section(application, "license")
    return str(license_data.get("license_id") or "").strip() or "-"


def build_renewal_letter_text(application, months):
    html = build_renewal_letter_document_html(application, months)
    return html_to_text(html)


def html_to_text(html):
    text = strip_tags(str(html or ""))
    return re.sub(r"\n\s*\n\s*\n+", "\n\n", text).strip()


def clean_document_html(value):
    return str(value or "").strip()


def build_renewal_letter_document_html(application, months):
    data = get_renewal_letter_context(application, months)
    address_lines = "".join(f"<p>{escape_html(line)}</p>" for line in data["address_lines"])
    amount_cell = escape_html(data["amount"]) if data["amount"] else "&nbsp;"
    your_ref_cell = escape_html(data["your_ref"]) if data["your_ref"] else "&nbsp;"

    return f"""
<article class="dbku-renewal-letter">
  <style>
    @page {{ size: A4; margin: 0; }}
    .dbku-renewal-letter {{
      width: 210mm;
      height: 297mm;
      box-sizing: border-box;
      margin: 0 auto;
      padding: 34mm 26mm 24mm;
      background: #fff;
      color: #111827;
      font-family: Calibri, Arial, Helvetica, sans-serif;
      font-size: 11pt;
      line-height: 1.25;
      overflow: hidden;
      break-after: avoid;
      page-break-after: avoid;
    }}
    .dbku-renewal-letter, .dbku-renewal-letter * {{
      font-family: Calibri, Arial, Helvetica, sans-serif !important;
      font-size: 11pt !important;
      line-height: 1.25 !important;
      letter-spacing: 0 !important;
    }}
    .dbku-renewal-letter p {{ margin: 0 0 9pt; }}
    .dbku-renewal-letter .topline {{ display: grid; grid-template-columns: 1fr auto; gap: 14mm; align-items: start; }}
    .dbku-renewal-letter .top-field {{ display: grid; grid-template-columns: 18mm minmax(42mm, 1fr); gap: 4mm; }}
    .dbku-renewal-letter .date-line {{ justify-self: end; min-width: 52mm; text-align: right; }}
    .dbku-renewal-letter .editable-blank {{ display: inline-block; min-width: 42mm; min-height: 1em; }}
    .dbku-renewal-letter .recipient {{ margin: 10pt 0 14pt 22mm; }}
    .dbku-renewal-letter .recipient p {{ margin: 0; }}
    .dbku-renewal-letter .subject {{ margin: 0 0 12pt 22mm; font-weight: 800; text-align: justify; text-transform: uppercase; }}
    .dbku-renewal-letter .subject span {{ display: block; text-align: justify; text-align-last: left; }}
    .dbku-renewal-letter .intro {{ margin: 0 0 10pt 22mm; }}
    .dbku-renewal-letter .para {{ display: block; margin: 0 0 12pt 22mm; text-align: justify; text-align-last: left; }}
    .dbku-renewal-letter .para > span:first-child {{ display: inline-block; width: 14mm; margin-right: 4mm; vertical-align: top; }}
    .dbku-renewal-letter .para > span:last-child {{ display: inline; }}
    .dbku-renewal-letter .date-nowrap {{ white-space: nowrap; }}
    .dbku-renewal-letter table {{ width: calc(100% - 22mm); margin: 10pt 0 12pt 22mm; border-collapse: collapse; }}
    .dbku-renewal-letter th, .dbku-renewal-letter td {{ border: 1px solid #111827; padding: 3pt 6pt; vertical-align: top; }}
    .dbku-renewal-letter th {{ text-align: center; font-weight: 800; }}
    .dbku-renewal-letter .center {{ text-align: center; }}
    .dbku-renewal-letter .amount-cell {{ text-align: right; }}
    .dbku-renewal-letter .right {{ text-align: right; font-weight: 800; }}
    .dbku-renewal-letter .closing {{ margin: 0 0 12pt 22mm; }}
    .dbku-renewal-letter .motto {{ margin: 0 0 12pt 22mm; font-weight: 800; font-style: italic; }}
    .dbku-renewal-letter .director {{ margin-left: 22mm; font-weight: 800; }}
    .dbku-renewal-letter .note {{ margin-top: 28pt; text-align: center; font-size: 7pt !important; font-style: italic; }}
    .dbku-renewal-letter .note * {{ font-size: 7pt !important; font-style: italic; }}
    @media print {{
      html, body {{ width: 210mm; height: 297mm; background: #fff; overflow: hidden; }}
      .dbku-renewal-letter {{ margin: 0; box-shadow: none; }}
    }}
  </style>
  <div class="topline">
    <div>
      <p class="top-field"><span>Tuan:</span><span class="editable-blank">{your_ref_cell}</span></p>
      <div class="top-field"><strong>Kami:</strong><span>{escape_html(data["our_ref"])}</span></div>
    </div>
    <p class="date-line">Tarikh: {escape_html(data["letter_date"])}</p>
  </div>

  <div class="recipient">
    <p>{escape_html(data["applicant_name"])}</p>
    {address_lines}
  </div>

  <p style="margin-left:22mm;">Tuan</p>

  <div class="subject">
    <span>{escape_html(data["subject"])}</span>
  </div>

  <p class="intro">Dengan segala hormatnya perkara di atas dirujuk.</p>

  <p class="para"><span>2.</span><span>Berdasarkan rekod kami, didapati tempoh Lesen Iklan tuan akan tamat pada <strong><u class="date-nowrap">{escape_html(data["expiry_date"])}</u></strong> dan sehingga ke hari ini pihak DBKU masih belum menerima bayaran pembaharuan Lesen Iklan tersebut.</span></p>

  <p class="para"><span>3.</span><span>Justeru, tuan dikehendaki untuk membuat pembaharuan Lesen Iklan dalam tempoh <strong><u>EMPAT BELAS (14) HARI BEKERJA</u></strong> daripada tarikh surat ini diterima seperti di bawah:-</span></p>

  <table>
    <thead>
      <tr>
        <th>BUTIRAN BAYARAN</th>
        <th>TEMPOH LESEN BERKUATKUASA</th>
        <th>JUMLAH<br>(RM)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Lesen Iklan</td>
        <td class="center">{escape_html(data["renewal_period"])}</td>
        <td class="amount-cell">{amount_cell}</td>
      </tr>
      <tr>
        <td>&nbsp;</td>
        <td class="right">JUMLAH KESELURUHAN</td>
        <td class="amount-cell">{amount_cell}</td>
      </tr>
    </tbody>
  </table>

  <p class="para"><span>4.</span><span>Sekiranya pihak tuan memerlukan keterangan lanjut, sila hubungi Cik Dayang Amirah Farzana/Puan Phyrra Lily di talian 082-512955.</span></p>

  <p class="closing">Sekian. Terima kasih.</p>

  <div class="motto">
    <p>"AN HONOUR TO SERVE"<br>"TOGETHER WE CARE"</p>
  </div>

  <p class="director">Pengarah DBKU</p>

  <p class="note">Notis ini adalah cetakan komputer. Tiada tandatangan diperlukan.<br>Sila abaikan surat ini sekiranya pembaharuan telah dibuat</p>
</article>
""".strip()


def get_renewal_letter_context(application, months):
    form_data = getattr(application, "form_data", None) or {}
    license_data = get_form_section(application, "license")
    expiry = parse_license_datetime(license_data.get("expiry_date"))
    local_expiry = timezone.localtime(expiry) if expiry else None
    expiry_date = local_expiry.date() if local_expiry else None
    today = timezone.localdate()
    applicant_name = get_renewal_company_name(application) or "NAMA SYARIKAT"
    location = get_renewal_project_location(form_data) or str(getattr(application, "project_location", "") or "")
    address_lines = get_renewal_company_address_lines(application)
    if not address_lines:
        address_lines = split_letter_address(location)
    if not address_lines:
        address_profile = get_renewal_registered_applicant_address_profile(application)
        address_lines = split_letter_address(address_profile.get("address"))
    if not address_lines:
        address_lines = ["Alamat lokasi projek iklan"]

    return {
        "months": months,
        "your_ref": "",
        "our_ref": build_renewal_letter_reference(today),
        "letter_date": format_malay_date(today),
        "applicant_name": applicant_name,
        "address_lines": address_lines[:4],
        "subject": build_renewal_letter_subject_for_month(application, location, months),
        "expiry_date": format_malay_date(expiry_date) if expiry_date else "-",
        "renewal_period": build_renewal_period(expiry_date),
        "amount": "",
    }


def clean_renewal_letter_value(value):
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if not text or text == "-":
        return ""
    return text.upper()


def get_renewal_company_name(application):
    form_data = getattr(application, "form_data", None) or {}
    step_1 = form_data.get("step_1") if isinstance(form_data.get("step_1"), dict) else {}
    step_2 = form_data.get("step_2") if isinstance(form_data.get("step_2"), dict) else {}
    step_3 = form_data.get("step_3") if isinstance(form_data.get("step_3"), dict) else {}
    candidates = [
        step_3.get("org_name"),
        step_3.get("company_name"),
        step_3.get("name_of_company"),
        step_2.get("org_name"),
        step_2.get("company_name"),
        step_1.get("company_name"),
        get_renewal_application_applicant_name(application),
    ]
    for value in candidates:
        text = clean_renewal_letter_value(value)
        if text:
            return text
    return ""


def get_renewal_company_address_lines(application):
    form_data = getattr(application, "form_data", None) or {}
    step_1 = form_data.get("step_1") if isinstance(form_data.get("step_1"), dict) else {}
    step_3 = form_data.get("step_3") if isinstance(form_data.get("step_3"), dict) else {}
    postcode_city_state = " ".join(
        part
        for part in [
            clean_renewal_letter_value(step_3.get("postcode")),
            clean_renewal_letter_value(step_3.get("city")),
            clean_renewal_letter_value(step_3.get("state")),
        ]
        if part
    )
    lines = [
        step_3.get("postal_address")
        or step_3.get("address_1")
        or step_3.get("unit_floor_block")
        or step_1.get("unit_floor_block"),
        step_3.get("address_2")
        or step_3.get("street_residential_area")
        or step_1.get("street_residential_area"),
        step_3.get("address_3"),
        step_3.get("address_4"),
        postcode_city_state,
    ]
    return [clean_renewal_letter_value(line) for line in lines if clean_renewal_letter_value(line)][:4]


def get_renewal_reminder_title(months):
    if months == 3:
        return "1st Reminder"
    if months == 2:
        return "2nd Reminder"
    return "3rd Reminder"


def get_renewal_application_applicant_name(application):
    form_data = getattr(application, "form_data", None) or {}
    step_2 = form_data.get("step_2") if isinstance(form_data.get("step_2"), dict) else {}
    step_3 = form_data.get("step_3") if isinstance(form_data.get("step_3"), dict) else {}
    step_1 = form_data.get("step_1") if isinstance(form_data.get("step_1"), dict) else {}
    candidates = [
        step_2.get("full_name"),
        step_3.get("full_name"),
        step_2.get("applicant"),
        step_3.get("applicant"),
        step_2.get("org_name"),
        step_3.get("org_name"),
        step_1.get("applicant"),
    ]

    for value in candidates:
        text = str(value or "").strip()
        if text:
            return text

    user = getattr(application, "applicant", None)
    if not user:
        return ""

    name = " ".join(
        part
        for part in [getattr(user, "first_name", ""), getattr(user, "last_name", "")]
        if part
    ).strip()
    return name


def get_renewal_registered_applicant_address_profile(application):
    user = getattr(application, "applicant", None)
    if not user:
        return {"address": ""}

    address = ", ".join(
        str(part or "").strip()
        for part in [
            getattr(user, "address_line1", ""),
            getattr(user, "address_line2", ""),
            getattr(user, "postcode", ""),
            getattr(user, "city", ""),
            getattr(user, "state", ""),
        ]
        if str(part or "").strip()
    ) or str(getattr(user, "address", "") or "").strip()
    return {"address": address}


def get_renewal_project_location(form_data):
    step_1 = form_data.get("step_1") if isinstance(form_data.get("step_1"), dict) else {}
    step_4 = form_data.get("step_4") if isinstance(form_data.get("step_4"), dict) else {}
    return (
        step_1.get("locality_address")
        or step_1.get("map_address")
        or step_1.get("site_address")
        or step_1.get("address")
        or step_1.get("selected_address")
        or step_4.get("land_location")
        or step_4.get("location")
        or ""
    )


def build_renewal_letter_reference(date_value):
    return f"DBKU/LES/IKL/{date_value:%y}/1(b)/ (   )"


def build_renewal_letter_subject(application, location):
    return build_renewal_letter_subject_for_month(application, location, 3)


def build_renewal_letter_subject_for_month(application, location, months):
    ad_name = get_advertisement_name(application)
    location_text = str(location or "ALAMAT LOKASI PROJEK IKLAN").strip()
    return f'PERINGATAN {get_malay_renewal_reminder_ordinal(months)} - BAYARAN LESEN IKLAN "{ad_name}" DI {location_text}'


def get_malay_renewal_reminder_ordinal(months):
    if months == 2:
        return "KEDUA"
    if months == 1:
        return "KETIGA"
    return "PERTAMA"


def get_advertisement_name(application):
    form_data = getattr(application, "form_data", None) or {}
    step_1 = form_data.get("step_1") if isinstance(form_data.get("step_1"), dict) else {}
    candidates = [
        step_1.get("project_name"),
        step_1.get("advertisement_name"),
        getattr(application, "title", ""),
        get_license_id(application),
    ]
    for value in candidates:
        text = re.sub(r"\s+", " ", str(value or "")).strip()
        if text:
            return text
    return "NAMA IKLAN"


def split_letter_address(value):
    text = str(value or "").strip()
    if not text:
        return []
    parts = re.split(r"[\r\n,]+", text)
    return [part.strip() for part in parts if part.strip()]


def build_renewal_period(expiry_date):
    if not expiry_date:
        return "-"
    start = expiry_date + timedelta(days=1)
    try:
        end = expiry_date.replace(year=expiry_date.year + 1)
    except ValueError:
        end = expiry_date + timedelta(days=365)
    return f"{start:%d.%m.%Y} hingga {end:%d.%m.%Y}"


def format_renewal_amount(value):
    text = str(value or "").strip()
    if not text:
        return ""
    numeric = re.sub(r"[^\d.]", "", text)
    if not numeric:
        return text
    try:
        return f"{float(numeric):,.2f}"
    except ValueError:
        return text


def format_malay_date(date_value):
    if not date_value:
        return "-"
    months = (
        "Januari",
        "Februari",
        "Mac",
        "April",
        "Mei",
        "Jun",
        "Julai",
        "Ogos",
        "September",
        "Oktober",
        "November",
        "Disember",
    )
    return f"{date_value.day} {months[date_value.month - 1]} {date_value.year}"


def build_cancellation_notice_text(application):
    return (
        f"Cancellation and Enforcement Notice: Advertisement license {get_license_id(application)} "
        f"for application {application.reference_no} has expired and renewal payment has not been completed. "
        "The license will be cancelled and enforcement action may proceed."
    )


