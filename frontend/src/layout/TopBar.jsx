import logo from "../assets/fasTrack.png";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { useLanguage } from "../context/LanguageContext";

function TopBar() {
  const { t } = useLanguage();

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-[72px] min-w-[1280px] items-center justify-between px-12">
        <div className="flex items-center gap-3">
          <img src={logo} alt="fasTrack Logo" className="h-10 w-auto object-contain" />
          <div>
            <p className="text-lg font-semibold text-slate-950">DBKU fasTrack</p>
            <p className="mt-0.5 text-sm text-slate-500">{t("app.digitalLicensePortal")}</p>
          </div>
        </div>
        <LanguageSwitcher />
      </div>
    </header>
  );
}

export default TopBar;
