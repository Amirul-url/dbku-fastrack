import DashboardLayout from "../../layout/DashboardLayout";

const reviewQueue = [
  {
    id: "FT-2026-0001",
    applicant: "Borneo Media Sdn Bhd",
    type: "Billboard",
    assignedTo: "Engineering Department",
    status: "Pending Review",
    sla: "2 days left",
  },
  {
    id: "FT-2026-0004",
    applicant: "Sarawak Retail Group",
    type: "Shop Signage",
    assignedTo: "Building Control Department",
    status: "In Review",
    sla: "4 days left",
  },
  {
    id: "FT-2026-0007",
    applicant: "North City Events",
    type: "Temporary Banner",
    assignedTo: "Maintenance Department",
    status: "Pending Review",
    sla: "1 day left",
  },
];

const progress = [
  { department: "Advertisement Unit", status: "In Review" },
  { department: "Building Control Department", status: "Supported" },
  { department: "Information Management Technology", status: "Supported" },
  { department: "Maintenance Department", status: "Pending" },
  { department: "Engineering Department", status: "Pending" },
  { department: "Landscape Department", status: "Pending" },
  { department: "Enforcement Department", status: "Pending" },
];

function TechnicalReviewPage() {
  return (
    <DashboardLayout>
      <div className="mb-5 border-l-4 border-[#006d32] pl-4">
        <p className="text-xs uppercase tracking-wide font-semibold text-[#006d32] mb-1">
          Officer Workspace
        </p>
        <h1 className="text-2xl font-bold text-[#1a1c1c]">
          Technical Review
        </h1>
        <p className="text-sm text-slate-500 mt-1 max-w-4xl">
          Review applications assigned to technical departments. Officers may
          support, support with conditions, or reject applications with comments.
        </p>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <SummaryCard label="Pending Review" value="18" />
        <SummaryCard label="In Review" value="9" />
        <SummaryCard label="Supported" value="42" />
        <SummaryCard label="Rejected" value="6" />
      </section>

      <Panel
        title="Review Queue"
        description="Applications pending department feedback."
        className="mb-6"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
          <Field label="Search Application" className="md:col-span-2">
            <input className="form-input" placeholder="Search application..." />
          </Field>

          <Field label="Department">
            <select className="form-input">
              <option>All Departments</option>
              <option>Advertisement Unit</option>
              <option>Building Control Department</option>
              <option>Information Management Technology</option>
              <option>Maintenance Department</option>
              <option>Engineering Department</option>
              <option>Landscape Department</option>
              <option>Enforcement Department</option>
            </select>
          </Field>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-slate-200">
            <thead className="bg-[#f1f5f4] text-slate-600">
              <tr>
                <TableHead>Application ID</TableHead>
                <TableHead>Applicant</TableHead>
                <TableHead>Advertisement Type</TableHead>
                <TableHead>Assigned Department</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>SLA</TableHead>
                <TableHead>Action</TableHead>
              </tr>
            </thead>

            <tbody>
              {reviewQueue.map((item) => (
                <tr key={item.id} className="border-t hover:bg-[#fafafa]">
                  <TableCell strong>{item.id}</TableCell>
                  <TableCell>{item.applicant}</TableCell>
                  <TableCell>{item.type}</TableCell>
                  <TableCell>{item.assignedTo}</TableCell>
                  <TableCell>
                    <StatusBadge value={item.status} />
                  </TableCell>
                  <TableCell>{item.sla}</TableCell>
                  <TableCell>
                    <button className="text-[#006d32] font-semibold hover:underline">
                      Review
                    </button>
                  </TableCell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel
          title="Review Decision Panel"
          description="Submit technical feedback for the selected application."
        >
          <div className="space-y-4">
            <Field label="Decision">
              <select className="form-input">
                <option>Support</option>
                <option>Support with Conditions</option>
                <option>Do Not Support</option>
              </select>
            </Field>

            <Field label="Technical Comment">
              <textarea
                rows="5"
                className="form-input"
                placeholder="Enter technical comments, conditions, or rejection reasons..."
              />
            </Field>

            <Field label="Site Photo Upload">
              <input
                type="file"
                className="form-input file:mr-3 file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-xs file:font-semibold"
              />
            </Field>

            <div className="flex justify-end">
              <button className="px-5 py-2.5 bg-[#006d32] text-white rounded text-sm font-semibold hover:bg-[#005224]">
                Submit Review
              </button>
            </div>
          </div>
        </Panel>

        <Panel
          title="Parallel Review Progress"
          description="Status from all involved departments."
        >
          <div className="space-y-2">
            {progress.map((item) => (
              <div
                key={item.department}
                className="flex items-center justify-between border border-slate-200 rounded-md px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {item.department}
                  </p>
                  <p className="text-xs text-slate-500">
                    Technical department
                  </p>
                </div>

                <StatusBadge value={item.status} />
              </div>
            ))}
          </div>
        </Panel>
      </section>
    </DashboardLayout>
  );
}

function Panel({ title, description, children, className = "" }) {
  return (
    <section
      className={`bg-white border border-slate-200 rounded-md overflow-hidden ${className}`}
    >
      <div className="border-t-4 border-[#006d32] px-5 py-4 border-b border-slate-200">
        <h2 className="text-base font-bold text-[#1a1c1c]">{title}</h2>
        {description && (
          <p className="text-xs text-slate-500 mt-1">{description}</p>
        )}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
      <div className="h-1 bg-[#006d32]" />
      <div className="p-4">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-3xl font-bold text-[#1a1c1c] mt-1">{value}</p>
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

  if (value === "Supported" || value === "Support") {
    className = "bg-green-50 text-green-700 border-green-200";
  }

  if (value === "Pending Review" || value === "In Review" || value === "Pending") {
    className = "bg-yellow-50 text-yellow-700 border-yellow-200";
  }

  if (value === "Rejected" || value === "Do Not Support") {
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

export default TechnicalReviewPage;