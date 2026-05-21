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
  documentDescription,
  documentTitle,
  organisationTypeLabel,
  readOnlyMessage,
  stepText,
} from "./ApplicationStepText";
import AdminViewStepControls from "./AdminViewStepControls";
import UserViewStepControls from "./UserViewStepControls";

const TITLE_DOCUMENT_NAME = "Extract of Document of Titles of the Land";
const PRINT_FORM_TOTAL_PAGES = 3;

function PrintFormPage({
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
  const applicationId = routeApplicationId || queryParams.get("id");
  const Layout = LayoutComponent;
  const StepNav = StepNavComponent;
  const isAdminView = mode === "admin-view";
  const isAdminReview = mode === "admin" || isAdminView;
  const adminStepPath = (step) =>
    `/admin/applications/${applicationId}${isAdminView ? "/view" : ""}/step-${step}?id=${applicationId}`;

  const [step1, setStep1] = useState({});
  const [step3, setStep3] = useState({});
  const [step10, setStep10] = useState({});
  const [step11, setStep11] = useState({});
  const [step9, setStep9] = useState({
    title: "Print Form",
    status: "Draft",
    printed: false,
    printed_at: "",
    saved_at: "",
    submitted_at: "",
  });
  const [saving, setSaving] = useState(false);
  const [applicationRecord, setApplicationRecord] = useState(null);
  const [activePrintPage, setActivePrintPage] = useState(1);

  useEffect(() => {
    document.title = tx("generatedFormTitle");

    if (applicationId) {
      // eslint-disable-next-line react-hooks/immutability
      loadApplication();
    }

    return () => {
      document.title = "ALiS";
    };
  }, [applicationId, language]);

  async function loadApplication() {
    try {
      const data = await apiRequest(`/applications/${applicationId}/`);
      const formData = data.form_data || {};

      setApplicationRecord(data);
      setStep1(formData.step_1 || {});
      setStep3(formData.step_3 || {});
      setStep10(formData.step_10 || {});
      setStep11(formData.step_11 || {});
      setStep9({
        title: "Print Form",
        status: formData.step_9?.status || "Draft",
        printed: formData.step_9?.printed || false,
        printed_at: formData.step_9?.printed_at || "",
        saved_at: formData.step_9?.saved_at || "",
        submitted_at: formData.step_9?.submitted_at || "",
      });
    } catch (err) {
      console.error("Load print form failed:", err);
    }
  }

  async function saveStep9({ printed = false, submit = false } = {}) {
    if (isReadOnly && submit) return false;

    if (!applicationId) {
      alert(tx("missingApplication"));
      return false;
    }

    try {
      setSaving(true);

      const now = new Date().toISOString();

      const updatedStep9 = {
        ...step9,
        title: "Print Form",
        status: submit ? "Submitted" : printed || step9.printed ? "Generated" : "Saved",
        printed: printed || step9.printed || false,
        printed_at: printed ? now : step9.printed_at || "",
        saved_at: now,
        submitted_at: submit ? now : step9.submitted_at || "",
      };

      await apiRequest(`/applications/${applicationId}/`, {
        method: "PATCH",
        body: JSON.stringify({
          current_step: 5,
          status: submit ? "submitted" : undefined,
          form_data: {
            step_9: updatedStep9,
            step_11: {
              ...step11,
              submitted: submit ? true : step11.submitted || false,
              submitted_at: submit ? now : step11.submitted_at || "",
            },
          },
        }),
      });

      setStep9(updatedStep9);
      return true;
    } catch (err) {
      console.error("Print form save failed:", err);
      alert(tx("failedSavePrint"));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handlePrint() {
    if (!isReadOnly) {
      const saved = await saveStep9({ printed: true });
      if (!saved) return;
    }

    const previousTitle = document.title;
    document.title = tx("generatedFormTitle");

    setTimeout(() => {
      window.print();

      setTimeout(() => {
        document.title = previousTitle || tx("generatedFormTitle");
      }, 500);
    }, 100);
  }

  async function handleSubmitApplication() {
    if (isReadOnly) return;

    const saved = await saveStep9({ submit: true });
    if (saved) {
      navigate(isAdminReview ? "/admin/applications" : "/user/dashboard");
    }
  }

  async function handleSaveDraftAndBack() {
    if (isReadOnly) return;

    const saved = await saveStep9();
    if (saved) {
      navigate(isAdminReview ? "/admin/applications" : "/user/dashboard?tab=applications");
    }
  }

  const savedRequiredDocuments = Array.isArray(step10.documents) ? step10.documents : [];
  const legacyTitleDocuments = Array.isArray(step10.title_documents)
    ? step10.title_documents
    : [];
  const requiredDocuments = mergeRequiredDocuments(
    savedRequiredDocuments,
    legacyTitleDocuments
  );
  const otherDocuments = Array.isArray(step10.other_documents)
    ? step10.other_documents
    : [];
  const isReadOnly =
    isAdminView ||
    (!isAdminReview &&
      Boolean(applicationId) &&
      (!applicationRecord || !canEditApplicationForm(applicationRecord)));

  return (
    <Layout>
      <style>
        {`
          .print-page-preview-hidden {
            display: none;
          }

          @media print {
            html,
            body {
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              width: auto !important;
              min-height: auto !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }

            body * {
              visibility: hidden !important;
            }

            #print-form-area,
            #print-form-area * {
              visibility: visible !important;
            }

            #print-form-area {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 210mm !important;
              min-height: auto !important;
              margin: 0 !important;
              padding: 0 !important;
              box-shadow: none !important;
              border: none !important;
              overflow: visible !important;
              background: transparent !important;
              box-sizing: border-box !important;
              display: block !important;
              gap: 0 !important;
            }

            .print-page {
              width: 210mm !important;
              height: 297mm !important;
              min-height: 297mm !important;
              max-height: 297mm !important;
              margin: 0 !important;
              padding: 14mm 14mm 12mm 14mm !important;
              box-shadow: none !important;
              display: flex !important;
              flex-direction: column !important;
              break-after: page !important;
              page-break-after: always !important;
              break-inside: avoid !important;
              page-break-inside: avoid !important;
              background: #ffffff !important;
              box-sizing: border-box !important;
            }

            .print-page-body {
              flex: 1 1 auto !important;
            }

            .print-page-footer {
              margin-top: auto !important;
            }

            .print-page-preview-hidden {
              display: flex !important;
            }

            .print-page:last-child {
              break-after: auto !important;
              page-break-after: auto !important;
            }

            .print-avoid-break {
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }

            .print-hide {
              display: none !important;
            }

            @page {
              size: A4 portrait;
              margin: 0;
            }
          }
        `}
      </style>

      <div className="flex gap-4">
        {StepNav && <StepNav active={5} />}

        <main className="flex-1 min-w-0">
          <div className="mb-3 flex items-center justify-between print-hide">
            <div className="flex items-center gap-2">
              <span className="bg-[#18b36b] text-white text-sm font-bold px-3 py-1">
                5
              </span>
              <h1 className="text-lg font-semibold text-[#1a1c1c]">
                {tx("printForm")}
              </h1>
            </div>

            {isAdminView ? (
              <AdminViewStepControls
                applicationId={applicationId}
                currentStep={5}
                language={language}
              />
            ) : isReadOnly ? (
              <UserViewStepControls
                applicationId={applicationId}
                currentStep={5}
                language={language}
              />
            ) : (
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={handleSaveDraftAndBack}
                  disabled={saving}
                  className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
                >
                  {saving ? tx("saving") : tx("saveDraftBackApplications")}
                </button>

                <Link
                  to={
                    isAdminReview
                      ? adminStepPath(4)
                      : `/applications/${applicationId}/declaration?id=${applicationId}`
                  }
                  className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
                >
                  {tx("previous")}
                </Link>

                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={handleSubmitApplication}
                    disabled={saving}
                    className="px-3 py-1.5 bg-[#006d32] text-white rounded text-xs font-semibold hover:bg-[#005224] disabled:opacity-60"
                  >
                    {saving ? tx("submitting") : tx("saveSubmit")}
                  </button>
                )}
              </div>
            )}
          </div>

          <section className="bg-white border border-slate-200 rounded-sm overflow-hidden">
            <div className="print-hide">
              <ApplicationReference step1={step1} language={language} />
            </div>

            {isReadOnly && (
              <div className="print-hide">
                <ReadOnlyNotice language={language} status={applicationRecord?.status} />
              </div>
            )}

            <div className="p-5 border-b border-slate-200 print-hide">
              <div className="bg-[#f7f7f7] border border-slate-200 p-4 text-sm text-slate-600">
                {tx("reviewGeneratedForm")}
              </div>

              <div className="flex flex-wrap gap-3 mt-4">
                <button
                  type="button"
                  onClick={handlePrint}
                  disabled={saving}
                  className="px-4 py-2 bg-[#006d32] text-white rounded text-sm font-semibold hover:bg-[#005224] disabled:opacity-60"
                >
                  {saving ? tx("saving") : tx("printSavePdf")}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActivePrintPage((page) => Math.max(1, page - 1))}
                    disabled={activePrintPage === 1}
                    className="h-9 w-9 border border-slate-300 rounded text-base font-bold hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Previous print page"
                  >
                    {"<"}
                  </button>
                  <span className="text-sm font-semibold text-slate-700">
                    Page {activePrintPage} of {PRINT_FORM_TOTAL_PAGES}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setActivePrintPage((page) =>
                        Math.min(PRINT_FORM_TOTAL_PAGES, page + 1)
                      )
                    }
                    disabled={activePrintPage === PRINT_FORM_TOTAL_PAGES}
                    className="h-9 w-9 border border-slate-300 rounded text-base font-bold hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Next print page"
                  >
                    {">"}
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6 bg-slate-100 overflow-x-auto print:p-0 print:bg-white">
              <div
                id="print-form-area"
                className="mx-auto bg-white text-black shadow-sm"
                style={{
                  width: "210mm",
                  padding: 0,
                  fontFamily: "Arial, sans-serif",
                  boxSizing: "border-box",
                  display: "grid",
                  gap: "10mm",
                }}
              >
                <PrintPage
                  title={tx("generatedFormTitle")}
                  pageNumber={1}
                  totalPages={PRINT_FORM_TOTAL_PAGES}
                  isActive={activePrintPage === 1}
                >
                  <PrintSection title={tx("step1Print")}>
                    <PrintLine
                      no="1."
                      label={tx("typeOfApplication")}
                      value={applicationTypeLabel(
                        language,
                        step1.application_type_label ||
                          step1.application_type ||
                          "Application for Site (New Site)"
                      )}
                    />
                    <PrintLine no="2." label={tx("nameOfProject")} value={step1.project_name} />
                    <PrintLine no="3." label={tx("applicant")} value={step1.applicant} />
                    <PrintLine
                      no="4."
                      label={`${tx("contactPerson")} / ${tx("telNo")}`}
                      value={`${step1.contact_person || "-"} / ${step1.tel_no || "-"}`}
                    />
                    <PrintLine no="5." label={tx("localityAddress")} value={step1.locality_address} />
                    <PrintLine
                      no="6."
                      label={tx("projectAddressSearch")}
                      value={step1.map_address || step1.locality_address}
                    />
                    <PrintLine
                      no="7."
                      label={`${tx("latitude")} / ${tx("longitude")}`}
                      value={formatCoordinates(step1.latitude, step1.longitude)}
                    />
                    <PrintLine
                      no="8."
                      label={tx("siteImage")}
                      value={getAttachmentName(step1.site_image) || step1.site_image_name}
                    />
                    <PrintLine no="9." label={tx("areaRequired")} value={step1.area_required} />
                    <PrintLine
                      no="10."
                      label={tx("totalSchemeValue")}
                      value={formatRM(step1.total_scheme_value)}
                    />
                    <PrintLine
                      no="11."
                      label={`${tx("fundApprovedIn")} ${tx("malaysiaPlanRm")}`}
                      value={`${step1.malaysia_plan || "-"} / ${formatRM(step1.amount_fund_approved)}`}
                    />
                    <PrintLine
                      no="12."
                      label={tx("fundAvailableNow")}
                      value={formatRM(step1.amount_fund_available)}
                    />
                    <PrintBlock
                      no="13."
                      label={tx("projectJustification")}
                      value={stripHtml(step1.project_justification)}
                    />
                    <PrintBlock
                      no="14."
                      label={tx("siteSelectionReason")}
                      value={stripHtml(step1.site_selection_reason)}
                    />
                    <PrintLine no="15." label={tx("designation")} value={step1.designation} />
                    <PrintLine no="16." label={tx("officerName")} value={step1.officer_name} />
                    <PrintLine no="17." label={tx("date")} value={formatDate(step1.application_date)} />
                  </PrintSection>
                </PrintPage>

                <PrintPage
                  title={tx("generatedFormTitle")}
                  pageNumber={2}
                  totalPages={PRINT_FORM_TOTAL_PAGES}
                  isActive={activePrintPage === 2}
                >
                  <PrintSection title={tx("step2Print")}>
                    <PrintSubheading>{tx("organisation")}</PrintSubheading>
                    <PrintLine label={tx("organisationType")} value={organisationTypeLabel(language, step3.org_type)} />
                    <PrintLine label={tx("registrationNumber")} value={step3.registration_no} />
                    <PrintLine label={tx("organisationName")} value={step3.org_name} />
                    <PrintLine label={tx("branchName")} value={step3.branch_name} />
                    <PrintLine label={tx("postalAddress")} value={step3.postal_address} />
                    <PrintLine label={tx("postcode")} value={step3.postcode} />
                    <PrintLine label={tx("address2")} value={step3.address_2} />
                    <PrintLine label={tx("state")} value={step3.state} />
                    <PrintLine label={tx("city")} value={step3.city} />
                    <PrintLine label={tx("address3")} value={step3.address_3} />
                    <PrintLine label={tx("countryCode")} value={step3.org_country_code} />
                    <PrintLine label={tx("telephoneNo")} value={formatPhone(step3.org_country_code, step3.telephone_no)} />
                    <PrintLine label={tx("address4")} value={step3.address_4} />

                    <PrintSubheading>{tx("submittingPerson")}</PrintSubheading>
                    <PrintLine label={tx("honoraryTitle")} value={step3.honorary_title} />
                    <PrintLine label={tx("designation")} value={step3.designation} />
                    <PrintLine label={tx("fullName")} value={step3.full_name} />
                    <PrintLine label={tx("countryCode")} value={step3.mobile_country_code} />
                    <PrintLine label={tx("mobileNo")} value={formatPhone(step3.mobile_country_code, step3.mobile_no)} />
                    <PrintLine label={tx("identityCardNo")} value={step3.identity_card_no} />
                    <PrintLine label={tx("countryCode")} value={step3.office_country_code} />
                    <PrintLine label={tx("officeNo")} value={formatPhone(step3.office_country_code, step3.office_no)} />
                    <PrintLine label={tx("email")} value={step3.email} />
                    <PrintLine label={tx("countryCode")} value={step3.fax_country_code} />
                    <PrintLine label={tx("faxNo")} value={formatPhone(step3.fax_country_code, step3.fax_no)} />
                  </PrintSection>
                </PrintPage>

                <PrintPage
                  title={tx("generatedFormTitle")}
                  pageNumber={3}
                  totalPages={PRINT_FORM_TOTAL_PAGES}
                  isActive={activePrintPage === 3}
                >
                  <PrintSection title={tx("step3Print")}>
                    <DocumentSummary title={tx("requiredSupportingDocuments")} rows={requiredDocuments} language={language} noAttachmentText={tx("noAttachment")} />
                    <DocumentSummary title={tx("otherSupportingDocuments")} rows={otherDocuments} language={language} noAttachmentText={tx("noAttachment")} other />
                  </PrintSection>
                </PrintPage>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 p-5 print-hide">
              {isAdminView ? (
                <AdminViewStepControls
                  applicationId={applicationId}
                  currentStep={5}
                  language={language}
                />
              ) : isReadOnly ? (
                <UserViewStepControls
                  applicationId={applicationId}
                  currentStep={5}
                  language={language}
                />
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleSaveDraftAndBack}
                    disabled={saving}
                    className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"
                  >
                    {saving ? tx("saving") : tx("saveDraftBackApplications")}
                  </button>

                  <Link
                    to={
                      isAdminReview
                        ? adminStepPath(4)
                        : `/applications/${applicationId}/declaration?id=${applicationId}`
                    }
                    className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
                  >
                    {tx("previous")}
                  </Link>

                <button
                  type="button"
                  onClick={handleSubmitApplication}
                  disabled={saving}
                  className="px-3 py-1.5 bg-[#006d32] text-white rounded text-xs font-semibold hover:bg-[#005224] disabled:opacity-60"
                >
                  {saving ? tx("submitting") : tx("saveSubmit")}
                </button>
                </>
              )}
            </div>
          </section>
        </main>
      </div>
    </Layout>
  );
}

