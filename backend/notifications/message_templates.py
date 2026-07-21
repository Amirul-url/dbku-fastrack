APP_BRAND_NAME = "ALiS"


# =================
# Notify message for pemohon
# =================

# Account registration successful
APPLICANT_REGISTRATION_SUCCESS_TITLE = "Account registration successful"
APPLICANT_REGISTRATION_SUCCESS_BODY = (
    "Your ALiS account has been registered successfully. You can now log in and "
    "submit advertisement license applications."
)

# Application submitted
APPLICANT_APPLICATION_SUBMITTED_SUBJECT_TEMPLATE = (
    "{brand} - Application submitted ({reference})"
)
APPLICANT_APPLICATION_SUBMITTED_BODY_TEMPLATE = (
    "Your application {reference} has been submitted successfully. ALiS will review "
    "your application and notify you when there is an update."
)
KU_IKL_SUBMITTED_STATUS = (
    "Application {reference} requires KU(IKL) review",
    "Your application {reference} has been submitted successfully.",
    "Application {reference} has been submitted and is ready for KU(IKL) review.",
)

# Application resubmitted
APPLICANT_APPLICATION_RESUBMITTED_SUBJECT_TEMPLATE = (
    "{brand} - Application resubmitted ({reference})"
)
APPLICANT_APPLICATION_RESUBMITTED_BODY_TEMPLATE = (
    "Your application {reference} has been resubmitted successfully. ALiS will "
    "review your updated application and notify you when there is an update."
)
KU_IKL_STAFF_RESUBMITTED_BODY_TEMPLATE = (
    "Application {reference} has been resubmitted by the applicant and is ready for {review_target} review."
)
APPLICATION_RESUBMITTED_TITLE_TEMPLATE = "Application {reference} resubmitted"

# Application incomplete / rejected by ALiS
INCOMPLETE_STATUS = (
    "Application rejected",
    "Your application {reference} was rejected by ALiS. Please review the remark below and update your application.",
    "",
)

# Application rejected
APPLICANT_APPLICATION_REJECTED_SUBJECT_TEMPLATE = (
    "{brand} - Application rejected ({reference})"
)
APPLICANT_APPLICATION_REJECTED_BODY_TEMPLATE = (
    "Your application {reference} has been rejected. Please review the remark and "
    "update your application."
)
REJECTED_STATUS = (
    "Application rejected",
    "Your application {reference} has been rejected. Please review the remark below.",
    "",
)

# Payment proof required
INVOICE_GENERATED_STATUS = (
    "Payment proof required",
    "Bill for application {reference} is ready. Please upload your proof of payment.",
    "",
)

# Payment receipt rejected
APPLICANT_PAYMENT_RECEIPT_REJECTED_TITLE = "Payment receipt rejected"
APPLICANT_PAYMENT_RECEIPT_REJECTED_BODY_TEMPLATE = (
    "Your payment receipt for application {reference} was rejected. Please review "
    "the remark and upload a new proof of payment."
)

# QR e-license generated
LICENSE_ISSUED_STATUS = (
    "QR e-license generated",
    "Your QR e-license for application {reference} has been issued and is ready to download.",
    "",
)

# Advertisement license revoked
LICENSE_REVOKED_STATUS = (
    "Advertisement license revoked",
    "Your advertisement license for application {reference} has been revoked.",
    "",
)

# License renewal reminder released
APPLICANT_RENEWAL_RELEASED_TITLE_TEMPLATE = (
    "{months}-month license renewal reminder released"
)
APPLICANT_RENEWAL_RELEASED_BODY_TEMPLATE = (
    "Your advertisement license for application {reference} is due to expire. "
    "Please complete the renewal process before the expiry date."
)

# License cancellation notice released
APPLICANT_LICENSE_CANCELLATION_RELEASED_TITLE = (
    "License cancellation notice released"
)
APPLICANT_LICENSE_CANCELLATION_RELEASED_BODY_TEMPLATE = (
    "Your advertisement license for application {reference} has been cancelled and "
    "enforcement action may proceed because renewal payment was not completed after expiry."
)

# Password reset OTP
PASSWORD_RESET_SUBJECT = "ALiS Password Reset OTP"
PASSWORD_RESET_BODY_TEMPLATE = (
    "Hello {name},\n\n"
    "Your ALiS password reset OTP is {otp}.\n"
    "This OTP will expire in 10 minutes. If you did not request this, please ignore this message."
)

# Default fallback status
DEFAULT_STATUS_MESSAGE = (
    "Application status updated: {status_label}",
    "Your application {reference} status is now {status_label}.",
    "Application {reference} status is now {status_label}.",
)


# =================
# Notify message for KU(IKL)
# =================

