import { useLanguage } from "../context/LanguageContext";

function LanguageSwitcher() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div
      className="inline-flex h-12 items-center gap-2 rounded-md border border-slate-200 bg-white px-3"
      aria-label={t("common.language")}
      title={t("common.language")}
    >
      <svg
        aria-hidden="true"
        className="h-7 w-7 text-slate-500"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
      <button
        type="button"
        onClick={() => setLanguage("ms")}
        className={`rounded-md px-3 py-1.5 text-sm font-bold ${
          language === "ms"
            ? "bg-[#006d32] text-white"
            : "text-slate-500 hover:bg-slate-100"
        }`}
      >
        {t("common.malay")}
      </button>

      <button
        type="button"
        onClick={() => setLanguage("en")}
        className={`rounded-md px-3 py-1.5 text-sm font-bold ${
          language === "en"
            ? "bg-[#006d32] text-white"
            : "text-slate-500 hover:bg-slate-100"
        }`}
      >
        {t("common.english")}
      </button>
    </div>
  );
}

export default LanguageSwitcher;
