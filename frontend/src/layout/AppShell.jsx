import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { useLanguage } from "../context/LanguageContext";
import { useNotifications } from "../context/NotificationContext";
import { apiRequest, clearAuthSession, getStoredUser } from "../services/api";
const logo = "/ALiS.png";

const adminNav = [
  {
    labelKey: "nav.dashboard",
    fallback: "Dashboard",
    path: "/dashboard/admin",
    icon: "dashboard",
    children: [
      {
        labelKey: "admin.dashboard.personalTask",
        fallback: "Personal Task",
        path: "/dashboard/admin?view=personal",
        view: "personal",
      },
      {
        labelKey: "admin.dashboard.awaitingApproval",
        fallback: "Awaiting Approval",
        path: "/dashboard/admin?view=approval",
        view: "approval",
      },
    ],
  },
];

const superAdminNav = [
  { labelKey: "nav.dashboard", fallback: "Dashboard", path: "/superadmin/dashboard", icon: "dashboard" },
  { labelKey: "superadmin.nav.users", fallback: "User", path: "/superadmin/users", icon: "group" },
  { labelKey: "superadmin.nav.admins", fallback: "Admin", path: "/superadmin/admins", icon: "admin_panel_settings" },
];

function getApplicationStepPath(applicationId, route) {
  if (!applicationId) return "/applications/new";

  if (route === "edit") {
    return `/applications/${applicationId}/edit?id=${applicationId}`;
  }

  return `/applications/${applicationId}/${route}?id=${applicationId}`;
}

function buildApplicantNav(stepApplicationId, showApplicationSteps) {
  const getStepPath = (route) => getApplicationStepPath(stepApplicationId, route);
  const applicationChildren = [];

  if (showApplicationSteps) {
    applicationChildren.push({
      labelKey: "steps.applicationSteps",
      fallback: "Application Steps",
      children: [
        { no: 1, route: "edit", labelKey: "steps.sittingApplication", fallback: "Sitting Application", path: getStepPath("edit") },
        { no: 2, route: "submitting-person", labelKey: "steps.submittingPerson", fallback: "Details of Submitting Person", path: getStepPath("submitting-person") },
        { no: 3, route: "supporting-document", labelKey: "steps.supportingDocument", fallback: "Supporting Document", path: getStepPath("supporting-document") },
        { no: 4, route: "declaration", labelKey: "steps.declaration", fallback: "Declaration", path: getStepPath("declaration") },
        { no: 5, route: "print-form", labelKey: "steps.printForm", fallback: "Print Form", path: getStepPath("print-form") },
      ],
    });
  }

  return [
    {
      labelKey: "nav.dashboard",
      fallback: "Dashboard",
      path: "/user/dashboard",
      icon: "dashboard",
      children: [
        {
          labelKey: "applicant.tabApplications",
          fallback: "Applications",
          path: "/user/dashboard?tab=applications",
          tab: "applications",
          children: applicationChildren,
        },
        { labelKey: "applicant.tabStatus", fallback: "Status", path: "/user/dashboard?tab=status", tab: "status" },
        { labelKey: "applicant.tabLicense", fallback: "E-Licenses", path: "/user/dashboard?tab=license", tab: "license" },
      ],
    },
  ];
}

