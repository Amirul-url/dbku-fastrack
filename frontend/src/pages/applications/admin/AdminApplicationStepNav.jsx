import { useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

function getSteps(applicationId) {
  const base = `/admin/applications/${applicationId}`;

  return [
    {
      no: 1,
      label: "Sitting Application",
      path: `${base}/step-1`,
    },
    {
      no: 2,
      label: "Details of Submitting Person",
      path: `${base}/step-2`,
    },
    {
      no: 3,
      label: "Supporting Document",
      path: `${base}/step-3`,
    },
    {
      no: 4,
      label: "Declaration",
      path: `${base}/step-4`,
    },
    {
      no: 5,
      label: "Print Form",
      path: `${base}/step-5`,
    },
  ];
}

function AdminApplicationStepNav({ active = 1 }) {
  const [open, setOpen] = useState(true);

  const location = useLocation();
  const { id, applicationId } = useParams();

  const currentApplicationId = applicationId || id;
  const steps = getSteps(currentApplicationId);

  return (
    <aside
      className={`sticky top-20 h-[calc(100vh-96px)] shrink-0 transition-all duration-300 ${
        open ? "w-[230px]" : "w-[48px]"
      }`}
    >
      <div className="h-full bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="w-full flex items-center justify-between gap-2 bg-[#006d32] text-white px-3 py-2.5 text-xs font-semibold hover:bg-[#005224]"
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
            <div className="border-b bg-[#f7f7f7] px-3 py-2.5">
              <p className="text-xs font-bold text-slate-800">
                APPLICATION STEPS
              </p>

              <p className="mt-0.5 text-[10px] text-slate-500">
                Step {active} of {steps.length}
              </p>

              {currentApplicationId && (
                <p className="mt-1 truncate text-[10px] font-semibold text-[#006d32]">
                  Reviewing: {currentApplicationId}
                </p>
              )}
            </div>

            <div className="overflow-y-auto max-h-[calc(100vh-200px)]">
              {steps.map((step) => {
                const isActive =
                  active === step.no || location.pathname === step.path;

                return (
                  <Link
                    key={step.no}
                    to={step.path}
                    className={`flex items-start gap-2 border-b px-3 py-2.5 text-xs transition ${
                      isActive
                        ? "bg-[#006d32] font-semibold text-white"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${
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
  );
}

export default AdminApplicationStepNav;