function ApplicationReference({ step1, language }) {
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
          </>
        )}

        <p>{tx("status")}</p>
        <p className="font-semibold text-[#006d32]">
          {applicationStatusLabel(language, step1.status)}
        </p>

        <p>{tx("applicationType")}</p>
        <p className="font-semibold text-[#006d32]">
          {applicationTypeLabel(language, step1.application_type_label || "Application for Site (New Site)")}
        </p>
      </div>
    </div>
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

function PrintPage({ title, pageNumber, totalPages, isActive = true, children }) {
  return (
    <div
      className={`print-page${isActive ? "" : " print-page-preview-hidden"}`}
      style={{
        width: "210mm",
        minHeight: "297mm",
        padding: "14mm 14mm 12mm 14mm",
        fontSize: "11pt",
        lineHeight: 1.35,
        background: "#ffffff",
        boxSizing: "border-box",
        boxShadow: "0 1px 4px rgba(15, 23, 42, 0.12)",
        ...(isActive ? { display: "flex" } : {}),
        flexDirection: "column",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: "9mm" }}>
        <h1
          style={{
            fontSize: "11pt",
            fontWeight: 700,
            textDecoration: "underline",
            margin: 0,
          }}
        >
          {title}
        </h1>
      </div>

      <div className="print-page-body" style={{ flex: "1 1 auto" }}>
        {children}
      </div>

      <div
        className="print-page-footer"
        style={{
          color: "#111111",
          fontSize: "9pt",
          marginTop: "auto",
          textAlign: "right",
        }}
      >
        {pageNumber}/{totalPages}
      </div>
    </div>
  );
}