KU_IKL_REVIEW_STATUS = (
    "KU(IKL) review required",
    "",
    "Application {reference} is ready for KU(IKL) verification.",
)
KU_IKL_TECHNICAL_REVIEW_COMPLETED_STATUS = (
    "Application {reference} requires KU(IKL) technical review",
    "",
    "Application {reference} has completed technical department feedback and is ready for KU(IKL) review.",
)
KU_IKL_TECHNICAL_REVIEW_COMPLETED_RETURNED_TITLE_TEMPLATE = (
    "Application {reference} amendment required"
)
KU_IKL_TECHNICAL_REVIEW_COMPLETED_RETURNED_BODY_TEMPLATE = (
    "Application {reference} was returned by {amendment_source} and requires "
    "KU(IKL) amendment before verification can continue."
)
KU_IKL_TECHNICAL_REVIEW_TITLE_TEMPLATE = (
    "Application {reference} requires {department_text} review."
)
KU_IKL_TECHNICAL_REVIEW_BODY_TEMPLATE = (
    "Application {reference} is ready for {department_text} review."
)
KU_IKL_MANAGEMENT_REVIEW_STATUS = (
    "Application {reference} requires KB(LES) verification",
    "",
    "Application {reference} has completed KU(IKL) final checking and is ready for KB(LES) verification.",
)


# =================
# Notify message for BLG / GPM / MNE / IMT / LNP / ENG
# =================

TECHNICAL_REVIEW_STATUS = (
    "Technical task assigned",
    "",
    "Application {reference} is ready for your department technical review.",
)


# =================
# Notify message for IKL(TECHNICAL)
# =================

IKL_TECHNICAL_SITE_VISIT_STATUS = (
    "Application {reference} requires IKL(TECHNICAL) review",
    "",
    "Application {reference} has completed selected unit technical review and is ready for IKL(TECHNICAL) review.",
)
IKL_TECHNICAL_AMENDMENT_STATUS = (
    "Application {reference} requires technical amendment",
    "",
    "Application {reference} requires IKL(TECHNICAL) amendment before KU(IKL) can continue.",
)


# =================
# Notify message for KB(LES)
# =================

KB_LES_CANCELLATION_SUPPORT_TITLE = "Cancellation notice awaiting KB(LES) support"
KB_LES_CANCELLATION_SUPPORT_BODY_TEMPLATE = (
    "The cancellation and enforcement notice for application {reference} has been "
    "confirmed by a supervisor. KB(LES) support is required before release."
)
KB_LES_SUPPORT_AFTER_SUT_TITLE_TEMPLATE = (
    "Application {reference} requires KB(LES) support"
)
KB_LES_SUPPORT_AFTER_SUT_BODY_TEMPLATE = (
    "SUT approval result for application {reference} has been recorded. KB(LES) "
    "support is required before TP(RES)/PGH final approval."
)


# =================
# Notify message for TP(RES) / PGH
# =================

TP_PGH_APPROVED_STATUS = (
    "Final approval received",
    "",
    "Application {reference} has final TP(RES)/PGH approval. Please generate the approval letter and bill.",
)
TP_PGH_MANAGEMENT_SUPPORT_TITLE_TEMPLATE = (
    "Application {reference} requires TP(RES)/PGH approval"
)
TP_PGH_MANAGEMENT_SUPPORT_BODY_TEMPLATE = (
    "Application {reference} is ready for TP(RES)/PGH final approval."
)


# =================
# Notify message for MPHLG
# =================

MPHLG_PROCESSING_STATUS = (
    "Application {reference} requires MPHLG approval",
    "",
    "Application {reference} is ready for MPHLG approval.",
)
MPHLG_DECISION_RECEIVED_STATUS = (
    "Application {reference} requires SUT approval",
    "",
    "Application {reference} is ready for SUT approval.",
)
MPHLG_APPROVED_TITLE_TEMPLATE = "Application {reference} approved by MPHLG"
MPHLG_APPROVED_BODY_TEMPLATE = "Application {reference} has been approved by MPHLG."
MPHLG_APPROVED_TITLE_MS = "Permohonan diluluskan oleh MPHLG"
MPHLG_APPROVED_MESSAGE_MS_TEMPLATE = "Permohonan {reference} telah diluluskan oleh MPHLG."


# =================
# Notify message for PT(IKL)
# =================

