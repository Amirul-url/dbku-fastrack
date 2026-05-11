import { Link, useLocation, useNavigate } from "react-router-dom";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { useLanguage } from "../context/LanguageContext";
import { useNotifications } from "../context/NotificationContext";
import logo from "../assets/fasTrack.png";

const adminNav = [
  { labelKey: "nav.dashboard", fallback: "Dashboard", path: "/dashboard/admin", icon: "dashboard" },
  { labelKey: "nav.applications", fallback: "Applications", path: "/admin/applications", icon: "description" },
  { labelKey: "nav.notifications", fallback: "Notifications", path: "/notifications", icon: "notifications" },
];

const applicantNav = [
  { labelKey: "nav.dashboard", fallback: "Dashboard", path: "/user/dashboard", icon: "dashboard" },
  { labelKey: "nav.notifications", fallback: "Notifications", path: "/notifications", icon: "notifications" },
];

function AppShell({ children, role = "admin" }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { unreadCount } = useNotifications();
  const { t } = useLanguage();
  const user = getStoredUser();
  const nav = role === "admin" ? adminNav : applicantNav;

  function handleLogout() {
    localStorage.removeItem("fastrack_access_token");
    localStorage.removeItem("fastrack_refresh_token");
    localStorage.removeItem("fastrack_user");
    localStorage.removeItem("fastrack_remember_me");
    navigate("/login/malaysian", { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-slate-200 bg-white lg:flex lg:flex-col">
        <div className="flex h-14 items-center gap-3 border-b border-slate-200 px-4">
          <img src={logo} alt="fasTrack Logo" className="h-8 w-auto object-contain" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-950">DBKU fasTrack</p>
            <p className="text-xs text-slate-500">{t("app.digitalLicenseSystem")}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-2.5 py-3">
          {nav.map((item) => {
            const active =
              location.pathname === item.path ||
              (item.path !== "/dashboard/admin" &&
                location.pathname.startsWith(item.path));

            return (
              <Link
                key={item.path}
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
                {item.path === "/notifications" && unreadCount > 0 && (
                  <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">
                    {unreadCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-2.5">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
            {t("common.logout")}
          </button>
        </div>
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-5">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {role === "admin" ? t("role.officerPortal") : t("role.applicantPortal")}
              </p>
              <p className="truncate text-sm font-semibold text-slate-950">
                {user?.full_name || user?.username || t("role.fasTrackUser")}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <LanguageSwitcher />
              <Link
                to="/notifications"
                className="relative flex h-10 w-10 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
                aria-label={t("common.notifications")}
              >
                <span className="material-symbols-outlined text-[21px]">
                  notifications
                </span>
                {unreadCount > 0 && (
                  <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-red-600" />
                )}
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="flex h-10 w-10 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 lg:hidden"
                aria-label={t("common.logout")}
              >
                <span className="material-symbols-outlined text-[21px]">logout</span>
              </button>
            </div>
          </div>

          <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 lg:hidden">
            {nav.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`whitespace-nowrap rounded-md px-3 py-2 text-xs font-semibold ${
                  location.pathname === item.path
                    ? "bg-emerald-50 text-emerald-800"
                    : "text-slate-600"
                }`}
              >
                {t(item.labelKey, item.fallback)}
              </Link>
            ))}
          </nav>
        </header>

        <main className="mx-auto max-w-[1680px] px-4 py-5 sm:px-5 lg:px-6">{children}</main>
      </div>
    </div>
  );
}

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("fastrack_user") || "null");
  } catch {
    return null;
  }
}

export default AppShell;