function PrintSection({ title, children }) {
  return (
    <section style={{ marginTop: "7mm" }}>
      <h2
        style={{
          borderBottom: "1px solid #000000",
          fontSize: "11pt",
          fontWeight: 700,
          margin: "0 0 3mm",
          paddingBottom: "1mm",
        }}
      >
        {title}
      </h2>
      <div>{children}</div>
    </section>
  );
}

function PrintSubheading({ children }) {
  return (
    <div
      className="print-avoid-break"
      style={{
        background: "#f2f2f2",
        border: "1px solid #d5d5d5",
        fontSize: "11pt",
        fontWeight: 700,
        margin: "3mm 0 1.5mm",
        padding: "1.4mm 2mm",
      }}
    >
      {children}
    </div>
  );
}

function PrintLine({ no, label, value }) {
  return (
    <div
      className="print-avoid-break"
      style={{
        display: "grid",
        gridTemplateColumns: no ? "9mm 58mm minmax(0, 1fr)" : "67mm minmax(0, 1fr)",
        gap: "3mm",
        fontSize: "11pt",
        lineHeight: 1.35,
        padding: "1.1mm 0",
      }}
    >
      {no && <div>{no}</div>}
      <div>{label}</div>
      <div style={{ borderBottom: "1px dotted #666666", minHeight: "5mm" }}>
        {value || "-"}
      </div>
    </div>
  );
}

