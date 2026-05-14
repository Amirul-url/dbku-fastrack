import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../../layout/AuthLayout";
import { useLanguage } from "../../context/LanguageContext";
import { apiRequest } from "../../services/api";

const OTP_LENGTH = 6;

function ForgotPassword() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const otpRefs = useRef([]);

  const [step, setStep] = useState("request");
  const [identifier, setIdentifier] = useState("");
  const [channel, setChannel] = useState("email");
  const [resetId, setResetId] = useState("");
  const [otpDigits, setOtpDigits] = useState(Array(OTP_LENGTH).fill(""));
  const [resetToken, setResetToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const setFriendlyError = (text) => {
    setMessage("");
    setError(text || t("auth.reset.errorGeneric"));
  };

  const clearFeedback = () => {
    setError("");
    setMessage("");
  };

  const isWhatsapp = channel === "whatsapp";
  const identifierLabel = isWhatsapp
    ? t("auth.reset.whatsappNumber")
    : t("auth.emailAddress");
  const identifierPlaceholder = isWhatsapp
    ? t("auth.reset.whatsappPlaceholder")
    : t("auth.reset.emailPlaceholder");

  const updateChannel = (nextChannel) => {
    setChannel(nextChannel);
    setIdentifier("");
    setFieldErrors({});
    clearFeedback();
  };

  const validateIdentifier = () => {
    const nextErrors = {};
    const value = identifier.trim();

    if (!value) {
      nextErrors.identifier = isWhatsapp
        ? t("auth.reset.validationWhatsapp")
        : t("auth.validation.email");
    } else if (isWhatsapp) {
      const phoneDigits = value.replace(/\D/g, "");
      if (phoneDigits.length < 8) {
        nextErrors.identifier = t("auth.reset.validationWhatsappFormat");
      }
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      nextErrors.identifier = t("auth.validation.emailFormat");
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  async function handleRequestOtp(event) {
    event.preventDefault();
    clearFeedback();

    if (!validateIdentifier()) {
      setFriendlyError(isWhatsapp ? t("auth.reset.checkWhatsapp") : t("auth.reset.checkEmail"));
      return;
    }

    try {
      setLoading(true);
      const data = await apiRequest("/auth/password-reset/request/", {
        method: "POST",
        body: JSON.stringify({
          identifier: identifier.trim(),
          channel,
        }),
      });

      setResetId(data.reset_id || identifier.trim());
      setStep("otp");
      setOtpDigits(Array(OTP_LENGTH).fill(""));
      setMessage(data.debug_otp
        ? `${data.message} ${t("auth.reset.devOtp")}: ${data.debug_otp}`
        : data.message || t("auth.reset.otpSent"));
      setTimeout(() => otpRefs.current[0]?.focus(), 0);
    } catch (err) {
      setFriendlyError(mapResetError(err.message, t, channel));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(event) {
    event.preventDefault();
    clearFeedback();

    const otp = otpDigits.join("");
    if (otp.length !== OTP_LENGTH) {
      setFriendlyError(t("auth.reset.enterCompleteOtp"));
      return;
    }

    try {
      setLoading(true);
      const data = await apiRequest("/auth/password-reset/verify/", {
        method: "POST",
        body: JSON.stringify({
          identifier: resetId || identifier.trim(),
          otp,
        }),
      });

      setResetToken(data.reset_token || "");
      setStep("password");
      setMessage(data.message || t("auth.reset.otpVerified"));
    } catch (err) {
      setFriendlyError(mapResetError(err.message, t, channel));
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(event) {
    event.preventDefault();
    clearFeedback();

    const nextErrors = {};
    if (!password) nextErrors.password = t("auth.validation.password");
    if (!confirmPassword) nextErrors.confirmPassword = t("auth.validation.confirmPassword");
    if (password && password.length < 8) nextErrors.password = t("auth.reset.passwordMin");
    if (password && confirmPassword && password !== confirmPassword) {
      nextErrors.confirmPassword = t("auth.validation.passwordMismatch");
    }

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setFriendlyError(t("auth.validation.summary"));
      return;
    }

    try {
      setLoading(true);
      await apiRequest("/auth/password-reset/confirm/", {
        method: "POST",
        body: JSON.stringify({
          reset_token: resetToken,
          password,
          password2: confirmPassword,
        }),
      });

      navigate("/login/malaysian", {
        replace: true,
        state: { passwordResetSuccess: true },
      });
    } catch (err) {
      setFriendlyError(mapResetError(err.message, t, channel));
    } finally {
      setLoading(false);
    }
  }

  function updateOtpDigit(index, value) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const nextDigits = [...otpDigits];
    nextDigits[index] = digit;
    setOtpDigits(nextDigits);
    clearFeedback();

    if (digit && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  }

  function handleOtpKeyDown(index, event) {
    if (event.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  }

  function handleOtpPaste(event) {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pasted) return;

    event.preventDefault();
    const nextDigits = Array(OTP_LENGTH).fill("");
    pasted.split("").forEach((digit, index) => {
      nextDigits[index] = digit;
    });
    setOtpDigits(nextDigits);
    otpRefs.current[Math.min(pasted.length, OTP_LENGTH) - 1]?.focus();
  }

  return (
    <AuthLayout>
      <div className="w-full max-w-[460px]">
        <Link
          to="/login/malaysian"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#006d32] hover:text-[#004f24]"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          {t("auth.backToLogin")}
        </Link>

        <div className="mt-6">
          <p className="text-sm font-bold uppercase tracking-wide text-[#006d32]">
            {t("auth.reset.eyebrow")}
          </p>
          <h1 className="mt-2 text-4xl font-bold leading-tight text-slate-950">
            {t("auth.reset.title")}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {t("auth.reset.description")}
          </p>
        </div>

        <StepIndicator step={step} t={t} channel={channel} />

        {message && (
          <div className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-[#006d32]">
            {message}
          </div>
        )}

        {error && (
          <div className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        {step === "request" && (
          <form className="mt-7 space-y-5" onSubmit={handleRequestOtp} noValidate>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">
                {identifierLabel}
              </span>
              <input
                type={isWhatsapp ? "tel" : "email"}
                inputMode={isWhatsapp ? "tel" : "email"}
                value={identifier}
                onChange={(event) => {
                  setIdentifier(event.target.value);
                  clearFeedback();
                  setFieldErrors((prev) => ({ ...prev, identifier: "" }));
                }}
                placeholder={identifierPlaceholder}
                aria-invalid={Boolean(fieldErrors.identifier)}
                className={`mt-2 h-[52px] w-full rounded-md border bg-white px-4 text-base text-slate-800 outline-none transition focus:ring-2 ${
                  fieldErrors.identifier
                    ? "border-red-400 focus:border-red-500 focus:ring-red-100"
                    : "border-slate-300 focus:border-[#006d32] focus:ring-[#006d32]/20"
                }`}
              />
              {fieldErrors.identifier && (
                <p className="mt-2 text-xs font-semibold text-red-600">
                  {fieldErrors.identifier}
                </p>
              )}
            </label>

            <div>
              <p className="text-sm font-semibold text-slate-700">
                {t("auth.reset.chooseChannel")}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <ChannelButton
                  active={channel === "email"}
                  icon="mail"
                  label={t("auth.reset.channelEmail")}
                  description={t("auth.reset.channelEmailDesc")}
                  onClick={() => updateChannel("email")}
                />
                <ChannelButton
                  active={channel === "whatsapp"}
                  icon="chat"
                  label={t("auth.reset.channelWhatsapp")}
                  description={t("auth.reset.channelWhatsappDesc")}
                  onClick={() => updateChannel("whatsapp")}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="h-[52px] w-full rounded-full bg-[#006d32] px-5 text-base font-semibold text-white shadow-lg shadow-emerald-900/20 transition hover:bg-[#005224] disabled:opacity-60"
            >
              {loading ? t("auth.reset.sendingOtp") : t("auth.reset.getOtp")}
            </button>
          </form>
        )}

        {step === "otp" && (
          <form className="mt-7 space-y-5" onSubmit={handleVerifyOtp} noValidate>
            <div>
              <p className="text-sm font-semibold text-slate-700">
                {t("auth.reset.enterOtp")}
              </p>
              <div className="mt-3 grid grid-cols-6 gap-2" onPaste={handleOtpPaste}>
                {otpDigits.map((digit, index) => (
                  <input
                    key={`otp-${index}`}
                    ref={(element) => {
                      otpRefs.current[index] = element;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(event) => updateOtpDigit(index, event.target.value)}
                    onKeyDown={(event) => handleOtpKeyDown(index, event)}
                    className="h-14 rounded-md border border-slate-300 bg-white text-center text-xl font-bold text-slate-900 outline-none transition focus:border-[#006d32] focus:ring-2 focus:ring-[#006d32]/20"
                    aria-label={`${t("auth.reset.otpDigit")} ${index + 1}`}
                  />
                ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                {t("auth.reset.otpHint")}
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="h-[52px] w-full rounded-full bg-[#006d32] px-5 text-base font-semibold text-white shadow-lg shadow-emerald-900/20 transition hover:bg-[#005224] disabled:opacity-60"
            >
              {loading ? t("auth.reset.verifying") : t("auth.reset.verifyOtp")}
            </button>

            <button
              type="button"
              onClick={handleRequestOtp}
              disabled={loading}
              className="w-full text-sm font-semibold text-[#006d32] hover:text-[#004f24] disabled:opacity-60"
            >
              {t("auth.reset.resendOtp")}
            </button>
          </form>
        )}

        {step === "password" && (
          <form className="mt-7 space-y-5" onSubmit={handleResetPassword} noValidate>
            <PasswordInput
              label={t("auth.reset.newPassword")}
              value={password}
              error={fieldErrors.password}
              show={showPassword}
              onToggle={() => setShowPassword((prev) => !prev)}
              onChange={(value) => {
                setPassword(value);
                clearFeedback();
                setFieldErrors((prev) => ({ ...prev, password: "" }));
              }}
            />

            <PasswordInput
              label={t("auth.confirmPassword")}
              value={confirmPassword}
              error={fieldErrors.confirmPassword}
              show={showConfirmPassword}
              onToggle={() => setShowConfirmPassword((prev) => !prev)}
              onChange={(value) => {
                setConfirmPassword(value);
                clearFeedback();
                setFieldErrors((prev) => ({ ...prev, confirmPassword: "" }));
              }}
            />

            <button
              type="submit"
              disabled={loading}
              className="h-[52px] w-full rounded-full bg-[#006d32] px-5 text-base font-semibold text-white shadow-lg shadow-emerald-900/20 transition hover:bg-[#005224] disabled:opacity-60"
            >
              {loading ? t("common.saving") : t("auth.reset.savePassword")}
            </button>
          </form>
        )}
      </div>
    </AuthLayout>
  );
}

function StepIndicator({ step, t, channel }) {
  const steps = [
    ["request", channel === "whatsapp" ? t("auth.reset.stepWhatsapp") : t("auth.reset.stepEmail")],
    ["otp", t("auth.reset.stepOtp")],
    ["password", t("auth.reset.stepPassword")],
  ];
  const activeIndex = Math.max(steps.findIndex(([value]) => value === step), 0);

  return (
    <div className="mt-6 grid grid-cols-3 gap-2">
      {steps.map(([value, label], index) => (
        <div
          key={value}
          className={`rounded-md border px-3 py-2 text-center text-xs font-semibold ${
            index <= activeIndex
              ? "border-emerald-200 bg-emerald-50 text-[#006d32]"
              : "border-slate-200 bg-white text-slate-400"
          }`}
        >
          {label}
        </div>
      ))}
    </div>
  );
}

function ChannelButton({ active, icon, label, description, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border p-4 text-left transition ${
        active
          ? "border-[#006d32] bg-emerald-50 text-[#006d32] ring-2 ring-[#006d32]/10"
          : "border-slate-200 bg-white text-slate-700 hover:border-emerald-200 hover:bg-emerald-50"
      }`}
    >
      <span className="material-symbols-outlined text-[24px]">{icon}</span>
      <span className="mt-2 block text-sm font-bold">{label}</span>
      <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>
    </button>
  );
}

function PasswordInput({ label, value, error, show, onToggle, onChange }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <div className="relative mt-2">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`h-[52px] w-full rounded-md border bg-white px-4 pr-12 text-base text-slate-800 outline-none transition focus:ring-2 ${
            error
              ? "border-red-400 focus:border-red-500 focus:ring-red-100"
              : "border-slate-300 focus:border-[#006d32] focus:ring-[#006d32]/20"
          }`}
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#006d32]"
          aria-label={show ? "Hide password" : "Show password"}
        >
          <span className="material-symbols-outlined text-[22px]">
            {show ? "visibility_off" : "visibility"}
          </span>
        </button>
      </div>
      {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
    </label>
  );
}

function mapResetError(message, t, channel = "email") {
  const normalized = String(message || "").toLowerCase();

  if (normalized.includes("could not find")) {
    return channel === "whatsapp"
      ? t("auth.reset.errorNotFoundWhatsapp")
      : t("auth.reset.errorNotFound");
  }
  if (normalized.includes("expired")) return t("auth.reset.errorExpired");
  if (normalized.includes("incorrect")) return message;
  if (normalized.includes("too many")) return t("auth.reset.errorTooMany");
  if (normalized.includes("whatsapp") && normalized.includes("saved")) return t("auth.reset.errorNoWhatsapp");
  if (normalized.includes("email") && normalized.includes("saved")) return t("auth.reset.errorNoEmail");
  if (normalized.includes("match")) return t("auth.validation.passwordMismatch");
  if (normalized.includes("at least 8")) return t("auth.reset.passwordMin");

  return message || t("auth.reset.errorGeneric");
}

export default ForgotPassword;
