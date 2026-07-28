import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  fetchPublicLicenseVerification,
  getApiUrl,
} from "../../services/api";

const PDF_MIME_TYPE = "application/pdf";

function LicenseVerificationPage() {
  const { licenseId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const printRequestRef = useRef(0);

  useEffect(() => {
    let active = true;
    const requestId = printRequestRef.current + 1;
    printRequestRef.current = requestId;

    async function openSourceLicensePrintPreview() {
      try {
        setLoading(true);
        setError("");
        const verification = await fetchPublicLicenseVerification(licenseId);
        if (!active || requestId !== printRequestRef.current) return;

        if (!verification?.document_url) {
          throw new Error("Advertisement license document is unavailable.");
        }

        const title = getLicensePrintTitle(verification);
        await printSourceLicenseDocument(verification.document_url, title);
        if (!active || requestId !== printRequestRef.current) return;
        setLoading(false);
      } catch (requestError) {
        if (!active || requestId !== printRequestRef.current) return;
        console.error("Failed to verify license:", requestError);
        setError(requestError.message || "The scanned license could not be opened.");
        setLoading(false);
      }
    }

    openSourceLicensePrintPreview();
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
        ) : error ? (
          <Panel>
            <StatusNotice
              type="error"
              title="License unavailable"
              description={error || "The scanned license ID does not match an available license document."}
            />
          </Panel>
        ) : (
          <Panel title="Advertisement License">
            <p className="text-sm text-slate-500">
              The advertisement license print preview has been opened from the source license document.
            </p>
          </Panel>
        )}
      </div>
    </div>
  );
}

async function printSourceLicenseDocument(documentUrl, title) {
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
    const normalizedPdfBlob =
      pdfBlob.type === PDF_MIME_TYPE
        ? pdfBlob
        : new Blob([pdfBlob], { type: PDF_MIME_TYPE });
    const pdfUrl = URL.createObjectURL(normalizedPdfBlob);

    try {
      await printUrlDocument(pdfUrl, title);
    } finally {
      setTimeout(() => URL.revokeObjectURL(pdfUrl), 60000);
    }
    return;
  }

  const html = await response.text();
  await printHtmlDocument(prepareStandaloneHtmlDocument(html, documentUrl), title);
}

async function printHtmlDocument(html, title) {
  const originalTitle = document.title;
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  const frameDocument = iframe.contentDocument;
  const frameWindow = iframe.contentWindow;
  if (!frameDocument || !frameWindow) {
    iframe.remove();
    throw new Error("Unable to prepare print document.");
  }

  frameDocument.open();
  frameDocument.write(html);
  frameDocument.close();
  frameDocument.title = title;
  document.title = title;

  await waitForDocumentImages(frameDocument);
  if (frameDocument?.fonts?.ready) {
    await frameDocument.fonts.ready;
  }
  await new Promise((resolve) => setTimeout(resolve, 250));

  const cleanup = () => {
    document.title = originalTitle;
    setTimeout(() => iframe.remove(), 500);
  };
  frameWindow.addEventListener("afterprint", cleanup, { once: true });
  setTimeout(cleanup, 120000);

  frameWindow.focus();
  frameWindow.print();
}

async function printUrlDocument(url, title) {
  const originalTitle = document.title;
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.setAttribute("aria-hidden", "true");

  const cleanup = () => {
    document.title = originalTitle;
    setTimeout(() => iframe.remove(), 500);
  };

  document.body.appendChild(iframe);
  document.title = title;

  await new Promise((resolve, reject) => {
    iframe.onload = resolve;
    iframe.onerror = reject;
    iframe.src = url;
  });
  await new Promise((resolve) => setTimeout(resolve, 500));

  const frameWindow = iframe.contentWindow;
  if (!frameWindow) {
    cleanup();
    throw new Error("Unable to prepare print document.");
  }

  frameWindow.addEventListener("afterprint", cleanup, { once: true });
  setTimeout(cleanup, 120000);
  frameWindow.focus();
  frameWindow.print();
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

function waitForDocumentImages(frameDocument) {
  const images = Array.from(frameDocument.images || []);
  if (images.length === 0) return Promise.resolve();

  return Promise.all(
    images.map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise((resolve) => {
        image.onload = resolve;
        image.onerror = resolve;
      });
    })
  );
}

function getLicensePrintTitle(verification = {}) {
  const reference = String(verification.reference_no || verification.license_id || "ALiS License").trim();
  const documentName = String(verification.document_name || "Advertisement License").trim();
  return `${reference} ${documentName}`.trim();
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