function PrintBlock({ no, label, value }) {
  return (
    <div
      className="print-avoid-break"
      style={{ fontSize: "11pt", lineHeight: 1.35, padding: "2mm 0" }}
    >
      <div style={{ display: "flex", gap: "2mm", fontWeight: 700 }}>
        {no && <span>{no}</span>}
        <span>{label}</span>
      </div>
      <div
        style={{
          border: "1px dotted #aaaaaa",
          minHeight: "24mm",
          marginTop: "1mm",
          padding: "2mm",
          whiteSpace: "pre-wrap",
        }}
      >
        {value || "-"}
      </div>
    </div>
  );
}

function mergeRequiredDocuments(requiredDocuments, legacyTitleDocuments) {
  const documents = Array.isArray(requiredDocuments) ? requiredDocuments : [];
  const titleDocuments = Array.isArray(legacyTitleDocuments)
    ? legacyTitleDocuments
    : [];
  const firstTitleAttachment = titleDocuments.find((row) => row?.attachment)
    ?.attachment;
  const hasTitleDocument = documents.some(
    (row) => row?.title === TITLE_DOCUMENT_NAME
  );

  if (hasTitleDocument) {
    return documents.map((row) =>
      row?.title === TITLE_DOCUMENT_NAME && !row.attachment && firstTitleAttachment
        ? { ...row, attachment: firstTitleAttachment }
        : row
    );
  }

  return [
    ...documents,
    ...titleDocuments.map((row) => ({
      title: TITLE_DOCUMENT_NAME,
      description: row?.land || row?.description || "",
      format: row?.format || "PDF",
      required: false,
      attachment: row?.attachment || null,
    })),
  ];
}

