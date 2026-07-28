import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  fetchPublicLicenseVerification,
  getApiUrl,
} from "../../services/api";

const PDF_MIME_TYPE = "application/pdf";
const HTML_MIME_TYPE = "text/html;charset=utf-8";

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

        const blobUrl = await fetchLicenseDocumentBlobUrl(verification.document_url);
        if (!active) return;

        window.location.replace(blobUrl);
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

async function fetchLicenseDocumentBlobUrl(documentUrl) {
  const response = await fetch(getApiUrl(documentUrl), {
    headers: {
      Accept: "application/pdf,text/html;q=0.9,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error("Advertisement license document is unavailable.");
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.toLowerCase().includes(PDF_MIME_TYPE)) {
    const pdfBlob = await response.blob();
    const normalizedPdfBlob = pdfBlob.type === PDF_MIME_TYPE
      ? pdfBlob
      : new Blob([pdfBlob], { type: PDF_MIME_TYPE });
    return URL.createObjectURL(normalizedPdfBlob);
  }

  const html = await response.text();
  const htmlBlob = new Blob([prepareStandaloneHtmlDocument(html, documentUrl)], {
    type: HTML_MIME_TYPE,
  });
  return URL.createObjectURL(htmlBlob);
}

function prepareStandaloneHtmlDocument(html, documentUrl) {
  const baseHref = getDocumentBaseHref(documentUrl);
  const printableCss = `
    <style>
      .print-actions { display: none !important; }
      html, body { background: #ffffff !important; }
    </style>
  `;

  return String(html || "")
    .replace(/<head([^>]*)>/i, `<head$1><base href="${escapeHtmlAttribute(baseHref)}" />`)
    .replace(/<\/head>/i, `${printableCss}</head>`);
}

function getDocumentBaseHref(documentUrl) {
  try {
    const resolvedUrl = new URL(getApiUrl(documentUrl), window.location.href);
    return `${resolvedUrl.origin}/`;
  } catch {
    return `${window.location.origin}/`;
  }
}

function escapeHtmlAttribute(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
