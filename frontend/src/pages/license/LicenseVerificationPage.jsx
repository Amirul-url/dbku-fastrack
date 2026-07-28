import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  fetchPublicLicenseVerification,
  getApiUrl,
} from "../../services/api";

const PDF_MIME_TYPE = "application/pdf";
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const PRINTABLE_PAGE_SELECTORS = [
  ".ad-license-page",
  ".receipt",
  ".bill",
  ".page",
];

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

        const documentBlob = await fetchLicenseDocumentAsPdfBlob(verification.document_url);
        if (!active) return;

        const blobUrl = URL.createObjectURL(documentBlob);
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

async function fetchLicenseDocumentAsPdfBlob(documentUrl) {
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
    return pdfBlob.type === PDF_MIME_TYPE
      ? pdfBlob
      : new Blob([pdfBlob], { type: PDF_MIME_TYPE });
  }

  const html = await response.text();
  return buildPdfBlobFromHtmlDocument(html, documentUrl);
}

async function buildPdfBlobFromHtmlDocument(html, documentUrl) {
  const [{ jsPDF }, html2canvasModule] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);
  const html2canvas = html2canvasModule.default;
  const frame = await createPrintableDocumentFrame(html, documentUrl);

  try {
    const frameDocument = frame.contentDocument;
    const pages = getPrintablePages(frameDocument);
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    for (const [index, page] of pages.entries()) {
      if (index > 0) pdf.addPage("a4", "portrait");

      const canvas = await html2canvas(page, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        windowWidth: page.scrollWidth,
        windowHeight: page.scrollHeight,
      });

      const imageData = canvas.toDataURL("image/jpeg", 0.96);
      pdf.addImage(imageData, "JPEG", 0, 0, A4_WIDTH_MM, A4_HEIGHT_MM);
    }

    return pdf.output("blob");
  } finally {
    frame.remove();
  }
}

function createPrintableDocumentFrame(html, documentUrl) {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.position = "fixed";
    frame.style.left = "-10000px";
    frame.style.top = "0";
    frame.style.width = "794px";
    frame.style.height = "1123px";
    frame.style.border = "0";
    frame.style.opacity = "0";

    const timeout = window.setTimeout(() => {
      frame.remove();
      reject(new Error("Advertisement license document could not be prepared."));
    }, 15000);

    frame.onload = async () => {
      try {
        window.clearTimeout(timeout);
        await waitForFrameAssets(frame.contentDocument);
        resolve(frame);
      } catch (error) {
        frame.remove();
        reject(error);
      }
    };
    frame.onerror = () => {
      window.clearTimeout(timeout);
      frame.remove();
      reject(new Error("Advertisement license document could not be loaded."));
    };

    document.body.appendChild(frame);
    frame.srcdoc = preparePrintableHtml(html, documentUrl);
  });
}

function preparePrintableHtml(html, documentUrl) {
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

async function waitForFrameAssets(frameDocument) {
  await waitForFrameImages(frameDocument);
  if (frameDocument?.fonts?.ready) {
    await frameDocument.fonts.ready;
  }
  await new Promise((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
  });
}

function waitForFrameImages(frameDocument) {
  const images = Array.from(frameDocument?.images || []);
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

function getPrintablePages(frameDocument) {
  const pages = PRINTABLE_PAGE_SELECTORS.flatMap((selector) =>
    Array.from(frameDocument.querySelectorAll(selector))
  );
  const uniquePages = Array.from(new Set(pages));

  return uniquePages.length > 0 ? uniquePages : [frameDocument.body];
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