PT_IKL_BILL_PENDING_KU_STATUS = (
    "Bill ready for applicant",
    "",
    "Application {reference} has a generated bill ready to be sent to the applicant.",
)
PT_IKL_PAYMENT_VERIFIED_STATUS = (
    "License issuance required",
    "",
    "Payment for application {reference} has been verified. Please generate the advertisement license and QR code.",
)
PT_IKL_RENEWAL_DETECTED_TITLE_TEMPLATE = "{months}-month license renewal reminder"
PT_IKL_RENEWAL_DETECTED_BODY_TEMPLATE = (
    "License {license_id} for application {reference} will expire on {expiry}. "
    "PT(IKL) must generate the renewal reminder letter and a supervisor must confirm it before release."
)
PT_IKL_CANCELLATION_PENDING_TITLE = "Cancellation notice required"
PT_IKL_CANCELLATION_PENDING_BODY_TEMPLATE = (
    "License {license_id} has expired without verified renewal payment. PT(IKL) "
    "must generate the cancellation and enforcement notice."
)
PT_IKL_LICENSE_REVOCATION_REQUESTED_TITLE = "Applicant requested license revocation"
PT_IKL_LICENSE_REVOCATION_REQUESTED_BODY_TEMPLATE = (
    "The applicant has requested license revocation for application {reference}. "
    "Please review and revoke the license if appropriate."
)
PT_IKL_LICENSE_REVOCATION_WITHDRAWN_TITLE = "License revocation request withdrawn"
PT_IKL_LICENSE_REVOCATION_WITHDRAWN_BODY_TEMPLATE = (
    "The applicant has withdrawn the license revocation request for application {reference}."
)


# =================
# Notify message for FIN
# =================

FIN_PAYMENT_SUBMITTED_STATUS = (
    "Payment proof submitted",
    "",
    "Applicant has uploaded payment proof for application {reference}. FIN must verify the receipt.",
)


# =================
# Notify message for superadmin
# =================

SUPERADMIN_ACCOUNT_CREATED_TITLE_TEMPLATE = "New {role_label} account created"
SUPERADMIN_ACCOUNT_CREATED_BODY_TEMPLATE = (
    "{role_label} account {account_name} was created successfully."
)
SUPERADMIN_ACCOUNT_CREATED_BY_SENTENCE_TEMPLATE = "Created by {creator_name}."


# =================
# Shared notify message
# =================

SUPERVISOR_RENEWAL_CONFIRMATION_TITLE_TEMPLATE = (
    "{months}-month renewal letter awaiting supervisor confirmation"
)
SUPERVISOR_RENEWAL_CONFIRMATION_BODY_TEMPLATE = (
    "PT(IKL) has generated the {months}-month renewal reminder letter for application "
    "{reference}. Please verify and confirm the letter."
)
SUPERVISOR_CANCELLATION_CONFIRMATION_TITLE = (
    "Cancellation notice awaiting supervisor confirmation"
)
SUPERVISOR_CANCELLATION_CONFIRMATION_BODY_TEMPLATE = (
    "PT(IKL) has generated the cancellation and enforcement notice for application "
    "{reference}. Please verify and confirm the notice."
)

STATUS_MESSAGES = {
    "submitted": KU_IKL_SUBMITTED_STATUS,
    "incomplete": INCOMPLETE_STATUS,
    "rejected": REJECTED_STATUS,
    "invoice_generated": INVOICE_GENERATED_STATUS,
    "approved": TP_PGH_APPROVED_STATUS,
    "bill_pending_ku": PT_IKL_BILL_PENDING_KU_STATUS,
    "payment_submitted": FIN_PAYMENT_SUBMITTED_STATUS,
    "payment_verified": PT_IKL_PAYMENT_VERIFIED_STATUS,
    "license_issued": LICENSE_ISSUED_STATUS,
    "license_revoked": LICENSE_REVOKED_STATUS,
    "technical_review": TECHNICAL_REVIEW_STATUS,
    "ku_ikl_review": KU_IKL_REVIEW_STATUS,
    "technical_site_visit": IKL_TECHNICAL_SITE_VISIT_STATUS,
    "technical_amendment": IKL_TECHNICAL_AMENDMENT_STATUS,
    "technical_review_completed": KU_IKL_TECHNICAL_REVIEW_COMPLETED_STATUS,
    "management_review": KU_IKL_MANAGEMENT_REVIEW_STATUS,
    "mphlg_processing": MPHLG_PROCESSING_STATUS,
    "mphlg_decision_received": MPHLG_DECISION_RECEIVED_STATUS,
}

ACCOUNT_NAME_LINE_TEMPLATE = "Name: {account_name}"
ACCOUNT_ROLE_LINE_TEMPLATE = "Role: {role_label}"
ACCOUNT_LOGIN_ID_LINE_TEMPLATE = "Login ID: {username}"
ACCOUNT_CREATED_BY_LINE_TEMPLATE = "Created by: {creator_name}"
APPLICATION_REFERENCE_LINE_TEMPLATE = "Reference: {reference}"
LICENSE_ID_LINE_TEMPLATE = "License ID: {license_id}"
REMARK_BLOCK_TEMPLATE = "Remark: {remark}"
CATATAN_BLOCK_TEMPLATE = "Catatan: {remark}"
