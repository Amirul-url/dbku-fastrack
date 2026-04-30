import DashboardLayout from "../../../layout/DashboardLayout";
import { Link } from "react-router-dom";
import ApplicationStepNav from "../../../components/ApplicationStepNav";

function SubmittingPersonPage() {
  return (
    <DashboardLayout>
      <div className="flex gap-5">
        <ApplicationStepNav active={3} />

        <main className="flex-1 min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="bg-[#18b36b] text-white text-sm font-bold px-3 py-1">
                3
              </span>
              <h1 className="text-xl font-semibold text-[#1a1c1c]">
                Details of Submitting Person
              </h1>
            </div>

            <div className="flex gap-2">
              <Link
                to="/applications/client-department"
                className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
              >
                ← Back
              </Link>

              <Link
                to="/applications/land-details"
                className="px-3 py-1.5 bg-[#006d32] text-white rounded text-xs font-semibold hover:bg-[#005224]"
              >
                Save & Next
              </Link>
            </div>
          </div>

          <section className="bg-white border border-slate-200 rounded-sm overflow-hidden">
            <ApplicationReference />

            <div className="p-5 space-y-4">
              <FormSection title="Organisation">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Organisation Type" required>
                    <select className="spa-input" defaultValue="Local Authority">
                      <option>Local Authority</option>
                      <option>Company</option>
                      <option>Government Agency</option>
                      <option>Individual</option>
                    </select>
                  </Field>

                  <Field label="Registration Number (if applicable)">
                    <input className="spa-input" defaultValue="-" />
                  </Field>

                  <Field label="Name" required>
                    <input
                      className="spa-input"
                      defaultValue="DEWAN BANDARAYA KUCHING UTARA (DBKU)"
                    />
                  </Field>

                  <Field label="Branch Name">
                    <input className="spa-input" defaultValue="DBKU" />
                  </Field>

                  <Field label="Postal Address" required>
                    <input
                      className="spa-input"
                      defaultValue="DBKU, BUKIT SIOL, JALAN SEMARIANG PETRA JAYA"
                    />
                  </Field>

                  <Field label="Postcode" required>
                    <input className="spa-input" defaultValue="93050" />
                  </Field>

                  <Field label="Address 2">
                    <input className="spa-input" />
                  </Field>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="State" required>
                      <input className="spa-input" defaultValue="Sarawak" />
                    </Field>

                    <Field label="City" required>
                      <input className="spa-input" defaultValue="Kuching" />
                    </Field>
                  </div>

                  <Field label="Address 3">
                    <input className="spa-input" />
                  </Field>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Country Code" required>
                      <select className="spa-input" defaultValue="+60 Malaysia">
                        <option>+60 Malaysia</option>
                      </select>
                    </Field>

                    <Field label="Telephone No" required>
                      <input className="spa-input" defaultValue="082512955" />
                    </Field>
                  </div>

                  <Field label="Address 4">
                    <input className="spa-input" />
                  </Field>
                </div>
              </FormSection>

              <FormSection title="Submitting Person">
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Country Code" required>
                      <select className="spa-input" defaultValue="+60 Malaysia">
                        <option>+60 Malaysia</option>
                      </select>
                    </Field>

                    <Field label="Telephone No (Mobile)" required>
                      <input className="spa-input" defaultValue="0198265638" />
                    </Field>
                  </div>

                  <Field label="Identity Card No" required>
                    <input className="spa-input" defaultValue="720214-13-6049" />
                  </Field>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Country Code" required>
                      <select className="spa-input" defaultValue="+60 Malaysia">
                        <option>+60 Malaysia</option>
                      </select>
                    </Field>

                    <Field label="Telephone No (Office)" required>
                      <input className="spa-input" defaultValue="082512955" />
                    </Field>
                  </div>

                  <Field label="Email" required>
                    <input className="spa-input" defaultValue="samsurys@dbku.gov.my" />
                  </Field>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Country Code">
                      <select className="spa-input" defaultValue="+60 Malaysia">
                        <option>+60 Malaysia</option>
                      </select>
                    </Field>

                    <Field label="Telephone No (Fax)">
                      <input className="spa-input" placeholder="Fax Number" />
                    </Field>
                  </div>
                </div>
              </FormSection>

              <div className="flex justify-end gap-2 pt-2">
                <Link
                  to="/applications/client-department"
                  className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
                >
                  ← Back
                </Link>

                <Link
                  to="/applications/land-details"
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

function FormSection({ title, children }) {
  return (
    <section className="border border-slate-200 rounded-sm overflow-hidden">
      <div className="bg-[#f7f7f7] border-b border-slate-900 px-3 py-2">
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