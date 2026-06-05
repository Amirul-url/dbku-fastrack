import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import AdminDashboardLayout from "../../layout/AdminDashboardLayout";
import { useLanguage } from "../../context/LanguageContext";
import SimpleWysiwygEditor from "../../components/SimpleWysiwygEditor";
import {
  apiRequest,
  deleteApplicationDocument,
  fetchApplicationList,
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
import {
  DEFAULT_ADVERTISEMENT_LICENSE_TERMS,
  buildAdvertisementLicenseHtml as buildAdvertisementLicenseDocumentHtml,
  buildManualAdvertisementLicenseForIssuance,
  getAdvertisementLicenseDraftFields,
} from "../../utils/advertisementLicenseDocument";

const TECHNICAL_DEPARTMENTS = ["BLG", "GPM", "MNE", "IMT", "LNP", "ENG"];
const MEMO_EDITOR_ENABLED = false;
const KU_TECHNICAL_MEMO_RECIPIENT = "IKL(TECHNICAL)";
const APPLICATION_TYPE_OPTIONS = ["open_space", "building"];
const SQFT_TO_SQM = 0.092903;
const TECHNICAL_FIRST_AREA_SQM = 20;
const TECHNICAL_FIRST_AREA_RATE = 100;
const TECHNICAL_ADDITIONAL_AREA_RATE = 70;
const TECHNICAL_FIXED_DEPOSIT = 5000;
const TECHNICAL_PROCESSING_FEE = 10;
const APPLICATION_TYPE_TECHNICAL_DEPARTMENTS = {
  open_space: ["GPM", "MNE", "IMT", "LNP", "ENG"],
  building: ["BLG"],
};
const IKL_TASK_DEPARTMENTS = ["PT(IKL)", "KU(IKL)", "IKL (TECHNICAL)"];
const IKL_DEPARTMENT_STATUS_SCOPE = {
  "PT(IKL)": ["incomplete"],
  "KU(IKL)": ["submitted", "ku_ikl_review", "technical_review_completed"],
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
const APPROVAL_TECHNICAL_REPORT_DEPARTMENTS = [
  "KB(LES)",
  ...APPROVAL_SUPPORT_DEPARTMENTS,
  ...MPHLG_REVIEW_DEPARTMENTS,
  ...SUT_APPROVAL_DEPARTMENTS,
];
const APPROVAL_REPORT_VIEW_DEPARTMENTS = [
  "PT(IKL)",
  "KU(IKL)",
  "IKL (TECHNICAL)",
  ...TECHNICAL_DEPARTMENTS,
  ...APPROVAL_TECHNICAL_REPORT_DEPARTMENTS,
];
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
  const { t, language } = useLanguage();
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
      language={language}
      userDepartment={userDepartment}
    />
  );
}

