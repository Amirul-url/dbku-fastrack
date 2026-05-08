import { useEffect, useState } from "react";
import UserDashboardLayout from "../../../../layout/UserDashboardLayout";
import { Link, useLocation, useParams } from "react-router-dom";
import { apiRequest } from "../../../../services/api";
import UserApplicationStepNav from "../UserApplicationStepNav";

function LandDetailsPage() {
  const location = useLocation();
  const { applicationId: routeApplicationId } = useParams();
  const queryParams = new URLSearchParams(location.search);

  const applicationId = routeApplicationId || queryParams.get("id");

  const storedUser = localStorage.getItem("fastrack_user");
  const user = storedUser ? JSON.parse(storedUser) : null;

  const Layout = UserDashboardLayout;

  const [step1, setStep1] = useState({});
  const [affectedArea, setAffectedArea] = useState("");

  const rawLandArea = Number(step1.area_required || 0);

  // formatted values
  const landArea = rawLandArea.toFixed(2);        // 7 → 7.00
  const landAreaAc = (rawLandArea * 0.000247105).toFixed(4);

  const affectedAreaNum = Number(affectedArea || 0);
  const affectedAreaAc = (affectedAreaNum * 0.000247105).toFixed(4);

  useEffect(() => {
    if (applicationId) loadStep1();
  }, [applicationId]);

  useEffect(() => {
    if (step1.area_required && !affectedArea) {
      setAffectedArea(step1.area_required);
    }
  }, [step1, affectedArea]);

  async function loadStep1() {
    try {
      const data = await apiRequest(`/applications/${applicationId}/`);
      setStep1(data.form_data?.step_1 || {});
    } catch (err) {
      console.error("Failed load step 1:", err);
    }
  }

  return (
    <Layout>
      <div className="flex gap-5">
        <UserApplicationStepNav active={4} />

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
                to={`/applications/${applicationId}/submitting-person?id=${applicationId}`}
                className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
              >
                ← Back
              </Link>

              <Link
                to={`/applications/${applicationId}/building-plan?id=${applicationId}`}
                className="px-3 py-1.5 bg-[#006d32] text-white rounded text-xs font-semibold hover:bg-[#005224]"
              >
                Save & Next
              </Link>
            </div>
          </div>

          <section className="bg-white border border-slate-200 rounded-sm overflow-hidden">
            <ApplicationReference step1={step1} />

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
                          {step1.project_name || "-"}
                        </div>
                        <div>{step1.locality_address || "-"}</div>
                        <div>{step1.division || "-"}</div>
                      </TableCell>

                      <TableCell>
                        <span className="whitespace-nowrap">
                          {landArea} Sq. M
                        </span>
                      </TableCell>

                      <TableCell>-</TableCell>

                      <TableCell>-</TableCell>

                      <TableCell>-</TableCell>

                      <TableCell>
                        <span className="text-slate-500">Not Available</span>
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
                            value={affectedArea}
                            onChange={(e) => setAffectedArea(e.target.value)}
                          />

                          <select className="spa-input h-[28px] text-[11px] w-[80px]">
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
                        {landAreaAc} Ac.
                      </td>

                      <td colSpan="5" className="border-none"></td>

                      <td className="px-3 py-2 text-[11px] font-semibold border-none whitespace-nowrap text-right">
                        {affectedAreaAc} Ac.
                      </td>

                      <td colSpan="2" className="border-none"></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Link
                  to={`/applications/${applicationId}/submitting-person?id=${applicationId}`}
                  className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
                >
                  ← Back
                </Link>

                <Link
                  to={`/applications/${applicationId}/building-plan?id=${applicationId}`}
                  className="px-3 py-1.5 bg-[#006d32] text-white rounded text-xs font-semibold hover:bg-[#005224]"
                >
                  Save & Next
                </Link>
              </div>
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

        {user?.role !== "applicant" && (
          <>
            <p>Division</p>
            <p className="font-semibold text-[#006d32]">
              {step1.division || "KUCHING"}
            </p>
          </>
        )}
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