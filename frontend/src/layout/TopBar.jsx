import logo from "../assets/fasTrack.png";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { useLanguage } from "../context/LanguageContext";

function TopBar() {
  const { t } = useLanguage();

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-5 lg:px-6">
        <div className="flex items-center gap-3">
          <img src={logo} alt="fasTrack Logo" className="h-8 w-auto object-contain" />
          <div>
            <p className="text-sm font-semibold text-slate-950">DBKU fasTrack</p>
            <p className="text-xs text-slate-500">{t("app.digitalLicensePortal")}</p>
          </div>
        </div>
        <LanguageSwitcher />
      </div>
    </header>
  );
}

export default TopBar;
