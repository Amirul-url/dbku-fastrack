import { useEffect, useMemo, useState } from "react";
import AdminDashboardLayout from "../../../layout/AdminDashboardLayout";
import { useLanguage } from "../../../context/LanguageContext";
import { apiRequest, getStoredUser } from "../../../services/api";
import { enrichApplicationListApplicantNames } from "../../../utils/applicationList";
import {
  Alert,
  Button,
  DataTable,
  Field,
  LinkButton,
  Panel,
  StatusPill,
} from "../../../components/ui/SystemUI";
import {
  formatCompactDateTime,
  formatWorkflowStatus,
  getApplicationReference,
  getApplicationType,
  getProjectName,
  normalizeStatus,
} from "../../../utils/workflow";

const APPROVAL_SUPPORT_DEPARTMENTS = new Set(["TP(RES)", "PGH", "TP(RES)/PGH", "TP/PGH"]);
const APPROVED_WORKFLOW_STATUSES = new Set([
  "approved",
  "approved_with_conditions",
  "bill_pending_ku",
  "invoice_generated",
  "payment_submitted",
  "payment_verified",
  "license_issued",
  "license_revoked",
]);

function CompletedApprovalsPage() {
  const { t } = useLanguage();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [decision, setDecision] = useState("");
  const userDepartment = normalizeDepartmentCode(getStoredUser()?.department);

  useEffect(() => {
    let active = true;

    async function fetchApplications({ silent = false } = {}) {
      try {
        if (!silent) setLoading(true);
        setError("");
        const data = await apiRequest("/applications/");
        const list = Array.isArray(data) ? data : data?.results || [];
        const enrichedList = await enrichApplicationListApplicantNames(list, (id) =>
          apiRequest(`/applications/${id}/`)
        );
        if (active) setApplications(enrichedList);
      } catch (err) {
        if (active) {
          setError(err.message || "Failed to load completed approvals.");
        }
      } finally {
        if (active && !silent) setLoading(false);
      }
    }

    const handleRefresh = () => fetchApplications({ silent: true });
    const initialTimer = window.setTimeout(fetchApplications, 0);
    window.addEventListener("fastrack:applications-changed", handleRefresh);
    const interval = window.setInterval(handleRefresh, 15000);

    return () => {
      active = false;
      window.clearTimeout(initialTimer);
      window.removeEventListener("fastrack:applications-changed", handleRefresh);
      window.clearInterval(interval);
    };
  }, []);

  const completedRecords = useMemo(() => {
    return applications
      .filter((app) => isCompletedApprovalForDepartment(app, userDepartment))
      .sort((a, b) => getRecordTime(b) - getRecordTime(a));
  }, [applications, userDepartment]);

  const yearOptions = useMemo(() => {
    return Array.from(
      new Set(
        completedRecords
          .map((app) => getCompletionDate(app)?.getFullYear())
          .filter(Boolean)
      )
    ).sort((a, b) => b - a);
  }, [completedRecords]);

  const filteredRecords = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    return completedRecords.filter((app) => {
      const completedAt = getCompletionDate(app);
      const decisionValue = getApprovalDecision(app);
      const haystack = [
        getApplicationReference(app),
        getApplicationType(app),
        getProjectName(app),
        formatWorkflowStatus(app.status),
        decisionValue,
      ]
        .join(" ")
        .toLowerCase();

      if (q && !haystack.includes(q)) return false;
      if (decision && decisionValue !== decision) return false;
      if (month && (!completedAt || String(completedAt.getMonth() + 1) !== month)) return false;
      if (year && (!completedAt || String(completedAt.getFullYear()) !== year)) return false;

      return true;
    });
  }, [completedRecords, decision, keyword, month, year]);

  function resetFilters() {
    setKeyword("");
    setMonth("");
    setYear("");
    setDecision("");
  }

  return (
    <AdminDashboardLayout>
      <Alert message={error} />

      <Panel
        title={t("approval.completed.title", "Completed Approvals")}
        description={t(
          "approval.completed.description",
          "Review approval decisions completed by TP(RES)/PGH, with filters for month, year, approved, and rejected records."
        )}
      >
        <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(240px,1fr)_160px_160px_180px_auto] lg:items-end">
          <Field label={t("common.search")}>
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              className="form-input"
              placeholder={t("approval.completed.searchPlaceholder", "Search reference, type, project, or status")}
            />
          </Field>

          <Field label={t("common.month")}>
            <select
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="form-input"
            >
              <option value="">{t("common.allMonths")}</option>
              {getMonthOptions(t).map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t("common.year")}>
            <select
              value={year}
              onChange={(event) => setYear(event.target.value)}
              className="form-input"
            >
              <option value="">{t("common.allYears")}</option>
              {yearOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t("common.status")}>
            <select
              value={decision}
              onChange={(event) => setDecision(event.target.value)}
              className="form-input"
            >
              <option value="">{t("common.allStatuses")}</option>
              <option value="Approved">{t("workspace.decision.approved", "Approved")}</option>
              <option value="Rejected">{t("workspace.decision.rejected", "Rejected")}</option>
            </select>
          </Field>

          <Button
            type="button"
            variant="secondary"
            icon="filter_alt_off"
            onClick={resetFilters}
            className="w-full lg:w-auto"
          >
            {t("common.reset")}
          </Button>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-3 text-[14px] font-medium leading-5 text-slate-600">
          <span>
            {t("approval.completed.recordsFound", "{count} record(s) found.").replace(
              "{count}",
              String(filteredRecords.length)
            )}
          </span>
          <span className="text-slate-300">/</span>
          <span>
            {t("approval.completed.totalRecords", "{count} total completed.").replace(
              "{count}",
              String(completedRecords.length)
            )}
          </span>
        </div>

        <DataTable
          loading={loading}
          rows={filteredRecords}
          emptyText={t("approval.completed.empty", "No completed approval records found.")}
          columns={[
            {
              key: "reference",
              label: t("common.reference"),
              render: (app) => (
                <span className="font-semibold text-slate-900">
                  {getApplicationReference(app)}
                </span>
              ),
            },
            { key: "type", label: t("common.type"), render: getApplicationType },
            { key: "project", label: t("common.project"), render: getProjectName },
            {
              key: "decision",
              label: t("common.status"),
              render: (app) => <StatusPill value={getApprovalDecision(app)} />,
            },
            {
              key: "completed",
              label: t("approval.completed.completedOn", "Completed On"),
              render: (app) => (
                <span className="whitespace-nowrap text-[12px] leading-5">
                  {formatCompactDateTime(getCompletionDate(app))}
                </span>
              ),
            },
            {
              key: "action",
              label: t("common.action"),
              render: (app) => (
                <LinkButton
                  to={`/dashboard/admin?view=approval&id=${app.id}&from=completed-approvals&returnTo=/dashboard/admin?view=completed`}
                  icon="visibility"
                  variant="secondary"
                  className="min-h-8 px-3 py-1 text-xs"
                >
                  {t("common.view")}
                </LinkButton>
              ),
            },
          ]}
        />
      </Panel>
    </AdminDashboardLayout>
  );
}

