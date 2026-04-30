import DashboardLayout from "../../../layout/DashboardLayout";
import { Link } from "react-router-dom";
import ApplicationStepNav from "../../../components/ApplicationStepNav";

function PrintFormPage() {
  return (
    <DashboardLayout>
      <div className="flex gap-5">
        <ApplicationStepNav active={9} />

        <main className="flex-1 min-w-0">
          {/* HEADER */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="bg-[#18b36b] text-white text-sm font-bold px-3 py-1">
                9
              </span>
              <h1 className="text-xl font-semibold text-[#1a1c1c]">
                Print Form
              </h1>
            </div>

            <div className="flex gap-2">
              <Link
                to="/applications/building-plan-checklist"
                className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
              >
                ← Back
              </Link>

              <Link
                to="/applications/supporting-document"
                className="px-3 py-1.5 bg-[#006d32] text-white rounded text-xs font-semibold hover:bg-[#005224]"
              >
                Save & Next
              </Link>
            </div>
          </div>

          {/* CONTENT */}
          <section className="bg-white border border-slate-200 rounded-sm overflow-hidden">
            <ApplicationReference />

            <div className="p-6 space-y-6">
              {/* DESCRIPTION */}
              <div className="bg-[#f7f7f7] border border-slate-200 p-4 text-sm text-slate-600">
                Please review your application details before printing. Ensure all
                information is accurate before proceeding.
              </div>

              {/* ACTION BUTTONS */}
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-[#006d32] text-white rounded text-sm font-semibold hover:bg-[#005224]"
                >
                  🖨 Print Application Form
                </button>

                <button className="px-4 py-2 border border-slate-300 rounded text-sm font-semibold hover:bg-slate-50">
                  Download PDF
                </button>

                <button className="px-4 py-2 border border-slate-300 rounded text-sm font-semibold hover:bg-slate-50">
                  Preview Form
                </button>
              </div>

              {/* PREVIEW MOCK */}
              <div className="border border-slate-300 rounded bg-white p-6">
                <h2 className="text-lg font-bold mb-4 text-center">
                  Advertisement License Application Form
                </h2>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <Field label="Application No">
                    E.SPA.2025-1443
                  </Field>

                  <Field label="Applicant">
                    Borneo Fresh Pork
                  </Field>

                  <Field label="Project">
                    Billboard Installation
                  </Field>

                  <Field label="Location">
                    Jalan Angsa, Kuching
                  </Field>

                  <Field label="Submission Date">
                    29 Apr 2026
                  </Field>

                  <Field label="Status">
                    Prepare Case
                  </Field>
                </div>

                <div className="mt-6 text-xs text-slate-500">
                  This is a system-generated document. No signature is required.
                </div>
              </div>

              {/* FOOTER BUTTON */}
              <div className="flex justify-end gap-2 pt-4">
                <Link
                  to="/applications/building-plan-checklist"
                  className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
                >
                  ← Back
                </Link>

                <Link
                  to="/applications/supporting-document"
                  className="px-3 py-1.5 bg-[#006d32] text-white rounded text-xs font-semibold hover:bg-[#005224]"
                >
                  Save & Next
                </Link>
              </div>
            </div>
          </section>
        </main>
      </div>
    </DashboardLayout>
  );
}

function ApplicationReference() {
  return (
    <div className="bg-[#f5f5f5] border-b border-slate-200 px-4 py-3 text-xs">
      <div className="grid grid-cols-[140px_1fr] gap-y-1">
        <p>Digital Reference</p>
        <p className="font-semibold text-[#006d32]">E.SPA.2025-1443</p>

        <p>Agency Reference</p>
        <p className="font-semibold text-[#006d32]">SP/1D/159/2024</p>

        <p>Status</p>
        <p className="font-semibold text-[#006d32]">Prepare Case</p>

        <p>Application Type</p>
        <p className="font-semibold text-[#006d32]">
          Application of Siting Project
        </p>

        <p>Division</p>
        <p className="font-semibold text-[#006d32]">KUCHING</p>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-semibold">{children}</p>
    </div>
  );
}

export default PrintFormPage;