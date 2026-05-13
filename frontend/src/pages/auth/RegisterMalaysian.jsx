import { useEffect, useRef, useState } from "react";
import TopBar from "../../layout/TopBar";
import { Link, useNavigate } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";
import { apiRequest } from "../../services/api";

const initialForm = {
  fullName: "",
  gender: "",
  dateOfBirth: "",
  nationality: "Malaysian",
  mykadNumber: "",
  mobileNumber: "",
  email: "",
  addressLine1: "",
  addressLine2: "",
  postcode: "",
  city: "",
  state: "",
  password: "",
  confirmPassword: "",
  captchaChecked: false,
};

const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY || "";
const ADDRESS_MAX_LENGTH = 150;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MYKAD_PATTERN = /^\d{12}$/;
const stateCityOptions = {
  Johor: [
    "Johor Bahru",
    "Batu Pahat",
    "Muar",
    "Kluang",
    "Kulai",
    "Skudai",
    "Segamat",
    "Pontian",
    "Pasir Gudang",
    "Kota Tinggi",
  ],
  Kedah: [
    "Alor Setar",
    "Sungai Petani",
    "Kulim",
    "Langkawi",
    "Jitra",
    "Baling",
    "Kuala Nerang",
  ],
  Kelantan: [
    "Kota Bharu",
    "Tanah Merah",
    "Pasir Mas",
    "Tumpat",
    "Machang",
    "Gua Musang",
  ],
  Melaka: ["Melaka City", "Alor Gajah", "Jasin", "Masjid Tanah"],
  "Negeri Sembilan": [
    "Seremban",
    "Port Dickson",
    "Nilai",
    "Senawang",
    "Bahau",
    "Rembau",
  ],
  Pahang: [
    "Kuantan",
    "Temerloh",
    "Bentong",
    "Mentakab",
    "Pekan",
    "Raub",
    "Cameron Highlands",
  ],
  Penang: [
    "George Town",
    "Bayan Lepas",
    "Butterworth",
    "Bukit Mertajam",
    "Perai",
    "Nibong Tebal",
  ],
  Perak: [
    "Ipoh",
    "Taiping",
    "Sitiawan",
    "Teluk Intan",
    "Batu Gajah",
    "Lumut",
    "Kuala Kangsar",
    "Tanjong Malim",
  ],
  Perlis: ["Kangar", "Arau", "Padang Besar"],
  Sabah: [
    "Kota Kinabalu",
    "Sandakan",
    "Tawau",
    "Lahad Datu",
    "Keningau",
    "Penampang",
    "Tuaran",
    "Papar",
    "Kudat",
  ],
  Sarawak: [
    "Kuching",
    "Miri",
    "Sibu",
    "Bintulu",
    "Samarahan",
    "Sri Aman",
    "Sarikei",
    "Kapit",
    "Limbang",
    "Lawas",
  ],
  Selangor: [
    "Shah Alam",
    "Petaling Jaya",
    "Subang Jaya",
    "Klang",
    "Puchong",
    "Cheras",
    "Kajang",
    "Rawang",
    "Ampang",
    "Seri Kembangan",
    "Cyberjaya",
    "Sepang",
  ],
  Terengganu: [
    "Kuala Terengganu",
    "Chukai",
    "Dungun",
    "Kemaman",
    "Besut",
    "Marang",
  ],
  "W.P. Kuala Lumpur": [
    "Kuala Lumpur",
    "Cheras",
    "Setapak",
    "Kepong",
    "Bangsar",
    "Bukit Jalil",
  ],
  "W.P. Labuan": ["Labuan"],
  "W.P. Putrajaya": ["Putrajaya"],
};
const stateOptions = Object.keys(stateCityOptions);

function RequiredLabel({ children }) {
  return (
    <label className="block text-sm font-semibold mb-2">
      {children} <span className="text-red-600">*</span>
    </label>
  );
}

function FieldError({ id, message }) {
  if (!message) return null;

  return (
    <p id={id} className="mt-1.5 text-xs font-semibold text-red-600">
      {message}
    </p>
  );
}

