import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import UserDashboardLayout from "../../layout/UserDashboardLayout";
import { apiRequest } from "../../services/api";

function UserApplicationsPage() {
  const navigate = useNavigate();

  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showGuidelines, setShowGuidelines] = useState(false);

  const [filters, setFilters] = useState({
    division: "ALL",
    digitalReference: "",
    submissionType: "ALL",
    submissionDate: "",
    submissionStatus: "ALL",
    proposalTitle: "",
  });

  useEffect(() => {
    fetchApplications();
  }, []);

  async function fetchApplications() {
    try {
      const data = await apiRequest("/applications/");
      const list = Array.isArray(data) ? data : data?.results || [];
      setApplications(list);
    } catch (err) {
      console.error("Failed to load user applications:", err);
    } finally {
      setLoading(false);
    }
  }

  const filteredApplications = useMemo(() => {
    return applications.filter((app) => {
      const formData = app.form_data || {};
      const step1 = formData.step_1 || {};
      const step2 = formData.step_2 || {};

      const division = step1.division || "KUCHING";
      const reference = app.reference_no || `FT-${String(app.id).padStart(5, "0")}`;
      const type =
        step1.application_type_label || "Application of Siting Project";
      const status = getApplicationStatus(app);
      const title = step1.project_name || app.title || "";
      const applicant = step2.org_name || step2.full_name || "";

      const createdDate = app.created_at
        ? new Date(app.created_at).toISOString().slice(0, 10)
        : "";

      if (filters.division !== "ALL" && division !== filters.division) {
        return false;
      }

      if (
        filters.digitalReference &&
        !reference.toLowerCase().includes(filters.digitalReference.toLowerCase())
      ) {
        return false;
      }

      if (filters.submissionType !== "ALL" && type !== filters.submissionType) {
        return false;
      }

      if (filters.submissionDate && createdDate !== filters.submissionDate) {
        return false;
      }

      if (
        filters.submissionStatus !== "ALL" &&
        status !== filters.submissionStatus
      ) {
        return false;
      }

      if (
        filters.proposalTitle &&
        !`${title} ${applicant}`
          .toLowerCase()
          .includes(filters.proposalTitle.toLowerCase())
      ) {
        return false;
      }

      return true;
    });
  }, [applications, filters]);

  function updateFilter(field, value) {
    setFilters((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function resetFilters() {
    setFilters({
      division: "ALL",
      digitalReference: "",
      submissionType: "ALL",
      submissionDate: "",
      submissionStatus: "ALL",
      proposalTitle: "",
    });
  }

  function handleView(app) {
    navigate(`/applications/${app.id}/declaration?id=${app.id}`);
  }

  function handleContinue(app) {
    const step = Number(app.current_step || 1);

    const stepRoutes = {
      1: "edit",
      2: "client-department",
      3: "submitting-person",
      4: "land-details",
      5: "building-plan",
      6: "proposal-analysis",
      7: "site-inspection",
      8: "building-plan-checklist",
      9: "print-form",
      10: "supporting-document",
      11: "declaration",
    };

    const path = stepRoutes[step] || "edit";
    navigate(`/applications/${app.id}/${path}?id=${app.id}`);
  }

  function handleProceedNewApplication() {
    setShowGuidelines(false);
    navigate("/applications/new");
  }

  return (
    <UserDashboardLayout>
      <div className="space-y-5">
        <SearchPanel
          filters={filters}
          updateFilter={updateFilter}
          resetFilters={resetFilters}
        />

        <section className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-6 w-1 bg-[#18b36b]" />
                <h1 className="text-sm font-bold uppercase tracking-wide text-slate-800">
                  List of Siting Applications
                </h1>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Search result for your submitted and draft fasTrack applications.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowGuidelines(true)}
              className="inline-flex items-center justify-center rounded bg-[#006d32] px-4 py-2 text-xs font-bold text-white hover:bg-[#005224]"
            >
              + New Application
            </button>
          </div>

          {loading ? (
            <div className="p-6 text-sm text-slate-500">
              Loading applications...
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1180px] text-[12px]">
                  <thead className="bg-[#f1f5f4] text-slate-700">
                    <tr>
                      <TableHead className="w-[44px] text-center">#</TableHead>
                      <TableHead className="w-[92px]">Division</TableHead>
                      <TableHead className="w-[150px]">
                        fasTrack Reference No.
                      </TableHead>
                      <TableHead className="w-[220px]">Applicant</TableHead>
                      <TableHead className="w-[320px]">
                        Land Information
                      </TableHead>
                      <TableHead className="w-[280px]">
                        Nature of Application
                      </TableHead>
                      <TableHead className="w-[140px]">Status</TableHead>
                      <TableHead className="w-[140px]">Created Date</TableHead>
                      <TableHead className="w-[120px] text-center">
                        Action
                      </TableHead>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredApplications.length === 0 ? (
                      <tr>
                        <td
                          colSpan={9}
                          className="border-t border-slate-200 px-3 py-10 text-center text-sm text-slate-500"
                        >
                          No applications found.
                        </td>
                      </tr>
                    ) : (
                      filteredApplications.map((app, index) => {
                        const formData = app.form_data || {};
                        const step1 = formData.step_1 || {};
                        const step2 = formData.step_2 || {};
                        const status = getApplicationStatus(app);

                        return (
                          <tr
                            key={app.id}
                            className={`transition-colors hover:bg-[#eef7f1] ${
                              index % 2 === 0 ? "bg-[#f7fbf5]" : "bg-white"
                            }`}
                          >
                            <TableCell center>{index + 1}</TableCell>

                            <TableCell>
                              <span className="font-semibold text-slate-800">
                                {step1.division || "KUCHING"}
                              </span>
                            </TableCell>

                            <TableCell>
                              <p className="font-bold text-[#00843d]">
                                {app.reference_no ||
                                  `FT-${String(app.id).padStart(5, "0")}`}
                              </p>
                              <p className="mt-0.5 text-[10px] text-slate-500">
                                {step1.agency_reference ||
                                  step1.reference_no ||
                                  "-"}
                              </p>
                            </TableCell>

                            <TableCell>
                              <p className="font-semibold text-slate-900">
                                {step2.org_name ||
                                  step2.full_name ||
                                  step1.department_name ||
                                  step1.agency_name ||
                                  "Applicant"}
                              </p>
                            </TableCell>

                            <TableCell>
                              <p className="leading-relaxed text-slate-700">
                                {getLandInformation(step1) ||
                                  "No land information provided."}
                              </p>
                            </TableCell>

                            <TableCell>
                              <p className="leading-relaxed text-slate-800">
                                {getNatureOfApplication(step1)}
                              </p>
                            </TableCell>

                            <TableCell>
                              <StatusBadge status={status} />
                            </TableCell>

                            <TableCell>{formatDateTime(app.created_at)}</TableCell>

                            <TableCell center>
                              {status === "Draft" ? (
                                <button
                                  type="button"
                                  onClick={() => handleContinue(app)}
                                  className="rounded bg-[#006d32] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#005224]"
                                >
                                  Continue
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleView(app)}
                                  className="rounded border border-[#006d32] bg-white px-3 py-1.5 text-[11px] font-bold text-[#006d32] hover:bg-emerald-50"
                                >
                                  View
                                </button>
                              )}
                            </TableCell>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="border-t border-slate-200 bg-white px-4 py-3 text-[11px] font-semibold text-slate-600">
                Record 1 to {filteredApplications.length} of{" "}
                {filteredApplications.length}
              </div>
            </>
          )}
        </section>
      </div>

      {showGuidelines && (
        <GuidelinesModal
          onClose={() => setShowGuidelines(false)}
          onProceed={handleProceedNewApplication}
        />
      )}
    </UserDashboardLayout>
  );
}

function SearchPanel({ filters, updateFilter, resetFilters }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-6 w-1 bg-[#18b36b]" />
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">
            Search Siting Applications
          </h2>
        </div>

        <span className="material-symbols-outlined text-[20px] text-[#18b36b]">
          expand_less
        </span>
      </div>

      <div className="bg-[#f7f7f7] p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Field label="Division">
            <select
              value={filters.division}
              onChange={(event) => updateFilter("division", event.target.value)}
              className="official-input"
            >
              <option value="ALL">ALL</option>
              <option value="KUCHING">KUCHING</option>
              <option value="SIBU">SIBU</option>
              <option value="MIRI">MIRI</option>
              <option value="BINTULU">BINTULU</option>
            </select>
          </Field>

          <Field label="fasTrack Reference">
            <input
              value={filters.digitalReference}
              onChange={(event) =>
                updateFilter("digitalReference", event.target.value)
              }
              placeholder="FT.YYYY-00000"
              className="official-input"
            />
          </Field>

          <Field label="Submission Type">
            <select
              value={filters.submissionType}
              onChange={(event) =>
                updateFilter("submissionType", event.target.value)
              }
              className="official-input"
            >
              <option value="ALL">ALL</option>
              <option value="Application of Siting Project">
                Application of Siting Project
              </option>
            </select>
          </Field>

          <Field label="Submission Date">
            <input
              type="date"
              value={filters.submissionDate}
              onChange={(event) =>
                updateFilter("submissionDate", event.target.value)
              }
              className="official-input"
            />
          </Field>

          <Field label="Submission Status" className="md:col-span-2">
            <select
              value={filters.submissionStatus}
              onChange={(event) =>
                updateFilter("submissionStatus", event.target.value)
              }
              className="official-input"
            >
              <option value="ALL">ALL</option>
              <option value="Draft">Draft</option>
              <option value="Submitted">Submitted</option>
              <option value="Completed">Completed</option>
            </select>
          </Field>

          <Field label="Proposal Title" className="md:col-span-2">
            <input
              value={filters.proposalTitle}
              onChange={(event) =>
                updateFilter("proposalTitle", event.target.value)
              }
              placeholder="Search proposal title or applicant"
              className="official-input"
            />
          </Field>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={resetFilters}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            Reset
          </button>
        </div>
      </div>
    </section>
  );
}

function GuidelinesModal({ onClose, onProceed }) {
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 px-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="h-8 w-1 bg-[#18b36b]" />
            <h2 className="text-lg font-semibold text-slate-800">
              fasTrack Guidelines
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-xl leading-none text-slate-400 hover:text-slate-700"
          >
            ×
          </button>
        </div>

        <div className="max-h-[72vh] overflow-y-auto px-8 py-6 text-[12px] leading-relaxed text-slate-700">
          <ol className="list-decimal space-y-3 pl-5">
            <li>
              Applicant must first consult the{" "}
              <strong>Department of Land and Surveys (L&amp;S)</strong> of the
              division or Bintulu Development Authority (BDA). This is known as{" "}
              <strong>Preliminary Stage</strong>, where discussion between client
              and agency is held at L&amp;S/BDA office.
              <ul className="mt-2 list-disc space-y-1 pl-6">
                <li>to identify the site;</li>
                <li>to carry out joint-site inspection;</li>
                <li>to accept the selected site.</li>
              </ul>
              Once the Preliminary Stage is completed, L&amp;S and BDA will
              advise the client to proceed with online submission using fasTrack.
            </li>

            <li>
              The siting application for{" "}
              <strong>federal government projects</strong> shall be submitted
              through the relevant technical agency.
            </li>

            <li>
              Application for cemeteries, mosques, surau and related religious
              facilities shall be submitted through the relevant authority.
            </li>

            <li>
              All applications submitted by NGOs related to religious purpose
              should be submitted through the relevant unit with recommendation
              to the approving department.
            </li>

            <li>
              The applicant must submit the complete application form and all
              supporting documents required by fasTrack.
            </li>

            <li>
              The application for community hall, football field and other public
              facilities shall be reviewed by the relevant government agencies.
            </li>

            <li>
              Availability of fund is <strong>compulsory</strong>. If there is no
              fund, the application will not be able to register, process or
              submit through the system.
            </li>

            <li>
              All submissions must use the online <strong>Siting Form</strong>,
              fully signed, printed and uploaded into Supporting Document.
            </li>

            <li>
              All documents must be submitted <strong>electronically</strong> /
              digitally via fasTrack online.
            </li>
          </ol>

          <button
            type="button"
            onClick={onProceed}
            className="mt-6 inline-flex items-center gap-2 rounded bg-[#18b36b] px-4 py-2 text-sm font-bold text-white hover:bg-[#128a53]"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Proceed
          </button>
        </div>
      </div>
    </div>
  );
}

function getLandInformation(step1) {
  return (
    step1.land_information ||
    step1.land_info ||
    step1.affected_land ||
    step1.affectedLand ||
    step1.locality_address ||
    step1.site_address ||
    step1.address ||
    ""
  );
}

function getNatureOfApplication(step1) {
  const title = step1.project_name || step1.proposal_title || "-";
  const type = step1.application_type_label || "Application of Siting Project";

  if (title === "-") return type.toUpperCase();

  return `${type.toUpperCase()} - ${title.toUpperCase()}`;
}

function getApplicationStatus(app) {
  const formData = app.form_data || {};
  const step11 = formData.step_11 || {};

  if (
    step11.submitted === true ||
    step11.status === "Submitted" ||
    app.status === "submitted" ||
    app.status === "Submitted"
  ) {
    return "Submitted";
  }

  return "Draft";
}

function StatusBadge({ status }) {
  const normalized = String(status || "").toLowerCase();

  let className = "border-slate-200 bg-slate-50 text-slate-700";

  if (normalized.includes("submitted")) {
    className = "border-emerald-200 bg-emerald-50 text-emerald-700";
  } else if (normalized.includes("draft")) {
    className = "border-amber-200 bg-amber-50 text-amber-700";
  } else if (normalized.includes("completed")) {
    className = "border-blue-200 bg-blue-50 text-blue-700";
  }

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${className}`}
    >
      {status}
    </span>
  );
}

function Field({ label, children, className = "" }) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-700">
        {label}
      </label>
      {children}
    </div>
  );
}

function TableHead({ children, className = "" }) {
  return (
    <th
      className={`border-b border-slate-200 px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide ${className}`}
    >
      {children}
    </th>
  );
}

function TableCell({ children, center = false }) {
  return (
    <td
      className={`border-b border-slate-200 px-3 py-3 align-top leading-relaxed ${
        center ? "text-center align-middle" : ""
      }`}
    >
      {children}
    </td>
  );
}

function formatDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default UserApplicationsPage;