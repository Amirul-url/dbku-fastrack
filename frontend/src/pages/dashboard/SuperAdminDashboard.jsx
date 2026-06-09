import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppShell from "../../layout/AppShell";
import { useLanguage } from "../../context/LanguageContext";
import { apiRequest } from "../../services/api";
import { Alert, Button } from "../../components/ui/SystemUI";

const emptyForm = {
  username: "",
  full_name: "",
  email: "",
  department: "",
  mobile_number: "",
  role: "applicant",
  password: "",
  password2: "",
  is_active: true,
};

const adminDepartments = [
  "PT(IKL)",
  "KU(IKL)",
  "IKL (TECHNICAL)",
  "BLG",
  "GPM",
  "MNE",
  "IMT",
  "LNP",
  "ENG",
];
const supervisorDepartments = ["KB(LES)", "TP(RES)", "PGH"];
const mphlgDepartments = ["MPHLG", "SUT"];
const recentActivityPageSize = 5;
const adminCsvHeaders = [
  "full_name",
  "nric",
  "email",
  "mobile_number",
  "department",
  "role",
  "password",
  "confirm_password",
];
const csvHeaderAliases = {
  name: "full_name",
  ic: "nric",
  ic_number: "nric",
  mykad: "nric",
  mykad_number: "nric",
  login_id: "nric",
  email_address: "email",
  phone: "mobile_number",
  phone_number: "mobile_number",
  mobile: "mobile_number",
  whatsapp: "mobile_number",
  whatsapp_number: "mobile_number",
  temporary_password: "password",
  password2: "confirm_password",
  retype_password: "confirm_password",
  confirm: "confirm_password",
};