function DocumentSummary({
  title,
  rows,
  language = "en",
  noAttachmentText = "No attachment",
  other = false,
}) {
  return (
    <div className="print-avoid-break" style={{ marginTop: "3mm", fontSize: "11pt" }}>
      <div style={{ fontWeight: 700, marginBottom: "1mm" }}>{title}</div>
      {rows.length === 0 ? (
        <div>-</div>
      ) : (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            tableLayout: "fixed",
          }}
        >
          <thead>
            <tr>
              <PrintTableHead style={{ width: "9mm" }}>#</PrintTableHead>
              <PrintTableHead style={{ width: other ? "82mm" : "42mm" }}>
                {other ? stepText(language, "description") : stepText(language, "title")}
              </PrintTableHead>
              {!other && (
                <PrintTableHead>{stepText(language, "description")}</PrintTableHead>
              )}
              <PrintTableHead style={{ width: "27mm" }}>
                {stepText(language, "format")}
              </PrintTableHead>
              <PrintTableHead style={{ width: "45mm" }}>
                {stepText(language, "attachment")}
              </PrintTableHead>
            </tr>
          </thead>

          <tbody>
            {rows.map((row, index) => {
              const description = other
                ? row.description
                : row.title === TITLE_DOCUMENT_NAME
                  ? row.description || stepText(language, "noLandInfo")
                  : documentDescription(language, row.title, row.description);

              return (
                <tr key={`${title}-${index}`} className="print-avoid-break">
                  <PrintTableCell center>{index + 1}</PrintTableCell>
                  <PrintTableCell>
                    {other ? description || "-" : documentTitle(language, row.title)}
                  </PrintTableCell>
                  {!other && <PrintTableCell>{description || "-"}</PrintTableCell>}
                  <PrintTableCell>{row.format || "-"}</PrintTableCell>
                  <PrintTableCell>
                    {formatAttachment(row.attachment, noAttachmentText)}
                  </PrintTableCell>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function PrintTableHead({ children, style = {} }) {
  return (
    <th
      style={{
        border: "1px solid #999999",
        background: "#f2f2f2",
        fontWeight: 700,
        padding: "1.4mm",
        textAlign: "left",
        verticalAlign: "top",
        ...style,
      }}
    >
      {children}
    </th>
  );
}

function PrintTableCell({ children, center = false }) {
  return (
    <td
      style={{
        border: "1px solid #b5b5b5",
        padding: "1.4mm",
        textAlign: center ? "center" : "left",
        verticalAlign: "top",
        wordBreak: "break-word",
        whiteSpace: "pre-wrap",
      }}
    >
      {children || "-"}
    </td>
  );
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatRM(value) {
  if (!value) return "-";

  const numberValue = Number(String(value).replace(/[^0-9.]/g, ""));

  if (Number.isNaN(numberValue)) {
    return value;
  }

  return `RM ${numberValue.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-GB");
}

function formatCoordinates(latitude, longitude) {
  if (!latitude && !longitude) return "-";
  return `${latitude || "-"} / ${longitude || "-"}`;
}

function formatPhone(countryCode, phoneNumber) {
  if (!countryCode && !phoneNumber) return "-";
  return [countryCode, phoneNumber].filter(Boolean).join(" ");
}

function getAttachmentName(attachment) {
  if (!attachment) return "";
  return (
    attachment.name ||
    attachment.file?.split("/")?.pop() ||
    attachment.url?.split("/")?.pop() ||
    attachment.file_url?.split("/")?.pop() ||
    ""
  );
}

function formatAttachment(attachment, noAttachmentText) {
  const name = getAttachmentName(attachment);
  if (!name) return noAttachmentText;

  if (!attachment?.size) {
    return name;
  }

  return `${name} (${(Number(attachment.size || 0) / 1024).toFixed(1)} KB)`;
}

export default PrintFormPage;
