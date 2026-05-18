import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import AdminDashboardLayout from "../../layout/AdminDashboardLayout";
import { useLanguage } from "../../context/LanguageContext";
import { apiRequest, getStoredUser } from "../../services/api";
import {
  Alert,
  DataTable,
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
  "technical_review_completed",
];
const TECHNICAL_DEPARTMENT_STATUS_SET = new Set(TECHNICAL_DEPARTMENT_TASK_STATUSES);

const units = [
  {
    code: "Unit Iklan",
    department: "IKL",
    title: "IKL",
    descriptionKey: "admin.unit.ikl.desc",
    icon: "description",
    color: "bg-cyan-700",
    statuses: ["submitted", "incomplete", "ku_ikl_review", "technical_review", "technical_site_visit", "technical_amendment", "technical_review_completed"],
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
  const view = new URLSearchParams(location.search).get("view") || "personal";

  if (view === "approval") {
    return <AdminDashboardLayout />;
  }

  return <PersonalTaskDashboard />;
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
        const isDepartmentTechnicalTask =
          unit.department !== "IKL" &&
          !hasTechnicalDepartmentReview(application, unit.department);

        return (
          isAssignedDepartment &&
          isMatchingStatus &&
          (unit.department === "IKL" || isDepartmentTechnicalTask)
        );
      }),
    }));
  }, [applications, activeDepartment]);

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
          unitTasks={unitTasks}
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
  return (
    <>
      <fieldset className="border border-slate-300 px-3 pb-4 pt-2">
        <legend className="px-2 text-sm font-semibold italic text-slate-700">
          {t("admin.dashboard.processList")}
        </legend>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-7">
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
                <span className={`material-symbols-outlined text-4xl ${unit.iconClassName || ""}`}>
                  {unit.icon}
                </span>
              </span>
              <span className="mt-3 text-sm font-bold italic text-slate-700">
                {unit.title}
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
                  to={`/admin/applications/${application.id}/view/step-1?id=${application.id}`}
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
  const department = String(value || "").trim().toUpperCase();
  if (department === "INP") return "LNP";
  return department === "UNIT IKLAN" ? "IKL" : department;
}

function getAssignedUnit(department) {
  if (!department) return null;
  return units.find((unit) => unit.department === department) || null;
}

function getTechnicalDepartmentReviews(app) {
  return app?.technical_department_reviews || app?.form_data?.technical_department_reviews || {};
}

function hasTechnicalDepartmentReview(app, department) {
  return Boolean(getTechnicalDepartmentReviews(app)?.[department]);
}

function getDashboardTaskStatusLabel(application, unit, t) {
  const status = normalizeStatus(application?.status);

  if (unit?.department === "IKL" && status === "submitted") {
    return t("status.pt_ku_review", "PT/KU Review");
  }

  if (unit?.department === "IKL" && TECHNICAL_DEPARTMENT_STATUS_SET.has(status)) {
    return `${t(`status.${status}`, formatWorkflowStatus(status))}: BLG / GPM / MNE / IMT / LNP / ENG`;
  }

  if (unit?.department !== "IKL" && TECHNICAL_DEPARTMENT_STATUS_SET.has(status)) {
    return `${unit.department} Review`;
  }

  return formatWorkflowStatus(status);
}

export default AdminDashboard;
