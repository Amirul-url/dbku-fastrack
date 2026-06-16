import { getApplicationReference } from "../../../../utils/workflow";
import {
  applicationStatusLabel,
  applicationTypeLabel,
  stepText,
} from "./ApplicationStepText";

function ApplicationSummary({ application = null, step1 = {}, language = "en" }) {
  const tx = (key) => stepText(language, key);
  const hasReference = application?.reference_no || application?.id;
  const reference = hasReference ? getApplicationReference(application) : "-";
  const statusText = applicationStatusLabel(language, step1.status || "Draft");
  const applicationTypeText = getMainApplicationTypeLabel(language, step1);
  const displayTypeText = getDisplayTypeSummary(language, step1);
  const advertisementTypeText = getAdvertisementTypeSummary(language, step1);

  return (
    <div className="bg-[#f5f5f5] border-b border-slate-200 px-4 py-3 text-xs">
      <div className="grid grid-cols-[140px_1fr] gap-y-1">
        <p>{tx("reference")}</p>
        <p className="font-semibold text-[#006d32]">{reference}</p>

        <p>{tx("status")}</p>
        <p className="font-semibold text-[#006d32]">{statusText}</p>

        <p>{tx("applicationType")}</p>
        <p className="font-semibold text-[#006d32]">{applicationTypeText || "-"}</p>

        <p>{tx("displayType")}</p>
        <p className="font-semibold text-[#006d32]">{displayTypeText || "-"}</p>

        <p>{tx("advertisementType")}</p>
        <p className="font-semibold text-[#006d32]">{advertisementTypeText || "-"}</p>
      </div>
    </div>
  );
}

function getMainApplicationTypeLabel(language, step1 = {}) {
  const options = Array.isArray(step1.application_type_options)
    ? step1.application_type_options
    : String(step1.application_type || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
  const rawType =
    options[0] ||
    String(step1.application_type_label || step1.project_category || "")
      .split(/\s+-\s+/)[0]
      .trim();

  return applicationTypeLabel(language, rawType);
}

function getDisplayTypeSummary(language, step1 = {}) {
  const rows = getAdvertisementRows(step1);
  const labels = rows
    .map((row) => {
      const displayType =
        row?.displayType ||
        row?.display_type ||
        step1.advertisement_display_type ||
        getDisplayTypeFromSubtype(row?.subtype || step1.application_subtype);

      return getDisplayTypeLabel(language, displayType);
    })
    .filter(Boolean);

  const translatedLabels = [...new Set(labels)].join(", ");
  return (
    translatedLabels ||
    String(step1.advertisement_display_type_label || "").trim()
  );
}

function getAdvertisementTypeSummary(language, step1 = {}) {
  const rows = getAdvertisementRows(step1);
  const labels = rows
    .map((row) => {
      const rawType =
        row?.customLabel ||
        row?.custom_label ||
        row?.subtype ||
        step1.advertisement_type_custom_label ||
        step1.application_subtype ||
        "";

      return getAdvertisementTypeLabel(language, rawType);
    })
    .filter(Boolean);

  const translatedLabels = [...new Set(labels)].join(", ");
  return (
    translatedLabels ||
    String(
      step1.advertisement_type_label || step1.application_subtype_label || ""
    ).trim()
  );
}

function getAdvertisementRows(step1 = {}) {
  if (Array.isArray(step1.advertisement_rows) && step1.advertisement_rows.length > 0) {
    return step1.advertisement_rows;
  }

  if (
    step1.application_subtype ||
    step1.advertisement_type_custom_label ||
    step1.advertisement_display_type
  ) {
    return [
      {
        displayType: step1.advertisement_display_type,
        display_type: step1.advertisement_display_type,
        subtype: step1.application_subtype,
        customLabel: step1.advertisement_type_custom_label,
        custom_label: step1.advertisement_type_custom_label,
      },
    ];
  }

  return [];
}

function getDisplayTypeFromSubtype(subtype) {
  const normalized = String(subtype || "").trim().toLowerCase();

  return normalized.includes("led") ? "led" : normalized ? "non_led" : "";
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

function getAdvertisementTypeLabel(language, value) {
  const label = applicationTypeLabel(language, value);

  return label === stepText(language, "applicationForSite") ? "" : label;
}

export default ApplicationSummary;
