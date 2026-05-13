import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { useLanguage } from "../context/LanguageContext";
import { useNotifications } from "../context/NotificationContext";
import { apiRequest, clearAuthSession, getStoredUser } from "../services/api";
import logo from "../assets/fasTrack.png";

const adminNav = [
  { labelKey: "nav.dashboard", fallback: "Dashboard", path: "/dashboard/admin", icon: "dashboard" },
  { labelKey: "nav.applications", fallback: "Applications", path: "/admin/applications", icon: "description" },
  { labelKey: "nav.notifications", fallback: "Notifications", path: "/notifications", icon: "notifications" },
];

const applicantNav = [
  {
    labelKey: "nav.dashboard",
    fallback: "Dashboard",
    path: "/user/dashboard",
    icon: "dashboard",
    children: [
      { labelKey: "applicant.tabApplications", fallback: "Applications", path: "/user/dashboard?tab=applications", tab: "applications" },
      { labelKey: "applicant.tabStatus", fallback: "Status", path: "/user/dashboard?tab=status", tab: "status" },
      { labelKey: "applicant.tabLicense", fallback: "E-Licenses", path: "/user/dashboard?tab=license", tab: "license" },
    ],
  },
];

function AppShell({ children, role = "admin" }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { unreadCount } = useNotifications();
  const { t } = useLanguage();
  const [user, setUser] = useState(getStoredUser);
  const [profileOpen, setProfileOpen] = useState(false);
  const [applicantDashboardOpen, setApplicantDashboardOpen] = useState(true);
  const nav = role === "admin" ? adminNav : applicantNav;
  const userDisplayName = user?.full_name || user?.username || t("role.fasTrackUser");
  const initials = useMemo(() => getInitials(userDisplayName), [userDisplayName]);

  useEffect(() => {
    let active = true;

    apiRequest("/auth/me/")
      .then((data) => {
        if (!active || !data?.user) return;
        localStorage.setItem("fastrack_user", JSON.stringify(data.user));
        setUser(data.user);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  function handleLogout() {
    clearAuthSession();
    navigate("/login/malaysian", { replace: true });
  }

  function toggleProfile() {
    setProfileOpen(!profileOpen);
  }

  return (
    <div className="min-h-screen min-w-[1280px] bg-slate-50 text-slate-950">
      <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-slate-200 bg-white">
        <div className="flex h-14 items-center gap-3 border-b border-slate-200 px-4">
          <img src={logo} alt="fasTrack Logo" className="h-8 w-auto object-contain" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-950">DBKU fasTrack</p>
            <p className="text-xs text-slate-500">{t("app.advertisementLicenseApplication")}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-2.5 py-3">
          {nav.map((item) => {
            const active =
              location.pathname === item.path ||
              (item.path !== "/dashboard/admin" &&
                location.pathname.startsWith(item.path));
            const activeTab = new URLSearchParams(location.search).get("tab") || "applications";
            const hasChildren = Boolean(item.children);
            const submenuOpen = role === "applicant" && hasChildren && active && applicantDashboardOpen;

            function handleParentClick() {
              if (!hasChildren) return;

              if (role === "applicant") {
                if (!active) {
                  navigate(item.path);
                  setApplicantDashboardOpen(true);
                  return;
                }
                setApplicantDashboardOpen((current) => !current);
              }
            }

            return (
              <div key={item.path}>
                {hasChildren && role === "applicant" ? (
                  <button
                    type="button"
                    onClick={handleParentClick}
                    aria-expanded={submenuOpen}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-medium ${
                      active
                        ? "bg-emerald-50 text-emerald-800"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="material-symbols-outlined text-[20px]">
                        {item.icon}
                      </span>
                      <span className="truncate">{t(item.labelKey, item.fallback)}</span>
                    </span>
                    <span className="material-symbols-outlined text-[18px]">
                      {submenuOpen ? "expand_less" : "expand_more"}
                    </span>
                  </button>
                ) : (
                  <Link
                    to={item.path}
                    className={`flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium ${
                      active
                        ? "bg-emerald-50 text-emerald-800"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="material-symbols-outlined text-[20px]">
                        {item.icon}
                      </span>
                      <span className="truncate">{t(item.labelKey, item.fallback)}</span>
                    </span>
                  </Link>
                )}
                {submenuOpen && (
                  <div className="mt-1 space-y-1 pl-8">
                    {item.children.map((child) => {
                      const childActive = activeTab === child.tab;

                      return (
                        <Link
                          key={child.path}
                          to={child.path}
                          className={`block rounded-md px-3 py-2 text-sm font-medium ${
                            childActive
                              ? "bg-emerald-700 text-white"
                              : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                          }`}
                        >
                          {t(child.labelKey, child.fallback)}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="pl-60">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex h-14 items-center justify-between gap-4 px-6">
            <div className="min-w-0">
              {role === "admin" ? (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {t("role.officerPortal")}
                  </p>
                  <p className="truncate text-sm font-semibold text-slate-950">
                    {userDisplayName}
                  </p>
                </>
              ) : (
                <p className="truncate text-sm font-semibold text-slate-950">
                  {t("profile.welcome")}, {userDisplayName}
                </p>
              )}
            </div>

            <div className="relative flex items-center gap-2">
              <LanguageSwitcher />
              <Link
                to="/notifications"
                className="flex h-10 items-center gap-2 rounded-md px-3 text-slate-600 hover:bg-slate-100"
                aria-label={t("common.notifications")}
                title={t("common.notifications")}
              >
                <span className="material-symbols-outlined text-[21px]">
                  notifications
                </span>
                <span className="min-w-5 rounded-full bg-slate-100 px-1.5 text-center text-xs font-bold text-slate-700">
                  {unreadCount}
                </span>
              </Link>
              <button
                type="button"
                onClick={toggleProfile}
                className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-sm font-bold text-emerald-800 hover:bg-emerald-50"
                aria-label={t("profile.accountProfile")}
                title={t("profile.accountProfile")}
              >
                {initials}
              </button>

              {profileOpen && (
                <ProfileDropdown
                  t={t}
                  onLogout={handleLogout}
                />
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto min-h-[calc(100vh-137px)] max-w-[1680px] px-6 py-5">
          {children}
        </main>
        {role === "applicant" && <DashboardFooter t={t} />}
      </div>
    </div>
  );
}

function ProfileDropdown({ t, onLogout }) {
  return (
    <div className="absolute right-0 top-12 z-50 w-48 rounded-md border border-slate-200 bg-white p-1.5 shadow-xl">
      <Link
        to="/user/profile"
        className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
      >
        <span className="material-symbols-outlined text-[19px]">person</span>
        {t("profile.profile")}
      </Link>
      <button
        type="button"
        onClick={onLogout}
        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-semibold text-red-700 hover:bg-red-50"
      >
        <span className="material-symbols-outlined text-[19px]">logout</span>
        {t("common.logout")}
      </button>
    </div>
  );
}

function DashboardFooter({ t }) {
  return (
    <footer className="border-t border-slate-200 bg-white px-6 py-5">
      <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-8 text-sm text-slate-500">
        <div>
          <p className="font-bold text-slate-700">DBKU fasTrack</p>
          <p>&copy; 2026 Advertisement License Application. All Rights Reserved.</p>
        </div>

        <div className="flex items-center gap-6">
          <Link to="/faq?from=dashboard" className="font-medium hover:text-[#006d32]">
            {t("auth.faq")}
          </Link>
          <a href="mailto:support@example.com" className="font-medium hover:text-[#006d32]">
            {t("auth.contactUs")}
          </a>
        </div>
      </div>
    </footer>
  );
}

function getInitials(name) {
  return String(name || "U")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
}

export default AppShell;
