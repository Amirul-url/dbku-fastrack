import DashboardLayout from "../../../layout/DashboardLayout";
import { Link } from "react-router-dom";
import ApplicationStepNav from "../../../components/ApplicationStepNav";

function ClientDepartmentPage() {
  return (
    <DashboardLayout>
      <div className="flex gap-5">
        <ApplicationStepNav active={2} />

        <main className="flex-1 min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="bg-[#18b36b] text-white text-sm font-bold px-3 py-1">
                2
              </span>
              <h1 className="text-xl font-semibold text-[#1a1c1c]">
                Details of Client Department
              </h1>
            </div>

            <div className="flex gap-2">
              <Link
                to="/applications/new"
                className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
              >
                ← Back
              </Link>

              <Link
                to="/applications/submitting-person"
                className="px-3 py-1.5 bg-[#006d32] text-white rounded text-xs font-semibold hover:bg-[#005224]"
              >
                Save & Next
              </Link>
            </div>
          </div>

          <section className="bg-white border border-slate-200 rounded-sm overflow-hidden">
            <div className="bg-[#f5f5f5] border-b border-slate-200 px-4 py-3 text-xs">
              <p className="font-semibold text-[#006d32]">
                E.SPA.2025-1443 — Application of Siting Project
              </p>
            </div>

            <div className="p-5 space-y-4">
              <FormSection title="Organisation">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Organisation Type" required>
                    <input className="spa-input" defaultValue="Company" />
                  </Field>

                  <Field label="Registration Number (if applicable)">
                    <input className="spa-input" />
                  </Field>

                  <Field label="Name" required>
                    <input
                      className="spa-input"
                      defaultValue="PRECIOUS FOOD PRODUCTS SDN BHD"
                    />
                  </Field>

                  <Field label="Branch Name">
                    <input className="spa-input" />
                  </Field>

                  <Field label="Postal Address" className="md:col-span-1">
                    <input
                      className="spa-input"
                      defaultValue="GROUND FLOOR, LOT 3786, BLOCK 207, KCLD 225, JALAN ANGSANA"
                    />
                    <input className="spa-input mt-2" placeholder="Address 2" />
                    <input className="spa-input mt-2" placeholder="Address 3" />
                    <input className="spa-input mt-2" placeholder="Address 4" />
                  </Field>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Postcode">
                      <input className="spa-input" defaultValue="93150" />
                    </Field>

                    <Field label="State">
                      <input className="spa-input" defaultValue="Sarawak" />
                    </Field>

                    <Field label="City">
                      <input className="spa-input" defaultValue="Kuching" />
                    </Field>

                    <Field label="Telephone No">
                      <input className="spa-input" defaultValue="109611122" />
                    </Field>

                    <Field label="Country Code">
                      <input className="spa-input" defaultValue="(+60) Malaysia" />
                    </Field>
                  </div>
                </div>
              </FormSection>

              <FormSection title="Representative / Applicant (ie. Individual who signs the Siting Form)">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Honorary Title">
                    <input className="spa-input" defaultValue="Encik" />
                  </Field>

                  <Field label="Designation" required>
                    <input className="spa-input" defaultValue="PEGAWAI TADBIR (N10)" />
                  </Field>

                  <Field label="Full Name" required>
                    <input className="spa-input" defaultValue="SAMSURY BIN SAHARI" />
                  </Field>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Country Code">
                      <input className="spa-input" defaultValue="(+60) Malaysia" />
                    </Field>

                    <Field label="Telephone No (Mobile)">
                      <input className="spa-input" defaultValue="198265638" />
                    </Field>
                  </div>

                  <Field label="Identity Card No" required>
                    <input className="spa-input" defaultValue="720214-13-6049" />
                  </Field>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Country Code" required>
                      <input className="spa-input" defaultValue="(+60) Malaysia" />
                    </Field>

                    <Field label="Telephone No (Office)" required>
                      <input className="spa-input" defaultValue="82512955" />
                    </Field>
                  </div>

                  <Field label="Email" required>
                    <input className="spa-input" defaultValue="samsury@dbku.gov.my" />
                  </Field>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Country Code">
                      <input className="spa-input" defaultValue="(+60) Malaysia" />
                    </Field>

                    <Field label="Telephone No (Fax)">
                      <input className="spa-input" placeholder="Fax number" />
                    </Field>
                  </div>
                </div>
              </FormSection>

              <div className="flex justify-end gap-2 pt-2">
                <Link
                  to="/applications/new"
                  className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
                >
                  ← Back
                </Link>

                <Link
                  to="/applications/submitting-person"
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

export default ClientDepartmentPage;