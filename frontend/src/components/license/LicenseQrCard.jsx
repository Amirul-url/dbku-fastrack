import { QRCodeCanvas } from "qrcode.react";
import {
  formatDateTime,
  getApplicantName,
  getApplicationLocation,
  getApplicationReference,
  getApplicationType,
} from "../../utils/workflow";

function LicenseQrCard({ application, license }) {
  const verificationUrl = license?.verification_url || "";

  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <div className="grid gap-0 md:grid-cols-[260px_minmax(0,1fr)]">
        <div className="flex flex-col items-center justify-center border-b border-slate-200 p-5 md:border-b-0 md:border-r">
          <p className="text-xs font-bold uppercase tracking-wide text-[#006d32]">
            Digital License QR
          </p>
          <h3 className="mt-1 text-lg font-bold text-slate-900">
            {license?.license_id || "Not generated"}
          </h3>
          <div className="mt-4 rounded-md border border-slate-200 bg-white p-3">
            {verificationUrl ? (
              <QRCodeCanvas value={verificationUrl} size={180} includeMargin />
            ) : (
              <div className="flex h-[180px] w-[180px] items-center justify-center bg-slate-50 text-center text-xs text-slate-400">
                QR not generated
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 p-5">
          <div className="grid gap-x-8 gap-y-4 text-sm md:grid-cols-2">
            <Info label="Application ID" value={getApplicationReference(application)} />
            <Info label="License Holder" value={getApplicantName(application)} />
            <Info label="Advertisement Type" value={getApplicationType(application)} />
            <Info label="Approved Location" value={getApplicationLocation(application)} />
            <Info label="Issue Date" value={formatDateTime(license?.issue_date)} />
            <Info label="Expiry Date" value={formatDateTime(license?.expiry_date)} />
          </div>

          {verificationUrl && (
            <div className="mt-5 rounded bg-slate-50 p-3">
              <p className="mb-1 text-xs font-semibold text-slate-500">
                Verification Link
              </p>
              <p className="break-all text-xs text-slate-700">{verificationUrl}</p>
            </div>
          )}
        </div>
      </div>
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
