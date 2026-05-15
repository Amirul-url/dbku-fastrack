import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  apiRequest,
  getNormalizedRole,
  getStoredUser,
  isAdminUser,
  isApplicantUser,
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
const adminNotificationStatuses = new Set(["submitted"]);

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

function getNotificationUrl(role, app, category) {
  if (role === "applicant") {
    if (category === "payment") return "/user/dashboard";
    if (category === "license") return "/user/dashboard";
    return `/applications/${app.id}/edit`;
  }

  return getAdminApplicationViewUrl(app);
}

function buildBaseNotification(app, role, category, type, titleEn, titleMs, messageEn, messageMs) {
  const status = normalizeStatus(app.status);
  const reference = getApplicationReference(app);
  const updatedAt = app.updated_at || app.created_at || new Date().toISOString();
  const remark = getLatestRemark(app);
  const remarkKey = remark ? `:${remark}` : "";

  return {
    id: `${role}:${app.id}:${status}:${category}:${updatedAt}${remarkKey}`,
    appId: app.id,
    reference,
    project: getProjectName(app),
    status,
    statusLabel: formatWorkflowStatus(status),
    category,
    type,
    title: titleEn,
    titleEn,
    titleMs,
    message: messageEn,
    messageEn,
    messageMs,
    time: formatDate(updatedAt),
    timestamp: updatedAt,
    actionUrl: getNotificationUrl(role, app, category),
  };
}

function buildApplicantNotifications(app) {
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
        `${reference} telah berjaya dihantar.`
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
        "Application returned",
        "Permohonan dikembalikan",
        `${reference} was returned by ALiS${remark ? `: ${remark}` : "."}`,
        `${reference} telah dikembalikan oleh ALiS${remark ? `: ${remark}` : "."}`
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
        `${reference} telah ditolak${remark ? `: ${remark}` : "."}`
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
        `${reference} mempunyai bil yang sedia. Sila muat naik bukti bayaran anda.`
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
        `E-lesen QR ${reference} telah berjaya dijana.`
      )
    );
  }

  return notifications;
}

function buildAdminNotifications(app) {
  const status = normalizeStatus(app.status);
  const reference = getApplicationReference(app);
  const project = getProjectName(app);
  const location = getApplicationLocation(app);
  const type = getApplicationType(app);
  const notifications = [];

  if (status === "submitted") {
    notifications.push(
      buildBaseNotification(
        app,
        "admin",
        "screening",
        "warning",
        "New IKL application submitted",
        "Permohonan IKL baharu telah dihantar",
        `${reference} (${type}) was submitted for ${project} at ${location}.`,
        `${reference} (${type}) telah dihantar untuk ${project} di ${location}.`
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
    .flatMap(builder)
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

function buildNotificationsFromDeliveries(deliveries, user) {
  const role = getNormalizedRole(user);
  const allowedStatuses =
    role === "admin" ? adminNotificationStatuses : applicantNotificationStatuses;

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
      const title = metadata.title_en || metadata.title || getTitleFromSubject(delivery.subject);
      const message = metadata.message_en || metadata.message || getMessageSummary(delivery.message);
      const status = normalizeStatus(metadata.event_status || delivery.status);
      const timestamp = delivery.created_at || delivery.application_updated_at || new Date().toISOString();

      return {
        id: `web:${delivery.id}`,
        serverId: delivery.id,
        appId: delivery.application_id,
        reference: delivery.reference_no || "-",
        project: delivery.project || "-",
        status,
        statusLabel: formatWorkflowStatus(status),
        category,
        type,
        title,
        titleEn: title,
        titleMs: metadata.title_ms || title,
        message,
        messageEn: message,
        messageMs: metadata.message_ms || message,
        time: formatDate(timestamp),
        timestamp,
        actionUrl: getNotificationUrl(role, { id: delivery.application_id }, category),
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

    if (!token || (!isAdminUser(user) && !isApplicantUser(user))) {
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
      if (deliveryNotifications.length > 0) {
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
      read: readSet.has(item.id),
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
