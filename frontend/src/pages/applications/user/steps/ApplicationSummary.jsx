import { getApplicationReference } from "../../../../utils/workflow";
import {
  applicationStatusLabel,
  stepText,
} from "./ApplicationStepText";

function ApplicationSummary({ application = null, step1 = {}, language = "en" }) {
  const tx = (key) => stepText(language, key);
  const hasReference = application?.reference_no || application?.id;
  const reference = hasReference ? getApplicationReference(application) : "-";
  const statusText = applicationStatusLabel(language, step1.status || "Draft");

  return (
    <div className="bg-[#f5f5f5] border-b border-slate-200 px-4 py-3 text-xs">
      <div className="grid grid-cols-[140px_1fr] gap-y-1">
        <p>{tx("reference")}</p>
        <p className="font-semibold text-[#006d32]">{reference}</p>

        <p>{tx("status")}</p>
        <p className="font-semibold text-[#006d32]">{statusText}</p>
      </div>
    </div>
  );
}

export default ApplicationSummary;
