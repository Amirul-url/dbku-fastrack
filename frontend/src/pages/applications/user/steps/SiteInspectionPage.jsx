import { useEffect, useState } from "react";
import UserDashboardLayout from "../../../../layout/UserDashboardLayout";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { apiRequest } from "../../../../services/api";
import UserApplicationStepNav from "../UserApplicationStepNav";

const emptyOfficer = {
  selected: false,
  name: "",
  designation: "",
  agency: "",
  otherAgency: "",
};

function SiteInspectionPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { applicationId: routeApplicationId } = useParams();
  const queryParams = new URLSearchParams(location.search);
  const applicationId = routeApplicationId || queryParams.get("id");

  const storedUser = localStorage.getItem("fastrack_user");
  const user = storedUser ? JSON.parse(storedUser) : null;
  const isApplicant = user?.role === "applicant";

  const Layout = UserDashboardLayout;

  const [inspectionDate, setInspectionDate] = useState("");
  const [officers, setOfficers] = useState([
    { ...emptyOfficer },
    { ...emptyOfficer },
    { ...emptyOfficer },
    { ...emptyOfficer },
    { ...emptyOfficer },
  ]);

  const [roadAccess, setRoadAccess] = useState({
    anyAccess: "",
    physicalAccess: "",
    legalAccess: "",
    roadSurface: "",
    carriagewayWidth: "",
    carriagewayCondition: "",
    rightOfWay: "",
  });

  const [presentUsage, setPresentUsage] = useState({
    subjectLand: "",
    neighbouringLand: "",
  });

  const [utilities, setUtilities] = useState({
    waterSupply: "",
    electricitySupply: "",
    telecommunication: "",
    gasSupply: "",
  });

  const [siteCondition, setSiteCondition] = useState({
    cuttingOfLand: "",
    fillingOfLand: "",
    buildingRetained: "",
    drainage: "",
    drainType: "",
    drainSize: "",
    flowDirection: "",
  });

  useEffect(() => {
    if (applicationId) loadStep7();
  }, [applicationId]);

  async function loadStep7() {
    try {
      const data = await apiRequest(`/applications/${applicationId}/`);
      const step7 = data.form_data?.step_7 || {};

      setInspectionDate(step7.inspection_date || "");
      setOfficers(
        step7.officers?.length
          ? step7.officers
          : [
              { ...emptyOfficer },
              { ...emptyOfficer },
              { ...emptyOfficer },
              { ...emptyOfficer },
              { ...emptyOfficer },
            ]
      );

      setRoadAccess(step7.road_access || {
        anyAccess: "",
        physicalAccess: "",
        legalAccess: "",
        roadSurface: "",
        carriagewayWidth: "",
        carriagewayCondition: "",
        rightOfWay: "",
      });

      setPresentUsage(step7.present_usage || {
        subjectLand: "",
        neighbouringLand: "",
      });

      setUtilities(step7.utilities || {
        waterSupply: "",
        electricitySupply: "",
        telecommunication: "",
        gasSupply: "",
      });

      setSiteCondition(step7.site_condition || {
        cuttingOfLand: "",
        fillingOfLand: "",
        buildingRetained: "",
        drainage: "",
        drainType: "",
        drainSize: "",
        flowDirection: "",
      });
    } catch (err) {
      console.error("Load Step 7 failed:", err);
    }
  }

  function updateOfficer(index, field, value) {
    setOfficers((current) =>
      current.map((officer, i) =>
        i === index ? { ...officer, [field]: value } : officer
      )
    );
  }

  async function handleSaveStep7() {
    if (!applicationId) {
      alert("Application ID is missing. Please continue from My Dashboard.");
      return;
    }

    try {
      const existingData = await apiRequest(`/applications/${applicationId}/`);

      await apiRequest(`/applications/${applicationId}/`, {
        method: "PATCH",
        body: JSON.stringify({
          current_step: 7,
          form_data: {
            ...(existingData.form_data || {}),
            step_7: {
              inspection_date: inspectionDate,
              officers,
              road_access: roadAccess,
              present_usage: presentUsage,
              utilities,
              site_condition: siteCondition,
              saved_at: new Date().toISOString(),
            },
          },
        }),
      });

      navigate(
        `/applications/${applicationId}/building-plan-checklist?id=${applicationId}`
      );
    } catch (err) {
      console.error("Step 7 save failed:", err);
      alert("Failed to save Step 7.");
    }
  }

  return (
    <Layout>
      <div className="flex gap-5">
        <UserApplicationStepNav active={7} />

        <main className="flex-1 min-w-0">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <span className="bg-[#18b36b] text-white text-sm font-bold px-3 py-1">
                7
              </span>
              <h1 className="text-xl font-semibold text-[#1a1c1c]">
                Site Inspection
              </h1>
            </div>

            <PageActions
              applicationId={applicationId}
              onSave={handleSaveStep7}
            />
          </div>

          <section className="bg-white border border-slate-200 rounded-sm overflow-hidden">
            <ApplicationReference />

            <div className="p-4 sm:p-5 space-y-4">
              <FormSection title="A.) PARTICULARS OF OFFICER CARRYING OUT SITE INSPECTION">
                <BoxField label="(a) Date of site inspection carried out" required>
                  <input
                    type="date"
                    className="spa-input bg-white"
                    value={inspectionDate}
                    onChange={(e) => setInspectionDate(e.target.value)}
                  />
                </BoxField>

                <BoxField label="(b) Name of Officer" required>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-[11px]">
                      <thead>
                        <tr>
                          <TableHead></TableHead>
                          <TableHead>Name of Officer *</TableHead>
                          <TableHead>Designation *</TableHead>
                          <TableHead>Agency</TableHead>
                          <TableHead>
                            To specify (if not listed under Client Agency)
                          </TableHead>
                        </tr>
                      </thead>

                      <tbody>
                        {officers.map((officer, index) => (
                          <tr
                            key={index}
                            className={index % 2 === 0 ? "bg-[#e7f5df]" : ""}
                          >
                            <td className="p-2 text-center">
                              <input
                                type="checkbox"
                                checked={officer.selected}
                                onChange={(e) =>
                                  updateOfficer(index, "selected", e.target.checked)
                                }
                              />
                            </td>

                            <td className="p-2">
                              <input
                                className="spa-input h-[32px] text-[11px]"
                                value={officer.name}
                                onChange={(e) =>
                                  updateOfficer(index, "name", e.target.value)
                                }
                              />
                            </td>

                            <td className="p-2">
                              <input
                                className="spa-input h-[32px] text-[11px]"
                                value={officer.designation}
                                onChange={(e) =>
                                  updateOfficer(index, "designation", e.target.value)
                                }
                              />
                            </td>

                            <td className="p-2">
                              <select
                                className="spa-input h-[32px] text-[11px]"
                                value={officer.agency}
                                onChange={(e) =>
                                  updateOfficer(index, "agency", e.target.value)
                                }
                              >
                                <option value="">--- Please Select ---</option>
                                <option value="Land and Survey Department Sarawak">
                                  Land and Survey Department Sarawak
                                </option>
                                <option value="Kuching North City Hall">
                                  Kuching North City Hall
                                </option>
                                <option value="Other">Other</option>
                              </select>
                            </td>

                            <td className="p-2">
                              <input
                                className="spa-input h-[32px] text-[11px]"
                                value={officer.otherAgency}
                                onChange={(e) =>
                                  updateOfficer(index, "otherAgency", e.target.value)
                                }
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </BoxField>
              </FormSection>

              <FormSection title="B.) SITE OBSERVATION DETAIL">
                <SubSection title="(1) EXISTING ROAD ACCESS">
                  <RadioBox
                    label="Any access to the site"
                    value={roadAccess.anyAccess}
                    onChange={(value) =>
                      setRoadAccess({ ...roadAccess, anyAccess: value })
                    }
                  />

                  <RadioBox
                    label="Physical Access"
                    value={roadAccess.physicalAccess}
                    onChange={(value) =>
                      setRoadAccess({ ...roadAccess, physicalAccess: value })
                    }
                  />

                  <RadioBox
                    label="Legal Access"
                    value={roadAccess.legalAccess}
                    onChange={(value) =>
                      setRoadAccess({ ...roadAccess, legalAccess: value })
                    }
                  />

                  <SelectBox
                    label="Type of road surface"
                    value={roadAccess.roadSurface}
                    onChange={(value) =>
                      setRoadAccess({ ...roadAccess, roadSurface: value })
                    }
                    options={["Tar-Sealed", "Gravel", "Earth Road", "Concrete"]}
                  />

                  <InputBox
                    label="Width of carriageway"
                    value={roadAccess.carriagewayWidth}
                    onChange={(value) =>
                      setRoadAccess({ ...roadAccess, carriagewayWidth: value })
                    }
                  />

                  <SelectBox
                    label="Condition of carriageway"
                    value={roadAccess.carriagewayCondition}
                    onChange={(value) =>
                      setRoadAccess({
                        ...roadAccess,
                        carriagewayCondition: value,
                      })
                    }
                    options={["Good", "Fair", "Poor"]}
                  />

                  <RadioBox
                    label="Right of way"
                    value={roadAccess.rightOfWay}
                    onChange={(value) =>
                      setRoadAccess({ ...roadAccess, rightOfWay: value })
                    }
                  />
                </SubSection>

                <SubSection title="(2) PRESENT USAGE">
                  <TextAreaBox
                    label="Subject land"
                    value={presentUsage.subjectLand}
                    onChange={(value) =>
                      setPresentUsage({ ...presentUsage, subjectLand: value })
                    }
                  />

                  <TextAreaBox
                    label="Neighbouring land (adjoining land)"
                    value={presentUsage.neighbouringLand}
                    onChange={(value) =>
                      setPresentUsage({
                        ...presentUsage,
                        neighbouringLand: value,
                      })
                    }
                  />
                </SubSection>

                <SubSection title="(3) EXISTING PUBLIC UTILITIES">
                  <RadioBox
                    label="Water supply"
                    value={utilities.waterSupply}
                    onChange={(value) =>
                      setUtilities({ ...utilities, waterSupply: value })
                    }
                  />

                  <RadioBox
                    label="Electricity supply"
                    value={utilities.electricitySupply}
                    onChange={(value) =>
                      setUtilities({ ...utilities, electricitySupply: value })
                    }
                  />

                  <RadioBox
                    label="Telecommunication"
                    value={utilities.telecommunication}
                    onChange={(value) =>
                      setUtilities({ ...utilities, telecommunication: value })
                    }
                  />

                  <RadioBox
                    label="Gas supply"
                    value={utilities.gasSupply}
                    onChange={(value) =>
                      setUtilities({ ...utilities, gasSupply: value })
                    }
                  />
                </SubSection>

                <SubSection title="(4) EXISTING SITE CONDITION">
                  <div className="space-y-2">
                    <p className="text-[11px] font-bold text-slate-700">
                      (a) Topography
                    </p>

                    <RadioBox
                      label="Any cutting of land"
                      value={siteCondition.cuttingOfLand}
                      onChange={(value) =>
                        setSiteCondition({
                          ...siteCondition,
                          cuttingOfLand: value,
                        })
                      }
                    />

                    <RadioBox
                      label="Any filling of land"
                      value={siteCondition.fillingOfLand}
                      onChange={(value) =>
                        setSiteCondition({
                          ...siteCondition,
                          fillingOfLand: value,
                        })
                      }
                    />
                  </div>

                  <RadioBox
                    label="(b) Building(s) to be retained"
                    value={siteCondition.buildingRetained}
                    onChange={(value) =>
                      setSiteCondition({
                        ...siteCondition,
                        buildingRetained: value,
                      })
                    }
                  />

                  <RadioBox
                    label="(c) Any drainage"
                    value={siteCondition.drainage}
                    onChange={(value) =>
                      setSiteCondition({ ...siteCondition, drainage: value })
                    }
                  />

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <SelectBox
                      label="Type of Drain"
                      value={siteCondition.drainType}
                      onChange={(value) =>
                        setSiteCondition({
                          ...siteCondition,
                          drainType: value,
                        })
                      }
                      options={[
                        "Road Concrete Drain",
                        "Roadside Concrete Drain",
                        "Earth Drain",
                        "Natural Drainage",
                      ]}
                    />

                    <InputBox
                      label="Size of Drain"
                      value={siteCondition.drainSize}
                      onChange={(value) =>
                        setSiteCondition({
                          ...siteCondition,
                          drainSize: value,
                        })
                      }
                    />

                    <SelectBox
                      label="Direction of flow"
                      value={siteCondition.flowDirection}
                      onChange={(value) =>
                        setSiteCondition({
                          ...siteCondition,
                          flowDirection: value,
                        })
                      }
                      options={[
                        "TO EAST SIDE",
                        "TO WEST SIDE",
                        "TO NORTH SIDE",
                        "TO SOUTH SIDE",
                        "TO ROAD SIDE",
                        "TO REAR SIDE",
                      ]}
                    />
                  </div>
                </SubSection>

                {!isApplicant && <InternalAdminReviewSection />}
              </FormSection>

              <div className="flex justify-end gap-2 pt-2">
                <PageActions
                  applicationId={applicationId}
                  onSave={handleSaveStep7}
                />
              </div>
            </div>
          </section>
        </main>
      </div>
    </Layout>
  );
}

function ApplicationReference() {
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
        <p className="font-semibold text-[#006d32]">Prepare Case</p>

        <p>Application Type</p>
        <p className="font-semibold text-[#006d32]">
          Application of Siting Project
        </p>
      </div>
    </div>
  );
}

function PageActions({ applicationId, onSave }) {
  return (
    <div className="flex gap-2">
      <Link
        to={`/applications/${applicationId}/proposal-analysis?id=${applicationId}`}
        className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
      >
        ← Back
      </Link>

      <button
        type="button"
        onClick={onSave}
        className="px-3 py-1.5 bg-[#006d32] text-white rounded text-xs font-semibold hover:bg-[#005224]"
      >
        Save & Next
      </button>
    </div>
  );
}

function FormSection({ title, children }) {
  return (
    <section className="border border-slate-200 rounded-sm overflow-hidden">
      <div className="bg-white border-b-2 border-[#18b36b] px-3 py-2">
        <h2 className="text-base font-semibold text-slate-700">{title}</h2>
      </div>

      <div className="p-3 space-y-4 bg-white">{children}</div>
    </section>
  );
}

function SubSection({ title, children }) {
  return (
    <section className="bg-[#f3f3f3] border border-slate-200 rounded-sm overflow-hidden">
      <div className="px-3 py-2 border-b bg-[#e9e9e9]">
        <h3 className="text-[12px] font-bold text-slate-700">{title}</h3>
      </div>

      <div className="p-3 space-y-3">{children}</div>
    </section>
  );
}

function BoxField({ label, children, required = false }) {
  return (
    <div className="bg-[#f7f7f7] border border-slate-200 p-3">
      <label className="block text-[11px] font-bold text-slate-700 mb-2">
        {label}
        {required && <span className="text-red-500 float-right">*</span>}
      </label>
      {children}
    </div>
  );
}

function InputBox({ label, value, onChange, required = true }) {
  return (
    <BoxField label={label} required={required}>
      <input
        className="spa-input bg-white"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </BoxField>
  );
}

function TextAreaBox({ label, value, onChange, required = true }) {
  return (
    <BoxField label={label} required={required}>
      <textarea
        className="spa-input bg-white min-h-[70px] resize-y"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </BoxField>
  );
}

function SelectBox({ label, value, onChange, options, required = true }) {
  return (
    <BoxField label={label} required={required}>
      <select
        className="spa-input bg-white"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">--- Please Select ---</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </BoxField>
  );
}

function RadioBox({ label, value, onChange }) {
  return (
    <BoxField label={label} required>
      <div className="flex items-center gap-7 text-xs">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={value === "Yes"}
            onChange={() => onChange("Yes")}
          />
          Yes
        </label>

        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={value === "No"}
            onChange={() => onChange("No")}
          />
          No
        </label>
      </div>
    </BoxField>
  );
}

function InternalAdminReviewSection() {
  return (
    <SubSection title="5) CHARGE CALCULATION TEMPLATE (ADMIN / STAFF ONLY)">
      <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-slate-700">
        This section is for DBKU admin/staff use only.
      </div>
    </SubSection>
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