import DashboardLayout from "../../layout/DashboardLayout";

function EnforcementScanPage() {
  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto">
        {/* HEADER */}
        <div className="mb-6 border-l-4 border-[#006d32] pl-4">
          <p className="text-xs uppercase tracking-wide font-semibold text-[#006d32] mb-1">
            Enforcement Module
          </p>
          <h1 className="text-2xl font-bold text-[#1a1c1c]">
            QR Verification
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Scan advertisement license QR code to verify validity and compliance.
          </p>
        </div>

        {/* SCANNER */}
        <section className="bg-white border border-slate-200 rounded-md p-5 mb-6">
          <h2 className="text-base font-bold text-[#1a1c1c] mb-4">
            QR Scanner
          </h2>

          <div className="flex flex-col items-center">
            <div className="w-full max-w-sm aspect-square border-2 border-dashed border-slate-300 rounded-md flex items-center justify-center mb-4 bg-[#fafafa]">
              <div className="text-center">
                <span className="material-symbols-outlined text-5xl text-slate-400">
                  qr_code_scanner
                </span>
                <p className="text-xs text-slate-500 mt-2">
                  Camera scanner will appear here
                </p>
              </div>
            </div>

            <button className="px-5 py-2.5 bg-[#006d32] text-white rounded text-sm font-semibold hover:bg-[#005224]">
              Start Scanning
            </button>
          </div>
        </section>

        {/* RESULT */}
        <section className="bg-white border border-slate-200 rounded-md overflow-hidden">
          <div className="border-t-4 border-[#006d32] px-5 py-4 border-b border-slate-200">
            <h2 className="text-base font-bold text-[#1a1c1c]">
              Verification Result
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              License information retrieved after QR scan.
            </p>
          </div>

          <div className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Info label="License ID" value="LIC-2026-0001" />
              <Info label="Application ID" value="FT-2026-0002" />
              <Info label="License Holder" value="Kuching Food Hub" />
              <Info label="Advertisement Type" value="Shop Signage" />
              <Info label="Approved Location" value="Jalan Satok, Kuching" />
              <Info label="Expiry Date" value="26 Apr 2027" />
              <Info label="License Status" value="Active" />
              <Info label="QR Scan Result" value="Valid" />
            </div>

            <div className="mt-5 border border-green-200 bg-green-50 px-4 py-3 rounded-md">
              <p className="text-sm font-semibold text-green-800">
                Valid License — Approved and Active
              </p>
              <p className="text-xs text-green-700 mt-1">
                This advertisement license is registered and compliant under the
                fasTrack system.
              </p>
            </div>

            {/* ACTION */}
            <div className="grid grid-cols-2 gap-3 mt-5">
              <button className="py-2.5 bg-[#006d32] text-white rounded text-sm font-semibold hover:bg-[#005224]">
                Mark as Checked
              </button>

              <button className="py-2.5 border border-slate-300 rounded text-sm font-semibold hover:bg-slate-50">
                Report Issue
              </button>
            </div>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-xs uppercase text-slate-400 font-semibold mb-1">
        {label}
      </p>
      <p className="text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

export default EnforcementScanPage;