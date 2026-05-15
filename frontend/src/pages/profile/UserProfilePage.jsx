import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, PageHeader } from "../../components/ui/SystemUI";
import { useLanguage } from "../../context/LanguageContext";
import UserDashboardLayout from "../../layout/UserDashboardLayout";
import { apiRequest, getStoredUser } from "../../services/api";

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
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MYKAD_PATTERN = /^\d{12}$/;
const ADDRESS_MAX_LENGTH = 150;

function uppercaseNameInput(value) {
  return String(value || "").toUpperCase();
}

function normalizeNameValue(value) {
  return uppercaseNameInput(value).trim().replace(/\s+/g, " ");
}

const stateCityOptions = {
  Johor: ["Johor Bahru", "Batu Pahat", "Muar", "Kluang", "Kulai", "Skudai", "Segamat", "Pontian", "Pasir Gudang", "Kota Tinggi"],
  Kedah: ["Alor Setar", "Sungai Petani", "Kulim", "Langkawi", "Jitra", "Baling", "Kuala Nerang"],
  Kelantan: ["Kota Bharu", "Tanah Merah", "Pasir Mas", "Tumpat", "Machang", "Gua Musang"],
  Melaka: ["Melaka City", "Alor Gajah", "Jasin", "Masjid Tanah"],
  "Negeri Sembilan": ["Seremban", "Port Dickson", "Nilai", "Senawang", "Bahau", "Rembau"],
  Pahang: ["Kuantan", "Temerloh", "Bentong", "Mentakab", "Pekan", "Raub", "Cameron Highlands"],
  Penang: ["George Town", "Bayan Lepas", "Butterworth", "Bukit Mertajam", "Perai", "Nibong Tebal"],
  Perak: ["Ipoh", "Taiping", "Sitiawan", "Teluk Intan", "Batu Gajah", "Lumut", "Kuala Kangsar", "Tanjong Malim"],
  Perlis: ["Kangar", "Arau", "Padang Besar"],
  Sabah: ["Kota Kinabalu", "Sandakan", "Tawau", "Lahad Datu", "Keningau", "Penampang", "Tuaran", "Papar", "Kudat"],
  Sarawak: ["Kuching", "Miri", "Sibu", "Bintulu", "Samarahan", "Sri Aman", "Sarikei", "Kapit", "Limbang", "Lawas"],
  Selangor: ["Shah Alam", "Petaling Jaya", "Subang Jaya", "Klang", "Puchong", "Cheras", "Kajang", "Rawang", "Ampang", "Seri Kembangan", "Cyberjaya", "Sepang"],
  Terengganu: ["Kuala Terengganu", "Chukai", "Dungun", "Kemaman", "Besut", "Marang"],
  "W.P. Kuala Lumpur": ["Kuala Lumpur", "Cheras", "Setapak", "Kepong", "Bangsar", "Bukit Jalil"],
  "W.P. Labuan": ["Labuan"],
  "W.P. Putrajaya": ["Putrajaya"],
};
const stateOptions = Object.keys(stateCityOptions);

