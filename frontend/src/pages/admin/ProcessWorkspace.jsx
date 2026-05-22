import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import AdminDashboardLayout from "../../layout/AdminDashboardLayout";
import { useLanguage } from "../../context/LanguageContext";
import SimpleWysiwygEditor from "../../components/SimpleWysiwygEditor";
import {
  apiRequest,
  deleteApplicationDocument,
  fetchAuthenticatedBlob,
  getApplicationDocumentUrl,
  getStoredUser,
  uploadApplicationDocument,
} from "../../services/api";
import { enrichApplicationListApplicantNames } from "../../utils/applicationList";
import {
  Alert,
  ApplicationSummary,
  Button,
  DataTable,
  Field,
  Icon,
  Info,
  PageHeader,
  Panel,
  StatCard,
  StatusPill,
} from "../../components/ui/SystemUI";
import {
  formatCompactDateTime,
  formatCurrency,
  formatDate,
  formatDateTime,
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

const TECHNICAL_DEPARTMENTS = ["BLG", "GPM", "MNE", "IMT", "LNP", "ENG"];
const IKL_TASK_DEPARTMENTS = ["PT(IKL)", "KU(IKL)", "IKL (TECHNICAL)"];
const IKL_DEPARTMENT_STATUS_SCOPE = {
  "PT(IKL)": ["submitted", "incomplete"],
  "KU(IKL)": ["ku_ikl_review", "technical_review_completed"],
  "IKL (TECHNICAL)": ["technical_review", "technical_site_visit", "technical_amendment"],
};
const TECHNICAL_DEPARTMENT_TASK_STATUSES = [
  "technical_review",
  "technical_site_visit",
];
const TECHNICAL_REVIEW_STATUSES = new Set([
  ...TECHNICAL_DEPARTMENT_TASK_STATUSES,
  "technical_review_completed",
]);
const APPROVAL_SUPPORT_DEPARTMENTS = ["TP(RES)", "PGH", "TP(RES)/PGH", "TP/PGH"];
const MPHLG_REVIEW_DEPARTMENTS = ["MPHLG"];
const SUT_APPROVAL_DEPARTMENTS = ["SUT"];
const LICENSE_EXPIRY_YEAR_OPTIONS = [1, 2, 3, 4, 5];
const PUBLIC_FRONTEND_URL = String(import.meta.env.VITE_FRONTEND_URL || "").replace(/\/+$/, "");
const TECHNICAL_FEE_OPTIONS = [
  { value: "yuran_gegantung", label: "Yuran Gegantung", accountCode: "01080600*01*15" },
  { value: "yuran_kain_rentang", label: "Yuran Kain Rentang", accountCode: "01080600*01*15" },
  { value: "yuran_giant_banner", label: "Yuran Giant Banner", accountCode: "01080600*01*15" },
  { value: "yuran_billboard", label: "Yuran Billboard", accountCode: "01080600*01*15" },
  { value: "yuran_lesen_iklan_renewal", label: "Yuran Lesen Iklan (RENEWAL)", accountCode: "01080600*01*15" },
  { value: "yuran_lesen_iklan_prepayment", label: "Yuran Lesen Iklan - Prepayment", accountCode: "45010103*01*15" },
  { value: "yuran_tandanama_perniagaan", label: "Yuran Tandanama Perniagaan", accountCode: "01080600*01*15" },
  { value: "yuran_pelekat", label: "Yuran Pelekat (RM2.00 X)", accountCode: "01080600*01*15" },
  { value: "deposit_gegantung", label: "Deposit Gegantung", accountCode: "71040002*01*AM" },
  { value: "deposit_kain_rentang", label: "Deposit Kain Rentang", accountCode: "71040002*01*AM" },
  { value: "deposit_giant_banner", label: "Deposit Giant Banner", accountCode: "71040002*01*AM" },
  { value: "deposit_billboard", label: "Deposit Billboard", accountCode: "71040002*01*AM" },
  { value: "yuran_pemprosesan_lesen", label: "Yuran Pemprosesan Lesen (RM10.00)", accountCode: "01031700*01*15" },
  { value: "sewa_pagar", label: "Sewa Pagar (RM15.00)", accountCode: "01080600*01*15" },
];
const KU_TECHNICAL_CHECK_KEYS = [
  "application",
  "sitePhoto",
  "fees",
  "departments",
];

function ProcessWorkspace({ type }) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const config = configs[type];
  const userDepartment = normalizeDepartmentCode(getStoredUser()?.department);

  if (!canAccessWorkspace(config, userDepartment)) {
    return <AdminDashboardLayout />;
  }

  return (
    <ProcessWorkspaceContent
      config={config}
      navigate={navigate}
      t={t}
      userDepartment={userDepartment}
    />
  );
}

