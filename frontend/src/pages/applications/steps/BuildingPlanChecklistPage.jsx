import DashboardLayout from "../../../layout/DashboardLayout";
import { Link } from "react-router-dom";
import ApplicationStepNav from "../../../components/ApplicationStepNav";

function BuildingPlanChecklistPage() {
  return (
    <DashboardLayout>
      <div className="flex gap-5">
        <ApplicationStepNav active={8} />

        <main className="flex-1 min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="bg-[#18b36b] text-white text-sm font-bold px-3 py-1">
                8
              </span>
              <h1 className="text-xl font-semibold text-[#1a1c1c]">
                Building Plan Checklist
              </h1>
            </div>

            <div className="flex gap-2">
              <Link to="/applications/site-inspection" className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50">
                ← Back
              </Link>
              <Link to="/applications/print-form" className="px-3 py-1.5 bg-[#006d32] text-white rounded text-xs font-semibold hover:bg-[#005224]">
                Save & Next
              </Link>
            </div>
          </div>

          <section className="bg-white border border-slate-200 rounded-sm overflow-hidden">
            <div className="bg-[#f5f5f5] border-b border-slate-200 px-4 py-3 text-xs">
              <p className="font-semibold text-[#006d32]">
                E.SPA.2025-1443 — Application of Siting Project
              </p>
            </div>

            <div className="p-5">
              <div className="border border-dashed border-slate-300 rounded-sm bg-slate-50 px-5 py-10 text-center">
                <h2 className="text-sm font-bold text-slate-800">
                  Building Plan Checklist
                </h2>
                <p className="mt-2 text-xs text-slate-600">
                  This step is currently skipped. You may continue to the next section.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-5">
                <Link to="/applications/site-inspection" className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50">
                  ← Back
                </Link>
                <Link to="/applications/print-form" className="px-3 py-1.5 bg-[#006d32] text-white rounded text-xs font-semibold hover:bg-[#005224]">
                  Save & Next
                </Link>
              </div>
            </div>
          </section>
        </main>
      </div>
    </DashboardLayout>
  );
}

export default BuildingPlanChecklistPage;