import TopBar from "./TopBar";
import { useLanguage } from "../context/LanguageContext";
import logo from "../assets/fasTrack.png";

function AuthLayout({ children }) {
  const { t } = useLanguage();
  const features = [
    t("app.authFeatureSubmit"),
    t("app.authFeatureTrack"),
    t("app.authFeatureComplete"),
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <TopBar />
      <main className="mx-auto grid min-h-[calc(100vh-56px)] w-full max-w-6xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[1fr_420px] lg:items-center lg:px-6">
        <section className="hidden lg:block">
          <div className="max-w-xl">
            <div className="mb-8 flex items-center gap-4">
              <img src={logo} alt="fasTrack Logo" className="h-12 w-auto" />
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
                  DBKU fasTrack
                </p>
                <h1 className="mt-1 text-2xl font-semibold text-slate-950">
                  {t("app.digitalAdvertisementLicenseSystem")}
                </h1>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {features.map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
                  <span className="material-symbols-outlined text-[20px] text-emerald-700">
                    task_alt
                  </span>
                  <p className="text-sm text-slate-700">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <img src={logo} alt="fasTrack Logo" className="h-10 w-auto" />
            <div>
              <p className="font-semibold text-slate-950">DBKU fasTrack</p>
              <p className="text-xs text-slate-500">{t("app.digitalAdvertisementLicense")}</p>
            </div>
          </div>
          {children}
        </section>
      </main>
    </div>
  );
}

export default AuthLayout;
