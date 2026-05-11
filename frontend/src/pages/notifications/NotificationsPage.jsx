import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AdminDashboardLayout from "../../layout/AdminDashboardLayout";
import UserDashboardLayout from "../../layout/UserDashboardLayout";
import { useLanguage } from "../../context/LanguageContext";
import { useNotifications } from "../../context/NotificationContext";
import {
  Alert,
  Button,
  EmptyState,
  PageHeader,
  Panel,
  StatCard,
  StatusPill,
} from "../../components/ui/SystemUI";
import { isAdminUser, getStoredUser } from "../../services/api";
import { formatDate } from "../../utils/workflow";

const filters = [
  { value: "all", labelKey: "notifications.filter.all", fallback: "All" },
  { value: "unread", labelKey: "notifications.filter.unread", fallback: "Unread" },
  { value: "screening", labelKey: "notifications.filter.screening", fallback: "Screening" },
  { value: "technical", labelKey: "notifications.filter.technical", fallback: "Technical" },
  { value: "approval", labelKey: "notifications.filter.approval", fallback: "Approval" },
  { value: "payment", labelKey: "notifications.filter.payment", fallback: "Payment" },
  { value: "license", labelKey: "notifications.filter.license", fallback: "License" },
  { value: "correction", labelKey: "notifications.filter.correction", fallback: "Correction" },
  { value: "decision", labelKey: "notifications.filter.decision", fallback: "Decision" },
  { value: "progress", labelKey: "notifications.filter.progress", fallback: "Progress" },
];

const typeStyles = {
  success: {
    icon: "task_alt",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  warning: {
    icon: "priority_high",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  error: {
    icon: "error",
    className: "border-red-200 bg-red-50 text-red-700",
  },
  info: {
    icon: "notifications_active",
    className: "border-blue-200 bg-blue-50 text-blue-700",
  },
};

function getLocalized(item, field, language) {
  if (language === "ms") return item[`${field}Ms`] || item[field] || "";
  return item[`${field}En`] || item[field] || "";
}

function NotificationsPage() {
  const {
    notifications,
    markAsRead,
    markAllAsRead,
    refreshNotifications,
    unreadCount,
    loading,
    error,
    lastSyncedAt,
  } = useNotifications();
  const { language, t } = useLanguage();
  const [filter, setFilter] = useState("all");
  const Layout = isAdminUser(getStoredUser()) ? AdminDashboardLayout : UserDashboardLayout;

  const activeFilters = useMemo(() => {
    const categories = new Set(notifications.map((item) => item.category));
    return filters.filter((item) => item.value === "all" || item.value === "unread" || categories.has(item.value));
  }, [notifications]);

  const filtered = useMemo(() => {
    return notifications.filter((item) => {
      if (filter === "all") return true;
      if (filter === "unread") return !item.read;
      return item.category === filter;
    });
  }, [filter, notifications]);

  const totals = useMemo(() => {
    return {
      action: notifications.filter((item) => ["warning", "error"].includes(item.type)).length,
      payment: notifications.filter((item) => item.category === "payment").length,
      license: notifications.filter((item) => item.category === "license").length,
    };
  }, [notifications]);

  return (
    <Layout>
      <PageHeader
        eyebrow={t("notifications.eyebrow", "Live Notification Center")}
        title={t("notifications.title", "Notifications")}
        description={t(
          "notifications.description",
          "Live alerts generated from application status, workflow decisions, payment, and QR e-license records."
        )}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={refreshNotifications} icon="sync" disabled={loading}>
              {loading ? t("common.loading", "Loading...") : t("notifications.refresh", "Refresh")}
            </Button>
            <Button onClick={markAllAsRead} icon="done_all" disabled={notifications.length === 0}>
              {t("common.markAllRead", "Mark all as read")}
            </Button>
          </div>
        }
      />

      <Alert message={error} />

      <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("workspace.stat.total", "Total")} value={notifications.length} icon="notifications" />
        <StatCard label={t("notifications.unread", "Unread")} value={unreadCount} icon="mark_email_unread" tone="amber" />
        <StatCard label={t("notifications.actionRequired", "Action Required")} value={totals.action} icon="priority_high" tone="red" />
        <StatCard label={t("notifications.licensePayment", "Payment / License")} value={totals.payment + totals.license} icon="qr_code_2" tone="blue" />
      </section>

      <Panel
        title={t("notifications.inbox", "Inbox")}
        description={
          lastSyncedAt
            ? `${t("notifications.lastSynced", "Last synced")}: ${formatDate(lastSyncedAt)}`
            : t("notifications.waitingForSync", "Waiting for live sync.")
        }
        className="mb-5"
      >
        <div className="flex flex-wrap gap-2">
          {activeFilters.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setFilter(item.value)}
              className={`rounded-md border px-3 py-2 text-xs font-semibold ${
                filter === item.value
                  ? "border-emerald-700 bg-emerald-700 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800"
              }`}
            >
              {t(item.labelKey, item.fallback)}
            </button>
          ))}
        </div>
      </Panel>

      <Panel
        title={t("notifications.liveInbox", "Live Inbox")}
        description={`${filtered.length} ${t("notifications.records", "record(s)")}`}
      >
        {filtered.length === 0 ? (
          <EmptyState
            icon="notifications_off"
            title={loading ? t("common.loading", "Loading...") : t("common.noNotifications", "No notifications")}
            description={t(
              "notifications.emptyDescription",
              "Notifications will appear here when an application needs action or changes status."
            )}
          />
        ) : (
          <div className="space-y-3">
            {filtered.map((item) => {
              const style = typeStyles[item.type] || typeStyles.info;

              return (
                <article
                  key={item.id}
                  className={`rounded-md border p-3 transition ${
                    item.read
                      ? "border-slate-200 bg-white"
                      : "border-emerald-200 bg-emerald-50/50"
                  }`}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <span className={`material-symbols-outlined flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-[20px] ${style.className}`}>
                        {style.icon}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-sm font-semibold text-slate-950">
                            {getLocalized(item, "title", language)}
                          </h2>
                          {!item.read && <StatusPill value={t("common.new", "New")} />}
                          <StatusPill value={t(`status.${item.status}`, item.statusLabel)} />
                        </div>
                        <p className="mt-1 text-sm leading-5 text-slate-600">
                          {getLocalized(item, "message", language)}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                          <span>{item.reference}</span>
                          <span>{item.project}</span>
                          <span>{item.time}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      {!item.read && (
                        <Button variant="secondary" onClick={() => markAsRead(item.id)}>
                          {t("notifications.markRead", "Mark Read")}
                        </Button>
                      )}
                      <Link
                        to={item.actionUrl}
                        onClick={() => markAsRead(item.id)}
                        className="inline-flex min-h-9 items-center justify-center rounded-md border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800"
                      >
                        {t("notifications.openRecord", "Open Record")}
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Panel>
    </Layout>
  );
}

export default NotificationsPage;
