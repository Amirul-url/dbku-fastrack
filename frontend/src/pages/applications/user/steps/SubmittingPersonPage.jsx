import { useEffect, useRef, useState } from "react";
import UserDashboardLayout from "../../../../layout/UserDashboardLayout";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useLanguage } from "../../../../context/LanguageContext";
import {
  apiRequest,
  fetchAuthenticatedBlob,
  uploadApplicationDocument,
} from "../../../../services/api";
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
const STEP_3_DOCUMENT_MAX_FILE_SIZE = 15 * 1024 * 1024;

function isValidStep3DocumentFile(file, tx) {
  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  if (!isPdf) {
    alert(tx("pdfOnlyAlert"));
    return false;
  }

  if (file.size > STEP_3_DOCUMENT_MAX_FILE_SIZE) {
    alert(tx("fileSize5MbAlert"));
    return false;
  }

  return true;
}

function toUpperText(value) {
  return String(value || "").toLocaleUpperCase("en-MY");
}

function getCityOption(value) {
  const normalized = String(value || "").trim().toLowerCase();

  return allCityOptions.find((cityOption) => cityOption.toLowerCase() === normalized) || "";
}

function normalizeStateCity(state, city) {
  if (stateCityOptions[state]) {
    const matchedCity = getCityOption(city);

    return {
      state,
      city: matchedCity && stateCityOptions[state].includes(matchedCity) ? matchedCity : "",
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
  const uploadApplicationPromiseRef = useRef(null);

  const applicationIdRaw =
    routeApplicationId || location.state?.applicationId || queryParams.get("id");

  const applicationId = applicationIdRaw ? Number(applicationIdRaw) : null;

  const Layout = LayoutComponent;
  const StepNav = StepNavComponent;
  const isAdminView = mode === "admin-view";
  const isAdminReview = mode === "admin" || isAdminView;

  const [orgType, setOrgType] = useState("Company");
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
  const [workingApplicationId, setWorkingApplicationId] = useState(null);
  const [letterAppointmentDocument, setLetterAppointmentDocument] = useState(null);
  const [lhdnDocument, setLhdnDocument] = useState(null);
  const [uploadingDocumentKey, setUploadingDocumentKey] = useState("");
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const citySearchTerm = city.trim().toLowerCase();
  const citySuggestions =
    citySearchTerm.length >= 2
      ? allCityOptions
          .filter((cityOption) => cityOption.toLowerCase().includes(citySearchTerm))
          .slice(0, 8)
      : [];
  const currentApplicationId = applicationId || workingApplicationId;

  useEffect(() => {
    if (currentApplicationId) {
      // eslint-disable-next-line react-hooks/immutability
      loadStep3();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentApplicationId]);

  async function loadStep3() {
    try {
      const data = await apiRequest(`/applications/${currentApplicationId}/`);
      const step3 = data.form_data?.step_3 || {};

      setApplicationRecord(data);
      setOrgType(step3.org_type || "Company");
      setRegistrationNo(toUpperText(step3.registration_no));
      setOrgName(toUpperText(step3.org_name));
      setPostalAddress(toUpperText(step3.postal_address));
      setPostcode(toUpperText(step3.postcode));
      setAddress2(toUpperText(step3.address_2));
      const normalizedLocation = normalizeStateCity(step3.state || "", step3.city || "");
      setStateValue(normalizedLocation.state);
      setCity(toUpperText(normalizedLocation.city));
      setOrgCountryCode(step3.org_country_code || "");
      setTelephoneNo(toUpperText(step3.telephone_no));

      setHonoraryTitle(step3.honorary_title || "");
      setDesignation(toUpperText(step3.designation));
      setFullName(toUpperText(step3.full_name));
      setMobileCountryCode(step3.mobile_country_code || "");
      setMobileNo(toUpperText(step3.mobile_no));
      setIdentityCardNo(toUpperText(step3.identity_card_no));
      setOfficeCountryCode(step3.office_country_code || "");
      setOfficeNo(toUpperText(step3.office_no));
      setEmail(step3.email || "");
      setFaxCountryCode(step3.fax_country_code || "");
      setFaxNo(toUpperText(step3.fax_no));
      setLetterAppointmentDocument(step3.letter_appointment_document || null);
      setLhdnDocument(step3.lhdn_document || null);
    } catch (err) {
      console.error("Load Step 3 failed:", err);
    }
  }

  function handleStateChange(value) {
    const selectedCity = getCityOption(city);

    setStateValue(value);
    setCity(value && stateCityOptions[value]?.includes(selectedCity) ? toUpperText(selectedCity) : "");
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

    setCity(toUpperText(matchedCity || value));
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
      org_type: orgType || "Company",
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
      letter_appointment_document: letterAppointmentDocument,
      lhdn_document: lhdnDocument,
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
      !registrationNo.trim() ||
      !orgName.trim() ||
      !postalAddress.trim() ||
      !address2.trim() ||
      !postcode.trim() ||
      !stateValue.trim() ||
      !city.trim() ||
      !orgCountryCode.trim() ||
      !telephoneNo.trim() ||
      !honoraryTitle.trim() ||
      !designation.trim() ||
      !fullName.trim() ||
      !mobileCountryCode.trim() ||
      !mobileNo.trim() ||
      !identityCardNo.trim() ||
      !officeCountryCode.trim() ||
      !officeNo.trim() ||
      !email.trim() ||
      !faxCountryCode.trim() ||
      !faxNo.trim() ||
      !letterAppointmentDocument?.document_id ||
      !lhdnDocument?.document_id
    )) {
      alert(tx("requiredAlert"));
      return false;
    }

    try {
      const newApplicationDefaults = !currentApplicationId ? buildNewApplicationDefaults() : {};
      const savedApplication = await apiRequest(
        currentApplicationId ? `/applications/${currentApplicationId}/` : "/applications/",
        {
          method: currentApplicationId ? "PATCH" : "POST",
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
      setApplicationRecord(savedApplication);
      setWorkingApplicationId(savedApplication?.id || currentApplicationId);
      if (!isAdminReview) {
        markApplicantRecordSeen("status", savedApplication);
      }

      if (goNext) {
        const savedApplicationId = savedApplication?.id || currentApplicationId;
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

  async function ensureApplicationForUpload() {
    if (currentApplicationId) return currentApplicationId;
    if (uploadApplicationPromiseRef.current) return uploadApplicationPromiseRef.current;

    const defaults = buildNewApplicationDefaults();

    uploadApplicationPromiseRef.current = apiRequest("/applications/", {
      method: "POST",
      body: JSON.stringify({
        ...defaults,
        current_step: 1,
        form_data: {
          ...defaults.form_data,
          step_3: buildStep3Payload(),
        },
      }),
    })
      .then((savedApplication) => {
        const savedApplicationId = savedApplication?.id;

        if (!savedApplicationId) {
          throw new Error(tx("missingApplication"));
        }

        setApplicationRecord(savedApplication);
        setWorkingApplicationId(savedApplicationId);
        navigate(`/applications/${savedApplicationId}/submitting-person?id=${savedApplicationId}`, { replace: true });

        return savedApplicationId;
      })
      .finally(() => {
        uploadApplicationPromiseRef.current = null;
      });

    return uploadApplicationPromiseRef.current;
  }

  async function handleStep3DocumentChange(key, file) {
    if (isReadOnly || !file) return;
    if (!isValidStep3DocumentFile(file, tx)) return;

    try {
      setUploadingDocumentKey(key);
      const uploadApplicationId = await ensureApplicationForUpload();
      const title = key === "letter"
        ? tx("letterAppointmentDocument")
        : tx("lhdnDocument");
      const attachment = await uploadApplicationDocument(uploadApplicationId, title, file);

      if (key === "letter") {
        setLetterAppointmentDocument(attachment);
      } else {
        setLhdnDocument(attachment);
      }
    } catch (err) {
      console.error("Step 3 document upload failed:", err);
      alert(err.message || tx("failedUpload"));
    } finally {
      setUploadingDocumentKey("");
    }
  }

  function removeStep3Document(key) {
    if (isReadOnly) return;

    if (key === "letter") {
      setLetterAppointmentDocument(null);
    } else {
      setLhdnDocument(null);
    }
  }

  const isReadOnly =
    isAdminView ||
    (!isAdminReview &&
      Boolean(currentApplicationId) &&
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
              <FormSection title={tx("detailsOfCompany")} allowOverflow>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label={tx("nameOfCompany")} required>
                    <input
                      className="spa-input uppercase"
                      value={orgName}
                      onChange={(e) => setOrgName(toUpperText(e.target.value))}
                    />
                  </Field>

                  <Field label={tx("registrationNumber")} required>
                    <input
                      className="spa-input uppercase"
                      value={registrationNo}
                      onChange={(e) => setRegistrationNo(toUpperText(e.target.value))}
                    />
                  </Field>

                  <Field label={tx("postalAddress")} required className="md:col-span-2">
                    <input
                      className="spa-input uppercase"
                      value={postalAddress}
                      onChange={(e) => setPostalAddress(toUpperText(e.target.value))}
                    />
                  </Field>

                  <Field label={tx("address2")} required className="md:col-span-2">
                    <input
                      className="spa-input uppercase"
                      value={address2}
                      onChange={(e) => setAddress2(toUpperText(e.target.value))}
                    />
                  </Field>

                  <div className="grid grid-cols-1 gap-4 md:col-span-2 md:grid-cols-3">
                    <Field label={tx("postcode")} required>
                      <input
                        className="spa-input uppercase"
                        value={postcode}
                        onChange={(e) => setPostcode(toUpperText(e.target.value))}
                      />
                    </Field>

                    <Field label={tx("city")} required>
                      <div className="relative">
                        <input
                          className="spa-input uppercase"
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
                                className="block w-full px-3 py-2 text-left text-sm uppercase text-slate-900 hover:bg-slate-50"
                              >
                                {toUpperText(cityOption)}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </Field>

                    <Field label={tx("state")} required>
                      <select
                        className="spa-input uppercase"
                        value={stateValue}
                        onChange={(e) => handleStateChange(e.target.value)}
                      >
                        <option value="">{toUpperText(tx("selectState").replaceAll("-", "").trim())}</option>
                        {stateOptions.map((state) => (
                          <option key={state} value={state}>
                            {toUpperText(state)}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:col-span-2 md:grid-cols-2">
                    <Field label={tx("countryCode")} required>
                      <select
                        className="spa-input uppercase"
                        value={orgCountryCode}
                        onChange={(e) => setOrgCountryCode(e.target.value)}
                      >
                        <option value="">{toUpperText(tx("select"))}</option>
                        <option value="+60 Malaysia">+60 MALAYSIA</option>
                      </select>
                    </Field>

                    <Field label={tx("telephoneNo")} required>
                      <input
                        className="spa-input uppercase"
                        value={telephoneNo}
                        onChange={(e) => setTelephoneNo(toUpperText(e.target.value))}
                      />
                    </Field>
                  </div>
                </div>
              </FormSection>

              <FormSection title={tx("submittingPerson")}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label={tx("honoraryTitle")} required>
                    <select
                      className="spa-input uppercase"
                      value={honoraryTitle}
                      onChange={(e) => setHonoraryTitle(e.target.value)}
                    >
                      <option value="">{toUpperText(tx("selectTitle"))}</option>
                      {TITLE_OPTIONS.map((title) => (
                        <option key={title} value={title}>
                          {toUpperText(title)}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label={tx("designation")} required>
                    <input
                      className="spa-input uppercase"
                      value={designation}
                      onChange={(e) => setDesignation(toUpperText(e.target.value))}
                    />
                  </Field>

                  <Field label={tx("fullName")} required>
                    <input
                      className="spa-input uppercase"
                      value={fullName}
                      onChange={(e) => setFullName(toUpperText(e.target.value))}
                    />
                  </Field>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label={tx("countryCode")} required>
                      <select
                        className="spa-input uppercase"
                        value={mobileCountryCode}
                        onChange={(e) => setMobileCountryCode(e.target.value)}
                      >
                        <option value="">{toUpperText(tx("select"))}</option>
                        <option value="+60 Malaysia">+60 MALAYSIA</option>
                      </select>
                    </Field>

                    <Field label={tx("mobileNo")} required>
                      <input
                        className="spa-input uppercase"
                        value={mobileNo}
                        onChange={(e) => setMobileNo(toUpperText(e.target.value))}
                      />
                    </Field>
                  </div>

                  <Field label={tx("identityCardNo")} required>
                    <input
                      className="spa-input uppercase"
                      value={identityCardNo}
                      onChange={(e) => setIdentityCardNo(toUpperText(e.target.value))}
                    />
                  </Field>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label={tx("countryCode")} required>
                      <select
                        className="spa-input uppercase"
                        value={officeCountryCode}
                        onChange={(e) => setOfficeCountryCode(e.target.value)}
                      >
                        <option value="">{toUpperText(tx("select"))}</option>
                        <option value="+60 Malaysia">+60 MALAYSIA</option>
                      </select>
                    </Field>

                    <Field label={tx("officeNo")} required>
                      <input
                        className="spa-input uppercase"
                        value={officeNo}
                        onChange={(e) => setOfficeNo(toUpperText(e.target.value))}
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
                    <Field label={tx("countryCode")} required>
                      <select
                        className="spa-input uppercase"
                        value={faxCountryCode}
                        onChange={(e) => setFaxCountryCode(e.target.value)}
                      >
                        <option value="">{toUpperText(tx("select"))}</option>
                        <option value="+60 Malaysia">+60 MALAYSIA</option>
                      </select>
                    </Field>

                    <Field label={tx("faxNo")} required>
                      <input
                        className="spa-input uppercase"
                        placeholder={tx("faxPlaceholder")}
                        value={faxNo}
                        onChange={(e) => setFaxNo(toUpperText(e.target.value))}
                      />
                    </Field>
                  </div>
                </div>
              </FormSection>

              <FormSection title={tx("applicantRequiredDocuments")}>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <DocumentUploadField
                    label={tx("letterAppointmentDocument")}
                    helpText={tx("letterAppointmentHelp")}
                    attachment={letterAppointmentDocument}
                    required
                    readOnly={isReadOnly}
                    uploading={uploadingDocumentKey === "letter"}
                    tx={tx}
                    onFileChange={(file) => handleStep3DocumentChange("letter", file)}
                    onRemove={() => removeStep3Document("letter")}
                  />

                  <DocumentUploadField
                    label={tx("lhdnDocument")}
                    helpText={tx("lhdnDocumentHelp")}
                    attachment={lhdnDocument}
                    required
                    readOnly={isReadOnly}
                    uploading={uploadingDocumentKey === "lhdn"}
                    tx={tx}
                    onFileChange={(file) => handleStep3DocumentChange("lhdn", file)}
                    onRemove={() => removeStep3Document("lhdn")}
                  />
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

async function printAttachmentUrlDocument(url, title) {
  const originalTitle = document.title;
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.setAttribute("aria-hidden", "true");

  const cleanup = () => {
    document.title = originalTitle;
    setTimeout(() => iframe.remove(), 500);
  };

  document.body.appendChild(iframe);
  document.title = title;

  await new Promise((resolve, reject) => {
    iframe.onload = resolve;
    iframe.onerror = reject;
    iframe.src = url;
  });
  await new Promise((resolve) => setTimeout(resolve, 500));

  const frameWindow = iframe.contentWindow;
  if (!frameWindow) {
    cleanup();
    throw new Error("Unable to prepare print document.");
  }

  frameWindow.addEventListener("afterprint", cleanup, { once: true });
  setTimeout(cleanup, 120000);
  frameWindow.focus();
  frameWindow.print();
}

function DocumentUploadField({
  label,
  helpText,
  attachment,
  required = false,
  readOnly = false,
  uploading = false,
  tx,
  onFileChange,
  onRemove,
}) {
  const [downloading, setDownloading] = useState(false);
  const attachmentUrl = attachment?.url || attachment?.file_url || attachment?.dataUrl;

  async function handleDownload() {
    if (!attachmentUrl || downloading) return;

    try {
      setDownloading(true);

      const blob =
        attachmentUrl.startsWith("blob:") || attachmentUrl.startsWith("data:")
          ? await fetch(attachmentUrl).then((response) => response.blob())
          : await fetchAuthenticatedBlob(attachmentUrl);
      const objectUrl = URL.createObjectURL(blob);
      await printAttachmentUrlDocument(objectUrl, attachment?.name || label || "attachment");
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5 * 60 * 1000);
    } catch (error) {
      console.error("Failed to download attachment:", error);
      alert(tx("failedDownload"));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Field label={label} required={required}>
      <div className="rounded border border-slate-200 bg-slate-50 p-3">
        {helpText && (
          <p className="mb-2 text-[11px] leading-5 text-slate-600">{helpText}</p>
        )}

        {attachment ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-emerald-700">
                {attachment.name || attachment.title || tx("attachment")}
              </p>
              {attachment.size && (
                <p className="text-[11px] text-slate-500">
                  {(Number(attachment.size || 0) / 1024).toFixed(1)} KB
                </p>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownload}
                disabled={!attachmentUrl || downloading}
                className="rounded border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {downloading ? tx("downloading") : tx("download")}
              </button>

              {!readOnly && (
              <button
                type="button"
                onClick={onRemove}
                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                {tx("removeFile")}
              </button>
              )}
            </div>
          </div>
        ) : (
          <p className="mb-2 text-[11px] text-slate-500">{tx("noAttachment")}</p>
        )}

        {!readOnly && (
          <label
            className={`mt-2 inline-flex min-h-9 items-center justify-center rounded px-3 py-1.5 text-xs font-semibold text-white ${
              uploading
                ? "cursor-not-allowed bg-slate-400"
                : "cursor-pointer bg-[#006d32] hover:bg-[#005224]"
            }`}
          >
            {uploading ? tx("uploading") : tx("upload")}
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                onFileChange?.(file);
              }}
            />
          </label>
        )}

        <p className="mt-2 text-[11px] text-slate-500">{tx("attachmentMaxSize")}</p>
      </div>
    </Field>
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
