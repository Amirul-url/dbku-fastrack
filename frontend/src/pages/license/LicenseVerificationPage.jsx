import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { apiRequest } from "../../services/api";
import {
  formatDate,
  getApplicantName,
  getApplicationLocation,
  getApplicationReference,
  getApplicationType,
} from "../../utils/workflow";

function LicenseVerificationPage() {
  const { licenseId } = useParams();

  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchApplications();
  }, []);

  async function fetchApplications() {
    try {
      setLoading(true);
      const data = await apiRequest("/applications/");
      const list = Array.isArray(data) ? data : data?.results || [];
      setApplications(list);
    } catch (error) {
      console.error("Failed to verify license:", error);
    } finally {
      setLoading(false);
    }
  }

  const application = useMemo(() => {
    return applications.find(
      (app) => app.form_data?.license?.license_id === licenseId
    );
  }, [applications, licenseId]);

  const license = application?.form_data?.license || {};
  const isActive = license.status === "Active" && !isExpired(license.expiry_date);

  return (
    <div className="min-h-screen bg-[#f5f7f6] px-4 py-8 text-[#1a1c1c]">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 border-l-4 border-[#006d32] pl-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#006d32]">
            ALiS License Verification
          </p>
          <h1 className="text-2xl font-bold">Digital License Details</h1>
          <p className="mt-1 text-sm text-slate-500">
            Verification result for scanned advertisement license QR.
          </p>
        </div>

        {loading ? (
          <Panel>
            <p className="text-sm text-slate-500">Loading license details...</p>
          </Panel>
        ) : !application ? (
          <Panel>
            <StatusNotice
              type="error"
              title="License not found"
              description="The scanned license ID does not match any license record."
            />
          </Panel>
        ) : (
          <>
            <StatusNotice
              type={isActive ? "success" : "warning"}
              title={isActive ? "Valid License" : "License Requires Attention"}
              description={
                isActive
                  ? "This advertisement license is active and registered in ALiS."
                  : "This license is expired, revoked, or not active."
              }
            />

            <Panel title="License Details">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Info label="License ID" value={license.license_id} />
                <Info label="Application ID" value={getApplicationReference(application)} />
                <Info label="License Holder" value={getApplicantName(application)} />
                <Info label="Advertisement Type" value={getApplicationType(application)} />
                <Info label="Approved Location" value={getApplicationLocation(application)} wide />
                <Info label="Issue Date" value={formatDate(license.issue_date)} />
                <Info label="Expiry Date" value={formatDate(license.expiry_date)} />
                <Info label="License Status" value={license.status || "Not provided"} />
              </div>
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}

function isExpired(value) {
  if (!value) return true;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return true;
  return date.getTime() < Date.now();
}

function Panel({ title, children }) {
  return (
    <section className="mb-6 overflow-hidden rounded-md border border-slate-200 bg-white">
      {title && (
        <div className="border-b border-slate-200 border-t-4 border-[#006d32] px-5 py-4">
          <h2 className="text-base font-bold">{title}</h2>
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

function Info({ label, value, wide = false }) {
  return (
    <div className={wide ? "md:col-span-2" : ""}>
      <p className="mb-1 text-xs font-semibold uppercase text-slate-400">
        {label}
      </p>
      <p className="text-sm font-semibold text-slate-800">{value || "-"}</p>
    </div>
  );
}

function StatusNotice({ type, title, description }) {
  const styles =
    type === "success"
      ? "border-green-200 bg-green-50 text-green-800"
      : type === "error"
        ? "border-red-200 bg-red-50 text-red-800"
        : "border-yellow-200 bg-yellow-50 text-yellow-800";

  return (
    <div className={`mb-6 rounded-md border px-5 py-4 ${styles}`}>
      <p className="text-base font-bold">{title}</p>
      <p className="mt-1 text-sm">{description}</p>
    </div>
  );
}

export default LicenseVerificationPage;