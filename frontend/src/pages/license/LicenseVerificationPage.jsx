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
  const requestRef = useRef(0);

  useEffect(() => {
    let active = true;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    async function loadSourceLicenseDocument() {
      try {
        setLoading(true);
        setError("");

        const verification = await fetchPublicLicenseVerification(licenseId);
        if (!active || requestId !== requestRef.current) return;

        if (!verification?.document_url) {
          throw new Error("Advertisement license document is unavailable.");
        }

        const title = getLicensePrintTitle(verification);
        const blobUrl = await getSourceLicenseBlobUrl(verification.document_url, title);
        if (!active || requestId !== requestRef.current) return;

        window.location.replace(blobUrl);
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
    };
  }, [licenseId]);

  return (
    <div className="min-h-screen bg-[#eef3f7] px-4 py-5 text-[#1a1c1c]">
      <div className="mx-auto max-w-6xl">
        <header className="mb-4 flex items-center justify-between gap-4 border border-slate-200 border-l-[#006d32] border-l-4 bg-white px-5 py-4 shadow-sm">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#006d32]">
              ALiS
            </p>
            <h1 className="text-2xl font-bold">Advertisement License Verification</h1>
          </div>
          <button className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md bg-[#006d32] px-5 text-sm font-bold text-white shadow-sm opacity-50">
            Print Advertisement License
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
        ) : null}
      </div>
    </div>
  );
}

async function getSourceLicenseBlobUrl(documentUrl, title) {
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
    return URL.createObjectURL(normalizedPdfBlob);
  }

  const html = await response.text();
  const standaloneHtml = prepareStandaloneHtmlDocument(html, documentUrl);
  return URL.createObjectURL(
    new Blob([buildBlobVerificationPageHtml(standaloneHtml, title)], {
      type: "text/html;charset=utf-8",
    })
  );
}

function prepareStandaloneHtmlDocument(html, documentUrl) {
  const baseHref = getDocumentBaseHref(documentUrl);
  const previewCss = `
    <style>
      .print-actions { display: none !important; }
      @media screen {
        html {
          background: #d7dde3 !important;
        }
        body {
          margin: 0 !important;
          background: #d7dde3 !important;
          overflow: auto !important;
        }
        .ad-license-page {
          width: 210mm !important;
          min-height: 297mm !important;
          margin: 16px auto 24px !important;
          background: #ffffff !important;
          box-shadow: 0 1px 6px rgba(15, 23, 42, 0.22) !important;
        }
        .ad-license-page:last-of-type {
          margin-bottom: 16px !important;
        }
      }
      @media print {
        html, body {
          background: #ffffff !important;
        }
        .ad-license-page {
          margin: 0 !important;
          box-shadow: none !important;
        }
      }
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

function buildBlobVerificationPageHtml(documentHtml, title) {
  const safeTitle = escapeHtmlAttribute(title);
  const documentJson = JSON.stringify(documentHtml || "").replace(/</g, "\\u003c");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${safeTitle}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #eef3f7;
      color: #1a1c1c;
      font-family: Arial, Helvetica, sans-serif;
    }
    .verification-shell {
      width: min(100% - 32px, 1280px);
      margin: 20px auto;
    }
    .verification-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 16px;
      border: 1px solid #e2e8f0;
      border-left: 4px solid #006d32;
      background: #fff;
      padding: 18px 22px;
      box-shadow: 0 1px 3px rgba(15, 23, 42, .12);
    }
    .eyebrow {
      margin: 0 0 6px;
      color: #006d32;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .04em;
      text-transform: uppercase;
    }
    h1 {
      margin: 0;
      font-size: 26px;
      line-height: 1.2;
    }
    button {
      min-height: 48px;
      border: 0;
      border-radius: 6px;
      background: #006d32;
      color: #fff;
      padding: 0 24px;
      font: 700 14px Arial, Helvetica, sans-serif;
      cursor: pointer;
      box-shadow: 0 2px 4px rgba(15, 23, 42, .18);
    }
    button:hover { background: #005224; }
    .viewer-frame {
      display: block;
      width: 100%;
      height: calc(100vh - 156px);
      min-height: 620px;
      border: 1px solid #cbd5e1;
      background: #d7dde3;
    }
    @media print {
      body { background: #fff; }
      .verification-header { display: none; }
      .verification-shell { width: 100%; margin: 0; }
      .viewer-frame { height: 100vh; border: 0; }
    }
  </style>
</head>
<body>
  <main class="verification-shell">
    <header class="verification-header">
      <div>
        <p class="eyebrow">ALiS</p>
        <h1>Advertisement License Verification</h1>
      </div>
      <button type="button" id="printLicense">Print Advertisement License</button>
    </header>
    <iframe id="licenseFrame" class="viewer-frame" title="${safeTitle}"></iframe>
  </main>
  <script type="application/json" id="licenseDocument">${documentJson}</script>
  <script>
    const frame = document.getElementById("licenseFrame");
    const documentHtml = JSON.parse(document.getElementById("licenseDocument").textContent || '""');
    frame.srcdoc = documentHtml;
    document.getElementById("printLicense").addEventListener("click", () => {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    });
  </script>
</body>
</html>`;
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
