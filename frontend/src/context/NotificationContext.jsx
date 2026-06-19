import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  apiRequest,
  fetchApplicationList,
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
const NOTIFICATIONS_ENABLED = true;
const READ_STORAGE_KEY = "fastrack_notification_read_ids";
const POLL_INTERVAL_MS = 5000;
const applicantNotificationStatuses = new Set([
  "registration_success",
  "applicant_submitted",
  "applicant_resubmitted",
  "submitted",
  "incomplete",
  "rejected",
  "invoice_generated",
  "license_issued",
  "license_renewal_released",
  "license_cancellation_released",
]);
const technicalDepartmentOrder = ["BLG", "GPM", "MNE", "IMT", "LNP", "ENG"];
const technicalDepartments = new Set(technicalDepartmentOrder);
const approvalSupportDepartments = new Set(["TP(RES)", "PGH", "TP(RES)/PGH", "TP/PGH"]);
const mphlgReviewDepartments = new Set(["MPHLG"]);
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
  const form = app?.form_data || {};
  const status = normalizeStatus(app?.status);
  const kbStatus = normalizeStatus(form.kb_les_verification?.status);
  const supportStatus = normalizeStatus(form.management_recommendation?.status);

  if (status === "management_review" && !["verified", "supported", "completed"].includes(kbStatus)) {
    return cleanRemark(
      form.technical_ku_review?.remarks ||
      form.technical_ku_review?.comment ||
      app?.latest_remark
    );
  }

  if (
    status === "management_review" &&
    ["verified", "supported", "completed"].includes(kbStatus) &&
    !["supported", "approved", "completed"].includes(supportStatus)
  ) {
    return cleanRemark(
      form.kb_les_verification?.remarks ||
      form.management_recommendation?.remarks ||
      app?.latest_remark
    );
  }

  const summaryRemark = cleanRemark(app?.latest_remark);
  if (summaryRemark) return summaryRemark;

  return cleanRemark(
    form.correction_request?.remarks ||
    form.auto_screening?.remarks ||
    form.technical_ku_review?.remarks ||
    form.technical_review?.comment ||
    form.management_recommendation?.remarks ||
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
  return ["incomplete", "rejected", "technical_amendment", "technical_review_completed", "management_review"].includes(normalizeStatus(status));
}

