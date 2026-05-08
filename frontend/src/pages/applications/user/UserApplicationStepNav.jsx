import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useLanguage } from "../../../context/LanguageContext";

function getSteps(applicationId, t) {
  const editing = Boolean(applicationId);
  const base = editing ? `/applications/${applicationId}` : "/applications";

  return [
    {
      no: 1,
      label: t("steps.sittingApplication"),
      path: editing ? `${base}/edit` : "/applications/new",
      disabled: false,
    },
    {
      no: 2,
      label: t("steps.submittingPerson"),
      path: `${base}/submitting-person`,
      disabled: !editing,
    },
    {
      no: 3,
      label: t("steps.supportingDocument"),
      path: `${base}/supporting-document`,
      disabled: !editing,
    },
    {
      no: 4,
      label: t("steps.declaration"),
      path: `${base}/declaration`,
      disabled: !editing,
    },
    {
      no: 5,
      label: t("steps.printForm"),
      path: `${base}/print-form`,
      disabled: !editing,
    },
  ];
}

function UserApplicationStepNav({ active }) {
  const [open, setOpen] = useState(true);
  const location = useLocation();
  const { t } = useLanguage();

  const { applicationId: routeApplicationId } = useParams();
  const queryParams = new URLSearchParams(location.search);
  const queryApplicationId = queryParams.get("id");
  const applicationId = routeApplicationId || queryApplicationId || "";
  const query = applicationId ? `?id=${applicationId}` : "";
  const steps = useMemo(() => getSteps(applicationId, t), [applicationId, t]);

  useEffect(() => {
    if (applicationId) {
      localStorage.setItem("current_application_id", applicationId);
      return;
    }

    if (location.pathname === "/applications/new") {
      localStorage.removeItem("current_application_id");
    }
  }, [applicationId, location.pathname]);

  function renderStep(step, mobile = false) {
    const isActive = active === step.no;
    const baseClass = mobile
      ? "flex items-center gap-2 px-3 py-2.5 border-b text-xs"
      : "flex items-start gap-2 px-3 py-2.5 border-b text-xs transition";
    const stateClass = isActive
      ? "bg-[#006d32] text-white font-semibold"
      : step.disabled
        ? "text-slate-500 hover:bg-amber-50 hover:text-amber-700"
        : "text-slate-600 hover:bg-slate-50";
    const content = (
      <>
        <span
          className={
            mobile
              ? ""
              : `w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                  isActive
                    ? "bg-white text-[#006d32]"
                    : "bg-slate-100 text-slate-500"
                }`
          }
        >
          {mobile ? `${step.no}.` : step.no}
        </span>
        <span className="leading-snug">{step.label}</span>
        {step.disabled && (
          <span className="material-symbols-outlined ml-auto text-[16px]">
            lock
          </span>
        )}
      </>
    );

    if (step.disabled) {
      return (
        <button
          type="button"
          key={step.no}
          onClick={() => window.alert(t("steps.saveFirstStepHint"))}
          className={`w-full text-left ${baseClass} ${stateClass}`}
          title={t("steps.saveFirstStepHint")}
        >
          {content}
        </button>
      );
    }

    return (
      <Link key={step.no} to={`${step.path}${query}`} className={`${baseClass} ${stateClass}`}>
        {content}
      </Link>
    );
  }

  return (
    <>
      <aside
        className={`hidden md:block sticky top-20 h-[calc(100vh-96px)] shrink-0 transition-all duration-300 ${
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

            {open && <span>{t("steps.applicationSteps")}</span>}

            {open && (
              <span className="material-symbols-outlined text-[18px]">
                chevron_left
              </span>
            )}
          </button>

          {open && (
            <>
              <div className="bg-[#f7f7f7] border-b px-3 py-2.5">
                <p className="text-xs font-bold text-slate-800">
                  {t("steps.applicationSteps").toUpperCase()}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {t("steps.stepOf", `Step ${active} of ${steps.length}`)
                    .replace("{active}", active)
                    .replace("{total}", steps.length)}
                </p>
                {applicationId && (
                  <p className="text-[10px] text-[#006d32] font-semibold mt-1 truncate">
                    {t("steps.editing")}: {applicationId}
                  </p>
                )}
                {!applicationId && active === 1 && (
                  <p className="text-[10px] text-amber-600 font-semibold mt-1">
                    {t("steps.saveFirstStepHint")}
                  </p>
                )}
              </div>

              <div className="overflow-y-auto h-[calc(100%-100px)]">
                {steps.map((step) => renderStep(step))}
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
          <span>{t("steps.applicationSteps")}</span>
          <span className="material-symbols-outlined text-[20px]">
            {open ? "expand_less" : "expand_more"}
          </span>
        </button>

        {open && (
          <div className="mt-2 bg-white border border-slate-200 rounded-md overflow-hidden">
            {steps.map((step) => renderStep(step, true))}
          </div>
        )}
      </div>
    </>
  );
}

export default UserApplicationStepNav;
