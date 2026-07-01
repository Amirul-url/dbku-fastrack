import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useLocation, useNavigate } from "react-router-dom";
import AdminDashboardLayout from "../../layout/AdminDashboardLayout";
import { useLanguage } from "../../context/LanguageContext";
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
  getRegisteredApplicantName,
  normalizeStatus,
  WORKFLOW_STATUS,
} from "../../utils/workflow";
import {
  DEFAULT_ADVERTISEMENT_LICENSE_TERMS,
  buildAdvertisementLicenseHtml as buildAdvertisementLicenseDocumentHtml,
  buildManualAdvertisementLicenseForIssuance,
  getAdvertisementLicenseDraftFields,
} from "../../utils/advertisementLicenseDocument";
import {
  getAdminApprovalRecordSeen,
  isAdminApprovalRecordUnread,
  markAdminApprovalRecordSeen,
} from "../../utils/adminSeenRecords";
import { stepText } from "../applications/user/steps/ApplicationStepText";

const TECHNICAL_DEPARTMENTS = ["BLG", "GPM", "MNE", "IMT", "LNP", "ENG"];
const KU_TECHNICAL_MEMO_RECIPIENT = "IKL(TECHNICAL)";
const APPLICATION_TYPE_OPTIONS = ["open_space", "building"];
const TECHNICAL_DISPLAY_TYPE_OPTIONS = [
  { value: "non_led", labelKey: "displayTypeNonLed" },
  { value: "led", labelKey: "displayTypeLed" },
];
const TECHNICAL_DEFAULT_ADVERTISEMENT_TYPES = [
  { value: "Gantry", labelKey: "advertisementTypeGantry" },
  { value: "Unipole", labelKey: "advertisementTypeUnipole" },
  { value: "Minipole", labelKey: "advertisementTypeMinipole" },
  { value: "Free Standing Billboard", labelKey: "applicationSubtypeFreeStandingBillboard" },
  { value: "Directional Sign", labelKey: "advertisementTypeDirectionalSign" },
  { value: "Directory Sign", labelKey: "advertisementTypeDirectorySign" },
  { value: "Projecting Sign", labelKey: "advertisementTypeProjectingSign" },
  { value: "Roof Top Sign", labelKey: "advertisementTypeRoofTopSign" },
  { value: "Wall Sign/Building Wrap", labelKey: "advertisementTypeWallSignBuildingWrap" },
  { value: "Pillar/Column Wrap", labelKey: "advertisementTypePillarColumnWrap" },
];
const SQFT_TO_SQM = 0.092903;
const TECHNICAL_FIXED_DEPOSIT = 5000;
const TECHNICAL_PROCESSING_FEE = 10;
const WORKSPACE_TABLE_PAGE_SIZE = 5;
const TECHNICAL_LED_SUBTYPES = new Set([
  "open_space_led_billboard",
  "building_led_billboard",
]);
const TECHNICAL_FEE_SCHEDULES = {
  schedule_1: {
    key: "schedule_1",
    number: "1",
    firstAreaSqm: 20,
    firstAreaRate: 100,
    additionalAreaRate: 70,
  },
  schedule_6: {
    key: "schedule_6",
    number: "6",
    firstAreaSqm: 10,
    firstAreaRate: 200,
    firstAreaFixedFee: 2000,
    additionalAreaRate: 50,
  },
};
const APPLICATION_TYPE_TECHNICAL_DEPARTMENTS = {
  open_space: ["GPM", "MNE", "IMT", "LNP", "ENG"],
  building: ["BLG"],
};
const APPLICATION_SUBTYPE_OPTIONS = {
  open_space: [
    { value: "free_standing_billboard", en: "Free Standing Billboard", ms: "Papan Iklan Berdiri Bebas" },
    { value: "open_space_led_billboard", en: "LED Billboard", ms: "Papan Iklan LED" },
  ],
  building: [
    { value: "building_normal_billboard", en: "Normal Billboard", ms: "Papan Iklan Biasa" },
    { value: "building_led_billboard", en: "LED Billboard", ms: "Papan Iklan LED" },
  ],
};
const IKL_TASK_DEPARTMENTS = ["PT(IKL)", "KU(IKL)", "IKL (TECHNICAL)"];
const IKL_DEPARTMENT_STATUS_SCOPE = {
  "PT(IKL)": ["incomplete"],
  "KU(IKL)": ["submitted", "ku_ikl_review", "technical_review_completed"],
  "IKL (TECHNICAL)": ["technical_site_visit", "technical_amendment"],
};
const TECHNICAL_DEPARTMENT_TASK_STATUSES = [
  "technical_review",
  "technical_site_visit",
];
const TECHNICAL_REVIEW_STATUSES = new Set([
  ...TECHNICAL_DEPARTMENT_TASK_STATUSES,
  "technical_review_completed",
]);
const KU_IKL_TECHNICAL_TRACKING_STATUSES = new Set([
  "technical_review",
  "technical_site_visit",
  "technical_amendment",
  "technical_review_completed",
]);
const APPROVAL_SUPPORT_DEPARTMENTS = ["TP(RES)", "PGH", "TP(RES)/PGH", "TP/PGH"];
const MPHLG_REVIEW_DEPARTMENTS = ["MPHLG"];
const APPROVAL_TECHNICAL_REPORT_DEPARTMENTS = [
  "KB(LES)",
  ...APPROVAL_SUPPORT_DEPARTMENTS,
  ...MPHLG_REVIEW_DEPARTMENTS,
];
const APPROVAL_REPORT_VIEW_DEPARTMENTS = [
  "PT(IKL)",
  "KU(IKL)",
  "IKL (TECHNICAL)",
  ...TECHNICAL_DEPARTMENTS,
  ...APPROVAL_TECHNICAL_REPORT_DEPARTMENTS,
];
const INTERNAL_WORK_TRACKING_DEPARTMENTS = new Set([
  "PT(IKL)",
  "KU(IKL)",
  "IKL (TECHNICAL)",
  ...TECHNICAL_DEPARTMENTS,
  "KB(LES)",
  ...APPROVAL_SUPPORT_DEPARTMENTS,
  ...MPHLG_REVIEW_DEPARTMENTS,
]);
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
  const userDepartment = getWorkspaceUserDepartment(getStoredUser());

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

function getWorkspaceUserDepartment(user) {
  const identityDepartment = getWorkflowDepartmentFromUserIdentity(user);

  const department = normalizeDepartmentCode(user?.department);
  if (department) return department;

  return identityDepartment;
}

function getWorkflowDepartmentFromUserIdentity(user) {
  return normalizeDepartmentCode(
    user?.full_name ||
      user?.username ||
      [user?.first_name, user?.last_name].filter(Boolean).join(" ")
  );
}

