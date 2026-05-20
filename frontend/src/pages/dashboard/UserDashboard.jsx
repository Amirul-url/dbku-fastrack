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
  StatusPill,
} from "../../components/ui/SystemUI";
import LicenseQrCard from "../../components/license/LicenseQrCard";
import {
  canSubmitPayment,
  canViewLicense,
  formatDate,
  formatWorkflowStatus,
  getApplicantActionKey,
  getApplicantApplicationRoute,
  getApplicantDisplayStatus,
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
  const [filterMonth, setFilterMonth] = useState("all");
  const [filterYear, setFilterYear] = useState("all");
  const licenseCardRef = useRef(null);

  const activeSection = VALID_SECTIONS.includes(searchParams.get("tab"))
    ? searchParams.get("tab")
    : "overview";

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

  const submittedApplications = useMemo(
    () => applications.filter((app) => normalizeStatus(app.status) !== "draft"),
    [applications]
  );

  const filteredApplications = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return applications.filter((app) => {
      const appliedDate = getApplicationAppliedDate(app);
      const matchesKeyword = !keyword || [
        getApplicationReference(app),
        getProjectName(app),
        getApplicationType(app),
        translatedStatus(t, app.status),
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
      const matchesMonth =
        filterMonth === "all" ||
        (appliedDate && String(appliedDate.getMonth() + 1) === filterMonth);
      const matchesYear =
        filterYear === "all" ||
        (appliedDate && String(appliedDate.getFullYear()) === filterYear);

      return matchesKeyword && matchesMonth && matchesYear;
    });
  }, [applications, filterMonth, filterYear, search]);

  const applicationYearOptions = useMemo(() => {
    return Array.from(
      new Set(
        applications
          .map((app) => getApplicationAppliedDate(app)?.getFullYear())
          .filter(Boolean)
      )
    ).sort((a, b) => b - a);
  }, [applications]);

  const latest = applications[0];
  const activeApplication = selectedApplication || latest;
  const payment = activeApplication?.form_data?.payment || {};
  const license = activeApplication?.form_data?.license || {};
  const pageHeader = getDashboardHeader(activeSection, t);

  function showSection(tab) {
    setSearchParams({ tab });
  }

  function openApplication(app) {
    navigate(`/applications/${app.id}/${getApplicantApplicationRoute(app)}?id=${app.id}`);
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

  function handlePaymentReceiptRemove() {
    setPaymentReceipt(null);
    setSelectedApplication((current) => {
      if (!current) return current;

      const currentPayment = current.form_data?.payment || {};

      return {
        ...current,
        form_data: {
          ...(current.form_data || {}),
          payment: {
            ...currentPayment,
            receipt_file: null,
            receipt_reference: "",
          },
        },
      };
    });
    setMessage({ type: "", text: "" });
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
    <p class="eyebrow">ALiS Digital Advertisement License</p>
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
      {pageHeader && (
        <PageHeader
          title={pageHeader.title}
          description={pageHeader.description}
        />
      )}

      <Alert type={message.type || "success"} message={message.text} />

      {activeSection === "overview" && (
        <OverviewSection
          applications={applications}
          latest={latest}
          loading={loading}
          t={t}
        />
      )}

      {activeSection === "applications" && (
        <ApplicationsSection
          applications={filteredApplications}
          loading={loading}
          search={search}
          month={filterMonth}
          year={filterYear}
          years={applicationYearOptions}
          language={language}
          t={t}
          onSearch={setSearch}
          onMonthChange={setFilterMonth}
          onYearChange={setFilterYear}
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
          t={t}
          onOpen={openApplication}
        />
      )}

      {activeSection === "license" && (
        activeApplication ? (
          <LicenseSection
            app={activeApplication}
            license={license}
            payment={payment}
            paymentReceipt={paymentReceipt}
            saving={saving}
            t={t}
            licenseCardRef={licenseCardRef}
            onReceiptChange={handlePaymentReceiptChange}
            onReceiptRemove={handlePaymentReceiptRemove}
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

function OverviewSection({ applications, latest, loading, t }) {
  const statusSummary = useMemo(
    () => buildOverviewStatusSummary(applications, latest, t),
    [applications, latest, t]
  );

  return (
    <section className="space-y-4">
      <div className="rounded-md border border-emerald-200 bg-white p-5">
        <OverviewStatusCards items={statusSummary} loading={loading} />
      </div>
    </section>
  );
}

function OverviewStatusCards({ items, loading }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {items.map((item) => (
        <OverviewStatusCard
          key={item.key}
          label={item.label}
          value={loading ? "..." : item.value}
          icon={item.icon}
          tone={item.tone}
          compact={item.compact}
        />
      ))}
    </div>
  );
}

function OverviewStatusCard({ label, value, icon, tone, compact = false }) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    slate: "bg-slate-100 text-slate-700",
  };

  return (
    <div className="min-h-[104px] rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          <p
            className={`mt-2 font-semibold text-slate-950 ${
              compact ? "break-words text-base leading-5" : "text-2xl"
            }`}
          >
            {value}
          </p>
        </div>
        <span
          className={`material-symbols-outlined shrink-0 rounded-md p-2 text-[20px] ${
            tones[tone] || tones.slate
          }`}
        >
          {icon}
        </span>
      </div>
    </div>
  );
}

function ApplicationsSection({
  applications,
  loading,
  search,
  month,
  year,
  years,
  language,
  t,
  onSearch,
  onMonthChange,
  onYearChange,
  onSelect,
  onOpen,
}) {
  const hasActiveFilter = Boolean(search.trim()) || month !== "all" || year !== "all";

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
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("common.searchAndFilter")}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {t("applicant.searchFilterHint")}
            </p>
          </div>

          {hasActiveFilter && (
            <button
              type="button"
              onClick={() => {
                onSearch("");
                onMonthChange("all");
                onYearChange("all");
              }}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-900"
            >
              {t("common.clearFilters")}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_220px_180px]">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">
              {t("common.keyword")}
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
                className="h-11 w-full rounded-md border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">
              {t("common.month")}
            </span>
            <select
              value={month}
              onChange={(event) => onMonthChange(event.target.value)}
              className="h-11 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="all">{t("common.allMonths")}</option>
              {getMonthOptions(language).map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">
              {t("common.year")}
            </span>
            <select
              value={year}
              onChange={(event) => onYearChange(event.target.value)}
              className="h-11 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="all">{t("common.allYears")}</option>
              {years.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>
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

function StatusSection({ applications, loading, t, onOpen }) {
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
    <section>
      <ApplicationTable
        applications={applications}
        loading={loading}
        t={t}
        onSelect={onOpen}
        onOpen={onOpen}
      />
    </section>
  );
}

function LicenseSection({
  app,
  license,
  payment,
  paymentReceipt,
  saving,
  t,
  licenseCardRef,
  onReceiptChange,
  onReceiptRemove,
  onSubmitPayment,
  onDownload,
}) {
  const canSubmitPaymentProof = canSubmitPayment(app);

  return (
    <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="rounded-md border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-950">
          {t("common.uploadReceipt")}
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          {getPaymentHint(app, t)}
        </p>

        <div className="mt-4 space-y-3">
          {(payment.status === "Receipt Rejected" || payment.verification_result === "Invalid/Fake") && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {t("applicant.paymentHintReceiptRejected")}
            </div>
          )}

          <Field label={t("applicant.paymentProofTitle")}>
            <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-5">
              <label className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
                <span className="material-symbols-outlined text-[18px] text-white">
                  upload_file
                </span>
                <span>{t("common.uploadFile", "Upload File")}</span>
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
              <p className="mt-3 text-sm font-semibold text-slate-800">
                {paymentReceipt?.name || t("applicant.chooseReceiptFile")}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {t("applicant.receiptUploadHint")}
              </p>
            </div>
          </Field>

          {paymentReceipt && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs">
              <span className="truncate font-medium text-slate-700">
                {paymentReceipt.name}
              </span>
              <div className="flex shrink-0 items-center gap-2">
                {(paymentReceipt.url || paymentReceipt.file_url || paymentReceipt.dataUrl) && (
                  <a
                    href={paymentReceipt.url || paymentReceipt.file_url || paymentReceipt.dataUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-emerald-700 hover:underline"
                  >
                    {t("common.view")}
                  </a>
                )}
                <button
                  type="button"
                  onClick={onReceiptRemove}
                  className="rounded-md border border-red-200 px-2 py-1 font-semibold text-red-700 hover:bg-red-50"
                >
                  {t("common.remove", "Remove")}
                </button>
              </div>
            </div>
          )}

          {canSubmitPaymentProof ? (
            <>
              <Button onClick={onSubmitPayment} disabled={saving} icon="upload_file">
                {saving ? t("common.submitting") : t("applicant.submitPayment")}
              </Button>
            </>
          ) : (
            <div className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-500">
              {getPaymentHint(app, t)}
            </div>
          )}
        </div>
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
            <button
              type="button"
              onClick={() => onOpen(app)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {t(getApplicantActionKey(app))}
            </button>
          ),
        },
      ]}
    />
  );
}

