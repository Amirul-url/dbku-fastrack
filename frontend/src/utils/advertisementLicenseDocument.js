import {
  formatCurrency,
  formatDate,
  getApplicantName,
  getApplicationLocation,
  getApplicationReference,
  getApplicationType,
  getInvoiceNo,
  getLicenseId,
  getProjectName,
} from "./workflow";

export const DEFAULT_ADVERTISEMENT_LICENSE_TERMS = [
  "Lesen ini dikeluarkan tertakluk dibawah peruntukan The Local Authorities (Advertisements) By-Laws, 2012.",
  "Lesen ini akan tamat tempoh dengan sendirinya jika tidak diperbaharui.",
  "Lesen ini tidak boleh dipindah milik tanpa kebenaran bertulis dari DBKU.",
  "Lesen ini hendaklah dipamer dan digantung dengan sempurna sepanjang sah tempoh lesen pengiklanan ini.",
  "Papan tanda hendaklah sentiasa diselenggara dalam keadaan sempurna dan memuaskan sepanjang sah tempoh lesen pengiklanan ini.",
  "Sebarang pengubahsuaian papan tanda tidak boleh dilakukan setelah diluluskan.",
  "Lesen ini hendaklah dikembalikan kepada Pejabat Bhg. Pelesenan DBKU jika pelesen berhenti berniaga atas apa-apa sebab.",
  "Pelesen hendaklah mematuhi mana-mana syarat atau arahan DBKU dari masa ke semasa. Kegagalan berbuat demikian boleh menyebabkan lesen dibatalkan tanpa sebarang notis.",
  "Sila bawa salinan asal lesen untuk pembaharuan lesen.",
];

export function getAdvertisementLicenseDraftFields(app, savedFields = {}, options = {}) {
  const license = app?.form_data?.license || {};
  const payment = app?.form_data?.payment || {};
  const applicant = getApplicantName(app);
  const reference = getApplicationReference(app);
  const now = new Date();
  const issueDate =
    options.issueDate ||
    license.issue_date ||
    savedFields.issueDate ||
    now.toISOString();
  const expiryDate =
    options.expiryDate ||
    license.expiry_date ||
    savedFields.expiryDate ||
    new Date(now.getFullYear(), 11, 31).toISOString();

  const fields = {
    formCode: "DBKU/LES/38-09 (Pind. 3/18)",
    receiptNo: payment.receipt_reference || payment.receipt_no || payment.invoice_no || getInvoiceNo(app),
    referenceNo: getDefaultLicenseReference(app),
    applicantName: applicant,
    applicantAddress: getApplicantPostalAddress(app),
    boardName: getProjectName(app),
    advertisementType: getApplicationType(app),
    displayLocation: getApplicationLocation(app),
    issueDate,
    expiryDate,
    signatoryName: "",
    signatoryTitle: "b.p : Dewan Bandaraya Kuching Utara",
    signedDate: issueDate,
    paymentAmount: getBillAmount(app),
    dbkuLogoPath: "/logo-dbku.png",
    ...savedFields,
  };

  if (options.issueDate) fields.issueDate = options.issueDate;
  if (options.expiryDate) fields.expiryDate = options.expiryDate;

  return fields;
}

export function buildManualAdvertisementLicenseForIssuance(app, options = {}) {
  const saved = app?.form_data?.license?.manual_license || {};
  const fields = getAdvertisementLicenseDraftFields(app, saved.fields, options);

  return {
    ...saved,
    status: "Issued",
    fields,
    terms: normalizeLicenseTerms(saved.terms),
    issued_at: new Date().toISOString(),
  };
}

