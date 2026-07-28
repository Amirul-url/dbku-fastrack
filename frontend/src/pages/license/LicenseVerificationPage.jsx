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
  const [documentHtml, setDocumentHtml] = useState("");
  const [documentUrl, setDocumentUrl] = useState("");
  const [documentTitle, setDocumentTitle] = useState("Advertisement License");
  const previewUrlRef = useRef("");
  const requestRef = useRef(0);

  useEffect(() => {
    let active = true;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    async function loadSourceLicenseDocument() {
      try {
        setLoading(true);
        setError("");
        setDocumentHtml("");
        setDocumentUrl("");

        const verification = await fetchPublicLicenseVerification(licenseId);
        if (!active || requestId !== requestRef.current) return;

        if (!verification?.document_url) {
          throw new Error("Advertisement license document is unavailable.");
        }

        const title = getLicensePrintTitle(verification);
        const preview = await getSourceLicensePreview(verification.document_url);
        if (!active || requestId !== requestRef.current) return;

        if (previewUrlRef.current) {
          URL.revokeObjectURL(previewUrlRef.current);
        }
        previewUrlRef.current = preview.objectUrl || "";

        setDocumentTitle(title);
        setDocumentHtml(preview.html || "");
        setDocumentUrl(preview.url || "");
        setLoading(false);
      } catch (requestError) {
        if (!active || requestId !== requestRef.current) return;
        console.error("Failed to verify license:", requestError);
        setError(requestError.message || "The scanned license could not be opened.");
        setLoading(false);
      }
    }

    loadSourceLicenseDocument();
    return () => {
      active = false;
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = "";
      }
    };
  }, [licenseId]);

  async function handlePrintLicense() {
    try {
      setError("");
      if (documentHtml) {
        await printHtmlDocument(documentHtml, documentTitle);
      } else if (documentUrl) {
        await printUrlDocument(documentUrl, documentTitle);
      }
    } catch (printError) {
      console.error("Failed to print license:", printError);
      setError(printError.message || "The advertisement license could not be printed.");
    }
  }

  const canPrint = !loading && !error && (documentHtml || documentUrl);

  return (
    <div className="min-h-screen bg-[#eef3f7] px-4 py-5 text-[#1a1c1c]">
      <div className="mx-auto max-w-6xl">
        <header className="mb-4 flex items-center justify-between gap-4 border border-slate-200 border-l-[#006d32] border-l-4 bg-white px-5 py-4 shadow-sm">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#006d32]">
              ALiS License Verification
            </p>
            <h1 className="text-2xl font-bold">Digital License Details</h1>
          </div>
          <button
            type="button"
            onClick={handlePrintLicense}
            disabled={!canPrint}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md bg-[#006d32] px-5 text-sm font-bold text-white shadow-sm hover:bg-[#005224] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Print License
          </button>
        </header>

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
          <section className="overflow-hidden border border-slate-300 bg-white shadow-sm">
            <iframe
              title={documentTitle}
              src={documentUrl || undefined}
              srcDoc={documentHtml || undefined}
              className="h-[calc(100vh-9.75rem)] min-h-[620px] w-full border-0 bg-white"
            />
          </section>
        )}
      </div>
    </div>
  );
}

async function getSourceLicensePreview(documentUrl) {
  const response = await fetch(getApiUrl(documentUrl), {
    headers: {
      Accept: "text/html,application/pdf;q=0.9,*/*;q=0.8",
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
    const objectUrl = URL.createObjectURL(normalizedPdfBlob);
    return { url: objectUrl, objectUrl };
  }

  const html = await response.text();
  return {
    html: prepareStandaloneHtmlDocument(html, documentUrl),
    objectUrl: "",
  };
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
  const previewCss = `
    <style>
      .print-actions { display: none !important; }
      html, body { background: #ffffff !important; }
    </style>
  `;

  return String(html || "")
    .replace(/<head([^>]*)>/i, `<head$1><base href="${escapeHtmlAttribute(baseHref)}" />`)
    .replace(/<\/head>/i, `${previewCss}</head>`);
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

function Panel({ children }) {
  return (
    <section className="mb-6 overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="p-5">{children}</div>
    </section>
  );
}

function StatusNotice({ type, title, description }) {
  const styles =
    type === "error"
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
