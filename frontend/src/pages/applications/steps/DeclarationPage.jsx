import { useEffect, useState } from "react";
import DashboardLayout from "../../../layout/DashboardLayout";
import UserDashboardLayout from "../../../layout/UserDashboardLayout";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { apiRequest } from "../../../services/api";
import ApplicationStepNav from "../../../components/ApplicationStepNav";

function DeclarationPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { applicationId: routeApplicationId } = useParams();
  const queryParams = new URLSearchParams(location.search);

  const applicationId = routeApplicationId || queryParams.get("id");

  const storedUser = localStorage.getItem("fastrack_user");
  const user = storedUser ? JSON.parse(storedUser) : null;

  const Layout =
    user?.role === "applicant" || user?.role === "user"
      ? UserDashboardLayout
      : DashboardLayout;

  const [step1, setStep1] = useState({});
  const [step2, setStep2] = useState({});
  const [step3, setStep3] = useState({});
  const [step7, setStep7] = useState({});

  const [step11, setStep11] = useState({
    title: "Declaration",
    status: "Draft",
    agreed: false,
    submitted: false,
    submitted_at: "",
    saved_at: "",
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (applicationId) {
      loadApplication();
    }
  }, [applicationId]);

  async function loadApplication() {
    try {
      const data = await apiRequest(`/applications/${applicationId}/`);
      const formData = data.form_data || {};

      setStep1(formData.step_1 || {});
      setStep2(formData.step_2 || {});
      setStep3(formData.step_3 || {});
      setStep7(formData.step_7 || {});

      setStep11({
        title: "Declaration",
        status: formData.step_11?.status || "Draft",
        agreed: formData.step_11?.agreed || false,
        submitted: formData.step_11?.submitted || false,
        submitted_at: formData.step_11?.submitted_at || "",
        saved_at: formData.step_11?.saved_at || "",
      });
    } catch (err) {
      console.error("Load declaration failed:", err);
    }
  }

  async function saveStep11({ submit = false } = {}) {
    if (!applicationId) {
      alert("Application ID is missing. Please continue from My Dashboard.");
      return false;
    }

    if (submit && !step11.agreed) {
      setError("Please confirm the declaration before submitting.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return false;
    }

    try {
      setSaving(true);
      setError("");

      const existingData = await apiRequest(`/applications/${applicationId}/`);
      const existingFormData = existingData.form_data || {};
      const now = new Date().toISOString();

      const updatedStep11 = {
        ...step11,
        title: "Declaration",
        status: submit ? "Submitted" : "Saved",
        agreed: step11.agreed,
        submitted: submit ? true : step11.submitted || false,
        submitted_at: submit ? now : step11.submitted_at || "",
        saved_at: now,
      };

      await apiRequest(`/applications/${applicationId}/`, {
        method: "PATCH",
        body: JSON.stringify({
          current_step: 11,
          status: submit ? "submitted" : undefined,
          form_data: {
            ...existingFormData,
            step_11: updatedStep11,
          },
        }),
      });

      setStep11(updatedStep11);

      if (submit) {
        setSuccess(true);
        window.scrollTo({ top: 0, behavior: "smooth" });

        setTimeout(() => {
          navigate("/user/dashboard");
        }, 1200);
      }

      return true;
    } catch (err) {
      console.error("Step 11 save failed:", err);
      alert("Failed to save Step 11.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    await saveStep11({ submit: true });
  }

  const applicantName =
    step2.full_name ||
    step3.full_name ||
    user?.name ||
    user?.full_name ||
    "Applicant";

  const organisationName =
    step2.org_name ||
    step3.org_name ||
    step1.department_name ||
    step1.agency_name ||
    "-";

  const inspectionDate =
    step7.inspection_date ||
    step7.date_of_inspection ||
    step7.site_inspection_date ||
    "";

  const address =
    step3.address ||
    step2.address ||
    step1.locality_address ||
    step1.site_address ||
    step1.address ||
    "-";

  const telephone =
    step3.mobile_no ||
    step3.telephone_no ||
    step3.office_no ||
    step2.mobile_no ||
    step2.telephone_no ||
    step2.office_no ||
    "-";

  const email = step3.email || step2.email || user?.email || "-";

  return (
    <Layout>
      <div className="flex gap-5">
        <ApplicationStepNav active={11} />

        <main className="flex-1 min-w-0">
          {success && (
            <div className="mb-4 rounded border border-green-200 bg-green-50 p-3 text-sm font-semibold text-green-700">
              ✅ Application submitted successfully. Redirecting to dashboard...
            </div>
          )}

          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="bg-[#18b36b] px-3 py-1 text-sm font-bold text-white">
                11
              </span>
              <h1 className="text-xl font-semibold text-[#1a1c1c]">
                Declaration
              </h1>
            </div>

            <div className="flex gap-2">
              <Link
                to={`/applications/${applicationId}/supporting-document?id=${applicationId}`}
                className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
              >
                ← Back
              </Link>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving || success}
                className="rounded bg-[#006d32] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#005224] disabled:opacity-60"
              >
                {saving ? "Submitting..." : "Submit Application"}
              </button>
            </div>
          </div>

          <section className="overflow-hidden rounded-sm border border-slate-200 bg-white">
            <ApplicationReference step1={step1} />

            <div className="space-y-5 p-4 text-[12px]">
              <div>
                <p className="mb-1 font-bold text-[#006d32]">Important:</p>
                <p className="text-slate-700">
                  Please consult L&S Divisional Office to obtain L&S Reference
                  specific to your application.
                </p>
              </div>

              {error && (
                <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-600">
                  {error}
                </div>
              )}

              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={step11.agreed}
                  onChange={(event) =>
                    setStep11((prev) => ({
                      ...prev,
                      agreed: event.target.checked,
                    }))
                  }
                  className="mt-1 accent-[#18b36b]"
                />

                <p className="leading-relaxed text-slate-700">
                  I, <b>{applicantName}</b>, on behalf of{" "}
                  <b>{organisationName}</b>, declare that I shall bear full
                  responsibility as to the accuracy of the information(s) as
                  provided by me on this Siting Application.
                </p>
              </label>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <InfoBox
                  label="Date of Site Inspection with L&S"
                  value={formatDate(inspectionDate)}
                />

                <InfoBox
                  label="L&S Reference"
                  value={
                    step1.agency_reference ||
                    step1.ls_reference ||
                    step1.reference_no ||
                    "-"
                  }
                />
              </div>

              <div className="rounded-sm border border-slate-200">
                <div className="border-b bg-[#f7f7f7] px-3 py-2 text-xs font-bold">
                  Submitting Person Information
                </div>

                <div className="grid grid-cols-[160px_1fr] gap-y-2 p-3 text-[12px]">
                  <Label>Address</Label>
                  <Value>{address}</Value>

                  <Label>Telephone No</Label>
                  <Value>{telephone}</Value>

                  <Label>SPA Registration No</Label>
                  <Value>{step3.spa_registration_no || "-"}</Value>

                  <Label>SPA Registration Expiry Date</Label>
                  <Value>{formatDate(step3.spa_registration_expiry_date)}</Value>

                  <Label>Email Address</Label>
                  <Value>{email}</Value>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <Link
                  to={`/applications/${applicationId}/supporting-document?id=${applicationId}`}
                  className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                >
                  ← Back
                </Link>

                <button
                  type="button"
                  onClick={() => saveStep11({ submit: false })}
                  disabled={saving || success}
                  className="rounded border border-[#006d32] px-3 py-1.5 text-xs font-semibold text-[#006d32] hover:bg-emerald-50 disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save"}
                </button>

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={saving || success}
                  className="rounded bg-[#006d32] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#005224] disabled:opacity-60"
                >
                  {saving ? "Submitting..." : "Submit Application"}
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>
    </Layout>
  );
}

