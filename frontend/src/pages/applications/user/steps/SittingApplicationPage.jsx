import { useEffect, useLayoutEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import UserDashboardLayout from "../../../../layout/UserDashboardLayout";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useLanguage } from "../../../../context/LanguageContext";
import {
  apiRequest,
  deleteApplicationDocument,
  fetchAuthenticatedBlob,
  getApplicationDocumentUrl,
  getSiteImageUrl,
  uploadApplicationDocument,
} from "../../../../services/api";
import SimpleWysiwygEditor from "../../../../components/SimpleWysiwygEditor";
import {
  canEditApplicationForm,
  getApplicantSaveDraftReturnLabelKey,
  getApplicantSaveDraftReturnPath,
} from "../../../../utils/workflow";
import { markApplicantRecordSeen } from "../../../../utils/applicantSeenRecords";
import { stepText } from "./ApplicationStepText";
import AdminViewStepControls from "./AdminViewStepControls";
import UserViewStepControls from "./UserViewStepControls";
import ApplicationSummary from "./ApplicationSummary";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || "YOUR_MAPBOX_TOKEN";
mapboxgl.accessToken = MAPBOX_TOKEN;

const APPLICATION_TYPE_OPTIONS = [
  { value: "open_space", labelKey: "applicationTypeOpenSpace", label: "Open Space" },
  { value: "building", labelKey: "applicationTypeBuilding", label: "Building" },
];

const APPLICATION_SUBTYPE_OPTIONS = {
  open_space: [
    { value: "free_standing_billboard", labelKey: "applicationSubtypeFreeStandingBillboard", label: "Free Standing Billboard" },
    { value: "open_space_led_billboard", labelKey: "applicationSubtypeLedBillboard", label: "LED Billboard" },
  ],
  building: [
    { value: "building_normal_billboard", labelKey: "applicationSubtypeNormalBillboard", label: "Normal Billboard" },
    { value: "building_led_billboard", labelKey: "applicationSubtypeLedBillboard", label: "LED Billboard" },
  ],
};

const APPLICATION_TYPE_DEPARTMENTS = {
  open_space: ["GPM", "MNE", "IMT", "LNP", "ENG"],
  building: ["BLG"],
};

const IKL_FIXED_DEPOSIT = 5000;
const IKL_PROCESSING_FEE = 10;
const SQFT_TO_SQM = 0.092903;
const IKL_LED_SUBTYPES = new Set([
  "open_space_led_billboard",
  "building_led_billboard",
]);
const DISPLAY_TYPE_OPTIONS = [
  { value: "non_led", labelKey: "displayTypeNonLed" },
  { value: "led", labelKey: "displayTypeLed" },
];
const DEFAULT_ADVERTISEMENT_TYPES = [
  { value: "Gantry", labelKey: "advertisementTypeGantry" },
  { value: "Unipole", labelKey: "advertisementTypeUnipole" },
  { value: "Minipole", labelKey: "advertisementTypeMinipole" },
  {
    value: "Free Standing Billboard",
    labelKey: "applicationSubtypeFreeStandingBillboard",
  },
  { value: "Directional Sign", labelKey: "advertisementTypeDirectionalSign" },
  { value: "Directory Sign", labelKey: "advertisementTypeDirectorySign" },
  { value: "Projecting Sign", labelKey: "advertisementTypeProjectingSign" },
  { value: "Roof Top Sign", labelKey: "advertisementTypeRoofTopSign" },
  {
    value: "Wall Sign/Building Wrap",
    labelKey: "advertisementTypeWallSignBuildingWrap",
  },
  {
    value: "Pillar/Column Wrap",
    labelKey: "advertisementTypePillarColumnWrap",
  },
];
const EMPTY_CUSTOM_ADVERTISEMENT_TYPES = {
  open_space: {
    non_led: [],
    led: [],
  },
  building: {
    non_led: [],
    led: [],
  },
};
const IKL_FEE_SCHEDULES = {
  schedule_1: {
    number: "1",
    firstAreaSqm: 20,
    firstAreaRate: 100,
    additionalAreaRate: 70,
  },
  schedule_6: {
    number: "6",
    firstAreaSqm: 10,
    firstAreaRate: 200,
    firstAreaFixedFee: 2000,
    additionalAreaRate: 50,
  },
};

function normalizeApplicationTypeOptions(value) {
  const values = Array.isArray(value)
    ? value
    : String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
  const normalized = values
    .map((item) => String(item || "").trim().toLowerCase())
    .filter((item) => APPLICATION_TYPE_OPTIONS.some((option) => option.value === item));

  return [...new Set(normalized)];
}

function getPrimaryApplicationType(value) {
  return normalizeApplicationTypeOptions(value)[0] || "open_space";
}

function getAdvertisementRowApplicationType(row, fallbackType = "open_space") {
  return getPrimaryApplicationType(
    row?.applicationType || row?.application_type || fallbackType
  );
}

function getSelectedAdvertisementRowApplicationType(row) {
  return normalizeApplicationTypeOptions(row?.applicationType || row?.application_type)[0] || "";
}

function getAdvertisementRowsApplicationTypes(rows, fallbackTypes = ["open_space"]) {
  const fallbackType = getPrimaryApplicationType(fallbackTypes);
  const rowTypes = (Array.isArray(rows) ? rows : [])
    .map((row) => getSelectedAdvertisementRowApplicationType(row))
    .filter(Boolean);
  const normalized = normalizeApplicationTypeOptions(rowTypes);

  return normalized.length > 0 ? normalized : [fallbackType];
}

function getDefaultApplicationSubtype(type) {
  return APPLICATION_SUBTYPE_OPTIONS[type]?.[0]?.value || "";
}

function getApplicationDisplayTypeFromSubtype(subtype) {
  if (!subtype) return "";
  return IKL_LED_SUBTYPES.has(subtype) ? "led" : "non_led";
}

function getSubtypeForDisplayType(type, displayType) {
  const options = APPLICATION_SUBTYPE_OPTIONS[type] || [];
  const matcher =
    displayType === "led"
      ? (option) => IKL_LED_SUBTYPES.has(option.value)
      : (option) => !IKL_LED_SUBTYPES.has(option.value);

  return options.find(matcher)?.value || getDefaultApplicationSubtype(type);
}

function normalizeApplicationSubtype(value, type) {
  const subtype = String(value || "").trim().toLowerCase();
  const options = APPLICATION_SUBTYPE_OPTIONS[type] || [];
  return options.some((option) => option.value === subtype) ? subtype : "";
}

function getApplicationTypeDepartments(types) {
  const departments = normalizeApplicationTypeOptions(types).flatMap(
    (type) => APPLICATION_TYPE_DEPARTMENTS[type] || []
  );

  return [...new Set(departments)];
}

function getApplicationTypeLabel(language, types) {
  const selected = normalizeApplicationTypeOptions(types);
  return selected
    .map((type) => {
      const option = APPLICATION_TYPE_OPTIONS.find((item) => item.value === type);
      return option ? stepText(language, option.labelKey) : type;
    })
    .join(", ");
}

function getApplicationSubtypeLabel(language, type, subtype, customLabel = "") {
  const normalizedCustomLabel = String(customLabel || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const knownCustomLabelKeys = {
    free_standing_billboard: "applicationSubtypeFreeStandingBillboard",
    led_billboard: "applicationSubtypeLedBillboard",
    normal_billboard: "applicationSubtypeNormalBillboard",
    gantry: "advertisementTypeGantry",
    unipole: "advertisementTypeUnipole",
    minipole: "advertisementTypeMinipole",
    directional_sign: "advertisementTypeDirectionalSign",
    directory_sign: "advertisementTypeDirectorySign",
    projecting_sign: "advertisementTypeProjectingSign",
    roof_top_sign: "advertisementTypeRoofTopSign",
    "wall_sign/building_wrap": "advertisementTypeWallSignBuildingWrap",
    "pillar/column_wrap": "advertisementTypePillarColumnWrap",
  };

  if (knownCustomLabelKeys[normalizedCustomLabel]) {
    return stepText(language, knownCustomLabelKeys[normalizedCustomLabel]);
  }

  if (customLabel) return customLabel;

  const option = (APPLICATION_SUBTYPE_OPTIONS[type] || []).find((item) => item.value === subtype);
  return option ? stepText(language, option.labelKey) : "";
}

function getDisplayTypeLabel(language, displayType) {
  const normalized = String(displayType || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (normalized === "led") return stepText(language, "displayTypeLed");
  if (normalized === "non_led") return stepText(language, "displayTypeNonLed");

  return "";
}

function getAdvertisementRowsDisplayTypeLabel(
  language,
  rows,
  fallbackDisplayType = ""
) {
  const labels = (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const displayType =
        row?.displayType ||
        row?.display_type ||
        getApplicationDisplayTypeFromSubtype(row?.subtype);

      return getDisplayTypeLabel(language, displayType);
    })
    .filter(Boolean);
  const uniqueLabels = [...new Set(labels)];

  if (uniqueLabels.length > 0) return uniqueLabels.join(", ");

  return getDisplayTypeLabel(language, fallbackDisplayType);
}

function getAdvertisementRowsSubtypeLabel(
  language,
  fallbackType,
  rows,
  fallbackSubtype = "",
  fallbackCustomSubtypeLabel = ""
) {
  const fallbackApplicationType = getPrimaryApplicationType(fallbackType);
  const labels = (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const type = getAdvertisementRowApplicationType(row, fallbackApplicationType);
      const subtype = normalizeApplicationSubtype(row?.subtype, type);
      const customLabel = String(row?.customLabel || row?.custom_label || "").trim();

      return getApplicationSubtypeLabel(language, type, subtype, customLabel);
    })
    .filter(Boolean);
  const uniqueLabels = [...new Set(labels)];

  if (uniqueLabels.length > 0) return uniqueLabels.join(", ");

  return getApplicationSubtypeLabel(
    language,
    fallbackApplicationType,
    fallbackSubtype,
    fallbackCustomSubtypeLabel
  );
}

function formatProjectText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleUpperCase("en-MY");
}

function formatAddressText(value) {
  return String(value || "").toLocaleUpperCase("en-MY");
}

