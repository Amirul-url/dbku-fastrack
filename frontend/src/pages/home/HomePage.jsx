import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import DashboardLayout from "../../layout/DashboardLayout";

function HomePage() {
  const navigate = useNavigate();
  const [showGuidelines, setShowGuidelines] = useState(false);

  function handleSitingAction(action) {
    if (action.type === "apply") {
      setShowGuidelines(true);
      return;
    }

    navigate(action.to);
  }

  function proceedApplication() {
    setShowGuidelines(false);
    navigate("/applications/new");
  }

  return (
    <DashboardLayout>
      <div className="mb-6 flex justify-end">
        <div className="text-sm text-slate-500">
          Wed, 29 Apr 2026, 9:45 am
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <HomeCard
          title="Advertisement License"
          subtitle="for DBKU Advertisement Application"
          icon="apartment"
          actions={[
            { label: "SEARCH", sub: "APPLICATION" },
            { label: "APPLY", sub: "NEW" },
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
              to: "/applications",
              type: "search",
            },
            {
              label: "APPLY",
              sub: "NEW",
              to: "/applications/new",
              type: "apply",
            },
            {
              label: "EDIT",
              sub: "SUBMITTED",
              to: "/applications",
              type: "edit",
            },
          ]}
        />

        <SupportCard />
      </div>

      {showGuidelines && (
        <GuidelinesModal
          onClose={() => setShowGuidelines(false)}
          onProceed={proceedApplication}
        />
      )}
    </DashboardLayout>
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
    <div className="bg-white border border-slate-300 rounded-md overflow-hidden">
      <div className="h-28 bg-green-500 text-white p-5">
        <h2 className="text-lg font-semibold leading-tight">{title}</h2>
        <p className="text-xs mt-1">{subtitle}</p>
      </div>

      <div className="relative h-12">
        <div className="absolute left-1/2 -top-8 -translate-x-1/2 w-16 h-16 bg-white border border-slate-300 rounded-full flex items-center justify-center">
          <span className="material-symbols-outlined text-green-600 text-3xl">
            {icon}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 border-t">
        {actions.map((action) =>
          clickable ? (
            <button
              key={action.label}
              type="button"
              onClick={() => onActionClick(action)}
              className="text-center py-4 border-r last:border-r-0 hover:bg-slate-50"
            >
              <p className="text-sm font-bold">{action.label}</p>
              <p className="text-[10px] text-slate-500">{action.sub}</p>
            </button>
          ) : (
            <button
              key={action.label}
              type="button"
              className="text-center py-4 border-r last:border-r-0 hover:bg-slate-50"
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
    <div className="bg-white border border-slate-300 rounded-md overflow-hidden">
      <div className="h-28 bg-green-500 text-white p-5">
        <h2 className="text-lg font-semibold">Supporting Functions</h2>
      </div>

      <div className="relative h-12">
        <div className="absolute left-1/2 -top-8 -translate-x-1/2 w-16 h-16 bg-white border border-slate-300 rounded-full flex items-center justify-center">
          <span className="material-symbols-outlined text-green-600 text-3xl">
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
      className="flex items-center justify-between px-4 py-2 border-t hover:bg-slate-50"
    >
      <span>{label}</span>

      {badge && (
        <span className="bg-red-500 text-white text-xs px-2 rounded">
          {badge}
        </span>
      )}
    </Link>
  );
}

function GuidelinesModal({ onClose, onProceed }) {
  return (
    <div className="fixed inset-0 z-[999] bg-black/55 flex items-center justify-center px-4">
      <div className="bg-white w-full max-w-4xl rounded shadow-lg border border-slate-300">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="w-1 h-7 bg-[#18b36b]" />
            <h2 className="text-lg font-normal text-slate-800">
              fasTrack Guidelines
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-9 py-7 text-[11px] text-slate-700 leading-relaxed">
          <ol className="list-decimal space-y-3 pl-5">
            <li>
              Applicant must first consult the{" "}
              <strong>Department of Land and Surveys (L&amp;S)</strong> of the
              division or Bintulu Development Authority (BDA). This is known as{" "}
              <strong>Preliminary Stage</strong> which discussion between client
              and agency to be held at L&amp;S/BDA office. Under this stage,
              L&amp;S / BDA shall work together with the client:
              <ul className="list-disc pl-6 mt-1 space-y-1">
                <li>to identify the site;</li>
                <li>to carry out joint-site inspection;</li>
                <li>to accept the selected site.</li>
              </ul>
              Once the above mentioned Preliminary Stage is completed, L&amp;S
              and BDA will advise the client to proceed with online submission
              using fasTrack.
            </li>

            <li>
              The siting application for <strong>federal government projects</strong>{" "}
              shall be through the relevant technical agency.
            </li>

            <li>
              Application for cemeteries, mosques, surau and related religious
              facilities shall be submitted through the relevant authority.
            </li>

            <li>
              All applications submitted by NGOs related to religious purpose
              should be submitted through the relevant unit with recommendation
              to the approving department.
            </li>

            <li>
              The applicant must submit the complete application form and all
              supporting documents required by fasTrack.
            </li>

            <li>
              The application for community hall, football field and other
              public facilities shall be reviewed by the relevant government
              agencies.
            </li>

            <li>
              Availability of fund is <strong>compulsory</strong>. If there is no
              fund, the application will not be able to register, process or
              submit through the system.
            </li>

            <li>
              All submissions must use the online <strong>Siting Form</strong>,
              fully signed, printed and uploaded into Supporting Document.
            </li>

            <li>
              All documents must be submitted <strong>electronically</strong> /
              digitally via fasTrack online.
            </li>
          </ol>

          <button
            type="button"
            onClick={onProceed}
            className="mt-6 inline-flex items-center gap-2 bg-[#18b36b] text-white px-3 py-2 rounded-sm text-xs font-semibold hover:bg-[#12975a]"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            Proceed
          </button>
        </div>
      </div>
    </div>
  );
}

export default HomePage;