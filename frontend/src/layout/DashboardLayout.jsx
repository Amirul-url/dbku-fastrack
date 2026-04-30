import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useNotifications } from "../context/NotificationContext";
import logo from "../assets/logo-dbku.png";

const menuGroups = [
  {
    title: "Overview",
    items: [
      {
        label: "Home",
        path: "/home",
        icon: "home",
      },
      {
        label: "Dashboard",
        path: "/dashboard/admin",
        icon: "dashboard",
      },
    ],
  },
  {
    title: "Application Flow",
    items: [
      {
        label: "Applications",
        path: "/applications",
        icon: "description",
        match: "/applications",
      },
      {
        label: "Auto Screening",
        path: "/auto-screening",
        icon: "fact_check",
      },
      {
        label: "Technical Review",
        path: "/technical-review",
        icon: "rule",
      },
      {
        label: "Approval",
        path: "/approval",
        icon: "approval_delegation",
      },
      {
        label: "Payment",
        path: "/payment",
        icon: "payments",
      },
      {
        label: "License QR",
        path: "/license-qr",
        icon: "qr_code_2",
      },
    ],
  },
  {
    title: "Enforcement & Monitoring",
    items: [
      {
        label: "Enforcement",
        path: "/enforcement",
        icon: "qr_code_scanner",
      },
      {
        label: "Reports",
        path: "/reports",
        icon: "bar_chart",
      },
      {
        label: "Notifications",
        path: "/notifications",
        icon: "notifications",
      },
    ],
  },
];

function DashboardLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();

  const { notifications, unreadCount, markAsRead, markAllAsRead } =
    useNotifications();

  const [currentDateTime, setCurrentDateTime] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);

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
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
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
        className={`fixed left-0 top-0 h-full w-[270px] bg-white border-r border-slate-200 z-50 flex flex-col transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
      >
        <div className="h-[68px] px-5 flex items-center justify-between border-b border-slate-200">
          <Link
            to="/dashboard/admin"
            onClick={closeSidebar}
            className="flex items-center gap-3 min-w-0"
          >
            <img
              src={logo}
              alt="DBKU Logo"
              className="h-9 w-auto object-contain shrink-0"
            />

            <div className="min-w-0">
              <p className="text-sm font-bold text-[#1a1c1c] leading-tight">
                DBKU
              </p>
              <p className="text-xs text-slate-500 leading-tight">
                fasTrack System
              </p>
            </div>
          </Link>

          <button
            type="button"
            onClick={closeSidebar}
            className="lg:hidden w-8 h-8 rounded hover:bg-slate-100 flex items-center justify-center"
            aria-label="Close sidebar"
          >
            <span className="material-symbols-outlined text-slate-500 text-[20px]">
              close
            </span>
          </button>
        </div>

        <div className="px-4 py-3 border-b border-slate-200 bg-[#f8faf9]">
          <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-400">
            Digital Advertisement License
          </p>
          <p className="text-xs text-slate-600 mt-1">
            MPHLG Approval Workflow
          </p>
        </div>

        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          {menuGroups.map((group) => (
            <MenuGroup key={group.title} title={group.title}>
              {group.items.map((item) => (
                <MenuItem
                  key={item.path}
                  item={item}
                  active={isActive(location.pathname, item)}
                  onClick={closeSidebar}
                  unreadCount={
                    item.path === "/notifications" ? unreadCount : null
                  }
                />
              ))}
            </MenuGroup>
          ))}
        </nav>

        <div className="p-3 border-t border-slate-200">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded"
          >
            <span className="material-symbols-outlined text-[20px]">
              logout
            </span>
            Logout
          </button>
        </div>
      </aside>

      <header className="fixed top-0 left-0 lg:left-[270px] right-0 h-[64px] bg-white border-b border-slate-200 z-30 flex items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            className="lg:hidden w-9 h-9 rounded hover:bg-slate-100 flex items-center justify-center shrink-0"
            aria-label="Open sidebar"
          >
            <span className="material-symbols-outlined text-slate-700">
              menu
            </span>
          </button>

          <div className="min-w-0">
            <p className="text-xs text-slate-400 font-semibold">
              fasTrack Portal
            </p>
            <p className="text-sm font-bold text-[#1a1c1c] truncate">
              Advertisement License Management
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 relative z-30">
          <p className="hidden md:block text-xs text-slate-500">
            {currentDateTime}
          </p>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsNotificationOpen((value) => !value)}
              className="relative w-9 h-9 rounded hover:bg-slate-100 flex items-center justify-center"
              aria-label="Notifications"
            >
              <span className="material-symbols-outlined text-slate-600 text-[21px]">
                notifications
              </span>

              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
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

          <div className="hidden sm:flex items-center gap-3 pl-3 border-l border-slate-200">
            <div className="text-right">
              <p className="text-sm font-semibold leading-tight">
                Administrator
              </p>
              <p className="text-xs text-[#006d32] leading-tight">
                DBKU Officer
              </p>
            </div>

            <div className="w-9 h-9 bg-[#e6f4ea] rounded flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[#006d32] text-[20px]">
                person
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="lg:ml-[270px] pt-[64px] min-h-screen">
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
      <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-400 px-2 mb-2">
        {title}
      </p>

      <div className="space-y-1">{children}</div>
    </div>
  );
}

function MenuItem({ item, active, onClick, unreadCount }) {
  return (
    <Link
      to={item.path}
      onClick={onClick}
      className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded text-sm transition-colors ${
        active
          ? "bg-[#e6f4ea] text-[#006d32] font-semibold"
          : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      <span className="flex items-center gap-3 min-w-0">
        <span className="material-symbols-outlined text-[20px] shrink-0">
          {item.icon}
        </span>
        <span className="truncate">{item.label}</span>
      </span>

      {unreadCount > 0 && (
        <span className="min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
          {unreadCount}
        </span>
      )}
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
    <div className="absolute right-0 top-11 w-[320px] sm:w-[380px] bg-white border border-slate-200 rounded-md overflow-hidden z-50">
      <div className="border-t-4 border-[#006d32] px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-[#1a1c1c]">Notifications</p>
          <p className="text-xs text-slate-500">Latest fasTrack updates</p>
        </div>

        <span className="px-2 py-1 bg-red-50 text-red-600 border border-red-100 text-xs font-bold rounded">
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

      <div className="px-4 py-3 border-t border-slate-200 bg-[#f8faf9] flex items-center justify-between">
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
      className={`w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-[#fafafa] ${
        !item.read ? "bg-green-50/30" : "bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{item.title}</p>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            {item.message}
          </p>
          <p className="text-[10px] text-slate-400 mt-2">{item.time}</p>
        </div>

        {!item.read && (
          <span className="w-2 h-2 rounded-full bg-[#006d32] shrink-0 mt-1.5" />
        )}
      </div>
    </button>
  );
}

export default DashboardLayout;