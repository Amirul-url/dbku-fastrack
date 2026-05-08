import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminDashboardLayout from "../../layout/AdminDashboardLayout";
import { apiRequest } from "../../services/api";
import {
  Alert,
  ApplicationSummary,
  Button,
  DataTable,
  Field,
  Info,
  PageHeader,
  Panel,
  StatCard,
  StatusPill,
} from "../../components/ui/SystemUI";
import {
  formatCurrency,
  formatDate,
  formatWorkflowStatus,
  getApplicantName,
  getApplicationLocation,
  getApplicationReference,
  getApplicationType,
  getInvoiceNo,
  getLicenseId,
  getProjectName,
  normalizeStatus,
} from "../../utils/workflow";

function ProcessWorkspace({ type }) {
  const navigate = useNavigate();
  const config = configs[type];
  const [applications, setApplications] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [decision, setDecision] = useState(config.defaultDecision || "");
  const [comment, setComment] = useState("");

  useEffect(() => {
    fetchApplications();
  }, []);

  async function fetchApplications() {
    try {
      setLoading(true);
      setError("");
      const data = await apiRequest("/applications/");
      const list = Array.isArray(data) ? data : data?.results || [];
      setApplications(list);
      if (!selectedId && list.length > 0) setSelectedId(String(list[0].id));
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

      return !q || haystack.includes(q);
    });
  }, [applications, keyword]);

  const selected = useMemo(() => {
    return applications.find((app) => String(app.id) === String(selectedId)) || filtered[0] || null;
  }, [applications, filtered, selectedId]);

  const stats = useMemo(() => config.stats(applications), [applications, config]);

  async function submitAction(action) {
    if (!selected?.id) {
      setError("Please select an application first.");
      return;
    }

    if (action.requiresComment && !comment.trim()) {
      setError("Please enter notes or comments first.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");
      const current = await apiRequest(`/applications/${selected.id}/`);
      const body = action.buildPayload(current, { decision, comment });

      await apiRequest(`/applications/${selected.id}/`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });

      setSuccess(action.success);
      setComment("");
      await fetchApplications();
    } catch (err) {
      setError(err.message || action.error || "Action failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminDashboardLayout>
      <PageHeader
        eyebrow={config.eyebrow}
        title={config.title}
        description={config.description}
      />

      <Alert message={error} />
      <Alert type="success" message={success} />

      <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        {stats.map((item) => (
          <StatCard key={item.label} {...item} />
        ))}
      </section>

      <section className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Panel
          title={config.queueTitle}
          description="Select a record, then complete the action panel."
          className="xl:col-span-2"
        >
          <div className="mb-4">
            <Field label="Search">
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                className="form-input"
                placeholder="Search reference, applicant, project, type, or location"
              />
            </Field>
          </div>

          <DataTable
            loading={loading}
            rows={filtered}
            emptyText="No applications found."
            columns={[
              {
                key: "reference",
                label: "Reference",
                render: (app) => (
                  <button
                    type="button"
                    onClick={() => setSelectedId(String(app.id))}
                    className="font-semibold text-emerald-700 hover:underline"
                  >
                    {getApplicationReference(app)}
                  </button>
                ),
              },
              { key: "applicant", label: "Applicant", render: getApplicantName },
              { key: "project", label: "Project", render: getProjectName },
              {
                key: "status",
                label: "Status",
                render: (app) => <StatusPill value={formatWorkflowStatus(app.status)} />,
              },
              {
                key: "updated",
                label: "Updated",
                render: (app) => formatDate(app.updated_at),
              },
            ]}
          />
        </Panel>

        <Panel title="Action Panel" description={config.actionDescription}>
          {!selected ? (
            <p className="text-sm text-slate-500">Select an application.</p>
          ) : (
            <div className="space-y-4">
              <ApplicationSummary app={selected} />

              {config.showDecision && (
                <Field label={config.decisionLabel || "Decision"}>
                  <select
                    value={decision}
                    onChange={(event) => setDecision(event.target.value)}
                    className="form-input"
                  >
                    {config.decisions.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </Field>
              )}

              {config.showComment && (
                <Field label={config.commentLabel || "Notes"}>
                  <textarea
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    rows="5"
                    className="form-input"
                    placeholder={config.commentPlaceholder || "Enter notes"}
                  />
                </Field>
              )}

              {config.details && <config.details app={selected} />}

              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="secondary"
                  onClick={() => navigate(`/admin/applications/${selected.id}`)}
                >
                  Open Form
                </Button>
                {config.actions.map((action) => (
                  <Button
                    key={action.label}
                    onClick={() => submitAction(action)}
                    disabled={saving}
                    variant={action.variant || "primary"}
                    icon={action.icon}
                  >
                    {saving ? "Saving..." : action.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </section>

      <Panel title="Selected Record" description="Key information from the backend application.">
        {selected ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Info label="Reference" value={getApplicationReference(selected)} />
            <Info label="Applicant" value={getApplicantName(selected)} />
            <Info label="Type" value={getApplicationType(selected)} />
            <Info label="Project" value={getProjectName(selected)} />
            <Info label="Location" value={getApplicationLocation(selected)} />
            <Info label="Status" value={formatWorkflowStatus(selected.status)} />
          </div>
        ) : (
          <p className="text-sm text-slate-500">No record selected.</p>
        )}
      </Panel>
    </AdminDashboardLayout>
  );
}

function mergeFormData(app, next) {
  return {
    ...(app.form_data || {}),
    ...next,
  };
}

function countBy(applications, predicate) {
  return applications.filter(predicate).length;
}

const configs = {
  screening: {
    eyebrow: "S2 Verification",
    title: "Auto Screening",
    description: "Run completeness, zoning/GIS placeholder, blacklist placeholder, and duplicate-location checks before technical review.",
    queueTitle: "Screening Queue",
    actionDescription: "Run S2 validation for the selected submitted application.",
    showComment: false,
    stats: (apps) => [
      { label: "Total", value: apps.length, icon: "folder" },
      { label: "Pending", value: countBy(apps, (app) => !app.form_data?.auto_screening), icon: "pending", tone: "amber" },
      { label: "Screened", value: countBy(apps, (app) => Boolean(app.form_data?.auto_screening)), icon: "fact_check" },
      { label: "Passed", value: countBy(apps, (app) => app.form_data?.auto_screening?.result === "Passed"), icon: "task_alt" },
    ],
    actions: [
      {
        label: "Run Screening",
        icon: "fact_check",
        success: "S2 screening completed.",
        buildPayload: (app) => {
          const checks = buildScreeningChecks(app);
          const hasFailed = checks.some((item) => item.result === "Failed");
          const result = hasFailed ? "Needs Correction" : "Passed";
          return {
            status: hasFailed ? "submitted" : "auto_screened",
            current_step: Math.max(Number(app.current_step || 1), 11),
            form_data: mergeFormData(app, {
              auto_screening: {
                status: "Screened",
                result,
                checks,
                checked_at: new Date().toISOString(),
              },
            }),
          };
        },
      },
    ],
    details: ScreeningDetails,
  },
  technical: {
    eyebrow: "Parallel Review",
    title: "Technical Review",
    description: "Capture department support decisions for Unit Iklan, BLG, IMT, MNE, ENG, GPM, and LNP review.",
    queueTitle: "Technical Queue",
    actionDescription: "Record technical decision and comments.",
    showDecision: true,
    showComment: true,
    defaultDecision: "Supported",
    decisions: ["Supported", "Supported with Conditions", "Rejected"],
    commentLabel: "Technical Comment",
    commentPlaceholder: "Add department comments, conditions, site notes, or rejection reasons.",
    stats: (apps) => [
      { label: "Pending", value: countBy(apps, (app) => !app.form_data?.technical_review), icon: "pending", tone: "amber" },
      { label: "Completed", value: countBy(apps, (app) => Boolean(app.form_data?.technical_review)), icon: "task_alt" },
      { label: "Supported", value: countBy(apps, (app) => app.form_data?.technical_review?.decision === "Supported"), icon: "thumb_up" },
      { label: "Rejected", value: countBy(apps, (app) => app.form_data?.technical_review?.decision === "Rejected"), icon: "thumb_down", tone: "red" },
    ],
    actions: [
      {
        label: "Submit Review",
        icon: "send",
        requiresComment: true,
        success: "Technical review saved.",
        buildPayload: (app, data) => ({
          status: "technical_review_completed",
          current_step: Math.max(Number(app.current_step || 1), 11),
          form_data: mergeFormData(app, {
            technical_review: {
              status: "Completed",
              decision: data.decision,
              comment: data.comment,
              department: "Advertisement Unit",
              reviewed_at: new Date().toISOString(),
            },
          }),
        }),
      },
    ],
  },
  approval: {
    eyebrow: "Management and MPHLG",
    title: "Approval",
    description: "Record TP(RES) recommendation, MPHLG digital decision, and final approval with e-signature metadata.",
    queueTitle: "Approval Queue",
    actionDescription: "Submit final approval decision.",
    showDecision: true,
    showComment: true,
    defaultDecision: "Approved",
    decisions: ["Approved", "Approved with Conditions", "Rejected"],
    commentLabel: "Approval Notes",
    stats: (apps) => [
      { label: "Awaiting", value: countBy(apps, (app) => !app.form_data?.approval), icon: "pending", tone: "amber" },
      { label: "Approved", value: countBy(apps, (app) => normalizeStatus(app.status) === "approved"), icon: "task_alt" },
      { label: "Conditional", value: countBy(apps, (app) => normalizeStatus(app.status) === "approved_with_conditions"), icon: "rule", tone: "blue" },
      { label: "Rejected", value: countBy(apps, (app) => normalizeStatus(app.status) === "rejected"), icon: "cancel", tone: "red" },
    ],
    actions: [
      {
        label: "Submit Decision",
        icon: "approval_delegation",
        requiresComment: true,
        success: "Final decision saved.",
        buildPayload: (app, data) => {
          const status =
            data.decision === "Rejected"
              ? "rejected"
              : data.decision === "Approved with Conditions"
                ? "approved_with_conditions"
                : "approved";
          return {
            status,
            current_step: Math.max(Number(app.current_step || 1), 11),
            form_data: mergeFormData(app, {
              management_recommendation: {
                status: "Completed",
                officer: "TP(RES)",
                signed_at: new Date().toISOString(),
              },
              mphlg_gateway: {
                status: "Decision Received",
                received_at: new Date().toISOString(),
              },
              approval: {
                status: "Completed",
                final_decision: data.decision,
                notes: data.comment,
                approved_at: new Date().toISOString(),
              },
            }),
          };
        },
      },
    ],
  },
  payment: {
    eyebrow: "Payment",
    title: "Invoice and Payment",
    description: "Generate invoice, capture online transfer receipt, and verify payment before issuing e-license.",
    queueTitle: "Payment Queue",
    actionDescription: "Generate invoice or verify applicant payment.",
    showComment: true,
    commentLabel: "Payment Reference / Notes",
    commentPlaceholder: "Receipt reference, transfer notes, or verification remarks.",
    stats: (apps) => [
      { label: "Pending", value: countBy(apps, (app) => !app.form_data?.payment), icon: "pending", tone: "amber" },
      { label: "Invoiced", value: countBy(apps, (app) => normalizeStatus(app.status) === "invoice_generated"), icon: "receipt_long", tone: "blue" },
      { label: "Submitted", value: countBy(apps, (app) => normalizeStatus(app.status) === "payment_submitted"), icon: "payments" },
      { label: "Verified", value: countBy(apps, (app) => normalizeStatus(app.status) === "payment_verified"), icon: "verified" },
    ],
    actions: [
      {
        label: "Generate Invoice",
        icon: "receipt_long",
        success: "Invoice generated.",
        buildPayload: (app) => ({
          status: "invoice_generated",
          form_data: mergeFormData(app, {
            payment: {
              ...(app.form_data?.payment || {}),
              invoice_no: getInvoiceNo(app),
              amount: app.form_data?.payment?.amount || 250,
              status: "Invoice Generated",
              generated_at: new Date().toISOString(),
            },
          }),
        }),
      },
      {
        label: "Submit Payment",
        icon: "payments",
        success: "Payment submission recorded.",
        buildPayload: (app, data) => ({
          status: "payment_submitted",
          form_data: mergeFormData(app, {
            payment: {
              ...(app.form_data?.payment || {}),
              invoice_no: getInvoiceNo(app),
              amount: app.form_data?.payment?.amount || 250,
              status: "Payment Submitted",
              receipt_reference: data.comment || "Manual submission",
              submitted_at: new Date().toISOString(),
            },
          }),
        }),
      },
      {
        label: "Verify Payment",
        icon: "verified",
        success: "Payment verified.",
        buildPayload: (app) => ({
          status: "payment_verified",
          form_data: mergeFormData(app, {
            payment: {
              ...(app.form_data?.payment || {}),
              status: "Payment Verified",
              verified_at: new Date().toISOString(),
            },
          }),
        }),
      },
    ],
    details: PaymentDetails,
  },
  license: {
    eyebrow: "Completion",
    title: "E-License and QR",
    description: "Issue, verify, or revoke QR digital licenses for enforcement scanning.",
    queueTitle: "License Queue",
    actionDescription: "Issue or revoke e-license.",
    showComment: false,
    stats: (apps) => [
      { label: "Pending", value: countBy(apps, (app) => normalizeStatus(app.status) !== "license_issued"), icon: "pending", tone: "amber" },
      { label: "Issued", value: countBy(apps, (app) => normalizeStatus(app.status) === "license_issued"), icon: "qr_code_2" },
      { label: "Revoked", value: countBy(apps, (app) => normalizeStatus(app.status) === "license_revoked"), icon: "block", tone: "red" },
      { label: "Active", value: countBy(apps, (app) => app.form_data?.license?.status === "Active"), icon: "verified" },
    ],
    actions: [
      {
        label: "Issue License",
        icon: "qr_code_2",
        success: "E-license issued.",
        buildPayload: (app) => {
          const today = new Date();
          const expiry = new Date(today);
          expiry.setFullYear(today.getFullYear() + 1);
          const licenseId = getLicenseId(app);
          return {
            status: "license_issued",
            form_data: mergeFormData(app, {
              license: {
                license_id: licenseId,
                status: "Active",
                holder: getApplicantName(app),
                type: getApplicationType(app),
                location: getApplicationLocation(app),
                issue_date: today.toISOString(),
                expiry_date: expiry.toISOString(),
                verification_url: `${window.location.origin}/license/verify/${licenseId}`,
                issued_at: new Date().toISOString(),
              },
            }),
          };
        },
      },
      {
        label: "Revoke",
        icon: "block",
        variant: "danger",
        success: "License revoked.",
        buildPayload: (app) => ({
          status: "license_revoked",
          form_data: mergeFormData(app, {
            license: {
              ...(app.form_data?.license || {}),
              status: "Revoked",
              revoked_at: new Date().toISOString(),
            },
          }),
        }),
      },
    ],
    details: LicenseDetails,
  },
};

function buildScreeningChecks(app) {
  const form = app.form_data || {};
  const step1 = form.step_1 || {};
  const step10 = form.step_10 || {};
  const step11 = form.step_11 || {};
  const docs = Array.isArray(step10.documents) ? step10.documents : [];

  return [
    {
      label: "Application form",
      result: step1.project_name || app.title ? "Passed" : "Failed",
    },
    {
      label: "GIS / location",
      result: step1.latitude || step1.locality_address || step1.map_address ? "Passed" : "Warning",
    },
    {
      label: "Supporting documents",
      result: docs.length > 0 ? "Passed" : "Warning",
    },
    {
      label: "Blacklist placeholder",
      result: "Passed",
    },
    {
      label: "Duplicate location placeholder",
      result: "Passed",
    },
    {
      label: "Applicant declaration",
      result: step11.submitted || normalizeStatus(app.status) !== "draft" ? "Passed" : "Failed",
    },
  ];
}

function ScreeningDetails({ app }) {
  const checks = app.form_data?.auto_screening?.checks || buildScreeningChecks(app);

  return (
    <div className="space-y-2">
      {checks.map((item) => (
        <div key={item.label} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2">
          <span className="text-sm font-medium text-slate-700">{item.label}</span>
          <StatusPill value={item.result} />
        </div>
      ))}
    </div>
  );
}

function PaymentDetails({ app }) {
  const payment = app.form_data?.payment || {};
  return (
    <div className="grid grid-cols-1 gap-3 text-sm">
      <Info label="Invoice" value={payment.invoice_no || getInvoiceNo(app)} />
      <Info label="Amount" value={formatCurrency(payment.amount || 250)} />
      <Info label="Status" value={payment.status || "Not generated"} />
      <Info label="Receipt" value={payment.receipt_reference || "Not submitted"} />
    </div>
  );
}

function LicenseDetails({ app }) {
  const license = app.form_data?.license || {};
  return (
    <div className="grid grid-cols-1 gap-3 text-sm">
      <Info label="License ID" value={license.license_id || getLicenseId(app)} />
      <Info label="Status" value={license.status || "Pending issuance"} />
      <Info label="Expiry" value={formatDate(license.expiry_date)} />
      <Info label="Verification URL" value={license.verification_url || "Not generated"} />
    </div>
  );
}

export default ProcessWorkspace;
