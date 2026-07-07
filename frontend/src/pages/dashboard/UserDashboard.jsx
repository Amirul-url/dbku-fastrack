import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";
import UserDashboardLayout from "../../layout/UserDashboardLayout";
import {
  apiRequest,
  fetchApplicationList,
  fetchAuthenticatedBlob,
  getStoredUser,
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
  needsApplicantCorrection,
  normalizeStatus,
} from "../../utils/workflow";
import {
  getApplicantRecordSeen,
  getRecordUpdatedTime,
  markApplicantRecordSeen,
} from "../../utils/applicantSeenRecords";

const VALID_SECTIONS = ["applications", "status"];
const RECENT_ACTIVITY_PAGE_SIZE = 5;
const TABLE_PAGE_SIZE = 5;
const APPLICANT_STATUS_FILTER_OPTIONS = [
  "draft",
  "submitted",
  "under_review",
  "rejected",
  "approved",
];

function UserDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { language, t } = useLanguage();
  const tRef = useRef(t);
  const queryTab = searchParams.get("tab");
  const querySelectedId = searchParams.get("id") || "";
  const queryStatusFilter = searchParams.get("status") || "all";
  const normalizedQueryStatusFilter = getValidApplicantStatusFilter(queryStatusFilter);
  const normalizedQueryTab = queryTab === "license" ? "status" : queryTab;
  const activeSection = VALID_SECTIONS.includes(normalizedQueryTab)
    ? normalizedQueryTab
    : "overview";
  const [applications, setApplications] = useState([]);
  const [selectedId, setSelectedId] = useState(querySelectedId);
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [licensePanelOpen, setLicensePanelOpen] = useState(
    activeSection === "status" && Boolean(querySelectedId)
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [paymentReceipt, setPaymentReceipt] = useState(null);
  const [licensePanelTab, setLicensePanelTab] = useState("bank");
  const [receiptSuccessOpen, setReceiptSuccessOpen] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterMonth, setFilterMonth] = useState("all");
  const [filterYear, setFilterYear] = useState("all");
  const [statusSearch, setStatusSearch] = useState("");
  const [statusFilterStatus, setStatusFilterStatus] = useState(normalizedQueryStatusFilter);
  const [statusFilterMonth, setStatusFilterMonth] = useState("all");
  const [statusFilterYear, setStatusFilterYear] = useState("all");
  const [recordSeen, setRecordSeen] = useState(() => getApplicantRecordSeen(getStoredUser()));

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const fetchApplications = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const list = await fetchApplicationList({ params: { compact: "1" } });
      setApplications(list);
      setSelectedId((current) => current || (list.length > 0 ? String(list[0].id) : ""));
    } catch (err) {
      console.error("Failed to load applications:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchApplicationDetails = useCallback(async (id, options = {}) => {
    try {
      const data = await apiRequest(`/applications/${id}/`);
      const paymentData = data?.form_data?.payment || {};
      const receiptWasRejected = isPaymentReceiptRejected(paymentData);

      setSelectedApplication(data);
      setPaymentReceipt(receiptWasRejected ? null : paymentData.receipt_file || null);
      if (options.setDefaultPanelTab) {
        setLicensePanelTab(getDefaultLicensePanelTab(data));
      }
      if (options.markSeen) {
        markApplicationSeen("all", data);
      }
      return data;
    } catch (err) {
      console.error("Failed to load application details:", err);
      setMessage({ type: "error", text: tRef.current("applicant.detailsLoadFailed") });
      return null;
    }
  }, []);

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
      (activeSection !== "status" || licensePanelOpen)
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchApplicationDetails(selectedId, {
        markSeen: activeSection === "status" && licensePanelOpen,
        setDefaultPanelTab: activeSection === "status" && licensePanelOpen,
      });
    }
  }, [activeSection, fetchApplicationDetails, licensePanelOpen, selectedId]);

  useEffect(() => {
    if (activeSection !== "status") return;

    setStatusFilterStatus(normalizedQueryStatusFilter);

    if (querySelectedId) {
      setSelectedId(querySelectedId);
      setLicensePanelOpen(true);
      return;
    }

    setLicensePanelOpen(false);
    setSelectedApplication(null);
    setPaymentReceipt(null);
    setMessage({ type: "", text: "" });
  }, [activeSection, normalizedQueryStatusFilter, querySelectedId]);

  const draftApplications = useMemo(
    () => applications.filter((app) => normalizeStatus(app.status) === "draft"),
    [applications]
  );
  const submittedApplications = useMemo(
    () => applications.filter((app) => normalizeStatus(app.status) !== "draft"),
    [applications]
  );
  const filteredApplications = useMemo(() => {
    return filterDashboardApplications(draftApplications, {
      search,
      status: filterStatus,
      month: filterMonth,
      year: filterYear,
      language,
      t,
    });
  }, [draftApplications, filterMonth, filterStatus, filterYear, language, search, t]);

  const filteredSubmittedApplications = useMemo(() => {
    return filterDashboardApplications(submittedApplications, {
      search: statusSearch,
      status: statusFilterStatus,
      month: statusFilterMonth,
      year: statusFilterYear,
      language,
      t,
    });
  }, [
    language,
    statusSearch,
    statusFilterMonth,
    statusFilterStatus,
    statusFilterYear,
    submittedApplications,
    t,
  ]);

  const applicationYearOptions = useMemo(
    () => getApplicationYearOptions(draftApplications),
    [draftApplications]
  );
  const submittedYearOptions = useMemo(
    () => getApplicationYearOptions(submittedApplications),
    [submittedApplications]
  );
  const applicationStatusOptions = useMemo(
    () => getStatusFilterOptions(draftApplications, t),
    [draftApplications, t]
  );
  const submittedStatusOptions = useMemo(
    () => getStatusFilterOptions(submittedApplications, t),
    [submittedApplications, t]
  );

  const latest = applications[0];
  const selectedListApplication = applications.find(
    (app) => String(app.id) === String(selectedId)
  );
  const activeApplication = selectedApplication || selectedListApplication || latest;
  const payment = activeApplication?.form_data?.payment || {};
  const pageHeader = getDashboardHeader(activeSection, t, {
    hideStatusDetailHeader: activeSection === "status" && licensePanelOpen,
  });

  function showSection(tab) {
    setSearchParams({ tab });
    if (tab !== "status") {
      setLicensePanelOpen(false);
      setSelectedApplication(null);
      setPaymentReceipt(null);
      setReceiptSuccessOpen(false);
      setMessage({ type: "", text: "" });
    }
  }

  function openApplication(app) {
    const params = new URLSearchParams({ id: String(app.id) });
    if (activeSection === "status") {
      params.set("returnTab", "statusList");
    }
    navigate(`/applications/${app.id}/${getApplicantApplicationRoute(app)}?${params.toString()}`);
  }

  function openSubmittedApplicationSteps(app) {
    if (!app?.id) return;

    const params = new URLSearchParams({
      id: String(app.id),
      returnTab: "status",
    });

    navigate(`/applications/${app.id}/submitting-person?${params.toString()}`);
  }

  function markApplicationSeen(tab, app) {
    if (!app?.id) return;

    if (tab === "all") {
      const nextStatusMap = markApplicantRecordSeen("status", app);
      const nextLicenseMap = markApplicantRecordSeen("license", app);

      setRecordSeen((current) => ({
        ...current,
        status: nextStatusMap,
        eLicense: nextLicenseMap,
      }));
      return;
    }

    const mapKey = tab === "license" ? "eLicense" : "status";
    const nextMap = markApplicantRecordSeen(tab === "license" ? "license" : "status", app);

    setRecordSeen((current) => ({
      ...current,
      [mapKey]: nextMap,
    }));
  }

  function openLicenseRecord(app) {
    setSelectedId(String(app.id));
    setSelectedApplication(app);
    setLicensePanelOpen(true);
    setLicensePanelTab(getDefaultLicensePanelTab(app));
    setSearchParams({ tab: "status", id: String(app.id) });
    markApplicationSeen("all", app);
    fetchApplicationDetails(app.id, { markSeen: true, setDefaultPanelTab: true });
  }

  function returnToLicenseList() {
    setLicensePanelOpen(false);
    setSelectedApplication(null);
    setPaymentReceipt(null);
    setReceiptSuccessOpen(false);
    setMessage({ type: "", text: "" });
    setSearchParams({ tab: "status" });
  }

  function openStatusSummary(summaryKey) {
    const nextStatusFilter = summaryKey === "submitted" ? "all" : summaryKey;

    setStatusSearch("");
    setStatusFilterStatus(nextStatusFilter);
    setStatusFilterMonth("all");
    setStatusFilterYear("all");
    setLicensePanelOpen(false);
    setSelectedApplication(null);
    setPaymentReceipt(null);
    setReceiptSuccessOpen(false);
    setMessage({ type: "", text: "" });
    const params = { tab: "status" };
    if (nextStatusFilter !== "all") {
      params.status = nextStatusFilter;
    }
    setSearchParams(params);
  }

  async function submitPayment() {
    if (!selectedApplication || !canSubmitPayment(selectedApplication)) return;

    try {
      setSaving(true);
      setMessage({ type: "", text: "" });

      const current = selectedApplication;
      const currentPayment = current.form_data?.payment || {};
      const receiptWasRejected = isPaymentReceiptRejected(currentPayment);
      const receiptFile = paymentReceipt || (receiptWasRejected ? null : currentPayment.receipt_file);

      if (!receiptFile) {
        setMessage({ type: "error", text: t("applicant.receiptUploadRequired") });
        return;
      }

      const receipt = receiptFile.name || currentPayment.receipt_reference || `RECEIPT-${Date.now()}`;
      const submittedAt = new Date().toISOString();
      const nextPayment = {
        ...currentPayment,
        invoice_no: currentPayment.invoice_no || getInvoiceNo(current),
        amount: currentPayment.amount || "",
        status: "Payment Submitted",
        recommendation: "",
        receipt_decision: "",
        verification_result: "",
        verification_notes: "",
        internal_verification_notes: "",
        rejected_at: null,
        verified_at: null,
        receipt_reference: receipt,
        receipt_file: receiptFile,
        submitted_at: submittedAt,
      };
      const nextApplication = {
        ...current,
        status: "payment_submitted",
        updated_at: submittedAt,
        form_data: {
          ...(current.form_data || {}),
          payment: nextPayment,
        },
      };

      const updatedApplication = await apiRequest(`/applications/${selectedApplication.id}/`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "payment_submitted",
          form_data: {
            payment: nextPayment,
          },
        }),
      });

      const submittedApplication = updatedApplication?.id ? updatedApplication : nextApplication;
      markApplicationSeen("all", submittedApplication);
      await fetchApplications();
      setSelectedId(String(submittedApplication.id));
      setLicensePanelOpen(true);
      setSelectedApplication(submittedApplication);
      setPaymentReceipt(submittedApplication.form_data?.payment?.receipt_file || receiptFile);
      setReceiptSuccessOpen(true);
      setMessage({ type: "", text: "" });
      setSearchParams({ tab: "status", id: String(submittedApplication.id) });
    } catch (err) {
      setMessage({ type: "error", text: err.message || t("applicant.paymentSubmissionFailed") });
    } finally {
      setSaving(false);
    }
  }

  async function requestLicenseRevocation() {
    if (!selectedApplication || normalizeStatus(selectedApplication.status) !== "license_issued") return;

    const confirmed = window.confirm(
      t(
        "applicant.licenseRevocationConfirm",
        "Submit a request to revoke this license? DBKU will review the request."
      )
    );
    if (!confirmed) return;

    try {
      setSaving(true);
      setMessage({ type: "", text: "" });

      const timestamp = new Date().toISOString();
      const updatedApplication = await apiRequest(`/applications/${selectedApplication.id}/`, {
        method: "PATCH",
        body: JSON.stringify({
          form_data: {
            license_revocation_request: {
              status: "pending",
              requested_at: timestamp,
              requested_by: "applicant",
              withdrawn_at: "",
              completed_at: "",
            },
          },
        }),
      });

      markApplicationSeen("all", updatedApplication);
      await fetchApplications();
      setSelectedApplication(updatedApplication);
      setSelectedId(String(updatedApplication.id));
      setLicensePanelOpen(true);
      setMessage({
        type: "success",
        text: t("applicant.licenseRevocationRequested", "License revocation request sent to DBKU."),
      });
      window.dispatchEvent(new Event("fastrack:applications-changed"));
    } catch (err) {
      setMessage({
        type: "error",
        text: err.message || t("applicant.licenseRevocationRequestFailed", "Unable to request license revocation."),
      });
    } finally {
      setSaving(false);
    }
  }

  async function cancelLicenseRevocationRequest() {
    if (!selectedApplication || !hasPendingLicenseRevocationRequest(selectedApplication)) return;

    try {
      setSaving(true);
      setMessage({ type: "", text: "" });

      const timestamp = new Date().toISOString();
      const currentRequest = selectedApplication.form_data?.license_revocation_request || {};
      const updatedApplication = await apiRequest(`/applications/${selectedApplication.id}/`, {
        method: "PATCH",
        body: JSON.stringify({
          form_data: {
            license_revocation_request: {
              ...currentRequest,
              status: "withdrawn",
              withdrawn_at: timestamp,
            },
          },
        }),
      });

      markApplicationSeen("all", updatedApplication);
      await fetchApplications();
      setSelectedApplication(updatedApplication);
      setSelectedId(String(updatedApplication.id));
      setLicensePanelOpen(true);
      setMessage({
        type: "success",
        text: t("applicant.licenseRevocationCancelled", "License revocation request cancelled."),
      });
      window.dispatchEvent(new Event("fastrack:applications-changed"));
    } catch (err) {
      setMessage({
        type: "error",
        text: err.message || t("applicant.licenseRevocationCancelFailed", "Unable to cancel the revocation request."),
      });
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
      markApplicationSeen("all", {
        ...activeApplication,
        updated_at: receipt.uploaded_at || new Date().toISOString(),
      });
      const refreshed = await fetchApplicationDetails(activeApplication.id, { markSeen: true });
      setPaymentReceipt(receipt);
      markApplicationSeen("all", refreshed || activeApplication);
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

  async function downloadPaymentReceipt() {
    const source = getPaymentReceiptSource(paymentReceipt);
    if (!source) return;

    try {
      const isInlineFile = source.startsWith("blob:") || source.startsWith("data:");
      const url = isInlineFile
        ? source
        : URL.createObjectURL(await fetchAuthenticatedBlob(source));
      const title = `${getApplicationReference(activeApplication)} ${t("applicant.paymentReceipt", "Payment Receipt")}`;

      if (isImageReceipt(paymentReceipt, url)) {
        await printHtmlDocument(
          buildApplicantReceiptPrintHtml(paymentReceipt, url, title),
          title
        );
      } else {
        await printUrlDocument(url, title);
      }

      if (!isInlineFile) {
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    } catch (err) {
      console.error("Failed to download payment receipt:", err);
      setMessage({
        type: "error",
        text: t("applicant.receiptViewFailed", "Unable to open the receipt. Please try again."),
      });
    }
  }

  return (
    <UserDashboardLayout>
      {pageHeader && (
        <PageHeader
          title={pageHeader.title}
          description={pageHeader.description}
          descriptionClassName={pageHeader.descriptionClassName}
        />
      )}

      <Alert type={message.type || "success"} message={message.text} />

      {activeSection === "overview" && (
        <OverviewSection
          applications={applications}
          loading={loading}
          t={t}
          onStatusCardClick={openStatusSummary}
        />
      )}

      {activeSection === "applications" && (
        <ApplicationsSection
          applications={filteredApplications}
          loading={loading}
          search={search}
          status={filterStatus}
          month={filterMonth}
          year={filterYear}
          years={applicationYearOptions}
          statuses={applicationStatusOptions}
          language={language}
          t={t}
          onSearch={setSearch}
          onStatusChange={setFilterStatus}
          onMonthChange={setFilterMonth}
          onYearChange={setFilterYear}
          onOpen={openApplication}
        />
      )}

      {activeSection === "status" && (
        licensePanelOpen && activeApplication ? (
          <LicenseSection
            app={activeApplication}
            payment={payment}
            paymentReceipt={paymentReceipt}
            saving={saving}
            t={t}
            onViewApplicationSteps={openSubmittedApplicationSteps}
            onReceiptChange={handlePaymentReceiptChange}
            onReceiptRemove={handlePaymentReceiptRemove}
            onReceiptDownload={downloadPaymentReceipt}
            onSubmitPayment={submitPayment}
            onRequestRevocation={requestLicenseRevocation}
            onCancelRevocationRequest={cancelLicenseRevocationRequest}
            onBack={returnToLicenseList}
            activePanelTab={licensePanelTab}
            onPanelTabChange={setLicensePanelTab}
          />
        ) : (
          <LicenseListSection
            applications={filteredSubmittedApplications}
            loading={loading}
            t={t}
            language={language}
            search={statusSearch}
            status={statusFilterStatus}
            month={statusFilterMonth}
            year={statusFilterYear}
            years={submittedYearOptions}
            statuses={submittedStatusOptions}
            onSearch={setStatusSearch}
            onStatusChange={setStatusFilterStatus}
            onMonthChange={setStatusFilterMonth}
            onYearChange={setStatusFilterYear}
            isReferenceNew={(app) =>
              isApplicantRecordNew(app, "status", recordSeen) ||
              (isELicenseApplication(app) && isApplicantRecordNew(app, "license", recordSeen))
            }
            onOpen={(app) => {
              if (isELicenseApplication(app)) {
                markApplicationSeen("all", app);
                openLicenseRecord(app);
                return;
              }

              markApplicationSeen("status", app);
              openApplication(app);
            }}
          />
        )
      )}

      {receiptSuccessOpen && (
        <ReceiptSubmittedModal
          t={t}
          onClose={() => setReceiptSuccessOpen(false)}
        />
      )}
    </UserDashboardLayout>
  );
}

function ReceiptSubmittedModal({ t, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-submitted-title"
    >
      <div className="w-full max-w-[680px] rounded-lg border-2 border-slate-900 bg-white px-6 py-7 text-center shadow-xl sm:px-10">
        <img
          src="/green_tick.png"
          alt=""
          className="mx-auto h-44 w-44 object-contain"
        />
        <h2
          id="receipt-submitted-title"
          className="mt-5 text-4xl font-extrabold uppercase tracking-normal text-black"
        >
          {t("applicant.receiptSuccessTitle", "SUCCESS!")}
        </h2>
        <p className="mt-5 text-2xl font-medium text-black">
          {t("applicant.receiptSubmittedModalMessage", "Receipt Submitted!")}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-8 inline-flex min-h-16 w-48 items-center justify-center rounded-xl bg-[#8bd86f] px-8 text-2xl font-semibold text-white transition hover:bg-[#7bcb60] focus:outline-none focus:ring-4 focus:ring-lime-200"
        >
          {t("common.ok", "OK")}
        </button>
      </div>
    </div>
  );
}

function getDefaultLicensePanelTab(app) {
  return canViewLicense(app) ? "qr" : "bank";
}

function OverviewSection({ applications, loading, t, onStatusCardClick }) {
  const statusSummary = useMemo(
    () => buildOverviewStatusSummary(applications, t),
    [applications, t]
  );
  const currentUser = useMemo(() => getStoredUser(), []);
  const recentActivities = useMemo(
    () => buildRecentActivities(applications, t, currentUser),
    [applications, currentUser, t]
  );

  return (
    <section className="space-y-4">
      <div className="rounded-md border border-emerald-200 bg-white p-5">
        <OverviewStatusCards
          items={statusSummary}
          loading={loading}
          onItemClick={onStatusCardClick}
        />
      </div>
      <RecentActivities activities={recentActivities} loading={loading} t={t} />
    </section>
  );
}

function OverviewStatusCards({ items, loading, onItemClick }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <OverviewStatusCard
          key={item.key}
          itemKey={item.key}
          label={item.label}
          value={loading ? "..." : item.value}
          icon={item.icon}
          tone={item.tone}
          compact={item.compact}
          disabled={loading}
          onClick={onItemClick}
        />
      ))}
    </div>
  );
}

