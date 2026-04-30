import DashboardLayout from "../../layout/DashboardLayout";

const approvalQueue = [
  {
    id: "FT-2026-0001",
    applicant: "Borneo Media Sdn Bhd",
    type: "Billboard",
    technicalStatus: "Partially Completed",
    recommendation: "Approve with Conditions",
    sla: "2 days left",
  },
  {
    id: "FT-2026-0005",
    applicant: "Kuching Food Hub",
    type: "Shop Signage",
    technicalStatus: "Completed",
    recommendation: "Approve",
    sla: "On track",
  },
  {
    id: "FT-2026-0008",
    applicant: "Petra Jaya Enterprise",
    type: "Temporary Banner",
    technicalStatus: "Completed",
    recommendation: "Reject",
    sla: "Action required",
  },
];

const reviewSummary = [
  { department: "Advertisement Unit", decision: "Supported" },
  { department: "Building Control Department", decision: "Supported" },
  { department: "Information Management Technology", decision: "Supported" },
  { department: "Maintenance Department", decision: "Supported with Conditions" },
  { department: "Engineering Department", decision: "Pending" },
  { department: "Landscape Department", decision: "Supported" },
];

function ApprovalPage() {
  return (
    <DashboardLayout>
      <div className="mb-5 border-l-4 border-[#006d32] pl-4">
        <p className="text-xs uppercase tracking-wide font-semibold text-[#006d32] mb-1">
          Management Workspace
        </p>
        <h1 className="text-2xl font-bold text-[#1a1c1c]">Approval</h1>
        <p className="text-sm text-slate-500 mt-1 max-w-4xl">
          Review consolidated technical feedback and issue final approval
          decisions for advertisement license applications.
        </p>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <SummaryCard label="Awaiting Approval" value="13" />
        <SummaryCard label="Approved Today" value="5" />
        <SummaryCard label="Rejected Today" value="2" />
        <SummaryCard label="Conditional Approval" value="7" />
      </section>

      <Panel
        title="Approval Queue"
        description="Applications ready for authorised officer decision."
        className="mb-6"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
          <Field label="Search Application" className="md:col-span-2">
            <input className="form-input" placeholder="Search application..." />
          </Field>

          <Field label="Recommendation">
            <select className="form-input">
              <option>All Recommendations</option>
              <option>Approve</option>
              <option>Approve with Conditions</option>
              <option>Reject</option>
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
                <TableHead>Technical Status</TableHead>
                <TableHead>Recommendation</TableHead>
                <TableHead>SLA</TableHead>
                <TableHead>Action</TableHead>
              </tr>
            </thead>

            <tbody>
              {approvalQueue.map((item) => (
                <tr key={item.id} className="border-t hover:bg-[#fafafa]">
                  <TableCell strong>{item.id}</TableCell>
                  <TableCell>{item.applicant}</TableCell>
                  <TableCell>{item.type}</TableCell>
                  <TableCell>
                    <StatusBadge value={item.technicalStatus} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={item.recommendation} />
                  </TableCell>
                  <TableCell>{item.sla}</TableCell>
                  <TableCell>
                    <button className="text-[#006d32] font-semibold hover:underline">
                      Decide
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
          title="Decision Panel"
          description="Final decision input for the selected application."
        >
          <div className="space-y-4">
            <Field label="Final Decision">
              <select className="form-input">
                <option>Approve</option>
                <option>Approve with Conditions</option>
                <option>Reject</option>
              </select>
            </Field>

            <Field label="Approval Notes">
              <textarea
                rows="5"
                className="form-input"
                placeholder="Enter approval notes, rejection reason, or conditions..."
              />
            </Field>

            <div className="border border-slate-200 bg-[#fafafa] rounded-md px-4 py-3">
              <p className="text-sm font-semibold text-slate-800">
                Digital Signature
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Signature will be applied during final approval.
              </p>
            </div>

            <div className="flex justify-end">
              <button className="px-5 py-2.5 bg-[#006d32] text-white rounded text-sm font-semibold hover:bg-[#005224]">
                Submit Final Decision
              </button>
            </div>
          </div>
        </Panel>

        <Panel
          title="Technical Review Summary"
          description="Consolidated department feedback before final decision."
        >
          <div className="space-y-2">
            {reviewSummary.map((item) => (
              <div
                key={item.department}
                className="flex items-center justify-between border border-slate-200 rounded-md px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {item.department}
                  </p>
                  <p className="text-xs text-slate-500">
                    Department recommendation
                  </p>
                </div>

                <StatusBadge value={item.decision} />
              </div>
            ))}
          </div>

          <div className="mt-4 border border-yellow-200 bg-yellow-50 px-4 py-3 rounded-md">
            <p className="text-sm font-semibold text-yellow-800">
              Engineering Department feedback is still pending.
            </p>
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
  const normalizedValue = value.toLowerCase();

  let className = "bg-slate-100 text-slate-700 border-slate-200";

  if (
    normalizedValue.includes("approve") ||
    normalizedValue.includes("completed") ||
    normalizedValue.includes("supported")
  ) {
    className = "bg-green-50 text-green-700 border-green-200";
  }

  if (
    normalizedValue.includes("condition") ||
    normalizedValue.includes("partial") ||
    normalizedValue.includes("pending")
  ) {
    className = "bg-yellow-50 text-yellow-700 border-yellow-200";
  }

  if (normalizedValue.includes("reject")) {
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

export default ApprovalPage;