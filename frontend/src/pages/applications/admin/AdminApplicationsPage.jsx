import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminDashboardLayout from "../../../layout/AdminDashboardLayout";
import { apiRequest } from "../../../services/api";
import {
  Alert,
  Button,
  DataTable,
  Field,
  LinkButton,
  PageHeader,
  Panel,
  StatCard,
  StatusPill,
} from "../../../components/ui/SystemUI";
import {
  formatDate,
  formatWorkflowStatus,
  getApplicantName,
  getApplicationLocation,
  getApplicationReference,
  getApplicationType,
  getProjectName,
  normalizeStatus,
} from "../../../utils/workflow";

function AdminApplicationsPage() {
  const navigate = useNavigate();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [error, setError] = useState("");

  useEffect(() => {
    fetchApplications();
  }, []);

  async function fetchApplications() {
    try {
      setLoading(true);
      setError("");
      const data = await apiRequest("/applications/");
      setApplications(Array.isArray(data) ? data : data?.results || []);
    } catch (err) {
      setError(err.message || "Failed to load applications.");
    } finally {
      setLoading(false);
    }
  }

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
      drafts: applications.filter((app) => normalizeStatus(app.status) === "draft").length,
      submitted: applications.filter((app) => normalizeStatus(app.status) === "submitted").length,
      active: applications.filter((app) => normalizeStatus(app.status) === "license_issued").length,
    };
  }, [applications]);

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
        description="Search, inspect, continue, or remove centralized advertisement license applications."
        actions={
          <LinkButton to="/admin/applications/new" icon="add">
            New Application
          </LinkButton>
        }
      />

      <Alert message={error} />

      <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard label="Total" value={summary.total} icon="folder" />
        <StatCard label="Draft" value={summary.drafts} icon="edit_document" tone="amber" />
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
              <option value="draft">Draft</option>
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
                  onClick={() => navigate(`/admin/applications/${app.id}`)}
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
            { key: "updated", label: "Updated", render: (app) => formatDate(app.updated_at) },
            {
              key: "action",
              label: "Action",
              render: (app) => (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    className="min-h-8 px-3 py-1 text-xs"
                    onClick={() => navigate(`/admin/applications/${app.id}`)}
                  >
                    Open
                  </Button>
                  <Button
                    variant="danger"
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