function translatedStatus(t, status) {
  const displayStatus = getApplicantDisplayStatus(status);

  return t(`status.${displayStatus}`, formatWorkflowStatus(displayStatus));
}

function getApplicationAppliedDate(app) {
  const rawDate = app?.created_at || app?.submitted_at || app?.updated_at;
  if (!rawDate) return null;

  const date = new Date(rawDate);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getMonthOptions(language = "en") {
  const locale = language === "ms" ? "ms-MY" : "en-US";

  return Array.from({ length: 12 }, (_, index) => ({
    value: String(index + 1),
    label: new Intl.DateTimeFormat(locale, { month: "long" }).format(
      new Date(2026, index, 1)
    ),
  }));
}

function buildOverviewStatusSummary(applications, latest, t) {
  const submitted = applications.filter((app) => normalizeStatus(app.status) !== "draft").length;
  const pending = applications.filter((app) => isPendingApplication(app)).length;
  const rejected = applications.filter((app) => isRejectedApplication(app)).length;
  const approved = applications.filter((app) => isApprovedApplication(app)).length;

  return [
    {
      key: "submitted",
      label: t("common.submitted"),
      value: submitted,
      icon: "send",
      tone: "blue",
    },
    {
      key: "status",
      label: t("common.status"),
      value: latest ? translatedStatus(t, latest.status) : "-",
      icon: "monitoring",
      tone: "slate",
      compact: true,
    },
    {
      key: "pending",
      label: t("common.pending"),
      value: pending,
      icon: "pending_actions",
      tone: "amber",
    },
    {
      key: "rejected",
      label: t("status.rejected"),
      value: rejected,
      icon: "cancel",
      tone: "red",
    },
    {
      key: "approved",
      label: t("status.approved"),
      value: approved,
      icon: "check_circle",
      tone: "emerald",
    },
  ];
}

function isPendingApplication(app) {
  const status = normalizeStatus(app.status);

  return Boolean(status) && status !== "draft" && !isApprovedApplication(app) && !isRejectedApplication(app);
}

function isApprovedApplication(app) {
  return [
    "approved",
    "approved_with_conditions",
    "invoice_generated",
    "payment_submitted",
    "payment_verified",
    "license_issued",
  ].includes(normalizeStatus(app.status));
}

function isRejectedApplication(app) {
  return ["incomplete", "rejected"].includes(normalizeStatus(app.status));
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

function getDashboardHeader(activeSection, t) {
  if (activeSection === "applications") {
    return {
      title: t("applicant.applicationsSectionTitle"),
      description: t("applicant.applicationsSectionDescription"),
    };
  }

  if (activeSection === "status") {
    return {
      title: t("applicant.statusSectionTitle"),
      description: t("applicant.statusTrackingDescription"),
    };
  }

  if (activeSection === "license") {
    return {
      title: t("applicant.licenseSectionTitle"),
      description: t("applicant.licenseSectionDescription"),
    };
  }

  return {
    title: t("applicant.dashboardHeaderTitle"),
    description: t("applicant.dashboardHeaderDescription"),
  };
}

export default UserDashboard;
