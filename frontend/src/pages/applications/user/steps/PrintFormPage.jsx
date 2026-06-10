import { useEffect, useState } from "react";
import { jsPDF } from "jspdf";
import UserDashboardLayout from "../../../../layout/UserDashboardLayout";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useLanguage } from "../../../../context/LanguageContext";
import { apiRequest } from "../../../../services/api";
import {
  canEditApplicationForm,
  getApplicationType,
} from "../../../../utils/workflow";
import {
  applicationStatusLabel,
  applicationTypeLabel,
  documentDescription,
  documentTitle,
  organisationTypeLabel,
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
      const workflowReset = submit ? getWorkflowResetOnResubmit(applicationRecord, now) : {};
      const nextStatus = submit ? getSubmitStatusOnResubmit(applicationRecord) : undefined;

      await apiRequest(`/applications/${applicationId}/`, {
        method: "PATCH",
        body: JSON.stringify({
          current_step: 5,
          status: nextStatus,
          form_data: {
            ...workflowReset,
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

    await generatePdf();
  }

  async function generatePdf() {
    try {
      setSaving(true);

      const pdf = buildPrintFormPdf({
        title: tx("generatedFormTitle"),
        language,
        noAttachmentText: tx("noAttachment"),
        requiredDocuments,
        otherDocuments,
        step1,
        step3,
        tx,
      });

      pdf.save(`${tx("generatedFormTitle").replace(/\s+/g, "_")}.pdf`);
    } catch (err) {
      console.error("Generate PDF failed:", err);
      alert(tx("failedSavePrint"));
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitApplication() {
    if (isReadOnly) return;

    const saved = await saveStep9({ submit: true });
    if (saved) {
      navigate(isAdminReview ? "/admin/applications" : "/user/dashboard?tab=status");
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
              width: 100% !important;
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
              width: 100% !important;
              height: 271mm !important;
              min-height: 271mm !important;
              max-height: 271mm !important;
              margin: 0 !important;
              padding: 0 !important;
              box-shadow: none !important;
              display: block !important;
              position: relative !important;
              break-after: page !important;
              page-break-after: always !important;
              break-inside: avoid !important;
              page-break-inside: avoid !important;
              background: #ffffff !important;
              box-sizing: border-box !important;
            }

            .print-page-body {
              display: block !important;
              width: 100% !important;
              padding-bottom: 12mm !important;
              box-sizing: border-box !important;
            }

            .print-page-footer {
              position: absolute !important;
              right: 0 !important;
              bottom: 0 !important;
              margin: 0 !important;
            }

            .print-section,
            .print-section-body,
            .print-line,
            .print-block,
            .print-block-value,
            .print-subheading,
            .document-summary {
              width: 100% !important;
              box-sizing: border-box !important;
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
              margin: 14mm 14mm 12mm 14mm;
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
                      value={getApplicationType({ form_data: { step_1: step1 } }, language)}
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
                      label={`${tx("latitude")} / ${tx("longitude")}`}
                      value={formatCoordinates(step1.latitude, step1.longitude)}
                    />
                    <PrintLine
                      no="7."
                      label={tx("siteImage")}
                      value={getSiteImageNames(step1)}
                    />
                    <PrintAdvertisementRows
                      step1={step1}
                      language={language}
                      tx={tx}
                    />
                    <PrintLine
                      no="8."
                      label={tx("totalSchemeValue")}
                      value={formatRM(step1.total_scheme_value)}
                    />
                    <PrintLine
                      no="9."
                      label={tx("fundAvailableNow")}
                      value={formatRM(step1.amount_fund_available)}
                    />
                    <PrintBlock
                      no="10."
                      label={tx("projectJustification")}
                      value={stripHtml(step1.project_justification)}
                    />
                    <PrintBlock
                      no="11."
                      label={tx("siteSelectionReason")}
                      value={stripHtml(step1.site_selection_reason)}
                    />
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
                    <PrintLine label={tx("postalAddress")} value={step3.postal_address} />
                    <PrintLine label={tx("address2")} value={step3.address_2} />
                    <PrintLine label={tx("postcode")} value={step3.postcode} />
                    <PrintLine label={tx("state")} value={step3.state} />
                    <PrintLine label={tx("city")} value={step3.city} />
                    <PrintLine label={tx("countryCode")} value={step3.org_country_code} />
                    <PrintLine label={tx("telephoneNo")} value={formatPhone(step3.org_country_code, step3.telephone_no)} />

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
  const tx = (key) => stepText(language, key);

  return (
    <div className="bg-[#f5f5f5] border-b border-slate-200 px-4 py-3 text-xs">
      <div className="grid grid-cols-[140px_1fr] gap-y-1">
        <p>{tx("status")}</p>
        <p className="font-semibold text-[#006d32]">
          {applicationStatusLabel(language, step1.status)}
        </p>

        <p>{tx("applicationType")}</p>
        <p className="font-semibold text-[#006d32]">
          {getApplicationType({ form_data: { step_1: step1 } }, language)}
        </p>
      </div>
    </div>
  );
}

const PDF_PAGE = {
  width: 210,
  height: 297,
  marginX: 14,
  marginTop: 18,
  footerY: 282,
  contentWidth: 182,
  lineHeight: 5.2,
  fontSize: 11,
};

function buildPrintFormPdf({
  title,
  language,
  noAttachmentText,
  requiredDocuments,
  otherDocuments,
  step1,
  step3,
  tx,
}) {
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  pdf.setProperties({ title });
  drawPdfPageOne(pdf, { title, step1, tx, language });
  pdf.addPage("a4", "portrait");
  drawPdfPageTwo(pdf, { title, step3, tx, language });
  pdf.addPage("a4", "portrait");
  drawPdfPageThree(pdf, {
    title,
    language,
    noAttachmentText,
    requiredDocuments,
    otherDocuments,
    tx,
  });

  return pdf;
}

function drawPdfPageOne(pdf, { title, step1, tx, language }) {
  let y = drawPdfHeader(pdf, title);

  y = drawPdfSectionTitle(pdf, tx("step1Print"), y);
  y = drawPdfFieldRows(
    pdf,
    [
      {
        no: "1.",
        label: tx("typeOfApplication"),
        value: getApplicationType({ form_data: { step_1: step1 } }, language),
      },
      { no: "2.", label: tx("nameOfProject"), value: step1.project_name },
      { no: "3.", label: tx("applicant"), value: step1.applicant },
      {
        no: "4.",
        label: `${tx("contactPerson")} / ${tx("telNo")}`,
        value: `${step1.contact_person || "-"} / ${step1.tel_no || "-"}`,
      },
      { no: "5.", label: tx("localityAddress"), value: step1.locality_address },
      {
        no: "6.",
        label: `${tx("latitude")} / ${tx("longitude")}`,
        value: formatCoordinates(step1.latitude, step1.longitude),
      },
      {
        no: "7.",
        label: tx("siteImage"),
        value: getSiteImageNames(step1),
      },
    ],
    y
  );

  y = drawPdfAdvertisementRows(pdf, {
    rows: getPrintAdvertisementRows(step1, language),
    tx,
    y,
  });

  y = drawPdfFieldRows(
    pdf,
    [
      {
        no: "8.",
        label: tx("totalSchemeValue"),
        value: formatRM(step1.total_scheme_value),
      },
      {
        no: "9.",
        label: tx("fundAvailableNow"),
        value: formatRM(step1.amount_fund_available),
      },
    ],
    y + 1
  );

  y = drawPdfBlock(pdf, {
    no: "10.",
    label: tx("projectJustification"),
    value: stripHtml(step1.project_justification),
    y,
  });
  drawPdfBlock(pdf, {
    no: "11.",
    label: tx("siteSelectionReason"),
    value: stripHtml(step1.site_selection_reason),
    y,
  });

  drawPdfFooter(pdf, 1, PRINT_FORM_TOTAL_PAGES);
}

function drawPdfPageTwo(pdf, { title, step3, tx, language }) {
  let y = drawPdfHeader(pdf, title);

  y = drawPdfSectionTitle(pdf, tx("step2Print"), y);
  y = drawPdfSubheading(pdf, tx("organisation"), y);
  y = drawPdfFieldRows(
    pdf,
    [
      {
        label: tx("organisationType"),
        value: organisationTypeLabel(language, step3.org_type),
      },
      { label: tx("registrationNumber"), value: step3.registration_no },
      { label: tx("organisationName"), value: step3.org_name },
      { label: tx("postalAddress"), value: step3.postal_address },
      { label: tx("address2"), value: step3.address_2 },
      { label: tx("postcode"), value: step3.postcode },
      { label: tx("state"), value: step3.state },
      { label: tx("city"), value: step3.city },
      { label: tx("countryCode"), value: step3.org_country_code },
      {
        label: tx("telephoneNo"),
        value: formatPhone(step3.org_country_code, step3.telephone_no),
      },
    ],
    y
  );

  y = drawPdfSubheading(pdf, tx("submittingPerson"), y + 1);
  drawPdfFieldRows(
    pdf,
    [
      { label: tx("honoraryTitle"), value: step3.honorary_title },
      { label: tx("designation"), value: step3.designation },
      { label: tx("fullName"), value: step3.full_name },
      { label: tx("countryCode"), value: step3.mobile_country_code },
      {
        label: tx("mobileNo"),
        value: formatPhone(step3.mobile_country_code, step3.mobile_no),
      },
      { label: tx("identityCardNo"), value: step3.identity_card_no },
      { label: tx("countryCode"), value: step3.office_country_code },
      {
        label: tx("officeNo"),
        value: formatPhone(step3.office_country_code, step3.office_no),
      },
      { label: tx("email"), value: step3.email },
      { label: tx("countryCode"), value: step3.fax_country_code },
      {
        label: tx("faxNo"),
        value: formatPhone(step3.fax_country_code, step3.fax_no),
      },
    ],
    y
  );

  drawPdfFooter(pdf, 2, PRINT_FORM_TOTAL_PAGES);
}

function drawPdfPageThree(pdf, {
  title,
  language,
  noAttachmentText,
  requiredDocuments,
  otherDocuments,
  tx,
}) {
  let y = drawPdfHeader(pdf, title);

  y = drawPdfSectionTitle(pdf, tx("step3Print"), y);
  y = drawPdfDocumentSummary(pdf, {
    title: tx("requiredSupportingDocuments"),
    rows: requiredDocuments,
    language,
    noAttachmentText,
    other: false,
    y,
  });
  drawPdfDocumentSummary(pdf, {
    title: tx("otherSupportingDocuments"),
    rows: otherDocuments,
    language,
    noAttachmentText,
    other: true,
    y: y + 4,
  });

  drawPdfFooter(pdf, 3, PRINT_FORM_TOTAL_PAGES);
}

function drawPdfHeader(pdf, title) {
  resetPdfTextStyle(pdf);
  pdf.setFont("helvetica", "bold");
  pdf.text(title, PDF_PAGE.width / 2, PDF_PAGE.marginTop, { align: "center" });
  const titleWidth = pdf.getTextWidth(title);
  pdf.setLineWidth(0.25);
  pdf.line(
    PDF_PAGE.width / 2 - titleWidth / 2,
    PDF_PAGE.marginTop + 1,
    PDF_PAGE.width / 2 + titleWidth / 2,
    PDF_PAGE.marginTop + 1
  );
  return PDF_PAGE.marginTop + 18;
}

function drawPdfFooter(pdf, pageNumber, totalPages) {
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(`${pageNumber}/${totalPages}`, PDF_PAGE.width - PDF_PAGE.marginX, PDF_PAGE.footerY, {
    align: "right",
  });
  resetPdfTextStyle(pdf);
}

function drawPdfSectionTitle(pdf, title, y) {
  resetPdfTextStyle(pdf);
  pdf.setFont("helvetica", "bold");
  pdf.text(title, PDF_PAGE.marginX, y);
  const underlineY = y + 1.2;
  pdf.setLineWidth(0.3);
  pdf.line(PDF_PAGE.marginX, underlineY, PDF_PAGE.width - PDF_PAGE.marginX, underlineY);
  return y + 5;
}

function drawPdfSubheading(pdf, title, y) {
  pdf.setFillColor(242, 242, 242);
  pdf.setDrawColor(205, 205, 205);
  pdf.rect(PDF_PAGE.marginX, y, PDF_PAGE.contentWidth, 8, "FD");
  resetPdfTextStyle(pdf);
  pdf.setFont("helvetica", "bold");
  pdf.text(title, PDF_PAGE.marginX + 2, y + 5.5);
  resetPdfTextStyle(pdf);
  return y + 10.5;
}

function drawPdfFieldRows(pdf, rows, y) {
  const numberX = PDF_PAGE.marginX;
  const labelX = PDF_PAGE.marginX + (rows.some((row) => row.no) ? 14 : 0);
  const valueX = PDF_PAGE.marginX + 68;
  const valueWidth = PDF_PAGE.width - PDF_PAGE.marginX - valueX;
  const labelWidth = valueX - labelX - 6;

  resetPdfTextStyle(pdf);

  rows.forEach((row) => {
    const labelLines = splitPdfText(pdf, row.label, labelWidth);
    const valueLines = splitPdfText(pdf, printableValue(row.value), valueWidth - 1);
    const rowHeight =
      Math.max(labelLines.length, valueLines.length) * PDF_PAGE.lineHeight + 2;
    const baseline = y + 4;

    pdf.setFont("helvetica", "normal");
    if (row.no) {
      pdf.text(row.no, numberX, baseline);
    }
    pdf.text(labelLines, labelX, baseline);
    pdf.text(valueLines, valueX, baseline);

    pdf.setDrawColor(160, 160, 160);
    pdf.setLineWidth(0.18);
    pdf.line(valueX, y + rowHeight - 0.5, PDF_PAGE.width - PDF_PAGE.marginX, y + rowHeight - 0.5);
    y += rowHeight;
  });

  resetPdfTextStyle(pdf);
  return y + 1;
}

function drawPdfBlock(pdf, { no, label, value, y }) {
  const heading = `${no ? `${no} ` : ""}${label}`;
  const text = printableValue(value);
  const lines = splitPdfText(pdf, text, PDF_PAGE.contentWidth - 4);
  const boxHeight = Math.max(18, lines.length * PDF_PAGE.lineHeight + 5);

  resetPdfTextStyle(pdf);
  pdf.setFont("helvetica", "bold");
  pdf.text(heading, PDF_PAGE.marginX, y + 4);
  y += 6;

  pdf.setDrawColor(210, 210, 210);
  pdf.setLineWidth(0.2);
  pdf.rect(PDF_PAGE.marginX, y, PDF_PAGE.contentWidth, boxHeight);
  pdf.setFont("helvetica", "normal");
  pdf.text(lines, PDF_PAGE.marginX + 2, y + 5);

  resetPdfTextStyle(pdf);
  return y + boxHeight + 4;
}

function drawPdfAdvertisementRows(pdf, { rows, tx, y }) {
  const columns = [
    { key: "index", title: "#", width: 8, align: "center" },
    { key: "displayType", title: tx("displayType"), width: 28 },
    { key: "advertisementType", title: tx("advertisementType"), width: 46 },
    { key: "size", title: tx("advertisementSizeFt"), width: 38 },
    { key: "area", title: tx("areaRequired"), width: 32 },
    { key: "payable", title: tx("malaysiaPlanRm"), width: 30 },
  ];

  resetPdfTextStyle(pdf);
  pdf.setFont("helvetica", "bold");
  pdf.text(tx("advertisementType"), PDF_PAGE.marginX, y + 3);
  y += 6;
  y = drawPdfTableHeader(pdf, columns, y);

  rows.forEach((row, index) => {
    y = drawPdfTableRow(
      pdf,
      columns,
      {
        index: String(index + 1),
        displayType: row.displayTypeLabel,
        advertisementType: row.advertisementTypeLabel,
        size: row.sizeLabel,
        area: row.areaRequired || "-",
        payable: formatRM(row.amountFundApproved),
      },
      y
    );
  });

  resetPdfTextStyle(pdf);
  return y + 2;
}

function drawPdfDocumentSummary(pdf, {
  title,
  rows,
  language,
  noAttachmentText,
  other = false,
  y,
}) {
  resetPdfTextStyle(pdf);
  pdf.setFont("helvetica", "bold");
  pdf.text(title, PDF_PAGE.marginX, y);
  y += 4;

  if (!rows.length) {
    pdf.setFont("helvetica", "normal");
    pdf.text("-", PDF_PAGE.marginX, y + 2);
    resetPdfTextStyle(pdf);
    return y + 8;
  }

  const columns = other
    ? [
        { key: "index", title: "#", width: 8, align: "center" },
        { key: "description", title: stepText(language, "description"), width: 102 },
        { key: "format", title: stepText(language, "format"), width: 30 },
        { key: "attachment", title: stepText(language, "attachment"), width: 42 },
      ]
    : [
        { key: "index", title: "#", width: 8, align: "center" },
        { key: "title", title: stepText(language, "title"), width: 36 },
        { key: "description", title: stepText(language, "description"), width: 74 },
        { key: "format", title: stepText(language, "format"), width: 28 },
        { key: "attachment", title: stepText(language, "attachment"), width: 36 },
      ];

  y = drawPdfTableHeader(pdf, columns, y);

  rows.forEach((row, index) => {
    if (!other && row?.section) {
      y = drawPdfMergedDocumentRow(
        pdf,
        columns,
        {
          index: String(index + 1),
          title: documentTitle(language, row.title),
        },
        y
      );
      return;
    }

    const letteredTitle = getLetteredDocumentTitle(language, row);
    const description = other
      ? row.description
      : row.title === TITLE_DOCUMENT_NAME
        ? row.description || stepText(language, "noLandInfo")
        : documentDescription(language, row.title, row.description);
    const values = {
      index: !other && letteredTitle.letter ? "" : String(index + 1),
      title: !other && letteredTitle.letter
        ? `${letteredTitle.letter}. ${letteredTitle.title}`
        : documentTitle(language, row.title),
      description: description || "-",
      format: row.format || "-",
      attachment: formatAttachment(row.attachment, noAttachmentText),
    };
    y = drawPdfTableRow(pdf, columns, values, y);
  });

  resetPdfTextStyle(pdf);
  return y;
}

function drawPdfMergedDocumentRow(pdf, columns, values, y) {
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "bold");

  const rowHeight = 9;
  const indexColumn = columns[0];
  const mergedWidth = columns.slice(1).reduce((sum, column) => sum + column.width, 0);
  let x = PDF_PAGE.marginX;

  pdf.setDrawColor(185, 185, 185);
  pdf.rect(x, y, indexColumn.width, rowHeight);
  pdf.text(values.index, x + indexColumn.width / 2, y + 6, { align: "center" });

  x += indexColumn.width;
  pdf.rect(x, y, mergedWidth, rowHeight);
  pdf.text(values.title, x + 1.5, y + 6);

  return y + rowHeight;
}

function drawPdfTableHeader(pdf, columns, y) {
  const headerHeight = 8;
  let x = PDF_PAGE.marginX;

  pdf.setFontSize(10);
  pdf.setFont("helvetica", "bold");

  columns.forEach((column) => {
    pdf.setFillColor(242, 242, 242);
    pdf.setDrawColor(150, 150, 150);
    pdf.rect(x, y, column.width, headerHeight, "FD");
    pdf.text(column.title, x + 1.5, y + 5.5);
    x += column.width;
  });

  return y + headerHeight;
}

function drawPdfTableRow(pdf, columns, values, y) {
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");

  const cellLines = columns.map((column) =>
    column.key === "index" && values[column.key] === ""
      ? [""]
      : splitPdfText(pdf, values[column.key], column.width - 3)
  );
  const rowHeight =
    Math.max(...cellLines.map((lines) => lines.length)) * 4.7 + 4;
  let x = PDF_PAGE.marginX;

  columns.forEach((column, columnIndex) => {
    pdf.setDrawColor(185, 185, 185);
    pdf.rect(x, y, column.width, rowHeight);
    const textX =
      column.align === "center" ? x + column.width / 2 : x + 1.5;
    pdf.text(cellLines[columnIndex], textX, y + 5, {
      align: column.align === "center" ? "center" : "left",
    });
    x += column.width;
  });

  return y + rowHeight;
}

function resetPdfTextStyle(pdf) {
  pdf.setTextColor(0, 0, 0);
  pdf.setDrawColor(0, 0, 0);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(PDF_PAGE.fontSize);
  pdf.setLineWidth(0.2);
}

function splitPdfText(pdf, value, width) {
  return pdf.splitTextToSize(printableValue(value), width);
}

function printableValue(value) {
  return String(value || "-").trim() || "-";
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
    <section className="print-section" style={{ marginTop: "7mm", width: "100%" }}>
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
      <div className="print-section-body" style={{ width: "100%" }}>
        {children}
      </div>
    </section>
  );
}

function PrintSubheading({ children }) {
  return (
    <div
      className="print-avoid-break print-subheading"
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
      className="print-avoid-break print-line"
      style={{
        display: "grid",
        gridTemplateColumns: no ? "9mm 58mm minmax(0, 1fr)" : "67mm minmax(0, 1fr)",
        gap: "3mm",
        fontSize: "11pt",
        lineHeight: 1.35,
        padding: "0.8mm 0",
        alignItems: "start",
      }}
    >
      {no && <div>{no}</div>}
      <div>{label}</div>
      <div
        style={{
          borderBottom: "1px solid #9a9a9a",
          boxSizing: "border-box",
          lineHeight: 1.35,
          minHeight: "7mm",
          paddingBottom: "1.4mm",
          wordBreak: "normal",
        }}
      >
        {value || "-"}
      </div>
    </div>
  );
}

function PrintBlock({ no, label, value }) {
  return (
    <div
      className="print-avoid-break print-block"
      style={{ fontSize: "11pt", lineHeight: 1.35, padding: "2mm 0", width: "100%" }}
    >
      <div style={{ display: "flex", gap: "2mm", fontWeight: 700 }}>
        {no && <span>{no}</span>}
        <span>{label}</span>
      </div>
      <div
        className="print-block-value"
        style={{
          border: "1px solid #d0d0d0",
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

function PrintAdvertisementRows({ step1, language, tx }) {
  const rows = getPrintAdvertisementRows(step1, language);

  return (
    <div
      className="print-avoid-break"
      style={{ fontSize: "11pt", margin: "2mm 0", width: "100%" }}
    >
      <div style={{ fontWeight: 700, marginBottom: "1mm" }}>
        {tx("advertisementType")}
      </div>
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
            <PrintTableHead style={{ width: "28mm" }}>
              {tx("displayType")}
            </PrintTableHead>
            <PrintTableHead>{tx("advertisementType")}</PrintTableHead>
            <PrintTableHead style={{ width: "36mm" }}>
              {tx("advertisementSizeFt")}
            </PrintTableHead>
            <PrintTableHead style={{ width: "32mm" }}>
              {tx("areaRequired")}
            </PrintTableHead>
            <PrintTableHead style={{ width: "30mm" }}>
              {tx("malaysiaPlanRm")}
            </PrintTableHead>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`advertisement-${index}`} className="print-avoid-break">
              <PrintTableCell center>{index + 1}</PrintTableCell>
              <PrintTableCell>{row.displayTypeLabel}</PrintTableCell>
              <PrintTableCell>{row.advertisementTypeLabel}</PrintTableCell>
              <PrintTableCell>{row.sizeLabel}</PrintTableCell>
              <PrintTableCell>{row.areaRequired || "-"}</PrintTableCell>
              <PrintTableCell>{formatRM(row.amountFundApproved)}</PrintTableCell>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getPrintAdvertisementRows(step1 = {}, language = "en") {
  const selectedType = getPrimaryStepApplicationType(step1);
  const rows = Array.isArray(step1.advertisement_rows) && step1.advertisement_rows.length
    ? step1.advertisement_rows
    : [
        {
          displayType: step1.advertisement_display_type,
          display_type: step1.advertisement_display_type,
          subtype: step1.application_subtype,
          customLabel: step1.advertisement_type_custom_label,
          custom_label: step1.advertisement_type_custom_label,
          widthFt: step1.width_ft || step1.size_width_ft,
          width_ft: step1.width_ft || step1.size_width_ft,
          heightFt: step1.height_ft || step1.size_height_ft,
          height_ft: step1.height_ft || step1.size_height_ft,
          areaRequired: step1.area_required,
          area_required: step1.area_required,
          amountFundApproved: step1.amount_fund_approved,
          amount_fund_approved: step1.amount_fund_approved,
        },
      ];

  return rows.map((row) => {
    const displayType = getAdvertisementDisplayType(row);
    const subtype = String(row?.subtype || row?.application_subtype || "").trim();
    const customLabel = String(row?.customLabel || row?.custom_label || "").trim();
    const adTypeSource = customLabel || subtype;
    const translatedAdType = adTypeSource
      ? applicationTypeLabel(language, adTypeSource)
      : "";
    const widthFt = row?.widthFt || row?.width_ft || "";
    const heightFt = row?.heightFt || row?.height_ft || "";

    return {
      displayTypeLabel: getAdvertisementDisplayTypeLabel(language, displayType),
      advertisementTypeLabel:
        translatedAdType ||
        getApplicationType(
          {
            form_data: {
              step_1: {
                ...step1,
                application_type_options: [selectedType],
                advertisement_rows: [row],
                application_subtype: subtype,
                advertisement_type_custom_label: customLabel,
              },
            },
          },
          language
        ).split(" - ").slice(1).join(" - ") ||
        "-",
      sizeLabel: formatAdvertisementSize({ width_ft: widthFt, height_ft: heightFt }),
      areaRequired: row?.areaRequired || row?.area_required || "",
      amountFundApproved:
        row?.amountFundApproved || row?.amount_fund_approved || step1.amount_fund_approved || "",
    };
  });
}

function getPrimaryStepApplicationType(step1 = {}) {
  const options = Array.isArray(step1.application_type_options)
    ? step1.application_type_options
    : String(step1.application_type || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

  return options.includes("building") ? "building" : "open_space";
}

function getAdvertisementDisplayType(row = {}) {
  const displayType = row.displayType || row.display_type || "";
  if (displayType === "led" || displayType === "non_led") return displayType;

  const subtype = String(row.subtype || row.application_subtype || "").toLowerCase();
  return subtype.includes("led") ? "led" : subtype ? "non_led" : "";
}

function getAdvertisementDisplayTypeLabel(language, displayType) {
  if (displayType === "led") return stepText(language, "displayTypeLed");
  if (displayType === "non_led") return stepText(language, "displayTypeNonLed");
  return "-";
}

function getLetteredDocumentTitle(language, row) {
  const title = documentTitle(language, row?.title || "");
  const match = title.match(/^([a-d])\.\s*(.+)$/i);

  if (!match) {
    return { letter: "", title };
  }

  return {
    letter: match[1].toLowerCase(),
    title: match[2],
  };
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
    <div
      className="print-avoid-break document-summary"
      style={{ marginTop: "3mm", fontSize: "11pt", width: "100%" }}
    >
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
              if (!other && row?.section) {
                return (
                  <tr key={`${title}-${index}`} className="print-avoid-break">
                    <PrintTableCell center>{index + 1}</PrintTableCell>
                    <PrintTableCell colSpan={4}>
                      <strong>{documentTitle(language, row.title)}</strong>
                    </PrintTableCell>
                  </tr>
                );
              }

              const letteredTitle = getLetteredDocumentTitle(language, row);
              const description = other
                ? row.description
                : row.title === TITLE_DOCUMENT_NAME
                  ? row.description || stepText(language, "noLandInfo")
                  : documentDescription(language, row.title, row.description);

              return (
                <tr key={`${title}-${index}`} className="print-avoid-break">
                  <PrintTableCell center>
                    {!other && letteredTitle.letter ? "" : index + 1}
                  </PrintTableCell>
                  <PrintTableCell>
                    {other ? (
                      description || "-"
                    ) : letteredTitle.letter ? (
                      <span
                        style={{
                          display: "grid",
                          gridTemplateColumns: "6mm minmax(0, 1fr)",
                          columnGap: "1.5mm",
                        }}
                      >
                        <span>{letteredTitle.letter}.</span>
                        <span>{letteredTitle.title}</span>
                      </span>
                    ) : (
                      documentTitle(language, row.title)
                    )}
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

function PrintTableCell({ children, center = false, colSpan }) {
  return (
    <td
      colSpan={colSpan}
      style={{
        border: "1px solid #b5b5b5",
        padding: "1.4mm",
        textAlign: center ? "center" : "left",
        verticalAlign: "top",
        wordBreak: "break-word",
        whiteSpace: "pre-wrap",
      }}
    >
      {children === "" ? "" : children || "-"}
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

function getWorkflowResetOnResubmit(applicationRecord, resubmittedAt = "") {
  if (isMphlgApplicantCorrection(applicationRecord)) {
    return {
      correction_request: null,
      mphlg_gateway: {
        ...(applicationRecord?.form_data?.mphlg_gateway || {}),
        status: "Pending MPHLG Approval",
        decision: "",
        remarks: "",
        reviewed_at: "",
        resubmitted_at: resubmittedAt,
      },
    };
  }

  return {
    auto_screening: null,
    correction_request: null,
    technical_referral: null,
    technical_department_selection: null,
    technical_department_reviews: {},
    technical_department_reviews_updated_at: "",
    technical_review: null,
    technical_site_visit: null,
    technical_ku_review: null,
  };
}

function getSubmitStatusOnResubmit(applicationRecord) {
  return isMphlgApplicantCorrection(applicationRecord) ? "mphlg_processing" : "submitted";
}

function isMphlgApplicantCorrection(applicationRecord) {
  const correction = applicationRecord?.form_data?.correction_request || {};
  const source = String(correction.source || "").trim().toUpperCase();
  const target = String(correction.target || "").trim().toUpperCase();
  const status = String(applicationRecord?.status || "").trim().toLowerCase();

  return status === "incomplete" && source === "MPHLG" && target === "APPLICANT";
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

function formatCoordinates(latitude, longitude) {
  if (!latitude && !longitude) return "-";
  return `${latitude || "-"} / ${longitude || "-"}`;
}

function formatAdvertisementSize(step1 = {}) {
  const width = step1.width_ft || step1.size_width_ft || "";
  const height = step1.height_ft || step1.size_height_ft || "";
  if (!width && !height) return "-";
  return `${width || "-"} ft x ${height || "-"} ft`;
}

function formatPhone(countryCode, phoneNumber) {
  if (!countryCode && !phoneNumber) return "-";

  const codeDigits = String(countryCode || "").match(/\+?\d+/)?.[0] || "";
  const normalizedCode = codeDigits.startsWith("+")
    ? codeDigits
    : codeDigits
      ? `+${codeDigits}`
      : "";
  const localDigits = String(phoneNumber || "").replace(/\D/g, "");

  if (normalizedCode === "+60" && localDigits) {
    return `+60${localDigits.replace(/^0+/, "")}`;
  }

  if (normalizedCode && localDigits) {
    return `${normalizedCode}${localDigits}`;
  }

  return normalizedCode || localDigits || "-";
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

function getSiteImageNames(step1 = {}) {
  const siteImages = Array.isArray(step1.site_images) ? step1.site_images : [];
  const names = siteImages
    .map((attachment) => getAttachmentName(attachment))
    .filter(Boolean);

  if (names.length > 0) return names.join(", ");

  return getAttachmentName(step1.site_image) || step1.site_image_name || "";
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
