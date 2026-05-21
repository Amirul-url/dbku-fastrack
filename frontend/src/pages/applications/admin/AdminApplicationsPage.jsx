import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import AdminDashboardLayout from "../../../layout/AdminDashboardLayout";
import { apiRequest, getStoredUser } from "../../../services/api";
import {
  Alert,
  Button,
  DataTable,
  Field,
  PageHeader,
  Panel,
  StatCard,
  StatusPill,
} from "../../../components/ui/SystemUI";
import {
  formatCompactDateTime,
  formatWorkflowStatus,
  getApplicantName,
  getApplicationLocation,
  getApplicationReference,
  getApplicationType,
  getProjectName,
  normalizeStatus,
} from "../../../utils/workflow";

const APPROVAL_SUPPORT_DEPARTMENTS = new Set(["TP(RES)", "PGH", "TP(RES)/PGH", "TP/PGH"]);

function normalizeDepartmentCode(value) {
  const department = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/-/g, " ")
    .replace(/\s+/g, " ");

  return department === "SETIAUSAHA TETAP" ? "SUT" : department;
}

function isApprovalWorkflowUser(user) {
  const role = String(user?.role || "").trim().toLowerCase();
  const department = normalizeDepartmentCode(user?.department);

  return (
    role === "supervisor" ||
    department === "KB(LES)" ||
    APPROVAL_SUPPORT_DEPARTMENTS.has(department) ||
    department === "MPHLG" ||
    department === "SUT"
  );
}

function AdminApplicationsPage() {
  const navigate = useNavigate();
  const storedUser = getStoredUser();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [error, setError] = useState("");

  const fetchApplications = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      setError("");
      const data = await apiRequest("/applications/");
      setApplications(Array.isArray(data) ? data : data?.results || []);
    } catch (err) {
      setError(err.message || "Failed to load applications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(fetchApplications, 0);

    const refreshTimer = window.setInterval(() => {
      fetchApplications({ silent: true });
    }, 10000);

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        fetchApplications({ silent: true });
      }
    }

    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(refreshTimer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, [fetchApplications]);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return applications.filter((app) => {
      const haystack = [
        getApplicationReference(app),
        getApplicantName(app),
        getProjectName(app),
        getApplicationType(app),
        getApplicationLocation(app),
      ]
        .join(" ")
        .toLowerCase();

      const status = normalizeStatus(app.status);
      return (!q || haystack.includes(q)) && (statusFilter === "ALL" || status === statusFilter);
    });
  }, [applications, keyword, statusFilter]);

  const summary = useMemo(() => {
    return {
      total: applications.length,
      submitted: applications.filter((app) => normalizeStatus(app.status) === "submitted").length,
      active: applications.filter((app) => normalizeStatus(app.status) === "license_issued").length,
    };
  }, [applications]);

  if (isApprovalWorkflowUser(storedUser)) {
    return <Navigate to="/dashboard/admin?view=approval" replace />;
  }

  async function deleteApplication(app) {
    const confirmed = window.confirm(`Delete ${getApplicationReference(app)}?`);
    if (!confirmed) return;

    try {
      setDeletingId(app.id);
      await apiRequest(`/applications/${app.id}/`, { method: "DELETE" });
      setApplications((current) => current.filter((item) => item.id !== app.id));
    } catch (err) {
      setError(err.message || "Failed to delete application.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <AdminDashboardLayout>
      <PageHeader
        eyebrow="Application Records"
        title="Applications"
        description="Search and inspect completed applications handed over by applicants."
      />

      <Alert message={error} />

      <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Total" value={summary.total} icon="folder" />
        <StatCard label="Submitted" value={summary.submitted} icon="send" tone="blue" />
        <StatCard label="E-License" value={summary.active} icon="qr_code_2" />
      </section>

      <Panel title="Search" className="mb-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Keyword" className="md:col-span-2">
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              className="form-input"
              placeholder="Search reference, applicant, project, type, or location"
            />
          </Field>
          <Field label="Status">
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="form-input"
            >
              <option value="ALL">All statuses</option>
              <option value="submitted">Submitted</option>
              <option value="auto_screened">S2 Verification</option>
              <option value="technical_review_completed">Technical Completed</option>
              <option value="approved">Approved</option>
              <option value="license_issued">License Issued</option>
            </select>
          </Field>
        </div>
      </Panel>

      <Panel title="Application List" description={`${filtered.length} record(s) found.`}>
        <DataTable
          loading={loading}
          rows={filtered}
          emptyText="No applications match the current search."
          columns={[
            {
              key: "reference",
              label: "Reference",
              render: (app) => (
                <button
                  type="button"
                  onClick={() => navigate(`/admin/applications/${app.id}/view/step-1`)}
                  className="font-semibold text-emerald-700 hover:underline"
                >
                  {getApplicationReference(app)}
                </button>
              ),
            },
            { key: "applicant", label: "Applicant", render: getApplicantName },
            { key: "project", label: "Project", render: getProjectName },
            { key: "type", label: "Type", render: getApplicationType },
            { key: "location", label: "Location", render: getApplicationLocation },
            {
              key: "status",
              label: "Status",
              render: (app) => <StatusPill value={formatWorkflowStatus(app.status)} />,
            },
            { key: "updated", label: "Updated", render: (app) => formatCompactDateTime(app.updated_at) },
            {
              key: "action",
              label: "Action",
              render: (app) => (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    icon="visibility"
                    className="min-h-8 px-3 py-1 text-xs"
                    onClick={() => navigate(`/admin/applications/${app.id}/view/step-1`)}
                  >
                    View
                  </Button>
                  <Button
                    variant="secondary"
                    icon="edit"
                    className="min-h-8 px-3 py-1 text-xs"
                    onClick={() => navigate(`/admin/applications/${app.id}/step-1`)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="danger"
                    icon="delete"
                    className="min-h-8 px-3 py-1 text-xs"
                    disabled={deletingId === app.id}
                    onClick={() => deleteApplication(app)}
                  >
                    Delete
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </Panel>
    </AdminDashboardLayout>
  );
}

export default AdminApplicationsPage;
