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
  formatDate,
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
]);
const technicalDepartments = new Set(["BLG", "GPM", "MNE", "IMT", "LNP", "ENG"]);
const approvalSupportDepartments = new Set(["TP(RES)", "PGH", "TP(RES)/PGH", "TP/PGH"]);
const adminTechnicalTaskStatuses = new Set([
  "technical_review",
  "technical_site_visit",
  "technical_amendment",
  "technical_review_completed",
]);
const adminNotificationStatuses = new Set(["submitted", "ku_ikl_review", ...adminTechnicalTaskStatuses]);
adminNotificationStatuses.add("management_review");
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

function getMemoSubject(subject, title, reference) {
  const cleanSubject = String(subject || "").trim();
  if (cleanSubject) return cleanSubject;

  const cleanTitle = String(title || "").trim();
  const cleanReference = String(reference || "").trim();
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

function isKbLesVerified(app) {
  const status = String(getApplicationSection(app, "kb_les_verification")?.status || "")
    .trim()
    .toLowerCase();
  return status === "verified";
}

function hasManagementSupport(app) {
  const status = String(getApplicationSection(app, "management_recommendation")?.status || "")
    .trim()
    .toLowerCase();
  return status === "supported" || status === "completed";
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
      titleEn: "Application ready for TP(RES)/PGH support",
      titleMs: "Permohonan sedia untuk sokongan TP(RES)/PGH",
      messageEn: `${reference} is ready for TP(RES)/PGH support.`,
      messageMs: `${reference} sedia untuk sokongan TP(RES)/PGH.`,
    };
  }

  return {
    displayStatus: "management_review",
    titleEn: "Application ready for KB(LES) verification",
    titleMs: "Permohonan sedia untuk verifikasi KB(LES)",
    messageEn: `${reference} is ready for KB(LES) verification.`,
    messageMs: `${reference} sedia untuk verifikasi KB(LES).`,
  };
}

function isAdminNotificationAllowedForUser(status, user, app = null) {
  const department = getUserDepartment(user);
  const normalizedStatus = normalizeStatus(status);

  if (normalizedStatus === "submitted") {
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

  if (adminTechnicalTaskStatuses.has(normalizedStatus)) {
    if (normalizedStatus === "technical_amendment") {
      return department === "PT(IKL)";
    }

    if (normalizedStatus === "technical_review_completed") {
      return department === "KU(IKL)";
    }

    if (department === "IKL (TECHNICAL)") {
      return ["technical_review", "technical_site_visit"].includes(normalizedStatus);
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
    message: messageEn,
    messageEn,
    messageMs,
    body: messageEn,
    bodyEn: messageEn,
    bodyMs: messageMs,
    from: "ALiS Notification Center",
    to: getUserDisplayName(user),
    subject: getMemoSubject("", titleEn, reference),
    time: formatDate(updatedAt),
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
        "Application submitted",
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
        amendmentTask ? "PT(IKL) amendment required" : `${department} technical task assigned`,
        amendmentTask ? "Pindaan PT(IKL) diperlukan" : `Tugasan teknikal ${department} diberikan`,
        amendmentTask
          ? `${reference} requires PT(IKL) amendment before KU(IKL) can continue.`
          : `${reference} is ready for ${department} site review.`,
        amendmentTask
          ? `${reference} memerlukan pindaan PT(IKL) sebelum KU(IKL) boleh meneruskan.`
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
      if (!allowedStatuses.has(eventStatus)) return false;
      if (role === "admin") {
        return isAdminNotificationAllowedForUser(eventStatus, user, {
          technical_department_reviews: delivery.technical_department_reviews,
          kb_les_verification: delivery.kb_les_verification,
          management_recommendation: delivery.management_recommendation,
        });
      }
      return true;
    })
    .map((delivery) => {
      const metadata = delivery.metadata || {};
      const category = metadata.category || "progress";
      const type = metadata.type || "info";
      const status = normalizeStatus(metadata.event_status || delivery.status);
      const deliveryApp = {
        id: delivery.application_id,
        reference_no: delivery.reference_no,
        status,
        kb_les_verification: delivery.kb_les_verification,
        management_recommendation: delivery.management_recommendation,
      };
      const approvalText =
        role === "admin" && status === "management_review"
          ? getApprovalStageNotificationText(deliveryApp, user)
          : null;
      const displayStatus = getNotificationDisplayStatus(role, status, user, deliveryApp);
      const title = approvalText?.titleEn || normalizeApplicantNotificationText(
        metadata.title_en || metadata.title || getTitleFromSubject(delivery.subject),
        role,
        status
      );
      const message = approvalText?.messageEn || normalizeApplicantNotificationText(
        metadata.message_en || metadata.message || getMessageSummary(delivery.message),
        role,
        status
      );
      const titleMs = approvalText?.titleMs || normalizeApplicantNotificationText(metadata.title_ms || title, role, status);
      const messageMs = approvalText?.messageMs || normalizeApplicantNotificationText(metadata.message_ms || message, role, status);
      const timestamp = delivery.created_at || delivery.application_updated_at || new Date().toISOString();
      const recipientName = String(delivery.recipient_name || "").trim();
      const recipientDepartment = normalizeDepartment(delivery.recipient_department);
      const to = recipientName || recipientDepartment || getUserDisplayName(user);

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
        message,
        messageEn: message,
        titleMs,
        messageMs,
        body: message,
        bodyEn: message,
        bodyMs: messageMs,
        from: "ALiS Notification Center",
        to,
        subject: getMemoSubject(delivery.subject, title, delivery.reference_no || metadata.account_username),
        time: formatDate(timestamp),
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
