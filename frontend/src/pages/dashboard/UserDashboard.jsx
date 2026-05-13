import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";
import UserDashboardLayout from "../../layout/UserDashboardLayout";
import {
  apiRequest,
  uploadApplicationDocument,
} from "../../services/api";
import {
  Alert,
  Button,
  DataTable,
  Field,
  Info,
  PageHeader,
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

const VALID_SECTIONS = ["applications", "status", "license"];

function UserDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { language, t } = useLanguage();
  const [applications, setApplications] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [paymentReceipt, setPaymentReceipt] = useState(null);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [search, setSearch] = useState("");
  const licenseCardRef = useRef(null);

  const activeSection = VALID_SECTIONS.includes(searchParams.get("tab"))
    ? searchParams.get("tab")
    : "applications";

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
    }
  }, [t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchApplications();
  }, [fetchApplications]);

  useEffect(() => {
    if (selectedId && activeSection !== "applications") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchApplicationDetails(selectedId);
    }
  }, [activeSection, fetchApplicationDetails, selectedId]);

  const stats = useMemo(() => {
    const total = applications.length;
    const submitted = applications.filter(
      (app) => normalizeStatus(app.status) !== "draft"
    ).length;
    const licenses = applications.filter(
      (app) => normalizeStatus(app.status) === "license_issued"
    ).length;

    return { total, submitted, licenses };
  }, [applications]);

  const submittedApplications = useMemo(
    () => applications.filter((app) => normalizeStatus(app.status) !== "draft"),
    [applications]
  );

  const filteredApplications = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return applications;

    return applications.filter((app) =>
      [
        getApplicationReference(app),
        getProjectName(app),
        getApplicationType(app),
        formatWorkflowStatus(app.status),
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [applications, search]);

  const latest = applications[0];
  const activeApplication = selectedApplication || latest;
  const payment = activeApplication?.form_data?.payment || {};
  const license = activeApplication?.form_data?.license || {};
  const paymentAmount = payment.amount || 250;

  function showSection(tab) {
    setSearchParams({ tab });
  }

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

      const current = selectedApplication;
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
      if (!activeApplication?.id) {
        setMessage({ type: "error", text: t("applicant.detailsLoadFailed") });
        return;
      }

      const receipt = await uploadApplicationDocument(
        activeApplication.id,
        "Payment Receipt",
        file
      );
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
        title={t("applicant.dashboardTitle")}
        description={t("applicant.dashboardDescription")}
      />

      <section className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <StatCard label={t("applicant.tabApplications")} value={loading ? "..." : stats.total} icon="folder_open" tone="slate" />
        <StatCard label={t("applicant.tabStatus")} value={loading ? "..." : stats.submitted} icon="task_alt" />
        <StatCard label={t("common.eLicenses")} value={loading ? "..." : stats.licenses} icon="qr_code_2" />
      </section>

      <Alert type={message.type || "success"} message={message.text} />

      {activeSection === "applications" && (
        <ApplicationsSection
          applications={filteredApplications}
          loading={loading}
          search={search}
          t={t}
          onSearch={setSearch}
          onSelect={(app) => {
            setSelectedId(String(app.id));
            showSection("status");
          }}
          onOpen={openApplication}
        />
      )}

      {activeSection === "status" && (
        <StatusSection
          applications={submittedApplications}
          loading={loading}
          language={language}
          t={t}
          onOpen={openApplication}
          onLicense={(app) => {
            setSelectedId(String(app.id));
            showSection("license");
          }}
        />
      )}

      {activeSection === "license" && (
        activeApplication ? (
          <LicenseSection
            app={activeApplication}
            license={license}
            payment={payment}
            paymentAmount={paymentAmount}
            paymentReceipt={paymentReceipt}
            saving={saving}
            t={t}
            licenseCardRef={licenseCardRef}
            onOpen={() => openApplication(activeApplication)}
            onStatus={() => showSection("status")}
            onReceiptChange={handlePaymentReceiptChange}
            onSubmitPayment={submitPayment}
            onDownload={downloadELicense}
          />
        ) : (
          <EmptyLicenseSection t={t} />
        )
      )}
    </UserDashboardLayout>
  );
}