function UserProfilePage() {
  const { t } = useLanguage();
  const [form, setForm] = useState(() => buildFormFromUser(getStoredUser()));
  const [savedForm, setSavedForm] = useState(() => buildFormFromUser(getStoredUser()));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [fieldErrors, setFieldErrors] = useState({});
  const cityOptions = form.state ? stateCityOptions[form.state] || [] : [];

  useEffect(() => {
    let active = true;

    apiRequest("/auth/me/")
      .then((data) => {
        if (!active || !data?.user) return;
        localStorage.setItem("fastrack_user", JSON.stringify(data.user));
        const nextForm = buildFormFromUser(data.user);
        setForm(nextForm);
        setSavedForm(nextForm);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setMessage({ type: "", text: "" });
  }

  function handleStateChange(value) {
    setForm((current) => ({ ...current, state: value, city: "" }));
    setFieldErrors((current) => {
      const next = { ...current };
      delete next.state;
      delete next.city;
      return next;
    });
    setMessage({ type: "", text: "" });
  }

  function validateForm() {
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
    return errors;
  }

  async function handleSave() {
    const errors = validateForm();

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setMessage({ type: "error", text: t("auth.validation.summary") });
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    try {
      setSaving(true);
      const data = await apiRequest("/auth/me/", {
        method: "PATCH",
        body: JSON.stringify({
          full_name: normalizeNameValue(form.fullName),
          mykad_number: form.mykadNumber.trim(),
          gender: form.gender,
          date_of_birth: form.dateOfBirth,
          nationality: form.nationality.trim(),
          mobile_number: form.mobileNumber.trim(),
          email: form.email.trim(),
          address_line1: form.addressLine1.trim(),
          address_line2: form.addressLine2.trim(),
          postcode: form.postcode.trim(),
          city: form.city.trim(),
          state: form.state.trim(),
          address: buildAddress(form),
        }),
      });
      localStorage.setItem("fastrack_user", JSON.stringify(data.user));
      const nextForm = buildFormFromUser(data.user);
      setForm(nextForm);
      setSavedForm(nextForm);
      setEditing(false);
      setFieldErrors({});
      setMessage({ type: "success", text: t("profile.saveSuccess") });
      window.dispatchEvent(new Event("fastrack:auth-changed"));
    } catch (err) {
      setMessage({
        type: "error",
        text: getProfileServerError(err.message, t),
      });
    } finally {
      setSaving(false);
    }
  }

  function handleCancelEdit() {
    setForm(savedForm);
    setFieldErrors({});
    setMessage({ type: "", text: "" });
    setEditing(false);
  }

  return (
    <UserDashboardLayout>
      <PageHeader
        eyebrow={t("profile.profile")}
        title={t("profile.accountProfile")}
        description={t("profile.accountRegistrationInfo")}
        actions={
          <div className="flex gap-2">
            <Link
              to="/user/dashboard"
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              {t("profile.backToDashboard")}
            </Link>
            <Button variant="secondary" icon="edit" onClick={() => setEditing(true)} disabled={editing}>
              {t("common.edit")}
            </Button>
            <Button icon="save" onClick={handleSave} disabled={!editing || saving}>
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        }
      />

      <Alert type={message.type || "success"} message={message.text} />

      <form className="space-y-5" onSubmit={(event) => event.preventDefault()} noValidate>
        <ProfileSection icon="person" title={t("auth.personalInformation")}>
          <div className="grid grid-cols-4 gap-4">
            <FormField className="col-span-2" label={t("auth.fullNameMyKad")} error={fieldErrors.fullName} required>
              <TextInput
                disabled={!editing}
                value={form.fullName}
                onChange={(value) => updateField("fullName", uppercaseNameInput(value))}
                error={fieldErrors.fullName}
                placeholder={t("auth.fullNamePlaceholder")}
              />
            </FormField>

            <FormField className="col-span-2" label={t("auth.gender")} error={fieldErrors.gender} required>
              <select
                disabled={!editing}
                value={form.gender}
                onChange={(event) => updateField("gender", event.target.value)}
                className={getInputClass(Boolean(fieldErrors.gender))}
              >
                <option value="">{t("auth.selectGender")}</option>
                <option value="male">{t("auth.genderMale")}</option>
                <option value="female">{t("auth.genderFemale")}</option>
              </select>
            </FormField>

            <FormField className="col-span-2" label={t("auth.dateOfBirth")} error={fieldErrors.dateOfBirth} required>
              <TextInput
                type="date"
                disabled={!editing}
                value={form.dateOfBirth}
                onChange={(value) => updateField("dateOfBirth", value)}
                error={fieldErrors.dateOfBirth}
              />
            </FormField>

            <FormField className="col-span-2" label={t("auth.nationality")} error={fieldErrors.nationality} required>
              <TextInput
                disabled={!editing}
                value={form.nationality}
                onChange={(value) => updateField("nationality", value)}
                error={fieldErrors.nationality}
              />
            </FormField>

            <FormField className="col-span-2" label={t("auth.mykadNumber")} error={fieldErrors.mykadNumber} required>
              <TextInput
                disabled={!editing}
                value={form.mykadNumber}
                onChange={(value) => updateField("mykadNumber", value)}
                error={fieldErrors.mykadNumber}
                placeholder="e.g. 900101135555"
              />
            </FormField>
          </div>
        </ProfileSection>

        <ProfileSection icon="contact_mail" title={t("auth.contactDetails")}>
          <div className="grid grid-cols-4 gap-4">
            <FormField className="col-span-2" label={t("auth.mobileNumber")} error={fieldErrors.mobileNumber} required>
              <div className="flex">
                <span className="inline-flex items-center rounded-l-md border border-r-0 border-slate-200 bg-slate-100 px-3 text-sm text-slate-500">
                  +60
                </span>
                <input
                  type="tel"
                  disabled={!editing}
                  value={form.mobileNumber}
                  onChange={(event) => updateField("mobileNumber", event.target.value)}
                  className={`${getInputClass(Boolean(fieldErrors.mobileNumber))} rounded-l-none`}
                />
              </div>
            </FormField>

            <FormField className="col-span-2" label={t("auth.emailAddress")} error={fieldErrors.email} required>
              <TextInput
                type="email"
                disabled={!editing}
                value={form.email}
                onChange={(value) => updateField("email", value)}
                error={fieldErrors.email}
                placeholder="example@email.com"
              />
            </FormField>

            <div className="col-span-4 border-t border-slate-100 pt-2">
              <h3 className="text-sm font-bold text-slate-700">{t("auth.address")}</h3>
            </div>

            <FormField className="col-span-2" label={t("auth.addressLine1")} error={fieldErrors.addressLine1} required>
              <TextInput
                disabled={!editing}
                maxLength={ADDRESS_MAX_LENGTH}
                value={form.addressLine1}
                onChange={(value) => updateField("addressLine1", value)}
                error={fieldErrors.addressLine1}
                placeholder={t("auth.addressLine1Placeholder")}
              />
            </FormField>

            <FormField className="col-span-2" label={t("auth.addressLine2")} error={fieldErrors.addressLine2} required>
              <TextInput
                disabled={!editing}
                maxLength={ADDRESS_MAX_LENGTH}
                value={form.addressLine2}
                onChange={(value) => updateField("addressLine2", value)}
                error={fieldErrors.addressLine2}
                placeholder={t("auth.addressLine2Placeholder")}
              />
            </FormField>

            <FormField label={t("auth.postcode")} error={fieldErrors.postcode} required>
              <TextInput
                disabled={!editing}
                value={form.postcode}
                onChange={(value) => updateField("postcode", value)}
                error={fieldErrors.postcode}
                placeholder="e.g. 93000"
              />
            </FormField>

            <FormField label={t("auth.state")} error={fieldErrors.state} required>
              <select
                disabled={!editing}
                value={form.state}
                onChange={(event) => handleStateChange(event.target.value)}
                className={getInputClass(Boolean(fieldErrors.state))}
              >
                <option value="">{t("auth.selectState")}</option>
                {stateOptions.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label={t("auth.city")} error={fieldErrors.city} required>
              <select
                disabled={!editing || !form.state}
                value={form.city}
                onChange={(event) => updateField("city", event.target.value)}
                className={getInputClass(Boolean(fieldErrors.city))}
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
            </FormField>
          </div>
        </ProfileSection>

        {editing && (
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={handleCancelEdit} disabled={saving}>
              {t("common.cancel")}
            </Button>
            <Button icon="save" onClick={handleSave} disabled={saving}>
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        )}
      </form>
    </UserDashboardLayout>
  );
}

function ProfileSection({ icon, title, children }) {
  return (
    <section className="overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="h-1 bg-[#07c25f]" />
      <div className="px-6 py-6">
        <div className="mb-6 flex items-center gap-3">
          <span className="material-symbols-outlined text-[#006d32]">{icon}</span>
          <h2 className="text-xl font-semibold">{title}</h2>
        </div>
        {children}
      </div>
    </section>
  );
}

function FormField({ label, children, error, required = false, className = "" }) {
  return (
    <div className={className}>
      <label className="mb-2 block text-sm font-semibold">
        {label} {required && <span className="text-red-600">*</span>}
      </label>
      {children}
      {error && <p className="mt-1.5 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}

function TextInput({ type = "text", value, onChange, error, disabled, ...props }) {
  return (
    <input
      type={type}
      disabled={disabled}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={getInputClass(Boolean(error))}
      {...props}
    />
  );
}

function getInputClass(hasError) {
  return `w-full rounded-md border bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2 disabled:bg-slate-100 disabled:text-slate-500 ${
    hasError
      ? "border-red-400 focus:ring-red-100"
      : "border-slate-200 focus:border-[#07c25f] focus:ring-[#07c25f]/20"
  }`;
}

function buildFormFromUser(user) {
  const addressParts = hasStructuredAddress(user)
    ? {
        addressLine1: user?.address_line1 || "",
        addressLine2: user?.address_line2 || "",
        postcode: user?.postcode || "",
        city: user?.city || "",
        state: user?.state || "",
      }
    : parseAddress(user?.address || "");

  return {
    ...initialForm,
    fullName: normalizeNameValue(user?.full_name || ""),
    gender: user?.gender || "",
    dateOfBirth: user?.date_of_birth || "",
    nationality: user?.nationality || "Malaysian",
    mykadNumber: user?.mykad_number || user?.username || "",
    mobileNumber: user?.mobile_number || "",
    email: user?.email || "",
    ...addressParts,
  };
}

function hasStructuredAddress(user) {
  return Boolean(
    user?.address_line1 ||
      user?.address_line2 ||
      user?.postcode ||
      user?.city ||
      user?.state
  );
}

function parseAddress(address) {
  const parts = String(address || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 5) {
    return {
      addressLine1: parts[0],
      addressLine2: parts.slice(1, -3).join(", "),
      postcode: parts.at(-3),
      city: parts.at(-2),
      state: parts.at(-1),
    };
  }

  return {
    addressLine1: address || "",
    addressLine2: "",
    postcode: "",
    city: "",
    state: "",
  };
}

function buildAddress(form) {
  return [
    form.addressLine1.trim(),
    form.addressLine2.trim(),
    form.postcode.trim(),
    form.city.trim(),
    form.state.trim(),
  ]
    .filter(Boolean)
    .join(", ");
}

function getProfileServerError(message, t) {
  const normalized = String(message || "").toLowerCase();

  if (normalized.includes("username already exists")) return t("auth.validation.mykadExists");
  if (normalized.includes("email already exists")) return t("auth.validation.emailExists");
  if (normalized.includes("password") && normalized.includes("match")) return t("auth.validation.passwordMismatch");
  return message || t("profile.saveFailed");
}

export default UserProfilePage;