function AppShell({ children, role = "admin" }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { unreadCount } = useNotifications();
  const { t } = useLanguage();
  const [user, setUser] = useState(getStoredUser);
  const [profileOpen, setProfileOpen] = useState(false);
  const [adminDashboardOpen, setAdminDashboardOpen] = useState(true);
  const [applicantDashboardOpen, setApplicantDashboardOpen] = useState(true);
  const [applicationStepsOpen, setApplicationStepsOpen] = useState(true);
  const [creatingStepRoute, setCreatingStepRoute] = useState("");
  const userDisplayName = user?.full_name || user?.username || t("role.ALiSUser");
  const currentApplicationId = getApplicationIdFromPath(location.pathname);
  const showApplicationSteps =
    location.pathname === "/applications/new" || Boolean(currentApplicationId);
  const stepApplicationId = currentApplicationId;
  const nav = useMemo(
    () => {
      if (role === "superadmin") return superAdminNav;
      if (role === "admin") return adminNav;
      return buildApplicantNav(stepApplicationId, showApplicationSteps);
    },
    [role, stepApplicationId, showApplicationSteps]
  );

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

  async function openApplicationStep(event, step) {
    if (role !== "applicant" || stepApplicationId) return;

    event.preventDefault();
    if (creatingStepRoute) return;

    try {
      setCreatingStepRoute(step.route);
      const application = await apiRequest("/applications/", {
        method: "POST",
        body: JSON.stringify({
          application_type: "sitting_application",
          title: "Draft Sitting Application",
          current_step: 1,
          form_data: {
            step_1: {
              status: "Prepare Case",
              application_type: "Application for Site (New Site)",
              application_type_label: "Application for Site (New Site)",
            },
          },
        }),
      });
      const applicationId = application?.id;
      if (!applicationId) return;

      navigate(getApplicationStepPath(applicationId, step.route));
    } catch (err) {
      console.error("Failed to create draft application:", err);
    } finally {
      setCreatingStepRoute("");
    }
  }

  return (
    <div className="min-h-screen min-w-[1280px] bg-slate-50 text-slate-950 [&_.text-sm]:text-base [&_.text-xs]:text-sm">
      <aside className="fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200 bg-white">
        <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-5">
          <img src={logo} alt="ALiS Logo" className="h-9 w-auto object-contain" />
          <div className="min-w-0">
            <p className="text-base font-semibold text-slate-950">ALiS</p>
            <p className="text-xs text-slate-500">{t("app.advertisementLicenseApplication")}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1.5 overflow-y-auto px-3.5 py-4">
          {nav.map((item) => {
            const active =
              location.pathname === item.path ||
              (role === "applicant" &&
                item.path === "/user/dashboard" &&
                location.pathname.startsWith("/applications")) ||
              (item.path !== "/dashboard/admin" &&
                location.pathname.startsWith(item.path));
            const activeTab = new URLSearchParams(location.search).get("tab");
            const activeView = new URLSearchParams(location.search).get("view");
            const hasChildren = Boolean(item.children);
            const adminDashboardItem = role === "admin" && item.path === "/dashboard/admin";
            const submenuOpen =
              hasChildren &&
              ((role === "applicant" && applicantDashboardOpen) ||
                (adminDashboardItem && adminDashboardOpen));

            return (
              <div key={item.path}>
                {hasChildren && (role === "applicant" || adminDashboardItem) ? (
                  <div
                    className={`flex w-full items-center justify-between rounded-md px-3.5 py-2.5 text-left text-sm font-medium ${
                      active
                        ? "bg-emerald-50 text-emerald-800"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                    }`}
                  >
                    <Link
                      to={item.path}
                      onClick={() => {
                        if (role === "applicant") {
                          setApplicantDashboardOpen(true);
                        } else {
                          setAdminDashboardOpen(true);
                        }
                      }}
                      className="flex min-w-0 flex-1 items-center gap-3"
                    >
                      <span className="material-symbols-outlined text-[20px]">
                        {item.icon}
                      </span>
                      <span className="truncate">{t(item.labelKey, item.fallback)}</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        if (role === "applicant") {
                          setApplicantDashboardOpen((current) => !current);
                        } else {
                          setAdminDashboardOpen((current) => !current);
                        }
                      }}
                      aria-expanded={submenuOpen}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-emerald-100"
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        {submenuOpen ? "expand_less" : "expand_more"}
                      </span>
                    </button>
                  </div>
                ) : (
                  <Link
                    to={item.path}
                    className={`flex items-center justify-between rounded-md px-3.5 py-2.5 text-sm font-medium ${
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
                  <div className="mt-1.5 space-y-1.5 pl-10">
                    {item.children.map((child) => {
                      const hasNestedChildren = Boolean(child.children?.length);
                      const childActive =
                        role === "admin"
                          ? activeView === child.view
                          : activeTab === child.tab;
                      const nestedActive =
                        hasNestedChildren && location.pathname.startsWith("/applications");

                      if (hasNestedChildren) {
                        return (
                          <div key={child.path}>
                            <div
                              className={`flex items-center overflow-hidden rounded-md text-sm font-medium ${
                                childActive || nestedActive
                                  ? "bg-emerald-700 text-white"
                                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                              }`}
                            >
                              <Link
                                to={child.path}
                                className="min-w-0 flex-1 px-3.5 py-2.5"
                              >
                                {t(child.labelKey, child.fallback)}
                              </Link>
                              <button
                                type="button"
                                onClick={() => setApplicationStepsOpen((current) => !current)}
                                aria-expanded={applicationStepsOpen}
                                className={`flex h-9 w-9 items-center justify-center ${
                                  childActive || nestedActive ? "text-white" : "text-slate-600"
                                }`}
                              >
                                <span className="material-symbols-outlined text-[18px]">
                                  {applicationStepsOpen ? "expand_less" : "expand_more"}
                                </span>
                              </button>
                            </div>

                            {applicationStepsOpen && (
                              <div className="ml-3 mt-1.5 space-y-1.5 border-l border-emerald-100 pl-3">
                                <p className="px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-400">
                                  {t(child.children[0].labelKey, child.children[0].fallback)}
                                </p>
                                {child.children[0].children.map((step) => {
                                  const stepPath = getPathname(step.path);
                                  const stepActive = location.pathname === stepPath;

                                  return (
                                    <Link
                                      key={step.labelKey}
                                      to={step.path}
                                      onClick={(event) => openApplicationStep(event, step)}
                                      className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold leading-5 ${
                                        stepActive
                                          ? "bg-emerald-50 text-emerald-800"
                                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                                      }`}
                                    >
                                      <span
                                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                          stepActive
                                            ? "bg-emerald-700 text-white"
                                            : "bg-white text-emerald-800"
                                        }`}
                                      >
                                        {step.no}
                                      </span>
                                      <span className="min-w-0 leading-snug">
                                        {creatingStepRoute === step.route
                                          ? t("common.loading")
                                          : t(step.labelKey, step.fallback)}
                                      </span>
                                    </Link>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      }

                      return (
                        <Link
                          key={child.path}
                          to={child.path}
                          className={`block rounded-md px-3.5 py-2.5 text-sm font-medium ${
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

      <div className="pl-72">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-4 px-7">
            <div className="min-w-0">
              {role === "superadmin" ? (
                <p className="truncate text-sm font-semibold text-slate-950">
                  {t("profile.welcome")}, Super Admin
                </p>
              ) : role === "admin" ? (
                <p className="truncate text-sm font-semibold text-slate-950">
                  {t("profile.welcome")}, Admin
                </p>
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
                <span className="min-w-5 rounded-full bg-red-600 px-1.5 text-center text-xs font-bold text-white">
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
                <span className="material-symbols-outlined text-[22px]">person</span>
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

        <main className="mx-auto min-h-[calc(100vh-145px)] max-w-[1680px] px-7 py-6">
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
    <footer className="border-t border-slate-200 bg-white px-7 py-6">
      <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-8 text-sm text-slate-500">
        <div>
          <p className="font-bold text-slate-700">ALiS</p>
          <p>{t("common.copyright")}</p>
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

function getApplicationIdFromPath(pathname) {
  const match = String(pathname || "").match(/^\/applications\/(\d+)/);
  return match?.[1] || "";
}

function getPathname(path) {
  return String(path || "").split("?")[0];
}

export default AppShell;