export function buildAdvertisementLicenseHtml(app, t) {
  const license = app?.form_data?.license || {};
  const manualLicense = license.manual_license || {};
  const reference = getApplicationReference(app);
  const licenseId = license.license_id || getLicenseId(app);
  const fields = getAdvertisementLicenseDraftFields(app, manualLicense.fields, {
    issueDate: license.issue_date,
    expiryDate: license.expiry_date,
  });
  const terms = normalizeLicenseTerms(manualLicense.terms);
  const dbkuLogoUrl = getManualDocumentAssetUrl(fields.dbkuLogoPath || "/logo-dbku.png");
  const paymentAmount = parseCurrencyAmount(fields.paymentAmount);
  const paymentDisplay = Number.isFinite(paymentAmount) && paymentAmount > 0
    ? formatCurrency(paymentAmount)
    : fields.paymentAmount || "-";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(reference)} Advertisement License</title>
  <style>
    @page { size: A4; margin: 16mm 17mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Times New Roman", Times, serif; color: #050505; background: #f8fafc; }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto 12px; background: #fff; padding: 14mm 18mm 16mm; box-shadow: 0 1px 4px rgba(15,23,42,.12); }
    .top-code { text-align: right; font: 700 10px Arial, sans-serif; }
    .crest { width: 88px; height: 68px; margin: 4px auto 2px; display: flex; align-items: center; justify-content: center; }
    .crest img { max-width: 100%; max-height: 68px; object-fit: contain; }
    .center { text-align: center; }
    h1 { margin: 0; font-size: 22px; line-height: 1.08; text-transform: uppercase; }
    .subtitle { margin: 3px 0 0; font-size: 17px; line-height: 1.08; font-weight: 700; }
    .bylaw { margin: 2px 0 20px; font-size: 16px; line-height: 1.12; font-weight: 700; }
    .form-title { margin: 0 0 22px; font-size: 17px; line-height: 1.08; font-weight: 700; }
    .field-grid { display: grid; grid-template-columns: 88px 10px minmax(0,1fr); column-gap: 7px; row-gap: 9px; font-size: 16px; align-items: end; }
    .field-grid.two { grid-template-columns: 88px 10px minmax(0,1fr) 82px 10px minmax(0,1fr); }
    .label { white-space: nowrap; }
    .dotted { min-height: 21px; border-bottom: 2px dotted #111; line-height: 19px; padding: 0 7px 1px; font-weight: 700; }
    .dotted.blank { color: transparent; }
    .field-span { grid-column: 3 / -1; }
    .paragraph { margin: 24px 0 18px; font-size: 16px; line-height: 1.28; text-align: left; }
    .indent { display: inline-block; width: 220px; }
    .license-lines { margin-top: 10px; }
    .period { display: grid; grid-template-columns: 88px 10px 1fr 55px 1fr; column-gap: 7px; row-gap: 9px; font-size: 16px; align-items: end; }
    .period .stack { line-height: 1.06; }
    .attachment { margin: 24px 0 0; font-size: 16px; }
    .signature-row { display: grid; grid-template-columns: 1fr 190px; gap: 28px; margin-top: 36px; align-items: end; font-size: 16px; }
    .signature-space { min-height: 54px; }
    .signature-line { border-bottom: 2px dotted #111; min-height: 20px; }
    .date-line { display: grid; grid-template-columns: 48px 1fr; gap: 6px; align-items: end; }
    .terms-title { margin: 0 0 28px; font-size: 18px; font-weight: 700; text-decoration: underline; }
    .terms { margin: 0; padding-left: 0; list-style: none; counter-reset: term; font-size: 17px; line-height: 1.22; }
    .terms li { counter-increment: term; display: grid; grid-template-columns: 28px 1fr; gap: 15px; margin: 0 0 18px; }
    .terms li::before { content: counter(term) "."; }
    .payment-row { display: flex; justify-content: flex-end; align-items: center; gap: 16px; margin-top: 95px; font-size: 16px; font-weight: 700; }
    .amount-box { min-width: 144px; border: 1px solid #111; padding: 5px 18px; text-align: center; }
    .print-actions { position: fixed; right: 18px; top: 18px; }
    .print-actions button { border: 1px solid #cbd5e1; background: #fff; border-radius: 6px; padding: 8px 12px; font: 700 13px Arial, sans-serif; cursor: pointer; }
    @media print { body { background: #fff; } .page { box-shadow: none; margin: 0; } .print-actions { display: none; } }
  </style>
</head>
<body>
  <div class="print-actions"><button onclick="window.print()">${escapeHtml(t?.("common.print", "Print") || "Print")}</button></div>
  <section class="page">
    <div class="top-code">${escapeHtml(fields.formCode)}</div>
    <div class="center">
      <div class="crest"><img src="${escapeHtml(dbkuLogoUrl)}" alt="DBKU" /></div>
      <h1>DEWAN BANDARAYA KUCHING UTARA</h1>
      <div class="subtitle">(COMMISSION OF THE CITY OF KUCHING NORTH)</div>
      <div class="bylaw">The Local Authorities (Advertisements) By-Laws, 2012</div>
      <div class="form-title">Borang B<br />(Undang-undang Kecil 7)<br />LESEN PENGIKLANAN</div>
    </div>

    <div class="field-grid two">
      <span class="label">No. Resit</span><span>:</span><span class="dotted">${escapeHtml(fields.receiptNo)}</span>
      <span class="label">Rujukan</span><span>:</span><span class="dotted">${escapeHtml(fields.referenceNo || licenseId)}</span>
    </div>
    <div class="field-grid license-lines">
      <span class="label">Nama</span><span>:</span><span class="dotted">${escapeHtml(fields.applicantName)}</span>
      <span class="label">Alamat</span><span>:</span><span class="dotted">${escapeHtml(firstAddressLine(fields.applicantAddress))}</span>
      <span></span><span></span><span class="dotted">${escapeHtml(secondAddressLine(fields.applicantAddress))}</span>
      <span></span><span></span><span class="dotted">${escapeHtml(thirdAddressLine(fields.applicantAddress))}</span>
    </div>

    <p class="paragraph">
      Adalah dengan ini diberi lesen oleh <strong><u>PENGARAH, DEWAN BANDARAYA KUCHING UTARA</u></strong>
      di bawah undang-undang kecil 7 The Local Authorities (Advertisements) By-Laws, 2012 untuk mempamer iklan seperti berikut:-
    </p>

    <div class="field-grid">
      <span class="label">Papan Iklan</span><span>:</span><span class="dotted">${escapeHtml(fields.boardName)}</span>
      <span></span><span></span><span class="dotted blank">&nbsp;</span>
      <span class="label">Jenis Iklan</span><span>:</span><span class="dotted">${escapeHtml(fields.advertisementType)}</span>
      <span class="label">Tempat</span><span>:</span><span class="dotted">${escapeHtml(firstAddressLine(fields.displayLocation))}</span>
      <span></span><span></span><span class="dotted">${escapeHtml(secondAddressLine(fields.displayLocation))}</span>
    </div>
    <div class="period license-lines">
      <span class="label stack">Tempoh<br />Lesen Iklan</span><span>:</span><span class="dotted center">${escapeHtml(formatDate(fields.issueDate))}</span>
      <span class="center">hingga</span><span class="dotted center">${escapeHtml(formatDate(fields.expiryDate))}</span>
    </div>

    <p class="attachment">Tertakluk kepada syarat-syarat dalam <strong><u>Lampiran A.</u></strong></p>

    <div class="signature-row">
      <div>
        <div class="signature-space">${fields.signatoryName ? escapeHtml(fields.signatoryName) : ""}</div>
        <div class="signature-line"></div>
        <div>${escapeHtml(fields.signatoryTitle || "b.p : Dewan Bandaraya Kuching Utara")}</div>
      </div>
      <div class="date-line">
        <span>Tarikh :</span>
        <span class="dotted center">${escapeHtml(formatDate(fields.signedDate || fields.issueDate))}</span>
      </div>
    </div>
  </section>

  <section class="page">
    <h2 class="terms-title">Lampiran A</h2>
    <ol class="terms">
      ${terms.map((term) => `<li>${escapeHtml(term)}</li>`).join("")}
    </ol>
    <div class="payment-row">
      <span>Bayaran :</span>
      <span class="amount-box">${escapeHtml(paymentDisplay)}</span>
    </div>
  </section>
</body>
</html>`;
}

export function openAdvertisementLicenseDocument(app, t) {
  openPrintablePreview(
    `${getApplicationReference(app)} advertisement license`,
    buildAdvertisementLicenseHtml(app, t)
  );
}

function getDefaultLicenseReference(app) {
  const referenceDigits = String(app?.reference_no || app?.id || "")
    .match(/(\d+)$/)?.[1];
  const suffix = String(referenceDigits || app?.id || 0).padStart(3, "0");
  const year = new Date().getFullYear().toString().slice(-2);

  return `DBKU/LES/Adv.Les/${year}/(${suffix})`;
}

function normalizeLicenseTerms(terms) {
  if (Array.isArray(terms) && terms.length > 0) {
    return terms.map((term) => String(term || "").trim()).filter(Boolean);
  }

  if (typeof terms === "string" && terms.trim()) {
    return terms
      .split(/\n+/)
      .map((term) => term.replace(/^\s*\d+[\).]\s*/, "").trim())
      .filter(Boolean);
  }

  return DEFAULT_ADVERTISEMENT_LICENSE_TERMS;
}

function getApplicantPostalAddress(app) {
  const step2 = app?.form_data?.step_2 || {};
  const step3 = app?.form_data?.step_3 || {};
  const parts = [
    step3.postal_address || step2.postal_address || step2.address || step3.address,
    step3.address_2 || step2.address_2,
    step3.address_3 || step2.address_3,
    step3.address_4 || step2.address_4,
  ].filter(hasValue);

  return parts.length > 0 ? parts.join("\n") : getApplicationLocation(app);
}

function getBillAmount(app) {
  const payment = app?.form_data?.payment || {};
  const amount = parseCurrencyAmount(payment.amount);
  if (Number.isFinite(amount) && amount > 0) return amount;

  const technicalSite = app?.form_data?.technical_site_visit || {};
  const licenseFee = parseCurrencyAmount(technicalSite.license_fee_calculation) || 0;
  const deposit = parseCurrencyAmount(technicalSite.deposit_calculation) || 0;
  const processing = parseCurrencyAmount(technicalSite.processing_fee_calculation) || 0;
  const total = licenseFee + deposit + processing;

  return total > 0 ? total : 0;
}

function parseCurrencyAmount(value) {
  const normalized = String(value ?? "").replace(/[^0-9.-]/g, "");
  const amount = Number.parseFloat(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function hasValue(value) {
  return String(value ?? "").trim().length > 0;
}

function addressLines(value) {
  return String(value || "")
    .split(/\n|,\s*/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function firstAddressLine(value) {
  return addressLines(value)[0] || "";
}

function secondAddressLine(value) {
  return addressLines(value)[1] || "";
}

function thirdAddressLine(value) {
  return addressLines(value).slice(2).join(", ");
}

function getManualDocumentAssetUrl(value) {
  if (!value) return "";
  if (/^(https?:|data:|blob:)/i.test(value)) return value;

  const base = String(import.meta.env.BASE_URL || "/").replace(/\/+$/, "");
  return `${base}${value.startsWith("/") ? value : `/${value}`}`;
}

function openPrintablePreview(title, html) {
  const titledHtml = html.replace(
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeHtml(title)}</title>`
  );
  const previewUrl = URL.createObjectURL(
    new Blob([titledHtml], { type: "text/html" })
  );
  const preview = window.open(previewUrl, "_blank", "noopener,noreferrer");

  if (!preview) {
    URL.revokeObjectURL(previewUrl);
    return;
  }

  window.setTimeout(() => URL.revokeObjectURL(previewUrl), 5 * 60 * 1000);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
