import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import DashboardLayout from "../../layout/DashboardLayout";
import UserDashboardLayout from "../../layout/UserDashboardLayout";

const applications = [
  {
    id: "FT-2026-0001",
    applicant: "Borneo Media Sdn Bhd",
    type: "Billboard",
    zone: "Petra Jaya",
    submittedDate: "27 Apr 2026",
    status: "Technical Review",
    sla: "2 days left",
  },
  {
    id: "FT-2026-0002",
    applicant: "Kuching Food Hub",
    type: "Shop Signage",
    zone: "City Centre",
    submittedDate: "26 Apr 2026",
    status: "Pending Payment",
    sla: "On track",
  },
  {
    id: "FT-2026-0003",
    applicant: "Petra Jaya Enterprise",
    type: "Temporary Banner",
    zone: "Petra Jaya",
    submittedDate: "25 Apr 2026",
    status: "Correction Required",
    sla: "Action required",
  },
];

function ApplicationsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showGuidelines, setShowGuidelines] = useState(false);
  const storedUser = localStorage.getItem("fastrack_user");
  const user = storedUser ? JSON.parse(storedUser) : null;

  const Layout =
    user?.role === "applicant" ? UserDashboardLayout : DashboardLayout;

  useEffect(() => {
    if (location.state?.openGuidelines) {
      setShowGuidelines(true);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  function handleProceed() {
    setShowGuidelines(false);
    navigate("/applications/new");
  }

  return (
    <Layout>
      <div className="mb-5 border-l-4 border-[#006d32] pl-4">
        <p className="text-xs uppercase tracking-wide font-semibold text-[#006d32] mb-1">
          Application Management
        </p>

        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#1a1c1c]">
              Applications
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Search, monitor, and manage advertisement license applications.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowGuidelines(true)}
            className="inline-flex justify-center px-4 py-2 bg-[#006d32] text-white rounded text-sm font-semibold hover:bg-[#005224]"
          >
            + New Application
          </button>
        </div>
      </div>

      <section className="bg-white border border-slate-200 rounded-md overflow-hidden mb-6">
        <div className="border-t-4 border-[#006d32] px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-[#1a1c1c]">
            Search Criteria
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Filter applications by ID, applicant, status, zone, or license type.
          </p>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-4 gap-4">
          <Field label="Application ID / Applicant" className="md:col-span-2">
            <input
              placeholder="Search application ID or applicant..."
              className="form-input"
            />
          </Field>

          <Field label="Status">
            <select className="form-input">
              <option>All Status</option>
              <option>Submitted</option>
              <option>Auto Screening</option>
              <option>Technical Review</option>
              <option>Officer Approval</option>
              <option>Pending Payment</option>
              <option>License Issued</option>
              <option>Rejected</option>
            </select>
          </Field>

          <Field label="Zone">
            <select className="form-input">
              <option>All Zones</option>
              <option>Petra Jaya</option>
              <option>City Centre</option>
            </select>
          </Field>

          <div className="md:col-span-4 flex justify-end gap-3">
            <button className="px-4 py-2 border border-slate-300 rounded text-sm font-semibold hover:bg-slate-50">
              Reset
            </button>
            <button className="px-4 py-2 bg-[#006d32] text-white rounded text-sm font-semibold hover:bg-[#005224]">
              Search
            </button>
          </div>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-md overflow-hidden">
        <div className="border-t-4 border-[#006d32] px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#1a1c1c]">
              Application List
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {applications.length} applications found.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto p-5">
          <table className="w-full text-sm border border-slate-200">
            <thead className="bg-[#f1f5f4] text-slate-600">
              <tr>
                <TableHead>Application ID</TableHead>
                <TableHead>Applicant</TableHead>
                <TableHead>License Type</TableHead>
                <TableHead>Zone</TableHead>
                <TableHead>Submitted Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>SLA</TableHead>
                <TableHead>Action</TableHead>
              </tr>
            </thead>

            <tbody>
              {applications.map((item) => (
                <tr key={item.id} className="border-t hover:bg-[#fafafa]">
                  <TableCell strong>{item.id}</TableCell>
                  <TableCell>{item.applicant}</TableCell>
                  <TableCell>{item.type}</TableCell>
                  <TableCell>{item.zone}</TableCell>
                  <TableCell>{item.submittedDate}</TableCell>
                  <TableCell>
                    <StatusBadge value={item.status} />
                  </TableCell>
                  <TableCell>{item.sla}</TableCell>
                  <TableCell>
                    <Link
                      to={`/applications/${item.id}/edit`}
                      className="text-[#006d32] font-semibold hover:underline"
                    >
                      View
                    </Link>
                  </TableCell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showGuidelines && (
        <GuidelinesModal
          onClose={() => setShowGuidelines(false)}
          onProceed={handleProceed}
        />
      )}
    </Layout>
  );
}

function GuidelinesModal({ onClose, onProceed }) {
  return (
    <div className="fixed inset-0 z-[999] bg-black/55 flex items-center justify-center px-4">
      <div className="bg-white w-full max-w-4xl rounded shadow-lg border border-slate-300">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="w-1 h-7 bg-[#18b36b]" />
            <h2 className="text-lg font-normal text-slate-800">
              fasTrack Guidelines
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-9 py-7 text-[11px] text-slate-700 leading-relaxed">
          <ol className="list-decimal space-y-3 pl-5">
            <li>
              Applicant must first consult the{" "}
              <strong>Department of Land and Surveys (L&amp;S)</strong> of the
              division or Bintulu Development Authority (BDA). This is known as{" "}
              <strong>Preliminary Stage</strong> which discussion between client
              and agency to be held at L&amp;S/BDA office. Under this stage,
              L&amp;S / BDA shall work together with the client:
              <ul className="list-disc pl-6 mt-1 space-y-1">
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
            className="mt-6 inline-flex items-center gap-2 bg-[#18b36b] text-white px-3 py-2 rounded-sm text-xs font-semibold hover:bg-[#12975a]"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            Proceed
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, className = "" }) {
  return (
    <div className={className}>
      <label className="block text-xs font-semibold text-slate-600 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

function StatusBadge({ value }) {
  let className = "bg-slate-100 text-slate-700 border-slate-200";

  if (value === "Technical Review") {
    className = "bg-yellow-50 text-yellow-700 border-yellow-200";
  }

  if (value === "Pending Payment") {
    className = "bg-blue-50 text-blue-700 border-blue-200";
  }

  if (value === "Correction Required") {
    className = "bg-red-50 text-red-700 border-red-200";
  }

  return (
    <span
      className={`inline-flex px-2.5 py-1 rounded text-xs font-semibold border ${className}`}
    >
      {value}
    </span>
  );
}

function TableHead({ children }) {
  return (
    <th className="px-3 py-3 text-left text-xs font-bold uppercase border-r last:border-r-0 border-slate-200 whitespace-nowrap">
      {children}
    </th>
  );
}

function TableCell({ children, strong = false }) {
  return (
    <td
      className={`px-3 py-3 border-r last:border-r-0 border-slate-100 align-top ${
        strong ? "font-semibold text-slate-800" : "text-slate-600"
      }`}
    >
      {children}
    </td>
  );
}

export default ApplicationsPage;