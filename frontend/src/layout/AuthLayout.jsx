import TopBar from "./TopBar";
import { useLanguage } from "../context/LanguageContext";
import logo from "../assets/fasTrack.png";
import { Link } from "react-router-dom";

function AuthLayout({ children }) {
  const { t } = useLanguage();
  const features = [
    t("app.authFeatureSubmit"),
    t("app.authFeatureTrack"),
  ];

  return (
    <div className="min-h-screen min-w-[1280px] bg-slate-50 text-slate-950">
      <TopBar />
      <main className="grid min-h-[calc(100vh-73px-81px)] grid-cols-[58%_42%]">
        <section
          className="min-h-full bg-cover bg-center"
          style={{ backgroundImage: "url('/DUN.jpg')" }}
        >
          <div className="flex h-full items-end px-16 pb-12">
            <div className="max-w-[790px] rounded-md bg-[#053b2e]/90 p-8 text-white shadow-2xl shadow-black/30">
              <div className="mb-7 flex items-center gap-5">
                <img src={logo} alt="fasTrack Logo" className="h-[52px] w-auto" />
                <div>
                  <p className="text-base font-semibold tracking-wide text-white">
                    DBKU fasTrack
                  </p>
                  <h1 className="mt-2 max-w-[620px] text-[30px] font-semibold leading-tight text-white">
                    {t("app.digitalAdvertisementLicenseSystem")}
                  </h1>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {features.map((item) => (
                  <div key={item} className="flex items-center gap-5 text-white">
                    <svg
                      aria-hidden="true"
                      className="h-7 w-7 shrink-0 text-white"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="m8 12.5 2.7 2.7L16.5 9" />
                    </svg>
                    <p className="max-w-[650px] text-[15px] leading-6">
                      {item}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="flex h-full items-center justify-center bg-slate-50 px-12">
          {children}
        </section>
      </main>
      <footer className="bg-white border-t border-slate-200 px-12 py-5">
        <div className="flex items-center justify-between gap-8 text-sm text-slate-500">
          <div>
            <p className="font-bold text-slate-700">DBKU fasTrack</p>
            <p>© 2026 Advertisement License Application. All Rights Reserved.</p>
          </div>

          <div className="flex items-center gap-6">
            <Link to="/faq?from=login" className="font-medium hover:text-[#006d32]">
              {t("auth.faq")}
            </Link>
            <a href="mailto:support@example.com" className="font-medium hover:text-[#006d32]">
              {t("auth.contactUs")}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default AuthLayout;
