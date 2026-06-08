import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";
import { fetchApplicationList } from "../../services/api";
import {
  getLicenseId,
  normalizeStatus,
} from "../../utils/workflow";
import { buildAdvertisementLicenseHtml } from "../../utils/advertisementLicenseDocument";

function LicenseVerificationPage() {
  const { licenseId } = useParams();
  const { t } = useLanguage();

  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const openedLicenseRef = useRef(false);

  useEffect(() => {
    fetchApplications();
  }, []);

  async function fetchApplications() {
    try {
      setLoading(true);
      const list = await fetchApplicationList();
      setApplications(list);
    } catch (error) {
      console.error("Failed to verify license:", error);
    } finally {
      setLoading(false);
    }
  }

  const application = useMemo(() => {
    const scannedId = normalizeLicenseId(licenseId);

    return applications.find(
      (app) => {
        const status = normalizeStatus(app?.status);
        const isLicenseRecord =
          status === "license_issued" || status === "license_revoked";
        const storedLicenseId = app.form_data?.license?.license_id;
        const generatedLicenseId = getLicenseId(app);

        return (
          isLicenseRecord &&
          [storedLicenseId, generatedLicenseId].some(
            (candidate) => normalizeLicenseId(candidate) === scannedId
          )
        );
      }
    );
  }, [applications, licenseId]);

  const advertisementLicenseHtml = application
    ? buildAdvertisementLicenseHtml(application, t)
    : "";

  useEffect(() => {
    if (!advertisementLicenseHtml || openedLicenseRef.current) return;

    openedLicenseRef.current = true;
    document.open();
    document.write(advertisementLicenseHtml);
    document.close();
  }, [advertisementLicenseHtml]);

  if (application) {
    return (
      <div className="min-h-screen bg-white px-4 py-8 text-sm text-slate-500">
        Opening advertisement license...
      </div>
    );
  }

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
            <p className="text-sm text-slate-500">Loading license details...</p>
          </Panel>
        ) : !application ? (
          <Panel>
            <StatusNotice
              type="error"
              title="License not found"
              description="The scanned license ID does not match any license record."
            />
          </Panel>
        ) : null}
      </div>
    </div>
  );
}

function normalizeLicenseId(value) {
  return String(value || "").trim().toUpperCase();
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
