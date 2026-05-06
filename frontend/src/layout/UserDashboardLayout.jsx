import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useNotifications } from "../context/NotificationContext";
import logo from "../assets/logo-dbku.png";

const applicantMenuGroups = [
  {
    title: "Overview",
    items: [
      {
        label: "My Dashboard",
        path: "/user/dashboard",
        icon: "dashboard",
      },
    ],
  },
  {
    title: "Application",
    items: [
      {
        label: "My Applications",
        path: "/applications",
        icon: "description",
        match: "/applications",
      },
    ],
  },
];

function UserDashboardLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();

  const { notifications, unreadCount, markAsRead, markAllAsRead } =
    useNotifications();

  const [currentDateTime, setCurrentDateTime] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);

  const storedUser = localStorage.getItem("fastrack_user");
  const user = storedUser ? JSON.parse(storedUser) : null;

  useEffect(() => {
    function updateDateTime() {
      const now = new Date();

      const formatted = now.toLocaleString("en-GB", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });

      setCurrentDateTime(formatted);
    }

    updateDateTime();
    const timer = setInterval(updateDateTime, 60000);

    return () => clearInterval(timer);
  }, []);

  function closeSidebar() {
    setIsSidebarOpen(false);
  }

  function closeNotifications() {
    setIsNotificationOpen(false);
  }

  function handleLogout() {
    localStorage.removeItem("fastrack_access_token");
    localStorage.removeItem("fastrack_refresh_token");
    localStorage.removeItem("fastrack_user");
    localStorage.removeItem("fastrack_remember_me");

    closeSidebar();
    navigate("/login/malaysian");
  }

  return (
    <div className="min-h-screen bg-[#f5f7f6] text-[#1a1c1c]">
      {isSidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar overlay"
          onClick={closeSidebar}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        />
      )}

      {isNotificationOpen && (
        <button
          type="button"
          aria-label="Close notifications"
          onClick={closeNotifications}
          className="fixed inset-0 z-20 cursor-default"
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-50 flex h-full w-[270px] flex-col border-r border-slate-200 bg-white transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
      >
        <div className="flex h-[68px] items-center justify-between border-b border-slate-200 px-5">
          <Link
            to="/user/dashboard"
            onClick={closeSidebar}
            className="flex min-w-0 items-center gap-3"
          >
            <img
              src={logo}
              alt="DBKU Logo"
              className="h-9 w-auto shrink-0 object-contain"
            />

            <div className="min-w-0">
              <p className="text-sm font-bold leading-tight text-[#1a1c1c]">
                DBKU
              </p>
              <p className="text-xs leading-tight text-slate-500">
                fasTrack Portal
              </p>
            </div>
          </Link>

          <button
            type="button"
            onClick={closeSidebar}
            className="flex h-8 w-8 items-center justify-center rounded hover:bg-slate-100 lg:hidden"
            aria-label="Close sidebar"
          >
            <span className="material-symbols-outlined text-[20px] text-slate-500">
              close
            </span>
          </button>
        </div>

        <div className="border-b border-slate-200 bg-[#f8faf9] px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Applicant Portal
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Siting Application Submission
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {applicantMenuGroups.map((group) => (
            <MenuGroup key={group.title} title={group.title}>
              {group.items.map((item) => (
                <MenuItem
                  key={item.path}
                  item={item}
                  active={isActive(location.pathname, item)}
                  onClick={closeSidebar}
                />
              ))}
            </MenuGroup>
          ))}
        </nav>

        <div className="border-t border-slate-200 p-3">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded px-3 py-2.5 text-sm text-red-600 hover:bg-red-50"
          >
            <span className="material-symbols-outlined text-[20px]">
              logout
            </span>
            Logout
          </button>
        </div>
      </aside>

      <header className="fixed left-0 right-0 top-0 z-30 flex h-[64px] items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6 lg:left-[270px]">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded hover:bg-slate-100 lg:hidden"
            aria-label="Open sidebar"
          >
            <span className="material-symbols-outlined text-slate-700">
              menu
            </span>
          </button>

          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-400">
              fasTrack Applicant Portal
            </p>
            <p className="truncate text-sm font-bold text-[#1a1c1c]">
              My Siting Applications
            </p>
          </div>
        </div>

        <div className="relative z-30 flex items-center gap-3">
          <p className="hidden text-xs text-slate-500 md:block">
            {currentDateTime}
          </p>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsNotificationOpen((value) => !value)}
              className="relative flex h-9 w-9 items-center justify-center rounded hover:bg-slate-100"
              aria-label="Notifications"
            >
              <span className="material-symbols-outlined text-[21px] text-slate-600">
                notifications
              </span>

              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-red-600 px-1 text-[10px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </button>

            {isNotificationOpen && (
              <NotificationDropdown
                notifications={notifications}
                unreadCount={unreadCount}
                markAsRead={markAsRead}
                markAllAsRead={markAllAsRead}
                closeNotifications={closeNotifications}
              />
            )}
          </div>

          <div className="hidden items-center gap-3 border-l border-slate-200 pl-3 sm:flex">
            <div className="text-right">
              <p className="text-sm font-semibold leading-tight">
                {user?.full_name || user?.username || "Applicant"}
              </p>
              <p className="text-xs leading-tight text-[#006d32]">
                Applicant
              </p>
            </div>

            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-[#e6f4ea]">
              <span className="material-symbols-outlined text-[20px] text-[#006d32]">
                person
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="min-h-screen pt-[64px] lg:ml-[270px]">
        <div className="p-4 sm:p-6">{children}</div>
      </main>
    </div>
  );
}

function isActive(pathname, item) {
  if (item.match) {
    return pathname.startsWith(item.match);
  }

  return pathname === item.path;
}

function MenuGroup({ title, children }) {
  return (
    <div className="mb-5">
      <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </p>

      <div className="space-y-1">{children}</div>
    </div>
  );
}

function MenuItem({ item, active, onClick }) {
  return (
    <Link
      to={item.path}
      onClick={onClick}
      className={`flex items-center justify-between gap-3 rounded px-3 py-2.5 text-sm transition-colors ${
        active
          ? "bg-[#e6f4ea] font-semibold text-[#006d32]"
          : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="material-symbols-outlined shrink-0 text-[20px]">
          {item.icon}
        </span>
        <span className="truncate">{item.label}</span>
      </span>
    </Link>
  );
}

function NotificationDropdown({
  notifications,
  unreadCount,
  markAsRead,
  markAllAsRead,
  closeNotifications,
}) {
  return (
    <div className="absolute right-0 top-11 z-50 w-[320px] overflow-hidden rounded-md border border-slate-200 bg-white sm:w-[380px]">
      <div className="flex items-center justify-between border-b border-t-4 border-slate-200 border-t-[#006d32] px-4 py-3">
        <div>
          <p className="text-sm font-bold text-[#1a1c1c]">Notifications</p>
          <p className="text-xs text-slate-500">Latest fasTrack updates</p>
        </div>

        <span className="rounded border border-red-100 bg-red-50 px-2 py-1 text-xs font-bold text-red-600">
          {unreadCount} New
        </span>
      </div>

      <div className="max-h-[340px] overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-400">
            No notifications
          </div>
        ) : (
          notifications.slice(0, 5).map((item) => (
            <NotificationItem
              key={item.id}
              item={item}
              onRead={() => markAsRead(item.id)}
            />
          ))
        )}
      </div>

      <div className="flex items-center justify-between border-t border-slate-200 bg-[#f8faf9] px-4 py-3">
        <button
          type="button"
          onClick={markAllAsRead}
          className="text-xs font-semibold text-slate-500 hover:text-slate-700"
        >
          Mark all as read
        </button>

        <Link
          to="/notifications"
          onClick={closeNotifications}
          className="text-xs font-semibold text-[#006d32] hover:underline"
        >
          View all
        </Link>
      </div>
    </div>
  );
}

function NotificationItem({ item, onRead }) {
  return (
    <button
      type="button"
      onClick={onRead}
      className={`w-full border-b border-slate-100 px-4 py-3 text-left hover:bg-[#fafafa] ${
        !item.read ? "bg-green-50/30" : "bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{item.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {item.message}
          </p>
          <p className="mt-2 text-[10px] text-slate-400">{item.time}</p>
        </div>

        {!item.read && (
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#006d32]" />
        )}
      </div>
    </button>
  );
}

export default UserDashboardLayout;