import DashboardLayout from "../../layout/DashboardLayout";

const screeningQueue = [
  {
    id: "FT-2026-0001",
    applicant: "Borneo Media Sdn Bhd",
    type: "Billboard",
    zone: "Petra Jaya",
    status: "Screened",
  },
  {
    id: "FT-2026-0003",
    applicant: "Kuching Food Hub",
    type: "Banner",
    zone: "City Centre",
    status: "Pending",
  },
];

const checks = [
  {
    label: "Zoning Compliance",
    result: "Passed",
    description: "Location is within the approved advertisement zone.",
  },
  {
    label: "Blacklist Check",
    result: "Passed",
    description: "Applicant has no outstanding violations or unpaid penalties.",
  },
  {
    label: "Location Overlap",
    result: "Warning",
    description: "Another billboard exists within the nearby radius.",
  },
  {
    label: "Document Completeness",
    result: "Passed",
    description: "Required supporting documents have been uploaded.",
  },
  {
    label: "Size Regulation",
    result: "Passed",
    description: "Advertisement size is within the allowed limit.",
  },
];

function AutoScreeningPage() {
  return (
    <DashboardLayout>
      <div className="mb-5 border-l-4 border-[#006d32] pl-4">
        <p className="text-xs uppercase tracking-wide font-semibold text-[#006d32] mb-1">
          System Automation
        </p>
        <h1 className="text-2xl font-bold text-[#1a1c1c]">Auto Screening</h1>
        <p className="text-sm text-slate-500 mt-1 max-w-4xl">
          Automated validation checks before technical review, including GIS
          zoning, blacklist status, location overlap, and document completeness.
        </p>
      </div>

      <Panel
        title="Screening Queue"
        description="Applications waiting for or completed by automated screening."
        className="mb-6"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-slate-200">
            <thead className="bg-[#f1f5f4] text-slate-600">
              <tr>
                <TableHead>Application ID</TableHead>
                <TableHead>Applicant</TableHead>
                <TableHead>Advertisement Type</TableHead>
                <TableHead>Zone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </tr>
            </thead>

            <tbody>
              {screeningQueue.map((item) => (
                <tr key={item.id} className="border-t hover:bg-[#fafafa]">
                  <TableCell strong>{item.id}</TableCell>
                  <TableCell>{item.applicant}</TableCell>
                  <TableCell>{item.type}</TableCell>
                  <TableCell>{item.zone}</TableCell>
                  <TableCell>
                    <StatusBadge value={item.status} />
                  </TableCell>
                  <TableCell>
                    <button className="text-[#006d32] font-semibold hover:underline">
                      View Result
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
          title="Screening Results"
          description="System-generated checklist result for the selected application."
        >
          <div className="space-y-3">
            {checks.map((item) => (
              <CheckItem key={item.label} item={item} />
            ))}
          </div>
        </Panel>

        <Panel
          title="System Recommendation"
          description="Recommended next action before officer review."
        >
          <div className="grid grid-cols-1 gap-3">
            <DecisionItem
              label="Recommended Status"
              value="Proceed to Technical Review"
              status="success"
            />
            <DecisionItem
              label="Risk Level"
              value="Medium - Location Overlap"
              status="warning"
            />
            <DecisionItem
              label="Confidence Score"
              value="82%"
              status="success"
            />
          </div>

          <div className="mt-4 border border-yellow-200 bg-yellow-50 px-4 py-3 rounded-md">
            <p className="text-sm font-semibold text-yellow-800">
              Manual verification required.
            </p>
            <p className="text-xs text-yellow-700 mt-1">
              The proposed location has a possible overlap with an existing
              advertisement structure.
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

function CheckItem({ item }) {
  return (
    <div className="border border-slate-200 rounded-md px-4 py-3">
      <div className="flex items-start justify-between gap-3 mb-1">
        <p className="text-sm font-semibold text-slate-800">{item.label}</p>
        <StatusBadge value={item.result} />
      </div>
      <p className="text-xs text-slate-500">{item.description}</p>
    </div>
  );
}

function DecisionItem({ label, value, status }) {
  const border =
    status === "warning"
      ? "border-yellow-200 bg-yellow-50"
      : "border-green-200 bg-green-50";

  const text = status === "warning" ? "text-yellow-800" : "text-green-800";

  return (
    <div className={`border rounded-md px-4 py-3 ${border}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-sm font-semibold mt-1 ${text}`}>{value}</p>
    </div>
  );
}

function StatusBadge({ value }) {
  let className = "bg-slate-100 text-slate-700 border-slate-200";

  if (value === "Screened" || value === "Passed") {
    className = "bg-green-50 text-green-700 border-green-200";
  }

  if (value === "Pending" || value === "Warning") {
    className = "bg-yellow-50 text-yellow-700 border-yellow-200";
  }

  if (value === "Failed") {
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

export default AutoScreeningPage;