function getMonthOptions(t) {
  const labels = [
    t("month.january", "January"),
    t("month.february", "February"),
    t("month.march", "March"),
    t("month.april", "April"),
    t("month.may", "May"),
    t("month.june", "June"),
    t("month.july", "July"),
    t("month.august", "August"),
    t("month.september", "September"),
    t("month.october", "October"),
    t("month.november", "November"),
    t("month.december", "December"),
  ];

  return labels.map((label, index) => ({
    value: String(index + 1),
    label,
  }));
}

function isCompletedApprovalForDepartment(app, department) {
  if (!APPROVAL_SUPPORT_DEPARTMENTS.has(department)) {
    return false;
  }

  const approval = getApplicationSection(app, "approval");
  const managementRecommendation = getApplicationSection(app, "management_recommendation");
  const decisionDepartment = normalizeDepartmentCode(
    approval.decided_by ||
      managementRecommendation.officer ||
      managementRecommendation.decided_by
  );
  const finalDecision = getApprovalDecision(app);
  const status = normalizeStatus(app?.status);
  const departmentMatches =
    !decisionDepartment || APPROVAL_SUPPORT_DEPARTMENTS.has(decisionDepartment);

  return (
    departmentMatches &&
    ["Approved", "Rejected"].includes(finalDecision) &&
    (
      hasApplicationSection(app, "approval") ||
      APPROVED_WORKFLOW_STATUSES.has(status) ||
      status === "rejected"
    )
  );
}

function getApprovalDecision(app) {
  const approval = getApplicationSection(app, "approval");
  const managementRecommendation = getApplicationSection(app, "management_recommendation");
  const status = normalizeStatus(app?.status);
  const rawDecision =
    approval.final_decision ||
    approval.status ||
    managementRecommendation.decision ||
    managementRecommendation.status ||
    status;
  const normalizedDecision = String(rawDecision || "").trim().toLowerCase();

  if (normalizedDecision.includes("reject") || status === "rejected") {
    return "Rejected";
  }

  if (
    normalizedDecision.includes("approve") ||
    normalizedDecision.includes("support") ||
    APPROVED_WORKFLOW_STATUSES.has(status)
  ) {
    return "Approved";
  }

  return formatWorkflowStatus(rawDecision);
}

function getCompletionDate(app) {
  const approval = getApplicationSection(app, "approval");
  const managementRecommendation = getApplicationSection(app, "management_recommendation");
  const rawDate =
    approval.decided_at ||
    approval.approved_at ||
    managementRecommendation.decided_at ||
    app?.updated_at ||
    app?.created_at;
  const date = new Date(rawDate);

  return Number.isNaN(date.getTime()) ? null : date;
}

function getRecordTime(app) {
  return getCompletionDate(app)?.getTime() || 0;
}

function getApplicationSection(app, key) {
  const section = app?.[key] || app?.form_data?.[key] || {};
  return section && typeof section === "object" ? section : {};
}

function hasApplicationSection(app, key) {
  return Object.keys(getApplicationSection(app, key)).length > 0;
}

function normalizeDepartmentCode(value) {
  const department = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[.]+$/g, "")
    .replace(/-/g, " ")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ");

  if (department === "TP RES" || department === "TP(RES)") return "TP(RES)";
  if (department === "TP RES/PGH" || department === "TP(RES)/PGH") return "TP(RES)/PGH";
  return department;
}

export default CompletedApprovalsPage;
