import { useState } from "react";
import AuthLayout from "../../layout/AuthLayout";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";
import { apiRequest, clearAuthSession, getUserRedirectPath, saveAuthSession } from "../../services/api";

const ADMIN_LOGIN_IDS = ["admin", "superadmin"];

function LoginMalaysian() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const showRegistrationSuccess = Boolean(location.state?.registrationSuccess);
  const showPasswordResetSuccess = Boolean(location.state?.passwordResetSuccess);

  const updateUsername = (value) => {
    setUsername(value);
    setError("");
    setFieldErrors((prev) => {
      if (!prev.username) return prev;
      const next = { ...prev };
      delete next.username;
      return next;
    });
  };

  const updatePassword = (value) => {
    setPassword(value);
    setError("");
    setFieldErrors((prev) => {
      if (!prev.password) return prev;
      const next = { ...prev };
      delete next.password;
      return next;
    });
  };

  const getLoginErrorMessage = (message) => {
    const normalized = String(message || "").toLowerCase();

    if (normalized.includes("account does not exist") || normalized.includes("register first")) {
      return t("auth.loginAccountNotFound");
    }

    if (
      normalized.includes("invalid credentials") ||
      normalized.includes("no active account")
    ) {
      return t("auth.loginIcFailed");
    }

    return message || t("auth.loginIcFailed");
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setFieldErrors({});

    const rawUsername = username.trim();
    const normalizedIcNumber = rawUsername.replace(/\D/g, "");
    const isAdminLogin = ADMIN_LOGIN_IDS.includes(rawUsername.toLowerCase());
    const loginUsername = isAdminLogin ? rawUsername : normalizedIcNumber;
    const nextFieldErrors = {};

    if (!rawUsername) {
      nextFieldErrors.username = t("auth.validation.loginIdentifier");
    } else if (!isAdminLogin && normalizedIcNumber.length !== 12) {
      nextFieldErrors.username = t("auth.validation.loginIdentifierFormat");
    }

    if (!password.trim()) {
      nextFieldErrors.password = t("auth.validation.loginPassword");
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setError(t("auth.enterIcPassword"));
      return;
    }

    try {
      setLoading(true);
      clearAuthSession();

      const data = await apiRequest("/auth/login/", {
        method: "POST",
        body: JSON.stringify({
          username: loginUsername,
          password,
        }),
      });

      saveAuthSession(data, rememberMe);
      navigate(getUserRedirectPath(data.user), { replace: true });
    } catch (err) {
      setError(getLoginErrorMessage(err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="w-full max-w-[410px]">
        <h2 className="whitespace-nowrap text-center text-[52px] font-bold leading-tight text-[#006d32]">
          {t("auth.welcome")}
        </h2>

        {showRegistrationSuccess && (
          <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-[#006d32]">
            {t("auth.registerSuccessLogin")}
          </div>
        )}

        {showPasswordResetSuccess && (
          <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-[#006d32]">
            {t("auth.reset.successLogin")}
          </div>
        )}

        {error && (
          <div className="mt-6 break-words rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm leading-5 text-red-700">
            {error}
          </div>
        )}

        <form className="mt-8 space-y-4" onSubmit={handleLogin} autoComplete="off">
          <label className="relative block">
            <svg
              aria-hidden="true"
              className="absolute left-5 top-1/2 h-6 w-6 -translate-y-1/2 text-slate-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="4" y="5" width="16" height="14" rx="2" />
              <path d="M9 9h6" />
              <path d="M9 13h3" />
              <path d="M8 5V3h8v2" />
            </svg>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
              placeholder={t("auth.loginIdentifier")}
              value={username}
              onChange={(e) => updateUsername(e.target.value)}
              aria-invalid={Boolean(fieldErrors.username)}
              aria-describedby={fieldErrors.username ? "login-username-error" : undefined}
              className={`h-[52px] w-full rounded-full border bg-white pl-14 pr-5 text-base text-slate-800 outline-none transition placeholder:text-slate-400 focus:ring-2 ${
                fieldErrors.username
                  ? "border-red-400 focus:border-red-500 focus:ring-red-100"
                  : "border-slate-300 focus:border-[#006d32] focus:ring-[#006d32]/20"
              }`}
            />
            {fieldErrors.username && (
              <p id="login-username-error" className="mt-2 px-5 text-xs font-semibold text-red-600">
                {fieldErrors.username}
              </p>
            )}
          </label>

          <label className="relative block">
            <svg
              aria-hidden="true"
              className="absolute left-5 top-1/2 h-6 w-6 -translate-y-1/2 text-slate-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="5" y="10" width="14" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              autoCorrect="off"
              spellCheck="false"
              placeholder={t("auth.password")}
              value={password}
              onChange={(e) => updatePassword(e.target.value)}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
              className={`h-[52px] w-full rounded-full border bg-white pl-14 pr-14 text-base text-slate-800 outline-none transition placeholder:text-slate-400 focus:ring-2 ${
                fieldErrors.password
                  ? "border-red-400 focus:border-red-500 focus:ring-red-100"
                  : "border-slate-300 focus:border-[#006d32] focus:ring-[#006d32]/20"
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#006d32]"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <svg
                  aria-hidden="true"
                  className="h-6 w-6"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 3l18 18" />
                  <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                  <path d="M9.9 4.2A10.7 10.7 0 0 1 12 4c5 0 9 5 9 8a9.6 9.6 0 0 1-2 3.8" />
                  <path d="M6.1 6.1C4.2 7.5 3 9.9 3 12c0 3 4 8 9 8 1.1 0 2.2-.2 3.1-.6" />
                </svg>
              ) : (
                <svg
                  aria-hidden="true"
                  className="h-6 w-6"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
            {fieldErrors.password && (
              <p id="login-password-error" className="mt-2 px-5 text-xs font-semibold text-red-600">
                {fieldErrors.password}
              </p>
            )}
          </label>

          <div className="flex items-center justify-between pt-1 text-sm text-slate-600">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-[#006d32]"
              />
              <span>{t("auth.rememberMe")}</span>
            </label>

            <Link
              to="/forgot-password"
              className="font-semibold text-[#006d32] hover:text-[#004f24]"
              style={{ textDecoration: "underline", textUnderlineOffset: "3px" }}
            >
              {t("auth.forgotPassword")}
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-6 h-[52px] w-full rounded-full bg-[#006d32] px-5 text-base font-semibold text-white shadow-lg shadow-emerald-900/20 transition hover:bg-[#005224] disabled:opacity-60"
          >
            {loading ? t("common.signingIn") : t("common.signIn")}
          </button>
        </form>

        <div className="mt-7 text-center text-sm text-slate-500">
          <p>
            {t("auth.noAccount")}{" "}
            <Link
              to="/register/malaysian"
              className="font-semibold text-[#006d32] hover:text-[#004f24]"
              style={{ textDecoration: "underline", textUnderlineOffset: "3px" }}
            >
              {t("common.registerNow")}
            </Link>
          </p>
          <p className="mt-2 text-xs text-slate-500">
            {t("auth.developedBy")}
          </p>
        </div>
      </div>
    </AuthLayout>
  );
}

export default LoginMalaysian;
