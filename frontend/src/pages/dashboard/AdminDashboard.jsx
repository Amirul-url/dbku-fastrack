import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import AdminDashboardLayout from "../../layout/AdminDashboardLayout";
import ApprovalPage from "../admin/approval/ApprovalPage";
import { useLanguage } from "../../context/LanguageContext";
import { apiRequest, getStoredUser } from "../../services/api";
import {
  Alert,
  DataTable,
  Icon,
  LinkButton,
  Panel,
  StatusPill,
} from "../../components/ui/SystemUI";
import {
  formatDateTime,
  formatWorkflowStatus,
  getApplicantName,
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

const units = [
  {
    code: "PT(IKL)",
    department: "PT(IKL)",
    title: "PT(IKL)",
    descriptionKey: "admin.unit.ptIkl.desc",
    icon: "description",
    color: "bg-cyan-700",
    statuses: ["submitted", "incomplete", "technical_amendment"],
    path: "/admin/auto-screening",
  },
  {
    code: "KU(IKL)",
    department: "KU(IKL)",
    title: "KU(IKL)",
    descriptionKey: "admin.unit.kuIkl.desc",
    icon: "verified_user",
    color: "bg-indigo-700",
    statuses: ["ku_ikl_review", "technical_review_completed"],
    path: "/admin/auto-screening",
  },
  {
    code: "IKL (TECHNICAL)",
    department: "IKL (TECHNICAL)",
    title: "IKL Technical",
    descriptionKey: "admin.unit.iklTechnical.desc",
    icon: "engineering",
    color: "bg-cyan-600",
    statuses: ["technical_review", "technical_site_visit"],
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
    path: "/admin/technical-review",
  },
];

function AdminDashboard() {
  const location = useLocation();
  const [currentUser, setCurrentUser] = useState(getStoredUser);
  const view = new URLSearchParams(location.search).get("view") || "personal";

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

  if (isMphlgUser(currentUser) && view === "approval") {
    return <ApprovalPage />;
  }

  if (isMphlgUser(currentUser)) {
    return <MphlgDashboard user={currentUser} />;
  }

  if (view === "approval" || isApprovalWorkflowUser(currentUser)) {
    return <ApprovalPage />;
  }

  return <PersonalTaskDashboard />;
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

function PersonalTaskDashboard() {
  const { t } = useLanguage();
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
      const data = await apiRequest("/applications/");
      setApplications(Array.isArray(data) ? data : data?.results || []);
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
    const interval = window.setInterval(
      () => fetchApplications({ silent: true }),
      15000
    );

    return () => {
      window.removeEventListener("fastrack:applications-changed", fetchApplications);
      window.clearInterval(interval);
    };
  }, [fetchApplications]);

  const unitTasks = useMemo(() => {
    return units.map((unit) => ({
      ...unit,
      locked: Boolean(activeDepartment) && unit.department !== activeDepartment,
      tasks: applications.filter((application) => {
        const isAssignedDepartment =
          !activeDepartment || unit.department === activeDepartment;
        const isMatchingStatus = unit.statuses.includes(normalizeStatus(application.status));
        const isExternalTechnicalUnit = EXTERNAL_TECHNICAL_DEPARTMENTS.has(unit.department);
        const isExternalTechnicalTask =
          isExternalTechnicalUnit &&
          !hasTechnicalDepartmentReview(application, unit.department);

        return (
          isAssignedDepartment &&
          isMatchingStatus &&
          (!isExternalTechnicalUnit || isExternalTechnicalTask)
        );
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
  loading,
  selected,
  selectedUnit,
  onSelectUnit,
  unitTasks,
}) {
  function getApplicationViewPath(application) {
    const returnParams = new URLSearchParams();
    returnParams.set("id", application.id);

    const viewParams = new URLSearchParams();
    viewParams.set("id", application.id);
    viewParams.set("from", "action-panel");
    viewParams.set("returnTo", `${selected.path}?${returnParams.toString()}`);

    return `/admin/applications/${application.id}/view/step-1?${viewParams.toString()}`;
  }

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
        <DataTable
          loading={loading}
          emptyText={t("admin.dashboard.noTask")}
          rows={selected.tasks}
          columns={[
            {
              key: "reference",
              label: t("common.reference"),
              render: (application) => (
                <Link
                  to={getApplicationViewPath(application)}
                  className="font-semibold text-emerald-700 hover:underline"
                >
                  {getApplicationReference(application)}
                </Link>
              ),
            },
            { key: "applicant", label: t("common.applicant"), render: getApplicantName },
            { key: "project", label: t("common.project"), render: getProjectName },
            {
              key: "status",
              label: t("common.status"),
              render: (application) => (
                <StatusPill value={getDashboardTaskStatusLabel(application, selected, t)} />
              ),
            },
            {
              key: "updated",
              label: t("common.updated"),
              render: (application) => formatDateTime(application.updated_at),
            },
            {
              key: "action",
              label: t("common.action"),
              render: (application) => (
                <LinkButton
                  to={`${selected.path}?id=${application.id}`}
                  icon="open_in_new"
                  variant="secondary"
                  className="min-h-8 px-3 py-1 text-xs"
                >
                  {t("common.open")}
                </LinkButton>
              ),
            },
          ]}
        />
      </Panel>
    </>
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
  if (department === "SETIAUSAHA TETAP") return "SUT";
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
  return ["MPHLG", "SUT"].includes(normalizeDepartmentCode(user?.department));
}

function getAssignedUnit(department) {
  if (!department) return null;
  return units.find((unit) => unit.department === department) || null;
}

function getProcessIconTitle(unit) {
  return IKL_DEPARTMENTS.has(unit?.department) ? "IKL" : unit?.title || "";
}

function getTechnicalDepartmentReviews(app) {
  return app?.technical_department_reviews || app?.form_data?.technical_department_reviews || {};
}

function hasTechnicalDepartmentReview(app, department) {
  return Boolean(getTechnicalDepartmentReviews(app)?.[department]);
}

function getDashboardTaskStatusLabel(application, unit, t) {
  const status = normalizeStatus(application?.status);

  if (unit?.department === "PT(IKL)" && status === "submitted") {
    return t("status.pt_ikl_review", "PT(IKL) Review");
  }

  if (unit?.department === "KU(IKL)" && status === "technical_review_completed") {
    return t("status.technical_ku_review", "Pending KU(IKL) Final Check");
  }

  if (unit?.department === "IKL (TECHNICAL)" && TECHNICAL_DEPARTMENT_STATUS_SET.has(status)) {
    return `${t(`status.${status}`, formatWorkflowStatus(status))}: BLG / GPM / MNE / IMT / LNP / ENG`;
  }

  if (EXTERNAL_TECHNICAL_DEPARTMENTS.has(unit?.department) && TECHNICAL_DEPARTMENT_STATUS_SET.has(status)) {
    return `${unit.department} Review`;
  }

  return formatWorkflowStatus(status);
}

export default AdminDashboard;
