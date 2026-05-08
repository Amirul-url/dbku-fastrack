import { useState } from "react";
import TopBar from "../../layout/TopBar";
import { Link, useNavigate } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";
import { apiRequest } from "../../services/api";

const initialForm = {
  fullName: "",
  passportNumber: "",
  countryOfOrigin: "",
  passportExpiryDate: "",
  mobileNumber: "",
  email: "",
  address: "",
  password: "",
  confirmPassword: "",
  secureWord: "",
  agreed: false,
};

function RegisterNonMalaysian() {
  const navigate = useNavigate();
  const { t } = useLanguage();

  const [form, setForm] = useState(initialForm);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const updateField = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const validateForm = () => {
    if (!form.fullName.trim()) return "Please enter your full name.";
    if (!form.passportNumber.trim()) return "Please enter your passport number.";
    if (!form.countryOfOrigin.trim()) return "Please select your country of origin.";
    if (!form.passportExpiryDate) return "Please select your passport expiry date.";
    if (!form.mobileNumber.trim()) return "Please enter your mobile number.";
    if (!form.email.trim()) return "Please enter your email address.";
    if (!form.address.trim()) return "Please enter your residential address.";
    if (!form.password) return "Please enter your password.";
    if (!form.confirmPassword) return "Please retype your password.";
    if (form.password !== form.confirmPassword) return "Password and Retype Password do not match.";
    if (!form.secureWord.trim()) return "Please enter your secure word.";
    if (!form.agreed) return "Please agree to the Terms and Conditions and Privacy Policy.";

    return "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    try {
      setLoading(true);

      await apiRequest("/auth/register/", {
        method: "POST",
        body: JSON.stringify({
          account_type: "applicant",
          nationality_type: "non_malaysian",
          role: "applicant",
          full_name: form.fullName.trim(),
          username: form.email.trim(),
          passport_number: form.passportNumber.trim(),
          country_of_origin: form.countryOfOrigin,
          passport_expiry_date: form.passportExpiryDate,
          mobile_number: form.mobileNumber.trim(),
          email: form.email.trim(),
          address: form.address.trim(),
          password: form.password,
          password2: form.confirmPassword,
          secure_word: form.secureWord.trim(),
        }),
      });

      alert("Registration successful. Please login to continue.");
      navigate("/login/non-malaysian", { replace: true });
    } catch (err) {
      setError(err.message || "Registration failed. Please check your information.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setForm(initialForm);
    setError("");
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f9f9f9] text-slate-900">
      <TopBar />

      <main className="max-w-4xl mx-auto px-6 py-12 flex-1 w-full">
        <div className="mb-10">
          <h1 className="text-4xl font-bold mb-2">{t("auth.registrationTitle")}</h1>
          <p className="text-slate-600 max-w-2xl">
            {t("auth.registrationNonMalaysianDescription")}
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form className="space-y-8" onSubmit={handleSubmit}>
          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="h-1 bg-[#07c25f]" />

            <div className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <span className="material-symbols-outlined text-[#006d32]">
                  person
                </span>
                <h2 className="text-2xl font-semibold">
                  {t("auth.personalInformation")}
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold mb-2">
                    {t("auth.fullNamePassport")}
                  </label>
                  <input
                    type="text"
                    placeholder={t("auth.fullNamePlaceholder")}
                    value={form.fullName}
                    onChange={(e) => updateField("fullName", e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-[#07c25f]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">
                    {t("auth.nationality")}
                  </label>
                  <div className="flex bg-slate-100 p-1 rounded-lg">
                    <Link
                      to="/register/malaysian"
                      className="flex-1 py-2 text-sm font-semibold text-slate-500 text-center"
                    >
                      {t("auth.malaysian")}
                    </Link>

                    <button
                      type="button"
                      className="flex-1 py-2 text-sm font-semibold rounded bg-white shadow-sm text-[#006d32]"
                    >
                      {t("auth.nonMalaysian")}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">
                    {t("auth.passportNumber")}
                  </label>
                  <input
                    type="text"
                    placeholder={t("auth.passportPlaceholder")}
                    value={form.passportNumber}
                    onChange={(e) => updateField("passportNumber", e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-[#07c25f]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">
                    {t("auth.countryOfOrigin")}
                  </label>
                  <select
                    value={form.countryOfOrigin}
                    onChange={(e) => updateField("countryOfOrigin", e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-[#07c25f]"
                  >
                    <option value="">{t("auth.selectCountry")}</option>
                    <option value="Indonesia">Indonesia</option>
                    <option value="Singapore">Singapore</option>
                    <option value="Brunei">Brunei</option>
                    <option value="Thailand">Thailand</option>
                    <option value="Philippines">Philippines</option>
                    <option value="China">China</option>
                    <option value="India">India</option>
                    <option value="United Kingdom">United Kingdom</option>
                    <option value="United States">United States</option>
                    <option value="Australia">Australia</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">
                    {t("auth.passportExpiryDate")}
                  </label>
                  <input
                    type="date"
                    value={form.passportExpiryDate}
                    onChange={(e) => updateField("passportExpiryDate", e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-[#07c25f]"
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <span className="material-symbols-outlined text-[#006d32]">
                  contact_mail
                </span>
                <h2 className="text-2xl font-semibold">{t("auth.contactDetails")}</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold mb-2">
                    {t("auth.mobileNumber")}
                  </label>
                  <div className="flex">
                    <span className="inline-flex items-center px-4 bg-slate-100 border border-r-0 border-slate-200 text-slate-500 rounded-l-lg text-sm">
                      +60
                    </span>
                    <input
                      type="tel"
                      placeholder="123456789"
                      value={form.mobileNumber}
                      onChange={(e) => updateField("mobileNumber", e.target.value)}
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-r-lg px-4 py-3 outline-none focus:ring-2 focus:ring-[#07c25f]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">
                    {t("auth.emailAddress")}
                  </label>
                  <input
                    type="email"
                    placeholder="example@email.com"
                    value={form.email}
                    onChange={(e) => updateField("email", e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-[#07c25f]"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold mb-2">
                    {t("auth.residentialAddress")}
                  </label>
                  <textarea
                    rows="4"
                    placeholder={t("auth.addressPlaceholder")}
                    value={form.address}
                    onChange={(e) => updateField("address", e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-[#07c25f]"
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <span className="material-symbols-outlined text-[#006d32]">
                  security
                </span>
                <h2 className="text-2xl font-semibold">{t("auth.accountSecurity")}</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold mb-2">
                    {t("auth.password")}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={form.password}
                      onChange={(e) => updateField("password", e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 pr-11 outline-none focus:ring-2 focus:ring-[#07c25f]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
                    >
                      {showPassword ? "visibility_off" : "visibility"}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">
                    {t("auth.retypePassword")}
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={form.confirmPassword}
                      onChange={(e) => updateField("confirmPassword", e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 pr-11 outline-none focus:ring-2 focus:ring-[#07c25f]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
                    >
                      {showConfirmPassword ? "visibility_off" : "visibility"}
                    </button>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <div className="bg-yellow-50 border border-yellow-300 p-4 rounded-lg mb-4">
                    <div className="flex gap-3">
                      <span className="material-symbols-outlined text-yellow-700">
                        info
                      </span>
                      <p className="text-sm text-yellow-700">
                        {t("auth.secureWordHint")}
                      </p>
                    </div>
                  </div>

                  <label className="block text-sm font-semibold mb-2">
                    {t("auth.secureWord")}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. BlueSky2024"
                    value={form.secureWord}
                    onChange={(e) => updateField("secureWord", e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-[#07c25f]"
                  />
                </div>
              </div>
            </div>
          </section>

          <label className="flex items-start gap-3 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={form.agreed}
              onChange={(e) => updateField("agreed", e.target.checked)}
              className="mt-1"
            />
            <span>
              {t("auth.agreePrefix")}{" "}
              <a href="#" className="text-[#006d32] font-semibold underline">
                {t("auth.terms")}
              </a>{" "}
              {t("common.and")}{" "}
              <a href="#" className="text-[#006d32] font-semibold underline">
                {t("auth.privacy")}
              </a>{" "}
              {t("auth.agreeSuffix")}
            </span>
          </label>

          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-4 bg-[#07c25f] text-white rounded-lg font-bold hover:bg-[#006d32] disabled:opacity-60"
            >
              {loading ? t("common.submitting") : t("auth.submitRegistration")}
            </button>

            <button
              type="button"
              onClick={handleReset}
              disabled={loading}
              className="flex-1 py-4 bg-white border border-slate-200 text-slate-700 rounded-lg font-bold hover:bg-slate-50 disabled:opacity-60"
            >
              {t("common.reset")}
            </button>

            <Link
              to="/login/non-malaysian"
              className="flex-1 py-4 bg-white border border-slate-200 text-slate-700 rounded-lg font-bold hover:bg-slate-50 text-center"
            >
              {t("auth.backToLogin")}
            </Link>
          </div>
        </form>
      </main>

      <footer className="bg-white border-t border-slate-200 py-8 px-6">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row justify-between gap-4 text-sm text-slate-500">
          <div>
            <p className="font-bold text-slate-700">fasTrack DBKU Portal</p>
            <p>© 2026 Sarawak Government. All Rights Reserved.</p>
          </div>

          <div className="flex gap-6">
            <a href="#">{t("auth.privacy")}</a>
            <a href="#">{t("auth.termsService")}</a>
            <a href="#">{t("auth.faq")}</a>
            <a href="#">{t("auth.contactUs")}</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default RegisterNonMalaysian;
