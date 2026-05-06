import { useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

function getSteps(applicationId) {
  const base = applicationId ? `/applications/${applicationId}` : "/applications";

  return [
    {
      no: 1,
      label: "Sitting Application",
      path: applicationId ? `${base}/edit` : "/applications/new",
    },
    {
      no: 2,
      label: "Details of Client Department",
      path: `${base}/client-department`,
    },
    {
      no: 3,
      label: "Details of Submitting Person",
      path: `${base}/submitting-person`,
    },
    {
      no: 4,
      label: "Details of Land(s)",
      path: `${base}/land-details`,
    },
    {
      no: 5,
      label: "Detailed Building Plan",
      path: `${base}/building-plan`,
    },
    {
      no: 6,
      label: "Analysis of Proposal",
      path: `${base}/proposal-analysis`,
    },
    {
      no: 7,
      label: "Site Inspection",
      path: `${base}/site-inspection`,
    },
    {
      no: 8,
      label: "Building Plan Checklist",
      path: `${base}/building-plan-checklist`,
    },
    {
      no: 9,
      label: "Print Form",
      path: `${base}/print-form`,
    },
    {
      no: 10,
      label: "Supporting Document",
      path: `${base}/supporting-document`,
    },
    {
      no: 11,
      label: "Declaration",
      path: `${base}/declaration`,
    },
  ];
}

function ApplicationStepNav({ active }) {
  const [open, setOpen] = useState(true);
  const location = useLocation();
  const query = location.search || "";

  const { applicationId: routeApplicationId } = useParams();
  const queryParams = new URLSearchParams(location.search);

  const applicationId =
    routeApplicationId || queryParams.get("id");
  const steps = getSteps(applicationId);

  return (
    <>
      <aside
        className={`hidden md:block sticky top-24 h-[calc(100vh-120px)] shrink-0 transition-all duration-300 ${
          open ? "w-[260px]" : "w-[52px]"
        }`}
      >
        <div className="h-full bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className="w-full flex items-center justify-between gap-2 bg-[#006d32] text-white px-3 py-3 text-xs font-semibold hover:bg-[#005224]"
          >
            <span className="material-symbols-outlined text-[18px]">
              {open ? "menu_open" : "menu"}
            </span>

            {open && <span>Application Steps</span>}

            {open && (
              <span className="material-symbols-outlined text-[18px]">
                chevron_left
              </span>
            )}
          </button>

          {open && (
            <>
              <div className="bg-[#f7f7f7] border-b px-3 py-3">
                <p className="text-xs font-bold text-slate-800">
                  APPLICATION STEPS
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Step {active} of 11
                </p>
                {applicationId && (
                  <p className="text-[10px] text-[#006d32] font-semibold mt-1 truncate">
                    Editing: {applicationId}
                  </p>
                )}
              </div>

              <div className="overflow-y-auto h-[calc(100%-112px)]">
                {steps.map((step) => {
                  const isActive = active === step.no;

                  return (
                    <Link
                      key={step.no}
                      to={`${step.path}${query}`}
                      className={`flex items-start gap-2 px-3 py-3 border-b text-xs transition ${
                        isActive
                          ? "bg-[#006d32] text-white font-semibold"
                          : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                          isActive
                            ? "bg-white text-[#006d32]"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {step.no}
                      </span>

                      <span className="leading-snug">{step.label}</span>
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </aside>

      <div className="md:hidden mb-4">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="w-full flex items-center justify-between bg-[#006d32] text-white px-4 py-3 rounded text-sm font-semibold"
        >
          <span>Application Steps</span>
          <span className="material-symbols-outlined text-[20px]">
            {open ? "expand_less" : "expand_more"}
          </span>
        </button>

        {open && (
          <div className="mt-2 bg-white border border-slate-200 rounded-md overflow-hidden">
            {steps.map((step) => {
              const isActive = active === step.no;

              return (
                <Link
                  key={step.no}
                  to={`${step.path}${query}`}
                  className={`flex items-center gap-2 px-3 py-3 border-b text-xs ${
                    isActive
                      ? "bg-[#006d32] text-white font-semibold"
                      : "text-slate-600"
                  }`}
                >
                  <span>{step.no}.</span>
                  <span>{step.label}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

export default ApplicationStepNav;