import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import AdminDashboardLayout from "../../layout/AdminDashboardLayout";
import ApprovalPage from "../admin/approval/ApprovalPage";
import { useLanguage } from "../../context/LanguageContext";
import { apiRequest, fetchApplicationList, getStoredUser } from "../../services/api";
import { enrichApplicationListApplicantNames } from "../../utils/applicationList";
import {
  Alert,
  Button,
  DataTable,
  Icon,
  Panel,
  StatusPill,
} from "../../components/ui/SystemUI";
import {
  formatCompactDateTime,
  formatWorkflowStatus,
  getApplicationReference,
  getProjectName,
  normalizeStatus,
} from "../../utils/workflow";

const TECHNICAL_DEPARTMENT_TASK_STATUSES = [
  "technical_review",
  "technical_site_visit",
];
const TECHNICAL_DEPARTMENT_STATUS_SET = new Set([
  ...TECHNICAL_DEPARTMENT_TASK_STATUSES,
  "technical_review_completed",
]);
const IKL_DEPARTMENTS = new Set(["PT(IKL)", "KU(IKL)", "IKL (TECHNICAL)"]);
const EXTERNAL_TECHNICAL_DEPARTMENTS = new Set(["BLG", "GPM", "MNE", "IMT", "LNP", "ENG"]);
const APPROVAL_SUPPORT_DEPARTMENTS = new Set(["TP(RES)", "PGH", "TP(RES)/PGH", "TP/PGH"]);
const APPROVAL_WORKFLOW_DEPARTMENTS = new Set([
  "KB(LES)",
  ...APPROVAL_SUPPORT_DEPARTMENTS,
  "MPHLG",
]);
const IKL_HISTORY_STATUSES = [
  "submitted",
  "incomplete",
  "ku_ikl_review",
  "technical_review",
  "technical_site_visit",
  "technical_amendment",
  "technical_review_completed",
  "mphlg_decision_received",
  "management_review",
  "mphlg_processing",
  "approved",
  "approved_with_conditions",
  "rejected",
  "bill_pending_ku",
  "invoice_generated",
  "payment_submitted",
  "payment_verified",
  "license_issued",
  "license_revoked",
];
const KU_IKL_RECENT_ACTIVITY_STATUSES = new Set([
  "submitted",
  "ku_ikl_review",
  "technical_review_completed",
  "bill_pending_ku",
  "rejected",
]);
const RECENT_ACTIVITY_PAGE_SIZE = 5;
const TASK_TABLE_PAGE_SIZE = 5;
const units = [
  {
    code: "PT(IKL)",
    department: "PT(IKL)",
    title: "PT(IKL)",
    descriptionKey: "admin.unit.ptIkl.desc",
    icon: "description",
    color: "bg-cyan-700",
    statuses: [
      "incomplete",
      "approved",
      "bill_pending_ku",
      "payment_submitted",
      "payment_verified",
    ],
    historyStatuses: IKL_HISTORY_STATUSES,
    path: "/admin/auto-screening",
  },
  {
    code: "KU(IKL)",
    department: "KU(IKL)",
    title: "KU(IKL)",
    descriptionKey: "admin.unit.kuIkl.desc",
    icon: "verified_user",
    color: "bg-indigo-700",
    statuses: ["submitted", "ku_ikl_review", "technical_review_completed"],
    historyStatuses: IKL_HISTORY_STATUSES,
    path: "/admin/auto-screening",
  },
  {
    code: "IKL (TECHNICAL)",
    department: "IKL (TECHNICAL)",
    title: "IKL Technical",
    descriptionKey: "admin.unit.iklTechnical.desc",
    icon: "engineering",
    color: "bg-cyan-600",
    statuses: ["technical_site_visit", "technical_amendment"],
    historyStatuses: IKL_HISTORY_STATUSES.filter((status) =>
      !["submitted", "incomplete", "ku_ikl_review"].includes(status)
    ),
    path: "/admin/auto-screening",
  },
  {
    code: "BLG",
    department: "BLG",
    title: "BLG",
    descriptionKey: "admin.unit.blg.desc",
    icon: "edit_square",
    color: "bg-emerald-600",
    statuses: TECHNICAL_DEPARTMENT_TASK_STATUSES,
    historyStatuses: IKL_HISTORY_STATUSES,
    path: "/admin/technical-review",
  },
  {
    code: "GPM",
    department: "GPM",
    title: "GPM",
    descriptionKey: "admin.unit.gpm.desc",
    icon: "payments",
    color: "bg-blue-600",
    statuses: TECHNICAL_DEPARTMENT_TASK_STATUSES,
    historyStatuses: IKL_HISTORY_STATUSES,
    path: "/admin/technical-review",
  },
  {
    code: "MNE",
    department: "MNE",
    title: "MNE",
    descriptionKey: "admin.unit.mne.desc",
    icon: "account_balance",
    color: "bg-sky-600",
    statuses: TECHNICAL_DEPARTMENT_TASK_STATUSES,
    historyStatuses: IKL_HISTORY_STATUSES,
    path: "/admin/technical-review",
  },
  {
    code: "IMT",
    department: "IMT",
    title: "IMT",
    descriptionKey: "admin.unit.imt.desc",
    icon: "hub",
    color: "bg-yellow-400",
    iconClassName: "text-slate-900",
    statuses: TECHNICAL_DEPARTMENT_TASK_STATUSES,
    historyStatuses: IKL_HISTORY_STATUSES,
    path: "/admin/technical-review",
  },
  {
    code: "LNP",
    department: "LNP",
    title: "LNP",
    descriptionKey: "admin.unit.lnp.desc",
    icon: "fact_check",
    color: "bg-green-600",
    statuses: TECHNICAL_DEPARTMENT_TASK_STATUSES,
    historyStatuses: IKL_HISTORY_STATUSES,
    path: "/admin/technical-review",
  },
  {
    code: "ENG",
    department: "ENG",
    title: "ENG",
    descriptionKey: "admin.unit.eng.desc",
    icon: "engineering",
    color: "bg-teal-600",
    statuses: TECHNICAL_DEPARTMENT_TASK_STATUSES,
    historyStatuses: IKL_HISTORY_STATUSES,
    path: "/admin/technical-review",
  },
];