function appendNotificationRemark(message, remark, status, remarkLabel = "Remark") {
  const cleanMessage = String(message || "").trim();
  const clean = cleanRemark(remark);

  if (!clean || !shouldShowNotificationRemark(status) || /\b(Remark|Catatan)\s*:/i.test(cleanMessage)) {
    return message || "";
  }

  return cleanMessage ? `${cleanMessage}\n\n${remarkLabel}: ${clean}` : `${remarkLabel}: ${clean}`;
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
  if (department === "SETIAUSAHA TETAP") return "";
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

function getSelectedTechnicalDepartments(app) {
  const selection = app?.technical_department_selection || app?.form_data?.technical_department_selection || {};
  const referral = app?.technical_referral || app?.form_data?.technical_referral || {};
  const selected = Array.isArray(selection?.departments)
    ? selection.departments
    : Array.isArray(referral?.participating_departments)
      ? referral.participating_departments
      : [];
  const normalized = new Set(selected.map(normalizeDepartment).filter(Boolean));

  return technicalDepartmentOrder.filter((department) => normalized.has(department));
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
  if (department) {
    return department;
  }

  const userRecipientKey = user?.id ? `user:${user.id}` : "";
  const deliveryBelongsToCurrentUser = Boolean(userRecipientKey && delivery.recipient === userRecipientKey);
  const email = deliveryBelongsToCurrentUser
    ? String(delivery.recipient_email || "").trim() || getUserEmail(user)
    : getUserEmail(user);

  const mobile = deliveryBelongsToCurrentUser
    ? String(delivery.recipient_mobile_number || "").trim() || getUserMobile(user)
    : getUserMobile(user);

  return formatContactRecipient(email, mobile);
}

function getCorrectionRequest(app) {
  const correction = app?.form_data?.correction_request || app?.correction_request || {};
  return correction && typeof correction === "object" ? correction : {};
}

function isReturnedToKuIkl(app) {
  const correction = getCorrectionRequest(app);
  const target = String(correction.target || "").trim().toUpperCase();
  return normalizeStatus(app?.status) === "technical_review_completed" && target === "KU(IKL)";
}

function getReturnSource(app) {
  const source = String(getCorrectionRequest(app).source || "").trim();
  return source || "ALiS Notification Center";
}

function getNotificationSender(role, status, user, app = null) {
  const normalizedStatus = normalizeStatus(status);
  const department = getUserDepartment(user);

  if (role === "admin" && department === "KU(IKL)" && isReturnedToKuIkl(app)) {
    return getReturnSource(app);
  }

  if (role === "admin" && department === "KU(IKL)" && normalizedStatus === "ku_ikl_review") {
    return "PT(IKL)";
  }

  if (
    role === "admin" &&
    department === "IKL (TECHNICAL)" &&
    ["technical_review", "technical_site_visit", "technical_amendment"].includes(normalizedStatus)
  ) {
    return "KU(IKL)";
  }

  if (
    role === "admin" &&
    technicalDepartments.has(department) &&
    normalizedStatus === "technical_review"
  ) {
    return "KU(IKL)";
  }

  if (
    role === "admin" &&
    department === "KU(IKL)" &&
    normalizedStatus === "technical_review_completed"
  ) {
    return "IKL(TECHNICAL)";
  }

  if (
    role === "admin" &&
    department === "KB(LES)" &&
    normalizedStatus === "management_review"
  ) {
    return "KU(IKL)";
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

  if (role === "admin" && status === "submitted" && department === "KU(IKL)") {
    return cleanReference
      ? `ALiS - Application ${cleanReference} requires KU(IKL) review`
      : "ALiS - New application requires KU(IKL) review";
  }

  if (role === "admin" && status === "ku_ikl_review" && department === "KU(IKL)") {
    return cleanReference
      ? `${cleanReference} requires KU(IKL) review`
      : "Application requires KU(IKL) review";
  }

  if (role === "admin" && status === "bill_pending_ku" && department === "PT(IKL)") {
    return cleanReference
      ? `${cleanReference} approval letter and bill are ready for applicant`
      : "Approval letter and bill are ready for applicant";
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
    status === "technical_review" &&
    technicalDepartments.has(department)
  ) {
    return cleanReference
      ? `Application ${cleanReference} requires review.`
      : "Application requires review.";
  }

  if (role === "admin" && status === "technical_review_completed" && department === "KU(IKL)") {
    if (/amendment/i.test(cleanTitle)) {
      return cleanReference
        ? `Application ${cleanReference} amendment required`
        : "Application amendment required";
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

function isMphlgApproved(app) {
  const section = getApplicationSection(app, "mphlg_gateway");
  const status = String(section?.status || "").trim().toLowerCase();
  const decision = String(section?.decision || "").trim().toLowerCase();
  const officer = normalizeDepartment(section?.officer);
  return officer === "MPHLG" && (status === "approved" || decision === "approve");
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
    return department === "KU(IKL)";
  }

  if (normalizedStatus === "approved") {
    if (app && isMphlgApproved(app)) {
      return department === "PT(IKL)" || department === "KU(IKL)" || department === "KB(LES)" || approvalSupportDepartments.has(department);
    }

    return department === "PT(IKL)";
  }

  if (normalizedStatus === "bill_pending_ku") {
    return department === "PT(IKL)";
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
    return mphlgReviewDepartments.has(department);
  }

  if (adminTechnicalTaskStatuses.has(normalizedStatus)) {
    if (normalizedStatus === "technical_amendment") {
      return department === "IKL (TECHNICAL)";
    }

    if (normalizedStatus === "technical_review_completed") {
      return department === "KU(IKL)";
    }

    if (department === "IKL (TECHNICAL)") {
      return ["technical_site_visit", "technical_amendment"].includes(normalizedStatus);
    }

    if (!technicalDepartments.has(department)) return false;
    if (normalizedStatus !== "technical_review") return false;
    if (!app) return true;
    return (
      getSelectedTechnicalDepartments(app).includes(department) &&
      !departmentHasSubmittedReview(app, department)
    );
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
      if (department === "PT(IKL)") {
        return app?.id ? `/admin/e-licenses/payment?id=${app.id}` : "/admin/e-licenses/payment";
      }
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
  const memoMessageMs = appendNotificationRemark(messageMs, remark, status, "Catatan");

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
    from: getNotificationSender(role, status, user, app),
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
        `ALiS - Application ${reference} requires KU(IKL) review`,
        `ALiS - Permohonan ${reference} memerlukan semakan KU(IKL)`,
        `Application ${reference} has been submitted and is ready for KU(IKL) review.`,
        `Permohonan ${reference} telah dihantar dan sedia untuk semakan KU(IKL).`,
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
    const returnedToKu = department === "KU(IKL)" && isReturnedToKuIkl(app);
    const returnSource = getReturnSource(app);
    const selectedDepartments = getSelectedTechnicalDepartments(app);
    const departmentText = selectedDepartments.join(", ") || department;
    notifications.push(
      buildBaseNotification(
        app,
        "admin",
        "technical",
        "warning",
        returnedToKu
          ? `Application ${reference} amendment required`
          : amendmentTask
          ? "IKL(TECHNICAL) amendment required"
          : `Application ${reference} requires review.`,
        returnedToKu
          ? `Permohonan ${reference} memerlukan pindaan`
          : amendmentTask
          ? "Pindaan IKL(TECHNICAL) diperlukan"
          : `Permohonan ${reference} memerlukan semakan.`,
        returnedToKu
          ? `Application ${reference} was returned by ${returnSource} and requires KU(IKL) amendment before verification can continue.`
          : amendmentTask
          ? `${reference} requires IKL(TECHNICAL) amendment before KU(IKL) can continue.`
          : `Application ${reference} is ready for ${departmentText} review.`,
        returnedToKu
          ? `Permohonan ${reference} telah dikembalikan oleh ${returnSource} dan memerlukan pindaan KU(IKL) sebelum verifikasi boleh diteruskan.`
          : amendmentTask
          ? `${reference} memerlukan pindaan IKL(TECHNICAL) sebelum KU(IKL) boleh meneruskan.`
          : `Permohonan ${reference} sedia untuk semakan ${departmentText}.`,
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
        "MPHLG decision received",
        "Keputusan MPHLG diterima",
        `${reference} has an MPHLG decision recorded.`,
        `Keputusan MPHLG telah direkodkan untuk ${reference}.`,
        user
      )
    );
  }

  if (status === "approved" && isAdminNotificationAllowedForUser(status, user, app)) {
    const mphlgApproved = isMphlgApproved(app);
    notifications.push(
      buildBaseNotification(
        app,
        "admin",
        "payment",
        "success",
        mphlgApproved ? "Application approved by MPHLG" : "Final approval received",
        mphlgApproved ? "Permohonan diluluskan oleh MPHLG" : "Kelulusan akhir diterima",
        mphlgApproved
          ? `${reference} has been approved by MPHLG.`
          : `${reference} has final TP(RES)/PGH approval. Generate the approval letter and bill.`,
        mphlgApproved
          ? `${reference} telah diluluskan oleh MPHLG.`
          : `${reference} telah menerima kelulusan akhir TP(RES)/PGH. Jana surat kelulusan dan bil.`,
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
        "Bill ready for applicant",
        "Bil sedia untuk pemohon",
        `${reference} has a generated bill ready to be sent to the applicant.`,
        `${reference} mempunyai bil yang sedia dihantar kepada pemohon.`,
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

  if (role === "admin" && normalizedStatus === "submitted" && getUserDepartment(user) === "KU(IKL)") {
    return "ku_ikl_review";
  }

  if (role === "admin" && normalizedStatus === "management_review" && app && isApprovalSupportPending(app)) {
    return "approval_support";
  }

  return normalizedStatus;
}

function normalizeApplicantNotificationText(value, role, status) {
  if (role === "applicant" && normalizeStatus(status) === "submitted") {
    return String(value || "")
      .replace(/ALiS\s*-\s*Application\s+[^(\n]+?\s+requires\s+KU\(IKL\)\s+review(?:\s+\([^)]+\))?/gi, "ALiS - Application submitted")
      .replace(/Application\s+[^.\n]+?\s+requires\s+KU\(IKL\)\s+review\.?/gi, "Application submitted successfully")
      .replace(/Application\s+[^.\n]+?\s+has been submitted and is ready for KU\(IKL\)\s+review\.?/gi, "Your application has been submitted successfully.")
      .replace(/requires\s+KU\(IKL\)\s+review/gi, "has been submitted")
      .replace(/\bApplication submitted\b/g, "Application submitted successfully")
      .replace(/\bapplication submitted\b/g, "application submitted successfully");
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

function getDeliveryLocalizedCopy(status, reference, remark = "") {
  const safeReference = reference && reference !== "-" ? reference : "permohonan";
  const clean = cleanRemark(remark);
  const copy = {
    applicant_submitted: {
      titleMs: "Permohonan berjaya dihantar",
      messageMs: `Permohonan anda ${safeReference} telah berjaya dihantar. ALiS akan menyemak permohonan anda dan memaklumkan jika terdapat kemas kini.`,
    },
    applicant_resubmitted: {
      titleMs: "Permohonan berjaya dihantar semula",
      messageMs: `Permohonan anda ${safeReference} telah berjaya dihantar semula. ALiS akan menyemak permohonan yang dikemas kini dan memaklumkan jika terdapat kemas kini.`,
    },
    submitted: {
      titleMs: "Permohonan baharu dihantar",
      messageMs: `Permohonan baharu ${safeReference} telah dihantar dan sedang menunggu semakan.`,
    },
    rejected: {
      titleMs: "Permohonan ditolak",
      messageMs: `Permohonan anda ${safeReference} telah ditolak. Sila semak catatan dan kemas kini permohonan anda.${clean ? `\n\nCatatan: ${clean}` : ""}`,
    },
    ku_ikl_review: {
      titleMs: "Semakan KU(IKL) diperlukan",
      messageMs: `Permohonan ${safeReference} sedia untuk pengesahan KU(IKL).`,
    },
    technical_review: {
      titleMs: "Tugasan teknikal diberikan",
      messageMs: `Permohonan ${safeReference} sedia untuk semakan teknikal jabatan.`,
    },
    technical_site_visit: {
      titleMs: "Lawatan tapak teknikal diberikan",
      messageMs: `Permohonan ${safeReference} sedia untuk semakan lawatan tapak jabatan.`,
    },
    technical_amendment: {
      titleMs: "Pindaan teknikal diperlukan",
      messageMs: `Permohonan ${safeReference} memerlukan pindaan IKL(TECHNICAL) sebelum KU(IKL) boleh meneruskan.`,
    },
    technical_review_completed: {
      titleMs: "Semakan teknikal KU(IKL) diperlukan",
      messageMs: `Permohonan ${safeReference} telah selesai maklum balas jabatan teknikal dan sedia untuk semakan KU(IKL).`,
    },
    management_review: {
      titleMs: "Pengesahan KB(LES) diperlukan",
      messageMs: `Permohonan ${safeReference} telah selesai semakan akhir KU(IKL) dan sedia untuk pengesahan KB(LES).`,
    },
    approved: {
      titleMs: "Kelulusan akhir diterima",
      messageMs: `Permohonan ${safeReference} telah menerima kelulusan akhir TP(RES)/PGH. Sila jana surat kelulusan dan bil.`,
    },
    bill_pending_ku: {
      titleMs: "Bil sedia untuk pemohon",
      messageMs: `Permohonan ${safeReference} mempunyai bil yang sedia dihantar kepada pemohon.`,
    },
    payment_submitted: {
      titleMs: "Bukti bayaran dihantar",
      messageMs: `Pemohon telah memuat naik bukti bayaran untuk permohonan ${safeReference}. Sila sahkan resit tersebut.`,
    },
    payment_verified: {
      titleMs: "Penjanaan lesen diperlukan",
      messageMs: `Bayaran untuk permohonan ${safeReference} telah disahkan. Sila jana lesen iklan dan kod QR.`,
    },
    mphlg_processing: {
      titleMs: "Kelulusan MPHLG diperlukan",
      messageMs: `Permohonan ${safeReference} sedia untuk kelulusan MPHLG.`,
    },
    mphlg_decision_received: {
      titleMs: "Keputusan MPHLG diterima",
      messageMs: `Keputusan MPHLG telah direkodkan untuk permohonan ${safeReference}.`,
    },
  };

  return copy[normalizeStatus(status)] || {};
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
      const deliveryApplication = {
        status,
        form_data: {
          kb_les_verification: delivery.kb_les_verification || {},
          management_recommendation: delivery.management_recommendation || {},
        },
      };
      const displayStatus =
        metadata.display_status || getNotificationDisplayStatus(role, status, user, deliveryApplication);
      const reference = delivery.reference_no || metadata.account_username || "-";
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
      const localizedCopy = getDeliveryLocalizedCopy(status, reference, delivery.latest_remark);
      const titleMs = normalizeApplicantNotificationText(metadata.title_ms || localizedCopy.titleMs || title, role, status);
      const messageMs = normalizeApplicantNotificationText(
        metadata.message_ms || localizedCopy.messageMs || message,
        role,
        status
      );
      const memoMessage = appendNotificationRemark(message, delivery.latest_remark, status);
      const memoMessageMs = appendNotificationRemark(messageMs, delivery.latest_remark, status, "Catatan");
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
        reference,
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
        memoHtml: metadata.memo_html || "",
        memoTemplate: metadata.memo_template || "",
        memoTo: metadata.to || "",
        from: metadata.from || metadata.sender || getNotificationSender(role, status, user),
        to,
        recipientRole: role,
        subject,
        time: formatDateTime(timestamp),
        timestamp,
        actionUrl: metadata.action_url || "",
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
    if (!NOTIFICATIONS_ENABLED) {
      setNotifications([]);
      setError("");
      setLastSyncedAt("");
      setLoading(false);
      return;
    }

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
        const fallbackList = await fetchApplicationList();
        setNotifications(buildNotifications(fallbackList, user));
      }
      setLastSyncedAt(new Date().toISOString());
    } catch (err) {
      try {
        const list = await fetchApplicationList();
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
    if (!NOTIFICATIONS_ENABLED) return;

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
    if (!NOTIFICATIONS_ENABLED) return;

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
      read: String(item.id || "").startsWith("web:")
        ? Boolean(item.read)
        : Boolean(item.read || readSet.has(item.id)),
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
