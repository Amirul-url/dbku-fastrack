import { useEffect, useState } from "react";
import UserDashboardLayout from "../../../../layout/UserDashboardLayout";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useLanguage } from "../../../../context/LanguageContext";
import { apiRequest } from "../../../../services/api";
import {
  canEditApplicationForm,
  getApplicantSaveDraftReturnLabelKey,
  getApplicantSaveDraftReturnPath,
} from "../../../../utils/workflow";
import { markApplicantRecordSeen } from "../../../../utils/applicantSeenRecords";
import { stepText } from "./ApplicationStepText";
import AdminViewStepControls from "./AdminViewStepControls";
import UserViewStepControls from "./UserViewStepControls";
import ApplicationSummary from "./ApplicationSummary";

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
const allCityOptions = Array.from(
  new Set(Object.values(stateCityOptions).flat())
).sort((a, b) => a.localeCompare(b));

function normalizeStateCity(state, city) {
  if (stateCityOptions[state]) {
    return {
      state,
      city: stateCityOptions[state].includes(city) ? city : "",
    };
  }

  if (stateCityOptions[city]?.includes(state)) {
    return {
      state: city,
      city: state,
    };
  }

  return { state: "", city: "" };
}

function SubmittingPersonPage({
  LayoutComponent = UserDashboardLayout,
  StepNavComponent = null,
  mode = "user",
} = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const tx = (key) => stepText(language, key);
  const { applicationId: routeApplicationId } = useParams();
  const queryParams = new URLSearchParams(location.search);

  const applicationIdRaw =
    routeApplicationId || location.state?.applicationId || queryParams.get("id");

  const applicationId = applicationIdRaw ? Number(applicationIdRaw) : null;

  const Layout = LayoutComponent;
  const StepNav = StepNavComponent;
  const isAdminView = mode === "admin-view";
  const isAdminReview = mode === "admin" || isAdminView;

  const [orgType, setOrgType] = useState("");
  const [registrationNo, setRegistrationNo] = useState("");
  const [orgName, setOrgName] = useState("");
  const [postalAddress, setPostalAddress] = useState("");
  const [postcode, setPostcode] = useState("");
  const [address2, setAddress2] = useState("");
  const [stateValue, setStateValue] = useState("");
  const [city, setCity] = useState("");
  const [orgCountryCode, setOrgCountryCode] = useState("");
  const [telephoneNo, setTelephoneNo] = useState("");

  const [honoraryTitle, setHonoraryTitle] = useState("");
  const TITLE_OPTIONS = [
    "Tun",
    "Toh Puan",
    "Tan Sri",
    "Puan Sri",
    "Dato' Seri",
    "Datuk Seri",
    "Datin Seri",
    "Dato'",
    "Datuk",
    "Datin",
    "Prof.",
    "Dr.",
    "Ir.",
    "Haji",
    "Hajjah",
    "Encik",
    "Puan",
    "Cik",
  ];
  const [designation, setDesignation] = useState("");
  const [fullName, setFullName] = useState("");
  const [mobileCountryCode, setMobileCountryCode] = useState("");
  const [mobileNo, setMobileNo] = useState("");
  const [identityCardNo, setIdentityCardNo] = useState("");
  const [officeCountryCode, setOfficeCountryCode] = useState("");
  const [officeNo, setOfficeNo] = useState("");
  const [email, setEmail] = useState("");
  const [faxCountryCode, setFaxCountryCode] = useState("");
  const [faxNo, setFaxNo] = useState("");
  const [applicationRecord, setApplicationRecord] = useState(null);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const citySearchTerm = city.trim().toLowerCase();
  const citySuggestions =
    citySearchTerm.length >= 2
      ? allCityOptions
          .filter((cityOption) => cityOption.toLowerCase().includes(citySearchTerm))
          .slice(0, 8)
      : [];

  useEffect(() => {
    if (applicationId) {
      // eslint-disable-next-line react-hooks/immutability
      loadStep3();
    }
  }, [applicationId]);

  async function loadStep3() {
    try {
      const data = await apiRequest(`/applications/${applicationId}/`);
      const step3 = data.form_data?.step_3 || {};

      setApplicationRecord(data);
      setOrgType(step3.org_type || "");
      setRegistrationNo(step3.registration_no || "");
      setOrgName(step3.org_name || "");
      setPostalAddress(step3.postal_address || "");
      setPostcode(step3.postcode || "");
      setAddress2(step3.address_2 || "");
      const normalizedLocation = normalizeStateCity(step3.state || "", step3.city || "");
      setStateValue(normalizedLocation.state);
      setCity(normalizedLocation.city);
      setOrgCountryCode(step3.org_country_code || "");
      setTelephoneNo(step3.telephone_no || "");

      setHonoraryTitle(step3.honorary_title || "");
      setDesignation(step3.designation || "");
      setFullName(step3.full_name || "");
      setMobileCountryCode(step3.mobile_country_code || "");
      setMobileNo(step3.mobile_no || "");
      setIdentityCardNo(step3.identity_card_no || "");
      setOfficeCountryCode(step3.office_country_code || "");
      setOfficeNo(step3.office_no || "");
      setEmail(step3.email || "");
      setFaxCountryCode(step3.fax_country_code || "");
      setFaxNo(step3.fax_no || "");
    } catch (err) {
      console.error("Load Step 3 failed:", err);
    }
  }

  function handleStateChange(value) {
    setStateValue(value);
    setCity(value && stateCityOptions[value]?.includes(city) ? city : "");
  }

  function handleCityChange(value) {
    const normalizedValue = value.trim().toLowerCase();
    const matches = Object.entries(stateCityOptions)
      .flatMap(([state, cities]) =>
        cities
          .filter((cityOption) => cityOption.toLowerCase() === normalizedValue)
          .map((cityOption) => ({ city: cityOption, state }))
      );
    const matchedCity = matches[0]?.city;

    setCity(matchedCity || value);
    if (matches.length === 1) {
      setStateValue(matches[0].state);
    }
    setShowCitySuggestions(Boolean(value.trim()) && !matchedCity);
  }

  function selectCitySuggestion(cityOption) {
    handleCityChange(cityOption);
    setShowCitySuggestions(false);
  }

  function buildStep3Payload() {
    return {
      org_type: orgType,
      registration_no: registrationNo,
      org_name: orgName,
      branch_name: "",
      postal_address: postalAddress,
      postcode,
      address_2: address2,
      state: stateValue,
      city,
      address_3: "",
      org_country_code: orgCountryCode,
      telephone_no: telephoneNo,
      address_4: "",

      honorary_title: honoraryTitle,
      designation,
      full_name: fullName,
      mobile_country_code: mobileCountryCode,
      mobile_no: mobileNo,
      identity_card_no: identityCardNo,
      office_country_code: officeCountryCode,
      office_no: officeNo,
      email,
      fax_country_code: faxCountryCode,
      fax_no: faxNo,
    };
  }

  function buildNewApplicationDefaults() {
    return {
      application_type: "sitting_application",
      title: tx("draftSittingApplication"),
      form_data: {
        step_1: {
          status: "Draft",
          application_type: "Application for Site (New Site)",
          application_type_label: "Application for Site (New Site)",
        },
      },
    };
  }

  async function saveStep3({ goNext = false } = {}) {
    if (isReadOnly) return;

    if (goNext && (
      !orgType.trim() ||
      !orgName.trim() ||
      !postalAddress.trim() ||
      !address2.trim() ||
      !postcode.trim() ||
      !stateValue.trim() ||
      !city.trim() ||
      !orgCountryCode.trim() ||
      !telephoneNo.trim() ||
      !designation.trim() ||
      !fullName.trim() ||
      !mobileCountryCode.trim() ||
      !mobileNo.trim() ||
      !identityCardNo.trim() ||
      !officeCountryCode.trim() ||
      !officeNo.trim() ||
      !email.trim()
    )) {
      alert(tx("requiredAlert"));
      return false;
    }

    try {
      const newApplicationDefaults = !applicationId ? buildNewApplicationDefaults() : {};
      const savedApplication = await apiRequest(
        applicationId ? `/applications/${applicationId}/` : "/applications/",
        {
          method: applicationId ? "PATCH" : "POST",
          body: JSON.stringify({
            ...newApplicationDefaults,
            current_step: goNext ? 2 : 1,
            form_data: {
              ...(newApplicationDefaults.form_data || {}),
              step_3: buildStep3Payload(),
            },
          }),
        }
      );
      if (!isAdminReview) {
        markApplicantRecordSeen("status", savedApplication);
      }

      if (goNext) {
        const savedApplicationId = savedApplication?.id || applicationId;
        navigate(
          isAdminReview
            ? `/admin/applications/${savedApplicationId}/step-2?id=${savedApplicationId}`
            : `/applications/${savedApplicationId}/edit?id=${savedApplicationId}`
        );
      }

      return savedApplication;
    } catch (err) {
      console.error("Step 3 save failed:", err);
      alert(err.message || tx("failedSaveStep1"));
      return false;
    }
  }

  async function handleSaveStep3() {
    await saveStep3({ goNext: true });
  }

  async function handleSaveDraftAndBack() {
    const saved = await saveStep3({ goNext: false });
    if (saved) {
      navigate(
        isAdminReview
          ? "/admin/applications"
          : getApplicantSaveDraftReturnPath(applicationRecord || saved)
      );
    }
  }

  const isReadOnly =
    isAdminView ||
    (!isAdminReview &&
      Boolean(applicationId) &&
      (!applicationRecord || !canEditApplicationForm(applicationRecord)));

  return (
    <Layout>
      <div className="flex gap-4">
        {StepNav && <StepNav active={1} />}

        <main className="flex-1 min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="bg-[#18b36b] text-white text-sm font-bold px-3 py-1">
                1
              </span>
              <h1 className="text-lg font-semibold text-[#1a1c1c]">
                {tx("detailsSubmittingPerson")}
              </h1>
            </div>

            {isAdminView ? (
              <AdminViewStepControls
                applicationId={applicationId}
                currentStep={1}
                language={language}
              />
            ) : isReadOnly ? (
              <UserViewStepControls
                applicationId={applicationId}
                currentStep={1}
                language={language}
              />
            ) : (
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={handleSaveDraftAndBack}
                  className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
                >
                  {tx(getApplicantSaveDraftReturnLabelKey(applicationRecord || { status: "draft" }))}
                </button>

                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={handleSaveStep3}
                    className="px-3 py-1.5 bg-[#006d32] text-white rounded text-xs font-semibold hover:bg-[#005224]"
                  >
                    {tx("saveNext")}
                  </button>
                )}
              </div>
            )}
          </div>

          <section className="bg-white border border-slate-200 rounded-sm overflow-visible">
            <ApplicationSummary
              application={applicationRecord}
              step1={applicationRecord?.form_data?.step_1 || {}}
              language={language}
            />

            <fieldset disabled={isReadOnly} className="p-5 space-y-4">
              <FormSection title={tx("organisation")} allowOverflow>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label={tx("organisationType")} required>
                    <select
                      className="spa-input"
                      value={orgType}
                      onChange={(e) => setOrgType(e.target.value)}
                    >
                      <option value="">{tx("pleaseSelect")}</option>
                      <option value="Company">{tx("company")}</option>
                      <option value="Individual">{tx("individual")}</option>
                    </select>
                  </Field>

                  <Field label={tx("registrationNumber")}>
                    <input
                      className="spa-input"
                      value={registrationNo}
                      onChange={(e) => setRegistrationNo(e.target.value)}
                    />
                  </Field>

                  <Field label={tx("name")} required className="md:col-span-2">
                    <input
                      className="spa-input"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                    />
                  </Field>

                  <Field label={tx("postalAddress")} required className="md:col-span-2">
                    <input
                      className="spa-input"
                      value={postalAddress}
                      onChange={(e) => setPostalAddress(e.target.value)}
                    />
                  </Field>

                  <Field label={tx("address2")} required className="md:col-span-2">
                    <input
                      className="spa-input"
                      value={address2}
                      onChange={(e) => setAddress2(e.target.value)}
                    />
                  </Field>

                  <div className="grid grid-cols-1 gap-4 md:col-span-2 md:grid-cols-3">
                    <Field label={tx("postcode")} required>
                      <input
                        className="spa-input"
                        value={postcode}
                        onChange={(e) => setPostcode(e.target.value)}
                      />
                    </Field>

                    <Field label={tx("city")} required>
                      <div className="relative">
                        <input
                          className="spa-input"
                          value={city}
                          autoComplete="off"
                          onChange={(e) => handleCityChange(e.target.value)}
                          onFocus={() => setShowCitySuggestions(Boolean(city.trim()))}
                          onBlur={() => setShowCitySuggestions(false)}
                        />
                        {showCitySuggestions && citySuggestions.length > 0 && (
                          <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-48 overflow-y-auto rounded border border-slate-200 bg-white shadow-lg">
                            {citySuggestions.map((cityOption) => (
                              <button
                                key={cityOption}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => selectCitySuggestion(cityOption)}
                                className="block w-full px-3 py-2 text-left text-sm text-slate-900 hover:bg-slate-50"
                              >
                                {cityOption}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </Field>

                    <Field label={tx("state")} required>
                      <select
                        className="spa-input"
                        value={stateValue}
                        onChange={(e) => handleStateChange(e.target.value)}
                      >
                        <option value="">{tx("selectState").replaceAll("-", "").trim()}</option>
                        {stateOptions.map((state) => (
                          <option key={state} value={state}>
                            {state}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:col-span-2 md:grid-cols-2">
                    <Field label={tx("countryCode")} required>
                      <select
                        className="spa-input"
                        value={orgCountryCode}
                        onChange={(e) => setOrgCountryCode(e.target.value)}
                      >
                        <option value="">{tx("select")}</option>
                        <option value="+60 Malaysia">+60 Malaysia</option>
                      </select>
                    </Field>

                    <Field label={tx("telephoneNo")} required>
                      <input
                        className="spa-input"
                        value={telephoneNo}
                        onChange={(e) => setTelephoneNo(e.target.value)}
                      />
                    </Field>
                  </div>
                </div>
              </FormSection>

              <FormSection title={tx("submittingPerson")}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label={tx("honoraryTitle")}>
                    <select
                      className="spa-input"
                      value={honoraryTitle}
                      onChange={(e) => setHonoraryTitle(e.target.value)}
                    >
                      <option value="">{tx("selectTitle")}</option>
                      {TITLE_OPTIONS.map((title) => (
                        <option key={title} value={title}>
                          {title}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label={tx("designation")} required>
                    <input
                      className="spa-input"
                      value={designation}
                      onChange={(e) => setDesignation(e.target.value)}
                    />
                  </Field>

                  <Field label={tx("fullName")} required>
                    <input
                      className="spa-input"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </Field>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label={tx("countryCode")} required>
                      <select
                        className="spa-input"
                        value={mobileCountryCode}
                        onChange={(e) => setMobileCountryCode(e.target.value)}
                      >
                        <option value="">{tx("select")}</option>
                        <option value="+60 Malaysia">+60 Malaysia</option>
                      </select>
                    </Field>

                    <Field label={tx("mobileNo")} required>
                      <input
                        className="spa-input"
                        value={mobileNo}
                        onChange={(e) => setMobileNo(e.target.value)}
                      />
                    </Field>
                  </div>

                  <Field label={tx("identityCardNo")} required>
                    <input
                      className="spa-input"
                      value={identityCardNo}
                      onChange={(e) => setIdentityCardNo(e.target.value)}
                    />
                  </Field>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label={tx("countryCode")} required>
                      <select
                        className="spa-input"
                        value={officeCountryCode}
                        onChange={(e) => setOfficeCountryCode(e.target.value)}
                      >
                        <option value="">{tx("select")}</option>
                        <option value="+60 Malaysia">+60 Malaysia</option>
                      </select>
                    </Field>

                    <Field label={tx("officeNo")} required>
                      <input
                        className="spa-input"
                        value={officeNo}
                        onChange={(e) => setOfficeNo(e.target.value)}
                      />
                    </Field>
                  </div>

                  <Field label={tx("email")} required>
                    <input
                      type="email"
                      className="spa-input"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </Field>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label={tx("countryCode")}>
                      <select
                        className="spa-input"
                        value={faxCountryCode}
                        onChange={(e) => setFaxCountryCode(e.target.value)}
                      >
                        <option value="">{tx("select")}</option>
                        <option value="+60 Malaysia">+60 Malaysia</option>
                      </select>
                    </Field>

                    <Field label={tx("faxNo")}>
                      <input
                        className="spa-input"
                        placeholder={tx("faxPlaceholder")}
                        value={faxNo}
                        onChange={(e) => setFaxNo(e.target.value)}
                      />
                    </Field>
                  </div>
                </div>
              </FormSection>

              {isAdminView ? (
                <AdminViewStepControls
                  applicationId={applicationId}
                  currentStep={1}
                  language={language}
                  className="pt-2"
                />
              ) : isReadOnly ? (
                <UserViewStepControls
                  applicationId={applicationId}
                  currentStep={1}
                  language={language}
                  className="pt-2"
                />
              ) : (
                <div className="flex flex-wrap justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleSaveDraftAndBack}
                    className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
                  >
                    {tx(getApplicantSaveDraftReturnLabelKey(applicationRecord || { status: "draft" }))}
                  </button>

                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={handleSaveStep3}
                      className="px-3 py-1.5 bg-[#006d32] text-white rounded text-xs font-semibold hover:bg-[#005224]"
                    >
                      {tx("saveNext")}
                    </button>
                  )}
                </div>
              )}
            </fieldset>
          </section>
        </main>
      </div>
    </Layout>
  );
}

function FormSection({ title, children, allowOverflow = false }) {
  return (
    <section
      className={`border border-slate-200 rounded-sm ${
        allowOverflow ? "overflow-visible" : "overflow-hidden"
      }`}
    >
      <div className="bg-[#f7f7f7] border-b px-3 py-2">
        <h2 className="text-xs font-bold text-slate-700">{title}</h2>
      </div>

      <div className="p-4">{children}</div>
    </section>
  );
}

function Field({ label, children, required = false, className = "" }) {
  return (
    <div className={className}>
      <label className="block text-[11px] font-bold text-slate-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>

      {children}
    </div>
  );
}

export default SubmittingPersonPage;
