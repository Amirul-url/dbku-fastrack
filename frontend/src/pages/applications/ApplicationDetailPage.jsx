import { Link, useParams } from "react-router-dom";
import DashboardLayout from "../../layout/DashboardLayout";

const documents = [
  { name: "Siting Form", status: "Uploaded" },
  { name: "Sales & Purchase / Tenancy Agreement", status: "Uploaded" },
  { name: "Location Sketch Plan", status: "Uploaded" },
  { name: "Third Schedule Form", status: "Missing" },
  { name: "Detailed Engineering Structure Drawing", status: "Uploaded" },
  { name: "Public Liability Insurance RM1,000,000", status: "Missing" },
  { name: "Extract of Title", status: "Uploaded" },
  { name: "Cadastral Plan", status: "Uploaded" },
];

const reviews = [
  {
    department: "Advertisement Unit",
    officer: "Officer A",
    decision: "In Review",
    comment: "Site photo pending.",
  },
  {
    department: "BLG",
    officer: "Officer B",
    decision: "Supported",
    comment: "No objection.",
  },
  {
    department: "IMT",
    officer: "Officer C",
    decision: "Supported",
    comment: "Record verified.",
  },
  {
    department: "ENG",
    officer: "Officer D",
    decision: "Pending",
    comment: "Awaiting structure review.",
  },
  {
    department: "GPM",
    officer: "Officer E",
    decision: "Pending",
    comment: "No remarks submitted yet.",
  },
];

function ApplicationDetailPage() {
  const { id } = useParams();

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <Link
            to="/applications"
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-[#006d32]"
          >
            <span className="material-symbols-outlined text-[18px]">
              arrow_back
            </span>
            Back to Applications
          </Link>

          <span className="rounded-full bg-yellow-50 border border-yellow-200 px-3 py-1 text-xs font-bold text-yellow-700">
            Technical Review
          </span>
        </div>

        <section className="bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden">
          <div className="border-t-4 border-[#006d32] px-5 py-4 bg-[#f7fbf8]">
            <p className="text-xs uppercase tracking-wide font-bold text-[#006d32]">
              Application Detail
            </p>
            <h1 className="mt-1 text-2xl font-bold text-[#1a1c1c]">
              {id}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Billboard Advertisement License Application
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 border-t border-slate-200">
            <InfoCard label="Applicant" value="Borneo Media Sdn Bhd" />
            <InfoCard label="Application Date" value="27 Apr 2026" />
            <InfoCard label="SLA Remaining" value="2 days left" />
          </div>
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <Panel title="Application Summary" className="xl:col-span-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Info label="Application Type" value="Billboard Advertisement" />
              <Info label="Current Status" value="Technical Review" />
              <Info label="Current Department" value="ENG Department" />
              <Info label="License Period" value="12 Months" />
              <Info
                label="Display Location"
                value="Petra Jaya, Kuching"
                wide
              />
            </div>
          </Panel>

          <Panel title="Auto Screening Result">
            <div className="space-y-3">
              <ScreeningItem label="GIS Zoning Compliance" status="Passed" />
              <ScreeningItem label="Blacklist Status" status="Passed" />
              <ScreeningItem label="Location Overlap" status="Warning" />
            </div>

            <div className="mt-4 rounded-md border border-yellow-200 bg-yellow-50 px-4 py-3">
              <p className="text-xs font-semibold text-yellow-800">
                Location overlap requires officer verification.
              </p>
            </div>
          </Panel>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <Panel title="Applicant Information">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Info label="Full Name / Company" value="Borneo Media Sdn Bhd" />
              <Info label="IC / Company Reg. No" value="202601234567" />
              <Info label="Phone" value="+60 12-345 6789" />
              <Info label="Email" value="admin@borneomedia.com" />
              <Info
                label="Address"
                value="Jalan Satok, 93400 Kuching, Sarawak"
                wide
              />
            </div>
          </Panel>

          <Panel title="Advertisement Information">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Info label="Advertisement Title" value="Billboard Campaign 2026" />
              <Info label="Advertisement Size" value="20ft x 10ft" />
              <Info label="Quantity" value="2 Units" />
              <Info label="License Period" value="12 Months" />
              <Info
                label="Display Location"
                value="Petra Jaya, Kuching"
                wide
              />
            </div>
          </Panel>
        </div>

        <Panel title="Uploaded Documents Checklist">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-slate-200">
              <thead className="bg-[#f1f5f4] text-slate-600">
                <tr>
                  <TableHead>No.</TableHead>
                  <TableHead>Document</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </tr>
              </thead>

              <tbody>
                {documents.map((doc, index) => (
                  <tr key={doc.name} className="border-t hover:bg-slate-50">
                    <TableCell>{index + 1}</TableCell>
                    <TableCell strong>{doc.name}</TableCell>
                    <TableCell>
                      <StatusBadge value={doc.status} />
                    </TableCell>
                    <TableCell>
                      <button className="text-[#006d32] text-xs font-bold hover:underline">
                        View
                      </button>
                    </TableCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Parallel Technical Review">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-slate-200">
              <thead className="bg-[#f1f5f4] text-slate-600">
                <tr>
                  <TableHead>Department</TableHead>
                  <TableHead>Officer</TableHead>
                  <TableHead>Decision</TableHead>
                  <TableHead>Comment</TableHead>
                </tr>
              </thead>

              <tbody>
                {reviews.map((review) => (
                  <tr key={review.department} className="border-t hover:bg-slate-50">
                    <TableCell strong>{review.department}</TableCell>
                    <TableCell>{review.officer}</TableCell>
                    <TableCell>
                      <StatusBadge value={review.decision} />
                    </TableCell>
                    <TableCell>{review.comment}</TableCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </DashboardLayout>
  );
}

function Panel({ title, children, className = "" }) {
  return (
    <section
      className={`bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden ${className}`}
    >
      <div className="px-5 py-3 border-b border-slate-200 bg-[#f7f7f7]">
        <h2 className="text-sm font-bold text-[#1a1c1c]">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function InfoCard({ label, value }) {
  return (
    <div className="px-5 py-4 border-b md:border-b-0 md:border-r last:border-r-0 border-slate-200">
      <p className="text-[11px] uppercase font-bold text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-slate-800">{value}</p>
    </div>
  );
}

function Info({ label, value, wide = false }) {
  return (
    <div className={wide ? "md:col-span-2" : ""}>
      <p className="text-[11px] uppercase text-slate-400 font-bold mb-1">
        {label}
      </p>
      <p className="text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function ScreeningItem({ label, status }) {
  return (
    <div className="flex items-center justify-between gap-3 border border-slate-200 rounded-md px-3 py-2">
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <StatusBadge value={status} />
    </div>
  );
}

function StatusBadge({ value }) {
  let className = "bg-slate-100 text-slate-700 border-slate-200";

  if (value === "Uploaded" || value === "Passed" || value === "Supported") {
    className = "bg-green-50 text-green-700 border-green-200";
  }

  if (value === "Warning" || value === "In Review" || value === "Pending") {
    className = "bg-yellow-50 text-yellow-700 border-yellow-200";
  }

  if (value === "Missing") {
    className = "bg-red-50 text-red-700 border-red-200";
  }

  return (
    <span
      className={`inline-flex whitespace-nowrap px-2.5 py-1 rounded-full text-[11px] font-bold border ${className}`}
    >
      {value}
    </span>
  );
}

function TableHead({ children }) {
  return (
    <th className="px-3 py-3 text-left text-[11px] font-bold uppercase border-r last:border-r-0 border-slate-200 whitespace-nowrap">
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

export default ApplicationDetailPage;