function ApplicationsSection({
  applications,
  loading,
  search,
  t,
  onSearch,
  onSelect,
  onOpen,
}) {
  return (
    <section className="space-y-4">
      <div className="rounded-md border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950">
              {t("applicant.tabApplications")}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {t("applicant.myApplicationsDesc")}
            </p>
          </div>
          <Link
            to="/applications/new"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-[#006d32] px-4 py-2 text-sm font-semibold !text-white hover:bg-[#005224]"
            style={{ color: "#fff" }}
          >
            <span className="material-symbols-outlined text-[20px] text-white">add</span>
            <span className="text-white">{t("common.newApplication")}</span>
          </Link>
        </div>
      </div>

      <div className="rounded-md border border-slate-200 bg-white p-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("common.search")}
          </span>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-slate-400">
              search
            </span>
            <input
              type="search"
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder={t("applicant.searchPlaceholder")}
              className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            />
          </div>
        </label>
      </div>

      <ApplicationTable
        applications={applications}
        loading={loading}
        t={t}
        onSelect={onSelect}
        onOpen={onOpen}
      />
    </section>
  );
}

function StatusSection({ applications, loading, language, t, onOpen, onLicense }) {
  if (loading) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-500">
        {t("common.loading")}
      </div>
    );
  }

  if (applications.length === 0) {
    return <EmptyDashboardSection message={t("applicant.noApplicationSubmitted")} />;
  }

  return (
    <section className="space-y-4">
      <div className="rounded-md border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-950">
          {t("applicant.tabStatus")}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {t("applicant.statusTrackingDescription")}
        </p>
      </div>

      {applications.map((app) => (
        <div key={app.id} className="rounded-md border border-slate-200 bg-white p-4">
          <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-slate-950">
                  {getApplicationReference(app)}
                </h3>
                <StatusPill value={translatedStatus(t, app.status)} />
              </div>
              <p className="mt-1 truncate text-sm text-slate-600">
                {getProjectName(app)}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button variant="secondary" icon="visibility" onClick={() => onOpen(app)}>
                {t("common.view")}
              </Button>
              <Button variant="secondary" icon="qr_code_2" onClick={() => onLicense(app)}>
                {t("applicant.tabLicense")}
              </Button>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
            <Info label={t("common.type")} value={getApplicationType(app)} />
            <Info label={t("common.updated")} value={formatDate(app.updated_at)} />
            <Info label={t("common.currentPhase")} value={translatedStatus(t, app.status)} />
          </div>

          <WorkflowStrip currentStatus={app.status} language={language} />
        </div>
      ))}
    </section>
  );
}

function LicenseSection({
  app,
  license,
  payment,
  paymentAmount,
  paymentReceipt,
  saving,
  t,
  licenseCardRef,
  onOpen,
  onStatus,
  onReceiptChange,
  onSubmitPayment,
  onDownload,
}) {
  return (
    <section className="space-y-4">
      <SelectedApplicationSummary
        app={app}
        t={t}
        manageLabel={t("applicant.tabStatus")}
        manageIcon="timeline"
        onManage={onStatus}
        onOpen={onOpen}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="rounded-md border border-slate-200 bg-white p-4">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-950">
                  {t("applicant.paymentProofTitle")}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {getPaymentHint(app, t)}
                </p>
              </div>
              <StatusPill value={translatedStatus(t, app.status)} />
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="grid grid-cols-1 gap-3 rounded-md bg-slate-50 p-4 text-sm sm:grid-cols-2">
                <Info label={t("common.invoice")} value={payment.invoice_no || getInvoiceNo(app)} />
                <Info label={t("common.amount")} value={formatCurrency(paymentAmount)} />
                <Info label={t("common.paymentStatus")} value={payment.status || t("applicant.waitingInvoice")} />
                <Info label={t("applicant.paymentProofTitle")} value={payment.receipt_file?.name || payment.receipt_reference || t("applicant.notSubmitted")} />
              </div>

              {canSubmitPayment(app) ? (
                <div className="space-y-3">
                  {(payment.status === "Receipt Rejected" || payment.verification_result === "Invalid/Fake") && (
                    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                      {t("applicant.paymentHintReceiptRejected")}
                    </div>
                  )}
                  <Field label={t("applicant.paymentProofTitle")}>
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
                          onReceiptChange(event.target.files?.[0]);
                          event.target.value = "";
                        }}
                      />
                    </label>
                  </Field>
                  {(paymentReceipt?.url || paymentReceipt?.file_url || paymentReceipt?.dataUrl) && (
                    <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs">
                      <span className="truncate font-medium text-slate-700">
                        {paymentReceipt.name}
                      </span>
                      <a
                        href={paymentReceipt.url || paymentReceipt.file_url || paymentReceipt.dataUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 font-semibold text-emerald-700 hover:underline"
                      >
                        {t("common.view")}
                      </a>
                    </div>
                  )}
                  <Button onClick={onSubmitPayment} disabled={saving} icon="upload_file">
                    {saving ? t("common.submitting") : t("applicant.submitPayment")}
                  </Button>
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                  {getPaymentHint(app, t)}
                </div>
              )}
            </div>
          </div>

          {payment.invoice_no && (
            <InvoicePreview
              application={app}
              amount={paymentAmount}
              invoiceDate={payment.generated_at || app.updated_at}
              dueDate={payment.due_date || app.updated_at}
            />
          )}
        </div>

        <div>
          <div className="mb-3 rounded-md border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-950">
              {t("applicant.licenseDownloadTitle")}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {canViewLicense(app) ? t("applicant.licenseDownloadDesc") : t("applicant.qrLicensePending")}
            </p>
          </div>
          {canViewLicense(app) ? (
            <div className="space-y-3">
              <div ref={licenseCardRef}>
                <LicenseQrCard application={app} license={license} />
              </div>
              <Button onClick={onDownload} icon="download" className="w-full">
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
    </section>
  );
}

function EmptyDashboardSection({ message }) {
  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
      {message}
    </div>
  );
}

function EmptyLicenseSection({ t }) {
  return (
    <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="rounded-md border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-950">
          {t("applicant.paymentProofTitle")}
        </h2>
        <p className="mt-2 rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
          {t("applicant.createApplicationHint")}
        </p>
      </div>
      <div className="rounded-md border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-950">
          {t("applicant.tabLicense")}
        </h2>
        <p className="mt-2 rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
          {t("applicant.qrLicensePending")}
        </p>
      </div>
    </section>
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

function translatedStatus(t, status) {
  return t(`status.${normalizeStatus(status)}`, formatWorkflowStatus(status));
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