const screenText = {
  en: {
    userTitle: "User Management",
    adminTitle: "Admin Management",
    dbkuAdminTitle: "DBKU Admin Management",
    mphlgAdminTitle: "MPHLG Admin Management",
    superadminTitle: "SuperAdmin Management",
    supervisorTitle: "Supervisor Management",
    userDescription: "Manage applicant login accounts and account access.",
    adminDescription: "Manage administrator login accounts and access roles.",
    dbkuAdminDescription: "Manage DBKU administrator login accounts and access roles.",
    mphlgAdminDescription: "Manage MPHLG administrator login accounts and ministry access.",
    superadminDescription: "Manage SuperAdmin login accounts and system access.",
    supervisorDescription: "Manage supervisor login accounts and approval access roles.",
    userList: "User List",
    adminList: "Admin List",
    dbkuAdminList: "DBKU Admin List",
    mphlgAdminList: "MPHLG Admin List",
    superadminList: "SuperAdmin List",
    supervisorList: "Supervisor List",
    addAccount: "Add Account",
    importCsv: "Import CSV",
    exportCsv: "Export CSV",
    searchUser: "Search name, IC Number, email, or mobile number",
    searchAdmin: "Search name, NRIC, email, mobile number, or department",
    searchSuperadmin: "Search name, NRIC, email, mobile number, or department",
    searchSupervisor: "Search name, NRIC, email, mobile number, or department",
    allDepartments: "All departments",
    filter: "Filter",
    reset: "Reset",
    accountFound: "account(s) found.",
    name: "Name",
    loginId: "IC Number",
    nric: "NRIC",
    email: "Email",
    mobileNumber: "Mobile Number",
    department: "Department",
    role: "Role",
    status: "Status",
    lastLogin: "Last Login",
    actions: "Actions",
    view: "View",
    loadingAccounts: "Loading accounts...",
    noAccounts: "No accounts found.",
    edit: "Edit",
    delete: "Delete",
    active: "Active",
    inactive: "Inactive",
    never: "Never",
    userRole: "User",
    staffRole: "Staff",
    adminRole: "Admin",
    supervisorRole: "Supervisor",
    superAdminRole: "SuperAdmin",
    addTitle: "Add Account",
    editTitle: "Edit Account",
    fullName: "Full Name",
    enterFullName: "Enter full name",
    enterNric: "Enter NRIC",
    enterEmail: "Enter email",
    enterMobile: "Enter mobile number",
    selectDepartment: "-- Select department --",
    password: "Password",
    newPassword: "New Password",
    confirmPassword: "Confirm Password",
    enterPassword: "Enter password",
    confirmPasswordPlaceholder: "Confirm password",
    cancel: "Cancel",
    save: "Save",
    saving: "Saving...",
    accountCreated: "Account created.",
    accountUpdated: "Account updated.",
    accountDeleted: "Account deleted.",
    saveFailed: "Failed to save account.",
    deleteFailed: "Failed to delete account.",
    loadFailed: "Failed to load accounts.",
    deleteConfirm: "Delete {name}?",
    deleteTitle: "Delete account",
    deleteMessage: "Are you sure you want to delete this account?",
    deleteWarning: "This action cannot be undone.",
    deleting: "Deleting...",
    importSuccess: "{count} account(s) imported.",
    importFailed: "CSV import failed.",
    csvMissingPassword: "CSV import requires a Password column for every account.",
    csvMissingColumns: "CSV import requires these columns: {columns}.",
    csvPasswordMismatch: "Password and Confirm Password do not match for {name}.",
    dashboardTitle: "SuperAdmin Dashboard",
    dashboardDescription: "Monitor account access, login activity, and administrator coverage.",
    totalUsers: "Total User Accounts",
    totalAdmins: "Total Admin Accounts",
    superAdminAccounts: "Total SuperAdmin Accounts",
    userAccounts: "User Accounts",
    dbkuAccounts: "DBKU Accounts",
    mphlgAccounts: "MPHLG Accounts",
    systemAccounts: "System Accounts",
    recentActivity: "Recent Activity",
    latestFiveActivities: "Latest 5 account activities",
    activityDateFilter: "Activity date",
    previous: "Previous",
    next: "Next",
    accessSummary: "Access Summary",
    yourPermissions: "Your permissions",
    noRecentActivity: "No recent account activity.",
    loggedInActivity: "Logged in",
    createdActivity: "Account created",
    totalLoginTime: "Total time",
    lastAccess: "Last access",
    registered: "Registered",
    accountAccessOverview: "Account access overview",
    yourRole: "Your Role",
    dashboardAccess: "Dashboard Access",
    managementAccess: "Management Access",
    dashboardAccessDescription: "SuperAdmin can view dashboard account information.",
    managementAccessDescription: "Full access to manage User, DBKU, MPHLG, and System login account sections.",
    userAccess: "User Section",
    userAccessDescription: "Manage applicant login accounts separately from agency staff.",
    dbkuAccess: "DBKU Section",
    dbkuAccessDescription: "Manage DBKU admin and supervisor login accounts.",
    mphlgAccess: "MPHLG Section",
    mphlgAccessDescription: "Manage MPHLG admin login accounts.",
    systemAccess: "System Section",
    systemAccessDescription: "Manage SuperAdmin login accounts and system access.",
    registrationInfo: "Registration Info",
    personalInformation: "Personal Information",
    fullNameMyKad: "Full Name (as per MyKad)",
    contactInformation: "Contact Details",
    addressInformation: "Address Information",
    emailAddress: "Email Address",
    mykadNumber: "MyKad Number",
    enterWithoutDashes: "Enter without dashes",
    gender: "Gender",
    dateOfBirth: "Date of Birth",
    nationality: "Nationality",
    address: "Address",
    addressLine1: "Unit / Floor / Block",
    addressLine2: "Street & Residential Area",
    postcode: "Postcode",
    city: "City",
    state: "State",
    close: "Close",
  },
  ms: {
    userTitle: "Pengurusan Pengguna",
    adminTitle: "Pengurusan Admin",
    dbkuAdminTitle: "Pengurusan Admin DBKU",
    mphlgAdminTitle: "Pengurusan Admin MPHLG",
    superadminTitle: "Pengurusan SuperAdmin",
    supervisorTitle: "Pengurusan Penyelia",
    userDescription: "Urus akaun log masuk pemohon dan akses akaun.",
    adminDescription: "Urus akaun log masuk pentadbir dan peranan akses.",
    dbkuAdminDescription: "Urus akaun log masuk pentadbir DBKU dan peranan akses.",
    mphlgAdminDescription: "Urus akaun log masuk pentadbir MPHLG dan akses kementerian.",
    superadminDescription: "Urus akaun log masuk SuperAdmin dan akses sistem.",
    supervisorDescription: "Urus akaun log masuk penyelia dan peranan akses kelulusan.",
    userList: "Senarai Pengguna",
    adminList: "Senarai Admin",
    dbkuAdminList: "Senarai Admin DBKU",
    mphlgAdminList: "Senarai Admin MPHLG",
    superadminList: "Senarai SuperAdmin",
    supervisorList: "Senarai Penyelia",
    addAccount: "Tambah Akaun",
    importCsv: "Import CSV",
    exportCsv: "Eksport CSV",
    searchUser: "Cari nama, nombor IC, emel, atau nombor telefon",
    searchAdmin: "Cari nama, NRIC, emel, nombor telefon, atau jabatan",
    searchSuperadmin: "Cari nama, NRIC, emel, nombor telefon, atau jabatan",
    searchSupervisor: "Cari nama, NRIC, emel, nombor telefon, atau jabatan",
    allDepartments: "Semua jabatan",
    filter: "Tapis",
    reset: "Set Semula",
    accountFound: "akaun dijumpai.",
    name: "Nama",
    loginId: "Nombor IC",
    nric: "NRIC",
    email: "Emel",
    mobileNumber: "Nombor Telefon",
    department: "Jabatan",
    role: "Peranan",
    status: "Status",
    lastLogin: "Log Masuk Terakhir",
    actions: "Tindakan",
    view: "Lihat",
    loadingAccounts: "Memuatkan akaun...",
    noAccounts: "Tiada akaun dijumpai.",
    edit: "Sunting",
    delete: "Padam",
    active: "Aktif",
    inactive: "Tidak Aktif",
    never: "Belum pernah",
    userRole: "Pengguna",
    staffRole: "Staf",
    adminRole: "Admin",
    supervisorRole: "Penyelia",
    superAdminRole: "SuperAdmin",
    addTitle: "Tambah Akaun",
    editTitle: "Sunting Akaun",
    fullName: "Nama Penuh",
    enterFullName: "Masukkan nama penuh",
    enterNric: "Masukkan NRIC",
    enterEmail: "Masukkan emel",
    enterMobile: "Masukkan nombor telefon",
    selectDepartment: "-- Pilih jabatan --",
    password: "Kata Laluan",
    newPassword: "Kata Laluan Baharu",
    confirmPassword: "Sahkan Kata Laluan",
    enterPassword: "Masukkan kata laluan",
    confirmPasswordPlaceholder: "Sahkan kata laluan",
    cancel: "Batal",
    save: "Simpan",
    saving: "Menyimpan...",
    accountCreated: "Akaun berjaya dicipta.",
    accountUpdated: "Akaun berjaya dikemas kini.",
    accountDeleted: "Akaun dipadam.",
    saveFailed: "Gagal menyimpan akaun.",
    deleteFailed: "Gagal memadam akaun.",
    loadFailed: "Gagal memuatkan akaun.",
    deleteConfirm: "Padam {name}?",
    deleteTitle: "Padam akaun",
    deleteMessage: "Adakah anda pasti mahu memadam akaun ini?",
    deleteWarning: "Tindakan ini tidak boleh dibuat asal.",
    deleting: "Memadam...",
    importSuccess: "{count} akaun diimport.",
    importFailed: "Import CSV gagal.",
    csvMissingPassword: "Import CSV memerlukan lajur Password untuk setiap akaun.",
    csvMissingColumns: "Import CSV memerlukan lajur berikut: {columns}.",
    csvPasswordMismatch: "Password dan Confirm Password tidak sepadan untuk {name}.",
    dashboardTitle: "Papan Pemuka SuperAdmin",
    dashboardDescription: "Pantau akses akaun, aktiviti log masuk, dan liputan pentadbir.",
    totalUsers: "Jumlah Akaun Pengguna",
    totalAdmins: "Jumlah Akaun Admin",
    superAdminAccounts: "Jumlah Akaun SuperAdmin",
    userAccounts: "Akaun Pengguna",
    dbkuAccounts: "Akaun DBKU",
    mphlgAccounts: "Akaun MPHLG",
    systemAccounts: "Akaun Sistem",
    recentActivity: "Aktiviti Terkini",
    latestFiveActivities: "5 aktiviti akaun terkini",
    activityDateFilter: "Tarikh aktiviti",
    previous: "Sebelum",
    next: "Seterusnya",
    accessSummary: "Ringkasan Akses",
    yourPermissions: "Kebenaran anda",
    noRecentActivity: "Tiada aktiviti akaun terkini.",
    loggedInActivity: "Log masuk",
    createdActivity: "Akaun dicipta",
    totalLoginTime: "Jumlah masa",
    lastAccess: "Akses terakhir",
    registered: "Didaftarkan",
    accountAccessOverview: "Gambaran akses akaun",
    yourRole: "Peranan Anda",
    dashboardAccess: "Akses Papan Pemuka",
    managementAccess: "Akses Pengurusan",
    dashboardAccessDescription: "SuperAdmin boleh melihat maklumat akaun di papan pemuka.",
    managementAccessDescription: "Akses penuh untuk mengurus bahagian akaun log masuk Pengguna, DBKU, MPHLG, dan Sistem.",
    userAccess: "Bahagian Pengguna",
    userAccessDescription: "Urus akaun log masuk pemohon secara berasingan daripada staf agensi.",
    dbkuAccess: "Bahagian DBKU",
    dbkuAccessDescription: "Urus akaun log masuk admin dan penyelia DBKU.",
    mphlgAccess: "Bahagian MPHLG",
    mphlgAccessDescription: "Urus akaun log masuk admin MPHLG.",
    systemAccess: "Bahagian Sistem",
    systemAccessDescription: "Urus akaun log masuk SuperAdmin dan akses sistem.",
    registrationInfo: "Maklumat Pendaftaran",
    personalInformation: "Maklumat Peribadi",
    fullNameMyKad: "Nama Penuh (seperti MyKad)",
    contactInformation: "Maklumat Perhubungan",
    addressInformation: "Maklumat Alamat",
    emailAddress: "Alamat E-mel",
    mykadNumber: "Nombor MyKad",
    enterWithoutDashes: "Masukkan tanpa sengkang",
    gender: "Jantina",
    dateOfBirth: "Tarikh Lahir",
    nationality: "Warganegara",
    address: "Alamat",
    addressLine1: "Unit / Tingkat / Blok",
    addressLine2: "Jalan & Kawasan Perumahan",
    postcode: "Poskod",
    city: "Bandar",
    state: "Negeri",
    close: "Tutup",
  },
};

