import DashboardLayout from "../../../layout/DashboardLayout";
import { Link } from "react-router-dom";
import ApplicationStepNav from "../../../components/ApplicationStepNav";

function SiteInspectionPage() {
  return (
    <DashboardLayout>
      <div className="flex gap-5">
        <ApplicationStepNav active={7} />

        <main className="flex-1 min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="bg-[#18b36b] text-white text-sm font-bold px-3 py-1">
                7
              </span>
              <h1 className="text-xl font-semibold text-[#1a1c1c]">
                Site Inspection
              </h1>
            </div>

            <div className="flex gap-2">
              <Link
                to="/applications/proposal-analysis"
                className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
              >
                ← Back
              </Link>

              <Link
                to="/applications/building-plan-checklist"
                className="px-3 py-1.5 bg-[#006d32] text-white rounded text-xs font-semibold hover:bg-[#005224]"
              >
                Save & Next
              </Link>
            </div>
          </div>

          <section className="bg-white border border-slate-200 rounded-sm overflow-hidden">
            <ApplicationReference />

            <div className="p-5 space-y-4">
              <FormSection title="A) PARTICULARS OF OFFICER CARRYING OUT SITE INSPECTION">
                <Field label="Date of site inspection carried out" required>
                  <input type="date" className="spa-input" />
                </Field>

                <Field label="Name of Officer" required>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px] border border-slate-200">
                      <thead className="bg-[#f1f5f4]">
                        <tr>
                          <TableHead></TableHead>
                          <TableHead>Name of Officer</TableHead>
                          <TableHead>Designation</TableHead>
                          <TableHead>Agency</TableHead>
                          <TableHead>
                            To specify if not related under Client Agent
                          </TableHead>
                        </tr>
                      </thead>

                      <tbody>
                        {[
                          ["NOORFARAH BINTI AHMAD", "ASSISTANT PLANNER OF", "Land and Survey Department Sarawak", ""],
                          ["SAMSURY BIN SAHARI", "PEGAWAI TADBIR", "Kuching North City Hall", ""],
                          ["CHEN CHONG HONG", "BORNEO FRESH PORK", "-- Please Select --", "BORNEO FRESH PORK"],
                          ["KELLY TAEK HIA SINH", "TRADING MANAGEMENT", "-- Please Select --", "BORNEO FRESH PORK"],
                        ].map((row, index) => (
                          <tr key={index} className="bg-[#e7f5df]">
                            <td className="border p-2 text-center">
                              <input type="checkbox" />
                            </td>
                            <td className="border p-2">
                              <input className="spa-input h-[28px] text-[11px]" defaultValue={row[0]} />
                            </td>
                            <td className="border p-2">
                              <input className="spa-input h-[28px] text-[11px]" defaultValue={row[1]} />
                            </td>
                            <td className="border p-2">
                              <select className="spa-input h-[28px] text-[11px]" defaultValue={row[2]}>
                                <option>Land and Survey Department Sarawak</option>
                                <option>Kuching North City Hall</option>
                                <option>-- Please Select --</option>
                              </select>
                            </td>
                            <td className="border p-2">
                              <input className="spa-input h-[28px] text-[11px]" defaultValue={row[3]} />
                            </td>
                          </tr>
                        ))}

                        <tr className="bg-[#e7f5df]">
                          <td className="border p-2 text-center">
                            <input type="checkbox" />
                          </td>
                          <td className="border p-2">
                            <input className="spa-input h-[28px] text-[11px]" />
                          </td>
                          <td className="border p-2">
                            <input className="spa-input h-[28px] text-[11px]" />
                          </td>
                          <td className="border p-2">
                            <select className="spa-input h-[28px] text-[11px]">
                              <option>-- Please Select --</option>
                            </select>
                          </td>
                          <td className="border p-2">
                            <input className="spa-input h-[28px] text-[11px]" />
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </Field>
              </FormSection>

              <FormSection title="B) SITE OBSERVATION DETAIL">
                <SubSection title="1) EXISTING ROAD ACCESS">
                  <RadioField label="Any access to the site" />
                  <RadioField label="Physical Access" />
                  <RadioField label="Legal Access" />
                  <Field label="Type of road surface for access" required>
                    <select className="spa-input">
                      <option>Tar Sealed</option>
                      <option>Gravel</option>
                      <option>Earth Road</option>
                    </select>
                  </Field>
                  <Field label="Width of carriageway" required>
                    <input className="spa-input" defaultValue="7.4m" />
                  </Field>
                  <Field label="Condition of carriageway" required>
                    <select className="spa-input">
                      <option>Good</option>
                      <option>Fair</option>
                      <option>Poor</option>
                    </select>
                  </Field>
                  <RadioField label="Right of way" />
                </SubSection>

                <SubSection title="2) PRESENT USAGE">
                  <Field label="Subject land" required>
                    <textarea className="spa-input h-20 resize-none" defaultValue="SHOPLOT" />
                  </Field>

                  <Field label="Neighbouring land (adjoining land)" required>
                    <textarea
                      className="spa-input h-20 resize-none"
                      defaultValue="COMMERCIAL ACTIVITY"
                    />
                  </Field>
                </SubSection>

                <SubSection title="3) EXISTING PUBLIC UTILITIES">
                  <RadioField label="Water supply" />
                  <RadioField label="Electricity supply" />
                  <RadioField label="Telecommunication" />
                  <RadioField label="Gas supply" />
                </SubSection>

                <SubSection title="4) EXISTING SITE CONDITION">
                  <RadioField label="Site Topography - Any cutting of land" />
                  <RadioField label="Any filling of land" />
                  <RadioField label="Bio-Diversity to be retained" />
                  <RadioField label="Any drainage" />

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Field label="Type of Drain" required>
                      <select className="spa-input">
                        <option>Roadside Concrete Drain</option>
                        <option>Earth Drain</option>
                        <option>Natural Drainage</option>
                      </select>
                    </Field>

                    <Field label="Size of Drain" required>
                      <input className="spa-input" defaultValue="1.5" />
                    </Field>

                    <Field label="Direction of flow" required>
                      <select className="spa-input">
                        <option>TO EXIT SIDE</option>
                        <option>TO ROAD SIDE</option>
                        <option>TO REAR SIDE</option>
                      </select>
                    </Field>
                  </div>
                </SubSection>
              </FormSection>

              <div className="flex justify-end gap-2 pt-2">
                <Link
                  to="/applications/proposal-analysis"
                  className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
                >
                  ← Back
                </Link>

                <Link
                  to="/applications/building-plan-checklist"
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
        <p className="font-semibold text-[#006d32]">
          Siting approval granted to applicant (Formal Approval)
        </p>

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
      <div className="bg-white border-b-2 border-[#18b36b] px-3 py-2">
        <h2 className="text-xs font-bold text-slate-700">{title}</h2>
      </div>

      <div className="p-4 space-y-4 bg-white">{children}</div>
    </section>
  );
}

function SubSection({ title, children }) {
  return (
    <section className="bg-[#f5f5f5] border border-slate-200 rounded-sm overflow-hidden">
      <div className="px-3 py-2 border-b bg-[#eeeeee]">
        <h3 className="text-[11px] font-bold text-slate-700">{title}</h3>
      </div>

      <div className="p-3 space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, children, required = false }) {
  return (
    <div>
      <label className="block text-[11px] font-bold text-slate-700 mb-1">
        {label}
        {(required || true) && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}

function RadioField({ label }) {
  return (
    <div>
      <p className="text-[11px] font-bold text-slate-700 mb-1">
        {label}
        <span className="text-red-500 ml-1">*</span>
      </p>

      <div className="flex items-center gap-5 text-xs">
        <label className="flex items-center gap-1">
          <input type="radio" name={label} defaultChecked />
          Yes
        </label>

        <label className="flex items-center gap-1">
          <input type="radio" name={label} />
          No
        </label>
      </div>
    </div>
  );
}

function TableHead({ children }) {
  return (
    <th className="border border-slate-200 px-2 py-2 text-left font-bold whitespace-nowrap">
      {children}
    </th>
  );
}

export default SiteInspectionPage;