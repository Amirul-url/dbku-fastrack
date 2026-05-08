import { useLanguage } from "../context/LanguageContext";

function LanguageSwitcher() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div
      className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white p-1"
      aria-label={t("common.language")}
      title={t("common.language")}
    >
      <span className="material-symbols-outlined px-1 text-[19px] text-slate-500">
        language
      </span>

      <button
        type="button"
        onClick={() => setLanguage("ms")}
        className={`rounded px-2 py-1 text-[11px] font-bold ${
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
        className={`rounded px-2 py-1 text-[11px] font-bold ${
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
