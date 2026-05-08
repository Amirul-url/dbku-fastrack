import { useEffect, useState } from "react";
import AdminDashboardLayout from "../../../../layout/AdminDashboardLayout";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { apiRequest } from "../../../../services/api";
import AdminApplicationStepNav from "../AdminApplicationStepNav";

function AdminStep9Page() {
  const location = useLocation();
  const navigate = useNavigate();
  const { applicationId: routeApplicationId } = useParams();
  const queryParams = new URLSearchParams(location.search);

  const applicationId = routeApplicationId || queryParams.get("id");

  const Layout = AdminDashboardLayout;

  const [step1, setStep1] = useState({});
  const [step2, setStep2] = useState({});
  const [step3, setStep3] = useState({});
  const [step9, setStep9] = useState({
    title: "Print Form",
    status: "Draft",
    printed: false,
    printed_at: "",
    saved_at: "",
  });

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = "SITING APPLICATION FORM";

    if (applicationId) {
      loadApplication();
    }
  }, [applicationId]);

  async function loadApplication() {
    try {
      const data = await apiRequest(`/applications/${applicationId}/`);
      const formData = data.form_data || {};

      setStep1(formData.step_1 || {});
      setStep2(formData.step_2 || {});
      setStep3(formData.step_3 || {});

      setStep9({
        title: "Print Form",
        status: formData.step_9?.status || "Draft",
        printed: formData.step_9?.printed || false,
        printed_at: formData.step_9?.printed_at || "",
        saved_at: formData.step_9?.saved_at || "",
      });
    } catch (err) {
      console.error("Load print form failed:", err);
    }
  }

  async function saveStep9({ submit = false, printed = false } = {}) {
    if (!applicationId) {
      alert("Application ID is missing. Please continue from My Dashboard.");
      return false;
    }

    try {
      setSaving(true);

      const existingData = await apiRequest(`/applications/${applicationId}/`);
      const existingFormData = existingData.form_data || {};

      const now = new Date().toISOString();

      const updatedStep9 = {
        ...step9,
        title: "Print Form",
        status: submit ? "Submitted" : printed || step9.printed ? "Generated" : "Saved",
        printed: printed || step9.printed || false,
        printed_at: printed ? now : step9.printed_at || "",
        saved_at: now,
      };

      await apiRequest(`/applications/${applicationId}/`, {
        method: "PATCH",
        body: JSON.stringify({
          current_step: 5,
          status: submit ? "submitted" : undefined,
          form_data: {
            ...existingFormData,
            step_9: updatedStep9,
            step_11: {
              ...(existingFormData.step_11 || {}),
              submitted: submit ? true : existingFormData.step_11?.submitted || false,
              submitted_at: submit ? now : existingFormData.step_11?.submitted_at || "",
            },
          },
        }),
      });

      setStep9(updatedStep9);

      if (submit) {
        navigate("/admin/applications");
      }

      return true;
    } catch (err) {
      console.error("Print Form save failed:", err);
      alert("Failed to save Print Form.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handlePrint() {
    const saved = await saveStep9({ printed: true });

    if (!saved) return;

    const previousTitle = document.title;
    document.title = "SITING APPLICATION FORM";

    setTimeout(() => {
      window.print();

      setTimeout(() => {
        document.title = previousTitle || "SITING APPLICATION FORM";
      }, 500);
    }, 100);
  }

  async function handleSaveAndSubmit() {
    await saveStep9({ submit: true });
  }

  const landArea = Number(step1.area_required || 0);
  const landAreaAc = landArea ? (landArea * 0.000247105).toFixed(4) : "-";

  return (
    <Layout>
      <style>
        {`
          @media print {
            html,
            body {
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              width: 210mm !important;
              min-height: 297mm !important;
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
              height: 297mm !important;
              margin: 0 !important;
              padding: 12mm 14mm 10mm 14mm !important;
              box-shadow: none !important;
              border: none !important;
              overflow: hidden !important;
              background: #ffffff !important;
              box-sizing: border-box !important;
              page-break-after: avoid !important;
              page-break-before: avoid !important;
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
        <AdminApplicationStepNav active={5} />

        <main className="flex-1 min-w-0">
          <div className="mb-3 flex items-center justify-between print-hide">
            <div className="flex items-center gap-2">
              <span className="bg-[#18b36b] text-white text-sm font-bold px-3 py-1">
                5
              </span>
              <h1 className="text-lg font-semibold text-[#1a1c1c]">
                Print Form
              </h1>
            </div>

            <div className="flex gap-2">
              <Link
                to={`/admin/applications/${applicationId}/step-4?id=${applicationId}`}
                className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
              >
                Back
              </Link>

              <button
                type="button"
                onClick={handleSaveAndSubmit}
                disabled={saving}
                className="px-3 py-1.5 bg-[#006d32] text-white rounded text-xs font-semibold hover:bg-[#005224] disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save & Submit Application"}
              </button>
            </div>
          </div>

          <section className="bg-white border border-slate-200 rounded-sm overflow-hidden">
            <div className="print-hide">
              <ApplicationReference step1={step1} />
            </div>

            <div className="p-5 border-b border-slate-200 print-hide">
              <div className="bg-[#f7f7f7] border border-slate-200 p-4 text-sm text-slate-600">
                Review the generated application form below. Click Print / Save
                PDF to open the browser print dialog. Step 5 will be saved into
                JSON automatically.
              </div>

              <div className="flex flex-wrap gap-3 mt-4">
                <button
                  type="button"
                  onClick={handlePrint}
                  disabled={saving}
                  className="px-4 py-2 bg-[#006d32] text-white rounded text-sm font-semibold hover:bg-[#005224] disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Print / Save PDF"}
                </button>
              </div>
            </div>

            <div className="p-6 bg-slate-100 overflow-x-auto print:p-0 print:bg-white">
              <div
                id="print-form-area"
                className="mx-auto bg-white text-black shadow-sm"
                style={{
                  width: "210mm",
                  height: "297mm",
                  padding: "12mm 14mm 10mm 14mm",
                  fontFamily: "Arial, sans-serif",
                  boxSizing: "border-box",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "105px 1fr 105px",
                    alignItems: "center",
                    marginBottom: "7mm",
                  }}
                >
                  <img
                    src="/fasTrack.png"
                    alt="fasTrack Logo"
                    style={{
                      width: "96px",
                      height: "96px",
                      objectFit: "contain",
                    }}
                  />

                  <div style={{ textAlign: "center" }}>
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: "700",
                        lineHeight: "1.25",
                      }}
                    >
                      STATE DEVELOPMENT PLANNING AND MANAGEMENT
                    </div>

                    <div
                      style={{
                        marginTop: "4mm",
                        fontSize: "13px",
                        fontWeight: "700",
                        lineHeight: "1.25",
                      }}
                    >
                      SITING APPLICATION FORM
                    </div>

                    <div
                      style={{
                        marginTop: "3mm",
                        fontSize: "13px",
                        fontWeight: "700",
                        lineHeight: "1.25",
                      }}
                    >
                      {step1.division || "KUCHING"}
                    </div>
                  </div>

                  <div />
                </div>

                <div style={{ flex: "0 0 auto" }}>
                  <PrintSection title="A. Project Profile">
                    <PrintRow label="Name of Project" value={step1.project_name} />

                    <PrintRow
                      label="Application Type"
                      value={
                        step1.application_type_label ||
                        "Application of Siting Project"
                      }
                    />

                    <PrintRow
                      label="Area Required"
                      value={
                        step1.area_required
                          ? `${Number(step1.area_required).toFixed(4)} Sq. M`
                          : "-"
                      }
                    />

                    <PrintRow
                      label="Total Scheme Value"
                      value={formatRM(step1.total_scheme_value)}
                    />

                    <PrintRow
                      label="Fund Availability"
                      value={formatYesNo(step1.fund_availability)}
                    />

                    <PrintRow
                      label="Amount of Fund Approved in the Malaysia Plan"
                      value={formatRM(step1.amount_fund_approved)}
                    />

                    <PrintRow
                      label="Malaysia Plan No."
                      value={step1.malaysia_plan_no}
                    />

                    <PrintRow
                      label="Amount of Fund Available"
                      value={formatRM(step1.amount_fund_available)}
                    />

                    <PrintSubTitle title="Information on Proposed Site (if any)" />

                    <PrintRow
                      label="Affected Land"
                      value={step1.locality_address}
                    />

                    <PrintRow
                      label="Land Area"
                      value={
                        step1.area_required
                          ? `${Number(step1.area_required).toFixed(
                              2
                            )} Sq. M / ${landAreaAc} Ac.`
                          : "-"
                      }
                    />

                    <PrintSubTitle title="Client Profile" />

                    <PrintRow
                      label="Department / Agency Name"
                      value={step2.org_name}
                    />

                    <PrintRow
                      label="Representative / Applicant"
                      value={step2.full_name}
                    />

                    <PrintRow label="Designation" value={step2.designation} />
                    <PrintRow label="Email" value={step2.email} />

                    <PrintRow
                      label="Telephone No."
                      value={step2.office_no || step2.telephone_no}
                    />

                    <PrintSubTitle title="Submitting Person" />

                    <PrintRow label="Organisation Name" value={step3.org_name} />
                    <PrintRow label="Submitting Person" value={step3.full_name} />
                    <PrintRow label="Designation" value={step3.designation} />
                    <PrintRow label="Email" value={step3.email} />
                    <PrintRow label="Mobile No." value={step3.mobile_no} />
                  </PrintSection>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "30mm",
                      marginTop: "16mm",
                      fontSize: "10px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          borderTop: "1px solid #000000",
                          paddingTop: "2mm",
                        }}
                      >
                        Applicant Signature
                      </div>
                    </div>

                    <div>
                      <div
                        style={{
                          borderTop: "1px solid #000000",
                          paddingTop: "2mm",
                        }}
                      >
                        Date
                      </div>
                    </div>
                  </div>
                </div>

                <footer
                  style={{
                    marginTop: "auto",
                    paddingTop: "4mm",
                    fontSize: "8px",
                    color: "#64748b",
                  }}
                >
                  <div>
                    This form is generated from fasTrack Portal data. Please
                    verify all details before submission.
                  </div>

                  <div
                    style={{
                      marginTop: "3mm",
                      textAlign: "center",
                      fontSize: "8px",
                      color: "#000000",
                    }}
                  >
                    Page : 1 of 1
                  </div>
                </footer>
              </div>
            </div>

            <div className="flex justify-end gap-2 p-5 print-hide">
              <Link
                to={`/admin/applications/${applicationId}/step-4?id=${applicationId}`}
                className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
              >
                Back
              </Link>

              <button
                type="button"
                onClick={handleSaveAndSubmit}
                disabled={saving}
                className="px-3 py-1.5 bg-[#006d32] text-white rounded text-xs font-semibold hover:bg-[#005224] disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save & Submit Application"}
              </button>
            </div>
          </section>
        </main>
      </div>
    </Layout>
  );
}

function ApplicationReference({ step1 }) {
  const storedUser = localStorage.getItem("fastrack_user");
  const user = storedUser ? JSON.parse(storedUser) : null;

  return (
    <div className="bg-[#f5f5f5] border-b border-slate-200 px-4 py-3 text-xs">
      <div className="grid grid-cols-[140px_1fr] gap-y-1">
        {user?.role !== "applicant" && (
          <>
            <p>Digital Reference</p>
            <p className="font-semibold text-[#006d32]">E.SPA.2025-1443</p>

            <p>Agency Reference</p>
            <p className="font-semibold text-[#006d32]">SP/1D/159/2024</p>
          </>
        )}

        <p>Status</p>
        <p className="font-semibold text-[#006d32]">
          {step1.status || "Prepare Case"}
        </p>

        <p>Application Type</p>
        <p className="font-semibold text-[#006d32]">
          {step1.application_type_label || "Application of Siting Project"}
        </p>
      </div>
    </div>
  );
}

function PrintSection({ title, children }) {
  return (
    <section style={{ marginTop: "3.2mm" }}>
      <div
        style={{
          backgroundColor: "#dcebc8",
          height: "5.6mm",
          display: "flex",
          alignItems: "center",
          paddingLeft: "2mm",
          paddingRight: "2mm",
          boxSizing: "border-box",
          WebkitPrintColorAdjust: "exact",
          printColorAdjust: "exact",
        }}
      >
        <span
          style={{
            fontSize: "10px",
            fontWeight: "700",
            lineHeight: "1",
            color: "#000000",
          }}
        >
          {title}
        </span>
      </div>

      <div
        style={{
          marginTop: "3mm",
          paddingLeft: "6mm",
          paddingRight: "4mm",
          fontSize: "10px",
        }}
      >
        {children}
      </div>
    </section>
  );
}

function PrintSubTitle({ title }) {
  return (
    <div
      style={{
        marginTop: "4.2mm",
        marginBottom: "1.4mm",
        fontSize: "10px",
        fontWeight: "700",
        textDecoration: "underline",
        lineHeight: "1.15",
      }}
    >
      {title}
    </div>
  );
}

function PrintRow({ label, value }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "68mm 5mm 1fr",
        columnGap: "0",
        paddingTop: "0.35mm",
        paddingBottom: "0.35mm",
        lineHeight: "1.15",
        fontSize: "10px",
        alignItems: "start",
      }}
    >
      <div>{label}</div>
      <div>:</div>
      <div
        style={{
          fontWeight: "700",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {value || "-"}
      </div>
    </div>
  );
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

function formatYesNo(value) {
  if (!value) return "-";
  if (value === "yes") return "Yes";
  if (value === "no") return "No";
  return value;
}

export default AdminStep9Page;
