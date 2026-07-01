import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Link, useLocation } from "react-router-dom";
import AdminDashboardLayout from "../../layout/AdminDashboardLayout";
import ApprovalPage from "../admin/approval/ApprovalPage";
import { ApprovalTechnicalReviewSummary } from "../admin/ProcessWorkspace";
import { useLanguage } from "../../context/LanguageContext";
import { apiRequest, fetchApplicationList, fetchAuthenticatedBlob, getStoredUser } from "../../services/api";
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
  canViewLicense,
  formatCompactDateTime,
  formatWorkflowStatus,
  getApplicationReference,
  getLicenseId,
  getProjectName,
  getRegisteredApplicantName,
  normalizeStatus,
} from "../../utils/workflow";
import { openAdvertisementLicenseDocument } from "../../utils/advertisementLicenseDocument";

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
const TECHNICAL_LOG_DEPARTMENTS = new Set(["IKL (TECHNICAL)", ...EXTERNAL_TECHNICAL_DEPARTMENTS]);
const APPROVAL_SUPPORT_DEPARTMENTS = new Set(["TP(RES)", "PGH", "TP(RES)/PGH", "TP/PGH"]);
const APPROVAL_WORKFLOW_DEPARTMENTS = new Set([
  "KB(LES)",
  ...APPROVAL_SUPPORT_DEPARTMENTS,
  "MPHLG",
]);
const APPROVAL_PROCESS_LIST_DEPARTMENTS = new Set(["KB(LES)", "TP(RES)", "PGH"]);
const APPROVAL_HISTORY_STATUSES = [
  "management_review",
  "mphlg_processing",
  "mphlg_decision_received",
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
const RESUBMISSION_DRILLDOWN_PAGE_SIZE = 5;
const RESUBMISSION_MONTH_ALL = "all";
const RESUBMISSION_DRILLDOWN_TYPES = {
  rejected: "rejected",
  resubmitted: "resubmitted",
  complete: "complete",
};
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
  {
    code: "KB(LES)",
    department: "KB(LES)",
    title: "KB(LES)",
    descriptionKey: "admin.workflow.kbLesShort",
    icon: "verified_user",
    color: "bg-amber-600",
    statuses: ["management_review"],
    historyStatuses: APPROVAL_HISTORY_STATUSES,
    path: "/admin/approval",
  },
  {
    code: "TP(RES)",
    department: "TP(RES)",
    title: "TP(RES)",
    descriptionKey: "admin.workflow.tpPghShort",
    icon: "approval",
    color: "bg-violet-600",
    statuses: ["management_review"],
    historyStatuses: APPROVAL_HISTORY_STATUSES,
    path: "/admin/approval",
  },
  {
    code: "PGH",
    department: "PGH",
    title: "PGH",
    descriptionKey: "admin.workflow.tpPghShort",
    icon: "approval",
    color: "bg-fuchsia-600",
    statuses: ["management_review"],
    historyStatuses: APPROVAL_HISTORY_STATUSES,
    path: "/admin/approval",
  },
  {
    code: "TP(RES)/PGH",
    department: "TP(RES)/PGH",
    title: "TP(RES)/PGH",
    descriptionKey: "admin.workflow.tpPghShort",
    icon: "approval",
    color: "bg-purple-600",
    statuses: ["management_review"],
    historyStatuses: APPROVAL_HISTORY_STATUSES,
    path: "/admin/approval",
  },
  {
    code: "TP/PGH",
    department: "TP/PGH",
    title: "TP/PGH",
    descriptionKey: "admin.workflow.tpPghShort",
    icon: "approval",
    color: "bg-pink-600",
    statuses: ["management_review"],
    historyStatuses: APPROVAL_HISTORY_STATUSES,
    path: "/admin/approval",
  },
  {
    code: "MPHLG",
    department: "MPHLG",
    title: "MPHLG",
    descriptionKey: "admin.workflow.mphlgShort",
    icon: "account_balance",
    color: "bg-slate-700",
    statuses: ["mphlg_processing"],
    historyStatuses: APPROVAL_HISTORY_STATUSES,
    path: "/admin/approval",
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

  if (view === "personal") {
    return <PersonalTaskDashboard />;
  }

  if (view === "dashboard") {
    return <AdminHomeDashboard user={currentUser} />;
  }

  return <PersonalTaskDashboard />;
}

function AdminHomeDashboard({ user }) {
  const { language, t } = useLanguage();
  const location = useLocation();
  const userDepartment = normalizeDepartmentCode(user?.department);
  const [applications, setApplications] = useState([]);
  const [activityPage, setActivityPage] = useState(0);
  const [activityDateFilter, setActivityDateFilter] = useState("");
  const [resubmissionDrilldown, setResubmissionDrilldown] = useState(null);
  const [resubmissionFilters, setResubmissionFilters] = useState(() => ({
    month: RESUBMISSION_MONTH_ALL,
    year: String(new Date().getFullYear()),
  }));
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
    const params = new URLSearchParams(location.search);
    const resubmissionView = params.get("resubmission");
    if (Object.values(RESUBMISSION_DRILLDOWN_TYPES).includes(resubmissionView)) {
      setResubmissionDrilldown(resubmissionView);
    }
  }, [location.search]);

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
    return buildAdminRecentActivities(applications, userDepartment, user, t);
  }, [applications, t, user, userDepartment]);
  const filteredActivities = useMemo(
    () => filterActivitiesByDate(activities, activityDateFilter),
    [activities, activityDateFilter]
  );
  const resubmissionInsights = useMemo(() => {
    return buildInternalResubmissionInsights(applications, t, language, resubmissionFilters);
  }, [applications, language, resubmissionFilters, t]);
  const resubmissionYearOptions = useMemo(() => {
    return buildResubmissionYearOptions(resubmissionInsights.entries, resubmissionFilters.year);
  }, [resubmissionFilters.year, resubmissionInsights.entries]);
  const resubmissionDrilldownRows = useMemo(() => {
    return buildResubmissionDrilldownRows(
      resubmissionDrilldown,
      resubmissionInsights,
      t
    );
  }, [resubmissionDrilldown, resubmissionInsights, t]);
  const totalActivityPages = Math.max(1, Math.ceil(filteredActivities.length / RECENT_ACTIVITY_PAGE_SIZE));
  const currentActivityPage = Math.min(activityPage, totalActivityPages - 1);
  const visibleActivities = filteredActivities.slice(
    currentActivityPage * RECENT_ACTIVITY_PAGE_SIZE,
    (currentActivityPage + 1) * RECENT_ACTIVITY_PAGE_SIZE
  );
  const showActivityPagination = filteredActivities.length > 0;

  useEffect(() => {
    setActivityPage(0);
  }, [activityDateFilter]);

  if (resubmissionDrilldown) {
    return (
      <AdminDashboardLayout>
        <Alert message={error} />
        <ResubmissionDrilldownPanel
          language={language}
          loading={loading}
          onClose={() => setResubmissionDrilldown(null)}
          rows={resubmissionDrilldownRows}
          type={resubmissionDrilldown}
          t={t}
        />
      </AdminDashboardLayout>
    );
  }

  return (
    <AdminDashboardLayout>
      <Alert message={error} />

      <InternalResubmissionGraph
        filters={resubmissionFilters}
        insights={resubmissionInsights}
        language={language}
        loading={loading}
        onDrilldownSelect={setResubmissionDrilldown}
        onFilterChange={setResubmissionFilters}
        selectedDrilldown={resubmissionDrilldown}
        t={t}
        yearOptions={resubmissionYearOptions}
      />

      <RecentActivitiesPanel
        activities={filteredActivities}
        dateFilter={activityDateFilter}
        currentPage={currentActivityPage}
        loading={loading}
        onDateFilterChange={setActivityDateFilter}
        onPageChange={setActivityPage}
        showPagination={showActivityPagination}
        t={t}
        totalPages={totalActivityPages}
        visibleActivities={visibleActivities}
      />
    </AdminDashboardLayout>
  );
}

