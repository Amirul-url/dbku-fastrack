import { useMemo, useState } from "react";
import AdminDashboardLayout from "../../layout/AdminDashboardLayout";
import { fetchApplicationList } from "../../services/api";
import {
  formatDate,
  getApplicantName,
  getApplicationLocation,
  getApplicationReference,
  getApplicationType,
} from "../../utils/workflow";

function EnforcementScanPage() {
  const [licenseInput, setLicenseInput] = useState("");
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const license = application?.form_data?.license || {};

  const isActive = useMemo(() => {
    if (!license?.status) return false;
    if (license.status !== "Active") return false;

    const expiry = new Date(license.expiry_date);
    if (Number.isNaN(expiry.getTime())) return false;

    return expiry.getTime() >= Date.now();
  }, [license]);

  async function handleVerify() {
    const value = licenseInput.trim();

    if (!value) {
      setMessage("Please enter license ID or verification link.");
      return;
    }

    try {
      setLoading(true);
      setMessage("");
      setApplication(null);

      const licenseId = extractLicenseId(value);
      const list = await fetchApplicationList({
        params: { status: ["license_issued", "license_revoked"] },
      });

      const found = list.find(
        (app) => app.form_data?.license?.license_id === licenseId
      );

      if (!found) {
        setMessage("License not found.");
        return;
      }

      setApplication(found);
    } catch (error) {
      console.error("Verification failed:", error);
      setMessage("Failed to verify license.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AdminDashboardLayout>
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 border-l-4 border-[#006d32] pl-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#006d32]">
            Enforcement Module
          </p>
          <h1 className="text-2xl font-bold text-[#1a1c1c]">QR Verification</h1>
          <p className="mt-1 text-sm text-slate-500">
            Scan or enter advertisement license QR link to verify validity and compliance.
          </p>
        </div>

        <section className="mb-6 rounded-md border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-base font-bold text-[#1a1c1c]">QR Scanner</h2>

          <div className="flex flex-col items-center">
            <div className="mb-4 flex aspect-square w-full max-w-sm items-center justify-center rounded-md border-2 border-dashed border-slate-300 bg-[#fafafa]">
              <div className="text-center">
                <span className="material-symbols-outlined text-5xl text-slate-400">
                  qr_code_scanner
                </span>
                <p className="mt-2 text-xs text-slate-500">
                  Camera scanner can be connected later.
                </p>
              </div>
            </div>

            <div className="flex w-full max-w-xl flex-col gap-3 sm:flex-row">
              <input
                value={licenseInput}
                onChange={(event) => setLicenseInput(event.target.value)}
                className="form-input flex-1"
                placeholder="Paste license ID or verification link..."
              />

              <button
                type="button"
                onClick={handleVerify}
                disabled={loading}
                className="rounded bg-[#006d32] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#005224] disabled:opacity-60"
              >
                {loading ? "Verifying..." : "Verify"}
              </button>
            </div>

            {message && (
              <p className="mt-3 text-sm font-semibold text-red-600">{message}</p>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-md border border-slate-200 bg-white">
          <div className="border-b border-slate-200 border-t-4 border-[#006d32] px-5 py-4">
            <h2 className="text-base font-bold text-[#1a1c1c]">
              Verification Result
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              License information retrieved after QR scan.
            </p>
          </div>

          <div className="p-5">
            {!application ? (
              <div className="rounded border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                No license selected.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Info label="License ID" value={license.license_id} />
                  <Info label="Application ID" value={getApplicationReference(application)} />
                  <Info label="License Holder" value={getApplicantName(application)} />
                  <Info label="Advertisement Type" value={getApplicationType(application)} />
                  <Info label="Approved Location" value={getApplicationLocation(application)} />
                  <Info label="Expiry Date" value={formatDate(license.expiry_date)} />
                  <Info label="License Status" value={license.status || "Not provided"} />
                  <Info label="QR Scan Result" value={isActive ? "Valid" : "Invalid"} />
                </div>

                <div
                  className={`mt-5 rounded-md border px-4 py-3 ${
                    isActive
                      ? "border-green-200 bg-green-50 text-green-800"
                      : "border-red-200 bg-red-50 text-red-800"
                  }`}
                >
                  <p className="text-sm font-semibold">
                    {isActive
                      ? "Valid License — Approved and Active"
                      : "Invalid License — Action Required"}
                  </p>
                  <p className="mt-1 text-xs">
                    {isActive
                      ? "This advertisement license is registered and active under ALiS."
                      : "This license is expired, revoked, missing, or not active."}
                  </p>
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </AdminDashboardLayout>
  );
}

function extractLicenseId(value) {
  const parts = value.split("/");
  return parts[parts.length - 1].trim();
}

function Info({ label, value }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase text-slate-400">
        {label}
      </p>
      <p className="text-sm font-semibold text-slate-800">{value || "-"}</p>
    </div>
  );
}

export default EnforcementScanPage;
