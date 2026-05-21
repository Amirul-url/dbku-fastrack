export const WORKFLOW_STATUS = {
  DRAFT: "draft",
  INCOMPLETE: "incomplete",
  SUBMITTED: "submitted",
  UNDER_REVIEW: "under_review",
  AUTO_SCREENED: "auto_screened",
  KU_IKL_REVIEW: "ku_ikl_review",
  TECHNICAL_REVIEW: "technical_review",
  TECHNICAL_SITE_VISIT: "technical_site_visit",
  TECHNICAL_AMENDMENT: "technical_amendment",
  TECHNICAL_REVIEW_COMPLETED: "technical_review_completed",
  MANAGEMENT_REVIEW: "management_review",
  MPHLG_PROCESSING: "mphlg_processing",
  MPHLG_DECISION_RECEIVED: "mphlg_decision_received",
  APPROVED: "approved",
  APPROVED_WITH_CONDITIONS: "approved_with_conditions",
  REJECTED: "rejected",
  BILL_PENDING_KU: "bill_pending_ku",
  INVOICE_GENERATED: "invoice_generated",
  PAYMENT_SUBMITTED: "payment_submitted",
  PAYMENT_VERIFIED: "payment_verified",
  LICENSE_ISSUED: "license_issued",
  LICENSE_REVOKED: "license_revoked",
};

export const AD_LICENSE_FLOW = [
  {
    code: "S1",
    owner: "Pemohon",
    ownerEn: "Applicant",
    phase: "Pendaftaran",
    phaseEn: "Registration",
    title: "Akses portal, log masuk, isi borang dan muat naik dokumen",
    titleEn: "Access portal, login, complete form, and upload documents",
    targetDays: 1,
    status: WORKFLOW_STATUS.DRAFT,
  },
  {
    code: "S2",
    owner: "Bahagian Lesen",
    ownerEn: "Licensing Division",
    phase: "Verifikasi",
    phaseEn: "Verification",
    title: "Semakan dokumen oleh PT(POSC), semak lengkap atau jana memo",
    titleEn: "PT(POSC) document check, completeness review, or memo generation",
    targetDays: 1,
    status: WORKFLOW_STATUS.AUTO_SCREENED,
  },
  {
    code: "S3-S7",
    owner: "Bahagian Lesen",
    ownerEn: "Licensing Division",
    phase: "Teknikal",
    phaseEn: "Technical",
    title: "Penjadualan lawatan, input KU(IKL), auto-jana siting form dan semakan sokongan digital",
    titleEn: "Visit scheduling, KU(IKL) input, siting form generation, and digital support review",
    targetDays: 3,
    status: WORKFLOW_STATUS.TECHNICAL_REVIEW,
  },
  {
    code: "S8-S9",
    owner: "Pengurusan",
    ownerEn: "Management",
    phase: "Perakuan",
    phaseEn: "Recommendation",
    title: "E-signature TP(RES), integrasi MPHLG dan keputusan lulus atau tidak lulus",
    titleEn: "TP(RES) e-signature, MPHLG integration, and pass or fail decision",
    targetDays: 3,
    status: WORKFLOW_STATUS.MANAGEMENT_REVIEW,
  },
  {
    code: "S10-S11",
    owner: "Agensi Luar",
    ownerEn: "External Agency",
    phase: "Agensi Luar",
    phaseEn: "External Agency",
    title: "Proses permohonan di MPHLG dan terima makluman keputusan digital",
    titleEn: "MPHLG processing and receipt of digital decision notice",
    targetDays: 14,
    status: WORKFLOW_STATUS.MPHLG_PROCESSING,
  },
  {
    code: "S12",
    owner: "Pengarah",
    ownerEn: "Director",
    phase: "Kelulusan",
    phaseEn: "Approval",
    title: "E-signature pengarah dan makluman keputusan kepada pemohon",
    titleEn: "Director e-signature and decision notification to applicant",
    targetDays: 1,
    status: WORKFLOW_STATUS.APPROVED,
  },
  {
    code: "S13",
    owner: "Pemohon",
    ownerEn: "Applicant",
    phase: "Penyelesaian",
    phaseEn: "Completion",
    title: "Jana invois, muat naik resit bayaran, verifikasi resit dan muat turun e-lesen QR",
    titleEn: "Generate invoice, upload payment receipt, receipt verification, and QR e-license download",
    targetDays: 2,
    status: WORKFLOW_STATUS.LICENSE_ISSUED,
  },
];

export const TARGET_PROCESSING_DAYS = 25;

export function normalizeStatus(status) {
  return String(status || "").trim().toLowerCase();
}

export function isSubmitted(app) {
  const status = normalizeStatus(app?.status);
  return status !== WORKFLOW_STATUS.DRAFT && Boolean(app?.form_data?.step_11?.submitted);
}

export function canRunAutoScreening(app) {
  return isSubmitted(app);
}

