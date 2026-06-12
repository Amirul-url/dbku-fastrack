import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  fetchPublicLicenseVerification,
  getApiUrl,
} from "../../services/api";

function LicenseVerificationPage() {
  const { licenseId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function openLicenseDocument() {
      try {
        setLoading(true);
        setError("");
        const verification = await fetchPublicLicenseVerification(licenseId);
        if (!active) return;

        if (!verification?.document_url) {
          throw new Error("Advertisement license document is unavailable.");
        }

        window.location.replace(getApiUrl(verification.document_url));
      } catch (requestError) {
        if (!active) return;
        console.error("Failed to verify license:", requestError);
        setError(requestError.message || "The scanned license could not be opened.");
        setLoading(false);
      }
    }

    openLicenseDocument();
    return () => {
      active = false;
    };
  }, [licenseId]);

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
            <p className="text-sm text-slate-500">Opening advertisement license...</p>
          </Panel>
        ) : (
          <Panel>
            <StatusNotice
              type="error"
              title="License unavailable"
              description={error || "The scanned license ID does not match an available license document."}
            />
          </Panel>
        )}
      </div>
    </div>
  );
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
