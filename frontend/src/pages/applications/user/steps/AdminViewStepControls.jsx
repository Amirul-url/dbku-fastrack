import { Link, useLocation } from "react-router-dom";
import { stepText } from "./ApplicationStepText";

const TOTAL_STEPS = 5;

function buildStepPath(applicationId, step, from) {
  const params = new URLSearchParams();
  params.set("id", applicationId);
  if (from) params.set("from", from);

  return `/admin/applications/${applicationId}/view/step-${step}?${params.toString()}`;
}

function normalizeDepartmentCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/-/g, " ")
    .replace(/\s+/g, " ");
}

function isApprovalWorkflowUser() {
  try {
    const user = JSON.parse(localStorage.getItem("fastrack_user") || "null");
    const role = String(user?.role || "").trim().toLowerCase();
    const department = normalizeDepartmentCode(user?.department);

    return (
      role === "supervisor" ||
      department === "KB(LES)" ||
      department === "TP(RES)" ||
      department === "PGH" ||
      department === "TP(RES)/PGH" ||
      department === "TP/PGH"
    );
  } catch {
    return false;
  }
}

function buildReturnPath(applicationId, from, approvalWorkflowUser) {
  if (from === "approval" || approvalWorkflowUser) {
    return `/dashboard/admin?view=approval&id=${applicationId}`;
  }

  return "/admin/applications";
}

function DisabledButton({ children }) {
  return (
    <span className="rounded border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-400">
      {children}
    </span>
  );
}

function AdminViewStepControls({ applicationId, currentStep, language, className = "" }) {
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const approvalWorkflowUser = isApprovalWorkflowUser();
  const from = queryParams.get("from") || (approvalWorkflowUser ? "approval" : "");
  const previousStep = currentStep - 1;
  const nextStep = currentStep + 1;

  return (
    <div className={`flex flex-wrap justify-end gap-2 ${className}`}>
      <Link
        to={buildReturnPath(applicationId, from, approvalWorkflowUser)}
        className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
      >
        {stepText(language, "backToAwaitingApproval")}
      </Link>

      {previousStep >= 1 ? (
        <Link
          to={buildStepPath(applicationId, previousStep, from)}
          className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
        >
          {stepText(language, "previous")}
        </Link>
      ) : (
        <DisabledButton>{stepText(language, "previous")}</DisabledButton>
      )}

      {nextStep <= TOTAL_STEPS ? (
        <Link
          to={buildStepPath(applicationId, nextStep, from)}
          className="rounded bg-[#006d32] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#005224]"
        >
          {stepText(language, "next")}
        </Link>
      ) : (
        <DisabledButton>{stepText(language, "next")}</DisabledButton>
      )}
    </div>
  );
}

export default AdminViewStepControls;
