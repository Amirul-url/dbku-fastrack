import { Link, useLocation } from "react-router-dom";
import TopBar from "../../layout/TopBar";
import { useLanguage } from "../../context/LanguageContext";
import { getStoredUser, getUserRedirectPath, hasActiveAccessToken } from "../../services/api";

const faqItems = [
  {
    questionKey: "faq.createApplication.question",
    answerKey: "faq.createApplication.answer",
  },
  {
    questionKey: "faq.rejected.question",
    answerKey: "faq.rejected.answer",
  },
  {
    questionKey: "faq.payment.question",
    answerKey: "faq.payment.answer",
  },
  {
    questionKey: "faq.renewLicense.question",
    answerKey: "faq.renewLicense.answer",
  },
  {
    questionKey: "faq.contactHelp.question",
    answerKey: "faq.contactHelp.answer",
  },
];

function FaqPage() {
  const { t } = useLanguage();
  const location = useLocation();
  const source = new URLSearchParams(location.search).get("from");
  const hasSession = hasActiveAccessToken();
  const storedUser = getStoredUser();
  const userDashboardPath = getUserRedirectPath(storedUser);
  const backPath = hasSession || source === "dashboard"
    ? userDashboardPath === "/login/malaysian"
      ? "/user/dashboard"
      : userDashboardPath
    : "/login/malaysian";
  const isLoggedIn = backPath !== "/login/malaysian";
  const backLabel = isLoggedIn ? t("profile.backToDashboard") : t("auth.backToLogin");

  return (
    <div className="flex min-h-screen min-w-[1280px] flex-col bg-slate-50 text-slate-950">
      <TopBar />

      <main className="flex-1 px-12 py-10">
        <div className="mx-auto max-w-[1180px]">
          <Link
            to={backPath}
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-[#006d32] shadow-sm transition hover:border-[#006d32] hover:bg-emerald-50 hover:text-[#004f24]"
          >
            <svg
              aria-hidden="true"
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
            {backLabel}
          </Link>

          <section className="mt-7 rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-8 py-7">
              <p className="text-sm font-bold uppercase tracking-wide text-[#006d32]">
                ALiS
              </p>
              <h1 className="mt-2 text-3xl font-bold leading-tight">
                {t("faq.title")}
              </h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
                {t("faq.description")}
              </p>
            </div>

            <div className="divide-y divide-slate-200">
              {faqItems.map((item, index) => (
                <article
                  key={item.questionKey}
                  className="grid grid-cols-[76px_1fr] gap-2 px-8 py-7"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-sm font-bold text-[#006d32]">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">
                      {t(item.questionKey)}
                    </h2>
                    <p className="mt-3 max-w-4xl text-base leading-7 text-slate-600">
                      {t(item.answerKey)}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white px-12 py-5">
        <div className="flex items-center justify-between gap-8 text-sm text-slate-500">
          <div>
            <p className="font-bold text-slate-700">ALiS</p>
            <p>{t("common.copyright")}</p>
          </div>

          <div className="flex items-center gap-6">
            <Link to={isLoggedIn ? "/faq?from=dashboard" : "/faq?from=login"} className="font-medium hover:text-[#006d32]">
              {t("auth.faq")}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default FaqPage;
