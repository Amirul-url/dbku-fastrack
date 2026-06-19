import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { useLanguage } from "../context/LanguageContext";
import { useNotifications } from "../context/NotificationContext";
import { Icon } from "../components/ui/SystemUI";
import {
  apiRequest,
  clearAuthSession,
  fetchApplicationList,
  getStoredUser,
  recordLogoutSession,
} from "../services/api";
import {
  getApplicantRecordSeen,
  getRecordUpdatedTime,
} from "../utils/applicantSeenRecords";
const logo = "/ALiS.png";
const ADMIN_DASHBOARD_MENU_KEY = "fastrack_admin_dashboard_menu_open";
const ADMIN_E_LICENSES_MENU_KEY = "fastrack_admin_e_licenses_menu_open";
const PT_IKL_TASK_STATUSES = new Set([
  "incomplete",
  "approved",
  "bill_pending_ku",
  "payment_submitted",
  "payment_verified",
]);
const KU_IKL_TASK_STATUSES = new Set([
  "submitted",
  "ku_ikl_review",
  "technical_review_completed",
]);
const IKL_TECHNICAL_TASK_STATUSES = new Set([
  "technical_site_visit",
  "technical_amendment",
]);
const TECHNICAL_DEPARTMENT_TASK_STATUSES = new Set([
  "technical_review",
  "technical_site_visit",
]);
const TECHNICAL_DEPARTMENTS = new Set(["BLG", "GPM", "MNE", "IMT", "LNP", "ENG"]);
const APPROVAL_TASK_STATUSES = new Set([
  "management_review",
  "mphlg_processing",
  "mphlg_decision_received",
]);
const APPROVAL_SUPPORT_DEPARTMENTS = new Set(["TP(RES)", "PGH", "TP(RES)/PGH", "TP/PGH"]);

function readSessionBoolean(key, fallback = false) {
  try {
    const storedValue = window.sessionStorage.getItem(key);

    if (storedValue === null) {
      return fallback;
    }

    return storedValue === "true";
  } catch {
    return fallback;
  }
}

