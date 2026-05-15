import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AppShell from "../../layout/AppShell";
import AdminDashboardLayout from "../../layout/AdminDashboardLayout";
import UserDashboardLayout from "../../layout/UserDashboardLayout";
import { useLanguage } from "../../context/LanguageContext";
import { useNotifications } from "../../context/NotificationContext";
import {
  Alert,
  PageHeader,
  StatusPill,
} from "../../components/ui/SystemUI";
import { isAdminUser, isSuperAdminUser, getStoredUser } from "../../services/api";
import { formatDate } from "../../utils/workflow";

const filters = [
  { value: "all", labelKey: "notifications.filter.all", fallback: "All" },
  { value: "unread", labelKey: "notifications.filter.unread", fallback: "Unread" },
  { value: "account", labelKey: "notifications.filter.account", fallback: "Account" },
  { value: "submission", labelKey: "notifications.filter.submission", fallback: "Submission" },
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
    unreadCount,
    loading,
    error,
    lastSyncedAt,
  } = useNotifications();
  const { language, t } = useLanguage();
  const [filter, setFilter] = useState("all");
  const storedUser = getStoredUser();
  const Layout = isSuperAdminUser(storedUser)
    ? SuperAdminNotificationsLayout
    : isAdminUser(storedUser)
      ? AdminDashboardLayout
      : UserDashboardLayout;

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

  const filterCounts = useMemo(() => {
    return activeFilters.reduce((counts, item) => {
      if (item.value === "all") {
        counts[item.value] = notifications.length;
      } else if (item.value === "unread") {
        counts[item.value] = unreadCount;
      } else {
        counts[item.value] = notifications.filter(
          (notification) => notification.category === item.value
        ).length;
      }

      return counts;
    }, {});
  }, [activeFilters, notifications, unreadCount]);

  const activeFilterLabel =
    activeFilters.find((item) => item.value === filter) || activeFilters[0];

  return (
    <Layout>
      <PageHeader
        eyebrow={t("notifications.eyebrow", "Live Notification Center")}
        title={t("notifications.title", "Notifications")}
        description={t(
          "notifications.description",
          "Live alerts generated from application status, workflow decisions, payment, and QR e-license records."
        )}
      />

      <Alert message={error} />

      <section className="overflow-hidden rounded-md border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950">
              {t("notifications.inbox", "Inbox")}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {lastSyncedAt
                ? `${t("notifications.lastSynced", "Last synced")}: ${formatDate(lastSyncedAt)}`
                : t("notifications.waitingForSync", "Waiting for live sync.")}
            </p>
          </div>

          <div className="text-xs font-semibold text-slate-500">
            {filtered.length} {t("notifications.records", "record(s)")}
          </div>
        </div>

        <div className="grid min-h-[520px] lg:grid-cols-[230px_1fr]">
          <aside className="border-b border-slate-200 bg-slate-50/80 p-3 lg:border-b-0 lg:border-r">
            <nav className="space-y-1" aria-label={t("notifications.inbox", "Inbox")}>
              {activeFilters.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFilter(item.value)}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-semibold transition ${
                    filter === item.value
                      ? "bg-emerald-700 text-white"
                      : "text-slate-600 hover:bg-white hover:text-slate-950"
                  }`}
                >
                  <span>{t(item.labelKey, item.fallback)}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] ${
                      filter === item.value
                        ? "bg-white/20 text-white"
                        : "bg-white text-slate-500"
                    }`}
                  >
                    {filterCounts[item.value] || 0}
                  </span>
                </button>
              ))}
            </nav>
          </aside>

          <div className="min-w-0">
            <div className="flex flex-col gap-2 border-b border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {t(activeFilterLabel.labelKey, activeFilterLabel.fallback)}
                </p>
                <p className="text-xs text-slate-500">
                  {unreadCount} {t("notifications.unread", "Unread")}
                </p>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="flex min-h-[380px] items-center justify-center px-6 text-center">
                <div className="max-w-md">
                  <span className="material-symbols-outlined text-[44px] text-slate-300">
                    mark_email_unread
                  </span>
                  <h3 className="mt-3 text-base font-semibold text-slate-950">
                    {loading ? t("common.loading", "Loading...") : t("common.noNotifications", "No notifications")}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    {t(
                      "notifications.emptyDescription",
                      "Notifications will appear here when an application needs action or changes status."
                    )}
                  </p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {filtered.map((item) => {
                  const style = typeStyles[item.type] || typeStyles.info;

                  return (
                    <article
                      key={item.id}
                      className={`group grid gap-3 border-l-4 px-4 py-3 transition hover:bg-slate-50 xl:grid-cols-[1fr_auto] ${
                        item.read
                          ? "border-l-transparent bg-white"
                          : "border-l-emerald-600 bg-emerald-50/40"
                      }`}
                    >
                      <div className="flex min-w-0 gap-3">
                        <span className={`material-symbols-outlined mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-[20px] ${style.className}`}>
                          {style.icon}
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 flex-col gap-1 md:flex-row md:items-baseline md:justify-between">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              {!item.read && (
                                <span className="h-2 w-2 rounded-full bg-emerald-600" />
                              )}
                              <h3
                                className={`truncate text-sm ${
                                  item.read
                                    ? "font-semibold text-slate-800"
                                    : "font-bold text-slate-950"
                                }`}
                              >
                                {getLocalized(item, "title", language)}
                              </h3>
                              <StatusPill value={t(`status.${item.status}`, item.statusLabel)} />
                            </div>
                            <time className="shrink-0 text-xs text-slate-500">
                              {item.time}
                            </time>
                          </div>

                          <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-600">
                            {getLocalized(item, "message", language)}
                          </p>

                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                            <span className="font-semibold text-slate-600">{item.reference}</span>
                            <span>{item.project}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-start xl:self-center xl:justify-end">
                        {!item.read && (
                          <button
                            type="button"
                            onClick={() => markAsRead(item.id)}
                            className="inline-flex min-h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                          >
                            {t("notifications.markRead", "Mark Read")}
                          </button>
                        )}
                        <Link
                          to={item.actionUrl}
                          onClick={() => markAsRead(item.id)}
                          className="inline-flex min-h-10 min-w-[112px] items-center justify-center gap-2 rounded-md border border-emerald-700 bg-emerald-700 px-3.5 py-2 text-sm font-semibold !text-white shadow-sm transition hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600/25"
                        >
                          <span className="material-symbols-outlined text-[18px] !text-white">
                            visibility
                          </span>
                          <span className="!text-white">
                            {t("notifications.openRecord", "View")}
                          </span>
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>
    </Layout>
  );
}

function SuperAdminNotificationsLayout({ children }) {
  return <AppShell role="superadmin">{children}</AppShell>;
}

export default NotificationsPage;