export function canDoTechnicalReview(app) {
  const status = normalizeStatus(app?.status);
  return (
    status === WORKFLOW_STATUS.AUTO_SCREENED ||
    status === WORKFLOW_STATUS.TECHNICAL_REVIEW
  );
}

export function canApprove(app) {
  const status = normalizeStatus(app?.status);
  return (
    status === WORKFLOW_STATUS.TECHNICAL_REVIEW_COMPLETED ||
    status === WORKFLOW_STATUS.MANAGEMENT_REVIEW ||
    status === WORKFLOW_STATUS.MPHLG_DECISION_RECEIVED
  );
}

export function canGenerateInvoice(app) {
  const status = normalizeStatus(app?.status);
  return (
    status === WORKFLOW_STATUS.APPROVED ||
    status === WORKFLOW_STATUS.APPROVED_WITH_CONDITIONS ||
    status === WORKFLOW_STATUS.INVOICE_GENERATED ||
    status === WORKFLOW_STATUS.PAYMENT_SUBMITTED ||
    status === WORKFLOW_STATUS.PAYMENT_VERIFIED ||
    status === WORKFLOW_STATUS.LICENSE_ISSUED
  );
}

export function canSubmitPayment(app) {
  const status = normalizeStatus(app?.status);
  return (
    status === WORKFLOW_STATUS.INVOICE_GENERATED ||
    status === WORKFLOW_STATUS.PAYMENT_SUBMITTED
  );
}

export function canVerifyPayment(app) {
  return normalizeStatus(app?.status) === WORKFLOW_STATUS.PAYMENT_SUBMITTED;
}

export function canIssueLicense(app) {
  return normalizeStatus(app?.status) === WORKFLOW_STATUS.PAYMENT_VERIFIED;
}

export function canViewLicense(app) {
  const status = normalizeStatus(app?.status);
  return (
    status === WORKFLOW_STATUS.LICENSE_ISSUED ||
    status === WORKFLOW_STATUS.LICENSE_REVOKED
  );
}

export function canEditApplicationForm(app) {
  const status = normalizeStatus(app?.status);

  return [
    WORKFLOW_STATUS.DRAFT,
    WORKFLOW_STATUS.INCOMPLETE,
    WORKFLOW_STATUS.TECHNICAL_AMENDMENT,
    WORKFLOW_STATUS.REJECTED,
  ].includes(status);
}

export function needsApplicantCorrection(app) {
  const status = normalizeStatus(app?.status);

  return [
    WORKFLOW_STATUS.INCOMPLETE,
    WORKFLOW_STATUS.TECHNICAL_AMENDMENT,
    WORKFLOW_STATUS.REJECTED,
  ].includes(status);
}

export function getApplicantApplicationRoute(app) {
  const routes = {
    1: "edit",
    2: "submitting-person",
    3: "supporting-document",
    4: "declaration",
    5: "print-form",
  };

  if (needsApplicantCorrection(app)) {
    return "edit";
  }

  if (canEditApplicationForm(app)) {
    const step = Number(app?.current_step || 1);
    return routes[step] || "edit";
  }

  return "print-form";
}

export function getApplicantActionKey(app) {
  if (needsApplicantCorrection(app)) return "common.edit";
  if (canEditApplicationForm(app)) return "common.continue";
  return "common.view";
}