function RegisterMalaysian() {
  const navigate = useNavigate();
  const { language, t } = useLanguage();

  const [form, setForm] = useState(initialForm);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [recaptchaToken, setRecaptchaToken] = useState("");
  const [recaptchaError, setRecaptchaError] = useState("");
  const recaptchaRef = useRef(null);
  const recaptchaWidgetId = useRef(null);
  const recaptchaLanguage = language === "ms" ? "ms" : "en";
  const cityOptions = form.state ? stateCityOptions[form.state] || [] : [];

  useEffect(() => {
    if (!recaptchaSiteKey || !recaptchaRef.current) return undefined;

    let cancelled = false;
    recaptchaWidgetId.current = null;
    setRecaptchaToken("");
    recaptchaRef.current.innerHTML = "";
    const scriptUrl =
      `https://www.google.com/recaptcha/api.js?render=explicit&hl=${recaptchaLanguage}`;

    document
      .querySelectorAll('script[src^="https://www.google.com/recaptcha/api.js"]')
      .forEach((script) => {
        if (script.getAttribute("src") !== scriptUrl) {
          script.remove();
          window.grecaptcha = undefined;
          window.___grecaptcha_cfg = undefined;
        }
      });

    const renderRecaptcha = () => {
      if (
        cancelled ||
        !window.grecaptcha ||
        typeof window.grecaptcha.render !== "function" ||
        recaptchaWidgetId.current !== null
      ) {
        return;
      }

      recaptchaWidgetId.current = window.grecaptcha.render(recaptchaRef.current, {
        sitekey: recaptchaSiteKey,
        callback: (token) => {
          setRecaptchaToken(token);
          setRecaptchaError("");
          setFieldErrors((prev) => {
            if (!prev.captcha) return prev;
            const next = { ...prev };
            delete next.captcha;
            return next;
          });
        },
        "expired-callback": () => setRecaptchaToken(""),
        "error-callback": () => {
          setRecaptchaToken("");
          setRecaptchaError(t("auth.recaptchaLoadFailed"));
        },
      });
    };

    const readyRecaptcha = () => {
      if (window.grecaptcha?.ready) {
        window.grecaptcha.ready(renderRecaptcha);
        return;
      }

      renderRecaptcha();
    };

    const existingScript = document.querySelector(
      `script[src="${scriptUrl}"]`
    );

    if (window.grecaptcha && existingScript) {
      readyRecaptcha();
      return () => {
        cancelled = true;
      };
    }

    if (existingScript) {
      existingScript.addEventListener("load", readyRecaptcha);
      return () => {
        cancelled = true;
        existingScript.removeEventListener("load", readyRecaptcha);
      };
    }

    const script = document.createElement("script");
    script.src = scriptUrl;
    script.async = true;
    script.defer = true;
    script.onload = readyRecaptcha;
    script.onerror = () => {
      setRecaptchaError(t("auth.recaptchaConnectionFailed"));
    };
    document.head.appendChild(script);

    return () => {
      cancelled = true;
    };
  }, [recaptchaLanguage, t]);

  const updateField = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    setError("");
  };

  const validateForm = () => {
    const errors = {};

    if (!form.fullName.trim()) errors.fullName = t("auth.validation.fullName");
    if (!form.gender) errors.gender = t("auth.validation.gender");
    if (!form.dateOfBirth) errors.dateOfBirth = t("auth.validation.dateOfBirth");
    if (!form.nationality.trim()) errors.nationality = t("auth.validation.nationality");
    if (!form.mykadNumber.trim()) {
      errors.mykadNumber = t("auth.validation.mykad");
    } else if (!MYKAD_PATTERN.test(form.mykadNumber.trim())) {
      errors.mykadNumber = t("auth.validation.mykadFormat");
    }
    if (!form.mobileNumber.trim()) errors.mobileNumber = t("auth.validation.mobile");
    if (!form.email.trim()) {
      errors.email = t("auth.validation.email");
    } else if (!EMAIL_PATTERN.test(form.email.trim())) {
      errors.email = t("auth.validation.emailFormat");
    }
    if (!form.addressLine1.trim()) {
      errors.addressLine1 = t("auth.validation.addressLine1");
    } else if (form.addressLine1.length > ADDRESS_MAX_LENGTH) {
      errors.addressLine1 = t("auth.validation.addressLine1Length");
    }
    if (!form.addressLine2.trim()) {
      errors.addressLine2 = t("auth.validation.addressLine2");
    } else if (form.addressLine2.length > ADDRESS_MAX_LENGTH) {
      errors.addressLine2 = t("auth.validation.addressLine2Length");
    }
    if (!form.postcode.trim()) errors.postcode = t("auth.validation.postcode");
    if (!form.city.trim()) errors.city = t("auth.validation.city");
    if (!form.state.trim()) errors.state = t("auth.validation.state");
    if (!form.password) errors.password = t("auth.validation.password");
    if (!form.confirmPassword) {
      errors.confirmPassword = t("auth.validation.confirmPassword");
    } else if (form.password !== form.confirmPassword) {
      errors.confirmPassword = t("auth.validation.passwordMismatch");
    }
    if (recaptchaSiteKey && !recaptchaToken) errors.captcha = t("auth.validation.recaptcha");
    if (!recaptchaSiteKey && !form.captchaChecked) errors.captcha = t("auth.validation.captcha");

    return errors;
  };

  const getInputClass = (field, extra = "") =>
    `${extra} bg-slate-50 border rounded-lg px-3 py-2.5 outline-none focus:ring-2 ${
      fieldErrors[field]
        ? "border-red-400 focus:ring-red-100"
        : "border-slate-200 focus:ring-[#07c25f]"
    }`;

  const handleStateChange = (value) => {
    setForm((prev) => ({
      ...prev,
      state: value,
      city: "",
    }));
    setFieldErrors((prev) => {
      if (!prev.state && !prev.city) return prev;
      const next = { ...prev };
      delete next.state;
      delete next.city;
      return next;
    });
    setError("");
  };

  const getRegistrationServerError = (message) => {
    const normalized = String(message || "").toLowerCase();

    if (normalized.includes("username already exists")) {
      return {
        message: t("auth.validation.summary"),
        fieldErrors: { mykadNumber: t("auth.validation.mykadExists") },
      };
    }

    if (normalized.includes("email already exists")) {
      return {
        message: t("auth.validation.summary"),
        fieldErrors: { email: t("auth.validation.emailExists") },
      };
    }

    if (normalized.includes("recaptcha")) {
      return {
        message: t("auth.validation.recaptchaFailed"),
        fieldErrors: { captcha: t("auth.validation.recaptchaFailed") },
      };
    }

    if (normalized.includes("password") && normalized.includes("match")) {
      return {
        message: t("auth.validation.summary"),
        fieldErrors: { confirmPassword: t("auth.validation.passwordMismatch") },
      };
    }

    return {
      message: message || t("auth.registerFailed"),
      fieldErrors: {},
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setFieldErrors({});

    const validationErrors = validateForm();

    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      setError(t("auth.validation.summary"));
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    try {
      setLoading(true);

      await apiRequest("/auth/register/", {
        method: "POST",
        body: JSON.stringify({
          account_type: "applicant",
          nationality_type: "malaysian",
          role: "applicant",
          full_name: form.fullName.trim(),
          username: form.mykadNumber.trim(),
          mykad_number: form.mykadNumber.trim(),
          mobile_number: form.mobileNumber.trim(),
          email: form.email.trim(),
          address: [
            form.addressLine1.trim(),
            form.addressLine2.trim(),
            form.postcode.trim(),
            form.city.trim(),
            form.state.trim(),
          ].filter(Boolean).join(", "),
          gender: form.gender,
          date_of_birth: form.dateOfBirth,
          nationality: form.nationality.trim(),
          recaptcha_token: recaptchaToken,
          password: form.password,
          password2: form.confirmPassword,
        }),
      });

      navigate("/login/malaysian", {
        replace: true,
        state: { registrationSuccess: true },
      });
    } catch (err) {
      const serverError = getRegistrationServerError(err.message);
      setError(serverError.message);
      setFieldErrors(serverError.fieldErrors);
      if (recaptchaSiteKey && window.grecaptcha && recaptchaWidgetId.current !== null) {
        window.grecaptcha.reset(recaptchaWidgetId.current);
        setRecaptchaToken("");
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f9f9f9] text-slate-900">
      <TopBar />

      <main className="w-full flex-1 pb-10 pt-6">
        <div className="mx-auto mb-6 max-w-[1440px] px-12">
          <Link
            to="/login/malaysian"
            className="mb-5 inline-flex h-12 items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 text-base font-semibold text-[#006d32] shadow-sm transition hover:border-[#006d32] hover:bg-emerald-50 hover:text-[#004f24]"
            aria-label={t("auth.backToLogin")}
            title={t("auth.backToLogin")}
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
            <span>{t("auth.backToLogin")}</span>
          </Link>
          <h1 className="text-3xl font-bold leading-tight">{t("auth.registrationTitle")}</h1>
          <p className="mt-2 max-w-3xl text-base leading-6 text-slate-600">
            {t("auth.registrationMalaysianDescription")}
          </p>
        </div>

        {error && (
          <div className="mx-12 mb-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            {error}
          </div>
        )}

        <form className="mx-auto max-w-[1440px] space-y-5 px-12" onSubmit={handleSubmit} noValidate>
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="h-1 bg-[#07c25f]" />

            <div className="px-6 py-6">
              <div className="flex items-center gap-3 mb-6">
                <span className="material-symbols-outlined text-[#006d32]">
                  person
                </span>
                <h2 className="text-xl font-semibold">
                  {t("auth.personalInformation")}
                </h2>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div className="col-span-2">
                  <RequiredLabel>
                    {t("auth.fullNameMyKad")}
                  </RequiredLabel>
                  <input
                    type="text"
                    required
                    aria-invalid={Boolean(fieldErrors.fullName)}
                    aria-describedby={fieldErrors.fullName ? "fullName-error" : undefined}
                    placeholder={t("auth.fullNamePlaceholder")}
                    value={form.fullName}
                    onChange={(e) => updateField("fullName", e.target.value)}
                    className={getInputClass("fullName", "w-full")}
                  />
                  <FieldError id="fullName-error" message={fieldErrors.fullName} />
                </div>

                <div className="col-span-2">
                  <RequiredLabel>
                    {t("auth.gender")}
                  </RequiredLabel>
                  <select
                    required
                    aria-invalid={Boolean(fieldErrors.gender)}
                    aria-describedby={fieldErrors.gender ? "gender-error" : undefined}
                    value={form.gender}
                    onChange={(e) => updateField("gender", e.target.value)}
                    className={getInputClass("gender", "w-full")}
                  >
                    <option value="">{t("auth.selectGender")}</option>
                    <option value="male">{t("auth.genderMale")}</option>
                    <option value="female">{t("auth.genderFemale")}</option>
                  </select>
                  <FieldError id="gender-error" message={fieldErrors.gender} />
                </div>

                <div className="col-span-2">
                  <RequiredLabel>
                    {t("auth.dateOfBirth")}
                  </RequiredLabel>
                  <input
                    type="date"
                    required
                    aria-invalid={Boolean(fieldErrors.dateOfBirth)}
                    aria-describedby={fieldErrors.dateOfBirth ? "dateOfBirth-error" : undefined}
                    value={form.dateOfBirth}
                    onChange={(e) => updateField("dateOfBirth", e.target.value)}
                    className={getInputClass("dateOfBirth", "w-full")}
                  />
                  <FieldError id="dateOfBirth-error" message={fieldErrors.dateOfBirth} />
                </div>

                <div className="col-span-2">
                  <RequiredLabel>
                    {t("auth.nationality")}
                  </RequiredLabel>
                  <input
                    type="text"
                    required
                    aria-invalid={Boolean(fieldErrors.nationality)}
                    aria-describedby={fieldErrors.nationality ? "nationality-error" : undefined}
                    value={form.nationality}
                    onChange={(e) => updateField("nationality", e.target.value)}
                    className={getInputClass("nationality", "w-full")}
                  />
                  <FieldError id="nationality-error" message={fieldErrors.nationality} />
                </div>

                <div className="col-span-2">
                  <RequiredLabel>
                    {t("auth.mykadNumber")}
                  </RequiredLabel>
                  <input
                    type="text"
                    required
                    aria-invalid={Boolean(fieldErrors.mykadNumber)}
                    aria-describedby={fieldErrors.mykadNumber ? "mykadNumber-error" : undefined}
                    placeholder="e.g. 900101135555"
                    value={form.mykadNumber}
                    onChange={(e) => updateField("mykadNumber", e.target.value)}
                    className={getInputClass("mykadNumber", "w-full")}
                  />
                  <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold">
                    {t("auth.enterWithoutDashes")}
                  </p>
                  <FieldError id="mykadNumber-error" message={fieldErrors.mykadNumber} />
                </div>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="px-6 py-6">
              <div className="flex items-center gap-3 mb-6">
                <span className="material-symbols-outlined text-[#006d32]">
                  contact_mail
                </span>
                <h2 className="text-xl font-semibold">{t("auth.contactDetails")}</h2>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div className="col-span-2">
                  <RequiredLabel>
                    {t("auth.mobileNumber")}
                  </RequiredLabel>
                  <div className="flex">
                    <span className="inline-flex items-center px-3 bg-slate-100 border border-r-0 border-slate-200 text-slate-500 rounded-l-lg text-sm">
                      +60
                    </span>
                    <input
                      type="tel"
                      required
                      aria-invalid={Boolean(fieldErrors.mobileNumber)}
                      aria-describedby={fieldErrors.mobileNumber ? "mobileNumber-error" : undefined}
                      placeholder="123456789"
                      value={form.mobileNumber}
                      onChange={(e) => updateField("mobileNumber", e.target.value)}
                      className={`flex-1 bg-slate-50 border rounded-r-lg px-3 py-2.5 outline-none focus:ring-2 ${
                        fieldErrors.mobileNumber
                          ? "border-red-400 focus:ring-red-100"
                          : "border-slate-200 focus:ring-[#07c25f]"
                      }`}
                    />
                  </div>
                  <FieldError id="mobileNumber-error" message={fieldErrors.mobileNumber} />
                </div>

                <div className="col-span-2">
                  <RequiredLabel>
                    {t("auth.emailAddress")}
                  </RequiredLabel>
                  <input
                    type="email"
                    required
                    aria-invalid={Boolean(fieldErrors.email)}
                    aria-describedby={fieldErrors.email ? "email-error" : undefined}
                    placeholder="example@email.com"
                    value={form.email}
                    onChange={(e) => updateField("email", e.target.value)}
                    className={getInputClass("email", "w-full")}
                  />
                  <FieldError id="email-error" message={fieldErrors.email} />
                </div>

                <div className="col-span-4 border-t border-slate-100 pt-2">
                  <h3 className="text-sm font-bold text-slate-700">{t("auth.address")}</h3>
                </div>

                <div className="col-span-2">
                  <RequiredLabel>
                    {t("auth.addressLine1")}
                  </RequiredLabel>
                  <input
                    type="text"
                    required
                    maxLength={ADDRESS_MAX_LENGTH}
                    aria-invalid={Boolean(fieldErrors.addressLine1)}
                    aria-describedby={fieldErrors.addressLine1 ? "addressLine1-error" : undefined}
                    placeholder={t("auth.addressLine1Placeholder")}
                    value={form.addressLine1}
                    onChange={(e) => updateField("addressLine1", e.target.value)}
                    className={getInputClass("addressLine1", "w-full")}
                  />
                  <div className="mt-1 flex items-start justify-between gap-3">
                    <FieldError id="addressLine1-error" message={fieldErrors.addressLine1} />
                    <span className="ml-auto text-xs text-slate-400">
                      {form.addressLine1.length}/{ADDRESS_MAX_LENGTH}
                    </span>
                  </div>
                </div>

                <div className="col-span-2">
                  <RequiredLabel>
                    {t("auth.addressLine2")}
                  </RequiredLabel>
                  <input
                    type="text"
                    required
                    maxLength={ADDRESS_MAX_LENGTH}
                    aria-invalid={Boolean(fieldErrors.addressLine2)}
                    aria-describedby={fieldErrors.addressLine2 ? "addressLine2-error" : undefined}
                    placeholder={t("auth.addressLine2Placeholder")}
                    value={form.addressLine2}
                    onChange={(e) => updateField("addressLine2", e.target.value)}
                    className={getInputClass("addressLine2", "w-full")}
                  />
                  <div className="mt-1 flex items-start justify-between gap-3">
                    <FieldError id="addressLine2-error" message={fieldErrors.addressLine2} />
                    <span className="ml-auto text-xs text-slate-400">
                      {form.addressLine2.length}/{ADDRESS_MAX_LENGTH}
                    </span>
                  </div>
                </div>

                <div>
                  <RequiredLabel>
                    {t("auth.postcode")}
                  </RequiredLabel>
                  <input
                    type="text"
                    required
                    aria-invalid={Boolean(fieldErrors.postcode)}
                    aria-describedby={fieldErrors.postcode ? "postcode-error" : undefined}
                    placeholder="e.g. 93000"
                    value={form.postcode}
                    onChange={(e) => updateField("postcode", e.target.value)}
                    className={getInputClass("postcode", "w-full")}
                  />
                  <FieldError id="postcode-error" message={fieldErrors.postcode} />
                </div>

                <div>
                  <RequiredLabel>
                    {t("auth.state")}
                  </RequiredLabel>
                  <select
                    required
                    aria-invalid={Boolean(fieldErrors.state)}
                    aria-describedby={fieldErrors.state ? "state-error" : undefined}
                    value={form.state}
                    onChange={(e) => handleStateChange(e.target.value)}
                    className={getInputClass("state", "w-full")}
                  >
                    <option value="">{t("auth.selectState")}</option>
                    {stateOptions.map((state) => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </select>
                  <FieldError id="state-error" message={fieldErrors.state} />
                </div>

                <div>
                  <RequiredLabel>
                    {t("auth.city")}
                  </RequiredLabel>
                  <select
                    required
                    disabled={!form.state}
                    aria-invalid={Boolean(fieldErrors.city)}
                    aria-describedby={fieldErrors.city ? "city-error" : undefined}
                    value={form.city}
                    onChange={(e) => updateField("city", e.target.value)}
                    className={`${getInputClass("city", "w-full")} disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400`}
                  >
                    <option value="">
                      {form.state ? t("auth.selectCity") : t("auth.selectStateFirst")}
                    </option>
                    {cityOptions.map((city) => (
                      <option key={city} value={city}>
                        {city}
                      </option>
                    ))}
                  </select>
                  <FieldError id="city-error" message={fieldErrors.city} />
                </div>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="px-6 py-6">
              <div className="flex items-center gap-3 mb-6">
                <span className="material-symbols-outlined text-[#006d32]">
                  security
                </span>
                <h2 className="text-xl font-semibold">{t("auth.accountSecurity")}</h2>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div>
                  <RequiredLabel>
                    {t("auth.password")}
                  </RequiredLabel>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      aria-invalid={Boolean(fieldErrors.password)}
                      aria-describedby={fieldErrors.password ? "password-error" : undefined}
                      placeholder="••••••••"
                      value={form.password}
                      onChange={(e) => updateField("password", e.target.value)}
                      className={getInputClass("password", "w-full pr-11")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
                    >
                      {showPassword ? "visibility_off" : "visibility"}
                    </button>
                  </div>
                  <FieldError id="password-error" message={fieldErrors.password} />
                </div>

                <div>
                  <RequiredLabel>
                    {t("auth.confirmPassword")}
                  </RequiredLabel>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      required
                      aria-invalid={Boolean(fieldErrors.confirmPassword)}
                      aria-describedby={fieldErrors.confirmPassword ? "confirmPassword-error" : undefined}
                      placeholder="••••••••"
                      value={form.confirmPassword}
                      onChange={(e) => updateField("confirmPassword", e.target.value)}
                      className={getInputClass("confirmPassword", "w-full pr-11")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
                    >
                      {showConfirmPassword ? "visibility_off" : "visibility"}
                    </button>
                  </div>
                  <FieldError id="confirmPassword-error" message={fieldErrors.confirmPassword} />
                </div>

                <div className="col-span-4">
                  <RequiredLabel>
                    {t("auth.captchaVerification")}
                  </RequiredLabel>
                  {recaptchaSiteKey ? (
                    <div
                      className={`inline-block h-[78px] w-[304px] overflow-hidden rounded-md bg-white shadow-sm [&_textarea]:!hidden ${
                        fieldErrors.captcha ? "ring-2 ring-red-100" : ""
                      }`}
                    >
                      <div ref={recaptchaRef} />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        updateField("captchaChecked", !form.captchaChecked);
                        setFieldErrors((prev) => {
                          if (!prev.captcha) return prev;
                          const next = { ...prev };
                          delete next.captcha;
                          return next;
                        });
                      }}
                      className={`flex h-[68px] w-[278px] items-center justify-between rounded-md border bg-white px-4 text-left shadow-sm transition ${
                        form.captchaChecked
                          ? "border-[#006d32] ring-2 ring-[#006d32]/15"
                          : "border-slate-300 hover:border-slate-400"
                      }`}
                      aria-pressed={form.captchaChecked}
                    >
                      <span className="flex items-center gap-3">
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded border-2 ${
                            form.captchaChecked
                              ? "border-[#006d32] bg-[#006d32] text-white"
                              : "border-slate-300 bg-white"
                          }`}
                        >
                          {form.captchaChecked && (
                            <svg
                              aria-hidden="true"
                              className="h-3 w-3"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="m5 12 4 4L19 6" />
                            </svg>
                          )}
                        </span>
                        <span className="text-sm font-semibold text-slate-900">
                          {t("auth.notRobot")}
                        </span>
                      </span>
                      <span className="flex flex-col items-center text-slate-500">
                        <svg
                          aria-hidden="true"
                          className="h-6 w-6 text-blue-500"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21 12a9 9 0 0 1-15.2 6.5" />
                          <path d="M3 12A9 9 0 0 1 18.2 5.5" />
                          <path d="M21 4v6h-6" />
                          <path d="M3 20v-6h6" />
                        </svg>
                        <span className="mt-0.5 text-[9px] font-semibold">
                          {t("auth.verification")}
                        </span>
                        <span className="text-[8px]">{t("auth.privacyTerms")}</span>
                      </span>
                    </button>
                  )}
                  {recaptchaError && (
                    <p className="mt-2 text-sm font-medium text-red-600">{recaptchaError}</p>
                  )}
                  <FieldError id="captcha-error" message={fieldErrors.captcha} />
                  {!recaptchaSiteKey && (
                    <p className="mt-2 text-xs text-slate-500">
                      {t("auth.localCaptchaPreview")}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>

          <div className="flex justify-end gap-3 pt-2">
            <Link
              to="/login/malaysian"
              className="w-[180px] rounded-lg border border-slate-300 bg-white py-4 text-center font-bold text-slate-700 hover:bg-slate-50"
            >
              {t("common.cancel")}
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="w-[240px] py-4 bg-[#07c25f] text-white rounded-lg font-bold hover:bg-[#006d32] disabled:opacity-60"
            >
              {loading ? t("common.submitting") : t("auth.submitRegistration")}
            </button>
          </div>
        </form>
      </main>

      <footer className="bg-white border-t border-slate-200 px-12 py-5">
        <div className="flex items-center justify-between gap-8 text-sm text-slate-500">
          <div>
            <p className="font-bold text-slate-700">DBKU fasTrack</p>
            <p>© 2026 Advertisement License Application. All Rights Reserved.</p>
          </div>

          <div className="flex items-center gap-6">
            <a href="#">{t("auth.faq")}</a>
            <a href="#">{t("auth.contactUs")}</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default RegisterMalaysian;
