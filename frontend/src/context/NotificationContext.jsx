import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  apiRequest,
  getNormalizedRole,
  getStoredUser,
  isAdminUser,
  isApplicantUser,
  isSuperAdminUser,
} from "../services/api";
import {
  formatDateTime,
  formatWorkflowStatus,
  getApplicationLocation,
  getApplicationReference,
  getApplicationType,
  getProjectName,
  normalizeStatus,
} from "../utils/workflow";

const NotificationContext = createContext();
const READ_STORAGE_KEY = "fastrack_notification_read_ids";
const POLL_INTERVAL_MS = 5000;
const applicantNotificationStatuses = new Set([
  "submitted",
  "incomplete",
  "rejected",
  "invoice_generated",
  "license_issued",
  "license_renewal_released",
  "license_cancellation_released",
]);
const technicalDepartments = new Set(["BLG", "GPM", "MNE", "IMT", "LNP", "ENG"]);
const approvalSupportDepartments = new Set(["TP(RES)", "PGH", "TP(RES)/PGH", "TP/PGH"]);
const mphlgReviewDepartments = new Set(["MPHLG"]);
const sutApprovalDepartments = new Set(["SUT"]);
const adminTechnicalTaskStatuses = new Set([
  "technical_review",
  "technical_site_visit",
  "technical_amendment",
  "technical_review_completed",
]);
const adminNotificationStatuses = new Set(["submitted", "ku_ikl_review", ...adminTechnicalTaskStatuses]);
adminNotificationStatuses.add("management_review");
adminNotificationStatuses.add("mphlg_processing");
adminNotificationStatuses.add("mphlg_decision_received");
adminNotificationStatuses.add("approved");
adminNotificationStatuses.add("bill_pending_ku");
adminNotificationStatuses.add("payment_submitted");
adminNotificationStatuses.add("payment_verified");
adminNotificationStatuses.add("license_renewal_3m");
adminNotificationStatuses.add("license_renewal_2m");
adminNotificationStatuses.add("license_renewal_1m");
adminNotificationStatuses.add("license_renewal_supervisor_confirmation");
adminNotificationStatuses.add("license_cancellation_pending");
adminNotificationStatuses.add("license_cancellation_supervisor_confirmation");
adminNotificationStatuses.add("license_cancellation_kb_support");
const superadminNotificationStatuses = new Set(["account_created"]);

