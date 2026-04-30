import DashboardLayout from "../../../layout/DashboardLayout";
import { Link } from "react-router-dom";
import ApplicationStepNav from "../../../components/ApplicationStepNav";

function StepPlaceholderPage({ active, title, description }) {
  return (
    <DashboardLayout>
      <div className="grid grid-cols-1 xl:grid-cols-[230px_1fr] gap-5">
        <ApplicationStepNav active={active} />

        <main>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="bg-[#006d32] text-white text-sm font-bold px-3 py-1">
                {active}
              </span>
              <h1 className="text-xl font-semibold text-[#1a1c1c]">
                {title}
              </h1>
            </div>

            <Link
              to="/applications"
              className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-50"
            >
              ← Back
            </Link>
          </div>

          <section className="bg-white border border-slate-200 rounded-sm overflow-hidden">
            <div className="bg-[#f5f5f5] border-b border-slate-200 px-4 py-3 text-xs">
              <p className="font-semibold text-[#006d32]">
                E.SPA.2025-1443 — Application of Siting Project
              </p>
            </div>

            <div className="p-8 text-center">
              <p className="text-sm font-semibold text-slate-700">{title}</p>
              <p className="text-xs text-slate-500 mt-2">{description}</p>
            </div>
          </section>
        </main>
      </div>
    </DashboardLayout>
  );
}

export default StepPlaceholderPage;