import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import AdminDashboardLayout from "../../layout/AdminDashboardLayout";
import { useLanguage } from "../../context/LanguageContext";
import { apiRequest, getStoredUser } from "../../services/api";
import {
  Alert,
  DataTable,
  Panel,
  StatusPill,
} from "../../components/ui/SystemUI";
import {
  formatDate,
  formatWorkflowStatus,
  getApplicantName,
  getApplicationReference,
  getProjectName,
  normalizeStatus,
} from "../../utils/workflow";

const units = [
  {
    code: "Unit Iklan",
    department: "IKL",
    title: "IKL",
    descriptionKey: "admin.unit.ikl.desc",
    icon: "description",
    color: "bg-cyan-700",
    statuses: ["submitted", "incomplete", "ku_ikl_review", "technical_review", "technical_site_visit", "technical_amendment"],
    path: "/admin/applications",
  },
  {
    code: "BLG",
    department: "BLG",
    title: "BLG",
    descriptionKey: "admin.unit.blg.desc",
    icon: "edit_square",
    color: "bg-emerald-600",
    statuses: ["technical_review", "technical_site_visit"],
    path: "/admin/technical-review",
  },
  {
    code: "GPM",
    department: "GPM",
    title: "GPM",
    descriptionKey: "admin.unit.gpm.desc",
    icon: "payments",
    color: "bg-blue-600",
    statuses: ["technical_review", "technical_site_visit"],
    path: "/admin/technical-review",
  },
  {
    code: "MNE",
    department: "MNE",
    title: "MNE",
    descriptionKey: "admin.unit.mne.desc",
    icon: "account_balance",
    color: "bg-sky-600",
    statuses: ["technical_review", "technical_site_visit"],
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
    statuses: ["technical_review"],
    path: "/admin/technical-review",
  },
  {
    code: "LNP",
    department: "LNP",
    title: "LNP",
    descriptionKey: "admin.unit.lnp.desc",
    icon: "fact_check",
    color: "bg-green-600",
    statuses: ["technical_review", "technical_site_visit"],
    path: "/admin/technical-review",
  },
  {
    code: "ENG",
    department: "ENG",
    title: "ENG",
    descriptionKey: "admin.unit.eng.desc",
    icon: "engineering",
    color: "bg-teal-600",
    statuses: ["technical_review"],
    path: "/admin/technical-review",
  },
];

const workflowCards = [
  {
    titleKey: "admin.workflow.screening",
    descriptionKey: "admin.workflow.screeningDesc",
    icon: "rule",
  },
  {
    titleKey: "admin.workflow.technical",
    descriptionKey: "admin.workflow.technicalDesc",
    icon: "engineering",
  },
  {
    titleKey: "admin.workflow.management",
    descriptionKey: "admin.workflow.managementDesc",
    icon: "approval_delegation",
  },
  {
    titleKey: "admin.workflow.payment",
    descriptionKey: "admin.workflow.paymentDesc",
    icon: "receipt_long",
  },
  {
    titleKey: "admin.workflow.renewal",
    descriptionKey: "admin.workflow.renewalDesc",
    icon: "event_repeat",
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

  const fetchApplications = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await apiRequest("/applications/");
      setApplications(Array.isArray(data) ? data : data?.results || []);
    } catch (err) {
      setError(err.message || "Failed to load admin dashboard tasks.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchApplications();
  }, [fetchApplications]);

  const unitTasks = useMemo(() => {
    return units.map((unit) => ({
      ...unit,
      locked: Boolean(activeDepartment) && unit.department !== activeDepartment,
      tasks: applications.filter((application) =>
        unit.statuses.includes(normalizeStatus(application.status)) &&
        (!activeDepartment || unit.department === activeDepartment)
      ),
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

      <Panel title={t("admin.workflow.title")} description={t("admin.workflow.description")}>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
          {workflowCards.map((item) => (
            <div key={item.titleKey} className="rounded-md border border-slate-200 bg-white p-3">
              <span className="material-symbols-outlined text-2xl text-emerald-700">
                {item.icon}
              </span>
              <h3 className="mt-3 text-sm font-semibold text-slate-950">
                {t(item.titleKey)}
              </h3>
              <p className="mt-2 text-xs leading-5 text-slate-600">
                {t(item.descriptionKey)}
              </p>
            </div>
          ))}
        </div>
      </Panel>
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

      <div className="mt-5 border border-slate-300">
        <div className="bg-blue-700 px-3 py-1 text-sm font-semibold text-white">
          {selected.title}
        </div>
        <div className="grid grid-cols-1 gap-3 p-3 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-full text-white ${selected.color}`}>
              <span className={`material-symbols-outlined text-3xl ${selected.iconClassName || ""}`}>
                {selected.icon}
              </span>
            </div>
            <h2 className="text-lg font-semibold text-slate-950">{selected.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {t(selected.descriptionKey)}
            </p>
            {selected.code === "Unit Iklan" && (
              <div className="mt-4 rounded-md border border-emerald-100 bg-white p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                  {t("admin.dashboard.roleTitle")}
                </p>
                <ul className="mt-2 space-y-2 text-xs leading-5 text-slate-700">
                  <li>{t("admin.dashboard.ptIklRole")}</li>
                  <li>{t("admin.dashboard.kuIklRole")}</li>
                  <li>{t("admin.dashboard.unitIklanTechnicalRole")}</li>
                </ul>
              </div>
            )}
            <Link
              to={selected.path}
                className="mt-4 inline-flex min-h-9 items-center justify-center rounded-md border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800"
            >
              {t("admin.dashboard.openWorkspace")}
            </Link>
          </div>

          <Panel
            title={`${selected.title} ${t("admin.dashboard.taskQueue")}`}
            description={t("admin.dashboard.queueDescription")}
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
                    <StatusPill value={formatWorkflowStatus(application.status)} />
                  ),
                },
                {
                  key: "updated",
                  label: t("common.updated"),
                  render: (application) => formatDate(application.updated_at),
                },
              ]}
            />
          </Panel>
        </div>
      </div>
    </>
  );
}

function normalizeDepartmentCode(value) {
  const department = String(value || "").trim().toUpperCase();
  return department === "UNIT IKLAN" ? "IKL" : department;
}

function getAssignedUnit(department) {
  if (!department) return null;
  return units.find((unit) => unit.department === department) || null;
}

export default AdminDashboard;