function buildProjectNameLine(language, selectedType, row) {
  const rowType = getAdvertisementRowApplicationType(row, selectedType);
  const displayType =
    row?.displayType ||
    row?.display_type ||
    getApplicationDisplayTypeFromSubtype(row?.subtype);
  const normalizedSubtype = normalizeApplicationSubtype(row?.subtype, rowType);
  const customLabel = String(row?.customLabel || row?.custom_label || "").trim();
  const displayLabel = getDisplayTypeLabel(language, displayType);
  const advertisementLabel = getApplicationSubtypeLabel(
    language,
    rowType,
    normalizedSubtype,
    customLabel
  );

  if (!displayLabel || !advertisementLabel) return "";

  const isMalay = language === "ms";
  const action = stepText(
    language,
    rowType === "building" ? "projectActionInstallation" : "projectActionConstruction"
  );
  const location = stepText(
    language,
    rowType === "building" ? "projectLocationBuilding" : "projectLocationOpenSpace"
  );
  const actionText = formatProjectText(action);
  const locationText = formatProjectText(location);
  const displayText = formatProjectText(displayLabel);
  const advertisementText = formatProjectText(advertisementLabel);

  if (isMalay) {
    return `${actionText} ${advertisementText} ${displayText} DI ${locationText}`;
  }

  return `${actionText} OF ${displayText} ${advertisementText} AT ${locationText}`;
}

function buildProjectName(language, selectedType, rows) {
  const projectLines = (Array.isArray(rows) ? rows : [])
    .map((row) => buildProjectNameLine(language, selectedType, row))
    .filter(Boolean);

  return projectLines
    .map((line, index) => `${index + 1}. ${line}`)
    .join("\n");
}

function normalizeCustomAdvertisementTypes(value) {
  const normalized = {
    open_space: {
      non_led: [],
      led: [],
    },
    building: {
      non_led: [],
      led: [],
    },
  };

  Object.keys(normalized).forEach((type) => {
    Object.keys(normalized[type]).forEach((displayType) => {
      const source = value?.[type]?.[displayType];
      normalized[type][displayType] = Array.isArray(source)
        ? [...new Set(source.map((item) => String(item || "").trim()).filter(Boolean))]
        : [];
    });
  });

  return normalized;
}

function createEmptyAdvertisementRow() {
  return {
    applicationType: "",
    application_type: "",
    displayType: "",
    subtype: "",
    customLabel: "",
    widthFt: "",
    heightFt: "",
    areaRequired: "",
    amountFundApproved: "",
  };
}

function normalizeAdvertisementRows(rows, selectedType, fallbackSubtype = "", fallbackCustomLabel = "") {
  const fallbackType = getPrimaryApplicationType(selectedType);
  if (Array.isArray(rows) && rows.length > 0) {
    const normalizedRows = rows.map((row) => {
      const applicationType = getAdvertisementRowApplicationType(row, fallbackType);
      const subtype = normalizeApplicationSubtype(row?.subtype, applicationType);
      const displayType =
        row?.displayType === "led" || row?.display_type === "led"
          ? "led"
          : row?.displayType === "non_led" || row?.display_type === "non_led"
            ? "non_led"
            : getApplicationDisplayTypeFromSubtype(subtype);

      return {
        applicationType,
        application_type: applicationType,
        displayType,
        subtype,
        customLabel: String(row?.customLabel || row?.custom_label || "").trim(),
        widthFt: row?.widthFt || row?.width_ft || "",
        heightFt: row?.heightFt || row?.height_ft || "",
        areaRequired: row?.areaRequired || row?.area_required || "",
        amountFundApproved: row?.amountFundApproved || row?.amount_fund_approved || "",
      };
    });

    return normalizedRows.length > 0 ? normalizedRows : [createEmptyAdvertisementRow()];
  }

  const subtype = normalizeApplicationSubtype(fallbackSubtype, fallbackType);
  if (subtype) {
    return [
      {
        applicationType: fallbackType,
        application_type: fallbackType,
        displayType: getApplicationDisplayTypeFromSubtype(subtype),
        subtype,
        customLabel: String(fallbackCustomLabel || "").trim(),
        widthFt: "",
        heightFt: "",
        areaRequired: "",
        amountFundApproved: "",
      },
    ];
  }

  return [createEmptyAdvertisementRow()];
}

function getPrimaryAdvertisementRow(rows, selectedType) {
  const fallbackType = getPrimaryApplicationType(selectedType);
  return (rows || []).find((row) => {
    const rowType = getAdvertisementRowApplicationType(row, fallbackType);

    return row?.displayType && normalizeApplicationSubtype(row?.subtype, rowType);
  }) || null;
}

function withCalculatedAdvertisementRow(row, selectedType) {
  const selectedApplicationType = getSelectedAdvertisementRowApplicationType(row);
  const calculationType = selectedApplicationType || selectedType;
  const subtype = selectedApplicationType
    ? normalizeApplicationSubtype(row?.subtype, calculationType)
    : "";
  const widthFt = row?.widthFt || "";
  const heightFt = row?.heightFt || "";
  const areaSqm = calculateAreaSqmFromFt(widthFt, heightFt);
  const areaRequired = areaSqm
    ? formatCalculatedArea(areaSqm)
    : row?.areaRequired || "";
  const amountFundApproved = calculateIklTotalPayable(areaSqm || areaRequired, subtype);

  return {
    ...row,
    applicationType: selectedApplicationType,
    application_type: selectedApplicationType,
    subtype,
    widthFt,
    heightFt,
    areaRequired,
    amountFundApproved,
  };
}

function getAdvertisementRowsTotalPayable(rows) {
  const total = (rows || []).reduce(
    (sum, row) => sum + parsePositiveNumber(row?.amountFundApproved),
    0
  );

  return total ? formatCalculatedAmount(total) : "";
}

function getAdvertisementRowDisplayLabel(language, selectedType, row, index) {
  const rowType = getSelectedAdvertisementRowApplicationType(row);
  const typeLabel = rowType
    ? getApplicationTypeLabel(language, [rowType])
    : stepText(language, "select");
  const displayTypeLabel = row?.displayType
    ? stepText(
        language,
        row.displayType === "led" ? "displayTypeLed" : "displayTypeNonLed"
      )
    : stepText(language, "selectDisplayType");
  const adTypeLabel =
    row?.customLabel ||
    getApplicationSubtypeLabel(language, rowType, row?.subtype) ||
    stepText(language, "selectAdvertisementType");

  return `${index + 1}. ${typeLabel}: ${displayTypeLabel} - ${adTypeLabel}`;
}