function AdminDashboard() {
  const location = useLocation();
  const [currentUser, setCurrentUser] = useState(getStoredUser);
  const view = new URLSearchParams(location.search).get("view") || "dashboard";

  useEffect(() => {
    let active = true;

    apiRequest("/auth/me/")
      .then((data) => {
        if (active && data?.user) setCurrentUser(data.user);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  if (view === "completed") {
    return <ApprovalPage />;
  }

  if (isMphlgUser(currentUser) && view === "approval") {
    return <ApprovalPage />;
  }

  if (view === "approval") {
    return <ApprovalPage />;
  }

  if (view === "personal" && !isMphlgUser(currentUser)) {
    return <PersonalTaskDashboard />;
  }

  if (isMphlgUser(currentUser) && view === "personal") {
    return <MphlgDashboard user={currentUser} />;
  }

  if (view === "dashboard") {
    return <AdminHomeDashboard user={currentUser} />;
  }

  return <PersonalTaskDashboard />;
}

function AdminHomeDashboard({ user }) {
  const { language, t } = useLanguage();
  const userDepartment = normalizeDepartmentCode(user?.department);
  const [applications, setApplications] = useState([]);
  const [activityPage, setActivityPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchApplications = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      setError("");
      const list = await fetchApplicationList();
      const enrichedList = await enrichApplicationListApplicantNames(list, (id) =>
        apiRequest(`/applications/${id}/`)
      );
      setApplications(enrichedList);
    } catch (err) {
      setError(err.message || "Failed to load recent activity.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  useEffect(() => {
    window.addEventListener("fastrack:applications-changed", fetchApplications);
    window.addEventListener("focus", fetchApplications);
    const handleVisibilityChange = () => {
      if (!document.hidden) fetchApplications({ silent: true });
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const interval = window.setInterval(
      () => fetchApplications({ silent: true }),
      5000
    );

    return () => {
      window.removeEventListener("fastrack:applications-changed", fetchApplications);
      window.removeEventListener("focus", fetchApplications);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(interval);
    };
  }, [fetchApplications]);

  const activities = useMemo(() => {
    return buildAdminRecentActivities(applications, userDepartment, t);
  }, [applications, t, userDepartment]);
  const resubmissionInsights = useMemo(() => {
    return buildInternalResubmissionInsights(applications, t, language);
  }, [applications, language, t]);
  const totalActivityPages = Math.max(1, Math.ceil(activities.length / RECENT_ACTIVITY_PAGE_SIZE));
  const currentActivityPage = Math.min(activityPage, totalActivityPages - 1);
  const visibleActivities = activities.slice(
    currentActivityPage * RECENT_ACTIVITY_PAGE_SIZE,
    (currentActivityPage + 1) * RECENT_ACTIVITY_PAGE_SIZE
  );
  const showActivityPagination = activities.length > RECENT_ACTIVITY_PAGE_SIZE;

  return (
    <AdminDashboardLayout>
      <Alert message={error} />

      <InternalResubmissionMonitor
        insights={resubmissionInsights}
        loading={loading}
        t={t}
      />

      <section className="rounded-md border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-950">
            {t("admin.dashboard.recentActivitiesTitle", "Recent Activities")}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {t("admin.dashboard.recentActivitiesDesc", "Latest application updates for your unit.")}
          </p>
        </div>

        <div className="divide-y divide-slate-100">
          {loading ? (
            <p className="px-4 py-4 text-sm text-slate-500">{t("common.loading", "Loading...")}</p>
          ) : activities.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-500">
              {t("admin.dashboard.noRecentActivities", "No recent activities yet.")}
            </p>
          ) : (
            visibleActivities.map((activity) => (
              <div
                key={`${activity.id}-${activity.createdAt}`}
                className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_160px]"
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-emerald-700">
                      history
                    </span>
                    <p className="truncate text-sm font-semibold text-slate-950">
                      {activity.title}
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    <span className="font-semibold text-slate-700">{activity.reference}</span>
                    {activity.project ? ` - ${activity.project}` : ""}
                  </p>
                  {activity.description && (
                    <p className="mt-1 text-xs text-slate-500">{activity.description}</p>
                  )}
                </div>
                <p className="text-sm text-slate-500 sm:text-right">
                  {formatCompactDateTime(activity.createdAt)}
                </p>
              </div>
            ))
          )}
        </div>

        {!loading && showActivityPagination && (
          <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">
              {t("applicant.recentActivitiesPage", "Page")} {currentActivityPage + 1} {t("common.of", "of")} {totalActivityPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setActivityPage(Math.max(currentActivityPage - 1, 0))}
                disabled={currentActivityPage === 0}
              >
                <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                {t("common.previous", "Previous")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setActivityPage(Math.min(currentActivityPage + 1, totalActivityPages - 1))}
                disabled={currentActivityPage >= totalActivityPages - 1}
              >
                {t("common.next", "Next")}
                <span className="material-symbols-outlined text-[18px]">chevron_right</span>
              </Button>
            </div>
          </div>
        )}
      </section>
    </AdminDashboardLayout>
  );
}

function InternalResubmissionMonitor({ insights, loading, t }) {
  const visibleEntries = insights.entries.slice(0, 5);
  const maxCount = Math.max(
    1,
    ...insights.months.map((month) => Math.max(month.rejected, month.resubmitted))
  );

  return (
    <section className="mb-5 rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">
              {t("admin.dashboard.resubmissionMonitorTitle", "Resubmission Monitor")}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {t(
                "admin.dashboard.resubmissionMonitorDesc",
                "Internal DBKU record of rejected applications and applicant resubmissions."
              )}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-md bg-red-50 px-3 py-2 text-red-700">
              <p className="font-semibold">{t("status.rejected", "Rejected")}</p>
              <p className="mt-1 text-lg font-bold">{loading ? "..." : insights.totalRejected}</p>
            </div>
            <div className="rounded-md bg-blue-50 px-3 py-2 text-blue-700">
              <p className="font-semibold">{t("admin.dashboard.resubmitted", "Resubmitted")}</p>
              <p className="mt-1 text-lg font-bold">{loading ? "..." : insights.totalResubmitted}</p>
            </div>
            <div className="rounded-md bg-slate-100 px-3 py-2 text-slate-700">
              <p className="font-semibold">{t("admin.dashboard.activeRejected", "Active Rejected")}</p>
              <p className="mt-1 text-lg font-bold">{loading ? "..." : insights.activeRejected}</p>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="px-4 py-4 text-sm text-slate-500">{t("common.loading", "Loading...")}</p>
      ) : insights.entries.length === 0 ? (
        <p className="px-4 py-4 text-sm text-slate-500">
          {t("admin.dashboard.noResubmissionLogs", "No rejection or resubmission records yet.")}
        </p>
      ) : (
        <div className="grid gap-5 px-4 py-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-4 text-xs font-semibold text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-red-500" />
                  {t("status.rejected", "Rejected")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-blue-500" />
                  {t("admin.dashboard.resubmitted", "Resubmitted")}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {t("admin.dashboard.lastSixMonths", "Last 6 months")}
              </p>
            </div>
            <div className="mt-4 grid min-h-[170px] grid-cols-6 items-end gap-3 border-b border-l border-slate-200 px-2 pb-2">
              {insights.months.map((month) => (
                <div key={month.key} className="flex min-w-0 flex-col items-center gap-2">
                  <div className="flex h-28 w-full items-end justify-center gap-1">
                    <div
                      className="w-4 rounded-t bg-red-500"
                      title={`${month.label} ${t("status.rejected", "Rejected")}: ${month.rejected}`}
                      style={{ height: month.rejected ? `${Math.max(6, (month.rejected / maxCount) * 112)}px` : "0px" }}
                    />
                    <div
                      className="w-4 rounded-t bg-blue-500"
                      title={`${month.label} ${t("admin.dashboard.resubmitted", "Resubmitted")}: ${month.resubmitted}`}
                      style={{ height: month.resubmitted ? `${Math.max(6, (month.resubmitted / maxCount) * 112)}px` : "0px" }}
                    />
                  </div>
                  <p className="truncate text-xs font-semibold text-slate-500">{month.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-slate-200">
            <div className="border-b border-slate-200 px-4 py-3">
              <p className="text-sm font-semibold text-slate-950">
                {t("admin.dashboard.resubmissionLog", "Recent Log")}
              </p>
            </div>
            <div className="divide-y divide-slate-100">
              {visibleEntries.map((entry) => (
                <div key={`${entry.applicationId}-${entry.type}-${entry.eventDate}`} className="px-4 py-3 text-sm">
                  <div className="flex items-start gap-3">
                    <span className={`mt-1 h-2.5 w-2.5 rounded-full ${entry.type === "rejected" ? "bg-red-500" : "bg-blue-500"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">{entry.reference}</p>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${entry.type === "rejected" ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"}`}>
                          {entry.eventLabel}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 whitespace-pre-line text-slate-600">
                        {entry.project}
                      </p>
                      {entry.remark && (
                        <p className="mt-1 line-clamp-2 text-slate-500">{entry.remark}</p>
                      )}
                      <p className="mt-1 text-xs text-slate-500">
                        {formatCompactDateTime(entry.eventDate)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function MphlgDashboard({ user }) {
  const { t } = useLanguage();
  const department = normalizeDepartmentCode(user?.department) || "MPHLG";

  return (
    <AdminDashboardLayout>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-slate-950">
          {t("mphlg.dashboard.title", `${department} Dashboard`)}
        </h1>
      </div>

      <section className="min-h-[420px] rounded-md border border-slate-200 bg-white" />
    </AdminDashboardLayout>
  );
}

function buildAdminRecentActivities(applications, userDepartment, t) {
  const activities = applications.flatMap((application) => {
    const logActivities = getImportantApplicationActivities(
      application,
      userDepartment,
      t
    );
    const hasCurrentStatusLog = logActivities.some((activity) =>
      isActivityForCurrentStatus(activity, application)
    );
    const statusActivity =
      isRelevantRecentActivity(application, userDepartment) && !hasCurrentStatusLog
        ? [buildStatusRecentActivity(application, userDepartment, t)]
        : [];

    return [...logActivities, ...statusActivity];
  });

  return dedupeRecentActivities(activities).sort((a, b) => {
    const bTime = new Date(b.createdAt || 0).getTime();
    const aTime = new Date(a.createdAt || 0).getTime();
    return bTime - aTime;
  });
}

function buildStatusRecentActivity(application, userDepartment, t) {
  return {
    id: `status-${application.id}-${normalizeStatus(application.status)}`,
    applicationId: application.id,
    reference: getApplicationReference(application),
    project: getProjectName(application),
    title: getAdminActivityTitle(application, userDepartment, t),
    description: getAdminActivityDescription(application, userDepartment, t),
    createdAt: application.updated_at || application.created_at,
    status: normalizeStatus(application.status),
    source: "status",
  };
}

function getImportantApplicationActivities(application, userDepartment, t) {
  return getApplicationActivityLog(application)
    .filter((activity) => isImportantAdminActivity(activity, userDepartment, application))
    .map((activity) => ({
      id: `activity-${application.id}-${activity.created_at || ""}-${activity.title || ""}`,
      applicationId: application.id,
      reference: getApplicationReference(application),
      project: getProjectName(application),
      title: getAdminActivityLogTitle(activity, t),
      description: getAdminActivityLogDescription(activity, application, t),
      createdAt: activity.created_at || application.updated_at || application.created_at,
      status: normalizeStatus(application.status),
      source: "activity",
      rawTitle: activity.title || "",
    }));
}

function getApplicationActivityLog(application) {
  const activityLog = Array.isArray(application.activity_log)
    ? application.activity_log
    : Array.isArray(application.form_data?.activity_log)
    ? application.form_data.activity_log
    : [];

  return activityLog;
}

function buildInternalResubmissionInsights(applications, t, language = "en") {
  const now = new Date();
  const rejectedEntries = applications.flatMap((application) => {
    const activityLog = getApplicationActivityLog(application);
    const rejectedActivities = activityLog
      .filter(isRejectedActivity)
      .map((activity) => ({
        activity,
        createdAt: activity.created_at || application.updated_at || application.created_at,
      }))
      .filter((item) => item.createdAt);

    if (rejectedActivities.length > 0) {
      return rejectedActivities.map(({ activity, createdAt }) => ({
        type: "rejected",
        applicationId: application.id,
        reference: getApplicationReference(application),
        project: getProjectName(application),
        eventDate: createdAt,
        eventLabel: t("status.rejected", "Rejected"),
        remark: getApplicationRemark(application) || activity.description || "",
        sortDate: createdAt,
      }));
    }

    if (!isRejectedApplication(application)) return [];

    const eventDate = application.updated_at || application.created_at;
    return [{
      type: "rejected",
      applicationId: application.id,
      reference: getApplicationReference(application),
      project: getProjectName(application),
      eventDate,
      eventLabel: t("status.rejected", "Rejected"),
      remark: getApplicationRemark(application),
      sortDate: eventDate,
    }];
  });

  const resubmittedEntries = applications.flatMap((application) => {
    return getApplicationActivityLog(application)
      .filter(isResubmissionActivity)
      .map((activity) => {
        const eventDate = activity.created_at || application.updated_at || application.created_at;
        return {
          type: "resubmitted",
          applicationId: application.id,
          reference: getApplicationReference(application),
          project: getProjectName(application),
          eventDate,
          eventLabel: t("admin.dashboard.resubmitted", "Resubmitted"),
          remark: activity.description || "",
          sortDate: eventDate,
        };
      })
      .filter((entry) => entry.eventDate);
  });
  const entries = [...rejectedEntries, ...resubmittedEntries].sort(
    (a, b) => new Date(b.sortDate || 0).getTime() - new Date(a.sortDate || 0).getTime()
  );

  return {
    totalRejected: rejectedEntries.length,
    totalResubmitted: resubmittedEntries.length,
    activeRejected: applications.filter(isRejectedApplication).length,
    months: buildResubmissionMonthlyBuckets(entries, now, language),
    entries,
  };
}

function buildResubmissionMonthlyBuckets(entries, now, language = "en") {
  const locale = language === "ms" ? "ms-MY" : "en-MY";
  const formatter = new Intl.DateTimeFormat(locale, { month: "short" });
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: formatter.format(date),
      rejected: 0,
      resubmitted: 0,
    };
  });
  const monthMap = new Map(months.map((month) => [month.key, month]));

  entries.forEach((entry) => {
    const date = new Date(entry.eventDate || entry.sortDate);
    if (!Number.isFinite(date.getTime())) return;

    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const bucket = monthMap.get(key);
    if (!bucket) return;

    if (entry.type === "rejected") {
      bucket.rejected += 1;
    } else if (entry.type === "resubmitted") {
      bucket.resubmitted += 1;
    }
  });

  return months;
}

function isRejectedActivity(activity) {
  const title = String(activity?.title || "").trim().toLowerCase();
  return title === "application rejected" || title.startsWith("application rejected by");
}

function isResubmissionActivity(activity) {
  return String(activity?.title || "").trim().toLowerCase() === "application resubmitted";
}

function isRejectedApplication(application) {
  return ["incomplete", "rejected"].includes(normalizeStatus(application?.status));
}

function getApplicationRemark(application) {
  if (!isRejectedApplication(application)) return "";

  const formData = application?.form_data || {};
  return cleanRemark(
    formData.correction_request?.remarks ||
      application?.latest_remark ||
      formData.auto_screening?.remarks
  );
}

function cleanRemark(value) {
  const remark = String(value || "").trim();
  return ["", "-", "[]"].includes(remark) ? "" : remark;
}

function isImportantAdminActivity(activity, userDepartment, application = null) {
  const title = String(activity?.title || "").trim().toLowerCase();
  const category = String(activity?.category || "").trim().toLowerCase();
  const actorDepartment = getActivityDepartment(activity);

  if (!title || title.endsWith(" details saved")) return false;
  if (title.includes("uploaded") || title.includes("removed")) return false;

  const important =
    category === "workflow" ||
    title.includes("submitted") ||
    title.includes("resubmitted") ||
    title.includes("review") ||
    title.includes("rejected") ||
    title.includes("approved") ||
    title.includes("bill") ||
    title.includes("payment") ||
    title.includes("license");

  if (!important) return false;

  if (EXTERNAL_TECHNICAL_DEPARTMENTS.has(userDepartment)) {
    return actorDepartment === userDepartment;
  }

  if (userDepartment === "IKL (TECHNICAL)") {
    return actorDepartment === userDepartment;
  }

  if (APPROVAL_WORKFLOW_DEPARTMENTS.has(userDepartment)) {
    return isApprovalActivityForDepartment(activity, userDepartment, application);
  }

  if (userDepartment === "KU(IKL)") {
    return (
      title.includes("submitted") ||
      title.includes("resubmitted") ||
      title.includes("ku(ikl)") ||
      title.includes("technical") ||
      title.includes("rejected") ||
      title.includes("bill")
    );
  }

  return true;
}

function isApprovalActivityForDepartment(activity, userDepartment, application = null) {
  const title = String(activity?.title || "").toLowerCase();
  const description = String(activity?.description || "").toLowerCase();
  const actorDepartment = getActivityDepartment(activity);
  const text = `${title} ${description}`;

  if (actorDepartment === userDepartment) return true;

  if (userDepartment === "KB(LES)") {
    return text.includes("kb(les)");
  }

  if (APPROVAL_SUPPORT_DEPARTMENTS.has(userDepartment)) {
    return (
      APPROVAL_SUPPORT_DEPARTMENTS.has(actorDepartment) ||
      text.includes("tp(res)") ||
      text.includes("tp/pgh") ||
      text.includes("pgh")
    );
  }

  if (userDepartment === "MPHLG") {
    return text.includes("mphlg");
  }

  return isRelevantRecentActivity(application, userDepartment);
}

function getActivityDepartment(activity) {
  const explicitDepartment = normalizeDepartmentCode(activity?.actor_department);
  if (explicitDepartment) return explicitDepartment;

  const text = [
    activity?.title,
    activity?.description,
    activity?.actor,
  ]
    .map((value) => String(value || "").toUpperCase())
    .join(" ");
  const knownDepartments = [
    "IKL (TECHNICAL)",
    "KU(IKL)",
    "PT(IKL)",
    "KB(LES)",
    "TP(RES)",
    "PGH",
    "TP(RES)/PGH",
    "TP/PGH",
    "MPHLG",
    ...EXTERNAL_TECHNICAL_DEPARTMENTS,
  ];

  return knownDepartments.find((department) => text.includes(department)) || "";
}

function getAdminActivityLogTitle(activity, t) {
  const title = String(activity?.title || "").trim();
  const normalized = title.toLowerCase();

  if (normalized === "application submitted") {
    return t("admin.dashboard.activitySubmitted", "Application submitted");
  }

  if (normalized === "application resubmitted") {
    return t("admin.dashboard.activityResubmitted", "Application resubmitted");
  }

  if (normalized.startsWith("application rejected by") || normalized === "application rejected") {
    return t("admin.dashboard.activityRejected", "Application rejected");
  }

  if (normalized === "application sent to ku(ikl)") {
    return t("admin.dashboard.activitySentKu", "Application sent to KU(IKL)");
  }

  if (normalized === "application sent to technical review") {
    return t(
      "admin.dashboard.activitySentTechnical",
      "Application sent to technical review"
    );
  }

  if (normalized === "technical review completed") {
    return t("admin.dashboard.activityTechnicalCompleted", "Technical review completed");
  }

  if (normalized === "technical amendment requested") {
    return t(
      "admin.dashboard.activityTechnicalAmendment",
      "Technical amendment requested"
    );
  }

  if (normalized === "application sent for management review") {
    return t(
      "admin.dashboard.activitySentManagement",
      "Application sent for management review"
    );
  }

  if (normalized === "bill pending ku(ikl) confirmation" || normalized === "bill ready for applicant") {
    return t("admin.dashboard.activityBillPending", "Bill ready for applicant");
  }

  if (normalized === "application approved") {
    return t("admin.dashboard.activityApproved", "Application approved");
  }

  if (normalized === "payment receipt submitted") {
    return t("admin.dashboard.activityPaymentSubmitted", "Payment proof submitted");
  }

  if (normalized === "application reviewed") {
    return t("admin.dashboard.activityReviewed", "Application reviewed");
  }

  return title || t("admin.dashboard.activityUpdated", "Application updated");
}

function getAdminActivityLogDescription(activity, application, t) {
  const reference = getApplicationReference(application);
  const title = String(activity?.title || "").trim().toLowerCase();
  const description = String(activity?.description || "").trim();

  if (title === "application submitted") {
    return t(
      "admin.dashboard.activitySubmittedLogDesc",
      `${reference} was submitted by the applicant.`
    ).replace("{reference}", reference);
  }

  if (title === "application resubmitted") {
    return t(
      "admin.dashboard.activityResubmittedDesc",
      `${reference} was resubmitted by the applicant.`
    ).replace("{reference}", reference);
  }

  if (title.startsWith("application rejected by") || title === "application rejected") {
    return t(
      "admin.dashboard.activityRejectedDesc",
      `${reference} was rejected and returned to the applicant for correction.`
    ).replace("{reference}", reference);
  }

  if (title === "application sent to ku(ikl)") {
    return t(
      "admin.dashboard.activitySubmittedDesc",
      `${reference} is ready for KU(IKL) review.`
    ).replace("{reference}", reference);
  }

  if (title === "application sent to technical review") {
    return t(
      "admin.dashboard.activitySentTechnicalDesc",
      `${reference} was reviewed and sent to technical review.`
    ).replace("{reference}", reference);
  }

  if (title === "technical review completed") {
    return t(
      "admin.dashboard.activityTechnicalCompletedDesc",
      `${reference} completed technical review.`
    ).replace("{reference}", reference);
  }

  if (title === "technical amendment requested") {
    return t(
      "admin.dashboard.activityTechnicalAmendmentDesc",
      `${reference} requires technical amendment.`
    ).replace("{reference}", reference);
  }

  if (title === "application sent for management review") {
    return t(
      "admin.dashboard.activitySentManagementDesc",
      `${reference} was reviewed and sent for management review.`
    ).replace("{reference}", reference);
  }

  if (title === "bill pending ku(ikl) confirmation" || title === "bill ready for applicant") {
    return t(
      "admin.dashboard.activityBillPendingDesc",
      `${reference} has a generated bill ready to be sent to the applicant.`
    ).replace("{reference}", reference);
  }

  if (title === "application approved") {
    return t(
      "admin.dashboard.activityApprovedDesc",
      `${reference} was approved.`
    ).replace("{reference}", reference);
  }

  if (title === "payment receipt submitted") {
    return t(
      "admin.dashboard.activityPaymentSubmittedDesc",
      `The applicant submitted a payment receipt for ${reference}.`
    ).replace("{reference}", reference);
  }

  if (title === "application reviewed") {
    const department = getActivityDepartment(activity) || String(activity?.actor || "").trim();
    return t(
      "admin.dashboard.activityReviewedDesc",
      `${reference} was reviewed by {department}.`
    )
      .replace("{reference}", reference)
      .replace("{department}", department || "ALiS");
  }

  if (description) return description;

  return t(
    "admin.dashboard.activityUpdatedDesc",
    `${reference} was updated.`
  ).replace("{reference}", reference);
}

function isActivityForCurrentStatus(activity, application) {
  const status = normalizeStatus(application.status);
  const title = String(activity.rawTitle || activity.title || "").toLowerCase();

  if (status === "rejected") return title.includes("rejected");
  if (status === "technical_review") return title.includes("technical review");
  if (status === "technical_review_completed") return title.includes("technical review completed");
  if (status === "bill_pending_ku") return title.includes("bill");
  if (status === "ku_ikl_review") return title.includes("ku(ikl)");
  if (status === "submitted") return title.includes("submitted");

  return false;
}

function dedupeRecentActivities(activities) {
  const seen = new Set();

  return activities.filter((activity) => {
    const key = [
      activity.applicationId,
      String(activity.title || "").trim().toLowerCase(),
      String(activity.description || "").trim().toLowerCase(),
    ].join(":");

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isRelevantRecentActivity(application, userDepartment) {
  if (!userDepartment) return true;
  const status = normalizeStatus(application.status);

  if (userDepartment === "KU(IKL)") {
    return KU_IKL_RECENT_ACTIVITY_STATUSES.has(status);
  }

  if (userDepartment === "MPHLG") {
    return status === "mphlg_processing";
  }

  const assignedUnit = getAssignedUnit(userDepartment);
  if (assignedUnit) {
    return isUnitHistoryApplication(application, assignedUnit, userDepartment);
  }

  if (["KB(LES)", "TP(RES)", "PGH", "TP(RES)/PGH", "TP/PGH"].includes(userDepartment)) {
    if (userDepartment === "KB(LES)") {
      return status === "management_review" && !isKbLesVerified(application);
    }

    return status === "management_review" && isKbLesVerified(application) && !hasManagementSupport(application);
  }

  return true;
}

function getApplicationSection(application, key) {
  return application?.[key] || application?.form_data?.[key] || {};
}

function isKbLesVerified(application) {
  const status = String(getApplicationSection(application, "kb_les_verification")?.status || "")
    .trim()
    .toLowerCase();
  return ["verified", "supported", "completed"].includes(status);
}

function hasManagementSupport(application) {
  const status = String(getApplicationSection(application, "management_recommendation")?.status || "")
    .trim()
    .toLowerCase();
  return ["supported", "approved", "completed"].includes(status);
}

function getAdminActivityTitle(application, userDepartment, t) {
  const status = normalizeStatus(application.status);

  if (status === "submitted") {
    return t("admin.dashboard.activitySubmitted", "Application submitted");
  }

  if (status === "ku_ikl_review") {
    return t("admin.dashboard.activityKuReview", "KU(IKL) review required");
  }

  if (["technical_review", "technical_site_visit"].includes(status)) {
    if (userDepartment === "IKL (TECHNICAL)" && status === "technical_site_visit") {
      return t(
        "admin.dashboard.activityIklTechnicalReview",
        "IKL(TECHNICAL) review required"
      );
    }

    if (EXTERNAL_TECHNICAL_DEPARTMENTS.has(userDepartment)) {
      if (hasTechnicalDepartmentReview(application, userDepartment)) {
        if (status === "technical_site_visit") {
          return t("admin.dashboard.activitySentIklTechnical", "Sent to IKL(TECH)");
        }

        return t("admin.dashboard.activityReviewSubmitted", "Review submitted");
      }

      return t(
        "admin.dashboard.activityUnitTechnicalReview",
        `${userDepartment} technical review required`
      ).replace("{department}", userDepartment);
    }

    return t("admin.dashboard.activityTechnicalReview", "Technical review required");
  }

  if (status === "technical_review_completed") {
    return t("admin.dashboard.activityTechnicalCompleted", "Technical review completed");
  }

  if (status === "management_review") {
    if (userDepartment === "KB(LES)" && !isKbLesVerified(application)) {
      return t("workspace.approval.stageKbVerification", "Pending KB(LES) Verification");
    }

    if (APPROVAL_SUPPORT_DEPARTMENTS.has(userDepartment) && isKbLesVerified(application)) {
      return t("workspace.approval.stageSupport", "Pending TP(RES)/PGH Final Approval");
    }

    return t("admin.dashboard.activityManagementReview", "Management review required");
  }

  if (status === "mphlg_processing") {
    return t("admin.dashboard.activityMphlgProcessing", "MPHLG review required");
  }

  if (status === "mphlg_decision_received") {
    return t("admin.dashboard.activityMphlgDecision", "MPHLG decision received");
  }

  if (status === "bill_pending_ku") {
    return t("admin.dashboard.activityBillPending", "Bill ready for applicant");
  }

  if (status === "rejected") {
    return t("admin.dashboard.activityRejected", "Application rejected");
  }

  if (status === "payment_submitted") {
    return t("admin.dashboard.activityPaymentSubmitted", "Payment proof submitted");
  }

  if (status === "payment_verified") {
    return t("admin.dashboard.activityPaymentVerified", "Payment verified");
  }

  if (status === "license_issued") {
    return t("admin.dashboard.activityLicenseIssued", "E-license generated");
  }

  return t(`status.${status}`, formatWorkflowStatus(status));
}

function getAdminActivityDescription(application, userDepartment, t) {
  const reference = getApplicationReference(application);
  const status = normalizeStatus(application.status);

  if (status === "submitted" && userDepartment === "KU(IKL)") {
    return t(
      "admin.dashboard.activitySubmittedDesc",
      `${reference} is ready for KU(IKL) review.`
    ).replace("{reference}", reference);
  }

  if (["technical_review", "technical_site_visit"].includes(status)) {
    if (userDepartment === "IKL (TECHNICAL)" && status === "technical_site_visit") {
      return t(
        "admin.dashboard.activityIklTechnicalDesc",
        `${reference} is ready for IKL(TECHNICAL) review.`
      ).replace("{reference}", reference);
    }

    if (EXTERNAL_TECHNICAL_DEPARTMENTS.has(userDepartment)) {
      if (hasTechnicalDepartmentReview(application, userDepartment)) {
        if (status === "technical_site_visit") {
          return t(
            "admin.dashboard.activitySentIklTechnicalDesc",
            `Technical unit feedback for ${reference} has been sent to IKL(TECHNICAL).`
          ).replace("{reference}", reference);
        }

        return t(
          "admin.dashboard.activityReviewSubmittedDesc",
          `Your unit review for ${reference} has been submitted.`
        ).replace("{reference}", reference);
      }

      return t(
        "admin.dashboard.activityUnitTechnicalDesc",
        `Application ${reference} is ready for ${userDepartment} review.`
      )
        .replace("{reference}", reference)
        .replace("{department}", userDepartment);
    }

    return t(
      "admin.dashboard.activityTechnicalDesc",
      `${reference} is waiting for technical review.`
    ).replace("{reference}", reference);
  }

  if (status === "management_review") {
    if (userDepartment === "KB(LES)" && !isKbLesVerified(application)) {
      return t(
        "admin.dashboard.activityKbVerificationDesc",
        `${reference} is waiting for KB(LES) verification.`
      ).replace("{reference}", reference);
    }

    if (APPROVAL_SUPPORT_DEPARTMENTS.has(userDepartment) && isKbLesVerified(application)) {
      return t(
        "admin.dashboard.activityTpPghApprovalDesc",
        `${reference} is waiting for TP(RES)/PGH final approval.`
      ).replace("{reference}", reference);
    }

    return t(
      "admin.dashboard.activityManagementDesc",
      `${reference} is waiting for management review.`
    ).replace("{reference}", reference);
  }

  if (status === "rejected") {
    return t(
      "admin.dashboard.activityRejectedDesc",
      `${reference} was rejected and returned to the applicant for correction.`
    ).replace("{reference}", reference);
  }

  if (status === "mphlg_processing") {
    return t(
      "admin.dashboard.activityMphlgDesc",
      `${reference} is waiting for MPHLG review.`
    ).replace("{reference}", reference);
  }

  return t(
    "admin.dashboard.activityUpdatedDesc",
    `${reference} was updated.`
  ).replace("{reference}", reference);
}

function PersonalTaskDashboard() {
  const { language, t } = useLanguage();
  const userDepartment = normalizeDepartmentCode(getStoredUser()?.department);
  const assignedUnit = getAssignedUnit(userDepartment);
  const activeDepartment = assignedUnit?.department || "";
  const [applications, setApplications] = useState([]);
  const [selectedUnit, setSelectedUnit] = useState(assignedUnit?.code || units[0].code);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchApplications = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      setError("");
      const list = await fetchApplicationList();
      const enrichedList = await enrichApplicationListApplicantNames(list, (id) =>
        apiRequest(`/applications/${id}/`)
      );
      setApplications(enrichedList);
    } catch (err) {
      setError(err.message || "Failed to load admin dashboard tasks.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchApplications();
  }, [fetchApplications]);

  useEffect(() => {
    window.addEventListener("fastrack:applications-changed", fetchApplications);
    window.addEventListener("focus", fetchApplications);
    const handleVisibilityChange = () => {
      if (!document.hidden) fetchApplications({ silent: true });
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const interval = window.setInterval(
      () => fetchApplications({ silent: true }),
      5000
    );

    return () => {
      window.removeEventListener("fastrack:applications-changed", fetchApplications);
      window.removeEventListener("focus", fetchApplications);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(interval);
    };
  }, [fetchApplications]);

  const unitTasks = useMemo(() => {
    return units.map((unit) => ({
      ...unit,
      locked: Boolean(activeDepartment) && unit.department !== activeDepartment,
      tasks: applications.filter((application) => {
        return isUnitActionableApplication(application, unit, activeDepartment);
      }),
      records: applications.filter((application) => {
        return isUnitHistoryApplication(application, unit, activeDepartment);
      }),
    }));
  }, [applications, activeDepartment]);

  const processListUnits = useMemo(() => {
    return unitTasks.filter((unit) => {
      if (!IKL_DEPARTMENTS.has(unit.department)) return true;
      return IKL_DEPARTMENTS.has(activeDepartment)
        ? unit.department === activeDepartment
        : unit.department === "PT(IKL)";
    });
  }, [activeDepartment, unitTasks]);

  const selected = unitTasks.find((unit) => unit.code === selectedUnit) || unitTasks[0];
  return (
    <AdminDashboardLayout>
      <Alert message={error} />

      <section className="mb-5 border border-slate-300 bg-white p-3">
        <ClaimableTaskView
          t={t}
          language={language}
          loading={loading}
          selected={selected}
          selectedUnit={selectedUnit}
          onSelectUnit={(unit) => {
            if (unit.locked) return;
            setSelectedUnit(unit.code);
          }}
          unitTasks={processListUnits}
        />
      </section>

    </AdminDashboardLayout>
  );
}

function ClaimableTaskView({
  t,
  language,
  loading,
  selected,
  selectedUnit,
  onSelectUnit,
  unitTasks,
}) {
  const rows = [...(selected?.tasks || [])].sort(sortApplicationsByUpdatedDate);
  const rowsHaveActions = rows.length > 0;

  return (
    <>
      <fieldset className="border border-slate-300 px-3 pb-4 pt-2">
        <legend className="px-2 text-sm font-semibold italic text-slate-700">
          {t("admin.dashboard.processList")}
        </legend>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {unitTasks.map((unit) => (
            <button
              type="button"
              key={unit.code}
              onClick={() => onSelectUnit(unit)}
              disabled={unit.locked}
              aria-disabled={unit.locked}
              className={`group flex flex-col items-center rounded-md border p-2.5 text-center transition ${
                selectedUnit === unit.code
                  ? "border-emerald-600 bg-emerald-50"
                  : unit.locked
                    ? "cursor-not-allowed border-transparent bg-white opacity-45"
                  : "border-transparent bg-white hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <span
                className={`flex aspect-square w-20 items-center justify-center rounded-full text-white shadow-sm ${unit.color}`}
              >
                <Icon name={unit.icon} className={`text-4xl ${unit.iconClassName || ""}`} />
              </span>
              <span className="mt-3 text-sm font-bold italic text-slate-700">
                {getProcessIconTitle(unit)}
              </span>
              <span className="text-xs font-semibold italic text-slate-950">
                {t("admin.dashboard.taskCount")} : {unit.locked ? "" : loading ? "..." : unit.tasks.length}
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      <Panel
        title={`${selected.title} ${t("admin.dashboard.taskQueue")}`}
        description={t("admin.dashboard.queueDescription")}
        className="mt-5"
      >
        <PaginatedTaskTable
          t={t}
          loading={loading}
          emptyText={t("admin.dashboard.noTask")}
          rows={rows}
          columns={[
            {
              key: "reference",
              label: t("common.reference"),
              className: "w-[10%] whitespace-nowrap",
              render: (application) => (
                <span className="font-semibold text-slate-950">
                  {getApplicationReference(application)}
                </span>
              ),
            },
            {
              key: "project",
              label: t("common.project"),
              className: "w-[52%] min-w-[18rem]",
              render: (application) => (
                <span className="block max-w-[42rem] whitespace-pre-line leading-5">
                  {getProjectName(application, language)}
                </span>
              ),
            },
            {
              key: "status",
              label: t("common.status"),
              className: "w-[16%] whitespace-nowrap",
              render: (application) => (
                <StatusPill value={getDashboardTaskStatusLabel(application, selected, t)} />
              ),
            },
            {
              key: "updated",
              label: t("common.updated"),
              className: "w-[14%] whitespace-nowrap",
              render: (application) => (
                <span className="whitespace-nowrap text-[12px] leading-5">
                  {formatCompactDateTime(application.updated_at)}
                </span>
              ),
            },
            ...(rowsHaveActions
              ? [
                  {
                    key: "action",
                    label: t("common.action"),
                    className: "w-[8%] whitespace-nowrap",
                    render: (application) =>
                      isUnitActionableApplication(application, selected) ? (
                        <Link
                          to={`${getAdminTaskWorkspacePath(application, selected)}?id=${application.id}&from=personal`}
                          className="inline-flex min-h-8 items-center justify-center rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold leading-5 text-slate-700 hover:bg-slate-50"
                        >
                          {t("common.view", "View")}
                        </Link>
                      ) : null,
                  },
                ]
              : []),
          ]}
        />
      </Panel>
    </>
  );
}

function PaginatedTaskTable({ rows, t, ...props }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(rows.length / TASK_TABLE_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const visibleRows = rows.slice(
    currentPage * TASK_TABLE_PAGE_SIZE,
    (currentPage + 1) * TASK_TABLE_PAGE_SIZE
  );

  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <DataTable {...props} rows={visibleRows} />
      {!props.loading && (
        <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            {t("applicant.recentActivitiesPage", "Page")} {currentPage + 1} {t("common.of", "of")} {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPage(Math.max(currentPage - 1, 0))}
              disabled={currentPage === 0}
            >
              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
              {t("common.previous", "Previous")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPage(Math.min(currentPage + 1, totalPages - 1))}
              disabled={currentPage >= totalPages - 1}
            >
              {t("common.next", "Next")}
              <span className="material-symbols-outlined text-[18px]">chevron_right</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function normalizeDepartmentCode(value) {
  const department = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[.]+$/g, "")
    .replace(/-/g, " ")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ");
  if (department === "PT IKL") return "PT(IKL)";
  if (department === "KU IKL") return "KU(IKL)";
  if (department === "TP RES" || department === "TP(RES)") return "TP(RES)";
  if (department === "TP RES/PGH" || department === "TP(RES)/PGH") return "TP(RES)/PGH";
  if (
    department === "IKL(TECHNICAL)" ||
    department === "IKL TECHNICAL" ||
    department === "IKL-TECHNICAL"
  ) {
    return "IKL (TECHNICAL)";
  }
  if (department === "INP") return "LNP";
  if (department === "SETIAUSAHA TETAP") return "";
  return department === "UNIT IKLAN" ? "PT(IKL)" : department;
}

function isApprovalWorkflowUser(user) {
  const role = String(user?.role || "").trim().toLowerCase();
  const department = normalizeDepartmentCode(user?.department);

  return (
    role === "supervisor" ||
    department === "KB(LES)" ||
    department === "TP(RES)" ||
    department === "PGH" ||
    department === "TP(RES)/PGH" ||
    department === "TP/PGH"
  );
}

function isMphlgUser(user) {
  return normalizeDepartmentCode(user?.department) === "MPHLG";
}

function getAssignedUnit(department) {
  if (!department) return null;
  return units.find((unit) => unit.department === department) || null;
}

function isUnitActionableApplication(application, unit, activeDepartment = "") {
  const isAssignedDepartment =
    !activeDepartment || unit.department === activeDepartment;
  const isMatchingStatus = unit.statuses.includes(normalizeStatus(application.status));
  const isExternalTechnicalUnit = EXTERNAL_TECHNICAL_DEPARTMENTS.has(unit.department);
  const isExternalTechnicalTask =
    isExternalTechnicalUnit &&
    isTechnicalDepartmentSelected(application, unit.department) &&
    !hasTechnicalDepartmentReview(application, unit.department);

  return (
    isAssignedDepartment &&
    isMatchingStatus &&
    (!isExternalTechnicalUnit || isExternalTechnicalTask)
  );
}

function isUnitHistoryApplication(application, unit, activeDepartment = "") {
  const isAssignedDepartment =
    !activeDepartment || unit.department === activeDepartment;
  const status = normalizeStatus(application.status);
  const historyStatuses = unit.historyStatuses || unit.statuses;
  const isMatchingHistoryStatus = historyStatuses.includes(status);

  if (!isAssignedDepartment || !isMatchingHistoryStatus) return false;

  if (EXTERNAL_TECHNICAL_DEPARTMENTS.has(unit.department)) {
    return (
      isUnitActionableApplication(application, unit, activeDepartment) ||
      hasTechnicalDepartmentReview(application, unit.department)
    );
  }

  return true;
}

function sortApplicationsByUpdatedDate(a, b) {
  const bTime = new Date(b.updated_at || b.created_at || 0).getTime();
  const aTime = new Date(a.updated_at || a.created_at || 0).getTime();
  return bTime - aTime;
}

function getProcessIconTitle(unit) {
  return IKL_DEPARTMENTS.has(unit?.department) ? "LES" : unit?.title || "";
}

function getAdminTaskWorkspacePath(application, unit) {
  const status = normalizeStatus(application?.status);

  if (unit?.department === "PT(IKL)") {
    if (["approved", "payment_submitted", "payment_verified"].includes(status)) {
      return "/admin/e-licenses/payment";
    }
  }

  return unit?.path || "/dashboard/admin";
}

function getTechnicalDepartmentReviews(app) {
  return app?.technical_department_reviews || app?.form_data?.technical_department_reviews || {};
}

function getSelectedTechnicalDepartments(app) {
  const selection =
    app?.technical_department_selection ||
    app?.form_data?.technical_department_selection ||
    {};
  const departments = Array.isArray(selection.departments)
    ? selection.departments
    : app?.technical_referral?.participating_departments ||
      app?.form_data?.technical_referral?.participating_departments ||
      [];

  return Array.from(
    new Set(
      departments
        .map(normalizeDepartmentCode)
        .filter((department) => EXTERNAL_TECHNICAL_DEPARTMENTS.has(department))
    )
  );
}

function isTechnicalDepartmentSelected(app, department) {
  return getSelectedTechnicalDepartments(app).includes(normalizeDepartmentCode(department));
}

function getActiveTechnicalReviewCycle(app) {
  const formData = app?.form_data || {};
  return String(
    formData.technical_review_cycle ||
      app?.technical_referral?.cycle_id ||
      app?.technical_department_selection?.cycle_id ||
      formData.technical_referral?.cycle_id ||
      formData.technical_department_selection?.cycle_id ||
      formData.technical_site_visit?.cycle_id ||
      ""
  );
}

function isCurrentTechnicalReviewCycle(app, review) {
  const activeCycle = getActiveTechnicalReviewCycle(app);
  const reviewCycle = String(review?.cycle_id || "");
  const cycleMatches = activeCycle ? reviewCycle === activeCycle : true;
  if (!cycleMatches) return false;

  const formData = app?.form_data || {};
  const selectionTime =
    app?.technical_department_selection?.selected_at ||
    app?.technical_referral?.departments_selected_at ||
    app?.technical_referral?.referred_at ||
    formData.technical_department_selection?.selected_at ||
    formData.technical_referral?.departments_selected_at ||
    formData.technical_referral?.referred_at ||
    formData.technical_site_visit?.reset_at ||
    "";
  const reviewedAt = review?.reviewed_at || "";

  if (!selectionTime || !reviewedAt) return true;

  const selectedMs = Date.parse(selectionTime);
  const reviewedMs = Date.parse(reviewedAt);

  if (!Number.isFinite(selectedMs) || !Number.isFinite(reviewedMs)) return true;

  return reviewedMs >= selectedMs;
}

function hasTechnicalDepartmentReview(app, department) {
  const normalizedDepartment = normalizeDepartmentCode(department);
  const review = getTechnicalDepartmentReviews(app)?.[normalizedDepartment];
  return Boolean(review && isCurrentTechnicalReviewCycle(app, review));
}

function getDashboardTaskStatusLabel(application, unit, t) {
  const status = normalizeStatus(application?.status);

  if (unit?.department === "KU(IKL)" && status === "submitted") {
    return t("status.ku_ikl_review", "KU(IKL) Review");
  }

  if (unit?.department === "KU(IKL)" && status === "technical_review_completed") {
    return t("status.technical_ku_review", "Pending KU(IKL) Final Check");
  }

  if (unit?.department === "IKL (TECHNICAL)" && status === "technical_review_completed") {
    return t("admin.dashboard.statusReviewSubmitted", "Review Submitted");
  }

  if (unit?.department === "IKL (TECHNICAL)" && TECHNICAL_DEPARTMENT_STATUS_SET.has(status)) {
    return t("status.ikl_technical_review", "IKL(TECH) Review");
  }

  if (EXTERNAL_TECHNICAL_DEPARTMENTS.has(unit?.department) && TECHNICAL_DEPARTMENT_STATUS_SET.has(status)) {
    if (hasTechnicalDepartmentReview(application, unit.department)) {
      if (status === "technical_site_visit") {
        return t("admin.dashboard.statusSentToIklTechnical", "Sent to IKL(TECH)");
      }

      return t("admin.dashboard.statusReviewSubmitted", "Review Submitted");
    }

    return t("admin.dashboard.statusUnitReview", "{department} Review").replace(
      "{department}",
      unit.department
    );
  }

  return t(`status.${status}`, formatWorkflowStatus(status));
}

export default AdminDashboard;
