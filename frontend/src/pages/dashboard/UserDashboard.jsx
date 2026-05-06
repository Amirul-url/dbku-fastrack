import { useEffect, useMemo, useState } from "react";
import UserDashboardLayout from "../../layout/UserDashboardLayout";
import { apiRequest } from "../../services/api";
import { useNavigate } from "react-router-dom";

function UserDashboard() {
  const navigate = useNavigate();

  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showGuidelines, setShowGuidelines] = useState(false);

  useEffect(() => {
    fetchApplications();
  }, []);

  const stats = useMemo(() => {
    const total = applications.length;

    const submitted = applications.filter((app) =>
      isSubmittedApplication(app)
    ).length;

    const drafts = applications.filter((app) => !isSubmittedApplication(app))
      .length;

    return {
      total,
      submitted,
      drafts,
    };
  }, [applications]);

  const fetchApplications = async () => {
    try {
      const data = await apiRequest("/applications/");
      const list = Array.isArray(data) ? data : data?.results || [];
      setApplications(list);
    } catch (err) {
      console.error("Failed to load applications", err);
    } finally {
      setLoading(false);
    }
  };

  const handleProceed = () => {
    setShowGuidelines(false);
    navigate("/applications/new");
  };

  const handleContinue = (app) => {
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
  };

  const handleView = (app) => {
    navigate(`/applications/${app.id}/declaration?id=${app.id}`);
  };

  return (
    <UserDashboardLayout>
      <div className="space-y-6">
        <div className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="border-l-4 border-[#006d32] pl-4">
              <p className="text-xs font-bold uppercase tracking-wide text-[#006d32]">
                Applicant Portal
              </p>
              <h1 className="mt-1 text-2xl font-bold text-[#1a1c1c]">
                My Dashboard
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                View, continue, and monitor your siting applications.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowGuidelines(true)}
              className="inline-flex items-center justify-center gap-2 rounded bg-[#006d32] px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#005224]"
            >
              <span className="material-symbols-outlined text-[18px]">
                add_circle
              </span>
              New Application
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatCard label="Total Applications" value={stats.total} />
          <StatCard label="Draft / In Progress" value={stats.drafts} />
          <StatCard label="Submitted" value={stats.submitted} />
        </div>

        <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-[#f8faf9] px-5 py-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-bold text-slate-900">
                Application List
              </h2>
              <p className="text-xs text-slate-500">
                Official record of your submitted and draft siting applications.
              </p>
            </div>
          </div>

          <div className="p-5">
            {loading ? (
              <div className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                Loading applications...
              </div>
            ) : applications.length === 0 ? (
              <EmptyState onCreate={() => setShowGuidelines(true)} />
            ) : (
              <div className="overflow-x-auto rounded border border-slate-200">
                <table className="w-full min-w-[980px] text-left text-xs">
                  <thead className="bg-[#edf5ef] text-slate-700">
                    <tr>
                      <TableHead className="w-[52px] text-center">No.</TableHead>
                      <TableHead className="w-[160px]">Reference No.</TableHead>
                      <TableHead>Project / Application Title</TableHead>
                      <TableHead className="w-[170px]">Application Type</TableHead>
                      <TableHead className="w-[130px]">Status</TableHead>
                      <TableHead className="w-[120px]">Progress</TableHead>
                      <TableHead className="w-[140px]">Last Updated</TableHead>
                      <TableHead className="w-[130px] text-center">
                        Action
                      </TableHead>
                    </tr>
                  </thead>

                  <tbody>
                    {applications.map((app, index) => {
                      const formData = app.form_data || {};
                      const step1 = formData.step_1 || {};
                      const submitted = isSubmittedApplication(app);
                      const currentStep = Number(app.current_step || 1);

                      return (
                        <tr
                          key={app.id}
                          className={
                            index % 2 === 0
                              ? "bg-white"
                              : "bg-[#fbfdfb]"
                          }
                        >
                          <TableCell center>{index + 1}</TableCell>

                          <TableCell>
                            <div className="font-bold text-[#006d32]">
                              {app.reference_no || `APP-${app.id}`}
                            </div>
                            <div className="mt-0.5 text-[10px] text-slate-400">
                              ID: {app.id}
                            </div>
                          </TableCell>

                          <TableCell>
                            <div className="font-semibold text-slate-900">
                              {step1.project_name ||
                                app.title ||
                                "Untitled Application"}
                            </div>
                            <div className="mt-1 line-clamp-2 text-[11px] text-slate-500">
                              {step1.locality_address ||
                                step1.site_address ||
                                step1.address ||
                                "No site information provided."}
                            </div>
                          </TableCell>

                          <TableCell>
                            {step1.application_type_label ||
                              "Application of Siting Project"}
                          </TableCell>

                          <TableCell>
                            <StatusBadge submitted={submitted} app={app} />
                          </TableCell>

                          <TableCell>
                            <div className="font-semibold text-slate-700">
                              Step {currentStep} of 11
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
                              <div
                                className="h-full rounded-full bg-[#18b36b]"
                                style={{
                                  width: `${Math.min(
                                    100,
                                    Math.max(8, (currentStep / 11) * 100)
                                  )}%`,
                                }}
                              />
                            </div>
                          </TableCell>

                          <TableCell>
                            {formatDateTime(
                              app.updated_at ||
                                formData.step_11?.saved_at ||
                                formData.step_10?.saved_at ||
                                formData.step_9?.saved_at ||
                                app.created_at
                            )}
                          </TableCell>

                          <TableCell center>
                            {submitted ? (
                              <button
                                type="button"
                                onClick={() => handleView(app)}
                                className="inline-flex items-center justify-center rounded border border-[#006d32] bg-white px-3 py-1.5 text-[11px] font-bold text-[#006d32] hover:bg-emerald-50"
                              >
                                View
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleContinue(app)}
                                className="inline-flex items-center justify-center rounded bg-[#006d32] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#005224]"
                              >
                                Continue
                              </button>
                            )}
                          </TableCell>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {showGuidelines && (
        <GuidelinesModal
          onClose={() => setShowGuidelines(false)}
          onProceed={handleProceed}
        />
      )}
    </UserDashboardLayout>
  );
}

function isSubmittedApplication(app) {
  const formData = app.form_data || {};
  const step11 = formData.step_11 || {};

  return (
    step11.submitted === true ||
    step11.status === "Submitted" ||
    app.status === "submitted" ||
    app.status === "Submitted"
  );
}

function StatusBadge({ submitted, app }) {
  const rawStatus = app.status || "draft";

  if (submitted) {
    return (
      <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
        Submitted
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold capitalize text-amber-700">
      {rawStatus === "draft" ? "Draft" : rawStatus}
    </span>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-3xl font-bold text-[#006d32]">{value}</p>
    </div>
  );
}

function EmptyState({ onCreate }) {
  return (
    <div className="rounded border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-[#006d32]">
        <span className="material-symbols-outlined">description</span>
      </div>

      <h3 className="mt-3 text-sm font-bold text-slate-800">
        No applications yet
      </h3>

      <p className="mt-1 text-xs text-slate-500">
        Start a new siting application to begin the submission process.
      </p>

      <button
        type="button"
        onClick={onCreate}
        className="mt-4 rounded bg-[#006d32] px-4 py-2 text-xs font-bold text-white hover:bg-[#005224]"
      >
        + New Application
      </button>
    </div>
  );
}

function GuidelinesModal({ onClose, onProceed }) {
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/55 px-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded border border-slate-300 bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="h-7 w-1 bg-[#18b36b]" />
            <h2 className="text-lg font-normal text-slate-800">
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

        <div className="max-h-[75vh] overflow-y-auto px-9 py-7 text-[11px] leading-relaxed text-slate-700">
          <ol className="list-decimal space-y-3 pl-5">
            <li>
              Applicant must first consult the{" "}
              <strong>Department of Land and Surveys (L&amp;S)</strong> of the
              division or Bintulu Development Authority (BDA). This is known as{" "}
              <strong>Preliminary Stage</strong> which discussion between client
              and agency to be held at L&amp;S/BDA office. Under this stage,
              L&amp;S / BDA shall work together with the client:
              <ul className="mt-1 list-disc space-y-1 pl-6">
                <li>to identify the site;</li>
                <li>to carry out joint-site inspection;</li>
                <li>to accept the selected site.</li>
              </ul>
              Once the Preliminary Stage is completed, L&amp;S and BDA will
              advise the client to proceed with online submission using
              fasTrack.
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
              The application for community hall, football field and other
              public facilities shall be reviewed by the relevant government
              agencies.
            </li>

            <li>
              Availability of fund is <strong>compulsory</strong>. If there is
              no fund, the application will not be able to register, process or
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
            className="mt-6 inline-flex items-center gap-2 rounded-sm bg-[#18b36b] px-3 py-2 text-xs font-semibold text-white hover:bg-[#12975a]"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            Proceed
          </button>
        </div>
      </div>
    </div>
  );
}

function TableHead({ children, className = "" }) {
  return (
    <th
      className={`border border-slate-200 px-3 py-2.5 align-middle font-bold ${className}`}
    >
      {children}
    </th>
  );
}

function TableCell({ children, center = false }) {
  return (
    <td
      className={`border border-slate-200 px-3 py-3 align-top ${
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

  return date.toLocaleDateString("en-GB");
}

export default UserDashboard;