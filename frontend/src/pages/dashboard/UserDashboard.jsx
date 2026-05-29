import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";
import UserDashboardLayout from "../../layout/UserDashboardLayout";
import {
  apiRequest,
  fetchApplicationList,
  fetchAuthenticatedBlob,
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
  formatCompactDateTime,
  formatCurrency,
  formatDate,
  formatWorkflowStatus,
  getApplicantActionKey,
  getApplicantApplicationRoute,
  getApplicantDisplayStatus,
  getApplicantName,
  getApplicationReference,
  getApplicationLocation,
  getApplicationType,
  getInvoiceNo,
  getLicenseId,
  getProjectName,
  normalizeStatus,
} from "../../utils/workflow";
import { openAdvertisementLicenseDocument } from "../../utils/advertisementLicenseDocument";

const VALID_SECTIONS = ["applications", "status", "license"];

function UserDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { language, t } = useLanguage();
  const queryTab = searchParams.get("tab");
  const querySelectedId = searchParams.get("id") || "";
  const activeSection = VALID_SECTIONS.includes(queryTab)
    ? queryTab
    : "overview";
  const [applications, setApplications] = useState([]);
  const [selectedId, setSelectedId] = useState(querySelectedId);
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [licensePanelOpen, setLicensePanelOpen] = useState(
    activeSection === "license" && Boolean(querySelectedId)
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [paymentReceipt, setPaymentReceipt] = useState(null);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [search, setSearch] = useState("");
  const [filterMonth, setFilterMonth] = useState("all");
  const [filterYear, setFilterYear] = useState("all");
  const licenseCardRef = useRef(null);

  const fetchApplications = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const list = await fetchApplicationList();
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
    const intervalId = window.setInterval(
      () => fetchApplications({ silent: true }),
      15000
    );
    const handleRefresh = () => fetchApplications({ silent: true });

    window.addEventListener("fastrack:applications-changed", handleRefresh);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("fastrack:applications-changed", handleRefresh);
    };
  }, [fetchApplications]);

  useEffect(() => {
    if (
      selectedId &&
      activeSection !== "applications" &&
      (activeSection !== "license" || licensePanelOpen)
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchApplicationDetails(selectedId);
    }
  }, [activeSection, fetchApplicationDetails, licensePanelOpen, selectedId]);

  useEffect(() => {
    if (activeSection !== "license") return;

    if (querySelectedId) {
      setSelectedId(querySelectedId);
      setLicensePanelOpen(true);
      return;
    }

    setLicensePanelOpen(false);
    setSelectedApplication(null);
    setPaymentReceipt(null);
    setMessage({ type: "", text: "" });
  }, [activeSection, querySelectedId]);

  const submittedApplications = useMemo(
    () => applications.filter((app) => normalizeStatus(app.status) !== "draft"),
    [applications]
  );
  const eLicenseApplications = useMemo(
    () => applications.filter(isELicenseApplication),
    [applications]
  );

  const filteredApplications = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return applications.filter((app) => {
      const appliedDate = getApplicationAppliedDate(app);
      const matchesKeyword = !keyword || [
        getApplicationReference(app),
        getProjectName(app),
        getApplicationType(app, language),
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
  }, [applications, filterMonth, filterYear, language, search, t]);

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
  const selectedListApplication = applications.find(
    (app) => String(app.id) === String(selectedId)
  );
  const activeApplication = selectedApplication || selectedListApplication || latest;
  const payment = activeApplication?.form_data?.payment || {};
  const license = activeApplication?.form_data?.license || {};
  const pageHeader = getDashboardHeader(activeSection, t);

  function showSection(tab) {
    setSearchParams({ tab });
    if (tab !== "license") {
      setLicensePanelOpen(false);
      setSelectedApplication(null);
      setPaymentReceipt(null);
      setMessage({ type: "", text: "" });
    }
  }

  function openApplication(app) {
    navigate(`/applications/${app.id}/${getApplicantApplicationRoute(app)}?id=${app.id}`);
  }

  function openLicenseRecord(app) {
    setSelectedId(String(app.id));
    setSelectedApplication(app);
    setLicensePanelOpen(true);
    setSearchParams({ tab: "license", id: String(app.id) });
    fetchApplicationDetails(app.id);
  }

  function returnToLicenseList() {
    setLicensePanelOpen(false);
    setSelectedApplication(null);
    setPaymentReceipt(null);
    setMessage({ type: "", text: "" });
    setSearchParams({ tab: "license" });
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
            payment: {
              ...currentPayment,
              invoice_no: currentPayment.invoice_no || getInvoiceNo(current),
              amount: currentPayment.amount || "",
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

  async function viewPaymentReceipt() {
    const source = getPaymentReceiptSource(paymentReceipt);
    if (!source) return;

    try {
      const isInlineFile = source.startsWith("blob:") || source.startsWith("data:");
      const url = isInlineFile
        ? source
        : URL.createObjectURL(await fetchAuthenticatedBlob(source));

      window.open(url, "_blank", "noopener,noreferrer");

      if (!isInlineFile) {
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    } catch (err) {
      console.error("Failed to open payment receipt:", err);
      setMessage({
        type: "error",
        text: t("applicant.receiptViewFailed", "Unable to open the receipt. Please try again."),
      });
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
          language={language}
          onOpen={openApplication}
        />
      )}

      {activeSection === "license" && (
        licensePanelOpen && activeApplication ? (
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
            onReceiptView={viewPaymentReceipt}
            onSubmitPayment={submitPayment}
            onDownload={downloadELicense}
            onBack={returnToLicenseList}
          />
        ) : (
          <LicenseListSection
            applications={eLicenseApplications}
            loading={loading}
            t={t}
            onOpen={openLicenseRecord}
          />
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
        language={language}
        onSelect={onSelect}
        onOpen={onOpen}
      />
    </section>
  );
}

function StatusSection({ applications, loading, t, language, onOpen }) {
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
        language={language}
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
  onReceiptView,
  onSubmitPayment,
  onDownload,
  onBack,
}) {
  const canSubmitPaymentProof = canSubmitPayment(app);
  const isPaymentLocked = !canSubmitPaymentProof;

  return (
    <section className="space-y-4">
      <div className="flex justify-start">
        <Button
          type="button"
          variant="secondary"
          icon="arrow_back"
          onClick={onBack}
        >
          {t("applicant.backToELicenseList", "Back to E-Licenses List")}
        </Button>
      </div>

      <div className="rounded-md border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-950">
            {t("applicant.licenseDownloadTitle")}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {canViewLicense(app) ? t("applicant.licenseDownloadDesc") : t("applicant.qrLicensePending")}
          </p>
        </div>

        <div className="space-y-4 p-4">
          <ApplicantPaymentDocuments app={app} t={t} />

          <section className="rounded-md border border-slate-200 bg-slate-50">
            <div className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="text-sm font-semibold text-slate-950">
                  {isPaymentLocked
                    ? t("applicant.paymentReceipt", "Payment Receipt")
                    : t("common.uploadReceipt")}
                </h4>
                <p className="mt-1 text-sm text-slate-500">
                  {getPaymentHint(app, t)}
                </p>
              </div>
              {!isPaymentLocked && (
                <p className="text-xs text-slate-500">
                  {t("applicant.receiptUploadHint")}
                </p>
              )}
            </div>

            {(payment.status === "Receipt Rejected" || payment.verification_result === "Invalid/Fake") && (
              <div className="mx-3 mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {t("applicant.paymentHintReceiptRejected")}
              </div>
            )}

            <div className="border-t border-slate-200 bg-white px-3 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white text-emerald-700 ring-1 ring-slate-200">
                      <span className="material-symbols-outlined text-[22px]">
                        {isPaymentLocked ? "attach_file" : "description"}
                      </span>
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {paymentReceipt?.name || t("applicant.chooseReceiptFile")}
                      </p>
                      {!isPaymentLocked && (
                        <p className="mt-0.5 text-xs text-slate-500">
                          PDF, JPG, or PNG
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {paymentReceipt && getPaymentReceiptSource(paymentReceipt) && (
                      <button
                        type="button"
                        onClick={onReceiptView}
                        className="inline-flex min-h-9 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          visibility
                        </span>
                        {t("common.view")}
                      </button>
                    )}
                    {!isPaymentLocked && (
                      <label className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800">
                        <span className="material-symbols-outlined text-[16px] text-white">
                          upload_file
                        </span>
                        <span>
                          {paymentReceipt
                            ? t("common.replace", "Replace")
                            : t("common.uploadFile", "Upload File")}
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
                    )}
                    {!isPaymentLocked && paymentReceipt && (
                      <button
                        type="button"
                        onClick={onReceiptRemove}
                        className="inline-flex min-h-9 items-center justify-center gap-1 rounded-md border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 hover:bg-red-50"
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          delete
                        </span>
                        {t("common.remove", "Remove")}
                      </button>
                    )}
                  </div>
                </div>
            </div>

            {canSubmitPaymentProof && (
              <div className="flex justify-end border-t border-slate-200 bg-white px-3 py-3">
                <button
                  type="button"
                  onClick={onSubmitPayment}
                  disabled={saving || !paymentReceipt}
                  className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  <span className="material-symbols-outlined text-[16px] text-white">
                    upload_file
                  </span>
                  {saving ? t("common.submitting") : t("applicant.submitPayment")}
                </button>
              </div>
            )}
          </section>

          {canViewLicense(app) ? (
            <section className="space-y-3">
              <div ref={licenseCardRef}>
                <LicenseQrCard application={app} license={license} />
              </div>
              <Button
                onClick={() => openAdvertisementLicenseDocument(app, t)}
                icon="visibility"
                variant="secondary"
                className="w-full"
              >
                {t("workspace.license.viewLicense", "View Advertisement License")}
              </Button>
              <Button onClick={onDownload} icon="download" className="w-full">
                {t("applicant.downloadQrELicense")}
              </Button>
            </section>
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

function ApplicantPaymentDocuments({ app, t }) {
  const approvalLetter = app?.form_data?.approval_letter || {};
  const manualReceipt = approvalLetter.manual_receipt || {};
  const officialReceiptFile = getSentOfficialReceiptFile(app);
  const showOfficialReceipt = Boolean(
    officialReceiptFile ||
    manualReceipt.sent_at ||
    manualReceipt.status === "Sent to Applicant" ||
    (normalizeStatus(app?.status) === "payment_verified" && manualReceipt.saved_at)
  );
  const documents = [
    {
      label: t("workspace.payment.approvalLetter", "Approval Letter"),
      file: approvalLetter.letter_file,
      manual: approvalLetter.manual_letter,
      type: "letter",
    },
    {
      label: t("workspace.payment.billDocument", "Bill"),
      file: approvalLetter.bill_file,
      manual: approvalLetter.manual_bill,
      type: "bill",
    },
    ...(showOfficialReceipt
      ? [
          {
            label: t("workspace.payment.manual.officialReceiptTitle", "Official Receipt"),
            file: officialReceiptFile,
            manual: manualReceipt,
            type: "receipt",
          },
        ]
      : []),
  ];
  const hasAnyDocument = documents.some((item) =>
    getPaymentDocumentSource(item.file) || item.manual?.saved_at
  );

  if (!hasAnyDocument) return null;

  return (
    <section className="rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-3 py-3">
        <h4 className="text-sm font-semibold text-slate-950">
          {t("workspace.payment.documents", "Approval Letter and Bill")}
        </h4>
        <p className="mt-1 text-sm text-slate-500">
          {t("applicant.paymentDocumentsDesc", "Download the documents from ALiS before making payment.")}
        </p>
      </div>

      <div className="divide-y divide-slate-200">
        {documents.map((item) => (
          <div
            key={item.label}
            className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-slate-500">
                {item.label}
              </p>
              {item.file?.name && (
                <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                  {item.file.name}
                </p>
              )}
            </div>
            {(getPaymentDocumentSource(item.file) || item.manual?.saved_at) && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    item.file
                      ? openApplicantPaymentDocument(item.file, t)
                      : openApplicantManualPaymentDocument(app, item.type, t)
                  }
                  className="inline-flex min-h-9 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    visibility
                  </span>
                  {t("common.view", "View")}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    item.file
                      ? downloadApplicantPaymentDocument(item.file, item.label, t)
                      : downloadApplicantManualPaymentDocument(app, item.type, t)
                  }
                  className="inline-flex min-h-9 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    download
                  </span>
                  {t("common.download", "Download")}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function LicenseListSection({ applications, loading, t, onOpen }) {
  return (
    <section className="space-y-4">
      <div className="rounded-md border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-950">
          {t("applicant.licenseSectionTitle")}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {t("applicant.licenseSectionDescription")}
        </p>
      </div>

      <DataTable
        loading={loading}
        loadingText={t("common.loading")}
        emptyText={t("applicant.noApplicationSubmitted")}
        rows={applications}
        columns={[
          {
            key: "reference",
            label: t("common.reference"),
            render: (app) => (
              <button
                type="button"
                onClick={() => onOpen(app)}
                className="font-semibold text-emerald-700 hover:underline"
              >
                {getApplicationReference(app)}
              </button>
            ),
          },
          { key: "project", label: t("common.project"), render: getProjectName },
          {
            key: "status",
            label: t("common.status"),
            render: (app) => <StatusPill value={translatedStatus(t, app.status)} />,
          },
          {
            key: "payment",
            label: t("common.paymentStatus", "Payment Status"),
            render: (app) => getPaymentStatusText(app, t),
          },
          {
            key: "license",
            label: t("common.eLicense", "E-License"),
            render: (app) => app.form_data?.license?.status || t("applicant.qrLicensePending"),
          },
          {
            key: "action",
            label: t("common.action"),
            render: (app) => (
              <Button
                type="button"
                variant="secondary"
                icon="open_in_new"
                className="min-h-8 px-3 py-1 text-xs"
                onClick={() => onOpen(app)}
              >
                {t("common.open", "Open")}
              </Button>
            ),
          },
        ]}
      />
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

function ApplicationTable({ applications, loading, t, language = "en", onSelect, onOpen }) {
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
        { key: "type", label: t("common.type"), render: (app) => getApplicationType(app, language) },
        {
          key: "status",
          label: t("common.status"),
          render: (app) => <StatusPill value={translatedStatus(t, app.status)} />,
        },
        {
          key: "updated",
          label: t("common.updated"),
          render: (app) => (
            <span className="whitespace-nowrap text-[12px] leading-5">
              {formatCompactDateTime(app.updated_at)}
            </span>
          ),
        },
        {
          key: "action",
          label: t("common.action"),
          render: (app) => (
            !shouldHideApplicantAction(app) && (
              <button
                type="button"
                onClick={() => onOpen(app)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {t(getApplicantActionKey(app))}
              </button>
            )
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

function isELicenseApplication(app) {
  return [
    "invoice_generated",
    "payment_submitted",
    "payment_verified",
    "license_issued",
    "license_revoked",
  ].includes(normalizeStatus(app.status));
}

function shouldHideApplicantAction(app) {
  return [
    "bill_pending_ku",
    "invoice_generated",
    "payment_submitted",
    "payment_verified",
    "license_issued",
    "license_revoked",
  ].includes(normalizeStatus(app?.status));
}

function getPaymentReceiptSource(receipt) {
  return receipt?.dataUrl || receipt?.url || receipt?.file_url || receipt?.file || "";
}

function getPaymentDocumentSource(file) {
  return file?.dataUrl || file?.url || file?.file_url || file?.file || "";
}

async function openApplicantPaymentDocument(file, t) {
  const source = getPaymentDocumentSource(file);
  if (!source) return;

  try {
    const isInlineFile = source.startsWith("blob:") || source.startsWith("data:");
    const url = isInlineFile
      ? source
      : URL.createObjectURL(await fetchAuthenticatedBlob(source));

    window.open(url, "_blank", "noopener,noreferrer");

    if (!isInlineFile) {
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  } catch (err) {
    console.error("Failed to open payment document:", err);
    window.alert(t("workspace.payment.documentViewFailed", "Unable to open the document. Please try again."));
  }
}

async function downloadApplicantPaymentDocument(file, fallbackLabel, t) {
  const source = getPaymentDocumentSource(file);
  if (!source) return;

  try {
    const isInlineFile = source.startsWith("blob:") || source.startsWith("data:");
    const url = isInlineFile
      ? source
      : URL.createObjectURL(await fetchAuthenticatedBlob(source));
    const filename = getDownloadFilename(file?.name || fallbackLabel, "document");

    triggerDownload(url, filename);

    if (!isInlineFile) {
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  } catch (err) {
    console.error("Failed to download payment document:", err);
    window.alert(t("workspace.payment.documentViewFailed", "Unable to open the document. Please try again."));
  }
}

function openApplicantManualPaymentDocument(app, type, t) {
  const isBill = type === "bill";
  const isReceipt = type === "receipt";
  const html = getApplicantManualPaymentDocumentHtml(app, type, t);
  const approvalLetter = app?.form_data?.approval_letter || {};
  const manualLetter = approvalLetter.manual_letter || {};
  const title = isReceipt
    ? t("workspace.payment.manual.officialReceiptTitle", "Official Receipt")
    : isBill
      ? t("workspace.payment.billDocument", "Bill")
      : manualLetter.subject || t("workspace.payment.approvalLetter", "Approval Letter");

  const preview = window.open("", "_blank");
  if (!preview) return;
  preview.opener = null;
  preview.document.open();
  preview.document.write(html);
  preview.document.close();
  preview.document.title = `${getApplicationReference(app)} ${title}`;
}

async function downloadApplicantManualPaymentDocument(app, type, t) {
  const isBill = type === "bill";
  const isReceipt = type === "receipt";
  const html = getApplicantManualPaymentDocumentHtml(app, type, t);
  const approvalLetter = app?.form_data?.approval_letter || {};
  const manualLetter = approvalLetter.manual_letter || {};
  const label = isReceipt
    ? t("workspace.payment.manual.officialReceiptTitle", "Official Receipt")
    : isBill
      ? t("workspace.payment.billDocument", "Bill")
      : t("workspace.payment.approvalLetter", "Approval Letter");
  const title = isReceipt || isBill ? label : manualLetter.subject || label;

  try {
    await printHtmlDocument(html, `${getApplicationReference(app)} ${title}`);
  } catch (err) {
    console.error("Failed to download manual payment document:", err);
    window.alert(t("workspace.payment.documentViewFailed", "Unable to open the document. Please try again."));
  }
}

function getApplicantManualPaymentDocumentHtml(app, type, t) {
  const approvalLetter = app?.form_data?.approval_letter || {};
  const manualLetter = approvalLetter.manual_letter || {};
  const manualBill = approvalLetter.manual_bill || {};
  const manualReceipt = approvalLetter.manual_receipt || {};

  if (type === "receipt") {
    return buildApplicantManualOfficialReceiptHtml(app, t, manualLetter, manualBill, manualReceipt);
  }

  return type === "bill"
    ? buildApplicantManualBillHtml(app, t, manualLetter, manualBill)
    : buildApplicantManualLetterHtml(app, t, manualLetter, manualBill);
}

function getSentOfficialReceiptFile(app) {
  const file = app?.form_data?.approval_letter?.official_receipt_file || null;
  if (!getPaymentDocumentSource(file)) return null;

  if (
    file.sent_at ||
    file.status === "Sent to Applicant" ||
    normalizeStatus(app?.status) === "payment_verified"
  ) {
    return file;
  }

  return null;
}

async function printHtmlDocument(html, title) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  const frameDocument = iframe.contentDocument;
  const frameWindow = iframe.contentWindow;
  if (!frameDocument || !frameWindow) {
    iframe.remove();
    throw new Error("Unable to prepare print document.");
  }

  frameDocument.open();
  frameDocument.write(html);
  frameDocument.close();
  frameDocument.title = title;

  await waitForDocumentImages(frameDocument);
  await new Promise((resolve) => setTimeout(resolve, 250));

  const cleanup = () => {
    setTimeout(() => iframe.remove(), 500);
  };
  frameWindow.addEventListener("afterprint", cleanup, { once: true });
  setTimeout(cleanup, 120000);

  frameWindow.focus();
  frameWindow.print();
}

function waitForDocumentImages(frameDocument) {
  const images = Array.from(frameDocument.images || []);
  if (images.length === 0) return Promise.resolve();

  return Promise.all(
    images.map((image) => {
      if (image.complete) return Promise.resolve();

      return new Promise((resolve) => {
        image.onload = resolve;
        image.onerror = resolve;
      });
    })
  );
}

function buildApplicantManualLetterHtml(app, t, manualLetter, manualBill) {
  const fields = getApplicantManualFields(app, manualLetter.fields);
  const paymentRows = getApplicantManualPaymentRows(app, manualBill);
  const total = paymentRows.reduce(
    (sum, row) => sum + (parseCurrencyAmount(row.amount) || 0),
    0
  );
  const termsHtml = getApplicantManualRichTextHtml(manualLetter.terms);
  const dbkuLogoUrl = getManualDocumentAssetUrl(fields.letterDbkuLogoPath || "/logo-dbku.png");
  const alisLogoUrl = getManualDocumentAssetUrl(fields.letterAlisLogoPath || "/ALiS.png");
  const title = manualLetter.subject || t("workspace.payment.approvalLetter", "Approval Letter");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(getApplicationReference(app))} ${escapeHtml(title)}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; color: #111827; background: #f8fafc; }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto 12px; background: #fff; padding: 16mm 18mm; box-shadow: 0 1px 4px rgba(15,23,42,.12); }
    .letterhead { display: grid; grid-template-columns: 86px 1fr 104px; gap: 14px; align-items: center; border-bottom: 2px solid #111827; padding-bottom: 8px; }
    .crest { height: 68px; display: flex; align-items: center; justify-content: center; }
    .crest img { max-width: 100%; max-height: 68px; object-fit: contain; }
    h1 { margin: 0; font-size: 16px; line-height: 1.05; text-align: left; text-transform: uppercase; }
    .letterhead-text { width: fit-content; max-width: 100%; margin: 0 auto; }
    .subhead { text-align: left; font-size: 10px; line-height: 1.2; }
    .subhead .subtitle { font-size: 10px; font-style: italic; font-weight: 700; color: #111827; }
    .subhead .address { margin: 2px 0 0; font-weight: 700; text-transform: uppercase; color: #111827; }
    .subhead .contact { margin: 2px 0 0; font-size: 10px; font-weight: 700; color: #111827; }
    .subhead .phone { font-style: italic; }
    .subhead .social { display: flex; justify-content: flex-start; gap: 16px; margin-top: 2px; font-size: 10px; font-weight: 700; }
    .topline { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 12px; font-size: 12px; }
    .right { text-align: right; }
    .recipient-address { margin: 14px 0 18px 72px; white-space: pre-line; font-size: 12px; line-height: 1.35; }
    .subject { margin: 12px 0; font-weight: 700; text-transform: uppercase; text-decoration: underline; }
    .details { margin: 8px 0 14px; font-size: 12px; }
    .details div { display: grid; grid-template-columns: 145px 12px 1fr; line-height: 1.45; }
    p { font-size: 12px; line-height: 1.45; margin: 8px 0; }
    .manual-copy { white-space: pre-wrap; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12px; }
    th, td { border: 1px solid #111827; padding: 6px 8px; vertical-align: top; }
    th { text-align: left; background: #f1f5f9; }
    td.amount, th.amount { text-align: right; white-space: nowrap; }
    .signature { margin-top: 28px; font-size: 12px; }
    .footer { margin-top: 42px; border-top: 2px solid #111827; padding-top: 6px; text-align: center; font-size: 10px; font-weight: 700; white-space: pre-wrap; }
    .appendix h2 { margin: 10px 0 24px; text-align: right; font-size: 14px; }
    .appendix h3 { text-align: center; font-size: 13px; text-transform: uppercase; }
    .terms { margin-top: 28px; font-size: 12px; line-height: 1.45; }
    .terms p { margin: 8px 0; }
    .terms ol, .terms ul { margin: 8px 0 8px 20px; padding-left: 18px; }
    .terms li { margin: 4px 0; }
    .print-actions { position: fixed; right: 18px; top: 18px; }
    .print-actions button { border: 1px solid #cbd5e1; background: white; border-radius: 6px; padding: 8px 12px; font-weight: 700; cursor: pointer; }
    @media print { body { background: white; } .page { box-shadow: none; margin: 0; } .print-actions { display: none; } }
  </style>
</head>
<body>
  <div class="print-actions"><button onclick="window.print()">${escapeHtml(t("common.print", "Print"))}</button></div>
  <section class="page">
    <header class="letterhead">
      <div class="crest"><img src="${escapeHtml(dbkuLogoUrl)}" alt="DBKU" /></div>
      <div class="letterhead-text">
        <h1>${escapeHtml(fields.letterheadTitle)}</h1>
        <div class="subhead">
          <div class="subtitle">${escapeHtml(fields.letterheadSubtitle)}</div>
          <div class="address">${escapeHtml(fields.letterheadAddress)}</div>
          <div class="address">${escapeHtml(fields.letterheadAddressLine2)}</div>
          <div class="contact phone">${escapeHtml(fields.letterheadPhoneLine)}</div>
          <div class="contact">${escapeHtml(fields.letterheadWebLine)}</div>
          <div class="social"><span>@ ${escapeHtml(fields.letterheadComplaintLine || "aduandbku@dbku.gov.my")}</span><span>f ${escapeHtml(fields.letterheadFacebookLine || "Dewan Bandaraya Kuching Utara")}</span></div>
        </div>
      </div>
      <div class="crest"><img src="${escapeHtml(alisLogoUrl)}" alt="ALiS" /></div>
    </header>

    <div class="topline">
      <div>
        <div>${escapeHtml(t("workspace.payment.manual.yourRef", "Your Ref."))} : ${escapeHtml(fields.yourRef || "")}</div>
        <div>${escapeHtml(t("workspace.payment.manual.ourRef", "Our Ref."))} : <strong>${escapeHtml(fields.ourRef)}</strong></div>
      </div>
      <div class="right">${escapeHtml(t("workspace.payment.manual.date", "Date"))} : <strong>${escapeHtml(formatDate(fields.letterDate))}</strong></div>
    </div>

    <div class="recipient-address">${escapeHtml(fields.recipientName)}<br />${escapeHtml(fields.recipientAddress)}</div>

    <p class="manual-copy">${escapeHtml(fields.salutation)}</p>
    <p class="subject">${escapeHtml(title)}</p>

    <div class="details">
      <div><span>${escapeHtml(t("workspace.payment.manual.adType", "Advertisement Type"))}</span><span>:</span><strong>${escapeHtml(fields.adType)}</strong></div>
      <div><span>${escapeHtml(t("workspace.payment.manual.adName", "Advertisement Name"))}</span><span>:</span><strong>${escapeHtml(fields.adName)}</strong></div>
      <div><span>${escapeHtml(t("workspace.payment.manual.applicantName", "Applicant Name"))}</span><span>:</span><strong>${escapeHtml(fields.applicantName)}</strong></div>
      <div><span>${escapeHtml(t("workspace.payment.manual.displayLocation", "Advertisement Display Location"))}</span><span>:</span><strong>${escapeHtml(fields.displayLocation)}</strong></div>
    </div>

    <p class="manual-copy">${escapeHtml(fields.approvalParagraph)}</p>

    <table>
      <thead>
        <tr>
          <th>${escapeHtml(t("workspace.payment.manual.paymentDetails", "Payment Details"))}</th>
          <th>${escapeHtml(t("workspace.payment.manual.licenseValidityPeriod", "License Validity Period"))}</th>
          <th class="amount">${escapeHtml(t("workspace.payment.manual.totalAmountRm", "Total (RM)"))}</th>
        </tr>
      </thead>
      <tbody>
        ${paymentRows.map((row) => `
          <tr>
            <td>${escapeHtml(row.label)}</td>
            <td>${escapeHtml(row.validity || "-")}</td>
            <td class="amount">${escapeHtml(formatCurrency(parseCurrencyAmount(row.amount)))}</td>
          </tr>
        `).join("")}
        <tr>
          <td colspan="2" class="amount"><strong>${escapeHtml(t("workspace.payment.manual.grandTotal", "Grand Total"))}</strong></td>
          <td class="amount"><strong>${escapeHtml(formatCurrency(total))}</strong></td>
        </tr>
      </tbody>
    </table>

    <p class="manual-copy">${escapeHtml(fields.attachmentParagraph)}</p>
    <p class="manual-copy">${escapeHtml(fields.contactParagraph)}</p>
    <p class="manual-copy">${escapeHtml(fields.closingText)}</p>

    <div class="signature">
      <p><strong>${escapeHtml(fields.mottoLine1)}<br />${escapeHtml(fields.mottoLine2)}</strong></p>
      <br /><br />
      <p><strong>${escapeHtml(fields.signatoryTitle)}</strong><br />${escapeHtml(fields.signatoryDepartment)}<br />${escapeHtml(fields.signatoryAuthority)}</p>
    </div>
    <div class="footer">${escapeHtml(fields.footerText)}</div>
  </section>
  <section class="page appendix">
    <h2>${escapeHtml(fields.appendixLabel)}</h2>
    <h3>${escapeHtml(fields.appendixTitle)}</h3>
    <div class="terms">${termsHtml}</div>
  </section>
</body>
</html>`;
}

function buildApplicantManualBillHtml(app, t, manualLetter, manualBill) {
  const fields = getApplicantManualFields(app, manualLetter.fields);
  const paymentRows = getApplicantManualPaymentRows(app, manualBill);
  const invoiceNo = manualBill.invoice_no || getInvoiceNo(app);
  const total = paymentRows.reduce(
    (sum, row) => sum + (parseCurrencyAmount(row.amount) || 0),
    0
  );
  const fallbackTotal =
    parseCurrencyAmount(manualBill.amount) ||
    parseCurrencyAmount(app?.form_data?.payment?.amount);
  const billTotal = total || fallbackTotal || 0;
  const totalDisplay = formatCurrency(billTotal);
  const billDate = fields.letterDate || manualBill.saved_at || new Date().toISOString();
  const billTitle = fields.billReceiptTitle || t("workspace.payment.billDocument", "Bill");
  const dbkuLogoUrl = getManualDocumentAssetUrl(fields.billDbkuLogoPath || "/logo-dbku.png");
  const alisLogoUrl = getManualDocumentAssetUrl(fields.billAlisLogoPath || "/ALiS.png");
  const noteLines = [
    fields.billRemarkLine1,
    fields.billRemarkLine2,
    fields.billRemarkLine3,
  ].filter((line) => String(line || "").trim());

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(getApplicationReference(app))} ${escapeHtml(t("workspace.payment.billDocument", "Bill"))}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; color: #111827; background: #f8fafc; }
    .bill { width: 210mm; min-height: 297mm; margin: 0 auto 12px; background: #fff; padding: 16mm 18mm; box-shadow: 0 1px 4px rgba(15,23,42,.12); }
    .letterhead { display: grid; grid-template-columns: 74px 1fr 90px; gap: 14px; align-items: center; border-bottom: 2px solid #111827; padding-bottom: 8px; }
    .crest { height: 62px; display: flex; align-items: center; justify-content: center; }
    .crest img { max-width: 100%; max-height: 62px; object-fit: contain; }
    .heading { width: fit-content; max-width: 100%; margin: 0 auto; text-align: left; }
    .heading h1 { margin: 0; font-size: 20px; line-height: 1.05; text-transform: uppercase; }
    .heading p { margin: 1px 0 0; font-size: 12px; line-height: 1.2; }
    .heading .subtitle { font-style: italic; }
    .heading .strong { font-weight: 700; text-transform: uppercase; }
    .heading .contact { font-weight: 700; font-style: italic; }
    .heading .social { display: flex; gap: 14px; align-items: center; font-weight: 700; }
    .heading .social span { white-space: nowrap; }
    .copy { margin-top: 10px; text-align: right; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #475569; }
    .title-row { display: grid; grid-template-columns: 1fr auto; gap: 18px; align-items: end; margin: 18px 0 16px; }
    .title { margin: 0; font-size: 24px; line-height: 1.1; text-transform: uppercase; letter-spacing: .08em; }
    .number { border: 1px solid #111827; padding: 8px 12px; min-width: 190px; font-size: 12px; }
    .number strong { display: block; margin-top: 3px; color: #b91c1c; font-size: 18px; letter-spacing: .04em; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 20px; margin-bottom: 16px; font-size: 12px; }
    .meta div { display: grid; grid-template-columns: 120px 10px 1fr; }
    .party { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 14px 0 18px; }
    .box { border: 1px solid #111827; padding: 10px 12px; min-height: 96px; font-size: 12px; line-height: 1.45; }
    .box-title { margin: 0 0 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #475569; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
    th, td { border: 1px solid #111827; padding: 7px 8px; vertical-align: top; }
    th { background: #f1f5f9; text-align: left; text-transform: uppercase; font-size: 11px; }
    .center { text-align: center; }
    .amount { text-align: right; white-space: nowrap; }
    tfoot td { font-weight: 700; background: #f8fafc; }
    .instructions { margin-top: 18px; }
    .note { width: 100%; border: 1px solid #cbd5e1; padding: 10px 12px; min-height: 92px; font-size: 12px; line-height: 1.45; }
    .note p { margin: 0 0 6px; }
    .footer { margin-top: 24px; border-top: 1px solid #111827; padding-top: 7px; font-size: 10px; color: #475569; text-align: center; }
    .print-actions { position: fixed; right: 18px; top: 18px; }
    .print-actions button { border: 1px solid #cbd5e1; background: white; border-radius: 6px; padding: 8px 12px; font: 700 13px Arial, sans-serif; cursor: pointer; }
    @media print { body { background: white; } .bill { box-shadow: none; margin: 0; } .print-actions { display: none; } }
  </style>
</head>
<body>
  <div class="print-actions"><button onclick="window.print()">${escapeHtml(t("common.print", "Print"))}</button></div>
  <section class="bill">
    <header class="letterhead">
      <div class="crest"><img src="${escapeHtml(dbkuLogoUrl)}" alt="DBKU" /></div>
      <div class="heading">
        <h1>${escapeHtml(fields.letterheadTitle || "Dewan Bandaraya Kuching Utara")}</h1>
        <p class="subtitle">${escapeHtml(fields.letterheadSubtitle || "Commission of the City of Kuching North")}</p>
        <p class="strong">${escapeHtml(fields.letterheadAddress || "Bukit Siol, Jalan Semariang, Petra Jaya,")}<br />${escapeHtml(fields.letterheadAddressLine2 || "93050 Kuching, Sarawak.")}</p>
        <p class="contact">${escapeHtml(fields.letterheadPhoneLine || "Tel : 082-512200/512201    Hotline : 082-446644    Faks : 082-446414")}</p>
        <p><strong>${escapeHtml(fields.letterheadWebLine || "Laman Web: dbku.sarawak.gov.my    E-mel : prd@dbku.gov.my")}</strong></p>
        <p class="social"><span>@ ${escapeHtml(fields.letterheadComplaintLine || "aduandbku@dbku.gov.my")}</span><span>f ${escapeHtml(fields.letterheadFacebookLine || "Dewan Bandaraya Kuching Utara")}</span></p>
      </div>
      <div class="crest"><img src="${escapeHtml(alisLogoUrl)}" alt="ALiS" /></div>
    </header>
    <div class="copy">${escapeHtml(fields.billCopyLabel)}</div>

    <div class="title-row">
      <h2 class="title">${escapeHtml(billTitle)}</h2>
      <div class="number">${escapeHtml(t("workspace.payment.manual.billReceiptNo", "Bill No."))}<strong>${escapeHtml(invoiceNo)}</strong></div>
    </div>

    <div class="meta">
      <div><span>${escapeHtml(t("workspace.payment.manual.billDate", "Bill Date"))}</span><span>:</span><strong>${escapeHtml(formatDate(billDate))}</strong></div>
      <div><span>${escapeHtml(t("workspace.payment.manual.ourRef", "Our Ref."))}</span><span>:</span><strong>${escapeHtml(fields.ourRef)}</strong></div>
      <div><span>${escapeHtml(t("workspace.payment.manual.station", "Station"))}</span><span>:</span><strong>${escapeHtml(fields.billStation)}</strong></div>
      <div><span>${escapeHtml(t("workspace.payment.manual.applicationReference", "Application Ref."))}</span><span>:</span><strong>${escapeHtml(getApplicationReference(app))}</strong></div>
    </div>

    <div class="party">
      <div class="box">
        <p class="box-title">${escapeHtml(t("workspace.payment.manual.billToLine", "Bill To"))}</p>
        <strong>${escapeHtml(fields.billReceivedFrom)}</strong><br />
        ${escapeHtml(fields.recipientAddress || fields.displayLocation).replace(/\n/g, "<br />")}
      </div>
      <div class="box">
        <p class="box-title">${escapeHtml(t("workspace.payment.manual.billFor", "Bill For"))}</p>
        <strong>${escapeHtml(fields.adName)}</strong><br />
        ${escapeHtml(fields.adType)}<br />
        ${escapeHtml(fields.displayLocation)}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th class="center" style="width:44px;">${escapeHtml(t("workspace.payment.manual.no", "No."))}</th>
          <th>${escapeHtml(t("workspace.payment.manual.paymentDetails", "Payment Details"))}</th>
          <th>${escapeHtml(t("workspace.payment.manual.periodNotes", "Period / Notes"))}</th>
          <th class="amount" style="width:130px;">${escapeHtml(t("workspace.payment.manual.amountRm", "Amount (RM)"))}</th>
        </tr>
      </thead>
      <tbody>
        ${paymentRows.map((row, index) => `
          <tr>
            <td class="center">${index + 1}</td>
            <td>${escapeHtml(row.label)}</td>
            <td>${escapeHtml(row.validity || "-")}</td>
            <td class="amount">${escapeHtml(formatCurrency(row.amount))}</td>
          </tr>
        `).join("")}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="3" class="amount">${escapeHtml(t("workspace.payment.manual.grandTotal", "Grand Total"))}</td>
          <td class="amount">${escapeHtml(totalDisplay)}</td>
        </tr>
      </tfoot>
    </table>

    <div class="instructions">
      <div class="note">
        <p><strong>${escapeHtml(t("workspace.payment.manual.paymentInstructions", "Payment Instructions"))}</strong></p>
        <p>${escapeHtml(fields.billPaymentLine1)}</p>
        <p>${escapeHtml(fields.billPaymentLine2)}</p>
        ${fields.billBankNote ? `<p>${escapeHtml(fields.billBankNote).replace(/\n/g, "<br />")}</p>` : ""}
        ${noteLines.length ? `<p>${noteLines.map((line) => escapeHtml(line)).join("<br />")}</p>` : ""}
      </div>
    </div>

    <div class="footer">${escapeHtml(fields.billFooterNote || t("workspace.payment.manual.billFooterNote", "This bill is computer generated for payment processing and is not an official receipt."))}</div>
  </section>
</body>
</html>`;
}

function buildApplicantManualOfficialReceiptHtml(app, t, manualLetter, manualBill, manualReceipt = {}) {
  const fields = getApplicantManualFields(app, manualReceipt.fields || manualLetter.fields, {
    preserveReceiptFields: true,
  });
  const paymentRows = getApplicantManualPaymentRows(
    app,
    manualReceipt.rows?.length ? manualReceipt : manualBill
  );
  const invoiceNo =
    manualReceipt.receipt_no ||
    manualReceipt.invoice_no ||
    manualBill.invoice_no ||
    getInvoiceNo(app);
  const total = paymentRows.reduce(
    (sum, row) => sum + (parseCurrencyAmount(row.amount) || 0),
    0
  );
  const fallbackTotal =
    parseCurrencyAmount(manualReceipt.amount) ||
    parseCurrencyAmount(manualBill.amount) ||
    parseCurrencyAmount(app?.form_data?.payment?.amount);
  const totalDisplay = formatCurrency(total || fallbackTotal);
  const billDate =
    fields.letterDate ||
    manualReceipt.sent_at ||
    manualReceipt.saved_at ||
    manualBill.saved_at ||
    new Date().toISOString();
  const dbkuLogoUrl = getPublicAssetUrl("/logo-dbku.png");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(getApplicationReference(app))} ${escapeHtml(t("workspace.payment.manual.officialReceiptTitle", "Official Receipt"))}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Times New Roman", serif; color: #111827; background: #f8fafc; }
    .receipt { width: 210mm; min-height: 148mm; margin: 0 auto 12px; background: #fff; padding: 14mm 16mm; box-shadow: 0 1px 4px rgba(15,23,42,.12); }
    .header { display: grid; grid-template-columns: 86px 1fr 130px; gap: 14px; align-items: start; }
    .crest { height: 72px; display: flex; align-items: center; justify-content: center; }
    .crest img { max-width: 100%; max-height: 72px; object-fit: contain; }
    .heading { text-align: center; }
    .heading h1 { margin: 0; font-size: 15px; line-height: 1.12; text-transform: uppercase; }
    .heading p { margin: 3px 0 0; font-size: 12px; line-height: 1.25; }
    .copy { text-align: right; font: 700 12px Arial, sans-serif; }
    .title-row { display: grid; grid-template-columns: 1fr 160px; align-items: end; margin: 14px 0 18px; }
    .title { text-align: center; font: 700 26px "Times New Roman", serif; text-transform: uppercase; letter-spacing: .04em; }
    .number { font-size: 18px; font-weight: 700; white-space: nowrap; }
    .number strong { color: #b91c1c; font-size: 24px; letter-spacing: .05em; }
    .meta-grid { display: grid; grid-template-columns: 1fr 280px; gap: 28px; align-items: start; }
    .line-row { display: grid; grid-template-columns: 86px 1fr; gap: 8px; align-items: end; margin: 12px 0; font-size: 13px; }
    .line { display: block; border-bottom: 1px dotted #111827; min-height: 22px; line-height: 20px; padding: 0 6px 2px; font-weight: 700; }
    .line-value { display: inline-block; background: #fff; padding-right: 6px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #111827; padding: 5px 7px; }
    th { text-align: center; font-weight: 700; }
    td.amount { text-align: right; white-space: nowrap; }
    .received { margin-top: 22px; font-size: 13px; line-height: 1.4; }
    .received-line { display: grid; grid-template-columns: 132px 1fr; column-gap: 8px; align-items: end; min-height: 24px; }
    .received-label { white-space: nowrap; }
    .received .fill { display: block; min-width: 0; border-bottom: 1px dotted #111827; line-height: 20px; padding: 0 6px 2px; font-weight: 700; }
    .fill-value { display: inline-block; background: #fff; padding-right: 6px; }
    .footer { display: grid; grid-template-columns: 150px 1fr 190px; gap: 24px; align-items: end; margin-top: 46px; font-size: 12px; }
    .payment-box { border-top: 1px dotted #111827; padding-top: 4px; text-transform: uppercase; font-weight: 700; }
    .bank-note { text-align: center; font-size: 10px; }
    .signature { border-top: 1px dotted #111827; padding-top: 4px; text-align: center; }
    .print-actions { position: fixed; right: 18px; top: 18px; }
    .print-actions button { border: 1px solid #cbd5e1; background: white; border-radius: 6px; padding: 8px 12px; font: 700 13px Arial, sans-serif; cursor: pointer; }
    @media print { body { background: white; } .receipt { box-shadow: none; margin: 0; } .print-actions { display: none; } }
  </style>
</head>
<body>
  <div class="print-actions"><button onclick="window.print()">${escapeHtml(t("common.print", "Print"))}</button></div>
  <section class="receipt">
    <header class="header">
      <div class="crest"><img src="${escapeHtml(dbkuLogoUrl)}" alt="DBKU" /></div>
      <div class="heading">
        <h1>${escapeHtml(t("workspace.payment.manual.billHeaderTitle", "Mayor of North Kuching"))}</h1>
        <p><strong>${escapeHtml(t("workspace.payment.manual.billHeaderSubtitle", "(The Commissioner of The City of Kuching North)"))}</strong></p>
        <p>${escapeHtml(t("workspace.payment.manual.billHeaderAddressLine1", "Dewan Bandaraya Kuching Utara"))}<br />${escapeHtml(t("workspace.payment.manual.billHeaderAddressLine2", "Bukit Siol, Jalan Semariang, Petra Jaya,"))}<br />${escapeHtml(t("workspace.payment.manual.billHeaderAddressLine3", "93050 Kuching, Sarawak, Malaysia."))}</p>
      </div>
      <div class="copy">${escapeHtml(fields.billCopyLabel)}</div>
    </header>

    <div class="title-row">
      <div class="title">${escapeHtml(fields.billReceiptTitle)}</div>
      <div class="number">${escapeHtml(t("workspace.payment.manual.receiptNoShort", "No."))} <strong>${escapeHtml(invoiceNo)}</strong></div>
    </div>

    <div class="meta-grid">
      <div>
        <div class="line-row"><span>${escapeHtml(t("workspace.payment.manual.station", "Station"))}</span><span class="line"><span class="line-value">${escapeHtml(fields.billStation)}</span></span></div>
        <div class="line-row"><span>${escapeHtml(t("workspace.payment.manual.date", "Date"))}</span><span class="line"><span class="line-value">${escapeHtml(formatDate(billDate))}</span></span></div>
      </div>
      <table>
        <thead>
          <tr>
            <th>${escapeHtml(t("workspace.payment.manual.forCredit", "For Credit"))}</th>
            <th>${escapeHtml(t("workspace.payment.manual.amount", "Amount"))}<br />RM</th>
            <th>${escapeHtml(t("workspace.payment.manual.sen", "Sen"))}</th>
          </tr>
        </thead>
        <tbody>
          ${paymentRows.map((row) => {
            const amount = parseCurrencyAmount(row.amount) || 0;
            const ringgit = Math.floor(amount);
            const sen = Math.round((amount - ringgit) * 100);
            return `
              <tr>
                <td>${escapeHtml(row.label)}</td>
                <td class="amount">${escapeHtml(String(ringgit))}</td>
                <td class="amount">${escapeHtml(String(sen).padStart(2, "0"))}</td>
              </tr>
            `;
          }).join("")}
          <tr>
            <td class="amount"><strong>${escapeHtml(t("workspace.payment.manual.totalRm", "Total RM"))}</strong></td>
            <td class="amount" colspan="2"><strong>${escapeHtml(totalDisplay)}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="received">
      <div class="received-line"><span class="received-label">${escapeHtml(t("workspace.payment.manual.receivedFromLine", "RECEIVED from"))}</span><span class="fill"><span class="fill-value">${escapeHtml(fields.billReceivedFrom)}</span></span></div>
      <div class="received-line"><span class="received-label">${escapeHtml(t("workspace.payment.manual.sumRinggitLine", "the sum of Ringgit"))}</span><span class="fill"><span class="fill-value">${escapeHtml(fields.billAmountText || totalDisplay)}</span></span></div>
      <div class="received-line"><span class="received-label">${escapeHtml(t("workspace.payment.manual.andSenLine", "and Sen"))}</span><span class="fill"><span class="fill-value">${escapeHtml(fields.billSenText)}</span></span></div>
      <div class="received-line"><span class="received-label"></span><span class="fill"><span class="fill-value">${escapeHtml(fields.billRemarkLine1)}</span></span></div>
      <div class="received-line"><span class="received-label"></span><span class="fill"><span class="fill-value">${escapeHtml(fields.billRemarkLine2)}</span></span></div>
      <div class="received-line"><span class="received-label"></span><span class="fill"><span class="fill-value">${escapeHtml(fields.billRemarkLine3)}</span></span></div>
    </div>

    <footer class="footer">
      <div class="payment-box">${escapeHtml(fields.billPaymentLine1)}<br />${escapeHtml(fields.billPaymentLine2)}</div>
      <div class="bank-note">${escapeHtml(fields.billBankNote).replace(/\n/g, "<br />")}</div>
      <div class="signature">${escapeHtml(fields.billSignatureText)}</div>
    </footer>
  </section>
</body>
</html>`;
}

function getApplicantManualFields(app, savedFields = {}, options = {}) {
  const applicant = getApplicantName(app);
  const projectName = getProjectName(app);
  const applicationType = getApplicationType(app);
  const location = getApplicationLocation(app);
  const reference = getApplicationReference(app);
  const payment = app?.form_data?.payment || {};
  const approvalLetter = app?.form_data?.approval_letter || {};
  const letterDate =
    savedFields.letterDate ||
    approvalLetter.manual_letter?.saved_at ||
    payment.generated_at ||
    new Date().toISOString();

  const fields = {
    yourRef: "",
    ourRef: `DBKU/LES/IKL/${reference}`,
    letterDate,
    recipientName: applicant,
    recipientAddress: location,
    salutation: "Puan/Tuan,",
    adType: applicationType,
    adName: projectName,
    applicantName: applicant,
    displayLocation: location,
    approvalParagraph:
      "Sukacita dimaklumkan bahawa permohonan puan/tuan untuk perkara di atas telah diluluskan. Sila buat pembayaran seperti di bawah di Kaunter Bahagian Pelesenan, Aras 1, DBKU dalam tempoh empat belas (14) hari bekerja dari tarikh surat ini diterima.",
    attachmentParagraph:
      "3. Dilampirkan bersama ini syarat-syarat lesen yang mesti dipatuhi. Sebarang pelanggaran syarat lesen boleh menyebabkan lesen puan/tuan ditarik balik.",
    contactParagraph:
      "4. Sekiranya pihak puan/tuan memerlukan keterangan lanjut, sila hubungi Cik Dayang Amirah Farzana/Puan Phyrra Lily di talian 082-512955",
    closingText: "Sekian, terima kasih.",
    mottoLine1: "\"AN HONOUR TO SERVE\"",
    mottoLine2: "\"TOGETHER WE CARE\"",
    signatoryTitle: "(KETUA BAHAGIAN)",
    signatoryDepartment: "Bahagian Pelesenan",
    signatoryAuthority: "b.p. Pengarah, Dewan Bandaraya Kuching Utara",
    footerText:
      "\"UNTUK MEMPERTINGKAT KUALITI KEHIDUPAN DENGAN MEWUJUDKAN PERSEKITARAN KONDUSIF,\nPENGLIBATAN WARGA KOTA DAN PENYAMPAIAN PERKHIDMATAN TERUNGGUL\"",
    appendixLabel: "Lampiran",
    appendixTitle:
      "Syarat-Syarat Lesen Iklan Dalam Kawasan Dewan Bandaraya Kuching Utara (DBKU)",
    letterheadTitle: "Dewan Bandaraya Kuching Utara",
    letterheadSubtitle: "Commission of the City of Kuching North",
    letterheadAddress: "Bukit Siol, Jalan Semariang, Petra Jaya,",
    letterheadAddressLine2: "93050 Kuching, Sarawak.",
    letterheadPhoneLine:
      "Tel : 082-512200/512201    Hotline : 082-446644    Faks : 082-446414",
    letterheadWebLine:
      "Laman Web: dbku.sarawak.gov.my    E-mel : prd@dbku.gov.my",
    letterheadComplaintLine: "aduandbku@dbku.gov.my",
    letterheadFacebookLine: "Dewan Bandaraya Kuching Utara",
    letterDbkuLogoPath: "/logo-dbku.png",
    letterAlisLogoPath: "/ALiS.png",
    billDbkuLogoPath: "/logo-dbku.png",
    billAlisLogoPath: "/ALiS.png",
    billFooterNote:
      "This bill is computer generated for payment processing and is not an official receipt.",
    billReceivedFrom: applicant,
    billStation: "ALiS",
    billCopyLabel: "Salinan Pelanggan",
    billReceiptTitle: "Bil Bayaran",
    billSignatureText: "b.p. Datuk Bandar",
    billAmountText: "",
    billSenText: "",
    billRemarkLine1: "",
    billRemarkLine2: "",
    billRemarkLine3: "",
    billPaymentLine1: "Sila jelaskan bayaran di Kaunter Bahagian Pelesenan, Aras 1, DBKU.",
    billPaymentLine2: "Bayaran hendaklah dibuat dalam tempoh empat belas (14) hari bekerja.",
    billBankNote: "",
    ...savedFields,
  };

  if (options.preserveReceiptFields) {
    if (!savedFields?.billReceiptTitle || fields.billReceiptTitle === "Bil Bayaran") {
      fields.billReceiptTitle = "Official Receipt";
    }
    if (
      !savedFields?.billPaymentLine1 ||
      fields.billPaymentLine1 ===
        "Sila jelaskan bayaran di Kaunter Bahagian Pelesenan, Aras 1, DBKU."
    ) {
      fields.billPaymentLine1 = "Cash";
    }
    if (
      !savedFields?.billPaymentLine2 ||
      fields.billPaymentLine2 ===
        "Bayaran hendaklah dibuat dalam tempoh empat belas (14) hari bekerja."
    ) {
      fields.billPaymentLine2 = "Cheque No.";
    }
    if (!savedFields?.billBankNote && !fields.billBankNote) {
      fields.billBankNote =
        "Pembayaran ini hanya dianggap sah setelah cek dijelaskan oleh bank\nPayment valid only upon clearance of cheque";
    }

    return fields;
  }

  if (
    ["official receipt", "resit rasmi"].includes(
      String(fields.billReceiptTitle || "").trim().toLowerCase()
    )
  ) {
    fields.billReceiptTitle = "Bil Bayaran";
  }

  if (String(fields.billPaymentLine1 || "").trim().toLowerCase() === "cash") {
    fields.billPaymentLine1 =
      "Sila jelaskan bayaran di Kaunter Bahagian Pelesenan, Aras 1, DBKU.";
  }

  if (String(fields.billPaymentLine2 || "").trim().toLowerCase() === "cheque no.") {
    fields.billPaymentLine2 =
      "Bayaran hendaklah dibuat dalam tempoh empat belas (14) hari bekerja.";
  }

  if (
    String(fields.billBankNote || "").replace(/\r\n/g, "\n").trim() ===
    "Pembayaran ini hanya dianggap sah setelah cek dijelaskan oleh bank\nPayment valid only upon clearance of cheque"
  ) {
    fields.billBankNote = "";
  }

  return fields;
}

function getApplicantManualPaymentRows(app, manualBill = {}) {
  if (Array.isArray(manualBill.rows) && manualBill.rows.length > 0) {
    return manualBill.rows;
  }

  const amount =
    parseCurrencyAmount(manualBill.amount) ||
    parseCurrencyAmount(app?.form_data?.payment?.amount);

  return [
    {
      label: `Lesen Iklan - ${getApplicationType(app)}`,
      amount: Number.isFinite(amount) ? amount : 0,
      validity: "Tertakluk kepada tempoh kelulusan",
    },
  ];
}

function getApplicantManualRichTextHtml(value) {
  const source = String(value || "").trim();
  if (!source) return getDefaultApplicantTermsHtml();

  if (/<\/?[a-z][\s\S]*>/i.test(source)) {
    return source;
  }

  return source
    .split(/\n{2,}/)
    .map((block) =>
      `<p>${escapeHtml(block.trim()).replace(/\n/g, "<br />")}</p>`
    )
    .join("");
}

function getDefaultApplicantTermsHtml() {
  return [
    "<ol>",
    "<li><strong>TEMPOH KELULUSAN</strong><br />Tempoh kelulusan adalah tertakluk kepada tempoh lesen yang diluluskan oleh DBKU.</li>",
    "<li><strong>PEMBINAAN DAN PENYELENGGARAAN</strong><br />Pemohon hendaklah memastikan iklan berkaitan diselenggara dengan baik sepanjang tempoh kelulusan.</li>",
    "</ol>",
  ].join("");
}

function parseCurrencyAmount(value) {
  const numeric = Number(String(value || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function getPublicAssetUrl(path) {
  const cleanPath = `/${String(path || "").replace(/^\/+/, "")}`;
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return origin ? `${origin}${cleanPath}` : cleanPath;
}

function getManualDocumentAssetUrl(value) {
  const source = String(value || "").trim();
  if (/^(data:|blob:|https?:)/i.test(source)) return source;

  return getPublicAssetUrl(source);
}

function triggerDownload(url, filename) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function getDownloadFilename(value, fallbackExtension) {
  const raw = String(value || "document").trim() || "document";
  const normalized = raw
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  const extension = String(fallbackExtension || "").replace(/^\./, "");

  if (!extension || /\.[a-z0-9]{2,8}$/i.test(normalized)) {
    return normalized || `document.${extension}`;
  }

  return `${normalized}.${extension}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  if (status === "invoice_generated") return t("applicant.paymentHintProceed");
  if (status === "payment_submitted") return t("applicant.paymentHintSubmitted");
  if (status === "payment_verified") return t("applicant.paymentHintVerified");
  if (status === "license_issued") return t("applicant.paymentHintIssued");
  return t("applicant.paymentHintDefault");
}

function getPaymentStatusText(app, t) {
  const status = normalizeStatus(app?.status);
  const payment = app?.form_data?.payment || {};

  if (payment.status === "Receipt Rejected" || payment.verification_result === "Invalid/Fake") {
    return t("applicant.paymentStatusReceiptRejected");
  }
  if (status === "invoice_generated") return t("applicant.paymentStatusProceed");
  if (status === "payment_submitted") return t("applicant.paymentStatusSubmitted");
  if (status === "payment_verified") return t("applicant.paymentStatusVerified");
  if (status === "license_issued") return t("applicant.paymentStatusCompleted");
  return t("applicant.paymentStatusPending");
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
