import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  fetchPublicLicenseVerification,
  getApiUrl,
} from "../../services/api";

function LicenseVerificationPage() {
  const { licenseId } = useParams();
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function openSourceLicenseDocument() {
      try {
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
      }
    }

    openSourceLicenseDocument();
    return () => {
      active = false;
    };
  }, [licenseId]);

  if (!error) return null;

  return (
    <div className="min-h-screen bg-[#f5f7f6] px-4 py-8 text-[#1a1c1c]">
      <div className="mx-auto max-w-4xl">
        <StatusNotice
          title="License unavailable"
          description={error || "The scanned license ID does not match an available license document."}
        />
      </div>
    </div>
  );
}

function StatusNotice({ title, description }) {
  return (
    <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-5 py-4 text-red-800">
      <p className="text-base font-bold">{title}</p>
      <p className="mt-1 text-sm">{description}</p>
    </div>
  );
}

export default LicenseVerificationPage;
