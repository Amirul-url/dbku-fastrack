import { Link, useLocation } from "react-router-dom";
import { stepText } from "./ApplicationStepText";

const STEP_ROUTES = {
  1: "edit",
  2: "submitting-person",
  3: "supporting-document",
  4: "declaration",
  5: "print-form",
};

const TOTAL_STEPS = 5;

function buildStepPath(applicationId, step, returnTab = "") {
  const params = new URLSearchParams({ id: String(applicationId) });
  if (returnTab) {
    params.set("returnTab", returnTab);
  }
  return `/applications/${applicationId}/${STEP_ROUTES[step]}?${params.toString()}`;
}

function DisabledButton({ children }) {
  return (
    <span className="rounded border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-400">
      {children}
    </span>
  );
}

function UserViewStepControls({ applicationId, currentStep, language, className = "" }) {
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const returnTab = queryParams.get("returnTab") || "";
  const backToListConfig = {
    applications: {
      label: "backToApplications",
      path: "/user/dashboard?tab=applications",
    },
    status: {
      label: "backToApplicationStatus",
      path: "/user/dashboard?tab=status",
    },
  };
  const backToList = backToListConfig[returnTab] || {
    label: "backToDashboard",
    path: "/user/dashboard",
  };
  const previousStep = currentStep - 1;
  const nextStep = currentStep + 1;

  return (
    <div className={`flex flex-wrap justify-end gap-2 ${className}`}>
      <Link
        to={backToList.path}
        className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
      >
        {stepText(language, backToList.label)}
      </Link>

      {previousStep >= 1 ? (
        <Link
          to={buildStepPath(applicationId, previousStep, returnTab)}
          className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
        >
          {stepText(language, "back")}
        </Link>
      ) : (
        <DisabledButton>{stepText(language, "back")}</DisabledButton>
      )}

      {nextStep <= TOTAL_STEPS ? (
        <Link
          to={buildStepPath(applicationId, nextStep, returnTab)}
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

export default UserViewStepControls;
