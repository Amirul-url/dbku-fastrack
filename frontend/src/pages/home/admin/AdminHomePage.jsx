import { Link, useNavigate } from "react-router-dom";
import AdminDashboardLayout from "../../../layout/AdminDashboardLayout";

function AdminHomePage() {
  const navigate = useNavigate();

  function handleSitingAction(action) {
    navigate(action.to);
  }

  return (
    <AdminDashboardLayout>
      <div className="mb-6 flex justify-end">
        <div className="text-sm text-slate-500">
          Wed, 29 Apr 2026, 9:45 am
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <HomeCard
          title="Advertisement License"
          subtitle="for ALiS Advertisement Application"
          icon="apartment"
          actions={[
            { label: "SEARCH", sub: "APPLICATION" },
            { label: "EDIT", sub: "SUBMITTED" },
          ]}
        />

        <HomeCard
          title="Siting Application"
          subtitle="for Advertisement Location Approval"
          icon="location_on"
          clickable
          onActionClick={handleSitingAction}
          actions={[
            {
              label: "SEARCH",
              sub: "APPLICATION",
              to: "/admin/applications",
            },
            {
              label: "EDIT",
              sub: "SUBMITTED",
              to: "/admin/applications",
            },
          ]}
        />

        <SupportCard />
      </div>
    </AdminDashboardLayout>
  );
}

function HomeCard({
  title,
  subtitle,
  icon,
  actions,
  clickable = false,
  onActionClick,
}) {
  return (
    <div className="overflow-hidden rounded-md border border-slate-300 bg-white">
      <div className="h-28 bg-green-500 p-5 text-white">
        <h2 className="text-lg font-semibold leading-tight">{title}</h2>
        <p className="mt-1 text-xs">{subtitle}</p>
      </div>

      <div className="relative h-12">
        <div className="absolute left-1/2 -top-8 flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-full border border-slate-300 bg-white">
          <span className="material-symbols-outlined text-3xl text-green-600">
            {icon}
          </span>
        </div>
      </div>

      <div
        className="grid border-t"
        style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))` }}
      >
        {actions.map((action) =>
          clickable ? (
            <button
              key={`${action.label}-${action.sub}`}
              type="button"
              onClick={() => onActionClick(action)}
              className="border-r py-4 text-center last:border-r-0 hover:bg-slate-50"
            >
              <p className="text-sm font-bold">{action.label}</p>
              <p className="text-[10px] text-slate-500">{action.sub}</p>
            </button>
          ) : (
            <button
              key={`${action.label}-${action.sub}`}
              type="button"
              className="border-r py-4 text-center last:border-r-0 hover:bg-slate-50"
            >
              <p className="text-sm font-bold">{action.label}</p>
              <p className="text-[10px] text-slate-500">{action.sub}</p>
            </button>
          )
        )}
      </div>
    </div>
  );
}

function SupportCard() {
  return (
    <div className="overflow-hidden rounded-md border border-slate-300 bg-white">
      <div className="h-28 bg-green-500 p-5 text-white">
        <h2 className="text-lg font-semibold">Supporting Functions</h2>
      </div>

      <div className="relative h-12">
        <div className="absolute left-1/2 -top-8 flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-full border border-slate-300 bg-white">
          <span className="material-symbols-outlined text-3xl text-green-600">
            apps
          </span>
        </div>
      </div>

      <div className="text-sm">
        <SupportLink label="Case Access Right" to="/dashboard/admin" />
        <SupportLink label="Message" to="/notifications" badge="0" />
        <SupportLink label="My Payment" to="/payment" />
        <SupportLink label="My Profile" to="/dashboard/admin" />
        <SupportLink label="Guide" to="/reports" />
      </div>
    </div>
  );
}

function SupportLink({ label, to, badge }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between border-t px-4 py-2 hover:bg-slate-50"
    >
      <span>{label}</span>

      {badge && (
        <span className="rounded bg-red-500 px-2 text-xs text-white">
          {badge}
        </span>
      )}
    </Link>
  );
}

export default AdminHomePage;