function ProcessWorkspaceContent({ config, navigate, t, userDepartment }) {
  const location = useLocation();
  const querySelectedId = new URLSearchParams(location.search).get("id") || "";
  const [applications, setApplications] = useState([]);
  const [selectedId, setSelectedId] = useState(querySelectedId);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [decision, setDecision] = useState(config.defaultDecision || "");
  const [comment, setComment] = useState("");
  const [licenseExpiryYears, setLicenseExpiryYears] = useState("1");
  const [memoDraft, setMemoDraft] = useState("");
  const [pendingMemoSubmission, setPendingMemoSubmission] = useState(null);
  const [technicalSite, setTechnicalSite] = useState({
    site_photos: [],
    fee_date: "",
    fee_items: [createTechnicalFeeItem()],
    license_fee_calculation: "",
    deposit_calculation: "",
    site_remarks: "",
  });

  useEffect(() => {
    fetchApplications();
  }, []);

  useEffect(() => {
    if (querySelectedId) setSelectedId(querySelectedId);
  }, [querySelectedId]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedDetail(null);
      return;
    }

    let active = true;

    async function fetchSelectedDetail() {
      try {
        setDetailLoading(true);
        const detail = await apiRequest(`/applications/${selectedId}/`);
        if (active) setSelectedDetail(detail);
      } catch (err) {
        if (active) {
          setSelectedDetail(null);
          setError(err.message || "Failed to load selected application details.");
        }
      } finally {
        if (active) setDetailLoading(false);
      }
    }

    fetchSelectedDetail();

    return () => {
      active = false;
    };
  }, [selectedId]);

  useEffect(() => {
    const saved = selectedDetail?.form_data?.technical_site_visit || {};
    const savedPhotos = Array.isArray(saved.site_photos)
      ? saved.site_photos
      : saved.site_photo
        ? [saved.site_photo]
        : [];
    const currentPhotos = getCurrentTechnicalSitePhotos(savedPhotos, selectedDetail);
    const feeItems = normalizeTechnicalFeeItems(saved.fee_items);
    const feeTotals = getTechnicalFeeTotals(feeItems);
    setTechnicalSite({
      site_photos: currentPhotos,
      fee_date: saved.fee_date || new Date().toISOString().slice(0, 10),
      fee_items: feeItems,
      fee_total: saved.fee_total || feeTotals.grandTotal || "",
      license_fee_calculation: saved.license_fee_calculation || (feeTotals.feeTotal ? String(feeTotals.feeTotal) : ""),
      deposit_calculation: saved.deposit_calculation || (feeTotals.depositTotal ? String(feeTotals.depositTotal) : ""),
      site_remarks: saved.site_remarks || saved.site_photo_note || "",
    });
  }, [selectedDetail?.id, selectedDetail?.updated_at]);

  async function fetchApplications({ silent = false } = {}) {
    try {
      if (!silent) setLoading(true);
      setError("");
      const data = await apiRequest("/applications/");
      const list = Array.isArray(data) ? data : data?.results || [];
      const enrichedList = await enrichApplicationListApplicantNames(list, (id) =>
        apiRequest(`/applications/${id}/`)
      );
      setApplications(enrichedList);
      if (!isTableFirstWorkspace(config) && !selectedId && list.length > 0) {
        setSelectedId(String(list[0].id));
      }
    } catch (err) {
      setError(err.message || "Failed to load applications.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function refreshWorkspaceData() {
      if (!active) return;

      try {
        await fetchApplications({ silent: true });

        if (selectedId) {
          const detail = await apiRequest(`/applications/${selectedId}/`);
          if (active) setSelectedDetail(detail);
        }
      } catch {
        // Keep the current screen stable during background refresh.
      }
    }

    window.addEventListener("fastrack:applications-changed", refreshWorkspaceData);
    const interval = window.setInterval(refreshWorkspaceData, 15000);

    return () => {
      active = false;
      window.removeEventListener("fastrack:applications-changed", refreshWorkspaceData);
      window.clearInterval(interval);
    };
  }, [selectedId]);

  const isIklWorkspace = config.key === "screening";
  const isDepartmentTechnicalWorkspace = config.key === "technical";
  const isApprovalWorkspace = config.key === "approval";
  const isSimpleApprovalWorkspace = isApprovalWorkspace;
  const tableFirstWorkspace = isTableFirstWorkspace(config);
  const isELicenseWorkspace = isELicenseTableWorkspace(config);
  const isApprovalViewOnlyWorkspace =
    isApprovalWorkspace && !isApprovalActionDepartment(userDepartment);
  const isFocusedPersonalWorkspace =
    isIklWorkspace || isDepartmentTechnicalWorkspace;
  const showSiteVisitFields =
    config.showTechnicalSiteVisit && !isDepartmentTechnicalWorkspace;
  const showBottomFormButton = !isFocusedPersonalWorkspace && !tableFirstWorkspace;
  const actionGridClass = isDepartmentTechnicalWorkspace
    ? "flex justify-end gap-2 pt-1"
    : isFocusedPersonalWorkspace
      ? "grid grid-cols-1 gap-2 pt-1"
      : tableFirstWorkspace
      ? "flex justify-end gap-2 pt-1"
      : "grid grid-cols-1 gap-2 pt-1 sm:grid-cols-3";

  const statusScopedApplications = useMemo(() => {
    const statusScope = getWorkspaceStatusScope(config, userDepartment);
    return applications.filter((app) => {
      const normalizedStatus = normalizeStatus(app.status);
      const isInStatusScope =
        statusScope.length === 0 || statusScope.includes(normalizedStatus);
      const isInDepartmentScope =
        !isDepartmentTechnicalWorkspace ||
        !hasTechnicalDepartmentReview(app, userDepartment);
      const isInApprovalScope =
        !isApprovalWorkspace ||
        isApprovalTaskForDepartment(app, userDepartment);

      return isInStatusScope && isInDepartmentScope && isInApprovalScope;
    });
  }, [applications, config, isApprovalWorkspace, isDepartmentTechnicalWorkspace, userDepartment]);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return statusScopedApplications.filter((app) => {
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
  }, [keyword, statusScopedApplications]);

  useEffect(() => {
    if (filtered.length === 0) return;
    const hasSelected = filtered.some((app) => String(app.id) === String(selectedId));

    if (tableFirstWorkspace && !selectedId) {
      return;
    }

    if (tableFirstWorkspace && selectedId && !hasSelected) {
      setSelectedId("");
      return;
    }

    if (!hasSelected) {
      setSelectedId(String(filtered[0].id));
    }
  }, [filtered, tableFirstWorkspace, selectedId]);

  const selected = useMemo(() => {
    const matchingRecord = filtered.find((app) => String(app.id) === String(selectedId));
    if (tableFirstWorkspace && !selectedId) return null;
    return matchingRecord || filtered[0] || null;
  }, [filtered, tableFirstWorkspace, selectedId]);
  const selectedRecord =
    selectedDetail && String(selectedDetail.id) === String(selected?.id)
      ? { ...selected, ...selectedDetail }
      : selected;
  const approvalStageKey = isApprovalWorkspace ? getApprovalStageKey(selectedRecord) : "";
  const isApprovalSupportWorkspace =
    isApprovalWorkspace &&
    approvalStageKey === "support" &&
    APPROVAL_SUPPORT_DEPARTMENTS.includes(userDepartment);
  const isMphlgApprovalWorkspace =
    isApprovalWorkspace &&
    approvalStageKey === "mphlg" &&
    MPHLG_REVIEW_DEPARTMENTS.includes(userDepartment);
  const isSutApprovalWorkspace =
    isApprovalWorkspace &&
    approvalStageKey === "sut" &&
    SUT_APPROVAL_DEPARTMENTS.includes(userDepartment);
  const showApprovalDecisionButtons =
    isMphlgApprovalWorkspace || isSutApprovalWorkspace;
  const decisionOptions = getWorkspaceDecisionOptions(config, selectedRecord, userDepartment);
  const workspaceActions = getWorkspaceActions(config, selectedRecord, userDepartment);
  const canSubmitWorkspaceAction = isIklWorkspace || workspaceActions.length > 0;
  const canChooseLicenseExpiry =
    config.key === "license" &&
    normalizeStatus(selectedRecord?.status) === "payment_verified" &&
    workspaceActions.some((action) => action.key === "issue_license");
  const tableRowsHaveActions = useMemo(
    () =>
      tableFirstWorkspace &&
      filtered.some((app) => canOpenWorkspaceRow(config, app, userDepartment)),
    [config, filtered, tableFirstWorkspace, userDepartment]
  );
  const showActionPanel =
    !isApprovalViewOnlyWorkspace &&
    (!tableFirstWorkspace || (Boolean(selectedRecord) && canSubmitWorkspaceAction));
  const actionUnavailableMessage = getActionUnavailableMessage(
    config,
    selectedRecord,
    userDepartment
  );

  const stats = useMemo(
    () => config.stats(statusScopedApplications, userDepartment),
    [config, statusScopedApplications, userDepartment]
  );

  useEffect(() => {
    const nextDecision = getDefaultWorkspaceDecision(config, selectedRecord, userDepartment);
    if (nextDecision) setDecision(nextDecision);
    setLicenseExpiryYears("1");
  }, [approvalStageKey, config, selectedRecord?.id, userDepartment]);

  function submitApprovalSupport(decisionValue) {
    const [action] = workspaceActions;
    if (!action) return;

    submitAction(action, { decision: decisionValue, checkDecisionRemark: true });
  }

  function submitApprovalDecisionButton(decisionValue) {
    const [action] = workspaceActions;
    if (!action) return;

    if (decisionValue === "Reject") {
      setError("");
      setSuccess(
        t(
          "workspace.message.rejectRoutingPending",
          "Reject routing to DBKU is not configured yet. No changes were saved."
        )
      );
      return;
    }

    submitAction(action, { decision: decisionValue, checkDecisionRemark: false });
  }

  function isKbLesVerifyAction(action, actionDecision) {
    return (
      config.key === "approval" &&
      userDepartment === "KB(LES)" &&
      getApprovalStageKey(selectedRecord) === "kb" &&
      action?.buildPayload === buildApprovalWorkflowPayload &&
      actionDecision === "Verify"
    );
  }

  async function submitAction(action, overrides = {}) {
    if (!selectedRecord?.id) {
      setError("Please select an application first.");
      return;
    }

    const actionDecision = overrides.decision || action.decision || decision;
    const cleanedComment = cleanRemark(overrides.comment ?? comment);
    const requiresDecisionRemark =
      (overrides.checkDecisionRemark ?? config.showComment) &&
      /reject|amendment|condition|not supported/i.test(String(actionDecision || ""));

    if ((action.requiresComment || requiresDecisionRemark) && !cleanedComment) {
      setError("Please enter notes or comments first.");
      return;
    }

    if (action.requiresReceipt && !selectedRecord.form_data?.payment?.receipt_file) {
      setError("Please wait for the applicant to upload a payment receipt first.");
      return;
    }

    if (action.requiresSubmittedReceipt && normalizeStatus(selectedRecord.status) !== "payment_submitted") {
      setError("Receipt verification is available after the applicant submits a receipt.");
      return;
    }

    if (isKbLesVerifyAction(action, actionDecision) && !overrides.memoHtml) {
      setError("");
      setSuccess("");
      setMemoDraft(createKbLesMemoTemplate(selectedRecord, technicalSite));
      setPendingMemoSubmission({ action, overrides: { ...overrides, decision: actionDecision } });
      return false;
    }

    if (isKbLesVerifyAction(action, actionDecision) && !getHtmlPlainText(overrides.memoHtml)) {
      setError(t("workspace.memo.required", "Please complete the memo before sending."));
      return false;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");
      const current = selectedRecord;
      const body = action.buildPayload(current, {
        decision: actionDecision,
        comment: cleanedComment,
        technicalSite,
        department: userDepartment,
        licenseExpiryYears: Number(licenseExpiryYears) || 1,
        memoHtml: overrides.memoHtml || "",
      });

      const requestPath =
        action.endpoint === "license-renewal-action"
          ? `/applications/${selectedRecord.id}/license-renewal-action/`
          : `/applications/${selectedRecord.id}/`;
      const requestMethod = action.endpoint === "license-renewal-action" ? "POST" : "PATCH";

      const response = await apiRequest(requestPath, {
        method: requestMethod,
        body: JSON.stringify(body),
      });

      setSuccess(t(action.successKey, action.success));
      setComment("");
      await fetchApplications();
      if (isFocusedPersonalWorkspace) {
        navigate("/dashboard/admin?view=personal");
        return true;
      }

      const refreshed =
        response?.data || (await apiRequest(`/applications/${selectedRecord.id}/`));
      setSelectedDetail(refreshed);
      return true;
    } catch (err) {
      setError(err.message || action.error || "Action failed.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function closeMemoModal() {
    if (saving) return;
    setPendingMemoSubmission(null);
    setMemoDraft("");
  }

  async function sendMemoSubmission() {
    if (!pendingMemoSubmission) return;
    if (!getHtmlPlainText(memoDraft)) {
      setError(t("workspace.memo.required", "Please complete the memo before sending."));
      return;
    }

    const { action, overrides } = pendingMemoSubmission;
    const submitted = await submitAction(action, {
      ...overrides,
      memoHtml: memoDraft,
    });
    if (!submitted) return;

    setPendingMemoSubmission(null);
    setMemoDraft("");
    returnToTaskList();
  }

  function openSelectedTask(app) {
    if (!app?.id) return;

    setSelectedId(String(app.id));
    const params = new URLSearchParams(location.search);
    params.set("id", app.id);
    navigate(`${location.pathname}?${params.toString()}`);
  }

  function returnToTaskList() {
    setSelectedId("");
    setSelectedDetail(null);
    const params = new URLSearchParams(location.search);
    params.delete("id");
    const search = params.toString();
    navigate(search ? `${location.pathname}?${search}` : location.pathname);
  }

  function returnToPersonalTask() {
    navigate("/dashboard/admin?view=personal");
  }

  function getSelectedActionPanelPath(applicationId) {
    const params = new URLSearchParams(location.search);
    params.set("id", applicationId);

    if (config.key === "approval" && location.pathname === "/dashboard/admin") {
      params.set("view", "approval");
    }

    return `${location.pathname}?${params.toString()}`;
  }

  function getSelectedFormViewPath(applicationId) {
    const params = new URLSearchParams();
    params.set("id", applicationId);
    params.set("from", "action-panel");
    params.set("returnTo", getSelectedActionPanelPath(applicationId));

    return `/admin/applications/${applicationId}/view/step-1?${params.toString()}`;
  }

  return (
    <AdminDashboardLayout>
      {!isFocusedPersonalWorkspace && !tableFirstWorkspace && (
        <PageHeader
          eyebrow={t(config.eyebrowKey, config.eyebrow)}
          title={t(config.titleKey, config.title)}
          description={t(config.descriptionKey, config.description)}
          actions={
            <Button
              type="button"
              variant="secondary"
              icon="arrow_back"
              onClick={() => navigate("/dashboard/admin")}
            >
              {t("workspace.backToDashboard")}
            </Button>
          }
        />
      )}

      {isELicenseWorkspace && !showActionPanel && (
        <PageHeader
          eyebrow={t(config.listEyebrowKey, config.listEyebrow)}
          title={t(config.listTitleKey, config.listTitle)}
          description={t(config.listDescriptionKey, config.listDescription)}
        />
      )}

      <Alert message={error} />
      <Alert type="success" message={success} />

      {!isFocusedPersonalWorkspace && !tableFirstWorkspace && (
        <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          {stats.map((item) => (
            <StatCard key={item.labelKey || item.label} {...item} label={t(item.labelKey, item.label)} />
          ))}
        </section>
      )}

      <section
        className={
          isFocusedPersonalWorkspace
            ? "mb-6 space-y-6"
            : tableFirstWorkspace
              ? "mb-6 space-y-6"
            : "mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3"
        }
      >
        {!isFocusedPersonalWorkspace && !(tableFirstWorkspace && showActionPanel) && (
          <Panel
            title={isSimpleApprovalWorkspace ? t("admin.dashboard.awaitingApproval", "Awaiting Approval") : t(config.queueTitleKey, config.queueTitle)}
            description={isSimpleApprovalWorkspace ? "" : t("workspace.queue.instructions")}
            className={tableFirstWorkspace ? "" : "xl:col-span-2"}
          >
            {statusScopedApplications.length > 0 && (
              <div className="mb-4">
                <Field label={t("common.search")}>
                  <input
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    className="form-input"
                    placeholder={t("workspace.search.placeholder")}
                  />
                </Field>
              </div>
            )}

            <DataTable
              loading={loading}
              rows={filtered}
              emptyText={t("workspace.empty")}
              columns={[
                {
                  key: "reference",
                  label: t("common.reference"),
                  render: (app) => {
                    const canOpenRow =
                      !isELicenseWorkspace || canOpenWorkspaceRow(config, app, userDepartment);

                    return isApprovalViewOnlyWorkspace || !canOpenRow ? (
                      <span className="font-semibold text-slate-900">
                        {getApplicationReference(app)}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          tableFirstWorkspace
                            ? openSelectedTask(app)
                            : setSelectedId(String(app.id))
                        }
                        className="font-semibold text-emerald-700 hover:underline"
                      >
                      {getApplicationReference(app)}
                      </button>
                    );
                  },
                },
                { key: "applicant", label: t("common.applicant"), render: getApplicantName },
                { key: "project", label: t("common.project"), render: getProjectName },
                {
                  key: "status",
                  label: t("common.status"),
                  render: (app) => (
                    <StatusPill value={getWorkspaceStatusLabel(app, config, t, userDepartment)} />
                  ),
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
                ...(tableRowsHaveActions
                  ? [
                      {
                        key: "action",
                        label: t("common.action"),
                        render: (app) =>
                          canOpenWorkspaceRow(config, app, userDepartment) ? (
                            <Button
                              type="button"
                              variant="secondary"
                              icon="open_in_new"
                              className="min-h-8 px-3 py-1 text-xs"
                              onClick={() => openSelectedTask(app)}
                            >
                              {t("common.open", "Open")}
                            </Button>
                          ) : null,
                      },
                    ]
                  : []),
              ]}
            />
          </Panel>
        )}

        {isFocusedPersonalWorkspace && showActionPanel && (
          <div className="flex justify-start">
            <Button
              type="button"
              variant="secondary"
              icon="arrow_back"
              onClick={returnToPersonalTask}
            >
              {t("workspace.backToPersonalTask", "Back to Personal Task")}
            </Button>
          </div>
        )}

        {tableFirstWorkspace && showActionPanel && (
          <div className="flex justify-start">
            <Button
              type="button"
              variant="secondary"
              icon="arrow_back"
              onClick={returnToTaskList}
            >
              {isSimpleApprovalWorkspace
                ? t("workspace.backToAwaitingApproval", "Back to Awaiting Approval")
                : t("workspace.backToELicenseList", "Back to E-Licenses List")}
            </Button>
          </div>
        )}

        {showActionPanel && (
          <Panel
            title={t("workspace.actionPanel")}
            description={getWorkspaceActionDescription(config, t, userDepartment)}
          >
            {!selectedRecord ? (
              <p className="text-sm text-slate-500">{t("workspace.selectApplication")}</p>
            ) : (
              <div className="space-y-4">
              <ApplicationSummary
                app={selectedRecord}
                labels={{
                  selectedApplication: t("workspace.selectedApplication"),
                  defaultTitle: t("workspace.defaultApplicationTitle"),
                  applicant: t("common.applicant"),
                  type: t("common.type"),
                  status: t("common.status"),
                  location: t("workspace.location"),
                  created: t("workspace.created"),
                  updated: t("common.updated"),
                }}
                statusLabel={getWorkspaceStatusLabel(selectedRecord, config, t, userDepartment)}
                applicationType={getLocalizedApplicationType(selectedRecord, t)}
                actions={
                  isFocusedPersonalWorkspace || tableFirstWorkspace ? (
                    <Button
                      variant="secondary"
                      icon="visibility"
                      onClick={() =>
                        navigate(
                          isFocusedPersonalWorkspace || tableFirstWorkspace
                            ? getSelectedFormViewPath(selectedRecord.id)
                            : `/admin/applications/${selectedRecord.id}`
                        )
                      }
                    >
                      {t("workspace.openForm")}
                    </Button>
                  ) : null
                }
              />

              {isSimpleApprovalWorkspace &&
                shouldShowApprovalTechnicalReport(userDepartment, selectedRecord) && (
                <ApprovalTechnicalReviewSummary
                  t={t}
                  selectedRecord={selectedRecord}
                  technicalSite={technicalSite}
                  userDepartment={userDepartment}
                />
              )}

              {isIklWorkspace ? (
                <IklWorkspaceSections
                  key={selectedRecord.id}
                  t={t}
                  config={config}
                  selectedRecord={selectedRecord}
                  decision={decision}
                  setDecision={setDecision}
                  comment={comment}
                  setComment={setComment}
                  technicalSite={technicalSite}
                  setTechnicalSite={setTechnicalSite}
                  saving={saving}
                  submitAction={submitAction}
                  userDepartment={userDepartment}
                />
              ) : (
                <>
                  {config.showDecision &&
                    canSubmitWorkspaceAction &&
                    !isApprovalSupportWorkspace &&
                    !showApprovalDecisionButtons && (
                    <Field label={t(config.decisionLabelKey || "common.decision", config.decisionLabel || "Decision")}>
                      <select
                        value={decision}
                        onChange={(event) => setDecision(event.target.value)}
                        className={`form-input ${tableFirstWorkspace || isDepartmentTechnicalWorkspace ? "max-w-xs" : ""}`}
                      >
                        {decisionOptions.map((item) => (
                          <option key={item.value || item} value={item.value || item}>
                            {t(item.labelKey, item.label || item)}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}

                  {config.showComment && canSubmitWorkspaceAction && (
                    <Field label={t(config.commentLabelKey, config.commentLabel || "Notes")}>
                      <textarea
                        value={comment}
                        onChange={(event) => setComment(event.target.value)}
                        rows="5"
                        className="form-input"
                        placeholder={t(config.commentPlaceholderKey, config.commentPlaceholder || "Enter notes")}
                      />
                    </Field>
                  )}

                  {showSiteVisitFields && (
                    <TechnicalSiteVisitFields
                      t={t}
                      applicationId={selectedRecord.id}
                      value={technicalSite}
                      onChange={setTechnicalSite}
                      onFileChange={async (files) => {
                        const fileList = Array.from(files || []);
                        if (fileList.length === 0) return;
                        const sitePhotos = await Promise.all(
                          fileList.map((file) =>
                            uploadApplicationDocument(
                              selectedRecord.id,
                              "Technical Site Photo",
                              file
                            )
                          )
                        );
                        setTechnicalSite((prev) => ({
                          ...prev,
                          site_photos: [...(prev.site_photos || []), ...sitePhotos],
                        }));
                      }}
                    />
                  )}

                  {detailLoading ? (
                    <p className="text-sm text-slate-500">{t("common.loadingSelectedApplication")}</p>
                  ) : (
                    config.details && (
                      <config.details
                        app={selectedRecord}
                        t={t}
                        canChooseLicenseExpiry={canChooseLicenseExpiry}
                        licenseExpiryYears={licenseExpiryYears}
                        setLicenseExpiryYears={setLicenseExpiryYears}
                      />
                    )
                  )}

                  {actionUnavailableMessage && (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      {actionUnavailableMessage}
                    </p>
                  )}

                  <div className={actionGridClass}>
                    {showBottomFormButton && (
                      <Button
                        variant="secondary"
                        className="w-full"
                        onClick={() => navigate(`/admin/applications/${selectedRecord.id}`)}
                      >
                        {t("workspace.openForm")}
                      </Button>
                    )}
                    {isApprovalSupportWorkspace ? (
                      <>
                        <Button
                          onClick={() => submitApprovalSupport("Reject")}
                          disabled={saving}
                          variant="danger"
                          icon="cancel"
                          className="min-w-40"
                        >
                          {t("workspace.decision.reject", "Reject")}
                        </Button>
                        <Button
                          onClick={() => submitApprovalSupport("Approve")}
                          disabled={saving}
                          variant="primary"
                          icon="check_circle"
                          className="min-w-40"
                        >
                          {saving ? t("workspace.saving") : t("workspace.decision.approve", "Approve")}
                        </Button>
                      </>
                    ) : showApprovalDecisionButtons ? (
                      <>
                        <Button
                          onClick={() => submitApprovalDecisionButton("Reject")}
                          disabled={saving}
                          variant="danger"
                          icon="cancel"
                          className="min-w-40"
                        >
                          {t("workspace.decision.reject", "Reject")}
                        </Button>
                        <Button
                          onClick={() => submitApprovalDecisionButton("Approve")}
                          disabled={saving}
                          variant="primary"
                          icon="check_circle"
                          className="min-w-40"
                        >
                          {saving ? t("workspace.saving") : t("workspace.decision.approve", "Approve")}
                        </Button>
                      </>
                    ) : (
                      workspaceActions.map((action) => (
                        <Button
                          key={action.label}
                          onClick={() => submitAction(action)}
                          disabled={saving}
                          variant={action.variant || "primary"}
                          icon={action.icon}
                          className={tableFirstWorkspace || isDepartmentTechnicalWorkspace ? "min-w-40" : "w-full"}
                        >
                          {saving ? t("workspace.saving") : t(action.labelKey, action.label)}
                        </Button>
                      ))
                    )}
                  </div>
                </>
              )}
              </div>
            )}
          </Panel>
        )}
      </section>

      {!isFocusedPersonalWorkspace && !tableFirstWorkspace && (
        <Panel title={t("workspace.selectedRecord")} description={t("workspace.selectedRecordDesc")}>
          {selectedRecord ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Info label={t("common.reference")} value={getApplicationReference(selectedRecord)} />
              <Info label={t("common.applicant")} value={getApplicantName(selectedRecord)} />
              <Info label={t("common.type")} value={getLocalizedApplicationType(selectedRecord, t)} />
              <Info label={t("common.project")} value={getProjectName(selectedRecord)} />
              <Info label={t("workspace.location")} value={getApplicationLocation(selectedRecord)} />
              <Info
                label={t("common.status")}
                value={getWorkspaceStatusLabel(selectedRecord, config, t, userDepartment)}
              />
            </div>
          ) : (
            <p className="text-sm text-slate-500">{t("workspace.selectApplication")}</p>
          )}
        </Panel>
      )}

      {pendingMemoSubmission && (
        <KbLesMemoModal
          t={t}
          value={memoDraft}
          saving={saving}
          onChange={setMemoDraft}
          onCancel={closeMemoModal}
          onSend={sendMemoSubmission}
        />
      )}
    </AdminDashboardLayout>
  );
}

function KbLesMemoModal({ t, value, saving, onChange, onCancel, onSend }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="kb-les-memo-title"
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl"
      >
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 id="kb-les-memo-title" className="text-[17px] font-semibold leading-6 text-slate-950">
            {t("workspace.memo.title", "Memo to TP(RES)/PGH")}
          </h2>
          <p className="mt-1 text-[14px] leading-5 text-slate-500">
            {t(
              "workspace.memo.description",
              "Complete the memo template. This exact memo will appear in TP(RES)/PGH notifications."
            )}
          </p>
        </div>

        <div className="overflow-y-auto px-4 py-4">
          <SimpleWysiwygEditor
            label={t("workspace.memo.editorLabel", "Memo Content")}
            value={value}
            onChange={onChange}
            max={12000}
          />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={saving}
          >
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            type="button"
            icon="send"
            onClick={onSend}
            disabled={saving}
          >
            {saving ? t("workspace.saving") : t("workspace.memo.send", "Send")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function mergeFormData(app, next) {
  return {
    ...(app.form_data || {}),
    ...next,
  };
}

function createKbLesMemoTemplate(app, technicalSite) {
  const reviewTechnicalSite = getReviewTechnicalSite(technicalSite, app);
  const feeItems = normalizeTechnicalFeeItems(reviewTechnicalSite.fee_items).filter(
    (item) => item.item || item.account_code || item.amount
  );
  const total =
    getTechnicalFeeTotal(feeItems) ||
    parseMemoAmount(reviewTechnicalSite.license_fee_calculation) ||
    parseMemoAmount(reviewTechnicalSite.fee_total);
  const totalText = formatMemoAmount(total);
  const year = new Date().getFullYear();
  const memoDate = new Intl.DateTimeFormat("ms-MY", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());
  const reference = getApplicationReference(app);

  return `
    <h3 style="text-align:center;"><strong>DEWAN BANDARAYA KUCHING UTARA</strong><br><strong>MEMORANDUM</strong></h3>
    <figure class="table"><table style="width:480px;border-collapse:collapse;margin-left:auto;margin-right:auto;">
      <tbody>
        <tr>
          <td style="width:90px;border:1px solid #bfbfbf;padding:6px;"><strong>Kepada :</strong></td>
          <td colspan="3" style="border:1px solid #bfbfbf;padding:6px;">Timbalan Pengarah (Jabatan Perkhidmatan Kawal Selia)</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Melalui :</strong></td>
          <td colspan="3" style="border:1px solid #bfbfbf;padding:6px;">&nbsp;</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Daripada :</strong></td>
          <td colspan="3" style="border:1px solid #bfbfbf;padding:6px;">Ketua Bahagian (Pelesenan)</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Ruj. Kami :</strong></td>
          <td style="width:220px;border:1px solid #bfbfbf;padding:6px;">DBKU/LES/IKL/M/${year}(1)</td>
          <td style="width:70px;border:1px solid #bfbfbf;padding:6px;"><strong>Tarikh:</strong></td>
          <td style="width:110px;border:1px solid #bfbfbf;padding:6px;">${escapeHtml(memoDate)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Ruj. Tuan :</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(reference)}</td>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Tarikh:</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">&nbsp;</td>
        </tr>
      </tbody>
    </table></figure>
    <p><strong><u>PERMOHONAN KELULUSAN UNTUK LESEN TANDANAMA PERNIAGAAN / IKLAN</u></strong><br>Dengan segala hormatnya perkara di atas dirujuk.</p>
    <p>&nbsp;</p>
    <p>Untuk makluman, Bahagian Pelesenan telah menerima dua (2) permohonan baru Lesen Tandanama Perniagaan/Iklan.</p>
    <p>Bersama ini disertakan permohonan tandanama perniagaan/iklan yang telah mematuhi semua syarat untuk kelulusan puan seperti berikut:-</p>
    <figure class="table"><table style="width:650px;border-collapse:collapse;margin-left:auto;margin-right:auto;">
      <thead>
        <tr>
          <th style="width:40px;border:1px solid #bfbfbf;background-color:#f1f1f1;padding:8px;text-align:center;"><strong>BIL.</strong></th>
          <th style="border:1px solid #bfbfbf;background-color:#f1f1f1;padding:8px;text-align:center;"><strong>PERKARA</strong></th>
          <th style="width:75px;border:1px solid #bfbfbf;background-color:#f1f1f1;padding:8px;text-align:center;"><strong>HASIL<br>(RM)</strong></th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:8px;">1.</td>
          <td style="border:1px solid #bfbfbf;padding:8px;">Dua (2) Lesen Tandanama Perniagaan/Iklan<br>(${escapeHtml(reference)})</td>
          <td style="border:1px solid #bfbfbf;padding:8px;text-align:right;">${escapeHtml(totalText)}</td>
        </tr>
        <tr>
          <td colspan="2" style="border:1px solid #bfbfbf;padding:8px;text-align:right;"><strong>Jumlah Keseluruhan</strong></td>
          <td style="border:1px solid #bfbfbf;padding:8px;text-align:right;"><strong>${escapeHtml(totalText)}</strong></td>
        </tr>
      </tbody>
    </table></figure>
    <p>Mohon kelulusan puan dalam perkara tersebut di atas.<br>Sekian. Terima kasih.<br><strong><em>"AN HONOUR TO SERVE"</em></strong><br><strong><em>"TOGETHER WE CARE"</em></strong></p>
    <p>&nbsp;</p>
    <p><strong>(........................................)</strong><br>Ketua Bahagian<br>Bahagian Pelesenan</p>
  `;
}

function formatMemoAmount(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function parseMemoAmount(value) {
  const numeric = Number(String(value || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function getHtmlPlainText(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getWorkspaceStatusLabel(app, config, t, userDepartment = "") {
  const status = normalizeStatus(app?.status);
  const isIklWorkspace = config?.key === "screening";
  const isDepartmentTechnicalWorkspace = config?.key === "technical";
  const isApprovalWorkspace = config?.key === "approval";

  if (isIklWorkspace && status === "submitted") {
    return t("status.pt_ikl_review", "PT(IKL) Review");
  }

  if (isIklWorkspace && status === "ku_ikl_review") {
    return t("status.ku_ikl_review", "KU(IKL) Review");
  }

  if (isIklWorkspace && status === "technical_review_completed") {
    return t("status.technical_ku_review", "Pending KU(IKL) Final Check");
  }

  if (isIklWorkspace && TECHNICAL_REVIEW_STATUSES.has(status)) {
    return `${t(`status.${status}`, formatWorkflowStatus(status))}: ${TECHNICAL_DEPARTMENTS.join(" / ")}`;
  }

  if (isDepartmentTechnicalWorkspace && TECHNICAL_REVIEW_STATUSES.has(status)) {
    return getDepartmentReviewStatusLabel(userDepartment);
  }

  if (isApprovalWorkspace && status === "management_review") {
    return getApprovalStageLabel(app);
  }

  if (isApprovalWorkspace && isApprovalHistoryRecord(app)) {
    return t("status.approved", "Approved");
  }

  if (config?.key === "payment" && status === "bill_pending_ku") {
    return t("status.bill_pending_ku", "Pending Bill Confirmation");
  }

  return formatWorkflowStatus(status);
}

function getWorkspaceActionDescription(config, t, userDepartment) {
  if (config?.key === "screening") {
    const copy = getIklScreeningCopy(userDepartment);
    return t(copy.actionDescriptionKey, copy.actionDescription);
  }

  if (config?.key === "approval") {
    if (userDepartment === "KB(LES)") {
      return t("workspace.approval.kbAction", "Verify applications after KU(IKL) final checking before sending them to TP(RES)/PGH.");
    }

    if (APPROVAL_SUPPORT_DEPARTMENTS.includes(userDepartment)) {
      return t("workspace.approval.supportAction", "Make the final approval decision after KB(LES) verification.");
    }

    if (MPHLG_REVIEW_DEPARTMENTS.includes(userDepartment)) {
      return t("workspace.approval.mphlgAction", "Review the full application before approving it for SUT final approval.");
    }

    if (SUT_APPROVAL_DEPARTMENTS.includes(userDepartment)) {
      return t("workspace.approval.sutAction", "Record SUT final approval with optional comments.");
    }

    return t("workspace.approval.viewOnlyAction", "View applications awaiting SUT, KB(LES), or TP(RES)/PGH action.");
  }

  if (config?.key === "payment") {
    if (userDepartment === "PT(IKL)") {
      return t("workspace.payment.ptAction", "Generate the approval letter and bill, then verify uploaded payment proof.");
    }

    if (userDepartment === "KU(IKL)") {
      return t("workspace.payment.kuAction", "Confirm the generated bill before it is sent to the applicant.");
    }
  }

  if (config?.key === "license" && userDepartment === "PT(IKL)") {
    return t("workspace.license.ptAction", "Generate the advertisement license and QR code after payment is verified.");
  }

  return t(config.actionDescriptionKey, config.actionDescription);
}

function getDepartmentReviewStatusLabel(department) {
  const normalizedDepartment = normalizeDepartmentCode(department);
  return normalizedDepartment ? `${normalizedDepartment} Review` : "Department Review";
}

function getWorkspaceDecisionOptions(config, app, department) {
  if (config?.key !== "approval") {
    return config.decisions || [];
  }

  if (department === "KB(LES)" && getApprovalStageKey(app) === "kb") {
    return [
      { value: "Verify", labelKey: "workspace.decision.verify" },
      { value: "Reject", labelKey: "workspace.decision.reject" },
    ];
  }

  if (APPROVAL_SUPPORT_DEPARTMENTS.includes(department) && getApprovalStageKey(app) === "support") {
    return [
      { value: "Approve", labelKey: "workspace.decision.approve" },
      { value: "Reject", labelKey: "workspace.decision.reject" },
    ];
  }

  if (MPHLG_REVIEW_DEPARTMENTS.includes(department) && getApprovalStageKey(app) === "mphlg") {
    return [
      { value: "Approve", labelKey: "workspace.decision.approve" },
    ];
  }

  if (SUT_APPROVAL_DEPARTMENTS.includes(department) && getApprovalStageKey(app) === "sut") {
    return [
      { value: "Approve", labelKey: "workspace.decision.approve" },
    ];
  }

  return config.decisions || [];
}

function getDefaultWorkspaceDecision(config, app, department) {
  const options = getWorkspaceDecisionOptions(config, app, department);
  return options[0]?.value || options[0] || config?.defaultDecision || "";
}

function getWorkspaceActions(config, app, department) {
  if (config?.key !== "approval") {
    return (config.actions || []).filter((action) => {
      if (typeof action.isAvailable !== "function") return true;
      return action.isAvailable(app, department);
    });
  }

  const stage = getApprovalStageKey(app);
  const canKbVerify = department === "KB(LES)" && stage === "kb";
  const canSupport =
    APPROVAL_SUPPORT_DEPARTMENTS.includes(department) && stage === "support";
  const canMphlgApprove =
    MPHLG_REVIEW_DEPARTMENTS.includes(department) && stage === "mphlg";
  const canSutApprove =
    SUT_APPROVAL_DEPARTMENTS.includes(department) && stage === "sut";

  return canKbVerify || canSupport || canMphlgApprove || canSutApprove ? config.actions || [] : [];
}

function canOpenWorkspaceRow(config, app, department) {
  return getWorkspaceActions(config, app, department).length > 0;
}

function isApprovalTaskForDepartment(app, department) {
  const stage = getApprovalStageKey(app);

  if (isApprovalHistoryRecord(app)) return true;
  if (!isApprovalActionDepartment(department)) return true;
  if (department === "KB(LES)") return stage === "kb" || isKbLesMonitoredRecord(app);
  if (APPROVAL_SUPPORT_DEPARTMENTS.includes(department)) return stage === "support";
  if (MPHLG_REVIEW_DEPARTMENTS.includes(department)) return stage === "mphlg";
  if (SUT_APPROVAL_DEPARTMENTS.includes(department)) return stage === "sut";

  return false;
}

function isKbLesMonitoredRecord(app) {
  const kbVerification = app?.form_data?.kb_les_verification || {};
  const verifiedByKb = ["verified", "supported", "completed"].includes(
    String(kbVerification.status || "").trim().toLowerCase()
  );

  return verifiedByKb && getApprovalStageKey(app) === "support";
}

function isApprovalHistoryRecord(app) {
  const status = normalizeStatus(app?.status);
  return (
    hasApplicationSection(app, "approval") ||
    [
      "approved",
      "approved_with_conditions",
      "bill_pending_ku",
      "invoice_generated",
      "payment_submitted",
      "payment_verified",
      "license_issued",
      "license_revoked",
    ].includes(status)
  );
}

function isApprovalActionDepartment(department) {
  return (
    department === "KB(LES)" ||
    APPROVAL_SUPPORT_DEPARTMENTS.includes(department) ||
    MPHLG_REVIEW_DEPARTMENTS.includes(department) ||
    SUT_APPROVAL_DEPARTMENTS.includes(department)
  );
}

function shouldShowApprovalTechnicalReport(department, app) {
  const normalizedDepartment = normalizeDepartmentCode(department);
  const approvalDepartments = [
    "KB(LES)",
    ...APPROVAL_SUPPORT_DEPARTMENTS,
    ...MPHLG_REVIEW_DEPARTMENTS,
    ...SUT_APPROVAL_DEPARTMENTS,
  ];

  return (
    approvalDepartments.includes(normalizedDepartment) ||
    getApprovalStageKey(app) === "support"
  );
}

function getActionUnavailableMessage(config, app, department) {
  if (!app) return "";

  if (config?.key === "payment") {
    return getPaymentActionUnavailableMessage(app, department);
  }

  if (config?.key === "license") {
    return getLicenseActionUnavailableMessage(app, department);
  }

  if (config?.key !== "approval") return "";

  const stage = getApprovalStageKey(app);

  if (department === "KB(LES)") {
    return stage === "kb" ? "" : "KB(LES) verification is already complete or not required for this record.";
  }

  if (APPROVAL_SUPPORT_DEPARTMENTS.includes(department)) {
    return stage === "support" ? "" : "TP(RES)/PGH final approval is available after KB(LES) verification.";
  }

  if (MPHLG_REVIEW_DEPARTMENTS.includes(department)) {
    return stage === "mphlg" ? "" : "MPHLG approval is available after TP(RES)/PGH support.";
  }

  if (SUT_APPROVAL_DEPARTMENTS.includes(department)) {
    return stage === "sut" ? "" : "SUT approval is available after MPHLG approval.";
  }

  return "This queue is view-only for this account. SUT records the result first, KB(LES) verifies it, then TP(RES)/PGH makes the final approval.";
}

function getPaymentActionUnavailableMessage(app, department) {
  const status = normalizeStatus(app?.status);

  if (department === "PT(IKL)" && ["approved", "payment_submitted"].includes(status)) {
    return "";
  }

  if (department === "KU(IKL)" && status === "bill_pending_ku") {
    return "";
  }

  if (department === "PT(IKL)" && status === "bill_pending_ku") {
    return "The bill is waiting for KU(IKL) confirmation before it is sent to the applicant.";
  }

  if (department === "KU(IKL)") {
    return "KU(IKL) confirmation is available after PT(IKL) generates the approval letter and bill.";
  }

  return "Payment actions are available to PT(IKL) and KU(IKL) only.";
}

function getLicenseActionUnavailableMessage(app, department) {
  const status = normalizeStatus(app?.status);

  if (department === "PT(IKL)" && status === "payment_verified") {
    return "";
  }

  if (
    status === "license_issued" &&
    (
      department === "PT(IKL)" ||
      isSupervisorWorkflowDepartment(department) ||
      department === "KB(LES)"
    )
  ) {
    return "";
  }

  return "PT(IKL) generates the license after payment verification. Renewal actions appear when a reminder or cancellation task is detected.";
}

function getLicenseRenewal(app) {
  const renewal = app?.form_data?.license_renewal || {};
  return renewal && typeof renewal === "object" ? renewal : {};
}

function getLicenseRenewalReminders(app) {
  const reminders = getLicenseRenewal(app).reminders || {};
  return reminders && typeof reminders === "object" ? reminders : {};
}

function getReminderStatus(app, months) {
  return String(getLicenseRenewalReminders(app)?.[String(months)]?.status || "")
    .trim()
    .toLowerCase();
}

function getPendingReminderConfirmationMonth(app) {
  return [3, 2, 1].find(
    (months) => getReminderStatus(app, months) === "pending_supervisor_confirmation"
  );
}

function getCancellationStatus(app) {
  const cancellation = getLicenseRenewal(app).cancellation || {};
  return String(cancellation?.status || "").trim().toLowerCase();
}

function isSupervisorWorkflowDepartment(department) {
  return [
    "KB(LES)",
    "TP(RES)",
    "PGH",
    "TP(RES)/PGH",
    "TP/PGH",
    "MPHLG",
    "SUT",
  ].includes(department);
}

function canGenerateRenewalReminder(app, department, months) {
  return (
    department === "PT(IKL)" &&
    normalizeStatus(app?.status) === "license_issued" &&
    getReminderStatus(app, months) === "pending_pt_letter"
  );
}

function canConfirmRenewalReminder(app, department) {
  return (
    isSupervisorWorkflowDepartment(department) &&
    normalizeStatus(app?.status) === "license_issued" &&
    Boolean(getPendingReminderConfirmationMonth(app))
  );
}

function canGenerateCancellationNotice(app, department) {
  return (
    department === "PT(IKL)" &&
    normalizeStatus(app?.status) === "license_issued" &&
    getCancellationStatus(app) === "pending_pt_notice"
  );
}

function canConfirmCancellationNotice(app, department) {
  return (
    isSupervisorWorkflowDepartment(department) &&
    normalizeStatus(app?.status) === "license_issued" &&
    getCancellationStatus(app) === "pending_supervisor_confirmation"
  );
}

function canSupportCancellationNotice(app, department) {
  return (
    department === "KB(LES)" &&
    normalizeStatus(app?.status) === "license_issued" &&
    getCancellationStatus(app) === "pending_kb_les_support"
  );
}

function getApprovalStageLabel(app) {
  const stage = getApprovalStageKey(app);

  if (stage === "support") return "Pending TP(RES)/PGH Approval";
  if (stage === "mphlg") return "Pending MPHLG Approval";
  if (stage === "sut") return "Pending SUT Approval";
  if (stage === "completed") return "Approval Completed";
  return "Pending KB(LES) Verification";
}

function getApprovalStageKey(app) {
  const status = normalizeStatus(app?.status);

  if (status === "management_review") {
    if (!isKbLesVerified(app)) return "kb";
    return "support";
  }

  if (status === "mphlg_processing") return "mphlg";
  if (status === "mphlg_decision_received") return "sut";
  if (hasApplicationSection(app, "approval")) return "completed";
  if (isKbLesVerified(app) && !hasManagementSupport(app)) return "support";
  return "kb";
}

function getApplicationSection(app, key) {
  return app?.[key] || app?.form_data?.[key] || {};
}

function hasApplicationSection(app, key) {
  const section = getApplicationSection(app, key);
  return Boolean(section && Object.keys(section).length > 0);
}

function isKbLesVerified(app) {
  const status = String(getApplicationSection(app, "kb_les_verification")?.status || "")
    .trim()
    .toLowerCase();
  return ["verified", "supported", "completed"].includes(status);
}

function hasManagementSupport(app) {
  const status = String(getApplicationSection(app, "management_recommendation")?.status || "")
    .trim()
    .toLowerCase();
  return ["supported", "approved", "completed"].includes(status);
}

function getLocalizedApplicationType(app, t) {
  const type = getApplicationType(app);
  const normalizedType = String(type || "").trim().toLowerCase();
  const labelMap = {
    "application for site (new site)": "application.type.siteNew",
    "application for site": "application.type.site",
    "sitting application": "application.type.sitting",
    "signboard license": "application.type.signboard",
    "building plan": "application.type.buildingPlan",
  };

  return labelMap[normalizedType] ? t(labelMap[normalizedType], type) : type;
}

function createTechnicalFeeItem(overrides = {}) {
  return {
    id: `fee-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    item: "",
    account_code: "",
    amount: "",
    ...overrides,
  };
}

function getTechnicalFeeOption(value) {
  return TECHNICAL_FEE_OPTIONS.find((option) => option.value === value) || null;
}

function normalizeTechnicalFeeItems(items) {
  if (!Array.isArray(items) || items.length === 0) return [createTechnicalFeeItem()];

  const normalized = items.map((item) => {
    const option = getTechnicalFeeOption(item?.item);
    const nextItem = createTechnicalFeeItem({
      item: item?.item || "",
      account_code: item?.account_code || option?.accountCode || "",
      amount: item?.amount || "",
    });
    return item?.id ? { ...nextItem, id: item.id } : nextItem;
  });

  return normalized.length > 0 ? normalized : [createTechnicalFeeItem()];
}

function getTechnicalFeeTotal(items) {
  return getTechnicalFeeTotals(items).grandTotal;
}

function getTechnicalFeeTotals(items) {
  return (Array.isArray(items) ? items : []).reduce((totals, item) => {
    const amount = Number(String(item?.amount || "").replace(/[^\d.-]/g, ""));
    if (!Number.isFinite(amount)) return totals;

    if (String(item?.item || "").startsWith("deposit_")) {
      return {
        ...totals,
        depositTotal: totals.depositTotal + amount,
        grandTotal: totals.grandTotal + amount,
      };
    }

    return {
      ...totals,
      feeTotal: totals.feeTotal + amount,
      grandTotal: totals.grandTotal + amount,
    };
  }, { feeTotal: 0, depositTotal: 0, grandTotal: 0 });
}

function createKuTechnicalChecks(savedChecks = {}) {
  return KU_TECHNICAL_CHECK_KEYS.reduce((checks, key) => ({
    ...checks,
    [key]: Boolean(savedChecks?.[key]),
  }), {});
}

function buildIklScreeningPayload(app, data) {
  const now = new Date().toISOString();
  const checks = buildScreeningChecks(app);
  const reject =
    data.decision === "PT(IKL) Reject to Applicant" ||
    data.decision === "KU(IKL) Reject to Applicant";
  const technicalAmendment = data.decision === "Technical Amendment Required";
  const sendTechnical = data.decision === "KU(IKL) Confirm - Send to Technical Units";
  const correctionRequired = reject || technicalAmendment;

  return {
    status: reject
      ? "incomplete"
      : technicalAmendment
        ? "technical_amendment"
        : sendTechnical
          ? "technical_review"
          : "ku_ikl_review",
    current_step: Math.max(Number(app.current_step || 1), 5),
    latest_remark: correctionRequired ? data.comment : app.latest_remark || "",
    form_data: mergeFormData(app, {
      auto_screening: {
        status: "Screened",
        result: correctionRequired ? "Rejected to Applicant" : data.decision,
        remarks: data.comment,
        checks,
        checked_at: now,
      },
      correction_request: correctionRequired
        ? {
            source: data.decision.includes("KU") ? "KU(IKL)" : "PT(IKL)",
            remarks: data.comment,
            requested_at: now,
          }
        : app.form_data?.correction_request || null,
    }),
  };
}

function buildIklTechnicalDecisionPayload(app, data) {
  const now = new Date().toISOString();
  const feeItems = normalizeTechnicalFeeItems(data.technicalSite.fee_items);
  const feeTotals = getTechnicalFeeTotals(feeItems);

  return {
    status: "technical_review_completed",
    current_step: Math.max(Number(app.current_step || 1), 5),
    latest_remark: data.comment || app.latest_remark || "",
    form_data: mergeFormData(app, {
      technical_review: {
        ...(app.form_data?.technical_review || {}),
        status: "Completed",
        final_decision: data.decision,
        decision: data.decision,
        comment: data.comment,
        department: "IKL (TECHNICAL)",
        reviewed_by: "PT/PO/KP Unit Iklan",
        reviewed_at: now,
        department_reviews: getTechnicalDepartmentReviews(app),
      },
      technical_site_visit: {
        ...(app.form_data?.technical_site_visit || {}),
        site_photos: data.technicalSite.site_photos || [],
        site_photo: data.technicalSite.site_photos?.[0] || null,
        fee_date: data.technicalSite.fee_date || new Date().toISOString().slice(0, 10),
        fee_items: feeItems,
        fee_total: feeTotals.grandTotal,
        license_fee_calculation: feeTotals.feeTotal ? String(feeTotals.feeTotal) : data.technicalSite.license_fee_calculation,
        deposit_calculation: feeTotals.depositTotal ? String(feeTotals.depositTotal) : data.technicalSite.deposit_calculation,
        site_remarks: data.technicalSite.site_remarks || data.comment,
        officer_role: "PT/PO/KP Unit Iklan",
        visited_at: now,
      },
      correction_request: null,
    }),
  };
}

function buildKuTechnicalReviewPayload(app, data) {
  const now = new Date().toISOString();
  const amendmentRequired = data.decision === "KU(IKL) Request Technical Amendment";

  return {
    status: amendmentRequired ? "technical_amendment" : "management_review",
    current_step: Math.max(Number(app.current_step || 1), 5),
    latest_remark: data.comment || app.latest_remark || "",
    form_data: mergeFormData(app, {
      technical_ku_review: {
        status: amendmentRequired ? "Amendment Required" : "Verified",
        decision: data.decision,
        remarks: data.comment,
        checks: createKuTechnicalChecks(data.kuChecks),
        reviewed_by: "KU(IKL)",
        reviewed_at: now,
      },
      correction_request: amendmentRequired
        ? {
            source: "KU(IKL)",
            target: "IKL(TECHNICAL)",
            remarks: data.comment,
            requested_at: now,
          }
        : null,
      kb_les_verification: amendmentRequired
        ? null
        : {
            status: "Pending KB(LES) Verification",
            routed_from: "KU(IKL)",
            routed_at: now,
          },
      management_recommendation: null,
      mphlg_gateway: null,
      sut_approval: amendmentRequired
        ? app.form_data?.sut_approval || null
        : app.form_data?.sut_approval || null,
      approval: null,
    }),
  };
}

function buildApprovalWorkflowPayload(app, data) {
  const now = new Date().toISOString();
  const department = normalizeDepartmentCode(data.department);
  const decision = data.decision;
  const rejected = decision === "Reject" || decision === "Not Supported";

  if (department === "KB(LES)") {
    return {
      status: rejected ? "technical_review_completed" : "management_review",
      current_step: Math.max(Number(app.current_step || 1), 5),
      latest_remark: data.comment || app.latest_remark || "",
      form_data: mergeFormData(app, {
        kb_les_verification: {
          ...(app.form_data?.kb_les_verification || {}),
          officer: "KB(LES)",
          status: rejected ? "Rejected" : "Verified",
          decision,
          remarks: data.comment,
          memo_html: rejected ? "" : data.memoHtml || app.form_data?.kb_les_verification?.memo_html || "",
          verified_at: now,
        },
        management_recommendation: rejected
          ? null
          : {
              ...(app.form_data?.management_recommendation || {}),
              status: "Pending TP(RES)/PGH Approval",
              routed_from: "KB(LES)",
              routed_at: now,
            },
        correction_request: rejected
          ? {
              source: "KB(LES)",
              target: "KU(IKL)",
              remarks: data.comment,
              requested_at: now,
            }
          : app.form_data?.correction_request || null,
        approval: null,
      }),
    };
  }

  if (APPROVAL_SUPPORT_DEPARTMENTS.includes(department)) {
    return {
      status: rejected ? "rejected" : "approved",
      current_step: Math.max(Number(app.current_step || 1), 5),
      latest_remark: data.comment || app.latest_remark || "",
      form_data: mergeFormData(app, {
        management_recommendation: {
          ...(app.form_data?.management_recommendation || {}),
          officer: department,
          status: rejected ? "Rejected" : "Approved",
          decision,
          remarks: data.comment,
          decided_at: now,
        },
        mphlg_gateway: app.form_data?.mphlg_gateway || null,
        approval: rejected
          ? {
              status: "Rejected",
              final_decision: "Rejected",
              notes: data.comment,
              decided_by: department,
              decided_at: now,
            }
          : {
              ...(app.form_data?.approval || {}),
              status: "Approved",
              final_decision: "Approved",
              notes: data.comment,
              decided_by: department,
              approved_at: now,
            },
      }),
    };
  }

  if (MPHLG_REVIEW_DEPARTMENTS.includes(department)) {
    return {
      status: decision === "Approve" ? "mphlg_decision_received" : normalizeStatus(app.status),
      current_step: Math.max(Number(app.current_step || 1), 5),
      latest_remark: data.comment || app.latest_remark || "",
      form_data: mergeFormData(app, {
        mphlg_gateway: {
          ...(app.form_data?.mphlg_gateway || {}),
          officer: "MPHLG",
          status: decision === "Approve" ? "Approved" : app.form_data?.mphlg_gateway?.status || "Pending MPHLG/SUT Processing",
          decision,
          remarks: data.comment,
          reviewed_at: now,
        },
        sut_approval: decision === "Approve"
          ? {
              ...(app.form_data?.sut_approval || {}),
              status: "Pending SUT Approval",
              routed_from: "MPHLG",
              routed_at: now,
            }
          : app.form_data?.sut_approval || null,
        approval: app.form_data?.approval || null,
      }),
    };
  }

  if (SUT_APPROVAL_DEPARTMENTS.includes(department)) {
    return {
      status: decision === "Approve" ? "management_review" : normalizeStatus(app.status),
      current_step: Math.max(Number(app.current_step || 1), 5),
      latest_remark: data.comment || app.latest_remark || "",
      form_data: mergeFormData(app, {
        sut_approval: {
          ...(app.form_data?.sut_approval || {}),
          officer: "SUT",
          status: decision === "Approve" ? "Approved" : app.form_data?.sut_approval?.status || "Pending SUT Approval",
          decision,
          remarks: data.comment,
          approved_at: now,
        },
        kb_les_verification: decision === "Approve"
          ? {
              status: "Pending KB(LES) Verification",
              routed_from: "SUT",
              routed_at: now,
            }
          : app.form_data?.kb_les_verification || null,
        management_recommendation: decision === "Approve"
          ? null
          : app.form_data?.management_recommendation || null,
        approval: app.form_data?.approval || null,
      }),
    };
  }

  return {
    status: normalizeStatus(app.status),
    form_data: app.form_data || {},
  };
}

function buildDepartmentTechnicalReviewPayload(app, data) {
  const now = new Date().toISOString();
  const department = normalizeDepartmentCode(data.department);
  const currentReviews = getTechnicalDepartmentReviews(app);
  const nextReviews = {
    ...currentReviews,
    [department]: {
      department,
      decision: data.decision,
      remarks: data.comment,
      reviewed_at: now,
      reviewed_by: department,
    },
  };

  return {
    status: "technical_review",
    current_step: Math.max(Number(app.current_step || 1), 5),
    form_data: mergeFormData(app, {
      technical_department_reviews: nextReviews,
      technical_department_reviews_updated_at: now,
    }),
  };
}

function getTechnicalDepartmentReviews(app) {
  return (
    app?.technical_department_reviews ||
    app?.form_data?.technical_department_reviews ||
    {}
  );
}

function hasTechnicalDepartmentReview(app, department) {
  const normalizedDepartment = normalizeDepartmentCode(department);
  return Boolean(getTechnicalDepartmentReviews(app)?.[normalizedDepartment]);
}

function areAllTechnicalDepartmentReviewsComplete(app) {
  return TECHNICAL_DEPARTMENTS.every((department) =>
    hasTechnicalDepartmentReview(app, department)
  );
}

function countBy(applications, predicate) {
  return applications.filter(predicate).length;
}

function hasValue(value) {
  if (value === null || value === undefined) return false;
  return String(value).trim().length > 0;
}

function cleanRemark(value) {
  const remark = String(value || "").trim();
  return ["", "-", "[]"].includes(remark) ? "" : remark;
}

function getBillAmount(app) {
  const technicalSite = app?.form_data?.technical_site_visit || {};
  const calculatedAmounts = [
    technicalSite.license_fee_calculation,
    technicalSite.deposit_calculation,
  ]
    .map(parseCurrencyAmount)
    .filter((value) => Number.isFinite(value));

  if (calculatedAmounts.length > 0) {
    return calculatedAmounts.reduce((total, value) => total + value, 0);
  }

  const existingAmount = parseCurrencyAmount(app?.form_data?.payment?.amount);
  if (Number.isFinite(existingAmount) && existingAmount !== 250) {
    return existingAmount;
  }

  return "";
}

function parseCurrencyAmount(value) {
  if (!hasValue(value)) return Number.NaN;

  const numeric = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : Number.NaN;
}

function getCurrentTechnicalSitePhotos(savedPhotos, application) {
  const documents = Array.isArray(application?.supporting_documents)
    ? application.supporting_documents
    : [];
  const technicalDocuments = documents.filter(
    (document) => document.title === "Technical Site Photo"
  );
  const documentIds = new Set(documents.map((document) => String(document.id)));
  const currentSavedPhotos = savedPhotos.filter((photo) => {
    if (!photo?.document_id) return true;
    return documentIds.has(String(photo.document_id));
  });
  const savedDocumentIds = new Set(
    currentSavedPhotos
      .map((photo) => photo?.document_id)
      .filter(Boolean)
      .map(String)
  );
  const missingTechnicalPhotos = technicalDocuments
    .filter((document) => !savedDocumentIds.has(String(document.id)))
    .map((document) => ({
      document_id: document.id,
      title: document.title,
      name: getFileNameFromUrl(document.file || document.file_url) || document.title,
      url: document.file_url || document.file || "",
      file_url: document.file_url || document.file || "",
      uploaded_at: document.uploaded_at,
    }));

  return [...currentSavedPhotos, ...missingTechnicalPhotos];
}

function getFileNameFromUrl(value) {
  const url = String(value || "");
  if (!url) return "";

  try {
    return decodeURIComponent(new URL(url, window.location.origin).pathname)
      .split("/")
      .filter(Boolean)
      .pop() || "";
  } catch {
    return url.split(/[\\/]/).filter(Boolean).pop() || "";
  }
}

function normalizeDepartmentCode(value) {
  const department = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[.]+$/g, "")
    .replace(/-/g, " ")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ");
  if (department === "PT IKL") return "PT(IKL)";
  if (department === "KU IKL") return "KU(IKL)";
  if (department === "TP RES" || department === "TP(RES)") return "TP(RES)";
  if (department === "TP RES/PGH" || department === "TP(RES)/PGH") return "TP(RES)/PGH";
  if (
    department === "IKL(TECHNICAL)" ||
    department === "IKL TECHNICAL" ||
    department === "IKL-TECHNICAL"
  ) {
    return "IKL (TECHNICAL)";
  }
  if (department === "INP") return "LNP";
  if (department === "SETIAUSAHA TETAP") return "SUT";
  return department === "UNIT IKLAN" ? "PT(IKL)" : department;
}

function canAccessWorkspace(config, department) {
  const allowedDepartments = config?.allowedDepartments;

  if (!Array.isArray(allowedDepartments) || allowedDepartments.length === 0) {
    return true;
  }

  return allowedDepartments.includes(department);
}

function isTableFirstWorkspace(config) {
  return ["approval", "payment", "license"].includes(config?.key);
}

function isELicenseTableWorkspace(config) {
  return ["payment", "license"].includes(config?.key);
}

function getWorkspaceStatusScope(config, department) {
  if (config?.key === "screening") {
    return IKL_DEPARTMENT_STATUS_SCOPE[department] || [];
  }

  if (config?.key === "payment") {
    if (department === "PT(IKL)") {
      return [
        "approved",
        "bill_pending_ku",
        "invoice_generated",
        "payment_submitted",
        "payment_verified",
      ];
    }

    if (department === "KU(IKL)") {
      return [
        "bill_pending_ku",
        "invoice_generated",
        "payment_submitted",
        "payment_verified",
      ];
    }
  }

  return Array.isArray(config?.statuses) ? config.statuses : [];
}

function hasAttachment(row) {
  return Boolean(row?.attachment || row?.file || row?.file_url || row?.url);
}

function hasCoordinates(step1) {
  const latitude = Number(step1.latitude);
  const longitude = Number(step1.longitude);

  return Number.isFinite(latitude) && Number.isFinite(longitude);
}

function isStepOneComplete(step1, app) {
  const requiredFields = [
    step1.project_name || app.title,
    step1.applicant,
    step1.contact_person,
    step1.tel_no,
    step1.locality_address,
    step1.area_required,
    step1.total_scheme_value,
    step1.amount_fund_approved,
    step1.amount_fund_available,
    step1.project_justification,
    step1.site_selection_reason,
    step1.designation,
    step1.officer_name,
    step1.application_date,
  ];

  return requiredFields.every(hasValue);
}

function areSupportingDocumentsComplete(app, step10) {
  const requiredDocuments = Array.isArray(step10.documents)
    ? step10.documents.filter((document) => document.required !== false)
    : [];
  const titleDocuments = Array.isArray(step10.title_documents)
    ? step10.title_documents
    : [];
  const otherDocuments = Array.isArray(step10.other_documents)
    ? step10.other_documents
    : [];
  const uploadedDocuments = Array.isArray(app.supporting_documents)
    ? app.supporting_documents
    : [];

  const requiredSectionComplete =
    requiredDocuments.length > 0 && requiredDocuments.every(hasAttachment);
  const titleSectionComplete =
    titleDocuments.length > 0 &&
    titleDocuments.every((document) => hasValue(document.land) && hasAttachment(document));
  const otherSectionComplete =
    otherDocuments.length === 0 ||
    otherDocuments.every((document) => !hasValue(document.description) || hasAttachment(document));

  return (
    (requiredSectionComplete && titleSectionComplete && otherSectionComplete) ||
    uploadedDocuments.length > 0
  );
}

const configs = {
  screening: {
    key: "screening",
    allowedDepartments: IKL_TASK_DEPARTMENTS,
    statuses: ["submitted", "incomplete", "ku_ikl_review", "technical_review", "technical_site_visit", "technical_amendment", "technical_review_completed"],
    eyebrow: "S2 Verification",
    eyebrowKey: "workspace.screening.eyebrow",
    title: "Application Screening",
    titleKey: "workspace.screening.title",
    description: "Review applicant information and documents. Reject with remarks if incomplete, or route complete applications to KU(IKL)/technical review.",
    descriptionKey: "workspace.screening.description",
    queueTitle: "Screening Queue",
    queueTitleKey: "workspace.screening.queue",
    actionDescription: "Record PT(IKL) or KU(IKL) decision for the selected application.",
    actionDescriptionKey: "workspace.screening.action",
    showDecision: true,
    showComment: true,
    showTechnicalSiteVisit: true,
    defaultDecision: "PT(IKL) Send to KU(IKL)",
    decisions: [
      { value: "PT(IKL) Send to KU(IKL)", labelKey: "workspace.decision.completeToKu" },
      { value: "KU(IKL) Confirm - Send to Technical Units", labelKey: "workspace.decision.kuToTechnical" },
      { value: "PT(IKL) Reject to Applicant", labelKey: "workspace.decision.rejectApplicant" },
      { value: "KU(IKL) Reject to Applicant", labelKey: "workspace.decision.kuRejectApplicant" },
      { value: "Technical Amendment Required", labelKey: "workspace.decision.technicalAmendment" },
    ],
    commentLabel: "Remarks",
    commentLabelKey: "workspace.comment.remarks",
    commentPlaceholder: "Enter PT(IKL) / KU(IKL) remarks. Required when rejecting.",
    commentPlaceholderKey: "workspace.comment.screeningPlaceholder",
    stats: (apps) => [
      { label: "Total", labelKey: "workspace.stat.total", value: apps.length, icon: "folder" },
      { label: "Pending", labelKey: "workspace.stat.pending", value: countBy(apps, (app) => ["submitted", "incomplete"].includes(normalizeStatus(app.status))), icon: "pending", tone: "amber" },
      { label: "Screened", labelKey: "workspace.stat.screened", value: countBy(apps, (app) => ["ku_ikl_review", "technical_review", "technical_site_visit", "technical_review_completed"].includes(normalizeStatus(app.status))), icon: "fact_check" },
      { label: "Passed", labelKey: "workspace.stat.passed", value: countBy(apps, (app) => ["ku_ikl_review", "technical_review", "technical_site_visit", "technical_review_completed"].includes(normalizeStatus(app.status))), icon: "check_circle" },
    ],
    screeningAction: {
      label: "Submit PT/KU Decision",
      labelKey: "workspace.action.submitScreening",
      icon: "fact_check",
      success: "Screening decision saved.",
      successKey: "workspace.message.screeningSaved",
      buildPayload: buildIklScreeningPayload,
    },
    technicalActions: [
      {
        label: "Supported",
        labelKey: "workspace.decision.supported",
        icon: "check_circle",
        decision: "Supported",
        requiresComment: true,
        success: "Technical review saved.",
        successKey: "workspace.message.technicalSaved",
        buildPayload: buildIklTechnicalDecisionPayload,
      },
      {
        label: "Supported with Conditions",
        labelKey: "workspace.decision.supportedConditions",
        icon: "rule",
        variant: "secondary",
        decision: "Supported with Conditions",
        requiresComment: true,
        success: "Technical review saved.",
        successKey: "workspace.message.technicalSaved",
        buildPayload: buildIklTechnicalDecisionPayload,
      },
      {
        label: "Not Supported",
        labelKey: "workspace.decision.notSupported",
        icon: "cancel",
        variant: "danger",
        decision: "Not Supported",
        disabled: true,
      },
    ],
    kuTechnicalReview: {
      defaultDecision: "KU(IKL) Confirm - Send to KB(LES)",
      decisions: [
        { value: "KU(IKL) Confirm - Send to KB(LES)", labelKey: "workspace.decision.kuConfirmToKb" },
        { value: "KU(IKL) Request Technical Amendment", labelKey: "workspace.decision.kuRequestTechnicalAmendment" },
      ],
      action: {
        label: "Submit",
        labelKey: "common.submit",
        icon: "send",
        requiresComment: false,
        success: "KU(IKL) technical review saved.",
        successKey: "workspace.message.kuTechnicalReviewSaved",
        buildPayload: buildKuTechnicalReviewPayload,
      },
    },
    actions: [],
  },
  technical: {
    key: "technical",
    allowedDepartments: ["BLG", "GPM", "MNE", "IMT", "LNP", "ENG"],
    statuses: TECHNICAL_DEPARTMENT_TASK_STATUSES,
    eyebrow: "Parallel Review",
    eyebrowKey: "workspace.technical.eyebrow",
    title: "Technical Review",
    titleKey: "workspace.technical.title",
    description: "Record department site visit decision and remarks for IKL review.",
    descriptionKey: "workspace.technical.description",
    queueTitle: "Technical Queue",
    queueTitleKey: "workspace.technical.queue",
    actionDescription: "Enter department decision and site finding remarks.",
    actionDescriptionKey: "workspace.technical.action",
    showDecision: true,
    showComment: true,
    showTechnicalSiteVisit: false,
    defaultDecision: "Supported",
    decisions: [
      { value: "Supported", labelKey: "workspace.decision.supported" },
      { value: "Supported with Conditions", labelKey: "workspace.decision.supportedConditions" },
      { value: "Not Supported", labelKey: "workspace.decision.notSupported" },
    ],
    commentLabel: "Remarks",
    commentLabelKey: "workspace.comment.technical",
    commentPlaceholder: "Add department comments, conditions, site notes, or rejection reasons.",
    commentPlaceholderKey: "workspace.comment.technicalPlaceholder",
    stats: (apps, department) => [
      { label: "Pending", labelKey: "workspace.stat.pending", value: countBy(apps, (app) => !hasTechnicalDepartmentReview(app, department)), icon: "pending", tone: "amber" },
      { label: "Completed", labelKey: "workspace.stat.completed", value: countBy(apps, (app) => hasTechnicalDepartmentReview(app, department)), icon: "check_circle" },
      { label: "Supported", labelKey: "workspace.stat.supported", value: countBy(apps, (app) => getTechnicalDepartmentReviews(app)?.[department]?.decision === "Supported"), icon: "check_circle" },
      { label: "Not Supported", labelKey: "workspace.stat.notSupported", value: countBy(apps, (app) => getTechnicalDepartmentReviews(app)?.[department]?.decision === "Not Supported"), icon: "cancel", tone: "red" },
    ],
    actions: [
      {
        label: "Submit",
        labelKey: "common.submit",
        icon: "send",
        requiresComment: true,
        success: "Technical review saved.",
        successKey: "workspace.message.technicalSaved",
        buildPayload: buildDepartmentTechnicalReviewPayload,
      },
    ],
  },
  approval: {
    key: "approval",
    eyebrow: "SUT, KB(LES), and TP/PGH",
    eyebrowKey: "workspace.approval.eyebrow",
    statuses: [
      "management_review",
      "mphlg_processing",
      "mphlg_decision_received",
      "approved",
      "approved_with_conditions",
      "rejected",
      "bill_pending_ku",
      "invoice_generated",
      "payment_submitted",
      "payment_verified",
      "license_issued",
      "license_revoked",
    ],
    title: "Approval",
    titleKey: "workspace.approval.title",
    description: "Record the SUT result, KB(LES) verification, and TP(RES)/PGH final approval.",
    descriptionKey: "workspace.approval.description",
    queueTitle: "Approval Queue",
    queueTitleKey: "workspace.approval.queue",
    actionDescription: "Submit approval decision or remarks.",
    actionDescriptionKey: "workspace.approval.action",
    showDecision: true,
    showComment: true,
    defaultDecision: "Support",
    decisions: [
      { value: "Support", labelKey: "workspace.decision.support" },
      { value: "Reject", labelKey: "workspace.decision.reject" },
    ],
    commentLabel: "Approval Notes",
    commentLabelKey: "workspace.comment.approval",
    commentPlaceholder: "Enter notes if needed. Required when rejecting.",
    commentPlaceholderKey: "workspace.comment.approvalPlaceholder",
    stats: (apps) => [
      { label: "KB(LES)", value: countBy(apps, (app) => getApprovalStageKey(app) === "kb"), icon: "verified_user", tone: "amber" },
      { label: "TP(RES)/PGH", value: countBy(apps, (app) => getApprovalStageKey(app) === "support"), icon: "check_circle", tone: "blue" },
      { label: "MPHLG", value: countBy(apps, (app) => getApprovalStageKey(app) === "mphlg"), icon: "account_balance", tone: "slate" },
      { label: "SUT", value: countBy(apps, (app) => getApprovalStageKey(app) === "sut"), icon: "gavel" },
    ],
    actions: [
      {
        label: "Submit",
        labelKey: "common.submit",
        icon: "check_circle",
        success: "Approval task saved.",
        successKey: "workspace.message.decisionSaved",
        buildPayload: buildApprovalWorkflowPayload,
      },
    ],
  },
  payment: {
    key: "payment",
    allowedDepartments: ["PT(IKL)", "KU(IKL)"],
    statuses: ["approved", "bill_pending_ku", "invoice_generated", "payment_submitted", "payment_verified"],
    listEyebrow: "E-Licenses",
    listEyebrowKey: "workspace.payment.listEyebrow",
    listTitle: "Approval Letter, Bill & Receipt",
    listTitleKey: "workspace.payment.listTitle",
    listDescription: "Select an approved application to generate the approval letter and bill, confirm billing, or review payment receipts.",
    listDescriptionKey: "workspace.payment.listDescription",
    eyebrow: "Payment",
    eyebrowKey: "workspace.payment.eyebrow",
    title: "Invoice and Payment",
    titleKey: "workspace.payment.title",
    description: "PT(IKL) generates approval letters and bills, KU(IKL) confirms bills, and PT(IKL) verifies uploaded payment proof.",
    descriptionKey: "workspace.payment.description",
    queueTitle: "Payment Queue",
    queueTitleKey: "workspace.payment.queue",
    actionDescription: "Generate an approval letter and bill, confirm the bill, then verify whether the uploaded receipt is valid or fake.",
    actionDescriptionKey: "workspace.payment.action",
    showComment: true,
    commentLabel: "Receipt Verification Notes",
    commentLabelKey: "workspace.comment.payment",
    commentPlaceholder: "Add verification notes, receipt issues, or rejection reason.",
    commentPlaceholderKey: "workspace.comment.paymentPlaceholder",
    stats: (apps) => [
      { label: "Pending", labelKey: "workspace.stat.pending", value: countBy(apps, (app) => !app.form_data?.payment), icon: "pending", tone: "amber" },
      { label: "Bill Review", labelKey: "workspace.stat.billReview", value: countBy(apps, (app) => normalizeStatus(app.status) === "bill_pending_ku"), icon: "fact_check", tone: "amber" },
      { label: "Invoiced", labelKey: "workspace.stat.invoiced", value: countBy(apps, (app) => normalizeStatus(app.status) === "invoice_generated"), icon: "receipt_long", tone: "blue" },
      { label: "Submitted", labelKey: "workspace.stat.submitted", value: countBy(apps, (app) => normalizeStatus(app.status) === "payment_submitted"), icon: "payments" },
      { label: "Verified", labelKey: "workspace.stat.verified", value: countBy(apps, (app) => normalizeStatus(app.status) === "payment_verified"), icon: "verified" },
    ],
    actions: [
      {
        label: "Generate Letter & Bill",
        labelKey: "workspace.action.generateInvoice",
        icon: "receipt_long",
        success: "Approval letter and bill generated for KU(IKL) confirmation.",
        successKey: "workspace.message.invoiceGenerated",
        isAvailable: (app, department) =>
          department === "PT(IKL)" && normalizeStatus(app?.status) === "approved",
        buildPayload: (app) => ({
          status: "bill_pending_ku",
          form_data: mergeFormData(app, {
            approval_letter: {
              ...(app.form_data?.approval_letter || {}),
              status: "Generated",
              generated_by: "PT(IKL)",
              generated_at: new Date().toISOString(),
            },
            payment: {
              ...(app.form_data?.payment || {}),
              invoice_no: getInvoiceNo(app),
              amount: getBillAmount(app),
              status: "Pending Bill Confirmation",
              generated_by: "PT(IKL)",
              generated_at: new Date().toISOString(),
            },
          }),
        }),
      },
      {
        label: "Confirm Bill",
        labelKey: "workspace.action.confirmBill",
        icon: "task_alt",
        success: "Bill confirmed and sent to applicant.",
        successKey: "workspace.message.billConfirmed",
        isAvailable: (app, department) =>
          department === "KU(IKL)" && normalizeStatus(app?.status) === "bill_pending_ku",
        buildPayload: (app) => ({
          status: "invoice_generated",
          form_data: mergeFormData(app, {
            payment: {
              ...(app.form_data?.payment || {}),
              invoice_no: getInvoiceNo(app),
              amount: getBillAmount(app),
              status: "Bill Confirmed - Awaiting Payment",
              confirmed_by: "KU(IKL)",
              confirmed_at: new Date().toISOString(),
            },
          }),
        }),
      },
      {
        label: "Verify Receipt",
        labelKey: "workspace.action.verifyPayment",
        icon: "verified",
        success: "Payment verified.",
        successKey: "workspace.message.paymentVerified",
        requiresReceipt: true,
        requiresSubmittedReceipt: true,
        isAvailable: (app, department) =>
          department === "PT(IKL)" && normalizeStatus(app?.status) === "payment_submitted",
        buildPayload: (app, data) => ({
          status: "payment_verified",
          form_data: mergeFormData(app, {
            payment: {
              ...(app.form_data?.payment || {}),
              status: "Payment Verified",
              verification_result: "Valid",
              verification_notes: data.comment,
              verified_at: new Date().toISOString(),
            },
          }),
        }),
      },
      {
        label: "Reject Receipt",
        labelKey: "workspace.action.rejectReceipt",
        icon: "report",
        variant: "danger",
        requiresComment: true,
        requiresReceipt: true,
        requiresSubmittedReceipt: true,
        isAvailable: (app, department) =>
          department === "PT(IKL)" && normalizeStatus(app?.status) === "payment_submitted",
        success: "Receipt rejected. Applicant can upload a new receipt.",
        successKey: "workspace.message.receiptRejected",
        buildPayload: (app, data) => ({
          status: "invoice_generated",
          form_data: mergeFormData(app, {
            payment: {
              ...(app.form_data?.payment || {}),
              status: "Receipt Rejected",
              verification_result: "Invalid/Fake",
              verification_notes: data.comment,
              rejected_at: new Date().toISOString(),
            },
          }),
        }),
      },
    ],
    details: PaymentDetails,
  },
  license: {
    key: "license",
    allowedDepartments: ["PT(IKL)", "KB(LES)", "TP(RES)", "PGH", "TP(RES)/PGH", "TP/PGH", "MPHLG", "SUT"],
    statuses: ["payment_verified", "license_issued", "license_revoked"],
    listEyebrow: "E-Licenses",
    listEyebrowKey: "workspace.license.listEyebrow",
    listTitle: "Advertisement License / QR",
    listTitleKey: "workspace.license.listTitle",
    listDescription: "Open a verified payment record to generate or manage the advertisement license and QR code.",
    listDescriptionKey: "workspace.license.listDescription",
    eyebrow: "Completion",
    eyebrowKey: "workspace.license.eyebrow",
    title: "E-License and QR",
    titleKey: "workspace.license.title",
    description: "Generate advertisement licenses, QR codes, monitor expiry, and issue renewal reminders.",
    descriptionKey: "workspace.license.description",
    queueTitle: "License Queue",
    queueTitleKey: "workspace.license.queue",
    actionDescription: "Generate the advertisement license and QR code after payment is verified.",
    actionDescriptionKey: "workspace.license.action",
    showComment: false,
    stats: (apps) => [
      { label: "Pending", labelKey: "workspace.stat.pending", value: countBy(apps, (app) => normalizeStatus(app.status) !== "license_issued"), icon: "pending", tone: "amber" },
      { label: "Issued", labelKey: "workspace.stat.issued", value: countBy(apps, (app) => normalizeStatus(app.status) === "license_issued"), icon: "qr_code_2" },
      { label: "Revoked", labelKey: "workspace.stat.revoked", value: countBy(apps, (app) => normalizeStatus(app.status) === "license_revoked"), icon: "block", tone: "red" },
      { label: "Active", labelKey: "workspace.stat.active", value: countBy(apps, (app) => app.form_data?.license?.status === "Active"), icon: "verified" },
    ],
    actions: [
      {
        key: "issue_license",
        label: "Issue License",
        labelKey: "workspace.action.issueLicense",
        icon: "qr_code_2",
        success: "E-license issued.",
        successKey: "workspace.message.licenseIssued",
        isAvailable: (app, department) =>
          department === "PT(IKL)" && normalizeStatus(app?.status) === "payment_verified",
        buildPayload: (app, data) => {
          const today = new Date();
          const validityYears = Number(data?.licenseExpiryYears) || 1;
          const expiry = addCalendarYears(today, validityYears);
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
                validity_years: validityYears,
                verification_url: getLicenseVerificationUrl(licenseId),
                issued_at: new Date().toISOString(),
                renewal_reminders: [
                  { months_before_expiry: 3, status: "Scheduled" },
                  { months_before_expiry: 2, status: "Scheduled" },
                  { months_before_expiry: 1, status: "Scheduled" },
                ],
              },
            }),
          };
        },
      },
      {
        label: "Revoke",
        labelKey: "workspace.action.revoke",
        icon: "block",
        variant: "danger",
        success: "License revoked.",
        successKey: "workspace.message.licenseRevoked",
        isAvailable: (app, department) =>
          department === "PT(IKL)" && normalizeStatus(app?.status) === "license_issued",
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
      {
        label: "Reinstate",
        icon: "restart_alt",
        success: "License reinstated.",
        isAvailable: (app, department) =>
          department === "PT(IKL)" && normalizeStatus(app?.status) === "license_revoked",
        buildPayload: (app) => ({
          status: "license_issued",
          form_data: mergeFormData(app, {
            license: {
              ...(app.form_data?.license || {}),
              status: "Active",
              reinstated_at: new Date().toISOString(),
              revoked_at: "",
              revocation_reason: "",
            },
          }),
        }),
      },
      {
        label: "Generate 3-Month Reminder",
        icon: "description",
        endpoint: "license-renewal-action",
        success: "3-month renewal reminder letter generated for supervisor confirmation.",
        isAvailable: (app, department) => canGenerateRenewalReminder(app, department, 3),
        buildPayload: (app, data) => ({
          action: "generate_reminder_letter",
          months: 3,
          note: data.comment,
        }),
      },
      {
        label: "Generate 2-Month Reminder",
        icon: "description",
        endpoint: "license-renewal-action",
        success: "2-month renewal reminder letter generated for supervisor confirmation.",
        isAvailable: (app, department) => canGenerateRenewalReminder(app, department, 2),
        buildPayload: (app, data) => ({
          action: "generate_reminder_letter",
          months: 2,
          note: data.comment,
        }),
      },
      {
        label: "Generate 1-Month Reminder",
        icon: "description",
        endpoint: "license-renewal-action",
        success: "Final renewal reminder letter generated for supervisor confirmation.",
        isAvailable: (app, department) => canGenerateRenewalReminder(app, department, 1),
        buildPayload: (app, data) => ({
          action: "generate_reminder_letter",
          months: 1,
          note: data.comment,
        }),
      },
      {
        label: "Confirm Reminder Letter",
        icon: "verified",
        endpoint: "license-renewal-action",
        success: "Renewal reminder released to the applicant.",
        isAvailable: (app, department) => canConfirmRenewalReminder(app, department),
        buildPayload: (app, data) => ({
          action: "confirm_reminder_letter",
          months: getPendingReminderConfirmationMonth(app),
          note: data.comment,
        }),
      },
      {
        label: "Generate Cancellation Notice",
        icon: "gavel",
        endpoint: "license-renewal-action",
        variant: "danger",
        success: "Cancellation and enforcement notice generated for supervisor confirmation.",
        isAvailable: canGenerateCancellationNotice,
        buildPayload: (app, data) => ({
          action: "generate_cancellation_notice",
          note: data.comment,
        }),
      },
      {
        label: "Confirm Cancellation Notice",
        icon: "fact_check",
        endpoint: "license-renewal-action",
        variant: "danger",
        success: "Cancellation notice confirmed and sent to KB(LES) for support.",
        isAvailable: canConfirmCancellationNotice,
        buildPayload: (app, data) => ({
          action: "confirm_cancellation_notice",
          note: data.comment,
        }),
      },
      {
        label: "Support Cancellation Notice",
        icon: "verified_user",
        endpoint: "license-renewal-action",
        variant: "danger",
        success: "Cancellation notice released to the applicant and license revoked.",
        isAvailable: canSupportCancellationNotice,
        buildPayload: (app, data) => ({
          action: "support_cancellation_notice",
          note: data.comment,
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
  const stepOneComplete = isStepOneComplete(step1, app);
  const locationComplete =
    hasValue(step1.locality_address) &&
    hasValue(step1.map_address) &&
    hasCoordinates(step1);
  const documentsComplete = areSupportingDocumentsComplete(app, step10);
  const declarationComplete =
    Boolean(step11.agreed && step11.submitted) ||
    normalizeStatus(app.status) !== "draft";

  return [
    {
      label: "Application form",
      labelKey: "workspace.check.applicationForm",
      result: stepOneComplete ? "Passed" : "Failed",
      resultKey: stepOneComplete ? "workspace.check.passed" : "workspace.check.failed",
    },
    {
      label: "GIS / location",
      labelKey: "workspace.check.location",
      result: locationComplete ? "Passed" : "Failed",
      resultKey: locationComplete ? "workspace.check.passed" : "workspace.check.failed",
    },
    {
      label: "Supporting documents",
      labelKey: "workspace.check.supportingDocuments",
      result: documentsComplete ? "Passed" : "Failed",
      resultKey: documentsComplete ? "workspace.check.passed" : "workspace.check.failed",
    },
    {
      label: "Applicant declaration",
      labelKey: "workspace.check.declaration",
      result: declarationComplete ? "Passed" : "Failed",
      resultKey: declarationComplete ? "workspace.check.passed" : "workspace.check.failed",
    },
  ];
}

function IklWorkspaceSections({
  t,
  config,
  selectedRecord,
  decision,
  setDecision,
  comment,
  setComment,
  technicalSite,
  setTechnicalSite,
  saving,
  submitAction,
  userDepartment,
}) {
  const status = normalizeStatus(selectedRecord.status);
  const allDepartmentReviewsComplete = areAllTechnicalDepartmentReviewsComplete(selectedRecord);
  const showScreeningDecision = ["submitted", "incomplete", "ku_ikl_review"].includes(status);
  const showTechnicalFinalDecision = [
    "technical_review",
    "technical_site_visit",
    "technical_amendment",
  ].includes(status);
  const showKuTechnicalReview = status === "technical_review_completed";
  const showTechnicalDepartmentRemarks =
    userDepartment === "IKL (TECHNICAL)" || showKuTechnicalReview;
  const showStandaloneTechnicalDepartmentRemarks =
    showTechnicalDepartmentRemarks && !showKuTechnicalReview;
  const [kuDecision, setKuDecision] = useState(
    config.kuTechnicalReview?.defaultDecision || ""
  );
  const [kuRemarks, setKuRemarks] = useState("");
  const [kuChecks, setKuChecks] = useState(() =>
    createKuTechnicalChecks(selectedRecord.form_data?.technical_ku_review?.checks)
  );
  const reviewTechnicalSite = getReviewTechnicalSite(technicalSite, selectedRecord);
  const screeningDecisionOptions = getIklScreeningDecisionOptions(
    config.decisions,
    userDepartment
  );
  const screeningCopy = getIklScreeningCopy(userDepartment);

  useEffect(() => {
    const hasDecision = screeningDecisionOptions.some(
      (item) => (item.value || item) === decision
    );
    if (!hasDecision && screeningDecisionOptions.length > 0) {
      setDecision(screeningDecisionOptions[0].value || screeningDecisionOptions[0]);
    }
  }, [decision, screeningDecisionOptions, setDecision]);

  function updateKuCheck(key, checked) {
    setKuChecks((prev) => ({ ...prev, [key]: checked }));
  }

  async function handleSitePhotoUpload(files) {
    const fileList = Array.from(files || []);
    if (fileList.length === 0) return;

    const sitePhotos = await Promise.all(
      fileList.map((file) =>
        uploadApplicationDocument(
          selectedRecord.id,
          "Technical Site Photo",
          file
        )
      )
    );

    setTechnicalSite((prev) => ({
      ...prev,
      site_photos: [...(prev.site_photos || []), ...sitePhotos],
    }));
  }

  return (
    <div className="space-y-4">
      {showScreeningDecision && (
        <section className="rounded-md border border-slate-200 bg-white p-3">
          <div className="mb-3">
            <h3 className="text-[16px] font-semibold leading-6 text-slate-950">
              {t(screeningCopy.titleKey, screeningCopy.title)}
            </h3>
            <p className="mt-1 text-[14px] leading-5 text-slate-500">
              {t(screeningCopy.descriptionKey, screeningCopy.description)}
            </p>
          </div>

          <div className="space-y-3">
            <Field label={t(config.decisionLabelKey || "common.decision", config.decisionLabel || "Decision")}>
              <select
                value={decision}
                onChange={(event) => setDecision(event.target.value)}
                className={`form-input ${["PT(IKL)", "KU(IKL)"].includes(userDepartment) ? "max-w-64" : ""}`}
              >
                {screeningDecisionOptions.map((item) => (
                  <option key={item.value || item} value={item.value || item}>
                    {getIklScreeningDecisionLabel(item, userDepartment, t)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={t(config.commentLabelKey, config.commentLabel || "Notes")}>
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                rows="4"
                className="form-input"
                placeholder={t(screeningCopy.placeholderKey, screeningCopy.placeholder)}
              />
            </Field>

            <div className="flex justify-end">
              <Button
                icon="fact_check"
                disabled={saving}
                onClick={() => submitAction(config.screeningAction)}
                className="w-full sm:w-auto"
              >
                {saving
                  ? t("workspace.saving")
                  : t(screeningCopy.submitKey, screeningCopy.submitLabel)}
              </Button>
            </div>
          </div>
        </section>
      )}

      {showTechnicalFinalDecision && (
        <section className="space-y-3">
          <TechnicalSiteVisitFields
            t={t}
            applicationId={selectedRecord.id}
            value={technicalSite}
            onChange={setTechnicalSite}
            onFileChange={handleSitePhotoUpload}
          />

          {!allDepartmentReviewsComplete && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[14px] font-medium leading-5 text-amber-800">
              {t("workspace.technical.awaitingDepartmentReviews")}
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {config.technicalActions.map((action) => (
              <Button
                key={action.label}
                onClick={() => {
                  if (action.disabled) return;

                  submitAction(action, {
                    comment: technicalSite.site_remarks,
                    checkDecisionRemark: true,
                  });
                }}
                disabled={saving || !allDepartmentReviewsComplete || action.disabled}
                variant={action.variant || "primary"}
                icon={action.icon}
                className="w-full"
              >
                {saving ? t("workspace.saving") : t(action.labelKey, action.label)}
              </Button>
            ))}
          </div>
        </section>
      )}

      {showKuTechnicalReview && config.kuTechnicalReview && (
        <section className="rounded-md border border-slate-200 bg-white p-3">
          <div className="mb-3">
            <h3 className="text-[16px] font-semibold leading-6 text-slate-950">
              {t("workspace.technical.kuFurtherTitle", "KU(IKL) Further Checking")}
            </h3>
            <p className="mt-1 text-[14px] leading-5 text-slate-500">
              {t("workspace.technical.kuReviewDesc")}
            </p>
          </div>

          <div className="space-y-3">
            <KuTechnicalFurtherReviewPanel
              t={t}
              selectedRecord={selectedRecord}
              technicalSite={reviewTechnicalSite}
              checks={kuChecks}
              onCheckChange={updateKuCheck}
            />

            <Field label={t("common.decision")}>
              <select
                value={kuDecision}
                onChange={(event) => setKuDecision(event.target.value)}
                className="form-input max-w-64"
              >
                {config.kuTechnicalReview.decisions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {t(item.labelKey, item.value)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={t("workspace.comment.remarks")}>
              <textarea
                value={kuRemarks}
                onChange={(event) => setKuRemarks(event.target.value)}
                rows="4"
                className="form-input"
                placeholder={t("workspace.technical.kuReviewPlaceholder")}
              />
            </Field>

            <div className="flex justify-end">
              <Button
                icon={config.kuTechnicalReview.action.icon}
                disabled={saving}
                onClick={() =>
                  submitAction(config.kuTechnicalReview.action, {
                    decision: kuDecision,
                    comment: kuRemarks,
                    kuChecks,
                    checkDecisionRemark: true,
                  })
                }
                className="w-full sm:w-auto"
              >
                {saving
                  ? t("workspace.saving")
                  : t("common.submit", "Submit")}
              </Button>
            </div>
          </div>
        </section>
      )}

      {showStandaloneTechnicalDepartmentRemarks && (
        <TechnicalDepartmentRemarks app={selectedRecord} t={t} />
      )}
    </div>
  );
}

function getReviewTechnicalSite(technicalSite, selectedRecord) {
  const saved = selectedRecord?.form_data?.technical_site_visit || {};
  const savedPhotos = Array.isArray(saved.site_photos)
    ? saved.site_photos
    : saved.site_photo
      ? [saved.site_photo]
      : [];
  const currentPhotos = Array.isArray(technicalSite.site_photos)
    ? technicalSite.site_photos
    : [];
  const feeItems = normalizeTechnicalFeeItems(
    technicalSite.fee_items || saved.fee_items
  );
  const feeTotals = getTechnicalFeeTotals(feeItems);

  return {
    site_photos: currentPhotos.length > 0 ? currentPhotos : savedPhotos,
    fee_date: technicalSite.fee_date || saved.fee_date || "",
    fee_items: feeItems,
    fee_total: feeTotals.grandTotal || saved.fee_total || "",
    license_fee_calculation:
      technicalSite.license_fee_calculation || saved.license_fee_calculation || (feeTotals.feeTotal ? String(feeTotals.feeTotal) : ""),
    deposit_calculation:
      technicalSite.deposit_calculation || saved.deposit_calculation || (feeTotals.depositTotal ? String(feeTotals.depositTotal) : ""),
    site_remarks:
      technicalSite.site_remarks ||
      saved.site_remarks ||
      saved.site_photo_note ||
      "",
  };
}

function getIklScreeningCopy(department) {
  if (department === "PT(IKL)") {
    return {
      actionDescriptionKey: "workspace.screening.actionPt",
      actionDescription: "Record PT(IKL) decision for the selected application.",
      titleKey: "workspace.ikl.ptScreeningTitle",
      title: "PT(IKL) Verification",
      descriptionKey: "workspace.ikl.ptScreeningDesc",
      description: "Review applicant information and documents, then send the application onward or reject it with remarks.",
      placeholderKey: "workspace.comment.ptScreeningPlaceholder",
      placeholder: "Required when rejecting.",
      submitKey: "common.submit",
      submitLabel: "Submit",
    };
  }

  if (department === "KU(IKL)") {
    return {
      actionDescriptionKey: "workspace.screening.actionKu",
      actionDescription: "Record KU(IKL) decision for the selected application.",
      titleKey: "workspace.ikl.kuScreeningTitle",
      title: "KU(IKL) Verification",
      descriptionKey: "workspace.ikl.kuScreeningDesc",
      description: "Review the screening result, then send the application to technical review or reject it with remarks.",
      placeholderKey: "workspace.comment.kuScreeningPlaceholder",
      placeholder: "Required when rejecting.",
      submitKey: "common.submit",
      submitLabel: "Submit",
    };
  }

  return {
    actionDescriptionKey: "workspace.screening.action",
    actionDescription: "Record PT(IKL) or KU(IKL) decision for the selected application.",
    titleKey: "workspace.ikl.screeningTitle",
    title: "PT(IKL) / KU(IKL) Verification",
    descriptionKey: "workspace.ikl.screeningDesc",
    description: "Use this section to send to KU(IKL), send to technical review, or reject to the applicant with remarks.",
    placeholderKey: "workspace.comment.screeningPlaceholder",
    placeholder: "Enter PT(IKL) / KU(IKL) remarks. Required when rejecting.",
    submitKey: "workspace.action.submitScreening",
    submitLabel: "Submit PT/KU Decision",
  };
}

function KuTechnicalFurtherReviewPanel({
  t,
  selectedRecord,
  technicalSite,
  checks,
  onCheckChange,
  readOnly = false,
}) {
  const reviewTechnicalSite = getReviewTechnicalSite(technicalSite, selectedRecord);
  const formData = selectedRecord.form_data || {};
  const step1 = formData.step_1 || {};
  const technicalReview = formData.technical_review || {};
  const completedDepartmentCount = TECHNICAL_DEPARTMENTS.filter(
    (department) => hasTechnicalDepartmentReview(selectedRecord, department)
  ).length;
  const completedText = t("workspace.technical.completedDepartments", "{count} of {total} completed")
    .replace("{count}", String(completedDepartmentCount))
    .replace("{total}", String(TECHNICAL_DEPARTMENTS.length));
  const feeItems = normalizeTechnicalFeeItems(reviewTechnicalSite.fee_items).filter(
    (item) => item.item || item.account_code || item.amount
  );
  const technicalSitePhotos = Array.isArray(reviewTechnicalSite.site_photos)
    ? reviewTechnicalSite.site_photos
    : [];
  const checklist = [
    ["application", t("workspace.technical.checkApplication")],
    ["sitePhoto", t("workspace.technical.checkSitePhoto")],
    ["fees", t("workspace.technical.checkFees")],
    ["departments", t("workspace.technical.checkDepartments")],
  ];

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-slate-200 bg-white p-3">
        <h4 className="mb-3 text-[15px] font-semibold leading-6 text-slate-950">
          {t("workspace.technical.iklSubmissionSummary")}
        </h4>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Info
            label={t("common.reference")}
            value={getApplicationReference(selectedRecord)}
          />
          <Info
            label={t("common.project")}
            value={getProjectName(selectedRecord)}
          />
          <Info
            label={t("workspace.location")}
            value={getApplicationLocation(selectedRecord)}
          />
          <Info
            label={t("workspace.technical.coordinates", "Coordinates")}
            value={getApplicationCoordinates(step1)}
          />
          <Info
            label={t("common.decision")}
            value={formatDecisionValue(technicalReview.final_decision || technicalReview.decision, t)}
          />
          <Info
            label={t("workspace.technical.departmentFeedbackStatus")}
            value={completedText}
          />
          <Info
            label={t("workspace.technical.siteVisitDate", "Site Visit Date")}
            value={formatDateTime(formData.technical_site_visit?.visited_at)}
          />
          <Info
            label={t("workspace.technical.siteRemarks")}
            value={
              reviewTechnicalSite.site_remarks ||
              technicalReview.comment ||
              technicalReview.remarks ||
              "-"
            }
          />
        </div>
      </div>

        <div className="rounded-md border border-slate-200 bg-white p-3">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h4 className="text-[15px] font-semibold leading-6 text-slate-950">
              {t("workspace.technical.feeBreakdown")}
            </h4>
            <p className="text-[15px] font-semibold leading-6 text-slate-950">
              {t("workspace.technical.grandTotal")}: {formatCurrency(getTechnicalFeeTotal(feeItems))}
            </p>
          </div>
          {feeItems.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-500">
              {t("workspace.technical.noFeeItems")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[14px] leading-5">
                <thead>
                  <tr className="border-b border-slate-200 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2">{t("workspace.technical.feeItem")}</th>
                    <th className="px-2 py-2">{t("workspace.technical.accountCode")}</th>
                    <th className="px-2 py-2 text-right">{t("workspace.technical.cashChequeAmount")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {feeItems.map((item) => {
                    const option = getTechnicalFeeOption(item.item);
                    return (
                      <tr key={item.id}>
                        <td className="px-2 py-2">{option?.label || item.item || "-"}</td>
                        <td className="px-2 py-2">{item.account_code || option?.accountCode || "-"}</td>
                        <td className="px-2 py-2 text-right">{formatReportAmount(item.amount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <ReportPhotoGrid
          t={t}
          title={t("workspace.technical.siteVisitEvidence")}
          emptyText={t("workspace.info.notSubmitted", "Not submitted")}
          applicationId={selectedRecord.id}
          photos={technicalSitePhotos}
        />

        <TechnicalDepartmentRemarks app={selectedRecord} t={t} />

      <div className="rounded-md border border-slate-200 bg-white p-3">
        <h4 className="mb-3 text-[15px] font-semibold leading-6 text-slate-950">
          {t("workspace.technical.reviewChecklist")}
        </h4>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {checklist.map(([key, label]) => (
            <label
              key={key}
              className="flex min-h-11 items-start gap-2 rounded-md border border-slate-200 px-3 py-2 text-[14px] leading-5 text-slate-800"
            >
              <input
                type="checkbox"
                checked={Boolean(checks?.[key])}
                disabled={readOnly}
                onChange={(event) => {
                  if (readOnly) return;
                  onCheckChange?.(key, event.target.checked);
                }}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function ApprovalTechnicalReviewSummary({
  t,
  selectedRecord,
  technicalSite,
  title,
  description,
  userDepartment,
}) {
  const reviewTechnicalSite = getReviewTechnicalSite(technicalSite, selectedRecord);
  const formData = selectedRecord.form_data || {};
  const step1 = formData.step_1 || {};
  const technicalReview = selectedRecord.form_data?.technical_review || {};
  const kuReview = selectedRecord.form_data?.technical_ku_review || {};
  const kuDecision = formatDecisionValue(kuReview.decision || kuReview.status, t);
  const kuRemarks = kuReview.remarks || kuReview.comment || "-";
  const isKbVerificationReport =
    normalizeDepartmentCode(userDepartment) === "KB(LES)" &&
    getApprovalStageKey(selectedRecord) === "kb";
  const reportStatus =
    kuReview.status ||
    kuReview.decision ||
    technicalReview.final_decision ||
    technicalReview.decision ||
    selectedRecord.latest_remark ||
    "-";

  if (isKbVerificationReport) {
    return (
      <section className="overflow-hidden rounded-md border border-slate-200 bg-white">
        <div className="border-b border-slate-200 bg-slate-50 px-3 py-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold uppercase leading-5 tracking-wide text-slate-500">
                {t("workspace.approval.recommendationReport", "Verification Report")}
              </p>
              <h3 className="mt-1 text-[16px] font-semibold leading-6 text-slate-950">
                {t("workspace.approval.technicalSummaryTitle", "KU(IKL) Final Checking")}
              </h3>
              <p className="mt-1 text-[14px] leading-5 text-slate-500">
                {t("workspace.approval.technicalSummaryDesc", "Review KU(IKL)'s final technical check before verifying this application.")}
              </p>
            </div>
            <StatusPill value={formatDecisionValue(reportStatus, t)} />
          </div>
        </div>

        <div className="p-3">
          <KuTechnicalFurtherReviewPanel
            t={t}
            selectedRecord={selectedRecord}
            technicalSite={reviewTechnicalSite}
            checks={createKuTechnicalChecks(kuReview.checks)}
            readOnly
          />
        </div>
      </section>
    );
  }

  const applicantSitePhotos = getApplicantSitePhotos(selectedRecord);
  const technicalSitePhotos = Array.isArray(reviewTechnicalSite.site_photos)
    ? reviewTechnicalSite.site_photos
    : [];
  const coordinates = getApplicationCoordinates(step1);

  return (
    <section className="overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold uppercase leading-5 tracking-wide text-slate-500">
              {t("workspace.approval.recommendationReport", "Recommendation Report")}
            </p>
            <h3 className="mt-1 text-[16px] font-semibold leading-6 text-slate-950">
              {title || t("workspace.approval.technicalSummaryTitle", "Technical Report")}
            </h3>
            <p className="mt-1 text-[14px] leading-5 text-slate-500">
              {description ||
                t(
                  "workspace.approval.technicalSummaryDesc",
                  "Review the compiled application details, site photos, fee calculations, technical remarks, and KU(IKL) final check before making a decision."
                )}
            </p>
          </div>
          <StatusPill value={formatDecisionValue(reportStatus, t)} />
        </div>
      </div>

      <div className="space-y-3 p-3">
        {!isKbVerificationReport && (
          <div className="rounded-md border border-slate-200 bg-white p-3">
            <h4 className="mb-3 text-[15px] font-semibold leading-6 text-slate-950">
              {t("workspace.approval.applicationFacts", "Application Facts")}
            </h4>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Info label={t("common.reference")} value={getApplicationReference(selectedRecord)} />
              <Info label={t("common.applicant")} value={getApplicantName(selectedRecord)} />
              <Info label={t("common.type")} value={getLocalizedApplicationType(selectedRecord, t)} />
              <Info label={t("common.project")} value={getProjectName(selectedRecord)} />
              <Info label={t("workspace.location")} value={getApplicationLocation(selectedRecord)} />
              <Info
                label={t("workspace.applicationDate", "Application Date")}
                value={formatDate(step1.application_date)}
              />
              <Info
                label={t("workspace.technical.coordinates", "Coordinates")}
                value={coordinates}
              />
              <Info
                label={t("workspace.created")}
                value={formatDateTime(selectedRecord.created_at)}
              />
              <Info
                label={t("common.updated")}
                value={formatDateTime(selectedRecord.updated_at)}
              />
            </div>
          </div>
        )}

        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <h4 className="mb-3 text-[15px] font-semibold leading-6 text-slate-950">
            {isKbVerificationReport
              ? t("workspace.approval.kuFinalCheck", "KU(IKL) Final Checking Result")
              : t("workspace.approval.technicalRecommendation", "Technical Recommendation")}
          </h4>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Info
              label={t("workspace.approval.finalTechnicalDecision", "Final Technical Decision")}
              value={formatDecisionValue(technicalReview.final_decision || technicalReview.decision, t)}
            />
            <Info
              label={t("workspace.technical.kuDecision", "KU(IKL) Decision")}
              value={kuDecision}
            />
            <Info
              label={t("workspace.technical.reviewedBy", "Reviewed By")}
              value={kuReview.reviewed_by || "KU(IKL)"}
            />
            <Info
              label={t("workspace.technical.reviewedAt", "Reviewed At")}
              value={formatDateTime(kuReview.reviewed_at)}
            />
          </div>
          {!isKbVerificationReport && (
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              <Info
                label={t("workspace.technical.licenseFee")}
                value={formatReportAmount(reviewTechnicalSite.license_fee_calculation)}
              />
              <Info
                label={t("workspace.technical.deposit")}
                value={formatReportAmount(reviewTechnicalSite.deposit_calculation)}
              />
              <Info
                label={t("workspace.technical.siteVisitDate", "Site Visit Date")}
                value={formatDateTime(formData.technical_site_visit?.visited_at)}
              />
            </div>
          )}
          <div className="mt-3">
            <Info
              label={t("workspace.comment.remarks", "Remarks")}
              value={kuRemarks}
            />
          </div>
          <div className="mt-3">
            <Info
              label={t("workspace.technical.siteRemarks")}
              value={
                reviewTechnicalSite.site_remarks ||
                technicalReview.comment ||
                technicalReview.remarks ||
                "-"
              }
            />
          </div>
        </div>

        {!isKbVerificationReport && (
          <>
            <ReportPhotoGrid
              t={t}
              title={t("workspace.siteImage", "Applicant Site Image")}
              emptyText={t("workspace.info.notSubmitted", "Not submitted")}
              applicationId={selectedRecord.id}
              photos={applicantSitePhotos}
            />

            <ReportPhotoGrid
              t={t}
              title={t("workspace.technical.sitePhoto")}
              emptyText={t("workspace.info.notSubmitted", "Not submitted")}
              applicationId={selectedRecord.id}
              photos={technicalSitePhotos}
            />

            <TechnicalDepartmentRemarks app={selectedRecord} t={t} />
          </>
        )}
      </div>
    </section>
  );
}

function ReportPhotoGrid({ t, title, emptyText, applicationId, photos }) {
  const reportPhotos = Array.isArray(photos) ? photos : [];

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <h4 className="text-[15px] font-semibold leading-6 text-slate-950">
        {title}
      </h4>
      {reportPhotos.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-500">
          {emptyText}
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {reportPhotos.map((photo, index) => (
            <div
              key={`${photo.name || photo.title || title}-${index}`}
              className="overflow-hidden rounded-md border border-slate-200 bg-white"
            >
              <SitePhotoPreview
                photo={photo}
                applicationId={applicationId}
                alt={`${title} ${index + 1}`}
              />
              <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                <span className="truncate text-[14px] font-medium leading-5 text-slate-600">
                  {photo.name || photo.title || `${title} ${index + 1}`}
                </span>
                <SitePhotoActions
                  photo={photo}
                  applicationId={applicationId}
                  hideDelete
                  labels={{
                    view: t("common.view"),
                    download: t("common.download"),
                    delete: t("common.delete"),
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function getApplicantSitePhotos(app) {
  const step1 = app?.form_data?.step_1 || {};
  const documents = Array.isArray(app?.supporting_documents)
    ? app.supporting_documents
    : [];
  const documentPhotos = documents
    .filter((document) => document.title === "Site Image")
    .map((document) => ({
      ...document,
      document_id: document.id,
      name: getFileNameFromUrl(document.file_url || document.file) || document.title,
      url: document.file_url || document.file || "",
      file_url: document.file_url || document.file || "",
    }));

  if (documentPhotos.length > 0) return documentPhotos;

  const savedPhoto = step1.site_image || null;

  if (savedPhoto) {
    return [
      {
        ...savedPhoto,
        document_id:
          savedPhoto.document_id ||
          savedPhoto.id ||
          step1.site_image_document_id ||
          "",
        name:
          savedPhoto.name ||
          step1.site_image_name ||
          getFileNameFromUrl(savedPhoto.file_url || savedPhoto.file || step1.site_image_url) ||
          "Site Image",
        url: savedPhoto.url || savedPhoto.file_url || step1.site_image_url || "",
        file_url: savedPhoto.file_url || savedPhoto.url || step1.site_image_url || "",
      },
    ];
  }

  if (step1.site_image_url || step1.site_image_preview) {
    return [
      {
        document_id: step1.site_image_document_id || "",
        name: step1.site_image_name || "Site Image",
        url: step1.site_image_url || step1.site_image_preview,
        file_url: step1.site_image_url || step1.site_image_preview,
      },
    ];
  }

  return [];
}

function getApplicationCoordinates(step1) {
  const latitude = step1.latitude;
  const longitude = step1.longitude;

  if (!hasValue(latitude) || !hasValue(longitude)) return "-";

  return `${latitude}, ${longitude}`;
}

function formatReportAmount(value) {
  const text = String(value || "").trim();
  if (!text) return "-";
  if (/^rm\s/i.test(text)) return text;

  const numeric = Number(text.replace(/[^\d.-]/g, ""));
  const isPlainNumber = /^-?\d+(\.\d+)?$/.test(text);

  if (isPlainNumber && Number.isFinite(numeric)) {
    return formatCurrency(numeric);
  }

  return text;
}

function TechnicalDepartmentRemarks({ app, t }) {
  const reviews = getTechnicalDepartmentReviews(app);

  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-3 py-2">
        <h3 className="text-[16px] font-semibold leading-6 text-slate-950">
          {t("workspace.technical.compiledRemarksTitle")}
        </h3>
        <p className="mt-1 text-[14px] leading-5 text-slate-500">
          {t("workspace.technical.compiledRemarksDesc")}
        </p>
      </div>
      <div className="divide-y divide-slate-100">
        <div className="hidden grid-cols-1 gap-4 bg-slate-50 px-3 py-2 text-[13px] font-semibold uppercase leading-5 tracking-wide text-slate-500 md:grid md:grid-cols-[110px_210px_1fr]">
          <div>{t("common.department", "Department")}</div>
          <div>{t("common.status", "Status")}</div>
          <div>{t("workspace.comment.remarks", "Remarks")}</div>
        </div>
        {TECHNICAL_DEPARTMENTS.map((department) => {
          const review = reviews?.[department];

          return (
            <div key={department} className="grid grid-cols-1 gap-4 px-3 py-2 text-[14px] leading-5 md:grid-cols-[110px_210px_1fr]">
              <div className="font-semibold text-slate-950">{department}</div>
              <div>
                <StatusPill
                  value={
                    review?.decision
                      ? t(getDecisionLabelKey(review.decision), review.decision)
                      : t("workspace.stat.pending")
                  }
                />
              </div>
              <div className="min-w-0 text-slate-700">
                {review?.remarks ? (
                  <>
                    <p className="whitespace-pre-wrap leading-5">{review.remarks}</p>
                    <p className="mt-1 text-[13px] leading-5 text-slate-400">
                      {formatDateTime(review.reviewed_at)}
                    </p>
                  </>
                ) : (
                  <span className="text-slate-400">{t("workspace.info.notSubmitted")}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getDecisionLabelKey(value) {
  const map = {
    Verify: "workspace.decision.verify",
    Verified: "workspace.decision.verified",
    Reject: "workspace.decision.reject",
    Rejected: "workspace.decision.rejected",
    Supported: "workspace.decision.supported",
    "Supported with Conditions": "workspace.decision.supportedConditions",
    "Not Supported": "workspace.decision.notSupported",
    "Requires Amendment": "workspace.decision.requiresAmendment",
    "KU(IKL) Confirm - Send to KB(LES)": "workspace.decision.kuVerifiedToKb",
    "Verified - Sent to KB(LES)": "workspace.decision.kuVerifiedToKb",
    "KU(IKL) Request Technical Amendment": "workspace.decision.kuRequestTechnicalAmendment",
  };

  return map[value] || value;
}

function formatDecisionValue(value, t) {
  const cleanValue = String(value || "").trim();
  if (!cleanValue || cleanValue === "-") return "-";

  const labelKey = getDecisionLabelKey(cleanValue);
  return labelKey === cleanValue ? cleanValue : t(labelKey, cleanValue);
}

function getIklScreeningDecisionLabel(item, department, t) {
  const value = item.value || item;

  if (department === "PT(IKL)") {
    if (value === "PT(IKL) Send to KU(IKL)") {
      return t("workspace.decision.approve", "Approve");
    }

    if (value === "PT(IKL) Reject to Applicant") {
      return t("workspace.decision.reject", "Reject");
    }
  }

  if (department === "KU(IKL)") {
    if (value === "KU(IKL) Confirm - Send to Technical Units") {
      return t("workspace.decision.approve", "Approve");
    }

    if (value === "KU(IKL) Reject to Applicant") {
      return t("workspace.decision.reject", "Reject");
    }
  }

  return t(item.labelKey, item.label || item);
}

function getIklScreeningDecisionOptions(decisions, department) {
  const allowed = {
    "PT(IKL)": new Set([
      "PT(IKL) Send to KU(IKL)",
      "PT(IKL) Reject to Applicant",
    ]),
    "KU(IKL)": new Set([
      "KU(IKL) Confirm - Send to Technical Units",
      "KU(IKL) Reject to Applicant",
    ]),
  }[department];

  if (!allowed) return decisions;

  return decisions.filter((item) => allowed.has(item.value || item));
}

function TechnicalSiteVisitFields({ t, applicationId, value, onChange, onFileChange }) {
  const sitePhotos = Array.isArray(value.site_photos) ? value.site_photos : [];
  const feeItems = normalizeTechnicalFeeItems(value.fee_items);
  const feeTotal = getTechnicalFeeTotal(feeItems);
  const [deletingIndex, setDeletingIndex] = useState(null);

  function updateField(field, nextValue) {
    onChange((prev) => ({ ...prev, [field]: nextValue }));
  }

  function updateFeeItems(nextItems) {
    const normalizedItems = normalizeTechnicalFeeItems(nextItems);
    const totals = getTechnicalFeeTotals(normalizedItems);

    onChange((prev) => ({
      ...prev,
      fee_items: normalizedItems,
      fee_total: totals.grandTotal,
      license_fee_calculation: totals.feeTotal ? String(totals.feeTotal) : "",
      deposit_calculation: totals.depositTotal ? String(totals.depositTotal) : "",
    }));
  }

  function updateFeeItem(index, updates) {
    updateFeeItems(
      feeItems.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...updates } : item
      )
    );
  }

  function handleFeeSelection(index, selectedValue) {
    const option = getTechnicalFeeOption(selectedValue);
    updateFeeItem(index, {
      item: selectedValue,
      account_code: option?.accountCode || "",
    });
  }

  function addFeeItem() {
    updateFeeItems([...feeItems, createTechnicalFeeItem()]);
  }

  function removeFeeItem(index) {
    updateFeeItems(
      feeItems.length > 1
        ? feeItems.filter((_, itemIndex) => itemIndex !== index)
        : [createTechnicalFeeItem()]
    );
  }

  async function removePhoto(photo, index) {
    try {
      setDeletingIndex(index);

      if (photo?.document_id) {
        await deleteApplicationDocument(applicationId, photo.document_id);
      }

      onChange((prev) => ({
        ...prev,
        site_photos: (prev.site_photos || []).filter((_, itemIndex) => itemIndex !== index),
      }));
    } finally {
      setDeletingIndex(null);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-emerald-100 bg-emerald-50/40 p-3">
      <div>
        <h3 className="text-[16px] font-semibold leading-6 text-slate-950">
          {t("workspace.technical.siteVisitTitle")}
        </h3>
        <p className="mt-1 text-[14px] leading-5 text-slate-600">
          {t("workspace.technical.siteVisitDesc")}
        </p>
      </div>

      <div>
        <p className="mb-1.5 text-[14px] font-semibold leading-5 text-slate-700">
          {t("workspace.technical.sitePhoto")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex min-h-9 cursor-pointer items-center justify-center rounded-md border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-[14px] font-semibold leading-5 text-white hover:bg-emerald-800">
            <Icon name="add_photo_alternate" className="mr-1 text-base" />
            {t("workspace.technical.uploadSitePhoto")}
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                onFileChange(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
          {sitePhotos.length > 0 && (
            <span className="text-[14px] font-medium leading-5 text-emerald-700">
              {t("workspace.technical.sitePhotoUploaded")}: {sitePhotos.length}
            </span>
          )}
        </div>
      </div>

      {sitePhotos.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {sitePhotos.map((photo, index) => (
            <div key={`${photo.name || "site-photo"}-${index}`} className="overflow-hidden rounded-md border border-slate-200 bg-white">
              <SitePhotoPreview
                photo={photo}
                applicationId={applicationId}
                alt={`${t("workspace.technical.sitePhoto")} ${index + 1}`}
              />
              <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                <span className="truncate text-[14px] font-medium leading-5 text-slate-600">
                  {photo.name || `${t("workspace.technical.sitePhoto")} ${index + 1}`}
                </span>
                <SitePhotoActions
                  photo={photo}
                  applicationId={applicationId}
                  disabled={deletingIndex === index}
                  onRemove={() => removePhoto(photo, index)}
                  labels={{
                    view: t("common.view"),
                    download: t("common.download"),
                    delete: t("common.delete"),
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3 rounded-md border border-slate-200 bg-white p-3">
        <Field label={t("workspace.technical.feeDate", "Date")} className="max-w-xs">
          <input
            type="date"
            value={value.fee_date || ""}
            onChange={(event) => updateField("fee_date", event.target.value)}
            className="form-input min-h-9"
          />
        </Field>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[14px] leading-5">
            <thead>
              <tr className="border-b border-slate-200 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">{t("workspace.technical.feeItem", "Item")}</th>
                <th className="px-2 py-2">{t("workspace.technical.accountCode", "Account Code")}</th>
                <th className="px-2 py-2">{t("workspace.technical.cashChequeAmount", "Cash/Cheque (RM)")}</th>
                <th className="w-12 px-2 py-2 text-right">{t("common.action", "Action")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {feeItems.map((item, index) => (
                <tr key={item.id}>
                  <td className="px-2 py-2">
                    <select
                      value={item.item}
                      onChange={(event) => handleFeeSelection(index, event.target.value)}
                      className="form-input min-h-9"
                    >
                      <option value="">{t("workspace.technical.selectFeeItem", "-sila pilih-")}</option>
                      {TECHNICAL_FEE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <input
                      value={item.account_code}
                      readOnly
                      className="form-input min-h-9 bg-slate-50 text-slate-600"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      value={item.amount}
                      onChange={(event) => updateFeeItem(index, { amount: event.target.value })}
                      className="form-input min-h-9"
                      inputMode="decimal"
                      placeholder="0.00"
                    />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => removeFeeItem(index)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                      aria-label={t("workspace.technical.removeFeeItem", "Remove item")}
                    >
                      <Icon name="remove" className="text-[20px]" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={addFeeItem}
            className="inline-flex min-h-9 items-center justify-center rounded-md border border-emerald-700 px-3 py-1.5 text-[14px] font-semibold leading-5 text-emerald-700 hover:bg-emerald-50"
          >
            <Icon name="add" className="mr-1 text-[18px]" />
            {t("workspace.technical.addFeeItem", "Add item")}
          </button>
          <div className="text-right">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">
              {t("workspace.technical.grandTotal", "Grand Total")}
            </p>
            <p className="text-[18px] font-semibold text-slate-950">
              {formatCurrency(feeTotal)}
            </p>
          </div>
        </div>
      </div>

      <Field label={t("workspace.technical.siteRemarks")}>
        <textarea
          value={value.site_remarks}
          onChange={(event) => updateField("site_remarks", event.target.value)}
          rows="4"
          className="form-input"
          placeholder={t("workspace.technical.siteRemarksPlaceholder")}
        />
      </Field>
    </div>
  );
}

function getSitePhotoSource(photo, applicationId) {
  return (
    photo?.dataUrl ||
    (photo?.document_id ? getApplicationDocumentUrl(applicationId, photo.document_id) : "") ||
    photo?.url ||
    photo?.file_url ||
    photo?.file ||
    ""
  );
}

async function getSitePhotoBlobUrl(photo, applicationId) {
  const source = getSitePhotoSource(photo, applicationId);
  if (!source) return { url: "", revoke: false };

  if (source.startsWith("blob:")) return { url: source, revoke: false };

  const blob = await fetchAuthenticatedBlob(source);
  return { url: URL.createObjectURL(blob), revoke: true };
}

function SitePhotoActions({ photo, applicationId, disabled, onRemove, labels, hideDelete = false }) {
  async function viewPhoto() {
    const { url, revoke } = await getSitePhotoBlobUrl(photo, applicationId);

    if (!url) return;

    window.open(url, "_blank", "noopener,noreferrer");

    if (revoke) {
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  }

  async function downloadPhoto() {
    const { url, revoke } = await getSitePhotoBlobUrl(photo, applicationId);
    if (!url) return;

    const link = document.createElement("a");
    link.href = url;
    link.download = photo?.name || "site-photo";
    document.body.appendChild(link);
    link.click();
    link.remove();

    if (revoke) {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  const actions = [
    { icon: "visibility", label: labels.view, onClick: viewPhoto },
    { icon: "download", label: labels.download, onClick: downloadPhoto },
    hideDelete ? null : { icon: "delete", label: labels.delete, onClick: onRemove, danger: true },
  ].filter(Boolean);

  return (
    <div className="flex shrink-0 items-center gap-1">
      {actions.map((action) => (
        <button
          key={action.icon}
          type="button"
          title={action.label}
          aria-label={action.label}
          disabled={disabled}
          onClick={action.onClick}
          className={`rounded p-1 transition disabled:cursor-not-allowed disabled:opacity-50 ${
            action.danger
              ? "text-red-600 hover:bg-red-50 hover:text-red-700"
              : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          }`}
        >
          <Icon name={action.icon} className="text-[18px]" />
        </button>
      ))}
    </div>
  );
}

function SitePhotoPreview({ photo, applicationId, alt }) {
  const source = getSitePhotoSource(photo, applicationId);
  const isInlinePreview =
    typeof source === "string" &&
    (source.startsWith("blob:") || source.startsWith("data:"));
  const [remotePreview, setRemotePreview] = useState({
    source: "",
    url: "",
    error: false,
  });
  const displayPreview = isInlinePreview
    ? source
    : remotePreview.source === source
      ? remotePreview.url
      : "";

  useEffect(() => {
    let isActive = true;
    let objectUrl = "";

    if (!source || isInlinePreview) {
      return undefined;
    }

    fetchAuthenticatedBlob(source)
      .then((blob) => {
        if (!isActive) return;
        objectUrl = URL.createObjectURL(blob);
        setRemotePreview({ source, url: objectUrl, error: false });
      })
      .catch((error) => {
        console.error("Failed to load site visit photo preview:", error);
        if (isActive) {
          setRemotePreview({ source, url: "", error: true });
        }
      });

    return () => {
      isActive = false;

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [isInlinePreview, source]);

  if (!source) {
    return <div className="h-32 bg-slate-50" />;
  }

  if (displayPreview) {
    return (
      <img
        src={displayPreview}
        alt={alt}
        className="h-32 w-full object-cover"
      />
    );
  }

  return (
    <div className="flex h-32 items-center justify-center bg-slate-50 px-3 text-center text-xs text-slate-500">
      {remotePreview.error ? "Site photo could not be loaded." : "Loading site photo..."}
    </div>
  );
}

function PaymentDetails({ app, t }) {
  const payment = app.form_data?.payment || {};
  const receiptFile = payment.receipt_file;
  const notGenerated = t("workspace.info.notGenerated");
  const amount = getBillAmount(app);
  const receiptSource = getPaymentReceiptSource(receiptFile);

  async function viewReceipt() {
    if (!receiptSource) return;

    try {
      const isInlineFile =
        receiptSource.startsWith("blob:") || receiptSource.startsWith("data:");
      const url = isInlineFile
        ? receiptSource
        : URL.createObjectURL(await fetchAuthenticatedBlob(receiptSource));

      window.open(url, "_blank", "noopener,noreferrer");

      if (!isInlineFile) {
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    } catch (error) {
      console.error("Failed to open payment receipt:", error);
      window.alert(t("workspace.info.receiptViewFailed", "Unable to open the receipt. Please try again."));
    }
  }

  return (
    <div className="grid grid-cols-1 gap-3 text-sm">
      <Info label={t("common.invoice")} value={getInvoiceNo(app) || notGenerated} />
      <Info
        label={t("common.amount")}
        value={hasValue(amount) ? formatCurrency(amount) : notGenerated}
      />
      <Info
        label={t("common.status")}
        value={getPaymentDetailStatus(payment.status, t) || notGenerated}
      />
      <Info label={t("workspace.info.receipt")} value={receiptFile?.name || payment.receipt_reference || t("workspace.info.notSubmitted")} />
      {receiptSource && (
        <button
          type="button"
          onClick={viewReceipt}
          className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-emerald-700 hover:underline"
        >
          <Icon name="visibility" className="text-base" />
          {t("workspace.info.viewReceipt")}
        </button>
      )}
      {payment.verification_result && (
        <Info label={t("workspace.info.verificationResult")} value={payment.verification_result} />
      )}
      {payment.verification_notes && (
        <Info label={t("workspace.info.verificationNotes")} value={payment.verification_notes} />
      )}
    </div>
  );
}

function getPaymentDetailStatus(status, t) {
  const value = String(status || "").trim();
  if (!value) return "";

  if (/pending\s+ku\(ikl\)\s+bill\s+confirmation/i.test(value)) {
    return t("status.bill_pending_ku", "Pending Bill Confirmation");
  }

  return value;
}

function getPaymentReceiptSource(receiptFile) {
  return (
    receiptFile?.dataUrl ||
    receiptFile?.url ||
    receiptFile?.file_url ||
    receiptFile?.file ||
    ""
  );
}

function LicenseDetails({
  app,
  t,
  canChooseLicenseExpiry,
  licenseExpiryYears,
  setLicenseExpiryYears,
}) {
  const license = app.form_data?.license || {};
  const renewal = getLicenseRenewal(app);
  const reminders = getLicenseRenewalReminders(app);
  const cancellation = renewal.cancellation || {};
  const previewExpiryDate = getLicenseExpiryPreviewDate(licenseExpiryYears);

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-[220px_220px_360px_minmax(0,1fr)]">
        <Info label={t("workspace.info.licenseId")} value={license.license_id || getLicenseId(app)} />
        <Info label={t("common.status")} value={license.status || t("workspace.info.pendingIssuance")} />
        {canChooseLicenseExpiry ? (
          <div>
            <p className="text-[13px] font-semibold uppercase leading-5 tracking-wide text-slate-500">
              {t("workspace.info.expiry", "Expiry")}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <select
                value={licenseExpiryYears}
                onChange={(event) => setLicenseExpiryYears(event.target.value)}
                className="form-input h-10 !w-28 text-[14px]"
              >
                {LICENSE_EXPIRY_YEAR_OPTIONS.map((years) => (
                  <option key={years} value={years}>
                    {t(
                      `workspace.license.validity.${years}`,
                      `${years} ${years === 1 ? "year" : "years"}`
                    )}
                  </option>
                ))}
              </select>
              <p className="text-[14px] font-medium leading-5 text-slate-800">
                {t("workspace.license.expiresOn", "Expires on")} {formatDateTime(previewExpiryDate)}
              </p>
            </div>
          </div>
        ) : (
          <Info label={t("workspace.info.expiry")} value={formatDateTime(license.expiry_date)} />
        )}
        <LicenseUrlInfo
          label={t("workspace.info.verificationUrl")}
          value={license.verification_url || t("workspace.info.notGenerated")}
        />
      </div>

      {Object.keys(renewal).length > 0 && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-[13px] font-semibold uppercase leading-5 tracking-wide text-slate-500">
            Renewal workflow
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {[3, 2, 1].map((months) => (
              <Info
                key={months}
                label={`${months}-month reminder`}
                value={formatWorkflowStatus(reminders[String(months)]?.status || "Not detected")}
              />
            ))}
            <Info
              label="Cancellation"
              value={formatWorkflowStatus(cancellation.status || "Not triggered")}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function getLicenseExpiryPreviewDate(years) {
  const issueDate = new Date();
  return addCalendarYears(issueDate, Number(years) || 1).toISOString();
}

function addCalendarYears(value, years) {
  const next = new Date(value);
  const targetYear = value.getFullYear() + years;
  const targetMonth = value.getMonth();
  const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  next.setFullYear(targetYear, targetMonth, Math.min(value.getDate(), lastDayOfTargetMonth));
  return next;
}

function getLicenseVerificationUrl(licenseId) {
  const fallbackOrigin =
    typeof window !== "undefined" ? window.location.origin : "";
  const origin = PUBLIC_FRONTEND_URL || fallbackOrigin;

  return `${origin}/license/verify/${licenseId}`;
}

function LicenseUrlInfo({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-[13px] font-semibold uppercase leading-5 tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 max-w-full break-all text-[14px] font-medium leading-5 text-slate-800">
        {value || "-"}
      </p>
    </div>
  );
}

export default ProcessWorkspace;
