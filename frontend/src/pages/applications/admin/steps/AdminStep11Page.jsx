import { useEffect, useState } from "react";
import AdminDashboardLayout from "../../../../layout/AdminDashboardLayout";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { apiRequest } from "../../../../services/api";
import AdminApplicationStepNav from "../AdminApplicationStepNav";

function AdminStep11Page() {
  const location = useLocation();
  const navigate = useNavigate();
  const { applicationId: routeApplicationId } = useParams();
  const queryParams = new URLSearchParams(location.search);

  const applicationId = routeApplicationId || queryParams.get("id");

  const storedUser = localStorage.getItem("fastrack_user");
  const user = storedUser ? JSON.parse(storedUser) : null;

  const Layout = AdminDashboardLayout;

  const [step1, setStep1] = useState({});
  const [step2, setStep2] = useState({});
  const [step3, setStep3] = useState({});

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
  const success = false;

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

  async function saveStep11({ goNext = false } = {}) {
    if (!applicationId) {
      alert("Application ID is missing. Please continue from My Dashboard.");
      return false;
    }

    if (goNext && !step11.agreed) {
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
        status: "Saved",
        agreed: step11.agreed,
        submitted: step11.submitted || false,
        submitted_at: step11.submitted_at || "",
        saved_at: now,
      };

      await apiRequest(`/applications/${applicationId}/`, {
        method: "PATCH",
        body: JSON.stringify({
          current_step: goNext ? 5 : 4,
          form_data: {
            ...existingFormData,
            step_11: updatedStep11,
          },
        }),
      });

      setStep11(updatedStep11);

      if (goNext) {
        navigate(`/admin/applications/${applicationId}/step-5?id=${applicationId}`);
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
    await saveStep11({ goNext: true });
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

  return (
    <Layout>
      <div className="flex gap-5">
        <AdminApplicationStepNav active={4} />

        <main className="flex-1 min-w-0">
          {success && (
            <div className="mb-4 rounded border border-green-200 bg-green-50 p-3 text-sm font-semibold text-green-700">
              ✅ Application submitted successfully. Redirecting to dashboard...
            </div>
          )}

          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="bg-[#18b36b] px-3 py-1 text-sm font-bold text-white">
                4
              </span>
              <h1 className="text-xl font-semibold text-[#1a1c1c]">
                Declaration
              </h1>
            </div>

            <div className="flex gap-2">
              <Link
                to={`/admin/applications/${applicationId}/step-3?id=${applicationId}`}
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
                {saving ? "Saving..." : "Save & Next"}
              </button>
            </div>
          </div>

          <section className="overflow-hidden rounded-sm border border-slate-200 bg-white">
            <ApplicationReference step1={step1} />

            <div className="space-y-5 p-4 text-[12px]">
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

              <div className="flex justify-end gap-2 pt-3">
                <Link
                  to={`/admin/applications/${applicationId}/step-3?id=${applicationId}`}
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
                  {saving ? "Saving..." : "Save & Next"}
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

export default AdminStep11Page;
