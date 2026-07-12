import { useState } from "react";
import TopBar from "../../layout/TopBar";
import { Link, useNavigate } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";
import { apiRequest } from "../../services/api";

const DEFAULT_NATIONALITY = "Malaysia";

const initialForm = {
  fullName: "",
  gender: "",
  dateOfBirth: "",
  nationality: DEFAULT_NATIONALITY,
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
};

const SHOW_REGISTER_PASSWORD_STRENGTH = false;
const ADDRESS_MAX_LENGTH = 150;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MYKAD_PATTERN = /^\d{12}$/;
const PASSWORD_RULES = [
  {
    key: "length",
    labelKey: "auth.passwordRuleLength",
    test: (value) => value.length >= 8,
  },
  {
    key: "case",
    labelKey: "auth.passwordRuleCase",
    test: (value) => /[a-z]/.test(value) && /[A-Z]/.test(value),
  },
  {
    key: "number",
    labelKey: "auth.passwordRuleNumber",
    test: (value) => /\d/.test(value),
  },
  {
    key: "symbol",
    labelKey: "auth.passwordRuleSymbol",
    test: (value) => /[^A-Za-z0-9]/.test(value),
  },
];

function uppercaseNameInput(value) {
  return String(value || "").toUpperCase();
}

function normalizeNameValue(value) {
  return uppercaseNameInput(value).trim().replace(/\s+/g, " ");
}

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
const cityOptions = Array.from(
  new Set(Object.values(stateCityOptions).flat())
).sort((a, b) => a.localeCompare(b));
const REGISTER_FIELD_ERROR_ORDER = [
  "fullName",
  "gender",
  "dateOfBirth",
  "nationality",
  "mykadNumber",
  "mobileNumber",
  "email",
  "addressLine1",
  "addressLine2",
  "postcode",
  "city",
  "state",
  "password",
  "confirmPassword",
];

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

function getPasswordStrength(password) {
  const passedCount = PASSWORD_RULES.filter((rule) => rule.test(password)).length;

  if (!password) {
    return {
      percent: 0,
      labelKey: "auth.passwordStrengthEmpty",
      barClass: "bg-slate-300",
      textClass: "text-slate-500",
    };
  }

  if (passedCount <= 1) {
    return {
      percent: 25,
      labelKey: "auth.passwordStrengthWeak",
      barClass: "bg-red-500",
      textClass: "text-red-700",
    };
  }

  if (passedCount === 2) {
    return {
      percent: 50,
      labelKey: "auth.passwordStrengthFair",
      barClass: "bg-amber-500",
      textClass: "text-amber-700",
    };
  }

  if (passedCount === 3) {
    return {
      percent: 75,
      labelKey: "auth.passwordStrengthStrong",
      barClass: "bg-emerald-500",
      textClass: "text-emerald-700",
    };
  }

  return {
    percent: 100,
    labelKey: "auth.passwordStrengthVeryStrong",
    barClass: "bg-[#00a65a]",
    textClass: "text-slate-900",
  };
}