function ApplicationReference({ step1 }) {
  const storedUser = localStorage.getItem("fastrack_user");
  const user = storedUser ? JSON.parse(storedUser) : null;

  return (
    <div className="border-b border-slate-200 bg-[#f5f5f5] px-4 py-3 text-xs">
      <div className="grid grid-cols-[140px_1fr] gap-y-1">
        {user?.role !== "applicant" && (
          <>
            <p>Digital Reference</p>
            <p className="font-semibold text-[#006d32]">E.SPA.2025-1443</p>

            <p>Agency Reference</p>
            <p className="font-semibold text-[#006d32]">SP/1D/159/2024</p>
          </>
        )}

        <p>Status</p>
        <p className="font-semibold text-[#006d32]">
          {step1.status || "Prepare Case"}
        </p>

        <p>Application Type</p>
        <p className="font-semibold text-[#006d32]">
          {step1.application_type_label || "Application of Siting Project"}
        </p>
      </div>
    </div>
  );
}

function InfoBox({ label, value }) {
  return (
    <div className="rounded-sm border border-slate-200 p-3">
      <p className="mb-1 text-xs text-slate-500">{label}</p>
      <p className="font-semibold">{value || "-"}</p>
    </div>
  );
}

function Label({ children }) {
  return <p className="text-slate-600">{children}</p>;
}

function Value({ children }) {
  return (
    <p className="whitespace-pre-line font-semibold text-[#006d32]">
      {children || "-"}
    </p>
  );
}

function formatDate(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-GB");
}

export default DeclarationPage;