function ProcessWorkspaceContent({ config, navigate, t, language, userDepartment }) {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const querySelectedId = searchParams.get("id") || "";
  const returnToPath = searchParams.get("returnTo") || "";
  const fromPersonalTask = searchParams.get("from") === "personal";
  const fromCompletedApprovals = searchParams.get("from") === "completed-approvals";
  const forceReadOnlyActionPanel = searchParams.get("readonly") === "1";
  const shouldOpenVerificationReport = searchParams.get("showReport") === "1";
  const [applications, setApplications] = useState([]);
  const [selectedId, setSelectedId] = useState(querySelectedId);
  const [keyword, setKeyword] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
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
  const [decisionInput, setDecisionInput] = useState("");
  const [decisionError, setDecisionError] = useState("");
  const [comment, setComment] = useState("");
  const [licenseExpiryYears, setLicenseExpiryYears] = useState("1");
  const [approvalDecisionDraft, setApprovalDecisionDraft] = useState("");
  const [savedApprovalDecisionDraft, setSavedApprovalDecisionDraft] = useState("");
  const [approvalDecisionEditable, setApprovalDecisionEditable] = useState(false);
  const [approvalSupportSignature, setApprovalSupportSignature] = useState(null);
  const [approvalSupportSignatureError, setApprovalSupportSignatureError] = useState("");
  const [adminApprovalSeenAt, setAdminApprovalSeenAt] = useState(() =>
    getAdminApprovalRecordSeen(getStoredUser())
  );
  const [showVerificationReport, setShowVerificationReport] = useState(shouldOpenVerificationReport);
  const [showDecisionLog, setShowDecisionLog] = useState(false);
  const [technicalApplicationTypeSelection, setTechnicalApplicationTypeSelection] = useState([]);
  const technicalSiteDraftSaveIdRef = useRef(0);
  const manualLicenseDraftSaveIdRef = useRef(0);
  const manualLicenseDraftTimerRef = useRef(null);
  const manualLicenseDraftSavePromiseRef = useRef(null);
  const manualLicenseDraftDataRef = useRef(null);
  const decisionInputRef = useRef(null);
  const commentRef = useRef(null);
  const formViewFallbackTimerRef = useRef(null);
  const [technicalSite, setTechnicalSite] = useState({
    application_subtype: "",
    fee_schedule_key: "",
    fee_schedule_no: "",
    site_photos: [],
    fee_date: "",
    fee_items: [createTechnicalFeeItem()],
    advertisement_rows: [],
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
        setAdminApprovalSeenAt(getAdminApprovalRecordSeen(user));
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
    const currentPhotos = getCurrentTechnicalSitePhotos(
      savedPhotos,
      selectedDetail,
      saved.cycle_id || selectedDetail?.form_data?.technical_review_cycle
    );
    const feeItems = normalizeTechnicalFeeItems(saved.fee_items);
    const feeTotals = getTechnicalFeeTotals(feeItems);
    const applicationSubtype = getApplicationSubtypeFromApplication(selectedDetail);
    const preparedSite = mergeTechnicalFeeRowsCalculation({
      ...saved,
      application_subtype: applicationSubtype,
      advertisement_rows: getTechnicalFeeRowsFromApplication(
        selectedDetail,
        saved.advertisement_rows
      ),
    });
    const calculatedFees = calculateTechnicalFee({
      ...preparedSite,
      application_subtype: applicationSubtype,
    });
    setTechnicalSite({
      ...preparedSite,
      application_subtype: applicationSubtype,
      fee_schedule_key: saved.fee_schedule_key || calculatedFees.scheduleKey || "",
      fee_schedule_no: saved.fee_schedule_no || calculatedFees.scheduleNumber || "",
      site_photos: currentPhotos,
      fee_date: saved.fee_date || new Date().toISOString().slice(0, 10),
      fee_items: feeItems,
      advertisement_rows: preparedSite.advertisement_rows || [],
      width_ft: preparedSite.width_ft || saved.width_ft || "",
      height_ft: preparedSite.height_ft || saved.height_ft || "",
      area_sqft: preparedSite.area_sqft || saved.area_sqft || calculatedFees.areaSqft || "",
      area_sqm: preparedSite.area_sqm || saved.area_sqm || calculatedFees.areaSqm || "",
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
  }, [
    selectedDetail?.id,
    selectedDetail?.status,
    selectedDetail?.updated_at,
    selectedDetail?.form_data?.technical_review_cycle,
    selectedDetail?.form_data?.technical_referral?.cycle_id,
    selectedDetail?.form_data?.technical_site_visit?.reset_at,
  ]);

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
  const forceReadOnlyApprovalPanel = isApprovalWorkspace && forceReadOnlyActionPanel;
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
        isApprovalTrackingRecordForDepartment(app, userDepartment);

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
      const updatedAt = app.updated_at ? new Date(app.updated_at) : null;
      const updatedMonth =
        updatedAt && !Number.isNaN(updatedAt.getTime())
          ? String(updatedAt.getMonth() + 1)
          : "";
      const updatedYear =
        updatedAt && !Number.isNaN(updatedAt.getTime())
          ? String(updatedAt.getFullYear())
          : "";
      const displayStatus = getWorkspaceStatusLabel(app, config, t, userDepartment);
      const haystack = [
        getApplicationReference(app),
        getRegisteredApplicantName(app),
        getApplicantName(app),
        getProjectName(app),
        getApplicationLocation(app),
        displayStatus,
      ]
        .join(" ")
        .toLowerCase();

      if (q && !haystack.includes(q)) return false;
      if (monthFilter && updatedMonth !== monthFilter) return false;
      if (yearFilter && updatedYear !== yearFilter) return false;
      if (!matchesWorkspaceStatusFilter(app, statusFilter, config, t, userDepartment)) return false;

      return true;
    });
  }, [
    config,
    keyword,
    language,
    monthFilter,
    statusFilter,
    statusScopedApplications,
    t,
    userDepartment,
    yearFilter,
  ]);

  const yearOptions = useMemo(() => {
    return Array.from(
      new Set(
        statusScopedApplications
          .map((app) => {
            const updatedAt = app.updated_at ? new Date(app.updated_at) : null;
            return updatedAt && !Number.isNaN(updatedAt.getTime())
              ? String(updatedAt.getFullYear())
              : "";
          })
          .filter(Boolean)
      )
    ).sort((a, b) => Number(b) - Number(a));
  }, [statusScopedApplications]);

  const statusOptions = useMemo(() => {
    return getWorkspaceStatusFilterOptions(statusScopedApplications, config, userDepartment, t);
  }, [config, statusScopedApplications, t, userDepartment]);

  useEffect(() => {
    if (!statusFilter) return;
    if (statusOptions.some((item) => item.value === statusFilter)) return;

    setStatusFilter("");
  }, [statusFilter, statusOptions]);

  function resetQueueFilters() {
    setKeyword("");
    setMonthFilter("");
    setYearFilter("");
    setStatusFilter("");
  }

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
  const showApprovalDecisionButtons = false;
  const decisionOptions = useMemo(
    () => getWorkspaceDecisionOptions(config, selectedRecord, userDepartment),
    [
      approvalStageKey,
      config,
      selectedRecord?.id,
      selectedRecord?.status,
      selectedRecord?.updated_at,
      userDepartment,
    ]
  );
  const isKbLesSupportWorkspace =
    isApprovalWorkspace && userDepartment === "KB(LES)" && approvalStageKey === "kb_support";
  const workspaceActions =
    forceReadOnlyApprovalPanel
      ? []
      : getWorkspaceActions(config, selectedRecord, userDepartment);
  const canSubmitWorkspaceAction =
    !forceReadOnlyApprovalPanel && (isIklWorkspace || workspaceActions.length > 0);
  const canViewSelectedWorkspace =
    tableFirstWorkspace &&
    Boolean(selectedRecord) &&
    canViewWorkspaceRow(config, selectedRecord, userDepartment);
  const isReadOnlyActionPanel =
    tableFirstWorkspace &&
    canViewSelectedWorkspace &&
    (forceReadOnlyApprovalPanel || !canSubmitWorkspaceAction);
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
  const showIklKuVerificationReport =
    isIklWorkspace &&
    userDepartment === "KU(IKL)" &&
    normalizeStatus(selectedRecord?.status) === "technical_review_completed";
  const showWorkspaceVerificationReport =
    showApprovalTechnicalReport || showELicenseVerificationReport || showIklKuVerificationReport;
  const showWorkspaceDecisionLog =
    Boolean(selectedRecord) &&
    showActionPanel &&
    (
      fromPersonalTask ||
      isFocusedPersonalWorkspace ||
      isApprovalWorkspace ||
      ["screening", "technical", "payment", "license"].includes(config.key)
    );
  useEffect(() => {
    if (!forceReadOnlyApprovalPanel || !selectedRecord?.id) return;

    const nextSeenAt = markAdminApprovalRecordSeen(selectedRecord, currentUser);
    setAdminApprovalSeenAt(nextSeenAt);
  }, [
    currentUser?.email,
    currentUser?.id,
    currentUser?.pk,
    currentUser?.username,
    forceReadOnlyApprovalPanel,
    selectedRecord?.id,
    selectedRecord?.updated_at,
  ]);
  const isApprovalLicenseManagement =
    isApprovalWorkspace &&
    userDepartment === "PT(IKL)" &&
    ["license_issued", "license_revoked"].includes(normalizeStatus(selectedRecord?.status));
  const isApprovalSupportStage = isApprovalWorkspace && approvalStageKey === "support";
  const isFinalApprovalSupportWorkspace =
    isApprovalSupportWorkspace && hasSutApprovalResult(selectedRecord);
  const approvalSupportDecision =
    isApprovalSupportWorkspace && ["Approve", "Support", "Reject"].includes(decision)
      ? decision
      : "";
  const showApprovalSupportSignature = isSignedApprovalSupportDecision(approvalSupportDecision);
  const approvalSupportDecisionOptions = useMemo(
    () => getApprovalSupportDecisionOptions(isFinalApprovalSupportWorkspace),
    [isFinalApprovalSupportWorkspace]
  );
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
    : getActionUnavailableMessage(config, selectedRecord, userDepartment, t);
  const showActionUnavailableNotice =
    Boolean(actionUnavailableMessage) && !canSubmitWorkspaceAction;
  const showSavedApprovalDecisionMemo =
    isApprovalWorkspace && Boolean(savedApprovalDecisionHtml) && !isApprovalSupportWorkspace;
  const showApprovalSupportReadOnly =
    isReadOnlyActionPanel && (isApprovalSupportStage || Boolean(savedApprovalDecisionHtml));
  const showApprovalPaymentReadOnly =
    isApprovalWorkspace && isPostApprovalPaymentRecord(selectedRecord);
  const showApprovalMemoPreviews =
    !showApprovalTechnicalReport || showVerificationReport;
  const showPaymentReceiptDecision =
    config.key === "payment" &&
    userDepartment === "PT(IKL)" &&
    normalizeStatus(selectedRecord?.status) === "payment_submitted" &&
    workspaceActions.some((action) => action.requiresSubmittedReceipt);
  const showPaymentDocumentDecision =
    config.key === "payment" &&
    userDepartment === "PT(IKL)" &&
    workspaceActions.some((action) => action.requiresPaymentDocuments && !action.requiresSubmittedReceipt);
  const showPaymentTypedDecision = showPaymentReceiptDecision || showPaymentDocumentDecision;
  const useTypedApprovalDecision =
    isApprovalWorkspace &&
    canSubmitWorkspaceAction &&
    !isApprovalLicenseManagement &&
    !isApprovalSupportWorkspace &&
    !showApprovalDecisionButtons &&
    !showPaymentTypedDecision;
  const workspaceCommentRequired =
    workspaceActions.some((action) => action.requiresComment) ||
    useTypedApprovalDecision ||
    showPaymentTypedDecision;
  const showWorkspaceCommentField =
    !isApprovalLicenseManagement &&
    config.showComment &&
    canSubmitWorkspaceAction &&
    !isApprovalSupportWorkspace &&
    (
      config.key !== "payment" ||
      workspaceActions.some((action) =>
        action.requiresComment ||
        action.requiresPaymentDocuments ||
        action.requiresReceipt ||
        action.requiresSubmittedReceipt
      )
    );
  const showDetailsBeforeComment =
    config.key === "payment" &&
    (showPaymentDocumentDecision || workspaceActions.some((action) => action.requiresSubmittedReceipt));
  const paymentReceiptDecisionOptions = showPaymentReceiptDecision
    ? workspaceActions.filter((action) => action.requiresSubmittedReceipt)
    : [];
  const paymentDocumentDecisionOptions = showPaymentDocumentDecision
    ? workspaceActions
        .filter((action) => action.requiresPaymentDocuments && !action.requiresSubmittedReceipt)
        .map((action) => ({
          ...action,
          value: "Generate Approval Letter & Bill",
          label: "Generate Approval Letter & Bill",
          labelKey: "workspace.decision.generateApprovalLetterBill",
        }))
    : [];
  const paymentTypedDecisionOptions = showPaymentReceiptDecision
    ? paymentReceiptDecisionOptions
    : paymentDocumentDecisionOptions;
  const selectedPaymentReceiptAction = showPaymentReceiptDecision
    ? paymentReceiptDecisionOptions.find((action) => action.label === decision)
    : null;
  const selectedPaymentReceiptActionReady = Boolean(
    selectedPaymentReceiptAction &&
    (!selectedPaymentReceiptAction.requiresPaymentDocuments || hasUploadedPaymentDocuments(selectedRecord)) &&
    (!selectedPaymentReceiptAction.requiresOfficialReceipt ||
      getPaymentDocumentSource(getStoredPaymentDocument(selectedRecord, "official_receipt"))) &&
    (!selectedPaymentReceiptAction.requiresLicenseDocument ||
      getPaymentDocumentSource(selectedRecord?.form_data?.license?.license_file))
  );
  const selectedPaymentReceiptActionRequirementsReady =
    !selectedPaymentReceiptAction || selectedPaymentReceiptActionReady;
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
    setShowVerificationReport(shouldOpenVerificationReport);
  }, [selectedRecord?.id, shouldOpenVerificationReport]);

  useEffect(() => {
    setShowDecisionLog(false);
  }, [selectedRecord?.id]);

  useEffect(() => {
    const savedSignature =
      selectedRecord?.form_data?.management_recommendation?.digital_signature ||
      selectedRecord?.form_data?.approval?.digital_signature ||
      null;

    setApprovalSupportSignature(savedSignature);
    setApprovalSupportSignatureError("");
  }, [selectedRecord?.id]);

  useEffect(() => {
    if (isApprovalSupportWorkspace) {
      const nextDecision = isFinalApprovalSupportWorkspace ? "Approve" : "";
      setDecision(nextDecision);
      setDecisionInput(
        nextDecision
          ? getWorkspaceDecisionInput(nextDecision, approvalSupportDecisionOptions, t)
          : ""
      );
      setDecisionError("");
      setLicenseExpiryYears("1");
      return;
    }

    if (showPaymentTypedDecision && decision) {
      const preservedDecision =
        getWorkspaceDecisionFromInput(decision, paymentTypedDecisionOptions, t) || decision;
      const canPreservePaymentDecision = paymentTypedDecisionOptions.some(
        (action) => (action.value || action.label || action) === preservedDecision
      );

      if (canPreservePaymentDecision) {
        setDecision(preservedDecision);
        setDecisionInput(getWorkspaceDecisionInput(preservedDecision, paymentTypedDecisionOptions, t));
        setDecisionError("");
        setLicenseExpiryYears("1");
        return;
      }
    }

    const nextDecision = getDefaultWorkspaceDecision(config, selectedRecord, userDepartment);
    setDecision(nextDecision);
    setDecisionInput(
      useTypedApprovalDecision || showPaymentTypedDecision
        ? getWorkspaceDecisionInput(
            nextDecision,
            showPaymentTypedDecision ? paymentTypedDecisionOptions : decisionOptions,
            t
          )
        : ""
    );
    setDecisionError("");
    setLicenseExpiryYears("1");
  }, [
    approvalStageKey,
    approvalSupportDecisionOptions,
    canReuseSavedApprovalMemo,
    config,
    decisionOptions,
    isApprovalSupportWorkspace,
    selectedRecord?.id,
    showPaymentDocumentDecision,
    showPaymentReceiptDecision,
    showPaymentTypedDecision,
    t,
    useTypedApprovalDecision,
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

  async function saveTechnicalApplicationTypeSelection(
    nextSelection = technicalApplicationTypeSelection,
    nextSubtype = "",
    advertisementMeta = {}
  ) {
    if (!selectedRecord?.id) {
      setError(t("workspace.selectApplication", "Please select an application first."));
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const now = new Date().toISOString();
      const selectedTypes = normalizeApplicationTypeOptions(nextSelection);
      if (selectedTypes.length === 0) {
        setError(t("workspace.technical.applicationTypeRequired", "Please select at least one application type."));
        return;
      }
      const departments = getApplicationTypeTechnicalDepartmentsFromTypes(selectedTypes);
      const selectedType = selectedTypes[0];
      const subtype =
        normalizeApplicationSubtype(nextSubtype, selectedType) ||
        getDefaultApplicationSubtype(selectedType);
      const applicationTypeLabel = getApplicationTypeOptionsLabel(selectedTypes, "en", subtype);
      const step1 = selectedRecord.form_data?.step_1 || {};
      const existingSelection = selectedRecord.form_data?.technical_department_selection || {};
      const existingReferral = selectedRecord.form_data?.technical_referral || {};
      const existingDepartments = normalizeTechnicalDepartmentSelection(
        existingSelection.departments || existingReferral.participating_departments || []
      );
      const departmentsUnchanged =
        existingDepartments.length === departments.length &&
        departments.every((department) => existingDepartments.includes(department));
      const selectedAt = departmentsUnchanged && existingSelection.selected_at
        ? existingSelection.selected_at
        : now;
      const departmentsSelectedAt =
        departmentsUnchanged && existingReferral.departments_selected_at
          ? existingReferral.departments_selected_at
          : selectedAt;
      const advertisementRows = buildTechnicalAdvertisementRows(
        step1,
        selectedType,
        subtype,
        advertisementMeta
      );
      const primaryAdvertisementRow = advertisementRows[0] || {};
      const response = await apiRequest(`/applications/${selectedRecord.id}/`, {
        method: "PATCH",
        body: JSON.stringify({
          status: normalizeStatus(selectedRecord.status) || "technical_review",
          form_data: mergeFormData(selectedRecord, {
            step_1: {
              ...step1,
              application_type: selectedTypes.join(","),
              application_type_label: applicationTypeLabel,
              application_type_options: selectedTypes,
              application_subtype: subtype,
              application_subtype_label: getApplicationSubtypeLabel(selectedType, subtype, "en"),
              advertisement_rows: advertisementRows,
              advertisement_display_type: primaryAdvertisementRow.displayType,
              advertisement_display_type_label: getTechnicalDisplayTypeLabel(primaryAdvertisementRow.displayType, "en"),
              advertisement_type_custom_label: primaryAdvertisementRow.customLabel,
              advertisement_type_label: primaryAdvertisementRow.customLabel,
              project_category: applicationTypeLabel,
              technical_departments: departments,
            },
            technical_department_selection: {
              ...existingSelection,
              departments,
              application_type_options: selectedTypes,
              selected_by: "IKL (TECHNICAL)",
              selected_at: selectedAt,
            },
            technical_referral: {
              ...existingReferral,
              status: "Referred",
              source: existingReferral.source || "KU(IKL)",
              target: KU_TECHNICAL_MEMO_RECIPIENT,
              participating_departments: departments,
              departments_selected_at: departmentsSelectedAt,
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
      await fetchApplications({ silent: true });
      setSuccess(t("workspace.payment.documentDeleted", "Document deleted."));
    } catch (err) {
      setError(err.message || t("workspace.payment.documentDeleteFailed", "Document delete failed."));
    } finally {
      setSaving(false);
    }
  }

  async function uploadLicenseDocument(file) {
    if (!selectedRecord?.id || !file) return;

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const uploaded = await uploadApplicationDocument(
        selectedRecord.id,
        t("workspace.license.documentTitle", "Advertisement License"),
        file
      );
      const savedLicense = selectedRecord.form_data?.license || {};
      const licenseId = savedLicense.license_id || getLicenseId(selectedRecord);
      const nextLicense = {
        ...savedLicense,
        creation_mode: "upload",
        license_id: licenseId,
        license_file: uploaded,
        verification_url: getLicenseVerificationUrl(licenseId),
        uploaded_by: userDepartment,
        uploaded_at: new Date().toISOString(),
      };

      const response = await apiRequest(`/applications/${selectedRecord.id}/`, {
        method: "PATCH",
        body: JSON.stringify({
          form_data: mergeFormData(selectedRecord, {
            license: nextLicense,
          }),
        }),
      });

      setSelectedDetail(response?.data || response || selectedRecord);
      await fetchApplications({ silent: true });
      setSuccess(t("workspace.payment.documentUploaded", "Document uploaded."));
    } catch (err) {
      setError(err.message || t("workspace.payment.documentUploadFailed", "Document upload failed."));
    } finally {
      setSaving(false);
    }
  }

  async function deleteLicenseDocument(file) {
    if (!selectedRecord?.id || !file) return;

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      if (file.document_id || file.id) {
        await deleteApplicationDocument(selectedRecord.id, file.document_id || file.id);
      }

      const savedLicense = selectedRecord.form_data?.license || {};
      const nextLicense = {
        ...savedLicense,
        license_file: null,
        verification_url: "",
      };

      const response = await apiRequest(`/applications/${selectedRecord.id}/`, {
        method: "PATCH",
        body: JSON.stringify({
          form_data: mergeFormData(selectedRecord, {
            license: nextLicense,
          }),
        }),
      });

      setSelectedDetail(response?.data || response || selectedRecord);
      await fetchApplications({ silent: true });
      setSuccess(t("workspace.payment.documentDeleted", "Document deleted."));
    } catch (err) {
      setError(err.message || t("workspace.payment.documentDeleteFailed", "Document delete failed."));
    } finally {
      setSaving(false);
    }
  }

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
    const applicationSubtype =
      nextSite.application_subtype || getApplicationSubtypeFromApplication(selectedRecord);
    const preparedSite = mergeTechnicalFeeRowsCalculation({
      ...nextSite,
      application_subtype: applicationSubtype,
    });
    const technicalFee = calculateTechnicalFee({
      ...preparedSite,
      application_subtype: applicationSubtype,
    });
    const saved = selectedRecord.form_data?.technical_site_visit || {};
    const nextTechnicalSiteVisit = {
      ...saved,
      application_subtype: applicationSubtype,
      fee_schedule_key: technicalFee.scheduleKey,
      fee_schedule_no: technicalFee.scheduleNumber,
      site_photos: preparedSite.site_photos || saved.site_photos || [],
      site_photo: preparedSite.site_photos?.[0] || saved.site_photo || null,
      fee_date: preparedSite.fee_date || saved.fee_date || new Date().toISOString().slice(0, 10),
      fee_items: [],
      advertisement_rows: preparedSite.advertisement_rows || [],
      width_ft: preparedSite.width_ft || "",
      height_ft: preparedSite.height_ft || "",
      area_sqft: preparedSite.area_sqft || "",
      area_sqm: preparedSite.area_sqm || "",
      chargeable_area_sqm: preparedSite.chargeable_area_sqm || "",
      first_area_sqm: preparedSite.first_area_sqm || "",
      first_area_fee: preparedSite.first_area_fee || "",
      additional_area_sqm: preparedSite.additional_area_sqm || "0",
      additional_area_fee: preparedSite.additional_area_fee || "0",
      fee_total: preparedSite.fee_total || technicalFee.feeTotal,
      payable_total: preparedSite.payable_total || technicalFee.totalPayable,
      license_fee_calculation: preparedSite.license_fee_calculation || "",
      deposit_calculation: String(TECHNICAL_FIXED_DEPOSIT),
      processing_fee_calculation: String(TECHNICAL_PROCESSING_FEE),
      site_remarks: preparedSite.site_remarks || saved.site_remarks || "",
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
      setDecisionError(getWorkspaceDecisionInputPrompt(approvalSupportDecisionOptions, t));
      decisionInputRef.current?.focus();
      return;
    }

    if (!cleanRemark(comment)) {
      setCommentError(t("workspace.validation.remarksRequired", "Remarks are required."));
      commentRef.current?.focus();
      return;
    }

    const requiresSignature = isSignedApprovalSupportDecision(decisionValue);
    const supportSignature = requiresSignature ? approvalSupportSignature : null;

    if (requiresSignature && !supportSignature?.dataUrl) {
      setApprovalSupportSignatureError(
        t("workspace.signature.required", "Digital signature is required.")
      );
      return;
    }

    if (isFinalApprovalSupportWorkspace) {
      setDecision("Approve");
      submitAction(action, {
        decision: "Approve",
        comment: cleanRemark(comment),
        checkDecisionRemark: false,
        approvalDecisionHtml: "",
        approvalSupportSignature: supportSignature,
      });
      return;
    }

    submitAction(action, {
      decision: decisionValue,
      comment: cleanRemark(comment),
      checkDecisionRemark: decisionValue !== "Approve",
      approvalDecisionHtml: "",
      approvalSupportSignature: supportSignature,
    });
  }

  function submitApprovalDecisionButton(decisionValue) {
    const [action] = workspaceActions;
    if (!action) return;

    submitAction(action, { decision: decisionValue, checkDecisionRemark: false });
  }

  function submitWorkspaceAction(action) {
    if (showPaymentDocumentDecision) {
      if (!decision) {
        setDecisionError(getWorkspaceDecisionInputPrompt(paymentDocumentDecisionOptions, t));
        decisionInputRef.current?.focus();
        return;
      }

      if (!cleanRemark(comment)) {
        setCommentError(t("workspace.validation.remarksRequired", "Remarks are required."));
        commentRef.current?.focus();
        return;
      }
    }

    if (useTypedApprovalDecision) {
      if (!decision) {
        setDecisionError(getWorkspaceDecisionInputPrompt(decisionOptions, t));
        decisionInputRef.current?.focus();
        return;
      }

      if (!cleanRemark(comment)) {
        setCommentError(t("workspace.validation.remarksRequired", "Remarks are required."));
        commentRef.current?.focus();
        return;
      }
    }

    submitAction(action);
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

    if (config.showDecision && !isApprovalLicenseManagement && !actionDecision) {
      setError(t("workspace.decision.required", "Please select a recommendation."));
      return;
    }

    if ((action.requiresComment || requiresDecisionRemark) && !cleanedComment) {
      setCommentError(t("workspace.validation.remarksRequired", "Remarks are required."));
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
      !getPaymentDocumentSource(getStoredPaymentDocument(selectedRecord, "official_receipt"))
    ) {
      setError(t("workspace.payment.officialReceiptRequired", "Please upload the official receipt before submitting."));
      return;
    }

    if (action.requiresPaymentDocuments && !hasUploadedPaymentDocuments(selectedRecord)) {
      setError(t(
        "workspace.payment.documentsRequired",
        "Please upload the approval letter and bill before sending to the applicant."
      ));
      return;
    }

    if (
      action.requiresLicenseDocument &&
      !getPaymentDocumentSource(selectedRecord.form_data?.license?.license_file)
    ) {
      setError(t(
        "workspace.license.documentRequired",
        "Please upload the advertisement license file before submitting."
      ));
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

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
        approvalSupportSignature: overrides.approvalSupportSignature || null,
        kuChecks: overrides.kuChecks,
        officialReceiptMode: "upload",
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
      }

      if (tableFirstWorkspace && config.key === "approval" && isApprovalHistoryRecord(body)) {
        setSuccess(t(action.successKey, action.success));
        setComment("");
        setSelectedId("");
        setSelectedDetail(null);
        await fetchApplications({ silent: true });
        navigate("/dashboard/admin?view=approval", { replace: true });
        return true;
      }

      setSuccess(t(action.successKey, action.success));
      setComment("");
      await fetchApplications();
      if (isFocusedPersonalWorkspace || fromPersonalTask) {
        navigate("/dashboard/admin?view=personal");
        return true;
      }

      const refreshed =
        response?.data || (await apiRequest(`/applications/${selectedRecord.id}/`));

      if (tableFirstWorkspace && config.key === "approval" && isApprovalHistoryRecord(refreshed)) {
        setSelectedId("");
        setSelectedDetail(null);
        navigate("/dashboard/admin?view=approval");
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

  function openSelectedTask(app) {
    if (!app?.id) return;

    setSelectedId(String(app.id));
    const params = new URLSearchParams(location.search);
    params.set("id", app.id);
    if (config.key === "approval" && tableFirstWorkspace && !fromPersonalTask) {
      const nextSeenAt = markAdminApprovalRecordSeen(app, currentUser);
      setAdminApprovalSeenAt(nextSeenAt);
      params.set("readonly", "1");
    }
    navigate(`${location.pathname}?${params.toString()}`);
  }

  function returnToTaskList() {
    if (fromPersonalTask) {
      returnToPersonalTask();
      return;
    }

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
            bodyClassName="p-0"
          >
            {statusScopedApplications.length > 0 && (
              <div className="grid grid-cols-1 gap-3 px-4 pb-4 pt-4 lg:grid-cols-[minmax(240px,1fr)_180px_160px_160px_auto] lg:items-end">
                <Field label={t("common.search")}>
                  <input
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    className="form-input"
                    placeholder={t("workspace.search.placeholder")}
                  />
                </Field>

                <Field label={t("common.status")}>
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                    className="form-input"
                  >
                    <option value="">{t("common.allStatuses")}</option>
                    {statusOptions.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label={t("common.month")}>
                  <select
                    value={monthFilter}
                    onChange={(event) => setMonthFilter(event.target.value)}
                    className="form-input"
                  >
                    <option value="">{t("common.allMonths")}</option>
                    {getMonthOptions(t).map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label={t("common.year")}>
                  <select
                    value={yearFilter}
                    onChange={(event) => setYearFilter(event.target.value)}
                    className="form-input"
                  >
                    <option value="">{t("common.allYears")}</option>
                    {yearOptions.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </Field>

                <Button
                  type="button"
                  variant="secondary"
                  icon="filter_alt_off"
                  onClick={resetQueueFilters}
                  className="w-full lg:w-auto"
                >
                  {t("common.reset")}
                </Button>
              </div>
            )}

            <PaginatedWorkspaceTable
              t={t}
              loading={loading}
              rows={filtered}
              emptyText={t("workspace.empty")}
              columns={[
                {
                  key: "reference",
                  label: t("common.reference"),
                  className: "w-[10%] whitespace-nowrap",
                  render: (app) => {
                    const canOpenRow =
                      !isELicenseWorkspace || canOpenWorkspaceRow(config, app, userDepartment);
                    const showNewBadge =
                      isApprovalWorkspace &&
                      canOpenWorkspaceRow(config, app, userDepartment) &&
                      !isApprovalHistoryRecord(app) &&
                      isAdminApprovalRecordUnread(app, adminApprovalSeenAt);
                    const referenceContent = (
                      <span className="inline-flex items-center gap-2">
                        <span>{getApplicationReference(app)}</span>
                        {showNewBadge && (
                          <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase leading-none text-white">
                            {t("common.new", "New")}
                          </span>
                        )}
                      </span>
                    );

                    return isApprovalViewOnlyWorkspace || !canOpenRow ? (
                      <span className="font-semibold text-slate-900">
                        {referenceContent}
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
                        {referenceContent}
                      </button>
                    );
                  },
                },
                ...(isSimpleApprovalWorkspace
                  ? [
                      {
                        key: "applicant",
                        label: t("workspace.license.applicantName", "Applicant Name"),
                        className: "w-[16%] min-w-[12rem]",
                        render: (app) => (
                          <span className="font-medium text-slate-700">
                            {getRegisteredApplicantName(app) || "-"}
                          </span>
                        ),
                      },
                    ]
                  : []),
                {
                  key: "project",
                  label: t("common.project"),
                  className: isSimpleApprovalWorkspace
                    ? "w-[36%] min-w-[18rem]"
                    : "w-[52%] min-w-[18rem]",
                  render: (app) => (
                    <span className="block max-w-[42rem] whitespace-pre-line leading-5">
                      {getProjectName(app, language)}
                    </span>
                  ),
                },
                {
                  key: "status",
                  label: t("common.status"),
                  className: "w-[16%]",
                  render: (app) => (
                    <StatusPill value={getWorkspaceStatusLabel(app, config, t, userDepartment)} />
                  ),
                },
                {
                  key: "updated",
                  label: t("common.updated"),
                  className: "w-[14%] whitespace-nowrap",
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
                        className: "w-[8%] whitespace-nowrap",
                        render: (app) => {
                          if (!canViewWorkspaceRow(config, app, userDepartment)) return null;

                          const canActOnRow = canOpenWorkspaceRow(config, app, userDepartment);

                          return (
                            <button
                              type="button"
                              className="min-h-8 rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold leading-5 text-slate-700 hover:bg-slate-50"
                              onClick={() => openSelectedTask(app)}
                            >
                              {t("common.view", "View")}
                            </button>
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

        {!isFocusedPersonalWorkspace && tableFirstWorkspace && showActionPanel && (
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
                : fromPersonalTask
                  ? t("workspace.backToPersonalTask", "Back to Personal Task")
                  : t("workspace.backToELicenseList", "Back to E-Licenses List")}
            </Button>
          </div>
        )}

        {showActionPanel && (
          <Panel
            compact
            title={t("workspace.actionPanel")}
            description={
              isReadOnlyActionPanel
                ? showApprovalPaymentReadOnly
                  ? ""
                  : isApprovalHistoryRecord(selectedRecord)
                    ? t("workspace.approval.completedAction", "Final approval has been recorded.")
                    : ""
                : getWorkspaceActionDescription(config, t, userDepartment, selectedRecord)
            }
          >
            {!selectedRecord ? (
              <p className="text-sm text-slate-500">{t("workspace.selectApplication")}</p>
            ) : (
              <div className="space-y-4">
                <ApplicationSummary
                  app={selectedRecord}
                  uniformText={isFocusedPersonalWorkspace && userDepartment === "IKL (TECHNICAL)"}
                  labels={{
                    reference: t("common.reference", "Reference"),
                    selectedApplication: t("workspace.selectedApplication"),
                    defaultTitle: t("workspace.defaultApplicationTitle"),
                    applicant: t("common.applicant"),
                    type: t("common.type"),
                    status: t("common.status"),
                    location: t("workspace.location"),
                    created: t("common.created", "Created"),
                    updated: t("common.updated"),
                  }}
                  statusLabel={getWorkspaceStatusLabel(selectedRecord, config, t, userDepartment)}
                  applicationType={getLocalizedApplicationType(selectedRecord, t, language)}
                  actions={
                    isFocusedPersonalWorkspace || tableFirstWorkspace ? (
                      <Button
                        variant="secondary"
                        icon="visibility"
                        className="min-h-8 px-2.5 py-1 text-sm leading-5"
                        onClick={() => openSelectedFormView(selectedRecord.id)}
                      >
                        {t("workspace.openForm")}
                      </Button>
                    ) : null
                  }
                />

              {(showWorkspaceDecisionLog || showWorkspaceVerificationReport) && (
                <div className="flex flex-wrap justify-end gap-2">
                  {showWorkspaceDecisionLog && (
                    <Button
                      type="button"
                      variant="secondary"
                      icon="assignment"
                      onClick={() => setShowDecisionLog((visible) => !visible)}
                    >
                      {showDecisionLog
                        ? t("workspace.decisionLog.hide", "Hide Log Decision")
                        : t("workspace.decisionLog.show", "Log Decision")}
                    </Button>
                  )}

                  {showWorkspaceVerificationReport && (
                    <Button
                      type="button"
                      variant="secondary"
                      icon={showVerificationReport ? "visibility_off" : "visibility"}
                      onClick={() => setShowVerificationReport((visible) => !visible)}
                    >
                      {showVerificationReport
                        ? t("workspace.approval.hideVerificationReport", "Hide Verification Report")
                        : t("workspace.approval.verificationReport", "Verification Report")}
                    </Button>
                  )}
                </div>
              )}

              {isReadOnlyActionPanel &&
                !showDecisionLog &&
                !showVerificationReport &&
                !showApprovalPaymentReadOnly && (
                  <div className="rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-5 text-sky-950">
                    <p className="font-semibold">
                      {t("workspace.approval.readOnlyGuideTitle", "Read-only view")}
                    </p>
                    <p className="mt-1 text-sky-900">
                      {t(
                        "workspace.approval.readOnlyGuide",
                        "View the application, decisions, and verification report."
                      )}
                    </p>
                  </div>
                )}

              {showWorkspaceDecisionLog && showDecisionLog && (
                <WorkspaceDecisionLogReport
                  app={selectedRecord}
                  t={t}
                />
              )}

              {showActionUnavailableNotice && (
                <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold leading-5 text-amber-900 shadow-sm">
                  {actionUnavailableMessage}
                </p>
              )}

              {(showApprovalTechnicalReport || showELicenseVerificationReport) && showVerificationReport && (
                <ApprovalTechnicalReviewSummary
                  t={t}
                  language={language}
                  selectedRecord={selectedRecord}
                  technicalSite={technicalSite}
                  userDepartment={userDepartment}
                />
              )}

              {showApprovalPaymentReadOnly && (
                <PaymentDetails
                  app={selectedRecord}
                  t={t}
                  userDepartment={userDepartment}
                  saving={saving}
                  readOnly
                />
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
                  showKuVerificationReport={showVerificationReport}
                />
              ) : (
                <>
                  {config.showDecision &&
                    canSubmitWorkspaceAction &&
                    !isApprovalLicenseManagement &&
                    !isApprovalSupportWorkspace &&
                    !showApprovalDecisionButtons && (
                    <Field
                      label={
                        isMphlgApprovalWorkspace
                          ? t("common.decision", "Your Recommendation")
                          : t(config.decisionLabelKey || "common.decision", config.decisionLabel || "Your Recommendation")
                      }
                    >
                      {useTypedApprovalDecision ? (
                        <>
                          <input
                            ref={decisionInputRef}
                            type="text"
                            value={decisionInput}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              setDecisionInput(nextValue);
                              if (decisionError) setDecisionError("");
                              setDecision(getWorkspaceDecisionFromInput(nextValue, decisionOptions, t));
                            }}
                            onBlur={() => {
                              if (decision) {
                                setDecisionInput(getWorkspaceDecisionInput(decision, decisionOptions, t));
                              }
                            }}
                            className={`form-input w-full max-w-[28rem] ${decisionError ? "border-red-300 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(220,38,38,0.12)]" : ""}`}
                            placeholder={getWorkspaceDecisionInputPrompt(decisionOptions, t)}
                            inputMode="text"
                            aria-invalid={Boolean(decisionError)}
                          />
                          {decisionError && (
                            <p className="mt-1.5 text-[13px] font-medium leading-5 text-red-600">
                              {decisionError}
                            </p>
                          )}
                        </>
                      ) : (
                        <select
                          value={decision}
                          onChange={(event) => setDecision(event.target.value)}
                          className={`form-input ${tableFirstWorkspace || isDepartmentTechnicalWorkspace ? "max-w-xs" : ""}`}
                        >
                          {!isKbLesSupportWorkspace && (
                            <option value="">
                              {isMphlgApprovalWorkspace
                                ? t("workspace.decision.selectDecisionDashed", "--select recommendation--")
                                : t("workspace.decision.selectDecision", "Select recommendation")}
                            </option>
                          )}
                          {decisionOptions.map((item) => (
                            <option key={item.value || item} value={item.value || item}>
                              {t(item.labelKey, item.label || item)}
                            </option>
                          ))}
                        </select>
                      )}
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
                          onLicenseDocumentUpload={uploadLicenseDocument}
                          onLicenseDocumentDelete={deleteLicenseDocument}
                          onManualLicenseDraftChange={updateManualLicenseDraft}
                          paymentReceiptDecision={decision}
                        />
                      )
                    )
                  )}

                  {showPaymentTypedDecision && (
                    <Field
                      label={
                        showPaymentReceiptDecision ? (
                          <span className="relative inline-flex items-center gap-1.5">
                            <span>{t("common.decision", "Your Recommendation")}</span>
                            <WorkspaceGuidelineHint
                              text={t(
                                "workspace.payment.receiptDecisionHint",
                                "Please view the applicant receipt first, then type a recommendation before submitting."
                              )}
                            />
                          </span>
                        ) : (
                          t("common.decision", "Your Recommendation")
                        )
                      }
                      labelClassName="!text-[13px]"
                    >
                      <input
                        ref={decisionInputRef}
                        type="text"
                        value={decisionInput}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          const nextDecision = getWorkspaceDecisionFromInput(
                            nextValue,
                            paymentTypedDecisionOptions,
                            t
                          );
                          setDecisionInput(nextValue);
                          setDecision(nextDecision);
                          if (decisionError) setDecisionError("");
                          if (commentError) setCommentError("");
                        }}
                        onBlur={() => {
                          if (decision) {
                            setDecisionInput(
                              getWorkspaceDecisionInput(decision, paymentTypedDecisionOptions, t)
                            );
                          }
                        }}
                        className={`form-input form-input-sm max-w-xs ${decisionError ? "border-red-300 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(220,38,38,0.12)]" : ""}`}
                        placeholder={getWorkspaceDecisionInputPrompt(paymentTypedDecisionOptions, t)}
                        inputMode="text"
                        aria-invalid={Boolean(decisionError)}
                      />
                      {decisionError && (
                        <p className="mt-1.5 text-[13px] font-medium leading-5 text-red-600">
                          {decisionError}
                        </p>
                      )}
                    </Field>
                  )}

                  {showWorkspaceCommentField && (
                    <Field
                      label={
                        <>
                          {useTypedApprovalDecision
                            || showPaymentTypedDecision
                            ? t("workspace.comment.remarks", "Remarks")
                            : t(config.commentLabelKey, config.commentLabel || "Notes")}
                          {workspaceCommentRequired && (
                            <span className="ml-1 text-red-600">*</span>
                          )}
                        </>
                      }
                      labelClassName={showPaymentTypedDecision ? "!text-[13px]" : ""}
                    >
                      <textarea
                        ref={commentRef}
                        value={comment}
                        onChange={(event) => {
                          setComment(event.target.value);
                          if (commentError) setCommentError("");
                        }}
                        rows="5"
                        required={workspaceCommentRequired}
                        aria-required={workspaceCommentRequired}
                        aria-invalid={Boolean(commentError)}
                        className={`form-input ${showPaymentTypedDecision ? "form-input-sm" : ""} ${commentError ? "border-red-300 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(220,38,38,0.12)]" : ""}`}
                        placeholder={
                          showPaymentTypedDecision
                            ? t("workspace.comment.approvalPlaceholder", "Add comments")
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
                      <Field label={t("common.decision", "Your Recommendation")}>
                        <input
                          ref={decisionInputRef}
                          type="text"
                          value={decisionInput}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            const nextDecision = getWorkspaceDecisionFromInput(
                              nextValue,
                              approvalSupportDecisionOptions,
                              t
                            );
                            setDecisionInput(nextValue);
                            if (decisionError) setDecisionError("");
                            setDecision(nextDecision);
                            if (!isSignedApprovalSupportDecision(nextDecision)) {
                              setApprovalSupportSignature(null);
                              setApprovalSupportSignatureError("");
                            }
                          }}
                          onBlur={() => {
                            if (decision) {
                              setDecisionInput(
                                getWorkspaceDecisionInput(
                                  decision,
                                  approvalSupportDecisionOptions,
                                  t
                                )
                              );
                            }
                          }}
                          className={`form-input w-full max-w-[28rem] ${decisionError ? "border-red-300 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(220,38,38,0.12)]" : ""}`}
                          placeholder={getWorkspaceDecisionInputPrompt(approvalSupportDecisionOptions, t)}
                          inputMode="text"
                          aria-invalid={Boolean(decisionError)}
                        />
                        {decisionError && (
                          <p className="mt-1.5 text-[13px] font-medium leading-5 text-red-600">
                            {decisionError}
                          </p>
                        )}
                      </Field>
                      <Field
                        label={
                          <>
                            {t("workspace.comment.approvalRemarks", "Remarks")}
                            <span className="ml-1 text-red-600">*</span>
                          </>
                        }
                      >
                        <textarea
                          ref={commentRef}
                          value={comment}
                          onChange={(event) => {
                            setComment(event.target.value);
                            if (commentError) setCommentError("");
                          }}
                          rows="5"
                          required
                          aria-required
                          aria-invalid={Boolean(commentError)}
                          className={`form-input ${commentError ? "border-red-300 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(220,38,38,0.12)]" : ""}`}
                          placeholder={t("workspace.comment.approvalRemarksPlaceholder", "Enter approval remarks.")}
                        />
                        {commentError && (
                          <p className="mt-1.5 text-[13px] font-medium leading-5 text-red-600">
                            {commentError}
                          </p>
                        )}
                      </Field>
                      {showApprovalSupportSignature && (
                        <ApprovalSupportSignatureBox
                          t={t}
                          value={approvalSupportSignature}
                          error={approvalSupportSignatureError}
                          onChange={(nextSignature) => {
                            setApprovalSupportSignature(nextSignature);
                            if (approvalSupportSignatureError) setApprovalSupportSignatureError("");
                          }}
                          onError={setApprovalSupportSignatureError}
                        />
                      )}
                    </>
                  )}

                  {showSiteVisitFields && (
                    <TechnicalSiteVisitFields
                      t={t}
                      language={language}
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
                        const cycleId =
                          technicalSite.cycle_id ||
                          selectedRecord.form_data?.technical_review_cycle ||
                          "";
                        const cyclePhotos = sitePhotos.map((photo) => ({
                          ...photo,
                          cycle_id: cycleId,
                        }));
                        setTechnicalSite((prev) => ({
                          ...prev,
                          site_photos: [...(prev.site_photos || []), ...cyclePhotos],
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
                        onLicenseDocumentUpload={uploadLicenseDocument}
                        onLicenseDocumentDelete={deleteLicenseDocument}
                        onManualLicenseDraftChange={updateManualLicenseDraft}
                        paymentReceiptDecision={decision}
                      />
                    )
                  )}

                  {(canSubmitWorkspaceAction || showBottomFormButton) && (
                    <div className={actionGridClass}>
                      {showBottomFormButton && (
                        <Button
                          variant="secondary"
                          className="min-h-8 w-full px-2.5 py-1 text-[13px] leading-5"
                          icon="visibility"
                          onClick={() => openSelectedFormView(selectedRecord.id)}
                        >
                          {t("workspace.openForm")}
                        </Button>
                      )}
                      {canSubmitWorkspaceAction &&
                      (isApprovalSupportWorkspace || canSendSavedApprovalMemoToMphlg) ? (
                        <Button
                          onClick={() =>
                            submitApprovalSupport(
                              isFinalApprovalSupportWorkspace || canSendSavedApprovalMemoToMphlg
                                ? "Approve"
                                : approvalSupportDecision
                            )
                          }
                          disabled={saving}
                          variant="primary"
                          icon="check_circle"
                          className="min-w-40"
                        >
                          {saving ? t("workspace.saving") : t("common.submit", "Submit")}
                        </Button>
                      ) : canSubmitWorkspaceAction && showPaymentReceiptDecision ? (
                        <Button
                          onClick={() => {
                            if (!selectedPaymentReceiptAction) {
                              setDecisionError(getWorkspaceDecisionInputPrompt(paymentReceiptDecisionOptions, t));
                              decisionInputRef.current?.focus();
                              return;
                            }

                            if (!cleanRemark(comment)) {
                              setCommentError(t("workspace.validation.remarksRequired", "Remarks are required."));
                              commentRef.current?.focus();
                              return;
                            }

                            submitAction(selectedPaymentReceiptAction, {
                              decision,
                              comment: cleanRemark(comment),
                              checkDecisionRemark: false,
                            });
                          }}
                          disabled={saving || !selectedPaymentReceiptActionRequirementsReady}
                          variant="primary"
                          icon={selectedPaymentReceiptAction?.label === "Reject Receipt" ? "send" : "qr_code_2"}
                          className="min-w-40"
                        >
                          {saving
                            ? t("workspace.saving")
                            : selectedPaymentReceiptAction?.label === "Reject Receipt"
                              ? t("common.submit", "Submit")
                              : t("workspace.action.issueLicense", "Issue License")}
                        </Button>
                      ) : canSubmitWorkspaceAction && showApprovalDecisionButtons ? (
                        <>
                          <Button
                            onClick={() => submitApprovalDecisionButton("Reject")}
                            disabled={saving}
                            variant="danger"
                            icon="cancel"
                            className="min-w-40"
                          >
                            {t("workspace.decision.notApprove", "Not Approve")}
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
                      ) : canSubmitWorkspaceAction ? (
                        workspaceActions.map((action) => (
                          <Button
                            key={action.label}
                            onClick={() => submitWorkspaceAction(action)}
                            disabled={saving}
                            variant={action.variant || "primary"}
                            icon={action.icon}
                            className={tableFirstWorkspace || isDepartmentTechnicalWorkspace ? "min-w-40" : "w-full"}
                          >
                            {saving ? t("workspace.saving") : t(action.labelKey, action.label)}
                          </Button>
                        ))
                      ) : null}
                    </div>
                  )}
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

    </AdminDashboardLayout>
  );
}

function WorkspaceDecisionLogReport({ app, t }) {
  const logs = buildWorkspaceDecisionLogRows(app, t);

  return (
    <section className="rounded-md border border-slate-300 bg-white">
      {logs.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-white text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="border-b border-slate-200 px-4 py-3">
                  {t("common.department", "Department")}
                </th>
                <th className="border-b border-slate-200 px-4 py-3">
                  {t("admin.dashboard.decisionLogRecommendation", "Your Recommendation")}
                </th>
                <th className="border-b border-slate-200 px-4 py-3">
                  {t("common.remarks", "Remarks")}
                </th>
                <th className="whitespace-nowrap border-b border-slate-200 px-4 py-3">
                  {t("workspace.signature.title", "Digital Signature")}
                </th>
                <th className="whitespace-nowrap border-b border-slate-200 px-4 py-3">
                  {t("common.date", "Date")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => (
                <tr key={log.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">
                    {log.department}
                  </td>
                  <td className="px-4 py-3">
                    {log.decision ? <StatusPill value={log.decision} /> : null}
                  </td>
                  <td className="min-w-[320px] px-4 py-3 text-slate-700">
                    <p className="whitespace-pre-line leading-5">{log.remarks || "-"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <DecisionLogSignatureCell
                      department={log.department}
                      signature={log.signature}
                      t={t}
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {formatCompactDateTime(log.date)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-4 py-4 text-sm font-medium text-slate-500">
          {t("admin.dashboard.noDecisionLogs", "No DBKU or MPHLG decision records found.")}
        </p>
      )}
    </section>
  );
}

function DecisionLogSignatureCell({ department, signature, t }) {
  const signatureSource = getDecisionLogSignatureSource(signature);

  if (!signatureSource) {
    return <span className="text-slate-400">-</span>;
  }

  if (isApprovalSupportDecisionLogDepartment(department)) {
    return (
      <DecisionLogSignatureConfirmation
        signature={signature}
        signatureSource={signatureSource}
        t={t}
      />
    );
  }

  return (
    <span
      className="inline-flex min-h-12 min-w-28 items-center justify-center rounded-md border border-slate-200 bg-white p-1.5 shadow-sm"
      title={t("workspace.signature.previewAlt", "Digital signature preview")}
    >
      <img
        src={signatureSource}
        alt={t("workspace.signature.previewAlt", "Digital signature preview")}
        className="max-h-10 max-w-28 object-contain"
      />
    </span>
  );
}

function DecisionLogSignatureConfirmation({ signature, signatureSource, t }) {
  const signatureDetails = signature && typeof signature === "object" ? signature : {};
  const uploadedItems = Array.isArray(signatureDetails.items) ? signatureDetails.items : [];
  const drawPreviewDataUrl =
    signatureDetails.drawDataUrl ||
    (signatureDetails.mode === "draw" ? signatureSource : "");
  const shouldRenderComposedUpload =
    !uploadedItems.length && signatureDetails.mode === "upload" && signatureSource;
  const rows = [
    {
      key: "signatureStamp",
      label: t("workspace.signature.signatureAndStamp", "SIGNATURE & STAMP"),
    },
    {
      key: "name",
      label: t("workspace.signature.name", "NAME"),
    },
    {
      key: "position",
      label: t("workspace.signature.position", "POSITION"),
    },
    {
      key: "agency",
      label: t("workspace.signature.agency", "AGENCY"),
    },
    {
      key: "date",
      label: t("workspace.signature.date", "DATE"),
    },
  ];

  return (
    <div className="h-[200px] w-[380px] overflow-hidden">
      <div
        className="w-[760px] rounded border border-dashed border-slate-300 bg-white px-5 py-6 text-[13px] font-semibold uppercase leading-5 text-slate-950"
        style={{ transform: "scale(0.5)", transformOrigin: "top left" }}
      >
        <p className="text-[14px] font-bold">
          {t("workspace.signature.confirmationTitle", "CONFIRMATION")}
        </p>

        <div className="relative mt-4 grid grid-cols-[minmax(145px,220px)_14px_minmax(0,1fr)] grid-rows-[9rem_repeat(4,2rem)] gap-x-2 gap-y-4">
          {(uploadedItems.length > 0 || shouldRenderComposedUpload) && (
            <div className="pointer-events-none relative z-20 col-start-3 row-start-1 row-span-5 overflow-hidden">
              {uploadedItems.length > 0 ? (
                uploadedItems.map((item, index) => (
                  <img
                    key={item.id || `${item.fileName || "signature"}-${index}`}
                    src={item.dataUrl || signatureSource}
                    alt={t("workspace.signature.previewAlt", "Digital signature preview")}
                    className="absolute max-h-full max-w-full select-none object-contain"
                    draggable={false}
                    style={{
                      left: `${item.x ?? 50}%`,
                      top: `${item.y ?? 50}%`,
                      width: `${item.width ?? 38}%`,
                      transform: "translate(-50%, -50%)",
                    }}
                  />
                ))
              ) : (
                <img
                  src={signatureSource}
                  alt={t("workspace.signature.previewAlt", "Digital signature preview")}
                  className="absolute inset-0 h-full w-full select-none object-fill"
                  draggable={false}
                />
              )}
            </div>
          )}

          <div className="relative col-start-3 row-start-1">
            {drawPreviewDataUrl && (
              <img
                src={drawPreviewDataUrl}
                alt={t("workspace.signature.previewAlt", "Digital signature preview")}
                className="absolute inset-0 z-30 h-full w-full select-none object-fill"
                draggable={false}
              />
            )}
          </div>

          {rows.map((row, index) => (
            <Fragment key={row.key}>
              <div className="col-start-1 flex items-end" style={{ gridRow: index + 1 }}>
                <p>{row.label}</p>
              </div>
              <span className="col-start-2 flex items-end pb-1" style={{ gridRow: index + 1 }}>:</span>
              <div
                className="col-start-3 flex min-w-0 items-end border-b border-slate-900 pb-1"
                style={{ gridRow: index + 1 }}
              >
                <span className="min-w-0 truncate">{signatureDetails[row.key] || ""}</span>
              </div>
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

function PaginatedWorkspaceTable({ rows, t, ...props }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(rows.length / WORKSPACE_TABLE_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const visibleRows = rows.slice(
    currentPage * WORKSPACE_TABLE_PAGE_SIZE,
    (currentPage + 1) * WORKSPACE_TABLE_PAGE_SIZE
  );

  return (
    <div className="bg-white">
      <DataTable {...props} rows={visibleRows} framed={false} />
      {!props.loading && (
        <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            {t("applicant.recentActivitiesPage", "Page")} {currentPage + 1} {t("common.of", "of")} {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPage(Math.max(currentPage - 1, 0))}
              disabled={currentPage === 0}
            >
              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
              {t("common.previous", "Previous")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPage(Math.min(currentPage + 1, totalPages - 1))}
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
              "This memo will be submitted with the approval recommendation."
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

function ApprovalSupportSignatureBox({ t, value, error, onChange, onError }) {
  const canvasRef = useRef(null);
  const uploadAreaRef = useRef(null);
  const fileInputRef = useRef(null);
  const drawingRef = useRef(false);
  const hasDrawingRef = useRef(false);
  const uploadDragRef = useRef(null);
  const uploadResizeRef = useRef(null);
  const suppressUploadClickUntilRef = useRef(0);
  const [mode, setMode] = useState(value?.mode === "upload" ? "upload" : "draw");
  const [isDrawingEnabled, setIsDrawingEnabled] = useState(value?.mode !== "upload");
  const [activeUploadItemId, setActiveUploadItemId] = useState("");
  const signatureCanvasSize = useMemo(() => ({ width: 1200, height: 300 }), []);
  const uploadCanvasSize = useMemo(() => ({ width: 1200, height: 360 }), []);
  const uploadedItems = useMemo(() => {
    if (Array.isArray(value?.items)) return value.items;
    if (value?.mode === "upload" && value?.dataUrl) {
      return [
        {
          id: "legacy-upload",
          dataUrl: value.dataUrl,
          fileName: value.fileName || "signature.png",
          type: value.type || "image/png",
          size: value.size || 0,
          x: 50,
          y: 50,
          width: 38,
        },
      ];
    }
    return [];
  }, [value]);
  const activeUploadedItem = useMemo(
    () => uploadedItems.find((item) => item.id === activeUploadItemId) || null,
    [activeUploadItemId, uploadedItems]
  );

  useEffect(() => {
    if (value?.mode === "upload") {
      setMode("upload");
      return;
    }

    if (value?.mode === "draw") {
      setMode("draw");
    }
  }, [value?.mode]);

  useEffect(() => {
    if (!uploadedItems.length) {
      setActiveUploadItemId("");
      return;
    }

    if (activeUploadItemId && !uploadedItems.some((item) => item.id === activeUploadItemId)) {
      setActiveUploadItemId("");
    }
  }, [activeUploadItemId, uploadedItems]);

  useEffect(() => {
    if (!isDrawingEnabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(signatureCanvasSize.width * ratio);
    canvas.height = Math.round(signatureCanvasSize.height * ratio);
    const context = canvas.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 2;
    context.strokeStyle = "#0f172a";
    hasDrawingRef.current = false;

    const drawDataUrl = value?.drawDataUrl || (value?.mode === "draw" ? value?.dataUrl : "");
    if (!drawDataUrl) return;

    const image = new Image();
    image.onload = () => {
      context.clearRect(0, 0, signatureCanvasSize.width, signatureCanvasSize.height);
      context.drawImage(image, 0, 0, signatureCanvasSize.width, signatureCanvasSize.height);
      hasDrawingRef.current = true;
    };
    image.src = drawDataUrl;
  }, [isDrawingEnabled, signatureCanvasSize, value?.dataUrl, value?.drawDataUrl, value?.mode]);

  function getCanvasPoint(event) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * signatureCanvasSize.width,
      y: ((event.clientY - rect.top) / rect.height) * signatureCanvasSize.height,
    };
  }

  function getSignatureDataUrl({ fillBackground = false } = {}) {
    const sourceCanvas = canvasRef.current;
    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = signatureCanvasSize.width * 2;
    outputCanvas.height = signatureCanvasSize.height * 2;
    const outputContext = outputCanvas.getContext("2d");
    if (fillBackground) {
      outputContext.fillStyle = "#ffffff";
      outputContext.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
    } else {
      outputContext.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
    }
    outputContext.drawImage(sourceCanvas, 0, 0, outputCanvas.width, outputCanvas.height);
    return outputCanvas.toDataURL("image/png");
  }

  function beginDraw(event) {
    if (!isDrawingEnabled) return;
    event.preventDefault();
    event.stopPropagation();
    const canvas = canvasRef.current;
    canvas.setPointerCapture?.(event.pointerId);
    const context = canvas.getContext("2d");
    const point = getCanvasPoint(event);
    drawingRef.current = true;
    hasDrawingRef.current = true;
    context.beginPath();
    context.moveTo(point.x, point.y);
  }

  function continueDraw(event) {
    if (!drawingRef.current || !isDrawingEnabled) return;
    event.preventDefault();
    event.stopPropagation();
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    const point = getCanvasPoint(event);
    context.lineTo(point.x, point.y);
    context.stroke();
  }

  async function finishDraw(event) {
    if (!drawingRef.current || !isDrawingEnabled) return;
    event.preventDefault();
    event.stopPropagation();
    canvasRef.current?.releasePointerCapture?.(event.pointerId);
    drawingRef.current = false;
    suppressUploadClickUntilRef.current = Date.now() + 500;

    if (!hasDrawingRef.current) return;
    const drawDataUrl = getSignatureDataUrl();
    if (uploadedItems.length) {
      await commitUploadedItems(uploadedItems, { drawDataUrl });
      return;
    }

    onChange({
      ...(value || {}),
      mode: "draw",
      dataUrl: drawDataUrl,
      drawDataUrl,
      fileName: "digital_signature.png",
      type: "image/png",
      updatedAt: new Date().toISOString(),
    });
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas
        .getContext("2d")
        .clearRect(0, 0, signatureCanvasSize.width, signatureCanvasSize.height);
    }
    hasDrawingRef.current = false;
    if (fileInputRef.current) fileInputRef.current.value = "";
    onChange(null);
  }

  function readSignatureFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          dataUrl: String(reader.result || ""),
          fileName: file.name,
          type: file.type,
          size: file.size,
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function loadSignatureImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = dataUrl;
    });
  }

  async function composeUploadedSignature(items, drawDataUrl = "") {
    if (!items.length && !drawDataUrl) return "";

    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = uploadCanvasSize.width;
    outputCanvas.height = uploadCanvasSize.height;
    const outputContext = outputCanvas.getContext("2d");
    outputContext.clearRect(0, 0, outputCanvas.width, outputCanvas.height);

    if (items.length) {
      await Promise.all(
        items.map(async (item) => {
          const image = await loadSignatureImage(item.dataUrl);
          const width = outputCanvas.width * ((Number(item.width) || 38) / 100);
          const height = width * (image.naturalHeight / image.naturalWidth);
          const x = outputCanvas.width * ((Number(item.x) || 50) / 100) - width / 2;
          const y = outputCanvas.height * ((Number(item.y) || 50) / 100) - height / 2;
          outputContext.drawImage(image, x, y, width, height);
        })
      );
    }

    if (drawDataUrl) {
      const drawingImage = await loadSignatureImage(drawDataUrl);
      outputContext.drawImage(
        drawingImage,
        0,
        0,
        outputCanvas.width,
        signatureCanvasSize.height
      );
    }

    return outputCanvas.toDataURL("image/png");
  }

  async function commitUploadedItems(items, overrides = {}) {
    const drawDataUrl = overrides.drawDataUrl ?? value?.drawDataUrl ?? "";
    const dataUrl = await composeUploadedSignature(items, drawDataUrl);
    onChange({
      ...(value || {}),
      ...overrides,
      mode: "upload",
      items,
      dataUrl,
      drawDataUrl,
      fileName: items.map((item) => item.fileName).join(", "),
      type: "image/png",
      updatedAt: new Date().toISOString(),
    });
  }

  async function updateUploadedItemWidth(itemId, width, { commit = false } = {}) {
    const nextWidth = Math.min(200, Math.max(12, Number(width) || 38));
    const nextItems = uploadedItems.map((item) =>
      item.id === itemId ? { ...item, width: nextWidth } : item
    );

    if (commit) {
      await commitUploadedItems(nextItems);
      return;
    }

    onChange({
      ...(value || {}),
      mode: "upload",
      items: nextItems,
      dataUrl: value?.dataUrl || nextItems[0]?.dataUrl || "",
      updatedAt: new Date().toISOString(),
    });
  }

  function beginUploadResize(event, itemId, corner) {
    if (!uploadedItems.length) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = uploadAreaRef.current?.getBoundingClientRect();
    const item = uploadedItems.find((candidate) => candidate.id === itemId);
    if (!rect || !item) return;

    setActiveUploadItemId(itemId);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    uploadResizeRef.current = {
      itemId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: Number(item.width) || 38,
      direction: corner.includes("right") ? 1 : -1,
      containerWidth: rect.width,
    };
  }

  function moveUploadResize(event) {
    const resize = uploadResizeRef.current;
    if (!resize) return;
    event.preventDefault();
    event.stopPropagation();

    const deltaPercent =
      ((event.clientX - resize.startX) / Math.max(resize.containerWidth, 1)) *
      100 *
      2 *
      resize.direction;
    void updateUploadedItemWidth(resize.itemId, resize.startWidth + deltaPercent);
  }

  async function finishUploadResize(event) {
    const resize = uploadResizeRef.current;
    if (!resize) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.releasePointerCapture?.(resize.pointerId);
    uploadResizeRef.current = null;

    const deltaPercent =
      ((event.clientX - resize.startX) / Math.max(resize.containerWidth, 1)) *
      100 *
      2 *
      resize.direction;
    await updateUploadedItemWidth(resize.itemId, resize.startWidth + deltaPercent, {
      commit: true,
    });
  }

  async function handleFileChange(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    if (files.some((file) => !file.type.startsWith("image/"))) {
      onError(t("workspace.signature.imageOnly", "Please upload an image file for the signature."));
      event.target.value = "";
      return;
    }

    try {
      const readFiles = await Promise.all(files.map(readSignatureFile));
      const baseItems = value?.mode === "upload" ? uploadedItems : [];
      const newItems = readFiles.map((file, index) => ({
        ...file,
        id: `${Date.now()}-${index}-${file.fileName}`,
        x: Math.min(70, 42 + index * 8),
        y: Math.min(70, 42 + index * 8),
        width: 38,
      }));
      setMode("upload");
      setIsDrawingEnabled(false);
      setActiveUploadItemId(newItems[newItems.length - 1]?.id || "");
      await commitUploadedItems([...baseItems, ...newItems]);
    } catch (err) {
      console.error("Failed to read signature file:", err);
      onError(t("workspace.signature.uploadFailed", "Could not read the signature file."));
    } finally {
      event.target.value = "";
    }
  }

  function openSignatureFilePicker() {
    if (Date.now() < suppressUploadClickUntilRef.current) return;
    fileInputRef.current?.click();
  }

  function updateSignatureText(field, text) {
    onChange({
      ...(value || {}),
      mode: value?.mode || mode,
      [field]: text,
    });
  }

  function getUploadPointerPosition(event) {
    const rect = uploadAreaRef.current?.getBoundingClientRect();
    if (!rect) return { x: 50, y: 50 };
    return {
      x: Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100)),
      y: Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100)),
    };
  }

  function clearUploadSelection(event) {
    if (
      event.target.closest("[data-signature-upload-item]") ||
      event.target.closest("[data-signature-upload-handle]")
    ) {
      return;
    }

    setActiveUploadItemId("");
  }

  function beginUploadDrag(event, itemId) {
    if (!uploadedItems.length) return;
    event.preventDefault();
    event.stopPropagation();
    const item = uploadedItems.find((candidate) => candidate.id === itemId);
    const point = getUploadPointerPosition(event);
    if (!item) return;
    setActiveUploadItemId(itemId);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    uploadDragRef.current = {
      itemId,
      pointerId: event.pointerId,
      offsetX: point.x - (Number(item.x) || 50),
      offsetY: point.y - (Number(item.y) || 50),
    };
  }

  function moveUploadDrag(event) {
    const drag = uploadDragRef.current;
    if (!drag) return;
    event.preventDefault();
    event.stopPropagation();
    const point = getUploadPointerPosition(event);
    const nextX = Math.min(100, Math.max(0, point.x - (Number(drag.offsetX) || 0)));
    const nextY = Math.min(100, Math.max(0, point.y - (Number(drag.offsetY) || 0)));
    const nextItems = uploadedItems.map((item) =>
      item.id === drag.itemId ? { ...item, x: nextX, y: nextY } : item
    );
    onChange({
      ...(value || {}),
      mode: "upload",
      items: nextItems,
      dataUrl: value?.dataUrl || nextItems[0]?.dataUrl || "",
      updatedAt: new Date().toISOString(),
    });
  }

  async function finishUploadDrag(event) {
    const drag = uploadDragRef.current;
    if (!drag) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.releasePointerCapture?.(drag.pointerId);
    uploadDragRef.current = null;
    const point = getUploadPointerPosition(event);
    const nextX = Math.min(100, Math.max(0, point.x - (Number(drag.offsetX) || 0)));
    const nextY = Math.min(100, Math.max(0, point.y - (Number(drag.offsetY) || 0)));
    const nextItems = uploadedItems.map((item) =>
      item.id === drag.itemId ? { ...item, x: nextX, y: nextY } : item
    );
    await commitUploadedItems(nextItems);
  }

  async function removeUploadedItem(itemId) {
    const nextItems = uploadedItems.filter((item) => item.id !== itemId);
    setActiveUploadItemId(nextItems[nextItems.length - 1]?.id || "");
    await commitUploadedItems(nextItems);
  }

  const confirmationRows = [
    {
      key: "signatureStamp",
      label: t("workspace.signature.signatureAndStamp", "SIGNATURE & STAMP"),
    },
    {
      key: "name",
      label: t("workspace.signature.name", "NAME"),
      capture: true,
    },
    {
      key: "position",
      label: t("workspace.signature.position", "POSITION"),
    },
    {
      key: "agency",
      label: t("workspace.signature.agency", "AGENCY"),
    },
    {
      key: "date",
      label: t("workspace.signature.date", "DATE"),
    },
  ];
  const drawPreviewDataUrl = value?.drawDataUrl || (value?.mode === "draw" ? value?.dataUrl : "");
  const uploadResizeHandles = [
    { corner: "top-left", className: "-left-1.5 -top-1.5 cursor-nwse-resize" },
    { corner: "top-right", className: "-right-1.5 -top-1.5 cursor-nesw-resize" },
    { corner: "bottom-left", className: "-bottom-1.5 -left-1.5 cursor-nesw-resize" },
    { corner: "bottom-right", className: "-bottom-1.5 -right-1.5 cursor-nwse-resize" },
  ];

  return (
    <div>
      <span className="mb-1.5 block text-[14px] font-semibold leading-5 text-slate-700">
          {t("workspace.signature.title", "Digital Signature")}
          <span className="ml-1 text-red-600">*</span>
      </span>
      <div
        className={`max-w-3xl rounded border bg-white p-3 ${error ? "border-red-300 shadow-[0_0_0_3px_rgba(220,38,38,0.08)]" : "border-slate-200"}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            icon="upload_file"
            className="min-h-8 px-3 py-1.5 text-[13px]"
            onClick={openSignatureFilePicker}
          >
            {t("workspace.signature.upload", "Upload File")}
          </Button>
          <Button
            type="button"
            variant={isDrawingEnabled ? "primary" : "secondary"}
            icon="draw"
            className="min-h-8 px-3 py-1.5 text-[13px]"
            onClick={() => {
              setMode("draw");
              setIsDrawingEnabled((current) => !current);
            }}
          >
            {t("workspace.signature.draw", "Draw Signature")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            icon="backspace"
            className="min-h-8 px-3 py-1.5 text-[13px]"
            onClick={clearSignature}
          >
            {t("common.clear", "Clear")}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        <div className={`rounded border border-dashed bg-white px-5 py-6 ${error ? "border-red-300" : "border-slate-300"}`}>
          <p className="text-[14px] font-bold uppercase tracking-wide text-slate-950">
            {t("workspace.signature.confirmationTitle", "CONFIRMATION")}
          </p>

          <div
            className="relative mt-4 grid grid-cols-[minmax(145px,220px)_14px_minmax(0,1fr)] grid-rows-[9rem_repeat(4,2rem)] gap-x-2 gap-y-4 text-[13px] font-semibold uppercase leading-5 text-slate-950"
            onPointerDown={clearUploadSelection}
          >
            {uploadedItems.length > 0 && (
              <div
                ref={uploadAreaRef}
                className="pointer-events-none relative z-20 col-start-3 row-start-1 row-span-5 overflow-hidden"
              >
                {uploadedItems.map((item) => (
                  <div
                    key={item.id}
                    data-signature-upload-item
                    className="pointer-events-auto absolute cursor-move touch-none select-none"
                    style={{
                      left: `${item.x}%`,
                      top: `${item.y}%`,
                      width: `${item.width}%`,
                      transform: "translate(-50%, -50%)",
                    }}
                    onPointerDown={(event) => beginUploadDrag(event, item.id)}
                    onPointerMove={moveUploadDrag}
                    onPointerUp={finishUploadDrag}
                    onPointerCancel={finishUploadDrag}
                  >
                    <img
                      src={item.dataUrl}
                      alt={t("workspace.signature.previewAlt", "Digital signature preview")}
                      className="block h-auto w-full max-w-none select-none object-contain"
                      draggable={false}
                    />

                    {item.id === activeUploadedItem?.id && (
                      <>
                        <span className="pointer-events-none absolute inset-0 border-2 border-emerald-600/70" />
                        <button
                          type="button"
                          data-signature-upload-delete
                          aria-label={t("workspace.signature.deleteImage", "Delete image")}
                          title={t("workspace.signature.deleteImage", "Delete image")}
                          className="absolute -right-2 -top-2 z-40 flex h-5 w-5 items-center justify-center rounded-sm border border-red-700 bg-red-600 text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
                          onPointerDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            removeUploadedItem(item.id);
                          }}
                        >
                          <Icon name="close" className="text-[14px]" />
                        </button>
                        {uploadResizeHandles.map((handle) => (
                          <span
                            key={handle.corner}
                            data-signature-upload-handle
                            aria-hidden="true"
                            className={`absolute h-3 w-3 rounded-sm border border-emerald-700 bg-white shadow-sm ${handle.className}`}
                            onPointerDown={(event) =>
                              beginUploadResize(event, item.id, handle.corner)
                            }
                            onPointerMove={moveUploadResize}
                            onPointerUp={finishUploadResize}
                            onPointerCancel={finishUploadResize}
                          />
                        ))}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="relative col-start-3 row-start-1">
              {!isDrawingEnabled && drawPreviewDataUrl && (
                <img
                  src={drawPreviewDataUrl}
                  alt={t("workspace.signature.previewAlt", "Digital signature preview")}
                  className="pointer-events-none absolute inset-0 z-30 h-full w-full select-none object-fill"
                  draggable={false}
                />
              )}
              {isDrawingEnabled && (
                  <canvas
                    ref={canvasRef}
                    className="absolute inset-0 z-30 h-full w-full touch-none bg-transparent"
                    onPointerDown={beginDraw}
                    onPointerMove={continueDraw}
                    onPointerUp={finishDraw}
                    onPointerCancel={finishDraw}
                    onPointerLeave={finishDraw}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                  />
              )}
            </div>

            {confirmationRows.map((row, index) => (
              <Fragment key={row.key}>
                <div className="col-start-1 flex items-end" style={{ gridRow: index + 1 }}>
                  <p>{row.label}</p>
                </div>
                <span className="col-start-2 flex items-end pb-1" style={{ gridRow: index + 1 }}>:</span>
                {row.key === "signatureStamp" ? (
                  <div
                    className="col-start-3 h-8 w-full self-end border-b border-slate-900"
                    style={{ gridRow: index + 1 }}
                  />
                ) : (
                  <input
                    type="text"
                    value={value?.[row.key] || ""}
                    onChange={(event) => updateSignatureText(row.key, event.target.value)}
                    aria-label={row.label}
                    className="col-start-3 h-8 w-full border-0 border-b border-slate-900 bg-transparent px-0 text-[13px] font-semibold uppercase text-slate-950 outline-none focus:border-emerald-700 focus:ring-0"
                    style={{ gridRow: index + 1 }}
                  />
                )}
              </Fragment>
            ))}
          </div>
        </div>

        {error && (
          <p className="mt-1.5 text-[13px] font-medium leading-5 text-red-600">{error}</p>
        )}
      </div>
    </div>
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
  const runtimeOrigin = getRuntimeOrigin();

  try {
    const runtimeHost = new URL(runtimeOrigin).hostname.toLowerCase();
    if (!["localhost", "127.0.0.1", "0.0.0.0"].includes(runtimeHost)) {
      return runtimeOrigin;
    }
  } catch {
    // Use the configured public frontend URL below.
  }

  return PUBLIC_FRONTEND_URL || runtimeOrigin;
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

  if (isIklWorkspace && userDepartment === "IKL (TECHNICAL)" && TECHNICAL_REVIEW_STATUSES.has(status)) {
    return t("status.ikl_technical_review", "IKL(TECH) Review");
  }

  if (isIklWorkspace && TECHNICAL_REVIEW_STATUSES.has(status)) {
    return `${t(`status.${status}`, formatWorkflowStatus(status))}: ${getTechnicalRouteLabel(app)}`;
  }

  if (isDepartmentTechnicalWorkspace && TECHNICAL_REVIEW_STATUSES.has(status)) {
    return getDepartmentReviewStatusLabel(userDepartment);
  }

  if (isApprovalWorkspace && status === "management_review") {
    return getApprovalStageLabel(app, t);
  }

  if (isApprovalWorkspace && isPostApprovalPaymentRecord(app)) {
    return getPostApprovalPaymentStatusLabel(app, t);
  }

  if (isApprovalWorkspace && ["approved", "approved_with_conditions"].includes(status)) {
    return t("status.approved", "Approved");
  }

  if (config?.key === "payment" && status === "bill_pending_ku") {
    return t("status.bill_pending_ku", "Pending Bill Sending");
  }

  if (config?.key === "payment" && status === "payment_submitted") {
    return t("status.receipt_review", "Receipt Review");
  }

  return t(`status.${status}`, formatWorkflowStatus(status));
}

function getPostApprovalPaymentStatusLabel(app, t) {
  const status = normalizeStatus(app?.status);
  const labelMap = {
    invoice_generated: t("status.invoice_generated", "Waiting for Payment"),
    payment_submitted: t("status.receipt_review", "Receipt Review"),
    payment_verified: t("status.payment_verified", "Payment Verified"),
    license_issued: t("status.license_issued", "E-License Issued"),
    license_revoked: t("status.license_revoked", "License Revoked"),
  };

  return labelMap[status] || t(`status.${status}`, formatWorkflowStatus(status));
}

function getWorkspaceActionDescription(config, t, userDepartment, selectedRecord) {
  if (config?.key === "screening") {
    if (userDepartment === "IKL (TECHNICAL)") {
      return "";
    }

    const copy = getIklScreeningCopy(userDepartment);
    return t(copy.actionDescriptionKey, copy.actionDescription);
  }

  if (config?.key === "approval") {
    if (
      userDepartment === "PT(IKL)" &&
      ["license_issued", "license_revoked"].includes(normalizeStatus(selectedRecord?.status))
    ) {
      return t(
        "workspace.approval.ptLicenseAction",
        "Manage the issued e-license status. Revoke an active license or restore a revoked license when needed."
      );
    }

    if (userDepartment === "KB(LES)" && getApprovalStageKey(selectedRecord) === "kb_support") {
      return t("workspace.approval.kbSupportAction", "Support the application before sending it to TP(RES)/PGH.");
    }

    if (userDepartment === "KB(LES)") {
      return t("workspace.approval.kbAction", "Verify the application before sending it to TP(RES)/PGH.");
    }

    if (APPROVAL_SUPPORT_DEPARTMENTS.includes(userDepartment)) {
      return t("workspace.approval.supportAction", "Make the final approval recommendation after KB(LES) support.");
    }

    if (MPHLG_REVIEW_DEPARTMENTS.includes(userDepartment)) {
      return t(
        "workspace.approval.mphlgAction",
        "Record MPHLG review and final approval recommendation."
      );
    }

  return t("workspace.approval.viewOnlyAction", "View applications awaiting KB(LES), TP(RES)/PGH, or MPHLG action.");
  }

  if (config?.key === "payment") {
    if (userDepartment === "PT(IKL)") {
      if (normalizeStatus(selectedRecord?.status) === "payment_submitted") {
        return t("workspace.payment.ptReceiptAction", "Review the uploaded receipt, then verify or reject it.");
      }

      return t("workspace.payment.ptAction", "Upload the approval letter and bill, send them to the applicant, then verify uploaded payment proof.");
    }

    return "";
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

function getApprovalSupportDecisionOptions(isFinalApprovalSupportWorkspace = false) {
  if (isFinalApprovalSupportWorkspace) {
    return [
      {
        value: "Approve",
        label: "Approve Application",
        labelKey: "workspace.decision.approveApplication",
      },
    ];
  }

  return [
    { value: "Approve", label: "Support", labelKey: "workspace.decision.support" },
    { value: "Reject", label: "Not Support", labelKey: "workspace.decision.notSupport" },
  ];
}

function isSignedApprovalSupportDecision(decision) {
  return ["approve", "support"].includes(String(decision || "").trim().toLowerCase());
}

function getWorkspaceDecisionOptions(config, app, department) {
  if (config?.key !== "approval") {
    return config.decisions || [];
  }

  if (!isApprovalActionableRecord(app)) {
    return [];
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
      { value: "Approve", labelKey: "workspace.decision.yes" },
      { value: "Reject", labelKey: "workspace.decision.no" },
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

  if (
    department === "PT(IKL)" &&
    ["license_issued", "license_revoked"].includes(normalizeStatus(app?.status))
  ) {
    return getWorkspaceActions(configs.payment, app, department);
  }

  const stage = getApprovalStageKey(app);
  if (!isApprovalActionableRecord(app)) {
    return [];
  }

  const canKbVerify = department === "KB(LES)" && (stage === "kb" || stage === "kb_support");
  const canSupport =
    APPROVAL_SUPPORT_DEPARTMENTS.includes(department) && stage === "support";
  const canMphlgApprove =
    MPHLG_REVIEW_DEPARTMENTS.includes(department) && stage === "mphlg";

  return canKbVerify || canSupport || canMphlgApprove ? config.actions || [] : [];
}

function isApprovalActionableRecord(app) {
  const status = normalizeStatus(app?.status);

  return (
    ["management_review", "mphlg_processing", "mphlg_decision_received"].includes(status) &&
    !hasApplicationSection(app, "approval")
  );
}

function canOpenWorkspaceRow(config, app, department) {
  return getWorkspaceActions(config, app, department).length > 0;
}

function canViewWorkspaceRow(config, app, department) {
  if (canOpenWorkspaceRow(config, app, department)) return true;
  if (config?.key === "payment") return isPaymentTaskForDepartment(app, department);
  return config?.key === "approval" && isApprovalTrackingRecordForDepartment(app, department);
}

function isPaymentTaskForDepartment(app, department) {
  const status = normalizeStatus(app?.status);

  if (department === "PT(IKL)") {
    return [
      "approved",
      "bill_pending_ku",
      "invoice_generated",
      "payment_submitted",
      "payment_verified",
    ].includes(status);
  }

  return false;
}

function isApprovalTaskForDepartment(app, department) {
  const stage = getApprovalStageKey(app);

  if (!isApprovalWorkflowRecord(app)) return false;
  if (isApprovalHistoryRecord(app)) return true;
  if (!isApprovalActionDepartment(department)) return true;
  if (hasApprovalDecisionForDepartment(app, department)) return true;
  if (APPROVAL_TECHNICAL_REPORT_DEPARTMENTS.includes(department)) return true;
  if (department === "KB(LES)") return stage === "kb" || stage === "kb_support" || isKbLesMonitoredRecord(app);
  if (APPROVAL_SUPPORT_DEPARTMENTS.includes(department)) {
    return stage === "support" || isApprovalSupportMonitoredRecord(app);
  }
  if (MPHLG_REVIEW_DEPARTMENTS.includes(department)) {
    return stage === "mphlg" || isMphlgMonitoredRecord(app);
  }

  return false;
}

function isApprovalTrackingRecordForDepartment(app, department) {
  if (isApprovalTaskForDepartment(app, department)) return true;

  return (
    INTERNAL_WORK_TRACKING_DEPARTMENTS.has(department) &&
    isKuIklTechnicalTrackingRecord(app)
  );
}

function isKuIklTechnicalTrackingRecord(app) {
  if (!KU_IKL_TECHNICAL_TRACKING_STATUSES.has(normalizeStatus(app?.status))) {
    return false;
  }

  return (
    getTechnicalReferralSource(app) === "KU(IKL)" ||
    hasTechnicalReferralFromKu(app)
  );
}

function getTechnicalReferralSource(app) {
  return normalizeDepartmentCode(
    app?.technical_referral?.source ||
      app?.form_data?.technical_referral?.source ||
      ""
  );
}

function hasTechnicalReferralFromKu(app) {
  const result = String(
    app?.auto_screening?.result ||
      app?.form_data?.auto_screening?.result ||
      ""
  ).toLowerCase();
  const selectedBy = normalizeDepartmentCode(
    app?.technical_department_selection?.selected_by ||
      app?.form_data?.technical_department_selection?.selected_by ||
      ""
  );

  return (
    result.includes("ku(ikl) confirm - send to technical") ||
    selectedBy === "KU(IKL)"
  );
}

function isApprovalWorkflowRecord(app) {
  const status = normalizeStatus(app?.status);

  return (
    ["management_review", "mphlg_processing", "mphlg_decision_received"].includes(status) ||
    isApprovalHistoryRecord(app) ||
    [
      "kb_les_verification",
      "management_recommendation",
      "mphlg_gateway",
    ].some((key) => hasApplicationSection(app, key))
  );
}

function hasApprovalDecisionForDepartment(app, department) {
  let section = {};

  if (department === "KB(LES)") {
    section = getApplicationSection(app, "kb_les_verification");
  } else if (APPROVAL_SUPPORT_DEPARTMENTS.includes(department)) {
    section = getApplicationSection(app, "management_recommendation");
    const officer = normalizeDepartmentCode(section.officer || section.decided_by);
    if (officer && !APPROVAL_SUPPORT_DEPARTMENTS.includes(officer)) return false;
  } else if (MPHLG_REVIEW_DEPARTMENTS.includes(department)) {
    section = getApplicationSection(app, "mphlg_gateway");
  }

  return Boolean(
    section?.decision ||
      section?.final_decision ||
      section?.verified_at ||
      section?.decided_at ||
      section?.reviewed_at ||
      section?.approved_at
  );
}

function isKbLesMonitoredRecord(app) {
  const kbVerification = getApplicationSection(app, "kb_les_verification");
  const verifiedByKb = ["verified", "supported", "completed"].includes(
    String(kbVerification.status || "").trim().toLowerCase()
  );

  return verifiedByKb && getApprovalStageKey(app) === "support";
}

function isApprovalSupportMonitoredRecord(app) {
  const recommendation = getApplicationSection(app, "management_recommendation");
  const recommendationStatus = String(recommendation.status || "").trim().toLowerCase();

  return (
    ["approved", "supported", "completed"].includes(recommendationStatus) &&
    getApprovalStageKey(app) === "mphlg"
  );
}

function isMphlgMonitoredRecord(app) {
  const mphlg = getApplicationSection(app, "mphlg_gateway");
  const mphlgStatus = String(mphlg.status || "").trim().toLowerCase();

  return (
    ["approved", "reviewed", "completed"].includes(mphlgStatus) &&
    getApprovalStageKey(app) === "completed"
  );
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
      "rejected",
    ].includes(status)
  );
}

function isPostApprovalPaymentRecord(app) {
  return [
    "invoice_generated",
    "payment_submitted",
    "payment_verified",
    "license_issued",
    "license_revoked",
  ].includes(normalizeStatus(app?.status));
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

function getActionUnavailableMessage(config, app, department, t = (key, fallback) => fallback) {
  if (!app) return "";

  if (config?.key === "payment") {
    return getPaymentActionUnavailableMessage(app, department);
  }

  if (config?.key === "license") {
    return getLicenseActionUnavailableMessage(app, department);
  }

  if (config?.key !== "approval") return "";

  if (isApprovalHistoryRecord(app)) return "";

  const status = normalizeStatus(app?.status);
  const iklDepartmentStatuses = IKL_DEPARTMENT_STATUS_SCOPE[department] || [];

  if (iklDepartmentStatuses.includes(status)) {
    return "";
  }

  if (TECHNICAL_REVIEW_STATUSES.has(status) && isTechnicalDepartmentSelected(app, department)) {
    return "";
  }

  if (!isApprovalActionableRecord(app)) {
    if (department === "KB(LES)" && status === "technical_site_visit") {
      return t(
        "workspace.approval.kbNotTaskYet",
        "This is not a KB(LES) task yet. KB(LES) action is available after IKL(TECHNICAL) completes the technical site visit."
      );
    }

    if (APPROVAL_SUPPORT_DEPARTMENTS.includes(department)) {
      return t(
        "workspace.approval.tpPghNotTaskYet",
        "This is not a TP(RES)/PGH task yet. TP(RES)/PGH action is available after KB(LES) completes verification or support."
      );
    }

    if (MPHLG_REVIEW_DEPARTMENTS.includes(department)) {
      return t(
        "workspace.approval.mphlgNotTaskYet",
        "This is not an MPHLG task yet. MPHLG action is available after TP(RES)/PGH support."
      );
    }

    return t(
      "workspace.approval.notDepartmentTaskYet",
      "This application is not awaiting this department's action yet."
    );
  }

  const stage = getApprovalStageKey(app);

  if (department === "KB(LES)") {
    if (stage === "support") {
      return t(
        "workspace.approval.awaitingTpPghFinal",
        "The application is now awaiting TP(RES)/PGH final approval."
      );
    }

    return ["kb", "kb_support"].includes(stage)
      ? ""
      : t(
          "workspace.approval.kbSupportNotRequired",
          "KB(LES) support is already complete or not required for this record."
        );
  }

  if (APPROVAL_SUPPORT_DEPARTMENTS.includes(department)) {
    if (isApprovalSupportMonitoredRecord(app)) {
      return t(
        "workspace.approval.awaitingStatusDepartment",
        "The application is now awaiting the approval department shown in the status."
      );
    }

    return stage === "support"
      ? ""
      : t(
          "workspace.approval.tpPghAfterKbSupport",
          "TP(RES)/PGH final approval is available after KB(LES) support."
        );
  }

  if (MPHLG_REVIEW_DEPARTMENTS.includes(department)) {
    if (isMphlgMonitoredRecord(app)) {
      return t(
        "workspace.approval.awaitingStatusDepartment",
        "The application is now awaiting the approval department shown in the status."
      );
    }

    return stage === "mphlg"
      ? ""
      : t(
          "workspace.approval.mphlgAfterTpPghSupport",
          "MPHLG approval is available after TP(RES)/PGH support."
        );
  }

  if (["PT(IKL)", "KU(IKL)", "IKL (TECHNICAL)", ...TECHNICAL_DEPARTMENTS].includes(department)) {
    return t(
      "workspace.approval.awaitingStatusDepartment",
      "The application is now awaiting the approval department shown in the status."
    );
  }

  return t(
    "workspace.approval.viewOnlyAssignedDepartment",
    "This queue is view-only for this account. Only the assigned approval department can record the next recommendation."
  );
}

function getPaymentActionUnavailableMessage(app, department) {
  const status = normalizeStatus(app?.status);

  if (
    department === "PT(IKL)" &&
    ["approved", "bill_pending_ku", "payment_submitted"].includes(status)
  ) {
    return "";
  }

  if (department === "KU(IKL)" && status === "bill_pending_ku") {
    return "PT(IKL) now sends the approval letter and bill directly to the applicant.";
  }

  if (department === "KU(IKL)" && status === "invoice_generated") {
    return "The approval letter and bill have been sent to the applicant. Waiting for payment receipt upload.";
  }

  if (department === "KU(IKL)" && status === "payment_submitted") {
    return "The payment receipt has been submitted and is awaiting PT(IKL) verification.";
  }

  if (department === "KU(IKL)" && status === "payment_verified") {
    return "Payment is verified. The record is available for reference.";
  }

  if (department === "PT(IKL)" && status === "bill_pending_ku") {
    return "";
  }

  if (department === "PT(IKL)" && status === "invoice_generated") {
    return "The approval letter and bill have been sent to the applicant. Waiting for payment receipt upload.";
  }

  if (department === "PT(IKL)" && status === "payment_verified") {
    return "Payment is verified. The record is available for reference.";
  }

  if (department === "KU(IKL)") {
    return "Billing and receipt actions are handled by PT(IKL).";
  }

  return "";
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

function getApprovalStageLabel(app, t) {
  const stage = getApprovalStageKey(app);

  if (normalizeStatus(app?.status) === "mphlg_decision_received") {
    return t("status.mphlg_decision_received", "MPHLG Decision Received");
  }

  if (stage === "kb_support") {
    return t("workspace.approval.stageKbSupport", "Pending KB(LES) Support");
  }

  if (stage === "support") {
    return t("workspace.approval.stageSupport", "Pending TP(RES)/PGH Final Approval");
  }

  if (stage === "mphlg") {
    return t("workspace.approval.stageMphlg", "Pending MPHLG Approval");
  }

  if (stage === "completed") {
    return t("workspace.approval.stageCompleted", "Approval Completed");
  }

  return t("workspace.approval.stageKbVerification", "Pending KB(LES) Verification");
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
  if (status === "mphlg_decision_received") return "mphlg";
  if (hasApplicationSection(app, "approval")) return "completed";
  if (isKbLesVerified(app) && !hasManagementSupport(app)) return "support";
  return "kb";
}

function getApplicationSection(app, key) {
  return app?.[key] || app?.form_data?.[key] || {};
}

function buildWorkspaceDecisionLogRows(app, t) {
  const rows = [];
  const autoScreening = getApplicationSection(app, "auto_screening");
  const technicalReview = getApplicationSection(app, "technical_review");
  const technicalKuReview = getApplicationSection(app, "technical_ku_review");
  const kbLesVerification = getApplicationSection(app, "kb_les_verification");
  const managementRecommendation = getApplicationSection(app, "management_recommendation");
  const mphlgGateway = getApplicationSection(app, "mphlg_gateway");
  const approval = getApplicationSection(app, "approval");
  const approvalLetter = getApplicationSection(app, "approval_letter");
  const payment = getApplicationSection(app, "payment");
  const selectedTechnicalDepartments = getSelectedTechnicalDepartments(app);

  addWorkspaceDecisionLogRow(rows, {
    id: "auto-screening",
    department: getWorkspaceAutoScreeningDecisionDepartment(autoScreening) || "PT(IKL)",
    section: autoScreening,
    decision: getWorkspaceDecisionLogValue(autoScreening),
    remarks: getWorkspaceDecisionLogRemarks(autoScreening),
    date: getWorkspaceDecisionLogDate(autoScreening, ["checked_at", "reviewed_at", "decided_at"]),
  }, t);

  Object.entries(getCurrentTechnicalDepartmentReviews(app))
    .filter(([department, review]) => {
      const normalizedDepartment = normalizeDepartmentCode(department);
      return (
        selectedTechnicalDepartments.includes(normalizedDepartment) &&
        review &&
        typeof review === "object"
      );
    })
    .forEach(([department, review]) => {
      const remarks = getWorkspaceDecisionLogRemarks(review);
      if (!remarks) return;

      addWorkspaceDecisionLogRow(rows, {
        id: `technical-department-${department}`,
        department: normalizeDepartmentCode(department) || department,
        section: review,
        decision: "",
        remarks,
        date: getWorkspaceDecisionLogDate(review, ["reviewed_at", "submitted_at", "checked_at"]),
        useStatusFallback: false,
      }, t);
    });

  addWorkspaceDecisionLogRow(rows, {
    id: "ikl-technical",
    department: "IKL(TECHNICAL)",
    section: technicalReview,
    decision: getWorkspaceDecisionLogValue(technicalReview),
    remarks: getWorkspaceDecisionLogRemarks(technicalReview),
    date: getWorkspaceDecisionLogDate(technicalReview, ["reviewed_at", "submitted_at"]),
  }, t);

  addWorkspaceDecisionLogRow(rows, {
    id: "technical-ku-review",
    department: "KU(IKL)",
    section: technicalKuReview,
    decision: getWorkspaceDecisionLogValue(technicalKuReview),
    remarks: getWorkspaceDecisionLogRemarks(technicalKuReview),
    date: getWorkspaceDecisionLogDate(technicalKuReview, ["reviewed_at", "checked_at"]),
  }, t);

  addWorkspaceDecisionLogRow(rows, {
    id: "kb-les-verification",
    department: "KB(LES)",
    section: kbLesVerification,
    decision: getWorkspaceDecisionLogValue(kbLesVerification),
    remarks: getWorkspaceDecisionLogRemarks(kbLesVerification),
    date: getWorkspaceDecisionLogDate(kbLesVerification, ["verified_at", "reviewed_at"]),
  }, t);

  addWorkspaceDecisionLogRow(rows, {
    id: "management-recommendation",
    department: normalizeDepartmentCode(managementRecommendation.officer) || "TP(RES)/PGH",
    section: managementRecommendation,
    decision: getWorkspaceDecisionLogValue(managementRecommendation),
    remarks: getWorkspaceDecisionLogRemarks(managementRecommendation),
    date: getWorkspaceDecisionLogDate(managementRecommendation, ["decided_at", "supported_at", "approval_note_saved_at"]),
    signature: managementRecommendation.digital_signature,
  }, t);

  addWorkspaceDecisionLogRow(rows, {
    id: "mphlg-gateway",
    department: "MPHLG",
    section: mphlgGateway,
    decision: getWorkspaceDecisionLogValue(mphlgGateway),
    remarks: getWorkspaceDecisionLogRemarks(mphlgGateway),
    date: getWorkspaceDecisionLogDate(mphlgGateway, ["reviewed_at", "decided_at"]),
  }, t);

  addWorkspaceDecisionLogRow(rows, {
    id: "final-approval",
    department: normalizeDepartmentCode(approval.officer || approval.decided_by) || t("admin.dashboard.finalApproval", "Final Approval"),
    section: approval,
    decision: getWorkspaceDecisionLogValue(approval),
    remarks: getWorkspaceDecisionLogRemarks(approval),
    date: getWorkspaceDecisionLogDate(approval, ["approved_at", "decided_at"]),
    signature: approval.digital_signature,
  }, t);

  addWorkspaceDecisionLogRow(rows, {
    id: "payment-receipt-verification",
    department: "PT(IKL)",
    section: payment,
    decision: getWorkspacePaymentReceiptDecisionLogValue(payment),
    remarks: payment.verification_notes,
    date: getWorkspaceDecisionLogDate(payment, ["verified_at", "rejected_at"]),
  }, t);

  addWorkspaceDecisionLogRow(rows, {
    id: "payment-letter-bill",
    department: "PT(IKL)",
    section: approvalLetter,
    decision: approvalLetter.letter_bill_decision || approvalLetter.recommendation,
    remarks: getWorkspaceDecisionLogRemarks(approvalLetter),
    date: getWorkspaceDecisionLogDate(approvalLetter, ["sent_to_applicant_at", "submitted_at"]),
  }, t);

  return rows
    .filter((row, index, allRows) => {
      const key = [row.department, row.decision, row.remarks, row.date].join("|");
      return allRows.findIndex((item) =>
        [item.department, item.decision, item.remarks, item.date].join("|") === key
      ) === index;
    })
    .sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());
}

function addWorkspaceDecisionLogRow(rows, row, t) {
  const section = row.section && typeof row.section === "object" ? row.section : {};
  const decision = cleanRemark(row.decision);
  const remarks = cleanRemark(row.remarks);
  const date = cleanRemark(row.date);
  const status = String(section.status || "").trim().toLowerCase();
  const hasCompletedSignal =
    decision ||
    remarks ||
    date ||
    section.memo_html ||
    section.approval_note_html;

  if (!hasCompletedSignal || status.includes("pending")) return;

  rows.push({
    id: row.id,
    department: row.department || "-",
    decision: formatWorkspaceDecisionLogRecommendation(
      decision || (row.useStatusFallback === false ? "" : formatWorkflowStatus(section.status || "")),
      row.department,
      t
    ),
    remarks,
    date,
    signature: row.signature || section.digital_signature || null,
  });
}

function getDecisionLogSignatureSource(signature) {
  if (!signature) return "";
  if (typeof signature === "string") return signature;
  if (typeof signature !== "object") return "";

  return String(
    signature.dataUrl ||
      signature.data_url ||
      signature.url ||
      signature.file_url ||
      signature.preview_url ||
      signature.source ||
      ""
  ).trim();
}

function isApprovalSupportDecisionLogDepartment(department) {
  return APPROVAL_SUPPORT_DEPARTMENTS.includes(normalizeDepartmentCode(department));
}

function getWorkspaceAutoScreeningDecisionDepartment(section = {}) {
  const decision = getWorkspaceDecisionLogValue(section);
  if (decision.includes("KU(IKL)")) return "KU(IKL)";
  if (decision.includes("PT(IKL)")) return "PT(IKL)";
  return normalizeDepartmentCode(section.officer || section.checked_by || section.department);
}

function getWorkspaceDecisionLogValue(section = {}) {
  if (!section || typeof section !== "object") return "";

  return String(
    section.recommendation ||
      section.final_decision ||
      section.decision ||
      section.result ||
      section.status ||
      ""
  ).trim();
}

function formatWorkspaceDecisionLogRecommendation(value, department = "", t = (key, fallback) => fallback || key) {
  const decision = cleanRemark(value);
  if (!decision) return "";

  const normalized = decision.toLowerCase();
  const normalizedDepartment = normalizeDepartmentCode(department);
  const technicalLogDepartments = new Set(["IKL (TECHNICAL)", ...TECHNICAL_DEPARTMENTS]);
  const routeRecommendationMap = {
    "pt(ikl) send to ku(ikl)": t("workspace.decision.approve", "Approve"),
    "pt(ikl) hantar kepada ku(ikl)": t("workspace.decision.approve", "Approve"),
    "ku(ikl) confirm - send to technical units": t("workspace.decision.approve", "Approve"),
    "ku(ikl) confirm - send to ikl(technical)": t("workspace.decision.approve", "Approve"),
    "ku(ikl) sahkan - hantar kepada ikl(technical)": t("workspace.decision.approve", "Approve"),
    "ku(ikl) confirm - send to kb(les)": t("workspace.decision.approve", "Approve"),
    "ku(ikl) request technical amendment": t("workspace.decision.kuRequestTechnicalAmendment", "Request Amendment"),
    "technical amendment required": t("workspace.decision.kuRequestTechnicalAmendment", "Request Amendment"),
    "pt(ikl) reject to applicant": t("workspace.decision.reject", "Reject"),
    "ku(ikl) reject to applicant": t("workspace.decision.reject", "Reject"),
    "verified - sent to kb(les)": t("workspace.decision.verify", "Verify"),
    "submit letter & bill": t("workspace.decision.generateApprovalLetterBill", "Generate Approval Letter & Bill"),
    "hantar surat & bil": t("workspace.decision.generateApprovalLetterBill", "Generate Approval Letter & Bill"),
    "generate approval letter & bill": t("workspace.decision.generateApprovalLetterBill", "Generate Approval Letter & Bill"),
    "jana surat kelulusan & bil": t("workspace.decision.generateApprovalLetterBill", "Generate Approval Letter & Bill"),
  };

  if (routeRecommendationMap[normalized]) {
    return routeRecommendationMap[normalized];
  }

  if (technicalLogDepartments.has(normalizedDepartment)) {
    if (["supported", "support", "yes", "y", "ya"].includes(normalized)) {
      return t("workspace.decision.yes", "Yes");
    }

    if (["not supported", "not support", "no", "n", "tidak"].includes(normalized)) {
      return t("workspace.decision.no", "No");
    }
  }

  if (APPROVAL_SUPPORT_DEPARTMENTS.includes(normalizedDepartment)) {
    if (["approve", "approved"].includes(normalized)) {
      return t("workspace.decision.support", "Support");
    }
    if (["reject", "rejected", "not support", "not supported"].includes(normalized)) {
      return t("workspace.decision.notSupport", "Not Support");
    }
  }

  if (
    normalizedDepartment === "KU(IKL)" &&
    normalized.includes("confirm") &&
    (normalized.includes("technical") || normalized.includes("kb(les)"))
  ) {
    return t("workspace.decision.approve", "Approve");
  }

  if (normalized.includes("reject") && normalized.includes("applicant")) {
    return t("workspace.decision.reject", "Reject");
  }

  if (normalized.includes("amendment")) {
    return t("workspace.decision.kuRequestTechnicalAmendment", "Request Amendment");
  }

  return decision;
}

function getWorkspacePaymentReceiptDecisionLogValue(payment = {}) {
  if (!payment || typeof payment !== "object") return "";

  const explicitDecision = cleanRemark(
    payment.recommendation ||
      payment.decision ||
      payment.verification_decision ||
      payment.receipt_decision
  );
  if (explicitDecision) return explicitDecision;

  const result = String(payment.verification_result || "").trim().toLowerCase();
  const status = String(payment.status || "").trim().toLowerCase();

  if (result === "valid" || status === "payment verified") {
    return "Verify Receipt";
  }

  if (
    result.includes("invalid") ||
    result.includes("fake") ||
    status === "receipt rejected"
  ) {
    return "Reject Receipt";
  }

  return "";
}

function getWorkspaceDecisionLogRemarks(section = {}) {
  if (!section || typeof section !== "object") return "";

  const plainRemark =
    section.remarks ||
    section.comment ||
    section.notes ||
    section.site_remarks ||
    section.findings ||
    "";
  const memoText =
    section.approval_note_html ||
    section.memo_html ||
    "";

  return cleanRemark(plainRemark) || htmlToPlainWorkspaceDecisionLogText(memoText);
}

function getWorkspaceDecisionLogDate(section = {}, keys = []) {
  if (!section || typeof section !== "object") return "";
  return keys.map((key) => section[key]).find(Boolean) || "";
}

function htmlToPlainWorkspaceDecisionLogText(value) {
  const source = String(value || "").trim();
  if (!source) return "";

  if (typeof document === "undefined") {
    return cleanRemark(source.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
  }

  const container = document.createElement("div");
  container.innerHTML = source;
  return cleanRemark(container.textContent || container.innerText || "");
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

function toTechnicalCurrencyCents(value) {
  return Math.round((Number(value) || 0) * 100);
}

function roundTechnicalPayableToFiveSen(value) {
  const cents = toTechnicalCurrencyCents(value);
  const roundedCents = Math.round(cents / 5) * 5;

  return {
    roundedAmount: roundedCents / 100,
    adjustment: (roundedCents - cents) / 100,
  };
}

function getTechnicalFeeSchedule(subtype) {
  return TECHNICAL_LED_SUBTYPES.has(subtype)
    ? TECHNICAL_FEE_SCHEDULES.schedule_6
    : TECHNICAL_FEE_SCHEDULES.schedule_1;
}

function getApplicationTypeFromSubtype(subtype) {
  if (APPLICATION_SUBTYPE_OPTIONS.building.some((option) => option.value === subtype)) {
    return "building";
  }
  if (APPLICATION_SUBTYPE_OPTIONS.open_space.some((option) => option.value === subtype)) {
    return "open_space";
  }
  return "";
}

function calculateTechnicalFee(site = {}) {
  const schedule = getTechnicalFeeSchedule(site.application_subtype);
  const widthFt = parseTechnicalNumber(site.width_ft);
  const heightFt = parseTechnicalNumber(site.height_ft);
  const areaSqft = widthFt > 0 && heightFt > 0 ? widthFt * heightFt : 0;
  const providedAreaSqm = parseTechnicalNumber(
    site.area_sqm || site.areaRequired || site.area_required || site.areaSqm
  );
  const areaSqm = areaSqft > 0 ? areaSqft * SQFT_TO_SQM : providedAreaSqm;
  const hasArea = areaSqm > 0;
  const usesFixedFirstAreaFee = Number(schedule.firstAreaFixedFee || 0) > 0;
  const firstAreaSqm = hasArea
    ? usesFixedFirstAreaFee
      ? schedule.firstAreaSqm
      : Math.min(areaSqm, schedule.firstAreaSqm)
    : 0;
  const additionalAreaSqm = hasArea ? Math.max(areaSqm - schedule.firstAreaSqm, 0) : 0;
  const firstAreaFee = hasArea
    ? usesFixedFirstAreaFee
      ? schedule.firstAreaFixedFee
      : firstAreaSqm * schedule.firstAreaRate
    : 0;
  const additionalAreaFee = hasArea ? additionalAreaSqm * schedule.additionalAreaRate : 0;
  const feeTotal = firstAreaFee + additionalAreaFee;
  const subtotalPayable = feeTotal + TECHNICAL_FIXED_DEPOSIT + TECHNICAL_PROCESSING_FEE;
  const roundedPayable = roundTechnicalPayableToFiveSen(subtotalPayable);

  return {
    scheduleKey: schedule.key,
    scheduleNumber: schedule.number,
    firstAreaLimitSqm: schedule.firstAreaSqm,
    firstAreaRate: schedule.firstAreaRate,
    firstAreaFixedFee: schedule.firstAreaFixedFee || 0,
    usesFixedFirstAreaFee,
    additionalAreaRate: schedule.additionalAreaRate,
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
    roundingAdjustment: roundedPayable.adjustment,
    subtotalPayable,
    totalPayable: roundedPayable.roundedAmount,
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
  const amount = Number(value || 0);
  const prefix = amount < 0 ? "-RM" : "RM";

  return `${prefix}${Math.abs(amount).toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatTechnicalDecimal(value, maxDecimals = 10) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "";
  const rounded = roundTechnicalNumber(number, maxDecimals);
  return Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

function formatTechnicalAmountInput(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? roundTechnicalNumber(number, 2).toFixed(2)
    : "";
}

function mergeTechnicalFeeCalculation(site = {}) {
  const fees = calculateTechnicalFee(site);
  return {
    ...site,
    fee_schedule_key: fees.scheduleKey,
    fee_schedule_no: fees.scheduleNumber,
    area_sqft: fees.areaSqft ? String(fees.areaSqft) : "",
    area_sqm: fees.areaSqm ? String(fees.areaSqm) : "",
    chargeable_area_sqm: fees.chargeableAreaSqm ? String(fees.chargeableAreaSqm) : "",
    first_area_fee: fees.firstAreaFee ? String(fees.firstAreaFee) : "",
    additional_area_sqm: fees.additionalAreaSqm ? String(fees.additionalAreaSqm) : "0",
    additional_area_fee: fees.additionalAreaFee ? String(fees.additionalAreaFee) : "0",
    fee_total: fees.feeTotal ? String(fees.feeTotal) : "",
    rounding_adjustment: String(fees.roundingAdjustment || 0),
    payable_total: fees.feeTotal ? String(fees.totalPayable) : "",
    license_fee_calculation: fees.feeTotal ? String(fees.feeTotal) : "",
    deposit_calculation: String(TECHNICAL_FIXED_DEPOSIT),
    processing_fee_calculation: String(TECHNICAL_PROCESSING_FEE),
  };
}

function getTechnicalFeeRowsFromSite(site = {}) {
  const rows = Array.isArray(site.advertisement_rows)
    ? site.advertisement_rows
    : [];
  const normalizedRows = rows
    .map((row) =>
      normalizeTechnicalAdvertisementRow(
        row,
        row.applicationType || row.application_type || getApplicationTypeFromSubtype(row.subtype) || "open_space",
        row.subtype || site.application_subtype
      )
    )
    .filter((row) => row.displayType || row.subtype || row.customLabel);

  if (normalizedRows.length > 0) return normalizedRows;

  return [
    normalizeTechnicalAdvertisementRow(
      {
        applicationType: getApplicationTypeFromSubtype(site.application_subtype) || "open_space",
        application_type: getApplicationTypeFromSubtype(site.application_subtype) || "open_space",
        displayType: getTechnicalDisplayTypeFromSubtype(site.application_subtype),
        display_type: getTechnicalDisplayTypeFromSubtype(site.application_subtype),
        subtype: site.application_subtype,
        customLabel: "",
        custom_label: "",
        width_ft: site.width_ft || "",
        height_ft: site.height_ft || "",
      },
      getApplicationTypeFromSubtype(site.application_subtype) || "open_space",
      site.application_subtype
    ),
  ];
}

function calculateTechnicalFeeRows(rows = []) {
  return rows.map((row) => {
    const applicationSubtype = row.subtype || "";
    const fees = calculateTechnicalFee({
      application_subtype: applicationSubtype,
      width_ft: row.width_ft || row.widthFt || "",
      height_ft: row.height_ft || row.heightFt || "",
      area_sqm: "",
    });

    return {
      ...row,
      application_subtype: applicationSubtype,
      fee_schedule_key: fees.scheduleKey,
      fee_schedule_no: fees.scheduleNumber,
      area_sqft: fees.areaSqft ? String(fees.areaSqft) : "",
      area_sqm: fees.areaSqm ? String(fees.areaSqm) : "",
      chargeable_area_sqm: fees.chargeableAreaSqm ? String(fees.chargeableAreaSqm) : "",
      first_area_sqm: fees.firstAreaSqm ? String(fees.firstAreaSqm) : "",
      first_area_fee: fees.firstAreaFee ? String(fees.firstAreaFee) : "",
      additional_area_sqm: fees.additionalAreaSqm ? String(fees.additionalAreaSqm) : "0",
      additional_area_fee: fees.additionalAreaFee ? String(fees.additionalAreaFee) : "0",
      fee_total: fees.feeTotal ? String(fees.feeTotal) : "",
      rounding_adjustment: String(fees.roundingAdjustment || 0),
      payable_total: fees.feeTotal ? String(fees.totalPayable) : "",
    };
  });
}

function mergeTechnicalFeeRowsCalculation(site = {}) {
  const calculatedRows = calculateTechnicalFeeRows(getTechnicalFeeRowsFromSite(site));
  const primaryRow = calculatedRows[0] || {};
  const totals = calculatedRows.reduce(
    (sum, row) => ({
      feeTotal: sum.feeTotal + parseTechnicalNumber(row.fee_total),
      payableTotal: sum.payableTotal + parseTechnicalNumber(row.payable_total),
    }),
    { feeTotal: 0, payableTotal: 0 }
  );

  return {
    ...site,
    advertisement_rows: calculatedRows,
    application_subtype: site.application_subtype || primaryRow.subtype || primaryRow.application_subtype || "",
    fee_schedule_key: primaryRow.fee_schedule_key || site.fee_schedule_key || "",
    fee_schedule_no: primaryRow.fee_schedule_no || site.fee_schedule_no || "",
    width_ft: primaryRow.width_ft || primaryRow.widthFt || site.width_ft || "",
    height_ft: primaryRow.height_ft || primaryRow.heightFt || site.height_ft || "",
    area_sqft: primaryRow.area_sqft || site.area_sqft || "",
    area_sqm: primaryRow.area_sqm || site.area_sqm || "",
    chargeable_area_sqm: primaryRow.chargeable_area_sqm || site.chargeable_area_sqm || "",
    first_area_sqm: primaryRow.first_area_sqm || site.first_area_sqm || "",
    first_area_fee: primaryRow.first_area_fee || site.first_area_fee || "",
    additional_area_sqm: primaryRow.additional_area_sqm || site.additional_area_sqm || "0",
    additional_area_fee: primaryRow.additional_area_fee || site.additional_area_fee || "0",
    fee_total: totals.feeTotal ? String(totals.feeTotal) : site.fee_total || "",
    payable_total: totals.payableTotal ? String(totals.payableTotal) : site.payable_total || "",
    license_fee_calculation: totals.feeTotal ? String(totals.feeTotal) : site.license_fee_calculation || "",
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

function getNextTechnicalReviewCycle(app) {
  const formData = app?.form_data || {};
  const currentCycle = Number(
    formData.technical_review_cycle ||
      formData.technical_referral?.cycle_id ||
      formData.technical_site_visit?.cycle_id ||
      0
  );

  return Number.isFinite(currentCycle) ? currentCycle + 1 : 1;
}

function createFreshTechnicalSiteVisit(app, now, cycleId) {
  const applicationSubtype = getApplicationSubtypeFromApplication(app);
  const fees = calculateTechnicalFee({ application_subtype: applicationSubtype });

  return {
    cycle_id: cycleId,
    status: "Fresh Review",
    application_subtype: applicationSubtype,
    fee_schedule_key: fees.scheduleKey,
    fee_schedule_no: fees.scheduleNumber,
    site_photos: [],
    site_photo: null,
    fee_date: new Date().toISOString().slice(0, 10),
    fee_items: [],
    width_ft: "",
    height_ft: "",
    area_sqft: "",
    area_sqm: "",
    chargeable_area_sqm: "",
    first_area_sqm: "",
    first_area_fee: "",
    additional_area_sqm: "0",
    additional_area_fee: "0",
    fee_total: "",
    payable_total: "",
    license_fee_calculation: "",
    deposit_calculation: String(TECHNICAL_FIXED_DEPOSIT),
    processing_fee_calculation: String(TECHNICAL_PROCESSING_FEE),
    site_remarks: "",
    officer_role: "PT/PO/KP Unit Iklan",
    reset_at: now,
  };
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
  const technicalCycle = sendTechnical ? getNextTechnicalReviewCycle(app) : app.form_data?.technical_review_cycle;

  return {
    status: reject
      ? data.decision === "KU(IKL) Reject to Applicant"
        ? "rejected"
        : "incomplete"
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
        recommendation: data.decision,
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
            cycle_id: technicalCycle,
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
            cycle_id: technicalCycle,
            departments: selectedTechnicalDepartments,
            selected_by: "Application Type",
            selected_at: now,
          }
        : app.form_data?.technical_department_selection || null,
      technical_department_reviews: sendTechnical
        ? null
        : app.form_data?.technical_department_reviews || {},
      technical_department_reviews_updated_at: sendTechnical
        ? ""
        : app.form_data?.technical_department_reviews_updated_at || "",
      technical_review: sendTechnical ? null : app.form_data?.technical_review || null,
      technical_site_visit: sendTechnical ? createFreshTechnicalSiteVisit(app, now, technicalCycle) : app.form_data?.technical_site_visit || null,
      technical_ku_review: sendTechnical ? null : app.form_data?.technical_ku_review || null,
      technical_review_cycle: sendTechnical
        ? technicalCycle
        : app.form_data?.technical_review_cycle || null,
      correction_request: correctionRequired
        ? {
            source: data.decision.includes("KU") ? "KU(IKL)" : "PT(IKL)",
            remarks: data.comment,
            requested_at: now,
          }
        : sendTechnical
          ? null
          : app.form_data?.correction_request || null,
    }),
  };
}

function buildIklTechnicalDecisionPayload(app, data) {
  const now = new Date().toISOString();
  const applicationSubtype =
    data.technicalSite.application_subtype || getApplicationSubtypeFromApplication(app);
  const preparedSite = mergeTechnicalFeeRowsCalculation({
    ...data.technicalSite,
    application_subtype: applicationSubtype,
  });
  const technicalFee = calculateTechnicalFee({
    ...preparedSite,
    application_subtype: applicationSubtype,
  });
  const notSupported = data.decision === "Not Supported";

  return {
    status: notSupported ? "rejected" : "technical_review_completed",
    current_step: Math.max(Number(app.current_step || 1), 5),
    latest_remark: data.comment || app.latest_remark || "",
    form_data: mergeFormData(app, {
      technical_review: {
        ...(app.form_data?.technical_review || {}),
        status: notSupported ? "Not Supported" : "Completed",
        recommendation: data.decision,
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
        site_photos: preparedSite.site_photos || [],
        site_photo: preparedSite.site_photos?.[0] || null,
        fee_date: preparedSite.fee_date || new Date().toISOString().slice(0, 10),
        fee_items: [],
        application_subtype: applicationSubtype,
        fee_schedule_key: technicalFee.scheduleKey,
        fee_schedule_no: technicalFee.scheduleNumber,
        advertisement_rows: preparedSite.advertisement_rows || [],
        width_ft: preparedSite.width_ft || "",
        height_ft: preparedSite.height_ft || "",
        area_sqft: preparedSite.area_sqft || "",
        area_sqm: preparedSite.area_sqm || "",
        chargeable_area_sqm: preparedSite.chargeable_area_sqm || "",
        first_area_sqm: preparedSite.first_area_sqm || "",
        first_area_fee: preparedSite.first_area_fee || "",
        additional_area_sqm: preparedSite.additional_area_sqm || "0",
        additional_area_fee: preparedSite.additional_area_fee || "0",
        fee_total: preparedSite.fee_total || technicalFee.feeTotal,
        payable_total: preparedSite.payable_total || technicalFee.totalPayable,
        license_fee_calculation: preparedSite.license_fee_calculation || "",
        deposit_calculation: String(TECHNICAL_FIXED_DEPOSIT),
        processing_fee_calculation: String(TECHNICAL_PROCESSING_FEE),
        site_remarks: preparedSite.site_remarks || data.comment,
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
        recommendation: data.decision,
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
          recommendation: decision,
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
              recommendation: kbSupportStage ? decision : app.form_data?.management_recommendation?.recommendation,
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
    const signedSupport = isSignedApprovalSupportDecision(decision);
    const supportRecommendation = finalApproval
      ? decision
      : signedSupport
        ? "Support"
        : "Not Support";
    const approvalSupportSignature =
      data.approvalSupportSignature ||
      app.form_data?.management_recommendation?.digital_signature ||
      app.form_data?.approval?.digital_signature ||
      null;
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
          recommendation: supportRecommendation,
          decision: signedSupport ? "Approve" : decision,
          remarks: rejected ? data.comment || approvalDecisionRemarks : data.comment,
          approval_note_html: approvalDecisionHtml,
          digital_signature: approvalSupportSignature,
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
              recommendation: supportRecommendation,
              decision,
              remarks: data.comment,
              memo_html: data.memoHtml || app.form_data?.approval?.memo_html || "",
              approval_note_html: approvalDecisionHtml,
              digital_signature: approvalSupportSignature,
              approved_at: now,
            },
      }),
    };
  }

  if (MPHLG_REVIEW_DEPARTMENTS.includes(department)) {
    const approved = decision === "Approve";
    const rejectRemark = data.comment || getHtmlPlainText(data.memoHtml) || app.latest_remark || "";

    return {
      status: approved ? "approved" : "rejected",
      current_step: Math.max(Number(app.current_step || 1), 5),
      latest_remark: approved ? data.comment || app.latest_remark || "" : rejectRemark,
      form_data: mergeFormData(app, {
        management_recommendation: app.form_data?.management_recommendation || null,
        mphlg_gateway: {
          ...(app.form_data?.mphlg_gateway || {}),
          officer: "MPHLG",
          status: approved ? "Approved" : "Returned to Applicant",
          recommendation: decision,
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
              target: "Applicant",
              remarks: rejectRemark,
              memo_html: data.memoHtml || "",
              requested_at: now,
            },
        sut_approval: app.form_data?.sut_approval || null,
        approval: approved
          ? {
              ...(app.form_data?.approval || {}),
              officer: "MPHLG",
              status: "Approved",
              recommendation: decision,
              decision,
              remarks: data.comment,
              memo_html: data.memoHtml || app.form_data?.approval?.memo_html || "",
              approved_at: now,
            }
          : app.form_data?.approval || null,
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
  const cycleId = getActiveTechnicalReviewCycle(app);
  const nextReviews = {
    ...currentReviews,
    [department]: {
      cycle_id: cycleId,
      department,
      remarks: data.comment,
      reviewed_at: now,
      reviewed_by: department,
    },
  };
  const selectedDepartments = getSelectedTechnicalDepartments(app);
  const reviewDepartments =
    selectedDepartments.length > 0
      ? selectedDepartments
      : getApplicationTypeTechnicalDepartments(app);
  const allDepartmentReviewsComplete =
    reviewDepartments.length > 0 &&
    reviewDepartments.every((item) => {
      const normalizedDepartment = normalizeDepartmentCode(item);
      const review = nextReviews[normalizedDepartment];

      if (!review) return false;
      if (normalizedDepartment === department) return true;

      return isCurrentTechnicalReviewCycle(app, review);
    });

  return {
    status: allDepartmentReviewsComplete ? "technical_site_visit" : "technical_review",
    current_step: Math.max(Number(app.current_step || 1), 5),
    form_data: mergeFormData(app, {
      technical_department_reviews: nextReviews,
      technical_department_reviews_updated_at: now,
      technical_referral: allDepartmentReviewsComplete
        ? {
            ...(app.form_data?.technical_referral || {}),
            status: "Department Reviews Completed",
            completed_at: now,
          }
        : app.form_data?.technical_referral || null,
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

function getActiveTechnicalReviewCycle(app) {
  const formData = app?.form_data || {};
  return String(
    formData.technical_review_cycle ||
      app?.technical_referral?.cycle_id ||
      app?.technical_department_selection?.cycle_id ||
      formData.technical_referral?.cycle_id ||
      formData.technical_department_selection?.cycle_id ||
      formData.technical_site_visit?.cycle_id ||
      ""
  );
}

function isCurrentTechnicalReviewCycle(app, review) {
  const activeCycle = getActiveTechnicalReviewCycle(app);
  const reviewCycle = String(review?.cycle_id || "");
  if (activeCycle) {
    if (reviewCycle !== activeCycle) return false;
    return true;
  }

  const formData = app?.form_data || {};
  const selectionTime =
    app?.technical_department_selection?.selected_at ||
    app?.technical_referral?.departments_selected_at ||
    app?.technical_referral?.referred_at ||
    formData.technical_department_selection?.selected_at ||
    formData.technical_referral?.departments_selected_at ||
    formData.technical_referral?.referred_at ||
    formData.technical_site_visit?.reset_at ||
    "";
  const reviewedAt = review?.reviewed_at || "";

  if (!selectionTime || !reviewedAt) return true;

  const selectedMs = Date.parse(selectionTime);
  const reviewedMs = Date.parse(reviewedAt);

  if (!Number.isFinite(selectedMs) || !Number.isFinite(reviewedMs)) return true;

  return reviewedMs >= selectedMs;
}

function getCurrentTechnicalDepartmentReviews(app) {
  const reviews = getTechnicalDepartmentReviews(app);
  const activeCycle = getActiveTechnicalReviewCycle(app);
  if (!activeCycle) return reviews;

  return Object.fromEntries(
    Object.entries(reviews).filter(([, review]) =>
      isCurrentTechnicalReviewCycle(app, review)
    )
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
      ms: "Ruang Terbuka",
    },
    building: {
      en: "Building",
      ms: "Bangunan",
    },
  };

  return labels[type]?.[language === "ms" ? "ms" : "en"] || type;
}

function getDefaultApplicationSubtype(type) {
  return APPLICATION_SUBTYPE_OPTIONS[type]?.[0]?.value || "";
}

function normalizeApplicationSubtype(value, type) {
  const subtype = String(value || "").trim().toLowerCase();
  const options = APPLICATION_SUBTYPE_OPTIONS[type] || [];
  return options.some((option) => option.value === subtype) ? subtype : "";
}

function getApplicationSubtypeLabel(type, subtype, language = "en") {
  const option = (APPLICATION_SUBTYPE_OPTIONS[type] || []).find(
    (item) => item.value === subtype
  );
  return option?.[language === "ms" ? "ms" : "en"] || "";
}

function getTechnicalDisplayTypeFromSubtype(subtype) {
  return TECHNICAL_LED_SUBTYPES.has(subtype) ? "led" : "non_led";
}

function getSubtypeForTechnicalDisplayType(type, displayType) {
  const options = APPLICATION_SUBTYPE_OPTIONS[type] || [];
  const matcher =
    displayType === "led"
      ? (option) => TECHNICAL_LED_SUBTYPES.has(option.value)
      : (option) => !TECHNICAL_LED_SUBTYPES.has(option.value);

  return options.find(matcher)?.value || getDefaultApplicationSubtype(type);
}

function getTechnicalDisplayTypeLabel(displayType, language = "en") {
  if (displayType === "led") return stepText(language, "displayTypeLed");
  if (displayType === "non_led") return stepText(language, "displayTypeNonLed");
  return "";
}

function getTechnicalAdvertisementTypeValue(step1 = {}, displayType = "") {
  const rows = Array.isArray(step1.advertisement_rows)
    ? step1.advertisement_rows
    : [];
  const matchingRow =
    rows.find((row) => (row?.displayType || row?.display_type) === displayType) ||
    rows[0] ||
    null;
  const label =
    matchingRow?.customLabel ||
    matchingRow?.custom_label ||
    step1.advertisement_type_custom_label ||
    step1.advertisement_type_label ||
    "";

  return label || TECHNICAL_DEFAULT_ADVERTISEMENT_TYPES[0]?.value || "";
}

function normalizeTechnicalAdvertisementRow(row = {}, selectedType, fallbackSubtype = "") {
  const rowType =
    normalizeApplicationTypeOptions(row.applicationType || row.application_type)[0] ||
    selectedType;
  const rowDisplayType =
    row.displayType === "led" || row.display_type === "led"
      ? "led"
      : row.displayType === "non_led" || row.display_type === "non_led"
        ? "non_led"
        : "";
  const subtype =
    normalizeApplicationSubtype(row.subtype, rowType) ||
    normalizeApplicationSubtype(fallbackSubtype, rowType) ||
    getSubtypeForTechnicalDisplayType(rowType, rowDisplayType);
  const displayType =
    rowDisplayType ||
    getTechnicalDisplayTypeFromSubtype(subtype);
  const customLabel = String(row.customLabel || row.custom_label || "").trim();

  return {
    ...row,
    applicationType: rowType,
    application_type: rowType,
    displayType,
    display_type: displayType,
    subtype,
    customLabel,
    custom_label: customLabel,
  };
}

function createTechnicalAdvertisementRow(applicationType = "") {
  return {
    applicationType,
    application_type: applicationType,
    displayType: "",
    display_type: "",
    subtype: "",
    customLabel: "",
    custom_label: "",
  };
}

function getTechnicalAdvertisementRowsFromStep1(step1 = {}, selectedType, fallbackSubtype = "") {
  const rows = Array.isArray(step1.advertisement_rows)
    ? step1.advertisement_rows
    : [];
  const normalizedRows = rows.map((row) =>
    normalizeTechnicalAdvertisementRow(row, selectedType, fallbackSubtype)
  );

  if (normalizedRows.length > 0) return normalizedRows;

  const fallbackRow = normalizeTechnicalAdvertisementRow(
    {
      displayType: getTechnicalDisplayTypeFromSubtype(fallbackSubtype),
      subtype: fallbackSubtype,
      customLabel: getTechnicalAdvertisementTypeValue(step1, getTechnicalDisplayTypeFromSubtype(fallbackSubtype)),
    },
    selectedType,
    fallbackSubtype
  );

  if (fallbackRow.displayType || fallbackRow.subtype || fallbackRow.customLabel) {
    return [
      fallbackRow,
    ];
  }

  return [
    normalizeTechnicalAdvertisementRow(
      createTechnicalAdvertisementRow(),
      selectedType,
      fallbackSubtype
    ),
  ];
}

function getTechnicalFeeRowsFromApplication(app, savedRows = []) {
  const saved = app?.form_data?.technical_site_visit || {};
  const step1 = app?.form_data?.step_1 || {};
  const selectedTypes = getApplicationTypeOptionsFromApplication(app);
  const primaryType = selectedTypes[0] || getApplicationTypeFromSubtype(saved.application_subtype) || "open_space";
  const fallbackSubtype =
    saved.application_subtype ||
    getApplicationSubtypeFromApplication(app) ||
    getDefaultApplicationSubtype(primaryType);
  const sourceRows =
    Array.isArray(savedRows) && savedRows.length > 0
      ? savedRows
      : getTechnicalAdvertisementRowsFromStep1(step1, primaryType, fallbackSubtype);

  return sourceRows.map((row) => {
    const normalized = normalizeTechnicalAdvertisementRow(
      row,
      row.applicationType || row.application_type || primaryType,
      row.subtype || fallbackSubtype
    );

    return {
      ...normalized,
      width_ft: row.width_ft || row.widthFt || row.width || row.width_ft_value || "",
      height_ft: row.height_ft || row.heightFt || row.height || row.height_ft_value || "",
      area_sqm:
        row.area_sqm ||
        row.areaSqm ||
        row.areaRequired ||
        row.area_required ||
        row.area_required_sqm ||
        "",
      payable_total:
        row.payable_total ||
        row.payableTotal ||
        row.totalPayable ||
        row.total_payable ||
        row.amount ||
        "",
    };
  });
}

function getTechnicalAdvertisementOptionLabel(value, language = "en") {
  const option = TECHNICAL_DEFAULT_ADVERTISEMENT_TYPES.find(
    (item) => item.value.toLowerCase() === String(value || "").trim().toLowerCase()
  );
  return option ? stepText(language, option.labelKey) : value;
}

function formatTechnicalProjectText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleUpperCase("en-MY");
}

function buildTechnicalProjectNameLine(language, row, fallbackType = "") {
  const rowType =
    normalizeApplicationTypeOptions(row?.applicationType || row?.application_type)[0] ||
    fallbackType;
  const displayType = row?.displayType || row?.display_type || "";
  const subtype = normalizeApplicationSubtype(row?.subtype, rowType);
  const customLabel = String(row?.customLabel || row?.custom_label || "").trim();
  const displayLabel = getTechnicalDisplayTypeLabel(displayType, language);
  const advertisementLabel =
    customLabel ||
    getApplicationSubtypeLabel(rowType, subtype, language) ||
    getTechnicalAdvertisementOptionLabel(customLabel, language);

  if (!rowType || !displayLabel || !advertisementLabel) return "";

  const action = stepText(
    language,
    rowType === "building" ? "projectActionInstallation" : "projectActionConstruction"
  );
  const location = stepText(
    language,
    rowType === "building" ? "projectLocationBuilding" : "projectLocationOpenSpace"
  );

  if (language === "ms") {
    return `${formatTechnicalProjectText(action)} ${formatTechnicalProjectText(advertisementLabel)} ${formatTechnicalProjectText(displayLabel)} DI ${formatTechnicalProjectText(location)}`;
  }

  return `${formatTechnicalProjectText(action)} OF ${formatTechnicalProjectText(displayLabel)} ${formatTechnicalProjectText(advertisementLabel)} AT ${formatTechnicalProjectText(location)}`;
}

function getTechnicalAdvertisementOptions(row = {}, language = "en") {
  const optionsByValue = new Map(
    TECHNICAL_DEFAULT_ADVERTISEMENT_TYPES.map((option) => [
      option.value.toLowerCase(),
      {
        value: option.value,
        label: stepText(language, option.labelKey),
      },
    ])
  );
  const customLabel = String(row.customLabel || row.custom_label || "").trim();

  if (customLabel && !optionsByValue.has(customLabel.toLowerCase())) {
    optionsByValue.set(customLabel.toLowerCase(), {
      value: customLabel,
      label: customLabel,
    });
  }

  return [...optionsByValue.values()];
}

function buildTechnicalAdvertisementRow(step1 = {}, selectedType, subtype, advertisementMeta = {}) {
  const displayType =
    advertisementMeta.displayType ||
    getTechnicalDisplayTypeFromSubtype(subtype);
  const customLabel =
    advertisementMeta.advertisementType ||
    getTechnicalAdvertisementTypeValue(step1, displayType);

  return {
    displayType,
    display_type: displayType,
    subtype,
    customLabel,
    custom_label: customLabel,
  };
}

function buildTechnicalAdvertisementRows(step1 = {}, selectedType, subtype, advertisementMeta = {}) {
  if (Array.isArray(advertisementMeta.rows) && advertisementMeta.rows.length > 0) {
    return advertisementMeta.rows.map((row) =>
      normalizeTechnicalAdvertisementRow(row, selectedType, subtype)
    );
  }

  return [buildTechnicalAdvertisementRow(step1, selectedType, subtype, advertisementMeta)];
}

function getApplicationSubtypeFromApplication(app) {
  const step1 = app?.form_data?.step_1 || {};
  const selectedType = getApplicationTypeOptionsFromApplication(app)[0] || "open_space";
  const subtype = String(step1.application_subtype || "").trim().toLowerCase();
  const validSubtype = (APPLICATION_SUBTYPE_OPTIONS[selectedType] || []).some(
    (item) => item.value === subtype
  );

  return validSubtype ? subtype : getDefaultApplicationSubtype(selectedType);
}

function getApplicationTypeOptionsLabel(types, language = "en", subtype = "") {
  const selected = normalizeApplicationTypeOptions(types);
  const type = selected[0] || "";
  const subtypeLabel = getApplicationSubtypeLabel(type, subtype, language);
  return normalizeApplicationTypeOptions(types)
    .map((type) => getApplicationTypeOptionLabel(type, language))
    .map((label, index) => (index === 0 && subtypeLabel ? `${label} - ${subtypeLabel}` : label))
    .join(", ");
}

function getApplicationTypeTechnicalDepartmentsFromTypes(types) {
  const departments = normalizeApplicationTypeOptions(types).flatMap(
    (type) => APPLICATION_TYPE_TECHNICAL_DEPARTMENTS[type] || []
  );
  return normalizeTechnicalDepartmentSelection(departments);
}

function getApplicationTypeOptionsFromTechnicalRows(rows = [], fallbackType = "") {
  const rowTypes = rows.map(
    (row) =>
      normalizeApplicationTypeOptions(row?.applicationType || row?.application_type)[0]
  );
  const selectedTypes = normalizeApplicationTypeOptions(rowTypes);

  if (selectedTypes.length > 0) return selectedTypes;

  return normalizeApplicationTypeOptions(fallbackType);
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
  const route = [...selected, "IKL (TECHNICAL)"];
  return route.join(" / ");
}

function hasTechnicalDepartmentReview(app, department) {
  const normalizedDepartment = normalizeDepartmentCode(department);
  const review = getTechnicalDepartmentReviews(app)?.[normalizedDepartment];
  return Boolean(review && isCurrentTechnicalReviewCycle(app, review));
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

function getMonthOptions(t) {
  return [
    ["1", "January"],
    ["2", "February"],
    ["3", "March"],
    ["4", "April"],
    ["5", "May"],
    ["6", "June"],
    ["7", "July"],
    ["8", "August"],
    ["9", "September"],
    ["10", "October"],
    ["11", "November"],
    ["12", "December"],
  ].map(([value, label]) => ({
    value,
    label: t(`month.${value}`, label),
  }));
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

function getCurrentTechnicalSitePhotos(savedPhotos, application, activeCycleId = "") {
  const activeCycle = activeCycleId ? String(activeCycleId) : "";
  const documents = Array.isArray(application?.supporting_documents)
    ? application.supporting_documents
    : [];
  const technicalDocuments = documents.filter(
    (document) => document.title === "Technical Site Photo"
  );
  const documentIds = new Set(documents.map((document) => String(document.id)));
  const currentSavedPhotos = savedPhotos.filter((photo) => {
    if (activeCycle && String(photo?.cycle_id || "") !== activeCycle) return false;
    if (!photo?.document_id) return true;
    return documentIds.has(String(photo.document_id));
  });
  const savedDocumentIds = new Set(
    currentSavedPhotos
      .map((photo) => photo?.document_id)
      .filter(Boolean)
      .map(String)
  );
  const missingTechnicalPhotos = activeCycle
    ? []
    : technicalDocuments
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
  if (department.includes("SETIAUSAHA TETAP")) {
    return "";
  }
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

  }

  if (config?.key === "approval") {
    return [];
  }

  return Array.isArray(config?.statuses) ? config.statuses : [];
}

function getWorkspaceStatusFilterOptions(applications, config, department, t) {
  const optionsByLabel = new Map();
  const filterApplications = [
    ...getWorkspaceStatusFilterFallbackApplications(config, department),
    ...(applications || []),
  ];

  filterApplications.forEach((app) => {
    const label = String(getWorkspaceStatusLabel(app, config, t, department) || "").trim();
    if (!label || optionsByLabel.has(label)) return;

    optionsByLabel.set(label, {
      value: `display:${encodeURIComponent(label)}`,
      label,
    });
  });

  return [...optionsByLabel.values()];
}

function getWorkspaceStatusFilterFallbackApplications(config, department) {
  const statuses = getWorkspaceStatusFilterFallbackStatuses(config, department);

  return statuses.map((status) => ({
    status,
    form_data: {},
  }));
}

function getWorkspaceStatusFilterFallbackStatuses(config, department) {
  if (config?.key === "approval" && INTERNAL_WORK_TRACKING_DEPARTMENTS.has(department)) {
    return [
      ...KU_IKL_TECHNICAL_TRACKING_STATUSES,
      ...(config.statuses || []),
      "bill_pending_ku",
      "invoice_generated",
      "payment_submitted",
      "payment_verified",
      "license_issued",
      "license_revoked",
    ];
  }

  const scopedStatuses = getWorkspaceStatusScope(config, department);
  if (scopedStatuses.length > 0) return scopedStatuses;

  return Array.isArray(config?.statuses) ? config.statuses : [];
}

function matchesWorkspaceStatusFilter(app, value, config, t, department) {
  if (!value) return true;

  if (String(value).startsWith("display:")) {
    const expectedLabel = decodeURIComponent(String(value).replace(/^display:/, ""));
    return getWorkspaceStatusLabel(app, config, t, department) === expectedLabel;
  }

  return getStatusFilterValues(value).includes(normalizeStatus(app.status));
}

function getStatusFilterValues(value) {
  return String(value || "")
    .split("|")
    .map((item) => normalizeStatus(item))
    .filter(Boolean);
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
    step1.locality_address,
    step1.area_required,
    step1.amount_fund_approved,
    step1.project_justification,
    step1.site_selection_reason,
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
    actionDescription: "Record PT(IKL) or KU(IKL) recommendation for the selected application.",
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
      label: "Submit PT/KU Recommendation",
      labelKey: "workspace.action.submitScreening",
      icon: "fact_check",
      requiresComment: true,
      success: "Screening recommendation saved.",
      successKey: "workspace.message.screeningSaved",
      buildPayload: buildIklScreeningPayload,
    },
    technicalActions: [
      {
        label: "Yes",
        labelKey: "workspace.decision.yes",
        icon: "check_circle",
        decision: "Supported",
        requiresComment: true,
        success: "Technical review saved.",
        successKey: "workspace.message.technicalSaved",
        buildPayload: buildIklTechnicalDecisionPayload,
      },
      {
        label: "No",
        labelKey: "workspace.decision.no",
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
        requiresComment: true,
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
    description: "Record department site visit recommendation and remarks for IKL review.",
    descriptionKey: "workspace.technical.description",
    queueTitle: "Technical Queue",
    queueTitleKey: "workspace.technical.queue",
    actionDescription: "Enter department recommendation and site finding remarks.",
    actionDescriptionKey: "workspace.technical.action",
    showDecision: false,
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
    commentPlaceholder: "Add comments",
    commentPlaceholderKey: "workspace.comment.technicalPlaceholder",
    stats: (apps, department) => [
      { label: "Pending", labelKey: "workspace.stat.pending", value: countBy(apps, (app) => !hasTechnicalDepartmentReview(app, department)), icon: "pending", tone: "amber" },
      { label: "Completed", labelKey: "workspace.stat.completed", value: countBy(apps, (app) => hasTechnicalDepartmentReview(app, department)), icon: "check_circle" },
      { label: "Supported", labelKey: "workspace.stat.supported", value: countBy(apps, (app) => getCurrentTechnicalDepartmentReviews(app)?.[department]?.decision === "Supported"), icon: "check_circle" },
      { label: "Not Supported", labelKey: "workspace.stat.notSupported", value: countBy(apps, (app) => getCurrentTechnicalDepartmentReviews(app)?.[department]?.decision === "Not Supported"), icon: "cancel", tone: "red" },
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
    eyebrow: "KB(LES), TP/PGH, and MPHLG",
    eyebrowKey: "workspace.approval.eyebrow",
    statuses: [
      "management_review",
      "mphlg_processing",
      "mphlg_decision_received",
      "approved",
      "approved_with_conditions",
      "rejected",
    ],
    title: "Approval",
    titleKey: "workspace.approval.title",
    description: "Record KB(LES) verification, TP(RES)/PGH support, MPHLG review, and final approval.",
    descriptionKey: "workspace.approval.description",
    queueTitle: "Approval Queue",
    queueTitleKey: "workspace.approval.queue",
    actionDescription: "Submit approval recommendation or remarks.",
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
    commentPlaceholder: "Add comments",
    commentPlaceholderKey: "workspace.comment.approvalPlaceholder",
    stats: (apps) => [
      { label: "KB(LES)", value: countBy(apps, (app) => getApprovalStageKey(app) === "kb"), icon: "verified_user", tone: "amber" },
      { label: "TP(RES)/PGH", value: countBy(apps, (app) => getApprovalStageKey(app) === "support"), icon: "check_circle", tone: "blue" },
      { label: "MPHLG", value: countBy(apps, (app) => getApprovalStageKey(app) === "mphlg"), icon: "account_balance", tone: "slate" },
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
    allowedDepartments: ["PT(IKL)"],
    statuses: ["approved", "bill_pending_ku", "invoice_generated", "payment_submitted", "payment_verified"],
    listEyebrow: "E-Licenses",
    listEyebrowKey: "workspace.payment.listEyebrow",
    listTitle: "Approval Letter, Bill & Receipt",
    listTitleKey: "workspace.payment.listTitle",
    listDescription: "Select an approved application to upload the approval letter and bill or review payment receipts.",
    listDescriptionKey: "workspace.payment.listDescription",
    eyebrow: "Payment",
    eyebrowKey: "workspace.payment.eyebrow",
    title: "Bill and Payment",
    titleKey: "workspace.payment.title",
    description: "PT(IKL) uploads approval letters and bills, the applicant uploads payment proof, and PT(IKL) verifies the receipt.",
    descriptionKey: "workspace.payment.description",
    queueTitle: "Payment Queue",
    queueTitleKey: "workspace.payment.queue",
    actionDescription: "Upload an approval letter and bill, send them to the applicant, then verify whether the uploaded receipt is valid or fake.",
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
        label: "Submit",
        labelKey: "common.submit",
        icon: "send",
        success: "Approval letter and bill sent to applicant.",
        successKey: "workspace.message.invoiceGenerated",
        requiresPaymentDocuments: true,
        requiresComment: true,
        isAvailable: (app, department) =>
          department === "PT(IKL)" && ["approved", "bill_pending_ku"].includes(normalizeStatus(app?.status)),
        buildPayload: (app, data = {}) => {
          const timestamp = new Date().toISOString();
          const decision = data.decision || "Generate Approval Letter & Bill";
          const remarks = cleanRemark(data.comment);
          const savedApprovalLetter = app.form_data?.approval_letter || {};
          const letterFile = getStoredPaymentDocument(app, "letter");
          const billFile = getStoredPaymentDocument(app, "bill");

          return {
            status: "invoice_generated",
            latest_remark: remarks,
            form_data: mergeFormData(app, {
              approval_letter: {
                ...savedApprovalLetter,
                letter_file:
                  stripLocalPaymentDocumentPreview(letterFile) ||
                  savedApprovalLetter.letter_file ||
                  null,
                bill_file:
                  stripLocalPaymentDocumentPreview(billFile) ||
                  savedApprovalLetter.bill_file ||
                  null,
                status: "Sent to Applicant",
                recommendation: decision,
                letter_bill_decision: decision,
                remarks,
                submitted_by: "PT(IKL)",
                submitted_at: timestamp,
                sent_to_applicant_at: timestamp,
              },
              payment: {
                ...(app.form_data?.payment || {}),
                invoice_no: getInvoiceNo(app),
                amount: getBillAmount(app),
                status: "Awaiting Payment",
                generated_by: "PT(IKL)",
                generated_at: timestamp,
              },
            }),
          };
        },
      },
      {
        label: "Verify Receipt",
        labelKey: "workspace.action.verifyPayment",
        icon: "verified",
        success: "Payment verified and e-license issued.",
        successKey: "workspace.message.paymentVerified",
        requiresComment: true,
        requiresReceipt: true,
        requiresSubmittedReceipt: true,
        requiresPaymentDocuments: true,
        requiresOfficialReceipt: true,
        requiresLicenseDocument: true,
        isAvailable: (app, department) =>
          department === "PT(IKL)" && normalizeStatus(app?.status) === "payment_submitted",
        buildPayload: (app, data) => {
          const now = new Date();
          const timestamp = now.toISOString();
          const savedApprovalLetter = app.form_data?.approval_letter || {};
          const savedOfficialReceipt =
            getStoredPaymentDocument(app, "official_receipt") ||
            savedApprovalLetter.official_receipt_file ||
            {};
          const savedLicense = app.form_data?.license || {};
          const validityYears = Number(savedLicense.validity_years) || 1;
          const issueDate = parseDateOrFallback(savedLicense.issue_date, now);
          const expiryDate = parseDateOrFallback(
            savedLicense.expiry_date,
            addCalendarYears(issueDate, validityYears)
          );
          const licenseId = savedLicense.license_id || getLicenseId(app);

          return {
            status: "license_issued",
            latest_remark: data.comment,
            form_data: mergeFormData(app, {
              approval_letter: {
                ...savedApprovalLetter,
                official_receipt_file: {
                  ...stripLocalPaymentDocumentPreview(savedOfficialReceipt),
                  status: "Sent to Applicant",
                  sent_at: timestamp,
                },
              },
              payment: {
                ...(app.form_data?.payment || {}),
                status: "Payment Verified",
                recommendation: "Verify Receipt",
                receipt_decision: "Verify Receipt",
                verification_result: "Valid",
                verification_notes: data.comment,
                verified_at: timestamp,
              },
              license: {
                ...savedLicense,
                creation_mode: "upload",
                license_id: licenseId,
                status: "Active",
                holder: getApplicantName(app),
                type: getApplicationType(app),
                location: getApplicationLocation(app),
                issue_date: issueDate.toISOString(),
                expiry_date: expiryDate.toISOString(),
                validity_years: validityYears,
                verification_url: getLicenseVerificationUrl(licenseId),
                issued_at: timestamp,
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
          latest_remark: data.comment,
          form_data: mergeFormData(app, {
            payment: {
              ...(app.form_data?.payment || {}),
              status: "Receipt Rejected",
              recommendation: "Reject Receipt",
              receipt_decision: "Reject Receipt",
              verification_result: "Invalid/Fake",
              verification_notes: data.comment,
              rejected_at: new Date().toISOString(),
            },
          }),
        }),
      },
      {
        label: "Revoke License",
        labelKey: "workspace.action.revokeLicense",
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
        label: "Restore License",
        labelKey: "workspace.action.restoreLicense",
        icon: "restart_alt",
        success: "License restored.",
        successKey: "workspace.message.licenseRestored",
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
    ],
    details: PaymentDetails,
  },
  license: {
    key: "license",
    allowedDepartments: ["PT(IKL)", "KB(LES)", "TP(RES)", "PGH", "TP(RES)/PGH", "TP/PGH", "MPHLG"],
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
        requiresLicenseDocument: true,
        isAvailable: (app, department) =>
          department === "PT(IKL)" && normalizeStatus(app?.status) === "payment_verified",
        buildPayload: (app, data) => {
          const today = new Date();
          const validityYears = Number(data?.licenseExpiryYears) || 1;
          const savedLicense = app.form_data?.license || {};
          const issueDate = parseDateOrFallback(savedLicense.issue_date, today);
          const expiry = parseDateOrFallback(
            savedLicense.expiry_date,
            addCalendarYears(issueDate, validityYears)
          );
          const licenseId = getLicenseId(app);
          return {
            status: "license_issued",
            form_data: mergeFormData(app, {
              license: {
                ...savedLicense,
                creation_mode: "upload",
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
  showKuVerificationReport = false,
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
    showTechnicalDepartmentRemarks && !showKuTechnicalReview && !showTechnicalFinalDecision;
  const [kuDecision, setKuDecision] = useState(
    ""
  );
  const [screeningDecisionInput, setScreeningDecisionInput] = useState("");
  const [screeningDecisionError, setScreeningDecisionError] = useState("");
  const [kuDecisionInput, setKuDecisionInput] = useState("");
  const [kuDecisionError, setKuDecisionError] = useState("");
  const [kuRemarks, setKuRemarks] = useState("");
  const [technicalDecision, setTechnicalDecision] = useState(
    config.technicalActions?.[0]?.decision || ""
  );
  const [technicalDecisionInput, setTechnicalDecisionInput] = useState(
    getTechnicalRecommendationInput(config.technicalActions?.[0]?.decision || "")
  );
  const [technicalDecisionError, setTechnicalDecisionError] = useState("");
  const technicalSiteSaveTimerRef = useRef(null);
  const latestTechnicalSiteRef = useRef(technicalSite);
  const screeningDecisionInputRef = useRef(null);
  const screeningRemarksRef = useRef(null);
  const technicalDecisionInputRef = useRef(null);
  const technicalRemarksRef = useRef(null);
  const kuDecisionInputRef = useRef(null);
  const kuRemarksRef = useRef(null);
  const [kuChecks, setKuChecks] = useState(() =>
    createKuTechnicalChecks(selectedRecord.form_data?.technical_ku_review?.checks)
  );
  const reviewTechnicalSite = getReviewTechnicalSite(technicalSite, selectedRecord);
  const screeningDecisionOptions = useMemo(
    () => getIklScreeningDecisionOptions(config.decisions, userDepartment),
    [config.decisions, userDepartment]
  );
  const screeningCopy = getIklScreeningCopy(userDepartment);
  const selectedTechnicalAction = config.technicalActions.find(
    (action) => action.decision === technicalDecision
  );
  const technicalDecisionMustWait =
    selectedTechnicalAction &&
    (!hasSavedDepartmentSelection || !allDepartmentReviewsComplete) &&
    selectedTechnicalAction.decision !== "Not Supported";
  const technicalDecisionDisabled =
    saving ||
    Boolean(selectedTechnicalAction?.disabled) ||
    technicalDecisionMustWait;

  useEffect(() => {
    const hasDecision = screeningDecisionOptions.some(
      (item) => (item.value || item) === decision
    );
    if (decision && !hasDecision) {
      setDecision("");
      setScreeningDecisionInput("");
      return;
    }

    setScreeningDecisionInput(
      hasDecision
        ? getIklScreeningDecisionInput(decision, screeningDecisionOptions, userDepartment, t)
        : ""
    );
    setScreeningDecisionError("");
  }, [decision, screeningDecisionOptions, setDecision, t, userDepartment]);

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
    setTechnicalDecisionInput(
      hasSavedDecision
        ? getTechnicalRecommendationInput(savedDecision)
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
    const nextSubtype = getDefaultApplicationSubtype(nextSelection[0]);
    const nextDisplayType = getTechnicalDisplayTypeFromSubtype(nextSubtype);
    setTechnicalSite((prev) =>
      mergeTechnicalFeeCalculation({
        ...prev,
        application_subtype: nextSubtype,
      })
    );
    saveTechnicalApplicationTypeSelection(nextSelection, nextSubtype, {
      displayType: nextDisplayType,
      advertisementType: getTechnicalAdvertisementTypeValue(
        selectedRecord.form_data?.step_1 || {},
        nextDisplayType
      ),
    });
  }

  function handleTechnicalApplicationSubtypeChange(nextSubtype, advertisementMeta = {}) {
    const nextSelection = normalizeApplicationTypeOptions(
      advertisementMeta.selectedTypes || technicalApplicationTypeSelection
    );
    const selectedType = nextSelection[0];
    const normalizedSubtype = normalizeApplicationSubtype(nextSubtype, selectedType);

    if (!normalizedSubtype) return;

    setTechnicalApplicationTypeSelection(nextSelection);
    setTechnicalSite((prev) =>
      mergeTechnicalFeeCalculation({
        ...prev,
        application_subtype: normalizedSubtype,
      })
    );
    saveTechnicalApplicationTypeSelection(
      nextSelection,
      normalizedSubtype,
      advertisementMeta
    );
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
    const cycleId =
      latestTechnicalSiteRef.current.cycle_id ||
      selectedRecord.form_data?.technical_review_cycle ||
      "";
    const cyclePhotos = sitePhotos.map((photo) => ({
      ...photo,
      cycle_id: cycleId,
    }));

    if (technicalSiteSaveTimerRef.current) {
      window.clearTimeout(technicalSiteSaveTimerRef.current);
    }

    const nextSite = {
      ...latestTechnicalSiteRef.current,
      site_photos: [...(latestTechnicalSiteRef.current.site_photos || []), ...cyclePhotos],
    };

    setTechnicalSite(nextSite);
    latestTechnicalSiteRef.current = nextSite;
    saveTechnicalSiteVisitDraft({
      ...nextSite,
    });
  }

  function submitKuTechnicalReview() {
    const cleanedRemarks = cleanRemark(kuRemarks);

    if (!kuDecision) {
      setKuDecisionError(
        t(
          "workspace.decision.typeApproveOrRequestAmendment",
          "Type Approve or Request Amendment"
        )
      );
      kuDecisionInputRef.current?.focus();
      return;
    }

    if (!cleanedRemarks) {
      setCommentError(t("workspace.validation.remarksRequired", "Remarks are required."));
      kuRemarksRef.current?.focus();
      return;
    }

    submitAction(config.kuTechnicalReview.action, {
      decision: kuDecision,
      comment: kuRemarks,
      kuChecks,
      checkDecisionRemark: true,
    });
  }

  function submitTechnicalFinalDecision() {
    const cleanedRemarks = cleanRemark(technicalSite.site_remarks);

    if (!selectedTechnicalAction) {
      setTechnicalDecisionError(
        t("workspace.technical.typeYesOrNo", "Type Yes or No")
      );
      technicalDecisionInputRef.current?.focus();
      return;
    }

    if (technicalDecisionDisabled) return;

    if (!cleanedRemarks) {
      setCommentError(t("workspace.validation.remarksRequired", "Remarks are required."));
      technicalRemarksRef.current?.focus();
      return;
    }

    submitAction(selectedTechnicalAction, {
      comment: technicalSite.site_remarks,
      checkDecisionRemark: true,
    });
  }

  return (
    <div className="space-y-4 text-sm leading-5">
      {showScreeningDecision && (
        <section className="rounded-md border border-slate-200 bg-white p-2.5 text-sm leading-5">
          <div className="mb-2.5">
            <h3 className="text-[14px] font-semibold leading-5 text-slate-950">
              {t(screeningCopy.titleKey, screeningCopy.title)}
            </h3>
            <p className="mt-1 text-sm leading-5 text-slate-500">
              {t(screeningCopy.descriptionKey, screeningCopy.description)}
            </p>
          </div>

          <div className="space-y-3">
            <Field
              label={t(config.decisionLabelKey || "common.decision", config.decisionLabel || "Your Recommendation")}
              labelClassName="!text-sm"
            >
              <input
                ref={screeningDecisionInputRef}
                type="text"
                value={screeningDecisionInput}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  const nextDecision = getIklScreeningDecisionFromInput(
                    nextValue,
                    screeningDecisionOptions,
                    userDepartment,
                    t
                  );
                  setScreeningDecisionInput(nextValue);
                  setDecision(nextDecision);
                  if (screeningDecisionError) setScreeningDecisionError("");
                }}
                onBlur={() => {
                  if (decision) {
                    setScreeningDecisionInput(
                      getIklScreeningDecisionInput(decision, screeningDecisionOptions, userDepartment, t)
                    );
                  }
                }}
                className={`form-input form-input-sm max-w-60 ${screeningDecisionError ? "border-red-300 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(220,38,38,0.12)]" : ""}`}
                placeholder={getIklScreeningDecisionInputPrompt(screeningDecisionOptions, userDepartment, t)}
                inputMode="text"
                aria-invalid={Boolean(screeningDecisionError)}
              />
              {screeningDecisionError && (
                <p className="mt-1.5 text-[13px] font-medium leading-5 text-red-600">
                  {screeningDecisionError}
                </p>
              )}
            </Field>

            <Field
              label={
                <>
                  {t(config.commentLabelKey, config.commentLabel || "Notes")}
                  <span className="ml-1 text-red-600">*</span>
                </>
              }
              labelClassName="!text-sm"
            >
              <textarea
                ref={screeningRemarksRef}
                value={comment}
                onChange={(event) => {
                  setComment(event.target.value);
                  if (commentError) setCommentError("");
                }}
                rows="3"
                required
                aria-required="true"
                className={`form-input form-input-sm ${commentError ? "border-red-300 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(220,38,38,0.12)]" : ""}`}
                placeholder={t(screeningCopy.placeholderKey, screeningCopy.placeholder)}
              />
              {commentError && (
                <p className="mt-1.5 text-[13px] font-medium leading-5 text-red-600">
                  {commentError}
                </p>
              )}
            </Field>

            <div className="flex justify-end">
              <Button
                icon="fact_check"
                disabled={saving}
                onClick={() => {
                  const typedDecision = getIklScreeningDecisionFromInput(
                    screeningDecisionInput,
                    screeningDecisionOptions,
                    userDepartment,
                    t
                  );
                  const cleanedComment = cleanRemark(comment);

                  if (!typedDecision) {
                    setScreeningDecisionError(
                      getIklScreeningDecisionInputPrompt(screeningDecisionOptions, userDepartment, t)
                    );
                    screeningDecisionInputRef.current?.focus();
                    return;
                  }

                  if (!cleanedComment) {
                    setCommentError(t("workspace.validation.remarksRequired", "Remarks are required."));
                    screeningRemarksRef.current?.focus();
                    return;
                  }

                  setDecision(typedDecision);
                  submitAction(config.screeningAction, {
                    decision: typedDecision,
                    comment: cleanedComment,
                    checkDecisionRemark: false,
                  });
                }}
                className="min-h-8 px-2.5 py-1 text-sm sm:w-auto"
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
            <>
              <TechnicalApplicationTypePanel
                t={t}
                language={language}
                selectedTypes={technicalApplicationTypeSelection}
                selectedSubtype={
                  technicalSite.application_subtype ||
                  getApplicationSubtypeFromApplication(selectedRecord)
                }
                derivedDepartments={getApplicationTypeTechnicalDepartmentsFromTypes(
                  technicalApplicationTypeSelection
                )}
                step1={selectedRecord.form_data?.step_1 || {}}
                saving={saving}
                onToggle={handleTechnicalApplicationTypeToggle}
                onSubtypeChange={handleTechnicalApplicationSubtypeChange}
              />

              <TechnicalDepartmentRemarks app={selectedRecord} t={t} compact />
            </>
          )}

          <TechnicalSiteVisitFields
            t={t}
            language={language}
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
            <div className="space-y-2.5">
              <Field
                label={t("workspace.technical.supportQuestion", "Your Recommendation")}
                labelClassName="!mb-1 !text-[13px] !leading-4"
              >
                <input
                  ref={technicalDecisionInputRef}
                  type="text"
                  value={technicalDecisionInput}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setTechnicalDecisionInput(nextValue);
                    if (technicalDecisionError) setTechnicalDecisionError("");
                    setTechnicalDecision(getTechnicalRecommendationDecision(nextValue));
                  }}
                  className={`form-input form-input-sm max-w-sm ${technicalDecisionError ? "border-red-300 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(220,38,38,0.12)]" : ""}`}
                  placeholder={t("workspace.technical.recommendationPlaceholder", "Type Yes or No")}
                  inputMode="text"
                  aria-invalid={Boolean(technicalDecisionError)}
                />
                {technicalDecisionError && (
                  <p className="mt-1.5 text-sm font-medium leading-5 text-red-600">
                    {technicalDecisionError}
                  </p>
                )}
              </Field>

              <Field
                label={
                  <>
                    {t("workspace.comment.remarks", "Remarks")}
                    <span className="ml-1 text-red-600">*</span>
                  </>
                }
                labelClassName="!mb-1 !text-[13px] !leading-4"
              >
                <textarea
                  ref={technicalRemarksRef}
                  value={technicalSite.site_remarks}
                  onChange={(event) => {
                    if (commentError) setCommentError("");
                    setTechnicalSite((prev) => ({
                      ...prev,
                      site_remarks: event.target.value,
                    }));
                  }}
                  rows="2"
                  required
                  aria-required="true"
                  aria-invalid={Boolean(commentError)}
                  className={`form-input form-input-sm !min-h-[58px] ${commentError ? "border-red-300 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(220,38,38,0.12)]" : ""}`}
                  placeholder={t("workspace.technical.siteRemarksPlaceholder")}
                />
                {commentError && (
                  <p className="mt-1.5 text-sm font-medium leading-5 text-red-600">
                    {commentError}
                  </p>
                )}
              </Field>

              <div className="flex justify-end border-t border-slate-100 pt-3">
                <Button
                  icon="fact_check"
                  disabled={technicalDecisionDisabled}
                  onClick={submitTechnicalFinalDecision}
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
          {showKuVerificationReport && (
            <>
              <TechnicalApplicationTypePanel
                t={t}
                language={language}
                selectedTypes={getApplicationTypeOptionsFromApplication(selectedRecord)}
                selectedSubtype={getApplicationSubtypeFromApplication(selectedRecord)}
                derivedDepartments={getSelectedTechnicalDepartments(selectedRecord)}
                step1={selectedRecord.form_data?.step_1 || {}}
                saving={false}
                onToggle={() => {}}
                readOnly
              />

              <KuTechnicalFurtherReviewPanel
                t={t}
                language={language}
                selectedRecord={selectedRecord}
                technicalSite={reviewTechnicalSite}
                checks={kuChecks}
                onCheckChange={updateKuCheck}
                compact
              />

              <TechnicalSiteVisitFields
                t={t}
                language={language}
                applicationId={selectedRecord.id}
                value={reviewTechnicalSite}
                onChange={() => {}}
                onFileChange={() => {}}
                readOnly
              />
            </>
          )}

          <section className="space-y-3">
              <Field label={t("common.decision")}>
                <input
                  ref={kuDecisionInputRef}
                  type="text"
                  value={kuDecisionInput}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setKuDecisionInput(nextValue);
                    if (kuDecisionError) setKuDecisionError("");
                    setKuDecision(
                      getKuTechnicalReviewDecisionFromInput(
                        nextValue,
                        config.kuTechnicalReview.decisions,
                        t
                      )
                    );
                  }}
                  onBlur={() => {
                    if (kuDecision) {
                      setKuDecisionInput(
                        getKuTechnicalReviewDecisionInput(
                          kuDecision,
                          config.kuTechnicalReview.decisions,
                          t
                        )
                      );
                    }
                  }}
                  className={`form-input w-full max-w-[28rem] ${kuDecisionError ? "border-red-300 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(220,38,38,0.12)]" : ""}`}
                  placeholder={t(
                    "workspace.decision.typeApproveOrRequestAmendment",
                    "Type Approve or Request Amendment"
                  )}
                  inputMode="text"
                  aria-invalid={Boolean(kuDecisionError)}
                />
                {kuDecisionError && (
                  <p className="mt-1.5 text-[13px] font-medium leading-5 text-red-600">
                    {kuDecisionError}
                  </p>
                )}
              </Field>

              <Field
                label={
                  <>
                    {t("workspace.comment.remarks")}
                    <span className="ml-1 text-red-600">*</span>
                  </>
                }
              >
                <textarea
                  ref={kuRemarksRef}
                  value={kuRemarks}
                  onChange={(event) => {
                    setKuRemarks(event.target.value);
                    if (commentError) setCommentError("");
                  }}
                  rows="4"
                  required
                  aria-required="true"
                  aria-invalid={Boolean(commentError)}
                  className={`form-input ${commentError ? "border-red-300 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(220,38,38,0.12)]" : ""}`}
                  placeholder={t("workspace.technical.kuReviewPlaceholder")}
                />
                {commentError && (
                  <p className="mt-1.5 text-[13px] font-medium leading-5 text-red-600">
                    {commentError}
                  </p>
                )}
              </Field>

              <div className="flex justify-end">
                <Button
                  icon={config.kuTechnicalReview.action.icon}
                  disabled={saving}
                  onClick={submitKuTechnicalReview}
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
  const applicationSubtype =
    technicalSite.application_subtype ||
    saved.application_subtype ||
    getApplicationSubtypeFromApplication(selectedRecord);
  const preparedSite = mergeTechnicalFeeRowsCalculation({
    ...saved,
    ...technicalSite,
    application_subtype: applicationSubtype,
    advertisement_rows: getTechnicalFeeRowsFromApplication(
      selectedRecord,
      technicalSite.advertisement_rows || saved.advertisement_rows
    ),
  });
  const calculatedFees = calculateTechnicalFee({
    ...preparedSite,
    application_subtype: applicationSubtype,
  });

  return {
    ...preparedSite,
    application_subtype: applicationSubtype,
    fee_schedule_key: calculatedFees.scheduleKey || saved.fee_schedule_key || "",
    fee_schedule_no: calculatedFees.scheduleNumber || saved.fee_schedule_no || "",
    site_photos: currentPhotos.length > 0 ? currentPhotos : savedPhotos,
    fee_date: technicalSite.fee_date || saved.fee_date || "",
    fee_items: feeItems,
    advertisement_rows: preparedSite.advertisement_rows || [],
    width_ft: preparedSite.width_ft || technicalSite.width_ft || saved.width_ft || "",
    height_ft: preparedSite.height_ft || technicalSite.height_ft || saved.height_ft || "",
    area_sqft: preparedSite.area_sqft || calculatedFees.areaSqft || saved.area_sqft || "",
    area_sqm: preparedSite.area_sqm || calculatedFees.areaSqm || saved.area_sqm || "",
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
      actionDescription: "Record PT(IKL) recommendation for the selected application.",
      titleKey: "workspace.ikl.ptScreeningTitle",
      title: "PT(IKL) Verification",
      descriptionKey: "workspace.ikl.ptScreeningDesc",
      description: "Review applicant information and documents, then send the application onward or reject it with remarks.",
      placeholderKey: "workspace.comment.ptScreeningPlaceholder",
      placeholder: "Enter remarks for this recommendation.",
      submitKey: "common.submit",
      submitLabel: "Submit",
    };
  }

  if (department === "KU(IKL)") {
    return {
      actionDescriptionKey: "workspace.screening.actionKu",
      actionDescription: "Record KU(IKL) recommendation for the selected application.",
      titleKey: "workspace.ikl.kuScreeningTitle",
      title: "KU(IKL) Verification",
      descriptionKey: "workspace.ikl.kuScreeningDesc",
      description: "Review the screening result, then send the application to technical review or reject it with remarks.",
      placeholderKey: "workspace.comment.kuScreeningPlaceholder",
      placeholder: "Enter remarks for this recommendation.",
      submitKey: "common.submit",
      submitLabel: "Submit",
    };
  }

  return {
    actionDescriptionKey: "workspace.screening.action",
    actionDescription: "Record PT(IKL) or KU(IKL) recommendation for the selected application.",
    titleKey: "workspace.ikl.screeningTitle",
    title: "PT(IKL) / KU(IKL) Verification",
    descriptionKey: "workspace.ikl.screeningDesc",
    description: "Use this section to send to KU(IKL), send to technical review, or reject to the applicant with remarks.",
    placeholderKey: "workspace.comment.screeningPlaceholder",
    placeholder: "Enter remarks for this recommendation.",
    submitKey: "workspace.action.submitScreening",
    submitLabel: "Submit PT/KU Recommendation",
  };
}

function TechnicalApplicationTypePanel({
  t,
  language,
  selectedTypes,
  selectedSubtype = "",
  derivedDepartments,
  step1 = {},
  saving,
  onSubtypeChange,
  readOnly = false,
}) {
  const [advertisementTypeModal, setAdvertisementTypeModal] = useState({
    rowIndex: null,
    value: "",
  });
  const [isEditingApplicationType, setIsEditingApplicationType] = useState(false);
  const selectedType = normalizeApplicationTypeOptions(selectedTypes)[0] || "";
  const subtypeOptions = APPLICATION_SUBTYPE_OPTIONS[selectedType] || [];
  const normalizedSubtype =
    normalizeApplicationSubtype(selectedSubtype, selectedType) ||
    getDefaultApplicationSubtype(selectedType);
  const advertisementRows = getTechnicalAdvertisementRowsFromStep1(
    step1,
    selectedType,
    normalizedSubtype
  );
  const canEdit = !saving && !readOnly && isEditingApplicationType;
  const rowSelectedTypes = getApplicationTypeOptionsFromTechnicalRows(
    advertisementRows,
    selectedType
  );
  const rowDepartments = getApplicationTypeTechnicalDepartmentsFromTypes(rowSelectedTypes);
  const displayDepartments = rowDepartments.length > 0 ? rowDepartments : derivedDepartments;
  const departmentsText = Array.isArray(displayDepartments)
    ? displayDepartments.join(", ")
    : String(displayDepartments || "").trim();
  const showRequiredMarker = !readOnly;

  function commitAdvertisementRows(nextRows) {
    const primaryRow = nextRows[0] || {};
    const primaryType =
      normalizeApplicationTypeOptions(primaryRow.applicationType || primaryRow.application_type)[0] ||
      selectedType;
    const nextSelectedTypes = getApplicationTypeOptionsFromTechnicalRows(nextRows, primaryType);
    const nextSubtype =
      normalizeApplicationSubtype(primaryRow.subtype, primaryType) ||
      getSubtypeForTechnicalDisplayType(primaryType, primaryRow.displayType);

    onSubtypeChange?.(nextSubtype, {
      rows: nextRows,
      selectedTypes: nextSelectedTypes.length > 0 ? nextSelectedTypes : undefined,
      displayType: primaryRow.displayType,
      advertisementType: primaryRow.customLabel,
    });
  }

  function handleCategoryChange(rowIndex, nextApplicationType) {
    if (!canEdit) return;

    const normalizedType =
      normalizeApplicationTypeOptions(nextApplicationType)[0] || selectedType;
    if (!normalizedType) return;

    const nextRows = advertisementRows.map((row, index) => {
      if (index !== rowIndex) return row;

      const displayType =
        row.displayType ||
        row.display_type ||
        getTechnicalDisplayTypeFromSubtype(row.subtype || normalizedSubtype);

      return {
        ...row,
        applicationType: normalizedType,
        application_type: normalizedType,
        displayType,
        display_type: displayType,
        subtype: getSubtypeForTechnicalDisplayType(normalizedType, displayType),
        customLabel: "",
        custom_label: "",
      };
    });

    commitAdvertisementRows(nextRows);
  }

  function handleDisplayTypeChange(rowIndex, nextDisplayType) {
    const nextRows = advertisementRows.map((row, index) =>
      {
        if (index !== rowIndex) return row;

        const rowType =
          normalizeApplicationTypeOptions(row.applicationType || row.application_type)[0] ||
          selectedType;

        return {
          ...row,
          displayType: nextDisplayType,
          display_type: nextDisplayType,
          subtype: getSubtypeForTechnicalDisplayType(rowType, nextDisplayType),
          customLabel: "",
          custom_label: "",
        };
      }
    );

    commitAdvertisementRows(nextRows);
  }

  function handleAdvertisementTypeChange(rowIndex, nextAdvertisementType) {
    const currentRow = advertisementRows[rowIndex] || {};
    const displayType = currentRow.displayType || getTechnicalDisplayTypeFromSubtype(normalizedSubtype);
    const nextRows = advertisementRows.map((row, index) =>
      {
        if (index !== rowIndex) return row;

        const rowType =
          normalizeApplicationTypeOptions(row.applicationType || row.application_type)[0] ||
          selectedType;

        return {
          ...row,
          displayType,
          display_type: displayType,
          subtype: getSubtypeForTechnicalDisplayType(rowType, displayType),
          customLabel: nextAdvertisementType,
          custom_label: nextAdvertisementType,
        };
      }
    );

    commitAdvertisementRows(nextRows);
  }

  function handleAddRow() {
    if (!canEdit) return;
    const fallbackType =
      normalizeApplicationTypeOptions(
        advertisementRows[advertisementRows.length - 1]?.applicationType ||
          advertisementRows[advertisementRows.length - 1]?.application_type
      )[0] || selectedType;
    commitAdvertisementRows([...advertisementRows, createTechnicalAdvertisementRow(fallbackType)]);
  }

  function handleDeleteRow(rowIndex) {
    if (!canEdit) return;

    const nextRows =
      advertisementRows.length <= 1
        ? [createTechnicalAdvertisementRow()]
        : advertisementRows.filter((_, index) => index !== rowIndex);

    commitAdvertisementRows(nextRows);
  }

  function handleOpenAddAdvertisementType(rowIndex) {
    if (!canEdit) return;

    const displayType = advertisementRows[rowIndex]?.displayType || "";
    if (!displayType) {
      window.alert(stepText(language, "selectDisplayTypeFirst"));
      return;
    }

    setAdvertisementTypeModal({
      rowIndex,
      value: "",
    });
  }

  function handleCloseAdvertisementTypeModal() {
    setAdvertisementTypeModal({
      rowIndex: null,
      value: "",
    });
  }

  function handleSaveAdvertisementTypeModal() {
    const rowIndex = advertisementTypeModal.rowIndex;
    const nextValue = String(advertisementTypeModal.value || "").trim();

    if (rowIndex === null || rowIndex === undefined || !nextValue) return;

    handleAdvertisementTypeChange(rowIndex, nextValue);
    handleCloseAdvertisementTypeModal();
  }

  return (
    <>
    <section className="rounded-sm border border-slate-200 bg-white">
      <div className="border-b border-black bg-slate-50 px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold leading-5 text-slate-800">
            {stepText(language, "applicationProjectList")}{" "}
            {showRequiredMarker && (
              <span className="text-red-600" aria-hidden="true">*</span>
            )}
          </h3>
          {!readOnly && (
            <button
              type="button"
              className={`min-h-9 rounded-sm border px-4 py-1.5 text-sm font-semibold ${
                isEditingApplicationType
                  ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                  : "border-emerald-700 bg-white text-emerald-700 hover:bg-emerald-50"
              } disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400`}
              disabled={saving}
              onClick={() => setIsEditingApplicationType((editing) => !editing)}
            >
              {isEditingApplicationType
                ? t("common.done", "Done")
                : t("common.edit", "Edit")}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3 p-3">
        {subtypeOptions.length > 0 && (
          <div className="overflow-x-auto rounded-sm border border-slate-200 bg-white">
          <table className={`${readOnly ? "min-w-[840px]" : "min-w-[1080px]"} w-full border-collapse text-sm`}>
            <colgroup>
              <col className="w-16" />
              <col className="w-[140px]" />
              <col className="w-[170px]" />
              <col className="w-[240px]" />
              {!readOnly && <col className="w-px" />}
              <col />
            </colgroup>
            <thead className="bg-slate-50 text-center text-sm font-bold text-slate-700">
              <tr>
                <th className="border-b border-slate-200 px-3 py-2">
                  {stepText(language, "advertisementNumber")}
                </th>
                <th className="border-b border-slate-200 px-3 py-2">
                  {stepText(language, "applicationCategory")}
                </th>
                <th className="border-b border-slate-200 px-3 py-2">
                  {stepText(language, "displayType")}
                </th>
                <th className="border-b border-slate-200 px-3 py-2">
                  {stepText(language, "advertisementType")}
                </th>
                {!readOnly && (
                  <th className="whitespace-nowrap border-b border-slate-200 px-3 py-2">
                    {stepText(language, "action")}
                  </th>
                )}
                <th className="border-b border-slate-200 px-3 py-2">
                  {stepText(language, "title")}
                </th>
              </tr>
            </thead>
            <tbody>
              {advertisementRows.map((row, index) => {
                const rowType =
                  normalizeApplicationTypeOptions(row.applicationType || row.application_type)[0] ||
                  selectedType;
                const selectedAdvertisementValue =
                  row.customLabel ||
                  row.custom_label ||
                  getApplicationSubtypeLabel(rowType, row.subtype, "en") ||
                  "";
                const advertisementOptions = getTechnicalAdvertisementOptions(
                  row,
                  language
                );
                if (
                  selectedAdvertisementValue &&
                  !advertisementOptions.some(
                    (option) =>
                      option.value.toLowerCase() === selectedAdvertisementValue.toLowerCase()
                  )
                ) {
                  advertisementOptions.push({
                    value: selectedAdvertisementValue,
                    label: getTechnicalAdvertisementOptionLabel(
                      selectedAdvertisementValue,
                      language
                    ),
                  });
                }

                return (
                  <tr key={`technical-advertisement-row-${index}`} className="align-top">
                    <td className="border-t border-slate-100 px-3 py-3 font-semibold text-slate-700">
                      {index + 1}
                    </td>
                    <td className="border-t border-slate-100 px-3 py-3">
                      {readOnly ? (
                        <ReadOnlyTableValue value={getApplicationTypeOptionLabel(rowType, language)} />
                      ) : (
                        <select
                          className="spa-input !text-sm"
                          value={rowType}
                          disabled={!canEdit}
                          onChange={(event) => handleCategoryChange(index, event.target.value)}
                        >
                          {APPLICATION_TYPE_OPTIONS.map((type) => (
                            <option key={type} value={type}>
                              {getApplicationTypeOptionLabel(type, language)}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="border-t border-slate-100 px-3 py-3">
                      {readOnly ? (
                        <ReadOnlyTableValue
                          value={
                            getTechnicalDisplayTypeLabel(row.displayType || "", language) ||
                            "-"
                          }
                        />
                      ) : (
                        <select
                          className="spa-input !text-sm"
                          value={row.displayType || ""}
                          disabled={!canEdit}
                          onChange={(event) => handleDisplayTypeChange(index, event.target.value)}
                        >
                          <option value="">
                            {stepText(language, "selectDisplayType")}
                          </option>
                          {TECHNICAL_DISPLAY_TYPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {stepText(language, option.labelKey)}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="border-t border-slate-100 px-3 py-3">
                      {readOnly ? (
                        <ReadOnlyTableValue
                          value={
                            getTechnicalAdvertisementOptionLabel(
                              selectedAdvertisementValue,
                              language
                            ) || "-"
                          }
                        />
                      ) : (
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <select
                            className="spa-input min-w-0 flex-1 !text-sm"
                            value={selectedAdvertisementValue}
                            disabled={!canEdit}
                            onChange={(event) => handleAdvertisementTypeChange(index, event.target.value)}
                          >
                            <option value="">
                              {stepText(language, "selectAdvertisementType")}
                            </option>
                            {advertisementOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label || getTechnicalAdvertisementOptionLabel(option.value, language)}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </td>
                    {!readOnly && (
                      <td className="w-px whitespace-nowrap border-t border-slate-100 px-2 py-3">
                        <div className="flex flex-nowrap gap-1.5">
                          <button
                            type="button"
                            className="shrink-0 rounded-sm bg-[#006d32] px-2.5 py-2 text-xs font-semibold text-white hover:bg-[#005224] disabled:cursor-not-allowed disabled:bg-slate-300"
                            disabled={!canEdit}
                            onClick={() => handleOpenAddAdvertisementType(index)}
                          >
                            {stepText(language, "addAdvertisementOption")}
                          </button>
                          <button
                            type="button"
                            className="shrink-0 rounded-sm border border-red-600 bg-white px-2.5 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
                            disabled={!canEdit}
                            onClick={() => handleDeleteRow(index)}
                          >
                            {stepText(language, "deleteAdvertisementRow")}
                          </button>
                        </div>
                      </td>
                    )}
                    <td className="border-t border-slate-100 px-3 py-3">
                      <div className="min-h-10 rounded-sm border border-slate-200 bg-white px-3 py-2 text-xs font-normal uppercase leading-5 text-slate-700">
                        {buildTechnicalProjectNameLine(language, row, rowType) || "-"}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {!readOnly && (
            <div className="border-t border-slate-200 bg-slate-50 px-3 py-2">
              <button
                type="button"
                className="rounded-sm border border-emerald-700 bg-white px-3 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
                disabled={!canEdit}
                onClick={handleAddRow}
              >
                {stepText(language, "addAdvertisementRow")}
              </button>
            </div>
          )}
          </div>
        )}
        {departmentsText && (
          <p className="text-sm leading-5 text-slate-700">
            <span className="font-semibold">
              {t("workspace.technical.departmentsInvolved", "Departments involved")}:
            </span>{" "}
            {departmentsText}
          </p>
        )}
      </div>
    </section>
    {advertisementTypeModal.rowIndex !== null && advertisementTypeModal.rowIndex !== undefined && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4">
        <div className="w-full max-w-md rounded-sm border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="text-sm font-bold text-slate-800">
              {stepText(language, "addAdvertisementTypeModalTitle")}
            </h3>
          </div>

          <div className="space-y-2 px-4 py-4">
            <label className="text-sm font-bold text-slate-700">
              {stepText(language, "advertisementType")}
            </label>
            <input
              className="spa-input !text-sm"
              value={advertisementTypeModal.value}
              autoFocus
              onChange={(event) =>
                setAdvertisementTypeModal((prev) => ({
                  ...prev,
                  value: event.target.value,
                }))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") handleSaveAdvertisementTypeModal();
                if (event.key === "Escape") handleCloseAdvertisementTypeModal();
              }}
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
            <button
              type="button"
              className="rounded-sm border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              onClick={handleCloseAdvertisementTypeModal}
            >
              {stepText(language, "cancel")}
            </button>
            <button
              type="button"
              className="rounded-sm bg-[#006d32] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#005224] disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={!String(advertisementTypeModal.value || "").trim()}
              onClick={handleSaveAdvertisementTypeModal}
            >
              {stepText(language, "save")}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

function ReadOnlyTableValue({ value }) {
  return (
    <div className="min-h-10 rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-5 text-slate-700">
      {value || "-"}
    </div>
  );
}

function KuTechnicalFurtherReviewPanel({
  t,
  language = "en",
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
            language={language}
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
        compact={compact}
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

export function ApprovalTechnicalReviewSummary({
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
        selectedSubtype={getApplicationSubtypeFromApplication(selectedRecord)}
        derivedDepartments={getSelectedTechnicalDepartments(selectedRecord)}
        step1={selectedRecord.form_data?.step_1 || {}}
        saving={false}
        onToggle={() => {}}
        readOnly
      />

      <KuTechnicalFurtherReviewPanel
        t={t}
        language={language}
        selectedRecord={selectedRecord}
        technicalSite={reviewTechnicalSite}
        checks={createKuTechnicalChecks(kuReview.checks)}
        compiledRemarksLeadingRows={iklTechnicalRemarkRows}
        compact
        readOnly
      />

      <TechnicalSiteVisitFields
        t={t}
        language={language}
        applicationId={selectedRecord.id}
        value={reviewTechnicalSite}
        onChange={() => {}}
        onFileChange={() => {}}
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
  const savedPhotoNamesByDocumentId = new Map();
  const savedPhotos = [
    ...(Array.isArray(step1.site_images) ? step1.site_images : []),
    step1.site_image,
  ].filter(Boolean);

  savedPhotos.forEach((photo) => {
    const documentId = String(photo?.document_id || photo?.id || "");
    const name = String(photo?.name || "").trim();
    if (documentId && name) {
      savedPhotoNamesByDocumentId.set(documentId, name);
    }
  });

  const primaryDocumentId = String(step1.site_image_document_id || "");
  const primaryName = String(step1.site_image_name || "").trim();
  if (primaryDocumentId && primaryName) {
    savedPhotoNamesByDocumentId.set(primaryDocumentId, primaryName);
  }

  const documentPhotos = documents
    .filter((document) => document.title === "Site Image")
    .map((document) => ({
      ...document,
      document_id: document.id,
      name:
        savedPhotoNamesByDocumentId.get(String(document.id)) ||
        getFileNameFromUrl(document.file_url || document.file) ||
        document.title,
      size: document.size || 0,
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

function TechnicalDepartmentRemarks({ app, t, leadingRows = [], compact = false }) {
  const reviews = getCurrentTechnicalDepartmentReviews(app);
  const selectedDepartments = getSelectedTechnicalDepartments(app);
  const hasSelection = hasTechnicalDepartmentSelection(app);
  const departments = hasSelection ? selectedDepartments : TECHNICAL_DEPARTMENTS;

  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <div className={`border-b border-slate-200 px-3 ${compact ? "py-1.5" : "py-2"}`}>
        <h3 className="text-sm font-semibold leading-5 text-slate-950">
          {t("workspace.technical.compiledRemarksTitle")}
        </h3>
        {!compact && (
          <p className="mt-1 text-sm leading-5 text-slate-500">
            {t("workspace.technical.compiledRemarksDesc")}
          </p>
        )}
      </div>
      <div className="divide-y divide-slate-100">
        <div className={`hidden grid-cols-1 gap-4 bg-slate-50 px-3 text-sm font-semibold uppercase leading-5 tracking-wide text-slate-500 md:grid md:grid-cols-[110px_1fr] ${compact ? "py-1.5" : "py-2"}`}>
          <div>{t("common.department", "Department")}</div>
          <div>{t("workspace.comment.remarks", "Remarks")}</div>
        </div>
        {leadingRows.map((review) => (
          <div key={review.department} className={`grid grid-cols-1 gap-4 px-3 text-sm leading-5 md:grid-cols-[110px_1fr] ${compact ? "py-1.5" : "py-2"}`}>
            <div className="font-semibold text-slate-950">{review.department}</div>
            <div className="min-w-0 text-slate-700">
              {review.remarks ? (
                <>
                  <p className="whitespace-pre-wrap leading-5">{review.remarks}</p>
                  {review.reviewed_at && (
                    <p className="mt-1 text-sm leading-5 text-slate-400">
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
          <div className={`px-3 text-sm leading-5 text-slate-500 ${compact ? "py-2" : "py-3"}`}>
            {t("workspace.technical.noExternalDepartments", "No external departments selected")}
          </div>
        )}
        {departments.map((department) => {
          const review = reviews?.[department];

          return (
            <div key={department} className={`grid grid-cols-1 gap-4 px-3 text-sm leading-5 md:grid-cols-[110px_1fr] ${compact ? "py-1.5" : "py-2"}`}>
              <div className="font-semibold text-slate-950">{department}</div>
              <div className="min-w-0 text-slate-700">
                {review?.remarks ? (
                  <>
                    <p className="whitespace-pre-wrap leading-5">{review.remarks}</p>
                    <p className="mt-1 text-sm leading-5 text-slate-400">
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

function getIklScreeningDecisionInput(decision, decisions, department, t) {
  const option = decisions.find((item) => (item.value || item) === decision);
  return option ? getIklScreeningDecisionLabel(option, department, t) : decision || "";
}

function getIklScreeningDecisionFromInput(value, decisions, department, t) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";

  const directDecision = getIklScreeningDirectDecision(normalized, department);
  if (directDecision) return directDecision;

  const option = decisions.find((item) => {
    const decisionValue = String(item.value || item || "").trim().toLowerCase();
    const decisionLabel = String(getIklScreeningDecisionLabel(item, department, t) || "")
      .trim()
      .toLowerCase();

    return normalized === decisionValue || normalized === decisionLabel;
  });

  return option?.value || option || "";
}

function getIklScreeningDecisionInputPrompt(decisions, department, t) {
  const directLabels = getIklScreeningDirectLabels(department, t);
  const options = directLabels.length > 0
    ? directLabels
    : decisions
    .map((item) => getIklScreeningDecisionLabel(item, department, t))
    .filter(Boolean);

  if (options.length === 0) {
    return t("workspace.decision.required", "Please select a recommendation.");
  }

  return t("workspace.decision.typeOptions", "Type {options}").replace(
    "{options}",
    options.join(` ${t("common.or", "or")} `)
  );
}

function getIklScreeningDirectDecision(normalized, department) {
  if (department === "PT(IKL)") {
    if (normalized === "approve") return "PT(IKL) Send to KU(IKL)";
    if (normalized === "reject") return "PT(IKL) Reject to Applicant";
  }

  if (department === "KU(IKL)") {
    if (normalized === "approve") return "KU(IKL) Confirm - Send to Technical Units";
    if (normalized === "reject") return "KU(IKL) Reject to Applicant";
  }

  return "";
}

function getIklScreeningDirectLabels(department, t) {
  if (department !== "PT(IKL)" && department !== "KU(IKL)") return [];

  return [
    t("workspace.decision.approve", "Approve"),
    t("workspace.decision.reject", "Reject"),
  ];
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

function getTechnicalRecommendationDecision(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["yes", "y", "ya"].includes(normalized)) return "Supported";
  if (["no", "n", "tidak"].includes(normalized)) return "Not Supported";
  if (normalized === "supported") return "Supported";
  if (normalized === "not supported") return "Not Supported";
  return "";
}

function getTechnicalRecommendationInput(decision) {
  if (decision === "Supported") return "Yes";
  if (decision === "Not Supported") return "No";
  return "";
}

function getKuTechnicalReviewDecisionInput(
  decision,
  decisions = [],
  t = (key, fallback) => fallback || key
) {
  const option = decisions.find((item) => item.value === decision);

  return option ? t(option.labelKey, option.value) : decision || "";
}

function getKuTechnicalReviewDecisionFromInput(
  value,
  decisions = [],
  t = (key, fallback) => fallback || key
) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";

  const option = decisions.find((item) => {
    const decisionValue = String(item.value || "").trim().toLowerCase();
    const decisionLabel = String(t(item.labelKey, item.value) || "")
      .trim()
      .toLowerCase();

    return normalized === decisionValue || normalized === decisionLabel;
  });

  return option?.value || "";
}

function getWorkspaceDecisionInput(
  decision,
  decisions = [],
  t = (key, fallback) => fallback || key
) {
  const option = decisions.find((item) => (item.value || item.label || item) === decision);

  return option ? t(option.labelKey, option.label || option.value || option) : decision || "";
}

function getWorkspaceDecisionFromInput(
  value,
  decisions = [],
  t = (key, fallback) => fallback || key
) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";

  const option = decisions.find((item) => {
    const decisionValue = String(item.value || item.label || item || "").trim().toLowerCase();
    const decisionLabel = String(t(item.labelKey, item.label || item.value || item) || "")
      .trim()
      .toLowerCase();

    return normalized === decisionValue || normalized === decisionLabel;
  });

  return option?.value || option?.label || option || "";
}

function getWorkspaceDecisionInputPrompt(
  decisions = [],
  t = (key, fallback) => fallback || key
) {
  const labels = decisions
    .map((item) => t(item.labelKey, item.label || item.value || item))
    .filter(Boolean);

  if (labels.length > 0) {
    return t("workspace.decision.typeOptions", "Type {options}").replace(
      "{options}",
      labels.join(` ${t("common.or", "or")} `)
    );
  }

  return t("workspace.decision.required", "Please select a recommendation.");
}

function TechnicalSiteVisitFields({
  t,
  language = "en",
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

  function updateRowSizeField(rowIndex, field, nextValue) {
    if (readOnly) return;
    if (sizeError) onSizeErrorChange?.("");
    onChange((prev) => {
      const rows = getTechnicalFeeRowsFromSite(prev);
      const nextRows = rows.map((row, index) => {
        if (index !== rowIndex) return row;
        const nextRow = { ...row, [field]: nextValue };
        const hasCompleteSize =
          parseTechnicalNumber(nextRow.width_ft || nextRow.widthFt) > 0 &&
          parseTechnicalNumber(nextRow.height_ft || nextRow.heightFt) > 0;

        if (hasCompleteSize) return nextRow;

        return {
          ...nextRow,
          area_sqft: "",
          area_sqm: "",
          areaSqm: "",
          areaRequired: "",
          area_required: "",
          chargeable_area_sqm: "",
          first_area_sqm: "",
          first_area_fee: "",
          additional_area_sqm: "",
          additional_area_fee: "",
          fee_total: "",
          payable_total: "",
          payableTotal: "",
        };
      });
      const nextSite = mergeTechnicalFeeRowsCalculation({
        ...prev,
        advertisement_rows: nextRows,
      });
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
    <div className="space-y-2.5 rounded-md border border-slate-200 bg-white p-2.5">
      <div>
        <h3 className="text-[14px] font-semibold leading-5 text-slate-950">
          {t("workspace.technical.siteVisitTitle")}
        </h3>
        <p className="mt-0.5 text-sm leading-5 text-slate-600">
          {t("workspace.technical.siteVisitDesc")}
        </p>
      </div>

      <div>
        <p className="mb-1 text-sm font-semibold leading-5 text-slate-700">
          {t("workspace.technical.sitePhoto")}
        </p>
        <div className="space-y-3">
          {!readOnly && (
            <label className="inline-flex min-h-9 cursor-pointer items-center justify-center rounded-md border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-sm font-semibold leading-5 text-white hover:bg-emerald-800">
              <Icon name="add_photo_alternate" className="mr-1 text-base" />
              {t("workspace.technical.uploadSitePhoto")}
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
                multiple
                className="hidden"
                onChange={(event) => {
                  onFileChange(event.target.files);
                  event.target.value = "";
                }}
              />
            </label>
          )}

          {!readOnly && (
            <p className="text-xs font-medium text-slate-500">
              {t(
                "workspace.technical.sitePhotoImageOnly",
                "Maximum file size 15MB. Accepted formats: PNG, JPG, JPEG, PDF."
              )}
            </p>
          )}

          {sitePhotos.length === 0 ? (
            <div className="flex min-h-16 items-center justify-center rounded-md border-2 border-dashed border-slate-300 bg-slate-50 px-4 text-center">
              <p className="text-xs font-semibold text-slate-500">
                {t("workspace.technical.noSitePhoto", "No site photo uploaded.")}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {sitePhotos.map((photo, index) => (
                <div
                  key={`${photo.name || "site-photo"}-${index}`}
                  className="flex min-h-14 items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Icon name="image" className="shrink-0 text-xl text-slate-500" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium leading-5 text-slate-700">
                        {photo.name || `${t("workspace.technical.sitePhoto")} ${index + 1}`}
                      </p>
                      <p className="text-xs leading-5 text-slate-500">
                        {getTechnicalSitePhotoMeta(photo)}
                      </p>
                    </div>
                  </div>
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
              ))}
            </div>
          )}

        </div>
      </div>

      <TechnicalFeeCalculationSheet
        t={t}
        language={language}
        value={value}
        onRowSizeChange={updateRowSizeField}
        readOnly={readOnly}
        sizeError={sizeError}
      />

    </div>
  );
}

function TechnicalFeeCalculationSheet({
  t,
  language = "en",
  value,
  onRowSizeChange,
  readOnly = false,
  sizeError = "",
}) {
  const rows = getTechnicalFeeRowsFromSite(value);
  const scheduleNumbers = Array.from(
    new Set(
      rows
        .map((row) =>
          calculateTechnicalFee({
            application_subtype: row.subtype,
            width_ft: row.width_ft || row.widthFt || "",
            height_ft: row.height_ft || row.heightFt || "",
            area_sqm: row.area_sqm || row.areaSqm || row.areaRequired || row.area_required || "",
          }).scheduleNumber
        )
        .filter(Boolean)
    )
  );

  return (
    <section className="pt-1">
      <h4 className="text-[14px] font-semibold leading-5 text-slate-950">
        {t("workspace.technical.feeCalculationTitle", "Advertisement Size & Fee Calculation")}
      </h4>

      <TechnicalFeeScheduleReference scheduleNumbers={scheduleNumbers} />

      <div className="mt-2 space-y-2">
        {rows.map((row, index) => (
          <TechnicalFeeCalculationRow
            key={`${row.displayType || row.display_type || "display"}-${row.subtype || "subtype"}-${index}`}
            row={row}
            index={index}
            language={language}
            readOnly={readOnly}
            sizeError={index === 0 ? sizeError : ""}
            onFieldChange={(field, nextValue) => onRowSizeChange?.(index, field, nextValue)}
          />
        ))}
      </div>
    </section>
  );
}

function TechnicalFeeScheduleReference({ scheduleNumbers = [] }) {
  const visibleSchedules = scheduleNumbers.length > 0 ? scheduleNumbers : ["1"];

  return (
    <div className="mt-2 rounded-sm border border-slate-300 bg-white px-3 py-3 text-sm leading-5 text-slate-950">
      <div className="mb-3 text-center">
        <div className="mx-auto flex max-w-[420px] items-center justify-center gap-3">
          <span className="h-px flex-1 bg-slate-900" />
          <div>
            <p className="italic">SECOND SCHEDULE</p>
            <p className="text-[18px] font-bold leading-6">LICENCE FEES</p>
            <p className="font-bold">(By-laws 9 and 10)</p>
          </div>
          <span className="h-px flex-1 bg-slate-900" />
        </div>
      </div>

      <div className="grid gap-x-7 gap-y-1 lg:grid-cols-[44px_minmax(0,1.2fr)_minmax(0,1.35fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]">
        <div aria-hidden="true" />
        <p className="text-center italic">Type of Advertisement</p>
        <p className="text-center italic">Fee Payable</p>
        <p className="text-center italic">City/Municipal Council</p>
        <p className="text-center italic">District Council</p>

        {visibleSchedules.map((scheduleNumber) => (
          <TechnicalFeeScheduleBlock key={scheduleNumber} scheduleNumber={scheduleNumber} />
        ))}
      </div>
    </div>
  );
}

function TechnicalFeeScheduleBlock({ scheduleNumber }) {
  const isLedSchedule = String(scheduleNumber) === "6";
  const typeDescription = isLedSchedule
    ? "Advertisement by means of electronic or any non-print device"
    : "Advertisement (other than business name signboard, sky-sign and advertisement on electronic board or any non-print device) of over one square metre in size; measured over the area for the display of the advertisement, and includes such superficial area of frame work or support";
  const firstAreaText = isLedSchedule
    ? "For the first 10 square metre or part thereof"
    : "For the first 20 square metre or part thereof";
  const additionalAreaText = isLedSchedule
    ? "For every additional square metre"
    : "For every additional square metre or part thereof";
  const firstCityRate = isLedSchedule ? "RM2,000.00 per year" : "RM100.00 for every square metre per year";
  const firstDistrictRate = isLedSchedule ? "RM1,500.00 per year" : "RM70.00 for every square metre per year";
  const additionalCityRate = isLedSchedule ? "RM50.00 per year" : "RM70.00 per year";
  const additionalDistrictRate = isLedSchedule ? "RM35.00 per year" : "RM50.00 per year";

  return (
    <>
      <div className={isLedSchedule ? "pt-4" : ""}>{scheduleNumber}.</div>
      <p className={isLedSchedule ? "pt-4" : ""}>{typeDescription}</p>
      <div className={`grid self-start gap-y-1 ${isLedSchedule ? "pt-4" : ""}`}>
        <div className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-2">
          <span>(a)</span>
          <p>{firstAreaText}</p>
        </div>
        <div className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-2">
          <span>(b)</span>
          <p>{additionalAreaText}</p>
        </div>
        {isLedSchedule && (
          <div className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-2">
            <span>(c)</span>
            <p>For every set of device producing non-measurable advertisement</p>
          </div>
        )}
      </div>
      <div className={`grid self-start gap-y-1 ${isLedSchedule ? "pt-4" : ""}`}>
        <p>{firstCityRate}</p>
        <p>{additionalCityRate}</p>
        {isLedSchedule && <p>RM1,000.00 per year</p>}
      </div>
      <div className={`grid self-start gap-y-1 ${isLedSchedule ? "pt-4" : ""}`}>
        <p>{firstDistrictRate}</p>
        <p>{additionalDistrictRate}</p>
        {isLedSchedule && <p>RM750.00 per year</p>}
      </div>
    </>
  );
}

function TechnicalFeeCalculationRow({
  row,
  index,
  language = "en",
  readOnly = false,
  sizeError = "",
  onFieldChange,
}) {
  const applicationType =
    row.applicationType || row.application_type || getApplicationTypeFromSubtype(row.subtype);
  const typeLabel = getApplicationTypeOptionLabel(applicationType, language);
  const displayType = row.displayType || row.display_type || getTechnicalDisplayTypeFromSubtype(row.subtype);
  const displayLabel = getTechnicalDisplayTypeLabel(displayType, language);
  const advertisementLabel = getTechnicalAdvertisementOptionLabel(
    row.customLabel || row.custom_label,
    language
  );
  const fee = calculateTechnicalFee({
    application_subtype: row.subtype,
    width_ft: row.width_ft || row.widthFt || "",
    height_ft: row.height_ft || row.heightFt || "",
    area_sqm: "",
  });
  const widthValue = row.width_ft || row.widthFt || "";
  const heightValue = row.height_ft || row.heightFt || "";
  const hasCompleteSize = parseTechnicalNumber(widthValue) > 0 && parseTechnicalNumber(heightValue) > 0;
  const areaValue = hasCompleteSize ? fee.areaSqm : 0;
  const totalPayable = hasCompleteSize && fee.feeTotal ? fee.totalPayable : 0;
  const inputClassName = `h-8 rounded-sm border px-2 text-sm leading-5 outline-none ${
    sizeError
      ? "border-red-300 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(220,38,38,0.12)]"
      : "border-slate-300 focus:border-emerald-700 focus:shadow-[0_0_0_3px_rgba(4,120,87,0.12)]"
  } ${readOnly ? "bg-slate-50 text-slate-700" : "bg-white text-slate-950"}`;

  return (
    <div className="rounded-sm border border-slate-200 bg-white p-2">
      <p className="text-sm font-semibold leading-5 text-slate-950">
        {index + 1}. {typeLabel}: {displayLabel} - {advertisementLabel || "-"}
      </p>

      <div className="mt-2 grid gap-3 lg:grid-cols-[minmax(0,430px)_minmax(0,1fr)]">
        <div className="space-y-1.5">
          <div>
            <label className="mb-1 block text-sm font-semibold leading-5 text-slate-800">
              {stepText(language, "advertisementSizeFt")}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                aria-label={`${stepText(language, "advertisementSizeFt")} ${index + 1} width`}
                value={widthValue}
                onChange={(event) => onFieldChange?.("width_ft", event.target.value)}
                readOnly={readOnly}
                className={`${inputClassName} w-[min(11.5rem,42vw)]`}
                inputMode="decimal"
                placeholder="Width (ft)"
              />
              <span className="text-sm text-slate-700">ft</span>
              <span className="text-sm text-slate-700">x</span>
              <input
                aria-label={`${stepText(language, "advertisementSizeFt")} ${index + 1} height`}
                value={heightValue}
                onChange={(event) => onFieldChange?.("height_ft", event.target.value)}
                readOnly={readOnly}
                className={`${inputClassName} w-[min(11.5rem,42vw)]`}
                inputMode="decimal"
                placeholder="Height (ft)"
              />
              <span className="text-sm text-slate-700">ft</span>
            </div>
            {sizeError && !readOnly && (
              <p className="mt-1 text-sm font-medium leading-5 text-red-600">
                {sizeError}
              </p>
            )}
          </div>

          <ReadOnlyCalculationInput
            label={stepText(language, "areaRequired")}
            value={formatTechnicalDecimal(areaValue)}
          />
          <ReadOnlyCalculationInput
            label={stepText(language, "malaysiaPlanRm")}
            value={formatTechnicalAmountInput(totalPayable)}
          />
        </div>

        <TechnicalCalculationBreakdown row={row} fee={fee} language={language} />
      </div>
    </div>
  );
}

function ReadOnlyCalculationInput({ label, value }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold leading-5 text-slate-800">
        {label}
      </span>
      <input
        value={value || ""}
        readOnly
        className="h-8 w-full rounded-sm border border-slate-300 bg-white px-2 text-sm leading-5 text-slate-900"
      />
    </label>
  );
}

function TechnicalCalculationBreakdown({ row, fee, language = "en" }) {
  const width = parseTechnicalNumber(row.width_ft || row.widthFt);
  const height = parseTechnicalNumber(row.height_ft || row.heightFt);
  const hasCompleteSize = width > 0 && height > 0;
  const areaSqft = hasCompleteSize ? width * height : 0;
  const areaSqm = hasCompleteSize ? fee.areaSqm : 0;

  return (
    <details className="self-start rounded-sm border border-slate-200 bg-slate-50">
      <summary className="cursor-pointer select-none px-2.5 py-1.5 text-sm font-bold leading-5 text-slate-700 hover:bg-slate-100">
        {stepText(language, "calculationBreakdown")}
      </summary>
      <div className="border-t border-slate-200 bg-white px-2.5 py-1.5">
        <div className="grid gap-1 text-sm leading-5 text-slate-700">
          <TechnicalCalculationRow
            label={stepText(language, "calculationSchedule")}
            value={stepText(language, `calculationSchedule${fee.scheduleNumber}`)}
          />
          <TechnicalCalculationRow
            label={stepText(language, "calculationSize")}
            value={
              width > 0 && height > 0
                ? `${formatTechnicalDecimal(width)} ft x ${formatTechnicalDecimal(height)} ft`
                : "-"
            }
          />
          <TechnicalCalculationRow
            label={stepText(language, "calculationAreaFt")}
            value={areaSqft ? `${formatTechnicalDecimal(areaSqft)} ft2` : "-"}
          />
          <TechnicalCalculationRow
            label={stepText(language, "calculationAreaSqm")}
            value={
              areaSqft
                ? `${formatTechnicalDecimal(areaSqft)} x ${SQFT_TO_SQM} = ${formatTechnicalDecimal(areaSqm)} Sq. m`
                : "-"
            }
          />
          <TechnicalCalculationRow
            label={stepText(language, `calculationFirstArea${fee.scheduleNumber}`)}
            value={
              fee.usesFixedFirstAreaFee
                ? `${formatTechnicalDecimal(fee.firstAreaSqm)} Sq. m = ${formatTechnicalCurrency(fee.firstAreaFixedFee)}`
                : `${formatTechnicalDecimal(fee.firstAreaSqm)} Sq. m x ${formatTechnicalCurrency(fee.firstAreaRate)} = ${formatTechnicalCurrency(fee.firstAreaFee)}`
            }
          />
          <TechnicalCalculationRow
            label={stepText(language, "calculationAdditionalArea")}
            value={`${formatTechnicalDecimal(fee.additionalAreaSqm || 0)} Sq. m x ${formatTechnicalCurrency(fee.additionalAreaRate)} = ${formatTechnicalCurrency(fee.additionalAreaFee)}`}
          />
          <TechnicalCalculationRow
            label={stepText(language, "calculationFeeTotal")}
            value={formatTechnicalCurrency(fee.feeTotal)}
          />
          <TechnicalCalculationRow
            label={stepText(language, "calculationDeposit")}
            value={formatTechnicalCurrency(fee.deposit)}
          />
          <TechnicalCalculationRow
            label={stepText(language, "calculationProcessingFee")}
            value={formatTechnicalCurrency(fee.processingFee)}
          />
          <TechnicalCalculationRow
            label={stepText(language, "calculationRoundingAdjustment")}
            guideline={stepText(language, "calculationRoundingAdjustmentHelp")}
            value={formatTechnicalCurrency(fee.roundingAdjustment)}
          />
          <TechnicalCalculationRow
            label={stepText(language, "calculationTotalPayable")}
            value={formatTechnicalCurrency(fee.totalPayable)}
            strong
          />
        </div>
      </div>
    </details>
  );
}

function TechnicalCalculationRow({ label, value, strong = false, guideline = "" }) {
  return (
    <div
      className={`grid gap-2 sm:grid-cols-[210px_minmax(0,1fr)] ${
        strong ? "border-t border-slate-200 pt-1 font-bold text-slate-900" : ""
      }`}
    >
      <span className="relative inline-flex items-center gap-1.5">
        {label}
        {guideline && <TechnicalCalculationGuidelineHint text={guideline} />}
      </span>
      <span className="tabular-nums text-slate-800">{value}</span>
    </div>
  );
}

function TechnicalCalculationGuidelineHint({ text }) {
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={text}
      className="group/icon inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full border border-slate-400 bg-white text-[10px] font-black leading-none text-slate-600 outline-none hover:border-[#006d32] hover:text-[#006d32] focus:border-[#006d32] focus:text-[#006d32]"
    >
      i
      <span className="pointer-events-none absolute left-0 top-5 z-40 hidden w-[min(18rem,calc(100vw-2rem))] rounded border border-slate-200 bg-white px-3 py-2 text-left text-[11px] font-medium leading-4 text-slate-700 shadow-lg group-hover/icon:block group-focus/icon:block">
        {text}
      </span>
    </span>
  );
}

function FeeSheetSection({ label }) {
  return (
    <div className="grid grid-cols-[170px_110px_40px_28px_110px_32px_125px] gap-1.5 bg-slate-50 px-2 py-1.5 font-semibold text-slate-800">
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
  const inputClassName = `h-7 w-full rounded border px-2 py-0.5 text-right text-[13px] leading-5 outline-none ${
    error
      ? "border-red-300 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(220,38,38,0.12)]"
      : "border-slate-300 focus:border-emerald-700 focus:shadow-[0_0_0_3px_rgba(4,120,87,0.12)]"
  } ${
    readOnly ? "bg-slate-50 text-slate-700" : "bg-white text-slate-950"
  }`;

  return (
    <div className="grid grid-cols-[170px_110px_40px_28px_110px_32px_125px] items-center gap-1.5 bg-white px-2 py-1.5">
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
      className={`grid grid-cols-[170px_110px_40px_28px_110px_32px_125px] items-center gap-1.5 px-2 py-1.5 ${
        total ? "bg-emerald-50" : emphasized ? "bg-slate-50/70" : "bg-white"
      }`}
    >
      <span className={`${total ? "font-bold" : "font-semibold"} text-slate-800`}>{label}</span>
      <span className={`rounded border border-slate-300 bg-white px-2 py-0.5 text-right ${emphasized || total ? "font-bold text-slate-950" : "text-slate-800"}`}>
        {value}
      </span>
      <span className="text-slate-700">{unit}</span>
      <span className="text-center text-slate-700">{operator}</span>
      {hasMultiplier ? (
        <span className="rounded border border-slate-200 bg-white px-2 py-0.5 text-right text-slate-800">
          {multiplier}
        </span>
      ) : (
        <span aria-hidden="true" />
      )}
      <span className="text-center text-slate-700">{equals || multiplierUnit}</span>
      {hasAmount ? (
        <span className="rounded border border-slate-300 bg-white px-2 py-0.5 text-right font-bold text-slate-950">
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

function formatTechnicalSitePhotoSize(bytes) {
  const size = Number(bytes || 0);
  if (!Number.isFinite(size) || size <= 0) return "";

  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getTechnicalSitePhotoFormat(photo) {
  const type = String(photo?.type || photo?.file?.type || photo?.attachment?.type || "").toLowerCase();
  const name = String(photo?.name || photo?.file_name || photo?.filename || "").toLowerCase();
  const extension = name.includes(".") ? name.split(".").pop() : "";

  if (type === "application/pdf" || extension === "pdf") return "PDF";
  if (type === "image/png" || extension === "png") return "PNG";
  if (type === "image/jpeg" || extension === "jpg" || extension === "jpeg") return "JPG";
  if (type === "image/webp" || extension === "webp") return "WEBP";

  return extension ? extension.toUpperCase() : "IMAGE";
}

function getTechnicalSitePhotoMeta(photo) {
  return [
    getTechnicalSitePhotoFormat(photo),
    formatTechnicalSitePhotoSize(photo?.size || photo?.file?.size || photo?.attachment?.size),
  ]
    .filter(Boolean)
    .join(" - ");
}

function isTechnicalSitePhotoPdf(photo) {
  return getTechnicalSitePhotoFormat(photo) === "PDF";
}

function SitePhotoActions({ photo, applicationId, disabled, onRemove, labels, hideDelete = false }) {
  async function viewPhoto() {
    try {
      const { url, revoke } = await getSitePhotoBlobUrl(photo, applicationId);

      if (!url) {
        return;
      }

      window.open(url, "_blank");

      if (revoke) {
        window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
      }
    } catch (error) {
      console.error("Failed to view site photo:", error);
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

function WorkspaceGuidelineHint({ text }) {
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={text}
      className="group/icon relative inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full border border-blue-500 bg-blue-50 text-[10px] font-black leading-none text-blue-700 outline-none hover:border-blue-700 hover:bg-blue-100 focus:border-blue-700 focus:bg-blue-100"
    >
      i
      <span className="pointer-events-none absolute left-full top-1/2 z-40 ml-2 hidden w-[min(20rem,calc(100vw-2rem))] -translate-y-1/2 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-left text-[11px] font-medium leading-4 text-blue-800 shadow-lg group-hover/icon:block group-focus/icon:block">
        {text}
      </span>
    </span>
  );
}

function PaymentDetails({
  app,
  t,
  userDepartment,
  saving,
  onPaymentDocumentUpload,
  onPaymentDocumentDelete,
  onLicenseDocumentUpload,
  onLicenseDocumentDelete,
  paymentReceiptDecision = "",
  readOnly = false,
}) {
  const payment = app.form_data?.payment || {};
  const approvalLetter = app.form_data?.approval_letter || {};
  const license = app.form_data?.license || {};
  const receiptFile = payment.receipt_file;
  const receiptSource = getPaymentReceiptSource(receiptFile);
  const letterFile = getStoredPaymentDocument(app, "letter");
  const billFile = getStoredPaymentDocument(app, "bill");
  const officialReceiptFile =
    getStoredPaymentDocument(app, "official_receipt") ||
    approvalLetter.official_receipt_file ||
    null;
  const licenseFile = license.license_file || null;
  const status = normalizeStatus(app?.status);
  const letterReady = Boolean(letterFile);
  const billReady = Boolean(billFile);
  const canUploadDocuments =
    !readOnly && userDepartment === "PT(IKL)" && status === "approved";
  const isReceiptVerification =
    !readOnly && userDepartment === "PT(IKL)" && status === "payment_submitted";
  const uploadReady = letterReady && billReady;
  const showReceiptDetails = Boolean(
    readOnly ||
    receiptFile?.name ||
    payment.receipt_reference ||
    receiptSource ||
    payment.verification_result ||
    payment.verification_notes
  );
  const isRejectReceiptDecision = paymentReceiptDecision === "Reject Receipt";
  const showVerificationUploads = isReceiptVerification && !isRejectReceiptDecision;
  const isIssuedLicenseView = ["license_issued", "license_revoked"].includes(status);

  async function viewReceipt() {
    if (!receiptSource) return;

    try {
      const isInlineFile =
        receiptSource.startsWith("blob:") || receiptSource.startsWith("data:");
      const url = isInlineFile
        ? receiptSource
        : URL.createObjectURL(await fetchAuthenticatedBlob(receiptSource));

      window.open(url, "_blank");

      if (!isInlineFile) {
        window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
      }
    } catch (error) {
      console.error("Failed to open payment receipt:", error);
      window.alert(t("workspace.info.receiptViewFailed", "Unable to open the receipt. Please try again."));
    }
  }

  const showOfficialReceiptSection = showVerificationUploads || Boolean(officialReceiptFile);
  const showLicenseDocumentSection = showVerificationUploads || Boolean(licenseFile);
  const showQrPanel = true;

  const officialReceiptUploadSection = showOfficialReceiptSection ? (
    <section className="rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-3 py-3">
        <div>
          <p className="text-[13px] font-semibold uppercase leading-5 tracking-wide text-slate-500">
            {t("workspace.payment.manual.officialReceiptTitle", "Official Receipt")}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {t("workspace.payment.officialReceiptUploadDesc", "Send an uploaded official receipt file to the applicant.")}
          </p>
        </div>
      </div>

      <div className="px-3 py-3">
        <PaymentDocumentSlot
          label={t("workspace.payment.manual.officialReceiptTitle", "Official Receipt")}
          file={officialReceiptFile}
          t={t}
          canUpload={showVerificationUploads}
          required={showVerificationUploads}
          saving={saving}
          onFileChange={(file) => onPaymentDocumentUpload?.("official_receipt", file)}
          onDelete={() => onPaymentDocumentDelete?.("official_receipt", officialReceiptFile)}
        />
      </div>
    </section>
  ) : null;

  const licenseUploadSection = showLicenseDocumentSection ? (
    <section className="rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-3 py-3">
        <div>
          <p className="text-[13px] font-semibold uppercase leading-5 tracking-wide text-slate-500">
            {t("workspace.license.documentTitle", "Advertisement License")}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {t("workspace.license.uploadDesc", "Upload the advertisement license file to the applicant.")}
          </p>
        </div>
      </div>

      <div className="px-3 py-3">
        <PaymentDocumentSlot
          label={t("workspace.license.documentTitle", "Advertisement License")}
          file={licenseFile}
          t={t}
          canUpload={showVerificationUploads}
          required={showVerificationUploads}
          saving={saving}
          onFileChange={(file) => onLicenseDocumentUpload?.(file)}
          onDelete={() => onLicenseDocumentDelete?.(licenseFile)}
        />
      </div>
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

          {canUploadDocuments && uploadReady && (
            <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
              {t("workspace.payment.methodReady", "Ready")}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 px-3 py-3">
        <PaymentDocumentSlot
          label={t("workspace.payment.approvalLetter", "Approval Letter")}
          file={letterFile}
          t={t}
          canUpload={canUploadDocuments}
          required={canUploadDocuments}
          saving={saving}
          onFileChange={(file) => onPaymentDocumentUpload?.("letter", file)}
          onDelete={() => onPaymentDocumentDelete?.("letter", letterFile)}
        />
        <PaymentDocumentSlot
          label={t("workspace.payment.billDocument", "Bill")}
          file={billFile}
          t={t}
          canUpload={canUploadDocuments}
          required={canUploadDocuments}
          saving={saving}
          onFileChange={(file) => onPaymentDocumentUpload?.("bill", file)}
          onDelete={() => onPaymentDocumentDelete?.("bill", billFile)}
        />
      </div>

    </section>
  );

  const receiptSection = showReceiptDetails ? (
    <section className="rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-3 py-3">
        <p className="text-[13px] font-semibold uppercase leading-5 tracking-wide text-slate-500">
          {t("workspace.payment.applicantReceipt", "Applicant Receipt")}
        </p>
      </div>

      <div className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-950">
            {receiptFile?.name || payment.receipt_reference || t("workspace.info.notSubmitted")}
          </p>
          {payment.verification_result && (
            <p className="mt-1 text-xs text-slate-500">{payment.verification_result}</p>
          )}
        </div>

        {receiptSource && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              icon="visibility"
              className="min-h-9 px-3 py-1 text-xs"
              onClick={viewReceipt}
            >
              {t("common.view", "View")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              icon="download"
              className="min-h-9 px-3 py-1 text-xs"
              onClick={() =>
                downloadPaymentDocument(
                  receiptFile,
                  payment.receipt_reference || t("workspace.payment.receiptFileName", "receipt.pdf"),
                  t
                )
              }
            >
              {t("common.download", "Download")}
            </Button>
          </div>
        )}
      </div>
    </section>
  ) : null;

  const issuedDocumentSection = isIssuedLicenseView ? (
    <IssuedPaymentDocumentList
      t={t}
      documents={[
        {
          label: t("workspace.payment.approvalLetter", "Approval Letter"),
          file: letterFile,
        },
        {
          label: t("workspace.payment.billDocument", "Bill"),
          file: billFile,
        },
        {
          label: t("workspace.payment.manual.officialReceiptTitle", "Official Receipt"),
          file: officialReceiptFile,
        },
        {
          label: t("workspace.license.documentTitle", "Advertisement License"),
          file: licenseFile,
        },
      ]}
    />
  ) : null;
  const verificationDocuments = [
    {
      label: t("workspace.payment.manual.officialReceiptTitle", "Official Receipt"),
      file: officialReceiptFile,
      required: showVerificationUploads,
      canUpload: showVerificationUploads,
      onFileChange: (file) => onPaymentDocumentUpload?.("official_receipt", file),
      onDelete: () => onPaymentDocumentDelete?.("official_receipt", officialReceiptFile),
    },
    {
      label: t("workspace.license.documentTitle", "Advertisement License"),
      file: licenseFile,
      required: showVerificationUploads,
      canUpload: showVerificationUploads,
      onFileChange: (file) => onLicenseDocumentUpload?.(file),
      onDelete: () => onLicenseDocumentDelete?.(licenseFile),
    },
  ];

  const verificationDocumentSection = showVerificationUploads ? (
    <PaymentVerificationDocumentList
      t={t}
      saving={saving}
      canUploadIssueDocuments={showVerificationUploads}
      documents={verificationDocuments}
    />
  ) : null;

  return (
    <div className={showQrPanel ? "grid gap-4 text-sm lg:grid-cols-[minmax(240px,0.85fr)_minmax(0,1.75fr)]" : "text-sm"}>
      {showQrPanel && <PaymentQrPanel app={app} t={t} />}

      <div className="space-y-4">
        {isIssuedLicenseView ? (
          <>
            {issuedDocumentSection}
            {receiptSection}
          </>
        ) : isReceiptVerification ? (
          <>
            {verificationDocumentSection}
            {receiptSection}
          </>
        ) : (
          <>
            {documentSection}
            {receiptSection}
            {(showOfficialReceiptSection || showLicenseDocumentSection) && (
              <div className="grid gap-4 xl:grid-cols-2">
                {officialReceiptUploadSection}
                {licenseUploadSection}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PaymentQrPanel({ app, t }) {
  const license = app?.form_data?.license || {};
  const licenseFileUrl = getPaymentDocumentSource(license.license_file);
  const licenseReady = Boolean(licenseFileUrl) || (normalizeStatus(app?.status) === "license_issued" && license.status === "Active");
  const licenseId = license.license_id || getLicenseId(app);
  const displayReference = getApplicationReference(app);
  const verificationUrl = getLicenseVerificationUrl(licenseId);
  const qrContainerRef = useRef(null);

  return (
    <section className="self-start rounded-md border border-slate-200 bg-slate-50">
      <div className="flex min-h-[340px] flex-col items-center justify-center gap-3 p-4 text-center">
        {licenseReady ? (
          <>
            <div ref={qrContainerRef} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <QRCodeSVG
                value={verificationUrl}
                size={260}
                level="M"
                includeMargin
                role="img"
                aria-label="License verification QR"
              />
            </div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {displayReference}
            </p>
            <Button
              type="button"
              variant="secondary"
              icon="download"
              className="min-h-9 px-3 py-1 text-xs"
              onClick={() => downloadPaymentQrCode(qrContainerRef.current, displayReference)}
            >
              {t("common.download", "Download")}
            </Button>
          </>
        ) : (
          <div className="flex min-h-[260px] w-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 text-center">
            <p className="max-w-xs text-sm font-medium text-slate-500">
              {t(
                "workspace.license.qrPendingUpload",
                "QR e-license will be displayed here after upload Advertisement License."
              )}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function IssuedPaymentDocumentList({ t, documents }) {
  const availableDocuments = documents.filter((item) => getPaymentDocumentSource(item.file));

  return (
    <section className="rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-3 py-3">
        <p className="text-sm font-semibold text-slate-950">
          {t("workspace.payment.documents", "List of Document")}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          {t("applicant.paymentDocumentsDesc", "Download the documents from ALiS before making payment.")}
        </p>
      </div>

      <div className="divide-y divide-slate-200">
        {availableDocuments.map((item) => (
          <div
            key={item.label}
            className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-[13px] font-semibold uppercase leading-5 tracking-wide text-slate-500">
                {item.label}
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-slate-950">
                {item.file?.name}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                icon="visibility"
                className="min-h-9 px-3 py-1 text-xs"
                onClick={() => openPaymentDocument(item.file, t)}
              >
                {t("common.view", "View")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                icon="download"
                className="min-h-9 px-3 py-1 text-xs"
                onClick={() => downloadPaymentDocument(item.file, item.label, t)}
              >
                {t("common.download", "Download")}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PaymentVerificationDocumentList({ t, documents, saving, canUploadIssueDocuments }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-3 py-3">
        <p className="text-sm font-semibold text-slate-950">
          {t("workspace.payment.documents", "List of Document")}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          {canUploadIssueDocuments
            ? t(
                "workspace.payment.verifyDocumentListDesc",
                "View payment documents, then upload the official receipt and advertisement license."
              )
            : t(
                "workspace.payment.verifyDocumentListPendingDesc",
                "Select Verify Receipt to upload the official receipt and advertisement license."
              )}
        </p>
      </div>

      <div className="divide-y divide-slate-200">
        {documents.map((item) => (
          <PaymentVerificationDocumentRow
            key={item.label}
            item={item}
            t={t}
            saving={saving}
          />
        ))}
      </div>
    </section>
  );
}

function PaymentVerificationDocumentRow({ item, t, saving }) {
  const fileSource = getPaymentDocumentSource(item.file);
  const hasFile = Boolean(fileSource);

  return (
    <div className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold uppercase leading-5 tracking-wide text-slate-500">
          {item.label}
          {item.required && <span className="text-red-600"> *</span>}
        </p>
        <p className={`mt-1 truncate text-sm font-semibold ${hasFile ? "text-slate-950" : "text-slate-900"}`}>
          {item.file?.name || t("workspace.info.notUploaded", "Not uploaded")}
        </p>
        {item.canUpload && !hasFile && (
          <p className="mt-0.5 text-xs text-slate-500">
            PDF, JPG, or PNG
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {hasFile && (
          <>
            <Button
              type="button"
              variant="secondary"
              icon="visibility"
              className="min-h-9 px-3 py-1 text-xs"
              onClick={() => openPaymentDocument(item.file, t)}
            >
              {t("common.view", "View")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              icon="download"
              className="min-h-9 px-3 py-1 text-xs"
              onClick={() => downloadPaymentDocument(item.file, item.label, t)}
            >
              {t("common.download", "Download")}
            </Button>
          </>
        )}

        {item.canUpload && !hasFile && (
          <>
            <label className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <Icon name="upload_file" className="text-[17px]" />
              {t("common.uploadFile", "Upload File")}
              <input
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                className="hidden"
                disabled={saving}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) item.onFileChange?.(file);
                  event.target.value = "";
                }}
              />
            </label>
          </>
        )}
        {item.canUpload && hasFile && (
          <Button
            type="button"
            variant="secondary"
            icon="delete"
            className="min-h-9 px-3 py-1 text-xs text-red-700"
            disabled={saving}
            onClick={item.onDelete}
          >
            {t("common.remove", "Remove")}
          </Button>
        )}
      </div>
    </div>
  );
}

function PaymentDocumentSlot({ label, file, t, canUpload, required = false, saving, onFileChange, onDelete }) {
  const fileSource = getPaymentDocumentSource(file);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold uppercase leading-5 tracking-wide text-slate-500">
          {label}
          {required && <span className="ml-1 text-red-600">*</span>}
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
          <>
            <Button
              type="button"
              variant="secondary"
              icon="visibility"
              className="min-h-9 px-3 py-1 text-xs"
              onClick={() => openPaymentDocument(file, t)}
            >
              {t("common.view", "View")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              icon="download"
              className="min-h-9 px-3 py-1 text-xs"
              onClick={() => downloadPaymentDocument(file, label, t)}
            >
              {t("common.download", "Download")}
            </Button>
          </>
        )}
        {canUpload && !fileSource && (
          <>
            <label className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <Icon name="upload_file" className="text-[16px]" />
              <span>
                {t("common.uploadFile", "Upload File")}
              </span>
              <input
                type="file"
                accept="image/*,.pdf"
                required={required && !fileSource}
                aria-required={required}
                className="hidden"
                disabled={saving}
                onChange={(event) => {
                  onFileChange?.(event.target.files?.[0] || null);
                  event.target.value = "";
                }}
              />
            </label>
          </>
        )}
        {canUpload && fileSource && (
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

function getPaymentDocumentTitleAliases(kind) {
  if (kind === "bill") return ["bill", "bil"];
  if (kind === "official_receipt") return ["official receipt", "resit rasmi"];
  return ["approval letter", "surat kelulusan"];
}

function normalizePaymentDocumentTitle(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function getPaymentDocumentTimestamp(file) {
  const timestamp = Date.parse(file?.uploaded_at || file?.lastModified || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getPaymentDocumentFromSupportingDocuments(app, kind) {
  const aliases = new Set(getPaymentDocumentTitleAliases(kind));
  const documents = Array.isArray(app?.supporting_documents)
    ? app.supporting_documents
    : [];
  const document = documents
    .filter((item) => aliases.has(normalizePaymentDocumentTitle(item?.title)))
    .sort((a, b) => {
      const timestampDiff = getPaymentDocumentTimestamp(b) - getPaymentDocumentTimestamp(a);
      if (timestampDiff) return timestampDiff;
      return Number(b?.id || 0) - Number(a?.id || 0);
    })[0];

  if (!document) return null;

  return {
    ...document,
    document_id: document.document_id || document.id,
    name:
      document.name ||
      getFileNameFromUrl(document.file_url || document.file) ||
      document.title ||
      "",
    url: getApplicationDocumentUrl(app?.id, document.document_id || document.id),
    file_url: document.file_url || document.file || "",
    file: document.file || document.file_url || "",
  };
}

function getStoredPaymentDocument(app, kind) {
  const fieldName = getPaymentDocumentFieldName(kind);
  const savedFile = app?.form_data?.approval_letter?.[fieldName] || null;

  if (getPaymentDocumentSource(savedFile)) return savedFile;

  const documentId = savedFile?.document_id || savedFile?.id;
  if (documentId && app?.id) {
    return {
      ...savedFile,
      url: getApplicationDocumentUrl(app.id, documentId),
    };
  }

  return getPaymentDocumentFromSupportingDocuments(app, kind);
}

function withLocalPaymentDocumentPreview(_applicationId, _kind, uploaded, file) {
  return {
    ...(uploaded || {}),
    name: uploaded?.name || file?.name || "",
    size: uploaded?.size || file?.size || 0,
    type: uploaded?.type || file?.type || "",
    lastModified: uploaded?.lastModified || file?.lastModified || null,
  };
}

function stripLocalPaymentDocumentPreview(file) {
  if (!file || typeof file !== "object") return file;

  const {
    dataUrl: _dataUrl,
    previewUrl: _previewUrl,
    localPreviewUrl: _localPreviewUrl,
    ...savedFile
  } = file;

  return savedFile;
}

function mergeLocalPaymentDocumentPreview(app, fieldName, file) {
  return {
    ...(app || {}),
    form_data: {
      ...(app?.form_data || {}),
      approval_letter: {
        ...(app?.form_data?.approval_letter || {}),
        [fieldName]: file,
      },
    },
  };
}

function forgetLocalPaymentDocumentPreview() {}

async function openPaymentDocument(file, t) {
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
  } catch (error) {
    console.error("Failed to open payment document:", error);
    window.alert(t("workspace.payment.documentViewFailed", "Unable to open the document. Please try again."));
  }
}

async function downloadPaymentDocument(file, fallbackLabel, t) {
  const source = getPaymentDocumentSource(file);
  if (!source) return;

  try {
    const isInlineFile = source.startsWith("blob:") || source.startsWith("data:");
    const url = isInlineFile
      ? source
      : URL.createObjectURL(await fetchAuthenticatedBlob(source));
    const filename = getPaymentDownloadFilename(file?.name || fallbackLabel, "document");

    triggerPaymentDownload(url, filename);

    if (!isInlineFile) {
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  } catch (error) {
    console.error("Failed to download payment document:", error);
    window.alert(t("workspace.payment.documentViewFailed", "Unable to open the document. Please try again."));
  }
}

function getPaymentQrSvgBlob(qrContainer) {
  const svg = qrContainer?.querySelector("svg");
  if (!svg) return null;

  const clone = svg.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return new Blob([new XMLSerializer().serializeToString(clone)], {
    type: "image/svg+xml;charset=utf-8",
  });
}

async function downloadPaymentQrCode(qrContainer, reference) {
  const blob = getPaymentQrSvgBlob(qrContainer);
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
    triggerPaymentDownload(downloadUrl, `${reference || "e-license"}-qr.png`);
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 60000);
  } catch (error) {
    console.error("Failed to download QR code:", error);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function triggerPaymentDownload(url, filename) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function getPaymentDownloadFilename(value, fallbackExtension) {
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

function hasPaymentDocuments(app) {
  return hasUploadedPaymentDocuments(app);
}

function hasUploadedPaymentDocuments(app) {
  return Boolean(
    getPaymentDocumentSource(getStoredPaymentDocument(app, "letter")) &&
    getPaymentDocumentSource(getStoredPaymentDocument(app, "bill"))
  );
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

function LicenseDetails({
  app,
  t,
  userDepartment,
  saving,
  onLicenseDocumentUpload,
  onLicenseDocumentDelete,
}) {
  const license = app.form_data?.license || {};
  const renewal = getLicenseRenewal(app);
  const reminders = getLicenseRenewalReminders(app);
  const cancellation = renewal.cancellation || {};
  const status = normalizeStatus(app?.status);
  const licenseFile = license.license_file || null;
  const canUploadLicenseDocument =
    userDepartment === "PT(IKL)" && status === "payment_verified";

  return (
    <div className="grid gap-4 text-sm lg:grid-cols-[minmax(240px,0.85fr)_minmax(0,1.75fr)]">
      <PaymentQrPanel app={app} t={t} />

      <div className="space-y-4">
        <section className="overflow-hidden rounded-md border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[13px] font-semibold uppercase leading-5 tracking-wide text-slate-500">
                {t("workspace.license.documentTitle", "Advertisement License")}
              </p>
              <p className="mt-1 text-[14px] leading-5 text-slate-600">
                {t("workspace.license.uploadDesc", "Upload the advertisement license file to the applicant.")}
              </p>
            </div>
            {licenseFile && (
              <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                {t("workspace.payment.methodReady", "Ready")}
              </span>
            )}
          </div>

          <div className="p-3">
            <PaymentDocumentSlot
              label={t("workspace.license.documentTitle", "Advertisement License")}
              file={licenseFile}
              t={t}
              canUpload={canUploadLicenseDocument}
              saving={saving}
              onFileChange={(file) => onLicenseDocumentUpload?.(file)}
              onDelete={() => onLicenseDocumentDelete?.(licenseFile)}
            />
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

  return `${origin}/license/verify/${encodeURIComponent(licenseId)}`;
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