export function formatWorkflowStatus(status) {
  const normalized = normalizeStatus(status);

  if (!normalized) return "Draft";

  const labelMap = {
    [WORKFLOW_STATUS.DRAFT]: "Draft",
    [WORKFLOW_STATUS.INCOMPLETE]: "Incomplete",
    [WORKFLOW_STATUS.SUBMITTED]: "Submitted",
    [WORKFLOW_STATUS.UNDER_REVIEW]: "Under Review",
    pt_ku_review: "For PT/KU Review",
    [WORKFLOW_STATUS.AUTO_SCREENED]: "S2 Verification",
    [WORKFLOW_STATUS.KU_IKL_REVIEW]: "KU(IKL) Verification",
    [WORKFLOW_STATUS.TECHNICAL_REVIEW]: "Technical Review",
    [WORKFLOW_STATUS.TECHNICAL_SITE_VISIT]: "Technical Site Visit",
    [WORKFLOW_STATUS.TECHNICAL_AMENDMENT]: "Technical Amendment Required",
    [WORKFLOW_STATUS.TECHNICAL_REVIEW_COMPLETED]: "Technical Completed",
    [WORKFLOW_STATUS.MANAGEMENT_REVIEW]: "Management Recommendation",
    [WORKFLOW_STATUS.MPHLG_PROCESSING]: "MPHLG Processing",
    [WORKFLOW_STATUS.MPHLG_DECISION_RECEIVED]: "MPHLG Decision Received",
    [WORKFLOW_STATUS.APPROVED]: "Approved",
    [WORKFLOW_STATUS.APPROVED_WITH_CONDITIONS]: "Approved with Conditions",
    [WORKFLOW_STATUS.REJECTED]: "Rejected",
    [WORKFLOW_STATUS.BILL_PENDING_KU]: "Pending Bill Confirmation",
    [WORKFLOW_STATUS.INVOICE_GENERATED]: "Invoice Generated",
    [WORKFLOW_STATUS.PAYMENT_SUBMITTED]: "Payment Submitted",
    [WORKFLOW_STATUS.PAYMENT_VERIFIED]: "Payment Verified",
    [WORKFLOW_STATUS.LICENSE_ISSUED]: "E-License Generated",
    [WORKFLOW_STATUS.LICENSE_REVOKED]: "License Revoked",
  };

  if (labelMap[normalized]) return labelMap[normalized];

  return normalized
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getApplicantDisplayStatus(status) {
  const normalized = normalizeStatus(status);

  if (!normalized) return WORKFLOW_STATUS.DRAFT;

  if (normalized === WORKFLOW_STATUS.INCOMPLETE) {
    return WORKFLOW_STATUS.REJECTED;
  }

  if (
    [
      WORKFLOW_STATUS.AUTO_SCREENED,
      WORKFLOW_STATUS.KU_IKL_REVIEW,
      WORKFLOW_STATUS.TECHNICAL_REVIEW,
      WORKFLOW_STATUS.TECHNICAL_SITE_VISIT,
      WORKFLOW_STATUS.TECHNICAL_REVIEW_COMPLETED,
      WORKFLOW_STATUS.MANAGEMENT_REVIEW,
      WORKFLOW_STATUS.MPHLG_PROCESSING,
      WORKFLOW_STATUS.MPHLG_DECISION_RECEIVED,
    ].includes(normalized)
  ) {
    return WORKFLOW_STATUS.UNDER_REVIEW;
  }

  if (normalized === WORKFLOW_STATUS.BILL_PENDING_KU) {
    return WORKFLOW_STATUS.APPROVED;
  }

  return normalized;
}

export function getApplicationReference(app) {
  return app?.reference_no || `FT-${String(app?.id || 0).padStart(5, "0")}`;
}

export function getStep(app, stepKey) {
  return app?.form_data?.[stepKey] || {};
}

export function getApplicantName(app) {
  const step2 = getStep(app, "step_2");
  const step3 = getStep(app, "step_3");

  return (
    step2.org_name ||
    step2.full_name ||
    step3.org_name ||
    step3.full_name ||
    app?.applicant_full_name ||
    app?.applicant_username ||
    "Applicant"
  );
}

export function getProjectName(app) {
  const step1 = getStep(app, "step_1");

  return (
    step1.project_name ||
    step1.project_title ||
    app?.title ||
    "Siting Application"
  );
}

export function getApplicationType(app) {
  const step1 = getStep(app, "step_1");
  const rawType =
    step1.application_type_label ||
    step1.application_type ||
    step1.project_category ||
    step1.nature_of_application ||
    app?.application_type_label ||
    app?.application_type ||
    "Siting Application";

  const labelMap = {
    sitting_application: "Sitting Application",
    signboard_license: "Signboard License",
    building_plan: "Building Plan",
    other: "Other",
  };

  return labelMap[rawType] || rawType;
}

export function getApplicationLocation(app) {
  const step1 = getStep(app, "step_1");
  const step4 = getStep(app, "step_4");

  return (
    app?.project_location ||
    step1.locality_address ||
    step1.map_address ||
    step1.site_address ||
    step1.address ||
    step1.selected_address ||
    step1.location ||
    step4.land_location ||
    step4.location ||
    "Not provided"
  );
}

export function getApplicationDivision(app) {
  const step1 = getStep(app, "step_1");
  const step4 = getStep(app, "step_4");

  return step1.division || step4.division || "Not provided";
}

export function getInvoiceNo(app) {
  const referenceDigits = String(app?.reference_no || "")
    .match(/(\d+)$/)?.[1];

  if (referenceDigits) {
    return `INV-${String(Number(referenceDigits) || referenceDigits).padStart(5, "0")}`;
  }

  return (
    app?.form_data?.payment?.invoice_no ||
    `INV-${String(app?.id || 0).padStart(5, "0")}`
  );
}

export function getLicenseId(app) {
  if (app?.form_data?.license?.license_id) {
    return app.form_data.license.license_id;
  }

  const referenceDigits = String(app?.reference_no || "")
    .match(/(\d+)$/)?.[1];

  if (referenceDigits) {
    return `ALIS${new Date().getFullYear()}${String(Number(referenceDigits) || referenceDigits).padStart(5, "0")}`;
  }

  return `ALIS${new Date().getFullYear()}${String(app?.id || 0).padStart(5, "0")}`;
}

export function formatCurrency(value) {
  const amount = Number(value || 0);

  return `RM ${amount.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(value) {
  if (!value) return "Not provided";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(value) {
  if (!value) return "Not provided";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatCompactDateTime(value) {
  if (!value) return "Not provided";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
