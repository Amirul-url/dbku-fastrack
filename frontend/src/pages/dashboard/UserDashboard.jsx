import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";
import UserDashboardLayout from "../../layout/UserDashboardLayout";
import { apiRequest } from "../../services/api";
import {
  Alert,
  Button,
  DataTable,
  Field,
  Info,
  LinkButton,
  PageHeader,
  Panel,
  StatCard,
  StatusPill,
  WorkflowStrip,
} from "../../components/ui/SystemUI";
import LicenseQrCard from "../../components/license/LicenseQrCard";
import InvoicePreview from "../../components/payment/InvoicePreview";
import {
  canSubmitPayment,
  canViewLicense,
  formatCurrency,
  formatDate,
  formatWorkflowStatus,
  getApplicantName,
  getApplicationReference,
  getApplicationType,
  getInvoiceNo,
  getLicenseId,
  getProjectName,
  normalizeStatus,
} from "../../utils/workflow";

function UserDashboard() {
  const navigate = useNavigate();
  const { language, t } = useLanguage();
  const [applications, setApplications] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [receiptReference, setReceiptReference] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("FPX");
  const [message, setMessage] = useState({ type: "", text: "" });
  const licenseCardRef = useRef(null);

  const fetchApplications = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiRequest("/applications/");
      const list = Array.isArray(data) ? data : data?.results || [];
      setApplications(list);
      setSelectedId((current) => current || (list.length > 0 ? String(list[0].id) : ""));
    } catch (err) {
      console.error("Failed to load applications:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchApplicationDetails = useCallback(async (id) => {
    try {
      setDetailsLoading(true);
      const data = await apiRequest(`/applications/${id}/`);
      setSelectedApplication(data);
      setReceiptReference(data?.form_data?.payment?.receipt_reference || "");
      setPaymentMethod(data?.form_data?.payment?.payment_channel || "FPX");
    } catch (err) {
      console.error("Failed to load application details:", err);
      setMessage({ type: "error", text: t("applicant.detailsLoadFailed") });
    } finally {
      setDetailsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchApplications();
  }, [fetchApplications]);

  useEffect(() => {
    if (selectedId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchApplicationDetails(selectedId);
    }
  }, [fetchApplicationDetails, selectedId]);

  const stats = useMemo(() => {
    const drafts = applications.filter(
      (app) => normalizeStatus(app.status) === "draft"
    ).length;
    const submitted = applications.filter(
      (app) => normalizeStatus(app.status) !== "draft"
    ).length;
    const payment = applications.filter((app) =>
      ["approved", "invoice_generated", "payment_submitted"].includes(
        normalizeStatus(app.status)
      )
    ).length;
    const licenses = applications.filter(
      (app) => normalizeStatus(app.status) === "license_issued"
    ).length;

    return { drafts, submitted, payment, licenses };
  }, [applications]);

  const latest = applications[0];
  const activeApplication = selectedApplication || latest;
  const payment = activeApplication?.form_data?.payment || {};
  const license = activeApplication?.form_data?.license || {};
  const paymentAmount = payment.amount || 250;

  function openApplication(app) {
    const step = Number(app.current_step || 1);
    const routes = {
      1: "edit",
      2: "client-department",
      3: "submitting-person",
      4: "land-details",
      5: "building-plan",
      6: "proposal-analysis",
      7: "site-inspection",
      8: "building-plan-checklist",
      9: "print-form",
      10: "supporting-document",
      11: "declaration",
    };

    if (normalizeStatus(app.status) === "draft") {
      navigate(`/applications/${app.id}/${routes[step] || "edit"}?id=${app.id}`);
      return;
    }

    navigate(`/applications/${app.id}/declaration?id=${app.id}`);
  }

  async function submitPayment() {
    if (!selectedApplication || !canSubmitPayment(selectedApplication)) return;

    try {
      setSaving(true);
      setMessage({ type: "", text: "" });

      const current = await apiRequest(`/applications/${selectedApplication.id}/`);
      const currentPayment = current.form_data?.payment || {};
      const receipt = receiptReference.trim() || `${paymentMethod}-${Date.now()}`;

      await apiRequest(`/applications/${selectedApplication.id}/`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "payment_submitted",
          form_data: {
            ...(current.form_data || {}),
            payment: {
              ...currentPayment,
              invoice_no: currentPayment.invoice_no || getInvoiceNo(current),
              amount: currentPayment.amount || 250,
              status: "Payment Submitted",
              payment_channel: paymentMethod,
              receipt_reference: receipt,
              submitted_at: new Date().toISOString(),
            },
          },
        }),
      });

      setMessage({
        type: "success",
        text: t("applicant.paymentSubmittedSuccess"),
      });
      await fetchApplications();
      await fetchApplicationDetails(selectedApplication.id);
    } catch (err) {
      setMessage({ type: "error", text: err.message || t("applicant.paymentSubmissionFailed") });
    } finally {
      setSaving(false);
    }
  }

  function downloadELicense() {
    if (!activeApplication || !canViewLicense(activeApplication)) return;

    const canvas = licenseCardRef.current?.querySelector("canvas");
    const qrImage = canvas?.toDataURL("image/png") || "";
    const licenseId = license.license_id || getLicenseId(activeApplication);
    const safeReference = getApplicationReference(activeApplication).replace(/[^a-z0-9-]/gi, "_");

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${licenseId}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #0f172a; margin: 32px; }
    .license { max-width: 720px; border: 1px solid #d7dde5; padding: 28px; }
    .eyebrow { color: #047857; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    h1 { margin: 8px 0 20px; font-size: 24px; }
    dl { display: grid; grid-template-columns: 180px 1fr; gap: 10px 18px; font-size: 14px; }
    dt { color: #64748b; font-weight: 700; text-transform: uppercase; font-size: 11px; }
    dd { margin: 0; font-weight: 600; }
    .qr { margin-top: 24px; }
    .qr img { width: 180px; height: 180px; border: 1px solid #d7dde5; padding: 10px; }
  </style>
</head>
<body>
  <section class="license">
    <p class="eyebrow">DBKU fasTrack Digital Advertisement License</p>
    <h1>${licenseId}</h1>
    <dl>
      <dt>Reference</dt><dd>${getApplicationReference(activeApplication)}</dd>
      <dt>License Holder</dt><dd>${getApplicantName(activeApplication)}</dd>
      <dt>Project</dt><dd>${getProjectName(activeApplication)}</dd>
      <dt>Type</dt><dd>${getApplicationType(activeApplication)}</dd>
      <dt>Status</dt><dd>${license.status || "Active"}</dd>
      <dt>Issue Date</dt><dd>${formatDate(license.issue_date)}</dd>
      <dt>Expiry Date</dt><dd>${formatDate(license.expiry_date)}</dd>
      <dt>Verification</dt><dd>${license.verification_url || "-"}</dd>
    </dl>
    ${qrImage ? `<div class="qr"><img src="${qrImage}" alt="License QR" /></div>` : ""}
  </section>
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeReference}-e-license.html`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <UserDashboardLayout>
      <PageHeader
        eyebrow={t("applicant.portal")}
        title={t("applicant.dashboardTitle")}
        description={t("applicant.dashboardDescription")}
        actions={<LinkButton to="/applications/new" icon="add">{t("common.newApplication")}</LinkButton>}
      />

      <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("common.drafts")} value={loading ? "..." : stats.drafts} icon="edit_document" tone="amber" />
        <StatCard label={t("common.submitted")} value={loading ? "..." : stats.submitted} icon="task_alt" />
        <StatCard label={t("common.paymentAction")} value={loading ? "..." : stats.payment} icon="payments" tone="blue" />
        <StatCard label={t("common.eLicenses")} value={loading ? "..." : stats.licenses} icon="qr_code_2" />
      </section>

      <ApplicantFlowOverview
        activeApplication={activeApplication}
        onOpenApplication={() => activeApplication && openApplication(activeApplication)}
        onDownloadELicense={downloadELicense}
        language={language}
        t={t}
      />

      <Panel
        title={t("applicant.currentProgress")}
        description={
          activeApplication
            ? `${getApplicationReference(activeApplication)} - ${translatedStatus(t, activeApplication.status)}`
            : t("applicant.noApplicationSubmitted")
        }
        className="mb-6"
      >
        {activeApplication ? (
          <WorkflowStrip currentStatus={activeApplication.status} language={language} />
        ) : (
          <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
            {t("applicant.createApplicationHint")}
          </div>
        )}
      </Panel>

      <Panel
        title={t("applicant.actionsTitle")}
        description={
          activeApplication
            ? t("applicant.actionsDescription")
            : t("applicant.actionsEmptyDescription")
        }
        className="mb-6"
      >
        <Alert type={message.type || "success"} message={message.text} />

        {activeApplication ? (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4">
              <ApplicantStepCard
                code="S1"
                icon="account_circle"
                title={t("applicant.s1ActionTitle")}
                status={normalizeStatus(activeApplication.status) === "draft" ? t("applicant.actionRequired") : t("applicant.completed")}
                tone={normalizeStatus(activeApplication.status) === "draft" ? "amber" : "emerald"}
                details={[
                  [t("common.application"), getApplicationReference(activeApplication)],
                  [t("common.applicant"), getApplicantName(activeApplication)],
                  [t("common.lastUpdated"), formatDate(activeApplication.updated_at)],
                ]}
                action={
                  <Button variant="secondary" onClick={() => openApplication(activeApplication)}>
                    {normalizeStatus(activeApplication.status) === "draft" ? t("applicant.continueApplication") : t("applicant.viewSubmission")}
                  </Button>
                }
              />

              <ApplicantStepCard
                code={language === "ms" ? "Pembetulan" : "Correction"}
                icon="mark_email_unread"
                title={t("applicant.correctionTitle")}
                status={normalizeStatus(activeApplication.status) === "incomplete" ? t("applicant.correctionRequired") : t("applicant.noCorrectionRequest")}
                tone={normalizeStatus(activeApplication.status) === "incomplete" ? "amber" : "slate"}
                details={[
                  [t("common.notification"), normalizeStatus(activeApplication.status) === "incomplete" ? t("applicant.emailCorrectionRequested") : t("applicant.noActiveCorrectionNotice")],
                  [t("common.nextStep"), normalizeStatus(activeApplication.status) === "incomplete" ? t("applicant.updateApplicationForm") : t("applicant.waitLicensingReview")],
                ]}
                action={
                  normalizeStatus(activeApplication.status) === "incomplete" ? (
                    <Button variant="primary" onClick={() => openApplication(activeApplication)}>
                      {t("applicant.openCorrection")}
                    </Button>
                  ) : null
                }
              />

              <ApplicantStepCard
                code={language === "ms" ? "Keputusan" : "Decision"}
                icon="notifications_active"
                title={t("applicant.receiveDecisionTitle")}
                status={getDecisionStatus(activeApplication, t)}
                tone={getDecisionTone(activeApplication)}
                details={getDecisionDetails(activeApplication, t)}
              />

              <div className="rounded-lg border border-slate-200">
                <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <span className="material-symbols-outlined rounded-md bg-blue-50 p-2 text-blue-700">
                      payments
                    </span>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">S13</p>
                      <h3 className="text-sm font-semibold text-slate-950">
                        {t("applicant.paymentByFpxCard")}
                      </h3>
                    </div>
                  </div>
                  <StatusPill value={translatedStatus(t, activeApplication.status)} />
                </div>

                <div className="grid grid-cols-1 gap-5 p-4 lg:grid-cols-2">
                  <div className="space-y-3 text-sm">
                    <Info label={t("common.invoice")} value={payment.invoice_no || getInvoiceNo(activeApplication)} />
                    <Info label={t("common.amount")} value={formatCurrency(paymentAmount)} />
                    <Info label={t("common.paymentStatus")} value={payment.status || t("applicant.waitingInvoice")} />
                    <Info label={t("common.receiptReference")} value={payment.receipt_reference || t("applicant.notSubmitted")} />
                  </div>

                  {canSubmitPayment(activeApplication) ? (
                    <div className="space-y-3">
                      <Field label={t("common.paymentMethod")}>
                        <select
                          value={paymentMethod}
                          onChange={(event) => setPaymentMethod(event.target.value)}
                          className="form-input"
                        >
                          <option value="FPX">FPX Online Banking</option>
                          <option value="Card">Credit / Debit Card</option>
                        </select>
                      </Field>
                      <Field label={t("common.receiptReference")}>
                        <input
                          value={receiptReference}
                          onChange={(event) => setReceiptReference(event.target.value)}
                          className="form-input"
                          placeholder="Example: FPX-20260507-001"
                        />
                      </Field>
                      <Button onClick={submitPayment} disabled={saving} icon="payments">
                        {saving ? t("common.submitting") : t("applicant.submitPayment")}
                      </Button>
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                      {getPaymentHint(activeApplication, t)}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <aside className="space-y-5">
              {detailsLoading ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                  {t("common.loadingSelectedApplication")}
                </div>
              ) : (
                <>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {t("applicant.selectedApplication")}
                    </p>
                    <h3 className="mt-1 text-base font-semibold text-slate-950">
                      {getApplicationReference(activeApplication)}
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {getProjectName(activeApplication)}
                    </p>
                    <div className="mt-3">
                      <StatusPill value={translatedStatus(t, activeApplication.status)} />
                    </div>
                  </div>

                  {payment.invoice_no && (
                    <InvoicePreview
                      application={activeApplication}
                      amount={paymentAmount}
                      invoiceDate={payment.generated_at || activeApplication.updated_at}
                      dueDate={payment.due_date || activeApplication.updated_at}
                    />
                  )}

                  {canViewLicense(activeApplication) ? (
                    <div className="space-y-3">
                      <div ref={licenseCardRef}>
                        <LicenseQrCard application={activeApplication} license={license} />
                      </div>
                      <Button onClick={downloadELicense} icon="download" className="w-full">
                        {t("applicant.downloadQrELicense")}
                      </Button>
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                      {t("applicant.qrLicensePending")}
                    </div>
                  )}
                </>
              )}
            </aside>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
            {t("applicant.workflowInactive")}
          </div>
        )}
      </Panel>

      <Panel title={t("applicant.applicationsTitle")} description={t("applicant.myApplicationsDesc")}>
        <DataTable
          loading={loading}
          loadingText={t("common.loading")}
          emptyText={t("applicant.noApplicationsYet")}
          rows={applications}
          columns={[
            {
              key: "reference",
              label: t("common.reference"),
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
            { key: "project", label: t("common.project"), render: getProjectName },
            { key: "type", label: t("common.type"), render: getApplicationType },
            {
              key: "status",
              label: t("common.status"),
              render: (app) => <StatusPill value={translatedStatus(t, app.status)} />,
            },
            { key: "updated", label: t("common.updated"), render: (app) => formatDate(app.updated_at) },
            {
              key: "action",
              label: t("common.action"),
              render: (app) => (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedId(String(app.id))}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {t("common.manage")}
                  </button>
                  <button
                    type="button"
                    onClick={() => openApplication(app)}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {normalizeStatus(app.status) === "draft" ? t("common.continue") : t("common.view")}
                  </button>
                </div>
              ),
            },
          ]}
        />
      </Panel>
    </UserDashboardLayout>
  );
}

function ApplicantFlowOverview({ activeApplication, onOpenApplication, onDownloadELicense, language, t }) {
  const status = normalizeStatus(activeApplication?.status);
  const hasApplication = Boolean(activeApplication);
  const correctionActive = status === "incomplete";
  const decisionReady = [
    "approved",
    "approved_with_conditions",
    "rejected",
    "invoice_generated",
    "payment_submitted",
    "payment_verified",
    "license_issued",
    "license_revoked",
  ].includes(status);
  const paymentActive = [
    "invoice_generated",
    "payment_submitted",
    "payment_verified",
    "license_issued",
  ].includes(status);
  const licenseReady = status === "license_issued" || status === "license_revoked";

  return (
    <Panel
      title={t("applicant.flowTitle")}
      description={t("applicant.flowDescription")}
      className="mb-6"
    >
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
        <FlowNode
          tone="blue"
          icon="play_arrow"
          eyebrow="START"
          title={t("applicant.startTitle")}
          description={t("applicant.startDesc")}
          state={t("common.ready")}
        />
        <FlowNode
          tone={hasApplication ? "emerald" : "amber"}
          icon="account_circle"
          eyebrow="S1"
          title={t("applicant.s1Title")}
          description={t("applicant.s1Desc")}
          state={hasApplication ? t("applicant.applicationSelected") : t("applicant.noApplicationYet")}
        />
        <FlowNode
          tone={hasApplication && status !== "draft" ? "emerald" : "amber"}
          icon="upload_file"
          eyebrow={language === "ms" ? "BORANG" : "FORM"}
          title={t("applicant.formUploadTitle")}
          description={t("applicant.formUploadDesc")}
          state={status === "draft" ? t("status.draft") : hasApplication ? t("status.submitted") : t("applicant.startRequired")}
          action={
            hasApplication ? (
              <Button variant="secondary" onClick={onOpenApplication}>
                {status === "draft" ? t("common.continue") : t("common.view")}
              </Button>
            ) : (
              <LinkButton to="/applications/new" icon="add" variant="secondary">
                {t("common.new")}
              </LinkButton>
            )
          }
        />
        <FlowNode
          tone={correctionActive ? "amber" : hasApplication ? "emerald" : "slate"}
          icon={correctionActive ? "mark_email_unread" : "task_alt"}
          eyebrow="STATUS"
          title={t("applicant.statusCompleteTitle")}
          description={correctionActive ? t("applicant.correctionEmailDesc") : t("applicant.memoDesc")}
          state={correctionActive ? t("applicant.statusCorrection") : hasApplication ? t("applicant.statusCompleteYes") : t("common.pending")}
        />
        <FlowNode
          tone={hasApplication && status !== "draft" && !correctionActive ? "emerald" : "slate"}
          icon="description"
          eyebrow="MEMO"
          title={t("applicant.memoTitle")}
          description={t("applicant.memoMoveDesc")}
          state={hasApplication && status !== "draft" && !correctionActive ? t("common.done") : t("common.waiting")}
        />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-4">
        <FlowNode
          tone={decisionReady ? (status === "rejected" ? "red" : "emerald") : "slate"}
          icon="notifications_active"
          eyebrow={language === "ms" ? "KEPUTUSAN" : "DECISION"}
          title={t("applicant.decisionNoticeTitle")}
          description={t("applicant.decisionNoticeDesc")}
          state={decisionReady ? translatedStatus(t, status) : t("common.waiting")}
        />
        <FlowNode
          tone={paymentActive ? "blue" : "slate"}
          icon="payments"
          eyebrow="S13"
          title={t("applicant.onlinePaymentTitle")}
          description={t("applicant.onlinePaymentDesc")}
          state={paymentActive ? translatedStatus(t, status) : t("applicant.waitingInvoice")}
        />
        <FlowNode
          tone={licenseReady ? "emerald" : "slate"}
          icon="qr_code_2"
          eyebrow={language === "ms" ? "E-LESEN" : "E-LICENSE"}
          title={t("applicant.licenseDownloadTitle")}
          description={t("applicant.licenseDownloadDesc")}
          state={licenseReady ? t("common.ready") : t("common.waiting")}
          action={
            licenseReady ? (
              <Button variant="secondary" onClick={onDownloadELicense}>
                {t("common.download")}
              </Button>
            ) : null
          }
        />
        <FlowNode
          tone={licenseReady ? "blue" : "slate"}
          icon="flag"
          eyebrow="SND"
          title={t("applicant.endTitle")}
          description={t("applicant.endDesc")}
          state={licenseReady ? t("common.complete") : t("common.notComplete")}
        />
      </div>
    </Panel>
  );
}

function FlowNode({ tone = "slate", icon, eyebrow, title, description, state, action }) {
  const tones = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    red: "border-red-200 bg-red-50 text-red-700",
    slate: "border-slate-200 bg-slate-50 text-slate-600",
  };

  return (
    <div className={`rounded-lg border p-4 ${tones[tone]}`}>
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-[22px]">{icon}</span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{eyebrow}</p>
          <h3 className="mt-1 text-sm font-semibold text-slate-950">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-600">{description}</p>
        </div>
      </div>
      <div className="mt-4 flex min-h-10 flex-wrap items-center justify-between gap-2">
        <StatusPill value={state} />
        {action}
      </div>
    </div>
  );
}

function ApplicantStepCard({ code, icon, title, status, tone = "slate", details = [], action }) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-blue-50 text-blue-700",
    red: "bg-red-50 text-red-700",
    slate: "bg-slate-100 text-slate-700",
  };

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className={`material-symbols-outlined rounded-md p-2 ${tones[tone]}`}>
            {icon}
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {code}
            </p>
            <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
            <p className="mt-1 text-sm text-slate-500">{status}</p>
          </div>
        </div>
        {action}
      </div>

      {details.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
          {details.map(([label, value]) => (
            <Info key={label} label={label} value={value} />
          ))}
        </div>
      )}
    </div>
  );
}

function translatedStatus(t, status) {
  return t(`status.${normalizeStatus(status)}`, formatWorkflowStatus(status));
}

function getDecisionStatus(app, t) {
  const status = normalizeStatus(app?.status);

  if (status === "rejected") return t("decision.notApproved");
  if (["approved", "approved_with_conditions", "invoice_generated", "payment_submitted", "payment_verified", "license_issued"].includes(status)) {
    return t("decision.approved");
  }
  return t("decision.waiting");
}

function getDecisionTone(app) {
  const status = normalizeStatus(app?.status);

  if (status === "rejected") return "red";
  if (["approved", "approved_with_conditions", "invoice_generated", "payment_submitted", "payment_verified", "license_issued"].includes(status)) {
    return "emerald";
  }
  return "slate";
}

function getDecisionDetails(app, t) {
  const approval = app?.form_data?.approval || {};
  const status = normalizeStatus(app?.status);

  if (status === "rejected") {
    return [
      [t("common.decision"), t("decision.rejected")],
      [t("common.remark"), approval.notes || approval.comment || t("decision.referNotice")],
      [t("common.date"), formatDate(approval.signed_at || app?.updated_at)],
    ];
  }

  if (["approved", "approved_with_conditions", "invoice_generated", "payment_submitted", "payment_verified", "license_issued"].includes(status)) {
    return [
      [t("common.decision"), status === "approved_with_conditions" ? t("decision.approvedWithConditions") : t("decision.approved")],
      [t("common.remark"), approval.notes || approval.comment || t("decision.notificationReceived")],
      [t("common.date"), formatDate(approval.signed_at || app?.updated_at)],
    ];
  }

  return [
    [t("common.decision"), t("decision.pending")],
    [t("common.currentPhase"), translatedStatus(t, app?.status)],
    [t("common.updated"), formatDate(app?.updated_at)],
  ];
}

function getPaymentHint(app, t) {
  const status = normalizeStatus(app?.status);

  if (status === "draft") return t("applicant.paymentHintDraft");
  if (status === "rejected") return t("applicant.paymentHintRejected");
  if (status === "payment_submitted") return t("applicant.paymentHintSubmitted");
  if (status === "payment_verified") return t("applicant.paymentHintVerified");
  if (status === "license_issued") return t("applicant.paymentHintIssued");
  return t("applicant.paymentHintDefault");
}

export default UserDashboard;
