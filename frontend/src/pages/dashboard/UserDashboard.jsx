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
  const [paymentReceipt, setPaymentReceipt] = useState(null);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [activeTab, setActiveTab] = useState("applications");
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
      const paymentData = data?.form_data?.payment || {};
      const receiptWasRejected =
        paymentData.status === "Receipt Rejected" ||
        paymentData.verification_result === "Invalid/Fake";

      setSelectedApplication(data);
      setPaymentReceipt(receiptWasRejected ? null : paymentData.receipt_file || null);
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
    const total = applications.length;
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

    return { total, drafts, submitted, payment, licenses };
  }, [applications]);

  const latest = applications[0];
  const activeApplication = selectedApplication || latest;
  const payment = activeApplication?.form_data?.payment || {};
  const license = activeApplication?.form_data?.license || {};
  const paymentAmount = payment.amount || 250;
  const dashboardTabs = [
    { id: "applications", label: t("applicant.tabApplications"), icon: "list_alt" },
    { id: "status", label: t("applicant.tabStatus"), icon: "timeline" },
    { id: "payment", label: t("applicant.tabPayment"), icon: "receipt_long" },
    { id: "license", label: t("applicant.tabLicense"), icon: "qr_code_2" },
  ];

  function openApplication(app) {
    const step = Number(app.current_step || 1);
    const routes = {
      1: "edit",
      2: "submitting-person",
      3: "supporting-document",
      4: "declaration",
      5: "print-form",
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
      const receiptWasRejected =
        currentPayment.status === "Receipt Rejected" ||
        currentPayment.verification_result === "Invalid/Fake";
      const receiptFile = paymentReceipt || (receiptWasRejected ? null : currentPayment.receipt_file);

      if (!receiptFile) {
        setMessage({ type: "error", text: t("applicant.receiptUploadRequired") });
        return;
      }

      const receipt = receiptFile.name || currentPayment.receipt_reference || `RECEIPT-${Date.now()}`;

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
              verification_result: null,
              verification_notes: "",
              rejected_at: null,
              receipt_reference: receipt,
              receipt_file: receiptFile,
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

  async function handlePaymentReceiptChange(file) {
    if (!file) return;

    try {
      const receipt = await readFileAsDataUrl(file);
      setPaymentReceipt(receipt);
      setMessage({ type: "", text: "" });
    } catch (err) {
      console.error("Receipt upload failed:", err);
      setMessage({ type: "error", text: t("applicant.receiptUploadFailed") });
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

      <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label={t("applicant.totalApplications")} value={loading ? "..." : stats.total} icon="folder_open" tone="slate" />
        <StatCard label={t("common.drafts")} value={loading ? "..." : stats.drafts} icon="edit_document" tone="amber" />
        <StatCard label={t("common.submitted")} value={loading ? "..." : stats.submitted} icon="task_alt" />
        <StatCard label={t("common.paymentAction")} value={loading ? "..." : stats.payment} icon="payments" tone="blue" />
        <StatCard label={t("common.eLicenses")} value={loading ? "..." : stats.licenses} icon="qr_code_2" />
      </section>

      <Panel
        title={t("applicant.workspaceTitle")}
        description={
          activeApplication
            ? `${t("applicant.selectedApplication")}: ${getApplicationReference(activeApplication)}`
            : t("applicant.myApplicationsDesc")
        }
      >
        <Alert type={message.type || "success"} message={message.text} />

        <DashboardTabs tabs={dashboardTabs} activeTab={activeTab} onChange={setActiveTab} />

        {activeApplication ? (
          <div className="mt-4">
            {activeTab === "applications" && (
              <div className="space-y-4">
                <SelectedApplicationSummary
                  app={activeApplication}
                  t={t}
                  manageLabel={t("applicant.tabStatus")}
                  manageIcon="timeline"
                  onManage={() => setActiveTab("status")}
                  onOpen={() => openApplication(activeApplication)}
                />
                <ApplicationTable
                  applications={applications}
                  loading={loading}
                  t={t}
                  onSelect={(app) => {
                    setSelectedId(String(app.id));
                    setActiveTab("status");
                  }}
                  onOpen={openApplication}
                />
              </div>
            )}

            {activeTab === "status" && (
              <div className="space-y-4">
                <SelectedApplicationSummary
                  app={activeApplication}
                  t={t}
                  manageLabel={t("applicant.tabPayment")}
                  manageIcon="receipt_long"
                  onManage={() => setActiveTab("payment")}
                  onOpen={() => openApplication(activeApplication)}
                />
                <div className="rounded-md border border-slate-200 p-4">
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-950">
                        {t("applicant.currentProgress")}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {translatedStatus(t, activeApplication.status)}
                      </p>
                    </div>
                    <StatusPill value={translatedStatus(t, activeApplication.status)} />
                  </div>
                  <WorkflowStrip currentStatus={activeApplication.status} language={language} />
                </div>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                  <ApplicantStepCard
                    code="S1"
                    icon="description"
                    title={t("applicant.s1ActionTitle")}
                    status={normalizeStatus(activeApplication.status) === "draft" ? t("applicant.actionRequired") : t("applicant.completed")}
                    tone={normalizeStatus(activeApplication.status) === "draft" ? "amber" : "emerald"}
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
                </div>
              </div>
            )}

            {activeTab === "payment" && (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="rounded-md border border-slate-200 p-4">
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-950">
                        {t("applicant.paymentByFpxCard")}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {getPaymentHint(activeApplication, t)}
                      </p>
                    </div>
                    <StatusPill value={translatedStatus(t, activeApplication.status)} />
                  </div>
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div className="grid grid-cols-1 gap-3 rounded-md bg-slate-50 p-4 text-sm sm:grid-cols-2">
                      <Info label={t("common.invoice")} value={payment.invoice_no || getInvoiceNo(activeApplication)} />
                      <Info label={t("common.amount")} value={formatCurrency(paymentAmount)} />
                      <Info label={t("common.paymentStatus")} value={payment.status || t("applicant.waitingInvoice")} />
                      <Info label={t("common.receipt")} value={payment.receipt_file?.name || payment.receipt_reference || t("applicant.notSubmitted")} />
                    </div>

                    {canSubmitPayment(activeApplication) ? (
                      <div className="space-y-3">
                        {(payment.status === "Receipt Rejected" || payment.verification_result === "Invalid/Fake") && (
                          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                            {t("applicant.paymentHintReceiptRejected")}
                          </div>
                        )}
                        <Field label={t("common.uploadReceipt")}>
                          <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-sm text-slate-600 hover:border-emerald-500 hover:bg-emerald-50/40">
                            <span className="material-symbols-outlined mb-1 text-2xl text-emerald-700">
                              upload_file
                            </span>
                            <span className="font-semibold text-slate-800">
                              {paymentReceipt?.name || t("applicant.chooseReceiptFile")}
                            </span>
                            <span className="mt-1 text-xs text-slate-500">
                              {t("applicant.receiptUploadHint")}
                            </span>
                            <input
                              type="file"
                              accept="image/*,.pdf"
                              className="hidden"
                              onChange={(event) => {
                                handlePaymentReceiptChange(event.target.files?.[0]);
                                event.target.value = "";
                              }}
                            />
                          </label>
                        </Field>
                        {paymentReceipt?.dataUrl && (
                          <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs">
                            <span className="truncate font-medium text-slate-700">
                              {paymentReceipt.name}
                            </span>
                            <a
                              href={paymentReceipt.dataUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="shrink-0 font-semibold text-emerald-700 hover:underline"
                            >
                              {t("common.view")}
                            </a>
                          </div>
                        )}
                        <Button onClick={submitPayment} disabled={saving} icon="upload_file">
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
                {payment.invoice_no ? (
                  <InvoicePreview
                    application={activeApplication}
                    amount={paymentAmount}
                    invoiceDate={payment.generated_at || activeApplication.updated_at}
                    dueDate={payment.due_date || activeApplication.updated_at}
                  />
                ) : (
                  <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                    {t("applicant.waitingInvoice")}
                  </div>
                )}
              </div>
            )}

            {activeTab === "license" && (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="rounded-md border border-slate-200 p-4">
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-950">
                        {t("applicant.licenseDownloadTitle")}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {canViewLicense(activeApplication) ? t("applicant.licenseDownloadDesc") : t("applicant.qrLicensePending")}
                      </p>
                    </div>
                    <StatusPill value={translatedStatus(t, activeApplication.status)} />
                  </div>
                  <div className="grid grid-cols-1 gap-3 rounded-md bg-slate-50 p-4 text-sm sm:grid-cols-2">
                    <Info label={t("common.reference")} value={getApplicationReference(activeApplication)} />
                    <Info label={t("common.applicant")} value={getApplicantName(activeApplication)} />
                    <Info label={t("common.project")} value={getProjectName(activeApplication)} />
                    <Info label={t("common.status")} value={translatedStatus(t, activeApplication.status)} />
                  </div>
                </div>

                <div>
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
                </div>
              </div>
            )}

            {detailsLoading && (
              <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                {t("common.loadingSelectedApplication")}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
              {t("applicant.createApplicationHint")}
            </div>
            <ApplicationTable
              applications={applications}
              loading={loading}
              t={t}
              onSelect={(app) => setSelectedId(String(app.id))}
              onOpen={openApplication}
            />
          </div>
        )}
      </Panel>
    </UserDashboardLayout>
  );
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve({
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
        dataUrl: reader.result,
      });
    };

    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function DashboardTabs({ tabs, activeTab, onChange }) {
  return (
    <div className="flex gap-2 overflow-x-auto border-b border-slate-200 pb-2">
      {tabs.map((tab) => {
        const active = tab.id === activeTab;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold transition ${
              active
                ? "bg-emerald-700 text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function SelectedApplicationSummary({ app, t, manageLabel, manageIcon = "visibility", onManage, onOpen }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("applicant.selectedApplication")}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-slate-950">
              {getApplicationReference(app)}
            </h3>
            <StatusPill value={translatedStatus(t, app.status)} />
          </div>
          <p className="mt-1 truncate text-sm text-slate-600">
            {getProjectName(app)}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3 lg:min-w-[420px]">
          <Info label={t("common.type")} value={getApplicationType(app)} />
          <Info label={t("common.applicant")} value={getApplicantName(app)} />
          <Info label={t("common.updated")} value={formatDate(app.updated_at)} />
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="secondary" onClick={onManage} icon={manageIcon}>
            {manageLabel}
          </Button>
          <Button variant="secondary" onClick={onOpen} icon="open_in_new">
            {normalizeStatus(app.status) === "draft" ? t("common.continue") : t("common.view")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ApplicationTable({ applications, loading, t, onSelect, onOpen }) {
  return (
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
              onClick={() => onSelect(app)}
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
                onClick={() => onSelect(app)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {t("common.manage")}
              </button>
              <button
                type="button"
                onClick={() => onOpen(app)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {normalizeStatus(app.status) === "draft" ? t("common.continue") : t("common.view")}
              </button>
            </div>
          ),
        },
      ]}
    />
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
  const payment = app?.form_data?.payment || {};

  if (status === "draft") return t("applicant.paymentHintDraft");
  if (status === "rejected") return t("applicant.paymentHintRejected");
  if (payment.status === "Receipt Rejected" || payment.verification_result === "Invalid/Fake") {
    return t("applicant.paymentHintReceiptRejected");
  }
  if (status === "payment_submitted") return t("applicant.paymentHintSubmitted");
  if (status === "payment_verified") return t("applicant.paymentHintVerified");
  if (status === "license_issued") return t("applicant.paymentHintIssued");
  return t("applicant.paymentHintDefault");
}

export default UserDashboard;