function RecentActivitiesPanel({
  activities,
  currentPage,
  dateFilter,
  loading,
  onDateFilterChange,
  onPageChange,
  showPagination,
  t,
  totalPages,
  visibleActivities,
}) {
  return (
    <section className="rounded-md border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-950">
            {t("admin.dashboard.recentActivitiesTitle", "Recent Activities")}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {t("admin.dashboard.recentActivitiesDesc", "Latest application updates for your unit.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            className="h-9 min-h-9 w-9 p-0"
            onClick={() => onPageChange(Math.max(currentPage - 1, 0))}
            disabled={loading || !showPagination || currentPage === 0}
            aria-label={t("common.previous", "Previous")}
            title={t("common.previous", "Previous")}
          >
            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="h-9 min-h-9 w-9 p-0"
            onClick={() => onPageChange(Math.min(currentPage + 1, totalPages - 1))}
            disabled={loading || !showPagination || currentPage >= totalPages - 1}
            aria-label={t("common.next", "Next")}
            title={t("common.next", "Next")}
          >
            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
          </Button>
          <input
            type="date"
            value={dateFilter}
            onChange={(event) => onDateFilterChange(event.target.value)}
            aria-label={t("common.date", "Date")}
            className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
          <Button
            type="button"
            variant="secondary"
            className="h-9 min-h-9 px-3"
            onClick={() => onDateFilterChange("")}
            disabled={!dateFilter}
          >
            {t("common.reset", "Reset")}
          </Button>
        </div>
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
                <p className="mt-1 text-sm font-semibold text-slate-700">
                  {activity.reference}
                </p>
                {activity.project && (
                  <p className="mt-1 whitespace-pre-line text-sm text-slate-600">
                    {formatActivityProjectText(activity.project)}
                  </p>
                )}
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

    </section>
  );
}

function InternalResubmissionGraph({
  filters,
  insights,
  language,
  loading,
  onDrilldownSelect,
  onFilterChange,
  selectedDrilldown,
  t,
  yearOptions,
}) {
  const maxCount = Math.max(
    1,
    ...insights.buckets.map((bucket) =>
      Math.max(bucket.rejected, bucket.resubmitted, bucket.complete)
    )
  );
  const monthOptions = getResubmissionMonthOptions(language);
  const xAxisLabel =
    filters.month === RESUBMISSION_MONTH_ALL
      ? t("admin.dashboard.xAxisMonth", "Month")
      : t("admin.dashboard.xAxisDay", "Day");
  const yAxisLabel = t("admin.dashboard.yAxisApplications", "No. of applications");
  const yAxisTicks = Array.from(new Set([maxCount, Math.ceil(maxCount / 2), 0]));
  const barMaxHeight = 176;

  return (
    <section className="mb-5 rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">
              {t("admin.dashboard.resubmissionStatisticsTitle", "Resubmission Statistics")}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {t(
                "admin.dashboard.resubmissionMonitorDesc",
                "Internal DBKU record of rejected applications and applicant resubmissions."
              )}
            </p>
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
        <div className="px-4 py-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="grid grid-cols-3 gap-2 text-xs">
              <ResubmissionSummaryCard
                active={selectedDrilldown === RESUBMISSION_DRILLDOWN_TYPES.rejected}
                count={loading ? "..." : insights.totalRejected}
                label={t("status.rejected", "Rejected")}
                onClick={() => onDrilldownSelect(RESUBMISSION_DRILLDOWN_TYPES.rejected)}
                tone="red"
              />
              <ResubmissionSummaryCard
                active={selectedDrilldown === RESUBMISSION_DRILLDOWN_TYPES.resubmitted}
                count={loading ? "..." : insights.totalResubmitted}
                label={t("admin.dashboard.resubmitted", "Resubmitted")}
                onClick={() => onDrilldownSelect(RESUBMISSION_DRILLDOWN_TYPES.resubmitted)}
                tone="blue"
              />
              <ResubmissionSummaryCard
                active={selectedDrilldown === RESUBMISSION_DRILLDOWN_TYPES.complete}
                count={loading ? "..." : insights.totalComplete}
                label={t("common.complete", "Complete")}
                onClick={() => onDrilldownSelect(RESUBMISSION_DRILLDOWN_TYPES.complete)}
                tone="green"
              />
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-[130px] flex-col gap-1 text-xs font-semibold text-slate-600">
                <span>{t("common.year", "Year")}</span>
                <select
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 shadow-sm focus:border-emerald-600 focus:outline-none"
                  value={filters.year}
                  onChange={(event) =>
                    onFilterChange((current) => ({ ...current, year: event.target.value }))
                  }
                >
                  {yearOptions.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-[180px] flex-col gap-1 text-xs font-semibold text-slate-600">
                <span>{t("common.month", "Month")}</span>
                <select
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 shadow-sm focus:border-emerald-600 focus:outline-none"
                  value={filters.month}
                  onChange={(event) =>
                    onFilterChange((current) => ({ ...current, month: event.target.value }))
                  }
                >
                  <option value={RESUBMISSION_MONTH_ALL}>{t("common.all", "All")}</option>
                  {monthOptions.map((month) => (
                    <option key={month.value} value={month.value}>
                      {month.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50/40 px-4 py-4">
            <div className="mb-3 text-xs font-semibold text-slate-500">
              <p>{yAxisLabel}</p>
            </div>

            <div className="grid grid-cols-[42px_minmax(0,1fr)] gap-3">
              <div
                className="mt-7 flex flex-col justify-between text-right text-xs font-semibold text-slate-400"
                style={{ height: `${barMaxHeight}px` }}
              >
                {yAxisTicks.map((tick) => (
                  <span key={tick}>{tick}</span>
                ))}
              </div>
              <div className="min-w-0 overflow-x-auto">
                <div className="min-w-[720px]">
                  <div className="relative border-b border-l border-slate-300 pl-4 pt-7">
                    <div
                      className="pointer-events-none absolute inset-x-0 left-4 top-7 flex flex-col justify-between"
                      style={{ height: `${barMaxHeight}px` }}
                    >
                      {yAxisTicks.map((tick) => (
                        <span key={tick} className="border-t border-slate-200" />
                      ))}
                    </div>
                    <div
                      className="relative grid items-end gap-4 pr-4"
                      style={{
                        gridTemplateColumns: `repeat(${insights.buckets.length}, minmax(42px, 1fr))`,
                        height: `${barMaxHeight}px`,
                      }}
                    >
                      {insights.buckets.map((bucket) => (
                        <div key={bucket.key} className="flex min-w-0 items-end justify-center gap-2">
                          <ChartBar
                            colorClassName="bg-red-500"
                            height={bucket.rejected ? Math.max(12, (bucket.rejected / maxCount) * barMaxHeight) : 0}
                            label={`${bucket.label} ${t("status.rejected", "Rejected")}: ${bucket.rejected}`}
                            value={bucket.rejected}
                          />
                          <ChartBar
                            colorClassName="bg-blue-500"
                            height={bucket.resubmitted ? Math.max(12, (bucket.resubmitted / maxCount) * barMaxHeight) : 0}
                            label={`${bucket.label} ${t("admin.dashboard.resubmitted", "Resubmitted")}: ${bucket.resubmitted}`}
                            value={bucket.resubmitted}
                          />
                          <ChartBar
                            colorClassName="bg-emerald-500"
                            height={bucket.complete ? Math.max(12, (bucket.complete / maxCount) * barMaxHeight) : 0}
                            label={`${bucket.label} ${t("common.complete", "Complete")}: ${bucket.complete}`}
                            value={bucket.complete}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div
                    className="mt-2 grid gap-4 pl-4 pr-4"
                    style={{
                      gridTemplateColumns: `repeat(${insights.buckets.length}, minmax(42px, 1fr))`,
                    }}
                  >
                    {insights.buckets.map((bucket) => (
                      <p key={bucket.key} className="truncate text-center text-sm font-semibold text-slate-600">
                        {bucket.label}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-3 pl-[54px] text-center text-xs font-semibold text-slate-500">
              {xAxisLabel}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function ChartBar({ colorClassName, height, label, value }) {
  return (
    <div className="relative flex h-full w-7 items-end justify-center">
      {value > 0 && (
        <span
          className="absolute text-xs font-semibold text-slate-600"
          style={{ bottom: `${height + 4}px` }}
        >
          {value}
        </span>
      )}
      <div
        className={`w-full rounded-t-md shadow-sm ${colorClassName}`}
        title={label}
        style={{ height: `${height}px` }}
      />
    </div>
  );
}

function ResubmissionSummaryCard({ active, count, label, onClick, tone }) {
  const toneClassNames = {
    red: {
      card: "bg-red-50 text-red-700 hover:bg-red-100",
      marker: "bg-red-500",
    },
    blue: {
      card: "bg-blue-50 text-blue-700 hover:bg-blue-100",
      marker: "bg-blue-500",
    },
    green: {
      card: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
      marker: "bg-emerald-500",
    },
    slate: {
      card: "bg-slate-100 text-slate-700 hover:bg-slate-200",
      marker: "bg-slate-500",
    },
  };
  const toneClassName = toneClassNames[tone] || toneClassNames.slate;

  return (
    <button
      type="button"
      className={[
        "rounded-md px-3 py-2 text-left transition focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2",
        toneClassName.card,
        active ? "ring-2 ring-emerald-600 ring-offset-2" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
    >
      <p className="inline-flex items-center gap-1.5 font-semibold">
        <span className={`h-2.5 w-2.5 rounded-sm ${toneClassName.marker}`} />
        {label}
      </p>
      <p className="mt-1 text-lg font-bold">{count}</p>
    </button>
  );
}

function ResubmissionDrilldownPanel({ language, loading, onClose, rows, t, type }) {
  const location = useLocation();
  const [filters, setFilters] = useState(() => ({
    month: RESUBMISSION_MONTH_ALL,
    search: "",
    year: String(new Date().getFullYear()),
  }));
  const [page, setPage] = useState(0);
  const initialCompleteRowId =
    type === RESUBMISSION_DRILLDOWN_TYPES.complete
      ? new URLSearchParams(location.search).get("completeId") || ""
      : "";
  const [selectedCompleteRowId, setSelectedCompleteRowId] = useState(initialCompleteRowId);
  const title = getResubmissionDrilldownTitle(type, t);
  const description = getResubmissionDrilldownDescription(type, t);
  const isCompleteDrilldown = type === RESUBMISSION_DRILLDOWN_TYPES.complete;
  const monthOptions = getResubmissionMonthOptions(language);
  const yearOptions = useMemo(() => {
    return buildDrilldownYearOptions(rows, filters.year);
  }, [filters.year, rows]);
  const filteredRows = useMemo(() => {
    return filterResubmissionDrilldownRows(rows, filters);
  }, [filters, rows]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / RESUBMISSION_DRILLDOWN_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const visibleRows = filteredRows.slice(
    currentPage * RESUBMISSION_DRILLDOWN_PAGE_SIZE,
    (currentPage + 1) * RESUBMISSION_DRILLDOWN_PAGE_SIZE
  );
  const selectedCompleteRow = isCompleteDrilldown
    ? filteredRows.find((row) => row.id === selectedCompleteRowId) || null
    : null;
  const columns = [
    {
      key: "reference",
      label: t("common.reference", "Reference"),
      className: "w-[170px]",
      render: (row) => <span className="font-semibold text-slate-900">{row.reference}</span>,
    },
    {
      key: "applicantName",
      label: t("workspace.license.applicantName", "Applicant Name"),
      className: "w-[210px]",
      render: (row) => <span className="font-medium text-slate-900">{row.applicantName}</span>,
    },
    {
      key: "project",
      label: t("common.project", "Project"),
      render: (row) => <span className="whitespace-pre-line">{row.project}</span>,
    },
    {
      key: "status",
      label: t("common.status", "Status"),
      className: "w-[160px]",
      render: (row) => (
        <span className={row.statusClassName}>
          {row.statusLabel}
        </span>
      ),
    },
    ...(type === RESUBMISSION_DRILLDOWN_TYPES.rejected
      ? [
          {
            key: "remark",
            label: t("common.remarks", "Remarks"),
            render: (row) => row.remark || "-",
          },
        ]
      : []),
    {
      key: "date",
      label: t("common.date", "Date"),
      className: "w-[180px]",
      render: (row) => formatCompactDateTime(row.date),
    },
    {
      key: "action",
      label: t("common.action", "Action"),
      className: "w-[110px] whitespace-nowrap",
      render: (row) => (
        isCompleteDrilldown ? (
          <button
            type="button"
            className="inline-flex min-h-8 items-center rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold leading-5 text-slate-700 hover:bg-slate-50"
            onClick={() => setSelectedCompleteRowId(row.id)}
          >
            {t("common.view", "View")}
          </button>
        ) : (
          <Link
            className="inline-flex min-h-8 items-center rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold leading-5 text-slate-700 hover:bg-slate-50"
            to={getResubmissionApplicationViewPath(row.applicationId, type)}
          >
            {t("common.view", "View")}
          </Link>
        )
      ),
    },
  ];

  useEffect(() => {
    setPage(0);
    if (type === RESUBMISSION_DRILLDOWN_TYPES.complete) {
      setSelectedCompleteRowId(
        new URLSearchParams(location.search).get("completeId") || ""
      );
      return;
    }
    setSelectedCompleteRowId("");
  }, [filters.month, filters.search, filters.year, location.search, type]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages - 1));
  }, [totalPages]);

  return (
    <section className="mb-5 rounded-md border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={selectedCompleteRow ? () => setSelectedCompleteRowId("") : onClose}
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          {t("common.back", "Back")}
        </Button>
      </div>

      <div className="p-4">
        {!selectedCompleteRow && (
          <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(260px,1fr)_160px_190px_auto] lg:items-end">
            <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
              <span>{t("common.search", "Search")}</span>
              <input
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 shadow-sm focus:border-emerald-600 focus:outline-none"
                placeholder={t("admin.dashboard.searchStatisticRecords", "Search reference, applicant name, or project")}
                type="search"
                value={filters.search}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, search: event.target.value }))
                }
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
              <span>{t("common.year", "Year")}</span>
              <select
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 shadow-sm focus:border-emerald-600 focus:outline-none"
                value={filters.year}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, year: event.target.value }))
                }
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
              <span>{t("common.month", "Month")}</span>
              <select
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 shadow-sm focus:border-emerald-600 focus:outline-none"
                value={filters.month}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, month: event.target.value }))
                }
              >
                <option value={RESUBMISSION_MONTH_ALL}>{t("common.all", "All")}</option>
                {monthOptions.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                setFilters({
                  month: RESUBMISSION_MONTH_ALL,
                  search: "",
                  year: String(new Date().getFullYear()),
                })
              }
            >
              <span className="material-symbols-outlined text-[18px]">filter_alt_off</span>
              {t("common.reset", "Reset")}
            </Button>
          </div>
        )}
        {selectedCompleteRow ? (
          <div>
            <CompleteApplicationCard row={selectedCompleteRow} t={t} language={language} />
          </div>
        ) : (
          <DataTable
            columns={columns}
            emptyText={t("admin.dashboard.noStatisticRecords", "No applications found for this statistic.")}
            loading={loading}
            loadingText={t("common.loading", "Loading...")}
            rows={visibleRows}
          />
        )}
        {!loading && !selectedCompleteRow && (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
    </section>
  );
}

function CompleteApplicationCard({ row, t, language = "en" }) {
  const app = row.application || {};
  const [showVerificationReport, setShowVerificationReport] = useState(false);
  const [showDecisionLog, setShowDecisionLog] = useState(false);
  const reference = row.reference || getApplicationReference(app);
  const statusLabel = t("status.license_issued", "E-License Generated");
  const updatedDate = app.updated_at || row.date;
  const licenseId = getLicenseId(app);
  const verificationUrl = getDashboardLicenseVerificationUrl(licenseId);
  const qrContainerRef = useRef(null);
  const documents = getCompleteApplicationDocuments(app, t);
  const applicantReceipt = getApplicantReceiptDocument(app, t);
  const decisionLogs = buildDecisionLogReportRows(app, t);
  const viewPath = getResubmissionApplicationViewPath(
    row.applicationId,
    RESUBMISSION_DRILLDOWN_TYPES.complete,
    row.id
  );

  return (
    <article className="rounded-md border border-slate-200 bg-white p-3">
      <div className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 md:grid-cols-[1fr_1fr_1fr_1fr_auto] md:items-center">
        <CompleteMetaBlock label={t("common.reference", "Reference")} value={reference} />
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">{t("common.status", "Status")}</p>
          <StatusPill value={statusLabel} />
        </div>
        <CompleteMetaBlock label={t("common.created", "Created")} value={formatCompactDateTime(app.created_at)} />
        <CompleteMetaBlock label={t("common.updated", "Updated")} value={formatCompactDateTime(updatedDate)} />
        <Link
          className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          to={viewPath}
        >
          <span className="material-symbols-outlined text-[18px]">visibility</span>
          {t("workspace.openForm", "View Form")}
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          onClick={() => setShowDecisionLog((visible) => !visible)}
        >
          <span className="material-symbols-outlined text-[18px]">assignment</span>
          {showDecisionLog
            ? t("admin.dashboard.hideDecisionLog", "Hide Log Decision")
            : t("admin.dashboard.showDecisionLog", "Log Decision")}
        </button>
        <button
          type="button"
          className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          onClick={() => setShowVerificationReport((visible) => !visible)}
        >
          <span className="material-symbols-outlined text-[18px]">visibility</span>
          {showVerificationReport
            ? t("workspace.approval.hideVerificationReport", "Hide Verification Report")
            : t("workspace.approval.verificationReport", "Verification Report")}
        </button>
      </div>

      {showDecisionLog && (
        <DecisionLogReport
          app={app}
          logs={decisionLogs}
          reference={reference}
          t={t}
        />
      )}

      {showVerificationReport && (
        <div className="mt-3">
          <ApprovalTechnicalReviewSummary
            t={t}
            language={language}
            selectedRecord={app}
            technicalSite={app?.form_data?.technical_site_visit || {}}
            userDepartment="KB(LES)"
          />
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(300px,32%)_1fr]">
        <section className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="flex min-h-[330px] flex-col items-center justify-center gap-3 text-center">
            {canViewLicense(app) ? (
              <>
                <div ref={qrContainerRef} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <QRCodeSVG
                    value={verificationUrl}
                    size={300}
                    level="M"
                    includeMargin
                    className="h-auto max-w-full"
                    role="img"
                    aria-label="License verification QR"
                  />
                </div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{reference}</p>
                <button
                  type="button"
                  onClick={() => downloadDashboardQrCode(qrContainerRef.current, reference)}
                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  <span className="material-symbols-outlined text-[18px]">download</span>
                  {t("common.download", "Download")}
                </button>
              </>
            ) : (
              <p className="max-w-xs text-sm font-medium text-slate-500">
                {t("applicant.qrLicensePending", "QR e-license will be displayed once the license is generated.")}
              </p>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <div className="rounded-md border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-3 py-3">
              <h3 className="text-sm font-semibold text-slate-950">
                {t("admin.dashboard.completedDocumentListTitle", "List of Document")}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {t("applicant.paymentDocumentsDesc", "View the submitted application form and download related documents from ALiS.")}
              </p>
            </div>
            <div className="divide-y divide-slate-200">
              {documents.map((document) => (
                <CompleteDocumentRow key={document.type} document={document} app={app} t={t} />
              ))}
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-3 py-3">
              <h3 className="text-sm font-semibold uppercase text-slate-500">
                {t("workspace.payment.applicantReceipt", "Applicant Receipt")}
              </h3>
            </div>
            {applicantReceipt ? (
              <div className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{applicantReceipt.name}</p>
                  <p className="mt-1 text-xs font-medium text-emerald-700">
                    {t("common.valid", "Valid")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openDashboardPaymentDocument(applicantReceipt.file, t)}
                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    <span className="material-symbols-outlined text-[18px]">visibility</span>
                    {t("common.view", "View")}
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadDashboardPaymentDocument(applicantReceipt.file, applicantReceipt.name, t)}
                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    <span className="material-symbols-outlined text-[18px]">download</span>
                    {t("common.download", "Download")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-3 py-4 text-sm font-medium text-slate-500">
                {t("workspace.payment.noApplicantReceipt", "No applicant receipt available.")}
              </div>
            )}
          </div>
        </section>
      </div>
    </article>
  );
}

function DecisionLogReport({ app, logs, reference, t }) {
  return (
    <section className="mt-3 rounded-md border border-slate-300 bg-white">
      {logs.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-white text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="border-b border-slate-200 px-4 py-3">
                  {t("common.department", "Department")}
                </th>
                <th className="border-b border-slate-200 px-4 py-3">
                  {t("admin.dashboard.decisionLogRecommendation", "Your Recommendation")}
                </th>
                <th className="border-b border-slate-200 px-4 py-3">
                  {t("common.remarks", "Remarks")}
                </th>
                <th className="whitespace-nowrap border-b border-slate-200 px-4 py-3">
                  {t("workspace.signature.title", "Digital Signature")}
                </th>
                <th className="whitespace-nowrap border-b border-slate-200 px-4 py-3">
                  {t("common.date", "Date")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => (
                <tr key={log.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">
                    {formatDecisionLogDepartmentLabel(log.department)}
                  </td>
                  <td className="px-4 py-3">
                    {log.decision ? <StatusPill value={log.decision} /> : null}
                  </td>
                  <td className="min-w-[320px] px-4 py-3 text-slate-700">
                    <p className="whitespace-pre-line leading-5">{log.remarks || "-"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <DecisionLogSignatureCell
                      department={log.department}
                      signature={log.signature}
                      t={t}
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {formatCompactDateTime(log.date)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-4 py-4 text-sm font-medium text-slate-500">
          {t("admin.dashboard.noDecisionLogs", "No DBKU or MPHLG decision records found.")}
        </p>
      )}
    </section>
  );
}

function formatDecisionLogDepartmentLabel(department) {
  const normalizedDepartment = normalizeDepartmentCode(department);
  if (normalizedDepartment === "KU(IKL)") return "Ketua Unit (Iklan)";
  if (normalizedDepartment === "BLG") return "Bangunan (BLG)";
  return department || "-";
}

function DecisionLogSignatureCell({ department, signature, t }) {
  const signatureSource = getDecisionLogSignatureSource(signature);

  if (!signatureSource) {
    return <span className="text-slate-400">-</span>;
  }

  if (isApprovalSupportDecisionLogDepartment(department)) {
    return (
      <DecisionLogSignatureConfirmation
        signature={signature}
        signatureSource={signatureSource}
        t={t}
      />
    );
  }

  return (
    <span
      className="inline-flex min-h-12 min-w-28 items-center justify-center rounded-md border border-slate-200 bg-white p-1.5 shadow-sm"
      title={t("workspace.signature.previewAlt", "Digital signature preview")}
    >
      <img
        src={signatureSource}
        alt={t("workspace.signature.previewAlt", "Digital signature preview")}
        className="max-h-10 max-w-28 object-contain"
      />
    </span>
  );
}

function DecisionLogSignatureConfirmation({ signature, signatureSource, t }) {
  const signatureDetails = signature && typeof signature === "object" ? signature : {};
  const uploadedItems = Array.isArray(signatureDetails.items) ? signatureDetails.items : [];
  const drawPreviewDataUrl =
    signatureDetails.drawDataUrl ||
    (signatureDetails.mode === "draw" ? signatureSource : "");
  const shouldRenderComposedUpload =
    !uploadedItems.length && signatureDetails.mode === "upload" && signatureSource;
  const rows = [
    {
      key: "signatureStamp",
      label: t("workspace.signature.signatureAndStamp", "Signature & Stamp"),
    },
    {
      key: "name",
      label: t("workspace.signature.name", "Name"),
    },
    {
      key: "position",
      label: t("workspace.signature.position", "Position"),
    },
    {
      key: "agency",
      label: t("workspace.signature.agency", "Agency"),
    },
    {
      key: "date",
      label: t("workspace.signature.date", "Date"),
    },
  ];

  return (
    <div className="h-[200px] w-[380px] overflow-hidden">
      <div
        className="w-[760px] rounded border border-dashed border-slate-300 bg-white px-5 py-6 text-[13px] font-semibold leading-5 text-slate-950"
        style={{ transform: "scale(0.5)", transformOrigin: "top left" }}
      >
        <p className="text-[13px] font-bold uppercase leading-5">
          {t("workspace.signature.confirmationTitle", "CONFIRMATION")}
        </p>

        <div className="relative mt-4 grid grid-cols-[minmax(145px,220px)_14px_minmax(0,1fr)] grid-rows-[9rem_repeat(4,2rem)] gap-x-2 gap-y-4">
          {(uploadedItems.length > 0 || shouldRenderComposedUpload) && (
            <div className="pointer-events-none relative z-20 col-start-3 row-start-1 row-span-5 overflow-hidden">
              {uploadedItems.length > 0 ? (
                uploadedItems.map((item, index) => (
                  <img
                    key={item.id || `${item.fileName || "signature"}-${index}`}
                    src={item.dataUrl || signatureSource}
                    alt={t("workspace.signature.previewAlt", "Digital signature preview")}
                    className="absolute max-h-full max-w-full select-none object-contain"
                    draggable={false}
                    style={{
                      left: `${item.x ?? 50}%`,
                      top: `${item.y ?? 50}%`,
                      width: `${item.width ?? 38}%`,
                      transform: "translate(-50%, -50%)",
                    }}
                  />
                ))
              ) : (
                <img
                  src={signatureSource}
                  alt={t("workspace.signature.previewAlt", "Digital signature preview")}
                  className="absolute inset-0 h-full w-full select-none object-fill"
                  draggable={false}
                />
              )}
            </div>
          )}

          <div className="relative col-start-3 row-start-1">
            {drawPreviewDataUrl && (
              <img
                src={drawPreviewDataUrl}
                alt={t("workspace.signature.previewAlt", "Digital signature preview")}
                className="absolute inset-0 z-30 h-full w-full select-none object-fill"
                draggable={false}
              />
            )}
          </div>

          {rows.map((row, index) => (
            <div key={row.key} className="contents">
              <div className="col-start-1 flex items-end" style={{ gridRow: index + 1 }}>
                <p>{row.label}</p>
              </div>
              <span className="col-start-2 flex items-end pb-1" style={{ gridRow: index + 1 }}>:</span>
              <div
                className="col-start-3 flex min-w-0 items-end border-b border-slate-900 pb-1"
                style={{ gridRow: index + 1 }}
              >
                <span className="min-w-0 truncate uppercase">{signatureDetails[row.key] || ""}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CompleteMetaBlock({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-slate-900">{value || "-"}</p>
    </div>
  );
}

function CompleteDocumentRow({ app, document, t }) {
  const hasFile = Boolean(getPaymentDocumentSource(document.file));
  const canRenderLicense = document.type === "advertisement_license" && canViewLicense(app);
  const documentName =
    hasFile || canRenderLicense
      ? document.name
      : t("workspace.payment.missingFile", "Missing file");

  return (
    <div className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold uppercase text-slate-500">{document.label}</p>
        <p className={`mt-1 truncate text-sm font-semibold ${hasFile || canRenderLicense ? "text-slate-900" : "text-slate-500"}`}>
          {documentName}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            hasFile
              ? openDashboardPaymentDocument(document.file, t)
              : openAdvertisementLicenseDocument(app, t)
          }
          disabled={!hasFile && !canRenderLicense}
          className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="material-symbols-outlined text-[18px]">visibility</span>
          {t("common.view", "View")}
        </button>
        <button
          type="button"
          onClick={() => downloadDashboardPaymentDocument(document.file, document.name, t)}
          disabled={!hasFile}
          className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="material-symbols-outlined text-[18px]">download</span>
          {t("common.download", "Download")}
        </button>
      </div>
    </div>
  );
}

function buildAdminRecentActivities(applications, userDepartment, user, t) {
  const activities = applications.flatMap((application) => {
    const logActivities = getImportantApplicationActivities(
      application,
      userDepartment,
      user,
      t
    );

    return logActivities;
  });

  return dedupeRecentActivities(activities).sort((a, b) => {
    const bTime = new Date(b.createdAt || 0).getTime();
    const aTime = new Date(a.createdAt || 0).getTime();
    return bTime - aTime;
  });
}

function filterActivitiesByDate(activities, dateFilter) {
  if (!dateFilter) return activities;

  return activities.filter((activity) => getActivityDateKey(activity.createdAt) === dateFilter);
}

function getActivityDateKey(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function getImportantApplicationActivities(application, userDepartment, user, t) {
  return getApplicationActivityLog(application)
    .filter((activity) => isImportantAdminActivity(activity, userDepartment, user, application))
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

function buildInternalResubmissionInsights(applications, t, language = "en", filters = {}) {
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
        application,
        reference: getApplicationReference(application),
        project: getProjectName(application),
        eventDate: createdAt,
        eventLabel: t("status.rejected", "Rejected"),
        remark: getActivityRemark(activity) || (isRejectedApplication(application) ? getApplicationRemark(application) : ""),
        description: activity.description || "",
        sortDate: createdAt,
      }));
    }

    if (!isRejectedApplication(application)) return [];

    const eventDate = application.updated_at || application.created_at;
    return [{
      type: "rejected",
      applicationId: application.id,
      application,
      reference: getApplicationReference(application),
      project: getProjectName(application),
      eventDate,
      eventLabel: t("status.rejected", "Rejected"),
      remark: getApplicationRemark(application),
      description: "",
      sortDate: eventDate,
    }];
  });

  const resubmittedEntries = applications.flatMap((application) => {
    const activityLog = getApplicationActivityLog(application);
    const resubmissionActivities = getResubmissionActivitiesForRejectedCycles(activityLog);

    return resubmissionActivities
      .map((activity) => {
        const eventDate = activity.created_at || application.updated_at || application.created_at;
        const description = t(
          "admin.dashboard.resubmittedLogDesc",
          "Applicant resubmitted the application to ALiS for review."
        );
        return {
          type: "resubmitted",
          applicationId: application.id,
          application,
          reference: getApplicationReference(application),
          project: getProjectName(application),
          eventDate,
          eventLabel: t("admin.dashboard.resubmitted", "Resubmitted"),
          remark: "",
          description,
          sortDate: eventDate,
        };
      })
      .filter((entry) => entry.eventDate);
  });
  const completeEntries = applications
    .filter(isCompleteApplication)
    .map((application) => {
      const eventDate = getApplicationCompleteDate(application);
      return {
        type: "complete",
        applicationId: application.id,
        application,
        reference: getApplicationReference(application),
        project: getProjectName(application),
        eventDate,
        eventLabel: t("common.complete", "Complete"),
        remark: "",
        description: t(
          "admin.dashboard.completeLogDesc",
          "QR e-license has been generated for this application."
        ),
        sortDate: eventDate,
      };
    })
    .filter((entry) => entry.eventDate);
  const entries = dedupeInternalResubmissionEntries([
    ...rejectedEntries,
    ...resubmittedEntries,
    ...completeEntries,
  ]).sort(
    (a, b) => new Date(b.sortDate || 0).getTime() - new Date(a.sortDate || 0).getTime()
  );
  const filteredEntries = filterResubmissionEntriesForChart(entries, filters, now);

  return {
    totalRejected: filteredEntries.filter((entry) => entry.type === "rejected").length,
    totalResubmitted: filteredEntries.filter((entry) => entry.type === "resubmitted").length,
    totalComplete: filteredEntries.filter((entry) => entry.type === "complete").length,
    buckets: buildResubmissionChartBuckets(entries, now, language, filters),
    entries,
    filteredEntries,
  };
}

function buildResubmissionDrilldownRows(type, insights, t) {
  if (!type) return [];

  const statusConfig = {
    [RESUBMISSION_DRILLDOWN_TYPES.rejected]: {
      label: t("status.rejected", "Rejected"),
      className: "inline-flex rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-700",
    },
    [RESUBMISSION_DRILLDOWN_TYPES.resubmitted]: {
      label: t("admin.dashboard.resubmitted", "Resubmitted"),
      className: "inline-flex rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700",
    },
    [RESUBMISSION_DRILLDOWN_TYPES.complete]: {
      label: t("common.complete", "Complete"),
      className: "inline-flex rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700",
    },
  };
  const config = statusConfig[type] || statusConfig[RESUBMISSION_DRILLDOWN_TYPES.rejected];

  return insights.entries
    .filter((entry) => entry.type === type)
    .map((entry) => ({
      id: `${entry.applicationId}-${entry.type}-${entry.eventDate}`,
      applicationId: entry.applicationId,
      application: entry.application,
      reference: entry.reference,
      applicantName: getRegisteredApplicantName(entry.application),
      project: entry.project,
      remark: entry.remark || "",
      statusLabel: config.label,
      statusClassName: config.className,
      date: entry.eventDate || entry.sortDate,
    }))
    .sort(sortRowsByDateDesc);
}

function getResubmissionApplicationViewPath(applicationId, type, selectedRowId = "") {
  const returnParams = new URLSearchParams({
    view: "dashboard",
    resubmission: type,
  });
  if (type === RESUBMISSION_DRILLDOWN_TYPES.complete && selectedRowId) {
    returnParams.set("completeId", selectedRowId);
  }
  const returnTo = encodeURIComponent(`/dashboard/admin?${returnParams.toString()}`);
  const from = type === RESUBMISSION_DRILLDOWN_TYPES.complete
    ? "completed-approvals"
    : "action-panel";

  return `/admin/applications/${applicationId}/view/step-1?id=${applicationId}&from=${from}&returnTo=${returnTo}`;
}

function filterResubmissionDrilldownRows(rows, filters) {
  const search = String(filters.search || "").trim().toLowerCase();
  const year = Number(filters.year);
  const month = filters.month || RESUBMISSION_MONTH_ALL;

  return rows.filter((row) => {
    const date = new Date(row.date || 0);
    if (!Number.isFinite(date.getTime())) return false;
    if (Number.isFinite(year) && date.getFullYear() !== year) return false;
    if (month !== RESUBMISSION_MONTH_ALL && date.getMonth() !== Number(month)) return false;

    if (!search) return true;
    const searchableText = [
      row.reference,
      row.applicantName,
      row.project,
      row.remark,
      row.statusLabel,
    ]
      .join(" ")
      .toLowerCase();
    return searchableText.includes(search);
  });
}

function buildDrilldownYearOptions(rows, selectedYear = "") {
  const years = new Set([String(new Date().getFullYear())]);
  if (selectedYear) years.add(String(selectedYear));

  rows.forEach((row) => {
    const date = new Date(row.date || 0);
    if (!Number.isFinite(date.getTime())) return;
    years.add(String(date.getFullYear()));
  });

  return Array.from(years).sort((a, b) => Number(b) - Number(a));
}

function sortRowsByDateDesc(a, b) {
  return new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
}

function getCompleteApplicationDocuments(app, t) {
  const approvalLetter = app?.form_data?.approval_letter || {};
  const license = app?.form_data?.license || {};
  const officialReceiptFile = getSentOfficialReceiptFile(app);

  return [
    {
      type: "approval_letter",
      label: t("workspace.payment.approvalLetter", "Approval Letter"),
      name: getDocumentDisplayName(approvalLetter.letter_file, "Approval Letter.pdf"),
      file: approvalLetter.letter_file,
    },
    {
      type: "bill",
      label: t("workspace.payment.billDocument", "Bill"),
      name: getDocumentDisplayName(approvalLetter.bill_file, "Bill.pdf"),
      file: approvalLetter.bill_file,
    },
    {
      type: "official_receipt",
      label: t("workspace.payment.manual.officialReceiptTitle", "Official Receipt"),
      name: getDocumentDisplayName(officialReceiptFile, "Official Receipt.pdf"),
      file: officialReceiptFile,
    },
    {
      type: "advertisement_license",
      label: t("workspace.license.documentTitle", "Advertisement License"),
      name: getDocumentDisplayName(license.license_file, "Advertisement License.pdf"),
      file: license.license_file,
    },
  ];
}

function buildDecisionLogReportRows(app, t) {
  const rows = [];
  const autoScreening = getApplicationSection(app, "auto_screening");
  const technicalReview = getApplicationSection(app, "technical_review");
  const technicalKuReview = getApplicationSection(app, "technical_ku_review");
  const kbLesVerification = getApplicationSection(app, "kb_les_verification");
  const managementRecommendation = getApplicationSection(app, "management_recommendation");
  const mphlgGateway = getApplicationSection(app, "mphlg_gateway");
  const approval = getApplicationSection(app, "approval");
  const approvalLetter = getApplicationSection(app, "approval_letter");
  const payment = getApplicationSection(app, "payment");

  addDecisionLogRow(rows, {
    id: "auto-screening",
    department: getAutoScreeningDecisionDepartment(autoScreening) || "PT(IKL)",
    section: autoScreening,
    decision: getDecisionLogValue(autoScreening),
    remarks: getDecisionLogRemarks(autoScreening),
    date: getDecisionLogDate(autoScreening, ["checked_at", "reviewed_at", "decided_at"]),
    officer: getDecisionLogOfficer(autoScreening, "PT(IKL)"),
  }, t);

  Object.entries(getTechnicalDepartmentReviews(app))
    .filter(([, review]) => review && typeof review === "object")
    .forEach(([department, review]) => {
      addDecisionLogRow(rows, {
        id: `technical-department-${department}`,
        department: normalizeDepartmentCode(department) || department,
        section: review,
        decision: "",
        remarks: getDecisionLogRemarks(review),
        date: getDecisionLogDate(review, ["reviewed_at", "submitted_at", "checked_at"]),
        officer: getDecisionLogOfficer(review, normalizeDepartmentCode(department) || department),
        signature: review.digital_signature,
        useStatusFallback: false,
      }, t);
    });

  addDecisionLogRow(rows, {
    id: "ikl-technical",
    department: "IKL(TECHNICAL)",
    section: technicalReview,
    decision: getDecisionLogValue(technicalReview),
    remarks: getDecisionLogRemarks(technicalReview),
    date: getDecisionLogDate(technicalReview, ["reviewed_at", "submitted_at"]),
    officer: getDecisionLogOfficer(technicalReview, "IKL(TECHNICAL)"),
  }, t);

  addDecisionLogRow(rows, {
    id: "technical-ku-review",
    department: "KU(IKL)",
    section: technicalKuReview,
    decision: getDecisionLogValue(technicalKuReview),
    remarks: getDecisionLogRemarks(technicalKuReview),
    date: getDecisionLogDate(technicalKuReview, ["reviewed_at", "checked_at"]),
    officer: getDecisionLogOfficer(technicalKuReview, "KU(IKL)"),
  }, t);

  addDecisionLogRow(rows, {
    id: "kb-les-verification",
    department: "KB(LES)",
    section: kbLesVerification,
    decision: getDecisionLogValue(kbLesVerification),
    remarks: getDecisionLogRemarks(kbLesVerification),
    date: getDecisionLogDate(kbLesVerification, ["verified_at", "reviewed_at"]),
    officer: getDecisionLogOfficer(kbLesVerification, "KB(LES)"),
  }, t);

  addDecisionLogRow(rows, {
    id: "management-recommendation",
    department: normalizeDepartmentCode(managementRecommendation.officer) || "TP(RES)/PGH",
    section: managementRecommendation,
    decision: getDecisionLogValue(managementRecommendation),
    remarks: getDecisionLogRemarks(managementRecommendation),
    date: getDecisionLogDate(managementRecommendation, ["decided_at", "supported_at", "approval_note_saved_at"]),
    officer: getDecisionLogOfficer(managementRecommendation, "TP(RES)/PGH"),
    signature: managementRecommendation.digital_signature,
  }, t);

  addDecisionLogRow(rows, {
    id: "mphlg-gateway",
    department: "MPHLG",
    section: mphlgGateway,
    decision: getDecisionLogValue(mphlgGateway),
    remarks: getDecisionLogRemarks(mphlgGateway),
    date: getDecisionLogDate(mphlgGateway, ["reviewed_at", "decided_at"]),
    officer: getDecisionLogOfficer(mphlgGateway, "MPHLG"),
  }, t);

  addDecisionLogRow(rows, {
    id: "final-approval",
    department: normalizeDepartmentCode(approval.officer || approval.decided_by) || t("admin.dashboard.finalApproval", "Final Approval"),
    section: approval,
    decision: getDecisionLogValue(approval),
    remarks: getDecisionLogRemarks(approval),
    date: getDecisionLogDate(approval, ["approved_at", "decided_at"]),
    officer: getDecisionLogOfficer(approval, t("admin.dashboard.finalApproval", "Final Approval")),
    signature: approval.digital_signature,
  }, t);

  addDecisionLogRow(rows, {
    id: "payment-receipt-verification",
    department: "PT(IKL)",
    section: payment,
    decision: getPaymentReceiptDecisionLogValue(payment),
    remarks: payment.verification_notes,
    date: getDecisionLogDate(payment, ["verified_at", "rejected_at"]),
    officer: "PT(IKL)",
  }, t);

  addDecisionLogRow(rows, {
    id: "payment-letter-bill",
    department: "PT(IKL)",
    section: approvalLetter,
    decision: approvalLetter.letter_bill_decision || approvalLetter.recommendation,
    remarks: getDecisionLogRemarks(approvalLetter),
    date: getDecisionLogDate(approvalLetter, ["sent_to_applicant_at", "submitted_at"]),
    officer: getDecisionLogOfficer(approvalLetter, "PT(IKL)"),
  }, t);

  return rows
    .filter((row, index, allRows) => {
      const key = [
        row.department,
        row.decision,
        row.remarks,
        row.date,
      ].join("|");
      return allRows.findIndex((item) => [
        item.department,
        item.decision,
        item.remarks,
        item.date,
      ].join("|") === key) === index;
    })
    .sort((a, b) => {
      const aTime = new Date(a.date || 0).getTime();
      const bTime = new Date(b.date || 0).getTime();
      return aTime - bTime;
    });
}

function addDecisionLogRow(rows, row, t) {
  const section = row.section && typeof row.section === "object" ? row.section : {};
  const decision = cleanRemark(row.decision);
  const remarks = cleanRemark(row.remarks);
  const date = cleanRemark(row.date);
  const status = String(section.status || "").trim().toLowerCase();
  const hasCompletedSignal =
    decision ||
    remarks ||
    date ||
    section.memo_html ||
    section.approval_note_html;

  if (!hasCompletedSignal || status.includes("pending")) return;

  rows.push({
    id: row.id,
    department: row.department || "-",
    decision: formatDecisionLogRecommendation(
      decision || (row.useStatusFallback === false ? "" : formatWorkflowStatus(section.status || "")),
      row.department,
      section,
      t
    ),
    remarks,
    date,
    officer: cleanRemark(row.officer),
    signature: row.signature || section.digital_signature || null,
  });
}

function getDecisionLogSignatureSource(signature) {
  if (!signature) return "";
  if (typeof signature === "string") return signature;
  if (typeof signature !== "object") return "";

  return String(
    signature.dataUrl ||
      signature.data_url ||
      signature.url ||
      signature.file_url ||
      signature.preview_url ||
      signature.source ||
      ""
  ).trim();
}

function isApprovalSupportDecisionLogDepartment(department) {
  return APPROVAL_SUPPORT_DEPARTMENTS.has(normalizeDepartmentCode(department));
}

function getAutoScreeningDecisionDepartment(section = {}) {
  const decision = getDecisionLogValue(section);
  if (decision.includes("KU(IKL)")) return "KU(IKL)";
  if (decision.includes("PT(IKL)")) return "PT(IKL)";
  return normalizeDepartmentCode(section.officer || section.checked_by || section.department);
}

function getDecisionLogValue(section = {}) {
  if (!section || typeof section !== "object") return "";

  return String(
    section.recommendation ||
      section.final_decision ||
      section.decision ||
      section.result ||
      section.status ||
      ""
  ).trim();
}

function formatDecisionLogRecommendation(value, department = "", section = {}, t = (key, fallback) => fallback || key) {
  const decision = cleanRemark(value);
  if (!decision) return "";

  const normalized = decision.toLowerCase();
  const normalizedDepartment = normalizeDepartmentCode(department);

  const routeRecommendationMap = {
    "pt(ikl) send to ku(ikl)": t("workspace.decision.approve", "Approve"),
    "pt(ikl) hantar kepada ku(ikl)": t("workspace.decision.approve", "Approve"),
    "ku(ikl) confirm - send to technical units": t("workspace.decision.approve", "Approve"),
    "ku(ikl) confirm - send to ikl(technical)": t("workspace.decision.approve", "Approve"),
    "ku(ikl) sahkan - hantar kepada ikl(technical)": t("workspace.decision.approve", "Approve"),
    "ku(ikl) confirm - send to kb(les)": t("workspace.decision.approve", "Approve"),
    "ku(ikl) request technical amendment": t("workspace.decision.kuRequestTechnicalAmendment", "Request Amendment"),
    "technical amendment required": t("workspace.decision.kuRequestTechnicalAmendment", "Request Amendment"),
    "pt(ikl) reject to applicant": t("workspace.decision.reject", "Reject"),
    "ku(ikl) reject to applicant": t("workspace.decision.reject", "Reject"),
    "verified - sent to kb(les)": t("workspace.decision.verify", "Verify"),
    "submit letter & bill": t("workspace.decision.generateApprovalLetterBill", "Generate Approval Letter & Bill"),
    "hantar surat & bil": t("workspace.decision.generateApprovalLetterBill", "Generate Approval Letter & Bill"),
    "generate approval letter & bill": t("workspace.decision.generateApprovalLetterBill", "Generate Approval Letter & Bill"),
    "jana surat kelulusan & bil": t("workspace.decision.generateApprovalLetterBill", "Generate Approval Letter & Bill"),
  };

  if (routeRecommendationMap[normalized]) {
    return routeRecommendationMap[normalized];
  }

  if (TECHNICAL_LOG_DEPARTMENTS.has(normalizedDepartment)) {
    if (["supported", "support", "yes", "y", "ya"].includes(normalized)) {
      return t("workspace.decision.yes", "Yes");
    }

    if (["not supported", "not support", "no", "n", "tidak"].includes(normalized)) {
      return t("workspace.decision.no", "No");
    }
  }

  if (APPROVAL_SUPPORT_DEPARTMENTS.has(normalizedDepartment)) {
    if (["approve", "approved"].includes(normalized)) {
      return t("workspace.decision.support", "Support");
    }

    if (["reject", "rejected", "not support", "not supported"].includes(normalized)) {
      return t("workspace.decision.notSupport", "Not Support");
    }
  }

  if (
    normalizedDepartment === "KU(IKL)" &&
    normalized.includes("confirm") &&
    normalized.includes("technical")
  ) {
    return t("workspace.decision.approve", "Approve");
  }

  if (
    normalizedDepartment === "KU(IKL)" &&
    normalized.includes("confirm") &&
    normalized.includes("kb(les)")
  ) {
    return t("workspace.decision.approve", "Approve");
  }

  if (normalized.includes("reject") && normalized.includes("applicant")) {
    return t("workspace.decision.reject", "Reject");
  }

  if (normalized.includes("amendment")) {
    return t("workspace.decision.kuRequestTechnicalAmendment", "Request Amendment");
  }

  return decision;
}

function getPaymentReceiptDecisionLogValue(payment = {}) {
  if (!payment || typeof payment !== "object") return "";

  const explicitDecision = cleanRemark(
    payment.recommendation ||
      payment.decision ||
      payment.verification_decision ||
      payment.receipt_decision
  );
  if (explicitDecision) return explicitDecision;

  const result = String(payment.verification_result || "").trim().toLowerCase();
  const status = String(payment.status || "").trim().toLowerCase();

  if (result === "valid" || status === "payment verified") {
    return "Verify Receipt";
  }

  if (
    result.includes("invalid") ||
    result.includes("fake") ||
    status === "receipt rejected"
  ) {
    return "Reject Receipt";
  }

  return "";
}

function getDecisionLogRemarks(section = {}) {
  if (!section || typeof section !== "object") return "";

  const plainRemark =
    section.remarks ||
    section.comment ||
    section.notes ||
    section.site_remarks ||
    section.findings ||
    "";
  const memoText =
    section.approval_note_html ||
    section.memo_html ||
    "";

  return cleanRemark(plainRemark) || htmlToPlainDecisionLogText(memoText);
}

function getDecisionLogDate(section = {}, keys = []) {
  if (!section || typeof section !== "object") return "";

  return keys.map((key) => section[key]).find(Boolean) || "";
}

function getDecisionLogOfficer(section = {}, fallback = "") {
  if (!section || typeof section !== "object") return fallback;

  return (
    section.officer ||
    section.reviewed_by ||
    section.checked_by ||
    section.decided_by ||
    section.approved_by ||
    section.submitted_by ||
    section.approval_note_saved_by ||
    fallback
  );
}

function htmlToPlainDecisionLogText(value) {
  const source = String(value || "").trim();
  if (!source) return "";

  if (typeof document === "undefined") {
    return cleanRemark(source.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
  }

  const container = document.createElement("div");
  container.innerHTML = source;
  return cleanRemark(container.textContent || container.innerText || "");
}

function getApplicantReceiptDocument(app, t) {
  const receiptFile = app?.form_data?.payment?.receipt_file || null;
  if (!getPaymentDocumentSource(receiptFile)) return null;

  return {
    file: receiptFile,
    name: getDocumentDisplayName(receiptFile, t("workspace.payment.receiptFileName", "receipt.pdf")),
  };
}

function getSentOfficialReceiptFile(app) {
  const file = app?.form_data?.approval_letter?.official_receipt_file || null;
  if (!getPaymentDocumentSource(file)) return null;

  const status = normalizeStatus(app?.status);
  if (
    file.sent_at ||
    file.status === "Sent to Applicant" ||
    ["payment_verified", "license_issued", "license_revoked"].includes(status)
  ) {
    return file;
  }

  return null;
}

function getPaymentDocumentSource(file) {
  return file?.dataUrl || file?.url || file?.file_url || file?.file || "";
}

function getDocumentDisplayName(file, fallbackName) {
  return file?.name || fallbackName;
}

async function openDashboardPaymentDocument(file, t) {
  const source = getPaymentDocumentSource(file);
  if (!source) return;

  try {
    const isInlineFile = source.startsWith("blob:") || source.startsWith("data:");
    const url = isInlineFile
      ? source
      : URL.createObjectURL(await fetchAuthenticatedBlob(source));

    window.open(url, "_blank");

    if (!isInlineFile) {
      window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
    }
  } catch (err) {
    console.error("Failed to open completed application document:", err);
    window.alert(t("workspace.payment.documentViewFailed", "Unable to open the document. Please try again."));
  }
}

async function downloadDashboardPaymentDocument(file, fallbackLabel, t) {
  const source = getPaymentDocumentSource(file);
  if (!source) return;

  try {
    const isInlineFile = source.startsWith("blob:") || source.startsWith("data:");
    const url = isInlineFile
      ? source
      : URL.createObjectURL(await fetchAuthenticatedBlob(source));
    const filename = getDownloadFilename(file?.name || fallbackLabel, "pdf");

    triggerDownload(url, filename);

    if (!isInlineFile) {
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  } catch (err) {
    console.error("Failed to download completed application document:", err);
    window.alert(t("workspace.payment.documentViewFailed", "Unable to open the document. Please try again."));
  }
}

function getDashboardLicenseVerificationUrl(licenseId) {
  const runtimeOrigin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "";
  const configuredOrigin = String(import.meta.env.VITE_FRONTEND_URL || "").replace(/\/+$/, "");
  let origin = runtimeOrigin;

  try {
    const runtimeHost = new URL(runtimeOrigin).hostname.toLowerCase();
    if (["localhost", "127.0.0.1", "0.0.0.0"].includes(runtimeHost)) {
      origin = configuredOrigin || runtimeOrigin;
    }
  } catch {
    origin = configuredOrigin || runtimeOrigin;
  }

  return `${origin}/license/verify/${encodeURIComponent(licenseId)}`;
}

function getQrSvgBlob(qrContainer) {
  const svg = qrContainer?.querySelector?.("svg");
  if (!svg) return null;

  const clone = svg.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return new Blob([new XMLSerializer().serializeToString(clone)], {
    type: "image/svg+xml;charset=utf-8",
  });
}

async function downloadDashboardQrCode(qrContainer, reference) {
  const blob = getQrSvgBlob(qrContainer);
  if (!blob) return;

  const sourceUrl = URL.createObjectURL(blob);

  try {
    const image = new Image();
    image.src = sourceUrl;
    await image.decode();

    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 720;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!pngBlob) return;

    const downloadUrl = URL.createObjectURL(pngBlob);
    triggerDownload(downloadUrl, `${reference || "e-license"}-qr.png`);
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 60000);
  } catch (err) {
    console.error("Failed to download QR code:", err);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function triggerDownload(url, filename) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function getDownloadFilename(value, fallbackExtension) {
  const raw = String(value || "document").trim() || "document";
  const normalized = raw
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  const extension = String(fallbackExtension || "").replace(/^\./, "");

  if (!extension || /\.[a-z0-9]{2,8}$/i.test(normalized)) {
    return normalized || `document.${extension}`;
  }

  return `${normalized}.${extension}`;
}

function getResubmissionDrilldownTitle(type, t) {
  if (type === RESUBMISSION_DRILLDOWN_TYPES.complete) {
    return t("admin.dashboard.completeApplicationsTitle", "Complete Applications");
  }
  if (type === RESUBMISSION_DRILLDOWN_TYPES.resubmitted) {
    return t("admin.dashboard.resubmittedApplicationsTitle", "Resubmitted Applications");
  }
  return t("admin.dashboard.rejectedApplicationsTitle", "Rejected Applications");
}

function getResubmissionDrilldownDescription(type, t) {
  if (type === RESUBMISSION_DRILLDOWN_TYPES.complete) {
    return t("admin.dashboard.completeApplicationsDesc", "Applications completed through QR e-license generation.");
  }
  if (type === RESUBMISSION_DRILLDOWN_TYPES.resubmitted) {
    return t("admin.dashboard.resubmittedApplicationsDesc", "Applications resubmitted by applicants for review.");
  }
  return t("admin.dashboard.rejectedApplicationsDesc", "Rejected application records with remarks.");
}

function buildResubmissionChartBuckets(entries, now, language = "en", filters = {}) {
  if (filters.month && filters.month !== RESUBMISSION_MONTH_ALL) {
    return buildResubmissionDailyBuckets(entries, now, filters);
  }

  return buildResubmissionMonthlyBuckets(entries, now, language, filters);
}

function buildResubmissionMonthlyBuckets(entries, now, language = "en", filters = {}) {
  const locale = language === "ms" ? "ms-MY" : "en-MY";
  const formatter = new Intl.DateTimeFormat(locale, { month: "short" });
  const year = getFilterYear(filters, now);
  const months = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(year, index, 1);
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: formatter.format(date),
      rejected: 0,
      resubmitted: 0,
      complete: 0,
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
    } else if (entry.type === "complete") {
      bucket.complete += 1;
    }
  });

  return months;
}

function buildResubmissionDailyBuckets(entries, now, filters = {}) {
  const year = getFilterYear(filters, now);
  const monthIndex = Number(filters.month);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    return {
      key: `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      label: String(day),
      rejected: 0,
      resubmitted: 0,
      complete: 0,
    };
  });
  const dayMap = new Map(days.map((day) => [day.key, day]));

  entries.forEach((entry) => {
    const date = new Date(entry.eventDate || entry.sortDate);
    if (!Number.isFinite(date.getTime())) return;
    if (date.getFullYear() !== year || date.getMonth() !== monthIndex) return;

    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const bucket = dayMap.get(key);
    if (!bucket) return;

    if (entry.type === "rejected") {
      bucket.rejected += 1;
    } else if (entry.type === "resubmitted") {
      bucket.resubmitted += 1;
    } else if (entry.type === "complete") {
      bucket.complete += 1;
    }
  });

  return days;
}

function filterResubmissionEntriesForChart(entries, filters = {}, now = new Date()) {
  const year = getFilterYear(filters, now);
  const monthFilter = filters.month || RESUBMISSION_MONTH_ALL;

  return entries.filter((entry) => {
    const date = new Date(entry.eventDate || entry.sortDate);
    if (!Number.isFinite(date.getTime())) return false;
    if (date.getFullYear() !== year) return false;
    if (monthFilter === RESUBMISSION_MONTH_ALL) return true;
    return date.getMonth() === Number(monthFilter);
  });
}

function buildResubmissionYearOptions(entries, selectedYear = "") {
  const years = new Set([String(new Date().getFullYear())]);
  if (selectedYear) years.add(String(selectedYear));

  entries.forEach((entry) => {
    const date = new Date(entry.eventDate || entry.sortDate);
    if (!Number.isFinite(date.getTime())) return;
    years.add(String(date.getFullYear()));
  });

  return Array.from(years).sort((a, b) => Number(b) - Number(a));
}

function getFilterYear(filters = {}, now = new Date()) {
  const year = Number(filters.year);
  return Number.isFinite(year) ? year : now.getFullYear();
}

function getResubmissionMonthOptions(language = "en") {
  const locale = language === "ms" ? "ms-MY" : "en-MY";
  const formatter = new Intl.DateTimeFormat(locale, { month: "long" });

  return Array.from({ length: 12 }, (_, index) => ({
    value: String(index),
    label: formatter.format(new Date(2026, index, 1)),
  }));
}

function dedupeInternalResubmissionEntries(entries) {
  const seen = new Set();

  return entries.filter((entry) => {
    const eventTime = new Date(entry.eventDate || entry.sortDate || 0).getTime();
    const eventMinute = Number.isFinite(eventTime)
      ? Math.floor(eventTime / 60000)
      : String(entry.eventDate || entry.sortDate || "");
    const key = [
      entry.applicationId,
      entry.type,
      eventMinute,
    ].join(":");

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isRejectedActivity(activity) {
  const title = String(activity?.title || "").trim().toLowerCase();
  return title === "application rejected" || title.startsWith("application rejected by");
}

function getResubmissionActivitiesForRejectedCycles(activityLog) {
  const sortedActivities = [...activityLog]
    .map((activity) => ({
      activity,
      timestamp: getActivityTimestamp(activity),
    }))
    .filter((item) => Number.isFinite(item.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);
  const rejectedActivities = sortedActivities.filter((item) => isRejectedActivity(item.activity));

  return rejectedActivities
    .map((rejectedItem, index) => {
      const nextRejectedTime = rejectedActivities[index + 1]?.timestamp || Infinity;
      const cycleCandidates = sortedActivities.filter((item) => {
        if (item.timestamp <= rejectedItem.timestamp || item.timestamp >= nextRejectedTime) {
          return false;
        }

        return isResubmissionActivity(item.activity) || isSubmissionActivity(item.activity);
      });
      const explicitResubmission = cycleCandidates.find((item) =>
        isResubmissionActivity(item.activity)
      );

      return (explicitResubmission || cycleCandidates[0])?.activity || null;
    })
    .filter(Boolean);
}

function getActivityTimestamp(activity) {
  const timestamp = new Date(activity?.created_at || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : NaN;
}

function isResubmissionActivity(activity) {
  return String(activity?.title || "").trim().toLowerCase() === "application resubmitted";
}

function isSubmissionActivity(activity) {
  return String(activity?.title || "").trim().toLowerCase() === "application submitted";
}

function getActivityRemark(activity) {
  const explicitRemark =
    activity?.remark ||
    activity?.remarks ||
    activity?.metadata?.remark ||
    activity?.metadata?.remarks;
  const cleanedExplicitRemark = cleanRemark(explicitRemark);
  if (cleanedExplicitRemark) return cleanedExplicitRemark;

  const description = String(activity?.description || "");
  const remarkMatch = description.match(/\bRemark:\s*(.+)$/i);
  return cleanRemark(remarkMatch?.[1] || "");
}

function isRejectedApplication(application) {
  return ["incomplete", "rejected"].includes(normalizeStatus(application?.status));
}

function isCompleteApplication(application) {
  return normalizeStatus(application?.status) === "license_issued";
}

function getApplicationCompleteDate(application) {
  const license = application?.form_data?.license || {};
  return (
    license.issued_at ||
    license.issue_date ||
    application?.updated_at ||
    application?.created_at ||
    ""
  );
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

function formatActivityProjectText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+(\d+\.\s+)/g, "\n$1");
}

function isImportantAdminActivity(activity, userDepartment, user, application = null) {
  const title = String(activity?.title || "").trim().toLowerCase();
  const category = String(activity?.category || "").trim().toLowerCase();
  const actorDepartment = getActivityDepartment(activity);

  if (!title || title.endsWith(" details saved")) return false;
  if (title.includes("uploaded") || title.includes("removed")) return false;
  if (!isActivityForCurrentStaffUser(activity, user)) return false;

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

function isMphlgReviewComplete(application) {
  const section = getApplicationSection(application, "mphlg_gateway");
  const status = String(section?.status || "").trim().toLowerCase();
  const decision = String(section?.decision || section?.recommendation || "").trim();

  if (status.includes("pending mphlg")) return false;

  return (
    ["approved", "reviewed", "completed"].includes(status) ||
    Boolean(decision || section?.reviewed_at || section?.decided_at)
  );
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
      if (activeDepartment === "MPHLG") {
        return unit.department === "MPHLG";
      }

      if (APPROVAL_WORKFLOW_DEPARTMENTS.has(activeDepartment)) {
        return APPROVAL_PROCESS_LIST_DEPARTMENTS.has(unit.department);
      }

      if (APPROVAL_WORKFLOW_DEPARTMENTS.has(unit.department)) {
        return false;
      }

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
        bodyClassName="p-0"
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
                <span className="font-semibold text-emerald-700">
                  {getApplicationReference(application)}
                </span>
              ),
            },
            {
              key: "applicant",
              label: t("workspace.license.applicantName", "Applicant Name"),
              className: "w-[16%] min-w-[12rem]",
              render: (application) => (
                <span className="font-medium text-slate-700">
                  {getRegisteredApplicantName(application) || "-"}
                </span>
              ),
            },
            {
              key: "project",
              label: t("common.project"),
              className: "w-[36%] min-w-[18rem]",
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
    <div className="bg-white">
      <DataTable {...props} rows={visibleRows} framed={false} />
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
  if (APPROVAL_WORKFLOW_DEPARTMENTS.has(unit.department)) {
    return (
      isAssignedDepartment &&
      isApprovalPersonalTaskForDepartment(application, unit.department)
    );
  }

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

  if (APPROVAL_WORKFLOW_DEPARTMENTS.has(unit.department)) {
    return isApprovalPersonalTaskForDepartment(application, unit.department);
  }

  if (EXTERNAL_TECHNICAL_DEPARTMENTS.has(unit.department)) {
    return (
      isUnitActionableApplication(application, unit, activeDepartment) ||
      hasTechnicalDepartmentReview(application, unit.department)
    );
  }

  return true;
}

function isActivityForCurrentStaffUser(activity, user) {
  const actorId = activity?.actor_id;
  const userId = user?.id;

  if (actorId !== undefined && actorId !== null && String(actorId) !== "") {
    return userId !== undefined && userId !== null && String(actorId) === String(userId);
  }

  return false;
}

function isApprovalPersonalTaskForDepartment(application, department) {
  const status = normalizeStatus(application?.status);

  if (department === "KB(LES)") {
    return status === "management_review" && !isKbLesVerified(application);
  }

  if (APPROVAL_SUPPORT_DEPARTMENTS.has(department)) {
    return (
      status === "management_review" &&
      isKbLesVerified(application) &&
      !hasManagementSupport(application)
    );
  }

  if (department === "MPHLG") {
    return status === "mphlg_processing" && !isMphlgReviewComplete(application);
  }

  return false;
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
  const department = unit?.department;

  if (department === "KU(IKL)" && status === "submitted") {
    return t("status.ku_ikl_review", "KU(IKL) Review");
  }

  if (department === "KU(IKL)" && status === "technical_review_completed") {
    return t("status.technical_ku_review", "Pending KU(IKL) Final Check");
  }

  if (department === "IKL (TECHNICAL)" && status === "technical_review_completed") {
    return t("admin.dashboard.statusReviewSubmitted", "Review Submitted");
  }

  if (department === "IKL (TECHNICAL)" && TECHNICAL_DEPARTMENT_STATUS_SET.has(status)) {
    return t("status.ikl_technical_review", "IKL(TECH) Review");
  }

  if (status === "payment_submitted") {
    return t("status.receipt_review", "Receipt Review");
  }

  if (EXTERNAL_TECHNICAL_DEPARTMENTS.has(department) && TECHNICAL_DEPARTMENT_STATUS_SET.has(status)) {
    if (hasTechnicalDepartmentReview(application, department)) {
      if (status === "technical_site_visit") {
        return t("admin.dashboard.statusSentToIklTechnical", "Sent to IKL(TECH)");
      }

      return t("admin.dashboard.statusReviewSubmitted", "Review Submitted");
    }

    return t("admin.dashboard.statusUnitReview", "{department} Review").replace(
      "{department}",
      department
    );
  }

  if (status === "management_review") {
    if (department === "KB(LES)" && !isKbLesVerified(application)) {
      return t("workspace.approval.stageKbVerification", "Pending KB(LES) Verification");
    }

    if (
      APPROVAL_SUPPORT_DEPARTMENTS.has(department) &&
      isKbLesVerified(application) &&
      !hasManagementSupport(application)
    ) {
      return t("workspace.approval.stageSupport", "Pending TP(RES)/PGH Final Approval");
    }
  }

  return t(`status.${status}`, formatWorkflowStatus(status));
}

export default AdminDashboard;
