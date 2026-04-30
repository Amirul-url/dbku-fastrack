import DashboardLayout from "../../layout/DashboardLayout";

const licenses = [
  {
    id: "LIC-2026-0001",
    applicationId: "FT-2026-0002",
    applicant: "Kuching Food Hub",
    type: "Shop Signage",
    location: "Jalan Satok, Kuching",
    issueDate: "27 Apr 2026",
    expiryDate: "26 Apr 2027",
    status: "Active",
  },
  {
    id: "LIC-2026-0002",
    applicationId: "FT-2026-0005",
    applicant: "Sarawak Retail Group",
    type: "Billboard",
    location: "Petra Jaya, Kuching",
    issueDate: "20 Apr 2026",
    expiryDate: "19 Apr 2027",
    status: "Active",
  },
  {
    id: "LIC-2026-0003",
    applicationId: "FT-2026-0008",
    applicant: "Petra Jaya Enterprise",
    type: "Temporary Banner",
    location: "Kuching City Centre",
    issueDate: "10 Jan 2026",
    expiryDate: "09 Apr 2026",
    status: "Expired",
  },
];

function LicenseQrPage() {
  return (
    <DashboardLayout>
      <div className="mb-5 border-l-4 border-[#006d32] pl-4">
        <p className="text-xs uppercase tracking-wide font-semibold text-[#006d32] mb-1">
          License Management
        </p>
        <h1 className="text-2xl font-bold text-[#1a1c1c]">License QR</h1>
        <p className="text-sm text-slate-500 mt-1 max-w-4xl">
          Generate, view, and verify digital advertisement licenses using QR
          codes for real-time enforcement checks.
        </p>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <SummaryCard label="Active Licenses" value="82" />
        <SummaryCard label="Expired Licenses" value="9" />
        <SummaryCard label="Pending Issuance" value="6" />
        <SummaryCard label="QR Verified Today" value="18" />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        <Panel
          title="Digital License List"
          description="Issued advertisement licenses with QR verification status."
          className="xl:col-span-2"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            <Field label="Search License" className="md:col-span-2">
              <input className="form-input" placeholder="Search license..." />
            </Field>

            <Field label="Status">
              <select className="form-input">
                <option>All Status</option>
                <option>Active</option>
                <option>Expired</option>
                <option>Revoked</option>
              </select>
            </Field>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-slate-200">
              <thead className="bg-[#f1f5f4] text-slate-600">
                <tr>
                  <TableHead>License ID</TableHead>
                  <TableHead>Application ID</TableHead>
                  <TableHead>Applicant</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Expiry Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </tr>
              </thead>

              <tbody>
                {licenses.map((license) => (
                  <tr key={license.id} className="border-t hover:bg-[#fafafa]">
                    <TableCell strong>{license.id}</TableCell>
                    <TableCell>{license.applicationId}</TableCell>
                    <TableCell>{license.applicant}</TableCell>
                    <TableCell>{license.type}</TableCell>
                    <TableCell>{license.expiryDate}</TableCell>
                    <TableCell>
                      <StatusBadge value={license.status} />
                    </TableCell>
                    <TableCell>
                      <button className="text-[#006d32] font-semibold hover:underline">
                        View QR
                      </button>
                    </TableCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          title="QR Preview"
          description="Sample digital license QR code."
        >
          <div className="flex flex-col items-center">
            <div className="w-48 h-48 bg-white border border-slate-300 rounded-md flex items-center justify-center mb-4">
              <div className="grid grid-cols-5 gap-1">
                {Array.from({ length: 25 }).map((_, index) => (
                  <div
                    key={index}
                    className={`w-6 h-6 ${
                      index % 2 === 0 || index % 7 === 0
                        ? "bg-slate-900"
                        : "bg-white border border-slate-200"
                    }`}
                  />
                ))}
              </div>
            </div>

            <p className="text-sm font-bold text-slate-800">LIC-2026-0001</p>
            <p className="text-xs text-slate-500 text-center mt-1">
              Scan to verify license status, expiry date, and approved display
              location.
            </p>

            <div className="grid grid-cols-2 gap-3 w-full mt-5">
              <button className="py-2.5 bg-[#006d32] text-white rounded text-sm font-semibold hover:bg-[#005224]">
                Download QR
              </button>
              <button className="py-2.5 border border-slate-300 rounded text-sm font-semibold hover:bg-slate-50">
                Print License
              </button>
            </div>
          </div>
        </Panel>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel
          title="License Details"
          description="Information displayed after QR verification."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Info label="License ID" value="LIC-2026-0001" />
            <Info label="Application ID" value="FT-2026-0002" />
            <Info label="License Holder" value="Kuching Food Hub" />
            <Info label="Advertisement Type" value="Shop Signage" />
            <Info label="Issue Date" value="27 Apr 2026" />
            <Info label="Expiry Date" value="26 Apr 2027" />
            <Info label="Approved Location" value="Jalan Satok, Kuching" wide />
            <Info label="License Status" value="Active" />
          </div>
        </Panel>

        <Panel
          title="Enforcement Verification"
          description="Verification checkpoints after QR scan."
        >
          <div className="space-y-2">
            <VerificationItem label="QR Scan Result" value="Valid License" />
            <VerificationItem label="License Status" value="Active" />
            <VerificationItem label="Location Match" value="Matched" />
            <VerificationItem label="Expiry Check" value="Not Expired" />
          </div>

          <div className="mt-4 border border-green-200 bg-green-50 px-4 py-3 rounded-md">
            <p className="text-sm font-semibold text-green-800">
              This license is valid and registered under fasTrack.
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

function Info({ label, value, wide = false }) {
  return (
    <div className={wide ? "md:col-span-2" : ""}>
      <p className="text-xs uppercase text-slate-400 font-semibold mb-1">
        {label}
      </p>
      <p className="text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function VerificationItem({ label, value }) {
  return (
    <div className="flex items-center justify-between border border-slate-200 rounded-md px-4 py-3">
      <div>
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        <p className="text-xs text-slate-500">Verification checkpoint</p>
      </div>

      <StatusBadge value={value} />
    </div>
  );
}

function StatusBadge({ value }) {
  let className = "bg-slate-100 text-slate-700 border-slate-200";

  if (
    value === "Active" ||
    value === "Valid License" ||
    value === "Matched" ||
    value === "Not Expired"
  ) {
    className = "bg-green-50 text-green-700 border-green-200";
  }

  if (value === "Expired" || value === "Revoked") {
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

export default LicenseQrPage;