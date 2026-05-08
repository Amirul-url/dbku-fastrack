import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AdminDashboardLayout from "../../layout/AdminDashboardLayout";
import { apiRequest, getStoredUser } from "../../services/api";
import {
  Alert,
  DataTable,
  PageHeader,
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
    title: "Unit Iklan",
    description: "Semakan awal iklan, dokumen dan kelengkapan permohonan.",
    icon: "description",
    color: "bg-cyan-700",
    statuses: ["submitted", "incomplete"],
    path: "/admin/auto-screening",
  },
  {
    code: "BLG",
    title: "BLG",
    description: "Semakan kawasan, syarat lesen dan rekod sokongan.",
    icon: "edit_square",
    color: "bg-emerald-600",
    statuses: ["auto_screened"],
    path: "/admin/applications",
  },
  {
    code: "IMT",
    title: "IMT",
    description: "Semakan teknikal imej, lokasi, pemetaan dan integrasi.",
    icon: "hub",
    color: "bg-yellow-400",
    iconClassName: "text-slate-900",
    statuses: ["technical_review"],
    path: "/admin/technical-review",
  },
  {
    code: "MNE",
    title: "MNE",
    description: "Penilaian maklumat dan sokongan pengurusan.",
    icon: "account_balance",
    color: "bg-sky-600",
    statuses: ["technical_review_completed", "management_review"],
    path: "/admin/approval",
  },
  {
    code: "ENG",
    title: "ENG",
    description: "Semakan kejuruteraan dan keselamatan struktur iklan.",
    icon: "engineering",
    color: "bg-teal-600",
    statuses: ["technical_review"],
    path: "/admin/technical-review",
  },
  {
    code: "GPM",
    title: "GPM",
    description: "Keputusan, caj, invois dan pengesahan bayaran.",
    icon: "payments",
    color: "bg-blue-600",
    statuses: ["approved", "approved_with_conditions", "invoice_generated", "payment_submitted"],
    path: "/admin/payment",
  },
  {
    code: "LNP",
    title: "LNP",
    description: "Pengeluaran, pengaktifan dan rekod e-lesen QR.",
    icon: "fact_check",
    color: "bg-green-600",
    statuses: ["payment_verified", "license_issued", "license_revoked"],
    path: "/admin/license-qr",
  },
];

const menuViews = [
  {
    key: "personal",
    label: "Personal Task",
  },
  {
    key: "claimable",
    label: "List of Task to be Claimed",
  },
  {
    key: "claimed",
    label: "List of All Claimed Task",
  },
  {
    key: "approval",
    label: "Awaiting Approval",
  },
];

function AdminDashboard() {
  const [applications, setApplications] = useState([]);
  const [selectedUnit, setSelectedUnit] = useState("Unit Iklan");
  const [activeView, setActiveView] = useState("claimable");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const user = getStoredUser();

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
      tasks: applications.filter((application) =>
        unit.statuses.includes(normalizeStatus(application.status))
      ),
    }));
  }, [applications]);

  const selected = unitTasks.find((unit) => unit.code === selectedUnit) || unitTasks[0];
  const workflowRows = applications.filter(
    (application) => normalizeStatus(application.status) !== "draft"
  );
  const totalClaimable = unitTasks.reduce((sum, unit) => sum + unit.tasks.length, 0);
  const submitted = workflowRows.length;

  return (
    <AdminDashboardLayout>
      <PageHeader
        eyebrow="Admin Dashboard"
        title="List of Task"
        description="Tasks will appear here after an applicant successfully submits the advertisement license form. Each unit claims and completes its own queue."
      />

      <Alert message={error} />

      <section className="mb-6 grid grid-cols-1 gap-4 border border-slate-300 bg-white p-4 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="overflow-hidden border border-slate-200 bg-slate-50">
          <div className="bg-emerald-900 px-4 py-4 text-white">
            <p className="text-xs font-semibold">Welcome {user?.full_name || user?.username || "Admin"}</p>
            <p className="mt-1 text-[11px] font-semibold uppercase text-emerald-100">
              Administrator
            </p>
          </div>

          <nav className="text-sm">
            <SidebarItem active label="Application" />
            {menuViews.slice(0, 3).map((item) => (
              <SidebarButton
                key={item.key}
                active={activeView === item.key}
                label={item.label}
                onClick={() => setActiveView(item.key)}
              />
            ))}
            <SidebarItem label="License / Code" />
            <SidebarButton
              active={activeView === "approval"}
              label="Awaiting Approval"
              onClick={() => setActiveView("approval")}
            />
          </nav>
        </aside>

        <main className="min-w-0">
          <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            <SummaryBox label="Submitted Forms" value={loading ? "..." : submitted} />
            <SummaryBox label="Task to be Claimed" value={loading ? "..." : totalClaimable} />
            <SummaryBox label="Units" value={units.length} />
          </div>

          <ClaimableTaskView
            loading={loading}
            selected={selected}
            selectedUnit={selectedUnit}
            setSelectedUnit={setSelectedUnit}
            unitTasks={unitTasks}
          />
        </main>
      </section>
    </AdminDashboardLayout>
  );
}