function hasSessionBoolean(key) {
  try {
    return window.sessionStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

function writeSessionBoolean(key, value) {
  try {
    window.sessionStorage.setItem(key, value ? "true" : "false");
  } catch {
    // Session storage can be unavailable in some browser privacy modes.
  }
}

function buildAdminNav(taskCounts = {}, user = null) {
  if (isMphlgUser(user)) {
    return [
      {
        labelKey: "nav.dashboard",
        fallback: "Dashboard",
        path: "/dashboard/admin",
        view: "dashboard",
        icon: "dashboard",
      },
      {
        labelKey: "admin.dashboard.awaitingApproval",
        fallback: "Awaiting Approval",
        path: "/dashboard/admin?view=approval",
        view: "approval",
        icon: "check_circle",
        badge: taskCounts.approval || 0,
      },
    ];
  }

  const isSupervisor = isApprovalWorkflowUser(user);

  const dashboardChildren = [
    isSupervisor
      ? null
      : {
          labelKey: "admin.dashboard.personalTask",
          fallback: "Personal Task",
          path: "/dashboard/admin?view=personal",
          view: "personal",
          badge: taskCounts.personal || 0,
        },
    {
      labelKey: "admin.dashboard.awaitingApproval",
      fallback: "Awaiting Approval",
      path: "/dashboard/admin?view=approval",
      view: "approval",
      badge: taskCounts.approval || 0,
    },
  ].filter(Boolean);
  const dashboardBadge = dashboardChildren.reduce(
    (total, child) => total + Number(child.badge || 0),
    0
  );
  const eLicensePaymentBadge = Number(taskCounts.eLicensePayment || 0);
  const eLicenseLicenseBadge = Number(taskCounts.eLicenseLicense || 0);

  return [
    {
      labelKey: "nav.dashboard",
      fallback: "Dashboard",
      path: "/dashboard/admin",
      icon: "dashboard",
      badge: dashboardBadge,
      children: dashboardChildren,
    },
    isELicenseWorkflowUser(user)
      ? {
          labelKey: "nav.eLicenses",
          fallback: "E-Licenses",
          path: "/admin/e-licenses",
          activePathPrefix: "/admin/e-licenses",
          icon: "qr_code_2",
          badge: eLicensePaymentBadge + eLicenseLicenseBadge,
        }
      : null,
    {
      labelKey: "nav.guidelines",
      fallback: "Guidelines",
      path: "/admin/guidelines",
      icon: "menu_book",
    },
  ].filter(Boolean);
}

const superAdminNav = [
  { labelKey: "nav.dashboard", fallback: "Dashboard", path: "/superadmin/dashboard", icon: "dashboard" },
  { type: "section", labelKey: "superadmin.nav.sectionUser", fallback: "User", key: "user" },
  { labelKey: "superadmin.nav.users", fallback: "User", path: "/superadmin/users", icon: "group" },
  { type: "section", labelKey: "superadmin.nav.sectionDbku", fallback: "DBKU", key: "dbku" },
  { labelKey: "superadmin.nav.dbkuAdmins", fallback: "Admin", path: "/superadmin/admins", icon: "admin_panel_settings" },
  { labelKey: "superadmin.nav.supervisors", fallback: "Supervisor", path: "/superadmin/supervisors", icon: "supervisor_account" },
  { type: "section", labelKey: "superadmin.nav.sectionMphlg", fallback: "MPHLG", key: "mphlg" },
  { labelKey: "superadmin.nav.mphlgAdmins", fallback: "Admin", path: "/superadmin/mphlg-admins", icon: "admin_panel_settings" },
  { type: "section", labelKey: "superadmin.nav.sectionSystem", fallback: "System", key: "system" },
  { labelKey: "superadmin.nav.superadmins", fallback: "SuperAdmin", path: "/superadmin/superadmins", icon: "shield_person" },
];

function getApplicationStepPath(applicationId, route) {
  if (!applicationId) return "/applications/new";

  if (route === "edit") {
    return `/applications/${applicationId}/edit?id=${applicationId}`;
  }

  return `/applications/${applicationId}/${route}?id=${applicationId}`;
}

function buildApplicantNav(taskCounts = {}) {
  const statusBadge = Number(taskCounts.status || 0);
  const eLicenseBadge = Number(taskCounts.eLicense || 0);
  const combinedStatusBadge = Number(taskCounts.combined || statusBadge + eLicenseBadge);

  return [
    {
      labelKey: "nav.dashboard",
      fallback: "Dashboard",
      path: "/user/dashboard",
      icon: "dashboard",
      badge: combinedStatusBadge,
      children: [
        {
          labelKey: "applicant.tabApplications",
          fallback: "Applications",
          path: "/user/dashboard?tab=applications",
          tab: "applications",
        },
        {
          labelKey: "applicant.tabStatus",
          fallback: "Status & E-Licenses",
          path: "/user/dashboard?tab=status",
          tab: "status",
          badge: combinedStatusBadge,
        },
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [adminDashboardOpen, setAdminDashboardOpen] = useState(() =>
    readSessionBoolean(ADMIN_DASHBOARD_MENU_KEY, false)
  );
  const [adminELicensesOpen, setAdminELicensesOpen] = useState(() =>
    readSessionBoolean(ADMIN_E_LICENSES_MENU_KEY, false)
  );
  const [applicantDashboardOpen, setApplicantDashboardOpen] = useState(true);
  const [applicationStepsOpen, setApplicationStepsOpen] = useState(true);
  const [creatingStepRoute, setCreatingStepRoute] = useState("");
  const [adminTaskCounts, setAdminTaskCounts] = useState({ personal: 0, approval: 0 });
  const [applicantTaskCounts, setApplicantTaskCounts] = useState({ status: 0, eLicense: 0 });
  const [applicantSeenAt, setApplicantSeenAt] = useState(() => getApplicantRecordSeen(getStoredUser()));
  const userDisplayName = getHeaderDisplayName(user, role, t);
  const currentApplicationId = getApplicationIdFromPath(location.pathname);
  const stepApplicationId = currentApplicationId;
  const nav = useMemo(
    () => {
      if (role === "superadmin") return superAdminNav;
      if (role === "admin") {
        return buildAdminNav(adminTaskCounts, user);
      }
      return buildApplicantNav(applicantTaskCounts);
    },
    [role, adminTaskCounts, applicantTaskCounts, user]
  );

  const refreshAdminTaskCounts = useCallback(async ({ silent = false } = {}) => {
    if (role !== "admin") return;

    try {
      const applications = await fetchApplicationList();
      setAdminTaskCounts(getAdminTaskCounts(applications, user));
    } catch {
      if (!silent) setAdminTaskCounts({ personal: 0, approval: 0 });
    }
  }, [role, user]);

  const refreshApplicantTaskCounts = useCallback(async ({ silent = false, seenAt = null } = {}) => {
    if (role !== "applicant") return;

    try {
      const applications = await fetchApplicationList();
      const latestSeenAt = seenAt || getApplicantRecordSeen(user);
      const openELicenseRecordId = getOpenApplicantELicenseRecordId(location);

      setApplicantSeenAt(latestSeenAt);
      setApplicantTaskCounts(
        getApplicantTaskCounts(applications, latestSeenAt, {
          openELicenseRecordId,
        })
      );
    } catch {
      if (!silent) setApplicantTaskCounts({ status: 0, eLicense: 0 });
    }
  }, [location, role, user]);

  useEffect(() => {
    let active = true;

    apiRequest("/auth/me/")
      .then((data) => {
        if (!active || !data?.user) return;
        const normalizedUser = normalizeStoredUser(data.user);
        localStorage.setItem("fastrack_user", JSON.stringify(normalizedUser));
        setUser(normalizedUser);
        if (role === "applicant") {
          setApplicantSeenAt(getApplicantRecordSeen(normalizedUser));
        }

        if (role === "admin" && !hasSessionBoolean(ADMIN_DASHBOARD_MENU_KEY)) {
          setAdminDashboardOpen(false);
          writeSessionBoolean(ADMIN_DASHBOARD_MENU_KEY, false);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [role]);

  useEffect(() => {
    if (role !== "admin") {
      return undefined;
    }

    const initialTimerId = window.setTimeout(refreshAdminTaskCounts, 0);
    const intervalId = window.setInterval(
      () => refreshAdminTaskCounts({ silent: true }),
      15000
    );
    const handleRefresh = () => refreshAdminTaskCounts({ silent: true });

    window.addEventListener("fastrack:applications-changed", handleRefresh);

    return () => {
      window.clearTimeout(initialTimerId);
      window.clearInterval(intervalId);
      window.removeEventListener("fastrack:applications-changed", handleRefresh);
    };
  }, [role, refreshAdminTaskCounts]);

  useEffect(() => {
    if (role !== "applicant") {
      return undefined;
    }

    const initialTimerId = window.setTimeout(refreshApplicantTaskCounts, 0);
    const intervalId = window.setInterval(
      () => refreshApplicantTaskCounts({ silent: true }),
      15000
    );
    const handleRefresh = () => refreshApplicantTaskCounts({ silent: true });

    window.addEventListener("fastrack:applications-changed", handleRefresh);

    return () => {
      window.clearTimeout(initialTimerId);
      window.clearInterval(intervalId);
      window.removeEventListener("fastrack:applications-changed", handleRefresh);
    };
  }, [role, refreshApplicantTaskCounts]);

  useEffect(() => {
    if (role !== "applicant") {
      return undefined;
    }

    const handleSeenChange = () => {
      const latestSeenAt = getApplicantRecordSeen(user);

      setApplicantSeenAt(latestSeenAt);
      refreshApplicantTaskCounts({ silent: true, seenAt: latestSeenAt });
    };

    window.addEventListener("fastrack:applicant-record-seen", handleSeenChange);

    return () => {
      window.removeEventListener("fastrack:applicant-record-seen", handleSeenChange);
    };
  }, [refreshApplicantTaskCounts, role, user]);

  useEffect(() => {
    if (role !== "admin" || !location.pathname.startsWith("/admin/e-licenses")) {
      return undefined;
    }

    const params = new URLSearchParams(location.search);
    const fromPersonalTask = params.get("from") === "personal";

    const syncMenuStateId = window.setTimeout(() => {
      if (fromPersonalTask) {
        setAdminDashboardOpen(true);
        setAdminELicensesOpen(false);
        writeSessionBoolean(ADMIN_DASHBOARD_MENU_KEY, true);
        writeSessionBoolean(ADMIN_E_LICENSES_MENU_KEY, false);
        return;
      }

      setAdminELicensesOpen(true);
      setAdminDashboardOpen(false);
      writeSessionBoolean(ADMIN_E_LICENSES_MENU_KEY, true);
      writeSessionBoolean(ADMIN_DASHBOARD_MENU_KEY, false);
    }, 0);

    return () => window.clearTimeout(syncMenuStateId);
  }, [location.pathname, location.search, role]);

  async function handleLogout() {
    await recordLogoutSession();
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
              status: "Draft",
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
    <div className="min-h-screen min-w-[1280px] bg-slate-50 text-slate-950">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200 bg-white transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-5">
          <img src={logo} alt="ALiS Logo" className="h-9 w-auto object-contain" />
          <div className="min-w-0">
            <p className="text-base font-semibold text-slate-950">ALiS</p>
            <p className="text-xs text-slate-500">{t("app.advertisementLicenseApplication")}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1.5 overflow-y-auto px-3.5 py-4">
          {nav.map((item) => {
            if (item.type === "section") {
              return (
                <p
                  key={item.key || item.labelKey}
                  className="px-3.5 pb-1 pt-4 text-[11px] font-bold uppercase tracking-wide text-slate-400 first:pt-0"
                >
                  {t(item.labelKey, item.fallback)}
                </p>
              );
            }

            const activeTab = new URLSearchParams(location.search).get("tab");
            const activeView = getAdminSidebarView(location);
            const itemPathname = getPathname(item.path);
            const active =
              role === "admin" && item.view
                ? location.pathname === itemPathname && activeView === item.view
                : (item.activePathPrefix &&
                    location.pathname.startsWith(item.activePathPrefix)) ||
                  location.pathname === item.path ||
                  (role === "applicant" &&
                    item.path === "/user/dashboard" &&
                    location.pathname.startsWith("/applications")) ||
                  (item.path !== "/dashboard/admin" &&
                    location.pathname.startsWith(item.path));
            const hasChildren = Boolean(item.children || item.stepGroup);
            const adminDashboardItem = role === "admin" && item.path === "/dashboard/admin";
            const adminELicensesItem = role === "admin" && item.menuKey === "eLicenses";
            const submenuOpen =
              hasChildren &&
              ((role === "applicant" && applicantDashboardOpen) ||
                (adminDashboardItem && adminDashboardOpen) ||
                (adminELicensesItem && adminELicensesOpen));

            return (
              <div key={item.path}>
                {hasChildren && (role === "applicant" || adminDashboardItem || adminELicensesItem) ? (
                  <div
                    className={`flex w-full items-center justify-between rounded-md px-3.5 py-2.5 text-left text-sm font-medium ${
                      submenuOpen
                        ? "bg-slate-100 text-slate-700"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                    }`}
                  >
                    <Link
                      to={item.path}
                      onClick={() => {
                        if (role === "applicant") {
                          setApplicantDashboardOpen(true);
                        } else if (adminDashboardItem) {
                          setAdminELicensesOpen(false);
                          writeSessionBoolean(ADMIN_E_LICENSES_MENU_KEY, false);
                        } else if (adminELicensesItem) {
                          setAdminELicensesOpen(true);
                          setAdminDashboardOpen(false);
                          writeSessionBoolean(ADMIN_E_LICENSES_MENU_KEY, true);
                          writeSessionBoolean(ADMIN_DASHBOARD_MENU_KEY, false);
                        }
                      }}
                      className="flex min-w-0 flex-1 items-center gap-3"
                    >
                      <Icon name={item.icon} className="text-[20px]" />
                      <span className="truncate">{t(item.labelKey, item.fallback)}</span>
                    </Link>
                    <NavBadge count={submenuOpen ? 0 : item.badge} />
                    <button
                      type="button"
                      onClick={() => {
                        if (role === "applicant") {
                          setApplicantDashboardOpen((current) => !current);
                        } else if (adminDashboardItem) {
                          setAdminDashboardOpen((current) => {
                            const next = !current;
                            if (next) {
                              setAdminELicensesOpen(false);
                              writeSessionBoolean(ADMIN_E_LICENSES_MENU_KEY, false);
                            }
                            writeSessionBoolean(ADMIN_DASHBOARD_MENU_KEY, next);
                            return next;
                          });
                        } else if (adminELicensesItem) {
                          setAdminELicensesOpen((current) => {
                            const next = !current;
                            if (next) {
                              setAdminDashboardOpen(false);
                              writeSessionBoolean(ADMIN_DASHBOARD_MENU_KEY, false);
                            }
                            writeSessionBoolean(ADMIN_E_LICENSES_MENU_KEY, next);
                            return next;
                          });
                        }
                      }}
                      aria-expanded={submenuOpen}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-emerald-100"
                    >
                      <Icon name={submenuOpen ? "expand_less" : "expand_more"} className="text-[18px]" />
                    </button>
                  </div>
                ) : (
                  <Link
                    to={item.path}
                    onClick={() => {
                      if (role === "admin" && !adminDashboardItem && !adminELicensesItem) {
                        setAdminDashboardOpen(false);
                        setAdminELicensesOpen(false);
                        writeSessionBoolean(ADMIN_DASHBOARD_MENU_KEY, false);
                        writeSessionBoolean(ADMIN_E_LICENSES_MENU_KEY, false);
                      }
                    }}
                    className={`flex items-center justify-between rounded-md px-3.5 py-2.5 text-sm font-medium ${
                      active
                        ? "bg-emerald-50 text-emerald-800"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <Icon name={item.icon} className="text-[20px]" />
                      <span className="truncate">{t(item.labelKey, item.fallback)}</span>
                    </span>
                    <NavBadge count={item.badge} />
                  </Link>
                )}
                {submenuOpen && (
                  item.stepGroup ? (
                    <ApplicationStepLinks
                      group={item.stepGroup}
                      location={location}
                      t={t}
                      onStepClick={openApplicationStep}
                      creatingStepRoute={creatingStepRoute}
                    />
                  ) : (
                    <div className="mt-1.5 space-y-1.5 pl-10">
                    {item.children.map((child) => {
                      const hasNestedChildren = Boolean(child.children?.length);
                      const childActive =
                        role === "admin" && child.view
                          ? activeView === child.view
                          : role === "admin"
                            ? location.pathname === getPathname(child.path)
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
                                <Icon name={applicationStepsOpen ? "expand_less" : "expand_more"} className="text-[18px]" />
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
                          className={`grid min-h-[58px] grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium ${
                            childActive
                              ? "bg-emerald-700 text-white"
                              : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                          }`}
                        >
                          <span className="min-w-0 whitespace-normal break-normal leading-snug">
                            <SidebarChildLabel child={child} t={t} />
                          </span>
                          <NavBadge count={child.badge} />
                        </Link>
                      );
                    })}
                    </div>
                  )
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      <div className={`transition-[padding] duration-200 ${sidebarOpen ? "pl-72" : "pl-0"}`}>
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-4 px-7">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen((current) => !current)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                aria-label={t("common.toggleSidebar", "Toggle sidebar")}
                title={t("common.toggleSidebar", "Toggle sidebar")}
              >
                <Icon name="menu" className="text-[22px]" />
              </button>
              <p className="truncate text-sm font-semibold text-slate-950">
                {t("profile.welcome")}, {userDisplayName}
              </p>
            </div>

            <div className="relative flex items-center gap-2">
              <LanguageSwitcher />
              <Link
                to="/notifications"
                className="flex h-10 items-center gap-2 rounded-md px-3 text-slate-600 hover:bg-slate-100"
                aria-label={t("common.notifications")}
                title={t("common.notifications")}
              >
                <Icon name="notifications" className="text-[21px]" />
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
                <Icon name="person" className="text-[22px]" />
              </button>

              {profileOpen && (
                <ProfileDropdown
                  role={role}
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

function normalizeDisplayName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toUpperCase();
}

function normalizeStoredUser(user) {
  if (!user) return user;
  return {
    ...user,
    full_name: normalizeDisplayName(user.full_name),
  };
}

function getHeaderDisplayName(user, role, t) {
  const fallback =
    role === "superadmin"
      ? "Super Admin"
      : role === "admin"
        ? "Admin"
        : t("role.ALiSUser");

  return normalizeDisplayName(user?.full_name || user?.username || fallback);
}

function NavBadge({ count }) {
  const value = Number(count || 0);
  if (value <= 0) return null;

  return (
    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold leading-none text-white">
      {value > 99 ? "99+" : value}
    </span>
  );
}

function SidebarChildLabel({ child, t }) {
  const label = t(child.labelKey, child.fallback);

  if (
    child.labelKey === "nav.advertisementLicenseQr" &&
    label === "Advertisement License / QR"
  ) {
    return (
      <span className="block">
        <span className="block">Advertisement</span>
        <span className="block">License / QR</span>
      </span>
    );
  }

  return label;
}

function getAdminTaskCounts(applications, user) {
  const department = normalizeDepartmentCode(user?.department);

  return applications.reduce(
    (counts, application) => {
      if (isPersonalTaskForDepartment(application, department)) {
        counts.personal += 1;
      }

      if (isAwaitingApprovalTask(application, department)) {
        counts.approval += 1;
      }

      if (department === "PT(IKL)" && isELicensePaymentTask(application)) {
        counts.eLicensePayment += 1;
      }

      if (department === "KU(IKL)" && isKuELicensePaymentTask(application)) {
        counts.eLicensePayment += 1;
      }

      if (department === "PT(IKL)" && isELicenseLicenseTask(application)) {
        counts.eLicenseLicense += 1;
      }

      return counts;
    },
    { personal: 0, approval: 0, eLicensePayment: 0, eLicenseLicense: 0 }
  );
}

function getApplicantTaskCounts(applications, seenAt = {}, options = {}) {
  const openELicenseRecordId = String(options.openELicenseRecordId || "");
  const combinedUnreadIds = new Set();
  const counts = { status: 0, eLicense: 0, combined: 0 };

  applications.forEach((application) => {
    const id = String(application?.id || "");
    const status = normalizeWorkflowStatus(application?.status);
    const updatedAt = getRecordUpdatedTime(application);
    const isOpenELicenseRecord = openELicenseRecordId && id === openELicenseRecordId;

    if (
      !isOpenELicenseRecord &&
      status &&
      status !== "draft" &&
      updatedAt > Number(seenAt.status?.[application?.id] || 0)
    ) {
      counts.status += 1;
      if (id) combinedUnreadIds.add(id);
    }

    if (
      !isOpenELicenseRecord &&
      isApplicantELicenseItem(status) &&
      updatedAt > Number(seenAt.eLicense?.[application?.id] || 0)
    ) {
      counts.eLicense += 1;
      if (id) combinedUnreadIds.add(id);
    }
  });

  counts.combined = combinedUnreadIds.size;

  return counts;
}

function getOpenApplicantELicenseRecordId(location) {
  if (!location?.pathname?.startsWith("/user/dashboard")) return "";

  const params = new URLSearchParams(location.search || "");

  return ["license", "status"].includes(params.get("tab")) ? params.get("id") || "" : "";
}

function isApplicantELicenseItem(status) {
  return [
    "invoice_generated",
    "payment_submitted",
    "payment_verified",
    "license_issued",
    "license_revoked",
  ].includes(status);
}

function isELicenseWorkflowUser() {
  return false;
}

function isApprovalWorkflowUser(user) {
  const role = String(user?.role || "").trim().toLowerCase();
  const department = normalizeDepartmentCode(user?.department);

  return (
    role === "supervisor" ||
    department === "KB(LES)" ||
    APPROVAL_SUPPORT_DEPARTMENTS.has(department) ||
    isMphlgUser(user)
  );
}

function isMphlgUser(user) {
  return normalizeDepartmentCode(user?.department) === "MPHLG";
}

function isELicensePaymentTask(application) {
  return ["approved", "bill_pending_ku", "payment_submitted"].includes(
    normalizeWorkflowStatus(application?.status)
  );
}

function isKuELicensePaymentTask() {
  return false;
}

function isELicenseLicenseTask(application) {
  return normalizeWorkflowStatus(application?.status) === "payment_verified";
}

function isPersonalTaskForDepartment(application, department) {
  const status = normalizeWorkflowStatus(application?.status);

  if (department === "PT(IKL)") {
    return PT_IKL_TASK_STATUSES.has(status);
  }

  if (department === "KU(IKL)") {
    return KU_IKL_TASK_STATUSES.has(status);
  }

  if (department === "IKL (TECHNICAL)") {
    return IKL_TECHNICAL_TASK_STATUSES.has(status);
  }

  if (TECHNICAL_DEPARTMENTS.has(department)) {
    return (
      TECHNICAL_DEPARTMENT_TASK_STATUSES.has(status) &&
      isTechnicalDepartmentSelected(application, department) &&
      !hasTechnicalDepartmentReview(application, department)
    );
  }

  return false;
}

function isAwaitingApprovalTask(application, department) {
  const status = normalizeWorkflowStatus(application?.status);

  if (department === "PT(IKL)") {
    return false;
  }

  if (!APPROVAL_TASK_STATUSES.has(status) || hasApplicationSection(application, "approval")) {
    return false;
  }

  if (department === "KB(LES)") {
    return status === "management_review" && !isKbLesVerified(application);
  }

  if (APPROVAL_SUPPORT_DEPARTMENTS.has(department)) {
    return (
      status === "management_review" &&
      isKbLesVerified(application) &&
      !hasManagementSupport(application)
    );
  }

  if (department === "MPHLG") {
    return status === "mphlg_processing" && !isMphlgReviewComplete(application);
  }

  return false;
}

function normalizeWorkflowStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeDepartmentCode(value) {
  const department = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[.]+$/g, "")
    .replace(/-/g, " ")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ");

  if (department === "UNIT IKLAN") return "PT(IKL)";
  if (department === "PT IKL") return "PT(IKL)";
  if (department === "KU IKL") return "KU(IKL)";
  if (department === "TP RES" || department === "TP(RES)") return "TP(RES)";
  if (department === "TP RES/PGH" || department === "TP(RES)/PGH") return "TP(RES)/PGH";
  if (department === "IKL(TECHNICAL)" || department === "IKL TECHNICAL") {
    return "IKL (TECHNICAL)";
  }
  if (department === "INP") return "LNP";
  if (department === "SETIAUSAHA TETAP") return "";
  return department;
}

function getTechnicalDepartmentReviews(application) {
  return (
    application?.technical_department_reviews ||
    application?.form_data?.technical_department_reviews ||
    {}
  );
}

function getApplicationSection(application, key) {
  return application?.[key] || application?.form_data?.[key] || {};
}

function hasApplicationSection(application, key) {
  const section = getApplicationSection(application, key);
  return Boolean(section && Object.keys(section).length > 0);
}

function isKbLesVerified(application) {
  const status = String(getApplicationSection(application, "kb_les_verification")?.status || "")
    .trim()
    .toLowerCase();
  return ["verified", "supported", "completed"].includes(status);
}

function hasManagementSupport(application) {
  const status = String(getApplicationSection(application, "management_recommendation")?.status || "")
    .trim()
    .toLowerCase();
  return ["supported", "approved", "completed"].includes(status);
}

function isMphlgReviewComplete(application) {
  const status = String(getApplicationSection(application, "mphlg_gateway")?.status || "")
    .trim()
    .toLowerCase();
  return status === "approved" || status === "reviewed";
}

function hasTechnicalDepartmentReview(application, department) {
  const review = getTechnicalDepartmentReviews(application)?.[department];
  if (!review || typeof review !== "object") return false;

  return Boolean(
    review.decision ||
      review.status ||
      review.remarks ||
      review.comment ||
      review.submitted_at
  );
}

function normalizeTechnicalDepartmentSelection(departments) {
  const selected = Array.isArray(departments) ? departments : [];

  return [...TECHNICAL_DEPARTMENTS].filter((department) =>
    selected.some((value) => normalizeDepartmentCode(value) === department)
  );
}

function hasTechnicalDepartmentSelection(application) {
  const selection =
    application?.technical_department_selection ||
    application?.form_data?.technical_department_selection;

  return Boolean(
    selection &&
      typeof selection === "object" &&
      Object.prototype.hasOwnProperty.call(selection, "departments")
  );
}

function getSelectedTechnicalDepartments(application) {
  const selection =
    application?.technical_department_selection ||
    application?.form_data?.technical_department_selection ||
    {};
  const selectedDepartments = normalizeTechnicalDepartmentSelection(selection.departments);
  if (selectedDepartments.length > 0 || hasTechnicalDepartmentSelection(application)) {
    return selectedDepartments;
  }

  const referralDepartments =
    application?.technical_referral?.participating_departments ||
    application?.form_data?.technical_referral?.participating_departments;
  const stepDepartments =
    application?.form_data?.step_1?.technical_departments ||
    application?.technical_departments;

  return normalizeTechnicalDepartmentSelection(referralDepartments || stepDepartments);
}

function isTechnicalDepartmentSelected(application, department) {
  const normalizedDepartment = normalizeDepartmentCode(department);
  if (!TECHNICAL_DEPARTMENTS.has(normalizedDepartment)) return false;

  return getSelectedTechnicalDepartments(application).includes(normalizedDepartment);
}

function ApplicationStepLinks({
  group,
  location,
  t,
  onStepClick,
  creatingStepRoute,
}) {
  return (
    <div className="ml-11 mt-1.5 space-y-1.5 border-l border-emerald-100 pl-3">
      <p className="px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-400">
        {t(group.labelKey, group.fallback)}
      </p>
      {group.children.map((step) => {
        const stepPath = getPathname(step.path);
        const stepActive = location.pathname === stepPath;

        return (
          <Link
            key={step.labelKey}
            to={step.path}
            onClick={(event) => onStepClick(event, step)}
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
  );
}

function ProfileDropdown({ role, t, onLogout }) {
  return (
    <div className="absolute right-0 top-12 z-50 w-48 rounded-md border border-slate-200 bg-white p-1.5 shadow-xl">
      {role === "applicant" && (
        <Link
          to="/user/profile"
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-800"
        >
          <Icon name="account_circle" className="text-[19px]" />
          {t("profile.profile")}
        </Link>
      )}
      <button
        type="button"
        onClick={onLogout}
        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-semibold text-red-700 hover:bg-red-50"
      >
        <Icon name="logout" className="text-[19px]" />
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

function getAdminSidebarView(location) {
  const params = new URLSearchParams(location.search);

  if (isCompletedSidebarContext(params)) {
    return "approval";
  }

  const view = params.get("view");
  if (view) return view;

  const returnTo = params.get("returnTo") || "";
  const returnToView = getViewFromPath(returnTo);

  if (location.pathname === "/dashboard/admin") {
    return "dashboard";
  }

  return returnToView || "personal";
}

function isCompletedSidebarContext(params) {
  const from = params.get("from") || "";
  const view = params.get("view") || "";
  const returnTo = params.get("returnTo") || "";

  return (
    view === "completed" ||
    from === "completed-approvals" ||
    returnTo.includes("view=completed") ||
    returnTo.includes("from=completed-approvals")
  );
}

function getViewFromPath(path) {
  if (!path) return "";

  try {
    const parsed = new URL(path, "http://localhost");
    const params = parsed.searchParams;

    if (isCompletedSidebarContext(params)) {
      return "approval";
    }

    return params.get("view") || "";
  } catch {
    return "";
  }
}

export default AppShell;
