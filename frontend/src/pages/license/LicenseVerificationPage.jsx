import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
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

    async function openSourceLicensePdfViewer() {
      try {
        setLoading(true);
        setError("");
        const verification = await fetchPublicLicenseVerification(licenseId);
        if (!active || requestId !== printRequestRef.current) return;

        if (!verification?.document_url) {
          throw new Error("Advertisement license document is unavailable.");
        }

        const title = getLicensePrintTitle(verification);
        const pdfUrl = await getSourceLicensePdfViewerUrl(verification.document_url, title);
        if (!active || requestId !== printRequestRef.current) return;
        window.location.replace(pdfUrl);
      } catch (requestError) {
        if (!active || requestId !== printRequestRef.current) return;
        console.error("Failed to verify license:", requestError);
        setError(requestError.message || "The scanned license could not be opened.");
        setLoading(false);
      }
    }

    openSourceLicensePdfViewer();
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
              The advertisement license PDF viewer has been opened from the source license document.
            </p>
          </Panel>
        )}
      </div>
    </div>
  );
}

async function getSourceLicensePdfViewerUrl(documentUrl, title) {
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
    return URL.createObjectURL(normalizedPdfBlob);
  }

  const html = await response.text();
  const pdfBlob = await renderHtmlLicenseToPdfBlob(
    prepareStandaloneHtmlDocument(html, documentUrl),
    title
  );
  return URL.createObjectURL(pdfBlob);
}

async function renderHtmlLicenseToPdfBlob(html, title) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "210mm";
  iframe.style.height = "297mm";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  const frameDocument = iframe.contentDocument;
  const frameWindow = iframe.contentWindow;
  if (!frameDocument || !frameWindow) {
    iframe.remove();
    throw new Error("Unable to prepare print document.");
  }

  frameDocument.open();
  frameDocument.write(prepareHtmlForPdfCapture(html));
  frameDocument.close();
  frameDocument.title = title;

  await waitForDocumentImages(frameDocument);
  if (frameDocument?.fonts?.ready) {
    await frameDocument.fonts.ready;
  }
  await new Promise((resolve) => setTimeout(resolve, 250));

  try {
    const pages = Array.from(frameDocument.querySelectorAll(".ad-license-page"));
    const pdf = new jsPDF("p", "mm", "a4");
    pdf.setProperties({ title });

    const printablePages = pages.length > 0 ? pages : [frameDocument.body];
    for (const [index, page] of printablePages.entries()) {
      if (index > 0) pdf.addPage();

      const canvas = await html2canvas(page, {
        backgroundColor: "#ffffff",
        logging: false,
        scale: 2,
        useCORS: true,
        windowWidth: page.scrollWidth,
        windowHeight: page.scrollHeight,
      });
      const imageData = canvas.toDataURL("image/png");
      pdf.addImage(imageData, "PNG", 0, 0, 210, 297, undefined, "FAST");
    }

    return pdf.output("blob");
  } finally {
    iframe.remove();
  }
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

function prepareHtmlForPdfCapture(html) {
  const pdfCss = `
    <style data-license-pdf-capture="true">
      html, body {
        width: 210mm !important;
        min-height: 297mm !important;
        margin: 0 !important;
        background: #ffffff !important;
        overflow: visible !important;
      }
      .print-actions { display: none !important; }
      .ad-license-page {
        width: 210mm !important;
        min-height: 297mm !important;
        margin: 0 !important;
        box-shadow: none !important;
        overflow: hidden !important;
      }
      .dot-line {
        border-bottom: 0 !important;
        background-image: linear-gradient(to right, #111 44%, transparent 0) !important;
        background-position: left calc(100% - 0.6mm) !important;
        background-repeat: repeat-x !important;
        background-size: 1.35mm 1px !important;
        line-height: 5.2mm !important;
        min-height: 5.8mm !important;
        padding-bottom: 0.5mm !important;
      }
      [contenteditable="true"] { outline: none !important; box-shadow: none !important; }
    </style>
  `;

  return String(html || "").replace(/<\/head>/i, `${pdfCss}</head>`);
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