function readStoredIds() {
  try {
    const saved = JSON.parse(localStorage.getItem(READ_STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveStoredIds(ids) {
  localStorage.setItem(READ_STORAGE_KEY, JSON.stringify([...new Set(ids)]));
}

function getLatestRemark(app) {
  const summaryRemark = cleanRemark(app?.latest_remark);
  if (summaryRemark) return summaryRemark;

  const form = app?.form_data || {};
  return cleanRemark(
    form.correction_request?.remarks ||
    form.auto_screening?.remarks ||
    form.technical_ku_review?.remarks ||
    form.technical_review?.comment ||
    form.approval?.notes ||
    form.payment?.receipt_reference ||
    ""
  );
}

function cleanRemark(value) {
  const remark = String(value || "").trim();
  return ["", "-", "[]"].includes(remark) ? "" : remark;
}

function shouldShowNotificationRemark(status) {
  return ["incomplete", "rejected", "technical_amendment"].includes(normalizeStatus(status));
}

function appendNotificationRemark(message, remark, status) {
  const cleanMessage = String(message || "").trim();
  const clean = cleanRemark(remark);

  if (!clean || !shouldShowNotificationRemark(status) || /\bRemark\s*:/i.test(cleanMessage)) {
    return message || "";
  }

  return cleanMessage ? `${cleanMessage}\n\nRemark: ${clean}` : `Remark: ${clean}`;
}

function getAdminApplicationViewUrl(app) {
  if (!app?.id) return "/admin/applications";
  return `/admin/applications/${app.id}/view/step-1?id=${app.id}`;
}

function normalizeDepartment(value) {
  const department = String(value || "").trim().toUpperCase().replace(/-/g, " ").replace(/\s+/g, " ");

  if (department === "UNIT IKLAN") return "PT(IKL)";
  if (department === "PT IKL") return "PT(IKL)";
  if (department === "KU IKL") return "KU(IKL)";
  if (department === "IKL(TECHNICAL)" || department === "IKL TECHNICAL") {
    return "IKL (TECHNICAL)";
  }
  if (department === "INP") return "LNP";
  if (department === "SETIAUSAHA TETAP") return "SUT";
  return department;
}

function getUserDepartment(user) {
  return normalizeDepartment(user?.department);
}

function getUserDisplayName(user) {
  const name = String(user?.full_name || "").trim();
  if (name) return name;

  const department = getUserDepartment(user);
  if (department) return department;

  return String(user?.username || user?.email || "").trim() || "Current user";
}

function getUserEmail(user) {
  return String(user?.email || "").trim();
}

function getUserMobile(user) {
  return String(user?.mobile_number || user?.phone || user?.phone_number || "").trim();
}

function formatContactRecipient(email, mobile) {
  const parts = [email, mobile].map((value) => String(value || "").trim()).filter(Boolean);
  return parts.length ? parts.join(" / ") : "-";
}

function formatEmailRecipient(email) {
  return String(email || "").trim() || "-";
}

function getAdminNotificationRecipient(user, delivery = {}) {
  const department = getUserDepartment(user);
  const userRecipientKey = user?.id ? `user:${user.id}` : "";
  const deliveryBelongsToCurrentUser = Boolean(userRecipientKey && delivery.recipient === userRecipientKey);
  const email = deliveryBelongsToCurrentUser
    ? String(delivery.recipient_email || "").trim() || getUserEmail(user)
    : getUserEmail(user);

  if (
    department === "KU(IKL)" ||
    department === "KB(LES)" ||
    department === "IKL (TECHNICAL)" ||
    technicalDepartments.has(department)
  ) {
    return formatEmailRecipient(email);
  }

  const mobile = deliveryBelongsToCurrentUser
    ? String(delivery.recipient_mobile_number || "").trim() || getUserMobile(user)
    : getUserMobile(user);

  return formatContactRecipient(email, mobile);
}

function getNotificationSender(role, status, user) {
  const department = getUserDepartment(user);
  const normalizedStatus = normalizeStatus(status);

  if (
    role === "admin" &&
    department === "KU(IKL)" &&
    ["ku_ikl_review", "bill_pending_ku"].includes(normalizedStatus)
  ) {
    return "PT(IKL) <ALiS Notification Center>";
  }

  if (
    role === "admin" &&
    department === "IKL (TECHNICAL)" &&
    ["technical_review", "technical_site_visit", "technical_amendment"].includes(normalizedStatus)
  ) {
    return "KU(IKL) <ALiS Notification Center>";
  }

  if (
    role === "admin" &&
    technicalDepartments.has(department) &&
    ["technical_review", "technical_site_visit"].includes(normalizedStatus)
  ) {
    return "IKL(TECHNICAL) <ALiS Notification Center>";
  }

  if (
    role === "admin" &&
    department === "KU(IKL)" &&
    normalizedStatus === "technical_review_completed"
  ) {
    return "IKL(TECHNICAL) <ALiS Notification Center>";
  }

  if (
    role === "admin" &&
    department === "KB(LES)" &&
    normalizedStatus === "management_review"
  ) {
    return "KU(IKL) <ALiS Notification Center>";
  }

  return "ALiS Notification Center";
}

function getNotificationRecipient(role, user) {
  if (role === "applicant") {
    return getUserEmail(user) || getUserDisplayName(user);
  }

  if (role === "admin") {
    const department = getUserDepartment(user);
    if (["KU(IKL)", "KB(LES)", "IKL (TECHNICAL)"].includes(department) || technicalDepartments.has(department)) {
      return formatEmailRecipient(getUserEmail(user));
    }

    return formatContactRecipient(getUserEmail(user), getUserMobile(user));
  }

  return getUserDisplayName(user);
}

function getMemoSubject(subject, title, reference, options = {}) {
  const role = options.role || "";
  const status = normalizeStatus(options.status);
  const department = getUserDepartment(options.user);
  const cleanSubject = String(subject || "").trim();
  const cleanTitle = String(title || "").trim();
  const cleanReference = String(reference || "").trim();

  if (role === "admin" && status === "submitted" && department === "PT(IKL)") {
    return cleanReference
      ? `${cleanReference} requires PT(IKL) review`
      : "New application requires PT(IKL) review";
  }

  if (role === "admin" && status === "ku_ikl_review" && department === "KU(IKL)") {
    return cleanReference
      ? `${cleanReference} requires KU(IKL) review`
      : "Application requires KU(IKL) review";
  }

  if (role === "admin" && status === "bill_pending_ku" && department === "KU(IKL)") {
    return cleanReference
      ? `${cleanReference} requires KU(IKL) bill confirmation`
      : "Application requires KU(IKL) bill confirmation";
  }

  if (
    role === "admin" &&
    ["technical_review", "technical_site_visit", "technical_amendment"].includes(status) &&
    department === "IKL (TECHNICAL)"
  ) {
    if (status === "technical_amendment") {
      return cleanReference
        ? `${cleanReference} requires IKL (TECHNICAL) amendment`
        : "Application requires IKL (TECHNICAL) amendment";
    }

    return cleanReference
      ? `${cleanReference} requires IKL (TECHNICAL) review`
      : "Application requires IKL (TECHNICAL) review";
  }

  if (
    role === "admin" &&
    ["technical_review", "technical_site_visit"].includes(status) &&
    technicalDepartments.has(department)
  ) {
    return cleanReference
      ? `${cleanReference} requires ${department} technical review`
      : `Application requires ${department} technical review`;
  }

  if (role === "admin" && status === "technical_review_completed" && department === "KU(IKL)") {
    if (/amendment/i.test(cleanTitle)) {
      return cleanReference
        ? `${cleanReference} requires KU(IKL) amendment`
        : "Application requires KU(IKL) amendment";
    }

    return cleanReference
      ? `${cleanReference} requires KU(IKL) final technical check`
      : "Application requires KU(IKL) final technical check";
  }

  if (role === "admin" && status === "management_review" && department === "KB(LES)") {
    return cleanReference
      ? `${cleanReference} requires KB(LES) verification`
      : "Application requires KB(LES) verification";
  }

  if (cleanSubject) return cleanSubject;

  return cleanReference ? `ALiS - ${cleanTitle} (${cleanReference})` : `ALiS - ${cleanTitle}`;
}

function getTechnicalDepartmentReviews(app) {
  const reviews = app?.technical_department_reviews || app?.form_data?.technical_department_reviews || {};

  if (!reviews || typeof reviews !== "object") return {};

  return Object.entries(reviews).reduce((next, [department, value]) => {
    const normalizedDepartment = normalizeDepartment(department);
    if (normalizedDepartment) {
      next[normalizedDepartment] = value;
    }
    return next;
  }, {});
}

function departmentHasSubmittedReview(app, department) {
  const review = getTechnicalDepartmentReviews(app)[department];

  if (!review || typeof review !== "object") return false;

  return Boolean(
    review.decision ||
      review.status ||
      review.remarks ||
      review.comment ||
      review.submitted_at
  );
}

function getApplicationSection(app, key) {
  return app?.[key] || app?.form_data?.[key] || {};
}

function hasApplicationSection(app, key) {
  const section = getApplicationSection(app, key);
  return Boolean(section && Object.keys(section).length > 0);
}

function isKbLesVerified(app) {
  const status = String(getApplicationSection(app, "kb_les_verification")?.status || "")
    .trim()
    .toLowerCase();
  return ["verified", "supported", "completed"].includes(status);
}

function hasManagementSupport(app) {
  const status = String(getApplicationSection(app, "management_recommendation")?.status || "")
    .trim()
    .toLowerCase();
  return ["supported", "approved", "completed"].includes(status);
}

function isMphlgReviewPending(app) {
  const status = String(getApplicationSection(app, "mphlg_gateway")?.status || "")
    .trim()
    .toLowerCase();
  return status !== "approved" && status !== "reviewed";
}

function isSutApprovalPending(app) {
  return !hasApplicationSection(app, "approval");
}

function isApprovalSupportPending(app) {
  return isKbLesVerified(app) && !hasManagementSupport(app);
}

function getApprovalStageNotificationText(app, user) {
  const reference = getApplicationReference(app);
  const department = getUserDepartment(user);
  const supportPending = isApprovalSupportPending(app);
  const supportUser = approvalSupportDepartments.has(department);

  if (supportPending || supportUser) {
    return {
      displayStatus: "approval_support",
      titleEn: "Application ready for TP(RES)/PGH approval",
      titleMs: "Permohonan sedia untuk kelulusan TP(RES)/PGH",
      messageEn: `${reference} is ready for TP(RES)/PGH final approval.`,
      messageMs: `${reference} sedia untuk kelulusan akhir TP(RES)/PGH.`,
    };
  }

  return {
    displayStatus: "management_review",
    titleEn: "Application ready for KB(LES) verification",
    titleMs: "Permohonan sedia untuk pengesahan KB(LES)",
    messageEn: `${reference} has completed KU(IKL) final checking and is ready for KB(LES) verification.`,
    messageMs: `${reference} telah selesai semakan akhir KU(IKL) dan sedia untuk pengesahan KB(LES).`,
  };
}

function isAdminNotificationAllowedForUser(status, user, app = null) {
  const department = getUserDepartment(user);
  const normalizedStatus = normalizeStatus(status);

  if (normalizedStatus === "submitted") {
    return department === "PT(IKL)";
  }

  if (normalizedStatus === "approved") {
    return department === "PT(IKL)";
  }

  if (normalizedStatus === "bill_pending_ku") {
    return department === "KU(IKL)";
  }

  if (["payment_submitted", "payment_verified"].includes(normalizedStatus)) {
    return department === "PT(IKL)";
  }

  if (normalizedStatus === "ku_ikl_review") {
    return department === "KU(IKL)";
  }

  if (normalizedStatus === "management_review") {
    if (!app) return department === "KB(LES)" || approvalSupportDepartments.has(department);
    if (!isKbLesVerified(app)) return department === "KB(LES)";
    return approvalSupportDepartments.has(department) && !hasManagementSupport(app);
  }

  if (normalizedStatus === "mphlg_processing") {
    if (!app) return mphlgReviewDepartments.has(department);
    return mphlgReviewDepartments.has(department) && isMphlgReviewPending(app);
  }

  if (normalizedStatus === "mphlg_decision_received") {
    if (!app) return sutApprovalDepartments.has(department);
    return sutApprovalDepartments.has(department) && isSutApprovalPending(app);
  }

  if (adminTechnicalTaskStatuses.has(normalizedStatus)) {
    if (normalizedStatus === "technical_amendment") {
      return department === "IKL (TECHNICAL)";
    }

    if (normalizedStatus === "technical_review_completed") {
      return department === "KU(IKL)";
    }

    if (department === "IKL (TECHNICAL)") {
      return ["technical_review", "technical_site_visit", "technical_amendment"].includes(normalizedStatus);
    }

    if (!technicalDepartments.has(department)) return false;
    if (!app) return true;
    return !departmentHasSubmittedReview(app, department);
  }

  return false;
}

function getNotificationUrl(role, app, category, user = null) {
  if (role === "applicant") {
    if (category === "payment") return "/user/dashboard";
    if (category === "license") return "/user/dashboard";
    return `/applications/${app.id}/edit`;
  }

  if (role === "admin") {
    const department = getUserDepartment(user);
    if (
      category === "technical" &&
      (department === "IKL (TECHNICAL)" || department === "KU(IKL)")
    ) {
      return app?.id ? `/admin/auto-screening?id=${app.id}` : "/admin/auto-screening";
    }
    if (category === "technical" && department === "PT(IKL)") {
      return app?.id ? `/admin/auto-screening?id=${app.id}` : "/admin/auto-screening";
    }
    if (category === "technical" || technicalDepartments.has(department)) {
      return app?.id ? `/admin/technical-review?id=${app.id}` : "/admin/technical-review";
    }
    if (category === "screening" || category === "submission") {
      return app?.id ? `/admin/auto-screening?id=${app.id}` : "/admin/auto-screening";
    }
    if (category === "approval") {
      return app?.id ? `/dashboard/admin?view=approval&id=${app.id}` : "/dashboard/admin?view=approval";
    }
    if (category === "payment") {
      return app?.id ? `/admin/e-licenses/payment?id=${app.id}` : "/admin/e-licenses/payment";
    }
    if (category === "license") {
      return app?.id ? `/admin/e-licenses/license?id=${app.id}` : "/admin/e-licenses/license";
    }
  }

  return getAdminApplicationViewUrl(app);
}

function buildBaseNotification(app, role, category, type, titleEn, titleMs, messageEn, messageMs, user = null) {
  const status = normalizeStatus(app.status);
  const displayStatus = getNotificationDisplayStatus(role, status, user, app);
  const reference = getApplicationReference(app);
  const updatedAt = app.updated_at || app.created_at || new Date().toISOString();
  const remark = getLatestRemark(app);
  const remarkKey = remark ? `:${remark}` : "";
  const memoMessageEn = appendNotificationRemark(messageEn, remark, status);
  const memoMessageMs = appendNotificationRemark(messageMs, remark, status);

  return {
    id: `${role}:${app.id}:${status}:${category}:${updatedAt}${remarkKey}`,
    appId: app.id,
    reference,
    project: getProjectName(app),
    status: displayStatus,
    eventStatus: status,
    statusLabel: formatWorkflowStatus(displayStatus),
    category,
    type,
    title: titleEn,
    titleEn,
    titleMs,
    message: memoMessageEn,
    messageEn: memoMessageEn,
    messageMs: memoMessageMs,
    body: memoMessageEn,
    bodyEn: memoMessageEn,
    bodyMs: memoMessageMs,
    from: getNotificationSender(role, status, user),
    to: getNotificationRecipient(role, user),
    subject: getMemoSubject("", titleEn, reference, { role, status, user }),
    time: formatDateTime(updatedAt),
    timestamp: updatedAt,
    actionUrl: getNotificationUrl(role, app, category, user),
  };
}

function buildApplicantNotifications(app, user) {
  const status = normalizeStatus(app.status);
  const reference = getApplicationReference(app);
  const remark = getLatestRemark(app);
  const notifications = [];

  if (status === "submitted") {
    notifications.push(
      buildBaseNotification(
        app,
        "applicant",
        "submission",
        "success",
        "New Application Submitted",
        "Permohonan dihantar",
        `${reference} has been submitted successfully.`,
        `${reference} telah berjaya dihantar.`,
        user
      )
    );
  }

  if (status === "incomplete") {
    notifications.push(
      buildBaseNotification(
        app,
        "applicant",
        "correction",
        "error",
        "Application rejected",
        "Permohonan ditolak",
        `${reference} was rejected by ALiS${remark ? `: ${remark}` : "."}`,
        `${reference} telah ditolak oleh ALiS${remark ? `: ${remark}` : "."}`,
        user
      )
    );
  }

  if (status === "rejected") {
    notifications.push(
      buildBaseNotification(
        app,
        "applicant",
        "decision",
        "error",
        "Application rejected",
        "Permohonan ditolak",
        `${reference} was rejected${remark ? `: ${remark}` : "."}`,
        `${reference} telah ditolak${remark ? `: ${remark}` : "."}`,
        user
      )
    );
  }

  if (status === "invoice_generated") {
    notifications.push(
      buildBaseNotification(
        app,
        "applicant",
        "payment",
        "warning",
        "Payment proof required",
        "Bukti bayaran diperlukan",
        `${reference} has an invoice ready. Please upload your proof of payment.`,
        `${reference} mempunyai bil yang sedia. Sila muat naik bukti bayaran anda.`,
        user
      )
    );
  }

  if (status === "license_issued") {
    notifications.push(
      buildBaseNotification(
        app,
        "applicant",
        "license",
        "success",
        "QR e-license generated",
        "E-lesen QR dijana",
        `${reference} QR e-license has been generated successfully.`,
        `E-lesen QR ${reference} telah berjaya dijana.`,
        user
      )
    );
  }

  return notifications;
}

function buildAdminNotifications(app, user) {
  const status = normalizeStatus(app.status);
  const reference = getApplicationReference(app);
  const project = getProjectName(app);
  const location = getApplicationLocation(app);
  const type = getApplicationType(app);
  const notifications = [];

  if (status === "submitted" && isAdminNotificationAllowedForUser(status, user, app)) {
    notifications.push(
      buildBaseNotification(
        app,
        "admin",
        "screening",
        "warning",
        "New IKL application submitted",
        "Permohonan IKL baharu telah dihantar",
        `${reference} (${type}) was submitted for ${project} at ${location}.`,
        `${reference} (${type}) telah dihantar untuk ${project} di ${location}.`,
        user
      )
    );
  }

  if (status === "ku_ikl_review" && isAdminNotificationAllowedForUser(status, user, app)) {
    notifications.push(
      buildBaseNotification(
        app,
        "admin",
        "screening",
        "warning",
        "Application ready for KU(IKL) review",
        "Permohonan sedia untuk semakan KU(IKL)",
        `${reference} is ready for KU(IKL) verification.`,
        `${reference} sedia untuk pengesahan KU(IKL).`,
        user
      )
    );
  }

  if (adminTechnicalTaskStatuses.has(status) && isAdminNotificationAllowedForUser(status, user, app)) {
    const department = getUserDepartment(user);
    const amendmentTask = status === "technical_amendment";
    notifications.push(
      buildBaseNotification(
        app,
        "admin",
        "technical",
        "warning",
        amendmentTask ? "IKL(TECHNICAL) amendment required" : `${department} technical task assigned`,
        amendmentTask ? "Pindaan IKL(TECHNICAL) diperlukan" : `Tugasan teknikal ${department} diberikan`,
        amendmentTask
          ? `${reference} requires IKL(TECHNICAL) amendment before KU(IKL) can continue.`
          : `${reference} is ready for ${department} site review.`,
        amendmentTask
          ? `${reference} memerlukan pindaan IKL(TECHNICAL) sebelum KU(IKL) boleh meneruskan.`
          : `${reference} sedia untuk semakan tapak ${department}.`,
        user
      )
    );
  }

  if (status === "management_review" && isAdminNotificationAllowedForUser(status, user, app)) {
    const approvalText = getApprovalStageNotificationText(app, user);
    notifications.push(
      buildBaseNotification(
        app,
        "admin",
        "approval",
        "warning",
        approvalText.titleEn,
        approvalText.titleMs,
        approvalText.messageEn,
        approvalText.messageMs,
        user
      )
    );
  }

  if (status === "mphlg_processing" && isAdminNotificationAllowedForUser(status, user, app)) {
    notifications.push(
      buildBaseNotification(
        app,
        "admin",
        "approval",
        "warning",
        "Application ready for MPHLG approval",
        "Permohonan sedia untuk kelulusan MPHLG",
        `${reference} is ready for MPHLG approval.`,
        `${reference} sedia untuk kelulusan MPHLG.`,
        user
      )
    );
  }

  if (status === "mphlg_decision_received" && isAdminNotificationAllowedForUser(status, user, app)) {
    notifications.push(
      buildBaseNotification(
        app,
        "admin",
        "approval",
        "warning",
        "Application ready for SUT approval",
        "Permohonan sedia untuk kelulusan SUT",
        `${reference} is ready for SUT approval.`,
        `${reference} sedia untuk kelulusan SUT.`,
        user
      )
    );
  }

  if (status === "approved" && isAdminNotificationAllowedForUser(status, user, app)) {
    notifications.push(
      buildBaseNotification(
        app,
        "admin",
        "payment",
        "success",
        "Final approval received",
        "Kelulusan akhir diterima",
        `${reference} has final TP(RES)/PGH approval. Generate the approval letter and bill.`,
        `${reference} telah menerima kelulusan akhir TP(RES)/PGH. Jana surat kelulusan dan bil.`,
        user
      )
    );
  }

  if (status === "bill_pending_ku" && isAdminNotificationAllowedForUser(status, user, app)) {
    notifications.push(
      buildBaseNotification(
        app,
        "admin",
        "payment",
        "warning",
        "Bill confirmation required",
        "Pengesahan bil diperlukan",
        `${reference} has a generated bill waiting for KU(IKL) confirmation.`,
        `${reference} mempunyai bil yang menunggu pengesahan KU(IKL).`,
        user
      )
    );
  }

  if (status === "payment_submitted" && isAdminNotificationAllowedForUser(status, user, app)) {
    notifications.push(
      buildBaseNotification(
        app,
        "admin",
        "payment",
        "warning",
        "Payment proof submitted",
        "Bukti bayaran dihantar",
        `${reference} has uploaded payment proof for PT(IKL) verification.`,
        `${reference} telah memuat naik bukti bayaran untuk pengesahan PT(IKL).`,
        user
      )
    );
  }

  if (status === "payment_verified" && isAdminNotificationAllowedForUser(status, user, app)) {
    notifications.push(
      buildBaseNotification(
        app,
        "admin",
        "license",
        "success",
        "License issuance required",
        "Penjanaan lesen diperlukan",
        `${reference} payment is verified. Generate the advertisement license and QR code.`,
        `Bayaran ${reference} telah disahkan. Jana lesen iklan dan kod QR.`,
        user
      )
    );
  }

  return notifications;
}

function buildNotifications(applications, user) {
  const role = getNormalizedRole(user);
  const builders = {
    admin: buildAdminNotifications,
    applicant: buildApplicantNotifications,
  };
  const builder = builders[role];

  if (!builder) return [];

  return applications
    .flatMap((app) => builder(app, user))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

function getTitleFromSubject(subject) {
  return String(subject || "")
    .replace(/^ALiS\s*[-:]\s*/i, "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim();
}

function getMessageSummary(message) {
  const lines = String(message || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const skipPrefixes = ["ALiS", "Reference:", "Status:", "Project:", "Open:"];
  return lines.find((line) => !skipPrefixes.some((prefix) => line.startsWith(prefix))) || "";
}

function getNotificationDisplayStatus(role, status, user = null, app = null) {
  const normalizedStatus = normalizeStatus(status);

  if (role === "applicant" && normalizedStatus === "incomplete") {
    return "rejected";
  }

  if (role === "admin" && normalizedStatus === "submitted" && getUserDepartment(user) === "PT(IKL)") {
    return "pt_ikl_review";
  }

  if (role === "admin" && normalizedStatus === "management_review" && app && isApprovalSupportPending(app)) {
    return "approval_support";
  }

  return normalizedStatus;
}

function normalizeApplicantNotificationText(value, role, status) {
  if (normalizeStatus(status) === "submitted") {
    return String(value || "")
      .replace(/\bApplication submitted\b/g, "New Application Submitted")
      .replace(/\bapplication submitted\b/g, "new application submitted");
  }

  if (role !== "applicant" || normalizeStatus(status) !== "incomplete") {
    return value;
  }

  return String(value || "")
    .replace(/Application returned/gi, "Application rejected")
    .replace(/Your application ([^.\n]+?) was returned by ALiS/gi, "Your application $1 was rejected by ALiS")
    .replace(/\bwas returned by ALiS\b/gi, "was rejected by ALiS")
    .replace(/\bwas returned\b/gi, "was rejected")
    .replace(/\breturned by ALiS\b/gi, "rejected by ALiS")
    .replace(/\breturned\b/gi, "rejected")
    .replace(/\bIncomplete\b/g, "Rejected");
}

function buildNotificationsFromDeliveries(deliveries, user) {
  const role = getNormalizedRole(user);
  const allowedStatuses =
    role === "superadmin"
      ? superadminNotificationStatuses
      : role === "admin"
        ? adminNotificationStatuses
        : applicantNotificationStatuses;

  return deliveries
    .filter((delivery) => {
      const metadata = delivery.metadata || {};
      const eventStatus = normalizeStatus(metadata.event_status || delivery.status);
      return allowedStatuses.has(eventStatus);
    })
    .map((delivery) => {
      const metadata = delivery.metadata || {};
      const category = metadata.category || "progress";
      const type = metadata.type || "info";
      const status = normalizeStatus(metadata.event_status || delivery.status);
      const displayStatus = metadata.display_status || getNotificationDisplayStatus(role, status, user);
      const title = normalizeApplicantNotificationText(
        metadata.title_en || metadata.title || getTitleFromSubject(delivery.subject),
        role,
        status
      );
      const message = normalizeApplicantNotificationText(
        metadata.message_en || metadata.message || getMessageSummary(delivery.message),
        role,
        status
      );
      const titleMs = normalizeApplicantNotificationText(metadata.title_ms || title, role, status);
      const messageMs = normalizeApplicantNotificationText(metadata.message_ms || message, role, status);
      const memoMessage = appendNotificationRemark(message, delivery.latest_remark, status);
      const memoMessageMs = appendNotificationRemark(messageMs, delivery.latest_remark, status);
      const timestamp = delivery.created_at || delivery.application_updated_at || new Date().toISOString();
      const recipientName = String(delivery.recipient_name || "").trim();
      const recipientEmail = String(delivery.recipient_email || "").trim();
      const recipientDepartment = normalizeDepartment(delivery.recipient_department);
      const to =
        role === "applicant"
          ? recipientEmail || getUserEmail(user) || recipientName || getUserDisplayName(user)
          : role === "admin"
            ? getAdminNotificationRecipient(user, delivery)
            : recipientName || recipientDepartment || getUserDisplayName(user);
      const subject = normalizeApplicantNotificationText(
        getMemoSubject(delivery.subject, title, delivery.reference_no || metadata.account_username, {
          role,
          status,
          user,
        }),
        role,
        status
      );

      return {
        id: `web:${delivery.id}`,
        serverId: delivery.id,
        appId: delivery.application_id,
        reference: delivery.reference_no || metadata.account_username || "-",
        project: delivery.project || metadata.account_name || "-",
        status: displayStatus,
        eventStatus: status,
        statusLabel: formatWorkflowStatus(displayStatus),
        category,
        type,
        title,
        titleEn: title,
        message: memoMessage,
        messageEn: memoMessage,
        titleMs,
        messageMs: memoMessageMs,
        body: memoMessage,
        bodyEn: memoMessage,
        bodyMs: memoMessageMs,
        from: metadata.from || metadata.sender || getNotificationSender(role, status, user),
        to,
        subject,
        time: formatDateTime(timestamp),
        timestamp,
        actionUrl: metadata.action_url || getNotificationUrl(role, { id: delivery.application_id }, category, user),
        read: Boolean(delivery.read_at),
      };
    })
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const [readIds, setReadIds] = useState(readStoredIds);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState("");

  const refreshNotifications = useCallback(async () => {
    const token = localStorage.getItem("fastrack_access_token");
    const user = getStoredUser();

    if (!token || (!isSuperAdminUser(user) && !isAdminUser(user) && !isApplicantUser(user))) {
      setNotifications([]);
      setError("");
      setLastSyncedAt("");
      return;
    }

    try {
      setLoading(true);
      setError("");
      const data = await apiRequest("/notifications/");
      const list = Array.isArray(data) ? data : data?.results || [];
      const deliveryNotifications = buildNotificationsFromDeliveries(list, user);
      if (deliveryNotifications.length > 0 || isSuperAdminUser(user)) {
        setNotifications(deliveryNotifications);
      } else {
        const fallbackData = await apiRequest("/applications/");
        const fallbackList = Array.isArray(fallbackData)
          ? fallbackData
          : fallbackData?.results || [];
        setNotifications(buildNotifications(fallbackList, user));
      }
      setLastSyncedAt(new Date().toISOString());
    } catch (err) {
      try {
        const data = await apiRequest("/applications/");
        const list = Array.isArray(data) ? data : data?.results || [];
        setNotifications(buildNotifications(list, user));
        setLastSyncedAt(new Date().toISOString());
      } catch {
        setError(err.message || "Unable to load notifications.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshNotifications();
    const intervalId = window.setInterval(refreshNotifications, POLL_INTERVAL_MS);
    const handleRefresh = () => refreshNotifications();

    window.addEventListener("focus", handleRefresh);
    window.addEventListener("visibilitychange", handleRefresh);
    window.addEventListener("fastrack:auth-changed", handleRefresh);
    window.addEventListener("fastrack:applications-changed", handleRefresh);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleRefresh);
      window.removeEventListener("visibilitychange", handleRefresh);
      window.removeEventListener("fastrack:auth-changed", handleRefresh);
      window.removeEventListener("fastrack:applications-changed", handleRefresh);
    };
  }, [refreshNotifications]);

  function markAsRead(id) {
    setNotifications((prev) =>
      prev.map((item) => (item.id === id ? { ...item, read: true } : item))
    );
    setReadIds((prev) => {
      const next = [...new Set([...prev, id])];
      saveStoredIds(next);
      return next;
    });

    if (String(id).startsWith("web:")) {
      const serverId = String(id).replace("web:", "");
      apiRequest(`/notifications/${serverId}/mark_read/`, { method: "POST" }).catch(() => {
        refreshNotifications();
      });
    }
  }

  function markAllAsRead() {
    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
    setReadIds((prev) => {
      const next = [...new Set([...prev, ...notifications.map((item) => item.id)])];
      saveStoredIds(next);
      return next;
    });

    apiRequest("/notifications/mark_all_read/", { method: "POST" }).catch(() => {
      refreshNotifications();
    });
  }

  const notificationsWithReadState = useMemo(() => {
    const readSet = new Set(readIds);
    return notifications.map((item) => ({
      ...item,
      read: Boolean(item.read || readSet.has(item.id)),
    }));
  }, [notifications, readIds]);

  const unreadCount = notificationsWithReadState.filter((item) => !item.read).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications: notificationsWithReadState,
        markAsRead,
        markAllAsRead,
        refreshNotifications,
        unreadCount,
        loading,
        error,
        lastSyncedAt,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
