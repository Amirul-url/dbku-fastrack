import DashboardLayout from "../../../layout/DashboardLayout";
import { Link } from "react-router-dom";
import ApplicationStepNav from "../../../components/ApplicationStepNav";

function LandDetailsPage() {
  return (
    <DashboardLayout>
      <div className="flex gap-5">
        <ApplicationStepNav active={4} />

        <main className="flex-1 min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="bg-[#18b36b] text-white text-sm font-bold px-3 py-1">
                4
              </span>
              <h1 className="text-xl font-semibold text-[#1a1c1c]">
                Details of Land(s)
              </h1>
            </div>

            <div className="flex gap-2">
              <Link
                to="/applications/submitting-person"
                className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
              >
                ← Back
              </Link>

              <Link
                to="/applications/building-plan"
                className="px-3 py-1.5 bg-[#006d32] text-white rounded text-xs font-semibold hover:bg-[#005224]"
              >
                Save & Next
              </Link>
            </div>
          </div>

          <section className="bg-white border border-slate-200 rounded-sm overflow-hidden">
            <ApplicationReference />

            <div className="p-4">
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] border border-slate-200">
                  <thead className="bg-white text-slate-700">
                    <tr>
                      <TableHead>#</TableHead>
                      <TableHead>Land Description</TableHead>
                      <TableHead>Land Area</TableHead>
                      <TableHead>Expiry Date</TableHead>
                      <TableHead>Land Classification</TableHead>
                      <TableHead>Type Of Land</TableHead>
                      <TableHead>Title Condition</TableHead>
                      <TableHead>Part / Whole</TableHead>
                      <TableHead>Affected Area</TableHead>
                      <TableHead>Site Description</TableHead>
                      <TableHead>Site Status</TableHead>
                    </tr>
                  </thead>

                  <tbody>
                    <tr className="bg-[#dff2d8] align-top">
                      <TableCell strong>1</TableCell>

                      <TableCell>
                        <div className="font-semibold">
                          Lot 3786 Block 207
                        </div>
                        <div>Kuching North</div>
                        <div>Land District</div>
                      </TableCell>

                      <TableCell>111.60 Sq. M</TableCell>

                      <TableCell>31/12/2037</TableCell>

                      <TableCell>MIXED ZONE LAND</TableCell>

                      <TableCell>
                        <div>Lease Of State</div>
                        <div>Land</div>
                      </TableCell>

                      <TableCell>
                        <button className="text-[#006d32] font-semibold hover:underline">
                          View
                        </button>
                      </TableCell>

                      <TableCell>
                        <select className="spa-input h-[28px] text-[11px]">
                          <option>Whole</option>
                          <option>Part</option>
                        </select>
                      </TableCell>

                      <TableCell>
                        <div className="flex gap-1">
                          <input
                            className="spa-input h-[28px] text-[11px]"
                            defaultValue="111.60"
                          />
                          <select className="spa-input h-[28px] text-[11px] w-[70px]">
                            <option>Sq. M</option>
                            <option>Ac.</option>
                          </select>
                        </div>
                      </TableCell>

                      <TableCell>
                        <input
                          className="spa-input h-[28px] text-[11px]"
                          placeholder="eg Site A"
                        />
                      </TableCell>

                      <TableCell>
                        <div className="space-y-1">
                          <label className="flex items-center gap-1">
                            <input
                              type="radio"
                              name="siteStatus"
                              defaultChecked
                            />
                            Existing
                          </label>

                          <label className="flex items-center gap-1">
                            <input type="radio" name="siteStatus" />
                            Proposed
                          </label>
                        </div>
                      </TableCell>
                    </tr>

                    <tr className="bg-white">
                      <td className="px-3 py-2 border-none"></td>

                      <td className="px-3 py-2 text-[11px] font-semibold text-slate-700 border-none whitespace-nowrap">
                        Total Area
                      </td>

                      <td className="px-3 py-2 text-[11px] font-semibold border-none whitespace-nowrap">
                        0.0276 Ac.
                      </td>

                      <td colSpan="5" className="border-none"></td>

                      <td className="px-3 py-2 text-[11px] font-semibold border-none whitespace-nowrap text-right">
                        0.0276 Ac.
                      </td>

                      <td colSpan="2" className="border-none"></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Link
                  to="/applications/submitting-person"
                  className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
                >
                  ← Back
                </Link>

                <Link
                  to="/applications/building-plan"
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

function TableHead({ children }) {
  return (
    <th className="px-2 py-2 border border-slate-200 text-left font-bold whitespace-nowrap">
      {children}
    </th>
  );
}

function TableCell({ children, strong = false }) {
  return (
    <td
      className={`px-2 py-2 border border-slate-200 ${
        strong ? "font-semibold" : ""
      }`}
    >
      {children}
    </td>
  );
}

export default LandDetailsPage;