function parsePositiveNumber(value) {
  const number = Number(String(value || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function formatCalculatedArea(value) {
  return formatFlexibleDecimal(value, 10);
}

function formatCalculatedAmount(value) {
  const rounded = Math.round((Number(value) || 0) * 100) / 100;
  return rounded.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCalculatedCurrency(value) {
  const amount = toCurrencyCents(value) / 100;
  const prefix = amount < 0 ? "-RM" : "RM";
  return `${prefix}${formatCalculatedAmount(Math.abs(amount))}`;
}

function toCurrencyCents(value) {
  return Math.round((Number(value) || 0) * 100);
}

function roundToOfficialFiveSen(value) {
  const cents = toCurrencyCents(value);
  const roundedCents = Math.round(cents / 5) * 5;
  return {
    roundedAmount: roundedCents / 100,
    adjustment: (roundedCents - cents) / 100,
  };
}

function formatFlexibleDecimal(value, maxDecimals = 10) {
  const number = Number(value) || 0;
  return number
    .toFixed(maxDecimals)
    .replace(/(\.\d*?[1-9])0+$/, "$1")
    .replace(/\.0+$/, "");
}

function formatWholeNumber(value) {
  return String(Math.round(Number(value) || 0));
}

function calculateAreaSqmFromFt(widthFt, heightFt) {
  const width = parsePositiveNumber(widthFt);
  const height = parsePositiveNumber(heightFt);
  return width && height ? width * height * SQFT_TO_SQM : 0;
}

function getSiteImageDocumentId(image) {
  return image?.document_id || image?.id || image?.attachment?.document_id || image?.attachment?.id || "";
}

function getSiteImageName(image, fallback = "") {
  const filePath = typeof image?.file === "string" ? image.file : "";
  const fileUrl = typeof image?.file_url === "string" ? image.file_url : "";

  return (
    image?.name ||
    image?.attachment?.name ||
    filePath.split(/[\\/]/)?.pop() ||
    fileUrl.split(/[\\/]/)?.pop() ||
    fallback ||
    ""
  );
}

function getSavedSiteImageNamesByDocumentId(stepData = {}) {
  const namesByDocumentId = new Map();
  const savedImages = [
    ...(Array.isArray(stepData.site_images) ? stepData.site_images : []),
    stepData.site_image,
  ].filter(Boolean);

  savedImages.forEach((image) => {
    const documentId = String(getSiteImageDocumentId(image) || "");
    const name = String(image?.name || "").trim();

    if (documentId && name) {
      namesByDocumentId.set(documentId, name);
    }
  });

  const primaryDocumentId = String(stepData.site_image_document_id || "");
  const primaryName = String(stepData.site_image_name || "").trim();
  if (primaryDocumentId && primaryName) {
    namesByDocumentId.set(primaryDocumentId, primaryName);
  }

  return namesByDocumentId;
}

function getSiteImageDownloadUrl(applicationId, image, stepData = {}) {
  const documentId = getSiteImageDocumentId(image);
  if (documentId) return getApplicationDocumentUrl(applicationId, documentId);

  return getSiteImageUrl(applicationId, image?.attachment || image, stepData);
}

function normalizeSiteImageItem(image, applicationId, stepData = {}, fallbackName = "") {
  if (!image) return null;

  const documentId = getSiteImageDocumentId(image);
  const name = getSiteImageName(image, fallbackName);
  const preview =
    (documentId ? getApplicationDocumentUrl(applicationId, documentId) : "") ||
    image.preview ||
    image.url ||
    image.file_url ||
    image.file ||
    getSiteImageDownloadUrl(applicationId, image, stepData);

  if (!name && !preview && !documentId) return null;

  return {
    key: documentId ? `doc-${documentId}` : `site-${name || preview}`,
    document_id: documentId,
    name: name || "site-image",
    preview,
    size: image.size || image.attachment?.size || image.file?.size || "",
    type: image.type || image.attachment?.type || "",
    file: image.file instanceof File ? image.file : null,
    attachment: image.attachment || image,
  };
}

function isStoredSiteImagePresent(image, supportingDocumentIds) {
  const documentId = getSiteImageDocumentId(image);
  return !documentId || supportingDocumentIds.has(String(documentId));
}

function uniqueSiteImages(images) {
  const seen = new Set();

  return images.filter((image) => {
    if (!image) return false;
    const key = image.document_id || image.preview || image.name;
    if (!key) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getIklFeeSchedule(subtype) {
  return IKL_LED_SUBTYPES.has(subtype)
    ? IKL_FEE_SCHEDULES.schedule_6
    : IKL_FEE_SCHEDULES.schedule_1;
}

function calculateIklTotalPayable(areaRequired, subtype = "") {
  const breakdown = calculateIklFeeBreakdown(areaRequired, subtype);
  return breakdown ? formatCalculatedAmount(breakdown.totalPayable) : "";
}

function calculateIklFeeBreakdown(areaRequired, subtype = "") {
  if (!subtype) return "";

  const areaSqm =
    typeof areaRequired === "number"
      ? areaRequired
      : parsePositiveNumber(areaRequired);
  if (!areaSqm) return "";

  const schedule = getIklFeeSchedule(subtype);
  const usesFixedFirstAreaFee = Number(schedule.firstAreaFixedFee || 0) > 0;
  const firstAreaSqm = usesFixedFirstAreaFee
    ? schedule.firstAreaSqm
    : Math.min(areaSqm, schedule.firstAreaSqm);
  const additionalAreaSqm = Math.max(areaSqm - schedule.firstAreaSqm, 0);
  const firstAreaFee = usesFixedFirstAreaFee
    ? schedule.firstAreaFixedFee
    : firstAreaSqm * schedule.firstAreaRate;
  const additionalAreaFee = additionalAreaSqm * schedule.additionalAreaRate;
  const feeTotal = firstAreaFee + additionalAreaFee;
  const subtotalPayable = feeTotal + IKL_FIXED_DEPOSIT + IKL_PROCESSING_FEE;
  const roundedPayable = roundToOfficialFiveSen(subtotalPayable);

  return {
    scheduleNumber: schedule.number,
    firstAreaLimitSqm: schedule.firstAreaSqm,
    firstAreaRate: schedule.firstAreaRate,
    firstAreaFixedFee: schedule.firstAreaFixedFee || 0,
    usesFixedFirstAreaFee,
    additionalAreaRate: schedule.additionalAreaRate,
    areaSqm,
    firstAreaSqm,
    additionalAreaSqm,
    firstAreaFee,
    additionalAreaFee,
    feeTotal,
    deposit: IKL_FIXED_DEPOSIT,
    processingFee: IKL_PROCESSING_FEE,
    roundingAdjustment: roundedPayable.adjustment,
    subtotalPayable,
    totalPayable: roundedPayable.roundedAmount,
  };
}

function SittingApplicationPage({
  LayoutComponent = UserDashboardLayout,
  StepNavComponent = null,
  mode = "user",
} = {}) {
  const Layout = LayoutComponent;
  const StepNav = StepNavComponent;
  const isAdminView = mode === "admin-view";
  const isAdminReview = mode === "admin" || isAdminView;

  const navigate = useNavigate();
  const location = useLocation();
  const { language } = useLanguage();
  const tx = (key) => stepText(language, key);
  const { applicationId: routeApplicationId } = useParams();
  const queryParams = new URLSearchParams(location.search);
  const prefetchedApplication = location.state?.prefetchedApplication || null;

  const applicationIdRaw =
    routeApplicationId || location.state?.applicationId || queryParams.get("id");

  const applicationId = applicationIdRaw ? Number(applicationIdRaw) : null;

  const [localityAddress, setLocalityAddress] = useState("");
  const [projectJustification, setProjectJustification] = useState("");
  const [siteSelectionReason, setSiteSelectionReason] = useState("");
  const [applicationTypeOptions, setApplicationTypeOptions] = useState(["open_space"]);
  const [applicationSubtype, setApplicationSubtype] = useState("");
  const [advertisementRows, setAdvertisementRows] = useState([
    createEmptyAdvertisementRow(),
  ]);
  const [customAdvertisementTypes, setCustomAdvertisementTypes] = useState(
    EMPTY_CUSTOM_ADVERTISEMENT_TYPES
  );
  const [customAdvertisementTypeLabel, setCustomAdvertisementTypeLabel] = useState("");
  const [advertisementTypeModal, setAdvertisementTypeModal] = useState({
    rowIndex: null,
    value: "",
  });
  const [applicationRecord, setApplicationRecord] = useState(null);

  const [siteImages, setSiteImages] = useState([]);

  const [mapData, setMapData] = useState({
    address: "",
    latitude: 1.586684,
    longitude: 110.334028,
  });
  const selectedApplicationTypes = getAdvertisementRowsApplicationTypes(
    advertisementRows,
    applicationTypeOptions
  );
  const selectedApplicationType = getPrimaryApplicationType(selectedApplicationTypes);
  const projectName = buildProjectName(
    language,
    selectedApplicationType,
    advertisementRows
  );

  useLayoutEffect(() => {
    if (prefetchedApplication && String(prefetchedApplication.id) === String(applicationId)) {
      applyDraftData(prefetchedApplication);
    }
  }, [applicationId, prefetchedApplication]);

  useEffect(() => {
    if (!applicationId) return;
    if (prefetchedApplication && String(prefetchedApplication.id) === String(applicationId)) return;

    loadDraft();
  }, [applicationId, prefetchedApplication]);

  function applyDraftData(data) {
    const step1 = data.form_data?.step_1 || {};
    const savedTypeOptions = normalizeApplicationTypeOptions(
      step1.application_type_options
    );
    const savedApplicationTypes = normalizeApplicationTypeOptions(
      step1.application_type
    );
    const savedTypes =
      savedTypeOptions.length > 0
        ? savedTypeOptions
        : savedApplicationTypes.length > 0
          ? savedApplicationTypes
          : ["open_space"];
    const savedType = getPrimaryApplicationType(savedTypes);
    const savedSubtype =
      normalizeApplicationSubtype(step1.application_subtype, savedType);
    const savedAdvertisementRows = normalizeAdvertisementRows(
      step1.advertisement_rows,
      savedType,
      savedSubtype,
      step1.advertisement_type_custom_label
    ).map((row, index) => {
      if (index !== 0) return row;

      return {
        ...row,
        widthFt: row.widthFt || step1.width_ft || step1.size_width_ft || "",
        heightFt: row.heightFt || step1.height_ft || step1.size_height_ft || "",
        areaRequired: row.areaRequired || step1.area_required || "",
        amountFundApproved: row.amountFundApproved || step1.amount_fund_approved || "",
      };
    });
    const calculatedAdvertisementRows = savedAdvertisementRows.map((row) =>
      withCalculatedAdvertisementRow(row, savedType)
    );
    const nextApplicationTypes = getAdvertisementRowsApplicationTypes(
      calculatedAdvertisementRows,
      savedTypes
    );
    const primaryAdvertisementRow = getPrimaryAdvertisementRow(
      calculatedAdvertisementRows,
      savedType
    );
    const primarySubtype = primaryAdvertisementRow?.subtype || savedSubtype || "";
    const primaryCustomLabel =
      primaryAdvertisementRow?.customLabel || step1.advertisement_type_custom_label || "";

    setApplicationRecord(data);
    setLocalityAddress(formatAddressText(step1.locality_address || step1.map_address || ""));
    setProjectJustification(step1.project_justification || "");
    setSiteSelectionReason(step1.site_selection_reason || "");
    setApplicationTypeOptions(nextApplicationTypes);
    setApplicationSubtype(primarySubtype);
    setAdvertisementRows(calculatedAdvertisementRows);
    setCustomAdvertisementTypes(
      normalizeCustomAdvertisementTypes(step1.custom_advertisement_types)
    );
    setCustomAdvertisementTypeLabel(primaryCustomLabel);

    const supportingDocuments = Array.isArray(data.supporting_documents)
      ? data.supporting_documents
      : [];
    const supportingDocumentIds = new Set(
      supportingDocuments.map((document) => String(document.id))
    );
    const savedSiteImages = (Array.isArray(step1.site_images)
      ? step1.site_images
      : []
    ).filter((image) => isStoredSiteImagePresent(image, supportingDocumentIds));
    const savedSiteImageNamesByDocumentId = getSavedSiteImageNamesByDocumentId(step1);
    const documentSiteImages = supportingDocuments
      .filter((document) => document.title === "Site Image")
      .map((document) => ({
        ...document,
        document_id: document.id,
        name:
          savedSiteImageNamesByDocumentId.get(String(document.id)) ||
          getSiteImageName(document, document.title),
        size: document.size || 0,
        url: getApplicationDocumentUrl(applicationId, document.id),
      }));
    const legacyDocumentId = getSiteImageDocumentId(step1.site_image);
    const legacySiteImage =
      step1.site_image &&
      (!legacyDocumentId || supportingDocumentIds.has(String(legacyDocumentId)))
        ? [step1.site_image]
        : [];
    const nextSiteImages = uniqueSiteImages(
      [...documentSiteImages, ...savedSiteImages, ...legacySiteImage]
        .map((image) =>
          normalizeSiteImageItem(image, applicationId, step1, step1.site_image_name)
        )
    );

    setSiteImages(nextSiteImages);

    setMapData({
      address: formatAddressText(step1.map_address || step1.locality_address || ""),
      latitude: Number(step1.latitude || 1.586684),
      longitude: Number(step1.longitude || 110.334028),
    });
  }

  async function loadDraft() {
    try {
      const data = await apiRequest(`/applications/${applicationId}/`);
      applyDraftData(data);
    } catch (err) {
      console.error("Failed to load draft:", err);
    }
  }

  async function buildStepOnePayload(titleValue, currentStep = 1) {
    const selectedType = getPrimaryApplicationType(selectedApplicationTypes);
    const calculatedAdvertisementRows = advertisementRows.map((row) =>
      withCalculatedAdvertisementRow(row, selectedType)
    );
    const selectedTypes = getAdvertisementRowsApplicationTypes(
      calculatedAdvertisementRows,
      selectedApplicationTypes
    );
    const primaryAdvertisementRow = getPrimaryAdvertisementRow(
      calculatedAdvertisementRows,
      selectedType
    );
    const primaryType = getAdvertisementRowApplicationType(
      primaryAdvertisementRow,
      selectedType
    );
    const selectedSubtype =
      normalizeApplicationSubtype(primaryAdvertisementRow?.subtype, primaryType);
    const selectedCustomLabel = primaryAdvertisementRow?.customLabel || "";
    const applicationTypeDisplay = getApplicationTypeLabel(language, selectedTypes);
    const displayTypeDisplay = getAdvertisementRowsDisplayTypeLabel(
      language,
      calculatedAdvertisementRows,
      getApplicationDisplayTypeFromSubtype(selectedSubtype)
    );
    const advertisementTypeDisplay = getAdvertisementRowsSubtypeLabel(
      language,
      primaryType,
      calculatedAdvertisementRows,
      selectedSubtype,
      selectedCustomLabel
    );
    const technicalDepartments = getApplicationTypeDepartments(selectedTypes);
    const calculatedPayable = getAdvertisementRowsTotalPayable(calculatedAdvertisementRows);
    const selectedProjectAddress = formatAddressText(mapData.address || localityAddress);
    const savedSiteImageAttachments = siteImages
      .filter((image) => !image.file && image.attachment)
      .map((image) => image.attachment);
    const primarySiteImage = savedSiteImageAttachments[0] || null;

    return {
      application_type: "sitting_application",
      title: titleValue,
      current_step: currentStep,
      form_data: {
        step_1: {
          status: "Draft",
          application_type: selectedTypes.join(","),
          application_type_label: applicationTypeDisplay,
          application_type_options: selectedTypes,
          application_subtype: selectedSubtype,
          application_subtype_label: advertisementTypeDisplay,
          advertisement_display_type: getApplicationDisplayTypeFromSubtype(selectedSubtype),
          advertisement_display_type_label: displayTypeDisplay,
          advertisement_type_label: advertisementTypeDisplay,
          advertisement_type_custom_label: selectedCustomLabel,
          advertisement_rows: calculatedAdvertisementRows,
          custom_advertisement_types: customAdvertisementTypes,
          technical_departments: technicalDepartments,
          division: "",
          project_category: applicationTypeDisplay,
          project_name: projectName,
          width_ft: primaryAdvertisementRow?.widthFt || "",
          height_ft: primaryAdvertisementRow?.heightFt || "",
          locality_address: selectedProjectAddress,
          area_required: primaryAdvertisementRow?.areaRequired || "",
          area_unit: "",
          source_of_fund: "",
          fund_availability: "",
          malaysia_plan: "",
          amount_fund_approved: calculatedPayable,

          map_address: selectedProjectAddress,
          latitude: mapData.latitude,
          longitude: mapData.longitude,

          site_image_name: primarySiteImage?.name || siteImages[0]?.name || "",
          site_image: primarySiteImage,
          site_images: savedSiteImageAttachments,
          site_image_document_id: getSiteImageDocumentId(primarySiteImage),
          site_image_url: primarySiteImage?.url || primarySiteImage?.file_url || "",
          site_image_preview: "",

          project_justification: projectJustification,
          site_selection_reason: siteSelectionReason,
          designation: "",
          officer_name: "",
          application_date: "",
        },
      },
    };
  }

  async function saveApplication(payload) {
    return apiRequest(
      applicationId ? `/applications/${applicationId}/` : "/applications/",
      {
        method: applicationId ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      }
    );
  }

  function handleMapDataChange(nextMapData) {
    const normalizedMapData = {
      ...nextMapData,
      address: formatAddressText(nextMapData?.address || ""),
    };
    setMapData(normalizedMapData);
    if (nextMapData?.address !== undefined) {
      setLocalityAddress(normalizedMapData.address);
    }
  }

  function handleAdvertisementRowsChange(nextRows) {
    const selectedType = getPrimaryApplicationType(applicationTypeOptions);
    const calculatedRows = (nextRows.length > 0 ? nextRows : [createEmptyAdvertisementRow()])
      .map((row) => withCalculatedAdvertisementRow(row, selectedType));
    const primaryRow = getPrimaryAdvertisementRow(calculatedRows, selectedType);
    const nextSubtype = primaryRow?.subtype || "";
    const nextApplicationTypes = getAdvertisementRowsApplicationTypes(
      calculatedRows,
      applicationTypeOptions
    );

    setAdvertisementRows(calculatedRows);
    setApplicationTypeOptions(nextApplicationTypes);
    setApplicationSubtype(nextSubtype);
    setCustomAdvertisementTypeLabel(primaryRow?.customLabel || "");
  }

  function handleAdvertisementRowSizeChange(index, field, value) {
    const nextRows = advertisementRows.map((row, rowIndex) =>
      rowIndex === index ? { ...row, [field]: value } : row
    );

    handleAdvertisementRowsChange(nextRows);
  }

  function handleSiteImagesAdd(files) {
    const fileList = Array.from(files || []);
    if (fileList.length === 0) return;

    const nextImages = fileList.map((file) => ({
      key: `local-${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
      document_id: "",
      name: file.name,
      preview: URL.createObjectURL(file),
      size: file.size,
      type: file.type,
      file,
      attachment: null,
    }));

    setSiteImages((current) => [...current, ...nextImages]);
  }

  async function handleSiteImageRemove(imageToRemove) {
    const documentId = getSiteImageDocumentId(imageToRemove);
    const nextImages = siteImages.filter((image) => image.key !== imageToRemove.key);

    async function syncSavedSiteImagesAfterRemoval() {
      if (!applicationId) return;

      const remainingAttachments = nextImages
        .filter((image) => !(image.file instanceof File))
        .map((image) => image.attachment || image)
        .filter((image) => String(getSiteImageDocumentId(image) || "") !== String(documentId));
      const primaryAttachment = remainingAttachments[0] || null;

      await apiRequest(`/applications/${applicationId}/`, {
        method: "PATCH",
        body: JSON.stringify({
          form_data: {
            step_1: {
              site_image_name: primaryAttachment?.name || "",
              site_image: primaryAttachment,
              site_images: remainingAttachments,
              site_image_document_id: getSiteImageDocumentId(primaryAttachment),
              site_image_url: primaryAttachment?.url || primaryAttachment?.file_url || "",
              site_image_preview: "",
            },
          },
        }),
      });
    }

    if (documentId && applicationId) {
      try {
        await deleteApplicationDocument(applicationId, documentId);
      } catch (error) {
        if (error?.status === 404) {
          console.warn("Site image document was already removed:", error);
        } else {
          console.error("Failed to delete site image:", error);
          alert(tx("failedDeleteFile"));
          return;
        }
      }

      try {
        await syncSavedSiteImagesAfterRemoval();
      } catch (error) {
        console.error("Failed to delete site image:", error);
        alert(tx("failedDeleteFile"));
        return;
      }
    }

    if (imageToRemove?.preview?.startsWith("blob:")) {
      URL.revokeObjectURL(imageToRemove.preview);
    }

    setSiteImages(nextImages);
  }

  async function uploadPendingSiteImages(application, payload) {
    const pendingImages = siteImages.filter((image) => image.file instanceof File);
    if (pendingImages.length === 0) return application;

    const uploadedAttachments = await Promise.all(
      pendingImages.map((image) =>
        uploadApplicationDocument(
          application.id,
          "Site Image",
          image.file
        )
      )
    );
    const existingAttachments = siteImages
      .filter((image) => !image.file && image.attachment)
      .map((image) => image.attachment);
    const siteImageAttachments = [...existingAttachments, ...uploadedAttachments];
    const primaryAttachment = siteImageAttachments[0] || null;
    const formData = application.form_data || payload.form_data || {};
    const step1 = formData.step_1 || payload.form_data?.step_1 || {};

    const updatedApplication = await apiRequest(`/applications/${application.id}/`, {
      method: "PATCH",
      body: JSON.stringify({
        form_data: {
          ...formData,
          step_1: {
            ...step1,
            site_image_name: primaryAttachment?.name || "",
            site_image: primaryAttachment,
            site_images: siteImageAttachments,
            site_image_document_id: getSiteImageDocumentId(primaryAttachment),
            site_image_url: primaryAttachment?.url || primaryAttachment?.file_url || "",
            site_image_preview: "",
          },
        },
      }),
    });

    setSiteImages(
      siteImageAttachments
        .map((image) => normalizeSiteImageItem(image, application.id, step1))
        .filter(Boolean)
    );

    return updatedApplication;
  }

  async function handleSave() {
    if (isReadOnly) return;

    const selectedTypes = getAdvertisementRowsApplicationTypes(
      advertisementRows,
      applicationTypeOptions
    );
    const selectedType = getPrimaryApplicationType(selectedTypes);
    const primaryAdvertisementRow = getPrimaryAdvertisementRow(
      advertisementRows,
      selectedType
    );
    const advertisementRowsComplete =
      advertisementRows.length > 0 &&
      advertisementRows.every((row) => {
        const rowType = getSelectedAdvertisementRowApplicationType(row);

        return (
          rowType &&
          row.displayType &&
          normalizeApplicationSubtype(row.subtype, rowType) &&
          (row.customLabel || getApplicationSubtypeLabel(language, rowType, row.subtype)) &&
          String(row.widthFt || "").trim() &&
          String(row.heightFt || "").trim() &&
          String(row.areaRequired || "").trim() &&
          String(row.amountFundApproved || "").trim()
        );
      });

    if (
      !projectName.trim() ||
      !String(mapData.address || localityAddress).trim() ||
      !projectJustification.trim() ||
      !siteSelectionReason.trim() ||
      normalizeApplicationTypeOptions(selectedTypes).length === 0 ||
      !primaryAdvertisementRow ||
      !advertisementRowsComplete
    ) {
      alert(tx("requiredAlert"));
      return;
    }

    try {
      const payload = await buildStepOnePayload(projectName, 3);
      const data = await saveApplication(payload);
      const savedData = await uploadPendingSiteImages(data, payload);
      if (!isAdminReview) {
        markApplicantRecordSeen("status", savedData);
      }

      navigate(
        isAdminReview
          ? `/admin/applications/${savedData.id}/step-3?id=${savedData.id}`
          : `/applications/${savedData.id}/supporting-document?id=${savedData.id}`
      );
    } catch (err) {
      console.error("Save failed:", err);
      alert(tx("failedSaveStep2"));
    }
  }

  async function handleSaveDraftAndBack() {
    if (isReadOnly) {
      navigate(
        isAdminReview
          ? "/admin/applications"
          : getApplicantSaveDraftReturnPath(applicationRecord)
      );
      return;
    }

    try {
      const payload = await buildStepOnePayload(
        projectName || tx("draftSittingApplication"),
        2
      );
      const data = await saveApplication(payload);

      try {
        await uploadPendingSiteImages(data, payload);
      } catch (uploadErr) {
        console.error("Draft site image upload failed:", uploadErr);
        alert(tx("draftSavedWithoutUpload"));
      }

      navigate(
        isAdminReview
          ? "/admin/applications"
          : getApplicantSaveDraftReturnPath(data)
      );
    } catch (err) {
      console.error("Draft save failed:", err);
      alert(err.message || tx("failedSaveDraft"));
    }
  }

  const isReadOnly =
    isAdminView ||
    (!isAdminReview &&
      Boolean(applicationId) &&
      (!applicationRecord || !canEditApplicationForm(applicationRecord)));
  const summaryStep1 = {
    status: "Draft",
    application_type: selectedApplicationTypes.join(","),
    application_type_options: selectedApplicationTypes,
    application_subtype: applicationSubtype,
    advertisement_type_custom_label: customAdvertisementTypeLabel,
    advertisement_rows: advertisementRows,
  };

  return (
    <Layout>
      <div className="flex gap-4">
        {StepNav && <StepNav active={2} />}

        <main className="flex-1 min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="bg-[#18b36b] text-white text-sm font-bold px-3 py-1">
                2
              </span>
              <h1 className="text-lg font-semibold text-[#1a1c1c]">
                {tx("sittingApplication")}
              </h1>
            </div>

            {isAdminView ? (
              <AdminViewStepControls
                applicationId={applicationId}
                currentStep={2}
                language={language}
              />
            ) : isReadOnly ? (
              <UserViewStepControls
                applicationId={applicationId}
                currentStep={2}
                language={language}
              />
            ) : (
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={handleSaveDraftAndBack}
                  className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
                >
                  {tx(getApplicantSaveDraftReturnLabelKey(applicationRecord))}
                </button>

                <Link
                  to={
                    isAdminReview
                      ? `/admin/applications/${applicationId}/step-1?id=${applicationId}`
                      : `/applications/${applicationId}/submitting-person?id=${applicationId}`
                  }
                  className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
                >
                  {tx("previous")}
                </Link>

                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={handleSave}
                    className="px-3 py-1.5 bg-[#006d32] text-white rounded text-xs font-semibold hover:bg-[#005224]"
                  >
                    {tx("saveNext")}
                  </button>
                )}
              </div>
            )}
          </div>

          <section className="bg-white border border-slate-200 rounded-sm overflow-hidden">
            <ApplicationSummary
              application={applicationRecord}
              language={language}
              step1={summaryStep1}
            />

            <div className="p-4 space-y-3">
              <fieldset disabled={isReadOnly} className="space-y-3">
                <FormSection title={tx("applicationProjectList")} required>
                  <ApplicationTypeCheckboxes
                    language={language}
                    advertisementRows={advertisementRows}
                    customAdvertisementTypes={customAdvertisementTypes}
                    onAdvertisementRowsChange={handleAdvertisementRowsChange}
                    onCustomAdvertisementTypesChange={setCustomAdvertisementTypes}
                    advertisementTypeModal={advertisementTypeModal}
                    onAdvertisementTypeModalChange={setAdvertisementTypeModal}
                    readOnly={isReadOnly}
                  />
                </FormSection>

              <LocationMap
                value={mapData}
                onChange={handleMapDataChange}
                readOnly={isReadOnly}
                language={language}
              />

              </fieldset>

              <SiteImageUpload
                images={siteImages}
                readOnly={isReadOnly}
                language={language}
                onAdd={handleSiteImagesAdd}
                onRemove={handleSiteImageRemove}
              />

              <fieldset disabled={isReadOnly} className="space-y-3">
              <div className="space-y-4">
                {advertisementRows.map((row, index) => {
                  const selectedType = getAdvertisementRowApplicationType(
                    row,
                    selectedApplicationType
                  );
                  const rowAreaSqm =
                    calculateAreaSqmFromFt(row.widthFt, row.heightFt) ||
                    parsePositiveNumber(row.areaRequired);
                  const rowLabel = getAdvertisementRowDisplayLabel(
                    language,
                    selectedType,
                    row,
                    index
                  );

                  return (
                    <section
                      key={`advertisement-size-${index}`}
                      className="rounded-sm border border-slate-200 bg-white p-3"
                    >
                      <h3 className="mb-3 text-xs font-bold text-slate-800">
                        {rowLabel}
                      </h3>

                      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,500px)_minmax(360px,1fr)]">
                        <div className="space-y-3">
                          <Field label={tx("advertisementSizeFt")} required guideline={tx("advertisementSizeFtGuideline")}>
                            <div className="grid max-w-md grid-cols-[minmax(0,1fr)_auto_auto_minmax(0,1fr)_auto] items-center gap-2">
                              <input
                                className="spa-input"
                                value={row.widthFt}
                                onChange={(e) =>
                                  handleAdvertisementRowSizeChange(index, "widthFt", e.target.value)
                                }
                                inputMode="decimal"
                                placeholder={tx("widthFt")}
                                readOnly={isReadOnly}
                              />
                              <span className="text-xs font-semibold text-slate-500">ft</span>
                              <span className="text-xs font-bold text-slate-500">x</span>
                              <input
                                className="spa-input"
                                value={row.heightFt}
                                onChange={(e) =>
                                  handleAdvertisementRowSizeChange(index, "heightFt", e.target.value)
                                }
                                inputMode="decimal"
                                placeholder={tx("heightFt")}
                                readOnly={isReadOnly}
                              />
                              <span className="text-xs font-semibold text-slate-500">ft</span>
                            </div>
                          </Field>

                          <Field label={tx("areaRequired")} required guideline={tx("areaRequiredGuideline")}>
                            <input
                              className="spa-input max-w-md bg-slate-50 text-slate-700"
                              value={row.areaRequired}
                              readOnly
                            />
                          </Field>

                          <Field label={tx("malaysiaPlanRm")} required guideline={tx("malaysiaPlanRmGuideline")}>
                            <input
                              className="spa-input max-w-md bg-slate-50 text-slate-700"
                              value={row.amountFundApproved}
                              readOnly
                            />
                          </Field>
                        </div>

                        <FeeCalculationBreakdown
                          tx={tx}
                          widthFt={row.widthFt}
                          heightFt={row.heightFt}
                          areaSqm={rowAreaSqm}
                          subtype={row.subtype}
                        />
                      </div>
                    </section>
                  );
                })}

              </div>

              <SimpleWysiwygEditor
                key={`project-justification-${applicationId || "new"}`}
                label={tx("projectJustification")}
                value={projectJustification}
                onChange={setProjectJustification}
                max={3000}
                readOnly={isReadOnly}
              />

              <p className="-mt-2 text-[11px] italic text-slate-500">
                {tx("projectBriefHelp")}
              </p>

              <SimpleWysiwygEditor
                key={`site-selection-reason-${applicationId || "new"}`}
                label={tx("siteSelectionReason")}
                value={siteSelectionReason}
                onChange={setSiteSelectionReason}
                max={1500}
                readOnly={isReadOnly}
              />

              <p className="-mt-2 text-[11px] italic text-slate-500">
                {tx("additionalSheetHelp")}
              </p>

              {isAdminView ? (
                <AdminViewStepControls
                  applicationId={applicationId}
                  currentStep={2}
                  language={language}
                  className="pt-2"
                />
              ) : isReadOnly ? (
                <UserViewStepControls
                  applicationId={applicationId}
                  currentStep={2}
                  language={language}
                  className="pt-2"
                />
              ) : (
                <div className="flex flex-wrap justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleSaveDraftAndBack}
                    className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
                  >
                    {tx(getApplicantSaveDraftReturnLabelKey(applicationRecord))}
                  </button>

                  <Link
                    to={
                      isAdminReview
                        ? `/admin/applications/${applicationId}/step-1?id=${applicationId}`
                        : `/applications/${applicationId}/submitting-person?id=${applicationId}`
                    }
                    className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
                  >
                    {tx("previous")}
                  </Link>

                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={handleSave}
                      className="px-3 py-1.5 bg-[#006d32] text-white rounded text-xs font-semibold hover:bg-[#005224]"
                    >
                      {tx("saveNext")}
                    </button>
                  )}
                </div>
              )}
              </fieldset>
            </div>
          </section>
        </main>
      </div>
    </Layout>
  );
}

function LocationMap({ value, onChange, readOnly = false, language = "en" }) {
  const tx = (key) => stepText(language, key);
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const debounceRef = useRef(null);
  const readOnlyRef = useRef(readOnly);

  const defaultLng = 110.334028;
  const defaultLat = 1.586684;

  const [lng, setLng] = useState(value?.longitude || defaultLng);
  const [lat, setLat] = useState(value?.latitude || defaultLat);
  const [address, setAddress] = useState(value?.address || "");
  const [suggestions, setSuggestions] = useState([]);
  const [mode, setMode] = useState("2d");
  const [scene, setScene] = useState("street");
  const [loadingAddress, setLoadingAddress] = useState(false);
  const [searching, setSearching] = useState(false);

  const styles = {
    street: "mapbox://styles/mapbox/streets-v12",
    satellite: "mapbox://styles/mapbox/satellite-streets-v12",
    outdoor: "mapbox://styles/mapbox/outdoors-v12",
  };

  useEffect(() => {
    const nextLng = Number(value?.longitude || defaultLng);
    const nextLat = Number(value?.latitude || defaultLat);
    const nextAddress = formatAddressText(value?.address ?? address);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLng(nextLng);
    setLat(nextLat);
    setAddress(nextAddress);

    markerRef.current?.setLngLat([nextLng, nextLat]);
    mapRef.current?.setCenter([nextLng, nextLat]);
  }, [value?.longitude, value?.latitude, value?.address]);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: styles.street,
      center: [lng, lat],
      zoom: 16,
      pitch: 0,
      bearing: 0,
    });

    mapRef.current = map;
    setMapInteractivity(map, !readOnlyRef.current);

    map.addControl(
      new mapboxgl.NavigationControl({
        visualizePitch: true,
      }),
      "top-right"
    );

    markerRef.current = new mapboxgl.Marker({
      color: "#dc2626",
      draggable: !readOnly,
    })
      .setLngLat([lng, lat])
      .addTo(map);

    markerRef.current.on("dragend", () => {
      if (readOnlyRef.current) return;

      const position = markerRef.current.getLngLat();
      // eslint-disable-next-line react-hooks/immutability
      updateLocationFromCoordinates(position.lng, position.lat, true);
    });

    map.on("click", (event) => {
      if (readOnlyRef.current) return;

      updateLocationFromCoordinates(event.lngLat.lng, event.lngLat.lat, true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    readOnlyRef.current = readOnly;
    markerRef.current?.setDraggable(!readOnly);
    if (mapRef.current) {
      setMapInteractivity(mapRef.current, !readOnly);
    }
  }, [readOnly]);

  function pushChange(nextAddress, nextLat, nextLng) {
    onChange?.({
      address: formatAddressText(nextAddress),
      latitude: nextLat,
      longitude: nextLng,
    });
  }

  async function reverseGeocode(nextLng, nextLat) {
    try {
      setLoadingAddress(true);

      const url =
        `https://nominatim.openstreetmap.org/reverse` +
        `?lat=${nextLat}&lon=${nextLng}` +
        `&format=json` +
        `&addressdetails=1` +
        `&zoom=18`;

      const response = await fetch(url, {
        headers: { "Accept-Language": "en", "User-Agent": "SittingApp/1.0" },
      });
      const data = await response.json();

      if (data && (data.display_name || data.address)) {
        const addr = data.address || {};
        const buildingName =
          data.name ||
          addr.building ||
          addr.amenity ||
          addr.shop ||
          addr.office ||
          addr.tourism ||
          "";
        const road = addr.road || addr.pedestrian || addr.footway || "";
        const suburb = addr.suburb || addr.neighbourhood || addr.quarter || "";
        const city = addr.city || addr.town || addr.village || addr.county || "";
        const state = addr.state || "";

        const parts = [
          buildingName,
          road,
          suburb,
          city,
          state,
          "Malaysia",
        ].filter(Boolean);

        const nextAddress = formatAddressText(parts.join(", ") || data.display_name);

        setAddress(nextAddress);
        pushChange(nextAddress, nextLat, nextLng);
      }
    } catch (error) {
      console.error("Reverse geocoding failed:", error);
    } finally {
      setLoadingAddress(false);
    }
  }

  function updateLocationFromCoordinates(nextLng, nextLat, shouldReverse = false) {
    if (readOnlyRef.current) return;

    const fixedLng = Number(nextLng.toFixed(6));
    const fixedLat = Number(nextLat.toFixed(6));

    setLng(fixedLng);
    setLat(fixedLat);

    markerRef.current?.setLngLat([fixedLng, fixedLat]);

    mapRef.current?.easeTo({
      center: [fixedLng, fixedLat],
      zoom: Math.max(mapRef.current.getZoom(), 16),
      duration: 500,
    });

    if (shouldReverse) {
      reverseGeocode(fixedLng, fixedLat);
    } else {
      pushChange(address, fixedLat, fixedLng);
    }
  }

  async function fetchGeocodeResults(url) {
    const response = await fetch(url);
    const data = await response.json();
    return (data?.features || []).map((feature) => ({
      id: feature.id,
      text: formatAddressText(feature.text || feature.place_name?.split(",")[0] || ""),
      place_name: formatAddressText(feature.place_name || ""),
      center: feature.geometry?.coordinates || feature.center,
    }));
  }

  async function fetchNominatimResults(keyword) {
    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?q=${encodeURIComponent(keyword)}` +
      `&format=json` +
      `&addressdetails=1` +
      `&limit=8` +
      `&countrycodes=my` +
      `&viewbox=109.7,2.2,111.2,0.8` +
      `&bounded=0`;

    const response = await fetch(url, {
      headers: { "Accept-Language": "en", "User-Agent": "SittingApp/1.0" },
    });
    const data = await response.json();

    return data.map((item) => {
      const addr = item.address || {};
      const buildingName =
        addr.building ||
        addr.amenity ||
        addr.shop ||
        addr.office ||
        addr.tourism ||
        "";
      const road = addr.road || addr.pedestrian || addr.footway || "";
      const suburb = addr.suburb || addr.neighbourhood || addr.quarter || "";
      const city = addr.city || addr.town || addr.village || addr.county || "";
      const state = addr.state || "";

      const shortLabel =
        buildingName || road || item.name || item.display_name.split(",")[0];

      const fullLabel = [
        buildingName,
        road,
        suburb,
        city,
        state,
        "Malaysia",
      ]
        .filter(Boolean)
        .join(", ");

      return {
        id: item.place_id,
        text: formatAddressText(shortLabel),
        place_name: formatAddressText(fullLabel || item.display_name),
        center: [parseFloat(item.lon), parseFloat(item.lat)],
      };
    });
  }

  async function searchAddress(keyword) {
    const cleanKeyword = keyword.trim();

    if (!cleanKeyword || cleanKeyword.length < 3) {
      setSuggestions([]);
      return;
    }

    try {
      setSearching(true);

      let results = await fetchNominatimResults(cleanKeyword);

      if (results.length === 0) {
        const encodedKuchingQuery = encodeURIComponent(
          `${cleanKeyword}, Kuching, Sarawak, Malaysia`
        );

        const kuchingUrl =
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedKuchingQuery}.json` +
          `?access_token=${MAPBOX_TOKEN}` +
          `&language=en` +
          `&country=my` +
          `&limit=8` +
          `&proximity=110.334028,1.586684` +
          `&bbox=109.7,0.8,111.2,2.2`;

        results = await fetchGeocodeResults(kuchingUrl);
      }

      if (results.length === 0) {
        const encodedMalaysiaQuery = encodeURIComponent(
          `${cleanKeyword}, Malaysia`
        );

        const malaysiaUrl =
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedMalaysiaQuery}.json` +
          `?access_token=${MAPBOX_TOKEN}` +
          `&language=en` +
          `&country=my` +
          `&limit=8` +
          `&proximity=110.334028,1.586684`;

        results = await fetchGeocodeResults(malaysiaUrl);
      }

      setSuggestions(results);
    } catch (error) {
      console.error("Address search failed:", error);
      setSuggestions([]);
    } finally {
      setSearching(false);
    }
  }

  function handleAddressChange(event) {
    if (readOnly) return;

    const nextAddress = formatAddressText(event.target.value);
    setAddress(nextAddress);
    pushChange(nextAddress, lat, lng);

    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      searchAddress(nextAddress);
    }, 350);
  }

  function selectSuggestion(place) {
    if (readOnlyRef.current) return;

    const [selectedLng, selectedLat] = place.center;

    const nextAddress = formatAddressText(place.place_name);
    setAddress(nextAddress);
    setSuggestions([]);

    const fixedLng = Number(selectedLng.toFixed(6));
    const fixedLat = Number(selectedLat.toFixed(6));

    setLng(fixedLng);
    setLat(fixedLat);

    markerRef.current?.setLngLat([fixedLng, fixedLat]);
    mapRef.current?.easeTo({
      center: [fixedLng, fixedLat],
      zoom: 16,
      duration: 500,
    });

    pushChange(nextAddress, fixedLat, fixedLng);
  }

  function apply2D() {
    setMode("2d");

    mapRef.current?.easeTo({
      pitch: 0,
      bearing: 0,
      duration: 700,
    });
  }

  function apply3D() {
    setMode("3d");

    mapRef.current?.easeTo({
      pitch: 60,
      bearing: -25,
      duration: 700,
    });
  }

  function focusLocation() {
    if (!mapRef.current) return;
    mapRef.current.flyTo({
      center: [lng, lat],
      zoom: 17,
      pitch: mode === "3d" ? 60 : 0,
      bearing: mode === "3d" ? -25 : 0,
      duration: 900,
    });
  }

  function changeScene(nextScene) {
    setScene(nextScene);

    if (mapRef.current) {
      mapRef.current.setStyle(styles[nextScene]);
      setMapInteractivity(mapRef.current, !readOnlyRef.current);
    }
  }

  return (
    <FormSection title={tx("locationMap")}>
      <div className="space-y-3">
        <div>
          <Field label={tx("projectAddressSearch")}>
            <div className="relative">
              <input
                className="spa-input"
                value={address}
                onChange={handleAddressChange}
                readOnly={readOnly}
                placeholder={tx("addressSearchPlaceholder")}
              />

              {(suggestions.length > 0 || searching) && (
                <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded border border-slate-200 bg-white shadow-lg">
                  {searching && (
                    <div className="px-3 py-2 text-xs text-slate-500">
                      {tx("searchingAddress")}
                    </div>
                  )}

                  {!searching &&
                    suggestions.map((place) => (
                      <button
                        key={place.id}
                        type="button"
                        onClick={() => selectSuggestion(place)}
                        className="block w-full border-b border-slate-100 px-3 py-2 text-left text-xs hover:bg-[#f1f5f4]"
                      >
                        <span className="font-semibold text-slate-800">
                          {place.text}
                        </span>
                        <span className="block text-[11px] text-slate-500">
                          {place.place_name}
                        </span>
                      </button>
                    ))}
                </div>
              )}
            </div>
          </Field>

          <p className="mt-1 text-[11px] text-slate-500">
            {tx("addressSearchHelp")}
          </p>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-700">
              {tx("pinpointLocation")}
            </p>
            <p className="text-[11px] text-slate-500">
              {tx("pinpointHelp")}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={focusLocation}
              title={tx("flyBackTitle")}
              className="px-3 py-1.5 rounded text-[11px] font-bold border bg-white text-slate-700 border-slate-300 hover:bg-slate-50 flex items-center gap-1"
            >
              {tx("focus")}
            </button>

            <span className="border-l border-slate-200 self-stretch" />
            <button
              type="button"
              onClick={apply2D}
              className={`px-3 py-1.5 rounded text-[11px] font-bold border ${
                mode === "2d"
                  ? "bg-[#006d32] text-white border-[#006d32]"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
            >
              2D
            </button>

            <button
              type="button"
              onClick={apply3D}
              className={`px-3 py-1.5 rounded text-[11px] font-bold border ${
                mode === "3d"
                  ? "bg-[#006d32] text-white border-[#006d32]"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
            >
              3D
            </button>

            <button
              type="button"
              onClick={() => changeScene("street")}
              className={`px-3 py-1.5 rounded text-[11px] font-bold border ${
                scene === "street"
                  ? "bg-[#18b36b] text-white border-[#18b36b]"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
            >
              {tx("street")}
            </button>

            <button
              type="button"
              onClick={() => changeScene("satellite")}
              className={`px-3 py-1.5 rounded text-[11px] font-bold border ${
                scene === "satellite"
                  ? "bg-[#18b36b] text-white border-[#18b36b]"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
            >
              {tx("satellite")}
            </button>

            <button
              type="button"
              onClick={() => changeScene("outdoor")}
              className={`px-3 py-1.5 rounded text-[11px] font-bold border ${
                scene === "outdoor"
                  ? "bg-[#18b36b] text-white border-[#18b36b]"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
            >
              {tx("outdoor")}
            </button>
          </div>
        </div>

        <div
          ref={mapContainer}
          className="h-[380px] w-full overflow-hidden rounded-md border border-slate-300"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label={tx("latitude")}>
            <input className="spa-input bg-slate-50" value={lat} readOnly />
          </Field>

          <Field label={tx("longitude")}>
            <input className="spa-input bg-slate-50" value={lng} readOnly />
          </Field>
        </div>

        {loadingAddress && (
          <p className="text-[11px] text-slate-500">{tx("updatingAddress")}</p>
        )}
      </div>
    </FormSection>
  );
}

function setMapInteractivity(map, enabled) {
  const action = enabled ? "enable" : "disable";

  map.dragPan[action]();
  map.scrollZoom[action]();
  map.boxZoom[action]();
  map.dragRotate[action]();
  map.keyboard[action]();
  map.doubleClickZoom[action]();
  map.touchZoomRotate[action]();
}

function SiteImageUpload({ images = [], onAdd, onRemove, readOnly = false, language = "en" }) {
  const tx = (key) => stepText(language, key);
  const maxSiteImageBytes = 15 * 1024 * 1024;
  const acceptedSiteImageTypes = new Set([
    "image/png",
    "image/jpeg",
    "application/pdf",
  ]);

  function isAcceptedSiteImageFile(file) {
    const extension = String(file?.name || "").toLowerCase().split(".").pop();

    return (
      acceptedSiteImageTypes.has(file?.type) ||
      ["png", "jpg", "jpeg", "pdf"].includes(extension)
    );
  }

  function isPdfSiteImage(image) {
    const name = String(image?.name || image?.preview || "").toLowerCase();
    const type = String(image?.type || image?.file?.type || image?.attachment?.type || "").toLowerCase();

    return type === "application/pdf" || name.endsWith(".pdf");
  }

  function getSiteImageFormat(image) {
    const type = String(image?.type || image?.file?.type || image?.attachment?.type || "").toLowerCase();
    const name = String(image?.name || image?.preview || "").toLowerCase();
    const extension = name.includes(".") ? name.split(".").pop() : "";

    if (type === "application/pdf" || extension === "pdf") return "PDF";
    if (type === "image/png" || extension === "png") return "PNG";
    if (type === "image/jpeg" || extension === "jpg" || extension === "jpeg") return "JPG";

    return extension ? extension.toUpperCase() : "FILE";
  }

  function formatFileSize(bytes) {
    const size = Number(bytes || 0);
    if (!Number.isFinite(size) || size <= 0) return "";

    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;

    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  function getSiteImageMeta(image) {
    return [getSiteImageFormat(image), formatFileSize(image?.size || image?.file?.size || image?.attachment?.size)]
      .filter(Boolean)
      .join(" · ");
  }

  function isInlinePreview(preview) {
    return (
      typeof preview === "string" &&
      (preview.startsWith("blob:") || preview.startsWith("data:"))
    );
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[char];
    });
  }

  function handleFileChange(e) {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter((file) => {
      return isAcceptedSiteImageFile(file) && file.size <= maxSiteImageBytes;
    });

    if (validFiles.length !== files.length) {
      alert(tx("siteImageInvalidFile"));
    }

    onAdd?.(validFiles);
    e.target.value = "";
  }

  async function getFileObjectUrl(image) {
    const preview = image?.preview;
    if (!preview) return "";
    if (isInlinePreview(preview)) return preview;

    const blob = await fetchAuthenticatedBlob(preview);
    return URL.createObjectURL(blob);
  }

  async function handleView(image) {
    try {
      const objectUrl = await getFileObjectUrl(image);
      if (!objectUrl) {
        return;
      }
      const shouldRevoke = !isInlinePreview(image?.preview);

      window.open(objectUrl, "_blank");

      if (shouldRevoke) {
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5 * 60 * 1000);
      }
    } catch (error) {
      console.error("Failed to view site image:", error);
      alert(tx("failedViewFile"));
    }
  }

  async function handleDownload(image) {
    try {
      const objectUrl = await getFileObjectUrl(image);
      if (!objectUrl) return;
      const shouldRevoke = !isInlinePreview(image?.preview);

      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = image?.name || "site-image";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      if (shouldRevoke) {
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      }
    } catch (error) {
      console.error("Failed to download site image:", error);
      alert(tx("failedDownload"));
    }
  }

  return (
    <FormSection title={tx("siteImage")}>
      <div className="space-y-3">
        {!readOnly && (
          <label className="inline-flex min-h-9 cursor-pointer items-center justify-center rounded-md border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-sm font-semibold leading-5 text-white hover:bg-emerald-800">
            <span className="material-symbols-outlined mr-1 text-base">
              add_photo_alternate
            </span>
            {tx("clickUploadSiteImage")}
            <input
              type="file"
              accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
        )}

        {!readOnly && (
          <p className="text-xs font-medium text-slate-500">
            {tx("imageOnly")}
          </p>
        )}

        {images.length === 0 ? (
          <div className="flex min-h-16 items-center justify-center rounded-md border-2 border-dashed border-slate-300 bg-slate-50 px-4 text-center">
            <p className="text-xs font-semibold text-slate-500">
              {tx("noAttachment")}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {images.map((image, index) => (
              <div
                key={image.key || `${image.name}-${index}`}
                className="flex min-h-14 items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="material-symbols-outlined text-xl text-slate-500">
                    image
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-700">
                      {image.name || `site-image-${index + 1}`}
                    </p>
                    <p className="text-xs text-slate-500">
                      {getSiteImageMeta(image)}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleView(image)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded text-slate-600 hover:bg-white hover:text-slate-900"
                    title={tx("view")}
                    aria-label={tx("view")}
                  >
                    <span className="material-symbols-outlined text-xl">visibility</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownload(image)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded text-slate-600 hover:bg-white hover:text-slate-900"
                    title={tx("download")}
                    aria-label={tx("download")}
                  >
                    <span className="material-symbols-outlined text-xl">download</span>
                  </button>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => onRemove?.(image)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded text-red-600 hover:bg-white hover:text-red-700"
                      title={tx("remove")}
                      aria-label={tx("remove")}
                    >
                      <span className="material-symbols-outlined text-xl">delete</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-[11px] text-slate-500">
          {tx("siteImageHelp")}
        </p>
      </div>
    </FormSection>
  );
}

function FormSection({ title, children, required = false }) {
  return (
    <section className="border border-slate-200 rounded-sm overflow-hidden">
      <div className="bg-[#f7f7f7] border-b px-3 py-2">
        <h2 className="text-xs font-bold text-slate-700">
          {title}
          {required && <span className="ml-1 text-red-500">*</span>}
        </h2>
      </div>

      <div className="p-3">{children}</div>
    </section>
  );
}

function Field({ label, children, required = false, guideline = "" }) {
  return (
    <div className="relative">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
        <span>
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </span>
        {guideline && <GuidelineHint text={guideline} />}
      </div>

      {children}
    </div>
  );
}

function FeeCalculationBreakdown({ tx, widthFt, heightFt, areaSqm, subtype = "" }) {
  const width = parsePositiveNumber(widthFt);
  const height = parsePositiveNumber(heightFt);
  const areaSqft = width && height ? width * height : 0;
  const breakdown = calculateIklFeeBreakdown(areaSqm, subtype);

  return (
    <details className="self-start rounded-sm border border-slate-200 bg-slate-50">
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100">
        {tx("calculationBreakdown")}
      </summary>

      <div className="border-t border-slate-200 bg-white px-3 py-2">
        {breakdown ? (
          <div className="grid gap-1.5 text-xs text-slate-700">
            <CalculationRow
              label={tx("calculationSchedule")}
              value={tx(`calculationSchedule${breakdown.scheduleNumber}`)}
            />
            <CalculationRow
              label={tx("calculationSize")}
              value={
                width && height
                  ? `${formatCalculationNumber(width)} ft x ${formatCalculationNumber(height)} ft`
                  : "-"
              }
            />
            <CalculationRow
              label={tx("calculationAreaFt")}
              value={areaSqft ? `${formatFlexibleDecimal(areaSqft, 10)} ft²` : "-"}
            />
            <CalculationRow
              label={tx("calculationAreaSqm")}
              value={`${formatFlexibleDecimal(areaSqft || 0, 10)} x ${SQFT_TO_SQM} = ${formatCalculatedArea(breakdown.areaSqm)} Sq. m`}
            />
            <CalculationRow
              label={tx(`calculationFirstArea${breakdown.scheduleNumber}`)}
              value={
                breakdown.usesFixedFirstAreaFee
                  ? `${formatCalculatedArea(breakdown.firstAreaSqm)} Sq. m = ${formatCalculatedCurrency(breakdown.firstAreaFixedFee)}`
                  : `${formatCalculatedArea(breakdown.firstAreaSqm)} Sq. m x ${formatCalculatedCurrency(breakdown.firstAreaRate)} = ${formatCalculatedCurrency(breakdown.firstAreaFee)}`
              }
            />
            <CalculationRow
              label={tx("calculationAdditionalArea")}
              value={`${formatWholeNumber(breakdown.additionalAreaSqm)} Sq. m x ${formatCalculatedCurrency(breakdown.additionalAreaRate)} = ${formatCalculatedCurrency(breakdown.additionalAreaFee)}`}
            />
            <CalculationRow
              label={tx("calculationFeeTotal")}
              value={formatCalculatedCurrency(breakdown.feeTotal)}
            />
            <CalculationRow
              label={tx("calculationDeposit")}
              value={formatCalculatedCurrency(breakdown.deposit)}
            />
            <CalculationRow
              label={tx("calculationProcessingFee")}
              value={formatCalculatedCurrency(breakdown.processingFee)}
            />
            <CalculationRow
              label={tx("calculationRoundingAdjustment")}
              guideline={tx("calculationRoundingAdjustmentHelp")}
              value={formatCalculatedCurrency(breakdown.roundingAdjustment)}
            />
            <CalculationRow
              label={tx("calculationTotalPayable")}
              value={formatCalculatedCurrency(breakdown.totalPayable)}
              strong
            />
          </div>
        ) : (
          <p className="text-xs text-slate-500">{tx("calculationEmpty")}</p>
        )}
      </div>
    </details>
  );
}

function CalculationRow({ label, value, strong = false, guideline = "" }) {
  return (
    <div
      className={`grid gap-2 sm:grid-cols-[220px_minmax(0,1fr)] ${
        strong ? "border-t border-slate-200 pt-1 font-bold text-slate-900" : ""
      }`}
    >
      <span className="relative inline-flex items-center gap-1.5">
        {label}
        {guideline && <GuidelineHint text={guideline} />}
      </span>
      <span className="tabular-nums text-slate-800">{value}</span>
    </div>
  );
}

function formatCalculationNumber(value) {
  const number = Number(value) || 0;
  return Number.isInteger(number) ? String(number) : String(number);
}

function GuidelineHint({ text }) {
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

function ApplicationTypeCheckboxes({
  language,
  advertisementRows,
  customAdvertisementTypes,
  onAdvertisementRowsChange,
  onCustomAdvertisementTypesChange,
  advertisementTypeModal,
  onAdvertisementTypeModalChange,
  readOnly,
}) {
  const rows = Array.isArray(advertisementRows) && advertisementRows.length > 0
    ? advertisementRows
    : [createEmptyAdvertisementRow()];
  const rowButtonLabel = stepText(language, "addAdvertisementRow");
  const addTypeLabel = stepText(language, "addAdvertisementOption");
  const deleteRowLabel = stepText(language, "deleteAdvertisementRow");

  function getRowType(index) {
    return getSelectedAdvertisementRowApplicationType(rows[index]);
  }

  function getCustomOptions(rowType, displayType, customLabel = "") {
    if (!rowType) {
      return customLabel
        ? [{ value: customLabel, label: customLabel }]
        : [];
    }

    if (!displayType) {
      return customLabel
        ? [{ value: customLabel, label: customLabel }]
        : [];
    }

    const defaultOptions = ["led", "non_led"].includes(displayType)
      ? DEFAULT_ADVERTISEMENT_TYPES
      : [];
    const optionsByValue = new Map(
      defaultOptions.map((option) => [
        option.value.toLowerCase(),
        {
          value: option.value,
          label: stepText(language, option.labelKey),
        },
      ])
    );

    [
      ...(customAdvertisementTypes?.[rowType]?.[displayType] || []),
      customLabel,
    ]
      .filter(Boolean)
      .forEach((label) => {
        const value = String(label).trim();
        const key = value.toLowerCase();
        if (!optionsByValue.has(key)) {
          optionsByValue.set(key, {
            value,
            label: getApplicationSubtypeLabel(
              language,
              rowType,
              getSubtypeForDisplayType(rowType, displayType),
              value
            ),
          });
        }
      });

    return [...optionsByValue.values()];
  }

  function updateRow(index, updates) {
    if (readOnly) return;

    const nextRows = rows.map((row, rowIndex) =>
      rowIndex === index ? { ...row, ...updates } : row
    );

    onAdvertisementRowsChange(nextRows);
  }

  function selectApplicationType(index, nextType) {
    updateRow(index, {
      applicationType: nextType,
      application_type: nextType,
      subtype: "",
      customLabel: "",
    });
  }

  function selectDisplayType(index, nextDisplayType) {
    updateRow(index, {
      displayType: nextDisplayType,
      subtype: "",
      customLabel: "",
    });
  }

  function selectAdvertisementType(index, nextValue) {
    if (readOnly) return;

    if (!nextValue) {
      updateRow(index, {
        subtype: "",
        customLabel: "",
      });
      return;
    }

    if (nextValue.startsWith("custom:")) {
      const nextCustomLabel = nextValue.replace("custom:", "");
      const rowType = getRowType(index);
      if (!rowType) return;

      const displayType = rows[index]?.displayType || "";
      updateRow(index, {
        subtype: getSubtypeForDisplayType(rowType, displayType),
        customLabel: nextCustomLabel,
      });
      return;
    }

    updateRow(index, {
      subtype: nextValue,
      customLabel: "",
    });
  }

  function addAdvertisementType(index) {
    if (readOnly) return;

    const rowType = getRowType(index);
    if (!rowType) {
      alert(stepText(language, "selectApplicationCategoryFirst"));
      return;
    }

    const displayType = rows[index]?.displayType || "";
    if (!displayType) {
      alert(stepText(language, "selectDisplayTypeFirst"));
      return;
    }

    onAdvertisementTypeModalChange({
      rowIndex: index,
      value: "",
    });
  }

  function closeAdvertisementTypeModal() {
    onAdvertisementTypeModalChange({
      rowIndex: null,
      value: "",
    });
  }

  function saveAdvertisementTypeModal() {
    if (readOnly) return;

    const rowIndex = advertisementTypeModal?.rowIndex;
    const rowType = getRowType(rowIndex);
    const displayType = rows[rowIndex]?.displayType || "";
    const normalizedLabel = String(advertisementTypeModal?.value || "").trim();
    if (rowIndex === null || rowIndex === undefined || !rowType || !displayType) {
      closeAdvertisementTypeModal();
      return;
    }
    if (!normalizedLabel) return;

    const nextCustomTypes = normalizeCustomAdvertisementTypes(customAdvertisementTypes);
    const currentItems = nextCustomTypes[rowType][displayType];

    if (!currentItems.some((item) => item.toLowerCase() === normalizedLabel.toLowerCase())) {
      nextCustomTypes[rowType][displayType] = [...currentItems, normalizedLabel];
      onCustomAdvertisementTypesChange(nextCustomTypes);
    }

    updateRow(rowIndex, {
      subtype: getSubtypeForDisplayType(rowType, displayType),
      customLabel: normalizedLabel,
    });
    closeAdvertisementTypeModal();
  }

  function addRow() {
    if (readOnly) return;
    onAdvertisementRowsChange([...rows, createEmptyAdvertisementRow()]);
  }

  function deleteRow(index) {
    if (readOnly) return;

    if (rows.length <= 1) {
      onAdvertisementRowsChange([createEmptyAdvertisementRow()]);
      return;
    }

    onAdvertisementRowsChange(rows.filter((_, rowIndex) => rowIndex !== index));
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-sm border border-slate-200 bg-white">
        <table className="min-w-full table-auto border-collapse text-sm">
          <colgroup>
            <col className="w-16" />
            <col className="w-[140px]" />
            <col className="w-[170px]" />
            <col className="w-[240px]" />
            <col className="w-px" />
            <col />
          </colgroup>
          <thead className="bg-slate-50 text-center text-xs font-bold text-slate-700">
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
              <th className="whitespace-nowrap border-b border-slate-200 px-3 py-2">
                {stepText(language, "action")}
              </th>
              <th className="border-b border-slate-200 px-3 py-2">
                {stepText(language, "title")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const rowType = getRowType(index);
              const customOptions = getCustomOptions(
                rowType,
                row.displayType,
                row.customLabel
              );
              const selectedAdTypeValue = row.customLabel
                ? `custom:${row.customLabel}`
                : row.subtype;

              return (
                <tr key={`advertisement-row-${index}`} className="align-top">
                  <td className="border-t border-slate-100 px-3 py-3 font-semibold text-slate-700">
                    {index + 1}
                  </td>
                  <td className="border-t border-slate-100 px-3 py-3">
                    <select
                      className="spa-input"
                      value={rowType}
                      disabled={readOnly}
                      onChange={(event) =>
                        selectApplicationType(index, event.target.value)
                      }
                    >
                      <option value="">
                        {stepText(language, "select")}
                      </option>
                      {APPLICATION_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {stepText(language, option.labelKey)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="border-t border-slate-100 px-3 py-3">
                    <select
                      className="spa-input"
                      value={row.displayType}
                      disabled={readOnly}
                      onChange={(event) => selectDisplayType(index, event.target.value)}
                    >
                      <option value="">
                        {stepText(language, "selectDisplayType")}
                      </option>
                      {DISPLAY_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {stepText(language, option.labelKey)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="border-t border-slate-100 px-3 py-3">
                    <select
                      className="spa-input"
                      style={{ paddingRight: "2rem" }}
                      value={selectedAdTypeValue}
                      disabled={readOnly}
                      onChange={(event) => selectAdvertisementType(index, event.target.value)}
                    >
                      <option value="">
                        {stepText(language, "selectAdvertisementType")}
                      </option>
                      {customOptions.map((option) => (
                        <option
                          key={option.value}
                          value={`custom:${option.value}`}
                        >
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="w-px whitespace-nowrap border-t border-slate-100 px-2 py-3">
                    <div className="flex flex-nowrap gap-1.5">
                      <button
                        type="button"
                        className="shrink-0 whitespace-nowrap rounded-sm bg-[#006d32] px-2.5 py-2 text-xs font-semibold text-white hover:bg-[#005224] disabled:cursor-not-allowed disabled:bg-slate-300"
                        disabled={readOnly}
                        onClick={() => addAdvertisementType(index)}
                      >
                        {addTypeLabel}
                      </button>
                      <button
                        type="button"
                        className="shrink-0 whitespace-nowrap rounded-sm border border-red-600 bg-white px-2.5 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
                        disabled={readOnly}
                        onClick={() => deleteRow(index)}
                      >
                        {deleteRowLabel}
                      </button>
                    </div>
                  </td>
                  <td className="border-t border-slate-100 px-3 py-3">
                    <div className="min-h-10 rounded-sm border border-slate-200 bg-white px-3 py-2 text-xs font-normal uppercase leading-5 text-slate-700">
                      {buildProjectNameLine(language, rowType, row) || "-"}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="border-t border-slate-200 bg-slate-50 px-3 py-2">
          <button
            type="button"
            className="rounded-sm border border-emerald-700 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
            disabled={readOnly}
            onClick={addRow}
          >
            {rowButtonLabel}
          </button>
        </div>
      </div>

      {advertisementTypeModal?.rowIndex !== null && advertisementTypeModal?.rowIndex !== undefined && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4">
          <div className="w-full max-w-md rounded-sm border border-slate-200 bg-white shadow-xl">
            <div className="border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-bold text-slate-800">
                {stepText(language, "addAdvertisementTypeModalTitle")}
              </h3>
            </div>

            <div className="space-y-2 px-4 py-4">
              <label className="text-xs font-bold text-slate-700">
                {stepText(language, "advertisementType")}
              </label>
              <input
                className="spa-input"
                value={advertisementTypeModal.value}
                autoFocus
                onChange={(event) =>
                  onAdvertisementTypeModalChange({
                    ...advertisementTypeModal,
                    value: event.target.value,
                  })
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") saveAdvertisementTypeModal();
                  if (event.key === "Escape") closeAdvertisementTypeModal();
                }}
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
              <button
                type="button"
                className="rounded-sm border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                onClick={closeAdvertisementTypeModal}
              >
                {stepText(language, "cancel")}
              </button>
              <button
                type="button"
                className="rounded-sm bg-[#006d32] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#005224] disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={!String(advertisementTypeModal.value || "").trim()}
                onClick={saveAdvertisementTypeModal}
              >
                {stepText(language, "save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SittingApplicationPage;
