import DashboardLayout from "../../layout/DashboardLayout";

const summaryCards = [
  { label: "Total Applications", value: "128", note: "All advertisement license applications" },
  { label: "Under Review", value: "24", note: "Waiting for technical review" },
  { label: "Pending Payment", value: "11", note: "Approved but payment not completed" },
  { label: "Licenses Issued", value: "76", note: "Active digital licenses" },
];

const statusSummary = [
  { label: "New Applications", value: 18 },
  { label: "Auto Screening", value: 9 },
  { label: "Technical Review", value: 24 },
  { label: "Officer Approval", value: 13 },
  { label: "Payment", value: 11 },
  { label: "License Issued", value: 76 },
];

const applications = [
  {
    id: "FT-2026-0001",
    applicant: "Syarikat Borneo Media Sdn. Bhd.",
    licenseType: "Billboard Advertisement",
    zone: "Petra Jaya",
    status: "Technical Review",
    department: "BLG / IMT / ENG",
    sla: "2 days left",
  },
  {
    id: "FT-2026-0002",
    applicant: "Kuching Food Hub",
    licenseType: "Shop Signage License",
    zone: "City Centre",
    status: "Pending Payment",
    department: "Advertisement Unit",
    sla: "On track",
  },
  {
    id: "FT-2026-0003",
    applicant: "Petra Jaya Enterprise",
    licenseType: "Temporary Banner Permit",
    zone: "Petra Jaya",
    status: "Correction Required",
    department: "Auto Screening",
    sla: "Action required",
  },
  {
    id: "FT-2026-0004",
    applicant: "Sarawak Retail Group",
    licenseType: "Shop Signage",
    zone: "City Centre",
    status: "Officer Approval",
    department: "Authorised Officer",
    sla: "1 day left",
  },
];

const departmentPerformance = [
  { department: "Advertisement Unit", assigned: 42, pending: 6, completed: 36 },
  { department: "BLG", assigned: 28, pending: 8, completed: 20 },
  { department: "IMT", assigned: 31, pending: 5, completed: 26 },
  { department: "MNE", assigned: 22, pending: 4, completed: 18 },
  { department: "ENG", assigned: 35, pending: 12, completed: 23 },
  { department: "GPM", assigned: 19, pending: 3, completed: 16 },
  { department: "LNP", assigned: 16, pending: 2, completed: 14 },
];

const workflow = [
  "Application",
  "Screening",
  "Technical Review",
  "Coordination",
  "Approval",
  "Payment",
  "Digital License",
];