function OverviewStatusCard({
  itemKey,
  label,
  value,
  icon,
  tone,
  compact = false,
  disabled = false,
  onClick,
}) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    slate: "bg-slate-100 text-slate-700",
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onClick?.(itemKey)}
      className="min-h-[104px] rounded-md border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-emerald-300 hover:bg-white hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-wait disabled:hover:border-slate-200 disabled:hover:bg-slate-50 disabled:hover:shadow-none"
      aria-label={`${label}: ${value}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-500">{label}</p>
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
    </button>
  );
}

function ApplicationsSection({
  applications,
  loading,
  search,
  status,
  month,
  year,
  years,
  statuses,
  language,
  t,
  onSearch,
  onStatusChange,
  onMonthChange,
  onYearChange,
  onOpen,
}) {
  const hasActiveFilter =
    Boolean(search.trim()) || status !== "all" || month !== "all" || year !== "all";

  return (
    <section className="space-y-4">
      <div className="rounded-md border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {t("common.searchAndFilter")}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {t("applicant.searchFilterHint")}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            {hasActiveFilter && (
              <button
                type="button"
                onClick={() => {
                  onSearch("");
                  onStatusChange("all");
                  onMonthChange("all");
                  onYearChange("all");
                }}
                className="min-h-10 px-2 text-sm font-semibold text-emerald-700 hover:text-emerald-900"
              >
                {t("common.clearFilters")}
              </button>
            )}
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

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px_180px]">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-600">
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

          <StatusFilterSelect
            value={status}
            options={statuses}
            t={t}
            onChange={onStatusChange}
          />

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-600">
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
            <span className="mb-1.5 block text-sm font-semibold text-slate-600">
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
        emptyText={t("applicant.noDraftApplications", "No draft applications found.")}
        onOpen={onOpen}
      />
    </section>
  );
}

function LicenseSection({
  app,
  payment,
  paymentReceipt,
  saving,
  t,
  onViewApplicationSteps,
  onReceiptChange,
  onReceiptRemove,
  onReceiptDownload,
  onSubmitPayment,
  onRequestRevocation,
  onCancelRevocationRequest,
  onBack,
  activePanelTab = "bank",
  onPanelTabChange,
}) {
  const canSubmitPaymentProof = canSubmitPayment(app);
  const isReceiptRejected = isPaymentReceiptRejected(payment);
  const isReceiptSubmitted = normalizeStatus(app?.status) === "payment_submitted" && !isReceiptRejected;
  const isPaymentLocked = !canSubmitPaymentProof || isReceiptSubmitted;

  return (
    <section className="space-y-4">
      <div className="flex justify-start">
        <Button
          type="button"
          variant="secondary"
          icon="arrow_back"
          onClick={onBack}
        >
          {t("applicant.backToStatusELicenses", "Back to Status & E-Licenses")}
        </Button>
      </div>

      <ApplicationSelectionSummary app={app} t={t} />

      <div className="rounded-md border border-slate-200 bg-white">
        <div className="grid items-start gap-4 p-4 lg:grid-cols-[max-content_minmax(0,1fr)]">
          <LicenseQrPanel
            app={app}
            t={t}
            activeTab={activePanelTab}
            onTabChange={onPanelTabChange}
          />

          <div className="space-y-4">
            <ApplicantPaymentDocuments
              app={app}
              t={t}
              onViewApplicationSteps={onViewApplicationSteps}
            />

            <LicenseRevocationRequestPanel
              app={app}
              saving={saving}
              t={t}
              onRequestRevocation={onRequestRevocation}
              onCancelRevocationRequest={onCancelRevocationRequest}
            />

            <section className="rounded-md border border-slate-200 bg-slate-50">
              <div className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-slate-950">
                    {t("applicant.paymentReceipt", "Payment Receipt")}
                  </h4>
                  <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
                    {getPaymentHint(app, t)}
                  </p>
                </div>
              </div>

              {isReceiptRejected && (
                <div className="mx-3 mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {t("applicant.paymentHintReceiptRejected")}
                </div>
              )}

              {isReceiptSubmitted && (
                <div className="mx-3 mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                  {t("applicant.paymentSubmittedSuccess")}
                </div>
              )}

              <div className="border-t border-slate-200 bg-white px-3 py-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-xs font-bold text-emerald-700 ring-1 ring-emerald-100">
                      1
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {paymentReceipt?.name || t("applicant.uploadReceiptFile", "Upload receipt file")}
                      </p>
                      {!isPaymentLocked && (
                        <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
                          {paymentReceipt
                            ? t("applicant.receiptReadyToSubmit", "Receipt selected. Submit it for ALiS verification.")
                            : t("applicant.receiptAcceptedFormats", "Choose a PDF, JPG, or PNG file.")}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {paymentReceipt && getPaymentReceiptSource(paymentReceipt) && (
                      <button
                        type="button"
                        onClick={onReceiptDownload}
                        className="inline-flex min-h-9 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          download
                        </span>
                        {t("common.download", "Download")}
                      </button>
                    )}
                    {!isPaymentLocked && !paymentReceipt && (
                      <label className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800">
                        <span className="material-symbols-outlined text-[16px] text-white">
                          upload_file
                        </span>
                        <span>{t("common.chooseFile", "Choose File")}</span>
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
                        className="inline-flex min-h-9 items-center justify-center gap-1 rounded-md border border-red-200 bg-white px-3 text-sm font-semibold text-red-700 hover:bg-red-50"
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
                <div className="flex flex-col gap-2 border-t border-slate-200 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-50 text-xs font-bold text-blue-700 ring-1 ring-blue-100">
                      2
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">
                        {t("applicant.submitReceiptForVerification", "Submit receipt for verification")}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
                        {paymentReceipt
                          ? t("applicant.submitReceiptReadyHint", "Send the selected receipt to ALiS.")
                          : t("applicant.submitReceiptDisabledHint", "Choose a receipt file first.")}
                      </p>
                    </div>
                  </div>
                  {isReceiptSubmitted ? (
                    <span className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800 sm:w-auto">
                      <span className="material-symbols-outlined text-[16px]">
                        check_circle
                      </span>
                      {t("applicant.paymentStatusSubmitted")}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={onSubmitPayment}
                      disabled={saving || !paymentReceipt}
                      className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                    >
                      <span className="material-symbols-outlined text-[16px] text-white">
                        upload_file
                      </span>
                      {saving
                        ? t("common.submitting")
                        : t("applicant.submitReceiptVerificationButton", "Submit for Verification")}
                    </button>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </section>
  );
}

function ApplicationSelectionSummary({ app, t }) {
  const items = [
    {
      label: t("common.reference"),
      value: getApplicationReference(app),
      className: "font-semibold text-slate-950",
    },
    {
      label: t("common.status"),
      value: (
        <StatusPill value={translatedStatus(t, normalizeStatus(app?.status))} />
      ),
    },
    {
      label: t("common.created"),
      value: formatCompactDateTime(app?.created_at),
    },
    {
      label: t("common.updated"),
      value: formatCompactDateTime(app?.updated_at),
    },
  ];

  return (
    <div className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            {item.label}
          </p>
          <div className={`mt-1 text-sm ${item.className || "text-slate-950"}`}>
            {item.value || "-"}
          </div>
        </div>
      ))}
    </div>
  );
}

function LicenseQrPanel({ app, t, activeTab = "bank", onTabChange }) {
  const license = app?.form_data?.license || {};
  const licenseReady = canViewLicense(app);
  const licenseId = license.license_id || getLicenseId(app);
  const displayReference = getApplicationReference(app);
  const verificationUrl = getLicenseVerificationUrl(licenseId);
  const qrContainerRef = useRef(null);
  const selectedTab = activeTab === "qr" ? "qr" : "bank";
  const tabs = [
    { key: "bank", label: t("applicant.bankAccountTab", "Account Bank") },
    { key: "qr", label: t("applicant.qrELicenseTab", "QR E-License") },
  ];

  return (
    <section className="w-full max-w-[360px] lg:w-[360px]">
      <div className="mx-auto w-full max-w-[360px]">
        <div className="grid grid-cols-2 overflow-hidden rounded-t-md border border-slate-300 bg-white text-center text-xs font-bold uppercase leading-5 text-slate-950">
          {tabs.map((tab) => {
            const selected = selectedTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onTabChange?.(tab.key)}
                className={`min-h-7 border-r border-slate-300 px-3 transition last:border-r-0 ${
                  selected
                    ? "bg-[#b8e4a8] text-slate-950"
                    : "bg-white text-slate-950 hover:bg-slate-50"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex min-h-[360px] items-stretch justify-center rounded-b-md border-x border-b border-slate-300 bg-white text-center">
          {selectedTab === "bank" ? (
            <div className="flex min-h-[360px] w-full items-center justify-center overflow-hidden rounded-b-md border border-slate-900 bg-[#e55a82] p-3">
              <div className="flex min-h-[332px] w-full flex-col items-center justify-start rounded-xl border-2 border-slate-800 bg-white px-4 py-3 text-slate-950">
                <BankAccountContent t={t} />
              </div>
            </div>
          ) : (
            <QrELicenseContent
              app={app}
              t={t}
              licenseReady={licenseReady}
              verificationUrl={verificationUrl}
              displayReference={displayReference}
              qrContainerRef={qrContainerRef}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function BankAccountContent({ t }) {
  return (
    <>
      <p className="text-xs font-normal uppercase tracking-[0.14em]">
        {t("applicant.bankPaymentTitle", "Please made payment to:")}
      </p>

      <img
        src="/Bank Islam Logo.jpg"
        alt="Bank Islam"
        className="mt-2 h-auto w-full max-w-[132px] object-contain"
      />

      <p className="mt-3 text-sm font-bold uppercase tracking-wide">
        {t("applicant.bankPaymentAccountNo", "Account No :")}
      </p>
      <div className="mt-1.5 w-full rounded-xl border-4 border-[#e55a82] px-3 py-1.5 text-base font-normal tracking-wide">
        11013010028881
      </div>

      <p className="mt-3 text-sm font-bold uppercase tracking-wide">
        {t("applicant.bankPaymentAccountHolder", "Account Holder :")}
      </p>
      <div className="mt-1.5 w-full rounded-xl border-4 border-[#e55a82] px-3 py-1.5 text-sm font-normal">
        Dewan Bandaraya Kuching Utara
      </div>

      <p className="mt-3 max-w-[320px] text-[10px] font-normal leading-tight text-slate-950">
        {t("applicant.bankPaymentProofLine", "Please attach payment slip /receipt as payment proof.")}
        <br />
        {t("applicant.bankPaymentDetailsLine1", "Please provide your Full Name, Full Address,")}
        <br />
        {t("applicant.bankPaymentDetailsLine2", "Phone Number & Order Details.")}
        <br />
        {t("applicant.bankPaymentThanks", "THANK YOU.")}
      </p>
    </>
  );
}

function QrELicenseContent({
  app,
  t,
  licenseReady,
  verificationUrl,
  displayReference,
  qrContainerRef,
}) {
  if (!licenseReady) {
    return (
      <div className="flex min-h-[360px] w-full items-center justify-center rounded-b-md border border-slate-900 bg-white px-8 text-center">
        <p className="max-w-[260px] text-sm font-bold leading-7 text-slate-950">
          {t(
            "applicant.qrLicensePendingFull",
            "QR e-license will appear after payment has been verified and the license is issued."
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[360px] w-full flex-col items-center justify-center gap-3">
      <div ref={qrContainerRef} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <QRCodeSVG
          value={verificationUrl}
          size={320}
          level="M"
          includeMargin
          className="h-auto max-w-full"
          role="img"
          aria-label="License verification QR"
        />
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {displayReference || getApplicationReference(app)}
      </p>
      <button
        type="button"
        onClick={() => downloadApplicantQrCode(qrContainerRef.current, displayReference)}
        className="inline-flex min-h-9 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        <span className="material-symbols-outlined text-[16px]">
          download
        </span>
        {t("common.download", "Download")}
      </button>
    </div>
  );
}

function ApplicantPaymentDocuments({ app, t, onViewApplicationSteps }) {
  const approvalLetter = app?.form_data?.approval_letter || {};
  const license = app?.form_data?.license || {};
  const manualReceipt = approvalLetter.manual_receipt || {};
  const manualLicense = license.manual_license || {};
  const officialReceiptFile = getSentOfficialReceiptFile(app);
  const showOfficialReceipt = Boolean(
    officialReceiptFile ||
    manualReceipt.document_html ||
    manualReceipt.sent_at ||
    manualReceipt.status === "Sent to Applicant" ||
    (normalizeStatus(app?.status) === "payment_verified" && manualReceipt.saved_at)
  );
  const showAdvertisementLicense = Boolean(
    canViewLicense(app) &&
    (getPaymentDocumentSource(license.license_file) ||
      manualLicense.document_html ||
      manualLicense.sent_at ||
      manualLicense.status === "Sent to Applicant" ||
      manualLicense.saved_at)
  );
  const documents = [
    {
      label: t("applicant.submittedApplicationForm", "Submitted Application Form"),
      name: t("applicant.submittedApplicationSteps", "Application Steps 1-5"),
      available: true,
      type: "submitted_application",
    },
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
    ...(showAdvertisementLicense
      ? [
          {
            label: t("workspace.license.documentTitle", "Advertisement License"),
            file: license.license_file,
            manual: manualLicense,
            type: "advertisement_license",
          },
        ]
      : []),
  ];
  const hasAnyDocument = documents.some((item) =>
    item.available || getPaymentDocumentSource(item.file) || item.manual?.saved_at
  );

  if (!hasAnyDocument) return null;

  return (
    <section className="rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-3 py-2">
        <h4 className="text-sm font-semibold text-slate-950">
          {t("applicant.paymentDocumentsTitle", "Documents to Download")}
        </h4>
        <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
          {t("applicant.paymentDocumentsDesc", "View the submitted application and download documents from ALiS.")}
        </p>
      </div>

      <div className="divide-y divide-slate-200">
        {documents.map((item) => (
          <div
            key={item.label}
            className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold uppercase text-slate-500">
                {item.label}
              </p>
              {item.file?.name && (
                <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                  {item.file.name}
                </p>
              )}
              {item.name && (
                <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                  {item.name}
                </p>
              )}
            </div>
            {(item.available || getPaymentDocumentSource(item.file) || item.manual?.saved_at) && (
              <div className="flex flex-wrap gap-2">
                {item.type === "submitted_application" && (
                  <button
                    type="button"
                    onClick={() => onViewApplicationSteps?.(app)}
                    className="inline-flex min-h-9 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      visibility
                    </span>
                    {t("common.view", "View")}
                  </button>
                )}
                {item.type !== "submitted_application" && (
                  <button
                    type="button"
                    onClick={() =>
                      item.type === "advertisement_license"
                        ? item.file
                          ? downloadApplicantPaymentDocument(item.file, item.label, t)
                          : downloadApplicantAdvertisementLicenseDocument(app, t)
                        : item.file
                        ? downloadApplicantPaymentDocument(item.file, item.label, t)
                        : downloadApplicantManualPaymentDocument(app, item.type, t)
                    }
                    className="inline-flex min-h-9 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      download
                    </span>
                    {t("common.download", "Download")}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function LicenseRevocationRequestPanel({
  app,
  saving,
  t,
  onRequestRevocation,
  onCancelRevocationRequest,
}) {
  const status = normalizeStatus(app?.status);
  const pendingRequest = hasPendingLicenseRevocationRequest(app);

  if (!["license_issued", "license_revoked"].includes(status) && !pendingRequest) {
    return null;
  }

  if (status === "license_revoked") {
    return (
      <section className="rounded-md border border-red-200 bg-red-50 px-3 py-3">
        <h4 className="text-sm font-semibold text-red-900">
          {t("applicant.licenseRevokedTitle", "License revoked")}
        </h4>
        <p className="mt-1 text-sm leading-5 text-red-800">
          {t("applicant.licenseRevokedDesc", "This e-license has been revoked by DBKU.")}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-md border border-slate-200 bg-white px-3 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-slate-950">
            {t("applicant.licenseRevocationTitle", "License revocation request")}
          </h4>
          <p className="mt-1 text-sm leading-5 text-slate-500">
            {pendingRequest
              ? t("applicant.licenseRevocationPendingDesc", "Your revocation request has been sent to DBKU. You can cancel it before the license is revoked.")
              : t("applicant.licenseRevocationDesc", "Request DBKU to revoke this e-license if you no longer need it.")}
          </p>
        </div>

        {pendingRequest ? (
          <button
            type="button"
            onClick={onCancelRevocationRequest}
            disabled={saving}
            className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="material-symbols-outlined text-[16px]">undo</span>
            {t("applicant.cancelRevocationRequest", "Cancel Request")}
          </button>
        ) : (
          <button
            type="button"
            onClick={onRequestRevocation}
            disabled={saving}
            className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-red-200 bg-white px-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="material-symbols-outlined text-[16px]">block</span>
            {t("applicant.requestLicenseRevocation", "Request Revoke")}
          </button>
        )}
      </div>
    </section>
  );
}

function LicenseListSection({
  applications,
  loading,
  t,
  language,
  search,
  status,
  month,
  year,
  years,
  statuses,
  onSearch,
  onStatusChange,
  onMonthChange,
  onYearChange,
  isReferenceNew,
  onOpen,
}) {
  return (
    <section className="space-y-4">
      <DashboardTableFilters
        t={t}
        language={language}
        search={search}
        status={status}
        month={month}
        year={year}
        years={years}
        statuses={statuses}
        onSearch={onSearch}
        onStatusChange={onStatusChange}
        onMonthChange={onMonthChange}
        onYearChange={onYearChange}
      />

      <PaginatedDataTable
        t={t}
        loading={loading}
        loadingText={t("common.loading")}
        emptyText={t("applicant.noApplicationSubmitted")}
        rows={applications}
        alwaysShowPagination
        columns={[
          {
            key: "reference",
            label: t("common.reference"),
            className: "w-[9%]",
            cellClassName: "w-[9%] whitespace-nowrap text-sm",
            render: (app) => (
              <span className="inline-flex items-center gap-2 text-sm font-semibold leading-5 text-emerald-700">
                <span>{getApplicationReference(app)}</span>
                {isReferenceNew?.(app) && <ReferenceNewBadge t={t} />}
              </span>
            ),
          },
          {
            key: "project",
            label: t("common.project"),
            className: "w-[28%]",
            cellClassName: "w-[28%] text-sm",
            render: (app) => (
              <span className="block max-w-[34rem] whitespace-pre-line text-sm leading-5">
                {getProjectName(app, language)}
              </span>
            ),
          },
          {
            key: "status",
            label: t("common.status"),
            className: "w-[12%]",
            cellClassName: "w-[12%] text-sm",
            render: (app) => <StatusPill value={translatedStatus(t, getApplicantFilterStatus(app))} />,
          },
          {
            key: "payment",
            label: t("common.paymentStatus", "Payment Status"),
            className: "w-[12%]",
            cellClassName: "w-[12%] text-sm",
            render: (app) => (
              <span className="block whitespace-normal text-sm leading-5">
                {getPaymentStatusText(app, t)}
              </span>
            ),
          },
          {
            key: "remarks",
            label: t("common.remarks", "Remarks"),
            className: "w-[18%]",
            cellClassName: "w-[18%] text-sm",
            render: (app) => (
              <span className="block max-w-[24rem] whitespace-normal text-sm leading-5 text-slate-600">
                {getApplicationRemark(app) || "-"}
              </span>
            ),
          },
          {
            key: "updated",
            label: t("common.updated"),
            className: "w-[13%]",
            cellClassName: "w-[13%] text-sm",
            render: (app) => (
              <span className="whitespace-nowrap text-sm leading-5">
                {formatCompactDateTime(app.updated_at)}
              </span>
            ),
          },
          {
            key: "action",
            label: t("common.action"),
            className: "w-[8%]",
            cellClassName: "w-[8%] text-sm",
            render: (app) => (
              <button
                type="button"
                onClick={() => onOpen(app)}
                className="min-h-8 rounded-md border border-slate-300 px-3 py-1 text-sm font-semibold leading-5 text-slate-700 hover:bg-slate-50"
              >
                {needsApplicantCorrection(app)
                  ? t("common.edit", "Edit")
                  : t("common.view", "View")}
              </button>
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

function DashboardTableFilters({
  t,
  language,
  search = "",
  status,
  month,
  year,
  years,
  statuses,
  onSearch,
  onStatusChange,
  onMonthChange,
  onYearChange,
}) {
  const hasActiveFilter = Boolean(search.trim()) || status !== "all" || month !== "all" || year !== "all";

  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {t("common.searchAndFilter")}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {t("applicant.searchFilterHint", "Filter records by keyword, status, application month, and application year.")}
          </p>
        </div>

        {hasActiveFilter && (
          <button
            type="button"
            onClick={() => {
              onSearch?.("");
              onStatusChange("all");
              onMonthChange("all");
              onYearChange("all");
            }}
            className="text-sm font-semibold text-emerald-700 hover:text-emerald-900"
          >
            {t("common.clearFilters")}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px_180px]">
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-slate-600">
            {t("common.keyword")}
          </span>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-slate-400">
              search
            </span>
            <input
              type="search"
              value={search}
              onChange={(event) => onSearch?.(event.target.value)}
              placeholder={t("applicant.searchPlaceholder")}
              className="h-11 w-full rounded-md border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            />
          </div>
        </label>

        <StatusFilterSelect
          value={status}
          options={statuses}
          t={t}
          onChange={onStatusChange}
        />

        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-slate-600">
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
          <span className="mb-1.5 block text-sm font-semibold text-slate-600">
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
  );
}

function StatusFilterSelect({ value, options, t, onChange }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-slate-600">
        {t("common.status")}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
      >
        <option value="all">{t("common.allStatuses", "All")}</option>
        {options.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function PaginatedDataTable({ rows, t, alwaysShowPagination = false, ...props }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(rows.length / TABLE_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const visibleRows = rows.slice(
    currentPage * TABLE_PAGE_SIZE,
    (currentPage + 1) * TABLE_PAGE_SIZE
  );
  const showPagination = alwaysShowPagination || rows.length > TABLE_PAGE_SIZE;

  useEffect(() => {
    setPage((current) => {
      const nextTotalPages = Math.max(1, Math.ceil(rows.length / TABLE_PAGE_SIZE));
      return Math.min(current, nextTotalPages - 1);
    });
  }, [rows.length]);

  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <DataTable {...props} rows={visibleRows} />
      {!props.loading && showPagination && (
        <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            {t("applicant.recentActivitiesPage", "Page")} {currentPage + 1} {t("common.of", "of")} {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPage((current) => Math.max(current - 1, 0))}
              disabled={currentPage === 0}
            >
              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
              {t("common.previous", "Previous")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPage((current) => Math.min(current + 1, totalPages - 1))}
              disabled={currentPage >= totalPages - 1}
            >
              {t("common.next", "Next")}
              <span className="material-symbols-outlined text-[18px]">chevron_right</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ApplicationTable({
  applications,
  loading,
  t,
  language = "en",
  emptyText,
  onOpen,
  actionMode = "workflow",
  isReferenceNew,
}) {
  return (
    <PaginatedDataTable
      t={t}
      loading={loading}
      loadingText={t("common.loading")}
      emptyText={emptyText || t("applicant.noApplicationsYet")}
      rows={applications}
      alwaysShowPagination
      columns={[
        {
          key: "reference",
          label: t("common.reference"),
          className: "w-[9%]",
          cellClassName: "w-[9%] whitespace-nowrap text-sm",
          render: (app) => (
            <span className="inline-flex items-center gap-2 text-sm font-semibold leading-5 text-emerald-700">
              <span>{getApplicationReference(app)}</span>
              {isReferenceNew?.(app) && <ReferenceNewBadge t={t} />}
            </span>
          ),
        },
        {
          key: "project",
          label: t("common.project"),
          className: "w-[41%]",
          cellClassName: "w-[41%] text-sm",
          render: (app) => (
            <span className="block max-w-[42rem] whitespace-pre-line text-sm leading-5">
              {getProjectName(app, language)}
            </span>
          ),
        },
        {
          key: "status",
          label: t("common.status"),
          className: "w-[12%]",
          cellClassName: "w-[12%] text-sm",
          render: (app) => <StatusPill value={translatedStatus(t, getApplicantFilterStatus(app))} />,
        },
        {
          key: "remarks",
          label: t("common.remarks", "Remarks"),
          className: "w-[18%]",
          cellClassName: "w-[18%] text-sm",
          render: (app) => (
            <span className="block max-w-[24rem] whitespace-normal text-sm leading-5 text-slate-600">
              {getApplicationRemark(app) || "-"}
            </span>
          ),
        },
        {
          key: "updated",
          label: t("common.updated"),
          className: "w-[13%]",
          cellClassName: "w-[13%] text-sm",
          render: (app) => (
            <span className="whitespace-nowrap text-sm leading-5">
              {formatCompactDateTime(app.updated_at)}
            </span>
          ),
        },
        {
          key: "action",
          label: t("common.action"),
          className: "w-[7%]",
          cellClassName: "w-[7%] text-sm",
          render: (app) => (
            actionMode === "view" ? (
              <button
                type="button"
                onClick={() => onOpen(app)}
                className="min-h-8 rounded-md border border-slate-300 px-3 py-1 text-sm font-semibold leading-5 text-slate-700 hover:bg-slate-50"
              >
                {needsApplicantCorrection(app)
                  ? t("common.edit", "Edit")
                  : t("common.view", "View")}
              </button>
            ) : (
              !shouldHideApplicantAction(app) && (
              <button
                type="button"
                onClick={() => onOpen(app)}
                className="min-h-8 rounded-md border border-slate-300 px-3 py-1 text-sm font-semibold leading-5 text-slate-700 hover:bg-slate-50"
              >
                {t(getApplicantActionKey(app))}
              </button>
              )
            )
          ),
        },
      ]}
    />
  );
}

function translatedStatus(t, status) {
  const normalized = normalizeStatus(status);
  const applicantStatusLabels = {
    invoice_generated: t("applicant.statusReadyForPayment", "Ready for Payment"),
  };

  if (applicantStatusLabels[normalized]) {
    return applicantStatusLabels[normalized];
  }

  const displayStatus = getApplicantDisplayStatus(status);

  return t(`status.${displayStatus}`, formatWorkflowStatus(displayStatus));
}

function ReferenceNewBadge({ t }) {
  return (
    <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase leading-none text-white">
      {t("common.new", "New")}
    </span>
  );
}

function getApplicationRemark(app) {
  const status = normalizeStatus(app?.status);
  const formData = app?.form_data || {};
  const payment = getApplicationPayment(app);

  if (["invoice_generated", "payment_submitted"].includes(status)) {
    return isPaymentReceiptRejected(payment)
      ? cleanRemark(
          payment.verification_notes ||
            payment.internal_verification_notes ||
            app?.display_remark ||
            app?.latest_remark
        )
      : "";
  }

  if (["payment_verified", "license_issued"].includes(status)) {
    return cleanRemark(
      formData.payment?.verification_notes ||
        formData.license?.remarks ||
        formData.license?.notes
    );
  }

  if (status === "approved") return "";

  if (!["incomplete", "rejected"].includes(status)) return "";

  return cleanRemark(
    formData.correction_request?.remarks ||
      app?.latest_remark ||
      formData.auto_screening?.remarks
  );
}

function RecentActivities({ activities, loading, t }) {
  const [page, setPage] = useState(0);
  const [dateFilter, setDateFilter] = useState("");
  const filteredActivities = useMemo(
    () => filterActivitiesByDate(activities, dateFilter),
    [activities, dateFilter]
  );
  const totalPages = Math.max(1, Math.ceil(filteredActivities.length / RECENT_ACTIVITY_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const visibleActivities = filteredActivities.slice(
    currentPage * RECENT_ACTIVITY_PAGE_SIZE,
    (currentPage + 1) * RECENT_ACTIVITY_PAGE_SIZE
  );
  const showPagination = filteredActivities.length > 0;

  useEffect(() => {
    setPage((current) => {
      const nextTotalPages = Math.max(1, Math.ceil(filteredActivities.length / RECENT_ACTIVITY_PAGE_SIZE));
      return Math.min(current, nextTotalPages - 1);
    });
  }, [filteredActivities.length]);

  useEffect(() => {
    setPage(0);
  }, [dateFilter]);

  return (
    <section className="rounded-md border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-950">
            {t("applicant.recentActivitiesTitle", "Recent Activities")}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {t("applicant.recentActivitiesDesc", "Latest actions you performed on your applications.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            className="h-9 min-h-9 w-9 p-0"
            onClick={() => setPage((current) => Math.max(current - 1, 0))}
            disabled={loading || !showPagination || currentPage === 0}
            aria-label={t("common.previous", "Previous")}
            title={t("common.previous", "Previous")}
          >
            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="h-9 min-h-9 w-9 p-0"
            onClick={() => setPage((current) => Math.min(current + 1, totalPages - 1))}
            disabled={loading || !showPagination || currentPage >= totalPages - 1}
            aria-label={t("common.next", "Next")}
            title={t("common.next", "Next")}
          >
            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
          </Button>
          <input
            type="date"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
            aria-label={t("common.date", "Date")}
            className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
          <Button
            type="button"
            variant="secondary"
            className="h-9 min-h-9 px-3"
            onClick={() => setDateFilter("")}
            disabled={!dateFilter}
          >
            {t("common.reset", "Reset")}
          </Button>
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {loading ? (
          <p className="px-4 py-4 text-sm text-slate-500">{t("common.loading", "Loading...")}</p>
        ) : filteredActivities.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-500">
            {t("applicant.noRecentActivities", "No recent activities yet.")}
          </p>
        ) : (
          visibleActivities.map((activity) => (
            <div
              key={`${activity.applicationId}-${activity.createdAt}-${activity.title}`}
              className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_160px]"
            >
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-emerald-700">
                    history
                  </span>
                  <p className="truncate text-sm font-semibold text-slate-950">
                    {activity.title}
                  </p>
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-700">
                  {activity.reference}
                </p>
                {activity.description && (
                  <p className="mt-1 text-sm text-slate-500">{activity.description}</p>
                )}
                {activity.remark && (
                  <p className="mt-1 whitespace-pre-line text-sm text-red-800">
                    <span className="font-semibold">{t("common.remarks", "Remarks")}:</span>{" "}
                    {activity.remark}
                  </p>
                )}
              </div>
              <p className="text-sm text-slate-500 sm:text-right">
                {formatCompactDateTime(activity.createdAt)}
              </p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function getActivityRemark(activity) {
  const explicitRemark =
    activity?.remark ||
    activity?.remarks ||
    activity?.metadata?.remark ||
    activity?.metadata?.remarks;
  const cleanedExplicitRemark = cleanRemark(explicitRemark);
  if (cleanedExplicitRemark) return cleanedExplicitRemark;

  const description = String(activity?.description || "");
  const remarkMatch = description.match(/\bRemark:\s*(.+)$/i);
  return cleanRemark(remarkMatch?.[1] || "");
}

function cleanRemark(value) {
  const remark = String(value || "").trim();
  return ["", "-", "[]"].includes(remark) ? "" : remark;
}

function isPaymentReceiptRejected(payment = {}) {
  const status = normalizePaymentValue(payment.status);
  const verificationResult = normalizePaymentValue(payment.verification_result);
  const receiptDecision = normalizePaymentValue(payment.receipt_decision);
  const recommendation = normalizePaymentValue(payment.recommendation);

  if (status === "payment_submitted" || isReceiptSubmissionNewerThanRejection(payment)) {
    return false;
  }

  return (
    status === "receipt_rejected" ||
    ["invalid", "invalid_fake"].includes(verificationResult) ||
    receiptDecision === "reject_receipt" ||
    recommendation === "reject_receipt"
  );
}

function normalizePaymentValue(value) {
  return normalizeStatus(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function isReceiptSubmissionNewerThanRejection(payment = {}) {
  const submittedAt = Date.parse(payment.submitted_at || "");
  const rejectedAt = Date.parse(payment.rejected_at || "");

  return Number.isFinite(submittedAt) && Number.isFinite(rejectedAt) && submittedAt > rejectedAt;
}

function getApplicationPayment(app) {
  return app?.form_data?.payment || app?.payment || {};
}

function getApplicationAppliedDate(app) {
  const rawDate = app?.created_at || app?.submitted_at || app?.updated_at;
  if (!rawDate) return null;

  const date = new Date(rawDate);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getApplicationYearOptions(applications) {
  return Array.from(
    new Set(
      applications
        .map((app) => getApplicationAppliedDate(app)?.getFullYear())
        .filter(Boolean)
    )
  ).sort((a, b) => b - a);
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

function filterDashboardApplications(applications, filters) {
  const {
    search = "",
    status = "all",
    month = "all",
    year = "all",
    language = "en",
    t,
  } = filters;
  const keyword = search.trim().toLowerCase();

  return applications.filter((app) => {
    const appliedDate = getApplicationAppliedDate(app);
    const displayStatus = getApplicantFilterStatus(app);
    const matchesKeyword = !keyword || [
      getApplicationReference(app),
      getProjectName(app, language),
      getApplicationRemark(app),
      translatedStatus(t, displayStatus),
    ]
      .join(" ")
      .toLowerCase()
      .includes(keyword);
    const matchesStatus = status === "all" || displayStatus === status;
    const matchesMonth =
      month === "all" ||
      (appliedDate && String(appliedDate.getMonth() + 1) === month);
    const matchesYear =
      year === "all" ||
      (appliedDate && String(appliedDate.getFullYear()) === year);

    return matchesKeyword && matchesStatus && matchesMonth && matchesYear;
  });
}

function getApplicantFilterStatus(app) {
  const status = normalizeStatus(app?.status);

  if (status === "draft") {
    return "draft";
  }

  if (isPaymentReceiptRejected(getApplicationPayment(app))) {
    return "rejected";
  }

  if (isApprovedApplication(app)) {
    return "approved";
  }

  if (isRejectedApplication(app)) {
    return "rejected";
  }

  if (status === "submitted") {
    return "submitted";
  }

  if (status && status !== "draft") {
    return "under_review";
  }

  return "";
}

function getValidApplicantStatusFilter(value) {
  return value === "all" || APPLICANT_STATUS_FILTER_OPTIONS.includes(value)
    ? value
    : "all";
}

function getStatusFilterOptions(applications, t) {
  return APPLICANT_STATUS_FILTER_OPTIONS.map((status) => ({
      value: status,
      label: translatedStatus(t, status),
    }));
}

function buildOverviewStatusSummary(applications, t) {
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
      key: "under_review",
      label: t("dashboard.underReview", "Under Review"),
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

function getApplicationActivityLog(app) {
  if (Array.isArray(app?.activity_log)) return app.activity_log;
  if (Array.isArray(app?.form_data?.activity_log)) return app.form_data.activity_log;
  return [];
}

function buildRecentActivities(applications, t, currentUser = null) {
  const activities = applications
    .flatMap((app) => {
      const activityLog = getApplicationActivityLog(app);

      return activityLog.filter((activity) => isApplicantOwnActivity(activity, currentUser)).map((activity) => {
        const friendlyCopy = getApplicantActivityCopy(activity, t);
        const activityRemark = getActivityRemark(activity);

        return {
          applicationId: app.id,
          reference: getApplicationReference(app),
          title: friendlyCopy.title,
          description: friendlyCopy.description,
          remark: activityRemark || (isApplicantRejectedActivity(activity) ? getApplicationRemark(app) : ""),
          rawTitle: activity.title || "",
          rawDescription: activity.description || "",
          createdAt: activity.created_at || app.updated_at,
        };
      });
    })
    .filter((activity) => activity.createdAt)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return removeDuplicateSaveActivities(activities);
}

function isApplicantOwnActivity(activity, currentUser) {
  const actorId = activity?.actor_id;
  const userId = currentUser?.id;

  if (actorId !== undefined && actorId !== null && String(actorId) !== "") {
    return userId !== undefined && userId !== null && String(actorId) === String(userId);
  }

  const actorRole = String(activity?.actor_role || "").trim().toLowerCase();
  const category = String(activity?.category || "").trim().toLowerCase();
  const title = String(activity?.title || "").trim().toLowerCase();

  return (
    category === "user" ||
    ["applicant", "user"].includes(actorRole) ||
    title === "application draft created" ||
    title === "application submitted" ||
    title === "application resubmitted" ||
    title === "payment receipt submitted" ||
    title.endsWith(" details saved") ||
    title.endsWith(" uploaded") ||
    title.endsWith(" removed")
  );
}

function filterActivitiesByDate(activities, dateFilter) {
  if (!dateFilter) return activities;

  return activities.filter((activity) => getActivityDateKey(activity.createdAt) === dateFilter);
}

function getActivityDateKey(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isApplicantRejectedActivity(activity) {
  const normalizedTitle = String(activity?.title || "").trim().toLowerCase();
  return normalizedTitle.startsWith("application rejected by") || normalizedTitle === "application rejected";
}

function getApplicantActivityCopy(activity, t) {
  const rawTitle = String(activity?.title || "").trim();
  const rawDescription = String(activity?.description || "").trim();
  const normalizedTitle = rawTitle.toLowerCase();
  const isGenericApplicantDescription =
    rawDescription.toLowerCase() === "the applicant updated this application record.";

  if (normalizedTitle === "application draft created") {
    return {
      title: t("applicant.activityStartedTitle", "You started a new application"),
      description: t("applicant.activityStartedDesc", "Your draft application was created."),
    };
  }

  if (normalizedTitle === "application submitted") {
    return {
      title: t("applicant.activitySubmittedTitle", "You submitted your application"),
      description: t("applicant.activitySubmittedDesc", "Your application was sent to ALiS for review."),
    };
  }

  if (normalizedTitle === "application resubmitted") {
    return {
      title: t("applicant.activityResubmittedTitle", "You resubmitted your application"),
      description: t("applicant.activityResubmittedDesc", "Your updated application was sent back for review."),
    };
  }

  if (normalizedTitle === "payment receipt submitted") {
    return {
      title: t("applicant.activityPaymentTitle", "You submitted your payment receipt"),
      description: t("applicant.activityPaymentDesc", "ALiS will verify the receipt before issuing the e-license."),
    };
  }

  if (
    normalizedTitle === "application reviewed" ||
    normalizedTitle.startsWith("application reviewed by") ||
    rawDescription.toLowerCase().includes("reviewed by")
  ) {
    return {
      title: t("applicant.activityReviewedTitle", "Application status updated"),
      description: t(
        "applicant.activityReviewedDesc",
        "Your application progress was updated in ALiS."
      ),
    };
  }

  if (normalizedTitle.startsWith("application rejected by") || normalizedTitle === "application rejected") {
    return {
      title: t("applicant.activityRejectedTitle", "Application rejected"),
      description: t(
        "applicant.activityRejectedDesc",
        "Your application was rejected. Please review the remark and update your application."
      ),
    };
  }

  if (normalizedTitle === "application details saved") {
    return {
      title: t("applicant.activitySavedTitle", "You saved application details"),
      description: "",
    };
  }

  if (normalizedTitle.endsWith(" details saved")) {
    return {
      title: t("applicant.activitySavedTitle", "You saved application details"),
      description: "",
    };
  }

  if (normalizedTitle.endsWith(" uploaded")) {
    return {
      title: t("applicant.activityDocumentsUpdatedTitle", "You updated supporting documents"),
      description: t(
        "applicant.activityDocumentsUpdatedDesc",
        "Your application documents were updated."
      ),
    };
  }

  if (normalizedTitle.endsWith(" removed")) {
    return {
      title: t("applicant.activityDocumentsUpdatedTitle", "You updated supporting documents"),
      description: t(
        "applicant.activityDocumentsUpdatedDesc",
        "Your application documents were updated."
      ),
    };
  }

  if (containsInternalWorkflowTerm(rawTitle) || containsInternalWorkflowTerm(rawDescription)) {
    return {
      title: t("applicant.activityReviewedTitle", "Application status updated"),
      description: t(
        "applicant.activityReviewedDesc",
        "Your application progress was updated in ALiS."
      ),
    };
  }

  return {
    title: rawTitle || t("applicant.activityGenericTitle", "Application activity"),
    description: isGenericApplicantDescription ? "" : rawDescription,
  };
}

function containsInternalWorkflowTerm(value) {
  return /\b(?:PT|KU|KB)\s*\([^)]+\)|\bTP\s*\(RES\)(?:\/PGH)?|\bMPHLG\b|\bSUT\b|\bIKL\s*\(TECH(?:NICAL)?\)/i.test(
    String(value || "")
  );
}

function removeDuplicateSaveActivities(activities) {
  const seenSaveApplications = new Set();

  return activities.filter((activity) => {
    if (!isSaveActivity(activity)) return true;

    const key = String(activity.applicationId || activity.reference || "");
    if (seenSaveApplications.has(key)) return false;

    seenSaveApplications.add(key);
    return true;
  });
}

function isSaveActivity(activity) {
  return String(activity?.rawTitle || "").toLowerCase().endsWith("details saved");
}

function isPendingApplication(app) {
  const status = normalizeStatus(app.status);

  return Boolean(status) && status !== "draft" && !isApprovedApplication(app) && !isRejectedApplication(app);
}

function isApprovedApplication(app) {
  if (isPaymentReceiptRejected(getApplicationPayment(app))) {
    return false;
  }

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

function isApplicantRecordNew(app, tab, seen = {}) {
  if (!app?.id) return false;

  const map = tab === "license" ? seen.eLicense : seen.status;
  const updatedAt = getRecordUpdatedTime(app);

  return updatedAt > Number(map?.[app.id] || 0);
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

function isImageReceipt(receipt, source = "") {
  const mimeType = String(
    receipt?.type || receipt?.mime_type || receipt?.content_type || ""
  ).toLowerCase();
  if (mimeType.startsWith("image/")) return true;
  if (source.startsWith("data:image/")) return true;

  const filename = String(receipt?.name || receipt?.filename || source)
    .split("?")[0]
    .toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(filename);
}

function buildApplicantReceiptPrintHtml(receipt, url, title) {
  const filename = receipt?.name || title;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: auto; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; color: #111827; background: #f8fafc; }
    .page { min-height: calc(100vh - 24mm); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; background: #fff; }
    .title { margin: 0; font-size: 14px; font-weight: 700; text-align: center; }
    img { max-width: 100%; max-height: calc(100vh - 44mm); object-fit: contain; }
    @media print {
      body { background: #fff; }
      .page { min-height: auto; }
      .title { display: none; }
    }
  </style>
</head>
<body>
  <main class="page">
    <p class="title">${escapeHtml(filename)}</p>
    <img src="${escapeHtml(url)}" alt="${escapeHtml(filename)}" />
  </main>
</body>
</html>`;
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

    window.open(url, "_blank");

    if (!isInlineFile) {
      window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
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

  const previewUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const preview = window.open(previewUrl, "_blank");
  if (!preview) {
    URL.revokeObjectURL(previewUrl);
    return;
  }

  window.setTimeout(() => URL.revokeObjectURL(previewUrl), 5 * 60 * 1000);
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

async function downloadApplicantAdvertisementLicenseDocument(app, t) {
  const html = getApplicantAdvertisementLicenseDocumentHtml(app);
  if (!html) {
    window.alert(t("workspace.payment.documentViewFailed", "Unable to open the document. Please try again."));
    return;
  }

  try {
    await printHtmlDocument(
      html,
      `${getApplicationReference(app)} ${t("workspace.license.documentTitle", "Advertisement License")}`
    );
  } catch (err) {
    console.error("Failed to download advertisement license:", err);
    window.alert(t("workspace.payment.documentViewFailed", "Unable to open the document. Please try again."));
  }
}

function getApplicantAdvertisementLicenseDocumentHtml(app) {
  const manualLicense = app?.form_data?.license?.manual_license || {};
  return String(manualLicense.document_html || "").trim();
}

function getApplicantManualPaymentDocumentHtml(app, type, t) {
  const approvalLetter = app?.form_data?.approval_letter || {};
  const manualLetter = approvalLetter.manual_letter || {};
  const manualBill = approvalLetter.manual_bill || {};
  const manualReceipt = approvalLetter.manual_receipt || {};

  if (type === "letter" && manualLetter.document_html) {
    return manualLetter.document_html;
  }

  if (type === "receipt") {
    if (manualReceipt.document_html) return manualReceipt.document_html;
    return buildApplicantManualOfficialReceiptHtml(app, t, manualLetter, manualBill, manualReceipt);
  }

  if (type === "bill" && manualBill.document_html) {
    return manualBill.document_html;
  }

  return type === "bill"
    ? buildApplicantManualBillHtml(app, t, manualLetter, manualBill)
    : buildApplicantManualLetterHtml(app, t, manualLetter, manualBill);
}

function getSentOfficialReceiptFile(app) {
  const file = app?.form_data?.approval_letter?.official_receipt_file || null;
  if (!getPaymentDocumentSource(file)) return null;

  const status = normalizeStatus(app?.status);
  if (
    file.sent_at ||
    file.status === "Sent to Applicant" ||
    ["payment_verified", "license_issued", "license_revoked"].includes(status)
  ) {
    return file;
  }

  return null;
}

function getLicenseVerificationUrl(licenseId) {
  const runtimeOrigin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "";
  const configuredOrigin = String(import.meta.env.VITE_FRONTEND_URL || "").replace(/\/+$/, "");
  let origin = runtimeOrigin;

  try {
    const runtimeHost = new URL(runtimeOrigin).hostname.toLowerCase();
    if (["localhost", "127.0.0.1", "0.0.0.0"].includes(runtimeHost)) {
      origin = configuredOrigin || runtimeOrigin;
    }
  } catch {
    origin = configuredOrigin || runtimeOrigin;
  }

  return `${origin}/license/verify/${encodeURIComponent(licenseId)}`;
}

async function printHtmlDocument(html, title) {
  const originalTitle = document.title;
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
  document.title = title;

  await waitForDocumentImages(frameDocument);
  await new Promise((resolve) => setTimeout(resolve, 250));

  const cleanup = () => {
    document.title = originalTitle;
    setTimeout(() => iframe.remove(), 500);
  };
  frameWindow.addEventListener("afterprint", cleanup, { once: true });
  setTimeout(cleanup, 120000);

  frameWindow.focus();
  frameWindow.print();
}

async function printUrlDocument(url, title) {
  const originalTitle = document.title;
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.setAttribute("aria-hidden", "true");

  const cleanup = () => {
    document.title = originalTitle;
    setTimeout(() => iframe.remove(), 500);
  };

  document.body.appendChild(iframe);
  document.title = title;

  await new Promise((resolve, reject) => {
    iframe.onload = resolve;
    iframe.onerror = reject;
    iframe.src = url;
  });
  await new Promise((resolve) => setTimeout(resolve, 500));

  const frameWindow = iframe.contentWindow;
  if (!frameWindow) {
    cleanup();
    throw new Error("Unable to prepare print document.");
  }

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

function getQrSvgBlob(qrContainer) {
  const svg = qrContainer?.querySelector("svg");
  if (!svg) return null;

  const clone = svg.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return new Blob([new XMLSerializer().serializeToString(clone)], {
    type: "image/svg+xml;charset=utf-8",
  });
}

async function downloadApplicantQrCode(qrContainer, licenseId) {
  const blob = getQrSvgBlob(qrContainer);
  if (!blob) return;

  const sourceUrl = URL.createObjectURL(blob);

  try {
    const image = new Image();
    image.src = sourceUrl;
    await image.decode();

    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 720;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!pngBlob) return;

    const downloadUrl = URL.createObjectURL(pngBlob);
    triggerDownload(downloadUrl, `${licenseId || "e-license"}-qr.png`);
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 60000);
  } catch (err) {
    console.error("Failed to download QR code:", err);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
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
  return (
    ["incomplete", "rejected"].includes(normalizeStatus(app.status)) ||
    isPaymentReceiptRejected(getApplicationPayment(app))
  );
}

function hasPendingLicenseRevocationRequest(app) {
  const request = app?.license_revocation_request || app?.form_data?.license_revocation_request || {};
  return normalizeStatus(request.status) === "pending";
}

function getPaymentHint(app, t) {
  const status = normalizeStatus(app?.status);
  const payment = getApplicationPayment(app);

  if (status === "draft") return t("applicant.paymentHintDraft");
  if (status === "rejected") return t("applicant.paymentHintRejected");
  if (isPaymentReceiptRejected(payment)) {
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
  const payment = getApplicationPayment(app);

  if (isPaymentReceiptRejected(payment)) {
    return t("applicant.paymentStatusReceiptRejected");
  }
  if (status === "invoice_generated") return t("applicant.paymentStatusProceed");
  if (status === "payment_submitted") return t("applicant.paymentStatusSubmitted");
  if (status === "payment_verified") return t("applicant.paymentStatusVerified");
  if (status === "license_issued") return t("applicant.paymentStatusCompleted");
  return t("applicant.paymentStatusPending");
}

function getDashboardHeader(activeSection, t, options = {}) {
  if (activeSection === "applications") {
    return {
      title: t("applicant.applicationsSectionTitle"),
      description: t("applicant.applicationsSectionDescription"),
      descriptionClassName: "max-w-none lg:whitespace-nowrap",
    };
  }

  if (activeSection === "status") {
    if (options.hideStatusDetailHeader) return null;

    return {
      title: t("applicant.statusSectionTitle"),
      description: t("applicant.statusTrackingDescription"),
    };
  }

  return {
    title: t("applicant.dashboardHeaderTitle"),
    description: t("applicant.dashboardHeaderDescription"),
  };
}

export default UserDashboard;
