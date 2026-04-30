import DashboardLayout from "../../layout/DashboardLayout";

const reportCards = [
  {
    title: "Total Applications",
    value: "128",
    note: "+12 this month",
  },
  {
    title: "Approval Rate",
    value: "72%",
    note: "+5% from last month",
  },
  {
    title: "Average Processing Time",
    value: "14 days",
    note: "Target SLA: 21 days",
  },
  {
    title: "Pending SLA Risk",
    value: "9",
    note: "Requires attention",
  },
];

const departmentPerformance = [
  {
    department: "Advertisement Unit",
    total: 42,
    completed: 35,
    pending: 7,
    avgDays: "6 days",
  },
  {
    department: "Building Control Department",
    total: 38,
    completed: 29,
    pending: 9,
    avgDays: "8 days",
  },
  {
    department: "Engineering Department",
    total: 31,
    completed: 19,
    pending: 12,
    avgDays: "12 days",
  },
  {
    department: "Landscape Department",
    total: 20,
    completed: 17,
    pending: 3,
    avgDays: "5 days",
  },
];

const monthlyApplications = [
  { month: "Jan", total: 18 },
  { month: "Feb", total: 24 },
  { month: "Mar", total: 21 },
  { month: "Apr", total: 32 },
  { month: "May", total: 28 },
  { month: "Jun", total: 36 },
];

function ReportsPage() {
  return (
    <DashboardLayout>
      <div className="mb-5 border-l-4 border-[#006d32] pl-4">
        <p className="text-xs uppercase tracking-wide font-semibold text-[#006d32] mb-1">
          Management Analytics
        </p>

        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#1a1c1c]">Reports</h1>
            <p className="text-sm text-slate-500 mt-1 max-w-4xl">
              Monitor fasTrack performance, application volume, approval rate,
              SLA compliance, and department processing efficiency.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button className="px-4 py-2 border border-slate-300 rounded text-sm font-semibold hover:bg-slate-50">
              Export CSV
            </button>
            <button className="px-4 py-2 bg-[#006d32] text-white rounded text-sm font-semibold hover:bg-[#005224]">
              Generate Report
            </button>
          </div>
        </div>
      </div>

      <Panel
        title="Report Filter"
        description="Filter report data by date range, department, and status."
        className="mb-6"
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Field label="Date From">
            <input type="date" className="form-input" />
          </Field>

          <Field label="Date To">
            <input type="date" className="form-input" />
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

          <Field label="Status">
            <select className="form-input">
              <option>All Status</option>
              <option>Submitted</option>
              <option>Auto Screening</option>
              <option>Technical Review</option>
              <option>Approved</option>
              <option>Rejected</option>
              <option>Pending Payment</option>
              <option>License Issued</option>
            </select>
          </Field>
        </div>
      </Panel>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {reportCards.map((item) => (
          <ReportCard key={item.title} item={item} />
        ))}
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        <Panel
          title="Monthly Application Volume"
          description="Number of advertisement license applications received by month."
          className="xl:col-span-2"
        >
          <div className="h-72 flex items-end gap-4 border-b border-slate-200 pb-4">
            {monthlyApplications.map((item) => (
              <div
                key={item.month}
                className="flex-1 flex flex-col items-center justify-end h-full"
              >
                <div
                  className="w-full max-w-14 bg-[#006d32] rounded-t"
                  style={{ height: `${item.total * 5}px` }}
                />
                <p className="text-xs text-slate-500 mt-3">{item.month}</p>
                <p className="text-xs font-semibold">{item.total}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          title="SLA Compliance"
          description="Overall processing compliance against target timeline."
        >
          <div className="flex items-center justify-center mb-5">
            <div className="w-40 h-40 rounded-full border-[16px] border-[#006d32] flex items-center justify-center">
              <div className="text-center">
                <p className="text-3xl font-bold">84%</p>
                <p className="text-xs text-slate-500">Within SLA</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Legend label="Within SLA" value="84%" color="bg-[#006d32]" />
            <Legend label="At Risk" value="10%" color="bg-yellow-500" />
            <Legend label="Overdue" value="6%" color="bg-red-500" />
          </div>
        </Panel>
      </section>

      <Panel
        title="Department Performance"
        description="Processing volume and average handling time by department."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-slate-200">
            <thead className="bg-[#f1f5f4] text-slate-600">
              <tr>
                <TableHead>Department</TableHead>
                <TableHead>Total Assigned</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Pending</TableHead>
                <TableHead>Average Processing Time</TableHead>
                <TableHead>Performance</TableHead>
              </tr>
            </thead>

            <tbody>
              {departmentPerformance.map((item) => {
                const percentage = Math.round(
                  (item.completed / item.total) * 100
                );

                return (
                  <tr key={item.department} className="border-t">
                    <TableCell strong>{item.department}</TableCell>
                    <TableCell>{item.total}</TableCell>
                    <TableCell>
                      <span className="font-semibold text-green-700">
                        {item.completed}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold text-yellow-700">
                        {item.pending}
                      </span>
                    </TableCell>
                    <TableCell>{item.avgDays}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-28 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#006d32]"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold">
                          {percentage}%
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

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

function ReportCard({ item }) {
  return (
    <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
      <div className="h-1 bg-[#006d32]" />
      <div className="p-4">
        <p className="text-xs text-slate-500">{item.title}</p>
        <p className="text-3xl font-bold text-[#1a1c1c] mt-1">{item.value}</p>
        <p className="text-xs text-slate-500 mt-2">{item.note}</p>
      </div>
    </div>
  );
}

function Legend({ label, value, color }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2">
        <span className={`w-3 h-3 rounded-full ${color}`} />
        <span className="text-slate-600">{label}</span>
      </div>
      <span className="font-semibold">{value}</span>
    </div>
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

export default ReportsPage;