function ProcessWorkspaceContent({ config, navigate, t, language, userDepartment }) {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const querySelectedId = searchParams.get("id") || "";
  const returnToPath = searchParams.get("returnTo") || "";
  const fromCompletedApprovals = searchParams.get("from") === "completed-approvals";
  const [applications, setApplications] = useState([]);
  const [selectedId, setSelectedId] = useState(querySelectedId);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [currentUser, setCurrentUser] = useState(() => getStoredUser());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [commentError, setCommentError] = useState("");
  const [technicalSizeError, setTechnicalSizeError] = useState("");
  const [decision, setDecision] = useState(config.defaultDecision || "");
  const [comment, setComment] = useState("");
  const [licenseExpiryYears, setLicenseExpiryYears] = useState("1");
  const [memoDraft, setMemoDraft] = useState("");
  const [pendingMemoSubmission, setPendingMemoSubmission] = useState(null);
  const [approvalDecisionDraft, setApprovalDecisionDraft] = useState("");
  const [savedApprovalDecisionDraft, setSavedApprovalDecisionDraft] = useState("");
  const [approvalDecisionEditable, setApprovalDecisionEditable] = useState(false);
  const [showVerificationReport, setShowVerificationReport] = useState(false);
  const [officialReceiptMode, setOfficialReceiptMode] = useState("manual");
  const [technicalApplicationTypeSelection, setTechnicalApplicationTypeSelection] = useState([]);
  const technicalSiteDraftSaveIdRef = useRef(0);
  const manualPaymentDraftSaveIdRef = useRef(0);
  const manualPaymentDraftTimerRef = useRef(null);
  const manualPaymentDraftSavePromiseRef = useRef(null);
  const manualLicenseDraftSaveIdRef = useRef(0);
  const manualLicenseDraftTimerRef = useRef(null);
  const manualLicenseDraftSavePromiseRef = useRef(null);
  const manualLicenseDraftDataRef = useRef(null);
  const formViewFallbackTimerRef = useRef(null);
  const [technicalSite, setTechnicalSite] = useState({
    site_photos: [],
    fee_date: "",
    fee_items: [createTechnicalFeeItem()],
    width_ft: "",
    height_ft: "",
    area_sqft: "",
    area_sqm: "",
    chargeable_area_sqm: "",
    first_area_fee: "",
    additional_area_sqm: "",
    additional_area_fee: "",
    fee_total: "",
    payable_total: "",
    license_fee_calculation: "",
    deposit_calculation: "",
    processing_fee_calculation: "",
    site_remarks: "",
  });

  useEffect(() => {
    fetchApplications();
  }, []);

  useEffect(() => {
    let active = true;

    apiRequest("/auth/me/")
      .then((data) => {
        const user = data?.user || data;
        if (!active || !user) return;
        setCurrentUser(user);
        localStorage.setItem("fastrack_user", JSON.stringify(user));
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (querySelectedId) setSelectedId(querySelectedId);
  }, [querySelectedId]);

  useEffect(() => {
    manualLicenseDraftDataRef.current = null;
  }, [selectedId]);

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
    const calculatedFees = calculateTechnicalFee(saved);
    setTechnicalSite({
      site_photos: currentPhotos,
      fee_date: saved.fee_date || new Date().toISOString().slice(0, 10),
      fee_items: feeItems,
      width_ft: saved.width_ft || "",
      height_ft: saved.height_ft || "",
      area_sqft: saved.area_sqft || calculatedFees.areaSqft || "",
      area_sqm: saved.area_sqm || calculatedFees.areaSqm || "",
      chargeable_area_sqm: saved.chargeable_area_sqm || calculatedFees.chargeableAreaSqm || "",
      first_area_fee: saved.first_area_fee || calculatedFees.firstAreaFee || "",
      additional_area_sqm: saved.additional_area_sqm || calculatedFees.additionalAreaSqm || "",
      additional_area_fee: saved.additional_area_fee || calculatedFees.additionalAreaFee || "",
      fee_total: saved.fee_total || calculatedFees.feeTotal || feeTotals.feeTotal || "",
      payable_total: saved.payable_total || calculatedFees.totalPayable || feeTotals.grandTotal || "",
      license_fee_calculation: saved.license_fee_calculation || (calculatedFees.feeTotal ? String(calculatedFees.feeTotal) : feeTotals.feeTotal ? String(feeTotals.feeTotal) : ""),
      deposit_calculation: saved.deposit_calculation || String(TECHNICAL_FIXED_DEPOSIT),
      processing_fee_calculation: saved.processing_fee_calculation || String(TECHNICAL_PROCESSING_FEE),
      site_remarks: saved.site_remarks || saved.site_photo_note || "",
    });
    setTechnicalApplicationTypeSelection(getApplicationTypeOptionsFromApplication(selectedDetail));
    setTechnicalSizeError("");
  }, [selectedDetail?.id, selectedDetail?.updated_at]);

  async function fetchApplications({ silent = false } = {}) {
    try {
      if (!silent) setLoading(true);
      setError("");
      const list = await fetchApplicationList({
        params: getWorkspaceFetchParams(config, userDepartment, fromCompletedApprovals),
      });
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

  useEffect(() => {
    return () => {
      if (manualPaymentDraftTimerRef.current) {
        window.clearTimeout(manualPaymentDraftTimerRef.current);
      }
      if (manualLicenseDraftTimerRef.current) {
        window.clearTimeout(manualLicenseDraftTimerRef.current);
      }
      if (formViewFallbackTimerRef.current) {
        window.clearTimeout(formViewFallbackTimerRef.current);
      }
    };
  }, []);

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
      if (fromCompletedApprovals && String(app.id) === String(selectedId)) {
        return true;
      }

      const normalizedStatus = normalizeStatus(app.status);
      const isInStatusScope =
        statusScope.length === 0 || statusScope.includes(normalizedStatus);
      const isInDepartmentScope =
        !isDepartmentTechnicalWorkspace ||
        (isTechnicalDepartmentSelected(app, userDepartment) &&
          !hasTechnicalDepartmentReview(app, userDepartment));
      const isInApprovalScope =
        !isApprovalWorkspace ||
        isApprovalTaskForDepartment(app, userDepartment);

      return isInStatusScope && isInDepartmentScope && isInApprovalScope;
    });
  }, [
    applications,
    config,
    fromCompletedApprovals,
    isApprovalWorkspace,
    isDepartmentTechnicalWorkspace,
    selectedId,
    userDepartment,
  ]);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return statusScopedApplications.filter((app) => {
      const haystack = [
        getApplicationReference(app),
        getApplicantName(app),
        getProjectName(app),
        getApplicationType(app, language),
        getApplicationLocation(app),
      ]
        .join(" ")
        .toLowerCase();

      return !q || haystack.includes(q);
    });
  }, [keyword, language, statusScopedApplications]);

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
    if (
      tableFirstWorkspace &&
      selectedId &&
      selectedDetail &&
      String(selectedDetail.id) === String(selectedId)
    ) {
      return matchingRecord ? { ...matchingRecord, ...selectedDetail } : selectedDetail;
    }
    return matchingRecord || filtered[0] || null;
  }, [filtered, selectedDetail, tableFirstWorkspace, selectedId]);
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
  const showApprovalDecisionButtons = false;
  const decisionOptions = getWorkspaceDecisionOptions(config, selectedRecord, userDepartment);
  const isKbLesSupportWorkspace =
    isApprovalWorkspace && userDepartment === "KB(LES)" && approvalStageKey === "kb_support";
  const workspaceActions = getWorkspaceActions(config, selectedRecord, userDepartment);
  const canSubmitWorkspaceAction = isIklWorkspace || workspaceActions.length > 0;
  const canViewSelectedWorkspace =
    tableFirstWorkspace &&
    Boolean(selectedRecord) &&
    canViewWorkspaceRow(config, selectedRecord, userDepartment);
  const isReadOnlyActionPanel =
    tableFirstWorkspace && canViewSelectedWorkspace && !canSubmitWorkspaceAction;
  const canChooseLicenseExpiry =
    config.key === "license" &&
    normalizeStatus(selectedRecord?.status) === "payment_verified" &&
    workspaceActions.some((action) => action.key === "issue_license");
  const tableRowsHaveActions = useMemo(
    () =>
      tableFirstWorkspace &&
      filtered.some((app) => canViewWorkspaceRow(config, app, userDepartment)),
    [config, filtered, tableFirstWorkspace, userDepartment]
  );
  const showActionPanel =
    tableFirstWorkspace
      ? Boolean(selectedRecord) && (canSubmitWorkspaceAction || canViewSelectedWorkspace)
      : !isApprovalViewOnlyWorkspace && canSubmitWorkspaceAction;
  const showApprovalTechnicalReport =
    isSimpleApprovalWorkspace &&
    shouldShowApprovalTechnicalReport(userDepartment, selectedRecord);
  const showELicenseVerificationReport =
    isELicenseWorkspace &&
    shouldShowApprovalTechnicalReport(userDepartment, selectedRecord);
  const showWorkspaceVerificationReport =
    showApprovalTechnicalReport || showELicenseVerificationReport;
  const isApprovalSupportStage = isApprovalWorkspace && approvalStageKey === "support";
  const isFinalApprovalSupportWorkspace =
    isApprovalSupportWorkspace && hasSutApprovalResult(selectedRecord);
  const approvalSupportDecision =
    isApprovalSupportWorkspace && ["Approve", "Reject"].includes(decision)
      ? decision
      : "";
  const approvalOfficerName = getRegisteredUserFullName(currentUser, userDepartment);
  const savedApprovalDecisionHtml =
    selectedRecord?.form_data?.approval?.approval_note_html ||
    selectedRecord?.form_data?.management_recommendation?.approval_note_html ||
    selectedRecord?.approval?.approval_note_html ||
    selectedRecord?.management_recommendation?.approval_note_html ||
    "";
  const approvalMemoNeedsRevision =
    isApprovalSupportWorkspace &&
    !isFinalApprovalSupportWorkspace &&
    hasMphlgReturnedApprovalForRevision(selectedRecord);
  const canReuseSavedApprovalMemo =
    !isFinalApprovalSupportWorkspace &&
    Boolean(savedApprovalDecisionHtml) &&
    !approvalMemoNeedsRevision;
  const canSendSavedApprovalMemoToMphlg = false;
  const actionUnavailableMessage = canSendSavedApprovalMemoToMphlg
    ? ""
    : getActionUnavailableMessage(config, selectedRecord, userDepartment);
  const showSavedApprovalDecisionMemo =
    isApprovalWorkspace && Boolean(savedApprovalDecisionHtml) && !isApprovalSupportWorkspace;
  const showApprovalSupportReadOnly =
    isReadOnlyActionPanel && (isApprovalSupportStage || Boolean(savedApprovalDecisionHtml));
  const showApprovalMemoPreviews =
    !showApprovalTechnicalReport || showVerificationReport;
  const showWorkspaceCommentField =
    config.showComment &&
    canSubmitWorkspaceAction &&
    !isApprovalSupportWorkspace &&
    (
      config.key !== "payment" ||
      workspaceActions.some((action) =>
        action.requiresComment ||
        action.requiresReceipt ||
        action.requiresSubmittedReceipt
      )
    );
  const showDetailsBeforeComment =
    config.key === "payment" &&
    workspaceActions.some((action) => action.requiresSubmittedReceipt);
  const showPaymentReceiptDecision =
    config.key === "payment" &&
    userDepartment === "PT(IKL)" &&
    normalizeStatus(selectedRecord?.status) === "payment_submitted" &&
    workspaceActions.some((action) => action.requiresSubmittedReceipt);
  const paymentReceiptDecisionOptions = showPaymentReceiptDecision
    ? workspaceActions.filter((action) => action.requiresSubmittedReceipt)
    : [];
  const selectedPaymentReceiptAction = showPaymentReceiptDecision
    ? paymentReceiptDecisionOptions.find((action) => action.label === decision)
    : null;
  const approvalMemoHtml = isApprovalSupportStage || savedApprovalDecisionHtml
    ? sanitizeMemoHtml(getApprovalMemoHtml(selectedRecord))
    : "";

  const stats = useMemo(
    () => config.stats(statusScopedApplications, userDepartment),
    [config, statusScopedApplications, userDepartment]
  );

  useEffect(() => {
    const syncApprovalDecisionId = window.setTimeout(() => {
      if (!isApprovalSupportWorkspace || isFinalApprovalSupportWorkspace || !selectedRecord?.id) {
        setApprovalDecisionDraft("");
        setSavedApprovalDecisionDraft("");
        setApprovalDecisionEditable(false);
        return;
      }

      if (!decision) {
        setApprovalDecisionDraft("");
        setSavedApprovalDecisionDraft("");
        setApprovalDecisionEditable(false);
        return;
      }

      const nextDraft =
        decision === "Approve" && savedApprovalDecisionHtml
          ? savedApprovalDecisionHtml
          : decision === "Reject"
            ? createTpResToKuAmendmentMemoTemplate(selectedRecord)
            : createTpResApprovalDecisionTemplate(approvalOfficerName);

      setApprovalDecisionDraft(nextDraft);
      setSavedApprovalDecisionDraft(
        decision === "Approve" && savedApprovalDecisionHtml ? savedApprovalDecisionHtml : ""
      );
      setApprovalDecisionEditable(
        decision === "Approve" ? !savedApprovalDecisionHtml || approvalMemoNeedsRevision : true
      );
    }, 0);

    return () => window.clearTimeout(syncApprovalDecisionId);
  }, [
    approvalMemoNeedsRevision,
    isFinalApprovalSupportWorkspace,
    isApprovalSupportWorkspace,
    approvalOfficerName,
    decision,
    savedApprovalDecisionHtml,
    selectedRecord?.id,
    selectedRecord?.updated_at,
  ]);

  useEffect(() => {
    setShowVerificationReport(false);
  }, [selectedRecord?.id]);

  useEffect(() => {
    const officialReceiptFile = selectedRecord?.form_data?.approval_letter?.official_receipt_file;
    setOfficialReceiptMode(getPaymentDocumentSource(officialReceiptFile) ? "upload" : "manual");
  }, [selectedRecord?.id]);

  useEffect(() => {
    if (isApprovalSupportWorkspace) {
      setDecision(isFinalApprovalSupportWorkspace ? "Approve" : "");
      setLicenseExpiryYears("1");
      return;
    }

    setDecision(getDefaultWorkspaceDecision(config, selectedRecord, userDepartment));
    setLicenseExpiryYears("1");
  }, [
    approvalStageKey,
    canReuseSavedApprovalMemo,
    config,
    isApprovalSupportWorkspace,
    selectedRecord?.id,
    userDepartment,
  ]);

  function handleApprovalSupportDecisionChange(nextDecision) {
    setDecision(nextDecision);
    if (!nextDecision) {
      setApprovalDecisionDraft("");
      setSavedApprovalDecisionDraft("");
      setApprovalDecisionEditable(false);
      return;
    }

    const nextDraft =
      nextDecision === "Approve" && savedApprovalDecisionHtml
        ? savedApprovalDecisionHtml
        : nextDecision === "Reject"
          ? createTpResToKuAmendmentMemoTemplate(selectedRecord)
          : createTpResApprovalDecisionTemplate(approvalOfficerName);

    setApprovalDecisionDraft(nextDraft);
    setSavedApprovalDecisionDraft(
      nextDecision === "Approve" && savedApprovalDecisionHtml ? savedApprovalDecisionHtml : ""
    );
    setApprovalDecisionEditable(
      nextDecision === "Approve" ? !savedApprovalDecisionHtml || approvalMemoNeedsRevision : true
    );
  }

  async function saveApprovalDecisionMemo() {
    if (!selectedRecord?.id) {
      setError(t("workspace.selectApplication", "Please select an application first."));
      return;
    }

    if (!getHtmlPlainText(approvalDecisionDraft)) {
      setError(t("workspace.memo.required", "Please complete the memo before sending."));
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const now = new Date().toISOString();
      const body = {
        status: normalizeStatus(selectedRecord.status) || "management_review",
        form_data: mergeFormData(selectedRecord, {
          management_recommendation: {
            ...(selectedRecord.form_data?.management_recommendation || {}),
            officer: userDepartment,
            status: "Pending TP(RES)/PGH Approval",
            decision: "Draft",
            approval_note_html: approvalDecisionDraft,
            approval_note_saved_at: now,
            approval_note_saved_by: userDepartment,
          },
        }),
      };

      const response = await apiRequest(`/applications/${selectedRecord.id}/`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });

      setSavedApprovalDecisionDraft(approvalDecisionDraft);
      setApprovalDecisionEditable(false);
      setSuccess(t("workspace.memo.saved", "Memo saved."));
      await fetchApplications({ silent: true });
      setSelectedDetail(response?.data || response || selectedRecord);
    } catch (err) {
      setError(err.message || t("workspace.memo.saveFailed", "Memo could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  async function saveTechnicalApplicationTypeSelection(nextSelection = technicalApplicationTypeSelection) {
    if (!selectedRecord?.id) {
      setError(t("workspace.selectApplication", "Please select an application first."));
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const now = new Date().toISOString();
      const selectedTypes = normalizeApplicationTypeOptions(nextSelection).slice(0, 1);
      if (selectedTypes.length === 0) {
        setError(t("workspace.technical.applicationTypeRequired", "Please select at least one application type."));
        return;
      }
      const departments = getApplicationTypeTechnicalDepartmentsFromTypes(selectedTypes);
      const step1 = selectedRecord.form_data?.step_1 || {};
      const response = await apiRequest(`/applications/${selectedRecord.id}/`, {
        method: "PATCH",
        body: JSON.stringify({
          status: normalizeStatus(selectedRecord.status) || "technical_review",
          form_data: mergeFormData(selectedRecord, {
            step_1: {
              ...step1,
              application_type: selectedTypes.join(","),
              application_type_label: getApplicationTypeOptionsLabel(selectedTypes, "en"),
              application_type_options: selectedTypes,
              project_category: getApplicationTypeOptionsLabel(selectedTypes, "en"),
              technical_departments: departments,
            },
            technical_department_selection: {
              departments,
              application_type_options: selectedTypes,
              selected_by: "IKL (TECHNICAL)",
              selected_at: now,
            },
            technical_referral: {
              ...(selectedRecord.form_data?.technical_referral || {}),
              status: "Referred",
              source: selectedRecord.form_data?.technical_referral?.source || "KU(IKL)",
              target: KU_TECHNICAL_MEMO_RECIPIENT,
              participating_departments: departments,
              departments_selected_at: now,
            },
          }),
        }),
      });

      setSuccess(t("workspace.technical.applicationTypeSaved", "Application type updated."));
      await fetchApplications({ silent: true });
      setSelectedDetail(response?.data || response || selectedRecord);
    } catch (err) {
      setError(err.message || t("workspace.technical.applicationTypeSaveFailed", "Could not update application type."));
    } finally {
      setSaving(false);
    }
  }

  async function uploadPaymentDocument(kind, file) {
    if (!selectedRecord?.id || !file) return;

    const documentLabel =
      kind === "official_receipt"
        ? t("workspace.payment.manual.officialReceiptTitle", "Official Receipt")
        : kind === "bill"
        ? t("workspace.payment.billDocument", "Bill")
        : t("workspace.payment.approvalLetter", "Approval Letter");

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const uploaded = await uploadApplicationDocument(
        selectedRecord.id,
        documentLabel,
        file
      );
      const uploadedForUi = withLocalPaymentDocumentPreview(selectedRecord.id, kind, uploaded, file);
      const savedApprovalLetter = selectedRecord.form_data?.approval_letter || {};
      const fieldName = getPaymentDocumentFieldName(kind);
      const nextApprovalLetter = {
        ...savedApprovalLetter,
        [fieldName]: uploadedForUi,
        ...(kind === "official_receipt" ? { official_receipt_mode: "upload" } : {}),
        uploaded_by: userDepartment,
        uploaded_at: new Date().toISOString(),
      };
      nextApprovalLetter.status = hasPaymentDocuments({
        ...selectedRecord,
        form_data: {
          ...(selectedRecord.form_data || {}),
          approval_letter: nextApprovalLetter,
        },
      })
        ? "Ready for KU(IKL) Confirmation"
        : "Draft";
      const nextApprovalLetterForSave = {
        ...nextApprovalLetter,
        [fieldName]: stripLocalPaymentDocumentPreview(uploadedForUi),
      };

      const response = await apiRequest(`/applications/${selectedRecord.id}/`, {
        method: "PATCH",
        body: JSON.stringify({
          form_data: mergeFormData(selectedRecord, {
            approval_letter: nextApprovalLetterForSave,
          }),
        }),
      });

      setSelectedDetail(
        mergeLocalPaymentDocumentPreview(
          response?.data || response || selectedRecord,
          fieldName,
          uploadedForUi
        )
      );
      if (kind === "official_receipt") {
        setOfficialReceiptMode("upload");
      }
      await fetchApplications({ silent: true });
      setSuccess(t("workspace.payment.documentUploaded", "Document uploaded."));
    } catch (err) {
      setError(err.message || t("workspace.payment.documentUploadFailed", "Document upload failed."));
    } finally {
      setSaving(false);
    }
  }

  async function deletePaymentDocument(kind, file) {
    if (!selectedRecord?.id || !file) return;

    const fieldName = getPaymentDocumentFieldName(kind);

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      if (file.document_id || file.id) {
        await deleteApplicationDocument(selectedRecord.id, file.document_id || file.id);
      }

      forgetLocalPaymentDocumentPreview(selectedRecord.id, kind, file);

      const savedApprovalLetter = selectedRecord.form_data?.approval_letter || {};
      const nextApprovalLetter = {
        ...savedApprovalLetter,
        [fieldName]: null,
        ...(kind === "official_receipt" ? { official_receipt_mode: "manual" } : {}),
      };
      nextApprovalLetter.status = hasPaymentDocuments({
        ...selectedRecord,
        form_data: {
          ...(selectedRecord.form_data || {}),
          approval_letter: nextApprovalLetter,
        },
      })
        ? "Ready for KU(IKL) Confirmation"
        : "Draft";

      const response = await apiRequest(`/applications/${selectedRecord.id}/`, {
        method: "PATCH",
        body: JSON.stringify({
          form_data: mergeFormData(selectedRecord, {
            approval_letter: nextApprovalLetter,
          }),
        }),
      });

      setSelectedDetail(response?.data || response || selectedRecord);
      if (kind === "official_receipt") {
        setOfficialReceiptMode("manual");
      }
      await fetchApplications({ silent: true });
      setSuccess(t("workspace.payment.documentDeleted", "Document deleted."));
    } catch (err) {
      setError(err.message || t("workspace.payment.documentDeleteFailed", "Document delete failed."));
    } finally {
      setSaving(false);
    }
  }

  async function saveManualPaymentDocuments(data) {
    if (!selectedRecord?.id) return;

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const savedApprovalLetter = selectedRecord.form_data?.approval_letter || {};
      const now = new Date().toISOString();
      const nextApprovalLetter = buildManualPaymentApprovalLetter(
        savedApprovalLetter,
        data,
        userDepartment,
        now,
        { submitted: true }
      );

      const response = await apiRequest(`/applications/${selectedRecord.id}/`, {
        method: "PATCH",
        body: JSON.stringify({
          form_data: mergeFormData(selectedRecord, {
            approval_letter: nextApprovalLetter,
          }),
        }),
      });

      setSelectedDetail(response?.data || response || selectedRecord);
      removeStoredManualPaymentDraft(selectedRecord.id);
      await fetchApplications({ silent: true });
      setSuccess(t("workspace.payment.manualSaved", "Manual letter and bill saved."));
    } catch (err) {
      setError(err.message || t("workspace.payment.manualSaveFailed", "Could not save manual letter and bill."));
    } finally {
      setSaving(false);
    }
  }

  async function saveManualPaymentDraft(applicationId, baseRecord, data, saveId) {
    if (!applicationId || !baseRecord) return;

    const savedApprovalLetter = baseRecord.form_data?.approval_letter || {};
    const now = new Date().toISOString();
    const nextApprovalLetter = buildManualPaymentApprovalLetter(
      savedApprovalLetter,
      data,
      userDepartment,
      now,
      { submitted: false }
    );

    try {
      await apiRequest(`/applications/${applicationId}/`, {
        method: "PATCH",
        body: JSON.stringify({
          form_data: mergeFormData(baseRecord, {
            approval_letter: nextApprovalLetter,
          }),
        }),
      });

      if (manualPaymentDraftSaveIdRef.current === saveId) {
        removeStoredManualPaymentDraft(applicationId);
      }
    } catch (err) {
      console.error("Failed to autosave manual payment draft:", err);
    }
  }

  const updateManualPaymentDraft = useCallback((data) => {
    const applicationId = selectedRecord?.id;
    if (!applicationId) return;
    const draftSavedAt = new Date().toISOString();

    storeManualPaymentDraft(applicationId, {
      ...data,
      draftSavedAt,
    });

    if (manualPaymentDraftTimerRef.current) {
      window.clearTimeout(manualPaymentDraftTimerRef.current);
    }

    const saveId = manualPaymentDraftSaveIdRef.current + 1;
    manualPaymentDraftSaveIdRef.current = saveId;
    const baseRecord = selectedRecord;
    manualPaymentDraftTimerRef.current = window.setTimeout(() => {
      manualPaymentDraftSavePromiseRef.current = saveManualPaymentDraft(
        applicationId,
        baseRecord,
        data,
        saveId
      ).finally(() => {
        if (manualPaymentDraftSaveIdRef.current === saveId) {
          manualPaymentDraftSavePromiseRef.current = null;
        }
      });
    }, 900);

    setSelectedDetail((current) => {
      if (!current || current.id !== applicationId) return current;

      const savedApprovalLetter = current.form_data?.approval_letter || {};
      const nextApprovalLetter = buildManualPaymentApprovalLetter(
        savedApprovalLetter,
        data,
        userDepartment,
        draftSavedAt,
        { submitted: false }
      );

      return {
        ...current,
        form_data: {
          ...(current.form_data || {}),
          approval_letter: nextApprovalLetter,
        },
      };
    });
  }, [selectedRecord, userDepartment]);

  async function saveManualLicenseDraft(applicationId, baseRecord, data, saveId) {
    if (!applicationId || !baseRecord) return;

    const savedLicense = baseRecord.form_data?.license || {};
    const now = new Date().toISOString();
    const nextManualLicense = {
      ...(savedLicense.manual_license || {}),
      status: "Draft",
      fields: data.fields,
      terms: data.terms,
      draft_saved_by: userDepartment,
      draft_saved_at: now,
      saved_at: savedLicense.manual_license?.saved_at || now,
    };

    try {
      await apiRequest(`/applications/${applicationId}/`, {
        method: "PATCH",
        body: JSON.stringify({
          form_data: mergeFormData(baseRecord, {
            license: {
              ...savedLicense,
              manual_license: nextManualLicense,
            },
          }),
        }),
      });

      if (manualLicenseDraftSaveIdRef.current === saveId) {
        manualLicenseDraftSavePromiseRef.current = null;
      }
    } catch (err) {
      console.error("Failed to autosave manual license draft:", err);
    }
  }

  const updateManualLicenseDraft = useCallback((data) => {
    const applicationId = selectedRecord?.id;
    if (!applicationId) return;
    const draftSavedAt = new Date().toISOString();
    manualLicenseDraftDataRef.current = data;

    if (manualLicenseDraftTimerRef.current) {
      window.clearTimeout(manualLicenseDraftTimerRef.current);
    }

    const saveId = manualLicenseDraftSaveIdRef.current + 1;
    manualLicenseDraftSaveIdRef.current = saveId;
    const baseRecord = selectedRecord;
    manualLicenseDraftTimerRef.current = window.setTimeout(() => {
      manualLicenseDraftSavePromiseRef.current = saveManualLicenseDraft(
        applicationId,
        baseRecord,
        data,
        saveId
      ).finally(() => {
        if (manualLicenseDraftSaveIdRef.current === saveId) {
          manualLicenseDraftSavePromiseRef.current = null;
        }
      });
    }, 900);

    setSelectedDetail((current) => {
      if (!current || current.id !== applicationId) return current;

      const savedLicense = current.form_data?.license || {};
      const nextManualLicense = {
        ...(savedLicense.manual_license || {}),
        status: "Draft",
        fields: data.fields,
        terms: data.terms,
        draft_saved_by: userDepartment,
        draft_saved_at: draftSavedAt,
        saved_at: savedLicense.manual_license?.saved_at || draftSavedAt,
      };

      return {
        ...current,
        form_data: {
          ...(current.form_data || {}),
          license: {
            ...savedLicense,
            manual_license: nextManualLicense,
          },
        },
      };
    });
  }, [selectedRecord, userDepartment]);

  async function saveTechnicalSiteVisitDraft(nextSite) {
    if (!selectedRecord?.id) return;

    const saveId = technicalSiteDraftSaveIdRef.current + 1;
    technicalSiteDraftSaveIdRef.current = saveId;
    const technicalFee = calculateTechnicalFee(nextSite);
    const saved = selectedRecord.form_data?.technical_site_visit || {};
    const nextTechnicalSiteVisit = {
      ...saved,
      site_photos: nextSite.site_photos || saved.site_photos || [],
      site_photo: nextSite.site_photos?.[0] || saved.site_photo || null,
      fee_date: nextSite.fee_date || saved.fee_date || new Date().toISOString().slice(0, 10),
      fee_items: [],
      width_ft: nextSite.width_ft || "",
      height_ft: nextSite.height_ft || "",
      area_sqft: technicalFee.areaSqft ? String(technicalFee.areaSqft) : "",
      area_sqm: technicalFee.areaSqm ? String(technicalFee.areaSqm) : "",
      chargeable_area_sqm: technicalFee.chargeableAreaSqm ? String(technicalFee.chargeableAreaSqm) : "",
      first_area_sqm: technicalFee.firstAreaSqm ? String(technicalFee.firstAreaSqm) : "",
      first_area_fee: technicalFee.firstAreaFee ? String(technicalFee.firstAreaFee) : "",
      additional_area_sqm: technicalFee.additionalAreaSqm ? String(technicalFee.additionalAreaSqm) : "0",
      additional_area_fee: technicalFee.additionalAreaFee ? String(technicalFee.additionalAreaFee) : "0",
      fee_total: technicalFee.feeTotal,
      payable_total: technicalFee.totalPayable,
      license_fee_calculation: technicalFee.feeTotal ? String(technicalFee.feeTotal) : "",
      deposit_calculation: String(TECHNICAL_FIXED_DEPOSIT),
      processing_fee_calculation: String(TECHNICAL_PROCESSING_FEE),
      site_remarks: nextSite.site_remarks || saved.site_remarks || "",
      officer_role: saved.officer_role || "PT/PO/KP Unit Iklan",
      draft_saved_at: new Date().toISOString(),
    };

    try {
      const response = await apiRequest(`/applications/${selectedRecord.id}/`, {
        method: "PATCH",
        body: JSON.stringify({
          form_data: mergeFormData(selectedRecord, {
            technical_site_visit: nextTechnicalSiteVisit,
          }),
        }),
      });

      if (technicalSiteDraftSaveIdRef.current === saveId) {
        setSelectedDetail(response?.data || response || selectedRecord);
      }
      await fetchApplications({ silent: true });
    } catch (err) {
      setError(err.message || t("workspace.technical.siteVisitSaveFailed", "Could not save site visit details."));
    }
  }

  function submitApprovalSupport(decisionValue) {
    const [availableAction] = workspaceActions;
    const action = availableAction || (canSendSavedApprovalMemoToMphlg ? config.actions?.[0] : null);
    if (!action) return;

    if (!decisionValue) {
      setError(t("workspace.decision.required", "Please select a decision."));
      return;
    }

    if (isFinalApprovalSupportWorkspace) {
      setDecision("Approve");
      submitAction(action, {
        decision: "Approve",
        comment: cleanRemark(comment),
        checkDecisionRemark: false,
        approvalDecisionHtml: "",
      });
      return;
    }

    submitAction(action, {
      decision: decisionValue,
      comment: cleanRemark(comment),
      checkDecisionRemark: decisionValue !== "Approve",
      approvalDecisionHtml: "",
    });
  }

  function submitApprovalDecisionButton(decisionValue) {
    const [action] = workspaceActions;
    if (!action) return;

    submitAction(action, { decision: decisionValue, checkDecisionRemark: false });
  }

  function isKbLesDecisionAction(action, actionDecision) {
    return (
      config.key === "approval" &&
      userDepartment === "KB(LES)" &&
      ["kb", "kb_support"].includes(getApprovalStageKey(selectedRecord)) &&
      action?.buildPayload === buildApprovalWorkflowPayload &&
      ["Support", "Verify", "Reject", "Not Verify", "Not Support"].includes(actionDecision)
    );
  }

  function isPtIklApproveToKuAction(action, actionDecision) {
    return (
      config.key === "screening" &&
      userDepartment === "PT(IKL)" &&
      action?.buildPayload === buildIklScreeningPayload &&
      actionDecision === "PT(IKL) Send to KU(IKL)"
    );
  }

  function isKuIklApproveToTechnicalAction(action, actionDecision) {
    return (
      config.key === "screening" &&
      userDepartment === "KU(IKL)" &&
      action?.buildPayload === buildIklScreeningPayload &&
      actionDecision === "KU(IKL) Confirm - Send to Technical Units"
    );
  }

  function isKuIklFinalTechnicalDecisionAction(action, actionDecision) {
    return (
      config.key === "screening" &&
      userDepartment === "KU(IKL)" &&
      action?.buildPayload === buildKuTechnicalReviewPayload &&
      [
        "KU(IKL) Confirm - Send to KB(LES)",
        "KU(IKL) Request Technical Amendment",
      ].includes(actionDecision)
    );
  }

  function isIklTechnicalSupportToKuAction(action, actionDecision) {
    return (
      config.key === "screening" &&
      userDepartment === "IKL (TECHNICAL)" &&
      action?.buildPayload === buildIklTechnicalDecisionPayload &&
      ["Supported", "Supported with Conditions"].includes(actionDecision)
    );
  }

  function isMphlgRejectToKuAction(action, actionDecision) {
    return (
      config.key === "approval" &&
      userDepartment === "MPHLG" &&
      getApprovalStageKey(selectedRecord) === "mphlg" &&
      action?.buildPayload === buildApprovalWorkflowPayload &&
      actionDecision === "Reject"
    );
  }

  function isMphlgApproveToSutAction(action, actionDecision) {
    return (
      config.key === "approval" &&
      userDepartment === "MPHLG" &&
      getApprovalStageKey(selectedRecord) === "mphlg" &&
      action?.buildPayload === buildApprovalWorkflowPayload &&
      actionDecision === "Approve"
    );
  }

  async function submitAction(action, overrides = {}) {
    if (!selectedRecord?.id) {
      setError("Please select an application first.");
      return;
    }

    setCommentError("");
    setTechnicalSizeError("");
    const actionDecision = overrides.decision || action.decision || decision;
    const cleanedComment = cleanRemark(overrides.comment ?? comment);
    const requiresDecisionRemark =
      (overrides.checkDecisionRemark ?? config.showComment) &&
      /reject|amendment|condition|not supported|not verify|not verified/i.test(String(actionDecision || ""));

    if (config.showDecision && !actionDecision) {
      setError(t("workspace.decision.required", "Please select a decision."));
      return;
    }

    if ((action.requiresComment || requiresDecisionRemark) && !cleanedComment) {
      setCommentError(t("workspace.validation.remarksRequired", "Remarks are required."));
      return;
    }

    if (
      action?.buildPayload === buildIklTechnicalDecisionPayload &&
      userDepartment === "IKL (TECHNICAL)" &&
      (parseTechnicalNumber(technicalSite.width_ft) <= 0 ||
        parseTechnicalNumber(technicalSite.height_ft) <= 0)
    ) {
      setTechnicalSizeError(t("workspace.technical.sizeRequired", "Please enter the advertisement width and height first."));
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

    if (
      action.requiresOfficialReceipt &&
      officialReceiptMode === "upload" &&
      !getPaymentDocumentSource(selectedRecord.form_data?.approval_letter?.official_receipt_file)
    ) {
      setError(t("workspace.payment.officialReceiptRequired", "Please upload the official receipt or switch to create manually."));
      return;
    }

    if (action.requiresPaymentDocuments && !hasPaymentDocuments(selectedRecord)) {
      setError(t(
        "workspace.payment.documentsRequired",
        "Please upload the approval letter and bill before submitting to KU(IKL)."
      ));
      return;
    }

    if (MEMO_EDITOR_ENABLED) {
      if (isKbLesDecisionAction(action, actionDecision) && !overrides.memoHtml) {
        const rejected = ["Reject", "Not Verify", "Not Verified"].includes(actionDecision);

        setError("");
        setSuccess("");
        setMemoDraft(
          rejected
            ? createKbLesToKuAmendmentMemoTemplate(selectedRecord, cleanedComment)
            : createKbLesMemoTemplate(selectedRecord, technicalSite)
        );
        setPendingMemoSubmission({
          action,
          overrides: { ...overrides, decision: actionDecision, comment: cleanedComment },
          titleKey: rejected ? "workspace.memo.kbToKuTitle" : "workspace.memo.title",
          title: rejected ? "Memo to KU(IKL)" : "Memo to TP(RES)",
          descriptionKey: rejected ? "workspace.memo.kbToKuDescription" : "workspace.memo.description",
          description: rejected
            ? "Complete the memo before returning this application to KU(IKL)."
            : "Complete the memo template. This exact memo will appear in TP(RES) notifications.",
        });
        return false;
      }

      if (isPtIklApproveToKuAction(action, actionDecision) && !overrides.memoHtml) {
        setError("");
        setSuccess("");
        setMemoDraft(createPtIklToKuMemoTemplate(selectedRecord));
        setPendingMemoSubmission({
          action,
          overrides: { ...overrides, decision: actionDecision },
          titleKey: "workspace.memo.ptToKuTitle",
          title: "Memo to KU(IKL)",
          descriptionKey: "workspace.memo.ptToKuDescription",
          description: "Complete the memo before sending this application to KU(IKL).",
        });
        return false;
      }

      if (isKuIklApproveToTechnicalAction(action, actionDecision) && !overrides.memoHtml) {
        setError("");
        setSuccess("");
        setMemoDraft(createKuIklToTechnicalMemoTemplate(selectedRecord));
        setPendingMemoSubmission({
          action,
          overrides: { ...overrides, decision: actionDecision },
          titleKey: "workspace.memo.kuToTechnicalTitle",
          title: "Memo to IKL(TECHNICAL)",
          descriptionKey: "workspace.memo.kuToTechnicalDescription",
          description: "Complete the memo before sending this application to IKL(TECHNICAL).",
        });
        return false;
      }

      if (isKuIklFinalTechnicalDecisionAction(action, actionDecision) && !overrides.memoHtml) {
        const amendmentRequired = actionDecision === "KU(IKL) Request Technical Amendment";

        setError("");
        setSuccess("");
        setMemoDraft(createKuIklFinalReviewMemoTemplate(selectedRecord, technicalSite, actionDecision, cleanedComment));
        setPendingMemoSubmission({
          action,
          overrides: { ...overrides, decision: actionDecision, comment: cleanedComment },
          titleKey: amendmentRequired
            ? "workspace.memo.kuAmendTechnicalTitle"
            : "workspace.memo.kuToKbTitle",
          title: amendmentRequired ? "Memo to IKL(TECHNICAL)" : "Memo to KB(LES)",
          descriptionKey: amendmentRequired
            ? "workspace.memo.kuAmendTechnicalDescription"
            : "workspace.memo.kuToKbDescription",
          description: amendmentRequired
            ? "Complete the memo before returning this application to IKL(TECHNICAL)."
            : "Complete the memo before sending this application to KB(LES).",
        });
        return false;
      }

      if (isIklTechnicalSupportToKuAction(action, actionDecision) && !overrides.memoHtml) {
        setError("");
        setSuccess("");
        setMemoDraft(createIklTechnicalToKuMemoTemplate(selectedRecord, technicalSite, actionDecision, cleanedComment));
        setPendingMemoSubmission({
          action,
          overrides: { ...overrides, decision: actionDecision, comment: cleanedComment },
          titleKey: "workspace.memo.technicalToKuTitle",
          title: "Memo to KU(IKL)",
          descriptionKey: "workspace.memo.technicalToKuDescription",
          description: "Complete the memo before sending this technical decision to KU(IKL).",
        });
        return false;
      }

      if (isMphlgRejectToKuAction(action, actionDecision) && !overrides.memoHtml) {
        setError("");
        setSuccess("");
        setMemoDraft(createMphlgToKuAmendmentMemoTemplate(selectedRecord));
        setPendingMemoSubmission({
          action,
          overrides: { ...overrides, decision: actionDecision, checkDecisionRemark: false },
          titleKey: "workspace.memo.mphlgToKuTitle",
          title: "Memo to KU(IKL)",
          descriptionKey: "workspace.memo.mphlgToKuDescription",
          description: "Complete the memo before returning this application to KU(IKL).",
        });
        return false;
      }

      if (isMphlgApproveToSutAction(action, actionDecision) && !overrides.memoHtml) {
        setError("");
        setSuccess("");
        setMemoDraft(createMphlgToSutMemoTemplate(selectedRecord));
        setPendingMemoSubmission({
          action,
          overrides: { ...overrides, decision: actionDecision, checkDecisionRemark: false },
          titleKey: "workspace.memo.mphlgToSutTitle",
          title: "Memo to SUT",
          descriptionKey: "workspace.memo.mphlgToSutDescription",
          description: "Complete the memo before sending this approval to SUT.",
        });
        return false;
      }

      if (
        (
          isKbLesDecisionAction(action, actionDecision) ||
          isPtIklApproveToKuAction(action, actionDecision) ||
          isKuIklApproveToTechnicalAction(action, actionDecision) ||
          isKuIklFinalTechnicalDecisionAction(action, actionDecision) ||
          isIklTechnicalSupportToKuAction(action, actionDecision) ||
          isMphlgRejectToKuAction(action, actionDecision) ||
          isMphlgApproveToSutAction(action, actionDecision)
        ) &&
        !getHtmlPlainText(overrides.memoHtml)
      ) {
        setError(t("workspace.memo.required", "Please complete the memo before sending."));
        return false;
      }
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      if (action.requiresPaymentDocuments || action.requiresOfficialReceipt) {
        if (manualPaymentDraftTimerRef.current) {
          window.clearTimeout(manualPaymentDraftTimerRef.current);
          manualPaymentDraftTimerRef.current = null;
        }

        if (manualPaymentDraftSavePromiseRef.current) {
          await manualPaymentDraftSavePromiseRef.current;
        }
      }

      if (action.key === "issue_license") {
        if (manualLicenseDraftTimerRef.current) {
          window.clearTimeout(manualLicenseDraftTimerRef.current);
          manualLicenseDraftTimerRef.current = null;

          if (manualLicenseDraftDataRef.current) {
            const saveId = manualLicenseDraftSaveIdRef.current + 1;
            manualLicenseDraftSaveIdRef.current = saveId;
            await saveManualLicenseDraft(
              selectedRecord.id,
              selectedRecord,
              manualLicenseDraftDataRef.current,
              saveId
            );
          }
        }

        if (manualLicenseDraftSavePromiseRef.current) {
          await manualLicenseDraftSavePromiseRef.current;
        }
      }

      let current = selectedRecord;
      if (action.key === "issue_license" && manualLicenseDraftDataRef.current) {
        const savedLicense = selectedRecord.form_data?.license || {};
        current = {
          ...selectedRecord,
          form_data: {
            ...(selectedRecord.form_data || {}),
            license: {
              ...savedLicense,
              manual_license: {
                ...(savedLicense.manual_license || {}),
                status: "Draft",
                fields: manualLicenseDraftDataRef.current.fields,
                terms: manualLicenseDraftDataRef.current.terms,
              },
            },
          },
        };
      }
      const body = action.buildPayload(current, {
        decision: actionDecision,
        comment: cleanedComment,
        technicalSite,
        department: userDepartment,
        licenseExpiryYears: Number(licenseExpiryYears) || 1,
        memoHtml: overrides.memoHtml || "",
        approvalDecisionHtml: overrides.approvalDecisionHtml || approvalDecisionDraft,
        kuChecks: overrides.kuChecks,
        officialReceiptMode,
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

      if (action.requiresPaymentDocuments || action.requiresOfficialReceipt) {
        removeStoredManualPaymentDraft(selectedRecord.id);
      }

      if (tableFirstWorkspace && config.key === "approval" && isApprovalHistoryRecord(body)) {
        setSuccess(t(action.successKey, action.success));
        setComment("");
        setSelectedId("");
        setSelectedDetail(null);
        await fetchApplications({ silent: true });
        navigate("/dashboard/admin?view=completed", { replace: true });
        return true;
      }

      setSuccess(t(action.successKey, action.success));
      setComment("");
      await fetchApplications();
      if (isFocusedPersonalWorkspace) {
        navigate("/dashboard/admin?view=personal");
        return true;
      }

      const refreshed =
        response?.data || (await apiRequest(`/applications/${selectedRecord.id}/`));

      if (tableFirstWorkspace && config.key === "approval" && isApprovalHistoryRecord(refreshed)) {
        setSelectedId("");
        setSelectedDetail(null);
        navigate("/dashboard/admin?view=completed");
        return true;
      }

      if (tableFirstWorkspace && !canOpenWorkspaceRow(config, refreshed, userDepartment)) {
        setSelectedDetail(null);
        returnToTaskList();
        return true;
      }

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
    if (isFocusedPersonalWorkspace) {
      returnToPersonalTask();
      return;
    }

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
    if (fromCompletedApprovals && returnToPath) {
      navigate(returnToPath);
      return;
    }

    setSelectedId("");
    setSelectedDetail(null);
    setCommentError("");
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

  function openSelectedFormView(applicationId) {
    if (!applicationId) return;

    const path = getSelectedFormViewPath(applicationId);
    const prefetchedApplication =
      String(selectedDetail?.id || "") === String(applicationId)
        ? selectedDetail
        : selectedRecord;

    if (formViewFallbackTimerRef.current) {
      window.clearTimeout(formViewFallbackTimerRef.current);
    }

    navigate(path, {
      flushSync: true,
      state: { prefetchedApplication },
    });

    formViewFallbackTimerRef.current = window.setTimeout(() => {
      window.location.assign(path);
    }, 150);
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
                {
                  key: "type",
                  label: t("common.type"),
                  render: (app) => getApplicationType(app, language),
                },
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
                        render: (app) => {
                          if (!canViewWorkspaceRow(config, app, userDepartment)) return null;

                          const canActOnRow = canOpenWorkspaceRow(config, app, userDepartment);

                          return (
                            <Button
                              type="button"
                              variant="secondary"
                              icon={canActOnRow ? "open_in_new" : "visibility"}
                              className="min-h-8 px-3 py-1 text-xs"
                              onClick={() => openSelectedTask(app)}
                            >
                              {canActOnRow
                                ? t("common.open", "Open")
                                : t("common.view", "View")}
                            </Button>
                          );
                        },
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
                ? fromCompletedApprovals
                  ? t("workspace.backToCompleted", "Back to Completed")
                  : t("workspace.backToAwaitingApproval", "Back to Awaiting Approval")
                : t("workspace.backToELicenseList", "Back to E-Licenses List")}
            </Button>
          </div>
        )}

        {showActionPanel && (
          <Panel
            title={t("workspace.actionPanel")}
            description={
              isReadOnlyActionPanel
                ? isApprovalHistoryRecord(selectedRecord)
                  ? t("workspace.approval.completedAction", "Final approval has been recorded.")
                  : t(
                      "workspace.approval.viewOnlyAction",
                      "View applications awaiting SUT, KB(LES), or TP(RES)/PGH action."
                    )
                : getWorkspaceActionDescription(config, t, userDepartment, selectedRecord)
            }
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
                applicationType={getLocalizedApplicationType(selectedRecord, t, language)}
                actions={
                  isFocusedPersonalWorkspace || tableFirstWorkspace ? (
                    <Button
                      variant="secondary"
                      icon="visibility"
                      onClick={() => openSelectedFormView(selectedRecord.id)}
                    >
                      {t("workspace.openForm")}
                    </Button>
                  ) : null
                }
              />

              {showWorkspaceVerificationReport && (
                <>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="secondary"
                      icon={showVerificationReport ? "visibility_off" : "visibility"}
                      onClick={() => setShowVerificationReport((visible) => !visible)}
                    >
                      {showVerificationReport
                        ? t("workspace.approval.hideVerificationReport", "Hide Verification Report")
                        : t("workspace.approval.showVerificationReport", "Show Verification Report")}
                    </Button>
                  </div>

                  {showVerificationReport && (
                    <ApprovalTechnicalReviewSummary
                      t={t}
                      language={language}
                      selectedRecord={selectedRecord}
                      technicalSite={technicalSite}
                      userDepartment={userDepartment}
                    />
                  )}
                </>
              )}

              {isIklWorkspace ? (
                <IklWorkspaceSections
                  key={selectedRecord.id}
                  t={t}
                  language={language}
                  config={config}
                  selectedRecord={selectedRecord}
                  decision={decision}
                  setDecision={setDecision}
                  comment={comment}
                  setComment={setComment}
                  technicalSite={technicalSite}
                  setTechnicalSite={setTechnicalSite}
                  technicalApplicationTypeSelection={technicalApplicationTypeSelection}
                  setTechnicalApplicationTypeSelection={setTechnicalApplicationTypeSelection}
                  saveTechnicalApplicationTypeSelection={saveTechnicalApplicationTypeSelection}
                  saveTechnicalSiteVisitDraft={saveTechnicalSiteVisitDraft}
                  saving={saving}
                  submitAction={submitAction}
                  commentError={commentError}
                  setCommentError={setCommentError}
                  technicalSizeError={technicalSizeError}
                  setTechnicalSizeError={setTechnicalSizeError}
                  userDepartment={userDepartment}
                />
              ) : (
                <>
                  {isDepartmentTechnicalWorkspace && (
                    <>
                      <TechnicalApplicationTypePanel
                        t={t}
                        language={language}
                        selectedTypes={getApplicationTypeOptionsFromApplication(selectedRecord)}
                        derivedDepartments={getSelectedTechnicalDepartments(selectedRecord)}
                        saving={false}
                        onToggle={() => {}}
                        readOnly
                      />

                      <TechnicalSiteVisitFields
                        t={t}
                        applicationId={selectedRecord.id}
                        value={technicalSite}
                        onChange={() => {}}
                        onFileChange={() => {}}
                        readOnly
                      />
                    </>
                  )}

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
                        {!isKbLesSupportWorkspace && (
                          <option value="">
                            {t("workspace.decision.selectDecision", "Select decision")}
                          </option>
                        )}
                        {decisionOptions.map((item) => (
                          <option key={item.value || item} value={item.value || item}>
                            {t(item.labelKey, item.label || item)}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}

                  {showDetailsBeforeComment && (
                    detailLoading ? (
                      <p className="text-sm text-slate-500">{t("common.loadingSelectedApplication")}</p>
                    ) : (
                      config.details && (
                        <config.details
                          app={selectedRecord}
                          t={t}
                          canChooseLicenseExpiry={canChooseLicenseExpiry}
                          licenseExpiryYears={licenseExpiryYears}
                          setLicenseExpiryYears={setLicenseExpiryYears}
                          userDepartment={userDepartment}
                          saving={saving}
                          onPaymentDocumentUpload={uploadPaymentDocument}
                          onPaymentDocumentDelete={deletePaymentDocument}
                          onManualPaymentDraftChange={updateManualPaymentDraft}
                          onManualLicenseDraftChange={updateManualLicenseDraft}
                          officialReceiptMode={officialReceiptMode}
                          setOfficialReceiptMode={setOfficialReceiptMode}
                        />
                      )
                    )
                  )}

                  {showPaymentReceiptDecision && (
                    <Field label={t("common.decision", "Decision")}>
                      <select
                        value={decision}
                        onChange={(event) => {
                          setDecision(event.target.value);
                          if (commentError) setCommentError("");
                        }}
                        className="form-input max-w-xs"
                      >
                        <option value="">
                          {t("workspace.decision.selectDecision", "Select decision")}
                        </option>
                        {paymentReceiptDecisionOptions.map((action) => (
                          <option key={action.label} value={action.label}>
                            {t(action.labelKey, action.label)}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}

                  {showWorkspaceCommentField && (
                    <Field
                      label={
                        <>
                          {isSutApprovalWorkspace
                            ? t("workspace.comment.approvalRemarks", "Remarks")
                            : t(config.commentLabelKey, config.commentLabel || "Notes")}
                          {workspaceActions.some((action) => action.requiresComment) && (
                            <span className="ml-1 text-red-600">*</span>
                          )}
                        </>
                      }
                    >
                      <textarea
                        value={comment}
                        onChange={(event) => {
                          setComment(event.target.value);
                          if (commentError) setCommentError("");
                        }}
                        rows="5"
                        required={workspaceActions.some((action) => action.requiresComment)}
                        aria-required={workspaceActions.some((action) => action.requiresComment)}
                        className={`form-input ${commentError ? "border-red-300 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(220,38,38,0.12)]" : ""}`}
                        placeholder={
                          isSutApprovalWorkspace
                            ? t("workspace.comment.approvalRemarksPlaceholder", "Enter remarks if needed.")
                            : t(config.commentPlaceholderKey, config.commentPlaceholder || "Enter notes")
                        }
                      />
                      {commentError && (
                        <p className="mt-1.5 text-[13px] font-medium leading-5 text-red-600">
                          {commentError}
                        </p>
                      )}
                    </Field>
                  )}

                  {isApprovalSupportWorkspace && canSubmitWorkspaceAction && (
                    <>
                      {showApprovalMemoPreviews && (
                        <ApprovalMemoPreview
                          app={selectedRecord}
                          memoHtml={approvalMemoHtml}
                          language={language}
                          t={t}
                        />
                      )}
                      <Field label={t("common.decision", "Decision")}>
                        <select
                          value={approvalSupportDecision}
                          onChange={(event) =>
                            isFinalApprovalSupportWorkspace
                              ? setDecision("Approve")
                              : setDecision(event.target.value)
                          }
                          className="form-input max-w-xs"
                        >
                          {!isFinalApprovalSupportWorkspace && (
                            <option value="">
                              {t("workspace.decision.selectDecision", "Select decision")}
                            </option>
                          )}
                          <option value="Approve">
                            {isFinalApprovalSupportWorkspace
                              ? t("workspace.decision.approveApplication", "Approve Application")
                              : t("workspace.decision.support", "Support")}
                          </option>
                          {!isFinalApprovalSupportWorkspace && (
                            <option value="Reject">
                              {t("workspace.decision.notSupport", "Not Support")}
                            </option>
                          )}
                        </select>
                      </Field>
                      {approvalSupportDecision && (
                        <Field label={t("workspace.comment.approvalRemarks", "Remarks")}>
                          <textarea
                            value={comment}
                            onChange={(event) => setComment(event.target.value)}
                            rows="5"
                            className="form-input"
                            placeholder={t("workspace.comment.approvalRemarksPlaceholder", "Enter approval remarks if needed.")}
                          />
                        </Field>
                      )}
                    </>
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
                    !showDetailsBeforeComment && (
                      <p className="text-sm text-slate-500">{t("common.loadingSelectedApplication")}</p>
                    )
                  ) : (
                    !showDetailsBeforeComment && config.details && (
                      <config.details
                        app={selectedRecord}
                        t={t}
                        canChooseLicenseExpiry={canChooseLicenseExpiry}
                        licenseExpiryYears={licenseExpiryYears}
                        setLicenseExpiryYears={setLicenseExpiryYears}
                        userDepartment={userDepartment}
                        saving={saving}
                        onPaymentDocumentUpload={uploadPaymentDocument}
                        onPaymentDocumentDelete={deletePaymentDocument}
                        onManualPaymentDraftChange={updateManualPaymentDraft}
                        onManualLicenseDraftChange={updateManualLicenseDraft}
                        officialReceiptMode={officialReceiptMode}
                        setOfficialReceiptMode={setOfficialReceiptMode}
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
                        icon="visibility"
                        onClick={() => openSelectedFormView(selectedRecord.id)}
                      >
                        {t("workspace.openForm")}
                      </Button>
                    )}
                    {isApprovalSupportWorkspace || canSendSavedApprovalMemoToMphlg ? (
                      <>
                        <Button
                          onClick={() =>
                            submitApprovalSupport(
                              isFinalApprovalSupportWorkspace || canSendSavedApprovalMemoToMphlg
                                ? "Approve"
                                : approvalSupportDecision
                            )
                          }
                          disabled={
                            saving ||
                            (!canSendSavedApprovalMemoToMphlg && !approvalSupportDecision)
                          }
                          variant="primary"
                          icon="send"
                          className="min-w-40"
                        >
                          {saving ? t("workspace.saving") : t("workspace.memo.send", "Send")}
                        </Button>
                      </>
                    ) : showPaymentReceiptDecision ? (
                      <Button
                        onClick={() => {
                          if (!selectedPaymentReceiptAction) {
                            setError(t("workspace.decision.required", "Please select a decision."));
                            return;
                          }

                          submitAction(selectedPaymentReceiptAction, {
                            decision,
                            checkDecisionRemark: false,
                          });
                        }}
                        disabled={saving || !selectedPaymentReceiptAction}
                        variant={selectedPaymentReceiptAction?.variant || "primary"}
                        icon="send"
                        className="min-w-40"
                      >
                        {saving ? t("workspace.saving") : t("common.submit", "Submit")}
                      </Button>
                    ) : showApprovalDecisionButtons ? (
                      <>
                        {!isSutApprovalWorkspace && (
                          <Button
                            onClick={() => submitApprovalDecisionButton("Reject")}
                            disabled={saving}
                            variant="danger"
                            icon="cancel"
                            className="min-w-40"
                          >
                            {t("workspace.decision.notApprove", "Not Approve")}
                          </Button>
                        )}
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
              <Info label={t("common.type")} value={getLocalizedApplicationType(selectedRecord, t, language)} />
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
          titleKey={pendingMemoSubmission.titleKey}
          title={pendingMemoSubmission.title}
          descriptionKey={pendingMemoSubmission.descriptionKey}
          description={pendingMemoSubmission.description}
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

function KbLesMemoModal({
  t,
  titleKey = "workspace.memo.title",
  title = "Memo to TP(RES)/PGH",
  descriptionKey = "workspace.memo.description",
  description = "Complete the memo template. This exact memo will appear in TP(RES)/PGH notifications.",
  value,
  saving,
  onChange,
  onCancel,
  onSend,
}) {
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
            {t(titleKey, title)}
          </h2>
          <p className="mt-1 text-[14px] leading-5 text-slate-500">
            {t(descriptionKey, description)}
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

function ApprovalMemoPreview({ app, memoHtml, language, t }) {
  if (!memoHtml) return null;

  const memoFields = extractFormalMemoFields(memoHtml);
  const memoDate = getMemoTimestampValue(memoFields.date, getApprovalMemoTimestamp(app, language));
  const memoYourDate = memoFields.yourDate;
  const copy = getApprovalMemoCopy(language);
  const memoContentHtml = localizeKbLesToTpMemoHtml(memoHtml, language);
  const recipient = localizeFormalMemoFieldValue(memoFields.to || "TP(RES)", language);
  const sender = localizeFormalMemoFieldValue(memoFields.from || "KB(LES)", language);

  return (
    <section className="overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-3">
        <p className="text-[13px] font-semibold uppercase leading-5 tracking-wide text-slate-500">
          {t("workspace.memo.previewTitle", "Memo from KB(LES)")}
        </p>
        <p className="mt-1 text-[14px] leading-5 text-slate-500">
          {t(
            "workspace.memo.previewDescription",
            "This is the memo sent with the notification for this approval."
          )}
        </p>
      </div>
      <div className="px-4 py-4">
        <section className="w-full text-slate-950">
          <div className="rounded-md border border-slate-300 bg-white px-5 py-6 text-sm leading-6 sm:px-7 sm:py-7">
            <div className="text-center font-serif text-xl font-bold uppercase leading-6 text-slate-950">
              <p>DEWAN BANDARAYA KUCHING UTARA</p>
              <p>MEMORANDUM</p>
            </div>

            <div className="mt-6 divide-y divide-slate-400 border-y border-slate-500">
              <FormalMemoRow label={copy.labels.to} value={recipient} />
              <FormalMemoRow label={copy.labels.through} value={localizeFormalMemoFieldValue(memoFields.through, language)} />
              <FormalMemoRow label={copy.labels.from} value={sender} />
              <div className="grid divide-y divide-slate-500 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                <FormalMemoRow label={copy.labels.ourRef} value={memoFields.ourRef} compact />
                <FormalMemoRow label={copy.labels.date} value={memoDate} compact />
              </div>
              <div className="grid divide-y divide-slate-500 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                <FormalMemoRow label={copy.labels.yourRef} value={memoFields.yourRef} compact />
                <FormalMemoRow label={copy.labels.date} value={memoYourDate} compact />
              </div>
            </div>

            <div className="mt-4 space-y-4 leading-6 text-slate-950">
              {memoContentHtml ? (
                <div
                  className="memo-template [&_figure]:my-3 [&_table]:w-full [&_table]:border-collapse [&_td]:align-top [&_th]:align-top"
                  dangerouslySetInnerHTML={{ __html: memoContentHtml }}
                />
              ) : (
                <p className="text-slate-500">
                  {t("workspace.memo.emptyBody", "No memo message was provided.")}
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}

function ApprovalDecisionMemoPreview({ memoHtml, t }) {
  const sanitizedMemoHtml = sanitizeMemoHtml(memoHtml);

  return (
    <section className="overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-3">
        <div>
          <p className="text-[13px] font-semibold uppercase leading-5 tracking-wide text-slate-500">
            {t("workspace.memo.savedPreviewTitle", "Saved Memo Content")}
          </p>
          <p className="mt-1 text-[14px] leading-5 text-slate-500">
            {t(
              "workspace.memo.savedPreviewDescription",
              "This memo will be submitted with the approval decision."
            )}
          </p>
        </div>
      </div>
      <div className="px-4 py-4">
        <div
          className="memo-template rounded-md border border-slate-300 bg-white px-5 py-5 text-sm leading-6 text-slate-950 [&_figure]:my-3 [&_table]:w-full [&_table]:border-collapse [&_td]:align-top [&_th]:align-top"
          dangerouslySetInnerHTML={{ __html: sanitizedMemoHtml }}
        />
      </div>
    </section>
  );
}

function FormalMemoRow({ label, value, compact = false }) {
  return (
    <div className={`grid grid-cols-[96px_1fr] items-start gap-2 px-2 ${compact ? "py-1.5" : "py-2"}`}>
      <span className="font-bold">{label} :</span>
      <span className="min-w-0 break-words">{value ?? ""}</span>
    </div>
  );
}

function mergeFormData(app, next) {
  return {
    ...(app.form_data || {}),
    ...next,
  };
}

function createPtIklToKuMemoTemplate(app) {
  const now = new Date();
  const memoDate = new Intl.DateTimeFormat("ms-MY", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(now);
  const reference = getApplicationReference(app);
  const applicantName = getApplicantName(app);
  const applicationType = getApplicationType(app);
  const projectName = getProjectName(app);
  const location = getApplicationLocation(app);

  return `
    <h3 style="text-align:center;"><strong>DEWAN BANDARAYA KUCHING UTARA</strong><br><strong>MEMORANDUM</strong></h3>
    <figure class="table"><table style="width:100%;border-collapse:collapse;">
      <tbody>
        <tr>
          <td style="width:120px;border:1px solid #bfbfbf;padding:6px;"><strong>Kepada :</strong></td>
          <td colspan="3" style="border:1px solid #bfbfbf;padding:6px;">KU(IKL)</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Melalui :</strong></td>
          <td colspan="3" style="border:1px solid #bfbfbf;padding:6px;">&nbsp;</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Daripada :</strong></td>
          <td colspan="3" style="border:1px solid #bfbfbf;padding:6px;">PT(IKL)</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Ruj. Kami :</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(reference)}</td>
          <td style="width:80px;border:1px solid #bfbfbf;padding:6px;"><strong>Tarikh:</strong></td>
          <td style="width:160px;border:1px solid #bfbfbf;padding:6px;">${escapeHtml(memoDate)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Ruj. Tuan :</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">&nbsp;</td>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Tarikh:</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">&nbsp;</td>
        </tr>
      </tbody>
    </table></figure>
    <p><strong><u>PERMOHONAN UNTUK SEMAKAN KU(IKL)</u></strong></p>
    <p>Dengan segala hormatnya perkara di atas dirujuk.</p>
    <p>Permohonan ${escapeHtml(reference)} telah disemak oleh PT(IKL) dan dikemukakan kepada KU(IKL) untuk semakan lanjut.</p>
    <figure class="table"><table style="width:100%;border-collapse:collapse;">
      <tbody>
        <tr>
          <td style="width:160px;border:1px solid #bfbfbf;padding:6px;"><strong>Pemohon</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(applicantName)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Jenis Permohonan</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(applicationType)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Projek</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(projectName)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Lokasi</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(location)}</td>
        </tr>
      </tbody>
    </table></figure>
    <p>Mohon pihak KU(IKL) membuat semakan dan tindakan selanjutnya.</p>
    <p>Sekian, terima kasih.</p>
  `;
}

function createKuIklToTechnicalMemoTemplate(app) {
  const now = new Date();
  const memoDate = new Intl.DateTimeFormat("ms-MY", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(now);
  const reference = getApplicationReference(app);
  const applicantName = getApplicantName(app);
  const applicationType = getApplicationType(app);
  const projectName = getProjectName(app);
  const location = getApplicationLocation(app);

  return `
    <h3 style="text-align:center;"><strong>DEWAN BANDARAYA KUCHING UTARA</strong><br><strong>MEMORANDUM</strong></h3>
    <figure class="table"><table style="width:100%;border-collapse:collapse;">
      <tbody>
        <tr>
          <td style="width:120px;border:1px solid #bfbfbf;padding:6px;"><strong>Kepada :</strong></td>
          <td colspan="3" style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(KU_TECHNICAL_MEMO_RECIPIENT)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Melalui :</strong></td>
          <td colspan="3" style="border:1px solid #bfbfbf;padding:6px;">&nbsp;</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Daripada :</strong></td>
          <td colspan="3" style="border:1px solid #bfbfbf;padding:6px;">KU(IKL)</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Ruj. Kami :</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(reference)}</td>
          <td style="width:80px;border:1px solid #bfbfbf;padding:6px;"><strong>Tarikh:</strong></td>
          <td style="width:160px;border:1px solid #bfbfbf;padding:6px;">${escapeHtml(memoDate)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Ruj. Tuan :</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">&nbsp;</td>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Tarikh:</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">&nbsp;</td>
        </tr>
      </tbody>
    </table></figure>
    <p><strong><u>PERMOHONAN UNTUK SEMAKAN TEKNIKAL</u></strong></p>
    <p>Dengan segala hormatnya perkara di atas dirujuk.</p>
    <p>Permohonan ${escapeHtml(reference)} telah disemak oleh KU(IKL) dan dikemukakan kepada IKL(TECHNICAL) untuk semakan teknikal.</p>
    <figure class="table"><table style="width:100%;border-collapse:collapse;">
      <tbody>
        <tr>
          <td style="width:160px;border:1px solid #bfbfbf;padding:6px;"><strong>Pemohon</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(applicantName)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Jenis Permohonan</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(applicationType)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Projek</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(projectName)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Lokasi</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(location)}</td>
        </tr>
      </tbody>
    </table></figure>
    <p>Mohon pihak IKL(TECHNICAL) membuat semakan teknikal dan tindakan selanjutnya.</p>
    <p>Sekian, terima kasih.</p>
  `;
}

function createKuIklFinalReviewMemoTemplate(app, technicalSite, decision, comment) {
  const now = new Date();
  const memoDate = new Intl.DateTimeFormat("ms-MY", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(now);
  const amendmentRequired = decision === "KU(IKL) Request Technical Amendment";
  const recipient = amendmentRequired ? "IKL(TECHNICAL)" : "KB(LES)";
  const subject = amendmentRequired
    ? "PINDAAN SEMAKAN TEKNIKAL DIPERLUKAN"
    : "SEMAKAN AKHIR TEKNIKAL KU(IKL)";
  const bodyLine = amendmentRequired
    ? "KU(IKL) memohon pindaan teknikal dibuat sebelum semakan boleh diteruskan."
    : "KU(IKL) telah membuat semakan akhir teknikal dan mengemukakan permohonan ini untuk pengesahan KB(LES).";
  const closingLine = amendmentRequired
    ? "Mohon pihak IKL(TECHNICAL) membuat pindaan dan tindakan selanjutnya."
    : "Mohon pihak KB(LES) membuat pengesahan dan tindakan selanjutnya.";
  const reviewTechnicalSite = getReviewTechnicalSite(technicalSite, app);
  const feeSummary = getTechnicalFeeSummary(reviewTechnicalSite);
  const reference = getApplicationReference(app);
  const applicantName = getApplicantName(app);
  const applicationType = getApplicationType(app);
  const projectName = getProjectName(app);
  const location = getApplicationLocation(app);
  const remarks = comment || "";

  return `
    <h3 style="text-align:center;"><strong>DEWAN BANDARAYA KUCHING UTARA</strong><br><strong>MEMORANDUM</strong></h3>
    <figure class="table"><table style="width:100%;border-collapse:collapse;">
      <tbody>
        <tr>
          <td style="width:120px;border:1px solid #bfbfbf;padding:6px;"><strong>Kepada :</strong></td>
          <td colspan="3" style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(recipient)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Melalui :</strong></td>
          <td colspan="3" style="border:1px solid #bfbfbf;padding:6px;">&nbsp;</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Daripada :</strong></td>
          <td colspan="3" style="border:1px solid #bfbfbf;padding:6px;">KU(IKL)</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Ruj. Kami :</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(reference)}</td>
          <td style="width:80px;border:1px solid #bfbfbf;padding:6px;"><strong>Tarikh:</strong></td>
          <td style="width:160px;border:1px solid #bfbfbf;padding:6px;">${escapeHtml(memoDate)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Ruj. Tuan :</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">&nbsp;</td>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Tarikh:</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">&nbsp;</td>
        </tr>
      </tbody>
    </table></figure>
    <p><strong><u>${escapeHtml(subject)}</u></strong></p>
    <p>Dengan segala hormatnya perkara di atas dirujuk.</p>
    <p>${escapeHtml(bodyLine)}</p>
    <figure class="table"><table style="width:100%;border-collapse:collapse;">
      <tbody>
        <tr>
          <td style="width:180px;border:1px solid #bfbfbf;padding:6px;"><strong>Pemohon</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(applicantName)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Jenis Permohonan</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(applicationType)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Projek</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(projectName)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Lokasi</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(location)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Keputusan KU(IKL)</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(decision)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Yuran Lesen</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(formatCurrency(feeSummary.feeTotal || 0))}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Deposit</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(formatCurrency(feeSummary.deposit || 0))}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Jumlah Perlu Dibayar</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(formatCurrency(feeSummary.totalPayable || 0))}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Catatan</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(remarks)}</td>
        </tr>
      </tbody>
    </table></figure>
    <p>${escapeHtml(closingLine)}</p>
    <p>Sekian, terima kasih.</p>
  `;
}

function createIklTechnicalToKuMemoTemplate(app, technicalSite, decision, comment) {
  const now = new Date();
  const memoDate = new Intl.DateTimeFormat("ms-MY", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(now);
  const reviewTechnicalSite = getReviewTechnicalSite(technicalSite, app);
  const feeSummary = getTechnicalFeeSummary(reviewTechnicalSite);
  const reference = getApplicationReference(app);
  const applicantName = getApplicantName(app);
  const applicationType = getApplicationType(app);
  const projectName = getProjectName(app);
  const location = getApplicationLocation(app);
  const remarks = comment || reviewTechnicalSite.site_remarks || "";

  return `
    <h3 style="text-align:center;"><strong>DEWAN BANDARAYA KUCHING UTARA</strong><br><strong>MEMORANDUM</strong></h3>
    <figure class="table"><table style="width:100%;border-collapse:collapse;">
      <tbody>
        <tr>
          <td style="width:120px;border:1px solid #bfbfbf;padding:6px;"><strong>Kepada :</strong></td>
          <td colspan="3" style="border:1px solid #bfbfbf;padding:6px;">KU(IKL)</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Melalui :</strong></td>
          <td colspan="3" style="border:1px solid #bfbfbf;padding:6px;">&nbsp;</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Daripada :</strong></td>
          <td colspan="3" style="border:1px solid #bfbfbf;padding:6px;">IKL(TECHNICAL)</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Ruj. Kami :</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(reference)}</td>
          <td style="width:80px;border:1px solid #bfbfbf;padding:6px;"><strong>Tarikh:</strong></td>
          <td style="width:160px;border:1px solid #bfbfbf;padding:6px;">${escapeHtml(memoDate)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Ruj. Tuan :</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">&nbsp;</td>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Tarikh:</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">&nbsp;</td>
        </tr>
      </tbody>
    </table></figure>
    <p><strong><u>KEPUTUSAN SEMAKAN TEKNIKAL UNTUK KU(IKL)</u></strong></p>
    <p>Dengan segala hormatnya perkara di atas dirujuk.</p>
    <p>Semakan teknikal bagi permohonan ${escapeHtml(reference)} telah selesai dan dikemukakan kepada KU(IKL) untuk semakan lanjut.</p>
    <figure class="table"><table style="width:100%;border-collapse:collapse;">
      <tbody>
        <tr>
          <td style="width:180px;border:1px solid #bfbfbf;padding:6px;"><strong>Pemohon</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(applicantName)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Jenis Permohonan</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(applicationType)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Projek</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(projectName)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Lokasi</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(location)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Keputusan</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(decision)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Yuran Lesen</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(formatCurrency(feeSummary.feeTotal || 0))}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Deposit</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(formatCurrency(feeSummary.deposit || 0))}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Jumlah Perlu Dibayar</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(formatCurrency(feeSummary.totalPayable || 0))}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Catatan</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(remarks)}</td>
        </tr>
      </tbody>
    </table></figure>
    <p>Mohon pihak KU(IKL) membuat semakan dan tindakan selanjutnya.</p>
    <p>Sekian, terima kasih.</p>
  `;
}

function createKbLesMemoTemplate(app, technicalSite) {
  const reviewTechnicalSite = getReviewTechnicalSite(technicalSite, app);
  const feeSummary = getTechnicalFeeSummary(reviewTechnicalSite);
  const total = feeSummary.feeTotal;
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

function createKbLesToKuAmendmentMemoTemplate(app, comment) {
  const now = new Date();
  const memoDate = new Intl.DateTimeFormat("ms-MY", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(now);
  const reference = getApplicationReference(app);
  const applicantName = getApplicantName(app);
  const applicationType = getApplicationType(app);
  const projectName = getProjectName(app);
  const location = getApplicationLocation(app);

  return `
    <h3 style="text-align:center;"><strong>DEWAN BANDARAYA KUCHING UTARA</strong><br><strong>MEMORANDUM</strong></h3>
    <figure class="table"><table style="width:100%;border-collapse:collapse;">
      <tbody>
        <tr>
          <td style="width:120px;border:1px solid #bfbfbf;padding:6px;"><strong>Kepada :</strong></td>
          <td colspan="3" style="border:1px solid #bfbfbf;padding:6px;">KU(IKL)</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Melalui :</strong></td>
          <td colspan="3" style="border:1px solid #bfbfbf;padding:6px;">&nbsp;</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Daripada :</strong></td>
          <td colspan="3" style="border:1px solid #bfbfbf;padding:6px;">KB(LES)</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Ruj. Kami :</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(reference)}</td>
          <td style="width:80px;border:1px solid #bfbfbf;padding:6px;"><strong>Tarikh:</strong></td>
          <td style="width:160px;border:1px solid #bfbfbf;padding:6px;">${escapeHtml(memoDate)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Ruj. Tuan :</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">&nbsp;</td>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Tarikh:</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">&nbsp;</td>
        </tr>
      </tbody>
    </table></figure>
    <p><strong><u>PINDAAN SEMAKAN KU(IKL) DIPERLUKAN</u></strong></p>
    <p>Dengan segala hormatnya perkara di atas dirujuk.</p>
    <p>Permohonan ${escapeHtml(reference)} telah disemak oleh KB(LES) dan dikembalikan kepada KU(IKL) untuk pindaan sebelum pengesahan boleh diteruskan.</p>
    <figure class="table"><table style="width:100%;border-collapse:collapse;">
      <tbody>
        <tr>
          <td style="width:180px;border:1px solid #bfbfbf;padding:6px;"><strong>Pemohon</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(applicantName)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Jenis Permohonan</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(applicationType)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Projek</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(projectName)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Lokasi</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(location)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Catatan</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(comment)}</td>
        </tr>
      </tbody>
    </table></figure>
    <p>Mohon pihak KU(IKL) membuat pindaan dan tindakan selanjutnya.</p>
    <p>Sekian, terima kasih.</p>
  `;
}

function createTpResToKuAmendmentMemoTemplate(app) {
  const now = new Date();
  const year = now.getFullYear();
  const memoDate = new Intl.DateTimeFormat("ms-MY", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(now);
  const reference = getApplicationReference(app);

  return `
    <h3 style="text-align:center;margin:0 0 28px 0;"><strong>DEWAN BANDARAYA KUCHING UTARA</strong><br><strong>MEMORANDUM</strong></h3>
    <figure class="table"><table style="width:100%;border-collapse:collapse;">
      <tbody>
        <tr>
          <td style="width:120px;border-top:1px solid #8ea2c5;border-bottom:1px solid #8ea2c5;padding:8px 10px;"><strong>Kepada :</strong></td>
          <td colspan="3" style="border-top:1px solid #8ea2c5;border-bottom:1px solid #8ea2c5;padding:8px 10px;">KU (IKL)</td>
        </tr>
        <tr>
          <td style="border-bottom:1px solid #8ea2c5;padding:8px 10px;"><strong>Melalui :</strong></td>
          <td colspan="3" style="border-bottom:1px solid #8ea2c5;padding:8px 10px;">&nbsp;</td>
        </tr>
        <tr>
          <td style="border-bottom:1px solid #8ea2c5;padding:8px 10px;"><strong>Daripada :</strong></td>
          <td colspan="3" style="border-bottom:1px solid #8ea2c5;padding:8px 10px;">TP(RES)</td>
        </tr>
        <tr>
          <td style="border-bottom:1px solid #8ea2c5;padding:8px 10px;"><strong>Ruj. Kami :</strong></td>
          <td style="border-bottom:1px solid #8ea2c5;padding:8px 10px;">DBKU/LES/IKL/M/${year}(1)</td>
          <td style="width:120px;border-bottom:1px solid #8ea2c5;padding:8px 10px;"><strong>Tarikh :</strong></td>
          <td style="width:260px;border-bottom:1px solid #8ea2c5;padding:8px 10px;">${escapeHtml(memoDate)}</td>
        </tr>
        <tr>
          <td style="border-bottom:1px solid #8ea2c5;padding:8px 10px;"><strong>Ruj. Tuan :</strong></td>
          <td style="border-bottom:1px solid #8ea2c5;padding:8px 10px;">${escapeHtml(reference)}</td>
          <td style="border-bottom:1px solid #8ea2c5;padding:8px 10px;"><strong>Tarikh :</strong></td>
          <td style="border-bottom:1px solid #8ea2c5;padding:8px 10px;">${escapeHtml(memoDate)}</td>
        </tr>
      </tbody>
    </table></figure>
    <p>&nbsp;</p>
    <p><strong><u>CATATAN TIDAK LULUS / PINDAAN DIPERLUKAN</u></strong></p>
    <p>Dengan segala hormatnya perkara di atas dirujuk.</p>
    <p>Catatan / sebab tidak diluluskan:</p>
    <p>....................................................................................................................</p>
    <p>....................................................................................................................</p>
    <p>....................................................................................................................</p>
    <p>....................................................................................................................</p>
    <p>Mohon pihak KU(IKL) membuat pindaan dan tindakan selanjutnya berdasarkan catatan di atas.</p>
    <p>Sekian, terima kasih.</p>
  `;
}

function createMphlgToKuAmendmentMemoTemplate(app) {
  const now = new Date();
  const year = now.getFullYear();
  const memoDate = new Intl.DateTimeFormat("ms-MY", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(now);
  const reference = getApplicationReference(app);
  const applicantName = getApplicantName(app);
  const applicationType = getApplicationType(app);
  const projectName = getProjectName(app);
  const location = getApplicationLocation(app);

  return `
    <h3 style="text-align:center;"><strong>DEWAN BANDARAYA KUCHING UTARA</strong><br><strong>MEMORANDUM</strong></h3>
    <figure class="table"><table style="width:100%;border-collapse:collapse;">
      <tbody>
        <tr>
          <td style="width:120px;border:1px solid #bfbfbf;padding:6px;"><strong>Kepada :</strong></td>
          <td colspan="3" style="border:1px solid #bfbfbf;padding:6px;">KU(IKL)</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Melalui :</strong></td>
          <td colspan="3" style="border:1px solid #bfbfbf;padding:6px;">&nbsp;</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Daripada :</strong></td>
          <td colspan="3" style="border:1px solid #bfbfbf;padding:6px;">MPHLG</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Ruj. Kami :</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">DBKU/LES/IKL/M/${year}(1)</td>
          <td style="width:80px;border:1px solid #bfbfbf;padding:6px;"><strong>Tarikh:</strong></td>
          <td style="width:160px;border:1px solid #bfbfbf;padding:6px;">${escapeHtml(memoDate)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Ruj. Tuan :</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(reference)}</td>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Tarikh:</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">&nbsp;</td>
        </tr>
      </tbody>
    </table></figure>
    <p><strong><u>PINDAAN KU(IKL) DIPERLUKAN</u></strong></p>
    <p>Dengan segala hormatnya perkara di atas dirujuk.</p>
    <p>Permohonan ${escapeHtml(reference)} telah disemak oleh MPHLG dan dikembalikan kepada KU(IKL) untuk pindaan sebelum proses kelulusan boleh diteruskan.</p>
    <figure class="table"><table style="width:100%;border-collapse:collapse;">
      <tbody>
        <tr>
          <td style="width:180px;border:1px solid #bfbfbf;padding:6px;"><strong>Pemohon</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(applicantName)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Jenis Permohonan</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(applicationType)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Projek</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(projectName)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Lokasi</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(location)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Catatan MPHLG</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">Sila nyatakan catatan pindaan di sini.</td>
        </tr>
      </tbody>
    </table></figure>
    <p>Mohon pihak KU(IKL) membuat pindaan dan tindakan selanjutnya.</p>
    <p>Sekian, terima kasih.</p>
  `;
}

function createMphlgToSutMemoTemplate(app) {
  const forwardedMemoHtml = String(
    getApplicationSection(app, "mphlg_gateway")?.memo_html || ""
  ).trim();
  if (forwardedMemoHtml) return normalizeMphlgToSutForwardedMemoHtml(forwardedMemoHtml);

  const now = new Date();
  const year = now.getFullYear();
  const memoDate = new Intl.DateTimeFormat("ms-MY", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(now);
  const reference = getApplicationReference(app);
  const applicantName = getApplicantName(app);
  const applicationType = getApplicationType(app);
  const projectName = getProjectName(app);
  const location = getApplicationLocation(app);

  return `
    <h3 style="text-align:center;"><strong>DEWAN BANDARAYA KUCHING UTARA</strong><br><strong>MEMORANDUM</strong></h3>
    <figure class="table"><table style="width:100%;border-collapse:collapse;">
      <tbody>
        <tr>
          <td style="width:120px;border:1px solid #bfbfbf;padding:6px;"><strong>Kepada :</strong></td>
          <td colspan="3" style="border:1px solid #bfbfbf;padding:6px;">SUT</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Melalui :</strong></td>
          <td colspan="3" style="border:1px solid #bfbfbf;padding:6px;">&nbsp;</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Daripada :</strong></td>
          <td colspan="3" style="border:1px solid #bfbfbf;padding:6px;">MPHLG</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Ruj. Kami :</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">DBKU/LES/IKL/M/${year}(1)</td>
          <td style="width:80px;border:1px solid #bfbfbf;padding:6px;"><strong>Tarikh:</strong></td>
          <td style="width:160px;border:1px solid #bfbfbf;padding:6px;">${escapeHtml(memoDate)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Ruj. Tuan :</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(reference)}</td>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Tarikh:</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">&nbsp;</td>
        </tr>
      </tbody>
    </table></figure>
    <p><strong><u>KELULUSAN MPHLG UNTUK TINDAKAN SUT</u></strong></p>
    <p>Dengan segala hormatnya perkara di atas dirujuk.</p>
    <p>Permohonan ${escapeHtml(reference)} telah diluluskan oleh MPHLG dan dikemukakan kepada SUT untuk tindakan kelulusan seterusnya.</p>
    <figure class="table"><table style="width:100%;border-collapse:collapse;">
      <tbody>
        <tr>
          <td style="width:180px;border:1px solid #bfbfbf;padding:6px;"><strong>Pemohon</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(applicantName)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Jenis Permohonan</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(applicationType)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Projek</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(projectName)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Lokasi</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(location)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Catatan MPHLG</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">Sila nyatakan catatan kelulusan di sini.</td>
        </tr>
      </tbody>
    </table></figure>
    <p>Mohon pihak SUT membuat tindakan selanjutnya.</p>
    <p>Sekian, terima kasih.</p>
  `;
}

function normalizeMphlgToSutForwardedMemoHtml(html) {
  const source = String(html || "").trim();
  if (!source) return "";

  if (typeof window === "undefined" || !window.DOMParser) {
    return source
      .replace(/(<strong>\s*Kepada\s*:\s*<\/strong>\s*<\/td>\s*<td[^>]*>)[^<]*/i, "$1SUT")
      .replace(/(<strong>\s*Daripada\s*:\s*<\/strong>\s*<\/td>\s*<td[^>]*>)[^<]*/i, "$1MPHLG");
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(source, "text/html");
  document.querySelectorAll("tr").forEach((row) => {
    const cells = Array.from(row.querySelectorAll("td"));
    if (cells.length < 2) return;

    const label = cells[0].textContent.replace(/\s+/g, " ").trim().toLowerCase();
    if (label.startsWith("kepada")) {
      cells[1].textContent = "SUT";
    }
    if (label.startsWith("daripada")) {
      cells[1].textContent = "MPHLG";
    }
  });

  return document.body.innerHTML;
}

function createTpResToMphlgMemoTemplate(app) {
  const now = new Date();
  const year = now.getFullYear();
  const memoDate = new Intl.DateTimeFormat("ms-MY", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(now);
  const reference = getApplicationReference(app);
  const applicantName = getApplicantName(app) || "pemohon";
  const applicationType = getLocalizedApplicationType(app, (key, fallback) => fallback) || "lesen iklan";
  const projectName = getProjectName(app);
  const location = getApplicationLocation(app);
  const subject = `PERMOHONAN ${String(projectName || applicationType || "IKLAN").toUpperCase()}`;
  const applicationDetails = [
    projectName ? projectName : "",
    location ? `di ${location}` : "",
  ].filter(Boolean).join(" ");
  const applicationDescription = applicationDetails
    ? `${applicantName} berkenaan ${applicationDetails}`
    : applicantName;

  return `
    <div style="font-family:Arial, sans-serif;font-size:14px;line-height:1.45;color:#000;">
      <h3 style="text-align:center;margin:0 0 16px 0;font-size:17px;line-height:1.35;"><strong>DEWAN BANDARAYA KUCHING UTARA</strong><br><strong>MEMORANDUM</strong></h3>
      <figure class="table" style="margin:0 0 24px 0;"><table style="width:74%;margin-left:auto;margin-right:auto;border-collapse:collapse;border:1px solid #bfbfbf;">
        <tbody>
          <tr>
            <td style="width:92px;border:1px solid #bfbfbf;padding:7px 8px;"><strong>Kepada :</strong></td>
            <td colspan="3" style="border:1px solid #bfbfbf;padding:7px 8px;">MPHLG</td>
          </tr>
          <tr>
            <td style="border:1px solid #bfbfbf;padding:7px 8px;"><strong>Melalui :</strong></td>
            <td colspan="3" style="border:1px solid #bfbfbf;padding:7px 8px;">&nbsp;</td>
          </tr>
          <tr>
            <td style="border:1px solid #bfbfbf;padding:7px 8px;"><strong>Daripada :</strong></td>
            <td colspan="3" style="border:1px solid #bfbfbf;padding:7px 8px;">TP(RES)</td>
          </tr>
          <tr>
            <td style="border:1px solid #bfbfbf;padding:7px 8px;"><strong>Ruj. Kami :</strong></td>
            <td style="width:34%;border:1px solid #bfbfbf;padding:7px 8px;">DBKU/LES/IKL/M/${year}(1)</td>
            <td style="width:82px;border:1px solid #bfbfbf;padding:7px 8px;"><strong>Tarikh :</strong></td>
            <td style="width:32%;border:1px solid #bfbfbf;padding:7px 8px;">${escapeHtml(memoDate)}</td>
          </tr>
          <tr>
            <td style="border:1px solid #bfbfbf;padding:7px 8px;"><strong>Ruj. Tuan :</strong></td>
            <td style="border:1px solid #bfbfbf;padding:7px 8px;">${escapeHtml(reference)}</td>
            <td style="border:1px solid #bfbfbf;padding:7px 8px;"><strong>Tarikh :</strong></td>
            <td style="border:1px solid #bfbfbf;padding:7px 8px;">${escapeHtml(memoDate)}</td>
          </tr>
        </tbody>
      </table></figure>

      <div style="margin-left:24px;margin-bottom:0;">
        <p style="margin:0;">Setiausaha Tetap/</p>
        <p style="margin:0;">Kementerian Kerajaan Tempatan dan Perumahan</p>
        <p style="margin:0;">Tingkat 2, Baitul Makmur</p>
        <p style="margin:0;">Medan Raya</p>
        <p style="margin:0;">93050 Kuching</p>
        <p style="margin:0;">Sarawak</p>
        <p style="margin:0;">&nbsp;</p>
        <p style="margin:0;">(u.p. : Encik Job Anak Nelson Nyangau)</p>
      </div>

      <p style="margin:0;">&nbsp;</p>
      <p style="margin:0 0 0 24px;">Tuan</p>
      <p style="margin:0;">&nbsp;</p>
      <p style="margin:0 0 0 24px;border-bottom:1px solid #000;width:76%;"><strong>${escapeHtml(subject)}</strong></p>
      <p style="margin:0;">&nbsp;</p>
      <p style="margin:0 0 0 24px;">Dengan segala hormatnya perkara di atas dirujuk.</p>
      <p style="margin:0;">&nbsp;</p>

      <p style="margin:0 0 0 24px;">Pihak Dewan Bandaraya Kuching Utara (DBKU) telah menerima permohonan ${escapeHtml(applicationDescription)} bersama ini dikemukakan dokumen yang dikehendaki :-</p>
      <ol type="a" style="margin:8px 0 0 54px;padding-left:20px;">
        <li style="padding-left:6px;"><em>'Siting Application Form' (Form F);</em></li>
        <li style="padding-left:6px;">Tujuh (7) set bersama A3 lakaran visual yang lengkap beserta ukuran, jenis cat, dimensi huruf-huruf dan ketebalan cat; dan</li>
        <li style="padding-left:6px;">Tujuh (7) set pelan lokasi.</li>
      </ol>

      <p style="margin:0;">&nbsp;</p>
      <p style="margin:0 0 0 24px;">Justeru, permohonan diajukan kepada pihak tuan untuk kelulusan pertapakan iklan di dinding bangunan tersebut.</p>
      <p style="margin:0;">&nbsp;</p>
      <p style="margin:0 0 0 24px;">Sekiranya tuan memerlukan keterangan lanjut, sila hubungi Cik Dayang Amirah Farzana/Puan Phyrra di talian 082-495079.</p>
      <p style="margin:0;">&nbsp;</p>
      <p style="margin:0 0 0 24px;">Sekian. Terima kasih.</p>

      <p style="margin:0;">&nbsp;</p>
      <p style="margin:0 0 0 24px;"><strong><em>"AN HONOUR TO SERVE"</em></strong></p>
      <p style="margin:0 0 0 24px;"><strong><em>"TOGETHER WE CARE"</em></strong></p>

      <p style="margin:0;">&nbsp;</p>
      <p style="margin:0;">&nbsp;</p>
      <p style="margin:0 0 0 24px;"><strong>(TP(RES))</strong></p>
      <p style="margin:0 0 0 24px;">TP(RES)</p>
      <p style="margin:0 0 0 24px;">Dewan Bandaraya Kuching Utara</p>

      <p style="margin:0;">&nbsp;</p>
      <div style="border-top:2px solid #000;border-bottom:1px solid #000;padding:6px 0;text-align:center;font-size:11px;line-height:1.2;">
        <p style="margin:0;"><strong>"UNTUK MEMPERTINGKAT KUALITI KEHIDUPAN DENGAN MEWUJUDKAN PERSEKITARAN KONDUSIF,</strong></p>
        <p style="margin:0;"><strong>PENGLIBATAN WARGA KOTA DAN PENYAMPAIAN PERKHIDMATAN TERUNGGUL"</strong></p>
        <p style="margin:2px 0 0 0;"><em>"To Enhance The Quality Of Life By Creating A Conducive Environment, Citizens Engagement And Best-In-Class Service Delivery"</em></p>
      </div>
    </div>
  `;
}

function createTpResToPtIklMemoTemplate(app, remarks = "") {
  const now = new Date();
  const year = now.getFullYear();
  const memoDate = new Intl.DateTimeFormat("ms-MY", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(now);
  const reference = getApplicationReference(app);
  const applicantName = getApplicantName(app);
  const applicationType = getApplicationType(app);
  const projectName = getProjectName(app);
  const location = getApplicationLocation(app);
  const safeRemarks = escapeHtml(remarks || "Permohonan telah diluluskan untuk tindakan PT(IKL).");

  return `
    <h3 style="text-align:center;"><strong>DEWAN BANDARAYA KUCHING UTARA</strong><br><strong>MEMORANDUM</strong></h3>
    <figure class="table"><table style="width:100%;border-collapse:collapse;">
      <tbody>
        <tr>
          <td style="width:120px;border:1px solid #bfbfbf;padding:6px;"><strong>Kepada :</strong></td>
          <td colspan="3" style="border:1px solid #bfbfbf;padding:6px;">PT(IKL)</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Melalui :</strong></td>
          <td colspan="3" style="border:1px solid #bfbfbf;padding:6px;">&nbsp;</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Daripada :</strong></td>
          <td colspan="3" style="border:1px solid #bfbfbf;padding:6px;">TP(RES)/PGH</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Ruj. Kami :</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">DBKU/LES/IKL/M/${year}(1)</td>
          <td style="width:80px;border:1px solid #bfbfbf;padding:6px;"><strong>Tarikh:</strong></td>
          <td style="width:160px;border:1px solid #bfbfbf;padding:6px;">${escapeHtml(memoDate)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Ruj. Tuan :</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(reference)}</td>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Tarikh:</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">&nbsp;</td>
        </tr>
      </tbody>
    </table></figure>
    <p><strong><u>KELULUSAN AKHIR TP(RES)/PGH</u></strong></p>
    <p>Dengan segala hormatnya perkara di atas dirujuk.</p>
    <p>Permohonan ${escapeHtml(reference)} telah mendapat kelulusan akhir TP(RES)/PGH dan dikemukakan kepada PT(IKL) untuk penyediaan surat kelulusan dan bil kepada pemohon.</p>
    <figure class="table"><table style="width:100%;border-collapse:collapse;">
      <tbody>
        <tr>
          <td style="width:180px;border:1px solid #bfbfbf;padding:6px;"><strong>Pemohon</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(applicantName)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Jenis Permohonan</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(applicationType)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Projek</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(projectName)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Lokasi</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${escapeHtml(location)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #bfbfbf;padding:6px;"><strong>Catatan TP(RES)/PGH</strong></td>
          <td style="border:1px solid #bfbfbf;padding:6px;">${safeRemarks}</td>
        </tr>
      </tbody>
    </table></figure>
    <p>Mohon pihak PT(IKL) menjana surat kelulusan dan bil untuk tindakan pemohon.</p>
    <p>Sekian, terima kasih.</p>
  `;
}

function createTpResApprovalDecisionTemplate(officerName) {
  const safeOfficerName = escapeHtml(officerName || "TP(RES)");

  return `
    <div style="font-family:Arial, sans-serif;font-size:12px;line-height:1.45;color:#000;">
      <p style="margin:0 0 10px 0;"><strong><u>PERMOHONAN KELULUSAN UNTUK LESEN TANDANAMA PERNIAGAAN<br>(samb...)</u></strong></p>
      <p style="margin:0 0 4px 0;"><strong><u>KELULUSAN TIMBALAN PENGARAH (RES)</u></strong></p>
      <p style="margin:0 0 4px 0;">Catatan (jika ada) :</p>
      <p style="margin:0;">....................................................................................................................</p>
      <p style="margin:0;">....................................................................................................................</p>
      <p style="margin:0;">....................................................................................................................</p>
      <p style="margin:0 0 22px 0;">....................................................................................................................</p>
      <p style="margin:0 0 4px 0;">............................................................&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Tarikh : ....................................</p>
      <p style="margin:0;"><strong>(${safeOfficerName})</strong></p>
      <p style="margin:0;">Ketua Bahagian</p>
      <p style="margin:0;">Hal Ehwal Undang-Undang</p>
      <p style="margin:0;">b.p. Timbalan Pengarah</p>
      <p style="margin:0;">(Jabatan Perkhidmatan Kawal Selia)</p>
    </div>
  `;
}

function getRegisteredUserFullName(user, fallback = "") {
  return (
    String(user?.full_name || user?.fullName || user?.name || user?.username || fallback || "")
      .trim()
      .replace(/\s+/g, " ") || fallback
  );
}

function getApprovalMemoHtml(app) {
  return (
    app?.form_data?.kb_les_verification?.memo_html ||
    app?.form_data?.management_recommendation?.memo_html ||
    app?.kb_les_verification?.memo_html ||
    app?.management_recommendation?.memo_html ||
    ""
  );
}

function sanitizeMemoHtml(html) {
  const source = String(html || "").trim();
  if (!source || typeof window === "undefined" || !window.DOMParser) return "";

  const parser = new DOMParser();
  const document = parser.parseFromString(source, "text/html");
  const allowedTags = new Set([
    "A", "B", "BLOCKQUOTE", "BR", "DIV", "EM", "FIGURE", "H1", "H2", "H3",
    "I", "LI", "OL", "P", "SPAN", "STRONG", "TABLE", "TBODY", "TD", "TH",
    "THEAD", "TR", "U", "UL",
  ]);
  const allowedAttributes = new Set(["colspan", "rowspan", "style", "href", "target", "rel", "class", "type", "start"]);
  const allowedStyleProperties = new Set([
    "background-color",
    "border",
    "border-bottom",
    "border-collapse",
    "border-top",
    "color",
    "font-family",
    "font-size",
    "font-style",
    "line-height",
    "margin",
    "margin-bottom",
    "margin-left",
    "margin-right",
    "margin-top",
    "padding",
    "padding-left",
    "text-align",
    "vertical-align",
    "width",
  ]);

  document.body.querySelectorAll("*").forEach((element) => {
    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      return;
    }

    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value || "";

      if (!allowedAttributes.has(name) || /^on/i.test(name) || /javascript:/i.test(value)) {
        element.removeAttribute(attribute.name);
      }
    });

    if (element.hasAttribute("style")) {
      const safeStyle = String(element.getAttribute("style") || "")
        .split(";")
        .map((rule) => rule.trim())
        .filter((rule) => {
          const [property, ...valueParts] = rule.split(":");
          const value = valueParts.join(":").trim();
          return (
            allowedStyleProperties.has(String(property || "").trim().toLowerCase()) &&
            value &&
            !/url|expression|javascript/i.test(value)
          );
        })
        .join("; ");

      if (safeStyle) {
        element.setAttribute("style", safeStyle);
      } else {
        element.removeAttribute("style");
      }
    }

    if (element.tagName === "A") {
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noreferrer");
    }
  });

  return document.body.innerHTML;
}

function getMemoContentHtml(html) {
  const source = sanitizeMemoHtml(html);
  if (!source || typeof window === "undefined" || !window.DOMParser) return source;

  const parser = new DOMParser();
  const document = parser.parseFromString(source, "text/html");
  const firstHeading = document.body.querySelector("h1, h2, h3");
  const headingText = String(firstHeading?.textContent || "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

  if (headingText.includes("DEWAN BANDARAYA KUCHING UTARA") && headingText.includes("MEMORANDUM")) {
    firstHeading.remove();
  }

  const firstMemoTable = Array.from(document.body.querySelectorAll("figure, table")).find((element) => {
    const text = String(element.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    return (
      (text.includes("kepada") || text.includes("to")) &&
      (text.includes("daripada") || text.includes("from")) &&
      (text.includes("ruj.") || text.includes("ref"))
    );
  });

  if (firstMemoTable) {
    firstMemoTable.remove();
  }

  document.body.querySelectorAll("p").forEach((paragraph) => {
    if (!String(paragraph.textContent || "").trim() && paragraph.children.length === 0) {
      paragraph.innerHTML = "&nbsp;";
    }
  });

  return document.body.innerHTML;
}

function localizeKbLesToTpMemoHtml(html, language) {
  const source = getMemoContentHtml(html);
  if (!source || typeof window === "undefined" || !window.DOMParser) return source;

  const parser = new DOMParser();
  const document = parser.parseFromString(source, "text/html");
  const isMalay = language === "ms";
  const replacements = isMalay
    ? [
        [/APPLICATION FOR APPROVAL OF BUSINESS SIGNAGE \/ ADVERTISEMENT LICENSE/gi, "PERMOHONAN KELULUSAN UNTUK LESEN TANDANAMA PERNIAGAAN / IKLAN"],
        [/With due respect, the above matter is referred\./gi, "Dengan segala hormatnya perkara di atas dirujuk."],
        [/For your information, the Licensing Division has received two \(2\) new Business Signage\/Advertisement License applications\./gi, "Untuk makluman, Bahagian Pelesenan telah menerima dua (2) permohonan baru Lesen Tandanama Perniagaan/Iklan."],
        [/Enclosed herewith are business signage\/advertisement applications that have complied with all requirements for your approval as follows:-/gi, "Bersama ini disertakan permohonan tandanama perniagaan/iklan yang telah mematuhi semua syarat untuk kelulusan puan seperti berikut:-"],
        [/ITEM/gi, "PERKARA"],
        [/REVENUE/gi, "HASIL"],
        [/Two \(2\) Business Signage\/Advertisement Licenses/gi, "Dua (2) Lesen Tandanama Perniagaan/Iklan"],
        [/Grand Total/gi, "Jumlah Keseluruhan"],
        [/Please approve the above matter\./gi, "Mohon kelulusan puan dalam perkara tersebut di atas."],
        [/Thank you\./gi, "Sekian. Terima kasih."],
        [/Head of Division/gi, "Ketua Bahagian"],
        [/Licensing Division/gi, "Bahagian Pelesenan"],
      ]
    : [
        [/PERMOHONAN KELULUSAN UNTUK LESEN TANDANAMA PERNIAGAAN \/ IKLAN/gi, "APPLICATION FOR APPROVAL OF BUSINESS SIGNAGE / ADVERTISEMENT LICENSE"],
        [/Dengan segala hormatnya perkara di atas dirujuk\./gi, "With due respect, the above matter is referred."],
        [/Untuk makluman, Bahagian Pelesenan telah menerima dua \(2\) permohonan baru Lesen Tandanama Perniagaan\/Iklan\./gi, "For your information, the Licensing Division has received two (2) new Business Signage/Advertisement License applications."],
        [/Bersama ini disertakan permohonan tandanama perniagaan\/iklan yang telah mematuhi semua syarat untuk kelulusan puan seperti berikut:-/gi, "Enclosed herewith are business signage/advertisement applications that have complied with all requirements for your approval as follows:-"],
        [/PERKARA/gi, "ITEM"],
        [/HASIL/gi, "REVENUE"],
        [/Dua \(2\) Lesen Tandanama Perniagaan\/Iklan/gi, "Two (2) Business Signage/Advertisement Licenses"],
        [/Jumlah Keseluruhan/gi, "Grand Total"],
        [/Mohon kelulusan puan dalam perkara tersebut di atas\./gi, "Please approve the above matter."],
        [/Sekian\. Terima kasih\./gi, "Thank you."],
        [/Ketua Bahagian/gi, "Head of Division"],
        [/Bahagian Pelesenan/gi, "Licensing Division"],
      ];

  const walker = document.createTreeWalker(document.body, window.NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  textNodes.forEach((node) => {
    let text = node.nodeValue || "";
    replacements.forEach(([pattern, replacement]) => {
      text = text.replace(pattern, replacement);
    });
    node.nodeValue = text;
  });

  return document.body.innerHTML;
}

function extractFormalMemoFields(html) {
  const source = sanitizeMemoHtml(html);
  const emptyFields = {
    to: "",
    through: "",
    from: "",
    ourRef: "",
    date: "",
    yourRef: "",
    yourDate: "",
  };

  if (!source || typeof window === "undefined" || !window.DOMParser) {
    return emptyFields;
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(source, "text/html");
  const memoTable = Array.from(document.body.querySelectorAll("figure, table")).find((element) => {
    const text = String(element.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    return (
      (text.includes("kepada") || text.includes("to")) &&
      (text.includes("daripada") || text.includes("from")) &&
      (text.includes("ruj.") || text.includes("ref"))
    );
  });

  if (!memoTable) return emptyFields;

  const nextFields = { ...emptyFields };
  Array.from(memoTable.querySelectorAll("tr")).forEach((row) => {
    const cells = Array.from(row.querySelectorAll("td, th"));
    const label = normalizeMemoLabel(cells[0]?.textContent);

    if (!label) return;

    const primaryValue = cleanMemoFieldValue(cells[1]?.textContent);
    const secondaryLabel = normalizeMemoLabel(cells[2]?.textContent);
    const secondaryValue = cleanMemoFieldValue(cells[3]?.textContent);

    if (isMemoLabel(label, ["kepada", "to"])) {
      nextFields.to = primaryValue;
    } else if (isMemoLabel(label, ["melalui", "through"])) {
      nextFields.through = primaryValue;
    } else if (isMemoLabel(label, ["daripada", "from"])) {
      nextFields.from = primaryValue;
    } else if (isMemoLabel(label, ["ruj kami", "our ref"])) {
      nextFields.ourRef = primaryValue;
      if (isMemoLabel(secondaryLabel, ["tarikh", "date"])) {
        nextFields.date = secondaryValue;
      }
    } else if (isMemoLabel(label, ["ruj tuan", "your ref"])) {
      nextFields.yourRef = primaryValue;
      if (isMemoLabel(secondaryLabel, ["tarikh", "date"])) {
        nextFields.yourDate = secondaryValue;
      }
    }
  });

  return nextFields;
}

function normalizeMemoLabel(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[:.]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cleanMemoFieldValue(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isMemoLabel(label, candidates) {
  return candidates.some((candidate) => label === candidate || label.startsWith(`${candidate} `));
}

function getMemoTimestampValue(value, fallback = "") {
  const cleanedValue = cleanMemoFieldValue(value);
  if (hasTimeComponent(cleanedValue)) return cleanedValue;
  return fallback || cleanedValue;
}

function hasTimeComponent(value) {
  return /\d{1,2}:\d{2}|\b(?:am|pm|pagi|petang|malam)\b/i.test(String(value || ""));
}

function getApprovalMemoTimestamp(app, language) {
  const timestamp =
    app?.form_data?.kb_les_verification?.verified_at ||
    app?.form_data?.management_recommendation?.routed_at ||
    app?.updated_at ||
    app?.created_at ||
    "";

  return timestamp ? formatLocalizedDateTime(timestamp, language) : "";
}

function formatLocalizedDateTime(value, language) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString(language === "ms" ? "ms-MY" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function localizeFormalMemoFieldValue(value, language) {
  const text = cleanMemoFieldValue(value);
  if (!text) return "";

  const replacements =
    language === "ms"
      ? [
          [/Deputy Director \(Regulatory Services Department\)/gi, "Timbalan Pengarah (Jabatan Perkhidmatan Kawal Selia)"],
          [/Head of Division \(Licensing\)/gi, "Ketua Bahagian (Pelesenan)"],
          [/Licensing Division/gi, "Bahagian Pelesenan"],
        ]
      : [
          [/Timbalan Pengarah \(Jabatan Perkhidmatan Kawal Selia\)/gi, "Deputy Director (Regulatory Services Department)"],
          [/Ketua Bahagian \(Pelesenan\)/gi, "Head of Division (Licensing)"],
          [/Bahagian Pelesenan/gi, "Licensing Division"],
        ];

  return replacements.reduce((next, [pattern, replacement]) => next.replace(pattern, replacement), text);
}

function getApprovalMemoCopy(language) {
  const isMalay = language === "ms";

  return {
    labels: isMalay
      ? {
          to: "Kepada",
          through: "Melalui",
          from: "Daripada",
          ourRef: "Ruj. Kami",
          yourRef: "Ruj. Tuan",
          date: "Tarikh",
        }
      : {
          to: "To",
          through: "Through",
          from: "From",
          ourRef: "Our Ref.",
          yourRef: "Your Ref.",
          date: "Date",
        },
  };
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

function getPublicOrigin() {
  return PUBLIC_FRONTEND_URL || getRuntimeOrigin();
}

function getRuntimeOrigin() {
  const fallbackOrigin =
    typeof window !== "undefined" ? window.location.origin : "";

  return fallbackOrigin;
}

function getPublicAssetUrl(path) {
  const cleanPath = `/${String(path || "").replace(/^\/+/, "")}`;
  const origin = getRuntimeOrigin() || PUBLIC_FRONTEND_URL;

  return origin ? `${origin}${cleanPath}` : cleanPath;
}

function getManualDocumentAssetUrl(value) {
  const source = String(value || "").trim();
  if (/^(data:|blob:|https?:)/i.test(source)) return source;

  return getPublicAssetUrl(source);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Unable to read file."));
    reader.readAsDataURL(file);
  });
}

function getWorkspaceStatusLabel(app, config, t, userDepartment = "") {
  const status = normalizeStatus(app?.status);
  const isIklWorkspace = config?.key === "screening";
  const isDepartmentTechnicalWorkspace = config?.key === "technical";
  const isApprovalWorkspace = config?.key === "approval";

  if (isIklWorkspace && status === "submitted") {
    return t("status.ku_ikl_review", "KU(IKL) Review");
  }

  if (isIklWorkspace && status === "ku_ikl_review") {
    return t("status.ku_ikl_review", "KU(IKL) Review");
  }

  if (isIklWorkspace && status === "technical_review_completed") {
    return t("status.technical_ku_review", "Pending KU(IKL) Final Check");
  }

  if (isIklWorkspace && TECHNICAL_REVIEW_STATUSES.has(status)) {
    return `${t(`status.${status}`, formatWorkflowStatus(status))}: ${getTechnicalRouteLabel(app)}`;
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

  return t(`status.${status}`, formatWorkflowStatus(status));
}

function getWorkspaceActionDescription(config, t, userDepartment, selectedRecord) {
  if (config?.key === "screening") {
    const copy = getIklScreeningCopy(userDepartment);
    return t(copy.actionDescriptionKey, copy.actionDescription);
  }

  if (config?.key === "approval") {
    if (userDepartment === "KB(LES)" && getApprovalStageKey(selectedRecord) === "kb_support") {
      return t("workspace.approval.kbSupportAction", "Support the application before sending it to TP(RES)/PGH.");
    }

    if (userDepartment === "KB(LES)") {
      return t("workspace.approval.kbAction", "Review the SUT result and verify the application before sending it to TP(RES)/PGH.");
    }

    if (APPROVAL_SUPPORT_DEPARTMENTS.includes(userDepartment)) {
      return t("workspace.approval.supportAction", "Make the final approval decision after KB(LES) support.");
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
      if (normalizeStatus(selectedRecord?.status) === "payment_submitted") {
        return t("workspace.payment.ptReceiptAction", "Review the uploaded receipt, then verify or reject it.");
      }

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
      { value: "Not Verify", labelKey: "workspace.decision.notVerify" },
    ];
  }

  if (department === "KB(LES)" && getApprovalStageKey(app) === "kb_support") {
    return [
      { value: "Support", labelKey: "workspace.decision.support" },
    ];
  }

  if (APPROVAL_SUPPORT_DEPARTMENTS.includes(department) && getApprovalStageKey(app) === "support") {
    const options = [
      { value: "Approve", labelKey: "workspace.decision.approve" },
    ];

    if (!hasSutApprovalResult(app)) {
      options.push({ value: "Reject", labelKey: "workspace.decision.reject" });
    }

    return options;
  }

  if (MPHLG_REVIEW_DEPARTMENTS.includes(department) && getApprovalStageKey(app) === "mphlg") {
    return [
      { value: "Approve", labelKey: "workspace.decision.approve" },
      { value: "Reject", labelKey: "workspace.decision.reject" },
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
  if (config?.key === "approval" && department === "KB(LES)" && getApprovalStageKey(app) === "kb_support") {
    return "Support";
  }

  return config?.showDecision ? "" : config?.defaultDecision || "";
}

function getWorkspaceActions(config, app, department) {
  if (config?.key !== "approval") {
    return (config.actions || []).filter((action) => {
      if (typeof action.isAvailable !== "function") return true;
      return action.isAvailable(app, department);
    });
  }

  const stage = getApprovalStageKey(app);
  const canKbVerify = department === "KB(LES)" && (stage === "kb" || stage === "kb_support");
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

function canViewWorkspaceRow(config, app, department) {
  if (canOpenWorkspaceRow(config, app, department)) return true;
  return config?.key === "approval" && isApprovalTaskForDepartment(app, department);
}

function isApprovalTaskForDepartment(app, department) {
  const stage = getApprovalStageKey(app);

  if (isApprovalHistoryRecord(app)) return true;
  if (!isApprovalActionDepartment(department)) return true;
  if (department === "KB(LES)") return stage === "kb" || stage === "kb_support" || isKbLesMonitoredRecord(app);
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
  return APPROVAL_TECHNICAL_REPORT_DEPARTMENTS.includes(department);
}

function shouldShowApprovalTechnicalReport(department, app) {
  const normalizedDepartment = normalizeDepartmentCode(department);

  return (
    APPROVAL_REPORT_VIEW_DEPARTMENTS.includes(normalizedDepartment) ||
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

  if (isApprovalHistoryRecord(app)) return "";

  const stage = getApprovalStageKey(app);

  if (department === "KB(LES)") {
    return ["kb", "kb_support"].includes(stage) ? "" : "KB(LES) support is already complete or not required for this record.";
  }

  if (APPROVAL_SUPPORT_DEPARTMENTS.includes(department)) {
    return stage === "support" ? "" : "TP(RES)/PGH final approval is available after KB(LES) support.";
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

  if (stage === "kb_support") return "Pending KB(LES) Support";
  if (stage === "support") return "Pending TP(RES)/PGH Approval";
  if (stage === "mphlg") return "Pending MPHLG Approval";
  if (stage === "sut") return "Pending SUT Approval";
  if (stage === "completed") return "Approval Completed";
  return "Pending KB(LES) Verification";
}

function getApprovalStageKey(app) {
  const status = normalizeStatus(app?.status);

  if (status === "management_review") {
    if (isKbLesSupportPending(app)) {
      return "kb_support";
    }

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

function isKbLesSupportPending(app) {
  const recommendationStatus = String(getApplicationSection(app, "management_recommendation")?.status || "")
    .trim()
    .toLowerCase();

  return (
    !hasManagementSupport(app) &&
    (
      recommendationStatus === "pending kb(les) support" ||
      (hasSutApprovalResult(app) && recommendationStatus !== "pending tp(res)/pgh approval")
    )
  );
}

function hasSutApprovalResult(app) {
  const status = String(getApplicationSection(app, "sut_approval")?.status || "")
    .trim()
    .toLowerCase();
  return ["approved", "supported", "completed"].includes(status);
}

function hasApprovalSupportMemo(app) {
  return Boolean(getApplicationSection(app, "management_recommendation")?.approval_note_html);
}

function hasMphlgReturnedApprovalForRevision(app) {
  const support = getApplicationSection(app, "management_recommendation");
  const mphlg = getApplicationSection(app, "mphlg_gateway");
  const returnedFromMphlg =
    normalizeDepartmentCode(support?.returned_from) === "MPHLG" ||
    String(mphlg?.status || "").trim().toLowerCase().includes("returned to tp");

  if (!returnedFromMphlg) return false;

  const returnedAt = Date.parse(support?.returned_at || mphlg?.reviewed_at || "");
  const savedAt = Date.parse(support?.approval_note_saved_at || "");

  if (!Number.isFinite(returnedAt)) return true;
  if (!Number.isFinite(savedAt)) return true;

  return savedAt <= returnedAt;
}

function getLocalizedApplicationType(app, t, language = "en") {
  const type = getApplicationType(app, language);
  const normalizedType = String(type || "").trim().toLowerCase();
  const labelMap = {
    "application for site (new site)": "application.type.siteNew",
    "application for site": "application.type.site",
    "sitting application": "application.type.sitting",
    "signboard license": "application.type.signboard",
    "building plan": "application.type.buildingPlan",
    "open space": "application.type.openSpace",
    "kawasan lapang": "application.type.openSpace",
    building: "application.type.building",
    bangunan: "application.type.building",
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
  return getTechnicalFeeTotals(items).feeTotal;
}

function getTechnicalPayableTotal(items) {
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

function parseTechnicalNumber(value) {
  const number = Number(String(value || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function roundTechnicalNumber(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function calculateTechnicalFee(site = {}) {
  const widthFt = parseTechnicalNumber(site.width_ft);
  const heightFt = parseTechnicalNumber(site.height_ft);
  const areaSqft = widthFt > 0 && heightFt > 0 ? widthFt * heightFt : 0;
  const areaSqm = areaSqft * SQFT_TO_SQM;
  const firstAreaSqm = Math.min(areaSqm, TECHNICAL_FIRST_AREA_SQM);
  const additionalAreaSqm = Math.max(areaSqm - TECHNICAL_FIRST_AREA_SQM, 0);
  const firstAreaFee = firstAreaSqm * TECHNICAL_FIRST_AREA_RATE;
  const additionalAreaFee = additionalAreaSqm * TECHNICAL_ADDITIONAL_AREA_RATE;
  const feeTotal = firstAreaFee + additionalAreaFee;

  return {
    areaSqft: roundTechnicalNumber(areaSqft, 2),
    areaSqm,
    chargeableAreaSqm: areaSqm,
    firstAreaSqm,
    additionalAreaSqm,
    firstAreaFee,
    additionalAreaFee,
    feeTotal,
    deposit: TECHNICAL_FIXED_DEPOSIT,
    processingFee: TECHNICAL_PROCESSING_FEE,
    totalPayable: feeTotal + TECHNICAL_FIXED_DEPOSIT + TECHNICAL_PROCESSING_FEE,
  };
}

function getTechnicalFeeSummary(site = {}) {
  const calculated = calculateTechnicalFee(site);
  const hasCalculatedSize = calculated.areaSqft > 0;
  const feeTotal =
    hasCalculatedSize
      ? calculated.feeTotal
      : parseMemoAmount(site.license_fee_calculation) || parseMemoAmount(site.fee_total);
  const deposit =
    parseMemoAmount(site.deposit_calculation) || calculated.deposit || TECHNICAL_FIXED_DEPOSIT;
  const processingFee =
    parseMemoAmount(site.processing_fee_calculation) ||
    calculated.processingFee ||
    TECHNICAL_PROCESSING_FEE;
  const totalPayable =
    hasCalculatedSize
      ? calculated.totalPayable
      : parseMemoAmount(site.payable_total) || feeTotal + deposit + processingFee;

  return {
    feeTotal,
    deposit,
    processingFee,
    totalPayable,
  };
}

function formatTechnicalArea(value) {
  const rounded = roundTechnicalNumber(value, 2);
  return rounded.toLocaleString("en-MY", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatTechnicalCurrency(value) {
  return formatCurrency(value).replace(/^RM\s+/, "RM");
}

function mergeTechnicalFeeCalculation(site = {}) {
  const fees = calculateTechnicalFee(site);
  return {
    ...site,
    area_sqft: fees.areaSqft ? String(fees.areaSqft) : "",
    area_sqm: fees.areaSqm ? String(fees.areaSqm) : "",
    chargeable_area_sqm: fees.chargeableAreaSqm ? String(fees.chargeableAreaSqm) : "",
    first_area_fee: fees.firstAreaFee ? String(fees.firstAreaFee) : "",
    additional_area_sqm: fees.additionalAreaSqm ? String(fees.additionalAreaSqm) : "0",
    additional_area_fee: fees.additionalAreaFee ? String(fees.additionalAreaFee) : "0",
    fee_total: fees.feeTotal ? String(fees.feeTotal) : "",
    payable_total: fees.feeTotal ? String(fees.totalPayable) : "",
    license_fee_calculation: fees.feeTotal ? String(fees.feeTotal) : "",
    deposit_calculation: String(TECHNICAL_FIXED_DEPOSIT),
    processing_fee_calculation: String(TECHNICAL_PROCESSING_FEE),
  };
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
  const previousAutoScreening = app.form_data?.auto_screening || {};
  const selectedTechnicalDepartments = getApplicationTypeTechnicalDepartments(app);

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
        memo_html:
          data.decision === "PT(IKL) Send to KU(IKL)"
            ? data.memoHtml || previousAutoScreening.memo_html || ""
            : previousAutoScreening.memo_html || "",
        checks,
        checked_at: now,
      },
      technical_referral: sendTechnical
        ? {
            status: "Referred",
            source: "KU(IKL)",
            target: KU_TECHNICAL_MEMO_RECIPIENT,
            participating_departments: selectedTechnicalDepartments,
            memo_html: data.memoHtml || app.form_data?.technical_referral?.memo_html || "",
            referred_at: now,
          }
        : app.form_data?.technical_referral || null,
      technical_department_selection: sendTechnical
        ? {
            departments: selectedTechnicalDepartments,
            selected_by: "Application Type",
            selected_at: now,
          }
        : app.form_data?.technical_department_selection || null,
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
  const technicalFee = calculateTechnicalFee(data.technicalSite);
  const notSupported = data.decision === "Not Supported";

  return {
    status: notSupported ? "incomplete" : "technical_review_completed",
    current_step: Math.max(Number(app.current_step || 1), 5),
    latest_remark: data.comment || app.latest_remark || "",
    form_data: mergeFormData(app, {
      technical_review: {
        ...(app.form_data?.technical_review || {}),
        status: notSupported ? "Not Supported" : "Completed",
        final_decision: data.decision,
        decision: data.decision,
        comment: data.comment,
        department: "IKL (TECHNICAL)",
        reviewed_by: "PT/PO/KP Unit Iklan",
        reviewed_at: now,
        department_reviews: getTechnicalDepartmentReviews(app),
        memo_html: notSupported ? "" : data.memoHtml || app.form_data?.technical_review?.memo_html || "",
      },
      technical_site_visit: {
        ...(app.form_data?.technical_site_visit || {}),
        site_photos: data.technicalSite.site_photos || [],
        site_photo: data.technicalSite.site_photos?.[0] || null,
        fee_date: data.technicalSite.fee_date || new Date().toISOString().slice(0, 10),
        fee_items: [],
        width_ft: data.technicalSite.width_ft || "",
        height_ft: data.technicalSite.height_ft || "",
        area_sqft: technicalFee.areaSqft ? String(technicalFee.areaSqft) : "",
        area_sqm: technicalFee.areaSqm ? String(technicalFee.areaSqm) : "",
        chargeable_area_sqm: technicalFee.chargeableAreaSqm ? String(technicalFee.chargeableAreaSqm) : "",
        first_area_sqm: technicalFee.firstAreaSqm ? String(technicalFee.firstAreaSqm) : "",
        first_area_fee: technicalFee.firstAreaFee ? String(technicalFee.firstAreaFee) : "",
        additional_area_sqm: technicalFee.additionalAreaSqm ? String(technicalFee.additionalAreaSqm) : "0",
        additional_area_fee: technicalFee.additionalAreaFee ? String(technicalFee.additionalAreaFee) : "0",
        fee_total: technicalFee.feeTotal,
        payable_total: technicalFee.totalPayable,
        license_fee_calculation: technicalFee.feeTotal ? String(technicalFee.feeTotal) : "",
        deposit_calculation: String(TECHNICAL_FIXED_DEPOSIT),
        processing_fee_calculation: String(TECHNICAL_PROCESSING_FEE),
        site_remarks: data.technicalSite.site_remarks || data.comment,
        officer_role: "PT/PO/KP Unit Iklan",
        visited_at: now,
      },
      correction_request: notSupported
        ? {
            source: "IKL(TECHNICAL)",
            target: "Applicant",
            remarks: data.comment,
            requested_at: now,
          }
        : null,
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
        memo_html: data.memoHtml || app.form_data?.technical_ku_review?.memo_html || "",
        reviewed_by: "KU(IKL)",
        reviewed_at: now,
      },
      correction_request: amendmentRequired
        ? {
            source: "KU(IKL)",
            target: "IKL(TECHNICAL)",
            remarks: data.comment,
            memo_html: data.memoHtml || "",
            requested_at: now,
          }
        : null,
      kb_les_verification: amendmentRequired
        ? null
        : {
            status: "Pending KB(LES) Verification",
            routed_from: "KU(IKL)",
            routed_at: now,
            memo_html: data.memoHtml || app.form_data?.kb_les_verification?.memo_html || "",
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
  const rejected = ["Reject", "Not Supported", "Not Verify", "Not Verified", "Not Support"].includes(decision);

  if (department === "KB(LES)") {
    const kbSupportStage = getApprovalStageKey(app) === "kb_support";

    return {
      status: rejected ? "technical_review_completed" : "management_review",
      current_step: Math.max(Number(app.current_step || 1), 5),
      latest_remark: data.comment || app.latest_remark || "",
      form_data: mergeFormData(app, {
        kb_les_verification: {
          ...(app.form_data?.kb_les_verification || {}),
          officer: "KB(LES)",
          status: kbSupportStage
            ? isKbLesVerified(app)
              ? app.form_data?.kb_les_verification?.status || "Verified"
              : "Verified"
            : rejected
              ? "Not Verified"
              : "Verified",
          decision,
          remarks: data.comment,
          memo_html: data.memoHtml || app.form_data?.kb_les_verification?.memo_html || "",
          verified_at: now,
        },
        management_recommendation: rejected
          ? null
          : {
              ...(app.form_data?.management_recommendation || {}),
              officer: kbSupportStage ? "KB(LES)" : app.form_data?.management_recommendation?.officer,
              status: kbSupportStage ? "Supported" : "Pending TP(RES)/PGH Approval",
              decision: kbSupportStage ? decision : app.form_data?.management_recommendation?.decision,
              remarks: kbSupportStage ? data.comment : app.form_data?.management_recommendation?.remarks,
              routed_from: "KB(LES)",
              routed_at: now,
              supported_at: kbSupportStage ? now : app.form_data?.management_recommendation?.supported_at,
            },
        correction_request: rejected
          ? {
              source: "KB(LES)",
              target: "KU(IKL)",
              remarks: data.comment,
              memo_html: data.memoHtml || "",
              requested_at: now,
            }
          : app.form_data?.correction_request || null,
        approval: null,
      }),
    };
  }

  if (APPROVAL_SUPPORT_DEPARTMENTS.includes(department)) {
    const finalApproval = hasSutApprovalResult(app);
    const approvalDecisionHtml =
      data.approvalDecisionHtml ||
      app.form_data?.approval?.approval_note_html ||
      app.form_data?.management_recommendation?.approval_note_html ||
      (finalApproval ? data.memoHtml : "") ||
      "";
    const approvalDecisionRemarks = getHtmlPlainText(approvalDecisionHtml);

    return {
      status: rejected ? "technical_review_completed" : finalApproval ? "approved" : "mphlg_processing",
      current_step: Math.max(Number(app.current_step || 1), 5),
      latest_remark: rejected
        ? data.comment || approvalDecisionRemarks || app.latest_remark || ""
        : data.comment || app.latest_remark || "",
      form_data: mergeFormData(app, {
        management_recommendation: {
          ...(app.form_data?.management_recommendation || {}),
          officer: department,
          status: rejected ? "Rejected" : "Approved",
          decision,
          remarks: rejected ? data.comment || approvalDecisionRemarks : data.comment,
          approval_note_html: approvalDecisionHtml,
          decided_at: now,
        },
        mphlg_gateway: rejected || finalApproval
          ? app.form_data?.mphlg_gateway || null
          : {
              ...(app.form_data?.mphlg_gateway || {}),
              status: "Pending MPHLG Approval",
              routed_from: department,
              routed_at: now,
              memo_html: data.memoHtml || app.form_data?.mphlg_gateway?.memo_html || "",
            },
        correction_request: rejected
          ? {
              source: department,
              target: "KU(IKL)",
              remarks: data.comment || approvalDecisionRemarks,
              memo_html: approvalDecisionHtml,
              requested_at: now,
            }
          : app.form_data?.correction_request || null,
        approval: rejected || !finalApproval
          ? app.form_data?.approval || null
          : {
              ...(app.form_data?.approval || {}),
              officer: department,
              status: "Approved",
              decision,
              remarks: data.comment,
              memo_html: data.memoHtml || app.form_data?.approval?.memo_html || "",
              approval_note_html: approvalDecisionHtml,
              approved_at: now,
            },
      }),
    };
  }

  if (MPHLG_REVIEW_DEPARTMENTS.includes(department)) {
    const approved = decision === "Approve";
    const rejectRemark = data.comment || getHtmlPlainText(data.memoHtml) || app.latest_remark || "";

    return {
      status: approved ? "mphlg_decision_received" : "technical_review_completed",
      current_step: Math.max(Number(app.current_step || 1), 5),
      latest_remark: approved ? data.comment || app.latest_remark || "" : rejectRemark,
      form_data: mergeFormData(app, {
        management_recommendation: app.form_data?.management_recommendation || null,
        mphlg_gateway: {
          ...(app.form_data?.mphlg_gateway || {}),
          officer: "MPHLG",
          status: approved ? "Approved" : "Returned to KU(IKL)",
          decision,
          remarks: approved ? data.comment : rejectRemark,
          memo_html: approved
            ? app.form_data?.mphlg_gateway?.memo_html || ""
            : data.memoHtml || app.form_data?.mphlg_gateway?.memo_html || "",
          reviewed_at: now,
        },
        correction_request: approved
          ? app.form_data?.correction_request || null
          : {
              source: "MPHLG",
              target: "KU(IKL)",
              remarks: rejectRemark,
              memo_html: data.memoHtml || "",
              requested_at: now,
            },
        sut_approval: approved
          ? {
              ...(app.form_data?.sut_approval || {}),
              status: "Pending SUT Approval",
              routed_from: "MPHLG",
              routed_at: now,
              memo_html: data.memoHtml || app.form_data?.sut_approval?.memo_html || "",
            }
          : null,
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
              ...(app.form_data?.kb_les_verification || {}),
              status: "Verified",
              routed_from: "SUT",
              routed_at: now,
            }
          : app.form_data?.kb_les_verification || null,
        management_recommendation: decision === "Approve"
          ? {
              ...(app.form_data?.management_recommendation || {}),
              status: "Pending KB(LES) Support",
              routed_from: "SUT",
              routed_at: now,
            }
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

function normalizeTechnicalDepartmentSelection(departments) {
  const selected = Array.isArray(departments) ? departments : [];
  return TECHNICAL_DEPARTMENTS.filter((department) =>
    selected.some((value) => normalizeDepartmentCode(value) === department)
  );
}

function normalizeApplicationTypeOptions(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [
    ...new Set(
      values
        .flatMap((item) => String(item || "").split(","))
        .map((item) => item.trim().toLowerCase())
        .filter((item) => Object.prototype.hasOwnProperty.call(APPLICATION_TYPE_TECHNICAL_DEPARTMENTS, item))
    ),
  ];
}

function getApplicationTypeOptionsFromApplication(app) {
  const step1 = app?.form_data?.step_1 || {};
  const selected = normalizeApplicationTypeOptions(
    step1.application_type_options || step1.application_type
  );
  return selected.length > 0 ? selected : ["open_space"];
}

function getApplicationTypeOptionLabel(type, language = "en") {
  const labels = {
    open_space: {
      en: "Open Space",
      ms: "Kawasan Lapang",
    },
    building: {
      en: "Building",
      ms: "Bangunan",
    },
  };

  return labels[type]?.[language === "ms" ? "ms" : "en"] || type;
}

function getApplicationTypeOptionsLabel(types, language = "en") {
  return normalizeApplicationTypeOptions(types)
    .map((type) => getApplicationTypeOptionLabel(type, language))
    .join(", ");
}

function getApplicationTypeTechnicalDepartmentsFromTypes(types) {
  const departments = normalizeApplicationTypeOptions(types).flatMap(
    (type) => APPLICATION_TYPE_TECHNICAL_DEPARTMENTS[type] || []
  );
  return normalizeTechnicalDepartmentSelection(departments);
}

function getApplicationTypeTechnicalDepartments(app) {
  const departments = getApplicationTypeTechnicalDepartmentsFromTypes(
    getApplicationTypeOptionsFromApplication(app)
  );

  return normalizeTechnicalDepartmentSelection(departments.length > 0 ? departments : TECHNICAL_DEPARTMENTS);
}

function getSelectedTechnicalDepartments(app) {
  const selection =
    app?.technical_department_selection ||
    app?.form_data?.technical_department_selection ||
    {};
  const selectedDepartments = normalizeTechnicalDepartmentSelection(selection.departments);
  if (selectedDepartments.length > 0 || hasTechnicalDepartmentSelection(app)) {
    return selectedDepartments;
  }

  return normalizeTechnicalDepartmentSelection(
    app?.technical_referral?.participating_departments ||
      app?.form_data?.technical_referral?.participating_departments
  );
}

function hasTechnicalDepartmentSelection(app) {
  const selection =
    app?.technical_department_selection ||
    app?.form_data?.technical_department_selection;
  return Boolean(
    selection &&
      typeof selection === "object" &&
      Object.prototype.hasOwnProperty.call(selection, "departments")
  );
}

function isTechnicalDepartmentSelected(app, department) {
  const normalizedDepartment = normalizeDepartmentCode(department);
  if (!TECHNICAL_DEPARTMENTS.includes(normalizedDepartment)) return false;

  return getSelectedTechnicalDepartments(app).includes(normalizedDepartment);
}

function getTechnicalRouteLabel(app) {
  const selected = getSelectedTechnicalDepartments(app);
  const route = ["IKL (TECHNICAL)", ...selected];
  return route.join(" / ");
}

function hasTechnicalDepartmentReview(app, department) {
  const normalizedDepartment = normalizeDepartmentCode(department);
  return Boolean(getTechnicalDepartmentReviews(app)?.[normalizedDepartment]);
}

function areAllTechnicalDepartmentReviewsComplete(app) {
  if (!hasTechnicalDepartmentSelection(app)) return false;

  return getSelectedTechnicalDepartments(app).every((department) =>
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
    technicalSite.processing_fee_calculation,
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
        "payment_submitted",
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

function getWorkspaceFetchParams(config, department, includeCompletedFallback = false) {
  if (includeCompletedFallback) return {};

  const statuses = getWorkspaceStatusScope(config, department);
  return statuses.length > 0 ? { status: statuses } : {};
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
        requiresComment: false,
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
        requiresComment: true,
        success: "Technical review saved.",
        successKey: "workspace.message.technicalSaved",
        buildPayload: buildIklTechnicalDecisionPayload,
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
    eyebrow: "KB(LES), TP/PGH, MPHLG, and SUT",
    eyebrowKey: "workspace.approval.eyebrow",
    statuses: [
      "management_review",
      "mphlg_processing",
      "mphlg_decision_received",
    ],
    title: "Approval",
    titleKey: "workspace.approval.title",
    description: "Record KB(LES) verification, TP(RES)/PGH support, MPHLG review, SUT decision, and final approval.",
    descriptionKey: "workspace.approval.description",
    queueTitle: "Approval Queue",
    queueTitleKey: "workspace.approval.queue",
    actionDescription: "Submit approval decision or remarks.",
    actionDescriptionKey: "workspace.approval.action",
    showDecision: true,
    showComment: true,
    defaultDecision: "Verify",
    decisions: [
      { value: "Verify", labelKey: "workspace.decision.verify" },
      { value: "Not Verify", labelKey: "workspace.decision.notVerify" },
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
    listDescription: "Select an approved application to upload the approval letter and bill, confirm billing, or review payment receipts.",
    listDescriptionKey: "workspace.payment.listDescription",
    eyebrow: "Payment",
    eyebrowKey: "workspace.payment.eyebrow",
    title: "Bill and Payment",
    titleKey: "workspace.payment.title",
    description: "PT(IKL) uploads approval letters and bills, KU(IKL) confirms bills, and PT(IKL) verifies uploaded payment proof.",
    descriptionKey: "workspace.payment.description",
    queueTitle: "Payment Queue",
    queueTitleKey: "workspace.payment.queue",
    actionDescription: "Upload an approval letter and bill, confirm the bill, then verify whether the uploaded receipt is valid or fake.",
    actionDescriptionKey: "workspace.payment.action",
    showComment: true,
    commentLabel: "Receipt Verification Notes",
    commentLabelKey: "workspace.comment.payment",
    commentPlaceholder: "Add verification notes, receipt issues, or rejection reason.",
    commentPlaceholderKey: "workspace.comment.paymentPlaceholder",
    stats: (apps) => [
      { label: "Pending", labelKey: "workspace.stat.pending", value: countBy(apps, (app) => !app.form_data?.payment), icon: "pending", tone: "amber" },
      { label: "Bill Review", labelKey: "workspace.stat.billReview", value: countBy(apps, (app) => normalizeStatus(app.status) === "bill_pending_ku"), icon: "fact_check", tone: "amber" },
      { label: "Bill Generated", labelKey: "workspace.stat.invoiced", value: countBy(apps, (app) => normalizeStatus(app.status) === "invoice_generated"), icon: "receipt_long", tone: "blue" },
      { label: "Submitted", labelKey: "workspace.stat.submitted", value: countBy(apps, (app) => normalizeStatus(app.status) === "payment_submitted"), icon: "payments" },
      { label: "Verified", labelKey: "workspace.stat.verified", value: countBy(apps, (app) => normalizeStatus(app.status) === "payment_verified"), icon: "verified" },
    ],
    actions: [
      {
        label: "Submit Letter & Bill",
        labelKey: "workspace.action.submitLetterBill",
        icon: "upload_file",
        success: "Approval letter and bill submitted for KU(IKL) confirmation.",
        successKey: "workspace.message.invoiceGenerated",
        requiresPaymentDocuments: true,
        isAvailable: (app, department) =>
          department === "PT(IKL)" && normalizeStatus(app?.status) === "approved",
        buildPayload: (app) => ({
          status: "bill_pending_ku",
          form_data: mergeFormData(app, {
            approval_letter: {
              ...(app.form_data?.approval_letter || {}),
              status: "Submitted to KU(IKL)",
              submitted_by: "PT(IKL)",
              submitted_at: new Date().toISOString(),
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
        label: "Confirm Approval Letter & Bill",
        labelKey: "workspace.action.confirmBill",
        icon: "task_alt",
        success: "Approval letter, appendix, and bill confirmed and sent to applicant.",
        successKey: "workspace.message.billConfirmed",
        isAvailable: (app, department) =>
          department === "KU(IKL)" && normalizeStatus(app?.status) === "bill_pending_ku",
        buildPayload: (app) => ({
          status: "invoice_generated",
          form_data: mergeFormData(app, {
            approval_letter: {
              ...(app.form_data?.approval_letter || {}),
              status: "Confirmed and Sent to Applicant",
              confirmed_by: "KU(IKL)",
              confirmed_at: new Date().toISOString(),
              sent_to_applicant_at: new Date().toISOString(),
            },
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
        requiresOfficialReceipt: true,
        isAvailable: (app, department) =>
          department === "PT(IKL)" && normalizeStatus(app?.status) === "payment_submitted",
        buildPayload: (app, data) => ({
          status: "payment_verified",
          form_data: mergeFormData(app, {
            approval_letter: {
              ...buildOfficialReceiptApprovalLetterForSending(
                app,
                data.department,
                data.officialReceiptMode
              ),
            },
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
          const manualLicenseFields = app.form_data?.license?.manual_license?.fields || {};
          const issueDate = parseDateOrFallback(manualLicenseFields.issueDate, today);
          const expiry = parseDateOrFallback(
            manualLicenseFields.expiryDate,
            addCalendarYears(issueDate, validityYears)
          );
          const licenseId = getLicenseId(app);
          return {
            status: "license_issued",
            form_data: mergeFormData(app, {
              license: {
                ...(app.form_data?.license || {}),
                license_id: licenseId,
                status: "Active",
                holder: getApplicantName(app),
                type: getApplicationType(app),
                location: getApplicationLocation(app),
                issue_date: issueDate.toISOString(),
                expiry_date: expiry.toISOString(),
                validity_years: validityYears,
                verification_url: getLicenseVerificationUrl(licenseId),
                issued_at: new Date().toISOString(),
                manual_license: buildManualAdvertisementLicenseForIssuance(app, {
                  issueDate: issueDate.toISOString(),
                  expiryDate: expiry.toISOString(),
                }),
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
  language,
  config,
  selectedRecord,
  decision,
  setDecision,
  comment,
  setComment,
  technicalSite,
  setTechnicalSite,
  technicalApplicationTypeSelection,
  setTechnicalApplicationTypeSelection,
  saveTechnicalApplicationTypeSelection,
  saveTechnicalSiteVisitDraft,
  saving,
  submitAction,
  commentError,
  setCommentError,
  technicalSizeError,
  setTechnicalSizeError,
  userDepartment,
}) {
  const status = normalizeStatus(selectedRecord.status);
  const allDepartmentReviewsComplete = areAllTechnicalDepartmentReviewsComplete(selectedRecord);
  const hasSavedDepartmentSelection = hasTechnicalDepartmentSelection(selectedRecord);
  const selectedTechnicalDepartments = getSelectedTechnicalDepartments(selectedRecord);
  const pendingTechnicalDepartments = selectedTechnicalDepartments.filter(
    (department) => !hasTechnicalDepartmentReview(selectedRecord, department)
  );
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
    ""
  );
  const [kuRemarks, setKuRemarks] = useState("");
  const [technicalDecision, setTechnicalDecision] = useState(
    config.technicalActions?.[0]?.decision || ""
  );
  const technicalSiteSaveTimerRef = useRef(null);
  const latestTechnicalSiteRef = useRef(technicalSite);
  const [kuChecks, setKuChecks] = useState(() =>
    createKuTechnicalChecks(selectedRecord.form_data?.technical_ku_review?.checks)
  );
  const reviewTechnicalSite = getReviewTechnicalSite(technicalSite, selectedRecord);
  const screeningDecisionOptions = getIklScreeningDecisionOptions(
    config.decisions,
    userDepartment
  );
  const screeningCopy = getIklScreeningCopy(userDepartment);
  const selectedTechnicalAction = config.technicalActions.find(
    (action) => action.decision === technicalDecision
  );
  const technicalDecisionMustWait =
    (!hasSavedDepartmentSelection || !allDepartmentReviewsComplete) &&
    selectedTechnicalAction?.decision !== "Not Supported";
  const technicalDecisionDisabled =
    saving ||
    !selectedTechnicalAction ||
    Boolean(selectedTechnicalAction.disabled) ||
    technicalDecisionMustWait;

  useEffect(() => {
    const hasDecision = screeningDecisionOptions.some(
      (item) => (item.value || item) === decision
    );
    if (decision && !hasDecision) {
      setDecision("");
    }
  }, [decision, screeningDecisionOptions, setDecision]);

  useEffect(() => {
    const savedDecision =
      selectedRecord.form_data?.technical_review?.final_decision ||
      selectedRecord.form_data?.technical_review?.decision ||
      "";
    const hasSavedDecision = config.technicalActions.some(
      (action) => action.decision === savedDecision
    );

    setTechnicalDecision(
      hasSavedDecision
        ? savedDecision
        : ""
    );
  }, [config.technicalActions, selectedRecord.id, selectedRecord.form_data?.technical_review]);

  useEffect(() => {
    latestTechnicalSiteRef.current = technicalSite;
  }, [technicalSite]);

  useEffect(() => {
    return () => {
      if (technicalSiteSaveTimerRef.current) {
        window.clearTimeout(technicalSiteSaveTimerRef.current);
      }
    };
  }, []);

  function updateKuCheck(key, checked) {
    setKuChecks((prev) => ({ ...prev, [key]: checked }));
  }

  function handleTechnicalApplicationTypeToggle(type, checked) {
    const nextSelection = normalizeApplicationTypeOptions(
      checked ? [type] : technicalApplicationTypeSelection.filter((item) => item !== type)
    );

    if (nextSelection.length === 0) {
      setError(t("workspace.technical.applicationTypeRequired", "Please select at least one application type."));
      return;
    }

    setTechnicalApplicationTypeSelection(nextSelection);
    saveTechnicalApplicationTypeSelection(nextSelection);
  }

  function scheduleTechnicalSiteVisitDraftSave(nextSite) {
    latestTechnicalSiteRef.current = nextSite;

    if (technicalSiteSaveTimerRef.current) {
      window.clearTimeout(technicalSiteSaveTimerRef.current);
    }

    technicalSiteSaveTimerRef.current = window.setTimeout(() => {
      saveTechnicalSiteVisitDraft(nextSite);
    }, 600);
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

    if (technicalSiteSaveTimerRef.current) {
      window.clearTimeout(technicalSiteSaveTimerRef.current);
    }

    const nextSite = {
      ...latestTechnicalSiteRef.current,
      site_photos: [...(latestTechnicalSiteRef.current.site_photos || []), ...sitePhotos],
    };

    setTechnicalSite(nextSite);
    latestTechnicalSiteRef.current = nextSite;
    saveTechnicalSiteVisitDraft({
      ...nextSite,
    });
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
                <option value="">
                  {t("workspace.decision.selectDecision", "Select decision")}
                </option>
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
          {userDepartment === "IKL (TECHNICAL)" && (
            <TechnicalApplicationTypePanel
              t={t}
              language={language}
              selectedTypes={technicalApplicationTypeSelection}
              derivedDepartments={getApplicationTypeTechnicalDepartmentsFromTypes(
                technicalApplicationTypeSelection
              )}
              saving={saving}
              onToggle={handleTechnicalApplicationTypeToggle}
            />
          )}

          <TechnicalSiteVisitFields
            t={t}
            applicationId={selectedRecord.id}
            value={technicalSite}
            onChange={setTechnicalSite}
            onFileChange={handleSitePhotoUpload}
            onDraftChange={scheduleTechnicalSiteVisitDraftSave}
            sizeError={technicalSizeError}
            onSizeErrorChange={setTechnicalSizeError}
          />

          {hasSavedDepartmentSelection && !allDepartmentReviewsComplete && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[14px] font-medium leading-5 text-amber-800">
              {t(
                "workspace.technical.awaitingSelectedDepartmentReviews",
                "Awaiting selected department reviews."
              )}
              {pendingTechnicalDepartments.length > 0 && (
                <span> {pendingTechnicalDepartments.join(", ")}</span>
              )}
            </div>
          )}

          {!hasSavedDepartmentSelection && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[14px] font-medium leading-5 text-amber-800">
              {t(
                "workspace.technical.saveDepartmentSelectionFirst",
                "Save the participating departments before completing IKL Technical review."
              )}
            </div>
          )}

          <div className="rounded-md border border-slate-200 bg-white p-3">
            <div className="space-y-3">
              <Field label={t(config.decisionLabelKey || "common.decision", config.decisionLabel || "Decision")}>
                <select
                value={technicalDecision}
                onChange={(event) => setTechnicalDecision(event.target.value)}
                className="form-input min-h-10 max-w-xl"
              >
                <option value="">
                  {t("workspace.decision.selectDecision", "Select decision")}
                </option>
                {config.technicalActions.map((action) => (
                  <option key={action.decision} value={action.decision}>
                    {t(action.labelKey, action.label)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={t("workspace.technical.siteRemarks")}>
                <textarea
                  value={technicalSite.site_remarks}
                  onChange={(event) => {
                    if (commentError) setCommentError("");
                    setTechnicalSite((prev) => ({
                      ...prev,
                      site_remarks: event.target.value,
                    }));
                  }}
                  rows="4"
                  className={`form-input ${commentError ? "border-red-300 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(220,38,38,0.12)]" : ""}`}
                  placeholder={t("workspace.technical.siteRemarksPlaceholder")}
                />
                {commentError && (
                  <p className="mt-1.5 text-[13px] font-medium leading-5 text-red-600">
                    {commentError}
                  </p>
                )}
              </Field>

              <div className="flex justify-end border-t border-slate-100 pt-3">
                <Button
                  icon="fact_check"
                  disabled={technicalDecisionDisabled}
                  onClick={() => {
                    if (technicalDecisionDisabled) return;

                    submitAction(selectedTechnicalAction, {
                      comment: technicalSite.site_remarks,
                      checkDecisionRemark: true,
                    });
                  }}
                  className="w-full sm:w-auto"
                >
                  {saving
                    ? t("workspace.saving")
                    : t("common.submit", "Submit")}
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}

      {showKuTechnicalReview && config.kuTechnicalReview && (
        <>
          <TechnicalApplicationTypePanel
            t={t}
            language={language}
            selectedTypes={getApplicationTypeOptionsFromApplication(selectedRecord)}
            derivedDepartments={getSelectedTechnicalDepartments(selectedRecord)}
            saving={false}
            onToggle={() => {}}
            readOnly
          />

          <TechnicalSiteVisitFields
            t={t}
            applicationId={selectedRecord.id}
            value={reviewTechnicalSite}
            onChange={() => {}}
            onFileChange={() => {}}
            readOnly
          />

          <section className="space-y-3">
              <KuTechnicalFurtherReviewPanel
                t={t}
                selectedRecord={selectedRecord}
                technicalSite={reviewTechnicalSite}
                checks={kuChecks}
                onCheckChange={updateKuCheck}
                compact
              />

              <Field label={t("common.decision")}>
                <select
                  value={kuDecision}
                  onChange={(event) => setKuDecision(event.target.value)}
                  className="form-input max-w-64"
                >
                  <option value="">
                    {t("workspace.decision.selectDecision", "Select decision")}
                  </option>
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
          </section>
        </>
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
  const calculatedFees = calculateTechnicalFee({
    ...saved,
    ...technicalSite,
  });

  return {
    site_photos: currentPhotos.length > 0 ? currentPhotos : savedPhotos,
    fee_date: technicalSite.fee_date || saved.fee_date || "",
    fee_items: feeItems,
    width_ft: technicalSite.width_ft || saved.width_ft || "",
    height_ft: technicalSite.height_ft || saved.height_ft || "",
    area_sqft: calculatedFees.areaSqft || saved.area_sqft || "",
    area_sqm: calculatedFees.areaSqm || saved.area_sqm || "",
    chargeable_area_sqm: calculatedFees.chargeableAreaSqm || saved.chargeable_area_sqm || "",
    first_area_sqm: calculatedFees.firstAreaSqm || saved.first_area_sqm || "",
    first_area_fee: calculatedFees.firstAreaFee || saved.first_area_fee || "",
    additional_area_sqm: calculatedFees.additionalAreaSqm || saved.additional_area_sqm || "0",
    additional_area_fee: calculatedFees.additionalAreaFee || saved.additional_area_fee || "0",
    fee_total: calculatedFees.feeTotal || feeTotals.feeTotal || saved.fee_total || "",
    payable_total: calculatedFees.totalPayable || feeTotals.grandTotal || saved.payable_total || "",
    license_fee_calculation:
      technicalSite.license_fee_calculation || saved.license_fee_calculation || (calculatedFees.feeTotal ? String(calculatedFees.feeTotal) : feeTotals.feeTotal ? String(feeTotals.feeTotal) : ""),
    deposit_calculation:
      technicalSite.deposit_calculation || saved.deposit_calculation || String(TECHNICAL_FIXED_DEPOSIT),
    processing_fee_calculation:
      technicalSite.processing_fee_calculation || saved.processing_fee_calculation || String(TECHNICAL_PROCESSING_FEE),
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

function TechnicalApplicationTypePanel({
  t,
  language,
  selectedTypes,
  derivedDepartments,
  saving,
  onToggle,
  readOnly = false,
}) {
  const selectedType = normalizeApplicationTypeOptions(selectedTypes)[0] || "";
  const selectedSet = new Set(selectedType ? [selectedType] : []);
  const departmentLabel =
    derivedDepartments.length > 0
      ? derivedDepartments.join(", ")
      : t("workspace.technical.noExternalDepartments", "No external departments selected");
  const showApplicationTypeMeta = !readOnly;

  return (
    <section className="rounded-md border border-slate-200 bg-white p-3">
      <div className="mb-3">
        <h3 className="text-[16px] font-semibold leading-6 text-slate-950">
          {t("workspace.technical.applicationTypeTitle", "Application Type")}
        </h3>
        {showApplicationTypeMeta && (
          <p className="mt-1 text-[14px] leading-5 text-slate-500">
            {t(
              "workspace.technical.applicationTypeDesc",
              "Correct the application type if needed. The participating departments will follow the selected type."
            )}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {APPLICATION_TYPE_OPTIONS.map((type) => (
          <label
            key={type}
            className={`flex min-h-10 w-full items-center gap-2 rounded-md border px-3 py-2 text-[14px] font-semibold leading-5 sm:w-56 ${
              selectedSet.has(type)
                ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            } ${saving || readOnly ? "cursor-default opacity-80" : "cursor-pointer"}`}
          >
            <input
              type="checkbox"
              checked={selectedSet.has(type)}
              disabled={saving || readOnly}
              onChange={(event) => onToggle(type, event.target.checked)}
              className="h-4 w-4 accent-emerald-700"
            />
            {getApplicationTypeOptionLabel(type, language)}
          </label>
        ))}
      </div>

      {showApplicationTypeMeta && (
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1 text-[13px] leading-5 text-slate-600">
            <p>
              <span className="font-semibold text-slate-700">
                {t("workspace.technical.derivedDepartments", "Departments involved")}:
              </span>{" "}
              {departmentLabel}
            </p>
          </div>
          {saving && (
            <span className="inline-flex min-h-9 items-center gap-1 text-[13px] font-semibold leading-5 text-emerald-700">
              <Icon name="sync" className="text-[18px]" />
              {t("workspace.saving")}
            </span>
          )}
        </div>
      )}
    </section>
  );
}

function KuTechnicalFurtherReviewPanel({
  t,
  selectedRecord,
  technicalSite,
  checks,
  onCheckChange,
  compact = false,
  compiledRemarksLeadingRows = [],
  readOnly = false,
}) {
  const reviewTechnicalSite = getReviewTechnicalSite(technicalSite, selectedRecord);
  const formData = selectedRecord.form_data || {};
  const step1 = formData.step_1 || {};
  const technicalReview = formData.technical_review || {};
  const selectedDepartments = getSelectedTechnicalDepartments(selectedRecord);
  const reviewDepartments = hasTechnicalDepartmentSelection(selectedRecord)
    ? selectedDepartments
    : TECHNICAL_DEPARTMENTS;
  const completedDepartmentCount = reviewDepartments.filter(
    (department) => hasTechnicalDepartmentReview(selectedRecord, department)
  ).length;
  const completedText = t("workspace.technical.completedDepartments", "{count} of {total} completed")
    .replace("{count}", String(completedDepartmentCount))
    .replace("{total}", String(reviewDepartments.length));
  const technicalSitePhotos = Array.isArray(reviewTechnicalSite.site_photos)
    ? reviewTechnicalSite.site_photos
    : [];
  const checklist = [
    ["application", t("workspace.technical.checkApplication")],
    ["sitePhoto", t("workspace.technical.checkSitePhoto")],
    ["fees", t("workspace.technical.checkFees")],
    ["departments", t("workspace.technical.checkDepartments")],
  ];
  const iklTechnicalRemarks =
    reviewTechnicalSite.site_remarks ||
    technicalReview.comment ||
    technicalReview.remarks ||
    "";
  const iklTechnicalRemarkRows = [
    {
      department: "IKL(TECHNICAL)",
      decision: technicalReview.final_decision || technicalReview.decision,
      remarks: iklTechnicalRemarks,
      reviewed_at: technicalReview.reviewed_at || reviewTechnicalSite.visited_at,
    },
  ];

  return (
    <div className="space-y-3">
      {!compact && (
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
      )}

      {!compact && (
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <TechnicalFeeCalculationSheet
            t={t}
            value={reviewTechnicalSite}
            readOnly
          />
        </div>
      )}

      {!compact && (
        <ReportPhotoGrid
          t={t}
          title={t("workspace.technical.siteVisitEvidence")}
          emptyText={t("workspace.info.notSubmitted", "Not submitted")}
          applicationId={selectedRecord.id}
          photos={technicalSitePhotos}
        />
      )}

      <TechnicalDepartmentRemarks
        app={selectedRecord}
        t={t}
        leadingRows={compiledRemarksLeadingRows.length > 0 ? compiledRemarksLeadingRows : compact ? iklTechnicalRemarkRows : []}
      />

      {!compact && (
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
      )}
    </div>
  );
}

function ApprovalTechnicalReviewSummary({
  t,
  language,
  selectedRecord,
  technicalSite,
  title,
  description,
  userDepartment,
}) {
  const reviewTechnicalSite = getReviewTechnicalSite(technicalSite, selectedRecord);
  const technicalReview = selectedRecord.form_data?.technical_review || {};
  const kuReview = selectedRecord.form_data?.technical_ku_review || {};
  const iklTechnicalRemarks =
    reviewTechnicalSite.site_remarks ||
    technicalReview.comment ||
    technicalReview.remarks ||
    "";
  const iklTechnicalRemarkRows = [
    {
      department: "IKL(TECHNICAL)",
      decision: technicalReview.final_decision || technicalReview.decision,
      remarks: iklTechnicalRemarks,
      reviewed_at: technicalReview.reviewed_at || reviewTechnicalSite.visited_at,
    },
  ];

  return (
    <div className="space-y-3">
      <TechnicalApplicationTypePanel
        t={t}
        language={language}
        selectedTypes={getApplicationTypeOptionsFromApplication(selectedRecord)}
        derivedDepartments={getSelectedTechnicalDepartments(selectedRecord)}
        saving={false}
        onToggle={() => {}}
        readOnly
      />

      <TechnicalSiteVisitFields
        t={t}
        applicationId={selectedRecord.id}
        value={reviewTechnicalSite}
        onChange={() => {}}
        onFileChange={() => {}}
        readOnly
      />

      <KuTechnicalFurtherReviewPanel
        t={t}
        selectedRecord={selectedRecord}
        technicalSite={reviewTechnicalSite}
        checks={createKuTechnicalChecks(kuReview.checks)}
        compiledRemarksLeadingRows={iklTechnicalRemarkRows}
        compact
        readOnly
      />
    </div>
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

function TechnicalDepartmentRemarks({ app, t, leadingRows = [] }) {
  const reviews = getTechnicalDepartmentReviews(app);
  const selectedDepartments = getSelectedTechnicalDepartments(app);
  const hasSelection = hasTechnicalDepartmentSelection(app);
  const departments = hasSelection ? selectedDepartments : TECHNICAL_DEPARTMENTS;

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
        {leadingRows.map((review) => (
          <div key={review.department} className="grid grid-cols-1 gap-4 px-3 py-2 text-[14px] leading-5 md:grid-cols-[110px_210px_1fr]">
            <div className="font-semibold text-slate-950">{review.department}</div>
            <div>
              <StatusPill
                value={
                  review.decision
                    ? t(getDecisionLabelKey(review.decision), review.decision)
                    : t("workspace.stat.pending")
                }
              />
            </div>
            <div className="min-w-0 text-slate-700">
              {review.remarks ? (
                <>
                  <p className="whitespace-pre-wrap leading-5">{review.remarks}</p>
                  {review.reviewed_at && (
                    <p className="mt-1 text-[13px] leading-5 text-slate-400">
                      {formatDateTime(review.reviewed_at)}
                    </p>
                  )}
                </>
              ) : (
                <span className="text-slate-400">{t("workspace.info.notSubmitted")}</span>
              )}
            </div>
          </div>
        ))}
        {departments.length === 0 && leadingRows.length === 0 && (
          <div className="px-3 py-3 text-[14px] leading-5 text-slate-500">
            {t("workspace.technical.noExternalDepartments", "No external departments selected")}
          </div>
        )}
        {departments.map((department) => {
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
    "Not Verify": "workspace.decision.notVerify",
    Verified: "workspace.decision.verified",
    "Not Verified": "workspace.decision.notVerified",
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

function TechnicalSiteVisitFields({
  t,
  applicationId,
  value,
  onChange,
  onFileChange,
  onDraftChange,
  readOnly = false,
  sizeError = "",
  onSizeErrorChange,
}) {
  const sitePhotos = Array.isArray(value.site_photos) ? value.site_photos : [];
  const [deletingIndex, setDeletingIndex] = useState(null);

  function updateSizeField(field, nextValue) {
    if (readOnly) return;
    if (sizeError) onSizeErrorChange?.("");
    onChange((prev) => {
      const nextSite = mergeTechnicalFeeCalculation({ ...prev, [field]: nextValue });
      onDraftChange?.(nextSite);
      return nextSite;
    });
  }

  async function removePhoto(photo, index) {
    try {
      setDeletingIndex(index);

      if (photo?.document_id) {
        await deleteApplicationDocument(applicationId, photo.document_id);
      }

      onChange((prev) => {
        const nextSite = {
          ...prev,
          site_photos: (prev.site_photos || []).filter((_, itemIndex) => itemIndex !== index),
        };
        onDraftChange?.(nextSite);
        return nextSite;
      });
    } finally {
      setDeletingIndex(null);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-slate-200 bg-white p-3">
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
          {!readOnly && (
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
          )}
          {sitePhotos.length > 0 && (
            <span className="text-[14px] font-medium leading-5 text-emerald-700">
              {t("workspace.technical.sitePhotoUploaded")}: {sitePhotos.length}
            </span>
          )}
          {readOnly && sitePhotos.length === 0 && (
            <span className="text-[14px] font-medium leading-5 text-slate-500">
              {t("workspace.technical.noSitePhoto", "No site photo uploaded.")}
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
                  hideDelete={readOnly}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <TechnicalFeeCalculationSheet
        t={t}
        value={value}
        onSizeChange={updateSizeField}
        readOnly={readOnly}
        sizeError={sizeError}
      />

    </div>
  );
}

function TechnicalFeeCalculationSheet({ t, value, onSizeChange, readOnly = false, sizeError = "" }) {
  const technicalFee = calculateTechnicalFee(value);
  const hasAdvertisementSize = technicalFee.areaSqft > 0;

  return (
    <section className="pt-2">
      <h4 className="text-[15px] font-semibold leading-6 text-slate-950">
        {t("workspace.technical.feeCalculationTitle", "Advertisement Size & Fee Calculation")}
      </h4>

      <div className="mt-3 rounded-md border border-slate-300 bg-white p-4">
        <div className="text-center">
          <p className="text-[13px] font-normal uppercase italic leading-5 text-slate-950">
            {t("workspace.technical.scheduleTitle", "SECOND SCHEDULE")}
          </p>
          <div className="mt-1 flex items-center justify-center gap-4">
            <span className="h-px w-24 bg-slate-950" />
            <p className="text-[19px] font-bold leading-6 text-slate-950">
              {t("workspace.technical.scheduleFeesTitle", "LICENCE FEES")}
            </p>
            <span className="h-px w-24 bg-slate-950" />
          </div>
          <p className="mt-1 text-[13px] font-bold leading-5 text-slate-950">
            {t("workspace.technical.scheduleBylaws", "(By-laws 9 and 10)")}
          </p>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[960px] table-fixed overflow-hidden text-[13px] leading-5 text-slate-950">
            <colgroup>
              <col className="w-[64px]" />
              <col className="w-[340px]" />
              <col className="w-[300px]" />
              <col className="w-[220px]" />
              <col className="w-[210px]" />
            </colgroup>
            <thead>
              <tr className="text-center italic">
                <th className="px-3 py-3 font-normal" aria-hidden="true"></th>
                <th className="px-3 py-3 font-normal">
                  {t("workspace.technical.scheduleAdvertisementType", "Type of Advertisement")}
                </th>
                <th className="px-3 py-3 font-normal">
                  {t("workspace.technical.scheduleFeePayable", "Fee Payable")}
                </th>
                <th className="px-3 py-3 font-normal">
                  {t("workspace.technical.scheduleCityLine1", "City/")}
                  {t("workspace.technical.scheduleCityLine2", "Municipal Council")}
                </th>
                <th className="px-3 py-3 font-normal">
                  {t("workspace.technical.scheduleDistrictLine1", "District")}{" "}
                  {t("workspace.technical.scheduleDistrictLine2", "Council")}
                </th>
              </tr>
            </thead>
            <tbody className="font-normal">
              <tr className="align-top">
                <td className="px-3 py-4 text-center text-[13px] font-normal" rowSpan={2}>1.</td>
                <td className="px-5 py-4 text-justify font-normal" rowSpan={2}>
                  {t(
                    "workspace.technical.scheduleAdvertisementDesc",
                    "Advertisement (other than business name signboard, sky-sign and advertisement on electronic board or any non-print device) of over one square metre in size; measured over the area for the display of the advertisement, and includes such superficial area of frame work or support"
                  )}
                </td>
                <td className="px-5 py-4 text-justify font-normal">
                  <div className="flex items-start gap-3">
                    <span className="w-7 shrink-0 font-normal text-slate-950">(a)</span>
                    <span>
                      {t("workspace.technical.scheduleFirstArea", "For the first 20 square metre or part thereof")}
                    </span>
                  </div>
                </td>
                <td className="px-5 py-4 text-justify font-normal">
                  <span className="font-normal text-slate-950">RM100.00</span>{" "}
                  {t("workspace.technical.scheduleCityFirstRateSuffix", "for every square metre per year")}
                </td>
                <td className="px-5 py-4 text-justify font-normal">
                  <span className="font-normal text-slate-950">RM70.00</span>{" "}
                  {t("workspace.technical.scheduleDistrictFirstRateSuffix", "for every square metre per year")}
                </td>
              </tr>
              <tr className="align-top">
                <td className="px-5 py-4 text-justify font-normal">
                  <div className="flex items-start gap-3">
                    <span className="w-7 shrink-0 font-normal text-slate-950">(b)</span>
                    <span>
                      {t("workspace.technical.scheduleAdditionalArea", "For every additional square metre or part thereof")}
                    </span>
                  </div>
                </td>
                <td className="px-5 py-4 text-justify font-normal">
                  <span className="font-normal text-slate-950">RM70.00</span>{" "}
                  {t("workspace.technical.schedulePerYear", "per year")}
                </td>
                <td className="px-5 py-4 text-justify font-normal">
                  <span className="font-normal text-slate-950">RM50.00</span>{" "}
                  {t("workspace.technical.schedulePerYear", "per year")}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <div className="min-w-[820px] divide-y divide-slate-100 text-[14px] leading-5">
          <FeeSheetSizeRow
            label={t("workspace.technical.size", "Size")}
            widthLabel={t("workspace.technical.widthFt", "Width (ft)")}
            widthValue={value.width_ft || ""}
            heightLabel={t("workspace.technical.heightFt", "Height (ft)")}
            heightValue={value.height_ft || ""}
            onWidthChange={(nextValue) => onSizeChange?.("width_ft", nextValue)}
            onHeightChange={(nextValue) => onSizeChange?.("height_ft", nextValue)}
            readOnly={readOnly}
            required={!readOnly}
            error={sizeError}
          />
          {sizeError && !readOnly && (
            <div className="grid grid-cols-[190px_120px_48px_36px_120px_36px_140px] items-center gap-2 bg-white px-2 pb-2">
              <span aria-hidden="true" />
              <p className="col-span-6 text-[13px] font-medium leading-5 text-red-600">
                {sizeError}
              </p>
            </div>
          )}
          <FeeSheetRow
            label={t("workspace.technical.totalAreaFt", "Total Area (ft)")}
            value={hasAdvertisementSize ? formatTechnicalArea(technicalFee.areaSqft) : "-"}
            unit="ft"
          />
          <FeeSheetRow
            label={t("workspace.technical.totalAreaSqm", "Total Area (m2)")}
            value={hasAdvertisementSize ? formatTechnicalArea(technicalFee.areaSqm) : "-"}
            unit="m2"
          />
          <FeeSheetSection label={t("workspace.technical.fees", "Fees:")} />
          <FeeSheetRow
            label={t("workspace.technical.firstTwenty", "(i) First 20 m2")}
            value={formatTechnicalArea(technicalFee.firstAreaSqm || 0)}
            unit="m2"
            operator="x"
            multiplier={formatTechnicalCurrency(TECHNICAL_FIRST_AREA_RATE)}
            equals="="
            amount={formatTechnicalCurrency(technicalFee.firstAreaFee)}
          />
          <FeeSheetRow
            label={t("workspace.technical.additionalArea", "(ii) Additional Area")}
            value={formatTechnicalArea(technicalFee.additionalAreaSqm || 0)}
            unit="m2"
            operator="x"
            multiplier={formatTechnicalCurrency(TECHNICAL_ADDITIONAL_AREA_RATE)}
            equals="="
            amount={formatTechnicalCurrency(technicalFee.additionalAreaFee)}
          />
          <FeeSheetRow
            label={t("workspace.technical.totalFee", "Total Fee")}
            value={formatTechnicalCurrency(technicalFee.feeTotal)}
            emphasized
          />
          <FeeSheetRow
            label={t("workspace.technical.depositShort", "Deposit")}
            value={formatTechnicalCurrency(TECHNICAL_FIXED_DEPOSIT)}
          />
          <FeeSheetRow
            label={t("workspace.technical.processingFee", "Processing Fee")}
            value={formatTechnicalCurrency(TECHNICAL_PROCESSING_FEE)}
          />
          <FeeSheetRow
            label={t("workspace.technical.total", "TOTAL")}
            value={formatTechnicalCurrency(technicalFee.totalPayable)}
            emphasized
            total
          />
        </div>
      </div>
    </section>
  );
}

function FeeSheetSection({ label }) {
  return (
    <div className="grid grid-cols-[190px_120px_48px_36px_120px_36px_140px] gap-2 bg-slate-50 px-2 py-2 font-semibold text-slate-800">
      <span>{label}</span>
    </div>
  );
}

function FeeSheetSizeRow({
  label,
  widthLabel,
  widthValue = "",
  heightLabel,
  heightValue = "",
  onWidthChange,
  onHeightChange,
  readOnly = false,
  required = false,
  error = "",
}) {
  const inputClassName = `h-8 w-full rounded border px-2 py-1 text-right text-[14px] leading-5 outline-none ${
    error
      ? "border-red-300 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(220,38,38,0.12)]"
      : "border-slate-300 focus:border-emerald-700 focus:shadow-[0_0_0_3px_rgba(4,120,87,0.12)]"
  } ${
    readOnly ? "bg-slate-50 text-slate-700" : "bg-white text-slate-950"
  }`;

  return (
    <div className="grid grid-cols-[190px_120px_48px_36px_120px_36px_140px] items-center gap-2 bg-white px-2 py-2">
      <span className="font-semibold text-slate-800">
        {label}
        {required && <span className="ml-1 text-red-600">*</span>}
      </span>
      <input
        aria-label={widthLabel}
        aria-required={required}
        aria-invalid={Boolean(error)}
        value={widthValue}
        onChange={(event) => onWidthChange(event.target.value)}
        readOnly={readOnly}
        required={required}
        className={inputClassName}
        inputMode="decimal"
        placeholder="0.00"
      />
      <span className="text-slate-700">ft</span>
      <span className="text-center text-slate-700">x</span>
      <input
        aria-label={heightLabel}
        aria-required={required}
        aria-invalid={Boolean(error)}
        value={heightValue}
        onChange={(event) => onHeightChange(event.target.value)}
        readOnly={readOnly}
        required={required}
        className={inputClassName}
        inputMode="decimal"
        placeholder="0.00"
      />
      <span className="text-slate-700">ft</span>
      <span aria-hidden="true" />
    </div>
  );
}

function FeeSheetRow({
  label,
  value = "",
  unit = "",
  operator = "",
  multiplier = "",
  multiplierUnit = "",
  equals = "",
  amount = "",
  emphasized = false,
  total = false,
}) {
  const hasMultiplier = multiplier !== "" && multiplier !== null && multiplier !== undefined;
  const hasAmount = amount !== "" && amount !== null && amount !== undefined;

  return (
    <div
      className={`grid grid-cols-[190px_120px_48px_36px_120px_36px_140px] items-center gap-2 px-2 py-2 ${
        total ? "bg-emerald-50" : emphasized ? "bg-slate-50/70" : "bg-white"
      }`}
    >
      <span className={`${total ? "font-bold" : "font-semibold"} text-slate-800`}>{label}</span>
      <span className={`rounded border border-slate-300 bg-white px-2 py-1 text-right ${emphasized || total ? "font-bold text-slate-950" : "text-slate-800"}`}>
        {value}
      </span>
      <span className="text-slate-700">{unit}</span>
      <span className="text-center text-slate-700">{operator}</span>
      {hasMultiplier ? (
        <span className="rounded border border-slate-200 bg-white px-2 py-1 text-right text-slate-800">
          {multiplier}
        </span>
      ) : (
        <span aria-hidden="true" />
      )}
      <span className="text-center text-slate-700">{equals || multiplierUnit}</span>
      {hasAmount ? (
        <span className="rounded border border-slate-300 bg-white px-2 py-1 text-right font-bold text-slate-950">
          {amount}
        </span>
      ) : (
        <span aria-hidden="true" />
      )}
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

function PaymentDetails({
  app,
  t,
  userDepartment,
  saving,
  onPaymentDocumentUpload,
  onPaymentDocumentDelete,
  onManualPaymentDraftChange,
  officialReceiptMode = "manual",
  setOfficialReceiptMode,
}) {
  const payment = app.form_data?.payment || {};
  const approvalLetter = app.form_data?.approval_letter || {};
  const receiptFile = payment.receipt_file;
  const receiptSource = getPaymentReceiptSource(receiptFile);
  const letterFile = approvalLetter.letter_file;
  const billFile = approvalLetter.bill_file;
  const officialReceiptFile = approvalLetter.official_receipt_file;
  const officialReceiptReady = Boolean(getPaymentDocumentSource(officialReceiptFile));
  const status = normalizeStatus(app?.status);
  const letterReady = Boolean(letterFile);
  const billReady = Boolean(billFile);
  const hasLocalManualDraft = Boolean(getInitialManualPaymentDraft(app));
  const manualReady = hasManualPaymentDocuments(app) || hasLocalManualDraft;
  const canUploadDocuments =
    userDepartment === "PT(IKL)" && status === "approved";
  const isReceiptVerification =
    userDepartment === "PT(IKL)" && status === "payment_submitted";
  const uploadReady = letterReady && billReady;
  const hasUploadedPaymentDocuments = letterReady || billReady;
  const showReceiptDetails = Boolean(
    receiptFile?.name ||
    payment.receipt_reference ||
    receiptSource ||
    payment.verification_result ||
    payment.verification_notes
  );
  const [documentMode, setDocumentMode] = useState("upload");

  useEffect(() => {
    setDocumentMode(manualReady && !hasUploadedPaymentDocuments ? "manual" : "upload");
  }, [app?.id, hasUploadedPaymentDocuments, manualReady]);

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

  const manualSummaryHint = isReceiptVerification
    ? t("workspace.payment.sentDocumentsHint", "These are the documents sent to the applicant.")
    : t("workspace.payment.manualConfirmHint", "KU(IKL) can review the documents, then confirm using the action button.");
  const receiptEditorSection = isReceiptVerification ? (
    <section className="rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-3 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[13px] font-semibold uppercase leading-5 tracking-wide text-slate-500">
              {t("workspace.payment.manual.officialReceiptTitle", "Official Receipt")}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {t("workspace.payment.officialReceiptChoiceDesc", "Upload the official receipt file or create it manually here.")}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[560px]">
            {[
              [
                "upload",
                t("workspace.payment.modeUpload", "Upload"),
                t("workspace.payment.officialReceiptUploadDesc", "Send an uploaded official receipt file to the applicant."),
                officialReceiptReady,
              ],
              [
                "manual",
                t("workspace.payment.modeManual", "Create manually"),
                t("workspace.payment.officialReceiptManualDesc", "Use the editable official receipt draft below."),
                true,
              ],
            ].map(([mode, label, description, ready]) => (
              <label
                key={mode}
                className={`flex cursor-pointer gap-3 rounded-md border px-3 py-2 transition ${
                  officialReceiptMode === mode
                    ? "border-emerald-700 bg-emerald-50"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name={`official-receipt-mode-${app.id}`}
                  value={mode}
                  checked={officialReceiptMode === mode}
                  onChange={() => setOfficialReceiptMode?.(mode)}
                  className="mt-1 h-4 w-4 accent-emerald-700"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-950">
                    {label}
                  </span>
                  <span className="block text-xs leading-5 text-slate-500">
                    {description}
                  </span>
                  {ready && (
                    <span className="mt-1 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                      {t("workspace.payment.methodReady", "Ready")}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {officialReceiptMode === "upload" ? (
        <div className="px-3 py-3">
          <PaymentDocumentSlot
            label={t("workspace.payment.manual.officialReceiptTitle", "Official Receipt")}
            file={officialReceiptFile}
            t={t}
            canUpload
            saving={saving}
            onFileChange={(file) => onPaymentDocumentUpload?.("official_receipt", file)}
            onDelete={() => onPaymentDocumentDelete?.("official_receipt", officialReceiptFile)}
          />
        </div>
      ) : (
        <ManualPaymentDocumentsForm
          app={app}
          t={t}
          readOnly={false}
          receiptOnly
          initialTab="receipt"
          onDraftChange={onManualPaymentDraftChange}
        />
      )}
    </section>
  ) : null;

  const documentSection = (
    <section className="rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-3 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
          <p className="text-[13px] font-semibold uppercase leading-5 tracking-wide text-slate-500">
            {t("workspace.payment.documents", "Approval Letter and Bill")}
          </p>
          </div>

          {canUploadDocuments && (
            <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[560px]">
              {[
                [
                  "upload",
                  t("workspace.payment.modeUpload", "Upload"),
                  t("workspace.payment.modeUploadDesc", "Submit by uploading the approval letter and bill files."),
                  uploadReady,
                ],
                [
                  "manual",
                  t("workspace.payment.modeManual", "Create manually"),
                  t("workspace.payment.modeManualDesc", "Submit the manual letter, appendix, and bill created here."),
                  manualReady,
                ],
              ].map(([mode, label, description, ready]) => (
                <label
                  key={mode}
                  className={`flex cursor-pointer gap-3 rounded-md border px-3 py-2 transition ${
                    documentMode === mode
                      ? "border-emerald-700 bg-emerald-50"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="radio"
                    name={`payment-document-mode-${app.id}`}
                    value={mode}
                    checked={documentMode === mode}
                    onChange={() => setDocumentMode(mode)}
                    className="mt-1 h-4 w-4 accent-emerald-700"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-950">
                      {label}
                    </span>
                    <span className="block text-xs leading-5 text-slate-500">
                      {description}
                    </span>
                    {ready && (
                      <span className="mt-1 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                        {t("workspace.payment.methodReady", "Ready")}
                        </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {documentMode === "manual" ? (
        canUploadDocuments ? (
          <ManualPaymentDocumentsForm
            app={app}
            t={t}
            readOnly={false}
            onDraftChange={onManualPaymentDraftChange}
          />
        ) : (
          <div className="px-3 py-3">
            <ManualPaymentDocumentsSummary app={app} t={t} hint={manualSummaryHint} />
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 gap-3 px-3 py-3 xl:grid-cols-2">
          <PaymentDocumentSlot
            label={t("workspace.payment.approvalLetter", "Approval Letter")}
            file={letterFile}
            t={t}
            canUpload={canUploadDocuments}
            saving={saving}
            onFileChange={(file) => onPaymentDocumentUpload?.("letter", file)}
            onDelete={() => onPaymentDocumentDelete?.("letter", letterFile)}
          />
          <PaymentDocumentSlot
            label={t("workspace.payment.billDocument", "Bill")}
            file={billFile}
            t={t}
            canUpload={canUploadDocuments}
            saving={saving}
            onFileChange={(file) => onPaymentDocumentUpload?.("bill", file)}
            onDelete={() => onPaymentDocumentDelete?.("bill", billFile)}
          />
          {!canUploadDocuments && manualReady && !hasUploadedPaymentDocuments && (
            <ManualPaymentDocumentsSummary app={app} t={t} hint={manualSummaryHint} />
          )}
        </div>
      )}

    </section>
  );

  const receiptSection = showReceiptDetails ? (
    <section className="rounded-md border border-slate-200 bg-white px-3 py-3">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Info
          label={t("workspace.info.receipt")}
          value={receiptFile?.name || payment.receipt_reference || t("workspace.info.notSubmitted")}
        />
        {payment.verification_result && (
          <Info label={t("workspace.info.verificationResult")} value={payment.verification_result} />
        )}
        {payment.verification_notes && (
          <Info label={t("workspace.info.verificationNotes")} value={payment.verification_notes} />
        )}
      </div>

      {receiptSource && (
        <button
          type="button"
          onClick={viewReceipt}
          className="mt-3 inline-flex w-fit items-center gap-1 text-sm font-semibold text-emerald-700 hover:underline"
        >
          <Icon name="visibility" className="text-base" />
          {t("workspace.info.viewReceipt")}
        </button>
      )}
    </section>
  ) : null;

  return (
    <div className="space-y-4 text-sm">
      {isReceiptVerification ? (
        <>
          {receiptSection}
          {documentSection}
          {receiptEditorSection}
        </>
      ) : (
        <>
          {documentSection}
          {receiptSection}
        </>
      )}
    </div>
  );
}

function PaymentDocumentSlot({ label, file, t, canUpload, saving, onFileChange, onDelete }) {
  const fileSource = getPaymentDocumentSource(file);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold uppercase leading-5 tracking-wide text-slate-500">
          {label}
        </p>
        <p className="mt-1 truncate text-sm font-semibold text-slate-950">
          {file?.name || t("workspace.info.notUploaded", "Not uploaded")}
        </p>
        {canUpload && (
          <p className="mt-0.5 text-xs text-slate-500">
            {t("workspace.payment.uploadHint", "PDF, JPG, or PNG")}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {fileSource && (
          <Button
            type="button"
            variant="secondary"
            icon="visibility"
            className="min-h-9 px-3 py-1 text-xs"
            onClick={() => openPaymentDocument(file, t)}
          >
            {t("common.view", "View")}
          </Button>
        )}
        {canUpload && (
          <>
            <label className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <Icon name="upload_file" className="text-[16px]" />
              <span>
                {file ? t("common.replace", "Replace") : t("common.uploadFile", "Upload File")}
              </span>
              <input
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                disabled={saving}
                onChange={(event) => {
                  onFileChange?.(event.target.files?.[0] || null);
                  event.target.value = "";
                }}
              />
            </label>
            {fileSource && (
              <Button
                type="button"
                variant="danger"
                icon="delete"
                className="min-h-9 px-3 py-1 text-xs"
                disabled={saving}
                onClick={onDelete}
              >
                {t("common.delete", "Delete")}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ManualPaymentDocumentsForm({
  app,
  t,
  readOnly,
  onDraftChange,
  receiptOnly = false,
  initialTab = "letter",
}) {
  const manualLetter = app?.form_data?.approval_letter?.manual_letter || {};
  const manualBill = app?.form_data?.approval_letter?.manual_bill || {};
  const initialState = getCachedManualPaymentFormState(app);
  const [subject, setSubject] = useState(() => initialState.subject);
  const [fields, setFields] = useState(() => initialState.fields);
  const [receiptFields, setReceiptFields] = useState(() => initialState.receiptFields);
  const [paymentRows, setPaymentRows] = useState(() => initialState.paymentRows);
  const [terms, setTerms] = useState(() => initialState.terms);
  const amount = getBillAmount(app);
  const [invoiceNo, setInvoiceNo] = useState(() => initialState.invoiceNo);
  const [receiptNo, setReceiptNo] = useState(() => initialState.receiptNo);
  const [activeManualDocumentTab, setActiveManualDocumentTab] = useState(initialTab);
  const totalAmount = useMemo(
    () => paymentRows.reduce(
      (sum, row) => sum + (parseCurrencyAmount(row.amount) || 0),
      0
    ),
    [paymentRows]
  );
  const totalForWords = totalAmount || parseCurrencyAmount(amount) || 0;
  const amountInWords = useMemo(
    () => getCurrencyAmountWords(totalForWords),
    [totalForWords]
  );
  const letterBody = useMemo(
    () => buildManualLetterBody({ fields, subject }),
    [fields, subject]
  );
  const billNotes = useMemo(
    () => buildManualBillNotes({ invoiceNo, paymentRows }),
    [invoiceNo, paymentRows]
  );
  const previewApp = useMemo(
    () => buildManualPaymentPreviewApp(app, {
      fields,
      receiptFields,
      subject,
      paymentRows,
      terms,
      invoiceNo,
      receiptNo,
      amount: totalAmount || amount,
    }),
    [app, fields, receiptFields, subject, paymentRows, terms, invoiceNo, receiptNo, totalAmount, amount]
  );

  useEffect(() => {
    if (readOnly) return;
    onDraftChange?.({
      subject,
      letterBody,
      billNotes,
      fields,
      receiptFields,
      paymentRows,
      terms,
      invoiceNo,
      receiptNo,
      amount: totalAmount || amount,
    });
  }, [readOnly, subject, letterBody, billNotes, fields, receiptFields, paymentRows, terms, invoiceNo, receiptNo, totalAmount, amount, onDraftChange]);

  useEffect(() => {
    const nextState = getCachedManualPaymentFormState(app);
    setSubject(nextState.subject);
    setFields(nextState.fields);
    setReceiptFields(nextState.receiptFields);
    setPaymentRows(nextState.paymentRows);
    setInvoiceNo(nextState.invoiceNo);
    setReceiptNo(nextState.receiptNo);
    setTerms(nextState.terms);
  }, [app?.id, app?.updated_at]);

  useEffect(() => {
    setActiveManualDocumentTab(initialTab);
  }, [app?.id, initialTab]);

  useEffect(() => {
    if (readOnly) return;

    setFields((current) => {
      if (
        current.billAmountText === amountInWords.ringgit &&
        current.billSenText === amountInWords.sen
      ) {
        return current;
      }

      return {
        ...current,
        billAmountText: amountInWords.ringgit,
        billSenText: amountInWords.sen,
      };
    });
    setReceiptFields((current) => {
      if (
        current.billAmountText === amountInWords.ringgit &&
        current.billSenText === amountInWords.sen
      ) {
        return current;
      }

      return {
        ...current,
        billAmountText: amountInWords.ringgit,
        billSenText: amountInWords.sen,
      };
    });
  }, [amountInWords.ringgit, amountInWords.sen, readOnly]);

  function updateField(key, value) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  function updateReceiptField(key, value) {
    setReceiptFields((current) => ({ ...current, [key]: value }));
  }

  async function handleBillLogoUpload(key, file) {
    if (!file) return;

    const dataUrl = await readFileAsDataUrl(file);
    updateField(key, dataUrl);
  }

  function updatePaymentRow(index, key, value) {
    setPaymentRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [key]: value } : row
      )
    );
  }

  function normalizePaymentRowAmount(index) {
    setPaymentRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index
          ? { ...row, amount: formatPaymentRowAmount(row.amount) }
          : row
      )
    );
  }

  const billReceiptSection = (
    <div className="rounded-md border border-slate-200 bg-white px-4 py-4">
      <div className="mb-4 flex flex-col gap-1 border-b border-slate-200 pb-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {t("workspace.payment.manual.billReceiptTitle", "Bill")}
        </p>
        <p className="text-sm text-slate-500">
          {t("workspace.payment.manual.billReceiptDesc", "Prepare bill payment information for KU(IKL) confirmation.")}
        </p>
      </div>

      <div className="mx-auto max-w-[940px] rounded border border-slate-300 bg-white p-5 text-sm text-slate-950">
        <div className="grid items-center gap-4 border-b-2 border-slate-900 pb-3 lg:grid-cols-[100px_minmax(0,1fr)_110px]">
          <div className="space-y-2">
            <div className="flex h-16 items-center justify-center">
              <img
                src={fields.billDbkuLogoPath || "/logo-dbku.png"}
                alt="DBKU"
                className="max-h-16 max-w-full object-contain"
              />
            </div>
            <label className="inline-flex min-h-8 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <Icon name="upload_file" className="text-[15px]" />
              <span>{t("workspace.payment.manual.uploadLogo", "Upload Logo")}</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={readOnly}
                onChange={(event) => {
                  handleBillLogoUpload("billDbkuLogoPath", event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
          </div>

          <div className="mx-auto w-fit max-w-full text-left">
            <input
              value={fields.letterheadTitle || ""}
              onChange={(event) => updateField("letterheadTitle", event.target.value)}
              placeholder={MANUAL_LETTERHEAD_TITLE}
              className="form-input h-8 border-transparent bg-transparent px-0 text-left text-xl font-extrabold uppercase leading-6 text-slate-950 shadow-none focus:border-slate-300 focus:bg-white"
              readOnly={readOnly}
            />
            <input
              value={fields.letterheadSubtitle || ""}
              onChange={(event) => updateField("letterheadSubtitle", event.target.value)}
              placeholder={MANUAL_LETTERHEAD_SUBTITLE}
              className="form-input h-7 border-transparent bg-transparent px-0 text-left text-sm italic leading-5 text-slate-950 shadow-none focus:border-slate-300 focus:bg-white"
              readOnly={readOnly}
            />
            <input
              value={fields.letterheadAddress || ""}
              onChange={(event) => updateField("letterheadAddress", event.target.value)}
              placeholder={MANUAL_LETTERHEAD_ADDRESS}
              className="form-input h-7 border-transparent bg-transparent px-0 text-left text-sm font-bold uppercase leading-5 text-slate-950 shadow-none focus:border-slate-300 focus:bg-white"
              readOnly={readOnly}
            />
            <input
              value={fields.letterheadAddressLine2 || ""}
              onChange={(event) => updateField("letterheadAddressLine2", event.target.value)}
              placeholder={MANUAL_LETTERHEAD_ADDRESS_LINE_2}
              className="form-input h-7 border-transparent bg-transparent px-0 text-left text-sm font-bold uppercase leading-5 text-slate-950 shadow-none focus:border-slate-300 focus:bg-white"
              readOnly={readOnly}
            />
            <input
              value={fields.letterheadPhoneLine || ""}
              onChange={(event) => updateField("letterheadPhoneLine", event.target.value)}
              placeholder={MANUAL_LETTERHEAD_PHONE_LINE}
              className="form-input h-7 border-transparent bg-transparent px-0 text-left text-sm font-bold italic leading-5 text-slate-950 shadow-none focus:border-slate-300 focus:bg-white"
              readOnly={readOnly}
            />
            <input
              value={fields.letterheadWebLine || ""}
              onChange={(event) => updateField("letterheadWebLine", event.target.value)}
              placeholder={MANUAL_LETTERHEAD_WEB_LINE}
              className="form-input h-7 border-transparent bg-transparent px-0 text-left text-sm font-bold leading-5 text-slate-950 shadow-none focus:border-slate-300 focus:bg-white"
              readOnly={readOnly}
            />
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <input
                value={fields.letterheadComplaintLine || ""}
                onChange={(event) => updateField("letterheadComplaintLine", event.target.value)}
                placeholder={MANUAL_LETTERHEAD_COMPLAINT_LINE}
                className="form-input h-7 min-w-[210px] flex-1 border-transparent bg-transparent px-0 text-left text-sm font-bold leading-5 text-slate-950 shadow-none focus:border-slate-300 focus:bg-white"
                readOnly={readOnly}
              />
              <input
                value={fields.letterheadFacebookLine || ""}
                onChange={(event) => updateField("letterheadFacebookLine", event.target.value)}
                placeholder={MANUAL_LETTERHEAD_FACEBOOK_LINE}
                className="form-input h-7 min-w-[240px] flex-1 border-transparent bg-transparent px-0 text-left text-sm font-bold leading-5 text-slate-950 shadow-none focus:border-slate-300 focus:bg-white"
                readOnly={readOnly}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex h-16 items-center justify-center">
              <img
                src={fields.billAlisLogoPath || "/ALiS.png"}
                alt="ALiS"
                className="max-h-14 max-w-full object-contain"
              />
            </div>
            <label className="inline-flex min-h-8 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <Icon name="upload_file" className="text-[15px]" />
              <span>{t("workspace.payment.manual.uploadLogo", "Upload Logo")}</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={readOnly}
                onChange={(event) => {
                  handleBillLogoUpload("billAlisLogoPath", event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
          </div>
        </div>

        <div className="mt-3 flex justify-end">
          <input
            value={fields.billCopyLabel || ""}
            onChange={(event) => updateField("billCopyLabel", event.target.value)}
            placeholder="Salinan Pelanggan"
            className="form-input h-8 max-w-56 border-transparent bg-transparent px-0 text-right text-xs font-bold uppercase tracking-wide text-slate-700 shadow-none focus:border-slate-300 focus:bg-white"
            readOnly={readOnly}
          />
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-end">
          <input
            value={fields.billReceiptTitle || ""}
            onChange={(event) => updateField("billReceiptTitle", event.target.value)}
            placeholder="Bil Bayaran"
            className="form-input h-12 border-transparent bg-transparent px-0 text-left text-3xl font-extrabold uppercase tracking-[0.18em] text-slate-950 shadow-none focus:border-slate-300 focus:bg-white"
            readOnly={readOnly}
          />
          <div className="border border-slate-900 px-3 py-2">
            <label className="block text-sm text-slate-700">
              {t("workspace.payment.manual.billReceiptNo", "Bill No.")}
            </label>
            <input
              value={invoiceNo}
              onChange={(event) => setInvoiceNo(event.target.value)}
              placeholder="INV-00001"
              className="form-input h-9 border-transparent bg-transparent px-0 text-lg font-extrabold tracking-wide text-red-700 shadow-none focus:border-slate-300 focus:bg-white"
              readOnly={readOnly}
            />
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="grid grid-cols-[124px_10px_1fr] items-center gap-x-2">
            <span>{t("workspace.payment.manual.billDate", "Bill Date")}</span>
            <span>:</span>
            <input
              type="date"
              value={fields.letterDate}
              onChange={(event) => updateField("letterDate", event.target.value)}
              className="form-input h-8 font-bold"
              readOnly={readOnly}
            />
          </div>
          <div className="grid grid-cols-[124px_10px_1fr] items-center gap-x-2">
            <span>{t("workspace.payment.manual.ourRef", "Our Ref.")}</span>
            <span>:</span>
            <input
              value={fields.ourRef || ""}
              onChange={(event) => updateField("ourRef", event.target.value)}
              placeholder={`DBKU/LES/IKL/${getApplicationReference(app)}`}
              className="form-input h-8 font-bold"
              readOnly={readOnly}
            />
          </div>
          <div className="grid grid-cols-[124px_10px_1fr] items-center gap-x-2">
            <span>{t("workspace.payment.manual.station", "Station")}</span>
            <span>:</span>
            <input
              value={fields.billStation || ""}
              onChange={(event) => updateField("billStation", event.target.value)}
              placeholder="ALiS"
              className="form-input h-8 font-bold"
              readOnly={readOnly}
            />
          </div>
          <div className="grid grid-cols-[124px_10px_1fr] items-center gap-x-2">
            <span>{t("workspace.payment.manual.applicationReference", "Application Ref.")}</span>
            <span>:</span>
            <input
              value={getApplicationReference(app)}
              className="form-input h-8 font-bold"
              readOnly
            />
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="min-h-36 border border-slate-900 p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              {t("workspace.payment.manual.billToLine", "Bill To")}
            </p>
            <input
              value={fields.billReceivedFrom || ""}
              onChange={(event) => updateField("billReceivedFrom", event.target.value)}
              placeholder={getBillingRecipientName(app)}
              className="form-input h-9 border-transparent bg-transparent px-0 font-bold shadow-none focus:border-slate-300 focus:bg-white"
              readOnly={readOnly}
            />
            <textarea
              value={fields.recipientAddress || ""}
              onChange={(event) => updateField("recipientAddress", event.target.value)}
              placeholder={getApplicantPostalAddress(app)}
              rows="3"
              className="form-input mt-1 border-transparent bg-transparent px-0 shadow-none focus:border-slate-300 focus:bg-white"
              readOnly={readOnly}
            />
          </div>
          <div className="min-h-36 border border-slate-900 p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              {t("workspace.payment.manual.billFor", "Bill For")}
            </p>
            <input
              value={fields.adName || ""}
              onChange={(event) => updateField("adName", event.target.value)}
              placeholder={getProjectName(app)}
              className="form-input h-9 border-transparent bg-transparent px-0 font-bold uppercase shadow-none focus:border-slate-300 focus:bg-white"
              readOnly={readOnly}
            />
            <input
              value={fields.adType || ""}
              onChange={(event) => updateField("adType", event.target.value)}
              placeholder={getApplicationType(app)}
              className="form-input mt-1 h-8 border-transparent bg-transparent px-0 shadow-none focus:border-slate-300 focus:bg-white"
              readOnly={readOnly}
            />
            <textarea
              value={fields.displayLocation || ""}
              onChange={(event) => updateField("displayLocation", event.target.value)}
              placeholder={getApplicationLocation(app)}
              rows="2"
              className="form-input mt-1 border-transparent bg-transparent px-0 shadow-none focus:border-slate-300 focus:bg-white"
              readOnly={readOnly}
            />
          </div>
        </div>

        <div className="mt-5 overflow-x-auto border border-slate-900">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="border border-slate-900 px-3 py-2 text-center uppercase">
                  {t("workspace.payment.manual.no", "No.")}
                </th>
                <th className="border border-slate-900 px-3 py-2 text-left uppercase">
                  {t("workspace.payment.manual.paymentDetails", "Payment Details")}
                </th>
                <th className="border border-slate-900 px-3 py-2 text-left uppercase">
                  {t("workspace.payment.manual.periodNotes", "Period / Notes")}
                </th>
                <th className="border border-slate-900 px-3 py-2 text-right uppercase">
                  {t("workspace.payment.manual.amountRm", "Amount (RM)")}
                </th>
              </tr>
            </thead>
            <tbody>
              {paymentRows.map((row, index) => (
                <tr key={index}>
                  <td className="border border-slate-900 px-2 py-2 text-center">
                    {index + 1}
                  </td>
                  <td className="border border-slate-900 px-2 py-2">
                    <input
                      value={row.label}
                      onChange={(event) => updatePaymentRow(index, "label", event.target.value)}
                      placeholder={t("workspace.payment.manual.paymentDetails", "Payment Details")}
                      className="form-input h-8 border-transparent bg-transparent px-0 shadow-none focus:border-slate-300 focus:bg-white"
                      readOnly={readOnly}
                    />
                  </td>
                  <td className="border border-slate-900 px-2 py-2">
                    <input
                      value={row.validity}
                      onChange={(event) => updatePaymentRow(index, "validity", event.target.value)}
                      placeholder={t("workspace.payment.manual.periodNotes", "Period / Notes")}
                      className="form-input h-8 border-transparent bg-transparent px-0 shadow-none focus:border-slate-300 focus:bg-white"
                      readOnly={readOnly}
                    />
                  </td>
                  <td className="border border-slate-900 px-2 py-2">
                    <input
                      value={row.amount}
                      onChange={(event) => updatePaymentRow(index, "amount", event.target.value)}
                      onBlur={() => normalizePaymentRowAmount(index)}
                      placeholder="0.00"
                      className="form-input h-8 border-transparent bg-transparent px-0 text-right shadow-none focus:border-slate-300 focus:bg-white"
                      readOnly={readOnly}
                    />
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-100 font-bold">
                <td className="border border-slate-900 px-3 py-2 text-right" colSpan="3">
                  {t("workspace.payment.manual.grandTotal", "Grand Total")}
                </td>
                <td className="border border-slate-900 px-3 py-2 text-right">
                  {formatCurrency(totalAmount || amount)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-5 border border-slate-300 p-3">
          <p className="mb-2 font-bold">
            {t("workspace.payment.manual.paymentInstructions", "Payment Instructions")}
          </p>
          <input
            value={fields.billPaymentLine1 || ""}
            onChange={(event) => updateField("billPaymentLine1", event.target.value)}
            placeholder="Sila jelaskan bayaran di Kaunter Bahagian Pelesenan, Aras 1, DBKU."
            className="form-input h-8 border-transparent bg-transparent px-0 shadow-none focus:border-slate-300 focus:bg-white"
            readOnly={readOnly}
          />
          <input
            value={fields.billPaymentLine2 || ""}
            onChange={(event) => updateField("billPaymentLine2", event.target.value)}
            placeholder="Bayaran hendaklah dibuat dalam tempoh empat belas (14) hari bekerja."
            className="form-input mt-1 h-8 border-transparent bg-transparent px-0 shadow-none focus:border-slate-300 focus:bg-white"
            readOnly={readOnly}
          />
          <textarea
            value={fields.billBankNote || ""}
            onChange={(event) => updateField("billBankNote", event.target.value)}
            placeholder={t("workspace.payment.manual.bankNotePlaceholder", "Optional payment note")}
            rows="2"
            className="form-input mt-1 border-transparent bg-transparent px-0 shadow-none focus:border-slate-300 focus:bg-white"
            readOnly={readOnly}
          />
        </div>

        <div className="mt-6 border-t border-slate-900 pt-2 text-center text-xs text-slate-500">
          <input
            value={fields.billFooterNote || ""}
            onChange={(event) => updateField("billFooterNote", event.target.value)}
            placeholder={t("workspace.payment.manual.billFooterNote", "This bill is computer generated for payment processing and is not an official receipt.")}
            className="form-input h-8 border-transparent bg-transparent px-0 text-center text-xs text-slate-500 shadow-none focus:border-slate-300 focus:bg-white"
            readOnly={readOnly}
          />
        </div>
      </div>
    </div>
  );

  const officialReceiptSection = (
    <div className="rounded-md border border-slate-200 bg-white px-4 py-4">
      <div className="mb-4 flex flex-col gap-1 border-b border-slate-200 pb-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {t("workspace.payment.manual.officialReceiptTitle", "Official Receipt")}
        </p>
        <p className="text-sm text-slate-500">
          {t("workspace.payment.manual.officialReceiptDesc", "Prepare the official receipt that will be sent to the applicant after payment verification.")}
        </p>
      </div>

      <div className="mx-auto max-w-[940px] rounded border border-slate-300 bg-white p-5 text-sm text-slate-950">
        <div className="grid items-start gap-4 lg:grid-cols-[100px_minmax(0,1fr)_160px]">
          <div className="flex h-20 items-center justify-center">
            <img
              src="/logo-dbku.png"
              alt="DBKU"
              className="max-h-20 max-w-full object-contain"
            />
          </div>
          <div className="text-center">
            <p className="text-base font-extrabold uppercase leading-5">
              {t("workspace.payment.manual.billHeaderTitle", "Mayor of North Kuching")}
            </p>
            <p className="mt-1 font-semibold">
              {t("workspace.payment.manual.billHeaderSubtitle", "(The Commissioner of The City of Kuching North)")}
            </p>
            <p className="mt-1 text-xs leading-5">
              {t("workspace.payment.manual.billHeaderAddressLine1", "Dewan Bandaraya Kuching Utara")}<br />
              {t("workspace.payment.manual.billHeaderAddressLine2", "Bukit Siol, Jalan Semariang, Petra Jaya,")}<br />
              {t("workspace.payment.manual.billHeaderAddressLine3", "93050 Kuching, Sarawak, Malaysia.")}
            </p>
          </div>
          <input
            value={receiptFields.billCopyLabel || ""}
            onChange={(event) => updateReceiptField("billCopyLabel", event.target.value)}
            placeholder="Salinan Pelanggan"
            className="form-input h-8 border-transparent bg-transparent px-0 text-right text-xs font-bold uppercase tracking-wide text-slate-700 shadow-none focus:border-slate-300 focus:bg-white"
            readOnly={readOnly}
          />
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-end">
          <input
            value={receiptFields.billReceiptTitle || ""}
            onChange={(event) => updateReceiptField("billReceiptTitle", event.target.value)}
            placeholder="Official Receipt"
            className="form-input h-12 border-transparent bg-transparent px-0 text-center text-3xl font-extrabold uppercase tracking-[0.12em] text-slate-950 shadow-none focus:border-slate-300 focus:bg-white lg:text-left"
            readOnly={readOnly}
          />
          <div className="px-3 py-2">
            <label className="block text-lg font-bold text-slate-950">
              {t("workspace.payment.manual.receiptNoShort", "No.")}
            </label>
            <input
              value={receiptNo}
              onChange={(event) => setReceiptNo(event.target.value)}
              placeholder="OR-00001"
              className="form-input h-10 border-transparent bg-transparent px-0 text-xl font-extrabold tracking-wide text-red-700 shadow-none focus:border-slate-300 focus:bg-white"
              readOnly={readOnly}
            />
          </div>
        </div>

        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-3">
            <div className="grid grid-cols-[84px_1fr] items-center gap-3">
              <span>{t("workspace.payment.manual.station", "Station")}</span>
              <input
                value={receiptFields.billStation || ""}
                onChange={(event) => updateReceiptField("billStation", event.target.value)}
                placeholder="ALiS"
                className="form-input h-9 border-0 border-b border-dotted border-slate-900 rounded-none px-1 font-bold shadow-none focus:border-slate-900 focus:shadow-none"
                readOnly={readOnly}
              />
            </div>
            <div className="grid grid-cols-[84px_1fr] items-center gap-3">
              <span>{t("workspace.payment.manual.date", "Date")}</span>
              <input
                type="date"
                value={receiptFields.letterDate || fields.letterDate}
                onChange={(event) => updateReceiptField("letterDate", event.target.value)}
                className="form-input h-9 border-0 border-b border-dotted border-slate-900 rounded-none px-1 font-bold shadow-none focus:border-slate-900 focus:shadow-none"
                readOnly={readOnly}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[320px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border border-slate-900 px-2 py-2 text-center">
                    {t("workspace.payment.manual.forCredit", "For Credit")}
                  </th>
                  <th className="border border-slate-900 px-2 py-2 text-center">
                    {t("workspace.payment.manual.amount", "Amount")}<br />RM
                  </th>
                  <th className="border border-slate-900 px-2 py-2 text-center">
                    {t("workspace.payment.manual.sen", "Sen")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {paymentRows.map((row, index) => {
                  const rowAmount = parseCurrencyAmount(row.amount) || 0;
                  const ringgit = Math.floor(rowAmount);
                  const sen = Math.round((rowAmount - ringgit) * 100);

                  return (
                    <tr key={index}>
                      <td className="border border-slate-900 px-2 py-2">
                        <input
                          value={row.label}
                          onChange={(event) => updatePaymentRow(index, "label", event.target.value)}
                          className="form-input h-8 border-transparent bg-transparent px-0 shadow-none focus:border-slate-300 focus:bg-white"
                          readOnly={readOnly}
                        />
                      </td>
                      <td className="border border-slate-900 px-2 py-2 text-right">{ringgit}</td>
                      <td className="border border-slate-900 px-2 py-2 text-right">{String(sen).padStart(2, "0")}</td>
                    </tr>
                  );
                })}
                <tr className="bg-slate-50 font-bold">
                  <td className="border border-slate-900 px-2 py-2 text-right">
                    {t("workspace.payment.manual.totalRm", "Total RM")}
                  </td>
                  <td className="border border-slate-900 px-2 py-2 text-right" colSpan="2">
                    {formatCurrency(totalAmount || amount)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-5 space-y-2">
          <div className="grid grid-cols-[132px_1fr] items-center gap-3">
            <span>{t("workspace.payment.manual.receivedFromLine", "RECEIVED from")}</span>
            <input
              value={receiptFields.billReceivedFrom || ""}
              onChange={(event) => updateReceiptField("billReceivedFrom", event.target.value)}
              placeholder={getBillingRecipientName(app)}
              className="form-input h-9 border-0 border-b border-dotted border-slate-900 rounded-none px-1 font-bold shadow-none focus:border-slate-900 focus:shadow-none"
              readOnly={readOnly}
            />
          </div>
          <div className="grid grid-cols-[132px_1fr] items-center gap-3">
            <span>{t("workspace.payment.manual.sumRinggitLine", "the sum of Ringgit")}</span>
            <input
              value={receiptFields.billAmountText || ""}
              onChange={(event) => updateReceiptField("billAmountText", event.target.value)}
              className="form-input h-9 border-0 border-b border-dotted border-slate-900 rounded-none px-1 font-bold shadow-none focus:border-slate-900 focus:shadow-none"
              readOnly={readOnly}
            />
          </div>
          <div className="grid grid-cols-[132px_1fr] items-center gap-3">
            <span>{t("workspace.payment.manual.andSenLine", "and Sen")}</span>
            <input
              value={receiptFields.billSenText || ""}
              onChange={(event) => updateReceiptField("billSenText", event.target.value)}
              className="form-input h-9 border-0 border-b border-dotted border-slate-900 rounded-none px-1 font-bold shadow-none focus:border-slate-900 focus:shadow-none"
              readOnly={readOnly}
            />
          </div>
          {["billRemarkLine1", "billRemarkLine2", "billRemarkLine3"].map((key) => (
            <input
              key={key}
              value={receiptFields[key] || ""}
              onChange={(event) => updateReceiptField(key, event.target.value)}
              className="form-input h-9 border-0 border-b border-dotted border-slate-900 rounded-none px-1 shadow-none focus:border-slate-900 focus:shadow-none"
              readOnly={readOnly}
            />
          ))}
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-[170px_minmax(0,1fr)_220px] lg:items-end">
          <div>
            <input
              value={receiptFields.billPaymentLine1 || ""}
              onChange={(event) => updateReceiptField("billPaymentLine1", event.target.value)}
              placeholder="Cash"
              className="form-input h-8 border-0 border-b border-dotted border-slate-900 rounded-none px-1 text-center font-bold uppercase shadow-none focus:border-slate-900 focus:shadow-none"
              readOnly={readOnly}
            />
            <input
              value={receiptFields.billPaymentLine2 || ""}
              onChange={(event) => updateReceiptField("billPaymentLine2", event.target.value)}
              placeholder="Cheque No."
              className="form-input h-8 border-0 px-1 text-center font-bold uppercase shadow-none focus:border-slate-300 focus:bg-white"
              readOnly={readOnly}
            />
          </div>
          <textarea
            value={receiptFields.billBankNote || ""}
            onChange={(event) => updateReceiptField("billBankNote", event.target.value)}
            rows="2"
            className="form-input min-h-16 text-center text-xs"
            readOnly={readOnly}
          />
          <input
            value={receiptFields.billSignatureText || ""}
            onChange={(event) => updateReceiptField("billSignatureText", event.target.value)}
            placeholder="b.p. Datuk Bandar"
            className="form-input h-8 border-0 border-b border-dotted border-slate-900 rounded-none px-1 text-center shadow-none focus:border-slate-900 focus:shadow-none"
            readOnly={readOnly}
          />
        </div>
      </div>
    </div>
  );

  const showManualReceiptTab =
    receiptOnly ||
    hasSentManualOfficialReceipt(app);
  const manualDocumentTabs = [
    ...(!receiptOnly
      ? [
          {
            key: "letter",
            label: t("workspace.payment.approvalLetter", "Approval Letter"),
            icon: "description",
          },
          {
            key: "appendix",
            label: t("workspace.payment.manual.appendix", "Appendix"),
            icon: "subject",
          },
          {
            key: "bill",
            label: t("workspace.payment.billDocument", "Bill"),
            icon: "receipt_long",
          },
        ]
      : []),
    ...(showManualReceiptTab
      ? [
          {
            key: "receipt",
            label: t("workspace.payment.manual.officialReceiptTitle", "Official Receipt"),
            icon: "payments",
          },
        ]
      : []),
  ];
  const showManualDocumentTabs = manualDocumentTabs.length > 1;

  return (
    <div className="space-y-3 px-3 py-3">
      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[13px] font-semibold uppercase leading-5 tracking-wide text-slate-500">
              {readOnly
                ? t("workspace.payment.manualReviewSection", "Submitted Manual Documents")
                : t("workspace.payment.manualSection", "Create Manually")}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {receiptOnly
                ? t("workspace.payment.manualReceiptSectionDesc", "Edit the official receipt here before verifying payment and sending it to the applicant.")
                : readOnly
                  ? t("workspace.payment.manualReviewSectionDesc", "Review the submitted approval letter, appendix, and bill.")
                  : t("workspace.payment.manualSectionDesc", "Edit the approval letter, appendix, and bill content here, then save before submitting to KU(IKL).")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!readOnly && (
              <span className="inline-flex min-h-9 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                <Icon name="cloud_done" className="text-[16px]" />
                {t("workspace.payment.manual.autoSaveDraft", "Auto-saves as draft")}
              </span>
            )}
            {!receiptOnly && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  icon="visibility"
                  className="min-h-9 px-3 py-1 text-xs"
                  onClick={() => openManualPaymentDocument(previewApp, "letter", t)}
                >
                  {t("workspace.payment.viewManualLetter", "View Letter")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  icon="visibility"
                  className="min-h-9 px-3 py-1 text-xs"
                  onClick={() => openManualPaymentDocument(previewApp, "bill", t)}
                >
                  {t("workspace.payment.viewManualBill", "View Bill")}
                </Button>
              </>
            )}
            <Button
              type="button"
              variant="secondary"
              icon="visibility"
              className="min-h-9 px-3 py-1 text-xs"
              onClick={() => openManualPaymentDocument(previewApp, "receipt", t)}
            >
              {t("workspace.payment.viewManualReceipt", "View Receipt")}
            </Button>
          </div>
        </div>
      </div>

      {showManualDocumentTabs && (
        <div className="inline-flex w-full flex-wrap gap-1 rounded-md border border-slate-200 bg-slate-50 p-1">
          {manualDocumentTabs.map((tab) => {
            const selected = activeManualDocumentTab === tab.key;

            return (
              <button
                key={tab.key}
                type="button"
                className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded px-3 py-2 text-sm font-semibold transition ${
                  selected
                    ? "bg-emerald-700 text-white shadow-sm"
                    : "bg-transparent text-slate-700 hover:bg-white"
                }`}
                aria-pressed={selected}
                onClick={() => setActiveManualDocumentTab(tab.key)}
              >
                <Icon name={tab.icon} className="text-[18px]" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {activeManualDocumentTab === "letter" && (
      <div className="mx-auto max-w-[940px] rounded-md border border-slate-300 bg-white px-5 py-5">
        <div className="grid gap-4 border-b-2 border-slate-900 pb-3 lg:grid-cols-[120px_minmax(0,1fr)_120px]">
          <div className="flex h-20 items-center justify-center">
            <img
              src={fields.letterDbkuLogoPath || "/logo-dbku.png"}
              alt="DBKU"
              className="max-h-20 max-w-full object-contain"
            />
          </div>
          <label className="inline-flex min-h-8 cursor-pointer items-center justify-center gap-2 self-center rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 lg:col-start-1 lg:row-start-2">
            <Icon name="upload_file" className="text-[15px]" />
            <span>{t("workspace.payment.manual.uploadLogo", "Upload Logo")}</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={readOnly}
              onChange={(event) => {
                handleBillLogoUpload("letterDbkuLogoPath", event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
          <div className="mx-auto w-fit max-w-full text-left">
            <input
              value={fields.letterheadTitle || ""}
              onChange={(event) => updateField("letterheadTitle", event.target.value)}
              className="form-input border-transparent bg-transparent px-0 text-left text-[16px] font-extrabold uppercase leading-4 text-slate-950 shadow-none focus:border-slate-300 focus:bg-white"
              readOnly={readOnly}
            />
            <input
              value={fields.letterheadSubtitle || ""}
              onChange={(event) => updateField("letterheadSubtitle", event.target.value)}
              className="form-input border-transparent bg-transparent px-0 text-left text-xs font-semibold italic leading-4 text-slate-950 shadow-none focus:border-slate-300 focus:bg-white"
              readOnly={readOnly}
            />
            <input
              value={fields.letterheadAddress || ""}
              onChange={(event) => updateField("letterheadAddress", event.target.value)}
              className="form-input border-transparent bg-transparent px-0 text-left text-xs font-bold uppercase leading-4 text-slate-950 shadow-none focus:border-slate-300 focus:bg-white"
              readOnly={readOnly}
            />
            <input
              value={fields.letterheadAddressLine2 || ""}
              onChange={(event) => updateField("letterheadAddressLine2", event.target.value)}
              className="form-input border-transparent bg-transparent px-0 text-left text-xs font-bold uppercase leading-4 text-slate-950 shadow-none focus:border-slate-300 focus:bg-white"
              readOnly={readOnly}
            />
            <input
              value={fields.letterheadPhoneLine || ""}
              onChange={(event) => updateField("letterheadPhoneLine", event.target.value)}
              className="form-input border-transparent bg-transparent px-0 text-left text-xs font-semibold italic leading-4 text-slate-950 shadow-none focus:border-slate-300 focus:bg-white"
              readOnly={readOnly}
            />
            <input
              value={fields.letterheadWebLine || ""}
              onChange={(event) => updateField("letterheadWebLine", event.target.value)}
              className="form-input border-transparent bg-transparent px-0 text-left text-xs font-semibold leading-4 text-slate-950 shadow-none focus:border-slate-300 focus:bg-white"
              readOnly={readOnly}
            />
            <div className="mt-1 flex flex-wrap items-center justify-start gap-x-4 gap-y-1">
              <label className="flex min-w-[180px] items-center gap-1">
                <img src={BOOTSTRAP_AT_ICON_URL} alt="" className="h-4 w-4 object-contain" />
                <input
                  value={fields.letterheadComplaintLine || ""}
                  onChange={(event) => updateField("letterheadComplaintLine", event.target.value)}
                  className="form-input h-6 border-transparent bg-transparent px-0 text-xs font-semibold leading-4 text-slate-950 shadow-none focus:border-slate-300 focus:bg-white"
                  readOnly={readOnly}
                />
              </label>
              <label className="flex min-w-[220px] items-center gap-1">
                <img src={BOOTSTRAP_FACEBOOK_ICON_URL} alt="" className="h-4 w-4 object-contain" />
                <input
                  value={fields.letterheadFacebookLine || ""}
                  onChange={(event) => updateField("letterheadFacebookLine", event.target.value)}
                  className="form-input h-6 border-transparent bg-transparent px-0 text-xs font-semibold leading-4 text-slate-950 shadow-none focus:border-slate-300 focus:bg-white"
                  readOnly={readOnly}
                />
              </label>
            </div>
          </div>
          <div className="flex h-20 items-center justify-center">
            <img
              src={fields.letterAlisLogoPath || "/ALiS.png"}
              alt="ALiS"
              className="max-h-20 max-w-full object-contain"
            />
          </div>
          <label className="inline-flex min-h-8 cursor-pointer items-center justify-center gap-2 self-center rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 lg:col-start-3 lg:row-start-2">
            <Icon name="upload_file" className="text-[15px]" />
            <span>{t("workspace.payment.manual.uploadLogo", "Upload Logo")}</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={readOnly}
              onChange={(event) => {
                handleBillLogoUpload("letterAlisLogoPath", event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <Field label={t("workspace.payment.manual.yourRef", "Your Ref.")}>
            <input
              value={fields.yourRef}
              onChange={(event) => updateField("yourRef", event.target.value)}
              className="form-input"
              readOnly={readOnly}
            />
          </Field>
          <Field label={t("workspace.payment.manual.date", "Date")}>
            <input
              type="date"
              value={fields.letterDate}
              onChange={(event) => updateField("letterDate", event.target.value)}
              className="form-input"
              readOnly={readOnly}
            />
          </Field>
          <Field label={t("workspace.payment.manual.ourRef", "Our Ref.")}>
            <input
              value={fields.ourRef}
              onChange={(event) => updateField("ourRef", event.target.value)}
              className="form-input"
              readOnly={readOnly}
            />
          </Field>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Field label={t("workspace.payment.manual.applicantCompanyName", "Applicant / Company Name")}>
            <input
              value={fields.recipientName}
              onChange={(event) => updateField("recipientName", event.target.value)}
              className="form-input"
              readOnly={readOnly}
            />
          </Field>
          <Field label={t("workspace.payment.manual.applicantAddress", "Applicant Address")}>
            <textarea
              value={fields.recipientAddress}
              onChange={(event) => updateField("recipientAddress", event.target.value)}
              rows="3"
              className="form-input"
              readOnly={readOnly}
            />
          </Field>
        </div>

        <div className="mt-4">
          <Field label={t("workspace.payment.manual.salutation", "Salutation")}>
            <input
              value={fields.salutation || ""}
              onChange={(event) => updateField("salutation", event.target.value)}
              className="form-input"
              readOnly={readOnly}
            />
          </Field>
        </div>

        <div className="mt-4">
          <Field label={t("workspace.payment.letterSubject", "Approval Letter Subject")}>
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              className="form-input font-semibold uppercase"
              readOnly={readOnly}
            />
          </Field>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {[
            ["adType", t("workspace.payment.manual.adType", "Advertisement Type")],
            ["adName", t("workspace.payment.manual.adName", "Advertisement Name")],
            ["applicantName", t("workspace.payment.manual.applicantName", "Applicant Name")],
            ["displayLocation", t("workspace.payment.manual.displayLocation", "Advertisement Display Location")],
          ].map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                value={fields[key] || ""}
                onChange={(event) => updateField(key, event.target.value)}
                className="form-input"
                readOnly={readOnly}
              />
            </Field>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          <Field label={t("workspace.payment.manual.approvalParagraph", "Approval Paragraph")}>
            <textarea
              value={fields.approvalParagraph}
              onChange={(event) => updateField("approvalParagraph", event.target.value)}
              rows="3"
              className="form-input"
              readOnly={readOnly}
            />
          </Field>

          <div className="overflow-x-auto rounded-md border border-slate-300">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="border border-slate-300 px-3 py-2 text-left uppercase">{t("workspace.payment.manual.paymentDetails", "Payment Details")}</th>
                  <th className="border border-slate-300 px-3 py-2 text-left uppercase">{t("workspace.payment.manual.licenseValidityPeriod", "License Validity Period")}</th>
                  <th className="border border-slate-300 px-3 py-2 text-right uppercase">{t("workspace.payment.manual.totalAmountRm", "Total (RM)")}</th>
                </tr>
              </thead>
              <tbody>
                {paymentRows.map((row, index) => (
                  <tr key={index}>
                    <td className="border border-slate-300 px-2 py-2">
                      <input
                        value={row.label}
                        onChange={(event) => updatePaymentRow(index, "label", event.target.value)}
                        className="form-input h-9"
                        readOnly={readOnly}
                      />
                    </td>
                    <td className="border border-slate-300 px-2 py-2">
                      <input
                        value={row.validity}
                        onChange={(event) => updatePaymentRow(index, "validity", event.target.value)}
                        className="form-input h-9"
                        readOnly={readOnly}
                      />
                    </td>
                    <td className="border border-slate-300 px-2 py-2">
                      <input
                        value={row.amount}
                        onChange={(event) => updatePaymentRow(index, "amount", event.target.value)}
                        onBlur={() => normalizePaymentRowAmount(index)}
                        className="form-input h-9 text-right"
                        readOnly={readOnly}
                      />
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-bold">
                  <td className="border border-slate-300 px-3 py-2 text-right" colSpan="2">
                    {t("workspace.payment.manual.grandTotal", "Grand Total")}
                  </td>
                  <td className="border border-slate-300 px-3 py-2 text-right">
                    {formatCurrency(totalAmount || amount)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <Field label={t("workspace.payment.manual.attachmentParagraph", "Attachment / Conditions Paragraph")}>
            <textarea
              value={fields.attachmentParagraph}
              onChange={(event) => updateField("attachmentParagraph", event.target.value)}
              rows="2"
              className="form-input"
              readOnly={readOnly}
            />
          </Field>

          <Field label={t("workspace.payment.manual.contactInfo", "Contact Information")}>
            <textarea
              value={fields.contactParagraph}
              onChange={(event) => updateField("contactParagraph", event.target.value)}
              rows="2"
              className="form-input"
              readOnly={readOnly}
            />
          </Field>

          <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              {t("workspace.payment.manual.closingSignature", "Letter Closing / Signature")}
            </p>
            <div className="grid gap-3 lg:grid-cols-2">
              <Field label={t("workspace.payment.manual.closingText", "Closing Text")}>
                <input
                  value={fields.closingText || ""}
                  onChange={(event) => updateField("closingText", event.target.value)}
                  className="form-input"
                  readOnly={readOnly}
                />
              </Field>
              <Field label={t("workspace.payment.manual.mottoLine1", "Motto Line 1")}>
                <input
                  value={fields.mottoLine1 || ""}
                  onChange={(event) => updateField("mottoLine1", event.target.value)}
                  className="form-input"
                  readOnly={readOnly}
                />
              </Field>
              <Field label={t("workspace.payment.manual.mottoLine2", "Motto Line 2")}>
                <input
                  value={fields.mottoLine2 || ""}
                  onChange={(event) => updateField("mottoLine2", event.target.value)}
                  className="form-input"
                  readOnly={readOnly}
                />
              </Field>
              <Field label={t("workspace.payment.manual.signatoryTitle", "Signatory Title")}>
                <input
                  value={fields.signatoryTitle || ""}
                  onChange={(event) => updateField("signatoryTitle", event.target.value)}
                  className="form-input"
                  readOnly={readOnly}
                />
              </Field>
              <Field label={t("workspace.payment.manual.department", "Department")}>
                <input
                  value={fields.signatoryDepartment || ""}
                  onChange={(event) => updateField("signatoryDepartment", event.target.value)}
                  className="form-input"
                  readOnly={readOnly}
                />
              </Field>
              <Field label={t("workspace.payment.manual.signingAuthority", "Signing Authority")}>
                <input
                  value={fields.signatoryAuthority || ""}
                  onChange={(event) => updateField("signatoryAuthority", event.target.value)}
                  className="form-input"
                  readOnly={readOnly}
                />
              </Field>
            </div>
            <div className="mt-3">
              <Field label={t("workspace.payment.manual.letterFooter", "Letter Footer")}>
                <textarea
                  value={fields.footerText || ""}
                  onChange={(event) => updateField("footerText", event.target.value)}
                  rows="2"
                  className="form-input"
                  readOnly={readOnly}
                />
              </Field>
            </div>
          </div>
        </div>
      </div>
      )}

      {activeManualDocumentTab === "appendix" && (
      <div className="rounded-md border border-slate-200 bg-white px-4 py-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase text-slate-950">
              {t("workspace.payment.manual.appendix", "Appendix")}
            </p>
            <p className="text-sm text-slate-500">
              {t("workspace.payment.manual.appendixDesc", "License conditions that will be shown on the appendix page.")}
            </p>
          </div>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-4">
          <input
            value={fields.appendixLabel || ""}
            onChange={(event) => updateField("appendixLabel", event.target.value)}
            className="form-input border-transparent bg-transparent px-0 text-right text-base font-semibold text-slate-950 shadow-none focus:border-slate-300 focus:bg-white"
            readOnly={readOnly}
          />
          <input
            value={fields.appendixTitle || ""}
            onChange={(event) => updateField("appendixTitle", event.target.value)}
            className="form-input mt-8 border-transparent bg-transparent px-0 text-center text-sm font-bold uppercase text-slate-950 shadow-none focus:border-slate-300 focus:bg-white"
            readOnly={readOnly}
          />
          <div className="mt-6">
            <SimpleWysiwygEditor
              key={`manual-payment-terms-${app?.id || "new"}-${app?.updated_at || ""}`}
              label={t("workspace.payment.manual.appendixContent", "Appendix Content")}
              value={terms}
              onChange={setTerms}
              max={6000}
              readOnly={readOnly}
            />
          </div>
        </div>
      </div>
      )}

      {activeManualDocumentTab === "bill" && billReceiptSection}
      {activeManualDocumentTab === "receipt" && officialReceiptSection}
    </div>
  );
}

function ManualPaymentDocumentsSummary({ app, t, hint = "" }) {
  const previewApp = useMemo(() => getManualPaymentPreviewApp(app), [app]);
  const documents = [
    {
      key: "letter",
      label: t("workspace.payment.approvalLetter", "Approval Letter"),
      buttonLabel: t("common.view", "View"),
      onClick: () => openManualPaymentDocument(previewApp, "letter", t),
    },
    {
      key: "bill",
      label: t("workspace.payment.billDocument", "Bill"),
      buttonLabel: t("common.view", "View"),
      onClick: () => openManualPaymentDocument(previewApp, "bill", t),
    },
    ...(hasSentManualOfficialReceipt(app)
      ? [
          {
            key: "receipt",
            label: t("workspace.payment.manual.officialReceiptTitle", "Official Receipt"),
            buttonLabel: t("common.view", "View"),
            onClick: () => openManualPaymentDocument(previewApp, "receipt", t),
          },
        ]
      : []),
  ];

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 xl:col-span-2">
      <div className="mb-3">
        <p className="text-[13px] font-semibold uppercase leading-5 tracking-wide text-slate-500">
          {t("workspace.payment.reviewDocuments", "Documents")}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          {hint || t("workspace.payment.manualConfirmHint", "KU(IKL) can review the documents, then confirm using the action button.")}
        </p>
      </div>

      <div className="space-y-2">
        {documents.map((document) => (
          <div
            key={document.key}
            className="flex flex-col gap-3 rounded-md border border-slate-200 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                {document.label}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              icon="visibility"
              className="min-h-9 px-3 py-1 text-xs sm:w-auto"
              onClick={document.onClick}
            >
              {document.buttonLabel}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
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

function getPaymentDocumentSource(file) {
  return (
    file?.dataUrl ||
    file?.url ||
    file?.file_url ||
    file?.file ||
    ""
  );
}

function getPaymentDocumentFieldName(kind) {
  if (kind === "bill") return "bill_file";
  if (kind === "official_receipt") return "official_receipt_file";
  return "letter_file";
}

async function openPaymentDocument(file, t) {
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
  } catch (error) {
    console.error("Failed to open payment document:", error);
    window.alert(t("workspace.payment.documentViewFailed", "Unable to open the document. Please try again."));
  }
}

function hasPaymentDocuments(app) {
  const approvalLetter = app?.form_data?.approval_letter || {};
  return Boolean(
    (
      getPaymentDocumentSource(approvalLetter.letter_file) &&
      getPaymentDocumentSource(approvalLetter.bill_file)
    ) ||
    hasManualPaymentDocuments(app)
  );
}

function hasManualPaymentDocuments(app) {
  const approvalLetter = app?.form_data?.approval_letter || {};
  return Boolean(
    approvalLetter.manual_letter?.saved_at &&
    approvalLetter.manual_bill?.saved_at
  );
}

function hasSentManualOfficialReceipt(app) {
  const manualReceipt = app?.form_data?.approval_letter?.manual_receipt || {};
  return Boolean(
    manualReceipt.sent_at ||
    manualReceipt.status === "Sent to Applicant" ||
    (normalizeStatus(app?.status) === "payment_verified" && manualReceipt.saved_at)
  );
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

function buildManualPaymentApprovalLetter(
  savedApprovalLetter = {},
  data,
  userDepartment,
  timestamp,
  { submitted = false } = {}
) {
  const savedManualLetter = savedApprovalLetter.manual_letter || {};
  const savedManualBill = savedApprovalLetter.manual_bill || {};
  const savedManualReceipt = savedApprovalLetter.manual_receipt || {};
  const savedAt = submitted ? timestamp : savedManualLetter.saved_at || timestamp;
  const billSavedAt = submitted ? timestamp : savedManualBill.saved_at || timestamp;
  const receiptSavedAt = savedManualReceipt.saved_at || timestamp;
  const receiptNo = data.receiptNo || savedManualReceipt.receipt_no || savedManualReceipt.invoice_no || data.invoiceNo;

  return {
    ...savedApprovalLetter,
    creation_mode: "manual",
    status: submitted
      ? "Ready for KU(IKL) Confirmation"
      : savedApprovalLetter.status || "Ready for KU(IKL) Confirmation",
    manual_letter: {
      ...savedManualLetter,
      fields: data.fields,
      subject: data.subject,
      body: data.letterBody,
      terms: data.terms,
      saved_by: submitted ? userDepartment : savedManualLetter.saved_by,
      saved_at: savedAt,
      draft_saved_by: userDepartment,
      draft_saved_at: timestamp,
    },
    manual_bill: {
      ...savedManualBill,
      invoice_no: data.invoiceNo,
      amount: data.amount,
      rows: data.paymentRows,
      notes: data.billNotes,
      saved_by: submitted ? userDepartment : savedManualBill.saved_by,
      saved_at: billSavedAt,
      draft_saved_by: userDepartment,
      draft_saved_at: timestamp,
    },
    manual_receipt: {
      ...savedManualReceipt,
      receipt_no: receiptNo,
      invoice_no: receiptNo,
      amount: data.amount,
      rows: data.paymentRows,
      notes: buildManualBillNotes({
        invoiceNo: receiptNo,
        paymentRows: data.paymentRows,
      }),
      fields: data.receiptFields || savedManualReceipt.fields,
      saved_by: savedManualReceipt.saved_by || userDepartment,
      saved_at: receiptSavedAt,
      draft_saved_by: userDepartment,
      draft_saved_at: timestamp,
    },
    ...(submitted
      ? {
          uploaded_by: userDepartment,
          uploaded_at: timestamp,
        }
      : {}),
  };
}

function buildManualOfficialReceiptForSending(app, userDepartment) {
  const approvalLetter = app?.form_data?.approval_letter || {};
  const manualLetter = approvalLetter.manual_letter || {};
  const manualBill = approvalLetter.manual_bill || {};
  const manualReceipt = approvalLetter.manual_receipt || {};
  const defaultDraft = getDefaultManualPaymentDraft(app);
  const rows = normalizePaymentRows(
    manualReceipt.rows?.length
      ? manualReceipt.rows
      : manualBill.rows?.length
        ? manualBill.rows
        : defaultDraft.paymentRows
  );
  const receiptNo =
    manualReceipt.receipt_no ||
    manualReceipt.invoice_no ||
    manualBill.invoice_no ||
    getInvoiceNo(app);
  const amount = rows.reduce(
    (sum, row) => sum + (parseCurrencyAmount(row.amount) || 0),
    0
  ) || parseCurrencyAmount(getBillAmount(app)) || 0;
  const sentAt = new Date().toISOString();

  return {
    ...manualReceipt,
    receipt_no: receiptNo,
    invoice_no: receiptNo,
    amount,
    rows,
    notes: buildManualBillNotes({
      invoiceNo: receiptNo,
      paymentRows: rows,
    }),
    fields: getManualPaymentFields(
      app,
      manualReceipt.fields || manualLetter.fields,
      { preserveReceiptFields: true }
    ),
    status: "Sent to Applicant",
    saved_by: manualReceipt.saved_by || userDepartment,
    saved_at: manualReceipt.saved_at || sentAt,
    sent_by: userDepartment,
    sent_at: sentAt,
  };
}

function buildOfficialReceiptApprovalLetterForSending(app, userDepartment, mode) {
  const approvalLetter = app?.form_data?.approval_letter || {};
  const officialReceiptFile = approvalLetter.official_receipt_file || null;
  const sentAt = new Date().toISOString();

  if (mode === "upload" && getPaymentDocumentSource(officialReceiptFile)) {
    return {
      ...approvalLetter,
      official_receipt_mode: "upload",
      official_receipt_file: {
        ...officialReceiptFile,
        status: "Sent to Applicant",
        sent_by: userDepartment,
        sent_at: sentAt,
      },
    };
  }

  return {
    ...approvalLetter,
    official_receipt_mode: "manual",
    manual_receipt: buildManualOfficialReceiptForSending(app, userDepartment),
  };
}

const MANUAL_PAYMENT_DRAFT_STORAGE_PREFIX = "fastrack_manual_payment_draft:";
const MANUAL_PAYMENT_FORM_STATE_CACHE = new Map();
const MANUAL_PAYMENT_FORM_STATE_CACHE_LIMIT = 12;
const LOCAL_PAYMENT_DOCUMENT_PREVIEW_URLS = new Map();
const LOCAL_PAYMENT_DOCUMENT_PREVIEW_LIMIT = 24;

function getLocalPaymentDocumentPreviewKey(applicationId, kind, file = {}) {
  return [
    applicationId || "",
    kind || "",
    file.document_id || file.id || file.name || "",
  ].join("|");
}

function rememberLocalPaymentDocumentPreview(applicationId, kind, file, objectUrl) {
  if (!objectUrl) return;

  const cacheKey = getLocalPaymentDocumentPreviewKey(applicationId, kind, file);
  const existingUrl = LOCAL_PAYMENT_DOCUMENT_PREVIEW_URLS.get(cacheKey);

  if (existingUrl && existingUrl !== objectUrl) {
    URL.revokeObjectURL(existingUrl);
  }

  LOCAL_PAYMENT_DOCUMENT_PREVIEW_URLS.set(cacheKey, objectUrl);

  while (LOCAL_PAYMENT_DOCUMENT_PREVIEW_URLS.size > LOCAL_PAYMENT_DOCUMENT_PREVIEW_LIMIT) {
    const oldestKey = LOCAL_PAYMENT_DOCUMENT_PREVIEW_URLS.keys().next().value;
    const oldestUrl = LOCAL_PAYMENT_DOCUMENT_PREVIEW_URLS.get(oldestKey);
    if (oldestUrl) URL.revokeObjectURL(oldestUrl);
    LOCAL_PAYMENT_DOCUMENT_PREVIEW_URLS.delete(oldestKey);
  }
}

function forgetLocalPaymentDocumentPreview(applicationId, kind, file = {}) {
  const cacheKey = getLocalPaymentDocumentPreviewKey(applicationId, kind, file);
  const existingUrl = LOCAL_PAYMENT_DOCUMENT_PREVIEW_URLS.get(cacheKey);

  if (existingUrl) URL.revokeObjectURL(existingUrl);
  LOCAL_PAYMENT_DOCUMENT_PREVIEW_URLS.delete(cacheKey);
}

function withLocalPaymentDocumentPreview(applicationId, kind, uploaded, file) {
  if (!file || typeof URL === "undefined") return uploaded;

  const objectUrl = URL.createObjectURL(file);
  rememberLocalPaymentDocumentPreview(applicationId, kind, uploaded, objectUrl);

  return {
    ...uploaded,
    dataUrl: objectUrl,
  };
}

function stripLocalPaymentDocumentPreview(file = {}) {
  const { dataUrl, ...rest } = file;
  return rest;
}

function mergeLocalPaymentDocumentPreview(app, fieldName, file) {
  if (!app || !fieldName || !file?.dataUrl) return app;

  const approvalLetter = app.form_data?.approval_letter || {};

  return {
    ...app,
    form_data: {
      ...(app.form_data || {}),
      approval_letter: {
        ...approvalLetter,
        [fieldName]: {
          ...(approvalLetter[fieldName] || {}),
          ...file,
        },
      },
    },
  };
}

function getManualPaymentDraftStorageKey(applicationId) {
  return `${MANUAL_PAYMENT_DRAFT_STORAGE_PREFIX}${applicationId}`;
}

function getStoredManualPaymentDraft(applicationId) {
  if (!applicationId || typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(getManualPaymentDraftStorageKey(applicationId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeManualPaymentDraft(applicationId, draft) {
  if (!applicationId || typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      getManualPaymentDraftStorageKey(applicationId),
      JSON.stringify(draft)
    );
  } catch {
    // Local storage can be unavailable in private browsing or full-disk scenarios.
  }
}

function removeStoredManualPaymentDraft(applicationId) {
  if (!applicationId || typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(getManualPaymentDraftStorageKey(applicationId));
  } catch {
    // Ignore storage cleanup failures.
  }
}

function getManualPaymentBackendSavedAt(app) {
  const approvalLetter = app?.form_data?.approval_letter || {};
  const manualLetter = approvalLetter.manual_letter || {};
  const manualBill = approvalLetter.manual_bill || {};
  const manualReceipt = approvalLetter.manual_receipt || {};
  const timestamps = [
    manualLetter.draft_saved_at,
    manualLetter.saved_at,
    manualBill.draft_saved_at,
    manualBill.saved_at,
    manualReceipt.draft_saved_at,
    manualReceipt.saved_at,
    manualReceipt.sent_at,
    approvalLetter.uploaded_at,
  ]
    .map((value) => Date.parse(value || ""))
    .filter(Number.isFinite);

  return timestamps.length > 0 ? Math.max(...timestamps) : 0;
}

function getInitialManualPaymentDraft(app) {
  const storedDraft = getStoredManualPaymentDraft(app?.id);
  if (!storedDraft?.draftSavedAt) return null;

  const storedTime = Date.parse(storedDraft.draftSavedAt);
  if (!Number.isFinite(storedTime)) return null;

  return storedTime > getManualPaymentBackendSavedAt(app) ? storedDraft : null;
}

function getManualPaymentFormStateCacheKey(app, storedDraft) {
  return [
    app?.id || "new",
    app?.updated_at || "",
    getManualPaymentBackendSavedAt(app),
    storedDraft?.draftSavedAt || "",
  ].join("|");
}

function rememberManualPaymentFormState(cacheKey, state) {
  if (MANUAL_PAYMENT_FORM_STATE_CACHE.has(cacheKey)) {
    MANUAL_PAYMENT_FORM_STATE_CACHE.delete(cacheKey);
  }

  MANUAL_PAYMENT_FORM_STATE_CACHE.set(cacheKey, state);

  while (MANUAL_PAYMENT_FORM_STATE_CACHE.size > MANUAL_PAYMENT_FORM_STATE_CACHE_LIMIT) {
    const oldestKey = MANUAL_PAYMENT_FORM_STATE_CACHE.keys().next().value;
    MANUAL_PAYMENT_FORM_STATE_CACHE.delete(oldestKey);
  }
}

function getCachedManualPaymentFormState(app) {
  const manualLetter = app?.form_data?.approval_letter?.manual_letter || {};
  const manualBill = app?.form_data?.approval_letter?.manual_bill || {};
  const manualReceipt = app?.form_data?.approval_letter?.manual_receipt || {};
  const storedDraft = getInitialManualPaymentDraft(app);
  const cacheKey = getManualPaymentFormStateCacheKey(app, storedDraft);
  const cachedState = MANUAL_PAYMENT_FORM_STATE_CACHE.get(cacheKey);

  if (cachedState) return cachedState;

  const defaultDraft = getDefaultManualPaymentDraft(app);
  const savedFields = getManualPaymentFields(app, manualLetter.fields);
  const savedReceiptFields = getManualPaymentFields(
    app,
    manualReceipt.fields || manualLetter.fields,
    { preserveReceiptFields: true }
  );
  const state = {
    subject: storedDraft?.subject || manualLetter.subject || defaultDraft.subject,
    fields: storedDraft?.fields
      ? getManualPaymentFields(app, storedDraft.fields)
      : savedFields,
    receiptFields: storedDraft?.receiptFields
      ? getManualPaymentFields(app, storedDraft.receiptFields, { preserveReceiptFields: true })
      : savedReceiptFields,
    paymentRows: normalizePaymentRows(
      storedDraft?.paymentRows?.length
        ? storedDraft.paymentRows
        : manualReceipt.rows?.length
          ? manualReceipt.rows
          : manualBill.rows?.length
          ? manualBill.rows
          : defaultDraft.paymentRows
    ),
    terms: normalizeManualRichTextValue(
      storedDraft?.terms || manualLetter.terms || defaultDraft.terms
    ),
    invoiceNo: storedDraft?.invoiceNo || manualBill.invoice_no || getInvoiceNo(app),
    receiptNo:
      storedDraft?.receiptNo ||
      manualReceipt.receipt_no ||
      manualReceipt.invoice_no ||
      manualBill.invoice_no ||
      getInvoiceNo(app),
  };

  rememberManualPaymentFormState(cacheKey, state);
  return state;
}

function getManualPaymentPreviewApp(app) {
  const initialState = getCachedManualPaymentFormState(app);
  const amount = getBillAmount(app);
  const totalAmount = initialState.paymentRows.reduce(
    (sum, row) => sum + (parseCurrencyAmount(row.amount) || 0),
    0
  );

  return buildManualPaymentPreviewApp(app, {
    fields: initialState.fields,
    receiptFields: initialState.receiptFields,
    subject: initialState.subject,
    paymentRows: initialState.paymentRows,
    terms: initialState.terms,
    invoiceNo: initialState.invoiceNo,
    receiptNo: initialState.receiptNo,
    amount: totalAmount || amount,
  });
}

function formatPaymentRowAmount(value) {
  const amount = parseCurrencyAmount(value);
  return Number.isFinite(amount) ? amount.toFixed(2) : "";
}

const MALAY_NUMBER_WORDS = [
  "Kosong",
  "Satu",
  "Dua",
  "Tiga",
  "Empat",
  "Lima",
  "Enam",
  "Tujuh",
  "Lapan",
  "Sembilan",
];

function numberToMalayWords(value) {
  const number = Math.floor(Number(value) || 0);
  if (number < 10) return MALAY_NUMBER_WORDS[number];
  if (number === 10) return "Sepuluh";
  if (number === 11) return "Sebelas";
  if (number < 20) return `${numberToMalayWords(number - 10)} Belas`;
  if (number < 100) {
    const tens = Math.floor(number / 10);
    const remainder = number % 10;
    return `${numberToMalayWords(tens)} Puluh${remainder ? ` ${numberToMalayWords(remainder)}` : ""}`;
  }
  if (number === 100) return "Seratus";
  if (number < 200) return `Seratus ${numberToMalayWords(number - 100)}`;
  if (number < 1000) {
    const hundreds = Math.floor(number / 100);
    const remainder = number % 100;
    return `${numberToMalayWords(hundreds)} Ratus${remainder ? ` ${numberToMalayWords(remainder)}` : ""}`;
  }
  if (number === 1000) return "Seribu";
  if (number < 2000) return `Seribu ${numberToMalayWords(number - 1000)}`;
  if (number < 1000000) {
    const thousands = Math.floor(number / 1000);
    const remainder = number % 1000;
    return `${numberToMalayWords(thousands)} Ribu${remainder ? ` ${numberToMalayWords(remainder)}` : ""}`;
  }
  if (number < 1000000000) {
    const millions = Math.floor(number / 1000000);
    const remainder = number % 1000000;
    return `${numberToMalayWords(millions)} Juta${remainder ? ` ${numberToMalayWords(remainder)}` : ""}`;
  }

  const billions = Math.floor(number / 1000000000);
  const remainder = number % 1000000000;
  return `${numberToMalayWords(billions)} Bilion${remainder ? ` ${numberToMalayWords(remainder)}` : ""}`;
}

function getCurrencyAmountWords(value) {
  const amount = parseCurrencyAmount(value);
  const safeAmount = Number.isFinite(amount) ? Math.max(amount, 0) : 0;
  const cents = Math.round(safeAmount * 100);
  const ringgit = Math.floor(cents / 100);
  const sen = cents % 100;

  return {
    ringgit: numberToMalayWords(ringgit),
    sen: numberToMalayWords(sen),
  };
}

function normalizePaymentRows(rows = []) {
  return rows.map((row) => ({
    ...row,
    amount: formatPaymentRowAmount(row.amount),
  }));
}

function hasHtmlMarkup(value) {
  return /<\/?[a-z][\s\S]*>/i.test(String(value || ""));
}

function plainTextToHtml(value) {
  const text = String(value || "").replace(/\r\n/g, "\n").trim();
  if (!text) return "";

  return text
    .split(/\n{2,}/)
    .map((block) =>
      `<p>${escapeHtml(block.trim()).replace(/\n/g, "<br />")}</p>`
    )
    .join("");
}

function normalizeManualRichTextValue(value) {
  const source = String(value || "").trim();
  if (!source) return "";
  if (source === MANUAL_DEFAULT_TERMS_TEXT.trim() || isLegacyManualTermsHtml(source)) {
    return MANUAL_DEFAULT_TERMS_HTML;
  }

  return hasHtmlMarkup(source) ? source : plainTextToHtml(source);
}

function normalizeHtmlForComparison(value) {
  return String(value || "").replace(/\s+/g, "").toLowerCase();
}

function isLegacyManualTermsHtml(value) {
  const normalized = normalizeHtmlForComparison(value);
  return [
    MANUAL_LEGACY_TERMS_HTML_WITH_START,
    MANUAL_LEGACY_TERMS_HTML_WITHOUT_START,
  ].some((html) => normalizeHtmlForComparison(html) === normalized);
}

function getSafeManualRichTextHtml(value) {
  const html = normalizeManualRichTextValue(value);
  if (!html) return "";

  return sanitizeMemoHtml(html) || plainTextToHtml(html);
}

const MANUAL_ATTACHMENT_PARAGRAPH =
  "3.         Dilampirkan bersama ini syarat-syarat lesen yang mesti dipatuhi. Sebarang pelanggaran syarat lesen boleh menyebabkan lesen puan/tuan ditarik balik.";
const MANUAL_APPENDIX_LABEL = "Lampiran";
const MANUAL_APPENDIX_TITLE =
  "Syarat-Syarat Lesen Iklan Dalam Kawasan Dewan Bandaraya Kuching Utara (DBKU)";
const MANUAL_CONTACT_PARAGRAPH =
  "4.         Sekiranya pihak puan/tuan memerlukan keterangan lanjut, sila hubungi Cik Dayang Amirah Farzana/Puan Phyrra Lily di talian 082-512955";
const MANUAL_FOOTER_TEXT =
  "\"UNTUK MEMPERTINGKAT KUALITI KEHIDUPAN DENGAN MEWUJUDKAN PERSEKITARAN KONDUSIF,\nPENGLIBATAN WARGA KOTA DAN PENYAMPAIAN PERKHIDMATAN TERUNGGUL\"";
const MANUAL_LETTERHEAD_TITLE = "Dewan Bandaraya Kuching Utara";
const MANUAL_LETTERHEAD_SUBTITLE = "Commission of the City of Kuching North";
const MANUAL_LETTERHEAD_ADDRESS =
  "Bukit Siol, Jalan Semariang, Petra Jaya,";
const MANUAL_LETTERHEAD_ADDRESS_LINE_2 = "93050 Kuching, Sarawak.";
const MANUAL_LETTERHEAD_PHONE_LINE =
  "Tel : 082-512200/512201    Hotline : 082-446644    Faks : 082-446414";
const MANUAL_LETTERHEAD_WEB_LINE =
  "Laman Web: dbku.sarawak.gov.my    E-mel : prd@dbku.gov.my";
const MANUAL_LETTERHEAD_COMPLAINT_LINE = "aduandbku@dbku.gov.my";
const MANUAL_LETTERHEAD_FACEBOOK_LINE = "f : Dewan Bandaraya Kuching Utara";
const BOOTSTRAP_AT_ICON_URL =
  "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.13.1/icons/at.svg";
const BOOTSTRAP_FACEBOOK_ICON_URL =
  "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.13.1/icons/facebook.svg";
const MANUAL_DEFAULT_TERMS_TEXT = [
  "1. TEMPOH KELULUSAN",
  "1.1 Tempoh kelulusan adalah tertakluk kepada tempoh lesen yang diluluskan oleh DBKU.",
  "1.2 Pemohon hendaklah memastikan iklan berkaitan ditanggalkan selepas tamat tempoh kelulusan.",
  "1.3 Pemohon boleh memohon untuk melanjutkan tempoh berkaitan melalui surat sekurang-kurangnya tiga (3) bulan sebelum tarikh luput kelulusan.",
  "",
  "2. PEMBINAAN DAN PENYELENGGARAAN",
  "2.1 Pemohon hendaklah menjaga aspek keselamatan dan mengambil polisi insurans perlindungan awam sebelum kerja dijalankan.",
  "2.2 Kerja-kerja pembinaan hendaklah mendapat permit daripada DBKU sekiranya berkaitan.",
  "2.3 Pemohon hendaklah memastikan tidak berlaku kesesakan lalu lintas dan gangguan ketenteraman awam.",
  "2.4 Pemohon hendaklah memelihara kebersihan kawasan semasa dan selepas kerja dijalankan.",
  "2.5 Bahan yang digunakan hendaklah tahan lama dan berkualiti.",
  "2.6 Pemohon hendaklah menjalankan pemeriksaan dan penyelenggaraan dari masa ke semasa sepanjang tempoh kelulusan.",
].join("\n");
const MANUAL_DEFAULT_TERMS_HTML = [
  "<ol>",
  "<li><strong>TEMPOH KELULUSAN</strong><br />",
  "1.1 Tempoh kelulusan adalah tertakluk kepada tempoh lesen yang diluluskan oleh DBKU.<br />",
  "1.2 Pemohon hendaklah memastikan iklan berkaitan ditanggalkan selepas tamat tempoh kelulusan.<br />",
  "1.3 Pemohon boleh memohon untuk melanjutkan tempoh berkaitan melalui surat sekurang-kurangnya tiga (3) bulan sebelum tarikh luput kelulusan.",
  "</li>",
  '<li style="margin-top:24px;"><strong>PEMBINAAN DAN PENYELENGGARAAN</strong><br />',
  "2.1 Pemohon hendaklah menjaga aspek keselamatan dan mengambil polisi insurans perlindungan awam sebelum kerja dijalankan.<br />",
  "2.2 Kerja-kerja pembinaan hendaklah mendapat permit daripada DBKU sekiranya berkaitan.<br />",
  "2.3 Pemohon hendaklah memastikan tidak berlaku kesesakan lalu lintas dan gangguan ketenteraman awam.<br />",
  "2.4 Pemohon hendaklah memelihara kebersihan kawasan semasa dan selepas kerja dijalankan.<br />",
  "2.5 Bahan yang digunakan hendaklah tahan lama dan berkualiti.<br />",
  "2.6 Pemohon hendaklah menjalankan pemeriksaan dan penyelenggaraan dari masa ke semasa sepanjang tempoh kelulusan.",
  "</li>",
  "</ol>",
].join("");
const MANUAL_LEGACY_TERMS_HTML_WITH_START = [
  "<ol>",
  "<li><strong>TEMPOH KELULUSAN</strong><br />",
  "1.1 Tempoh kelulusan adalah tertakluk kepada tempoh lesen yang diluluskan oleh DBKU.<br />",
  "1.2 Pemohon hendaklah memastikan iklan berkaitan ditanggalkan selepas tamat tempoh kelulusan.<br />",
  "1.3 Pemohon boleh memohon untuk melanjutkan tempoh berkaitan melalui surat sekurang-kurangnya tiga (3) bulan sebelum tarikh luput kelulusan.",
  "</li>",
  "</ol>",
  "<p>&nbsp;</p>",
  '<ol start="2">',
  "<li><strong>PEMBINAAN DAN PENYELENGGARAAN</strong><br />",
  "2.1 Pemohon hendaklah menjaga aspek keselamatan dan mengambil polisi insurans perlindungan awam sebelum kerja dijalankan.<br />",
  "2.2 Kerja-kerja pembinaan hendaklah mendapat permit daripada DBKU sekiranya berkaitan.<br />",
  "2.3 Pemohon hendaklah memastikan tidak berlaku kesesakan lalu lintas dan gangguan ketenteraman awam.<br />",
  "2.4 Pemohon hendaklah memelihara kebersihan kawasan semasa dan selepas kerja dijalankan.<br />",
  "2.5 Bahan yang digunakan hendaklah tahan lama dan berkualiti.<br />",
  "2.6 Pemohon hendaklah menjalankan pemeriksaan dan penyelenggaraan dari masa ke semasa sepanjang tempoh kelulusan.",
  "</li>",
  "</ol>",
].join("");
const MANUAL_LEGACY_TERMS_HTML_WITHOUT_START = MANUAL_LEGACY_TERMS_HTML_WITH_START.replace(
  '<ol start="2">',
  "<ol>"
);

function getDefaultManualPaymentDraft(app) {
  const amount = getBillAmount(app);
  const amountWords = getCurrencyAmountWords(amount);
  const applicationType = getApplicationType(app);
  const paymentRows = getPaymentBillRows(app).map((row) => ({
    label: row.label,
    validity: row.validity || getApprovalValidityText(app),
    amount: formatPaymentRowAmount(row.amount),
  }));

  return {
    subject: "PERMOHONAN LESEN TANDANAMA PERNIAGAAN/IKLAN",
    fields: {
      yourRef: "",
      ourRef: `DBKU/LES/IKL/${getApplicationReference(app)}`,
      letterDate: new Date().toISOString().slice(0, 10),
      recipientName: getBillingRecipientName(app),
      recipientAddress: getApplicantPostalAddress(app),
      salutation: "Puan/Tuan,",
      adType: applicationType,
      adName: getProjectName(app),
      applicantName: getApplicantName(app),
      displayLocation: getApplicationLocation(app),
      approvalParagraph:
        "Sukacita dimaklumkan bahawa permohonan puan/tuan untuk perkara di atas telah diluluskan. Sila buat pembayaran seperti di bawah di Kaunter Bahagian Pelesenan, Aras 1, DBKU dalam tempoh empat belas (14) hari bekerja dari tarikh surat ini diterima.",
      attachmentParagraph: MANUAL_ATTACHMENT_PARAGRAPH,
      contactParagraph: MANUAL_CONTACT_PARAGRAPH,
      closingText: "Sekian, terima kasih.",
      mottoLine1: "\"AN HONOUR TO SERVE\"",
      mottoLine2: "\"TOGETHER WE CARE\"",
      signatoryTitle: "(KETUA BAHAGIAN)",
      signatoryDepartment: "Bahagian Pelesenan",
      signatoryAuthority: "b.p. Pengarah, Dewan Bandaraya Kuching Utara",
      footerText: MANUAL_FOOTER_TEXT,
      letterheadTitle: MANUAL_LETTERHEAD_TITLE,
      letterheadSubtitle: MANUAL_LETTERHEAD_SUBTITLE,
      letterheadAddress: MANUAL_LETTERHEAD_ADDRESS,
      letterheadAddressLine2: MANUAL_LETTERHEAD_ADDRESS_LINE_2,
      letterheadPhoneLine: MANUAL_LETTERHEAD_PHONE_LINE,
      letterheadWebLine: MANUAL_LETTERHEAD_WEB_LINE,
      letterheadComplaintLine: MANUAL_LETTERHEAD_COMPLAINT_LINE,
      letterheadFacebookLine: MANUAL_LETTERHEAD_FACEBOOK_LINE,
      letterDbkuLogoPath: "/logo-dbku.png",
      letterAlisLogoPath: "/ALiS.png",
      billDbkuLogoPath: "/logo-dbku.png",
      billAlisLogoPath: "/ALiS.png",
      billFooterNote:
        "This bill is computer generated for payment processing and is not an official receipt.",
      appendixLabel: MANUAL_APPENDIX_LABEL,
      appendixTitle: MANUAL_APPENDIX_TITLE,
      billCopyLabel: "Salinan Pelanggan",
      billReceiptTitle: "Bil Bayaran",
      billStation: "ALiS",
      billReceivedFrom: getBillingRecipientName(app),
      billAmountText: amountWords.ringgit,
      billSenText: amountWords.sen,
      billPaymentLine1: "Sila jelaskan bayaran di Kaunter Bahagian Pelesenan, Aras 1, DBKU.",
      billPaymentLine2: "Bayaran hendaklah dibuat dalam tempoh empat belas (14) hari bekerja.",
      billBankNote: "",
      billSignatureText: "b.p. Datuk Bandar",
      billRemarkLine1: "",
      billRemarkLine2: "",
      billRemarkLine3: "",
    },
    paymentRows,
    terms: MANUAL_DEFAULT_TERMS_HTML,
    amount,
  };
}

function getManualPaymentFields(app, savedFields = {}, options = {}) {
  const defaultFields = getDefaultManualPaymentDraft(app).fields;
  const nextFields = {
    ...defaultFields,
    ...(savedFields || {}),
  };
  const applicantName = String(getApplicantName(app) || "").trim().toLowerCase();
  const recipientName = String(nextFields.recipientName || "").trim().toLowerCase();

  if (!recipientName || (applicantName && recipientName === applicantName)) {
    nextFields.recipientName = getBillingRecipientName(app);
  }

  if (
    nextFields.attachmentParagraph ===
    "Dilampirkan bersama ini syarat-syarat lesen yang mesti dipatuhi. Sebarang pelanggaran syarat lesen boleh menyebabkan lesen puan/tuan ditarik balik."
  ) {
    nextFields.attachmentParagraph = MANUAL_ATTACHMENT_PARAGRAPH;
  }

  if (
    nextFields.contactParagraph ===
    "Sekiranya pihak puan/tuan memerlukan keterangan lanjut, sila hubungi Bahagian Pelesenan DBKU."
  ) {
    nextFields.contactParagraph = MANUAL_CONTACT_PARAGRAPH;
  }

  if (
    nextFields.contactParagraph ===
    "4.         Sekiranya pihak puan/tuan memerlukan keterangan lanjut, sila hubungi Bahagian Pelesenan DBKU."
  ) {
    nextFields.contactParagraph = MANUAL_CONTACT_PARAGRAPH;
  }

  if (
    nextFields.footerText ===
    "UNTUK MEMPERTINGKAT KUALITI KEHIDUPAN DENGAN MEWUJUDKAN PERSEKITARAN KONDUSIF, PENGLIBATAN WARGA KOTA DAN PENYAMPAIAN PERKHIDMATAN TERUNGGUL"
  ) {
    nextFields.footerText = MANUAL_FOOTER_TEXT;
  }

  if (!nextFields.letterheadComplaintLine && !nextFields.letterheadFacebookLine) {
    const socialLine = String(nextFields.letterheadSocialLine || "").trim();
    if (socialLine) {
      const [complaintLine, facebookLine] = socialLine.split(/\s{2,}/);
      nextFields.letterheadComplaintLine =
        complaintLine || MANUAL_LETTERHEAD_COMPLAINT_LINE;
      nextFields.letterheadFacebookLine =
        facebookLine || MANUAL_LETTERHEAD_FACEBOOK_LINE;
    }
  }

  if (!nextFields.letterheadAddressLine2) {
    const address = String(nextFields.letterheadAddress || "").trim();
    const match = address.match(/^(.*?)(93050\s+Kuching,\s*Sarawak\.?)$/i);
    if (match) {
      nextFields.letterheadAddress = match[1].replace(/,\s*$/, ",").trim();
      nextFields.letterheadAddressLine2 = match[2].trim();
    }
  }

  if (options.preserveReceiptFields) {
    if (!savedFields?.billReceiptTitle || nextFields.billReceiptTitle === "Bil Bayaran") {
      nextFields.billReceiptTitle = "Official Receipt";
    }
    if (
      !savedFields?.billPaymentLine1 ||
      nextFields.billPaymentLine1 ===
        "Sila jelaskan bayaran di Kaunter Bahagian Pelesenan, Aras 1, DBKU."
    ) {
      nextFields.billPaymentLine1 = "Cash";
    }
    if (
      !savedFields?.billPaymentLine2 ||
      nextFields.billPaymentLine2 ===
        "Bayaran hendaklah dibuat dalam tempoh empat belas (14) hari bekerja."
    ) {
      nextFields.billPaymentLine2 = "Cheque No.";
    }
    if (!savedFields?.billBankNote && !nextFields.billBankNote) {
      nextFields.billBankNote =
        "Pembayaran ini hanya dianggap sah setelah cek dijelaskan oleh bank\nPayment valid only upon clearance of cheque";
    }

    return nextFields;
  }

  if (
    ["official receipt", "resit rasmi"].includes(
      String(nextFields.billReceiptTitle || "").trim().toLowerCase()
    )
  ) {
    nextFields.billReceiptTitle = "Bil Bayaran";
  }

  if (String(nextFields.billPaymentLine1 || "").trim().toLowerCase() === "cash") {
    nextFields.billPaymentLine1 =
      "Sila jelaskan bayaran di Kaunter Bahagian Pelesenan, Aras 1, DBKU.";
  }

  if (String(nextFields.billPaymentLine2 || "").trim().toLowerCase() === "cheque no.") {
    nextFields.billPaymentLine2 =
      "Bayaran hendaklah dibuat dalam tempoh empat belas (14) hari bekerja.";
  }

  if (
    String(nextFields.billBankNote || "").replace(/\r\n/g, "\n").trim() ===
    "Pembayaran ini hanya dianggap sah setelah cek dijelaskan oleh bank\nPayment valid only upon clearance of cheque"
  ) {
    nextFields.billBankNote = "";
  }

  return nextFields;
}

function buildManualLetterBody({ fields, subject }) {
  return [
    fields.salutation,
    subject,
    `Jenis Iklan: ${fields.adType}`,
    `Nama Iklan: ${fields.adName}`,
    `Nama Pemohon: ${fields.applicantName}`,
    `Tempat Iklan Dipamer: ${fields.displayLocation}`,
    fields.approvalParagraph,
    fields.attachmentParagraph,
    fields.contactParagraph,
    fields.closingText,
    fields.mottoLine1,
    fields.mottoLine2,
    fields.signatoryTitle,
    fields.signatoryDepartment,
    fields.signatoryAuthority,
  ].filter(Boolean).join("\n\n");
}

function buildManualBillNotes({ invoiceNo, paymentRows }) {
  const total = paymentRows.reduce(
    (sum, row) => sum + (parseCurrencyAmount(row.amount) || 0),
    0
  );

  return [
    `No. Bil: ${invoiceNo}`,
    ...paymentRows.map((row) => `${row.label}: ${formatCurrency(row.amount)} (${row.validity || "-"})`),
    `Jumlah Keseluruhan: ${formatCurrency(total)}`,
  ].join("\n");
}

function getDefaultApprovalLetterBody(app) {
  const draft = getDefaultManualPaymentDraft(app);
  return buildManualLetterBody({ fields: draft.fields, subject: draft.subject });
}

function getDefaultBillNotes(app) {
  const draft = getDefaultManualPaymentDraft(app);
  return buildManualBillNotes({ invoiceNo: getInvoiceNo(app), paymentRows: draft.paymentRows });
}

function buildManualPaymentPreviewApp(app, draft) {
  const approvalLetter = app?.form_data?.approval_letter || {};

  return {
    ...app,
    form_data: {
      ...(app?.form_data || {}),
      approval_letter: {
        ...approvalLetter,
        manual_letter: {
          ...(approvalLetter.manual_letter || {}),
          fields: draft.fields,
          subject: draft.subject,
          body: buildManualLetterBody({
            fields: draft.fields,
            subject: draft.subject,
          }),
          terms: draft.terms,
          saved_at: approvalLetter.manual_letter?.saved_at || new Date().toISOString(),
        },
        manual_bill: {
          ...(approvalLetter.manual_bill || {}),
          invoice_no: draft.invoiceNo,
          amount: draft.amount,
          rows: draft.paymentRows,
          notes: buildManualBillNotes({
            invoiceNo: draft.invoiceNo,
            paymentRows: draft.paymentRows,
          }),
          saved_at: approvalLetter.manual_bill?.saved_at || new Date().toISOString(),
        },
        manual_receipt: {
          ...(approvalLetter.manual_receipt || {}),
          receipt_no: draft.receiptNo || draft.invoiceNo,
          invoice_no: draft.receiptNo || draft.invoiceNo,
          amount: draft.amount,
          rows: draft.paymentRows,
          notes: buildManualBillNotes({
            invoiceNo: draft.receiptNo || draft.invoiceNo,
            paymentRows: draft.paymentRows,
          }),
          fields: draft.receiptFields,
          saved_at: approvalLetter.manual_receipt?.saved_at || new Date().toISOString(),
        },
      },
    },
  };
}

function openManualPaymentDocument(app, type, t) {
  openPrintablePreview(
    `${getApplicationReference(app)} ${
      type === "receipt" ? "official receipt" : type === "bill" ? "bill" : "approval letter"
    }`,
    buildManualPaymentDocumentHtml(app, type, t)
  );
}

function buildManualPaymentDocumentHtml(app, type, t) {
  const approvalLetter = app?.form_data?.approval_letter || {};
  const manualLetter = approvalLetter.manual_letter || {};
  const manualBill = approvalLetter.manual_bill || {};
  const manualReceipt = approvalLetter.manual_receipt || {};
  const defaultDraft = getDefaultManualPaymentDraft(app);
  const fields = getManualPaymentFields(
    app,
    type === "receipt"
      ? manualReceipt.fields || manualLetter.fields
      : manualLetter.fields,
    {
      preserveReceiptFields: type === "receipt",
    }
  );
  const paymentRows =
    type === "receipt" && manualReceipt.rows?.length
      ? manualReceipt.rows
      : manualBill.rows?.length
        ? manualBill.rows
        : defaultDraft.paymentRows;
  const total = paymentRows.reduce(
    (sum, row) => sum + (parseCurrencyAmount(row.amount) || 0),
    0
  );
  if (type === "receipt") {
    return buildManualOfficialReceiptDocumentHtml({
      app,
      t,
      fields,
      paymentRows,
      invoiceNo: manualReceipt.receipt_no || manualReceipt.invoice_no || manualBill.invoice_no || getInvoiceNo(app),
      total,
    });
  }

  const isBill = type === "bill";
  if (isBill) {
    return buildManualBillDocumentHtml({
      app,
      t,
      fields,
      paymentRows,
      invoiceNo: manualBill.invoice_no || getInvoiceNo(app),
      total,
    });
  }

  const title = isBill
    ? t("workspace.payment.billDocument", "Bill")
    : manualLetter.subject || t("workspace.payment.approvalLetter", "Approval Letter");
  const terms = manualLetter.terms || defaultDraft.terms;
  const termsHtml = getSafeManualRichTextHtml(terms);
  const appendixLabel = fields.appendixLabel || MANUAL_APPENDIX_LABEL;
  const appendixTitle = fields.appendixTitle || MANUAL_APPENDIX_TITLE;
  const letterheadTitle = fields.letterheadTitle || MANUAL_LETTERHEAD_TITLE;
  const letterheadSubtitle = fields.letterheadSubtitle || MANUAL_LETTERHEAD_SUBTITLE;
  const letterheadAddress = fields.letterheadAddress || MANUAL_LETTERHEAD_ADDRESS;
  const letterheadAddressLine2 =
    fields.letterheadAddressLine2 || MANUAL_LETTERHEAD_ADDRESS_LINE_2;
  const letterheadPhoneLine = fields.letterheadPhoneLine || MANUAL_LETTERHEAD_PHONE_LINE;
  const letterheadWebLine = fields.letterheadWebLine || MANUAL_LETTERHEAD_WEB_LINE;
  const letterheadComplaintLine =
    fields.letterheadComplaintLine || MANUAL_LETTERHEAD_COMPLAINT_LINE;
  const letterheadFacebookLine =
    fields.letterheadFacebookLine || MANUAL_LETTERHEAD_FACEBOOK_LINE;
  const dbkuLogoUrl = getManualDocumentAssetUrl(fields.letterDbkuLogoPath || "/logo-dbku.png");
  const alisLogoUrl = getManualDocumentAssetUrl(fields.letterAlisLogoPath || "/ALiS.png");

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
    .subhead .icon-row { display: flex; justify-content: flex-start; align-items: center; gap: 16px; margin-top: 2px; }
    .subhead .icon-item { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
    .subhead .contact-icon { width: 12px; height: 12px; object-fit: contain; }
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
    .terms ol + p { min-height: 12px; margin: 12px 0; }
    .terms li { margin: 4px 0; }
    .terms table { margin: 10px 0; }
    .terms figure { margin: 10px 0; }
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
        <h1>${escapeHtml(letterheadTitle)}</h1>
        <div class="subhead">
          <div class="subtitle">${escapeHtml(letterheadSubtitle)}</div>
          <div class="address">${escapeHtml(letterheadAddress)}</div>
          <div class="address">${escapeHtml(letterheadAddressLine2)}</div>
          <div class="contact phone">${escapeHtml(letterheadPhoneLine)}</div>
          <div class="contact">${escapeHtml(letterheadWebLine)}</div>
          <div class="contact icon-row">
            <span class="icon-item"><img class="contact-icon" src="${escapeHtml(BOOTSTRAP_AT_ICON_URL)}" alt="" />${escapeHtml(letterheadComplaintLine)}</span>
            <span class="icon-item"><img class="contact-icon" src="${escapeHtml(BOOTSTRAP_FACEBOOK_ICON_URL)}" alt="" />${escapeHtml(letterheadFacebookLine)}</span>
          </div>
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
            <td class="amount">${escapeHtml(formatCurrency(row.amount))}</td>
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
    <h2>${escapeHtml(appendixLabel)}</h2>
    <h3>${escapeHtml(appendixTitle)}</h3>
    <div class="terms">${termsHtml}</div>
  </section>
</body>
</html>`;
}

function buildManualBillDocumentHtml({ app, t, fields, paymentRows, invoiceNo, total }) {
  const billDate = fields.letterDate || new Date().toISOString().slice(0, 10);
  const totalDisplay = formatCurrency(total);
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
        <h1>${escapeHtml(fields.letterheadTitle || MANUAL_LETTERHEAD_TITLE)}</h1>
        <p class="subtitle">${escapeHtml(fields.letterheadSubtitle || MANUAL_LETTERHEAD_SUBTITLE)}</p>
        <p class="strong">${escapeHtml(fields.letterheadAddress || MANUAL_LETTERHEAD_ADDRESS)}<br />${escapeHtml(fields.letterheadAddressLine2 || MANUAL_LETTERHEAD_ADDRESS_LINE_2)}</p>
        <p class="contact">${escapeHtml(fields.letterheadPhoneLine || MANUAL_LETTERHEAD_PHONE_LINE)}</p>
        <p><strong>${escapeHtml(fields.letterheadWebLine || MANUAL_LETTERHEAD_WEB_LINE)}</strong></p>
        <p class="social"><span>@ ${escapeHtml(fields.letterheadComplaintLine || MANUAL_LETTERHEAD_COMPLAINT_LINE)}</span><span>f ${escapeHtml(fields.letterheadFacebookLine || MANUAL_LETTERHEAD_FACEBOOK_LINE)}</span></p>
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
        ${escapeHtml(fields.recipientAddress || getApplicantPostalAddress(app)).replace(/\n/g, "<br />")}
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

function buildManualOfficialReceiptDocumentHtml({ app, t, fields, paymentRows, invoiceNo, total }) {
  const billDate = fields.letterDate || new Date().toISOString().slice(0, 10);
  const totalDisplay = formatCurrency(total);
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
    .line-row { display: grid; grid-template-columns: 72px 1fr; gap: 8px; margin: 12px 0; font-size: 13px; }
    .line { border-bottom: 1px dotted #111827; min-height: 22px; padding: 0 4px; font-weight: 700; }
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
        <div class="line-row"><span>${escapeHtml(t("workspace.payment.manual.station", "Station"))}</span><span class="line">${escapeHtml(fields.billStation)}</span></div>
        <div class="line-row"><span>${escapeHtml(t("workspace.payment.manual.date", "Date"))}</span><span class="line">${escapeHtml(formatDate(billDate))}</span></div>
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

function openApprovalLetterBillPreview(app, t) {
  openPrintablePreview(
    `${getApplicationReference(app)} approval letter and bill`,
    buildApprovalLetterBillHtml(app, t)
  );
}

function openAdvertisementLicensePreview(app, t) {
  openPrintablePreview(
    `${getApplicationReference(app)} advertisement license`,
    buildAdvertisementLicenseHtml(app, t)
  );
}

function openPrintablePreview(title, html) {
  const titledHtml = html.replace(
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeHtml(title)}</title>`
  );
  const previewUrl = URL.createObjectURL(
    new Blob([titledHtml], { type: "text/html" })
  );
  const preview = window.open(previewUrl, "_blank", "noopener,noreferrer");

  if (!preview) {
    URL.revokeObjectURL(previewUrl);
    return;
  }

  window.setTimeout(() => URL.revokeObjectURL(previewUrl), 5 * 60 * 1000);
}

function buildApprovalLetterBillHtml(app, t) {
  const reference = getApplicationReference(app);
  const applicant = getApplicantName(app);
  const applicantAddress = getApplicantPostalAddress(app);
  const projectName = getProjectName(app);
  const applicationType = getApplicationType(app);
  const location = getApplicationLocation(app);
  const letterRef = app?.form_data?.approval_letter?.reference_no || `DBKU/LES/IKL/${reference}`;
  const generatedDate = app?.form_data?.approval_letter?.generated_at ||
    app?.form_data?.payment?.generated_at ||
    new Date().toISOString();
  const paymentRows = getPaymentBillRows(app);
  const amount = getBillAmount(app);
  const total = hasValue(amount)
    ? formatCurrency(amount)
    : formatCurrency(paymentRows.reduce((sum, row) => sum + row.amount, 0));
  const validityText = getApprovalValidityText(app, t);
  const dbkuLogoUrl = getPublicAssetUrl("/logo-dbku.png");
  const alisLogoUrl = getPublicAssetUrl("/ALiS.png");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(reference)} ${escapeHtml(t("workspace.payment.generated.previewTitle", "Approval Letter and Bill"))}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; color: #111827; background: #f8fafc; }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto 12px; background: #fff; padding: 16mm 18mm; box-shadow: 0 1px 4px rgba(15,23,42,.12); }
    .letterhead { display: grid; grid-template-columns: 86px 1fr 104px; gap: 14px; align-items: center; border-bottom: 2px solid #111827; padding-bottom: 8px; }
    .crest { height: 68px; display: flex; align-items: center; justify-content: center; }
    .crest img { max-width: 100%; max-height: 68px; object-fit: contain; }
    h1 { margin: 0; font-size: 18px; line-height: 1.1; text-transform: uppercase; }
    .subhead { font-size: 11px; line-height: 1.35; }
    .topline { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 12px; font-size: 12px; }
    .right { text-align: right; }
    .address { margin: 14px 0 18px 72px; white-space: pre-line; font-size: 12px; line-height: 1.35; }
    .subject { margin: 12px 0; font-weight: 700; text-transform: uppercase; text-decoration: underline; }
    .details { margin: 8px 0 14px; font-size: 12px; }
    .details div { display: grid; grid-template-columns: 145px 12px 1fr; line-height: 1.45; }
    p { font-size: 12px; line-height: 1.45; margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12px; }
    th, td { border: 1px solid #111827; padding: 6px 8px; vertical-align: top; }
    th { text-align: left; background: #f1f5f9; }
    td.amount, th.amount { text-align: right; white-space: nowrap; }
    .signature { margin-top: 28px; font-size: 12px; }
    .footer { margin-top: 42px; border-top: 2px solid #111827; padding-top: 6px; text-align: center; font-size: 10px; font-weight: 700; white-space: pre-wrap; }
    .appendix h2 { margin: 10px 0 24px; text-align: right; font-size: 14px; }
    .appendix h3 { text-align: center; font-size: 13px; text-transform: uppercase; }
    .terms { margin-top: 28px; font-size: 12px; line-height: 1.45; }
    .terms li { margin: 8px 0; }
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
      <div>
        <h1>Dewan Bandaraya Kuching Utara</h1>
        <div class="subhead">
          Commission of the City of Kuching North<br />
          Bukit Siol, Jalan Semariang, Petra Jaya, 93050 Kuching, Sarawak.
        </div>
      </div>
      <div class="crest"><img src="${escapeHtml(alisLogoUrl)}" alt="ALiS" /></div>
    </header>

    <div class="topline">
      <div>
        <div>${escapeHtml(t("workspace.payment.manual.yourRef", "Your Ref."))} :</div>
        <div>${escapeHtml(t("workspace.payment.manual.ourRef", "Our Ref."))} : <strong>${escapeHtml(letterRef)}</strong></div>
      </div>
      <div class="right">${escapeHtml(t("workspace.payment.manual.date", "Date"))} : <strong>${escapeHtml(formatDate(generatedDate))}</strong></div>
    </div>

    <div class="address">${escapeHtml(applicant)}<br />${escapeHtml(applicantAddress)}</div>

    <p>${escapeHtml(t("workspace.payment.generated.salutation", "Dear Sir/Madam,"))}</p>
    <p class="subject">${escapeHtml(t("workspace.payment.generated.subject", "Application for Business Signage/Advertisement License"))}</p>

    <div class="details">
      <div><span>${escapeHtml(t("workspace.payment.manual.adType", "Advertisement Type"))}</span><span>:</span><strong>${escapeHtml(applicationType)}</strong></div>
      <div><span>${escapeHtml(t("workspace.payment.manual.adName", "Advertisement Name"))}</span><span>:</span><strong>${escapeHtml(projectName)}</strong></div>
      <div><span>${escapeHtml(t("workspace.payment.manual.applicantName", "Applicant Name"))}</span><span>:</span><strong>${escapeHtml(applicant)}</strong></div>
      <div><span>${escapeHtml(t("workspace.payment.manual.displayLocation", "Advertisement Display Location"))}</span><span>:</span><strong>${escapeHtml(location)}</strong></div>
    </div>

    <p>${escapeHtml(t("workspace.payment.generated.approvalParagraph", "Please be informed that your application for the above matter has been approved. Please make payment as below to Dewan Bandaraya Kuching Utara within fourteen (14) working days from the date this letter is received."))}</p>

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
            <td>${escapeHtml(row.validity || validityText)}</td>
            <td class="amount">${escapeHtml(formatCurrency(row.amount))}</td>
          </tr>
        `).join("")}
        <tr>
          <td colspan="2" class="amount"><strong>${escapeHtml(t("workspace.payment.manual.grandTotal", "Grand Total"))}</strong></td>
          <td class="amount"><strong>${escapeHtml(total)}</strong></td>
        </tr>
      </tbody>
    </table>

    <p>${escapeHtml(t("workspace.payment.generated.attachmentParagraph", "Attached herewith are the license conditions that must be complied with. Any breach of the license conditions may cause your license to be revoked."))}</p>
    <p>${escapeHtml(t("workspace.payment.generated.closingText", "Thank you."))}</p>

    <div class="signature">
      <p><strong>"AN HONOUR TO SERVE"<br />"TOGETHER WE CARE"</strong></p>
      <br /><br />
      <p><strong>${escapeHtml(t("workspace.payment.generated.signatoryTitle", "(HEAD OF DIVISION)"))}</strong><br />${escapeHtml(t("workspace.payment.generated.signatoryDepartment", "Licensing Division"))}<br />${escapeHtml(t("workspace.payment.generated.signatoryAuthority", "for Director, Dewan Bandaraya Kuching Utara"))}</p>
    </div>
    <div class="footer">${escapeHtml(t("workspace.payment.generated.footerText", "TO ENHANCE QUALITY OF LIFE BY CREATING A CONDUCIVE ENVIRONMENT, CITIZEN PARTICIPATION AND EXCELLENT SERVICE DELIVERY"))}</div>
  </section>

  <section class="page appendix">
    <h2>${escapeHtml(t("workspace.payment.manual.appendix", "Appendix"))}</h2>
    <h3>${escapeHtml(t("workspace.payment.generated.appendixTitle", "Advertisement License Conditions Within Dewan Bandaraya Kuching Utara (DBKU) Area"))}</h3>
    <ol class="terms">
      <li>${escapeHtml(t("workspace.payment.generated.term1", "The approval period is subject to the license period approved by DBKU."))}</li>
      <li>${escapeHtml(t("workspace.payment.generated.term2", "The applicant shall ensure that the advertisement board is installed, displayed, and maintained properly throughout the approval period."))}</li>
      <li>${escapeHtml(t("workspace.payment.generated.term3", "Any construction or installation work shall obtain the relevant permit and approval before work commences."))}</li>
      <li>${escapeHtml(t("workspace.payment.generated.term4", "The applicant shall ensure there is no disruption to safety, traffic, or public order caused by the advertisement installation."))}</li>
      <li>${escapeHtml(t("workspace.payment.generated.term5", "DBKU may instruct amendment, removal, or cancellation of the license if the license conditions are not complied with."))}</li>
      <li>${escapeHtml(t("workspace.payment.generated.term6", "The cost of correction, erasure, or removal of advertisements instructed by DBKU shall be borne by the applicant."))}</li>
    </ol>
  </section>
</body>
</html>`;
}

function buildAdvertisementLicenseHtml(app, t) {
  return buildAdvertisementLicenseDocumentHtml(app, t);
}

function getApplicantPostalAddress(app) {
  const step2 = app?.form_data?.step_2 || {};
  const step3 = app?.form_data?.step_3 || {};
  const parts = [
    step3.postal_address || step2.postal_address || step2.address || step3.address,
    step3.address_2 || step2.address_2,
    step3.address_3 || step2.address_3,
    step3.address_4 || step2.address_4,
  ].filter(hasValue);

  return parts.length > 0 ? parts.join("\n") : getApplicationLocation(app);
}

function getBillingRecipientName(app) {
  const step2 = app?.form_data?.step_2 || {};
  const step3 = app?.form_data?.step_3 || {};

  return (
    step3.org_name ||
    step2.org_name ||
    step3.full_name ||
    step2.full_name ||
    getApplicantName(app)
  );
}

function getPaymentBillRows(app) {
  const technicalSite = app?.form_data?.technical_site_visit || {};
  const applicationType = getApplicationType(app);
  const rows = [];
  const licenseFee = parseCurrencyAmount(technicalSite.license_fee_calculation);
  const deposit = parseCurrencyAmount(technicalSite.deposit_calculation);
  const processing = parseCurrencyAmount(technicalSite.processing_fee_calculation);

  if (Number.isFinite(licenseFee) && licenseFee > 0) {
    rows.push({ label: `Lesen Iklan - ${applicationType}`, amount: licenseFee });
  }

  if (Number.isFinite(deposit) && deposit > 0) {
    rows.push({ label: "Deposit", amount: deposit, validity: "-" });
  }

  if (Number.isFinite(processing) && processing > 0) {
    rows.push({ label: "Yuran Pemprosesan Lesen", amount: processing, validity: "-" });
  }

  if (rows.length === 0) {
    const amount = parseCurrencyAmount(getBillAmount(app));
    rows.push({
      label: `Lesen Iklan - ${applicationType}`,
      amount: Number.isFinite(amount) ? amount : 0,
    });
  }

  return rows;
}

function getApprovalValidityText(app, t) {
  const license = app?.form_data?.license || {};
  if (license.issue_date || license.expiry_date) {
    return `${formatDate(license.issue_date || new Date())} ${t?.("workspace.payment.generated.until", "to") || "hingga"} ${formatDate(license.expiry_date)}`;
  }

  return t?.("workspace.payment.generated.subjectToApprovalPeriod", "Subject to the approval period") || "Tertakluk kepada tempoh kelulusan";
}

function LicenseDetails({
  app,
  t,
  canChooseLicenseExpiry,
  licenseExpiryYears,
  setLicenseExpiryYears,
  onManualLicenseDraftChange,
}) {
  const license = app.form_data?.license || {};
  const manualLicense = license.manual_license || {};
  const renewal = getLicenseRenewal(app);
  const reminders = getLicenseRenewalReminders(app);
  const cancellation = renewal.cancellation || {};
  const licenseEditable =
    canChooseLicenseExpiry && normalizeStatus(app?.status) === "payment_verified";
  const [draftFields, setDraftFields] = useState(() =>
    getAdvertisementLicenseDraftFields(app, manualLicense.fields, {
      expiryDate: license.expiry_date,
    })
  );
  const [termsText, setTermsText] = useState(() =>
    (Array.isArray(manualLicense.terms) && manualLicense.terms.length
      ? manualLicense.terms
      : DEFAULT_ADVERTISEMENT_LICENSE_TERMS
    ).join("\n")
  );

  useEffect(() => {
    setDraftFields(
      getAdvertisementLicenseDraftFields(app, manualLicense.fields, {
        expiryDate: license.expiry_date,
      })
    );
    setTermsText(
      (Array.isArray(manualLicense.terms) && manualLicense.terms.length
        ? manualLicense.terms
        : DEFAULT_ADVERTISEMENT_LICENSE_TERMS
      ).join("\n")
    );
  }, [app.id, license.expiry_date, manualLicense.draft_saved_at, manualLicense.issued_at]);

  function pushLicenseDraft(nextFields, nextTermsText = termsText) {
    const terms = nextTermsText
      .split("\n")
      .map((term) => term.replace(/^\s*\d+[\).]\s*/, "").trim())
      .filter(Boolean);

    onManualLicenseDraftChange?.({
      fields: nextFields,
      terms: terms.length ? terms : DEFAULT_ADVERTISEMENT_LICENSE_TERMS,
    });
  }

  function updateLicenseField(name, value) {
    const nextFields = { ...draftFields, [name]: value };
    setDraftFields(nextFields);
    pushLicenseDraft(nextFields);
  }

  async function uploadLicenseLogo(file) {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    updateLicenseField("dbkuLogoPath", dataUrl);
  }

  function normalizeLicenseAmount() {
    const nextFields = {
      ...draftFields,
      paymentAmount: formatPaymentRowAmount(draftFields.paymentAmount),
    };
    setDraftFields(nextFields);
    pushLicenseDraft(nextFields);
  }

  function updateLicenseTerms(value) {
    setTermsText(value);
    pushLicenseDraft(draftFields, value);
  }

  function updateLicenseTerm(index, value) {
    const terms = termsText.split("\n");
    terms[index] = value;
    updateLicenseTerms(terms.join("\n"));
  }

  const licenseTerms = termsText
    .split("\n")
    .map((term) => term.replace(/^\s*\d+[\).]\s*/, "").trim());

  return (
    <div className="space-y-4 text-sm">
      <section className="overflow-hidden rounded-md border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[13px] font-semibold uppercase leading-5 tracking-wide text-slate-500">
              {t("workspace.license.manualTitle", "Create Manually")}
            </p>
            <p className="mt-1 text-[14px] leading-5 text-slate-600">
              {t("workspace.license.manualDesc", "Edit the advertisement license that will be issued with the QR verification link.")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {licenseEditable && (
              <span className="inline-flex min-h-9 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700">
                <Icon name="cloud_done" className="text-[17px]" />
                {t("workspace.payment.manual.autoSaveDraft", "Auto-saves as draft")}
              </span>
            )}
            <Button
              type="button"
              variant="secondary"
              icon="visibility"
              onClick={() => openAdvertisementLicensePreview(app, t)}
            >
              {t("workspace.license.viewLicense", "View Advertisement License")}
            </Button>
          </div>
        </div>

        <div className="p-4">
          <div className="mx-auto max-w-[900px] rounded border border-slate-300 bg-white px-10 py-8 text-[15px] leading-snug text-slate-950 shadow-sm" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
            <ManualLicensePlainInput
              value={draftFields.formCode}
              onChange={(value) => updateLicenseField("formCode", value)}
              readOnly={!licenseEditable}
              className="ml-auto block w-64 text-right font-bold"
            />

            <div className="mt-4 text-center">
              <div className="mx-auto flex h-16 w-24 items-center justify-center">
                <img
                  src={draftFields.dbkuLogoPath || "/logo-dbku.png"}
                  alt="DBKU"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              {licenseEditable && (
                <label className="mx-auto mt-2 inline-flex min-h-8 cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  <Icon name="upload_file" className="text-[15px]" />
                  <span>{t("workspace.payment.manual.uploadLogo", "Upload Logo")}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      uploadLicenseLogo(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                </label>
              )}
              <ManualLicensePlainInput
                value={draftFields.headerTitle}
                onChange={(value) => updateLicenseField("headerTitle", value)}
                readOnly={!licenseEditable}
                className="mx-auto mt-4 block w-full text-center text-[18px] font-extrabold uppercase leading-tight"
              />
              <ManualLicensePlainInput
                value={draftFields.headerSubtitle}
                onChange={(value) => updateLicenseField("headerSubtitle", value)}
                readOnly={!licenseEditable}
                className="mx-auto block w-full text-center text-[13px] font-extrabold leading-tight"
              />
              <ManualLicensePlainInput
                value={draftFields.bylawTitle}
                onChange={(value) => updateLicenseField("bylawTitle", value)}
                readOnly={!licenseEditable}
                className="mx-auto block w-full text-center text-[15px] font-extrabold leading-tight"
              />
              <ManualLicensePlainArea
                value={draftFields.formTitle}
                onChange={(value) => updateLicenseField("formTitle", value)}
                readOnly={!licenseEditable}
                rows={3}
                className="mx-auto mt-5 w-full resize-none text-center text-[16px] font-extrabold leading-tight"
              />
            </div>

            <div className="mt-8 grid grid-cols-[86px_10px_minmax(0,1fr)_82px_10px_minmax(0,1fr)] items-end gap-x-2 gap-y-2">
              <ManualLicensePlainInput value={draftFields.receiptLabel} onChange={(value) => updateLicenseField("receiptLabel", value)} readOnly={!licenseEditable} />
              <span>:</span>
              <ManualLicenseLineInput value={draftFields.receiptNo} onChange={(value) => updateLicenseField("receiptNo", value)} readOnly={!licenseEditable} />
              <ManualLicensePlainInput value={draftFields.referenceLabel} onChange={(value) => updateLicenseField("referenceLabel", value)} readOnly={!licenseEditable} />
              <span>:</span>
              <ManualLicenseLineInput value={draftFields.referenceNo} onChange={(value) => updateLicenseField("referenceNo", value)} readOnly={!licenseEditable} />
            </div>

            <div className="mt-3 grid grid-cols-[86px_10px_minmax(0,1fr)] items-end gap-x-2">
              <ManualLicensePlainInput value={draftFields.nameLabel} onChange={(value) => updateLicenseField("nameLabel", value)} readOnly={!licenseEditable} />
              <span>:</span>
              <ManualLicenseLineInput value={draftFields.applicantName} onChange={(value) => updateLicenseField("applicantName", value)} readOnly={!licenseEditable} />
            </div>

            <div className="mt-3 grid grid-cols-[86px_10px_minmax(0,1fr)] items-start gap-x-2">
              <ManualLicensePlainInput value={draftFields.addressLabel} onChange={(value) => updateLicenseField("addressLabel", value)} readOnly={!licenseEditable} className="pt-1" />
              <span className="pt-1">:</span>
              <ManualLicenseLineArea value={draftFields.applicantAddress} onChange={(value) => updateLicenseField("applicantAddress", value)} readOnly={!licenseEditable} rows={3} />
            </div>

            <p className="mt-7 text-justify text-[15px] leading-snug">
              <ManualLicenseEditableSpan
                value={draftFields.grantPrefix}
                onChange={(value) => updateLicenseField("grantPrefix", value)}
                readOnly={!licenseEditable}
              />{" "}
              <ManualLicenseEditableSpan
                value={draftFields.issuingAuthority}
                onChange={(value) => updateLicenseField("issuingAuthority", value)}
                readOnly={!licenseEditable}
                className="font-extrabold underline"
              />{" "}
              <ManualLicenseEditableSpan
                value={draftFields.grantSuffix}
                onChange={(value) => updateLicenseField("grantSuffix", value)}
                readOnly={!licenseEditable}
              />
            </p>

            <div className="mt-5 grid grid-cols-[86px_10px_minmax(0,1fr)] items-end gap-x-2 gap-y-2">
              <ManualLicensePlainInput value={draftFields.boardLabel} onChange={(value) => updateLicenseField("boardLabel", value)} readOnly={!licenseEditable} />
              <span>:</span>
              <ManualLicenseLineInput value={draftFields.boardName} onChange={(value) => updateLicenseField("boardName", value)} readOnly={!licenseEditable} className="text-center" />
              <ManualLicensePlainInput value={draftFields.advertisementTypeLabel} onChange={(value) => updateLicenseField("advertisementTypeLabel", value)} readOnly={!licenseEditable} />
              <span>:</span>
              <ManualLicenseLineInput value={draftFields.advertisementType} onChange={(value) => updateLicenseField("advertisementType", value)} readOnly={!licenseEditable} />
              <ManualLicensePlainInput value={draftFields.placeLabel} onChange={(value) => updateLicenseField("placeLabel", value)} readOnly={!licenseEditable} />
              <span>:</span>
              <ManualLicenseLineArea value={draftFields.displayLocation} onChange={(value) => updateLicenseField("displayLocation", value)} readOnly={!licenseEditable} rows={2} />
            </div>

            <div className="mt-3 grid grid-cols-[86px_10px_minmax(0,1fr)_55px_minmax(0,1fr)] items-end gap-x-2">
              <ManualLicensePlainArea value={draftFields.periodLabel} onChange={(value) => updateLicenseField("periodLabel", value)} readOnly={!licenseEditable} rows={2} className="leading-tight" />
              <span>:</span>
              <ManualLicenseLineInput value={toDateDisplayValue(draftFields.issueDate)} onChange={(value) => updateLicenseField("issueDate", fromDateInputValue(value, draftFields.issueDate))} readOnly={!licenseEditable} className="text-center" />
              <ManualLicensePlainInput value={draftFields.untilLabel} onChange={(value) => updateLicenseField("untilLabel", value)} readOnly={!licenseEditable} className="text-center" />
              <ManualLicenseLineInput value={toDateDisplayValue(draftFields.expiryDate)} onChange={(value) => updateLicenseField("expiryDate", fromDateInputValue(value, draftFields.expiryDate))} readOnly={!licenseEditable} className="text-center" />
            </div>

            <p className="mt-6 text-[15px] leading-snug">
              <ManualLicenseEditableSpan
                value={draftFields.attachmentText}
                onChange={(value) => updateLicenseField("attachmentText", value)}
                readOnly={!licenseEditable}
              />{" "}
              <ManualLicenseEditableSpan
                value={draftFields.appendixLabel}
                onChange={(value) => updateLicenseField("appendixLabel", value)}
                readOnly={!licenseEditable}
                className="font-extrabold underline"
              />
              .
            </p>

            <div className="mt-20 grid grid-cols-[minmax(0,1fr)_320px] items-start gap-8">
              <div>
                <ManualLicenseLineInput value={draftFields.signatoryName} onChange={(value) => updateLicenseField("signatoryName", value)} readOnly={!licenseEditable} />
                <ManualLicensePlainInput value={draftFields.signatoryTitle} onChange={(value) => updateLicenseField("signatoryTitle", value)} readOnly={!licenseEditable} className="mt-1 w-full" />
              </div>
              <div className="grid grid-cols-[auto_minmax(0,1fr)] items-end gap-2">
                <div className="flex items-end gap-1 whitespace-nowrap">
                  <ManualLicensePlainInput value={draftFields.dateLabel} onChange={(value) => updateLicenseField("dateLabel", value)} readOnly={!licenseEditable} className="w-14" />
                  <span>:</span>
                </div>
                <ManualLicenseLineInput value={toDateDisplayValue(draftFields.signedDate)} onChange={(value) => updateLicenseField("signedDate", fromDateInputValue(value, draftFields.signedDate))} readOnly={!licenseEditable} className="text-center" />
              </div>
            </div>
          </div>

          <div className="mx-auto mt-4 max-w-[900px] rounded border border-slate-300 bg-white px-10 py-8 text-[15px] leading-snug text-slate-950 shadow-sm" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
            <ManualLicenseLineInput value={draftFields.termsTitle} onChange={(value) => updateLicenseField("termsTitle", value)} readOnly={!licenseEditable} className="mb-6 max-w-36 text-[17px] underline" />
            <div className="space-y-3">
              {licenseTerms.map((term, index) => (
                <div key={index} className="grid grid-cols-[26px_minmax(0,1fr)] gap-4 text-[15px] leading-snug">
                  <span>{index + 1}.</span>
                  <ManualLicensePlainArea
                    value={term}
                    onChange={(value) => updateLicenseTerm(index, value)}
                    readOnly={!licenseEditable}
                    rows={term.length > 120 ? 2 : 1}
                    className="resize-none text-justify leading-snug"
                  />
                </div>
              ))}
            </div>
            <div className="mt-6 flex items-center justify-end gap-4 font-extrabold">
              <div className="flex items-center gap-1">
                <ManualLicensePlainInput value={draftFields.paymentLabel} onChange={(value) => updateLicenseField("paymentLabel", value)} readOnly={!licenseEditable} className="w-20 text-right font-extrabold" />
                <span>:</span>
              </div>
              <ManualLicenseLineInput
                value={draftFields.paymentAmount}
                onChange={(value) => updateLicenseField("paymentAmount", value)}
                onBlur={normalizeLicenseAmount}
                readOnly={!licenseEditable}
                className="max-w-36 border border-slate-900 text-center"
              />
            </div>
          </div>
        </div>
      </section>

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

function ManualLicensePlainInput({
  value,
  onChange,
  onBlur,
  readOnly = false,
  className = "",
}) {
  return (
    <input
      type="text"
      value={value || ""}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      readOnly={readOnly}
      spellCheck={false}
      className={`min-h-[22px] w-full min-w-0 border-0 bg-transparent p-0 text-[15px] leading-snug text-inherit outline-none read-only:cursor-default ${className}`}
      style={{ fontFamily: '"Times New Roman", Times, serif' }}
    />
  );
}

function ManualLicensePlainArea({
  value,
  onChange,
  onBlur,
  readOnly = false,
  rows = 2,
  className = "",
}) {
  return (
    <textarea
      value={value || ""}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      readOnly={readOnly}
      rows={rows}
      spellCheck={false}
      className={`block w-full min-w-0 border-0 bg-transparent p-0 text-[15px] leading-snug text-inherit outline-none read-only:cursor-default ${className}`}
      style={{ fontFamily: '"Times New Roman", Times, serif' }}
    />
  );
}

function ManualLicenseLineInput({
  value,
  onChange,
  onBlur,
  readOnly = false,
  className = "",
}) {
  return (
    <input
      type="text"
      value={value || ""}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      readOnly={readOnly}
      spellCheck={false}
      className={`min-h-[22px] w-full min-w-0 border-0 border-b border-dotted border-slate-950 bg-transparent px-2 pb-[1px] pt-0 text-[15px] font-extrabold leading-snug text-inherit outline-none read-only:cursor-default ${className}`}
      style={{ fontFamily: '"Times New Roman", Times, serif' }}
    />
  );
}

function ManualLicenseLineArea({
  value,
  onChange,
  onBlur,
  readOnly = false,
  rows = 2,
  bold = true,
  className = "",
}) {
  return (
    <textarea
      value={value || ""}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      readOnly={readOnly}
      rows={rows}
      spellCheck={false}
      className={`block w-full min-w-0 resize-none border-0 bg-transparent px-2 py-0 text-[15px] ${bold ? "font-extrabold" : "font-normal"} leading-[1.55] text-inherit outline-none read-only:cursor-default ${className}`}
      style={{
        fontFamily: '"Times New Roman", Times, serif',
        backgroundImage:
          "repeating-linear-gradient(to bottom, transparent 0, transparent calc(1.55em - 1px), #0f172a calc(1.55em - 1px), #0f172a 1.55em)",
      }}
    />
  );
}

function ManualLicenseEditableSpan({
  value,
  onChange,
  readOnly = false,
  className = "",
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current && ref.current.textContent !== String(value || "")) {
      ref.current.textContent = value || "";
    }
  }, [value]);

  return (
    <span
      ref={ref}
      contentEditable={!readOnly}
      suppressContentEditableWarning
      spellCheck={false}
      onInput={(event) => onChange(event.currentTarget.textContent || "")}
      className={`inline min-w-[1ch] rounded-sm outline-none focus:bg-amber-50 ${readOnly ? "cursor-default" : ""} ${className}`}
      style={{ fontFamily: '"Times New Roman", Times, serif' }}
    >
      {value || ""}
    </span>
  );
}

function toDateInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function toDateDisplayValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

function fromDateInputValue(value, fallback = "") {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  const displayMatch = normalized.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  const isoMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const date = displayMatch
    ? new Date(Number(displayMatch[3]), Number(displayMatch[2]) - 1, Number(displayMatch[1]))
    : isoMatch
      ? new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]))
      : new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toISOString();
}

function getLicenseExpiryPreviewDate(years) {
  const issueDate = new Date();
  return addCalendarYears(issueDate, Number(years) || 1).toISOString();
}

function parseDateOrFallback(value, fallback) {
  const parsed = value ? new Date(value) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) return parsed;
  return fallback instanceof Date ? fallback : new Date(fallback);
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
  const origin = getPublicOrigin();

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
