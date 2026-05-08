import AdminDashboardLayout from "../../../../layout/AdminDashboardLayout";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { apiRequest } from "../../../../services/api";
import AdminApplicationStepNav from "../AdminApplicationStepNav";

function AdminStep6Page() {
  const location = useLocation();
  const navigate = useNavigate();
  const { applicationId: routeApplicationId } = useParams();
  const queryParams = new URLSearchParams(location.search);

  const applicationId = routeApplicationId || queryParams.get("id");

  const storedUser = localStorage.getItem("fastrack_user");
  const user = storedUser ? JSON.parse(storedUser) : null;

  const Layout = AdminDashboardLayout;

  async function handleSaveStep6() {
    if (!applicationId) {
      alert("Application ID is missing. Please continue from My Dashboard.");
      return;
    }

    try {
      const existingData = await apiRequest(`/applications/${applicationId}/`);

      await apiRequest(`/applications/${applicationId}/`, {
        method: "PATCH",
        body: JSON.stringify({
          current_step: 6,
          form_data: {
            ...(existingData.form_data || {}),
            step_6: {
              skipped: true,
              title: "Analysis of Proposal",
              status: "Skipped",
              saved_at: new Date().toISOString(),
            },
          },
        }),
      });

      navigate(`/admin/applications/${applicationId}/step-7?id=${applicationId}`);
    } catch (err) {
      console.error("Step 6 save failed:", err);
      alert("Failed to save Step 6.");
    }
  }

  return (
    <Layout>
      <div className="flex gap-4">
        <AdminApplicationStepNav active={6} />

        <main className="flex-1 min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="bg-[#18b36b] text-white text-sm font-bold px-3 py-1">
                6
              </span>
              <h1 className="text-lg font-semibold text-[#1a1c1c]">
                Analysis of Proposal
              </h1>
            </div>

            <div className="flex gap-2">
              <Link
                to={`/admin/applications/${applicationId}/step-5?id=${applicationId}`}
                className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
              >
                ← Back
              </Link>

              <button
                type="button"
                onClick={handleSaveStep6}
                className="px-3 py-1.5 bg-[#006d32] text-white rounded text-xs font-semibold hover:bg-[#005224]"
              >
                Save & Next
              </button>
            </div>
          </div>

          <section className="bg-white border border-slate-200 rounded-sm overflow-hidden">
            <ApplicationReference />

            <div className="p-5">
              <div className="border border-dashed border-slate-300 rounded-sm bg-slate-50 px-5 py-10 text-center">
                <h2 className="text-sm font-bold text-slate-800">
                  Analysis of Proposal
                </h2>
                <p className="mt-2 text-xs text-slate-600">
                  This step is currently skipped. Click Save & Next to save this step and continue.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-5">
                <Link
                  to={`/admin/applications/${applicationId}/step-5?id=${applicationId}`}
                  className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
                >
                  ← Back
                </Link>

                <button
                  type="button"
                  onClick={handleSaveStep6}
                  className="px-3 py-1.5 bg-[#006d32] text-white rounded text-xs font-semibold hover:bg-[#005224]"
                >
                  Save & Next
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>
    </Layout>
  );
}

function ApplicationReference() {
  const storedUser = localStorage.getItem("fastrack_user");
  const user = storedUser ? JSON.parse(storedUser) : null;

  return (
    <div className="bg-[#f5f5f5] border-b border-slate-200 px-4 py-3 text-xs">
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
        <p className="font-semibold text-[#006d32]">Prepare Case</p>

        <p>Application Type</p>
        <p className="font-semibold text-[#006d32]">
          Application of Siting Project
        </p>
      </div>
    </div>
  );
}

export default AdminStep6Page;