function SuperAdminDashboard({ view = "dashboard" }) {
  if (view === "dashboard") {
    return <SuperAdminHome />;
  }

  return <SuperAdminAccountManagement view={view} />;
}

function SuperAdminHome() {
  const { language } = useLanguage();
  const labels = screenText[language] || screenText.en;
  const [accounts, setAccounts] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activityDateFilter, setActivityDateFilter] = useState("");
  const [activityPage, setActivityPage] = useState(0);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await apiRequest("/auth/accounts/");
      setAccounts(data.accounts || []);
      setSummary(data.summary || {});
    } catch (err) {
      setError(err.message || labels.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [labels.loadFailed]);

  useEffect(() => {
    const timerId = window.setTimeout(loadDashboard, 0);
    return () => window.clearTimeout(timerId);
  }, [loadDashboard]);

  useEffect(() => {
    const timerId = window.setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => window.clearInterval(timerId);
  }, []);

  const dashboard = useMemo(() => {
    const totalUsers = summary.users ?? accounts.filter((account) => account.role === "applicant").length;
    const dbkuAdmins = accounts.filter((account) => (
      account.role === "admin" &&
      !isMphlgSectionDepartment(account.department)
    )).length;
    const totalAdmins = accounts.filter((account) => account.role === "admin").length;
    const totalSupervisors = accounts.filter((account) => account.role === "supervisor").length;
    const mphlgAdmins = accounts.filter((account) => (
      account.role === "admin" &&
      isMphlgSectionDepartment(account.department)
    )).length;
    const superAdminAccounts = accounts.filter((account) => account.role === "superadmin").length;
    const activityDateKey = getActivityDateFilterKey(activityDateFilter);
    const recentActivities = getAccountActivities(accounts).filter((activity) => (
      !activityDateKey || getLocalDateKey(activity.timestamp) === activityDateKey
    ));
    const totalActivityPages = Math.max(1, Math.ceil(recentActivities.length / recentActivityPageSize));
    const currentActivityPage = Math.min(activityPage, totalActivityPages - 1);
    const visibleActivities = recentActivities.slice(
      currentActivityPage * recentActivityPageSize,
      (currentActivityPage + 1) * recentActivityPageSize
    );

    return {
      totalUsers,
      totalAdmins,
      dbkuAdmins,
      totalSupervisors,
      mphlgAdmins,
      superAdminAccounts,
      currentActivityPage,
      recentActivities,
      totalActivityPages,
      visibleActivities,
    };
  }, [accounts, summary.users, activityDateFilter, activityPage]);

  return (
    <AppShell role="superadmin">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-slate-950">{labels.dashboardTitle}</h1>
        <p className="mt-1 text-sm text-slate-600">{labels.dashboardDescription}</p>
      </div>

      <Alert message={error} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        <DashboardSectionCard
          icon="group"
          title={labels.userAccounts}
          tone="teal"
          items={[
            { icon: "group", label: labels.userRole, value: loading ? "-" : dashboard.totalUsers },
          ]}
        />
        <DashboardSectionCard
          icon="account_balance"
          title={labels.dbkuAccounts}
          tone="emerald"
          items={[
            { icon: "admin_panel_settings", label: labels.adminRole, value: loading ? "-" : dashboard.dbkuAdmins },
            { icon: "supervisor_account", label: labels.supervisorRole, value: loading ? "-" : dashboard.totalSupervisors },
          ]}
        />
        <DashboardSectionCard
          icon="account_balance"
          title={labels.mphlgAccounts}
          tone="blue"
          items={[
            { icon: "admin_panel_settings", label: labels.adminRole, value: loading ? "-" : dashboard.mphlgAdmins },
          ]}
        />
        <DashboardSectionCard
          icon="settings_account_box"
          title={labels.systemAccounts}
          tone="amber"
          items={[
            { icon: "shield_person", label: labels.superAdminRole, value: loading ? "-" : dashboard.superAdminAccounts },
          ]}
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="rounded-md border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="text-base font-semibold text-slate-950">{labels.recentActivity}</h2>
              <p className="mt-1 text-sm text-slate-500">{labels.latestFiveActivities}</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={activityDateFilter}
                onChange={(event) => {
                  setActivityDateFilter(event.target.value);
                  setActivityPage(0);
                }}
                aria-label={labels.activityDateFilter}
                title={labels.activityDateFilter}
                className="h-9 w-36 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
              />
              <button
                type="button"
                onClick={() => setActivityPage((current) => Math.max(current - 1, 0))}
                disabled={loading || dashboard.currentActivityPage === 0}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={labels.previous}
                title={labels.previous}
              >
                <span className="material-symbols-outlined text-[20px]">chevron_left</span>
              </button>
              <button
                type="button"
                onClick={() => setActivityPage((current) => Math.min(current + 1, dashboard.totalActivityPages - 1))}
                disabled={loading || dashboard.currentActivityPage >= dashboard.totalActivityPages - 1}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={labels.next}
                title={labels.next}
              >
                <span className="material-symbols-outlined text-[20px]">chevron_right</span>
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {loading ? (
              <div className="px-4 py-10 text-center text-slate-500">{labels.loadingAccounts}</div>
            ) : dashboard.visibleActivities.length === 0 ? (
              <div className="px-4 py-10 text-center text-slate-500">{labels.noRecentActivity}</div>
            ) : (
              dashboard.visibleActivities.map((activity) => {
                const account = activity.account;
                return (
                  <div key={activity.id} className="flex items-center justify-between gap-4 px-4 py-4">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-950">
                        {getAccountDisplayName(account)}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {activity.type === "login" ? labels.loggedInActivity : labels.createdActivity}
                      </p>
                      {activity.type === "login" && (
                        <p className="mt-1 text-xs font-medium text-slate-500 tabular-nums">
                          {labels.totalLoginTime}: {formatLoginSessionDuration(activity, currentTime)}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <RolePill account={account} labels={labels} />
                      <span className="w-40 whitespace-nowrap text-right !text-xs leading-5 text-slate-500 tabular-nums">
                        {formatCompactDateTime(activity.timestamp, labels, language)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="rounded-md border border-slate-200 bg-white">
          <div className="flex items-start gap-3 border-b border-slate-200 px-4 py-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-violet-100 text-violet-700">
              <span className="material-symbols-outlined text-[20px]">shield_person</span>
            </span>
            <div>
              <h2 className="text-base font-semibold text-slate-950">{labels.accessSummary}</h2>
              <p className="mt-1 text-sm text-slate-500">{labels.yourPermissions}</p>
            </div>
          </div>

          <div className="space-y-3 p-4">
            <AccessSummaryBlock icon="person" title={labels.yourRole}>
              <span className="inline-flex rounded-full bg-cyan-950 px-3 py-1 text-xs font-semibold text-white">
                {labels.superAdminRole}
              </span>
            </AccessSummaryBlock>
            <AccessSummaryBlock icon="dashboard" title={labels.dashboardAccess}>
              <p className="text-sm leading-6 text-slate-600">{labels.dashboardAccessDescription}</p>
            </AccessSummaryBlock>
            <AccessSummaryBlock icon="key" title={labels.managementAccess}>
              <p className="text-sm leading-6 text-slate-600">{labels.managementAccessDescription}</p>
            </AccessSummaryBlock>
            <AccessSummaryBlock icon="group" title={labels.userAccess}>
              <p className="text-sm leading-6 text-slate-600">{labels.userAccessDescription}</p>
            </AccessSummaryBlock>
            <AccessSummaryBlock icon="account_balance" title={labels.dbkuAccess}>
              <p className="text-sm leading-6 text-slate-600">{labels.dbkuAccessDescription}</p>
            </AccessSummaryBlock>
            <AccessSummaryBlock icon="admin_panel_settings" title={labels.mphlgAccess}>
              <p className="text-sm leading-6 text-slate-600">{labels.mphlgAccessDescription}</p>
            </AccessSummaryBlock>
            <AccessSummaryBlock icon="settings_account_box" title={labels.systemAccess}>
              <p className="text-sm leading-6 text-slate-600">{labels.systemAccessDescription}</p>
            </AccessSummaryBlock>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function SuperAdminAccountManagement({ view }) {
  const { language } = useLanguage();
  const labels = screenText[language] || screenText.en;
  const isDbkuAdminView = view === "admins";
  const isMphlgAdminView = view === "mphlg-admins";
  const isAdminView = isDbkuAdminView || isMphlgAdminView;
  const isSuperadminView = view === "superadmins";
  const isSupervisorView = view === "supervisors";
  const isStaffAccountView = isAdminView || isSuperadminView || isSupervisorView;
  const hasDepartmentField = isAdminView || isSupervisorView;
  const departmentOptions = isMphlgAdminView
    ? mphlgDepartments
    : isSupervisorView
      ? supervisorDepartments
      : adminDepartments;
  const [accounts, setAccounts] = useState([]);
  const [searchName, setSearchName] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editingAccount, setEditingAccount] = useState(null);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [pendingDeleteAccount, setPendingDeleteAccount] = useState(null);
  const [viewingAccount, setViewingAccount] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const importInputRef = useRef(null);

  const roleFilter =
    view === "users"
      ? "applicant"
      : isAdminView
        ? "admin"
        : isSuperadminView
          ? "superadmin"
          : isSupervisorView
            ? "supervisor"
            : "";
  const pageTitle =
    view === "users"
      ? labels.userTitle
      : isMphlgAdminView
        ? labels.mphlgAdminTitle
        : isDbkuAdminView
          ? labels.dbkuAdminTitle
          : isSuperadminView
            ? labels.superadminTitle
            : isSupervisorView
              ? labels.supervisorTitle
              : labels.adminTitle;
  const pageDescription =
    view === "users"
      ? labels.userDescription
      : isMphlgAdminView
        ? labels.mphlgAdminDescription
        : isDbkuAdminView
          ? labels.dbkuAdminDescription
          : isSuperadminView
            ? labels.superadminDescription
            : isSupervisorView
              ? labels.supervisorDescription
              : labels.adminDescription;
  const listTitle =
    view === "users"
      ? labels.userList
      : isMphlgAdminView
        ? labels.mphlgAdminList
        : isDbkuAdminView
          ? labels.dbkuAdminList
          : isSuperadminView
            ? labels.superadminList
            : isSupervisorView
              ? labels.supervisorList
              : labels.adminList;

  const loadAccounts = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const query = roleFilter ? `?role=${roleFilter}` : "";
      const data = await apiRequest(`/auth/accounts/${query}`);
      setAccounts(data.accounts || []);
    } catch (err) {
      setError(err.message || labels.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [roleFilter, labels.loadFailed]);

  useEffect(() => {
    const timerId = window.setTimeout(loadAccounts, 0);
    return () => window.clearTimeout(timerId);
  }, [loadAccounts]);

  const filteredAccounts = useMemo(() => {
    const nameNeedle = searchName.trim().toLowerCase();
    const phoneNeedle = normalizePhoneSearchValue(searchName);
    const selectedDepartment = departmentFilter.trim().toUpperCase();

    return accounts
      .filter((account) => {
        const accountDepartment = String(account.department || "").toUpperCase();
        const textMatch = [
          getAccountDisplayName(account),
          account.username,
          account.email,
          account.department,
          account.mykad_number,
          account.mobile_number,
          formatMobileNumber(account.mobile_number),
        ].some((value) => String(value || "").toLowerCase().includes(nameNeedle));
        const mobileMatch =
          Boolean(phoneNeedle) &&
          getPhoneSearchVariants(account.mobile_number).some((value) => value.includes(phoneNeedle));
        const nameMatch = !nameNeedle || textMatch || mobileMatch;
        const departmentMatch =
          !selectedDepartment ||
          accountDepartment === selectedDepartment;
        const agencyMatch =
          !isAdminView ||
          (isMphlgAdminView
            ? isMphlgSectionDepartment(accountDepartment)
            : !isMphlgSectionDepartment(accountDepartment));
        return nameMatch && departmentMatch && agencyMatch;
      })
      .sort(compareAccounts);
  }, [accounts, searchName, departmentFilter, isAdminView, isMphlgAdminView]);

  function openCreate() {
    setEditingAccount(null);
    setForm({
      ...emptyForm,
      role: isAdminView
        ? "admin"
        : isSuperadminView
          ? "superadmin"
          : isSupervisorView
            ? "supervisor"
            : "applicant",
      department: isMphlgAdminView ? "MPHLG" : "",
    });
    setAccountModalOpen(true);
    setError("");
    setSuccess("");
  }

  function openEdit(account) {
    setEditingAccount(account);
    setForm({
      username: account.username || "",
      full_name: normalizeNameValue(account.full_name || ""),
      email: account.email || "",
      department: account.department || "",
      mobile_number: cleanMobileNumberValue(account.mobile_number),
      role: account.role || "applicant",
      password: "",
      password2: "",
      is_active: account.is_active !== false,
    });
    setAccountModalOpen(true);
    setError("");
    setSuccess("");
  }

  function closeForm() {
    setAccountModalOpen(false);
    setEditingAccount(null);
    setForm(emptyForm);
  }

  function openView(account) {
    setViewingAccount(account);
    setError("");
    setSuccess("");
  }

  function closeView() {
    setViewingAccount(null);
  }

  async function saveAccount(event) {
    event.preventDefault();

    try {
      setSaving(true);
      setError("");
      setSuccess("");
      const payload = {
        ...form,
        full_name: normalizeNameValue(form.full_name),
        email: cleanEmailValue(form.email),
        department: isSuperadminView ? "" : form.department,
        mykad_number: form.username,
        mobile_number: cleanMobileNumberValue(form.mobile_number),
      };
      const path = editingAccount
        ? `/auth/accounts/${editingAccount.id}/`
        : "/auth/accounts/";
      const method = editingAccount ? "PATCH" : "POST";

      await apiRequest(path, {
        method,
        body: JSON.stringify(payload),
      });
      setSuccess(editingAccount ? labels.accountUpdated : labels.accountCreated);
      closeForm();
      loadAccounts();
    } catch (err) {
      setError(err.message || labels.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  function requestDeleteAccount(account) {
    setPendingDeleteAccount(account);
    setError("");
    setSuccess("");
  }

  function closeDeleteConfirm() {
    if (saving) return;
    setPendingDeleteAccount(null);
  }

  async function deleteAccount() {
    if (!pendingDeleteAccount) return;

    try {
      setSaving(true);
      setError("");
      setSuccess("");
      await apiRequest(`/auth/accounts/${pendingDeleteAccount.id}/`, { method: "DELETE" });
      setSuccess(labels.accountDeleted);
      setPendingDeleteAccount(null);
      loadAccounts();
    } catch (err) {
      setError(err.message || labels.deleteFailed);
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    const header = isStaffAccountView
      ? ["Full Name", "NRIC", "Email", "Mobile Number", "Department", "Role", "Password", "Confirm Password"]
      : ["Name", "IC Number", "Email", "Mobile Number", "Last Login"];
    const staffHeader = isSuperadminView
      ? ["Full Name", "NRIC", "Email", "Mobile Number", "Role", "Password", "Confirm Password"]
      : header;
    const rows = [
      staffHeader,
      ...filteredAccounts.map((account) => {
        const base = [
          getAccountDisplayName(account),
          formatCsvIdentifier(account.username),
          account.email || "",
        ];

        if (isStaffAccountView) {
          base.push(formatCsvIdentifier(formatMobileNumber(account.mobile_number)));
          if (hasDepartmentField) {
            base.push(account.department || "");
          }
        }

        if (isStaffAccountView) {
          return [
            ...base,
            getRoleLabel(account, labels),
            "",
            "",
          ];
        }

        return [
          ...base,
          formatCsvIdentifier(formatMobileNumber(account.mobile_number)),
          account.last_login ? formatDateTime(account.last_login, labels, language) : "",
        ];
      }),
    ];
    const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${view}-accounts.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importCsv(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setSaving(true);
      setError("");
      setSuccess("");
      const csv = await file.text();
      const rows = parseCsv(csv);
      const [headers, ...records] = rows;
      const normalizedHeaders = headers.map((header) => normalizeHeader(header));
      const missingHeaders = getMissingCsvHeaders(normalizedHeaders, view);

      if (missingHeaders.length > 0) {
        throw new Error(labels.csvMissingColumns.replace("{columns}", missingHeaders.join(", ")));
      }

      let imported = 0;

      for (const record of records) {
        if (!record.some(Boolean)) continue;
        const row = Object.fromEntries(
          normalizedHeaders.map((header, index) => [header, normalizeCsvCell(record[index])])
        );
        const password = row.password || row.temporary_password;
        const password2 = row.confirm_password || row.password2 || password;
        const importedUsername = cleanImportedIdentifier(
          row.nric || row.login_id || row.username || row.mykad_number
        );
        const importedMobile = cleanImportedPhone(row.mobile_number || row.phone || row.mobile);

        if (!password) {
          throw new Error(labels.csvMissingPassword);
        }

        if (password !== password2) {
          throw new Error(
            labels.csvPasswordMismatch.replace(
              "{name}",
              normalizeNameValue(row.full_name || row.name) || row.nric || row.username
            )
          );
        }

        await apiRequest("/auth/accounts/", {
          method: "POST",
          body: JSON.stringify({
            username: importedUsername,
            mykad_number: importedUsername,
            full_name: normalizeNameValue(row.name || row.full_name),
            email: cleanEmailValue(normalizeImportedEmail(row.email)),
            department: isSuperadminView
              ? ""
              : isMphlgAdminView
                ? normalizeMphlgDepartmentValue(row.department)
                : normalizeDepartmentValue(row.department),
            mobile_number: importedMobile,
            role: isSupervisorView
              ? "supervisor"
              : isSuperadminView
                ? "superadmin"
                : isMphlgAdminView
                  ? "admin"
                : normalizeImportedRole(row.role || roleFilter || "applicant"),
            password,
            password2,
            is_active: String(row.status || "active").toLowerCase() !== "inactive",
          }),
        });
        imported += 1;
      }

      setSuccess(labels.importSuccess.replace("{count}", imported));
      loadAccounts();
    } catch (err) {
      setError(err.message || labels.importFailed);
    } finally {
      setSaving(false);
      event.target.value = "";
    }
  }

  return (
    <AppShell role="superadmin">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">{pageTitle}</h1>
          <p className="mt-1 text-sm text-slate-600">{pageDescription}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isStaffAccountView && (
            <>
              <Button icon="person_add" onClick={openCreate}>{labels.addAccount}</Button>
              <Button icon="upload" variant="secondary" disabled={saving} onClick={() => importInputRef.current?.click()}>
                {labels.importCsv}
              </Button>
            </>
          )}
          <Button icon="download" className="bg-teal-700 hover:bg-teal-800" onClick={exportCsv}>
            {labels.exportCsv}
          </Button>
          {isStaffAccountView && (
            <input
              ref={importInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={importCsv}
            />
          )}
        </div>
      </div>

      <Alert message={error} />
      <Alert type="success" message={success} />

      <section className="mb-5 rounded-md border border-slate-200 bg-white p-4">
        <div className={`grid grid-cols-1 gap-3 ${
          hasDepartmentField
            ? "lg:grid-cols-[minmax(0,1fr)_minmax(240px,360px)_auto_auto]"
            : "lg:grid-cols-[minmax(0,1fr)_auto_auto]"
        }`}>
          <input
            value={searchName}
            onChange={(event) => setSearchName(event.target.value)}
            placeholder={
              isSupervisorView
                ? labels.searchSupervisor
                : isSuperadminView
                  ? labels.searchSuperadmin
                : isAdminView
                  ? labels.searchAdmin
                  : labels.searchUser
            }
            className="h-11 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
          />
          {hasDepartmentField && (
            <select
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
              className="h-11 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="">{labels.allDepartments}</option>
              {departmentOptions.map((department) => (
                <option key={department} value={department}>{department}</option>
              ))}
            </select>
          )}
          <Button icon="search" className="h-11 bg-cyan-950 hover:bg-cyan-900">{labels.filter}</Button>
          <Button
            variant="secondary"
            className="h-11"
            onClick={() => {
              setSearchName("");
              setDepartmentFilter("");
            }}
          >
            {labels.reset}
          </Button>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-950">{listTitle}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {filteredAccounts.length} {labels.accountFound}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className={`w-full table-fixed text-left text-sm ${isStaffAccountView ? (hasDepartmentField ? "min-w-[1350px]" : "min-w-[1240px]") : "min-w-[1080px]"}`}>
            <colgroup>
              {isStaffAccountView ? (
                <>
                  <col className="w-[170px]" />
                  <col className="w-[115px]" />
                  <col className="w-[245px]" />
                  <col className="w-[135px]" />
                  {hasDepartmentField && <col className="w-[105px]" />}
                  <col className="w-[120px]" />
                  <col className="w-[95px]" />
                  <col className="w-[170px]" />
                  <col className="w-[210px]" />
                </>
              ) : (
                <>
                  <col className="w-[250px]" />
                  <col className="w-[150px]" />
                  <col className="w-[260px]" />
                  <col className="w-[150px]" />
                  <col className="w-[170px]" />
                  <col className="w-[270px]" />
                </>
              )}
            </colgroup>
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="border-b border-slate-200 px-4 py-3">{labels.name}</th>
                <th className="border-b border-slate-200 px-4 py-3">{isStaffAccountView ? labels.nric : labels.loginId}</th>
                <th className="border-b border-slate-200 px-4 py-3">{labels.email}</th>
                {isStaffAccountView ? (
                  <>
                    <th className="border-b border-slate-200 px-4 py-3">{labels.mobileNumber}</th>
                    {hasDepartmentField && (
                      <th className="border-b border-slate-200 px-4 py-3">{labels.department}</th>
                    )}
                    <th className="border-b border-slate-200 px-4 py-3">{labels.role}</th>
                  </>
                ) : (
                  <th className="border-b border-slate-200 px-4 py-3">{labels.mobileNumber}</th>
                )}
                {isStaffAccountView && (
                  <th className="border-b border-slate-200 px-4 py-3">{labels.status}</th>
                )}
                <th className="border-b border-slate-200 px-4 py-3">{labels.lastLogin}</th>
                <th className="border-b border-slate-200 px-4 py-3">{labels.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={isStaffAccountView ? (hasDepartmentField ? 9 : 8) : 6} className="px-4 py-10 text-center text-slate-500">
                    {labels.loadingAccounts}
                  </td>
                </tr>
              ) : filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={isStaffAccountView ? (hasDepartmentField ? 9 : 8) : 6} className="px-4 py-10 text-center text-slate-500">
                    {labels.noAccounts}
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((account) => (
                  <tr key={account.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-slate-950">
                      <span className="block truncate">{getAccountDisplayName(account)}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <span className="block truncate">{account.username}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <span className="block truncate">{account.email || "-"}</span>
                    </td>
                    {isStaffAccountView && (
                      <>
                        <td className="px-4 py-3 text-slate-700">
                          <span className="block truncate">{formatMobileNumber(account.mobile_number)}</span>
                        </td>
                        {hasDepartmentField && (
                          <td className="px-4 py-3 text-slate-700">{account.department || "-"}</td>
                        )}
                      </>
                    )}
                    {isStaffAccountView ? (
                      <td className="px-4 py-3">
                        <RolePill account={account} labels={labels} />
                      </td>
                    ) : (
                      <td className="px-4 py-3 text-slate-700">
                        <span className="block truncate">{formatMobileNumber(account.mobile_number)}</span>
                      </td>
                    )}
                    {isStaffAccountView && (
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          account.is_active === false
                            ? "bg-red-50 text-red-700"
                            : "bg-emerald-50 text-emerald-700"
                        }`}>
                          {account.is_active === false ? labels.inactive : labels.active}
                        </span>
                      </td>
                    )}
                    <td className="px-4 py-3 text-slate-700">
                      <span className="block whitespace-nowrap !text-xs leading-5 text-slate-600">
                        {account.last_login ? formatCompactDateTime(account.last_login, labels, language) : "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-nowrap gap-2">
                        {view === "users" && (
                          <Button icon="visibility" variant="secondary" onClick={() => openView(account)}>
                            {labels.view}
                          </Button>
                        )}
                        {isStaffAccountView && (
                          <Button icon="edit" className="bg-blue-700 hover:bg-blue-800" onClick={() => openEdit(account)}>
                            {labels.edit}
                          </Button>
                        )}
                        <button
                          type="button"
                          onClick={() => requestDeleteAccount(account)}
                          className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-red-600 bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-700"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                          {labels.delete}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isStaffAccountView && accountModalOpen && (
        <AccountModal
          form={form}
          isEditing={Boolean(editingAccount)}
          saving={saving}
          labels={labels}
          departmentOptions={departmentOptions}
          roleOptions={getStaffRoleOptions(view, labels)}
          showDepartment={hasDepartmentField}
          onChange={(next) => setForm((current) => ({ ...current, ...next }))}
          onClose={closeForm}
          onSubmit={saveAccount}
        />
      )}

      {pendingDeleteAccount && (
        <DeleteConfirmModal
          account={pendingDeleteAccount}
          labels={labels}
          saving={saving}
          onCancel={closeDeleteConfirm}
          onConfirm={deleteAccount}
        />
      )}

      {viewingAccount && (
        <RegistrationInfoModal
          account={viewingAccount}
          labels={labels}
          language={language}
          onClose={closeView}
        />
      )}
    </AppShell>
  );
}

function DeleteConfirmModal({ account, labels, saving, onCancel, onConfirm }) {
  const accountName = getAccountDisplayName(account);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
      <div className="w-full max-w-md rounded-md bg-white shadow-2xl">
        <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-red-50 text-red-700">
            <span className="material-symbols-outlined text-[24px]">delete</span>
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-950">{labels.deleteTitle}</h2>
            <p className="mt-1 text-sm leading-5 text-slate-500">{labels.deleteMessage}</p>
          </div>
        </div>

        <div className="space-y-3 px-5 py-4">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {labels.name}
            </p>
            <p className="mt-1 break-words font-semibold text-slate-950">{accountName}</p>
            <p className="mt-1 break-words text-sm text-slate-500">{account.email || account.username}</p>
          </div>
          <p className="text-sm font-semibold text-red-700">{labels.deleteWarning}</p>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
            {labels.cancel}
          </Button>
          <Button
            type="button"
            icon="delete"
            onClick={onConfirm}
            disabled={saving}
            className="border-red-600 bg-red-600 text-white hover:bg-red-700"
          >
            {saving ? labels.deleting : labels.delete}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AccountModal({
  form,
  isEditing,
  saving,
  labels,
  departmentOptions,
  roleOptions,
  showDepartment,
  onChange,
  onClose,
  onSubmit,
}) {
  const inputClassName = "h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
      <form onSubmit={onSubmit} className="w-full max-w-2xl rounded-md bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-950">
            {isEditing ? labels.editTitle : labels.addTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
          <FormField label={labels.fullName} className="md:col-span-2">
            <input
              value={form.full_name}
              onChange={(event) => onChange({ full_name: uppercaseNameInput(event.target.value) })}
              placeholder={labels.enterFullName}
              className={inputClassName}
              required
            />
          </FormField>
          <FormField label={labels.nric}>
            <input
              value={form.username}
              onChange={(event) => onChange({ username: event.target.value })}
              placeholder={labels.enterNric}
              className={inputClassName}
              required
            />
          </FormField>
          <FormField label={labels.email}>
            <input
              type="text"
              inputMode="email"
              value={form.email}
              onChange={(event) => onChange({ email: event.target.value })}
              placeholder={labels.enterEmail}
              className={inputClassName}
            />
          </FormField>
          <FormField label={labels.mobileNumber}>
            <input
              type="tel"
              inputMode="tel"
              value={form.mobile_number}
              onChange={(event) => onChange({ mobile_number: event.target.value })}
              placeholder={labels.enterMobile}
              className={inputClassName}
            />
          </FormField>
          {showDepartment && (
            <FormField label={labels.department}>
              <select
                value={form.department}
                onChange={(event) => onChange({ department: event.target.value })}
                className={inputClassName}
                required
              >
                <option value="">{labels.selectDepartment}</option>
                {departmentOptions.map((department) => (
                  <option key={department} value={department}>{department}</option>
                ))}
              </select>
            </FormField>
          )}
          <FormField label={labels.role}>
            <select value={form.role} onChange={(event) => onChange({ role: event.target.value })} className={inputClassName}>
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </FormField>
          {showDepartment && <div className="hidden md:block" />}
          <FormField label={isEditing ? labels.newPassword : labels.password}>
            <input
              type="password"
              value={form.password}
              onChange={(event) => onChange({ password: event.target.value })}
              placeholder={labels.enterPassword}
              className={inputClassName}
              required={!isEditing}
            />
          </FormField>
          <FormField label={labels.confirmPassword}>
            <input
              type="password"
              value={form.password2}
              onChange={(event) => onChange({ password2: event.target.value })}
              placeholder={labels.confirmPasswordPlaceholder}
              className={inputClassName}
              required={!isEditing || Boolean(form.password)}
            />
          </FormField>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <Button type="button" variant="secondary" onClick={onClose}>{labels.cancel}</Button>
          <Button type="submit" disabled={saving}>{saving ? labels.saving : labels.save}</Button>
        </div>
      </form>
    </div>
  );
}

function RegistrationInfoModal({ account, labels, language, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
      <div className="w-full max-w-5xl rounded-md bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">{labels.registrationInfo}</h2>
            <p className="mt-1 text-sm text-slate-500">{getAccountDisplayName(account)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
            aria-label={labels.close}
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="max-h-[72vh] space-y-7 overflow-y-auto p-5">
          <RegistrationSection icon="person" title={labels.personalInformation}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <ReadonlyField label={labels.fullNameMyKad} required value={getAccountDisplayName(account)} />
              <ReadonlyField label={labels.gender} required value={formatGender(account.gender, language)} />
              <ReadonlyField label={labels.dateOfBirth} required value={formatDateOnly(account.date_of_birth, labels, language)} />
              <ReadonlyField label={labels.nationality} required value={account.nationality} />
              <ReadonlyField
                className="md:col-span-1"
                label={labels.mykadNumber}
                required
                hint={labels.enterWithoutDashes}
                value={account.mykad_number || account.username}
              />
            </div>
          </RegistrationSection>

          <RegistrationSection icon="contact_mail" title={labels.contactInformation}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <ReadonlyField label={labels.mobileNumber} required prefix="+60" value={stripMalaysiaDialCode(account.mobile_number)} />
              <ReadonlyField label={labels.emailAddress} required value={account.email} />
            </div>

            <div className="mt-5 border-t border-slate-100 pt-3">
              <h3 className="text-sm font-bold text-slate-700">{labels.address}</h3>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <ReadonlyField label={labels.addressLine1} required value={account.address_line1} />
              <ReadonlyField label={labels.addressLine2} required value={account.address_line2} />
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              <ReadonlyField label={labels.postcode} required value={account.postcode} />
              <ReadonlyField label={labels.state} required value={account.state} />
              <ReadonlyField label={labels.city} required value={account.city} />
            </div>
          </RegistrationSection>
        </div>

        <div className="flex justify-end border-t border-slate-200 px-5 py-4">
          <Button type="button" variant="secondary" onClick={onClose}>{labels.close}</Button>
        </div>
      </div>
    </div>
  );
}

function RegistrationSection({ icon, title, children }) {
  return (
    <section>
      <div className="mb-5 flex items-center gap-3">
        <span className="material-symbols-outlined text-[24px] text-emerald-700">{icon}</span>
        <h3 className="text-xl font-semibold text-slate-950">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function ReadonlyField({ label, value, prefix = "", hint = "", required = false, className = "" }) {
  return (
    <div className={className}>
      <p className="mb-1.5 text-sm font-semibold text-slate-950">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </p>
      <div className="flex min-h-11 overflow-hidden rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-700">
        {prefix && (
          <span className="inline-flex items-center border-r border-slate-200 bg-slate-100 px-3 text-slate-500">
            {prefix}
          </span>
        )}
        <div className="flex min-w-0 flex-1 items-center break-words px-3 py-2">
          {value || "-"}
        </div>
      </div>
      {hint && <p className="mt-1 text-xs font-semibold uppercase text-slate-400">{hint}</p>}
    </div>
  );
}

function DashboardSectionCard({ icon, title, tone, items }) {
  const tones = {
    blue: "bg-blue-50 text-blue-700",
    emerald: "bg-emerald-50 text-emerald-700",
    teal: "bg-teal-50 text-teal-700",
    rose: "bg-rose-50 text-rose-700",
    amber: "bg-amber-50 text-amber-700",
  };

  return (
    <section className="rounded-md border border-slate-200 bg-white">
      <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${tones[tone] || tones.emerald}`}>
          <span className="material-symbols-outlined text-[22px]">{icon}</span>
        </span>
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      </div>

      <div className="grid grid-cols-1 divide-y divide-slate-100">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="material-symbols-outlined text-[20px] text-slate-400">
                {item.icon}
              </span>
              <p className="truncate text-sm font-semibold text-slate-600">{item.label}</p>
            </div>
            <p className="text-2xl font-semibold text-slate-950">{item.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function AccessSummaryBlock({ icon, title, children }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-2 text-slate-950">
        <span className="material-symbols-outlined text-[18px] text-slate-500">{icon}</span>
        <p className="font-semibold">{title}</p>
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function FormField({ label, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function RolePill({ account, labels }) {
  const role = getRoleLabel(account, labels);
  const className = account.role === "applicant"
    ? "bg-blue-50 text-blue-700"
    : account.role === "staff"
      ? "bg-amber-50 text-amber-700"
      : account.role === "supervisor"
        ? "bg-violet-50 text-violet-700"
      : "bg-rose-50 text-rose-700";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
      {role}
    </span>
  );
}

function getStaffRoleOptions(view, labels) {
  if (view === "supervisors") {
    return [{ value: "supervisor", label: labels.supervisorRole }];
  }

  if (view === "superadmins") {
    return [{ value: "superadmin", label: labels.superAdminRole }];
  }

  return [
    { value: "admin", label: labels.adminRole },
  ];
}

function compareAccounts(first, second) {
  const firstSuperAdmin = first.role === "superadmin" ? 0 : 1;
  const secondSuperAdmin = second.role === "superadmin" ? 0 : 1;

  if (firstSuperAdmin !== secondSuperAdmin) {
    return firstSuperAdmin - secondSuperAdmin;
  }

  return getAccountDisplayName(first).localeCompare(getAccountDisplayName(second));
}

function getRoleLabel(account, labels = screenText.en) {
  if (account.role === "applicant") return labels.userRole;
  if (account.role === "staff") return labels.staffRole;
  if (account.role === "supervisor") return labels.supervisorRole;
  if (account.role === "superadmin") return labels.superAdminRole;
  return labels.adminRole;
}

function getAccountActivities(accounts) {
  return accounts
    .flatMap((account) => {
      const activities = [];
      const loginSessions = Array.isArray(account.login_sessions) ? account.login_sessions : [];

      if (loginSessions.length > 0) {
        loginSessions.forEach((session) => {
          if (!session.login_at) return;

          activities.push({
            id: `${account.id}-login-session-${session.id || session.login_at}`,
            account,
            timestamp: session.login_at,
            logoutAt: session.logout_at || "",
            durationSeconds: session.duration_seconds,
            type: "login",
          });
        });
      } else if (account.last_login) {
        activities.push({
          id: `${account.id}-login-${account.last_login}`,
          account,
          timestamp: account.last_login,
          logoutAt: "",
          durationSeconds: null,
          type: "login",
        });
      }

      if (account.date_joined) {
        activities.push({
          id: `${account.id}-created-${account.date_joined}`,
          account,
          timestamp: account.date_joined,
          type: "created",
        });
      }

      return activities;
    })
    .sort((first, second) => getTimestamp(second.timestamp) - getTimestamp(first.timestamp));
}

function getTimestamp(value) {
  const timestamp = new Date(value || 0).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function getActivityDateFilterKey(value) {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";

  const [, yearText, monthText, dayText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return "";
  }

  return value;
}

function getLocalDateKey(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return "";

  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateTime(value, labels = screenText.en, language = "en") {
  if (!value) return labels.never;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return labels.never;
  const months = language === "ms"
    ? ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ogos", "Sep", "Okt", "Nov", "Dis"]
    : ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  const hour24 = date.getHours();
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour = String(hour24 % 12 || 12).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${day} ${month} ${year}, ${hour}:${minute} ${period}`;
}

function formatCompactDateTime(value, labels = screenText.en, language = "en") {
  if (!value) return labels.never;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return labels.never;
  const months = language === "ms"
    ? ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ogos", "Sep", "Okt", "Nov", "Dis"]
    : ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  const hour24 = date.getHours();
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour = String(hour24 % 12 || 12).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${day} ${month} ${year}, ${hour}:${minute} ${period}`;
}

function formatLoginSessionDuration(activity, currentTimestamp = Date.now()) {
  const storedDuration = Number(activity?.durationSeconds);

  if (Number.isFinite(storedDuration) && storedDuration >= 0) {
    return formatDurationSeconds(storedDuration);
  }

  const startTimestamp = getTimestamp(activity?.timestamp);
  if (!startTimestamp) return formatDurationSeconds(0);

  const logoutTimestamp = getTimestamp(activity?.logoutAt);
  const endTimestamp = logoutTimestamp || currentTimestamp;
  const elapsedSeconds = Math.max(0, Math.floor((endTimestamp - startTimestamp) / 1000));

  return formatDurationSeconds(elapsedSeconds);
}

function formatDurationSeconds(value) {
  const totalSeconds = Math.max(0, Math.floor(Number(value) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

function formatDateOnly(value, labels = screenText.en, language = "en") {
  if (!value) return labels.never;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return labels.never;
  const months = language === "ms"
    ? ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ogos", "Sep", "Okt", "Nov", "Dis"]
    : ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function formatGender(value, language = "en") {
  const gender = String(value || "").toLowerCase();
  if (gender === "male") return language === "ms" ? "Lelaki" : "Male";
  if (gender === "female") return language === "ms" ? "Perempuan" : "Female";
  return value || "";
}

function stripMalaysiaDialCode(value) {
  return cleanMobileNumberValue(value).replace(/^\+?60/, "");
}

function formatMobileNumber(value) {
  const raw = cleanMobileNumberValue(value);
  if (!raw) return "-";
  if (raw.startsWith("+")) return raw;
  if (raw.startsWith("60")) return `+${raw}`;
  if (raw.startsWith("0")) return raw;
  return `0${raw}`;
}

function cleanMobileNumberValue(value) {
  const text = String(value || "").trim();
  return text === "-" ? "" : text;
}

function cleanEmailValue(value) {
  const text = String(value || "").trim();
  return text === "-" ? "" : text;
}

function uppercaseNameInput(value) {
  return String(value || "").toUpperCase();
}

function normalizeNameValue(value) {
  return uppercaseNameInput(value).trim().replace(/\s+/g, " ");
}

function getAccountDisplayName(account) {
  return normalizeNameValue(account?.full_name || account?.username || "");
}

function normalizePhoneSearchValue(value) {
  return String(value || "").replace(/\D/g, "");
}

function getPhoneSearchVariants(value) {
  const digits = normalizePhoneSearchValue(value);
  if (!digits) return [];

  const localDigits = digits.startsWith("60") ? digits.slice(2) : digits;
  const localWithZero = localDigits.startsWith("0") ? localDigits : `0${localDigits}`;
  const localWithoutZero = localDigits.startsWith("0") ? localDigits.slice(1) : localDigits;
  const countryDigits = `60${localWithoutZero}`;

  return [digits, localDigits, localWithZero, localWithoutZero, countryDigits];
}

function formatCsvIdentifier(value) {
  const text = String(value || "").trim();
  if (!text || text === "-") return "";
  return `="${text}"`;
}

function normalizeCsvCell(value) {
  const text = String(value || "").trim();
  const formulaMatch = text.match(/^="?([^"]*)"?$/);
  if (formulaMatch && text.startsWith("=")) {
    return formulaMatch[1].trim();
  }
  return text;
}

function cleanImportedIdentifier(value) {
  const text = normalizeCsvCell(value).replace(/\s+/g, "");
  const digits = text.replace(/\D/g, "");
  return digits.length === 12 ? digits : text;
}

function normalizeImportedEmail(value) {
  return normalizeCsvCell(value).trim().toLowerCase();
}

function cleanImportedPhone(value) {
  const phone = cleanImportedIdentifier(value);
  if (!phone || phone === "-") return "";
  if (phone.startsWith("+60")) return phone.slice(3);
  if (phone.startsWith("60")) return phone.slice(2);
  if (phone.startsWith("0")) return phone.slice(1);
  return phone;
}

function escapeCsv(value) {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function parseCsv(csv) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field.trim());
    rows.push(row);
  }

  return rows.filter((item) => item.some(Boolean));
}

function normalizeHeader(value) {
  const header = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return csvHeaderAliases[header] || header;
}

function getMissingCsvHeaders(headers, view) {
  if (!["admins", "mphlg-admins", "superadmins", "supervisors"].includes(view)) {
    return [];
  }

  const requiredHeaders =
    view === "superadmins" || view === "mphlg-admins"
      ? adminCsvHeaders.filter((header) => header !== "department")
      : adminCsvHeaders;

  return requiredHeaders
    .filter((header) => !headers.includes(header))
    .map((header) => toCsvHeaderLabel(header));
}

function toCsvHeaderLabel(header) {
  const labels = {
    full_name: "Full Name",
    nric: "NRIC",
    email: "Email",
    mobile_number: "Mobile Number",
    department: "Department",
    role: "Role",
    password: "Password",
    confirm_password: "Confirm Password",
  };

  return labels[header] || header;
}

function normalizeImportedRole(value) {
  const role = String(value || "").trim().toLowerCase();
  if (role === "user") return "applicant";
  if (role === "staff") return "staff";
  if (role === "admin") return "admin";
  if (role === "supervisor") return "supervisor";
  if (role === "superadmin") return "superadmin";
  return "applicant";
}

function normalizeDepartmentValue(value) {
  return String(value || "").trim().toUpperCase();
}

function isMphlgSectionDepartment(value) {
  return mphlgDepartments.includes(normalizeDepartmentValue(value));
}

function normalizeMphlgDepartmentValue(value) {
  const department = normalizeDepartmentValue(value);
  return isMphlgSectionDepartment(department) ? department : "MPHLG";
}

export default SuperAdminDashboard;
