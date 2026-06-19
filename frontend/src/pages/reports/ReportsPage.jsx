import { useEffect, useMemo, useState } from "react";
import AdminDashboardLayout from "../../layout/AdminDashboardLayout";
import { fetchApplicationList } from "../../services/api";
import {
  DataTable,
  PageHeader,
  Panel,
  StatCard,
  StatusPill,
} from "../../components/ui/SystemUI";
import {
  TARGET_PROCESSING_DAYS,
  formatDate,
  formatWorkflowStatus,
  getApplicationReference,
  getApplicationType,
  getRegisteredApplicantName,
  normalizeStatus,
} from "../../utils/workflow";

function ReportsPage() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchApplications();
  }, []);

  async function fetchApplications() {
    try {
      setLoading(true);
      const list = await fetchApplicationList();
      setApplications(list);
    } catch (err) {
      console.error("Failed to load report data:", err);
    } finally {
      setLoading(false);
    }
  }

  const analytics = useMemo(() => buildAnalytics(applications), [applications]);

  return (
    <AdminDashboardLayout>
      <PageHeader
        eyebrow="Management Analytics"
        title="Reports"
        description="Live reporting for application volume, approval rate, SLA compliance, department load, payment, and e-license output."
      />

      <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Applications" value={loading ? "..." : analytics.total} icon="folder" />
        <StatCard label="Approval Rate" value={loading ? "..." : `${analytics.approvalRate}%`} icon="trending_up" tone="blue" />
        <StatCard label="Average Age" value={loading ? "..." : `${analytics.averageAge} days`} icon="timer" tone="amber" />
        <StatCard label="SLA Compliance" value={loading ? "..." : `${analytics.slaRate}%`} icon="verified" />
      </section>

      <section className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Panel title="Status Distribution" className="xl:col-span-2">
          <div className="space-y-3">
            {analytics.statusRows.map((row) => (
              <div key={row.status} className="grid grid-cols-[1fr_auto] items-center gap-4 rounded-md border border-slate-200 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {formatWorkflowStatus(row.status)}
                  </p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-emerald-600"
                      style={{ width: `${row.percent}%` }}
                    />
                  </div>
                </div>
                <span className="text-sm font-semibold text-slate-950">{row.count}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Bottleneck Watch">
          <div className="space-y-3">
            {analytics.bottlenecks.map((item) => (
              <div key={item.label} className="rounded-md border border-slate-200 px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                  <StatusPill value={item.count > 0 ? "Action" : "Clear"} />
                </div>
                <p className="mt-1 text-xs text-slate-500">{item.count} application(s)</p>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <Panel title="Audit List" description="Latest applications used for report calculations.">
        <DataTable
          loading={loading}
          rows={applications.slice(0, 12)}
          emptyText="No applications found."
          columns={[
            { key: "reference", label: "Reference", render: getApplicationReference },
            { key: "applicant", label: "Applicant", render: getRegisteredApplicantName },
            { key: "type", label: "Type", render: getApplicationType },
            {
              key: "status",
              label: "Status",
              render: (app) => <StatusPill value={formatWorkflowStatus(app.status)} />,
            },
            { key: "created", label: "Created", render: (app) => formatDate(app.created_at) },
            { key: "age", label: "Age", render: (app) => `${getAgeDays(app.created_at)} days` },
          ]}
        />
      </Panel>
    </AdminDashboardLayout>
  );
}

function buildAnalytics(applications) {
  const total = applications.length;
  const approved = applications.filter((app) =>
    ["approved", "approved_with_conditions", "invoice_generated", "payment_verified", "license_issued"].includes(
      normalizeStatus(app.status)
    )
  ).length;

  const totalAge = applications.reduce((sum, app) => sum + getAgeDays(app.created_at), 0);
  const withinSla = applications.filter(
    (app) => getAgeDays(app.created_at) <= TARGET_PROCESSING_DAYS
  ).length;

  const statusMap = new Map();
  applications.forEach((app) => {
    const status = normalizeStatus(app.status) || "draft";
    statusMap.set(status, (statusMap.get(status) || 0) + 1);
  });

  return {
    total,
    approvalRate: total ? Math.round((approved / total) * 100) : 0,
    averageAge: total ? Math.round(totalAge / total) : 0,
    slaRate: total ? Math.round((withinSla / total) * 100) : 100,
    statusRows: Array.from(statusMap.entries()).map(([status, count]) => ({
      status,
      count,
      percent: total ? Math.round((count / total) * 100) : 0,
    })),
    bottlenecks: [
      {
        label: "S2 Verification",
        count: applications.filter((app) => normalizeStatus(app.status) === "submitted").length,
      },
      {
        label: "Technical Review",
        count: applications.filter((app) =>
          ["auto_screened", "technical_review"].includes(normalizeStatus(app.status))
        ).length,
      },
      {
        label: "Payment",
        count: applications.filter((app) =>
          ["approved", "invoice_generated", "payment_submitted"].includes(normalizeStatus(app.status))
        ).length,
      },
    ],
  };
}

function getAgeDays(value) {
  if (!value) return 0;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.floor((Date.now() - date.getTime()) / 86400000);
}

export default ReportsPage;