function PasswordStrengthMeter({ password, t }) {
  const strength = getPasswordStrength(password);

  return (
    <div className="max-w-xl space-y-3 pt-1">
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="font-semibold text-slate-600">
          {t("auth.passwordStrength")}
        </span>
        <span className={`font-semibold ${strength.textClass}`}>
          {t(strength.labelKey)}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full transition-all duration-300 ${strength.barClass}`}
          style={{ width: `${strength.percent}%` }}
        />
      </div>
      <div className="space-y-2">
        {PASSWORD_RULES.map((rule) => {
          const passed = rule.test(password);

          return (
            <div key={rule.key} className="flex items-center gap-3 text-sm text-slate-700">
              <span
                className={`material-symbols-outlined text-[22px] ${
                  passed ? "text-[#00a65a]" : "text-slate-300"
                }`}
                aria-hidden="true"
              >
                {passed ? "check_circle" : "radio_button_unchecked"}
              </span>
              <span>{t(rule.labelKey)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RegisterMalaysian() {
  const navigate = useNavigate();
  const { t } = useLanguage();

  const [form, setForm] = useState(initialForm);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const citySearchTerm = form.city.trim().toLowerCase();
  const citySuggestions =
    citySearchTerm.length >= 2
      ? cityOptions
          .filter((city) => city.toLowerCase().includes(citySearchTerm))
          .slice(0, 8)
      : [];

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
    return errors;
  };

  const getInputClass = (field, extra = "") =>
    `${extra} bg-slate-50 border rounded-lg px-3 py-2.5 outline-none focus:ring-2 ${
      fieldErrors[field]
        ? "border-red-400 focus:ring-red-100"
        : "border-slate-200 focus:ring-[#07c25f]"
    }`;

  const scrollToFirstError = (errors) => {
    const firstField = REGISTER_FIELD_ERROR_ORDER.find((field) => errors[field]);

    if (!firstField) {
      return;
    }

    const scrollToField = (attempt = 0) => {
      const field = document.querySelector(`[aria-describedby="${firstField}-error"]`);
      const errorMessage = document.getElementById(`${firstField}-error`);
      const target = field?.closest("[data-register-field]") || field || errorMessage;

      if (!target) {
        if (attempt < 5) {
          window.setTimeout(() => scrollToField(attempt + 1), 80);
        }
        return;
      }

      target.scrollIntoView({ behavior: "smooth", block: "center" });

      if (typeof field?.focus === "function") {
        field.focus({ preventScroll: true });
      }
    };

    window.requestAnimationFrame(() => scrollToField());
  };

  const scrollToRegistrationSummary = () => {
    window.requestAnimationFrame(() => {
      const summary = document.getElementById("registration-error-summary");

      if (summary) {
        summary.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }

      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  const handleStateChange = (value) => {
    setForm((prev) => ({
      ...prev,
      state: value,
      city: value && stateCityOptions[value]?.includes(prev.city) ? prev.city : "",
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

  const handleCityChange = (value) => {
    const normalizedValue = value.trim().toLowerCase();
    const matches = Object.entries(stateCityOptions)
      .flatMap(([state, cities]) =>
        cities
          .filter((city) => city.toLowerCase() === normalizedValue)
          .map((city) => ({ city, state }))
      );
    const matchedCity = matches[0]?.city;
    const nextState = matches.length === 1 ? matches[0].state : form.state;

    setForm((prev) => ({
      ...prev,
      city: matchedCity || value,
      state: nextState,
    }));
    setShowCitySuggestions(Boolean(value.trim()) && !matchedCity);
    setFieldErrors((prev) => {
      if (!prev.city && !prev.state) return prev;
      const next = { ...prev };
      delete next.city;
      if (nextState) delete next.state;
      return next;
    });
    setError("");
  };

  const selectCitySuggestion = (city) => {
    handleCityChange(city);
    setShowCitySuggestions(false);
  };

  const getRegistrationServerError = (message) => {
    const normalized = String(message || "").toLowerCase();

    if (
      normalized.includes("username already exists") ||
      (normalized.includes("mykad") && normalized.includes("registered"))
    ) {
      return {
        message: t("auth.validation.summary"),
        fieldErrors: { mykadNumber: t("auth.validation.mykadExists") },
      };
    }

    if (normalized.includes("mobile") && normalized.includes("registered")) {
      return {
        message: t("auth.validation.summary"),
        fieldErrors: { mobileNumber: t("auth.validation.mobileExists") },
      };
    }

    if (
      normalized.includes("email already exists") ||
      (normalized.includes("email") && normalized.includes("registered"))
    ) {
      return {
        message: t("auth.validation.summary"),
        fieldErrors: { email: t("auth.validation.emailExists") },
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
      scrollToRegistrationSummary();
      return;
    }

    try {
      setLoading(true);

      const registrationPayload = {
          account_type: "applicant",
          nationality_type: "malaysian",
          role: "applicant",
          full_name: normalizeNameValue(form.fullName),
          username: form.mykadNumber.trim(),
          mykad_number: form.mykadNumber.trim(),
          mobile_number: form.mobileNumber.trim(),
          email: form.email.trim(),
          address_line1: form.addressLine1.trim(),
          address_line2: form.addressLine2.trim(),
          postcode: form.postcode.trim(),
          city: form.city.trim(),
          state: form.state.trim(),
          address: [
            form.addressLine1.trim(),
            form.addressLine2.trim(),
            form.postcode.trim(),
            form.city.trim(),
            form.state.trim(),
          ].filter(Boolean).join(", "),
          gender: form.gender,
          date_of_birth: form.dateOfBirth,
          nationality: DEFAULT_NATIONALITY,
          password: form.password,
          password2: form.confirmPassword,
      };

      await apiRequest("/auth/register/", {
        method: "POST",
        body: JSON.stringify(registrationPayload),
      });

      navigate("/login/malaysian", {
        replace: true,
        state: { registrationSuccess: true },
      });
    } catch (err) {
      const serverError = getRegistrationServerError(err.message);
      setError(serverError.message);
      setFieldErrors(serverError.fieldErrors);
      scrollToFirstError(serverError.fieldErrors);
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
          <div className="mx-auto mb-6 max-w-[1440px] px-12">
            <div
              id="registration-error-summary"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
            >
              {error}
            </div>
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
                <div className="col-span-2" data-register-field="mykadNumber">
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
                    onChange={(e) => updateField("fullName", uppercaseNameInput(e.target.value))}
                    className={getInputClass("fullName", "w-full")}
                  />
                  <FieldError id="fullName-error" message={fieldErrors.fullName} />
                </div>

                <div className="col-span-2" data-register-field="mobileNumber">
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

                <div className="col-span-2" data-register-field="email">
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
                    readOnly
                    aria-readonly="true"
                    aria-invalid={Boolean(fieldErrors.nationality)}
                    aria-describedby={fieldErrors.nationality ? "nationality-error" : undefined}
                    value={form.nationality}
                    className={`${getInputClass("nationality", "w-full")} cursor-not-allowed text-slate-700`}
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

          <section className="overflow-visible rounded-lg border border-slate-200 bg-white shadow-sm">
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
                    {t("auth.city")}
                  </RequiredLabel>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      autoComplete="off"
                      aria-invalid={Boolean(fieldErrors.city)}
                      aria-describedby={fieldErrors.city ? "city-error" : undefined}
                      value={form.city}
                      onChange={(e) => handleCityChange(e.target.value)}
                      onFocus={() => setShowCitySuggestions(Boolean(form.city.trim()))}
                      onBlur={() => setShowCitySuggestions(false)}
                      className={getInputClass("city", "w-full")}
                    />
                    {showCitySuggestions && citySuggestions.length > 0 && (
                      <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                        {citySuggestions.map((city) => (
                          <button
                            key={city}
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => selectCitySuggestion(city)}
                            className="block w-full px-3 py-2 text-left text-sm text-slate-900 hover:bg-slate-50"
                          >
                            {city}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <FieldError id="city-error" message={fieldErrors.city} />
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
                <div className="col-span-2">
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

                <div className="col-span-2">
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

                {SHOW_REGISTER_PASSWORD_STRENGTH && (
                  <div className="col-span-4">
                    <PasswordStrengthMeter password={form.password} t={t} />
                  </div>
                )}

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
            <p className="font-bold text-slate-700">ALiS</p>
            <p>{t("common.copyright")}</p>
          </div>

          <div className="flex items-center gap-6">
            <Link to="/faq?from=login" className="font-medium hover:text-[#006d32]">
              {t("auth.faq")}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default RegisterMalaysian;
