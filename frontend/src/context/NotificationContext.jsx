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
const POLL_INTERVAL_MS = 15000;

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
  return (
    form.correction_request?.remarks ||
    form.auto_screening?.remarks ||
    form.technical_review?.comment ||
    form.approval?.notes ||
    form.payment?.receipt_reference ||
    ""
  );
}

function getNotificationUrl(role, app, category) {
  if (role === "applicant") {
    if (category === "payment") return "/user/dashboard";
    if (category === "license") return "/user/dashboard";
    return `/applications/${app.id}/edit`;
  }

  if (category === "screening") return "/admin/auto-screening";
  if (category === "technical") return "/admin/technical-review";
  if (category === "approval") return "/admin/approval";
  if (category === "payment") return "/admin/payment";
  if (category === "license") return "/admin/license-qr";
  return `/admin/applications/${app.id}`;
}

function buildBaseNotification(app, role, category, type, titleEn, titleMs, messageEn, messageMs) {
  const status = normalizeStatus(app.status);
  const reference = getApplicationReference(app);
  const updatedAt = app.updated_at || app.created_at || new Date().toISOString();

  return {
    id: `${role}:${app.id}:${status}:${category}:${updatedAt}`,
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
  const project = getProjectName(app);
  const remark = getLatestRemark(app);
  const notifications = [];

  if (status === "incomplete") {
    notifications.push(
      buildBaseNotification(
        app,
        "applicant",
        "correction",
        "error",
        "Correction required",
        "Pembetulan diperlukan",
        `${reference} was returned for correction${remark ? `: ${remark}` : "."}`,
        `${reference} dikembalikan untuk pembetulan${remark ? `: ${remark}` : "."}`
      )
    );
  }

  if (["submitted", "ku_ikl_review", "technical_review", "technical_site_visit", "technical_review_completed", "management_review", "mphlg_processing", "mphlg_decision_received"].includes(status)) {
    notifications.push(
      buildBaseNotification(
        app,
        "applicant",
        "progress",
        "info",
        "Application is being processed",
        "Permohonan sedang diproses",
        `${reference} is now at ${formatWorkflowStatus(status)} for ${project}.`,
        `${reference} kini berada pada fasa ${formatWorkflowStatus(status)} untuk ${project}.`
      )
    );
  }

  if (["approved", "approved_with_conditions"].includes(status)) {
    notifications.push(
      buildBaseNotification(
        app,
        "applicant",
        "decision",
        "success",
        "Application approved",
        "Permohonan diluluskan",
        `${reference} has been ${formatWorkflowStatus(status).toLowerCase()}${remark ? `: ${remark}` : "."}`,
        `${reference} telah ${status === "approved" ? "diluluskan" : "diluluskan dengan syarat"}${remark ? `: ${remark}` : "."}`
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
        "Payment is required",
        "Bayaran diperlukan",
        `${reference} has an invoice ready. Please complete payment and upload proof.`,
        `${reference} mempunyai bil yang sedia. Sila buat bayaran dan muat naik bukti.`
      )
    );
  }

  if (status === "payment_verified") {
    notifications.push(
      buildBaseNotification(
        app,
        "applicant",
        "payment",
        "success",
        "Payment verified",
        "Bayaran disahkan",
        `${reference} payment has been verified by DBKU.`,
        `Bayaran ${reference} telah disahkan oleh DBKU.`
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
        "QR e-license is ready",
        "E-lesen QR sedia",
        `${reference} e-license is ready to download and display at the premise.`,
        `E-lesen ${reference} sedia dimuat turun dan dipamerkan di premis.`
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
        "New application requires PT(IKL) screening",
        "Permohonan baharu perlu semakan PT(IKL)",
        `${reference} (${type}) was submitted for ${project} at ${location}.`,
        `${reference} (${type}) telah dihantar untuk ${project} di ${location}.`
      )
    );
  }

  if (status === "ku_ikl_review") {
    notifications.push(
      buildBaseNotification(
        app,
        "admin",
        "screening",
        "warning",
        "KU(IKL) second verification required",
        "Verifikasi kedua KU(IKL) diperlukan",
        `${reference} passed PT(IKL) screening and is waiting for KU(IKL).`,
        `${reference} telah lulus semakan PT(IKL) dan menunggu KU(IKL).`
      )
    );
  }

  if (["technical_review", "technical_site_visit"].includes(status)) {
    notifications.push(
      buildBaseNotification(
        app,
        "admin",
        "technical",
        "info",
        "Technical site review required",
        "Semakan teknikal tapak diperlukan",
        `${reference} is ready for site visit, site photo, fee/deposit calculation, and technical remarks.`,
        `${reference} sedia untuk lawatan tapak, gambar tapak, kiraan caj/deposit dan catatan teknikal.`
      )
    );
  }

  if (status === "technical_review_completed") {
    notifications.push(
      buildBaseNotification(
        app,
        "admin",
        "approval",
        "success",
        "Technical review completed",
        "Semakan teknikal selesai",
        `${reference} is ready for KU(IKL), KB(LES), TP/PGH, and MPHLG approval flow.`,
        `${reference} sedia untuk aliran kelulusan KU(IKL), KB(LES), TP/PGH dan MPHLG.`
      )
    );
  }

  if (["management_review", "mphlg_processing", "mphlg_decision_received"].includes(status)) {
    notifications.push(
      buildBaseNotification(
        app,
        "admin",
        "approval",
        "info",
        "Management or MPHLG action required",
        "Tindakan pengurusan atau MPHLG diperlukan",
        `${reference} is at ${formatWorkflowStatus(status)}.`,
        `${reference} berada pada fasa ${formatWorkflowStatus(status)}.`
      )
    );
  }

  if (["approved", "approved_with_conditions"].includes(status)) {
    notifications.push(
      buildBaseNotification(
        app,
        "admin",
        "payment",
        "success",
        "Generate approval letter and bill",
        "Jana surat kelulusan dan bil",
        `${reference} was approved. PT(IKL) can generate the approval letter and invoice.`,
        `${reference} telah diluluskan. PT(IKL) boleh jana surat kelulusan dan bil.`
      )
    );
  }

  if (status === "payment_submitted") {
    notifications.push(
      buildBaseNotification(
        app,
        "admin",
        "payment",
        "warning",
        "Payment proof requires verification",
        "Bukti bayaran perlu pengesahan",
        `${reference} payment proof was submitted and is waiting for DBKU verification.`,
        `Bukti bayaran ${reference} telah dihantar dan menunggu pengesahan DBKU.`
      )
    );
  }

  if (status === "payment_verified") {
    notifications.push(
      buildBaseNotification(
        app,
        "admin",
        "license",
        "success",
        "Generate QR e-license",
        "Jana e-lesen QR",
        `${reference} payment is verified. PT(IKL) can generate the QR e-license.`,
        `Bayaran ${reference} telah disahkan. PT(IKL) boleh jana e-lesen QR.`
      )
    );
  }

  if (status === "license_issued") {
    const expiryDate = app.form_data?.license?.expiry_date;
    notifications.push(
      buildBaseNotification(
        app,
        "admin",
        "license",
        "success",
        "License issued",
        "Lesen dijana",
        `${reference} QR e-license has been issued${expiryDate ? ` and expires on ${formatDate(expiryDate)}` : "."}`,
        `E-lesen QR ${reference} telah dijana${expiryDate ? ` dan tamat pada ${formatDate(expiryDate)}` : "."}`
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
      const data = await apiRequest("/applications/");
      const list = Array.isArray(data) ? data : data?.results || [];
      const detailList = await Promise.all(
        list.map(async (app) => {
          try {
            return await apiRequest(`/applications/${app.id}/`);
          } catch {
            return app;
          }
        })
      );
      setNotifications(buildNotifications(detailList, user));
      setLastSyncedAt(new Date().toISOString());
    } catch (err) {
      setError(err.message || "Unable to load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshNotifications();
    const intervalId = window.setInterval(refreshNotifications, POLL_INTERVAL_MS);
    const handleRefresh = () => refreshNotifications();

    window.addEventListener("focus", handleRefresh);
    window.addEventListener("fastrack:auth-changed", handleRefresh);
    window.addEventListener("fastrack:applications-changed", handleRefresh);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleRefresh);
      window.removeEventListener("fastrack:auth-changed", handleRefresh);
      window.removeEventListener("fastrack:applications-changed", handleRefresh);
    };
  }, [refreshNotifications]);

  function markAsRead(id) {
    setReadIds((prev) => {
      const next = [...new Set([...prev, id])];
      saveStoredIds(next);
      return next;
    });
  }

  function markAllAsRead() {
    setReadIds((prev) => {
      const next = [...new Set([...prev, ...notifications.map((item) => item.id)])];
      saveStoredIds(next);
      return next;
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
