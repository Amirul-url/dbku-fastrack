import { useState } from "react";
import DashboardLayout from "../../../layout/DashboardLayout";
import { Link } from "react-router-dom";
import ApplicationStepNav from "../../../components/ApplicationStepNav";

function DeclarationPage() {
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = () => {
    if (!agreed) {
      setError("Please confirm the declaration before submitting.");
      return;
    }

    setError("");
    setSuccess(true);

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <DashboardLayout>
      <div className="flex gap-5">
        <ApplicationStepNav active={11} />

        <main className="flex-1 min-w-0">
          {/* SUCCESS MESSAGE */}
          {success && (
            <div className="mb-4 p-3 border border-green-200 bg-green-50 rounded text-sm text-green-700 font-semibold">
              ✅ Application submitted successfully.
            </div>
          )}

          {/* Header */}
          <div className="mb-4 flex items-center gap-3">
            <span className="bg-[#18b36b] text-white text-sm font-bold px-3 py-1">
              11
            </span>
            <h1 className="text-xl font-semibold text-[#1a1c1c]">
              Declaration
            </h1>
          </div>

          <section className="bg-white border border-slate-200 rounded-sm overflow-hidden">
            {/* Top Info */}
            <div className="bg-[#f5f5f5] border-b border-slate-200 px-4 py-3">
              <div className="grid grid-cols-[160px_1fr] gap-y-1 text-[11px]">
                <Label>Digital Reference</Label>
                <Value>ESPA.2025-1443</Value>

                <Label>Agency Reference</Label>
                <Value>SP/10/159/2024</Value>

                <Label>Status</Label>
                <Value>
                  Siting approval granted to applicant (Formal Approval)
                </Value>

                <Label>Application Type</Label>
                <Value>Application of Siting Project</Value>

                <Label>Division</Label>
                <Value>KUCHING</Value>
              </div>
            </div>

            <div className="p-4 space-y-5 text-[12px]">
              {/* Important */}
              <div>
                <p className="font-bold text-[#006d32] mb-1">Important:</p>
                <p className="text-slate-700">
                  Please consult L&S Divisional Office to obtain L&S Reference
                  specific to your application.
                </p>
              </div>

              {/* ERROR */}
              {error && (
                <div className="p-2 border border-red-200 bg-red-50 text-red-600 text-xs rounded">
                  {error}
                </div>
              )}

              {/* Checkbox */}
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-1 accent-[#18b36b]"
                />
                <p className="text-slate-700 leading-relaxed">
                  I, <b>SAMSURY BIN SAHARI</b>, on behalf of DEWAN BANDARAYA
                  KUCHING UTARA (DBKU), declare that I shall bear full
                  responsibility as to the accuracy of the information(s) as
                  provided by me on this Siting Application.
                </p>
              </div>

              {/* Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="border border-slate-200 rounded-sm p-3">
                  <p className="text-xs text-slate-500 mb-1">
                    Date of Site Inspection with L&S
                  </p>
                  <p className="font-semibold">18/07/2025</p>
                </div>

                <div className="border border-slate-200 rounded-sm p-3">
                  <p className="text-xs text-slate-500 mb-1">
                    L&S Reference
                  </p>
                  <p className="font-semibold">SP/10/159/2024</p>
                </div>
              </div>

              {/* Submitting Info */}
              <div className="border border-slate-200 rounded-sm">
                <div className="bg-[#f7f7f7] border-b px-3 py-2 text-xs font-bold">
                  Submitting Person Information
                </div>

                <div className="p-3 grid grid-cols-[160px_1fr] gap-y-2 text-[12px]">
                  <Label>Address</Label>
                  <Value>
                    DEWAN BANDARAYA KUCHING UTARA (DBKU),
                    <br />
                    DBKU, BUKIT SIOL, JALAN SEMARIANG PETRA JAYA,
                    <br />
                    93050, Kuching, Sarawak
                  </Value>

                  <Label>Telephone No</Label>
                  <Value>0198265638</Value>

                  <Label>SPA Registration No</Label>
                  <Value>-</Value>

                  <Label>SPA Registration Expiry Date</Label>
                  <Value>-</Value>

                  <Label>Email Address</Label>
                  <Value>samsury@dbku.gov.my</Value>
                </div>
              </div>

              {/* BUTTONS */}
              <div className="flex justify-end gap-2 pt-3">
                <Link
                  to="/applications/supporting-document"
                  className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
                >
                  ← Back
                </Link>

                <button
                  onClick={handleSubmit}
                  className="px-4 py-1.5 bg-[#006d32] text-white rounded text-xs font-bold hover:bg-[#005224]"
                >
                  Submit Application
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>
    </DashboardLayout>
  );
}

function Label({ children }) {
  return <p className="text-slate-600">{children}</p>;
}

function Value({ children }) {
  return <p className="font-semibold text-[#006d32]">{children}</p>;
}

export default DeclarationPage;