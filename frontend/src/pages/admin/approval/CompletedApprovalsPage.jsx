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
const TECHNICAL_DEPARTMENTS = new Set(["BLG", "GPM", "MNE", "IMT", "LNP", "ENG"]);
const COMPLETED_VIEW_DEPARTMENTS = new Set([
  "PT(IKL)",
  "KU(IKL)",
  "IKL (TECHNICAL)",
  "BLG",
  "GPM",
  "MNE",
  "IMT",
  "LNP",
  "ENG",
  "KB(LES)",
  "TP(RES)",
  "PGH",
  "TP(RES)/PGH",
  "TP/PGH",
  "MPHLG",
  "SUT",
]);
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
      const decisionValue = getDepartmentDecision(app, userDepartment);
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
  }, [completedRecords, decision, keyword, month, userDepartment, year]);

  const decisionOptions = useMemo(() => {
    return Array.from(
      new Set(completedRecords.map((app) => getDepartmentDecision(app, userDepartment)).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
  }, [completedRecords, userDepartment]);

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
              {decisionOptions.map((item) => (
                <option key={item} value={item}>
                  {formatDecisionLabel(item, t)}
                </option>
              ))}
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
              render: (app) => (
                <StatusPill
                  value={formatDecisionLabel(getDepartmentDecision(app, userDepartment), t)}
                />
              ),
            },
            {
              key: "completed",
              label: t("approval.completed.completedOn", "Completed On"),
              render: (app) => (
                <span className="whitespace-nowrap text-[12px] leading-5">
                  {formatCompactDateTime(getCompletionDate(app, userDepartment))}
                </span>
              ),
            },
            {
              key: "action",
              label: t("common.action"),
              render: (app) => (
                <LinkButton
                  to={getCompletedRecordPath(app, userDepartment)}
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
  if (!COMPLETED_VIEW_DEPARTMENTS.has(department)) {
    return false;
  }

  if (isFinalApprovalCompleted(app)) {
    return true;
  }

  if (department === "PT(IKL)") {
    return isPtIklCompleted(app);
  }

  if (department === "KU(IKL)") {
    return isKuIklCompleted(app);
  }

  if (department === "IKL (TECHNICAL)") {
    return hasIklTechnicalReview(app);
  }

  if (TECHNICAL_DEPARTMENTS.has(department)) {
    return hasTechnicalDepartmentReview(app, department);
  }

  if (department === "KB(LES)") {
    return hasKbLesDecision(app);
  }

  if (department === "MPHLG") {
    return hasMphlgDecision(app);
  }

  if (department === "SUT") {
    return hasSutDecision(app);
  }

  return isFinalApprovalCompleted(app, department);
}

function isFinalApprovalCompleted(app, department) {
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
    !department ||
    !decisionDepartment ||
    decisionDepartment === department ||
    (
      APPROVAL_SUPPORT_DEPARTMENTS.has(department) &&
      APPROVAL_SUPPORT_DEPARTMENTS.has(decisionDepartment)
    );

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

function isPtIklCompleted(app) {
  const status = normalizeStatus(app?.status);
  const autoScreening = getApplicationSection(app, "auto_screening");
  const decision = String(autoScreening.result || autoScreening.decision || "").trim();

  return (
    decision.includes("PT(IKL)") ||
    (hasApplicationSection(app, "auto_screening") &&
      !["submitted"].includes(status))
  );
}

function isKuIklCompleted(app) {
  const autoScreening = getApplicationSection(app, "auto_screening");
  const technicalKuReview = getApplicationSection(app, "technical_ku_review");
  const decision = String(autoScreening.result || autoScreening.decision || "").trim();

  return (
    decision.includes("KU(IKL)") ||
    hasDecisionSection(technicalKuReview, ["reviewed_at"]) ||
    hasApplicationSection(app, "technical_referral")
  );
}

function hasIklTechnicalReview(app) {
  const technicalReview = getApplicationSection(app, "technical_review");

  return hasDecisionSection(technicalReview, ["reviewed_at"]);
}

function hasTechnicalDepartmentReview(app, department) {
  const review = getTechnicalDepartmentReviews(app)?.[department];
  return Boolean(review && typeof review === "object" && hasDecisionSection(review, ["reviewed_at", "submitted_at"]));
}

function hasKbLesDecision(app) {
  const verification = getApplicationSection(app, "kb_les_verification");
  const status = String(verification.status || "").trim().toLowerCase();

  return (
    hasDecisionSection(verification, ["verified_at"]) &&
    !status.includes("pending")
  );
}

function hasMphlgDecision(app) {
  const mphlg = getApplicationSection(app, "mphlg_gateway");
  const status = String(mphlg.status || "").trim().toLowerCase();

  return (
    hasDecisionSection(mphlg, ["reviewed_at"]) &&
    !status.includes("pending")
  );
}

function hasSutDecision(app) {
  const sutApproval = getApplicationSection(app, "sut_approval");
  const status = String(sutApproval.status || "").trim().toLowerCase();

  return (
    hasDecisionSection(sutApproval, ["approved_at"]) &&
    !status.includes("pending")
  );
}

function hasDecisionSection(section, dateKeys = []) {
  if (!section || typeof section !== "object") return false;

  return Boolean(
    section.decision ||
      section.result ||
      section.final_decision ||
      section.remarks ||
      section.comment ||
      dateKeys.some((key) => section[key])
  );
}

function getDepartmentDecision(app, department) {
  if (isFinalApprovalCompleted(app)) {
    return getApprovalDecision(app);
  }

  if (department === "PT(IKL)") {
    return getScreeningDecision(app, "PT(IKL)");
  }

  if (department === "KU(IKL)") {
    return getKuIklDecision(app);
  }

  if (department === "IKL (TECHNICAL)") {
    const review = getApplicationSection(app, "technical_review");
    return getSectionDecision(review) || formatWorkflowStatus(app.status);
  }

  if (TECHNICAL_DEPARTMENTS.has(department)) {
    return getSectionDecision(getTechnicalDepartmentReviews(app)?.[department]) || formatWorkflowStatus(app.status);
  }

  if (department === "KB(LES)") {
    return getSectionDecision(getApplicationSection(app, "kb_les_verification")) || formatWorkflowStatus(app.status);
  }

  if (department === "MPHLG") {
    return getSectionDecision(getApplicationSection(app, "mphlg_gateway")) || formatWorkflowStatus(app.status);
  }

  if (department === "SUT") {
    return getSectionDecision(getApplicationSection(app, "sut_approval")) || formatWorkflowStatus(app.status);
  }

  return getApprovalDecision(app);
}

function getScreeningDecision(app, department) {
  const autoScreening = getApplicationSection(app, "auto_screening");
  const decision = getSectionDecision(autoScreening);

  if (decision.includes(department)) return decision;

  if (department && isCompletedApprovalForDepartment(app, department)) {
    return "Completed";
  }

  return decision || formatWorkflowStatus(app.status);
}

function getKuIklDecision(app) {
  const technicalKuReview = getApplicationSection(app, "technical_ku_review");
  const kuTechnicalDecision = getSectionDecision(technicalKuReview);

  if (kuTechnicalDecision) return kuTechnicalDecision;

  return getScreeningDecision(app, "KU(IKL)");
}

function getSectionDecision(section = {}) {
  const rawDecision =
    section.final_decision ||
    section.decision ||
    section.result ||
    section.status ||
    "";

  return String(rawDecision || "").trim();
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

function getCompletionDate(app, department = normalizeDepartmentCode(getStoredUser()?.department)) {
  const finalApprovalDate = isFinalApprovalCompleted(app)
    ? getFinalApprovalCompletionDate(app)
    : null;

  if (finalApprovalDate) {
    return finalApprovalDate;
  }

  if (department === "PT(IKL)") {
    return parseCompletionDate(getApplicationSection(app, "auto_screening"), ["checked_at"]);
  }

  if (department === "KU(IKL)") {
    return (
      parseCompletionDate(getApplicationSection(app, "technical_ku_review"), ["reviewed_at"]) ||
      parseCompletionDate(getApplicationSection(app, "technical_referral"), ["referred_at"]) ||
      parseCompletionDate(getApplicationSection(app, "auto_screening"), ["checked_at"])
    );
  }

  if (department === "IKL (TECHNICAL)") {
    return parseCompletionDate(getApplicationSection(app, "technical_review"), ["reviewed_at"]);
  }

  if (TECHNICAL_DEPARTMENTS.has(department)) {
    return parseCompletionDate(getTechnicalDepartmentReviews(app)?.[department], ["reviewed_at", "submitted_at"]);
  }

  if (department === "KB(LES)") {
    return parseCompletionDate(getApplicationSection(app, "kb_les_verification"), ["verified_at"]);
  }

  if (department === "MPHLG") {
    return parseCompletionDate(getApplicationSection(app, "mphlg_gateway"), ["reviewed_at"]);
  }

  if (department === "SUT") {
    return parseCompletionDate(getApplicationSection(app, "sut_approval"), ["approved_at"]);
  }

  const rawDate = app?.updated_at || app?.created_at;
  const date = new Date(rawDate);

  return Number.isNaN(date.getTime()) ? null : date;
}

function getFinalApprovalCompletionDate(app) {
  const approval = getApplicationSection(app, "approval");
  const managementRecommendation = getApplicationSection(app, "management_recommendation");

  return parseCompletionDate(
    {
      decided_at:
        approval.decided_at ||
        approval.approved_at ||
        managementRecommendation.decided_at ||
        managementRecommendation.supported_at ||
        app?.updated_at,
    },
    ["decided_at"]
  );
}

function parseCompletionDate(section = {}, dateKeys = []) {
  const rawDate = dateKeys.map((key) => section?.[key]).find(Boolean);
  const date = new Date(rawDate);

  return Number.isNaN(date.getTime()) ? null : date;
}

function getRecordTime(app) {
  return getCompletionDate(app)?.getTime() || 0;
}

function getCompletedRecordPath(app, department) {
  const returnTo = encodeURIComponent("/dashboard/admin?view=completed");
  const basePath = isFinalApprovalCompleted(app)
    ? "/dashboard/admin?view=approval"
    : getDepartmentWorkspacePath(department);

  return `${basePath}${basePath.includes("?") ? "&" : "?"}id=${app.id}&from=completed-approvals&returnTo=${returnTo}`;
}

function getDepartmentWorkspacePath(department) {
  if (["PT(IKL)", "KU(IKL)", "IKL (TECHNICAL)"].includes(department)) {
    return "/admin/auto-screening";
  }

  if (TECHNICAL_DEPARTMENTS.has(department)) {
    return "/admin/technical-review";
  }

  return "/dashboard/admin?view=approval";
}

function formatDecisionLabel(value, t) {
  if (value === "Approved") return t("workspace.decision.approved", "Approved");
  if (value === "Rejected") return t("workspace.decision.rejected", "Rejected");
  return value || "-";
}

function getTechnicalDepartmentReviews(app) {
  return app?.technical_department_reviews || app?.form_data?.technical_department_reviews || {};
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

  if (department === "UNIT IKLAN") return "PT(IKL)";
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
  if (department === "SETIAUSAHA TETAP") return "SUT";
  return department;
}

export default CompletedApprovalsPage;
