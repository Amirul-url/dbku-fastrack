import { useState } from "react";
import TopBar from "../../layout/TopBar";
import { Link, useNavigate } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";
import { apiRequest } from "../../services/api";

const initialForm = {
  fullName: "",
  mykadNumber: "",
  mobileNumber: "",
  email: "",
  address: "",
  password: "",
  confirmPassword: "",
  secureWord: "",
  agreed: false,
};

function RegisterMalaysian() {
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
    if (!form.mykadNumber.trim()) return "Please enter your MyKad Number.";
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
          nationality_type: "malaysian",
          role: "applicant",
          full_name: form.fullName.trim(),
          username: form.mykadNumber.trim(),
          mykad_number: form.mykadNumber.trim(),
          mobile_number: form.mobileNumber.trim(),
          email: form.email.trim(),
          address: form.address.trim(),
          password: form.password,
          password2: form.confirmPassword,
          secure_word: form.secureWord.trim(),
        }),
      });

      alert("Registration successful. Please login to continue.");
      navigate("/login/malaysian", { replace: true });
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

      <main className="max-w-4xl mx-auto px-6 py-6 flex-1 w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-2">{t("auth.registrationTitle")}</h1>
          <p className="text-slate-600 max-w-2xl">
            {t("auth.registrationMalaysianDescription")}
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            {error}
          </div>
        )}

        <form className="space-y-5" onSubmit={handleSubmit}>
          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="h-1 bg-[#07c25f]" />

            <div className="p-5">
              <div className="flex items-center gap-3 mb-6">
                <span className="material-symbols-outlined text-[#006d32]">
                  person
                </span>
                <h2 className="text-xl font-semibold">
                  {t("auth.personalInformation")}
                </h2>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-semibold mb-2">
                    {t("auth.fullNameMyKad")}
                  </label>
                  <input
                    type="text"
                    placeholder={t("auth.fullNamePlaceholder")}
                    value={form.fullName}
                    onChange={(e) => updateField("fullName", e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-[#07c25f]"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-semibold mb-2">
                    {t("auth.mykadNumber")}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 900101135555"
                    value={form.mykadNumber}
                    onChange={(e) => updateField("mykadNumber", e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-[#07c25f]"
                  />
                  <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold">
                    {t("auth.enterWithoutDashes")}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="p-5">
              <div className="flex items-center gap-3 mb-6">
                <span className="material-symbols-outlined text-[#006d32]">
                  contact_mail
                </span>
                <h2 className="text-xl font-semibold">{t("auth.contactDetails")}</h2>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">
                    {t("auth.mobileNumber")}
                  </label>
                  <div className="flex">
                    <span className="inline-flex items-center px-3 bg-slate-100 border border-r-0 border-slate-200 text-slate-500 rounded-l-lg text-sm">
                      +60
                    </span>
                    <input
                      type="tel"
                      placeholder="123456789"
                      value={form.mobileNumber}
                      onChange={(e) => updateField("mobileNumber", e.target.value)}
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-r-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-[#07c25f]"
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
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-[#07c25f]"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-semibold mb-2">
                    {t("auth.residentialAddress")}
                  </label>
                  <textarea
                    rows="4"
                    placeholder={t("auth.addressPlaceholder")}
                    value={form.address}
                    onChange={(e) => updateField("address", e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-[#07c25f]"
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="p-5">
              <div className="flex items-center gap-3 mb-6">
                <span className="material-symbols-outlined text-[#006d32]">
                  security
                </span>
                <h2 className="text-xl font-semibold">{t("auth.accountSecurity")}</h2>
              </div>

              <div className="grid grid-cols-2 gap-4">
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
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 pr-11 outline-none focus:ring-2 focus:ring-[#07c25f]"
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
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 pr-11 outline-none focus:ring-2 focus:ring-[#07c25f]"
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

                <div className="col-span-2">
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
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-[#07c25f]"
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

          <div className="flex gap-4 pt-4">
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
              to="/login/malaysian"
              className="flex-1 py-4 bg-white border border-slate-200 text-slate-700 rounded-lg font-bold hover:bg-slate-50 text-center"
            >
              {t("auth.backToLogin")}
            </Link>
          </div>
        </form>
      </main>

      <footer className="bg-white border-t border-slate-200 py-8 px-6">
        <div className="max-w-4xl mx-auto flex justify-between gap-4 text-sm text-slate-500">
          <div>
            <p className="font-bold text-slate-700">DBKU fasTrack</p>
            <p>© 2026 Advertisement License Application. All Rights Reserved.</p>
          </div>

          <div className="flex gap-4">
            <a href="#">{t("auth.faq")}</a>
            <a href="#">{t("auth.contactUs")}</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default RegisterMalaysian;
