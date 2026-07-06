import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
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
  canViewLicense,
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
  getAdminApprovalRecordSeen,
  isAdminApprovalRecordUnread,
  markAdminApprovalRecordSeen,
} from "../../utils/adminSeenRecords";
import { stepText } from "../applications/user/steps/ApplicationStepText";

const RULED_TEXTAREA_STYLE = {
  lineHeight: "28px",
  backgroundAttachment: "local",
  backgroundImage:
    "repeating-linear-gradient(to bottom, transparent 0, transparent 27px, #1f2937 27px, #1f2937 28px)",
  backgroundPosition: "0 0",
  backgroundSize: "100% 28px",
};

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
const MPHLG_SUPPORTING_DOCUMENT_MAX_FILE_SIZE = 15 * 1024 * 1024;
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
  const [licenseIssuedSuccessModal, setLicenseIssuedSuccessModal] = useState({
    open: false,
    redirectTo: "",
  });
  const [applicationRejectedModal, setApplicationRejectedModal] = useState({
    open: false,
    reference: "",
    redirectTo: "",
    messageKey: "workspace.rejected.message",
    defaultMessage: "Application {reference} Has Been Rejected And Send To Applicant.",
  });
  const [applicationAmendmentModal, setApplicationAmendmentModal] = useState({
    open: false,
    reference: "",
    redirectTo: "",
    messageKey: "workspace.amendment.message",
    defaultMessage: "Application {reference} has been sent to the applicant for amendment.",
  });
  const [applicationApprovedModal, setApplicationApprovedModal] = useState({
    open: false,
    reference: "",
    redirectTo: "",
    messageKey: "workspace.approved.message",
    defaultMessage: "Application {reference} has been sent to Technical Review.",
  });
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
  const [mphlgSupportingDocuments, setMphlgSupportingDocuments] = useState([]);
  const [mphlgSupportingDocumentError, setMphlgSupportingDocumentError] = useState("");
  const [technicalSignatureError, setTechnicalSignatureError] = useState("");
  const [adminApprovalSeenAt, setAdminApprovalSeenAt] = useState(() =>
    getAdminApprovalRecordSeen(getStoredUser())
  );
  const [showVerificationReport, setShowVerificationReport] = useState(shouldOpenVerificationReport);
  const [showDecisionLog, setShowDecisionLog] = useState(false);
  const [showMphlgChecklist, setShowMphlgChecklist] = useState(false);
  const [showManualApprovalLetterEditor, setShowManualApprovalLetterEditor] = useState(false);
  const [showManualBillEditor, setShowManualBillEditor] = useState(false);
  const [showManualReceiptEditor, setShowManualReceiptEditor] = useState(false);
  const [showManualAdvertisementLicenseEditor, setShowManualAdvertisementLicenseEditor] = useState(false);
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
    digital_signature: null,
  });
  const technicalSiteRef = useRef(technicalSite);

  useEffect(() => {
    technicalSiteRef.current = technicalSite;
  }, [technicalSite]);

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
      digital_signature:
        getCurrentTechnicalDepartmentReviews(selectedDetail)?.[userDepartment]?.digital_signature ||
        saved.digital_signature ||
        selectedDetail?.form_data?.technical_review?.digital_signature ||
        null,
    });
    setTechnicalApplicationTypeSelection(getApplicationTypeOptionsFromApplication(selectedDetail));
    setTechnicalSizeError("");
    setTechnicalSignatureError("");
  }, [
    selectedDetail?.id,
    selectedDetail?.status,
    selectedDetail?.updated_at,
    selectedDetail?.form_data?.technical_review_cycle,
    selectedDetail?.form_data?.technical_referral?.cycle_id,
    selectedDetail?.form_data?.technical_department_reviews,
    selectedDetail?.form_data?.technical_site_visit?.reset_at,
    userDepartment,
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
  const isKbVerificationTemplateWorkspace =
    isApprovalWorkspace &&
    approvalStageKey === "kb" &&
    userDepartment === "KB(LES)";
  const isMphlgApprovalWorkspace =
    isApprovalWorkspace &&
    approvalStageKey === "mphlg" &&
    MPHLG_REVIEW_DEPARTMENTS.includes(userDepartment);
  const useApprovalSignatureTemplate =
    isApprovalSupportWorkspace || isKbVerificationTemplateWorkspace || isMphlgApprovalWorkspace;
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
    useApprovalSignatureTemplate && decision
      ? decision
      : "";
  const showApprovalSupportSignature = isSignedApprovalSupportDecision(approvalSupportDecision);
  const approvalSupportDecisionOptions = useMemo(
    () =>
      isKbVerificationTemplateWorkspace
        ? getWorkspaceDecisionOptions(config, selectedRecord, userDepartment)
        : isMphlgApprovalWorkspace
          ? getWorkspaceDecisionOptions(config, selectedRecord, userDepartment)
        : getApprovalSupportDecisionOptions(isFinalApprovalSupportWorkspace),
    [
      config,
      isFinalApprovalSupportWorkspace,
      isKbVerificationTemplateWorkspace,
      isMphlgApprovalWorkspace,
      selectedRecord?.id,
      selectedRecord?.status,
      selectedRecord?.updated_at,
      userDepartment,
    ]
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
    !useApprovalSignatureTemplate &&
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
    !useApprovalSignatureTemplate &&
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
    (
      !selectedPaymentReceiptAction.requiresPaymentDocuments ||
      selectedPaymentReceiptAction.requiresSubmittedReceipt ||
      hasUploadedPaymentDocuments(selectedRecord)
    ) &&
    (!selectedPaymentReceiptAction.requiresOfficialReceipt ||
      getPaymentDocumentSource(getStoredPaymentDocument(selectedRecord, "official_receipt"))) &&
    (!selectedPaymentReceiptAction.requiresLicenseDocument ||
      getPaymentDocumentSource(selectedRecord?.form_data?.license?.license_file))
  );
  const requiresPaymentReceiptSignature =
    showPaymentReceiptDecision && selectedPaymentReceiptAction?.label === "Verify Receipt";
  const selectedPaymentReceiptActionRequirementsReady =
    !selectedPaymentReceiptAction ||
    (selectedPaymentReceiptActionReady &&
      (!requiresPaymentReceiptSignature || hasDigitalSignatureContent(approvalSupportSignature)));
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
    setShowMphlgChecklist(false);
  }, [selectedRecord?.id]);

  useEffect(() => {
    const savedSignature =
      selectedRecord?.form_data?.approval_letter?.digital_signature ||
      selectedRecord?.form_data?.kb_les_verification?.digital_signature ||
      selectedRecord?.form_data?.management_recommendation?.digital_signature ||
      selectedRecord?.form_data?.approval?.digital_signature ||
      null;

    setApprovalSupportSignature(savedSignature);
    setApprovalSupportSignatureError("");
  }, [selectedRecord?.id]);

  useEffect(() => {
    setMphlgSupportingDocuments(getMphlgSupportingDocuments(selectedRecord));
    setMphlgSupportingDocumentError("");
  }, [selectedRecord?.id, selectedRecord?.updated_at]);

  useEffect(() => {
    if (useApprovalSignatureTemplate) {
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
    useApprovalSignatureTemplate,
    selectedRecord?.id,
    showPaymentDocumentDecision,
    showPaymentReceiptDecision,
    showPaymentTypedDecision,
    t,
    useTypedApprovalDecision,
    userDepartment,
  ]);

  useEffect(() => {
    if (!requiresPaymentReceiptSignature) {
      setApprovalSupportSignatureError("");
    }
  }, [requiresPaymentReceiptSignature]);

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

  async function saveManualApprovalLetterDraft(bodyHtml) {
    if (!selectedRecord?.id) return;

    const now = new Date().toISOString();
    const savedApprovalLetter = selectedRecord.form_data?.approval_letter || {};
    const nextManualLetter = {
      ...(savedApprovalLetter.manual_letter || {}),
      template: "dbku_approval_letter_3_page_blank_v1",
      name: t("workspace.payment.approvalLetter", "Approval Letter"),
      editable_body_html: bodyHtml,
      document_html: buildManualApprovalLetterDocumentHtml(bodyHtml),
      status: "Draft",
      saved_by: userDepartment,
      saved_at: now,
    };
    const nextApprovalLetter = {
      ...savedApprovalLetter,
      manual_letter: nextManualLetter,
      generated_by: userDepartment,
      generated_at: savedApprovalLetter.generated_at || now,
      updated_at: now,
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

    try {
      setSaving(true);
      setError("");
      setSuccess("");

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
      setShowManualApprovalLetterEditor(false);
      setSuccess(t("workspace.payment.approvalLetterSaved", "Approval letter saved."));
    } catch (err) {
      setError(err.message || t("workspace.payment.approvalLetterSaveFailed", "Could not save the approval letter."));
    } finally {
      setSaving(false);
    }
  }

  async function saveManualBillDraft(bodyHtml) {
    if (!selectedRecord?.id) return;

    const now = new Date().toISOString();
    const savedApprovalLetter = selectedRecord.form_data?.approval_letter || {};
    const billDetails = getManualBillDetails(selectedRecord);
    const nextManualBill = {
      ...(savedApprovalLetter.manual_bill || {}),
      template: "dbku_bill_rate_form_v1",
      name: t("workspace.payment.billDocument", "Bill"),
      invoice_no: getInvoiceNo(selectedRecord),
      amount: billDetails.total,
      rows: billDetails.rows
        .filter((row) => parseCurrencyAmount(row.amount) > 0)
        .map((row) => ({
          label: row.item,
          amount: row.amount,
          validity: row.validity || "Per Permohonan",
          account_code: row.accountCode,
        })),
      editable_body_html: bodyHtml,
      document_html: buildManualBillDocumentHtml(bodyHtml),
      status: "Draft",
      saved_by: userDepartment,
      saved_at: now,
    };
    const nextApprovalLetter = {
      ...savedApprovalLetter,
      manual_bill: nextManualBill,
      generated_by: userDepartment,
      generated_at: savedApprovalLetter.generated_at || now,
      updated_at: now,
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

    try {
      setSaving(true);
      setError("");
      setSuccess("");

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
      setShowManualBillEditor(false);
      setSuccess(t("workspace.payment.billSaved", "Bill saved."));
    } catch (err) {
      setError(err.message || t("workspace.payment.billSaveFailed", "Could not save the bill."));
    } finally {
      setSaving(false);
    }
  }

  async function saveManualReceiptDraft(documentHtml) {
    if (!selectedRecord?.id) return;

    const now = new Date().toISOString();
    const savedApprovalLetter = selectedRecord.form_data?.approval_letter || {};
    const receiptNo =
      getEditedOfficialReceiptNumber(documentHtml) ||
      getGeneratedOfficialReceiptNumber(selectedRecord);
    const nextManualReceipt = {
      ...(savedApprovalLetter.manual_receipt || {}),
      template: "dbku_official_receipt_acc_3_88_v1",
      name: t("workspace.payment.manual.officialReceiptTitle", "Official Receipt"),
      receipt_no: receiptNo,
      document_html: documentHtml || buildGeneratedOfficialReceiptDocumentHtml(selectedRecord),
      status: "Draft",
      saved_by: userDepartment,
      saved_at: now,
    };
    const nextApprovalLetter = {
      ...savedApprovalLetter,
      manual_receipt: nextManualReceipt,
      updated_at: now,
    };

    try {
      setSaving(true);
      setError("");
      setSuccess("");

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
      setShowManualReceiptEditor(false);
      setSuccess(t("workspace.payment.receiptSaved", "Official receipt saved."));
    } catch (err) {
      setError(err.message || t("workspace.payment.receiptSaveFailed", "Could not save the official receipt."));
    } finally {
      setSaving(false);
    }
  }

  async function saveManualAdvertisementLicenseDraft(documentHtml) {
    if (!selectedRecord?.id) return;

    const now = new Date().toISOString();
    const savedLicense = selectedRecord.form_data?.license || {};
    const nextManualLicense = {
      ...(savedLicense.manual_license || {}),
      template: "dbku_advertisement_license_borang_b_v1",
      name: t("workspace.license.documentTitle", "Advertisement License"),
      document_html: documentHtml || buildBlankAdvertisementLicenseDocumentHtml(selectedRecord, t),
      status: "Draft",
      saved_by: userDepartment,
      saved_at: now,
    };
    const nextLicense = {
      ...savedLicense,
      manual_license: nextManualLicense,
      updated_at: now,
    };

    try {
      setSaving(true);
      setError("");
      setSuccess("");

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
      setShowManualAdvertisementLicenseEditor(false);
      setSuccess(t("workspace.license.saved", "Advertisement license saved."));
    } catch (err) {
      setError(err.message || t("workspace.license.saveFailed", "Could not save the advertisement license."));
    } finally {
      setSaving(false);
    }
  }

  function addMphlgSupportingDocument() {
    setMphlgSupportingDocumentError("");
    setMphlgSupportingDocuments((prev) => [
      ...prev,
      {
        description: "",
        format: "PDF",
        attachment: null,
      },
    ]);
  }

  function updateMphlgSupportingDocument(index, field, value) {
    if (mphlgSupportingDocumentError) setMphlgSupportingDocumentError("");
    setMphlgSupportingDocuments((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      )
    );
  }

  async function uploadMphlgSupportingDocument(index, file) {
    if (!selectedRecord?.id || !file) return;

    const validationMessage = getMphlgSupportingDocumentValidationMessage(file, t);
    if (validationMessage) {
      setMphlgSupportingDocumentError(validationMessage);
      return;
    }

    const row = mphlgSupportingDocuments[index] || {};
    const documentTitle = row.description || t(
      "workspace.mphlg.supportingDocument",
      "MPHLG Supporting Document"
    );

    try {
      setSaving(true);
      setError("");
      setSuccess("");
      setMphlgSupportingDocumentError("");

      const uploaded = await uploadApplicationDocument(
        selectedRecord.id,
        documentTitle,
        file
      );
      const attachment = normalizeMphlgSupportingDocumentAttachment(
        selectedRecord.id,
        uploaded,
        file
      );

      setMphlgSupportingDocuments((prev) =>
        prev.map((item, itemIndex) =>
          itemIndex === index ? { ...item, attachment } : item
        )
      );
      setSuccess(t("workspace.payment.documentUploaded", "Document uploaded."));
    } catch (err) {
      setError(err.message || t("workspace.payment.documentUploadFailed", "Document upload failed."));
    } finally {
      setSaving(false);
    }
  }

  function removeMphlgSupportingDocumentFile(index) {
    if (mphlgSupportingDocumentError) setMphlgSupportingDocumentError("");
    setMphlgSupportingDocuments((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index ? { ...item, attachment: null } : item
      )
    );
  }

  function removeMphlgSupportingDocument(index) {
    if (mphlgSupportingDocumentError) setMphlgSupportingDocumentError("");
    setMphlgSupportingDocuments((prev) =>
      prev.filter((_, itemIndex) => itemIndex !== index)
    );
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
    const hasNextSignature = Object.prototype.hasOwnProperty.call(
      nextSite || {},
      "digital_signature"
    );
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
      digital_signature: hasNextSignature
        ? nextSite.digital_signature
        : technicalSiteRef.current?.digital_signature !== undefined
          ? technicalSiteRef.current.digital_signature
          : saved.digital_signature || null,
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

    const cleanedComment = cleanRemark(comment);

    if (!decisionValue) {
      setDecisionError(getWorkspaceDecisionInputPrompt(approvalSupportDecisionOptions, t));
      decisionInputRef.current?.focus();
      return;
    }

    if (!cleanedComment) {
      setCommentError(t("workspace.validation.remarksRequired", "Remarks are required."));
      commentRef.current?.focus();
      return;
    }

    const requiresSignature = isSignedApprovalSupportDecision(decisionValue);
    const supportSignature = requiresSignature ? approvalSupportSignature : null;

    if (requiresSignature && !hasDigitalSignatureContent(supportSignature)) {
      setApprovalSupportSignatureError(
        t("workspace.signature.required", "Digital signature is required.")
      );
      return;
    }

    if (isFinalApprovalSupportWorkspace) {
      setDecision("Approve");
      submitAction(action, {
        decision: "Approve",
        comment: cleanedComment,
        checkDecisionRemark: false,
        approvalDecisionHtml: "",
        approvalSupportSignature: supportSignature,
      });
      return;
    }

    submitAction(action, {
      decision: decisionValue,
      comment: cleanedComment,
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

      if (!hasDigitalSignatureContent(approvalSupportSignature)) {
        setApprovalSupportSignatureError(
          t("workspace.signature.required", "Digital signature is required.")
        );
        return;
      }

      submitAction(action, { approvalSupportSignature });
      return;
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
    setTechnicalSignatureError("");
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

    if (
      isDepartmentTechnicalWorkspace &&
      action.buildPayload === buildDepartmentTechnicalReviewPayload &&
      !hasDigitalSignatureContent(technicalSite.digital_signature)
    ) {
      setTechnicalSignatureError(
        t("workspace.signature.required", "Digital signature is required.")
      );
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

    if (
      action.requiresPaymentDocuments &&
      !action.requiresSubmittedReceipt &&
      !hasUploadedPaymentDocuments(selectedRecord)
    ) {
      setError(t(
        "workspace.payment.documentsRequired",
        "Please save the approval letter and bill before sending to the applicant."
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
      setLicenseIssuedSuccessModal({ open: false, redirectTo: "" });
      setApplicationRejectedModal({
        open: false,
        reference: "",
        redirectTo: "",
        messageKey: "workspace.rejected.message",
        defaultMessage: "Application {reference} Has Been Rejected And Send To Applicant.",
      });
      setApplicationAmendmentModal(createClosedApplicationAmendmentModalState());
      setApplicationApprovedModal(createClosedApplicationApprovedModalState());
      const shouldShowLicenseIssuedSuccess =
        action.key === "issue_license" ||
        (action.requiresSubmittedReceipt && /^verify receipt$/i.test(String(action.label || actionDecision || "")));

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
        mphlgSupportingDocuments,
        screeningSignature: overrides.screeningSignature || null,
        kuSignature: overrides.kuSignature ?? null,
        kuChecks: overrides.kuChecks,
        officialReceiptMode: "upload",
        t,
      });
      const shouldShowApplicationAmendmentSuccess = shouldShowApplicationAmendmentModal(action, body);
      const shouldShowTechnicalSiteVisitAmendmentSuccess =
        shouldShowTechnicalSiteVisitAmendmentModal(action, body);
      const shouldShowApplicationRejectedSuccess = shouldShowApplicationRejectedModal(action, body);
      const shouldShowMphlgRejectedSuccess = shouldShowMphlgRejectedModal(action, body);
      const shouldShowApplicationApprovedSuccess = shouldShowApplicationApprovedModal(action, body);
      const shouldShowMphlgFinalApprovedSuccess = shouldShowMphlgFinalApprovedModal(action, body);
      const shouldShowInvoiceGeneratedSuccess = shouldShowInvoiceGeneratedModal(action, body);
      const shouldShowTechnicalSiteVisitSuccess = shouldShowTechnicalSiteVisitModal(action, body);
      const shouldShowKuFinalCheckSuccess = shouldShowKuFinalCheckModal(action, body);
      const shouldShowKbVerificationSuccess = shouldShowKbVerificationModal(action, body);
      const shouldShowKbApprovalSupportSuccess = shouldShowKbApprovalSupportModal(action, body);
      const shouldShowApprovalSupportMphlgSuccess = shouldShowApprovalSupportMphlgModal(
        action,
        body
      );
      const shouldShowApprovalSupportAmendmentSuccess =
        shouldShowApprovalSupportAmendmentModal(action, body);
      const shouldShowWorkspaceResultModal =
        shouldShowLicenseIssuedSuccess ||
        shouldShowApplicationRejectedSuccess ||
        shouldShowApplicationAmendmentSuccess ||
        shouldShowApplicationApprovedSuccess ||
        shouldShowInvoiceGeneratedSuccess ||
        shouldShowTechnicalSiteVisitSuccess ||
        shouldShowKuFinalCheckSuccess ||
        shouldShowKbVerificationSuccess ||
        shouldShowKbApprovalSupportSuccess ||
        shouldShowApprovalSupportMphlgSuccess ||
        shouldShowMphlgFinalApprovedSuccess;

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

      if (
        tableFirstWorkspace &&
        config.key === "approval" &&
        isApprovalHistoryRecord(body) &&
        !shouldShowWorkspaceResultModal
      ) {
        setSuccess(t(action.successKey, action.success));
        setComment("");
        setSelectedId("");
        setSelectedDetail(null);
        await fetchApplications({ silent: true });
        navigate("/dashboard/admin?view=approval", { replace: true });
        return true;
      }

      setSuccess(t(action.successKey, action.success));
      if (shouldShowLicenseIssuedSuccess) {
        setLicenseIssuedSuccessModal({
          open: true,
          redirectTo:
            isFocusedPersonalWorkspace || fromPersonalTask
              ? "/dashboard/admin?view=personal"
              : "",
        });
      }
      if (shouldShowApplicationRejectedSuccess) {
        setApplicationRejectedModal({
          open: true,
          reference: getApplicationReference(selectedRecord),
          redirectTo:
            isFocusedPersonalWorkspace || fromPersonalTask
              ? "/dashboard/admin?view=personal"
              : "",
          messageKey: shouldShowMphlgRejectedSuccess
            ? "workspace.mphlgRejected.message"
            : "workspace.rejected.message",
          defaultMessage: shouldShowMphlgRejectedSuccess
            ? "Application {reference} Has Been Sent To Applicant."
            : "Application {reference} Has Been Rejected And Send To Applicant.",
        });
      }
      if (shouldShowApplicationAmendmentSuccess) {
        setApplicationAmendmentModal({
          open: true,
          reference: getApplicationReference(selectedRecord),
          redirectTo:
            isFocusedPersonalWorkspace || fromPersonalTask
              ? "/dashboard/admin?view=personal"
              : "",
          messageKey: shouldShowTechnicalSiteVisitAmendmentSuccess
            ? "workspace.amendment.technicalSiteVisitMessage"
            : shouldShowKbNotVerifyAmendmentModal(action, body) ||
                shouldShowApprovalSupportAmendmentSuccess
              ? "workspace.amendment.kuIklMessage"
            : "workspace.amendment.message",
          defaultMessage: shouldShowTechnicalSiteVisitAmendmentSuccess
            ? "Application {reference} has been sent to Technical Site Visit."
            : shouldShowKbNotVerifyAmendmentModal(action, body) ||
                shouldShowApprovalSupportAmendmentSuccess
              ? "Application {reference} has been sent to KU(IKL)."
            : "Application {reference} has been sent to the applicant for amendment.",
        });
      }
      if (
        shouldShowApplicationApprovedSuccess ||
        shouldShowInvoiceGeneratedSuccess ||
        shouldShowTechnicalSiteVisitSuccess ||
        shouldShowKuFinalCheckSuccess ||
          shouldShowKbVerificationSuccess ||
          shouldShowKbApprovalSupportSuccess ||
          shouldShowApprovalSupportMphlgSuccess ||
          shouldShowMphlgFinalApprovedSuccess
      ) {
        setApplicationApprovedModal({
          open: true,
          reference: getApplicationReference(selectedRecord),
          redirectTo:
            isFocusedPersonalWorkspace || fromPersonalTask
              ? "/dashboard/admin?view=personal"
              : "",
          messageKey: shouldShowKuFinalCheckSuccess
            ? "workspace.kuFinalCheck.message"
            : shouldShowMphlgFinalApprovedSuccess
            ? "workspace.mphlgFinalApproved.message"
            : shouldShowInvoiceGeneratedSuccess
            ? "workspace.invoiceGenerated.message"
            : shouldShowApprovalSupportMphlgSuccess
              ? "workspace.mphlgApproval.message"
            : shouldShowKbApprovalSupportSuccess
              ? "workspace.tpPghFinalApproval.message"
            : shouldShowKbVerificationSuccess
              ? "workspace.kbVerification.message"
              : shouldShowTechnicalSiteVisitSuccess
                ? "workspace.technicalSiteVisit.message"
                : "workspace.approved.message",
          defaultMessage: shouldShowKuFinalCheckSuccess
            ? "Application {reference} has been sent to KU(IKL) Final Check."
            : shouldShowMphlgFinalApprovedSuccess
            ? "Application {reference} Has Been Approve."
            : shouldShowInvoiceGeneratedSuccess
            ? "Approval Letter & Bill For Application {reference} Has Been Generated."
            : shouldShowApprovalSupportMphlgSuccess
              ? "Application {reference} has been sent to MPHLG."
            : shouldShowKbApprovalSupportSuccess
              ? "Application {reference} has been sent to TP(RES)/PGH Final Approval."
            : shouldShowKbVerificationSuccess
              ? "Application {reference} has been sent to KB(LES) Verification."
              : shouldShowTechnicalSiteVisitSuccess
                ? "Application {reference} has been sent for Technical Site Visit."
                : "Application {reference} has been sent to Technical Review.",
        });
      }
      setComment("");
      await fetchApplications();
      if (shouldShowWorkspaceResultModal) {
        return true;
      }
      if (shouldShowLicenseIssuedSuccess && (isFocusedPersonalWorkspace || fromPersonalTask)) {
        return true;
      }
      if (shouldShowApplicationRejectedSuccess && (isFocusedPersonalWorkspace || fromPersonalTask)) {
        return true;
      }
      if (shouldShowApplicationAmendmentSuccess && (isFocusedPersonalWorkspace || fromPersonalTask)) {
        return true;
      }
      if (
        (shouldShowApplicationApprovedSuccess ||
          shouldShowInvoiceGeneratedSuccess ||
          shouldShowTechnicalSiteVisitSuccess ||
          shouldShowKuFinalCheckSuccess ||
          shouldShowKbVerificationSuccess ||
          shouldShowKbApprovalSupportSuccess ||
          shouldShowApprovalSupportMphlgSuccess ||
          shouldShowMphlgFinalApprovedSuccess) &&
        (isFocusedPersonalWorkspace || fromPersonalTask)
      ) {
        return true;
      }
      if (isFocusedPersonalWorkspace || fromPersonalTask) {
        navigate("/dashboard/admin?view=personal");
        return true;
      }

      const refreshed =
        response?.data || (await apiRequest(`/applications/${selectedRecord.id}/`));

      if (
        tableFirstWorkspace &&
        config.key === "approval" &&
        isApprovalHistoryRecord(refreshed) &&
        !shouldShowWorkspaceResultModal
      ) {
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

  function closeApplicationRejectedModal() {
    const redirectTo = applicationRejectedModal.redirectTo;
    setApplicationRejectedModal({
      open: false,
      reference: "",
      redirectTo: "",
      messageKey: "workspace.rejected.message",
      defaultMessage: "Application {reference} Has Been Rejected And Send To Applicant.",
    });
    if (redirectTo) {
      navigate(redirectTo);
    }
  }

  function closeApplicationAmendmentModal() {
    const redirectTo = applicationAmendmentModal.redirectTo;
    setApplicationAmendmentModal(createClosedApplicationAmendmentModalState());
    if (redirectTo) {
      navigate(redirectTo);
    }
  }

  function closeApplicationApprovedModal() {
    const redirectTo = applicationApprovedModal.redirectTo;
    setApplicationApprovedModal(createClosedApplicationApprovedModalState());
    if (redirectTo) {
      navigate(redirectTo);
    }
  }

  function closeLicenseIssuedSuccessModal() {
    const redirectTo = licenseIssuedSuccessModal.redirectTo;
    setLicenseIssuedSuccessModal({ open: false, redirectTo: "" });
    if (redirectTo) {
      navigate(redirectTo);
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
                    !showApprovalPaymentReadOnly && (isFocusedPersonalWorkspace || tableFirstWorkspace) ? (
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

              {showWorkspaceDecisionLog && (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    icon="assignment"
                    onClick={() => setShowDecisionLog((visible) => !visible)}
                  >
                    {showDecisionLog
                      ? t("workspace.decisionLog.hideReport", "Hide Report")
                      : t("workspace.decisionLog.showReport", "Show Report")}
                  </Button>
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
                  language={language}
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
                  onOpenForm={() => openSelectedFormView(selectedRecord.id)}
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
                  technicalSignatureError={technicalSignatureError}
                  setTechnicalSignatureError={setTechnicalSignatureError}
                  userDepartment={userDepartment}
                  showKuVerificationReport={showVerificationReport}
                />
              ) : (
                <>
                  {isMphlgApprovalWorkspace && canSubmitWorkspaceAction && (
                    <div className="space-y-5">
                      <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-3 pt-6">
                        <span className="text-base font-medium leading-6 text-slate-950">1.</span>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setShowMphlgChecklist(true)}
                            className="min-h-10 rounded-md border border-slate-300 bg-white px-6 text-sm font-medium leading-5 text-slate-950 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1"
                          >
                            {t("workspace.mphlg.viewChecklist", "View Check List")}
                          </button>
                          <span className="group relative inline-flex">
                            <button
                              type="button"
                              className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-[#18b36b] bg-white text-[12px] font-bold leading-none text-[#00843d] focus:outline-none focus:ring-2 focus:ring-[#18b36b] focus:ring-offset-1"
                              aria-label={t(
                                "workspace.mphlg.checklistHelp",
                                "Please download this document, fill in all fields, and upload it in the table below."
                              )}
                            >
                              i
                            </button>
                            <span className="pointer-events-none absolute left-7 top-1/2 z-20 hidden w-72 -translate-y-1/2 rounded border border-slate-200 bg-white px-3 py-2 text-xs font-semibold normal-case leading-5 text-slate-700 shadow-lg group-hover:block group-focus-within:block">
                              {t(
                                "workspace.mphlg.checklistHelp",
                                "Please download this document, fill in all fields, and upload it in the table below."
                              )}
                            </span>
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-3">
                        <span className="pt-3 text-base font-medium leading-6 text-slate-950">2.</span>
                        <div className="min-w-0 flex-1">
                          <MphlgSupportingDocumentsTable
                            rows={mphlgSupportingDocuments}
                            t={t}
                            saving={saving}
                            error={mphlgSupportingDocumentError}
                            onAdd={addMphlgSupportingDocument}
                            onUpdate={updateMphlgSupportingDocument}
                            onRemove={removeMphlgSupportingDocument}
                            onFileChange={uploadMphlgSupportingDocument}
                            onRemoveFile={removeMphlgSupportingDocumentFile}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {config.showDecision &&
                    canSubmitWorkspaceAction &&
                    !isApprovalLicenseManagement &&
                    !useApprovalSignatureTemplate &&
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
                          onEditApprovalLetter={() => setShowManualApprovalLetterEditor(true)}
                          onEditBill={() => setShowManualBillEditor(true)}
                          onEditReceipt={() => setShowManualReceiptEditor(true)}
                          onEditLicense={() => setShowManualAdvertisementLicenseEditor(true)}
                          onLicenseDocumentUpload={uploadLicenseDocument}
                          onLicenseDocumentDelete={deleteLicenseDocument}
                          onManualLicenseDraftChange={updateManualLicenseDraft}
                          paymentReceiptDecision={decision}
                        />
                      )
                    )
                  )}

                  {showPaymentTypedDecision && (
                    showPaymentDocumentDecision ? (
                      <div className="max-w-[56rem]">
                        <span className="mb-1 block text-[13px] font-semibold leading-5 text-slate-900">
                          {t("common.decision", "Your Recommendation")}
                        </span>
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
                          className={`form-input form-input-sm w-full max-w-[17rem] bg-white text-[13px] ${decisionError ? "border-red-300 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(220,38,38,0.12)]" : ""}`}
                          placeholder={getWorkspaceDecisionInputPrompt(paymentTypedDecisionOptions, t)}
                          inputMode="text"
                          aria-invalid={Boolean(decisionError)}
                        />
                        {decisionError && (
                          <p className="mt-1.5 text-[13px] font-medium leading-5 text-red-600">
                            {decisionError}
                          </p>
                        )}
                      </div>
                    ) : (
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
                    )
                  )}

                  {showWorkspaceCommentField && (
                    isDepartmentTechnicalWorkspace ? (
                      <div className="space-y-4">
                        <div className="max-w-[56rem]">
                          <label
                            htmlFor="technical-department-remarks"
                            className="mb-1 block text-[13px] font-semibold leading-5 text-slate-900"
                          >
                            {t("workspace.comment.remarks", "Remarks")}
                            <span className="ml-1 text-red-600">*</span>
                          </label>
                          <div
                            className={`relative min-h-[390px] bg-white ${commentError ? "shadow-[0_0_0_2px_rgba(220,38,38,0.18)]" : ""}`}
                            style={{
                              backgroundImage:
                                "repeating-linear-gradient(to bottom, transparent 0, transparent 25px, #1f2937 26px, transparent 27px)",
                            }}
                          >
                            <textarea
                              id="technical-department-remarks"
                              ref={commentRef}
                              value={comment}
                              onChange={(event) => {
                                setComment(event.target.value);
                                if (commentError) setCommentError("");
                              }}
                              rows="12"
                              required
                              aria-required="true"
                              aria-invalid={Boolean(commentError)}
                              className="h-full min-h-[390px] w-full resize-y border-0 bg-white px-2 pb-0 pt-0 text-[13px] font-medium leading-[28px] text-slate-950 outline-none placeholder:text-transparent focus:border-0 focus:outline-none focus:ring-0"
                              placeholder={t(config.commentPlaceholderKey, config.commentPlaceholder || "Enter notes")}
                              style={RULED_TEXTAREA_STYLE}
                            />
                          </div>
                          {commentError && (
                            <p className="mt-1.5 text-[13px] font-medium leading-5 text-red-600">
                              {commentError}
                            </p>
                          )}
                        </div>
                        <ApprovalSupportSignatureBox
                          t={t}
                          value={technicalSite.digital_signature}
                          error={technicalSignatureError}
                          onChange={(nextSignature) => {
                            setTechnicalSite((prev) => ({
                              ...prev,
                              digital_signature: nextSignature,
                            }));
                            if (technicalSignatureError) setTechnicalSignatureError("");
                          }}
                          onError={setTechnicalSignatureError}
                        />
                      </div>
                    ) : showPaymentDocumentDecision ? (
                      <div className="max-w-[56rem]">
                        <label
                          htmlFor="payment-document-remarks"
                          className="mb-1 block text-[13px] font-semibold leading-5 text-slate-900"
                        >
                          {t("workspace.comment.remarks", "Remarks")}
                          {workspaceCommentRequired && (
                            <span className="ml-1 text-red-600">*</span>
                          )}
                        </label>
                        <div
                          className={`relative min-h-[390px] bg-white ${commentError ? "shadow-[0_0_0_2px_rgba(220,38,38,0.18)]" : ""}`}
                          style={{
                            backgroundImage:
                              "repeating-linear-gradient(to bottom, transparent 0, transparent 25px, #1f2937 26px, transparent 27px)",
                          }}
                        >
                          <textarea
                            id="payment-document-remarks"
                            ref={commentRef}
                            value={comment}
                            onChange={(event) => {
                              setComment(event.target.value);
                              if (commentError) setCommentError("");
                            }}
                            rows="12"
                            required={workspaceCommentRequired}
                            aria-required={workspaceCommentRequired}
                            aria-invalid={Boolean(commentError)}
                            className="h-full min-h-[390px] w-full resize-y border-0 bg-white px-2 pb-0 pt-0 text-[13px] font-medium leading-[28px] text-slate-950 outline-none placeholder:text-transparent focus:border-0 focus:outline-none focus:ring-0"
                            placeholder={t("workspace.comment.approvalPlaceholder", "Add comments")}
                            style={RULED_TEXTAREA_STYLE}
                          />
                        </div>
                        {commentError && (
                          <p className="mt-1.5 text-[13px] font-medium leading-5 text-red-600">
                            {commentError}
                          </p>
                        )}
                        <div className="mt-4">
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
                        </div>
                      </div>
                    ) : (
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
                        {showPaymentTypedDecision ? (
                          <div
                            className={`relative min-h-[220px] rounded-md border border-slate-300 bg-white ${commentError ? "border-red-300 shadow-[0_0_0_2px_rgba(220,38,38,0.18)]" : ""}`}
                            style={{
                              backgroundImage:
                                "repeating-linear-gradient(to bottom, transparent 0, transparent 25px, #1f2937 26px, transparent 27px)",
                            }}
                          >
                            <textarea
                              ref={commentRef}
                              value={comment}
                              onChange={(event) => {
                                setComment(event.target.value);
                                if (commentError) setCommentError("");
                              }}
                              rows="8"
                              required={workspaceCommentRequired}
                              aria-required={workspaceCommentRequired}
                              aria-invalid={Boolean(commentError)}
                              className="h-full min-h-[220px] w-full resize-y border-0 bg-white px-2 pb-0 pt-0 text-[13px] font-medium leading-[28px] text-slate-950 outline-none placeholder:text-transparent focus:border-0 focus:outline-none focus:ring-0"
                              placeholder={t("workspace.comment.approvalPlaceholder", "Add comments")}
                              style={RULED_TEXTAREA_STYLE}
                            />
                          </div>
                        ) : (
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
                            className={`form-input ${commentError ? "border-red-300 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(220,38,38,0.12)]" : ""}`}
                            placeholder={t(config.commentPlaceholderKey, config.commentPlaceholder || "Enter notes")}
                          />
                        )}
                        {commentError && (
                          <p className="mt-1.5 text-[13px] font-medium leading-5 text-red-600">
                            {commentError}
                          </p>
                        )}
                        {requiresPaymentReceiptSignature && (
                          <div className="mt-4">
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
                          </div>
                        )}
                      </Field>
                    )
                  )}

                  {useApprovalSignatureTemplate && canSubmitWorkspaceAction && (
                    <div className={isMphlgApprovalWorkspace ? "grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3" : ""}>
                      {isMphlgApprovalWorkspace && <span aria-hidden="true" />}
                      <div className={isMphlgApprovalWorkspace ? "min-w-0 space-y-4" : "contents"}>
                      {showApprovalMemoPreviews && (
                        <ApprovalMemoPreview
                          app={selectedRecord}
                          memoHtml={approvalMemoHtml}
                          language={language}
                          t={t}
                        />
                      )}
                      <div className="max-w-[56rem]">
                        <span className="mb-1 block text-[13px] font-semibold leading-5 text-slate-900">
                          {t("common.decision", "Your Recommendation")}
                        </span>
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
                          className={`form-input form-input-sm w-full max-w-[30rem] bg-white text-[13px] ${decisionError ? "border-red-300 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(220,38,38,0.12)]" : ""}`}
                          placeholder={
                            isFinalApprovalSupportWorkspace
                              ? getWorkspaceDecisionInputPrompt(approvalSupportDecisionOptions, t)
                              : isKbVerificationTemplateWorkspace
                                ? t("workspace.decision.typeVerifyOrNotVerify", "Type Verify or Not Verify")
                                : isMphlgApprovalWorkspace
                                  ? t("workspace.decision.typeApproveOrReject", "Type Approve or Reject")
                                : t("workspace.decision.typeSupportOrNotSupport", "Type Support or Not Support")
                          }
                          inputMode="text"
                          aria-invalid={Boolean(decisionError)}
                        />
                        {decisionError && (
                          <p className="mt-1.5 text-[13px] font-medium leading-5 text-red-600">
                            {decisionError}
                          </p>
                        )}
                      </div>
                      <div className="mt-4 max-w-[56rem]">
                        <label
                          htmlFor="approval-support-remarks"
                          className="mb-1 block text-[13px] font-semibold leading-5 text-slate-900"
                        >
                          {t("workspace.comment.approvalRemarks", "Remarks")}
                          <span className="ml-1 text-red-600">*</span>
                        </label>
                        <div
                          className={`relative min-h-[390px] bg-white ${commentError ? "shadow-[0_0_0_2px_rgba(220,38,38,0.18)]" : ""}`}
                          style={{
                            backgroundImage:
                              "repeating-linear-gradient(to bottom, transparent 0, transparent 25px, #1f2937 26px, transparent 27px)",
                          }}
                        >
                          <textarea
                            id="approval-support-remarks"
                            ref={commentRef}
                            value={comment}
                            onChange={(event) => {
                              setComment(event.target.value);
                              if (commentError) setCommentError("");
                            }}
                            rows="12"
                            required
                            aria-required
                            aria-invalid={Boolean(commentError)}
                            className="h-full min-h-[390px] w-full resize-y border-0 bg-white px-2 pb-0 pt-0 text-[13px] font-medium leading-[28px] text-slate-950 outline-none placeholder:text-transparent focus:border-0 focus:outline-none focus:ring-0"
                            placeholder={t("workspace.comment.approvalRemarksPlaceholder", "Enter approval remarks.")}
                            style={RULED_TEXTAREA_STYLE}
                          />
                        </div>
                        {commentError && (
                          <p className="mt-1.5 text-[13px] font-medium leading-5 text-red-600">
                            {commentError}
                          </p>
                        )}
                      </div>
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
                      </div>
                    </div>
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
                        onEditApprovalLetter={() => setShowManualApprovalLetterEditor(true)}
                        onEditBill={() => setShowManualBillEditor(true)}
                        onEditReceipt={() => setShowManualReceiptEditor(true)}
                        onEditLicense={() => setShowManualAdvertisementLicenseEditor(true)}
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
                      (useApprovalSignatureTemplate || canSendSavedApprovalMemoToMphlg) ? (
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

                            if (
                              requiresPaymentReceiptSignature &&
                              !hasDigitalSignatureContent(approvalSupportSignature)
                            ) {
                              setApprovalSupportSignatureError(
                                t("workspace.signature.required", "Digital signature is required.")
                              );
                              return;
                            }

                            submitAction(selectedPaymentReceiptAction, {
                              decision,
                              comment: cleanRemark(comment),
                              checkDecisionRemark: false,
                              approvalSupportSignature: requiresPaymentReceiptSignature
                                ? approvalSupportSignature
                                : null,
                            });
                          }}
                          disabled={saving}
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

      {showMphlgChecklist && (
        <MphlgChecklistModal
          t={t}
          application={selectedRecord}
          onClose={() => setShowMphlgChecklist(false)}
        />
      )}

      {showManualApprovalLetterEditor && selectedRecord && (
        <ManualApprovalLetterEditorModal
          app={selectedRecord}
          t={t}
          saving={saving}
          onClose={() => setShowManualApprovalLetterEditor(false)}
          onSave={saveManualApprovalLetterDraft}
        />
      )}

      {showManualBillEditor && selectedRecord && (
        <ManualBillEditorModal
          app={selectedRecord}
          t={t}
          saving={saving}
          onClose={() => setShowManualBillEditor(false)}
          onSave={saveManualBillDraft}
        />
      )}

      {showManualReceiptEditor && selectedRecord && (
        <GeneratedDocumentReviewModal
          document={{
            title: t("workspace.payment.reviewGeneratedDocument", "Review"),
            reference: getApplicationReference(selectedRecord),
            html: getGeneratedOfficialReceiptDocumentHtml(selectedRecord),
            scale: 0.95,
            editable: true,
            kind: "receipt",
          }}
          t={t}
          saving={saving}
          onClose={() => setShowManualReceiptEditor(false)}
          onSave={saveManualReceiptDraft}
        />
      )}

      {showManualAdvertisementLicenseEditor && selectedRecord && (
        <GeneratedDocumentReviewModal
          document={{
            title: t("workspace.payment.reviewGeneratedDocument", "Review"),
            reference: getApplicationReference(selectedRecord),
            html: getGeneratedAdvertisementLicenseDocumentHtml(selectedRecord, t),
            scale: 0.9,
            editable: true,
            kind: "advertisement_license",
          }}
          t={t}
          saving={saving}
          onClose={() => setShowManualAdvertisementLicenseEditor(false)}
          onSave={saveManualAdvertisementLicenseDraft}
        />
      )}

      {licenseIssuedSuccessModal.open && (
        <LicenseIssuedSuccessModal
          t={t}
          onClose={closeLicenseIssuedSuccessModal}
        />
      )}

      {applicationRejectedModal.open && (
        <ApplicationRejectedModal
          defaultMessage={applicationRejectedModal.defaultMessage}
          messageKey={applicationRejectedModal.messageKey}
          reference={applicationRejectedModal.reference}
          t={t}
          onClose={closeApplicationRejectedModal}
        />
      )}

      {applicationAmendmentModal.open && (
        <ApplicationAmendmentModal
          defaultMessage={applicationAmendmentModal.defaultMessage}
          messageKey={applicationAmendmentModal.messageKey}
          reference={applicationAmendmentModal.reference}
          t={t}
          onClose={closeApplicationAmendmentModal}
        />
      )}

      {applicationApprovedModal.open && (
        <ApplicationApprovedModal
          defaultMessage={applicationApprovedModal.defaultMessage}
          messageKey={applicationApprovedModal.messageKey}
          reference={applicationApprovedModal.reference}
          t={t}
          onClose={closeApplicationApprovedModal}
        />
      )}

    </AdminDashboardLayout>
  );
}

function ApplicationRejectedModal({
  defaultMessage = "Application {reference} Has Been Rejected And Send To Applicant.",
  messageKey = "workspace.rejected.message",
  reference,
  t,
  onClose,
}) {
  const displayReference = reference || "Application";
  const message = t(
    messageKey,
    defaultMessage
  ).replace("{reference}", displayReference);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/35 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="application-rejected-title"
    >
      <div className="w-full max-w-[830px] rounded-lg border-2 border-slate-900 bg-white px-6 py-8 text-center shadow-xl sm:px-10">
        <img
          src="/red_x.png"
          alt=""
          className="mx-auto h-36 w-36 object-contain"
        />
        <h2
          id="application-rejected-title"
          className="mt-5 text-4xl font-extrabold uppercase tracking-normal text-black"
        >
          {t("workspace.rejected.title", "REJECTED!")}
        </h2>
        <p className="mt-5 text-2xl font-medium leading-snug text-black">
          {message}
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

function shouldShowApplicationRejectedModal(action, body) {
  if (!body || action?.requiresSubmittedReceipt || action?.key === "reject_receipt") {
    return false;
  }

  if (shouldShowApplicationAmendmentModal(action, body)) {
    return false;
  }

  return ["rejected", "incomplete"].includes(normalizeStatus(body.status));
}

function shouldShowMphlgRejectedModal(action, body) {
  return (
    Boolean(body) &&
    action?.buildPayload === buildApprovalWorkflowPayload &&
    normalizeStatus(body.status) === "rejected" &&
    body.form_data?.mphlg_gateway?.officer === "MPHLG" &&
    body.form_data?.mphlg_gateway?.status === "Returned to Applicant"
  );
}

function createClosedApplicationAmendmentModalState() {
  return {
    open: false,
    reference: "",
    redirectTo: "",
    messageKey: "workspace.amendment.message",
    defaultMessage: "Application {reference} has been sent to the applicant for amendment.",
  };
}

function ApplicationAmendmentModal({
  defaultMessage = "Application {reference} has been sent to the applicant for amendment.",
  messageKey = "workspace.amendment.message",
  reference,
  t,
  onClose,
}) {
  const displayReference = reference || "Application";
  const message = t(
    messageKey,
    defaultMessage
  ).replace("{reference}", displayReference);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/35 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="application-amendment-title"
    >
      <div className="w-full max-w-[830px] rounded-lg border-2 border-slate-900 bg-white px-6 py-8 text-center shadow-xl sm:px-10">
        <img
          src="/amendment.png"
          alt=""
          className="mx-auto h-36 w-36 object-contain"
        />
        <h2
          id="application-amendment-title"
          className="mt-5 text-4xl font-extrabold uppercase tracking-normal text-black"
        >
          {t("workspace.amendment.title", "AMENDMENT REQUIRED!")}
        </h2>
        <p className="mt-5 text-2xl font-medium leading-snug text-black">
          {message}
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

function shouldShowApplicationAmendmentModal(action, body) {
  return (
    Boolean(body) &&
    (
      (
        action?.buildPayload === buildIklTechnicalDecisionPayload &&
        normalizeStatus(body.status) === "rejected" &&
        body.form_data?.technical_review?.final_decision === "Not Supported"
      ) ||
      (
        action?.buildPayload === buildKuTechnicalReviewPayload &&
        normalizeStatus(body.status) === "technical_amendment" &&
        body.form_data?.technical_ku_review?.decision === "KU(IKL) Request Technical Amendment"
      ) ||
      shouldShowKbNotVerifyAmendmentModal(action, body) ||
      shouldShowApprovalSupportAmendmentModal(action, body)
    )
  );
}

function shouldShowKbNotVerifyAmendmentModal(action, body) {
  return (
    Boolean(body) &&
    action?.buildPayload === buildApprovalWorkflowPayload &&
    normalizeStatus(body.status) === "technical_review_completed" &&
    body.form_data?.kb_les_verification?.decision === "Not Verify" &&
    body.form_data?.correction_request?.target === "KU(IKL)"
  );
}

function shouldShowKbApprovalSupportModal(action, body) {
  return (
    Boolean(body) &&
    action?.buildPayload === buildApprovalWorkflowPayload &&
    normalizeStatus(body.status) === "management_review" &&
    body.form_data?.kb_les_verification?.decision === "Verify" &&
    body.form_data?.kb_les_verification?.status === "Verified" &&
    body.form_data?.management_recommendation?.status === "Pending TP(RES)/PGH Approval"
  );
}

function shouldShowApprovalSupportMphlgModal(action, body) {
  return (
    Boolean(body) &&
    action?.buildPayload === buildApprovalWorkflowPayload &&
    normalizeStatus(body.status) === "mphlg_processing" &&
    body.form_data?.management_recommendation?.status === "Approved" &&
    body.form_data?.mphlg_gateway?.status === "Pending MPHLG Approval"
  );
}

function shouldShowMphlgFinalApprovedModal(action, body) {
  return (
    Boolean(body) &&
    action?.buildPayload === buildApprovalWorkflowPayload &&
    normalizeStatus(body.status) === "approved" &&
    body.form_data?.mphlg_gateway?.officer === "MPHLG" &&
    body.form_data?.mphlg_gateway?.status === "Approved" &&
    body.form_data?.approval?.officer === "MPHLG" &&
    body.form_data?.approval?.status === "Approved"
  );
}

function shouldShowApprovalSupportAmendmentModal(action, body) {
  return (
    Boolean(body) &&
    action?.buildPayload === buildApprovalWorkflowPayload &&
    normalizeStatus(body.status) === "technical_review_completed" &&
    body.form_data?.management_recommendation?.status === "Rejected" &&
    body.form_data?.management_recommendation?.recommendation === "Not Support" &&
    body.form_data?.correction_request?.target === "KU(IKL)"
  );
}

function shouldShowTechnicalSiteVisitAmendmentModal(action, body) {
  return (
    Boolean(body) &&
    action?.buildPayload === buildKuTechnicalReviewPayload &&
    normalizeStatus(body.status) === "technical_amendment" &&
    body.form_data?.technical_ku_review?.decision === "KU(IKL) Request Technical Amendment"
  );
}

function createClosedApplicationApprovedModalState() {
  return {
    open: false,
    reference: "",
    redirectTo: "",
    messageKey: "workspace.approved.message",
    defaultMessage: "Application {reference} has been sent to Technical Review.",
  };
}

function ApplicationApprovedModal({
  defaultMessage = "Application {reference} has been sent to Technical Review.",
  messageKey = "workspace.approved.message",
  reference,
  t,
  onClose,
}) {
  const displayReference = reference || "Application";
  const message = t(
    messageKey,
    defaultMessage
  ).replace("{reference}", displayReference);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/35 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="application-approved-title"
    >
      <div className="w-full max-w-[830px] rounded-lg border-2 border-slate-900 bg-white px-6 py-8 text-center shadow-xl sm:px-10">
        <img
          src="/green_tick.png"
          alt=""
          className="mx-auto h-36 w-36 object-contain"
        />
        <h2
          id="application-approved-title"
          className="mt-5 text-4xl font-extrabold uppercase tracking-normal text-black"
        >
          {t("workspace.approved.title", "SUCCESS!")}
        </h2>
        <p className="mt-5 text-2xl font-medium leading-snug text-black">
          {message}
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

function shouldShowApplicationApprovedModal(action, body) {
  if (!body || action?.buildPayload !== buildIklScreeningPayload) {
    return false;
  }

  const recommendation = String(body.form_data?.auto_screening?.recommendation || "");
  return (
    normalizeStatus(body.status) === "technical_review" &&
    recommendation === "KU(IKL) Confirm - Send to Technical Units"
  );
}

function shouldShowInvoiceGeneratedModal(action, body) {
  return (
    Boolean(body) &&
    action?.requiresPaymentDocuments &&
    normalizeStatus(body.status) === "invoice_generated" &&
    body.form_data?.approval_letter?.status === "Sent to Applicant"
  );
}

function shouldShowTechnicalSiteVisitModal(action, body) {
  return (
    Boolean(body) &&
    action?.buildPayload === buildDepartmentTechnicalReviewPayload &&
    normalizeStatus(body.status) === "technical_site_visit"
  );
}

function shouldShowKuFinalCheckModal(action, body) {
  return (
    Boolean(body) &&
    action?.buildPayload === buildIklTechnicalDecisionPayload &&
    normalizeStatus(body.status) === "technical_review_completed" &&
    body.form_data?.technical_review?.final_decision === "Supported"
  );
}

function shouldShowKbVerificationModal(action, body) {
  return (
    Boolean(body) &&
    action?.buildPayload === buildKuTechnicalReviewPayload &&
    normalizeStatus(body.status) === "management_review" &&
    body.form_data?.technical_ku_review?.decision === "KU(IKL) Confirm - Send to KB(LES)"
  );
}

function LicenseIssuedSuccessModal({ t, onClose }) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/35 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="license-issued-success-title"
    >
      <div className="w-full max-w-[830px] rounded-lg border-2 border-slate-900 bg-white px-6 py-8 text-center shadow-xl sm:px-10">
        <img
          src="/green_tick.png"
          alt=""
          className="mx-auto h-36 w-36 object-contain"
        />
        <h2
          id="license-issued-success-title"
          className="mt-5 text-4xl font-extrabold uppercase tracking-normal text-black"
        >
          {t("workspace.license.issueSuccessTitle", "SUCCESS!")}
        </h2>
        <p className="mt-5 text-2xl font-medium text-black">
          {t("workspace.license.issueSuccessMessage", "License Has Been Issued!")}
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

function ManualApprovalLetterEditorModal({ app, t, saving, onClose, onSave }) {
  const editorRef = useRef(null);
  const manualLetter = app?.form_data?.approval_letter?.manual_letter || {};
  const initialBodyHtml =
    syncManualApprovalLetterAutoFields(
      manualLetter.editable_body_html || buildManualApprovalLetterTemplateBodyHtml(app),
      app
    );

  function handleSave() {
    const bodyHtml = editorRef.current?.innerHTML || initialBodyHtml;
    onSave?.(bodyHtml);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 py-6">
      <div className="max-h-[92vh] w-full max-w-[min(96vw,72rem)] overflow-hidden rounded-md bg-white shadow-xl">
        <style>{getManualApprovalLetterCss({ editor: true })}</style>
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <p className="text-[13px] font-semibold leading-5 text-slate-950">
              {t("workspace.payment.reviewApprovalLetter", "Review Approval Letter")}
            </p>
            <p className="mt-0.5 text-xs font-medium text-slate-500">
              {getApplicationReference(app)}
            </p>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2">
            <Button
              type="button"
              variant="primary"
              icon="save"
              className="min-h-9 px-3 py-1.5"
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? t("workspace.saving", "Saving...") : t("common.save", "Save")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              icon="close"
              className="min-h-9 w-9 px-0 py-0"
              disabled={saving}
              onClick={onClose}
              aria-label={t("common.close", "Close")}
              title={t("common.close", "Close")}
            />
          </div>
        </div>

        <div className="max-h-[calc(92vh-64px)] overflow-y-auto bg-slate-100 px-4 py-5">
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            className="manual-approval-letter-pages outline-none"
            dangerouslySetInnerHTML={{ __html: initialBodyHtml }}
          />
        </div>
      </div>
    </div>
  );
}

function buildManualApprovalLetterDocumentHtml(bodyHtml) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Approval Letter</title>
  <style>${getManualApprovalLetterCss()}</style>
</head>
<body>
  <div class="print-actions"><button onclick="window.print()">Print</button></div>
  <main class="manual-approval-letter-pages">
    ${bodyHtml || buildManualApprovalLetterTemplateBodyHtml()}
  </main>
</body>
</html>`;
}

function ManualBillEditorModal({ app, t, saving, onClose, onSave }) {
  const editorRef = useRef(null);
  const initialBodyHtmlRef = useRef(null);
  const manualBill = app?.form_data?.approval_letter?.manual_bill || {};

  if (initialBodyHtmlRef.current === null) {
    initialBodyHtmlRef.current = syncManualBillAutoFields(
      manualBill.editable_body_html || buildManualBillTemplateBodyHtml(app),
      app
    );
  }

  useEffect(() => {
    if (!editorRef.current || editorRef.current.dataset.initialized === "true") return;

    editorRef.current.innerHTML = initialBodyHtmlRef.current || "";
    editorRef.current.dataset.initialized = "true";
  }, []);

  function handleSave() {
    const bodyHtml = editorRef.current?.innerHTML || initialBodyHtmlRef.current || "";
    onSave?.(bodyHtml);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 py-6">
      <div className="max-h-[92vh] w-full max-w-[min(96vw,72rem)] overflow-hidden rounded-md bg-white shadow-xl">
        <style>{getManualBillCss({ editor: true })}</style>
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <p className="text-[13px] font-semibold leading-5 text-slate-950">
              {t("workspace.payment.reviewBill", "Review Bill")}
            </p>
            <p className="mt-0.5 text-xs font-medium text-slate-500">
              {getApplicationReference(app)}
            </p>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2">
            <Button
              type="button"
              variant="primary"
              icon="save"
              className="min-h-9 px-3 py-1.5"
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? t("workspace.saving", "Saving...") : t("common.save", "Save")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              icon="close"
              className="min-h-9 w-9 px-0 py-0"
              disabled={saving}
              onClick={onClose}
              aria-label={t("common.close", "Close")}
              title={t("common.close", "Close")}
            />
          </div>
        </div>

        <div className="max-h-[calc(92vh-64px)] overflow-y-auto bg-slate-100 px-4 py-5">
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            className="manual-bill-pages outline-none"
          />
        </div>
      </div>
    </div>
  );
}

function buildManualBillDocumentHtml(bodyHtml) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Bill</title>
  <style>${getManualBillCss()}</style>
</head>
<body>
  <div class="print-actions"><button onclick="window.print()">Print</button></div>
  <main class="manual-bill-pages">
    ${bodyHtml || buildManualBillTemplateBodyHtml()}
  </main>
</body>
</html>`;
}

function syncManualBillAutoFields(bodyHtml, app = null) {
  const nextBody = buildManualBillTemplateBodyHtml(app);
  const saved = String(bodyHtml || "").trim();
  if (!saved) return nextBody;

  return normalizeManualBillEditableMarkup(saved);
}

function normalizeManualBillEditableMarkup(bodyHtml) {
  return String(bodyHtml || "")
    .replaceAll(
      "<span>Nama</span><span>:</span><strong>",
      '<span contenteditable="false">Nama</span><span contenteditable="false">:</span><strong contenteditable="true">'
    )
    .replaceAll(
      "<span>Bahagian</span><span>:</span><strong>",
      '<span contenteditable="false">Bahagian</span><span contenteditable="false">:</span><strong contenteditable="true">'
    )
    .replace(
      /<footer>\s*<p>Notis ini adalah cetakan komputer\. Tiada tandatangan diperlukan\.<\/p>\s*<p>Sila abaikan surat ini sekiranya pembaharuan telah dibuat\.<\/p>\s*<\/footer>/,
      buildManualBillPaymentNoticeHtml()
    );
}

function buildManualBillPaymentNoticeHtml() {
  return `
      <footer>
        <p>Sila buat pembayaran dengan kadar segera sebelum lesen dikeluarkan.</p>
        <p>Untuk sebarang pertanyaan sila berhubung dengan Unit Iklan di talian 082-512955</p>
        <br />
        <p>Notis ini adalah cetakan komputer. Tiada tandatangan diperlukan.</p>
        <p>Sila abaikan surat ini sekiranya pembaharuan telah dibuat.</p>
      </footer>`;
}

function buildManualBillTemplateBodyHtml(app = null) {
  const details = getManualBillDetails(app);

  return `
    <section class="manual-bill-page">
      <div class="bill-form-code">DBKU/LES/56-09 (Pind. 4/26)</div>
      <header class="bill-header">
        <div class="bill-crest"><img src="/logo-dbku-black_white.png" alt="DBKU" /></div>
        <h1>DEWAN BANDARAYA KUCHING UTARA</h1>
        <p class="bill-unit">BAHAGIAN PELESENAN (UNIT IKLAN)</p>
        <p>Lot 3462 And Part Of Lot 706, Block 17, Salak Land District, Jalan Depo, 93050 Kuching, Sarawak</p>
        <p>Tel: 082-512955 <span>Faks: 082-495075</span></p>
      </header>

      <h2>BORANG KADAR BAYARAN LESEN IKLAN</h2>

      <p class="bill-intro">Berikut adalah kadar bayaran lesen bagi permohonan tuan/puan;</p>

      <div class="bill-field-grid">
        <div class="bill-line-row bill-wide">
          <span>Kepada</span><span>:</span><strong>${escapeHtml(details.recipientName)}</strong>
        </div>
        <div class="bill-line-row bill-wide bill-address">
          <span>Alamat</span><span>:</span><strong>${escapeHtml(details.addressLine)}</strong>
        </div>
        <div class="bill-line-row bill-wide bill-address-cont">
          <span></span><span></span><strong></strong>
        </div>
        <div class="bill-line-row">
          <span>No. Tel</span><span>:</span><strong>${escapeHtml(details.phone)}</strong>
        </div>
        <div class="bill-line-row">
          <span>Tarikh</span><span>:</span><strong>${escapeHtml(details.date)}</strong>
        </div>
        <div class="bill-line-row">
          <span>Tempoh Lesen</span><span>:</span><strong>${escapeHtml(details.licensePeriod)}</strong>
        </div>
        <div class="bill-line-row bill-ad-name">
          <span>Nama Iklan</span><span>:</span><strong>${escapeHtml(details.adName)}</strong>
        </div>
      </div>

      <table class="bill-rate-table">
        <thead>
          <tr>
            <th>BIL</th>
            <th>PERKARA</th>
            <th><span class="bill-amount-heading-top">JUMLAH</span><span>TUNAI/CEK<br />(RM)</span></th>
            <th>KOD AKAUN</th>
          </tr>
        </thead>
        <tbody>
          ${details.rows.map((row) => `
            <tr>
              <td>${row.no}</td>
              <td>${row.htmlLabel || escapeHtml(row.item)}</td>
              <td class="bill-amount">${escapeHtml(row.displayAmount)}</td>
              <td>${escapeHtml(row.accountCode)}</td>
            </tr>
          `).join("")}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2">JUMLAH</td>
            <td class="bill-amount">${escapeHtml(details.displayTotal)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>

      <div class="bill-signature-grid">
        <div>
          <p><strong>Disediakan oleh :</strong></p>
          <div class="bill-person-row"><span contenteditable="false">Nama</span><span contenteditable="false">:</span><strong contenteditable="true">${escapeHtml(details.preparedBy)}</strong></div>
          <div class="bill-person-row"><span contenteditable="false">Bahagian</span><span contenteditable="false">:</span><strong contenteditable="true">Unit Iklan, Bahagian Pelesenan<br />Dewan Bandaraya Kuching Utara</strong></div>
        </div>
        <div>
          <p><strong>Diluluskan oleh :</strong></p>
          <div class="bill-person-row"><span contenteditable="false">Nama</span><span contenteditable="false">:</span><strong contenteditable="true">${escapeHtml(details.approvedBy)}</strong></div>
          <div class="bill-person-row"><span contenteditable="false">Bahagian</span><span contenteditable="false">:</span><strong contenteditable="true">Unit Iklan, Bahagian Pelesenan<br />Dewan Bandaraya Kuching Utara</strong></div>
        </div>
      </div>

      ${buildManualBillPaymentNoticeHtml()}
    </section>
  `;
}

function buildGeneratedOfficialReceiptDocumentHtml(app = null) {
  const receiptNo = getGeneratedOfficialReceiptNumber(app);
  const dbkuLogoUrl = getPublicAssetUrl("/logo-dbku-black_white.png");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(getApplicationReference(app))} Official Receipt</title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #fff; color: #000; font-family: "Times New Roman", Times, serif; }
    .receipt-page { width: 210mm; height: 297mm; margin: 0 auto; background: #fff; padding: 10mm 1.5mm; overflow: hidden; }
    .receipt-content { width: 100%; transform: scale(.94); transform-origin: top center; }
    .receipt-header { position: relative; min-height: 27mm; }
    .crest { position: absolute; left: 0; top: 0; width: 43mm; display: flex; justify-content: center; }
    .crest img { width: 40mm; max-height: 31mm; object-fit: contain; }
    .heading { text-align: center; font-family: "Times New Roman", Times, serif; font-weight: 700; line-height: 1.03; }
    .receipt-header .heading { width: 126mm; margin: 0 auto; padding-top: 1mm; }
    .heading .mayor { font-size: 15pt; letter-spacing: 0; }
    .heading .commissioner { margin-top: .4mm; font-size: 11pt; }
    .heading .agency { margin-top: .5mm; font-size: 11pt; }
    .heading .address { margin-top: .5mm; font-size: 10pt; line-height: 1.08; }
    .copy { position: absolute; right: 0; top: 1mm; width: 52mm; text-align: right; font-size: 12pt; line-height: 1.15; }
    .copy-code { display: block; width: 100%; text-align: right; font-weight: 400; }
    .copy-label { display: block; margin-top: 8mm; font-weight: 700; }
    .title-row { display: grid; grid-template-columns: 1fr 45mm; align-items: baseline; margin: 0 0 5mm; padding-left: 43mm; }
    .title { text-align: center; font-size: 19pt; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
    .number { font-size: 19pt; font-weight: 800; white-space: nowrap; transform: translateX(4mm); }
    .number span { color: #f00; font-size: 19pt; letter-spacing: .06em; }
    .content-grid { display: grid; grid-template-columns: minmax(0,1fr) 109mm; gap: 10mm; align-items: start; }
    .meta { padding-top: 19mm; font-size: 11pt; font-weight: 700; }
    .dot-line { display: grid; grid-template-columns: auto 1fr; gap: 1.2mm; align-items: end; margin-bottom: 6mm; }
    .dots { border-bottom: 1.4px dotted #111; min-height: 6mm; }
    table { width: 100%; border-collapse: collapse; font-size: 10.5pt; font-weight: 700; }
    th, td { border: 1.25px solid #111; height: 5.8mm; padding: .5mm 1.2mm; }
    th { text-align: center; line-height: 1.1; }
    .amount-title { display: block; }
    .amount-columns { display: grid; grid-template-columns: 27mm 11mm; align-items: center; }
    td.amount { text-align: right; }
    .credit { width: 53mm; }
    .rm { width: 27mm; }
    .sen { width: 11mm; }
    .total-label { border: 0; text-align: right; font-size: 12.5pt; }
    .received { margin-top: 8mm; font-size: 11pt; font-weight: 700; line-height: 1.35; }
    .received-row { display: grid; grid-template-columns: auto 1fr; gap: 3mm; align-items: end; min-height: 6.6mm; }
    .solid-line { border-bottom: 1.25px solid #111; min-height: 5.6mm; line-height: 5mm; padding-left: 1.5mm; font-weight: 400; }
    .blank-line { border-bottom: 1.25px solid #111; height: 6.5mm; }
    [contenteditable="true"] { outline: none; box-shadow: none; }
    .footer { display: grid; grid-template-columns: 30mm minmax(0,1fr) 51mm; gap: 10mm; align-items: end; margin-top: 8mm; }
    .payment-mode { font-size: 11pt; font-weight: 800; line-height: 1.05; }
    .payment-mode .cash { display: inline-block; min-width: 23mm; border-bottom: 1.3px solid #111; text-align: center; }
    .bank-note { text-align: center; font: 700 9pt Arial, sans-serif; line-height: 1.2; transform: translateY(4mm); }
    .bank-note em { font-size: 9pt; }
    .signature { text-align: center; font-size: 11pt; font-weight: 700; transform: translateY(4mm); }
    .signature .line { border-bottom: 1.6px dotted #111; height: 6mm; margin-bottom: .5mm; }
    .print-actions { position: fixed; right: 18px; top: 18px; }
    .print-actions button { border: 1px solid #cbd5e1; background: #fff; border-radius: 6px; padding: 8px 12px; font: 700 13px Arial, sans-serif; cursor: pointer; }
    @media print {
      html, body { width: 210mm; height: 297mm; overflow: hidden; background: #fff; }
      .receipt-page { margin: 0; box-shadow: none; page-break-after: avoid; break-after: avoid; }
      .print-actions { display: none; }
    }
  </style>
</head>
<body>
  <div class="print-actions"><button onclick="window.print()">Print</button></div>
  <section class="receipt-page">
    <div class="receipt-content">
    <header class="receipt-header">
      <div class="crest"><img src="${escapeHtml(dbkuLogoUrl)}" alt="DBKU" /></div>
      <div class="heading">
        <div class="mayor">DATUK BANDAR KUCHING UTARA</div>
        <div class="commissioner">(THE COMMISSIONER OF THE CITY OF KUCHING NORTH)</div>
        <div class="agency">DEWAN BANDARAYA KUCHING UTARA</div>
        <div class="address">Bukit Siol, Jalan Semariang, Petra Jaya,<br />93050 Kuching, Sarawak, Malaysia</div>
      </div>
      <div class="copy"><span class="copy-code">ACC 3/88</span><span class="copy-label">Salinan Bahagian</span></div>
    </header>

    <div class="title-row">
      <div class="title">Official Receipt</div>
      <div class="number">No. <span>${escapeHtml(receiptNo)}</span></div>
    </div>

    <div class="content-grid">
      <div class="meta">
        <div class="dot-line"><span>Station</span><span class="dots">&nbsp;</span></div>
        <div class="dot-line"><span>Date</span><span class="dots">&nbsp;</span></div>
      </div>
      <table>
        <thead>
          <tr>
            <th class="credit">For credit of</th>
            <th colspan="2">
              <span class="amount-title">Amount</span>
              <span class="amount-columns"><span>RM</span><span>Sen</span></span>
            </th>
          </tr>
        </thead>
        <tbody>
          ${Array.from({ length: 5 })
            .map(() => `<tr><td>&nbsp;</td><td class="amount rm"></td><td class="amount sen"></td></tr>`)
            .join("")}
          <tr>
            <td class="total-label">TOTAL RM</td>
            <td class="amount rm"></td>
            <td class="amount sen"></td>
          </tr>
        </tbody>
      </table>
    </div>

    <section class="received">
      <div class="received-row"><span>RECEIVED from</span><span class="solid-line">&nbsp;</span></div>
      <div class="received-row"><span>the sum of Ringgit</span><span class="solid-line">&nbsp;</span></div>
      <div class="received-row"><span>and Sen</span><span class="solid-line">&nbsp;</span></div>
      <div class="blank-line"></div>
      <div class="blank-line"></div>
      <div class="blank-line"></div>
    </section>

    <footer class="footer">
      <div class="payment-mode"><span class="cash">CASH</span><br />CHEQUE NO.<br /><span style="display:inline-block;transform:translateY(3mm);font-size:6pt;font-weight:700;">PNMB,Kch.</span></div>
      <div class="bank-note">Pembayaran ini hanya dianggap sah setelah cek diperakui oleh bank<br /><em>Payment valid only upon clearance of cheques</em></div>
      <div class="signature"><div class="line"></div>b.p. Datuk Bandar</div>
    </footer>
    </div>
  </section>
</body>
</html>`;
}

function getGeneratedOfficialReceiptRows(details = {}) {
  const rows = Array.isArray(details.rows) ? details.rows : [];
  return rows
    .filter((row) => Number.isFinite(parseCurrencyAmount(row.amount)) && parseCurrencyAmount(row.amount) > 0)
    .map((row) => ({
      item: row.item || "",
      amount: parseCurrencyAmount(row.amount),
    }))
    .slice(0, 5);
}

function getGeneratedOfficialReceiptTotal(rows = []) {
  return rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
}

function splitRinggitSen(value) {
  const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
  const fixed = amount.toFixed(2);
  const [ringgit, sen] = fixed.split(".");
  return {
    ringgit: Number(ringgit || 0).toLocaleString("en-MY"),
    sen: sen || "00",
  };
}

function formatGeneratedOfficialReceiptAmountText(value) {
  const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
  return `Ringgit Malaysia ${formatManualApprovalLetterAmount(amount)} sahaja`;
}

function getGeneratedOfficialReceiptNumber(app = null) {
  const existing =
    app?.form_data?.approval_letter?.manual_receipt?.receipt_no ||
    app?.form_data?.payment?.official_receipt_no;
  if (existing) return String(existing);

  const referenceDigits = String(getApplicationReference(app) || app?.reference_no || "")
    .match(/(\d+)$/)?.[1];
  return String(referenceDigits || app?.id || 1).padStart(6, "0");
}

function formatManualApprovalLetterDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "";

  const months = [
    "Januari",
    "Februari",
    "Mac",
    "April",
    "Mei",
    "Jun",
    "Julai",
    "Ogos",
    "September",
    "Oktober",
    "November",
    "Disember",
  ];

  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function syncManualApprovalLetterAutoFields(bodyHtml, app = null) {
  const dateHtml = `<p>Tarikh: ${escapeHtml(formatManualApprovalLetterDate(new Date()))}</p>`;
  const addressHtml = `<p class="address-block">${buildManualApprovalLetterAddressHtml(app)}</p>`;
  const advertisementDetailsHtml = buildManualApprovalLetterAdvertisementDetailsHtml(app);
  const paymentDetailsHtml = buildManualApprovalLetterPaymentDetailsHtml(app);

  return String(bodyHtml || "")
    .replace(/<p>Tarikh:[\s\S]*?<\/p>/, dateHtml)
    .replace(/<p class="address-block">[\s\S]*?<\/p>/, addressHtml)
    .replace(/<table class="info-table">[\s\S]*?<\/table>/, advertisementDetailsHtml)
    .replace(/<table class="payment-table">[\s\S]*?<\/table>/, paymentDetailsHtml)
    .replace(/\s*<p><strong>\(RAMZI BIN ABDILLAH\)<\/strong><\/p>/gi, "")
    .replace(/<p>Pengarah<\/p>/gi, "<p><strong>Pengarah</strong></p>")
    .replace(/<p>Dewan Bandaraya Kuching Utara<\/p>/gi, "<p><strong>Dewan Bandaraya Kuching Utara</strong></p>");
}

function buildManualApprovalLetterAddressHtml(app = null) {
  return getManualApprovalLetterAddressLines(app).map(escapeHtml).join("<br />");
}

function getManualApprovalLetterAddressLines(app = null) {
  const step1 = app?.form_data?.step_1 || {};
  const submittingPerson = app?.form_data?.step_3 || {};
  const projectName = titleCaseAddressLine(
    submittingPerson.org_name ||
      submittingPerson.name ||
      step1.location_name ||
      step1.premise_name ||
      step1.building_name ||
      (!isGeneratedInstallationTitle(step1.project_name) ? step1.project_name : "") ||
      (!isGeneratedInstallationTitle(app?.project_name) ? app?.project_name : "") ||
      ""
  );
  const fallbackParts = splitAddressParts(
    step1.locality_address ||
      step1.map_address ||
      getApplicationLocation(app) ||
      ""
  );

  const line1 = projectName || titleCaseAddressLine(fallbackParts[0] || "");
  const line2 = titleCaseAddressLine(
    step1.unit_floor_block ||
      step1.unit_floor ||
      step1.unit_floor_block_name ||
      step1.unit ||
      step1.address_1 ||
      submittingPerson.postal_address ||
      submittingPerson.address ||
      fallbackParts.find((part) => !isSameAddressText(part, line1)) ||
      ""
  );
  const line3 = titleCaseAddressLine(
      step1.street_residential_area ||
      step1.street_address ||
      step1.address_2 ||
      submittingPerson.address_2 ||
      fallbackParts.find((part) => ![line1, line2].some((line) => isSameAddressText(part, line))) ||
      ""
  );
  const postcode = step1.postcode || submittingPerson.postcode || "";
  const city = step1.city || submittingPerson.city || "";
  const state = step1.state || submittingPerson.state || "";
  const postcodeCityState = [
    [postcode, city].filter(Boolean).join(" "),
    state,
  ].filter(Boolean).join(", ");
  const fallbackTail = fallbackParts
    .filter((part) => ![line1, line2, line3].some((line) => isSameAddressText(part, line)))
    .filter((part) => !/^malaysia$/i.test(part));
  const line4 = titleCaseAddressLine(
    postcodeCityState ||
      fallbackTail.slice(-2).join(", ")
  );

  const lines = [line1, line2, line3, line4].filter(Boolean);
  return lines.length > 0 ? lines.slice(0, 4) : ["[Alamat Surat Menyurat]"];
}

function splitAddressParts(value) {
  return String(value || "")
    .split(/,|\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function titleCaseAddressLine(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\b([a-z])/g, (match) => match.toUpperCase())
    .replace(/\b(Led|Dbku|Mphlg|Rm)\b/g, (match) => match.toUpperCase())
    .replace(/\s+/g, " ");
}

function isGeneratedInstallationTitle(value) {
  return /^\s*(?:\d+\.\s*)?installation\s+of\b/i.test(String(value || ""));
}

function isSameAddressText(left, right) {
  return String(left || "").trim().toLowerCase() === String(right || "").trim().toLowerCase();
}

function buildManualApprovalLetterAdvertisementDetailsHtml(app = null) {
  const details = getManualApprovalLetterAdvertisementDetails(app);

  return `
      <table class="info-table">
        <thead>
          <tr>
            <th>Perkara</th>
            <th colspan="2">Maklumat</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Jenis Iklan</td><td class="info-colon">:</td><td>${escapeHtml(details.adType)}</td></tr>
          <tr><td>Nama Iklan</td><td class="info-colon">:</td><td>${escapeHtml(details.adName)}</td></tr>
          <tr><td>Lokasi Iklan</td><td class="info-colon">:</td><td>${escapeHtml(details.adLocation)}</td></tr>
        </tbody>
      </table>`;
}

function getManualApprovalLetterAdvertisementDetails(app = null) {
  const step1 = app?.form_data?.step_1 || {};
  const submittingPerson = app?.form_data?.step_3 || {};
  const rows = getManualApprovalLetterAdvertisementRows(app);
  const generatedAdName = rows
    .map((row) => buildTechnicalProjectNameLine("ms", row))
    .filter(Boolean)
    .join(", ");

  return {
    adType: rows.length > 0
      ? rows.map(formatManualApprovalLetterAdvertisementType).filter(Boolean).join(", ")
      : titleCaseAddressLine(getApplicationType(app, "ms")),
    adName: generatedAdName
      ? titleCaseAddressLine(generatedAdName)
      : titleCaseAddressLine(
        submittingPerson.org_name ||
        step1.advertisement_name ||
        step1.ad_name ||
        step1.project_title ||
        step1.project_name ||
        getProjectName(app) ||
        ""
      ),
    adLocation: buildManualApprovalLetterLocationLine(app),
  };
}

function buildManualApprovalLetterLocationLine(app = null) {
  const step1 = app?.form_data?.step_1 || {};
  const submittingPerson = app?.form_data?.step_3 || {};
  let location =
    step1.locality_address ||
    step1.map_address ||
    getApplicationLocation(app) ||
    "";
  const postcode = String(step1.postcode || submittingPerson.postcode || "").trim();
  const city = String(step1.city || submittingPerson.city || "").trim();

  if (!postcode || !location || new RegExp(`\\b${escapeRegExp(postcode)}\\b`).test(location)) {
    return titleCaseAddressLine(location);
  }

  if (city && new RegExp(`\\b${escapeRegExp(city)}\\b`, "i").test(location)) {
    location = location.replace(
      new RegExp(`\\b${escapeRegExp(city)}\\b`, "i"),
      `${postcode} $&`
    );
  } else {
    location = `${location}, ${postcode}`;
  }

  return titleCaseAddressLine(location);
}

function getManualApprovalLetterAdvertisementRows(app = null) {
  const step1 = app?.form_data?.step_1 || {};
  const selectedTypes = getApplicationTypeOptionsFromApplication(app);
  const primaryType = selectedTypes[0] || "open_space";
  const fallbackSubtype =
    getApplicationSubtypeFromApplication(app) ||
    getDefaultApplicationSubtype(primaryType);

  return getTechnicalAdvertisementRowsFromStep1(step1, primaryType, fallbackSubtype);
}

function formatManualApprovalLetterAdvertisementType(row = {}) {
  const rowType =
    normalizeApplicationTypeOptions(row.applicationType || row.application_type)[0] ||
    "";
  const subtype = normalizeApplicationSubtype(row.subtype, rowType);
  const customLabel = String(row.customLabel || row.custom_label || "").trim();
  const advertisementLabel =
    getTechnicalAdvertisementOptionLabel(customLabel, "ms") ||
    getApplicationSubtypeLabel(rowType, subtype, "ms") ||
    customLabel;

  return advertisementLabel;
}

function buildManualApprovalLetterPaymentDetailsHtml(app = null) {
  const payment = getManualApprovalLetterPaymentDetails(app);

  return `
      <table class="payment-table">
        <thead>
          <tr>
            <th>BUTIR BAYARAN</th>
            <th>TEMPOH LESEN BERKUAT KUASA</th>
            <th>JUMLAH (RM)</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Yuran Lesen Iklan</td><td>${escapeHtml(payment.licensePeriod)}</td><td>${escapeHtml(payment.licenseFee)}</td></tr>
          <tr><td>Deposit</td><td>Per Permohonan</td><td>${escapeHtml(payment.deposit)}</td></tr>
          <tr><td>Yuran Pemprosesan Lesen</td><td>Per Permohonan</td><td>${escapeHtml(payment.processingFee)}</td></tr>
          <tr class="total-row"><td>JUMLAH KESELURUHAN</td><td></td><td>${escapeHtml(payment.total)}</td></tr>
        </tbody>
      </table>`;
}

function getManualApprovalLetterPaymentDetails(app = null) {
  const technicalSite = getManualApprovalLetterTechnicalReportSite(app);
  const rows = Array.isArray(technicalSite.advertisement_rows)
    ? calculateTechnicalFeeRows(technicalSite.advertisement_rows)
    : [];
  const calculatedLicenseFee = rows.reduce(
    (sum, row) => sum + parseTechnicalNumber(row.fee_total),
    0
  );
  const licenseFee =
    parseMemoAmount(technicalSite.license_fee_calculation) ||
    parseMemoAmount(technicalSite.fee_total) ||
    calculatedLicenseFee;
  const applicationCount = getManualApprovalLetterPaymentApplicationCount(rows);
  const depositPerApplication =
    parseMemoAmount(technicalSite.deposit_calculation) ||
    TECHNICAL_FIXED_DEPOSIT;
  const processingFeePerApplication =
    parseMemoAmount(technicalSite.processing_fee_calculation) ||
    TECHNICAL_PROCESSING_FEE;
  const deposit = depositPerApplication * applicationCount;
  const processingFee = processingFeePerApplication * applicationCount;
  const calculatedRoundedTotal = rows.reduce(
    (sum, row) => sum + parseTechnicalNumber(row.payable_total),
    0
  );
  const total =
    calculatedRoundedTotal ||
    roundTechnicalPayableToFiveSen(licenseFee + deposit + processingFee).roundedAmount;

  return {
    licensePeriod: getManualApprovalLetterLicensePeriod(app),
    licenseFee: formatManualApprovalLetterAmount(licenseFee),
    deposit: formatManualApprovalLetterAmount(deposit),
    processingFee: formatManualApprovalLetterAmount(processingFee),
    total: formatManualApprovalLetterAmount(total),
  };
}

function getManualBillDetails(app = null) {
  const submittingPerson = app?.form_data?.step_3 || {};
  const payment = getManualApprovalLetterPaymentDetails(app);
  const applicantName = titleCaseAddressLine(
    getRegisteredApplicantName(app) ||
      getApplicantName(app) ||
      submittingPerson.org_name ||
      submittingPerson.name ||
      ""
  );
  const addressLines = getManualApprovalLetterAddressLines(app);
  const advertisementDetails = getManualApprovalLetterAdvertisementDetails(app);
  const phone =
    submittingPerson.mobile_no ||
    submittingPerson.mobile ||
    submittingPerson.telephone_no ||
    submittingPerson.office_no ||
    submittingPerson.tel_no ||
    "";
  const licenseFee = parseCurrencyAmount(payment.licenseFee);
  const deposit = parseCurrencyAmount(payment.deposit);
  const processingFee = parseCurrencyAmount(payment.processingFee);
  const total = parseCurrencyAmount(payment.total);
  const rows = getManualBillRateRows({ licenseFee, deposit, processingFee });

  return {
    recipientName: applicantName || "-",
    addressLine: addressLines.join(", "),
    phone,
    date: formatManualApprovalLetterDate(new Date()),
    licensePeriod: payment.licensePeriod,
    adName: advertisementDetails.adName || getProjectName(app) || "-",
    preparedBy: "",
    approvedBy: "",
    rows,
    total,
    displayTotal: formatManualApprovalLetterAmount(total),
  };
}

function getManualBillRateRows({ licenseFee = 0, deposit = 0, processingFee = 0 } = {}) {
  const rows = [
    { no: 1, item: "Yuran Tandanama Perniagaan", amount: 0, accountCode: "H02021118-25" },
    { no: 2, item: "Yuran Lesen Iklan", amount: licenseFee, accountCode: "H02021118-25" },
    { no: 3, item: "Yuran Lesen Iklan - Prepayment", amount: 0, accountCode: "L04021019-25" },
    { no: 4, item: "Yuran Gegantung", amount: 0, accountCode: "H02021118-25" },
    { no: 5, item: "Yuran Kain Rentang", amount: 0, accountCode: "H02021118-25" },
    { no: 6, item: "Yuran Giant Banner", htmlLabel: "Yuran <em>Giant Banner</em>", amount: 0, accountCode: "H02021118-25" },
    { no: 7, item: "Pelekat", amount: 0, accountCode: "H02021118-25" },
    { no: 8, item: "Sewa Pagar", amount: 0, accountCode: "H02021118-25" },
    { no: 9, item: "Yuran Pemprosesan Lesen", amount: processingFee, accountCode: "H02021121-25" },
    { no: 10, item: "Deposit Gegantung", amount: 0, accountCode: "CC-DP(L04030201-25)" },
    { no: 11, item: "Deposit Kain Rentang", amount: 0, accountCode: "CC-DP(L04030201-25)" },
    { no: 12, item: "Deposit Giant Banner", htmlLabel: "Deposit <em>Giant Banner</em>", amount: 0, accountCode: "CC-DP(L04030201-25)" },
    { no: 13, item: "Deposit Billboard", htmlLabel: "Deposit <em>Billboard</em>", amount: deposit, accountCode: "CC-DP(L04030201-25)" },
  ];

  return rows.map((row) => ({
    ...row,
    displayAmount: parseCurrencyAmount(row.amount) > 0
      ? formatManualApprovalLetterAmount(row.amount)
      : "",
  }));
}

function getManualApprovalLetterPaymentApplicationCount(rows = []) {
  const count = (Array.isArray(rows) ? rows : []).filter((row) =>
    row?.subtype ||
    row?.customLabel ||
    row?.custom_label ||
    row?.displayType ||
    row?.display_type ||
    row?.applicationType ||
    row?.application_type
  ).length;

  return Math.max(count, 1);
}

function getManualApprovalLetterTechnicalReportSite(app = null) {
  const report = buildDecisionLogTechnicalReport(app);
  if (report?.technicalSite) return report.technicalSite;

  const savedTechnicalSite = app?.form_data?.technical_site_visit || {};
  return getReviewTechnicalSite(savedTechnicalSite, app);
}

function getManualApprovalLetterLicensePeriod(app = null) {
  const license = app?.form_data?.license || {};
  const validityYears = Number(license.validity_years) || 1;
  const startDate = new Date();
  const endDate = addCalendarYears(startDate, validityYears);

  return `${formatManualApprovalLetterDate(startDate)} hingga ${formatManualApprovalLetterDate(endDate)}`;
}

function formatManualApprovalLetterAmount(value) {
  return Number(value || 0).toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildManualApprovalLetterTemplateBodyHtml(app = null) {
  const letterDate = formatManualApprovalLetterDate(new Date());
  const projectAddressHtml = buildManualApprovalLetterAddressHtml(app);

  return `
    <section class="manual-approval-letter-page page-one">
      <div class="letter-top">
        <div>
          <p>Bil. Tuan:</p>
          <p>Bil. Kami:</p>
        </div>
        <p>Tarikh: ${escapeHtml(letterDate)}</p>
      </div>

      <p class="address-block">${projectAddressHtml}</p>
      <p>Tuan/Puan</p>

      <h1>KELULUSAN PERMOHONAN LESEN PENGIKLANAN</h1>

      <p>Dengan segala hormatnya perkara di atas dirujuk.</p>

      <p class="numbered"><span>2.</span><span>Sukacita dimaklumkan bahawa permohonan tuan/puan bagi pemasangan iklan seperti berikut adalah <strong>DILULUSKAN:</strong></span></p>

      ${buildManualApprovalLetterAdvertisementDetailsHtml(app)}

      <p class="numbered"><span>3.</span><span>Sehubungan itu, tuan/puan adalah dikehendaki menjelaskan bayaran lesen dalam tempoh <strong>EMPAT BELAS (14) HARI BEKERJA</strong> dari tarikh surat ini dikeluarkan. Pembayaran boleh dibuat di Kaunter Bahagian Pelesenan, Aras 1, DBKU@Depo, Jalan Depo, 93050 Kuching atau melalui <em>Electronic Fund Transfer</em> ke akaun berikut:</span></p>

      <div class="bank-details">
        <p>Bank: Bank Islam Malaysia Berhad</p>
        <p>Nama Akaun: Dewan Bandaraya Kuching Utara</p>
        <p>No. Akaun: 11013010028881</p>
      </div>

      ${buildManualApprovalLetterPaymentDetailsHtml(app)}

      <p class="numbered"><span>4.</span><span>Lesen hanya akan dikeluarkan setelah bayaran diterima sepenuhnya oleh Dewan Bandaraya Kuching Utara (DBKU). Bersama ini juga, disertakan syarat-syarat lesen (Lampiran A) yang hendaklah dipatuhi sepanjang tempoh lesen berkuat kuasa. Kegagalan mematuhi mana-mana syarat yang ditetapkan, DBKU berhak mengambil tindakan seperti termaktub di dalam undang-undang dan garis panduan yang berkuat kuasa.</span></p>

      <p class="numbered"><span>5.</span><span>Sekiranya tuan/puan memerlukan keterangan lanjut, sila hubungi Unit Iklan di talian 082-512955.</span></p>

      <p>Sekian. Terima kasih.</p>

      <p class="motto"><strong><em>"AN HONOUR TO SERVE"</em><br /><em>"TOGETHER WE CARE"</em></strong></p>

      <div class="signature-block">
        <p><strong>Pengarah</strong></p>
        <p><strong>Dewan Bandaraya Kuching Utara</strong></p>
      </div>
    </section>

    <section class="manual-approval-letter-page page-two">
      <div class="appendix-title">
        <p><strong>LAMPIRAN A</strong></p>
        <h2>SYARAT-SYARAT LESEN PENGIKLANAN</h2>
        <p><strong><em>The Local Authorities (Advertisement) By-Laws, 2012</em></strong></p>
      </div>

      <p><strong>Pemegang lesen hendaklah mematuhi syarat-syarat berikut:</strong></p>

      <h3>1. Pematuhan Lesen</h3>
      <ul>
        <li>Lesen ini hanya sah bagi iklan, lokasi dan tempoh yang diluluskan oleh Dewan Bandaraya Kuching Utara (DBKU).</li>
        <li>Lesen ini tidak boleh dipindah milik kepada mana-mana individu atau syarikat lain tanpa kelulusan bertulis daripada DBKU.</li>
        <li>Sebarang perubahan terhadap reka bentuk, kandungan, saiz, struktur, lokasi atau kaedah pemasangan hendaklah mendapat kelulusan bertulis DBKU terlebih dahulu.</li>
      </ul>

      <h3>2. Keselamatan Struktur</h3>
      <ul>
        <li>Pemegang lesen bertanggungjawab memastikan struktur iklan sentiasa kukuh dan selamat.</li>
        <li>Semua struktur hendaklah direka bentuk, dibina dan disenggara oleh pihak yang kompeten serta mematuhi keperluan teknikal yang berkaitan.</li>
        <li>Sekiranya DBKU mendapati struktur membahayakan orang awam atau harta benda, pemegang lesen hendaklah mengambil tindakan pembaikan atau menanggalkan struktur tersebut dengan serta-merta.</li>
      </ul>

      <h3>3. Penyelenggaraan</h3>
      <ul>
        <li>Pemegang lesen hendaklah memastikan iklan sentiasa bersih, kemas, tidak rosak, tidak pudar, tidak koyak dan berada dalam keadaan baik sepanjang tempoh lesen.</li>
        <li>Sebarang kerosakan hendaklah dibaiki dalam tempoh yang diarahkan oleh DBKU.</li>
      </ul>

      <h3>4. Iklan LED / Digital</h3>
      <ul>
        <li>Paparan LED hendaklah dikendalikan supaya tidak mengganggu pengguna jalan raya.</li>
        <li>Tahap kecerahan hendaklah diselaraskan mengikut keadaan persekitaran dan tidak menyebabkan silau.</li>
        <li>Kandungan iklan tidak boleh menggunakan kesan visual, animasi atau pertukaran imej yang boleh mengganggu tumpuan pemandu.</li>
        <li>DBKU boleh mengarahkan pelarasan tahap pencahayaan atau kandungan paparan pada bila-bila masa demi keselamatan awam.</li>
      </ul>

      <h3>5. Tempoh Lesen</h3>
      <ul>
        <li>Lesen adalah sah hanya bagi tempoh yang dinyatakan.</li>
        <li>Permohonan pembaharuan hendaklah dikemukakan sebelum tamat tempoh lesen.</li>
        <li>Kegagalan memperbaharui lesen menyebabkan lesen terbatal secara automatik.</li>
      </ul>
    </section>

    <section class="manual-approval-letter-page page-three">
      <h3>6. Deposit</h3>
      <ul>
        <li>Deposit yang dikenakan adalah sebagai jaminan pematuhan syarat lesen.</li>
        <li>Deposit boleh digunakan oleh DBKU bagi menampung kos menanggalkan iklan, membersihkan tapak atau membaiki kerosakan sekiranya pemegang lesen gagal mematuhi arahan DBKU.</li>
        <li>Baki deposit (jika ada) hanya akan dipulangkan setelah DBKU berpuas hati bahawa semua syarat lesen telah dipatuhi.</li>
      </ul>

      <h3>7. Pengalihan dan Penanggalan</h3>
      <ul>
        <li>Pemegang lesen hendaklah menanggalkan iklan apabila lesen tamat, dibatalkan, diarahkan oleh DBKU atau apabila iklan tidak lagi dibenarkan.</li>
        <li>Semua kos penanggalan dan pemulihan tapak hendaklah ditanggung oleh pemegang lesen.</li>
        <li>Sekiranya pemegang lesen gagal menanggalkan iklan dalam tempoh yang ditetapkan, DBKU boleh menanggalkan iklan tersebut dan menuntut semua kos yang terlibat daripada pemegang lesen.</li>
      </ul>

      <h3>8. Penguatkuasaan</h3>
      <ul>
        <li>DBKU berhak menggantung atau membatalkan lesen sekiranya berlaku pelanggaran mana-mana syarat lesen atau peruntukan undang-undang.</li>
        <li>DBKU boleh mengeluarkan notis pembaikan, pengalihan atau penanggalan iklan pada bila-bila masa.</li>
        <li>Pemegang lesen hendaklah mematuhi semua arahan yang dikeluarkan oleh DBKU.</li>
      </ul>

      <h3>9. Liabiliti</h3>
      <ul>
        <li>Pemegang lesen bertanggungjawab sepenuhnya terhadap sebarang kerosakan, kemalangan, kecederaan atau tuntutan yang berpunca daripada pemasangan, penyelenggaraan atau pengendalian iklan.</li>
        <li>DBKU tidak bertanggungjawab terhadap sebarang kehilangan atau kerosakan ke atas iklan yang dipasang.</li>
      </ul>

      <h3>10. Peruntukan Am</h3>
      <ul>
        <li>Lesen ini tertakluk kepada <em>The Local Authorities (Advertisement) By-Laws, 2012</em> serta mana-mana garis panduan atau arahan yang dikeluarkan oleh DBKU dari semasa ke semasa.</li>
        <li>DBKU berhak meminda syarat-syarat lesen apabila perlu demi kepentingan awam, keselamatan dan kesejahteraan bandar.</li>
        <li>Kegagalan mematuhi mana-mana syarat lesen ini boleh menyebabkan lesen digantung atau dibatalkan tanpa menjejaskan tindakan penguatkuasaan di bawah undang-undang yang berkuat kuasa.</li>
      </ul>
    </section>
  `;
}

function getManualApprovalLetterCss({ editor = false } = {}) {
  return `
    @page { size: 21.0cm 29.7cm; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; background: ${editor ? "#f1f5f9" : "#ffffff"}; color: #111; font-family: Arial, sans-serif; }
    .manual-approval-letter-pages { width: fit-content; margin: 0 auto; }
    .manual-approval-letter-page {
      width: 21.0cm;
      height: 29.7cm;
      margin: 0 auto 14px;
      padding: 18mm 24mm 20mm;
      background: #fff;
      color: #111;
      font-family: "Times New Roman", Times, serif !important;
      font-size: 9.5pt !important;
      line-height: 1.32;
      box-shadow: ${editor ? "0 1px 8px rgba(15, 23, 42, 0.18)" : "none"};
      page-break-after: always;
      position: relative;
    }
    .manual-approval-letter-page * {
      font-family: Arial, sans-serif !important;
      font-size: 9.5pt !important;
    }
    .manual-approval-letter-page::after {
      content: "Notis ini adalah cetakan komputer. Tiada tandatangan diperlukan.\\A Sila abaikan surat ini sekiranya pembaharuan telah dibuat.";
      position: absolute;
      left: 24mm;
      right: 24mm;
      bottom: 10mm;
      text-align: center;
      font-size: 8pt !important;
      font-style: italic;
      line-height: 1.2;
      white-space: pre-line;
      color: #334155;
    }
    .manual-approval-letter-page p { margin: 0 0 12px; }
    .letter-top { display: grid; grid-template-columns: 1fr 44mm; gap: 16mm; align-items: start; margin-bottom: 22px; }
    .letter-top p { margin-bottom: 2px; }
    .address-block { margin: 18px 0 26px; }
    h1 { margin: 0 0 26px; font-size: 9.5pt; line-height: 1.2; font-weight: 800; }
    .numbered { display: grid; grid-template-columns: 17mm 1fr; gap: 0; text-align: justify; }
    .info-table, .payment-table { width: 100%; border-collapse: collapse; margin: 18px 0 22px; }
    .info-table th, .payment-table th { border-bottom: 1.5px solid #111; padding: 0 8px 2px 0; text-align: left; font-size: 9.5pt; }
    .info-table td, .payment-table td { padding: 1px 8px 1px 0; vertical-align: top; }
    .info-table th:first-child,
    .info-table td:first-child { width: 24%; }
    .info-table th:nth-child(2) { width: 76%; }
    .info-table td.info-colon { width: 3%; padding-right: 0; text-align: left; }
    .info-table td:nth-child(3) { width: 73%; }
    .bank-details { margin: 26px 0 26px; text-align: center; }
    .bank-details p { margin: 0 0 2px; }
    .payment-table { margin-top: 18px; }
    .payment-table th:nth-child(1) { width: 33%; }
    .payment-table th:nth-child(2) { width: 47%; }
    .payment-table th:nth-child(3),
    .payment-table td:nth-child(3) { width: 20%; text-align: right; padding-right: 0; }
    .payment-table .total-row td { font-weight: 700; }
    .motto { margin-top: 24px; }
    .signature-block { margin-top: 24px; }
    .signature-block p { margin: 0 0 2px; }
    .appendix-title { margin: 0 0 42px; text-align: center; }
    .appendix-title h2 { margin: 20px 0; font-size: 9.5pt; letter-spacing: .2px; }
    .manual-approval-letter-page h3 { margin: 20px 0 14px; font-size: 9.5pt; font-weight: 700; }
    .manual-approval-letter-page ul { list-style: none; margin: 0 0 24px 16mm; padding: 0; }
    .manual-approval-letter-page li { position: relative; margin: 0 0 8px; text-align: justify; }
    .manual-approval-letter-page li::before { content: "\\2713"; position: absolute; left: -10mm; top: 0; }
    .page-two { padding-top: 18mm; }
    .page-three { padding-top: 18mm; }
    .print-actions { position: fixed; right: 18px; top: 18px; z-index: 10; }
    .print-actions button { border: 1px solid #cbd5e1; background: white; border-radius: 6px; padding: 8px 12px; font-weight: 700; cursor: pointer; }
    @media print {
      body { background: #fff; }
      .manual-approval-letter-pages { width: auto; margin: 0; }
      .manual-approval-letter-page { margin: 0; box-shadow: none; }
      .print-actions { display: none; }
    }
  `;
}

function getManualBillCss({ editor = false } = {}) {
  return `
    @page { size: 21.0cm 29.7cm; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; background: ${editor ? "#f1f5f9" : "#ffffff"}; color: #111; font-family: Arial, sans-serif; }
    .manual-bill-pages { width: fit-content; margin: 0 auto; }
    .manual-bill-page {
      position: relative;
      width: 21.0cm;
      height: 29.7cm;
      margin: 0 auto 14px;
      padding: 10mm 13mm 8mm;
      background: #fff;
      border: 1.5px solid #111;
      color: #111;
      font-family: Arial, sans-serif !important;
      font-size: 8.2pt !important;
      line-height: 1.08;
      box-shadow: ${editor ? "0 1px 8px rgba(15, 23, 42, 0.18)" : "none"};
      page-break-after: always;
    }
    .manual-bill-page * {
      font-family: Arial, sans-serif !important;
      font-size: 8.2pt !important;
    }
    .bill-form-code {
      position: absolute;
      top: 5mm;
      right: 8mm;
      font-size: 8.5pt !important;
    }
    .bill-header {
      text-align: center;
      padding-top: 0;
    }
    .bill-crest {
      display: inline-flex;
      height: 26mm;
      width: 42mm;
      align-items: center;
      justify-content: center;
    }
    .bill-crest img {
      max-height: 26mm;
      max-width: 42mm;
      object-fit: contain;
    }
    .bill-header h1 {
      margin: .4mm 0 1.2mm;
      font-size: 16pt !important;
      font-weight: 900;
      letter-spacing: .02em;
      line-height: 1.05;
    }
    .bill-header p {
      margin: 0;
      line-height: 1.15;
    }
    .bill-header .bill-unit {
      margin-top: .5mm;
      font-size: 10pt !important;
      letter-spacing: .02em;
    }
    .bill-header span {
      margin-left: 30mm;
    }
    .manual-bill-page h2 {
      margin: 2mm auto 4mm;
      width: 146mm;
      border: 1.5px solid #111;
      text-align: center;
      font-family: "Times New Roman", Times, serif !important;
      font-size: 14pt !important;
      font-weight: 900;
      letter-spacing: .03em;
      line-height: 1.12;
    }
    .bill-intro {
      margin: 0 0 1mm;
      font-size: 9pt !important;
    }
    .bill-field-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 1.4mm 10mm;
      margin-bottom: 3mm;
    }
    .bill-line-row {
      display: grid;
      grid-template-columns: 25mm 5mm minmax(0, 1fr);
      align-items: end;
      min-height: 4.8mm;
    }
    .bill-line-row strong {
      min-height: 4mm;
      border-bottom: 1.2px solid #111;
      font-weight: 400;
      overflow: hidden;
      white-space: nowrap;
    }
    .bill-wide {
      grid-column: 1 / -1;
    }
    .bill-wide strong {
      white-space: normal;
    }
    .bill-ad-name strong {
      line-height: 1.15;
      overflow: visible;
      white-space: normal;
    }
    .bill-address-cont span {
      visibility: hidden;
    }
    .bill-rate-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin-top: 1.5mm;
      font-size: 8.2pt !important;
    }
    .bill-rate-table th,
    .bill-rate-table td {
      border: 1.4px solid #111;
      padding: 1.15mm 1.6mm;
      vertical-align: middle;
    }
    .bill-rate-table th {
      text-align: center;
      font-weight: 700;
      line-height: 1.1;
    }
    .bill-rate-table th span {
      display: block;
    }
    .bill-amount-heading-top {
      margin: -1.15mm -1.6mm 0.8mm;
      padding-bottom: 0.6mm;
      border-bottom: 1.4px solid #111;
    }
    .bill-rate-table th:nth-child(1),
    .bill-rate-table td:nth-child(1) {
      width: 28mm;
      text-align: center;
    }
    .bill-rate-table th:nth-child(2),
    .bill-rate-table td:nth-child(2) {
      width: 61mm;
    }
    .bill-rate-table th:nth-child(3),
    .bill-rate-table td:nth-child(3) {
      width: 37mm;
      text-align: center;
    }
    .bill-rate-table th:nth-child(4),
    .bill-rate-table td:nth-child(4) {
      width: 52mm;
    }
    .bill-rate-table td.bill-amount {
      text-align: right;
      padding-right: 4mm;
      white-space: nowrap;
    }
    .bill-rate-table tfoot td {
      font-weight: 700;
      text-align: center;
    }
    .bill-rate-table tfoot td:last-child {
      background: #c9c9c9;
    }
    .bill-signature-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 22mm;
      margin-top: 4mm;
    }
    .bill-signature-grid p {
      margin: 0 0 4mm;
    }
    .bill-person-row {
      display: grid;
      grid-template-columns: 27mm 5mm minmax(0, 1fr);
      align-items: start;
      min-height: 4.8mm;
    }
    .bill-person-row strong {
      display: block;
      min-width: 34mm;
      min-height: 4.2mm;
      font-weight: 400;
      line-height: 1.18;
      white-space: normal;
      overflow-wrap: normal;
    }
    .manual-bill-page footer {
      margin-top: 4mm;
      font-style: italic;
      font-weight: 600;
      color: #111;
    }
    .manual-bill-page footer p {
      margin: 0;
      font-size: 8.2pt !important;
    }
    .manual-bill-page footer p:nth-child(-n+2) {
      text-align: left;
      font-size: 6pt !important;
    }
    .manual-bill-page footer br {
      display: block;
      content: "";
      margin: 0;
    }
    .manual-bill-page footer p:nth-child(4) {
      margin-top: 10mm;
    }
    .manual-bill-page footer p:nth-child(n+4) {
      text-align: center;
      font-weight: 400;
      color: #334155;
      font-size: 7.5pt !important;
    }
    .print-actions { position: fixed; right: 18px; top: 18px; z-index: 10; }
    .print-actions button { border: 1px solid #cbd5e1; background: white; border-radius: 6px; padding: 8px 12px; font-weight: 700; cursor: pointer; }
    @media print {
      @page { size: A4; margin: 0; }
      body { background: #fff; }
      .manual-bill-pages { width: auto; margin: 0; }
      .manual-bill-page { margin: 0; box-shadow: none; page-break-after: auto; break-after: auto; }
      .print-actions { display: none; }
    }
  `;
}

export async function printHtmlDocument(html, title) {
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

function MphlgChecklistModal({ t, application, onClose }) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const checklistHtml = useMemo(() => getMphlgChecklistDocumentHtml(application), [application]);

  async function handleDownload() {
    setDownloadError("");
    setDownloading(true);

    try {
      await printHtmlDocument(
        checklistHtml,
        `${getApplicationReference(application)} MPHLG Checklist`
      );
    } catch (error) {
      console.error(error);
      setDownloadError(
        t(
          "workspace.mphlg.checklistDownloadFailed",
          "Unable to download the checklist. Please try again."
        )
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 py-6">
      <div className="max-h-[92vh] w-full max-w-[min(96vw,72rem)] overflow-hidden rounded-md bg-white shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <p className="text-[13px] font-semibold leading-5 text-slate-950">
              {t("workspace.mphlg.checklistTitle", "View Check List")}
            </p>
            <p className="mt-0.5 text-xs font-medium text-slate-500">
              {getApplicationReference(application)} - A4 - 3 pages
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              icon="download"
              className="min-h-8 px-2.5 py-1"
              disabled={downloading}
              onClick={handleDownload}
            >
              {downloading ? t("common.downloading", "Downloading...") : t("common.download", "Download")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              icon="close"
              className="min-h-8 px-2.5 py-1"
              onClick={onClose}
            >
              {t("common.close", "Close")}
            </Button>
          </div>
        </div>

        <div className="h-[calc(92vh-64px)] overflow-hidden bg-slate-100">
          {downloadError && (
            <p className="mx-auto mt-3 max-w-[860px] rounded border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              {downloadError}
            </p>
          )}
          <iframe
            title={t("workspace.mphlg.checklistTitle", "View Check List")}
            srcDoc={checklistHtml}
            className="h-full w-full border-0"
          />
        </div>
      </div>
    </div>
  );
}

function getMphlgChecklistDocumentHtml(application) {
  const title = `${getApplicationReference(application)} MPHLG Checklist`;
  const logoUrl = getPublicAssetUrl("/MPHLG.png");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>${getMphlgChecklistDocumentCss()}</style>
</head>
<body>
  <main class="mphlg-checklist-pages">
    ${buildMphlgChecklistPageOneHtml(logoUrl)}
    ${buildMphlgChecklistPageTwoHtml(logoUrl)}
    ${buildMphlgChecklistPageThreeHtml(logoUrl)}
  </main>
</body>
</html>`;
}

function getMphlgChecklistDocumentCss() {
  return `
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #eef2f7;
      color: #000;
      font-family: Arial, Helvetica, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .mphlg-checklist-pages {
      width: 210mm;
      margin: 0 auto;
    }
    .mphlg-page {
      position: relative;
      width: 210mm;
      height: 297mm;
      margin: 12px auto;
      padding: 12mm 16mm;
      overflow: hidden;
      background: #fff;
      page-break-after: always;
      break-after: page;
      box-shadow: 0 0 0 1px #cbd5e1, 0 10px 24px rgba(15, 23, 42, .12);
      font-size: 10pt;
      line-height: 1.25;
    }
    .mphlg-page:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .mphlg-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      font-size: 7pt;
      font-weight: 700;
      font-style: italic;
      line-height: 1.15;
    }
    .mphlg-logo {
      width: 14mm;
      height: 14mm;
      object-fit: contain;
      object-position: left top;
      transform: translateY(-3mm);
    }
    .mphlg-form-code {
      padding-top: 1mm;
      text-align: right;
    }
    .mphlg-title {
      margin: 0;
      text-align: center;
      font-size: 12pt;
      line-height: 1.22;
      font-weight: 700;
      text-transform: uppercase;
    }
    .mphlg-title em {
      font-style: italic;
      font-weight: 700;
    }
    .mphlg-fields {
      display: grid;
      grid-template-columns: 42mm 4mm 1fr;
      gap: 3.2mm 0;
      width: 96mm;
      margin: 10mm 0 0 0;
      font-size: 10pt;
      font-weight: 700;
    }
    .mphlg-fields .spaced { margin-top: 6mm; }
    .mphlg-section-title {
      margin: 9mm 0 0;
      font-size: 10pt;
      font-weight: 700;
      line-height: 1.25;
    }
    .mphlg-section-title .underline { text-decoration: underline; }
    .mphlg-section-title .normal { font-weight: 400; }
    .mphlg-section-title .indent {
      padding-left: 5mm;
      font-weight: 400;
    }
    .mphlg-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10pt;
      line-height: 1.14;
      margin-top: 3mm;
    }
    .mphlg-table th,
    .mphlg-table td {
      border: 1px solid #64748b;
      padding: .9mm 1.6mm;
      vertical-align: middle;
    }
    .mphlg-table th {
      background: #f1f5f9;
      text-align: center;
      font-weight: 700;
    }
    .mphlg-table .applicant-check { background: #f8e6d9; }
    .mphlg-table .ministry-check { background: #d5f4dc; }
    .mphlg-table .center { text-align: center; }
    .mphlg-table .bold { font-weight: 700; }
    .mphlg-table em { font-style: italic; }
    .mphlg-table .normal { font-weight: 400; }
    .mphlg-technical-item {
      display: grid;
      grid-template-columns: 7mm minmax(0, 1fr);
      column-gap: 1mm;
      align-items: start;
    }
    .mphlg-technical-subtitle {
      display: block;
      font-style: italic;
      font-weight: 400;
    }
    .mphlg-checkbox {
      display: inline-block;
      width: 11mm;
      height: 6mm;
      border: 1.7px solid #64748b;
      vertical-align: middle;
    }
    .mphlg-category-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10pt;
      line-height: 1.18;
    }
    .mphlg-category-table td {
      border: 1px solid #94a3b8;
      padding: .8mm 1.6mm;
      font-style: italic;
    }
    .mphlg-category-table .heading {
      background: #f1f5f9;
      font-weight: 700;
    }
    .mphlg-category-table .tick-cell {
      width: 34mm;
      background: #fff;
    }
    .mphlg-box {
      height: 24mm;
      border: 1px solid #64748b;
      margin-top: 3mm;
    }
    .mphlg-box.large { height: 65mm; }
    .mphlg-box.xlarge { height: 65mm; }
    .mphlg-signature-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 4mm;
      font-size: 9pt;
      line-height: 1.25;
    }
    .mphlg-signature-table td {
      border: 1px solid #64748b;
      padding: 1.2mm 2mm;
      vertical-align: top;
    }
    .mphlg-signature-table .head {
      height: 5mm;
      padding-top: .6mm;
      padding-bottom: .6mm;
      text-align: center;
      font-weight: 700;
      vertical-align: middle;
    }
    .mphlg-signature-table .signature {
      height: 15mm;
      text-align: center;
      font-weight: 400;
    }
    .mphlg-signature-table.three {
      font-size: 10pt;
      line-height: 1.18;
    }
    .mphlg-signature-table.three .signature { height: 34mm; }
    .mphlg-page-number {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 3mm;
      text-align: center;
      font-size: 11pt;
      font-weight: 600;
    }
    @media print {
      html, body { background: #fff; }
      .mphlg-page {
        margin: 0;
        box-shadow: none;
      }
    }
  `;
}

function buildMphlgChecklistHeaderHtml(logoUrl) {
  return `
    <header class="mphlg-header">
      <img class="mphlg-logo" src="${escapeHtml(logoUrl)}" alt="MPHLG" />
      <div class="mphlg-form-code">
        <div>BORANG PERMOHONAN PERTAPAKAN</div>
        <div>(ADVERTISEMENT BILLBOARD)</div>
      </div>
    </header>
  `;
}

function buildMphlgChecklistPageOneHtml(logoUrl) {
  const rows = [
    ["1", "Borang Permohonan Pertapakan", "Siting Form Application"],
    ["2", "Salinan dokumen status hak milik tanah", "Extract of Title"],
    ["3", "Pelan Lokality", "Locality Plan"],
  ];
  const technicalRows = [
    ["A.", "Pelan Lantai beserta ukuran", "Layout Plan with dimension"],
    ["B.", "Lukisan Keratan Rentas beserta ukuran dan spesifikasi", "Front and side elevation drawing with dimension and specification"],
    ["C.", "Pengiraan rekabentuk struktur pengiklanan yang dicadangkan diperakui oleh PE/QP", "Structural Design and Calculation certified by PE/QP"],
    ["D.", "Gambar ilustrasi/ perspektif", "Illustration/ Perspective view"],
  ];

  return `
    <section class="mphlg-page">
      ${buildMphlgChecklistHeaderHtml(logoUrl)}
      <div class="mphlg-title">
        <div>SENARAI SEMAK</div>
        <div>PERMOHONAN KELULUSAN PERTAPAKAN STRUKTUR PAPAN IKLAN</div>
        <div><em>(ADVERTISEMENT BILLBOARD)</em></div>
      </div>
      <div class="mphlg-fields">
        <span>Agensi Pemohon</span><span>:</span><span></span>
        <span>Tajuk Permohonan</span><span>:</span><span></span>
        <span class="spaced">Tarikh Permohonan</span><span class="spaced">:</span><span></span>
      </div>
      <div class="mphlg-section-title">
        <div>A. <span class="underline">BUTIRAN PERMOHONAN</span> <span class="normal">(perlu di isi oleh agensi pemohon)</span></div>
        <div class="indent">*Dokumen/lukisan perlu dihantar sebanyak 3 set</div>
      </div>
      <table class="mphlg-table">
        <thead>
          <tr>
            <th rowspan="2" style="width:9mm;">Bil.</th>
            <th rowspan="2">Perkara</th>
            <th colspan="2" class="applicant-check" style="width:36mm;">Sila Tanda /<br />(Senarai semak agensi pemohon)</th>
            <th colspan="2" class="ministry-check" style="width:36mm;">Senarai semak<br />Kementerian</th>
          </tr>
          <tr>
            <th class="applicant-check">Ada</th>
            <th class="applicant-check">Tiada</th>
            <th class="ministry-check">Ada</th>
            <th class="ministry-check">Tiada</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(([no, label, sub]) => `
            <tr>
              <td class="center bold">${escapeHtml(no)}</td>
              <td class="bold">${escapeHtml(label)}<br /><em class="normal">(${escapeHtml(sub)})</em></td>
              ${buildMphlgChecklistCheckboxCellsHtml()}
            </tr>
          `).join("")}
          <tr>
            <td class="center bold">4</td>
            <td colspan="5" class="bold">Lukisan/ Dokumen Teknikal <em class="normal">(Technical Drawing/ Document):</em></td>
          </tr>
          ${technicalRows.map(([letter, label, sub], index) => `
            <tr>
              ${index === 0 ? `<td rowspan="${technicalRows.length}"></td>` : ""}
              <td>
                <div class="mphlg-technical-item">
                  <strong>${escapeHtml(letter)}</strong>
                  <span>
                    ${escapeHtml(label)}
                    <em class="mphlg-technical-subtitle">(${escapeHtml(sub)})</em>
                  </span>
                </div>
              </td>
              ${buildMphlgChecklistCheckboxCellsHtml()}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </section>
  `;
}

function buildMphlgChecklistPageTwoHtml(logoUrl) {
  return `
    <section class="mphlg-page">
      ${buildMphlgChecklistHeaderHtml(logoUrl)}
      <div class="mphlg-section-title" style="margin-top:0;">
        <div>B. <span class="underline">BUTIRAN TEKNIKAL</span> <span class="normal">(perlu di isi oleh agensi pemohon)</span></div>
      </div>
      <table class="mphlg-table">
        <tbody>
          <tr>
            <th style="width:9mm;">Bil.</th>
            <th style="width:28mm;">Perkara</th>
            <th style="width:44mm;">Catatan</th>
            <th>Ulasan/Komen<br /><em class="normal">(berdasarkan Advertisement Guideline /<br />Advertisement by Laws)</em></th>
          </tr>
          <tr>
            <td class="center bold">1</td>
            <td class="center">Jenis/ Kategori</td>
            <td colspan="2">${buildMphlgChecklistCategoryTableHtml()}</td>
          </tr>
          ${[
            ["Saiz ", "(LxWxH)"],
            ["Jenis Bahan/ Material", ""],
            ["Lokasi Pemasangan", ""],
          ].map(([label, suffix], index) => `
            <tr style="height:10mm;">
              <td class="center bold">${index + 2}</td>
              <td>${escapeHtml(label)}${suffix ? `<strong>${escapeHtml(suffix)}</strong>` : ""}</td>
              <td></td>
              <td></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      <div class="mphlg-section-title">
        <div>C. <span class="underline">REKOMENDASI</span> <span class="normal">(perlu di isi oleh agensi pemohon)</span></div>
      </div>
      <div class="mphlg-box"></div>
      <div class="mphlg-section-title">
        <div>D. <span class="underline">PENGESAHAN</span> <span class="normal">(perlu di isi oleh agensi pemohon)</span></div>
      </div>
      ${buildMphlgTwoSignatureTableHtml()}
      <div class="mphlg-page-number">2</div>
    </section>
  `;
}

function buildMphlgChecklistPageThreeHtml(logoUrl) {
  return `
    <section class="mphlg-page">
      ${buildMphlgChecklistHeaderHtml(logoUrl)}
      <div class="mphlg-section-title" style="margin-top:0;">
        <div>E. <span class="underline">KOMEN/ ULASAN</span><span class="normal">(untuk diisi Kementerian (penyemak) sahaja)</span></div>
      </div>
      <div class="mphlg-box large"></div>
      <div class="mphlg-section-title">
        <div>F. <span class="underline">REKOMENDASI</span><span class="normal">(untuk diisi Kementerian (pengesah) sahaja)</span></div>
      </div>
      <div class="mphlg-box xlarge"></div>
      ${buildMphlgThreeSignatureTableHtml()}
      <div class="mphlg-page-number">3</div>
    </section>
  `;
}

function buildMphlgChecklistCheckboxCellsHtml() {
  return Array.from({ length: 4 })
    .map(() => `<td class="center"><span class="mphlg-checkbox"></span></td>`)
    .join("");
}

function buildMphlgChecklistCategoryTableHtml() {
  const rows = [
    ["Landed Advertisement", true],
    ["Gantry"],
    ["Unipole/Minipole"],
    ["Free Standing Billboard"],
    ["Free Standing panel/ LED"],
    ["Directional sign"],
    ["Directory sign"],
    ["Advertisement on Building", true],
    ["Projecting Sign"],
    ["Roof Top Sign"],
    ["Advertisement at Overhead Bridge"],
    ["Advertisement mounted on the wall of a building (Wall Sign / Building Wrap, etc)"],
    ["Advertisement at Pillar / Column Wrap"],
    ["Advertisement at Street Furniture (Bus Shelter, etc)"],
    ["Lukisan Mural (Mural Art)"],
  ];

  return `
    <table class="mphlg-category-table">
      <tbody>
        ${rows.map(([label, heading]) => `
          <tr>
            <td${heading ? ' colspan="2" class="heading"' : ""}>${escapeHtml(label)}</td>
            ${heading ? "" : '<td class="tick-cell"></td>'}
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function buildMphlgTwoSignatureTableHtml() {
  return `
    <table class="mphlg-signature-table">
      <tbody>
        <tr>
          <td class="head" style="width:50%;">Disediakan oleh:</td>
          <td class="head" style="width:50%;">Disahkan oleh:</td>
        </tr>
        <tr>
          <td class="signature">Tandatangan:</td>
          <td class="signature">Tandatangan:</td>
        </tr>
        <tr>
          <td>Nama :<br />Jawatan :<br />Tarikh :</td>
          <td>Nama :<br />Jawatan :<br />Tarikh :</td>
        </tr>
      </tbody>
    </table>
  `;
}

function buildMphlgThreeSignatureTableHtml() {
  return `
    <table class="mphlg-signature-table three">
      <tbody>
        <tr>
          <td class="head">Disediakan oleh:</td>
          <td class="head">Disemak oleh:</td>
          <td class="head">Disahkan oleh:</td>
        </tr>
        <tr>
          <td class="signature">Tandatangan:</td>
          <td class="signature">Tandatangan:</td>
          <td class="signature">Tandatangan:</td>
        </tr>
        <tr>
          <td>Nama :<br />Jawatan :<br />Tarikh :</td>
          <td>Nama :<br />Jawatan :<br />Tarikh :</td>
          <td>Nama :<br />Jawatan :<br />Tarikh :</td>
        </tr>
      </tbody>
    </table>
  `;
}

function MphlgSupportingDocumentsTable({
  rows,
  t,
  saving,
  error,
  onAdd,
  onUpdate,
  onRemove,
  onFileChange,
  onRemoveFile,
}) {
  const documents = Array.isArray(rows) ? rows : [];

  return (
    <section className="overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-l-4 border-[#18b36b] bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold uppercase leading-5 text-slate-700">
            {t(
              "workspace.mphlg.supportingDocumentsTitle",
              "Other Relevant Supporting Documents (If Any)"
            )}
          </h2>
          <span className="group relative inline-flex">
            <button
              type="button"
              className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-[#18b36b] bg-white text-[12px] font-bold leading-none text-[#00843d] focus:outline-none focus:ring-2 focus:ring-[#18b36b] focus:ring-offset-1"
              aria-label={t(
                "workspace.mphlg.supportingDocumentsHelp",
                "PDF only. Maximum file size 15MB."
              )}
            >
              i
            </button>
            <span className="pointer-events-none absolute left-7 top-1/2 z-20 hidden w-56 -translate-y-1/2 rounded border border-slate-200 bg-white px-3 py-2 text-xs font-semibold normal-case leading-5 text-slate-700 shadow-lg group-hover:block group-focus-within:block">
              {t(
                "workspace.mphlg.supportingDocumentsHelp",
                "PDF only. Maximum file size 15MB."
              )}
            </span>
          </span>
        </div>
        <button
          type="button"
          onClick={onAdd}
          disabled={saving}
          className="rounded bg-[#18b36b] px-3 py-1.5 text-[10px] font-bold leading-4 text-white shadow-sm transition hover:bg-[#128a53] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t("workspace.mphlg.addDocument", "+ Add Document")}
        </button>
      </div>
      {error && (
        <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-[12px] font-semibold leading-5 text-red-700">
          {error}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-[11px]">
          <thead className="bg-[#f1f5f4] text-left font-bold text-slate-700">
            <tr>
              <MphlgDocumentTableHead className="w-[44px]">#</MphlgDocumentTableHead>
              <MphlgDocumentTableHead>
                {t("workspace.mphlg.documentDescription", "Description")}
              </MphlgDocumentTableHead>
              <MphlgDocumentTableHead className="w-[110px]">
                {t("workspace.mphlg.documentFormat", "Format")}
              </MphlgDocumentTableHead>
              <MphlgDocumentTableHead className="w-[280px]">
                {t("workspace.mphlg.documentAttachment", "Attachment")}
              </MphlgDocumentTableHead>
              <MphlgDocumentTableHead className="w-[150px] text-center">
                {t("common.action", "Action")}
              </MphlgDocumentTableHead>
            </tr>
          </thead>
          <tbody>
            {documents.length === 0 ? (
              <tr className="bg-[#e4f4df]">
                <MphlgDocumentTableCell colSpan={5} center>
                  {t("workspace.mphlg.noDocumentRecord", "--No record--")}
                </MphlgDocumentTableCell>
              </tr>
            ) : (
              documents.map((row, index) => (
                <tr
                  key={`mphlg-supporting-${index}`}
                  className={index % 2 === 0 ? "bg-[#e4f4df]" : "bg-white"}
                >
                  <MphlgDocumentTableCell>{String.fromCharCode(65 + index)}</MphlgDocumentTableCell>
                  <MphlgDocumentTableCell>
                    <input
                      type="text"
                      value={row.description || ""}
                      onChange={(event) => onUpdate(index, "description", event.target.value)}
                      className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-[11px] outline-none focus:border-[#18b36b] focus:ring-1 focus:ring-[#18b36b]"
                      placeholder={t(
                        "workspace.mphlg.documentDescriptionPlaceholder",
                        "Enter document description"
                      )}
                    />
                  </MphlgDocumentTableCell>
                  <MphlgDocumentTableCell>
                    <span className="font-semibold text-slate-700">
                      {row.format || "PDF"}
                    </span>
                  </MphlgDocumentTableCell>
                  <MphlgDocumentTableCell>
                    <MphlgDocumentAttachment attachment={row.attachment} t={t} />
                  </MphlgDocumentTableCell>
                  <MphlgDocumentTableCell center>
                    <MphlgDocumentActions
                      index={index}
                      attachment={row.attachment}
                      t={t}
                      saving={saving}
                      onFileChange={onFileChange}
                      onRemoveFile={onRemoveFile}
                      onRemove={onRemove}
                    />
                  </MphlgDocumentTableCell>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MphlgDocumentAttachment({ attachment, t }) {
  if (!attachment) {
    return (
      <div className="space-y-1">
        <p className="text-slate-500">
          {t("workspace.mphlg.noAttachment", "No attachment")}
        </p>
        <p className="text-[10px] font-semibold text-slate-500">
          {t("workspace.mphlg.attachmentMaxSize", "Maximum file size 15MB. PDF only.")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <p className="break-all font-semibold text-[#00843d]">
        {attachment.name || attachment.title || "attachment.pdf"}
      </p>
      {attachment.size ? (
        <p className="text-[10px] text-slate-500">
          {formatMphlgDocumentFileSize(attachment.size)}
        </p>
      ) : null}
      <p className="text-[10px] font-semibold text-slate-500">
        {t("workspace.mphlg.attachmentMaxSize", "Maximum file size 15MB. PDF only.")}
      </p>
    </div>
  );
}

function MphlgDocumentActions({
  index,
  attachment,
  t,
  saving,
  onFileChange,
  onRemoveFile,
  onRemove,
}) {
  const hasAttachment = Boolean(getPaymentDocumentSource(attachment));

  return (
    <div className="flex items-center justify-center gap-2">
      <label
        className={`inline-flex h-8 w-8 items-center justify-center rounded bg-[#18b36b] text-white shadow-sm hover:bg-[#128a53] ${
          saving ? "cursor-not-allowed opacity-60" : "cursor-pointer"
        }`}
        title={t("workspace.mphlg.upload", "Upload")}
      >
        <span className="material-symbols-outlined text-[18px] leading-none">
          upload
        </span>
        <input
          type="file"
          className="hidden"
          accept=".pdf,application/pdf"
          disabled={saving}
          onChange={(event) => {
            const file = event.target.files?.[0];
            onFileChange(index, file);
            event.target.value = "";
          }}
        />
      </label>

      <button
        type="button"
        onClick={() =>
          downloadPaymentDocument(attachment, attachment?.name || "MPHLG Supporting Document", t)
        }
        disabled={!hasAttachment || saving}
        className="inline-flex h-8 w-8 items-center justify-center rounded border border-emerald-200 bg-white text-[#00843d] shadow-sm hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
        title={t("workspace.mphlg.download", "Download")}
      >
        <span className="material-symbols-outlined text-[18px] leading-none">
          file_download
        </span>
      </button>

      <button
        type="button"
        onClick={() => (hasAttachment ? onRemoveFile(index) : onRemove(index))}
        disabled={saving}
        className="inline-flex h-8 w-8 items-center justify-center rounded bg-red-500 text-white shadow-sm hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
        title={
          hasAttachment
            ? t("workspace.mphlg.removeFile", "Remove file")
            : t("workspace.mphlg.deleteRow", "Delete row")
        }
      >
        {hasAttachment ? "X" : (
          <span className="material-symbols-outlined text-[18px] leading-none">
            delete
          </span>
        )}
      </button>
    </div>
  );
}

function MphlgDocumentTableHead({ children, className = "" }) {
  return (
    <th className={`border border-slate-200 px-3 py-2 font-bold ${className}`}>
      {children}
    </th>
  );
}

function MphlgDocumentTableCell({ children, center = false, colSpan }) {
  return (
    <td
      colSpan={colSpan}
      className={`border border-slate-200 px-3 py-2 align-top ${
        center ? "text-center align-middle" : "text-left"
      }`}
    >
      {children}
    </td>
  );
}

function getMphlgSupportingDocuments(app) {
  const rows = app?.form_data?.mphlg_gateway?.supporting_documents;
  return normalizeMphlgSupportingDocumentRows(rows);
}

function normalizeMphlgSupportingDocumentRows(rows) {
  return Array.isArray(rows)
    ? rows
        .map((row) => ({
          description: row?.description || "",
          format: row?.format || "PDF",
          attachment: row?.attachment || null,
        }))
        .filter((row) => row.description || row.attachment)
    : [];
}

function formatMphlgDocumentFileSize(value) {
  const bytes = Number(value || 0);
  if (!bytes) return "";

  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  return `${(bytes / 1024).toFixed(1)} KB`;
}

function getMphlgSupportingDocumentValidationMessage(file, t) {
  if (!file) return "";

  const isPdf =
    file.type === "application/pdf" ||
    String(file.name || "").toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    return t(
      "workspace.mphlg.supportingDocumentPdfRequired",
      "Please upload PDF format only."
    );
  }

  if (Number(file.size || 0) > MPHLG_SUPPORTING_DOCUMENT_MAX_FILE_SIZE) {
    return t(
      "workspace.mphlg.supportingDocumentMaxSize",
      "File size exceeds 15MB. Please upload a PDF file up to 15MB."
    );
  }

  return "";
}

function normalizeMphlgSupportingDocumentAttachment(applicationId, uploaded, file) {
  const documentId = uploaded?.document_id || uploaded?.id || uploaded?.pk || "";

  return {
    ...(uploaded || {}),
    document_id: documentId || uploaded?.document_id,
    id: uploaded?.id || documentId,
    name: uploaded?.name || uploaded?.filename || file?.name || "attachment.pdf",
    size: uploaded?.size || file?.size || 0,
    url:
      uploaded?.url ||
      uploaded?.file_url ||
      (documentId ? getApplicationDocumentUrl(applicationId, documentId) : ""),
  };
}

export function WorkspaceDecisionLogReport({ app, t, language = "en" }) {
  const [selectedLog, setSelectedLog] = useState(null);
  const logs = buildWorkspaceDecisionLogRows(app, t);

  return (
    <>
      <section className="rounded-md border border-slate-300 bg-white">
        {logs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <colgroup>
                <col className="w-[28%]" />
                <col className="w-[52%]" />
                <col className="w-[20%]" />
              </colgroup>
              <thead className="bg-white text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="border-b border-slate-200 px-4 py-2">
                    {t("common.department", "Department")}
                  </th>
                  <th className="whitespace-nowrap border-b border-slate-200 px-4 py-2">
                    {t("common.date", "Date")}
                  </th>
                  <th className="whitespace-nowrap border-b border-slate-200 px-4 py-2 text-right">
                    {t("common.action", "Action")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="align-middle">
                    <td className="whitespace-normal px-4 py-2 font-semibold leading-5 text-slate-900">
                      {formatDecisionLogDepartmentLabel(log.department, language)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-slate-600">
                      {formatCompactDateTime(log.date)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          icon="visibility"
                          className="min-h-8 px-2.5 py-1 text-sm"
                          onClick={() => setSelectedLog(log)}
                        >
                          {t("common.view", "View")}
                        </Button>
                      </div>
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

      {selectedLog && (
        <DecisionLogTemplateModal
          log={selectedLog}
          t={t}
          language={language}
          onClose={() => setSelectedLog(null)}
        />
      )}
    </>
  );
}

function buildDecisionLogSnapshotHtml(log, language = "en") {
  const labels = getDecisionLogDownloadLabels(language);
  const signatureSource = getDecisionLogSignatureSource(log.signature);
  const decisionHtml = log.decision
    ? `
      <div class="decision-field">
        <div class="field-label">${escapeHtml(labels.decision)}</div>
        <div class="readonly-input">${escapeHtml(formatDecisionLogDecision(log.decision, language))}</div>
      </div>
    `
    : "";

  return `
    <div class="recorded-template-download">
      <style>
        .recorded-template-download {
          box-sizing: border-box;
          width: 728px;
          background: #ffffff;
          color: #0f172a;
          font-family: Arial, sans-serif;
          font-size: 13px;
          line-height: 20px;
        }
        .recorded-template-download * { box-sizing: border-box; }
        .download-header {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          grid-template-rows: auto;
          border-bottom: 1px solid #e2e8f0;
          padding: 10px 10px 12px;
        }
        .download-subtitle {
          grid-column: 1;
          grid-row: 1;
          margin: 0;
          font-size: 13px;
          font-weight: 600;
          line-height: 18px;
          color: #64748b;
        }
        .download-body {
          padding: 16px 10px 8px;
        }
        .decision-field {
          width: 222px;
          margin-bottom: 18px;
        }
        .field-label {
          margin-bottom: 6px;
          font-size: 13px;
          font-weight: 700;
          line-height: 20px;
          color: #0f172a;
        }
        .readonly-input {
          display: flex;
          align-items: center;
          width: 100%;
          height: 38px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 0 10px;
          background: #ffffff;
          font-size: 13px;
          font-weight: 400;
          line-height: 20px;
          color: #0f172a;
        }
        .technical-report {
          margin-bottom: 18px;
        }
        .mphlg-documents {
          margin-bottom: 18px;
          border: 1px solid #dbe3ef;
          border-radius: 4px;
          background: #ffffff;
          overflow: hidden;
        }
        .mphlg-documents-title {
          margin: 0;
          border-left: 4px solid #18b36b;
          padding: 10px 12px;
          font-size: 13px;
          font-weight: 700;
          line-height: 18px;
          color: #334155;
          text-transform: uppercase;
        }
        .mphlg-documents-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
          line-height: 16px;
          color: #0f172a;
        }
        .mphlg-documents-table th {
          border: 1px solid #e2e8f0;
          background: #f1f5f4;
          padding: 8px 10px;
          font-weight: 700;
          text-align: left;
        }
        .mphlg-documents-table td {
          border: 1px solid #e2e8f0;
          background: #e4f4df;
          padding: 8px 10px;
          vertical-align: top;
        }
        .mphlg-documents-file {
          color: #00843d;
          font-weight: 700;
        }
        .mphlg-documents-meta {
          margin-top: 3px;
          color: #64748b;
          font-size: 10px;
          font-weight: 600;
        }
        .technical-section {
          margin-bottom: 12px;
          border: 1px solid #dbe3ef;
          border-radius: 4px;
          background: #ffffff;
          page-break-inside: avoid;
          overflow: hidden;
        }
        .technical-section-header {
          border-bottom: 1px solid #0f172a;
          background: #f8fafc;
          padding: 9px 12px;
        }
        .technical-section-title {
          margin: 0;
          font-size: 14px;
          font-weight: 700;
          line-height: 20px;
          color: #0f172a;
        }
        .technical-section-body {
          padding: 10px 12px;
        }
        .technical-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
          line-height: 18px;
        }
        .technical-table th {
          background: #f8fafc;
          border-bottom: 1px solid #dbe3ef;
          color: #334155;
          font-weight: 700;
          padding: 7px 8px;
          text-align: left;
        }
        .technical-table td {
          border-top: 1px solid #eef2f7;
          color: #0f172a;
          padding: 8px;
          vertical-align: top;
        }
        .technical-departments {
          margin: 9px 0 0;
          color: #0f172a;
          font-size: 13px;
          line-height: 20px;
        }
        .technical-photo-row {
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 44px;
          border: 1px solid #dbe3ef;
          border-radius: 4px;
          background: #f8fafc;
          padding: 8px 10px;
        }
        .technical-photo-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border: 1px solid #94a3b8;
          color: #475569;
          font-size: 11px;
          font-weight: 700;
        }
        .technical-photo-name {
          margin: 0;
          font-size: 13px;
          font-weight: 600;
          line-height: 18px;
          color: #0f172a;
        }
        .technical-photo-meta {
          margin: 0;
          color: #475569;
          font-size: 11px;
          line-height: 16px;
        }
        .technical-empty {
          border: 1px dashed #cbd5e1;
          border-radius: 4px;
          background: #f8fafc;
          color: #64748b;
          font-size: 12px;
          font-weight: 600;
          padding: 14px;
          text-align: center;
        }
        .fee-schedule {
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          padding: 10px;
          page-break-inside: avoid;
        }
        .fee-schedule-heading {
          margin: 0 0 8px;
          text-align: center;
          font-size: 13px;
          line-height: 18px;
        }
        .fee-schedule-title {
          display: block;
          font-size: 16px;
          font-weight: 700;
          line-height: 20px;
        }
        .fee-schedule-grid {
          display: grid;
          grid-template-columns: 34px minmax(0, 1.1fr) minmax(0, 1.3fr) minmax(0, 0.8fr) minmax(0, 0.8fr);
          gap: 5px 12px;
          font-size: 11px;
          line-height: 16px;
        }
        .fee-schedule-grid .fee-heading {
          font-style: italic;
          text-align: center;
        }
        .fee-card {
          margin-top: 10px;
          border: 1px solid #dbe3ef;
          border-radius: 4px;
          padding: 8px;
          page-break-inside: avoid;
        }
        .fee-card-title {
          margin: 0 0 8px;
          font-size: 13px;
          font-weight: 700;
          line-height: 20px;
        }
        .fee-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 8px 12px;
        }
        .fee-field-label {
          display: block;
          margin-bottom: 3px;
          font-size: 12px;
          font-weight: 700;
          line-height: 17px;
        }
        .fee-input {
          min-height: 30px;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          padding: 5px 8px;
          font-size: 12px;
          line-height: 18px;
          color: #0f172a;
        }
        .remarks-label,
        .signature-label {
          margin: 0 0 8px;
          font-size: 13px;
          font-weight: 600;
          line-height: 20px;
        }
        .remarks-label {
          color: #0f172a;
        }
        .signature-label {
          color: #334155;
        }
        .remarks-box {
          position: relative;
          height: 266px;
          margin-bottom: 16px;
          background: repeating-linear-gradient(to bottom, #ffffff 0, #ffffff 27px, #1f2937 27px, #1f2937 28px);
          overflow: hidden;
        }
        .remarks-text {
          position: relative;
          z-index: 2;
          margin: 0;
          padding: 0 8px;
          white-space: pre-line;
          font-size: 13px;
          font-weight: 700;
          line-height: 28px;
          color: #000000;
        }
        .signature-box {
          border: 1px dashed #cbd5e1;
          border-radius: 4px;
          padding: 24px 20px;
          background: #ffffff;
        }
        .confirmation-title {
          margin: 0;
          font-size: 13px;
          font-weight: 700;
          line-height: 20px;
          color: #0f172a;
          text-transform: uppercase;
        }
        .signature-grid {
          position: relative;
          display: grid;
          grid-template-columns: minmax(145px, 220px) 14px minmax(0, 1fr);
          grid-template-rows: 144px repeat(4, 32px);
          column-gap: 8px;
          row-gap: 16px;
          margin-top: 16px;
          font-size: 13px;
          font-weight: 600;
          line-height: 20px;
          color: #0f172a;
        }
        .signature-overlay {
          position: relative;
          z-index: 2;
          grid-column: 3;
          grid-row: 1 / span 5;
          overflow: hidden;
          pointer-events: none;
        }
        .signature-overlay img {
          position: absolute;
          object-fit: contain;
          user-select: none;
        }
        .signature-overlay .draw-image,
        .signature-overlay .single-upload-image {
          inset: 0;
          width: 100%;
          height: 154px;
          object-fit: fill;
        }
        .signature-overlay .single-upload-image {
          height: 100%;
        }
        .signature-row-label {
          display: flex;
          align-items: flex-end;
        }
        .signature-row-colon {
          display: flex;
          align-items: flex-end;
          padding-bottom: 4px;
        }
        .signature-row-line {
          display: flex;
          min-width: 0;
          align-items: flex-end;
          border-bottom: 1px solid #0f172a;
          padding-bottom: 4px;
          overflow: visible;
        }
        .signature-row-line-date {
          align-items: flex-end;
          overflow: visible;
          padding-bottom: 6px;
        }
        .signature-row-value {
          width: 100%;
          min-width: 0;
          color: #0f172a;
          font-size: 13px;
          font-weight: 600;
          line-height: 20px;
          overflow: visible;
          text-align: left;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .signature-row-value-date {
          color: #0f172a;
          font-weight: 600;
          line-height: 22px;
          overflow: visible;
          text-align: left;
          white-space: nowrap;
        }
        .signature-grid-upload .signature-row-value:not(.signature-row-value-date) {
          color: #5273ff;
          font-weight: 700;
          line-height: 16px;
          text-align: center;
          white-space: pre-line;
        }
      </style>
      <div class="download-header">
        <p class="download-subtitle">${escapeHtml(formatDecisionLogDepartmentLabel(log.department, language))} · ${escapeHtml(formatDecisionLogCompactDateTime(log.date, language))}</p>
      </div>
      <div class="download-body">
        ${log.technicalReport ? buildDecisionLogTechnicalReportSnapshotHtml(log.technicalReport, language) : ""}
        ${buildDecisionLogMphlgSupportingDocumentsSnapshotHtml(log.supportingDocuments, labels)}
        ${decisionHtml}
        <div class="remarks-section">
          <p class="remarks-label">${escapeHtml(labels.remarks)}</p>
          <div class="remarks-box">
            <p class="remarks-text">${escapeHtml(log.remarks || "")}</p>
          </div>
        </div>
        ${signatureSource ? buildDecisionLogSignatureSnapshotHtml(log.signature, signatureSource, labels) : ""}
      </div>
    </div>
  `;
}

function buildDecisionLogMphlgSupportingDocumentsSnapshotHtml(documents, labels) {
  const rows = normalizeMphlgSupportingDocumentRows(documents);
  if (!rows.length) return "";

  return `
    <div class="mphlg-documents">
      <p class="mphlg-documents-title">${escapeHtml(labels.supportingDocumentsTitle)}</p>
      <table class="mphlg-documents-table">
        <thead>
          <tr>
            <th style="width:44px;">#</th>
            <th style="width:34%;">${escapeHtml(labels.description)}</th>
            <th style="width:90px;">${escapeHtml(labels.format)}</th>
            <th style="width:310px;">${escapeHtml(labels.attachment)}</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row, index) => {
            const attachment = row.attachment || {};
            const filename = attachment.name || attachment.title || attachment.filename || "";
            const size = formatMphlgDocumentFileSize(attachment.size);
            return `
              <tr>
                <td>${String.fromCharCode(65 + index)}</td>
                <td>${escapeHtml(row.description || "-")}</td>
                <td>${escapeHtml(row.format || "PDF")}</td>
                <td>
                  <div class="mphlg-documents-file">${escapeHtml(filename || labels.noAttachment)}</div>
                  ${size ? `<div class="mphlg-documents-meta">${escapeHtml(size)}</div>` : ""}
                  <div class="mphlg-documents-meta">${escapeHtml(labels.attachmentLimit)}</div>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function buildDecisionLogTechnicalReportSnapshotHtml(report, language = "en") {
  const technicalSite = report?.technicalSite || {};
  const rows = getTechnicalFeeRowsFromSite(technicalSite);
  const labels = getDecisionLogTechnicalLabels(language);
  const departmentsText = Array.isArray(report?.derivedDepartments)
    ? report.derivedDepartments.join(", ")
    : String(report?.derivedDepartments || "").trim();
  const sitePhotos = Array.isArray(report?.sitePhotos) ? report.sitePhotos : [];
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

  return `
    <div class="technical-report">
      <div class="technical-section">
        <div class="technical-section-header">
          <p class="technical-section-title">${escapeHtml(stepText(language, "applicationProjectList"))}</p>
        </div>
        <div class="technical-section-body">
          <table class="technical-table">
            <thead>
              <tr>
                <th style="width:42px;">${escapeHtml(stepText(language, "advertisementNumber"))}</th>
                <th style="width:100px;">${escapeHtml(stepText(language, "applicationCategory"))}</th>
                <th style="width:120px;">${escapeHtml(stepText(language, "displayType"))}</th>
                <th style="width:160px;">${escapeHtml(stepText(language, "advertisementType"))}</th>
                <th>${escapeHtml(stepText(language, "title"))}</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((row, index) => buildDecisionLogTechnicalProjectRowHtml(row, index, language)).join("")}
            </tbody>
          </table>
          ${departmentsText ? `<p class="technical-departments"><strong>${escapeHtml(labels.departmentsInvolved)}:</strong> ${escapeHtml(departmentsText)}</p>` : ""}
        </div>
      </div>

      <div class="technical-section">
        <div class="technical-section-body">
          <p class="technical-section-title">${escapeHtml(labels.siteVisitTitle)}</p>
          <p style="margin:2px 0 10px;color:#334155;">${escapeHtml(labels.siteVisitDesc)}</p>
          <p style="margin:0 0 6px;font-weight:700;">${escapeHtml(labels.sitePhoto)}</p>
          ${sitePhotos.length > 0
            ? `<div style="display:grid;gap:6px;">${sitePhotos.map((photo, index) => buildDecisionLogTechnicalPhotoHtml(photo, labels.sitePhoto, index)).join("")}</div>`
            : `<div class="technical-empty">${escapeHtml(labels.noSitePhoto)}</div>`
          }
        </div>
      </div>

      <div class="technical-section">
        <div class="technical-section-body">
          <p class="technical-section-title">${escapeHtml(labels.feeCalculationTitle)}</p>
          ${buildDecisionLogFeeScheduleHtml(scheduleNumbers, language)}
          <div style="display:grid;gap:8px;margin-top:10px;">
            ${rows.map((row, index) => buildDecisionLogTechnicalFeeRowHtml(row, index, language)).join("")}
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildDecisionLogTechnicalProjectRowHtml(row, index, language = "en") {
  const rowType =
    normalizeApplicationTypeOptions(row?.applicationType || row?.application_type)[0] ||
    getApplicationTypeFromSubtype(row?.subtype);
  const displayType = row?.displayType || row?.display_type || getTechnicalDisplayTypeFromSubtype(row?.subtype);
  const advertisementLabel =
    row?.customLabel ||
    row?.custom_label ||
    getApplicationSubtypeLabel(rowType, row?.subtype, language) ||
    "";

  return `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(getApplicationTypeOptionLabel(rowType, language) || "-")}</td>
      <td>${escapeHtml(getTechnicalDisplayTypeLabel(displayType, language) || "-")}</td>
      <td>${escapeHtml(getTechnicalAdvertisementOptionLabel(advertisementLabel, language) || "-")}</td>
      <td>${escapeHtml(buildTechnicalProjectNameLine(language, row, rowType) || "-")}</td>
    </tr>
  `;
}

function buildDecisionLogTechnicalPhotoHtml(photo, fallbackTitle = "Site Photo", index = 0) {
  const name = photo?.name || photo?.title || photo?.fileName || `${fallbackTitle} ${index + 1}`;
  const format = getTechnicalSitePhotoFormat(photo);
  const size = formatTechnicalSitePhotoSize(photo?.size);
  const meta = [format, size].filter(Boolean).join(" - ");

  return `
    <div class="technical-photo-row">
      <span class="technical-photo-icon">IMG</span>
      <div>
        <p class="technical-photo-name">${escapeHtml(name)}</p>
        ${meta ? `<p class="technical-photo-meta">${escapeHtml(meta)}</p>` : ""}
      </div>
    </div>
  `;
}

function buildDecisionLogFeeScheduleHtml(scheduleNumbers = [], language = "en") {
  const visibleSchedules = scheduleNumbers.length > 0 ? scheduleNumbers : ["1"];
  const labels = getDecisionLogTechnicalLabels(language);

  return `
    <div class="fee-schedule">
      <p class="fee-schedule-heading">
        <em>${escapeHtml(labels.scheduleTitle)}</em>
        <span class="fee-schedule-title">${escapeHtml(labels.scheduleFeesTitle)}</span>
        <strong>${escapeHtml(labels.scheduleBylaws)}</strong>
      </p>
      <div class="fee-schedule-grid">
        <span></span>
        <span class="fee-heading">${escapeHtml(labels.scheduleAdvertisementType)}</span>
        <span class="fee-heading">${escapeHtml(labels.scheduleFeePayable)}</span>
        <span class="fee-heading">${escapeHtml(labels.scheduleCityCouncil)}</span>
        <span class="fee-heading">${escapeHtml(labels.scheduleDistrictCouncil)}</span>
        ${visibleSchedules.map((scheduleNumber) => buildDecisionLogFeeScheduleBlockHtml(scheduleNumber, language)).join("")}
      </div>
    </div>
  `;
}

function buildDecisionLogFeeScheduleBlockHtml(scheduleNumber, language = "en") {
  const isLedSchedule = String(scheduleNumber) === "6";
  const labels = getDecisionLogTechnicalLabels(language);
  const typeDescription = isLedSchedule ? labels.schedule6AdvertisementDesc : labels.scheduleAdvertisementDesc;
  const firstAreaText = isLedSchedule ? labels.schedule6FirstArea : labels.scheduleFirstArea;
  const additionalAreaText = isLedSchedule ? labels.schedule6AdditionalArea : labels.scheduleAdditionalArea;
  const firstCityRate = isLedSchedule ? labels.schedule6CityFirstRate : labels.scheduleCityFirstRate;
  const firstDistrictRate = isLedSchedule ? labels.schedule6DistrictFirstRate : labels.scheduleDistrictFirstRate;
  const additionalCityRate = isLedSchedule ? labels.schedule6CityAdditionalRate : labels.scheduleCityAdditionalRate;
  const additionalDistrictRate = isLedSchedule ? labels.schedule6DistrictAdditionalRate : labels.scheduleDistrictAdditionalRate;

  return `
    <span>${escapeHtml(scheduleNumber)}.</span>
    <span>${escapeHtml(typeDescription)}</span>
    <span>
      (a) ${escapeHtml(firstAreaText)}<br>
      (b) ${escapeHtml(additionalAreaText)}
      ${isLedSchedule ? `<br>(c) ${escapeHtml(labels.schedule6DeviceSet)}` : ""}
    </span>
    <span>
      ${escapeHtml(firstCityRate)}<br>
      ${escapeHtml(additionalCityRate)}
      ${isLedSchedule ? `<br>${escapeHtml(labels.schedule6CityDeviceRate)}` : ""}
    </span>
    <span>
      ${escapeHtml(firstDistrictRate)}<br>
      ${escapeHtml(additionalDistrictRate)}
      ${isLedSchedule ? `<br>${escapeHtml(labels.schedule6DistrictDeviceRate)}` : ""}
    </span>
  `;
}

function buildDecisionLogTechnicalFeeRowHtml(row, index, language = "en") {
  const applicationType =
    row.applicationType || row.application_type || getApplicationTypeFromSubtype(row.subtype);
  const typeLabel = getApplicationTypeOptionLabel(applicationType, language);
  const displayType = row.displayType || row.display_type || getTechnicalDisplayTypeFromSubtype(row.subtype);
  const displayLabel = getTechnicalDisplayTypeLabel(displayType, language);
  const advertisementLabel = getTechnicalAdvertisementOptionLabel(
    row.customLabel || row.custom_label,
    language
  );
  const labels = getDecisionLogTechnicalLabels(language);
  const widthValue = row.width_ft || row.widthFt || "";
  const heightValue = row.height_ft || row.heightFt || "";
  const fee = calculateTechnicalFee({
    application_subtype: row.subtype,
    width_ft: widthValue,
    height_ft: heightValue,
    area_sqm: "",
  });
  const hasCompleteSize = parseTechnicalNumber(widthValue) > 0 && parseTechnicalNumber(heightValue) > 0;
  const areaValue = hasCompleteSize ? fee.areaSqm : 0;
  const totalPayable = hasCompleteSize && fee.feeTotal ? fee.totalPayable : 0;

  return `
    <div class="fee-card">
      <p class="fee-card-title">${index + 1}. ${escapeHtml(typeLabel)}: ${escapeHtml(displayLabel)} - ${escapeHtml(advertisementLabel || "-")}</p>
      <div class="fee-grid">
        <label>
          <span class="fee-field-label">${escapeHtml(stepText(language, "advertisementSizeFt"))}</span>
          <div class="fee-input">${escapeHtml(widthValue || "-")} ft &nbsp; x &nbsp; ${escapeHtml(heightValue || "-")} ft</div>
        </label>
        <label>
          <span class="fee-field-label">${escapeHtml(stepText(language, "areaRequired"))}</span>
          <div class="fee-input">${escapeHtml(formatTechnicalDecimal(areaValue))}</div>
        </label>
        <label>
          <span class="fee-field-label">${escapeHtml(stepText(language, "malaysiaPlanRm"))}</span>
          <div class="fee-input">${escapeHtml(formatTechnicalAmountInput(totalPayable))}</div>
        </label>
        <label>
          <span class="fee-field-label">${escapeHtml(stepText(language, "calculationBreakdown"))}</span>
          <div class="fee-input">
            ${escapeHtml(formatTechnicalDecimal(widthValue || 0))} ft x ${escapeHtml(formatTechnicalDecimal(heightValue || 0))} ft,
            ${escapeHtml(formatTechnicalCurrency(fee.feeTotal))} ${escapeHtml(labels.feeShort)} +
            ${escapeHtml(formatTechnicalCurrency(fee.deposit))} ${escapeHtml(labels.deposit)} +
            ${escapeHtml(formatTechnicalCurrency(fee.processingFee))} ${escapeHtml(labels.processingShort)}
          </div>
        </label>
      </div>
    </div>
  `;
}

function getDecisionLogDownloadLabels(language = "en") {
  if (getDecisionLogLanguage(language) === "ms") {
    return {
      decision: "Cadangan Anda",
      remarks: "Ulasan",
      supportingDocumentsTitle: "Dokumen Sokongan Berkaitan Lain (Jika Ada)",
      description: "Keterangan",
      format: "Format",
      attachment: "Lampiran",
      noAttachment: "Tiada lampiran",
      attachmentLimit: "Saiz fail maksimum 15MB. PDF sahaja.",
      signatureTitle: "Tandatangan Digital",
      confirmation: "PENGESAHAN",
      signatureAndStamp: "Tandatangan & Cop",
      name: "Nama",
      position: "Jawatan",
      agency: "Agensi",
      date: "Tarikh",
      signatureAlt: "Pratonton tandatangan digital",
    };
  }

  return {
    decision: "Your Recommendation",
    remarks: "Remarks",
    supportingDocumentsTitle: "Other Relevant Supporting Documents (If Any)",
    description: "Description",
    format: "Format",
    attachment: "Attachment",
    noAttachment: "No attachment",
    attachmentLimit: "Maximum file size 15MB. PDF only.",
    signatureTitle: "Digital Signature",
    confirmation: "CONFIRMATION",
    signatureAndStamp: "Signature & Stamp",
    name: "Name",
    position: "Position",
    agency: "Agency",
    date: "Date",
    signatureAlt: "Digital signature preview",
  };
}

function getDecisionLogTechnicalLabels(language = "en") {
  if (getDecisionLogLanguage(language) === "ms") {
    return {
      departmentsInvolved: "Bahagian terlibat",
      siteVisitTitle: "Lawatan Tapak Unit Iklan",
      siteVisitDesc: "Muat naik gambar tapak, masukkan saiz iklan dan rekod penemuan tapak.",
      sitePhoto: "Gambar Tapak",
      noSitePhoto: "Tiada gambar tapak dimuat naik.",
      feeCalculationTitle: "Kiraan Saiz & Caj Iklan",
      scheduleTitle: "JADUAL KEDUA",
      scheduleFeesTitle: "YURAN LESEN",
      scheduleBylaws: "(Undang-undang Kecil 9 dan 10)",
      scheduleAdvertisementType: "Jenis Iklan",
      scheduleFeePayable: "Yuran Kena Dibayar",
      scheduleCityCouncil: "Majlis Bandaraya/Perbandaran",
      scheduleDistrictCouncil: "Majlis Daerah",
      scheduleAdvertisementDesc:
        "Iklan (selain papan tanda nama perniagaan, iklan langit dan iklan pada papan elektronik atau peranti bukan cetak) yang melebihi satu meter persegi; diukur mengikut kawasan paparan iklan, termasuk kawasan permukaan rangka atau sokongan",
      scheduleFirstArea: "Bagi 20 meter persegi pertama atau sebahagian daripadanya",
      scheduleAdditionalArea: "Bagi setiap meter persegi tambahan atau sebahagian daripadanya",
      schedule6AdvertisementDesc: "Iklan melalui elektronik atau mana-mana peranti bukan cetak",
      schedule6FirstArea: "Bagi 10 meter persegi pertama atau sebahagian daripadanya",
      schedule6AdditionalArea: "Bagi setiap meter persegi tambahan",
      schedule6DeviceSet: "Bagi setiap set peranti yang menghasilkan iklan tidak boleh diukur",
      scheduleCityFirstRate: "RM100.00 bagi setiap meter persegi setahun",
      scheduleDistrictFirstRate: "RM70.00 bagi setiap meter persegi setahun",
      scheduleCityAdditionalRate: "RM70.00 setahun",
      scheduleDistrictAdditionalRate: "RM50.00 setahun",
      schedule6CityFirstRate: "RM2,000.00 setahun",
      schedule6DistrictFirstRate: "RM1,500.00 setahun",
      schedule6CityAdditionalRate: "RM50.00 setahun",
      schedule6DistrictAdditionalRate: "RM35.00 setahun",
      schedule6CityDeviceRate: "RM1,000.00 setahun",
      schedule6DistrictDeviceRate: "RM750.00 setahun",
      feeShort: "yuran",
      deposit: "deposit",
      processingShort: "pemprosesan",
    };
  }

  return {
    departmentsInvolved: "Departments involved",
    siteVisitTitle: "Advertisement Unit Site Visit",
    siteVisitDesc: "Upload the site photo, enter the advertisement size, and record site findings.",
    sitePhoto: "Site Photo",
    noSitePhoto: "No site photo uploaded.",
    feeCalculationTitle: "Advertisement Size & Fee Calculation",
    scheduleTitle: "SECOND SCHEDULE",
    scheduleFeesTitle: "LICENCE FEES",
    scheduleBylaws: "(By-laws 9 and 10)",
    scheduleAdvertisementType: "Type of Advertisement",
    scheduleFeePayable: "Fee Payable",
    scheduleCityCouncil: "City/Municipal Council",
    scheduleDistrictCouncil: "District Council",
    scheduleAdvertisementDesc:
      "Advertisement (other than business name signboard, sky-sign and advertisement on electronic board or any non-print device) of over one square metre in size; measured over the area for the display of the advertisement, and includes such superficial area of frame work or support",
    scheduleFirstArea: "For the first 20 square metre or part thereof",
    scheduleAdditionalArea: "For every additional square metre or part thereof",
    schedule6AdvertisementDesc: "Advertisement by means of electronic or any non-print device",
    schedule6FirstArea: "For the first 10 square metre or part thereof",
    schedule6AdditionalArea: "For every additional square metre",
    schedule6DeviceSet: "For every set of device producing non-measurable advertisement",
    scheduleCityFirstRate: "RM100.00 for every square metre per year",
    scheduleDistrictFirstRate: "RM70.00 for every square metre per year",
    scheduleCityAdditionalRate: "RM70.00 per year",
    scheduleDistrictAdditionalRate: "RM50.00 per year",
    schedule6CityFirstRate: "RM2,000.00 per year",
    schedule6DistrictFirstRate: "RM1,500.00 per year",
    schedule6CityAdditionalRate: "RM50.00 per year",
    schedule6DistrictAdditionalRate: "RM35.00 per year",
    schedule6CityDeviceRate: "RM1,000.00 per year",
    schedule6DistrictDeviceRate: "RM750.00 per year",
    feeShort: "fee",
    deposit: "deposit",
    processingShort: "processing",
  };
}

function formatDecisionLogDecision(value, language = "en") {
  const text = String(value || "").trim();
  const normalized = text.toLowerCase();
  const isMalay = getDecisionLogLanguage(language) === "ms";

  if (["approve", "approved", "lulus"].includes(normalized)) return isMalay ? "Lulus" : "Approve";
  if (["reject", "rejected", "not approve", "not approved", "tidak lulus"].includes(normalized)) {
    return isMalay ? "Tidak Lulus" : "Not Approve";
  }
  if (
    [
      "request amendment",
      "amendment required",
      "technical amendment required",
      "mohon pindaan",
      "pindaan diperlukan",
    ].includes(normalized)
  ) {
    return isMalay ? "Mohon Pindaan" : "Request Amendment";
  }

  return text;
}

function formatDecisionLogCompactDateTime(value, language = "en") {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  if (getDecisionLogLanguage(language) !== "ms") {
    const datePart = date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const timePart = date.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    return `${datePart}, ${timePart.toUpperCase()}`;
  }

  const months = ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ogo", "Sep", "Okt", "Nov", "Dis"];
  const day = String(date.getDate()).padStart(2, "0");
  const month = months[date.getMonth()] || "";
  const year = date.getFullYear();
  let hour = date.getHours();
  const minute = String(date.getMinutes()).padStart(2, "0");
  const suffix = hour < 12 ? "PG" : "PTG";
  hour %= 12;
  if (hour === 0) hour = 12;

  return `${day} ${month} ${year}, ${String(hour).padStart(2, "0")}:${minute} ${suffix}`;
}

function buildDecisionLogSignatureSnapshotHtml(signature, signatureSource, labels) {
  const signatureDetails = signature && typeof signature === "object" ? signature : {};
  const signatureModeClass = signatureDetails.mode === "upload"
    ? "signature-grid-upload"
    : "signature-grid-draw";
  const rows = [
    { key: "signatureStamp", label: labels.signatureAndStamp },
    { key: "name", label: labels.name },
    { key: "position", label: labels.position },
    { key: "agency", label: labels.agency },
    { key: "date", label: labels.date },
  ];

  return `
    <div class="signature-section">
      <p class="signature-label">${escapeHtml(labels.signatureTitle)}</p>
      <div class="signature-box">
        <p class="confirmation-title">${escapeHtml(labels.confirmation)}</p>
        <div class="signature-grid ${signatureModeClass}">
          ${buildDecisionLogSignatureOverlayHtml(signatureDetails, signatureSource, labels)}
          ${rows
            .map((row, index) => {
              const gridRow = index + 1;
              return `
                <div class="signature-row-label" style="grid-column:1;grid-row:${gridRow};">${escapeHtml(row.label)}</div>
                <div class="signature-row-colon" style="grid-column:2;grid-row:${gridRow};">:</div>
                <div class="signature-row-line signature-row-line-${row.key}" style="grid-column:3;grid-row:${gridRow};">
                  <div class="signature-row-value signature-row-value-${row.key}">${escapeHtml(signatureDetails[row.key] || "")}</div>
                </div>
              `;
            })
            .join("")}
        </div>
      </div>
    </div>
  `;
}

function buildDecisionLogSignatureOverlayHtml(signatureDetails, signatureSource, labels) {
  const uploadedItems = Array.isArray(signatureDetails.items) ? signatureDetails.items : [];
  const drawPreviewDataUrl =
    signatureDetails.drawDataUrl ||
    (signatureDetails.mode === "draw" ? signatureSource : "");
  const shouldRenderComposedUpload =
    !uploadedItems.length && signatureDetails.mode === "upload" && signatureSource;
  const alt = escapeHtml(labels.signatureAlt);
  const uploadedImages = uploadedItems
    .map((item) => {
      const width = Number(item.width ?? 38);
      const safeWidth = Number.isFinite(width) ? width : 38;
      const downloadWidth = Math.min(200, safeWidth * 1.35);
      return `
        <img
          src="${escapeHtml(item.dataUrl || signatureSource)}"
          alt="${alt}"
          style="left:${Number(item.x ?? 50)}%;top:${Number(item.y ?? 50)}%;width:${downloadWidth}%;max-height:100%;max-width:100%;transform:translate(-50%, -50%);"
        />
      `;
    })
    .join("");
  const singleUploadImage = shouldRenderComposedUpload
    ? `<img class="single-upload-image" src="${escapeHtml(signatureSource)}" alt="${alt}" />`
    : "";
  const drawImage = drawPreviewDataUrl
    ? `<img class="draw-image" src="${escapeHtml(drawPreviewDataUrl)}" alt="${alt}" />`
    : "";

  return `
    <div class="signature-overlay">
      ${uploadedImages || singleUploadImage}
      ${drawImage}
    </div>
  `;
}

async function waitForReportAssets(element) {
  await document.fonts?.ready;

  const images = Array.from(element.querySelectorAll("img"));
  await Promise.all(
    images.map((image) => {
      if (image.complete) return Promise.resolve();

      return new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      });
    })
  );
}

async function downloadDecisionLogReportPdfLegacy(log, reference, t, language = "en") {
  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const filename = buildDecisionLogDownloadFilename(reference, log, language);
  let y = margin;

  const ensureSpace = (height) => {
    if (y + height <= pageHeight - margin) return;
    pdf.addPage();
    y = margin;
  };

  pdf.setTextColor(15, 23, 42);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text(t("workspace.decisionLog.recordedTemplate", "Recorded Template"), margin, y);
  y += 6;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(71, 85, 105);
  pdf.text(
    `${formatDecisionLogDepartmentLabel(log.department, language)} - ${formatCompactDateTime(log.date)}`,
    margin,
    y
  );
  y += 6;
  pdf.setDrawColor(203, 213, 225);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 9;

  if (log.decision) {
    pdf.setTextColor(15, 23, 42);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text(t("common.decision", "Your Recommendation"), margin, y);
    y += 4;
    pdf.setDrawColor(203, 213, 225);
    pdf.roundedRect(margin, y, 62, 9, 1.5, 1.5);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(String(log.decision), margin + 3, y + 6);
    y += 15;
  }

  pdf.setTextColor(15, 23, 42);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text(t("common.remarks", "Remarks"), margin, y);
  y += 6;

  const remarkLineHeight = 8;
  const remarkLines = 12;
  const remarkTextLines = pdf.splitTextToSize(String(log.remarks || ""), contentWidth - 4);
  pdf.setTextColor(0, 0, 0);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  remarkTextLines.slice(0, remarkLines).forEach((line, index) => {
    pdf.text(line, margin + 2, y + index * remarkLineHeight - 2);
  });
  pdf.setDrawColor(31, 41, 55);
  for (let index = 0; index < remarkLines; index += 1) {
    pdf.line(margin, y + index * remarkLineHeight, pageWidth - margin, y + index * remarkLineHeight);
  }
  y += remarkLines * remarkLineHeight + 10;

  const signatureSource = getDecisionLogSignatureSource(log.signature);
  if (signatureSource) {
    ensureSpace(126);
    pdf.setTextColor(51, 65, 85);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text(t("workspace.signature.title", "Digital Signature"), margin, y);
    y += 6;
    await drawDecisionLogSignaturePdf(pdf, log.signature, signatureSource, t, margin, y, contentWidth);
  }

  pdf.save(filename);
}

async function drawDecisionLogSignaturePdf(pdf, signature, signatureSource, t, x, y, width) {
  const signatureDetails = signature && typeof signature === "object" ? signature : {};
  const rows = [
    { key: "signatureStamp", label: t("workspace.signature.signatureAndStamp", "Signature & Stamp") },
    { key: "name", label: t("workspace.signature.name", "Name") },
    { key: "position", label: t("workspace.signature.position", "Position") },
    { key: "agency", label: t("workspace.signature.agency", "Agency") },
    { key: "date", label: t("workspace.signature.date", "Date") },
  ];
  const boxY = y;
  const boxHeight = 116;
  const titleY = boxY + 12;
  const firstRowY = boxY + 65;
  const rowGap = 11.5;
  const labelX = x + 7;
  const colonX = x + 72;
  const lineX = x + 82;
  const lineWidth = width - 90;
  const overlayY = boxY + 40;
  const overlayHeight = 52;

  pdf.setDrawColor(203, 213, 225);
  pdf.setLineDashPattern([1.2, 1.2], 0);
  pdf.rect(x, boxY, width, boxHeight);
  pdf.setLineDashPattern([], 0);

  pdf.setTextColor(15, 23, 42);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text(t("workspace.signature.confirmationTitle", "CONFIRMATION"), labelX, titleY);

  const overlayImage = await buildDecisionLogSignatureOverlay(signatureDetails, signatureSource);
  if (overlayImage) {
    addImageToPdf(pdf, overlayImage, lineX, overlayY, lineWidth, overlayHeight);
  }

  rows.forEach((row, index) => {
    const rowY = firstRowY + index * rowGap;
    const value = signatureDetails[row.key] || "";

    pdf.setTextColor(15, 23, 42);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text(row.label, labelX, rowY);
    pdf.text(":", colonX, rowY);
    pdf.setDrawColor(15, 23, 42);
    pdf.line(lineX, rowY + 1.5, lineX + lineWidth, rowY + 1.5);

    if (value) {
      pdf.setTextColor(82, 115, 255);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8.5);
      const valueLines = pdf.splitTextToSize(String(value).toUpperCase(), lineWidth - 6);
      valueLines.slice(0, 2).forEach((line, valueIndex) => {
        pdf.text(line, lineX + lineWidth / 2, rowY - 1.5 + valueIndex * 4, {
          align: "center",
        });
      });
    }
  });
}

async function buildDecisionLogSignatureOverlay(signatureDetails, signatureSource) {
  const uploadedItems = Array.isArray(signatureDetails.items) ? signatureDetails.items : [];
  const drawPreviewDataUrl =
    signatureDetails.drawDataUrl ||
    (signatureDetails.mode === "draw" ? signatureSource : "");
  const shouldRenderComposedUpload =
    !uploadedItems.length && signatureDetails.mode === "upload" && signatureSource;

  if (!uploadedItems.length && !shouldRenderComposedUpload) {
    return drawPreviewDataUrl || signatureSource;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 420;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);

  if (shouldRenderComposedUpload) {
    const image = await loadImageForPdf(signatureSource);
    if (image) context.drawImage(image, 0, 0, canvas.width, canvas.height);
  }

  for (const item of uploadedItems) {
    const image = await loadImageForPdf(item.dataUrl || signatureSource);
    if (!image) continue;

    const widthPercent = Number(item.width ?? 38);
    const imageWidth = canvas.width * (Number.isFinite(widthPercent) ? widthPercent : 38) / 100;
    const imageHeight = image.naturalHeight && image.naturalWidth
      ? imageWidth * (image.naturalHeight / image.naturalWidth)
      : canvas.height * 0.6;
    const centerX = canvas.width * Number(item.x ?? 50) / 100;
    const centerY = canvas.height * Number(item.y ?? 50) / 100;
    context.drawImage(image, centerX - imageWidth / 2, centerY - imageHeight / 2, imageWidth, imageHeight);
  }

  if (drawPreviewDataUrl && uploadedItems.length) {
    const image = await loadImageForPdf(drawPreviewDataUrl);
    if (image) context.drawImage(image, 0, 0, canvas.width, canvas.height * 0.45);
  }

  return canvas.toDataURL("image/png");
}

function loadImageForPdf(source) {
  if (!source) return Promise.resolve(null);

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

function addImageToPdf(pdf, source, x, y, width, height) {
  try {
    pdf.addImage(source, getPdfImageFormat(source), x, y, width, height);
  } catch (error) {
    console.error("Failed to add signature image to decision report:", error);
  }
}

function getPdfImageFormat(source) {
  const value = String(source || "").toLowerCase();
  if (value.startsWith("data:image/jpeg") || value.startsWith("data:image/jpg")) return "JPEG";
  if (value.startsWith("data:image/webp")) return "WEBP";
  return "PNG";
}

function buildDecisionLogDownloadFilename(reference, log, language = "en") {
  const parts = [
    reference || "application",
    formatDecisionLogDepartmentLabel(log.department, language),
    "report",
  ];

  return `${parts.map(sanitizeFilenamePart).filter(Boolean).join("-")}.pdf`;
}

function sanitizeFilenamePart(value) {
  return String(value || "")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function DecisionLogTemplateModal({ log, t, language = "en", onClose }) {
  const hasSupportingDocuments = Array.isArray(log?.supportingDocuments) && log.supportingDocuments.length > 0;
  const modalWidthClass = log?.technicalReport
    ? "max-w-[min(96vw,92rem)]"
    : hasSupportingDocuments
      ? "max-w-[min(96vw,78rem)]"
      : "max-w-4xl";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 py-6">
      <div className={`max-h-[92vh] w-full ${modalWidthClass} overflow-hidden rounded-md bg-white shadow-xl`}>
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <p className="text-[13px] font-semibold leading-5 text-slate-950">
              {t("workspace.decisionLog.recordedTemplate", "Recorded Template")}
            </p>
            <p className="mt-0.5 text-xs font-medium text-slate-500">
              {formatDecisionLogDepartmentLabel(log.department, language)} · {formatCompactDateTime(log.date)}
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            icon="close"
            className="min-h-8 px-2.5 py-1"
            onClick={onClose}
          >
            {t("common.close", "Close")}
          </Button>
        </div>

        <div className="max-h-[calc(92vh-64px)] overflow-y-auto px-4 py-4">
          <DecisionLogRecordedTemplate log={log} t={t} language={language} />
        </div>
      </div>
    </div>
  );
}

function formatDecisionLogDepartmentLabel(department, language = "") {
  const labels = getDecisionLogDepartmentLabels(language);
  const normalizedDepartment = normalizeDepartmentCode(department);
  if (labels[normalizedDepartment]) return labels[normalizedDepartment];
  return department || "-";
}

function getDecisionLogDepartmentLabels(language = "") {
  if (getDecisionLogLanguage(language) === "ms") {
    return {
      "KU(IKL)": "Ketua Unit (Iklan)",
      "PT(IKL)": "Pembantu Tadbir (Iklan)",
      BLG: "Bangunan (BLG)",
      GPM: "Pengurusan Geoinformasi Dan Hartanah (GPM)",
      MNE: "Mekanikal & Elektrik (MNE)",
      IMT: "Penyelenggaraan Infrastruktur (IMT)",
      LNP: "Landskap (LNP)",
      ENG: "Projek Kejuruteraan (ENG)",
      "IKL (TECHNICAL)": "Iklan Teknikal",
      "KB(LES)": "Ketua Bahagian Pelesenan (LES)",
      MPHLG: "Kementerian Kesihatan Awam, Perumahan dan Kerajaan Tempatan (MPHLG)",
      PGH: "Pengarah",
      "TP(RES)": "Timbalan Pengarah Jabatan Perkhidmatan Kawalselia (RES)",
    };
  }

  return {
    "KU(IKL)": "Advertising Unit Head (IKL)",
    "PT(IKL)": "Administrative Assistant (IKL)",
    BLG: "Building (BLG)",
    GPM: "Geoinformation And Properties Management (GPM)",
    MNE: "MECHANICAL & ELECTRICAL (MNE)",
    IMT: "INFRASTRUCTURE MAINTENANCE (IMT)",
    LNP: "Landscape (LNP)",
    ENG: "Engineering Project (ENG)",
    "IKL (TECHNICAL)": "Technical Advertising",
    "KB(LES)": "Licensing Division Head (LES)",
    MPHLG: "Ministry of Public Health, Housing and Local Government (MPHLG)",
    PGH: "Director",
    "TP(RES)": "Deputy Director Regulatory Services (RES)",
  };
}

function getDecisionLogLanguage(language = "") {
  if (language === "ms" || language === "en") return language;
  if (typeof document !== "undefined" && document.documentElement.lang?.startsWith("ms")) {
    return "ms";
  }
  return "en";
}

function DecisionLogRecordedTemplate({ log, t, language = "en" }) {
  const signatureSource = getDecisionLogSignatureSource(log.signature);

  return (
    <div className="space-y-4 text-[13px] leading-5 text-slate-950">
      {log.technicalReport && (
        <DecisionLogTechnicalReportView report={log.technicalReport} t={t} language={language} />
      )}

      {Array.isArray(log.supportingDocuments) && log.supportingDocuments.length > 0 && (
        <DecisionLogMphlgSupportingDocumentsView documents={log.supportingDocuments} t={t} />
      )}

      {log.decision && (
        <div className="max-w-[17rem]">
          <span className="mb-1 block text-[13px] font-semibold leading-5 text-slate-900">
            {t("common.decision", "Your Recommendation")}
          </span>
          <input
            type="text"
            value={formatDecisionLogDecision(log.decision, language)}
            readOnly
            className="form-input form-input-sm w-full bg-white text-[13px]"
          />
        </div>
      )}

      <div>
        <span className="mb-1 block text-[13px] font-semibold leading-5 text-slate-900">
          {t("common.remarks", "Remarks")}
        </span>
        <div
          className="relative min-h-[300px] bg-white"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, #ffffff 0, #ffffff 27px, #1f2937 27px, #1f2937 28px)",
          }}
        >
          <p className="whitespace-pre-line px-2 py-0 text-[13px] font-medium leading-[28px] text-slate-950">
            {log.remarks || ""}
          </p>
        </div>
      </div>

      {signatureSource && (
        <div>
          <span className="mb-1.5 block text-[13px] font-semibold leading-5 text-slate-700">
            {t("workspace.signature.title", "Digital Signature")}
          </span>
          <div className="bg-white">
            <DecisionLogSignatureConfirmation
              signature={log.signature}
              signatureSource={signatureSource}
              t={t}
              fullSize
            />
          </div>
        </div>
      )}
    </div>
  );
}

function DecisionLogMphlgSupportingDocumentsView({ documents, t }) {
  const rows = normalizeMphlgSupportingDocumentRows(documents);
  if (!rows.length) return null;

  return (
    <section className="overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-l-4 border-[#18b36b] bg-white px-4 py-3">
        <h2 className="text-sm font-bold uppercase leading-5 text-slate-700">
          {t(
            "workspace.mphlg.supportingDocumentsTitle",
            "Other Relevant Supporting Documents (If Any)"
          )}
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] table-fixed border-collapse text-[11px]">
          <thead className="bg-[#f1f5f4] text-left font-bold text-slate-700">
            <tr>
              <MphlgDocumentTableHead className="w-[44px]">#</MphlgDocumentTableHead>
              <MphlgDocumentTableHead className="w-[34%]">
                {t("workspace.mphlg.documentDescription", "Description")}
              </MphlgDocumentTableHead>
              <MphlgDocumentTableHead className="w-[95px]">
                {t("workspace.mphlg.documentFormat", "Format")}
              </MphlgDocumentTableHead>
              <MphlgDocumentTableHead className="w-[320px]">
                {t("workspace.mphlg.documentAttachment", "Attachment")}
              </MphlgDocumentTableHead>
              <MphlgDocumentTableHead className="w-[90px] text-center">
                {t("common.action", "Action")}
              </MphlgDocumentTableHead>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const attachment = row.attachment || null;
              const hasAttachment = Boolean(getPaymentDocumentSource(attachment));
              return (
                <tr
                  key={`decision-log-mphlg-supporting-${index}`}
                  className={index % 2 === 0 ? "bg-[#e4f4df]" : "bg-white"}
                >
                  <MphlgDocumentTableCell>{String.fromCharCode(65 + index)}</MphlgDocumentTableCell>
                  <MphlgDocumentTableCell>
                    <span className="font-medium text-slate-950">{row.description || "-"}</span>
                  </MphlgDocumentTableCell>
                  <MphlgDocumentTableCell>{row.format || "PDF"}</MphlgDocumentTableCell>
                  <MphlgDocumentTableCell>
                    <MphlgDocumentAttachment attachment={attachment} t={t} />
                  </MphlgDocumentTableCell>
                  <MphlgDocumentTableCell center>
                    <button
                      type="button"
                      onClick={() =>
                        downloadPaymentDocument(attachment, attachment?.name || "MPHLG Supporting Document", t)
                      }
                      disabled={!hasAttachment}
                      className="inline-flex h-8 w-8 items-center justify-center rounded border border-emerald-200 bg-white text-[#00843d] shadow-sm hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                      title={t("workspace.mphlg.download", "Download")}
                    >
                      <span className="material-symbols-outlined text-[18px] leading-none">
                        file_download
                      </span>
                    </button>
                  </MphlgDocumentTableCell>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DecisionLogTechnicalReportView({ report, t, language = "en" }) {
  const technicalSite = report?.technicalSite || {};
  const sitePhotos = Array.isArray(report?.sitePhotos) ? report.sitePhotos : [];

  return (
    <div className="space-y-4">
      <TechnicalApplicationTypePanel
        t={t}
        language={language}
        selectedTypes={report?.selectedTypes || []}
        selectedSubtype={report?.selectedSubtype || technicalSite.application_subtype || ""}
        derivedDepartments={report?.derivedDepartments || []}
        step1={report?.step1 || {}}
        saving={false}
        onSubtypeChange={() => {}}
        readOnly
      />

      <DecisionLogSitePhotoList
        t={t}
        title={t("workspace.technical.sitePhoto", "Site Photo")}
        emptyText={t("workspace.info.notSubmitted", "Not submitted")}
        applicationId={report?.applicationId}
        photos={sitePhotos}
      />

      <div className="rounded-md border border-slate-200 bg-white p-3">
        <TechnicalFeeCalculationSheet
          t={t}
          language={language}
          value={technicalSite}
          readOnly
        />
      </div>
    </div>
  );
}

function DecisionLogSitePhotoList({ t, title, emptyText, applicationId, photos }) {
  const reportPhotos = Array.isArray(photos) ? photos : [];

  async function viewPhoto(photo) {
    try {
      const { url, revoke } = await getSitePhotoBlobUrl(photo, applicationId);
      if (!url) return;

      window.open(url, "_blank");

      if (revoke) {
        window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
      }
    } catch (error) {
      console.error("Failed to open site photo:", error);
      window.alert(t("workspace.payment.documentViewFailed", "Unable to open the document. Please try again."));
    }
  }

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
        <div className="mt-3 space-y-2">
          {reportPhotos.map((photo, index) => (
            <div
              key={`${photo.name || photo.title || "site-photo"}-${index}`}
              className="flex min-h-14 items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Icon name="image" className="shrink-0 text-xl text-slate-500" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium leading-5 text-slate-700">
                    {photo.name || photo.title || `${title} ${index + 1}`}
                  </p>
                  <p className="text-xs leading-5 text-slate-500">
                    {getTechnicalSitePhotoMeta(photo)}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                icon="visibility"
                className="min-h-8 shrink-0 px-2.5 py-1 text-sm"
                onClick={() => viewPhoto(photo)}
              >
                {t("common.view", "View")}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
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

function DecisionLogSignatureConfirmation({ signature, signatureSource, t, fullSize = false }) {
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
      label: t("workspace.signature.signatureAndStamp", "Signature & Stamp"),
    },
    {
      key: "name",
      label: t("workspace.signature.name", "Name"),
    },
    {
      key: "position",
      label: t("workspace.signature.position", "Position"),
    },
    {
      key: "agency",
      label: t("workspace.signature.agency", "Agency"),
    },
    {
      key: "date",
      label: t("workspace.signature.date", "Date"),
    },
  ];
  const confirmationGridClass = fullSize
    ? "relative mt-4 grid grid-cols-[minmax(145px,220px)_14px_minmax(0,1fr)] grid-rows-[9rem_repeat(4,2rem)] gap-x-2 gap-y-4"
    : "relative mt-4 grid grid-cols-[minmax(145px,220px)_14px_minmax(0,1fr)] grid-rows-[9rem_repeat(4,2rem)] gap-x-2 gap-y-4";
  const getUploadedItemWidth = (item) => {
    const width = Number(item?.width ?? 38);
    return Number.isFinite(width) ? width : 38;
  };

  return (
    <div className={fullSize ? "overflow-hidden" : "h-[200px] w-[380px] overflow-hidden"}>
      <div
        className={`${fullSize ? "w-full max-w-[760px]" : "w-full"} rounded border border-dashed border-slate-300 bg-white px-5 py-6 text-[13px] font-semibold leading-5 text-slate-950`}
        style={fullSize ? undefined : { width: "760px", transform: "scale(0.5)", transformOrigin: "top left" }}
      >
        <p className="text-[13px] font-bold uppercase leading-5">
          {t("workspace.signature.confirmationTitle", "CONFIRMATION")}
        </p>

        <div className={confirmationGridClass}>
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
                      width: `${getUploadedItemWidth(item)}%`,
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
                <span className="min-w-0 truncate uppercase">{signatureDetails[row.key] || ""}</span>
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
      label: t("workspace.signature.signatureAndStamp", "Signature & Stamp"),
    },
    {
      key: "name",
      label: t("workspace.signature.name", "Name"),
      capture: true,
    },
    {
      key: "position",
      label: t("workspace.signature.position", "Position"),
    },
    {
      key: "agency",
      label: t("workspace.signature.agency", "Agency"),
    },
    {
      key: "date",
      label: t("workspace.signature.date", "Date"),
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
      <span className="mb-1.5 block text-[13px] font-semibold leading-5 text-slate-700">
          {t("workspace.signature.title", "Digital Signature")}
          <span className="ml-1 text-red-600">*</span>
      </span>
      <div
        className={`max-w-[56rem] rounded border bg-white p-3 ${error ? "border-red-300 shadow-[0_0_0_3px_rgba(220,38,38,0.08)]" : "border-slate-200"}`}
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
          <p className="text-[13px] font-bold uppercase leading-5 text-slate-950">
            {t("workspace.signature.confirmationTitle", "CONFIRMATION")}
          </p>

          <div
            className="relative mt-4 grid grid-cols-[minmax(145px,220px)_14px_minmax(0,1fr)] grid-rows-[9rem_repeat(4,2rem)] gap-x-2 gap-y-4 text-[13px] font-semibold leading-5 text-slate-950"
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

      return t("workspace.payment.ptAction", "Prepare the approval letter, send it to the applicant, then verify uploaded payment proof.");
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
  return ["approve", "support", "verify"].includes(String(decision || "").trim().toLowerCase());
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
      { value: "Approve", labelKey: "workspace.decision.approve" },
      { value: "Reject", labelKey: "workspace.decision.reject" },
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
    return t("status.mphlg_processing", "MPHLG Processing");
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

  if (shouldShowAutoScreeningDecisionLog(autoScreening)) {
    addWorkspaceDecisionLogRow(rows, {
      id: "auto-screening",
      department: getWorkspaceAutoScreeningDecisionDepartment(autoScreening) || "PT(IKL)",
      section: autoScreening,
      decision: getWorkspaceDecisionLogValue(autoScreening),
      remarks: getWorkspaceDecisionLogRemarks(autoScreening),
      date: getWorkspaceDecisionLogDate(autoScreening, ["checked_at", "reviewed_at", "decided_at"]),
    }, t);
  }

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
        signature: review.digital_signature,
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
    signature: technicalReview.digital_signature || getApplicationSection(app, "technical_site_visit").digital_signature,
    technicalReport: buildDecisionLogTechnicalReport(app),
  }, t);

  addWorkspaceDecisionLogRow(rows, {
    id: "technical-ku-review",
    department: "KU(IKL)",
    section: technicalKuReview,
    decision: getWorkspaceDecisionLogValue(technicalKuReview),
    remarks: getWorkspaceDecisionLogRemarks(technicalKuReview),
    date: getWorkspaceDecisionLogDate(technicalKuReview, ["reviewed_at", "checked_at"]),
    signature: getWorkspaceDecisionLogSignature(technicalKuReview),
  }, t);

  addWorkspaceDecisionLogRow(rows, {
    id: "kb-les-verification",
    department: "KB(LES)",
    section: kbLesVerification,
    decision: getWorkspaceDecisionLogValue(kbLesVerification),
    remarks: getWorkspaceDecisionLogRemarks(kbLesVerification),
    date: getWorkspaceDecisionLogDate(kbLesVerification, ["verified_at", "reviewed_at"]),
    signature: getWorkspaceDecisionLogSignature(kbLesVerification),
  }, t);

  addWorkspaceDecisionLogRow(rows, {
    id: "management-recommendation",
    department: normalizeDepartmentCode(managementRecommendation.officer) || "TP(RES)/PGH",
    section: managementRecommendation,
    decision: getWorkspaceDecisionLogValue(managementRecommendation),
    remarks: getWorkspaceDecisionLogRemarks(managementRecommendation),
    date: getWorkspaceDecisionLogDate(managementRecommendation, ["decided_at", "supported_at", "approval_note_saved_at"]),
    signature:
      getWorkspaceDecisionLogSignature(managementRecommendation) ||
      getWorkspaceDecisionLogSignature(approval),
  }, t);

  addWorkspaceDecisionLogRow(rows, {
    id: "mphlg-gateway",
    department: "MPHLG",
    section: mphlgGateway,
    decision: getWorkspaceDecisionLogValue(mphlgGateway),
    remarks: getWorkspaceDecisionLogRemarks(mphlgGateway),
    date: getWorkspaceDecisionLogDate(mphlgGateway, ["reviewed_at", "decided_at"]),
    signature: getWorkspaceDecisionLogSignature(mphlgGateway),
    supportingDocuments: normalizeMphlgSupportingDocumentRows(mphlgGateway.supporting_documents),
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
    remarks: payment.internal_verification_notes,
    date: getWorkspaceDecisionLogDate(payment, ["verified_at", "rejected_at"]),
    signature: getWorkspaceDecisionLogSignature(payment),
  }, t);

  addWorkspaceDecisionLogRow(rows, {
    id: "payment-letter-bill",
    department: "PT(IKL)",
    section: approvalLetter,
    decision: approvalLetter.letter_bill_decision || approvalLetter.recommendation,
    remarks: getWorkspaceDecisionLogRemarks(approvalLetter),
    date: getWorkspaceDecisionLogDate(approvalLetter, ["sent_to_applicant_at", "submitted_at"]),
    signature: getWorkspaceDecisionLogSignature(approvalLetter),
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
    technicalReport: row.technicalReport || null,
    supportingDocuments: row.supportingDocuments || null,
  });
}

function buildDecisionLogTechnicalReport(app) {
  if (!app) return null;

  const formData = app.form_data || {};
  const savedTechnicalSite = formData.technical_site_visit || {};
  const selectedTypes = getApplicationTypeOptionsFromApplication(app);
  const selectedSubtype = getApplicationSubtypeFromApplication(app);
  const technicalSite = getReviewTechnicalSite(savedTechnicalSite, app);
  const sitePhotos = Array.isArray(technicalSite.site_photos)
    ? technicalSite.site_photos
    : [];

  return {
    applicationId: app.id,
    step1: formData.step_1 || {},
    selectedTypes,
    selectedSubtype,
    derivedDepartments: getApplicationTypeTechnicalDepartmentsFromTypes(selectedTypes),
    technicalSite,
    sitePhotos,
  };
}

function shouldShowAutoScreeningDecisionLog(section = {}) {
  if (!section || typeof section !== "object") return false;

  const normalizedDecision = cleanRemark(getWorkspaceDecisionLogValue(section)).toLowerCase();
  return ![
    "pt(ikl) send to ku(ikl)",
    "pt(ikl) hantar kepada ku(ikl)",
  ].includes(normalizedDecision);
}

function getDecisionLogSignatureSource(signature) {
  if (!signature) return "";
  if (typeof signature === "string") return signature;
  if (typeof signature !== "object") return "";

  return String(
    signature.dataUrl ||
      signature.drawDataUrl ||
      signature.data_url ||
      signature.url ||
      signature.file_url ||
      signature.preview_url ||
      signature.source ||
      signature.items?.find?.((item) => String(item?.dataUrl || "").trim())?.dataUrl ||
      ""
  ).trim();
}

function hasDigitalSignatureContent(signature) {
  if (!signature) return false;
  if (typeof signature === "string") return Boolean(signature.trim());
  if (typeof signature !== "object") return false;

  if (
    Array.isArray(signature.items) &&
    signature.items.some((item) => String(item?.dataUrl || "").trim())
  ) {
    return true;
  }

  if (String(signature.drawDataUrl || "").trim()) return true;

  if (signature.mode === "draw") {
    return Boolean(String(signature.dataUrl || "").trim());
  }

  if (signature.mode === "upload") {
    return false;
  }

  return Boolean(getDecisionLogSignatureSource(signature));
}

function getWorkspaceDecisionLogSignature(section = {}) {
  if (!section || typeof section !== "object") return null;

  return (
    section.digital_signature ||
    section.digitalSignature ||
    section.signature ||
    section.signature_data ||
    null
  );
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
        digital_signature: data.screeningSignature || app.form_data?.auto_screening?.digital_signature || null,
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
        digital_signature: notSupported ? null : data.technicalSite?.digital_signature || null,
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
        digital_signature: amendmentRequired ? null : data.kuSignature || null,
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
    const kbVerificationSignature = rejected
      ? null
      : data.approvalSupportSignature ||
        app.form_data?.kb_les_verification?.digital_signature ||
        null;

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
          digital_signature: kbVerificationSignature,
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
    const mphlgSignature = approved
      ? data.approvalSupportSignature ||
        app.form_data?.mphlg_gateway?.digital_signature ||
        app.form_data?.approval?.digital_signature ||
        null
      : null;

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
          digital_signature: mphlgSignature,
          supporting_documents: data.mphlgSupportingDocuments || [],
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
              digital_signature: mphlgSignature,
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
      digital_signature: data.technicalSite?.digital_signature || null,
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
    getTechnicalAdvertisementOptionLabel(customLabel, language) ||
    getApplicationSubtypeLabel(rowType, subtype, language) ||
    customLabel;

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
  const shouldIncludeApprovalSupportStage =
    config?.key === "approval" && INTERNAL_WORK_TRACKING_DEPARTMENTS.has(department);
  const fallbackApplications = statuses.flatMap((status) => {
    const fallbackApp = {
      status,
      form_data: {},
    };

    if (!shouldIncludeApprovalSupportStage || status !== "management_review") {
      return [fallbackApp];
    }

    return [
      fallbackApp,
      {
        status: "management_review",
        form_data: {
          kb_les_verification: {
            status: "Verified",
          },
        },
      },
    ];
  });

  return fallbackApplications;
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
    listDescription: "Select an approved application to prepare the approval letter or review payment receipts.",
    listDescriptionKey: "workspace.payment.listDescription",
    eyebrow: "Payment",
    eyebrowKey: "workspace.payment.eyebrow",
    title: "Bill and Payment",
    titleKey: "workspace.payment.title",
    description: "PT(IKL) prepares approval letters, the applicant uploads payment proof, and PT(IKL) verifies the receipt.",
    descriptionKey: "workspace.payment.description",
    queueTitle: "Payment Queue",
    queueTitleKey: "workspace.payment.queue",
    actionDescription: "Prepare an approval letter, send it to the applicant, then verify whether the uploaded receipt is valid or fake.",
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
          const manualBill = savedApprovalLetter.manual_bill || null;
          const digitalSignature =
            data.approvalSupportSignature ||
            savedApprovalLetter.digital_signature ||
            null;

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
                manual_bill: manualBill,
                status: "Sent to Applicant",
                recommendation: decision,
                letter_bill_decision: decision,
                remarks,
                digital_signature: digitalSignature,
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
        isAvailable: (app, department) =>
          department === "PT(IKL)" && normalizeStatus(app?.status) === "payment_submitted",
        buildPayload: (app, data) => {
          const translate = data?.t || ((key, fallback) => fallback || key);
          const now = new Date();
          const timestamp = now.toISOString();
          const savedApprovalLetter = app.form_data?.approval_letter || {};
          const savedLicense = app.form_data?.license || {};
          const validityYears = Number(savedLicense.validity_years) || 1;
          const issueDate = parseDateOrFallback(savedLicense.issue_date, now);
          const expiryDate = parseDateOrFallback(
            savedLicense.expiry_date,
            addCalendarYears(issueDate, validityYears)
          );
          const licenseId = savedLicense.license_id || getLicenseId(app);
          const officialReceiptNo = getGeneratedOfficialReceiptNumber(app);
          const savedManualReceipt = savedApprovalLetter.manual_receipt || {};
          const savedManualLicense = savedLicense.manual_license || {};
          const { manual_license: _oldManualLicense, ...savedLicenseWithoutManualTemplate } =
            savedLicense || {};
          const nextLicenseBase = {
            ...savedLicenseWithoutManualTemplate,
            creation_mode: "generated",
            license_file: null,
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
          };
          const documentApp = {
            ...app,
            form_data: {
              ...(app.form_data || {}),
              approval_letter: {
                ...savedApprovalLetter,
                manual_receipt: {
                  ...savedManualReceipt,
                  receipt_no: officialReceiptNo,
                },
              },
              payment: {
                ...(app.form_data?.payment || {}),
                official_receipt_no: officialReceiptNo,
              },
              license: nextLicenseBase,
            },
          };
          const receiptDocumentHtml =
            savedManualReceipt.document_html || buildGeneratedOfficialReceiptDocumentHtml(documentApp);
          const licenseDocumentHtml =
            savedManualLicense.document_html || buildBlankAdvertisementLicenseDocumentHtml(documentApp, translate);

          return {
            status: "license_issued",
            latest_remark: "",
            form_data: mergeFormData(app, {
              approval_letter: {
                ...savedApprovalLetter,
                official_receipt_file: null,
                manual_receipt: {
                  ...savedManualReceipt,
                  template: "dbku_official_receipt_acc_3_88_v1",
                  name: "Official Receipt",
                  receipt_no: officialReceiptNo,
                  document_html: receiptDocumentHtml,
                  status: "Sent to Applicant",
                  generated_by: "PT(IKL)",
                  generated_at: timestamp,
                  saved_at: timestamp,
                  sent_at: timestamp,
                },
              },
              payment: {
                ...(app.form_data?.payment || {}),
                official_receipt_no: officialReceiptNo,
                status: "Payment Verified",
                recommendation: "Verify Receipt",
                receipt_decision: "Verify Receipt",
                verification_result: "Valid",
                verification_notes: "",
                internal_verification_notes: data.comment,
                digital_signature: data.approvalSupportSignature || app.form_data?.payment?.digital_signature || null,
                verified_at: timestamp,
              },
              license: {
                ...nextLicenseBase,
                manual_license: {
                  ...savedManualLicense,
                  template: "dbku_advertisement_license_borang_b_v1",
                  name: translate("workspace.license.documentTitle", "Advertisement License"),
                  document_html: licenseDocumentHtml,
                  status: "Sent to Applicant",
                  generated_by: "PT(IKL)",
                  generated_at: timestamp,
                  saved_at: timestamp,
                  sent_at: timestamp,
                },
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
          latest_remark: "",
          form_data: mergeFormData(app, {
            payment: {
              ...(app.form_data?.payment || {}),
              status: "Receipt Rejected",
              recommendation: "Reject Receipt",
              receipt_decision: "Reject Receipt",
              verification_result: "Invalid/Fake",
              verification_notes: "",
              internal_verification_notes: data.comment,
              digital_signature: null,
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
  technicalSignatureError,
  setTechnicalSignatureError,
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
  const [screeningSignature, setScreeningSignature] = useState(null);
  const [screeningSignatureError, setScreeningSignatureError] = useState("");
  const [kuDecisionInput, setKuDecisionInput] = useState("");
  const [kuDecisionError, setKuDecisionError] = useState("");
  const [kuRemarks, setKuRemarks] = useState("");
  const [kuSignature, setKuSignature] = useState(null);
  const [kuSignatureError, setKuSignatureError] = useState("");
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
  const useKuIklDecisionTemplate = userDepartment === "KU(IKL)" && showScreeningDecision;
  const showKuIklScreeningSignature =
    useKuIklDecisionTemplate &&
    getIklScreeningDecisionFromInput(
      screeningDecisionInput,
      screeningDecisionOptions,
      userDepartment,
      t
    ) === "KU(IKL) Confirm - Send to Technical Units";
  const requiresKuTechnicalSignature =
    showKuTechnicalReview &&
    kuDecision === "KU(IKL) Confirm - Send to KB(LES)";
  const selectedTechnicalAction = config.technicalActions.find(
    (action) => action.decision === technicalDecision
  );
  const requiresTechnicalFinalSignature =
    selectedTechnicalAction?.buildPayload === buildIklTechnicalDecisionPayload &&
    selectedTechnicalAction?.decision === "Supported";
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
    if (!useKuIklDecisionTemplate) {
      setScreeningSignature(null);
      setScreeningSignatureError("");
      return;
    }

    setScreeningSignature(selectedRecord.form_data?.auto_screening?.digital_signature || null);
    setScreeningSignatureError("");
  }, [
    selectedRecord.id,
    selectedRecord.form_data?.auto_screening?.digital_signature,
    useKuIklDecisionTemplate,
  ]);

  useEffect(() => {
    if (!showKuIklScreeningSignature && screeningSignatureError) {
      setScreeningSignatureError("");
    }
  }, [screeningSignatureError, showKuIklScreeningSignature]);

  useEffect(() => {
    if (!showKuTechnicalReview) {
      setKuSignature(null);
      setKuSignatureError("");
      return;
    }

    setKuSignature(selectedRecord.form_data?.technical_ku_review?.digital_signature || null);
    setKuSignatureError("");
  }, [
    selectedRecord.id,
    selectedRecord.form_data?.technical_ku_review?.digital_signature,
    showKuTechnicalReview,
  ]);

  useEffect(() => {
    if (!requiresKuTechnicalSignature && kuSignatureError) {
      setKuSignatureError("");
    }
  }, [kuSignatureError, requiresKuTechnicalSignature]);

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
    const savedReview = selectedRecord.form_data?.technical_ku_review || {};
    const savedDecision = savedReview.decision || savedReview.recommendation || "";
    const hasSavedDecision = config.kuTechnicalReview?.decisions?.some(
      (action) => action.value === savedDecision
    );

    setKuDecision(hasSavedDecision ? savedDecision : "");
    setKuDecisionInput(
      hasSavedDecision
        ? getKuTechnicalReviewDecisionInput(
            savedDecision,
            config.kuTechnicalReview.decisions,
            t
          )
        : ""
    );
    setKuRemarks(savedReview.remarks || savedReview.comment || "");
    setKuChecks(createKuTechnicalChecks(savedReview.checks));
    setKuDecisionError("");
  }, [
    config.kuTechnicalReview,
    selectedRecord.id,
    selectedRecord.form_data?.technical_ku_review,
    t,
  ]);

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
      setTechnicalDecisionError(t("workspace.technical.applicationTypeRequired", "Please select at least one application type."));
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

  function mergeTechnicalSiteWithCurrentSignature(nextSite, fallbackSite = latestTechnicalSiteRef.current) {
    if (!nextSite) return nextSite;
    if (Object.prototype.hasOwnProperty.call(nextSite, "digital_signature")) {
      return nextSite;
    }

    return {
      ...nextSite,
      digital_signature: fallbackSite?.digital_signature || null,
    };
  }

  function setTechnicalSitePreservingSignature(update) {
    setTechnicalSite((prev) => {
      const nextSite =
        typeof update === "function" ? update(prev) : update;
      const mergedSite = mergeTechnicalSiteWithCurrentSignature(nextSite, prev);
      latestTechnicalSiteRef.current = mergedSite;
      return mergedSite;
    });
  }

  function scheduleTechnicalSiteVisitDraftSave(nextSite) {
    const siteWithSignature = mergeTechnicalSiteWithCurrentSignature(nextSite);
    latestTechnicalSiteRef.current = siteWithSignature;

    if (technicalSiteSaveTimerRef.current) {
      window.clearTimeout(technicalSiteSaveTimerRef.current);
    }

    technicalSiteSaveTimerRef.current = window.setTimeout(() => {
      saveTechnicalSiteVisitDraft(siteWithSignature);
    }, 600);
  }

  function handleTechnicalFinalSignatureChange(nextSignature) {
    const nextSite = {
      ...latestTechnicalSiteRef.current,
      digital_signature: nextSignature,
    };
    latestTechnicalSiteRef.current = nextSite;
    setTechnicalSite((prev) => ({
      ...prev,
      digital_signature: nextSignature,
    }));
    scheduleTechnicalSiteVisitDraftSave(nextSite);
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

    if (requiresKuTechnicalSignature && !hasDigitalSignatureContent(kuSignature)) {
      setKuSignatureError(
        t("workspace.signature.required", "Digital signature is required.")
      );
      return;
    }

    submitAction(config.kuTechnicalReview.action, {
      decision: kuDecision,
      comment: kuRemarks,
      kuSignature,
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

    if (
      requiresTechnicalFinalSignature &&
      !hasDigitalSignatureContent(technicalSite.digital_signature)
    ) {
      setTechnicalSignatureError(
        t("workspace.signature.required", "Digital signature is required.")
      );
      return;
    }

    submitAction(selectedTechnicalAction, {
      comment: technicalSite.site_remarks,
      checkDecisionRemark: true,
    });
  }

  return (
    <div className="space-y-4 text-[13px] leading-5">
      {showScreeningDecision && (
        <section className="rounded-md border border-slate-200 bg-white p-2.5 text-[13px] leading-5">
          <div className="mb-2.5">
            <h3 className="text-[13px] font-semibold leading-5 text-slate-950">
              {t(screeningCopy.titleKey, screeningCopy.title)}
            </h3>
            <p className="mt-1 text-[13px] leading-5 text-slate-500">
              {t(screeningCopy.descriptionKey, screeningCopy.description)}
            </p>
          </div>

          <div className="space-y-3">
            {useKuIklDecisionTemplate ? (
              <div className="max-w-[56rem]">
                <span className="mb-1 block text-[13px] font-semibold leading-5 text-slate-900">
                  {t(config.decisionLabelKey || "common.decision", config.decisionLabel || "Your Recommendation")}
                </span>
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
                  className={`form-input form-input-sm w-full max-w-[17rem] bg-white text-[13px] ${screeningDecisionError ? "border-red-300 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(220,38,38,0.12)]" : ""}`}
                  placeholder={t("workspace.decision.typeApproveOrReject", "Type Approve or Reject")}
                  inputMode="text"
                  aria-invalid={Boolean(screeningDecisionError)}
                />
                {screeningDecisionError && (
                  <p className="mt-1.5 text-[13px] font-medium leading-5 text-red-600">
                    {screeningDecisionError}
                  </p>
                )}
              </div>
            ) : (
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
            )}

            {useKuIklDecisionTemplate ? (
              <div className="max-w-[56rem]">
                <label
                  htmlFor="ku-ikl-screening-remarks"
                  className="mb-1 block text-[13px] font-semibold leading-5 text-slate-900"
                >
                  {t(config.commentLabelKey, config.commentLabel || "Notes")}
                  <span className="ml-1 text-red-600">*</span>
                </label>
                <div
                  className={`relative min-h-[390px] bg-white ${commentError ? "shadow-[0_0_0_2px_rgba(220,38,38,0.18)]" : ""}`}
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(to bottom, transparent 0, transparent 25px, #1f2937 26px, transparent 27px)",
                  }}
                >
                  <textarea
                    id="ku-ikl-screening-remarks"
                    ref={screeningRemarksRef}
                    value={comment}
                    onChange={(event) => {
                      setComment(event.target.value);
                      if (commentError) setCommentError("");
                    }}
                    rows="12"
                    required
                    aria-required="true"
                    className="h-full min-h-[390px] w-full resize-y border-0 bg-white px-2 pb-0 pt-0 text-[13px] font-medium leading-[28px] text-slate-950 outline-none placeholder:text-transparent focus:border-0 focus:outline-none focus:ring-0"
                    placeholder={t(screeningCopy.placeholderKey, screeningCopy.placeholder)}
                    style={RULED_TEXTAREA_STYLE}
                  />
                </div>
                {commentError && (
                  <p className="mt-1.5 text-[13px] font-medium leading-5 text-red-600">
                    {commentError}
                  </p>
                )}
              </div>
            ) : (
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
            )}

            {showKuIklScreeningSignature && (
              <ApprovalSupportSignatureBox
                t={t}
                value={screeningSignature}
                error={screeningSignatureError}
                onChange={(nextSignature) => {
                  setScreeningSignature(nextSignature);
                  if (screeningSignatureError) setScreeningSignatureError("");
                }}
                onError={setScreeningSignatureError}
              />
            )}

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
                  const requiresScreeningSignature =
                    useKuIklDecisionTemplate &&
                    typedDecision === "KU(IKL) Confirm - Send to Technical Units";

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

                  if (requiresScreeningSignature && !hasDigitalSignatureContent(screeningSignature)) {
                    setScreeningSignatureError(
                      t("workspace.signature.required", "Digital signature is required.")
                    );
                    return;
                  }

                  setDecision(typedDecision);
                  submitAction(config.screeningAction, {
                    decision: typedDecision,
                    comment: cleanedComment,
                    checkDecisionRemark: false,
                    screeningSignature: requiresScreeningSignature ? screeningSignature : null,
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
            </>
          )}

          <TechnicalSiteVisitFields
            t={t}
            language={language}
            applicationId={selectedRecord.id}
            value={technicalSite}
            onChange={setTechnicalSitePreservingSignature}
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
            <div className="space-y-4">
              <div className="max-w-[56rem]">
                <span className="mb-1 block text-[13px] font-semibold leading-5 text-slate-900">
                  <span className="relative inline-flex items-center gap-1.5">
                    {t("workspace.technical.supportQuestion", "Your Recommendation")}
                    <TechnicalCalculationGuidelineHint
                      position="right"
                      text={t(
                        "workspace.technical.recommendationHelper",
                        "Yes = KU(IKL) final check; No = return to applicant."
                      )}
                    />
                  </span>
                </span>
                <input
                  ref={technicalDecisionInputRef}
                  type="text"
                  value={technicalDecisionInput}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setTechnicalDecisionInput(nextValue);
                    if (technicalDecisionError) setTechnicalDecisionError("");
                    if (technicalSignatureError) setTechnicalSignatureError("");
                    setTechnicalDecision(getTechnicalRecommendationDecision(nextValue));
                  }}
                  className={`form-input form-input-sm w-full max-w-[17rem] bg-white text-[13px] ${technicalDecisionError ? "border-red-300 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(220,38,38,0.12)]" : ""}`}
                  placeholder={t("workspace.technical.recommendationPlaceholder", "Type Yes or No")}
                  inputMode="text"
                  aria-invalid={Boolean(technicalDecisionError)}
                />
                {technicalDecisionError && (
                  <p className="mt-1.5 text-sm font-medium leading-5 text-red-600">
                    {technicalDecisionError}
                  </p>
                )}
              </div>

              <div className="max-w-[56rem]">
                <label
                  htmlFor="ikl-technical-final-remarks"
                  className="mb-1 block text-[13px] font-semibold leading-5 text-slate-900"
                >
                    {t("workspace.comment.remarks", "Remarks")}
                    <span className="ml-1 text-red-600">*</span>
                </label>
                <div
                  className={`relative min-h-[390px] bg-white ${commentError ? "shadow-[0_0_0_2px_rgba(220,38,38,0.18)]" : ""}`}
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(to bottom, transparent 0, transparent 25px, #1f2937 26px, transparent 27px)",
                  }}
                >
                  <textarea
                    id="ikl-technical-final-remarks"
                    ref={technicalRemarksRef}
                    value={technicalSite.site_remarks}
                    onChange={(event) => {
                      if (commentError) setCommentError("");
                      setTechnicalSite((prev) => ({
                        ...prev,
                        site_remarks: event.target.value,
                      }));
                    }}
                    rows="12"
                    required
                    aria-required="true"
                    aria-invalid={Boolean(commentError)}
                    className="h-full min-h-[390px] w-full resize-y border-0 bg-white px-2 pb-0 pt-0 text-[13px] font-medium leading-[28px] text-slate-950 outline-none placeholder:text-transparent focus:border-0 focus:outline-none focus:ring-0"
                    placeholder={t("workspace.technical.siteRemarksPlaceholder")}
                    style={RULED_TEXTAREA_STYLE}
                  />
                </div>
                {commentError && (
                  <p className="mt-1.5 text-sm font-medium leading-5 text-red-600">
                    {commentError}
                  </p>
                )}
              </div>

              {requiresTechnicalFinalSignature && (
                <ApprovalSupportSignatureBox
                  t={t}
                  value={technicalSite.digital_signature}
                  error={technicalSignatureError}
                  onChange={(nextSignature) => {
                    handleTechnicalFinalSignatureChange(nextSignature);
                    if (technicalSignatureError) setTechnicalSignatureError("");
                  }}
                  onError={setTechnicalSignatureError}
                />
              )}

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

          <section className="rounded-md border border-slate-200 bg-white p-3">
            <div className="space-y-4">
              <div className="max-w-[56rem]">
                <span className="mb-1 block text-[13px] font-semibold leading-5 text-slate-900">
                  {t("workspace.technical.supportQuestion", "Your Recommendation")}
                </span>
                <input
                  ref={kuDecisionInputRef}
                  type="text"
                  value={kuDecisionInput}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setKuDecisionInput(nextValue);
                    if (kuDecisionError) setKuDecisionError("");
                    if (kuSignatureError) setKuSignatureError("");
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
                  className={`form-input form-input-sm w-full max-w-[30rem] bg-white text-[13px] ${kuDecisionError ? "border-red-300 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(220,38,38,0.12)]" : ""}`}
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
              </div>

              <div className="max-w-[56rem]">
                <label
                  htmlFor="ku-technical-review-remarks"
                  className="mb-1 block text-[13px] font-semibold leading-5 text-slate-900"
                >
                    {t("workspace.comment.remarks")}
                    <span className="ml-1 text-red-600">*</span>
                </label>
                <div
                  className={`relative min-h-[390px] bg-white ${commentError ? "shadow-[0_0_0_2px_rgba(220,38,38,0.18)]" : ""}`}
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(to bottom, transparent 0, transparent 25px, #1f2937 26px, transparent 27px)",
                  }}
                >
                  <textarea
                    id="ku-technical-review-remarks"
                    ref={kuRemarksRef}
                    value={kuRemarks}
                    onChange={(event) => {
                      setKuRemarks(event.target.value);
                      if (commentError) setCommentError("");
                    }}
                    rows="12"
                    required
                    aria-required="true"
                    aria-invalid={Boolean(commentError)}
                    className="h-full min-h-[390px] w-full resize-y border-0 bg-white px-2 pb-0 pt-0 text-[13px] font-medium leading-[28px] text-slate-950 outline-none placeholder:text-transparent focus:border-0 focus:outline-none focus:ring-0"
                    placeholder={t("workspace.technical.kuReviewPlaceholder")}
                    style={RULED_TEXTAREA_STYLE}
                  />
                </div>
                {commentError && (
                  <p className="mt-1.5 text-[13px] font-medium leading-5 text-red-600">
                    {commentError}
                  </p>
                )}
              </div>

              {requiresKuTechnicalSignature && (
                <ApprovalSupportSignatureBox
                  t={t}
                  value={kuSignature}
                  error={kuSignatureError}
                  onChange={(nextSignature) => {
                    setKuSignature(nextSignature);
                    if (kuSignatureError) setKuSignatureError("");
                  }}
                  onError={setKuSignatureError}
                />
              )}

              <div className="flex justify-end border-t border-slate-100 pt-3">
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

function SitePhotoPreview({ photo, applicationId, alt }) {
  const source = getSitePhotoSource(photo, applicationId);
  const format = getTechnicalSitePhotoFormat(photo);
  const isImage = source && format !== "PDF";

  return (
    <div className="flex aspect-video items-center justify-center bg-slate-50">
      {isImage ? (
        <img
          src={source}
          alt={alt}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-slate-500">
          <Icon name={format === "PDF" ? "picture_as_pdf" : "image"} className="text-3xl" />
          <span className="text-xs font-semibold">{format || "File"}</span>
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
  if (["yes", "ya"].includes(normalized)) return "Supported";
  if (["no", "tidak"].includes(normalized)) return "Not Supported";
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

      <TechnicalFeeScheduleReference scheduleNumbers={scheduleNumbers} language={language} />

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

function TechnicalFeeScheduleReference({ scheduleNumbers = [], language = "en" }) {
  const visibleSchedules = scheduleNumbers.length > 0 ? scheduleNumbers : ["1"];
  const labels = getDecisionLogTechnicalLabels(language);

  return (
    <div className="mt-2 rounded-sm border border-slate-300 bg-white px-3 py-3 text-sm leading-5 text-slate-950">
      <div className="mb-3 text-center">
        <div className="mx-auto flex max-w-[420px] items-center justify-center gap-3">
          <span className="h-px flex-1 bg-slate-900" />
          <div>
            <p className="italic">{labels.scheduleTitle}</p>
            <p className="text-[18px] font-bold leading-6">{labels.scheduleFeesTitle}</p>
            <p className="font-bold">{labels.scheduleBylaws}</p>
          </div>
          <span className="h-px flex-1 bg-slate-900" />
        </div>
      </div>

      <div className="grid gap-x-7 gap-y-1 lg:grid-cols-[44px_minmax(0,1.2fr)_minmax(0,1.35fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]">
        <div aria-hidden="true" />
        <p className="text-center italic">{labels.scheduleAdvertisementType}</p>
        <p className="text-center italic">{labels.scheduleFeePayable}</p>
        <p className="text-center italic">{labels.scheduleCityCouncil}</p>
        <p className="text-center italic">{labels.scheduleDistrictCouncil}</p>

        {visibleSchedules.map((scheduleNumber) => (
          <TechnicalFeeScheduleBlock key={scheduleNumber} scheduleNumber={scheduleNumber} language={language} />
        ))}
      </div>
    </div>
  );
}

function TechnicalFeeScheduleBlock({ scheduleNumber, language = "en" }) {
  const isLedSchedule = String(scheduleNumber) === "6";
  const labels = getDecisionLogTechnicalLabels(language);
  const typeDescription = isLedSchedule ? labels.schedule6AdvertisementDesc : labels.scheduleAdvertisementDesc;
  const firstAreaText = isLedSchedule ? labels.schedule6FirstArea : labels.scheduleFirstArea;
  const additionalAreaText = isLedSchedule ? labels.schedule6AdditionalArea : labels.scheduleAdditionalArea;
  const firstCityRate = isLedSchedule ? labels.schedule6CityFirstRate : labels.scheduleCityFirstRate;
  const firstDistrictRate = isLedSchedule ? labels.schedule6DistrictFirstRate : labels.scheduleDistrictFirstRate;
  const additionalCityRate = isLedSchedule ? labels.schedule6CityAdditionalRate : labels.scheduleCityAdditionalRate;
  const additionalDistrictRate = isLedSchedule ? labels.schedule6DistrictAdditionalRate : labels.scheduleDistrictAdditionalRate;

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
            <p>{labels.schedule6DeviceSet}</p>
          </div>
        )}
      </div>
      <div className={`grid self-start gap-y-1 ${isLedSchedule ? "pt-4" : ""}`}>
        <p>{firstCityRate}</p>
        <p>{additionalCityRate}</p>
        {isLedSchedule && <p>{labels.schedule6CityDeviceRate}</p>}
      </div>
      <div className={`grid self-start gap-y-1 ${isLedSchedule ? "pt-4" : ""}`}>
        <p>{firstDistrictRate}</p>
        <p>{additionalDistrictRate}</p>
        {isLedSchedule && <p>{labels.schedule6DistrictDeviceRate}</p>}
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

function TechnicalCalculationGuidelineHint({ text, position = "below" }) {
  const tooltipPositionClass =
    position === "right"
      ? "left-full top-1/2 ml-2 -translate-y-1/2"
      : "left-0 top-5";

  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={text}
      className="group/icon inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full border border-slate-400 bg-white text-[10px] font-black leading-none text-slate-600 outline-none hover:border-[#006d32] hover:text-[#006d32] focus:border-[#006d32] focus:text-[#006d32]"
    >
      i
      <span className={`pointer-events-none absolute z-40 hidden w-[min(18rem,calc(100vw-2rem))] rounded border border-slate-200 bg-white px-3 py-2 text-left text-[11px] font-medium leading-4 text-slate-700 shadow-lg group-hover/icon:block group-focus/icon:block ${tooltipPositionClass}`}>
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

  if (source.startsWith("blob:") || source.startsWith("data:")) {
    return { url: source, revoke: false };
  }

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
  async function downloadPhoto() {
    const { url, revoke } = await getSitePhotoBlobUrl(photo, applicationId);
    if (!url) return;

    const title = photo?.name || "site-photo";

    if (isTechnicalSitePhotoPdf(photo)) {
      await printUrlDocument(url, title);
    } else {
      await printHtmlDocument(
        buildPaymentReceiptPrintHtml(photo, url, title),
        title
      );
    }

    if (revoke) {
      setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
    }
  }

  const actions = [
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

function getDefaultPaymentDocumentTab(app) {
  return canViewLicense(app) ? "qr" : "bank";
}

function PaymentDetails({
  app,
  t,
  userDepartment,
  saving,
  onPaymentDocumentUpload,
  onPaymentDocumentDelete,
  onEditApprovalLetter,
  onEditBill,
  onEditReceipt,
  onEditLicense,
  onLicenseDocumentUpload,
  onLicenseDocumentDelete,
  onOpenForm,
  paymentReceiptDecision = "",
  readOnly = false,
}) {
  const payment = app.form_data?.payment || {};
  const approvalLetter = app.form_data?.approval_letter || {};
  const license = app.form_data?.license || {};
  const receiptFile = payment.receipt_file;
  const receiptSource = getPaymentReceiptSource(receiptFile);
  const letterFile = getStoredPaymentDocument(app, "letter");
  const manualLetter = approvalLetter.manual_letter || {};
  const billFile = getStoredPaymentDocument(app, "bill");
  const manualBill = approvalLetter.manual_bill || {};
  const manualReceipt = approvalLetter.manual_receipt || {};
  const officialReceiptFile =
    getStoredPaymentDocument(app, "official_receipt") ||
    approvalLetter.official_receipt_file ||
    null;
  const licenseFile = license.license_file || null;
  const manualLicense = license.manual_license || {};
  const status = normalizeStatus(app?.status);
  const canUploadDocuments =
    !readOnly && userDepartment === "PT(IKL)" && status === "approved";
  const isReceiptVerification =
    !readOnly && userDepartment === "PT(IKL)" && status === "payment_submitted";
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

  const canShowSavedIssueDocuments =
    readOnly ||
    isIssuedLicenseView ||
    isReceiptVerification ||
    ["payment_verified", "license_issued", "license_revoked"].includes(status);
  const showOfficialReceiptSection =
    showVerificationUploads || (canShowSavedIssueDocuments && Boolean(officialReceiptFile));
  const showLicenseDocumentSection =
    showVerificationUploads || (canShowSavedIssueDocuments && Boolean(licenseFile));
  const showQrPanel = false;
  const defaultPaymentDocumentTab = getDefaultPaymentDocumentTab(app);
  const [activePaymentDocumentTab, setActivePaymentDocumentTab] = useState(defaultPaymentDocumentTab);
  const [generatedDocumentReview, setGeneratedDocumentReview] = useState(null);

  useEffect(() => {
    setActivePaymentDocumentTab(defaultPaymentDocumentTab);
  }, [app?.id, defaultPaymentDocumentTab]);

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

  const documentPreviewSection = (
    <PaymentApprovalDocumentTabs
      app={app}
      t={t}
      activeTab={activePaymentDocumentTab}
      onTabChange={setActivePaymentDocumentTab}
    />
  );

  const documentSection = (
    <section className="rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-3 py-3">
        <div>
          <p className="text-[13px] font-semibold uppercase leading-5 tracking-wide text-slate-500">
            {t("workspace.payment.documents", "List of Document")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 py-3">
        <ApprovalLetterDocumentSlot
          app={app}
          label={t("workspace.payment.approvalLetter", "Approval Letter")}
          file={letterFile}
          t={t}
          canUpload={canUploadDocuments}
          required={canUploadDocuments}
          saving={saving}
          onDelete={() => onPaymentDocumentDelete?.("letter", letterFile)}
          onEditManualLetter={onEditApprovalLetter}
        />
        <BillDocumentSlot
          app={app}
          label={t("workspace.payment.billDocument", "Bill")}
          file={billFile}
          t={t}
          canEdit={canUploadDocuments}
          required={canUploadDocuments}
          saving={saving}
          onDelete={() => onPaymentDocumentDelete?.("bill", billFile)}
          onEditManualBill={onEditBill}
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
              icon="download"
              className="min-h-9 px-3 py-1 text-xs"
              onClick={() =>
                printPaymentReceiptDocument(
                  receiptFile,
                  payment.receipt_reference || t("workspace.payment.receiptFileName", "receipt.pdf"),
                  `${getApplicationReference(app)} ${t("workspace.payment.applicantReceipt", "Applicant Receipt")}`,
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
          label: t("applicant.applicationForm", "Application Form"),
          displayName: t("workspace.applicationDetails", "Application Details"),
          available: true,
          type: "application_form",
          onView: onOpenForm,
        },
        {
          label: t("workspace.payment.approvalLetter", "Approval Letter"),
          file: letterFile,
          available: hasManualApprovalLetter(app),
          displayName: manualLetter.name || t("workspace.payment.approvalLetter", "Approval Letter"),
          onDownload: () => printManualApprovalLetterDocument(app, t),
        },
        {
          label: t("workspace.payment.billDocument", "Bill"),
          file: billFile,
          available: hasManualBill(app),
          displayName: manualBill.name || t("workspace.payment.billDocument", "Bill"),
          onDownload: () => printManualBillDocument(app, t),
        },
        {
          label: t("workspace.payment.manual.officialReceiptTitle", "Official Receipt"),
          file: officialReceiptFile,
          available: Boolean(manualReceipt.document_html || manualReceipt.saved_at),
          displayName: manualReceipt.name || t("workspace.payment.manual.officialReceiptTitle", "Official Receipt"),
          onDownload: () => printGeneratedOfficialReceiptDocument(app, t),
        },
        {
          label: t("workspace.license.documentTitle", "Advertisement License"),
          file: licenseFile,
          available: Boolean(manualLicense.document_html || manualLicense.saved_at),
          displayName: manualLicense.name || t("workspace.license.documentTitle", "Advertisement License"),
          onDownload: () => printBlankAdvertisementLicenseDocument(app, t),
        },
      ]}
    />
  ) : null;
  const issuedReceiptSection = isIssuedLicenseView && showReceiptDetails ? (
    <IssuedPaymentReceiptSection
      app={app}
      t={t}
      receiptFile={receiptFile}
      receiptSource={receiptSource}
      payment={payment}
    />
  ) : null;
  const verificationDocuments = [
    {
      label: t("workspace.payment.manual.officialReceiptTitle", "Official Receipt"),
      required: showVerificationUploads,
      displayName: t(
        "workspace.payment.officialReceiptGeneratedWithLicense",
        "Please review the auto-generated official receipt before issuing the license."
      ),
      onReview: onEditReceipt,
      onDownload: () => printGeneratedOfficialReceiptDocument(app, t),
    },
    {
      label: t("workspace.license.documentTitle", "Advertisement License"),
      required: showVerificationUploads,
      displayName: t(
        "workspace.license.generatedWithReceipt",
        "Please review the auto-generated advertisement license before issuing it to the applicant."
      ),
      onReview: onEditLicense,
      onDownload: () => printBlankAdvertisementLicenseDocument(app, t),
    },
  ];

  const verificationDocumentSection = showVerificationUploads ? (
    <PaymentVerificationDocumentList
      t={t}
      saving={saving}
      documents={verificationDocuments}
    />
  ) : null;

  return (
    <>
      <div className={showQrPanel ? "grid gap-4 text-sm lg:grid-cols-[minmax(240px,0.85fr)_minmax(0,1.75fr)]" : "text-sm"}>
        {showQrPanel && <PaymentQrPanel app={app} t={t} />}

        <div className="space-y-4">
          {isIssuedLicenseView ? (
            <div className="rounded-md border border-slate-200 bg-white">
              <div className="grid items-start gap-4 p-4 lg:grid-cols-[max-content_minmax(0,1fr)]">
                {documentPreviewSection}
                <div className="space-y-4">
                  {issuedDocumentSection}
                  {issuedReceiptSection}
                </div>
              </div>
            </div>
          ) : isReceiptVerification ? (
            <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
              {documentPreviewSection}
              <div className="space-y-4">
                {verificationDocumentSection}
                {receiptSection}
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
                {documentPreviewSection}
                <div className="space-y-4">
                  {documentSection}
                  {receiptSection}
                </div>
              </div>
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

      {generatedDocumentReview && (
        <GeneratedDocumentReviewModal
          document={generatedDocumentReview}
          t={t}
          saving={saving}
          onClose={() => setGeneratedDocumentReview(null)}
        />
      )}
    </>
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
  const availableDocuments = documents.filter((item) =>
    getPaymentDocumentSource(item.file) || item.available || item.onView || item.onDownload
  );

  return (
    <section className="rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-3 py-2">
        <h4 className="text-sm font-semibold text-slate-950">
          {t("applicant.paymentDocumentsTitle", "Documents to Download")}
        </h4>
        <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
          {t("applicant.paymentDocumentsDesc", "Download the documents from ALiS before making payment.")}
        </p>
      </div>

      <div className="divide-y divide-slate-200">
        {availableDocuments.map((item) => (
          <div
            key={item.label}
            className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold uppercase text-slate-500">
                {item.label}
              </p>
              {item.type === "application_form" && (
                <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                  {item.displayName || item.label}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {item.type === "application_form" ? (
                <Button
                  type="button"
                  variant="secondary"
                  icon="visibility"
                  className="min-h-9 px-3 py-1 text-xs"
                  onClick={() => item.onView?.()}
                >
                  {t("common.view", "View")}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  icon="download"
                  className="min-h-9 px-3 py-1 text-xs"
                  onClick={() => {
                    if (item.onDownload) {
                      item.onDownload();
                      return;
                    }
                    downloadPaymentDocument(item.file, item.label, t);
                  }}
                >
                  {t("common.download", "Download")}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function IssuedPaymentReceiptSection({ app, t, receiptFile, receiptSource, payment }) {
  if (!receiptSource && !receiptFile?.name && !payment?.receipt_reference) return null;

  return (
    <section className="rounded-md border border-slate-200 bg-slate-50">
      <div className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-sm font-semibold text-slate-950">
            {t("applicant.paymentReceipt", "Payment Receipt")}
          </h4>
          <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
            {t("applicant.paymentCompleteQrReady", "Payment is complete and QR e-license is ready to download.")}
          </p>
        </div>
      </div>

      <div className="border-t border-slate-200 bg-white px-3 py-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-xs font-bold text-emerald-700 ring-1 ring-emerald-100">
            1
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">
                {receiptFile?.name || payment?.receipt_reference || t("workspace.info.notSubmitted")}
              </p>
            </div>
          </div>

          {receiptSource && (
            <Button
              type="button"
              variant="secondary"
              icon="download"
              className="min-h-9 px-3 py-1 text-xs"
              onClick={() =>
                printPaymentReceiptDocument(
                  receiptFile,
                  payment?.receipt_reference || t("workspace.payment.receiptFileName", "receipt.pdf"),
                  `${getApplicationReference(app)} ${t("workspace.payment.applicantReceipt", "Applicant Receipt")}`,
                  t
                )
              }
            >
              {t("common.download", "Download")}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

function PaymentVerificationDocumentList({ t, documents, saving }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-3 py-3">
        <p className="text-[13px] font-semibold uppercase leading-5 tracking-wide text-slate-500">
          {t("workspace.payment.documents", "List of Document")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 py-3">
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
  return (
    <AutoGeneratedPaymentDocumentSlot
      label={item.label}
      t={t}
      required={item.required}
      saving={saving}
      displayName={item.displayName}
      onReview={item.onReview}
      onDownload={item.onDownload}
    />
  );
}

function AutoGeneratedPaymentDocumentSlot({
  label,
  t,
  required = false,
  saving,
  displayName = "",
  onReview,
  onDownload,
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-slate-50 py-3 pl-3 pr-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold uppercase leading-5 tracking-wide text-slate-500">
          {label}
          {required && <span className="ml-1 text-red-600">*</span>}
        </p>
        {displayName && (
          <p className="mt-1 truncate text-sm font-semibold text-slate-950">
            {displayName}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          icon="download"
          className="min-h-9 px-3 py-1 text-xs"
          disabled={saving}
          onClick={onDownload}
        >
          {t("common.download", "Download")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          icon="edit"
          className="min-h-9 px-3 py-1 text-xs"
          disabled={saving}
          onClick={onReview}
        >
          {t("workspace.payment.reviewGeneratedDocument", "Review")}
        </Button>
      </div>
    </div>
  );
}

function GeneratedDocumentReviewModal({ document, t, saving, onClose, onSave }) {
  const html = hidePrintActionsInReviewDocument(document?.html || "", document?.scale);
  const iframeRef = useRef(null);
  const [iframeHeight, setIframeHeight] = useState(720);

  useEffect(() => {
    setIframeHeight(720);
  }, [html]);

  const resizeIframe = useCallback(() => {
    const frameDocument = iframeRef.current?.contentDocument;
    if (!frameDocument) return;

    const nextHeight = Math.max(
      frameDocument.documentElement?.scrollHeight || 0,
      frameDocument.body?.scrollHeight || 0,
      720
    );
    setIframeHeight(Math.ceil(nextHeight + 18));
  }, []);

  function handleIframeLoad() {
    if (document?.editable) {
      const frameDocument = iframeRef.current?.contentDocument;
      if (frameDocument) {
        prepareEditableGeneratedDocument(frameDocument, document?.kind);
      }
    }
    resizeIframe();
    window.setTimeout(resizeIframe, 300);
  }

  function handleSave() {
    if (!document?.editable || !onSave) {
      onClose?.();
      return;
    }

    const frameDocument = iframeRef.current?.contentDocument;
    const nextHtml = stripReviewDocumentCss(
      frameDocument?.documentElement?.outerHTML || document?.html || ""
    );
    onSave(nextHtml);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 py-6">
      <div className="max-h-[92vh] w-full max-w-[min(96vw,72rem)] overflow-hidden rounded-md bg-white shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <p className="text-[13px] font-semibold leading-5 text-slate-950">
              {document?.title || t("workspace.payment.reviewGeneratedDocument", "Review")}
            </p>
            <p className="mt-0.5 text-xs font-medium text-slate-500">
              {document?.reference}
            </p>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2">
            <Button
              type="button"
              variant="primary"
              icon="save"
              className="min-h-9 px-3 py-1.5"
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? t("workspace.saving", "Saving...") : t("common.save", "Save")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              icon="close"
              className="min-h-9 w-9 px-0 py-0"
              disabled={saving}
              onClick={onClose}
              aria-label={t("common.close", "Close")}
              title={t("common.close", "Close")}
            />
          </div>
        </div>

        <div className="max-h-[calc(92vh-64px)] overflow-y-auto bg-slate-100 px-4 py-5">
          <div className={document?.allowHorizontalScroll ? "overflow-x-auto" : ""}>
            <iframe
              ref={iframeRef}
              title={document?.title || "Generated document preview"}
              srcDoc={html}
              scrolling="no"
              onLoad={handleIframeLoad}
              style={{ height: `${iframeHeight}px` }}
              className={`mx-auto block border-0 bg-transparent ${
                document?.allowHorizontalScroll ? "w-[1050px] max-w-none" : "w-full max-w-[58rem]"
              }`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function hidePrintActionsInReviewDocument(html, scale = 0.72) {
  if (!html) return "";
  const safeScale = Number.isFinite(Number(scale)) ? Number(scale) : 0.72;
  const reviewCss = `<style data-generated-review-css="true">
    @media screen {
      html { background: #f1f5f9 !important; }
      body {
        margin: 0 !important;
        background: #f1f5f9 !important;
        overflow: ${safeScale >= 0.85 ? "visible" : "hidden"} !important;
        zoom: ${safeScale};
      }
      .print-actions { display: none !important; }
      .receipt-page,
      .page,
      .ad-license-page {
        margin-left: auto !important;
        margin-right: auto !important;
        box-shadow: 0 1px 4px rgba(15, 23, 42, .12) !important;
      }
    }
  </style>`;
  return html.includes("</head>")
    ? html.replace("</head>", `${reviewCss}</head>`)
    : `${reviewCss}${html}`;
}

function stripReviewDocumentCss(html) {
  return String(html || "").replace(
    /<style\s+data-generated-review-css=["']true["'][^>]*>[\s\S]*?<\/style>/gi,
    ""
  )
    .replace(/\scontenteditable=["']true["']/gi, "")
    .replace(/\sspellcheck=["']false["']/gi, "")
    .replace(/\sdata-receipt-editable=["']true["']/gi, "");
}

function prepareEditableGeneratedDocument(frameDocument, kind = "") {
  frameDocument.designMode = "off";
  const editableSelector =
    kind === "advertisement_license"
      ? ".ad-license-page .dot-line"
      : [
          ".dots",
          ".solid-line",
          ".blank-line",
          "tbody td:not(.total-label)",
          ".number span",
          ".signature .line",
        ].join(",");

  frameDocument.querySelectorAll(editableSelector).forEach((field) => {
    field.setAttribute("contenteditable", "true");
    field.setAttribute("spellcheck", "false");
    field.setAttribute("data-receipt-editable", "true");
    if (kind !== "advertisement_license" && !field.matches(".number span")) {
      field.style.fontFamily = "Calibri, Arial, sans-serif";
    }
    field.addEventListener("paste", handleEditableDocumentPaste);
  });
}

function handleEditableDocumentPaste(event) {
  const text = event.clipboardData?.getData("text/plain") || "";
  if (!text) return;

  event.preventDefault();
  event.currentTarget?.ownerDocument?.execCommand?.("insertText", false, text);
}

function PaymentApprovalDocumentTabs({
  app,
  t,
  activeTab = "bank",
  onTabChange,
}) {
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
    <section className="w-full max-w-[360px] self-start lg:w-[360px]">
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
                <PaymentBankAccountContent t={t} />
              </div>
            </div>
          ) : (
            <PaymentQrELicenseContent
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

function PaymentBankAccountContent({ t }) {
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

function PaymentQrELicenseContent({
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
        onClick={() => downloadPaymentQrCode(qrContainerRef.current, displayReference)}
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

function ApprovalLetterDocumentSlot({
  app,
  label,
  file,
  t,
  canUpload,
  required = false,
  saving,
  onDelete,
  onEditManualLetter,
}) {
  const fileSource = getPaymentDocumentSource(file);
  const manualReady = hasManualApprovalLetter(app);
  const displayName =
    file?.name ||
    (canUpload
      ? t(
          "workspace.payment.approvalLetterDraftRequired",
          "Please review the auto-generated approval letter before sending it to the applicant."
        )
      : "");

  return (
    <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-slate-50 py-3 pl-3 pr-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold uppercase leading-5 tracking-wide text-slate-500">
          {label}
          {required && <span className="ml-1 text-red-600">*</span>}
        </p>
        {displayName && (
          <p className="mt-1 truncate text-sm font-semibold text-slate-950">
            {displayName}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {fileSource && (
          <>
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

        {!fileSource && manualReady && (
          <>
            <Button
              type="button"
              variant="secondary"
              icon="download"
              className="min-h-9 px-3 py-1 text-xs"
              onClick={() => printManualApprovalLetterDocument(app, t)}
            >
              {t("common.download", "Download")}
            </Button>
          </>
        )}

        {canUpload && (
          <Button
            type="button"
            variant="secondary"
            icon="edit"
            className="min-h-9 px-3 py-1 text-xs"
            disabled={saving}
            onClick={onEditManualLetter}
          >
            {t("workspace.payment.reviewApprovalLetter", "Review Approval Letter")}
          </Button>
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

function BillDocumentSlot({
  app,
  label,
  file,
  t,
  canEdit,
  required = false,
  saving,
  onDelete,
  onEditManualBill,
}) {
  const fileSource = getPaymentDocumentSource(file);
  const manualReady = hasManualBill(app);
  const displayName =
    file?.name ||
    (canEdit
      ? t("workspace.payment.billGeneratedWithLetter", "The bill will be prepared with the approval letter.")
      : "");

  return (
    <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-slate-50 py-3 pl-3 pr-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold uppercase leading-5 tracking-wide text-slate-500">
          {label}
          {required && <span className="ml-1 text-red-600">*</span>}
        </p>
        {displayName && (
          <p className="mt-1 truncate text-sm font-semibold text-slate-950">
            {displayName}
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

        {!fileSource && manualReady && (
          <Button
            type="button"
            variant="secondary"
            icon="download"
            className="min-h-9 px-3 py-1 text-xs"
            onClick={() => printManualBillDocument(app, t)}
          >
            {t("common.download", "Download")}
          </Button>
        )}

        {canEdit && (
          <Button
            type="button"
            variant="secondary"
            icon="edit"
            className="min-h-9 px-3 py-1 text-xs"
            disabled={saving}
            onClick={onEditManualBill}
          >
            {t("workspace.payment.reviewBill", "Review Bill")}
          </Button>
        )}

        {canEdit && fileSource && (
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

function PaymentDocumentSlot({ label, file, t, canUpload, required = false, saving, onFileChange, onDelete, emptyText }) {
  const fileSource = getPaymentDocumentSource(file);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold uppercase leading-5 tracking-wide text-slate-500">
          {label}
          {required && <span className="ml-1 text-red-600">*</span>}
        </p>
        <p className="mt-1 truncate text-sm font-semibold text-slate-950">
          {file?.name || emptyText || t("workspace.info.notUploaded", "Not uploaded")}
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

function buildPaymentReceiptPrintHtml(receipt, url, title) {
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

  return null;
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

async function downloadPaymentDocument(file, fallbackLabel, t, options = {}) {
  const source = getPaymentDocumentSource(file);
  if (!source) return;

  try {
    const isInlineFile = source.startsWith("blob:") || source.startsWith("data:");
    const url = isInlineFile
      ? source
      : URL.createObjectURL(await fetchAuthenticatedBlob(source));
    const title = getPaymentDownloadFilename(file?.name || fallbackLabel, "document");

    if (options.directDownload) {
      triggerPaymentDownload(url, title);
    } else if (isImageReceipt(file, source)) {
      await printHtmlDocument(
        buildPaymentReceiptPrintHtml({ ...(file || {}), name: title }, url, title),
        title
      );
    } else {
      await printUrlDocument(url, title);
    }

    if (!isInlineFile) {
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  } catch (error) {
    console.error("Failed to download payment document:", error);
    window.alert(t("workspace.payment.documentViewFailed", "Unable to open the document. Please try again."));
  }
}

async function printPaymentReceiptDocument(file, fallbackLabel, title, t) {
  const source = getPaymentReceiptSource(file);
  if (!source) return;

  try {
    const isInlineFile = source.startsWith("blob:") || source.startsWith("data:");
    const url = isInlineFile
      ? source
      : URL.createObjectURL(await fetchAuthenticatedBlob(source));

    if (isImageReceipt(file, source)) {
      await printHtmlDocument(
        buildPaymentReceiptPrintHtml({ ...(file || {}), name: file?.name || fallbackLabel }, url, title),
        title
      );
    } else {
      await printUrlDocument(url, title);
    }

    if (!isInlineFile) {
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  } catch (error) {
    console.error("Failed to print payment receipt:", error);
    window.alert(t("workspace.info.receiptViewFailed", "Unable to open the receipt. Please try again."));
  }
}

function openHtmlPreviewDocument(html, title, t) {
  const previewUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const preview = window.open(previewUrl, "_blank");

  if (!preview) {
    URL.revokeObjectURL(previewUrl);
    window.alert(t("workspace.payment.documentViewFailed", "Unable to open the document. Please try again."));
    return;
  }

  preview.document.title = title;
  window.setTimeout(() => URL.revokeObjectURL(previewUrl), 5 * 60 * 1000);
}

export function getGeneratedOfficialReceiptDocumentHtml(app) {
  const manualReceipt = app?.form_data?.approval_letter?.manual_receipt || {};
  return manualReceipt.document_html || buildGeneratedOfficialReceiptDocumentHtml(app);
}

function getEditedOfficialReceiptNumber(html) {
  const match = String(html || "").match(/<div[^>]*class=["'][^"']*\bnumber\b[^"']*["'][^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i);
  const text = match?.[1]
    ?.replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .trim();
  return text || "";
}

function openGeneratedOfficialReceiptDocument(app, t) {
  try {
    openHtmlPreviewDocument(
      getGeneratedOfficialReceiptDocumentHtml(app),
      `${getApplicationReference(app)} ${t("workspace.payment.manual.officialReceiptTitle", "Official Receipt")}`,
      t
    );
  } catch (error) {
    console.error("Failed to open official receipt:", error);
    window.alert(t("workspace.payment.documentViewFailed", "Unable to open the document. Please try again."));
  }
}

function openGeneratedAdvertisementLicenseDocument(app, t) {
  try {
    openHtmlPreviewDocument(
      getGeneratedAdvertisementLicenseDocumentHtml(app, t),
      `${getApplicationReference(app)} ${t("workspace.license.documentTitle", "Advertisement License")}`,
      t
    );
  } catch (error) {
    console.error("Failed to open advertisement license:", error);
    window.alert(t("workspace.payment.documentViewFailed", "Unable to open the document. Please try again."));
  }
}

async function printGeneratedOfficialReceiptDocument(app, t) {
  try {
    await printHtmlDocument(
      getGeneratedOfficialReceiptDocumentHtml(app),
      `${getApplicationReference(app)} ${t("workspace.payment.manual.officialReceiptTitle", "Official Receipt")}`
    );
  } catch (error) {
    console.error("Failed to print official receipt:", error);
    window.alert(t("workspace.payment.documentViewFailed", "Unable to open the document. Please try again."));
  }
}

async function printBlankAdvertisementLicenseDocument(app, t) {
  try {
    await printHtmlDocument(
      getGeneratedAdvertisementLicenseDocumentHtml(app, t),
      `${getApplicationReference(app)} ${t("workspace.license.documentTitle", "Advertisement License")}`
    );
  } catch (error) {
    console.error("Failed to print advertisement license:", error);
    window.alert(t("workspace.payment.documentViewFailed", "Unable to open the document. Please try again."));
  }
}

export function getGeneratedAdvertisementLicenseDocumentHtml(app, t) {
  const manualLicense = app?.form_data?.license?.manual_license || {};
  return manualLicense.document_html || buildBlankAdvertisementLicenseDocumentHtml(app, t);
}

function buildBlankAdvertisementLicenseDocumentHtml(app, t) {
  const title = `${getApplicationReference(app)} ${t("workspace.license.documentTitle", "Advertisement License")}`;
  const license = app?.form_data?.license || {};
  const manualLicense = license.manual_license || {};
  const logoUrl = getPublicAssetUrl("/logo-dbku.png");
  const terms = getAdvertisementLicenseAttachmentTerms(manualLicense.terms);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; }
    .ad-license-page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto 12px;
      background: #fff;
      padding: 24mm 16mm 20mm;
      page-break-after: always;
      break-after: page;
      overflow: hidden;
    }
    .ad-license-page:last-of-type { page-break-after: auto; break-after: auto; }
    .license-header { text-align: center; }
    .license-logo { width: 43mm; height: 32mm; margin: 0 auto 8mm; display: flex; align-items: center; justify-content: center; }
    .license-logo img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .license-heading { margin: 0; font-size: 11pt; line-height: 1.25; font-weight: 700; text-transform: uppercase; }
    .license-heading strong { font-weight: 700; }
    .license-heading em { font-style: italic; }
    .license-form-title { margin: 5mm 0 10mm; text-align: center; font-size: 11pt; line-height: 1.32; font-weight: 700; }
    .top-fields { display: grid; grid-template-columns: 22mm 5mm 40mm 20mm 5mm 1fr; column-gap: 3mm; align-items: end; margin-top: 2mm; font-size: 11pt; line-height: 1.1; }
    .form-lines { display: grid; grid-template-columns: 22mm 5mm 1fr; column-gap: 3mm; row-gap: 1.5mm; align-items: end; margin-top: 2mm; font-size: 11pt; }
    .label { white-space: pre-line; }
    .colon { text-align: center; }
    .dot-line { min-height: 5mm; border-bottom: 1.4px dotted #111; line-height: 4.8mm; padding: 0 2mm; font-weight: 400; }
    [contenteditable="true"] { outline: none; box-shadow: none; }
    .grant { margin: 17mm 0 12mm; font-size: 11pt; line-height: 1.45; text-align: justify; }
    .grant strong { font-weight: 700; }
    .license-details { display: grid; grid-template-columns: 42mm 5mm 1fr; column-gap: 3mm; row-gap: 1.4mm; align-items: end; font-size: 11pt; }
    .period-line { display: grid; grid-template-columns: 42mm 5mm 1fr 16mm 1fr; column-gap: 3mm; align-items: end; margin-top: 1.4mm; font-size: 11pt; }
    .attachment-line { margin-top: 12mm; font-size: 11pt; }
    .signature-row { display: grid; grid-template-columns: 1fr 43mm; gap: 27mm; align-items: start; margin-top: 22mm; font-size: 11pt; }
    .signature-title { margin-top: 4mm; }
    .date-row { display: grid; grid-template-columns: auto 1fr; gap: 2mm; align-items: end; }
    .appendix-page { padding: 24mm 16mm 20mm; font-family: Arial, Helvetica, sans-serif; }
    .appendix-title { margin: 0 0 8mm; font-size: 11pt; line-height: 1.55; font-weight: 700; text-transform: uppercase; }
    .terms { margin: 0; padding-left: 13mm; font-size: 11pt; line-height: 1.32; }
    .terms li { margin: 0 0 6.5mm; padding-left: 2mm; text-align: justify; }
    .print-actions { position: fixed; right: 18px; top: 18px; }
    .print-actions button { border: 1px solid #cbd5e1; background: #fff; border-radius: 6px; padding: 8px 12px; font: 700 13px Arial, sans-serif; cursor: pointer; }
    @media print {
      html, body { width: 210mm; min-height: 297mm; overflow: hidden; background: #fff; }
      .ad-license-page { margin: 0; }
      .print-actions { display: none; }
    }
  </style>
</head>
<body>
  <div class="print-actions"><button onclick="window.print()">Print</button></div>
  <section class="ad-license-page">
    <header class="license-header">
      <div class="license-logo"><img src="${escapeHtml(logoUrl)}" alt="DBKU" /></div>
      <p class="license-heading">
        DEWAN BANDARAYA KUCHING UTARA<br />
        (COMMISSION OF THE CITY NORTH OF KUCHING NORTH)<br />
        <em>THE LOCAL AUTHORITIES (ADVERTISEMENT) BY-LAWS, 2012</em>
      </p>
      <p class="license-form-title">Borang B<br />(Undang-Undang Kecil 7)<br />Lesen Pengiklanan</p>
    </header>

    <div class="top-fields">
      <span class="label">No. Resit</span><span class="colon">:</span><span class="dot-line">&nbsp;</span>
      <span>Rujukan</span><span class="colon">:</span><span class="dot-line">&nbsp;</span>
    </div>

    <div class="form-lines">
      <span>Nama</span><span class="colon">:</span><span class="dot-line">&nbsp;</span>
      <span>Alamat</span><span class="colon">:</span><span class="dot-line">&nbsp;</span>
      <span></span><span></span><span class="dot-line">&nbsp;</span>
      <span></span><span></span><span class="dot-line">&nbsp;</span>
    </div>

    <p class="grant">
      Adalah dengan ini diberi lesen oleh <strong>Pengarah, Dewan Bandaraya Kuching Utara</strong>
      di bawah undang-undang kecil 7, <em>The Local Authorities (Advertisements) By-Laws, 2012</em>
      untuk mempamer iklan seperti berikut:
    </p>

    <div class="license-details">
      <span>Nama Iklan</span><span class="colon">:</span><span class="dot-line">&nbsp;</span>
      <span>Jenis Iklan</span><span class="colon">:</span><span class="dot-line">&nbsp;</span>
      <span>Lokasi Iklan</span><span class="colon">:</span><span class="dot-line">&nbsp;</span>
      <span></span><span></span><span class="dot-line">&nbsp;</span>
    </div>

    <div class="period-line">
      <span>Tempoh Lesen Iklan</span><span class="colon">:</span><span class="dot-line">&nbsp;</span>
      <span>hingga</span><span class="dot-line">&nbsp;</span>
    </div>

    <p class="attachment-line">Tertakluk kepada syarat-syarat dalam Lampiran A.</p>

    <div class="signature-row">
      <div>
        <div class="dot-line">&nbsp;</div>
        <div class="signature-title">b.p.: Dewan Bandaraya Kuching Utara</div>
      </div>
      <div class="date-row"><span>Tarikh:</span><span class="dot-line">&nbsp;</span></div>
    </div>
  </section>

  <section class="ad-license-page appendix-page">
    <h1 class="appendix-title">LAMPIRAN A<br />SYARAT-SYARAT LESEN PENGIKLANAN</h1>
    <ol class="terms">
      ${terms.map((term) => `<li>${formatAdvertisementLicenseTermHtml(term)}</li>`).join("")}
    </ol>
  </section>
</body>
</html>`;
}

function getAdvertisementLicenseAttachmentTerms(savedTerms) {
  if (Array.isArray(savedTerms) && savedTerms.length > 0) {
    return savedTerms.map((term) => String(term || "").trim()).filter(Boolean);
  }

  return [
    "Lesen ini hanya sah bagi iklan, lokasi dan tempoh yang diluluskan oleh Dewan Bandaraya Kuching Utara (DBKU).",
    "Lesen ini tidak boleh dipindah milik tanpa kelulusan bertulis daripada DBKU.",
    "Pemegang lesen hendaklah memastikan iklan dipasang mengikut pelan yang diluluskan dan sentiasa berada dalam keadaan bersih, selamat serta disenggara dengan baik.",
    "Sebarang pindaan terhadap reka bentuk, saiz, kandungan, struktur atau lokasi iklan hendaklah mendapat kelulusan bertulis daripada DBKU terlebih dahulu.",
    "Kandungan iklan hendaklah mematuhi semua undang-undang yang berkuat kuasa dan tidak mengandungi unsur yang menyalahi undang-undang, lucah, menghasut, mengelirukan atau menyentuh sensitiviti kaum, agama dan budaya.",
    "Bagi iklan LED atau digital, tahap kecerahan, animasi dan pertukaran paparan hendaklah tidak mengganggu atau membahayakan pengguna jalan raya.",
    "Pemegang lesen hendaklah mematuhi semua arahan yang dikeluarkan oleh DBKU dari semasa ke semasa.",
    "Pemegang lesen bertanggungjawab sepenuhnya terhadap keselamatan struktur iklan serta sebarang kerosakan, kemalangan atau tuntutan yang berpunca daripada pemasangan dan penyelenggaraan iklan.",
    "Pemegang lesen hendaklah menanggalkan iklan apabila lesen tamat tempoh, dibatalkan atau apabila diarahkan oleh DBKU. Semua kos penanggalan iklan dan pemulihan tapak hendaklah ditanggung oleh pemegang lesen.",
    "Permohonan pembaharuan lesen hendaklah dikemukakan sebelum tamat tempoh lesen. Lesen yang telah tamat tempoh adalah terbatal dan iklan tidak boleh terus dipamerkan sehingga lesen baharu diluluskan oleh DBKU.",
    "Deposit (jika berkaitan) boleh dilupuskan atau digunakan oleh DBKU bagi menampung kos penanggalan iklan, pemulihan tapak atau apa-apa kerosakan sekiranya pemegang lesen gagal mematuhi syarat-syarat lesen.",
    "Kegagalan mematuhi mana-mana syarat lesen ini atau peruntukan The Local Authorities (Advertisement) By-Laws, 2012 boleh menyebabkan lesen digantung atau dibatalkan tanpa menjejaskan apa-apa tindakan penguatkuasaan yang boleh diambil oleh DBKU.",
  ];
}

function splitAdvertisementLicenseLines(value) {
  const lines = String(value || "")
    .split(/\n|,\s*/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.length > 0 ? lines : [""];
}

function formatAdvertisementLicenseTermHtml(term) {
  return escapeHtml(term).replace(
    /The Local Authorities \(Advertisement\) By-Laws/g,
    "<em>The Local Authorities (Advertisement) By-Laws</em>"
  );
}

function buildPaymentQrPrintHtml(imageUrl, reference) {
  const title = reference || "QR E-License";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: auto; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; color: #0f172a; background: #f8fafc; }
    .page { min-height: calc(100vh - 24mm); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; background: #fff; }
    .qr { width: min(78vw, 420px); height: auto; }
    .reference { margin: 0; font-size: 13px; font-weight: 700; letter-spacing: .04em; text-align: center; color: #475569; text-transform: uppercase; }
    @media print {
      body { background: #fff; }
      .page { min-height: auto; }
    }
  </style>
</head>
<body>
  <main class="page">
    <img class="qr" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(title)}" />
    <p class="reference">${escapeHtml(title)}</p>
  </main>
</body>
</html>`;
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
    await printHtmlDocument(
      buildPaymentQrPrintHtml(downloadUrl, reference || "QR E-License"),
      reference || "QR E-License"
    );
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
  const hasApprovalLetter =
    getPaymentDocumentSource(getStoredPaymentDocument(app, "letter")) ||
    hasManualApprovalLetter(app);
  const hasBill =
    getPaymentDocumentSource(getStoredPaymentDocument(app, "bill")) ||
    hasManualBill(app);

  return Boolean(hasApprovalLetter && hasBill);
}

function hasManualApprovalLetter(app) {
  const manualLetter = app?.form_data?.approval_letter?.manual_letter || {};
  return Boolean(manualLetter.document_html || manualLetter.editable_body_html || manualLetter.saved_at);
}

function hasManualBill(app) {
  const manualBill = app?.form_data?.approval_letter?.manual_bill || {};
  return Boolean(manualBill.document_html || manualBill.editable_body_html || manualBill.saved_at);
}

export function getManualApprovalLetterDocumentHtml(app) {
  const manualLetter = app?.form_data?.approval_letter?.manual_letter || {};
  return (
    manualLetter.document_html ||
    buildManualApprovalLetterDocumentHtml(
      manualLetter.editable_body_html || buildManualApprovalLetterTemplateBodyHtml(app)
    )
  );
}

export function getManualBillDocumentHtml(app) {
  const manualBill = app?.form_data?.approval_letter?.manual_bill || {};
  return (
    manualBill.document_html ||
    buildManualBillDocumentHtml(
      manualBill.editable_body_html || buildManualBillTemplateBodyHtml(app)
    )
  );
}

function openManualApprovalLetterDocument(app, t) {
  const html = getManualApprovalLetterDocumentHtml(app);
  const previewUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const preview = window.open(previewUrl, "_blank");

  if (!preview) {
    URL.revokeObjectURL(previewUrl);
    window.alert(t("workspace.payment.documentViewFailed", "Unable to open the document. Please try again."));
    return;
  }

  window.setTimeout(() => URL.revokeObjectURL(previewUrl), 5 * 60 * 1000);
}

async function printManualApprovalLetterDocument(app, t) {
  try {
    await printHtmlDocument(
      getManualApprovalLetterDocumentHtml(app),
      `${getApplicationReference(app)} ${t("workspace.payment.approvalLetter", "Approval Letter")}`
    );
  } catch (err) {
    console.error("Failed to print approval letter:", err);
    window.alert(t("workspace.payment.documentViewFailed", "Unable to open the document. Please try again."));
  }
}

async function printManualBillDocument(app, t) {
  try {
    await printHtmlDocument(
      getManualBillDocumentHtml(app),
      `${getApplicationReference(app)} ${t("workspace.payment.billDocument", "Bill")}`
    );
  } catch (err) {
    console.error("Failed to print bill:", err);
    window.alert(t("workspace.payment.documentViewFailed", "Unable to open the document. Please try again."));
  }
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
