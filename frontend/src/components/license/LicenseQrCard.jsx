import { QRCodeCanvas } from "qrcode.react";
import {
  formatDate,
  getApplicantName,
  getApplicationLocation,
  getApplicationReference,
  getApplicationType,
} from "../../utils/workflow";

function LicenseQrCard({ application, license }) {
  const verificationUrl = license?.verification_url || "";

  return (
    <div className="rounded-md border border-slate-200 bg-white p-5">
      <div className="mb-4 text-center">
        <p className="text-xs font-bold uppercase tracking-wide text-[#006d32]">
          Digital License QR
        </p>
        <h3 className="mt-1 text-lg font-bold text-slate-900">
          {license?.license_id || "Not generated"}
        </h3>
      </div>

      <div className="mb-5 flex justify-center">
        <div className="rounded-md border border-slate-200 bg-white p-3">
          {verificationUrl ? (
            <QRCodeCanvas value={verificationUrl} size={180} includeMargin />
          ) : (
            <div className="flex h-[180px] w-[180px] items-center justify-center bg-slate-50 text-center text-xs text-slate-400">
              QR not generated
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3 text-sm">
        <Info label="Application ID" value={getApplicationReference(application)} />
        <Info label="License Holder" value={getApplicantName(application)} />
        <Info label="Advertisement Type" value={getApplicationType(application)} />
        <Info label="Approved Location" value={getApplicationLocation(application)} />
        <Info label="Issue Date" value={formatDate(license?.issue_date)} />
        <Info label="Expiry Date" value={formatDate(license?.expiry_date)} />
      </div>

      {verificationUrl && (
        <div className="mt-4 rounded bg-slate-50 p-3">
          <p className="mb-1 text-xs font-semibold text-slate-500">
            Verification Link
          </p>
          <p className="break-all text-xs text-slate-700">{verificationUrl}</p>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-slate-400">{label}</p>
      <p className="font-semibold text-slate-800">{value}</p>
    </div>
  );
}

export default LicenseQrCard;