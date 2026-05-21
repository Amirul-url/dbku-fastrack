import { useEffect, useState } from "react";
import UserDashboardLayout from "../../../../layout/UserDashboardLayout";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useLanguage } from "../../../../context/LanguageContext";
import { apiRequest } from "../../../../services/api";
import {
  canEditApplicationForm,
  formatWorkflowStatus,
  getApplicantDisplayStatus,
} from "../../../../utils/workflow";
import {
  applicationStatusLabel,
  applicationTypeLabel,
  readOnlyMessage,
  stepText,
} from "./ApplicationStepText";
import AdminViewStepControls from "./AdminViewStepControls";
import UserViewStepControls from "./UserViewStepControls";

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
  const adminStepPath = (step) =>
    `/admin/applications/${applicationId}${isAdminView ? "/view" : ""}/step-${step}?id=${applicationId}`;

  const [orgType, setOrgType] = useState("");
  const [registrationNo, setRegistrationNo] = useState("");
  const [orgName, setOrgName] = useState("");
  const [branchName, setBranchName] = useState("");
  const [postalAddress, setPostalAddress] = useState("");
  const [postcode, setPostcode] = useState("");
  const [address2, setAddress2] = useState("");
  const [stateValue, setStateValue] = useState("");
  const [city, setCity] = useState("");
  const [address3, setAddress3] = useState("");
  const [orgCountryCode, setOrgCountryCode] = useState("");
  const [telephoneNo, setTelephoneNo] = useState("");
  const [address4, setAddress4] = useState("");

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
      setBranchName(step3.branch_name || "");
      setPostalAddress(step3.postal_address || "");
      setPostcode(step3.postcode || "");
      setAddress2(step3.address_2 || "");
      setStateValue(step3.state || "");
      setCity(step3.city || "");
      setAddress3(step3.address_3 || "");
      setOrgCountryCode(step3.org_country_code || "");
      setTelephoneNo(step3.telephone_no || "");
      setAddress4(step3.address_4 || "");

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

  function buildStep3Payload() {
    return {
      org_type: orgType,
      registration_no: registrationNo,
      org_name: orgName,
      branch_name: branchName,
      postal_address: postalAddress,
      postcode,
      address_2: address2,
      state: stateValue,
      city,
      address_3: address3,
      org_country_code: orgCountryCode,
      telephone_no: telephoneNo,
      address_4: address4,

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

  async function saveStep3({ goNext = false } = {}) {
    if (isReadOnly) return;

    if (goNext && (
      !orgType.trim() ||
      !orgName.trim() ||
      !postalAddress.trim() ||
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

    if (!applicationId || isNaN(applicationId)) {
      alert(tx("missingApplication"));
      return false;
    }

    try {
      await apiRequest(`/applications/${applicationId}/`, {
        method: "PATCH",
        body: JSON.stringify({
          current_step: goNext ? 3 : 2,
          form_data: {
            step_3: buildStep3Payload(),
          },
        }),
      });

      if (goNext) {
        navigate(
          isAdminReview
            ? adminStepPath(3)
            : `/applications/${applicationId}/supporting-document?id=${applicationId}`
        );
      }

      return true;
    } catch (err) {
      console.error("Step 3 save failed:", err);
      alert(err.message || tx("failedSaveStep2"));
      return false;
    }
  }

  async function handleSaveStep3() {
    await saveStep3({ goNext: true });
  }

  async function handleSaveDraftAndBack() {
    const saved = await saveStep3({ goNext: false });
    if (saved) {
      navigate(isAdminReview ? "/admin/applications" : "/user/dashboard?tab=applications");
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
        {StepNav && <StepNav active={2} />}

        <main className="flex-1 min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="bg-[#18b36b] text-white text-sm font-bold px-3 py-1">
                2
              </span>
              <h1 className="text-lg font-semibold text-[#1a1c1c]">
                {tx("detailsSubmittingPerson")}
              </h1>
            </div>

            {isAdminView ? (
              <AdminViewStepControls
                applicationId={applicationId}
                currentStep={2}
                language={language}
              />
            ) : isReadOnly ? (
              <UserViewStepControls
                applicationId={applicationId}
                currentStep={2}
                language={language}
              />
            ) : (
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={handleSaveDraftAndBack}
                  className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
                >
                  {tx("saveDraftBackApplications")}
                </button>

                <Link
                  to={
                    isAdminReview
                      ? adminStepPath(1)
                      : `/applications/${applicationId}/edit?id=${applicationId}`
                  }
                  className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
                >
                  {tx("previous")}
                </Link>

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

          <section className="bg-white border border-slate-200 rounded-sm overflow-hidden">
            <ApplicationReference language={language} />

            {isReadOnly && (
              <ReadOnlyNotice language={language} status={applicationRecord?.status} />
            )}

            <fieldset disabled={isReadOnly} className="p-5 space-y-4">
              <FormSection title={tx("organisation")}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label={tx("organisationType")} required>
                    <select
                      className="spa-input"
                      value={orgType}
                      onChange={(e) => setOrgType(e.target.value)}
                    >
                      <option value="">{tx("pleaseSelect")}</option>
                      <option value="Local Authority">{tx("localAuthority")}</option>
                      <option value="Company">{tx("company")}</option>
                      <option value="Government Agency">{tx("governmentAgency")}</option>
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

                  <Field label={tx("name")} required>
                    <input
                      className="spa-input"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                    />
                  </Field>

                  <Field label={tx("branchName")}>
                    <input
                      className="spa-input"
                      value={branchName}
                      onChange={(e) => setBranchName(e.target.value)}
                    />
                  </Field>

                  <Field label={tx("postalAddress")} required>
                    <input
                      className="spa-input"
                      value={postalAddress}
                      onChange={(e) => setPostalAddress(e.target.value)}
                    />
                  </Field>

                  <Field label={tx("postcode")} required>
                    <input
                      className="spa-input"
                      value={postcode}
                      onChange={(e) => setPostcode(e.target.value)}
                    />
                  </Field>

                  <Field label={tx("address2")}>
                    <input
                      className="spa-input"
                      value={address2}
                      onChange={(e) => setAddress2(e.target.value)}
                    />
                  </Field>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label={tx("state")} required>
                      <input
                        className="spa-input"
                        value={stateValue}
                        onChange={(e) => setStateValue(e.target.value)}
                      />
                    </Field>

                    <Field label={tx("city")} required>
                      <input
                        className="spa-input"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                      />
                    </Field>
                  </div>

                  <Field label={tx("address3")}>
                    <input
                      className="spa-input"
                      value={address3}
                      onChange={(e) => setAddress3(e.target.value)}
                    />
                  </Field>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

                  <Field label={tx("address4")}>
                    <input
                      className="spa-input"
                      value={address4}
                      onChange={(e) => setAddress4(e.target.value)}
                    />
                  </Field>
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
                  currentStep={2}
                  language={language}
                  className="pt-2"
                />
              ) : isReadOnly ? (
                <UserViewStepControls
                  applicationId={applicationId}
                  currentStep={2}
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
                    {tx("saveDraftBackApplications")}
                  </button>

                  <Link
                    to={
                      isAdminReview
                        ? adminStepPath(1)
                        : `/applications/${applicationId}/edit?id=${applicationId}`
                    }
                    className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
                  >
                    {tx("previous")}
                  </Link>

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

function ReadOnlyNotice({ language, status }) {
  const displayStatus = getApplicantDisplayStatus(status);

  return (
    <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
      {readOnlyMessage(language, applicationStatusLabel(language, formatWorkflowStatus(displayStatus)))}
    </div>
  );
}

function ApplicationReference({ language }) {
  const storedUser = localStorage.getItem("fastrack_user");
  const user = storedUser ? JSON.parse(storedUser) : null;
  const tx = (key) => stepText(language, key);

  return (
    <div className="bg-[#f5f5f5] border-b border-slate-200 px-4 py-3 text-xs">
      <div className="grid grid-cols-[140px_1fr] gap-y-1">
        {user?.role !== "applicant" && (
          <>
            <p>{tx("digitalReference")}</p>
            <p className="font-semibold text-[#006d32]">E.SPA.2025-1443</p>

            <p>{tx("agencyReference")}</p>
            <p className="font-semibold text-[#006d32]">SP/1D/159/2024</p>
          </>
        )}

        <p>{tx("status")}</p>
        <p className="font-semibold text-[#006d32]">{tx("prepareCase")}</p>

        <p>{tx("applicationType")}</p>
        <p className="font-semibold text-[#006d32]">
          {applicationTypeLabel(language, "Application of Siting Project")}
        </p>

        {user?.role !== "applicant" && (
          <>
            <p>{tx("division")}</p>
            <p className="font-semibold text-[#006d32]">KUCHING</p>
          </>
        )}
      </div>
    </div>
  );
}

function FormSection({ title, children }) {
  return (
    <section className="border border-slate-200 rounded-sm overflow-hidden">
      <div className="bg-[#f7f7f7] border-b px-3 py-2">
        <h2 className="text-xs font-bold text-slate-700">{title}</h2>
      </div>

      <div className="p-4">{children}</div>
    </section>
  );
}

function Field({ label, children, required = false }) {
  return (
    <div>
      <label className="block text-[11px] font-bold text-slate-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>

      {children}
    </div>
  );
}

export default SubmittingPersonPage;
