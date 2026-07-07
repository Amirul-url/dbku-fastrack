import { Link, useLocation } from "react-router-dom";
import { stepText } from "./ApplicationStepText";

const TOTAL_STEPS = 5;

function buildStepPath(applicationId, step, currentParams) {
  const params = new URLSearchParams(currentParams);
  params.set("id", applicationId);

  return `/admin/applications/${applicationId}/view/step-${step}?${params.toString()}`;
}

function normalizeDepartmentCode(value) {
  const department = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/-/g, " ")
    .replace(/\s+/g, " ");

  return department === "SETIAUSAHA TETAP" ? "" : department;
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
      department === "FIN" ||
      department === "TP(RES)/PGH" ||
      department === "TP/PGH" ||
      department === "MPHLG"
    );
  } catch {
    return false;
  }
}

function isSafeInternalPath(path) {
  return Boolean(path) && path.startsWith("/") && !path.startsWith("//");
}

function buildReturnPath(applicationId, from, returnTo, approvalWorkflowUser) {
  if (isSafeInternalPath(returnTo)) {
    return returnTo;
  }

  if (from === "approval" || from === "action-panel" || approvalWorkflowUser) {
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
  const returnTo = queryParams.get("returnTo") || "";
  const returnPath = buildReturnPath(applicationId, from, returnTo, approvalWorkflowUser);
  const backText = from === "completed-approvals"
    ? stepText(language, "backToCompleted")
    : isSafeInternalPath(returnTo) || from === "action-panel"
      ? stepText(language, "backToActionPanel")
      : from === "approval"
        ? stepText(language, "backToAwaitingApproval")
        : stepText(language, "back");
  const previousStep = currentStep - 1;
  const nextStep = currentStep + 1;

  return (
    <div className={`flex flex-wrap justify-end gap-2 ${className}`}>
      <Link
        to={returnPath}
        className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
      >
        {backText}
      </Link>

      {previousStep >= 1 ? (
        <Link
          to={buildStepPath(applicationId, previousStep, queryParams)}
          className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
        >
          {stepText(language, "previous")}
        </Link>
      ) : (
        <DisabledButton>{stepText(language, "previous")}</DisabledButton>
      )}

      {nextStep <= TOTAL_STEPS ? (
        <Link
          to={buildStepPath(applicationId, nextStep, queryParams)}
          className="rounded bg-[#006d32] px-3 py-1.5 text-xs font-semibold !text-white hover:bg-[#005224]"
          style={{ color: "#fff" }}
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