function AdminDashboard() {
  return (
    <DashboardLayout>
      <PageHeader
        eyebrow="fasTrack System"
        title="Advertisement License Dashboard"
        description="Overview of advertisement license applications, technical reviews, approvals, payments, SLA performance, and digital license issuance."
      />

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {summaryCards.map((item) => (
          <SummaryCard key={item.label} item={item} />
        ))}
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        <Panel
          title="Application Status Summary"
          description="Total applications by workflow stage."
          className="xl:col-span-2"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {statusSummary.map((item) => (
              <div
                key={item.label}
                className="border border-slate-200 bg-[#fafafa] rounded-md px-4 py-3"
              >
                <p className="text-xs text-slate-500 mb-1">{item.label}</p>
                <p className="text-2xl font-bold text-[#1a1c1c]">
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          title="SLA Monitoring"
          description="Workflow stages approaching the target processing time."
        >
          <div className="space-y-4">
            <SlaItem label="Technical Review" value="72%" color="green" />
            <SlaItem label="Officer Approval" value="58%" color="yellow" />
            <SlaItem label="Payment Verification" value="84%" color="green" />
          </div>

          <div className="mt-5 border border-red-200 bg-red-50 px-4 py-3 rounded-md">
            <p className="text-sm font-semibold text-red-700">
              Bottleneck Alert
            </p>
            <p className="text-xs text-red-600 mt-1">
              ENG has the highest pending review count this week.
            </p>
          </div>
        </Panel>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        <Panel
          title="Recent Applications"
          description="Latest advertisement license applications received or currently being processed."
          className="xl:col-span-2"
          action={<SmallButton label="View All" />}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-slate-200">
              <thead className="bg-[#f1f5f4] text-slate-600">
                <tr>
                  <TableHead>Application ID</TableHead>
                  <TableHead>Applicant</TableHead>
                  <TableHead>License Type</TableHead>
                  <TableHead>Zone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>SLA</TableHead>
                </tr>
              </thead>

              <tbody>
                {applications.map((item) => (
                  <tr key={item.id} className="border-t hover:bg-[#fafafa]">
                    <TableCell strong>{item.id}</TableCell>
                    <TableCell>
                      <p className="font-semibold text-slate-800">
                        {item.applicant}
                      </p>
                      <p className="text-xs text-slate-500">
                        {item.department}
                      </p>
                    </TableCell>
                    <TableCell>{item.licenseType}</TableCell>
                    <TableCell>{item.zone}</TableCell>
                    <TableCell>
                      <StatusBadge value={item.status} />
                    </TableCell>
                    <TableCell>{item.sla}</TableCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          title="Workflow"
          description="Application process from submission to digital license issuance."
        >
          <div className="space-y-2">
            {workflow.map((step, index) => (
              <div
                key={step}
                className="flex items-center gap-3 border border-slate-200 bg-white px-3 py-2 rounded-md"
              >
                <div className="w-6 h-6 rounded-full bg-[#006d32] text-white text-xs font-bold flex items-center justify-center">
                  {index + 1}
                </div>
                <p className="text-sm font-medium text-slate-700">{step}</p>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <Panel
        title="Department Performance"
        description="Monitor assigned, pending, and completed reviews by department."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-slate-200">
            <thead className="bg-[#f1f5f4] text-slate-600">
              <tr>
                <TableHead>Department / Unit</TableHead>
                <TableHead>Total Assigned</TableHead>
                <TableHead>Pending</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Performance</TableHead>
              </tr>
            </thead>

            <tbody>
              {departmentPerformance.map((item) => {
                const percent = Math.round(
                  (item.completed / item.assigned) * 100
                );

                return (
                  <tr key={item.department} className="border-t">
                    <TableCell strong>{item.department}</TableCell>
                    <TableCell>{item.assigned}</TableCell>
                    <TableCell>
                      <span className="font-semibold text-yellow-700">
                        {item.pending}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold text-green-700">
                        {item.completed}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#006d32]"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold">
                          {percent}%
                        </span>
                      </div>
                    </TableCell>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </DashboardLayout>
  );
}

function PageHeader({ eyebrow, title, description }) {
  return (
    <div className="mb-5 border-l-4 border-[#006d32] pl-4">
      <p className="text-xs uppercase tracking-wide font-semibold text-[#006d32] mb-1">
        {eyebrow}
      </p>
      <h1 className="text-2xl font-bold text-[#1a1c1c]">{title}</h1>
      <p className="text-sm text-slate-500 mt-1 max-w-4xl">{description}</p>
    </div>
  );
}

function Panel({ title, description, children, action, className = "" }) {
  return (
    <section
      className={`bg-white border border-slate-200 rounded-md overflow-hidden ${className}`}
    >
      <div className="border-t-4 border-[#006d32] px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-[#1a1c1c]">{title}</h2>
          {description && (
            <p className="text-xs text-slate-500 mt-1">{description}</p>
          )}
        </div>

        {action}
      </div>

      <div className="p-5">{children}</div>
    </section>
  );
}

function SummaryCard({ item }) {
  return (
    <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
      <div className="h-1 bg-[#006d32]" />
      <div className="p-4">
        <p className="text-xs text-slate-500">{item.label}</p>
        <p className="text-3xl font-bold text-[#1a1c1c] mt-1">{item.value}</p>
        <p className="text-xs text-slate-500 mt-2">{item.note}</p>
      </div>
    </div>
  );
}

function SlaItem({ label, value, color }) {
  const barColor = color === "yellow" ? "bg-yellow-500" : "bg-[#006d32]";

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold">{value}</span>
      </div>

      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${barColor}`} style={{ width: value }} />
      </div>
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

  if (value === "Officer Approval") {
    className = "bg-purple-50 text-purple-700 border-purple-200";
  }

  return (
    <span
      className={`inline-flex px-2.5 py-1 rounded text-xs font-semibold border ${className}`}
    >
      {value}
    </span>
  );
}

function SmallButton({ label }) {
  return (
    <button
      type="button"
      className="px-3 py-2 bg-[#006d32] text-white rounded text-xs font-semibold hover:bg-[#005224]"
    >
      {label}
    </button>
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

export default AdminDashboard;