function ClaimableTaskView({
  loading,
  selected,
  selectedUnit,
  setSelectedUnit,
  unitTasks,
}) {
  return (
    <>
      <fieldset className="border border-slate-300 px-4 pb-5 pt-3">
        <legend className="px-2 text-sm font-semibold italic text-slate-700">
          PROCESS LIST
        </legend>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-7">
          {unitTasks.map((unit) => (
            <button
              type="button"
              key={unit.code}
              onClick={() => setSelectedUnit(unit.code)}
              className={`group flex flex-col items-center rounded-md border p-3 text-center transition ${
                selectedUnit === unit.code
                  ? "border-emerald-600 bg-emerald-50"
                  : "border-transparent bg-white hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <span
                className={`flex aspect-square w-24 items-center justify-center rounded-full text-white shadow-sm ${unit.color}`}
              >
                <span className={`material-symbols-outlined text-5xl ${unit.iconClassName || ""}`}>
                  {unit.icon}
                </span>
              </span>
              <span className="mt-3 text-sm font-bold italic text-slate-700">
                {unit.title}
              </span>
              <span className="text-xs font-semibold italic text-slate-950">
                Task Count : {loading ? "..." : unit.tasks.length}
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-5 border border-slate-300">
        <div className="bg-blue-700 px-3 py-1 text-sm font-semibold text-white">
          {selected.title}
        </div>
        <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-full text-white ${selected.color}`}>
              <span className={`material-symbols-outlined text-3xl ${selected.iconClassName || ""}`}>
                {selected.icon}
              </span>
            </div>
            <h2 className="text-lg font-semibold text-slate-950">{selected.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{selected.description}</p>
            <Link
              to={selected.path}
              className="mt-4 inline-flex min-h-10 items-center justify-center rounded-md border border-emerald-700 bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
            >
              Open Unit Workspace
            </Link>
          </div>

          <Panel
            title={`${selected.title} Task Queue`}
            description="Submitted applications waiting for this unit."
          >
            <DataTable
              loading={loading}
              emptyText="No task to be claimed for this unit."
              rows={selected.tasks}
              columns={[
                {
                  key: "reference",
                  label: "Reference",
                  render: (application) => (
                    <Link
                      to={`/admin/applications/${application.id}`}
                      className="font-semibold text-emerald-700 hover:underline"
                    >
                      {getApplicationReference(application)}
                    </Link>
                  ),
                },
                { key: "applicant", label: "Applicant", render: getApplicantName },
                { key: "project", label: "Project", render: getProjectName },
                {
                  key: "status",
                  label: "Status",
                  render: (application) => (
                    <StatusPill value={formatWorkflowStatus(application.status)} />
                  ),
                },
                {
                  key: "updated",
                  label: "Updated",
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

function SidebarItem({ label, active = false }) {
  return (
    <div
      className={`border-b border-white/70 px-4 py-3 font-semibold ${
        active ? "bg-green-700 text-white" : "bg-lime-100 text-slate-700"
      }`}
    >
      {label}
    </div>
  );
}

function SidebarButton({ label, active = false, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full border-b border-white/70 px-4 py-3 text-left transition ${
        active
          ? "bg-lime-200 font-semibold text-slate-950"
          : "bg-lime-100 text-slate-700 hover:bg-lime-200"
      }`}
    >
      {label}
    </button>
  );
}

function SummaryBox({ label, value }) {
  return (
    <div className="border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

export default AdminDashboard;
