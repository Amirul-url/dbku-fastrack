import { useState } from "react";
import DashboardLayout from "../../layout/DashboardLayout";
import { useNotifications } from "../../context/NotificationContext";

function NotificationsPage() {
  const { notifications, markAsRead, markAllAsRead, unreadCount } =
    useNotifications();

  const [filter, setFilter] = useState("all");

  const filteredNotifications = notifications.filter((item) => {
    if (filter === "all") return true;
    if (filter === "unread") return !item.read;
    return item.category === filter;
  });

  return (
    <DashboardLayout>
      {/* HEADER */}
      <div className="mb-5 border-l-4 border-[#006d32] pl-4">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide font-semibold text-[#006d32] mb-1">
              Notification Center
            </p>
            <h1 className="text-2xl font-bold text-[#1a1c1c]">
              Notifications
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Manage system alerts, payment reminders, SLA warnings, and
              enforcement updates.
            </p>
          </div>

          <button
            type="button"
            onClick={markAllAsRead}
            className="px-4 py-2 bg-[#006d32] text-white rounded text-sm font-semibold hover:bg-[#005224]"
          >
            Mark All as Read
          </button>
        </div>
      </div>

      {/* STATS */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Notifications" value={notifications.length} />
        <StatCard label="Unread" value={unreadCount} />
        <StatCard
          label="System Alerts"
          value={notifications.filter((n) => n.category === "system").length}
        />
        <StatCard
          label="Enforcement"
          value={
            notifications.filter((n) => n.category === "enforcement").length
          }
        />
      </section>

      {/* FILTER */}
      <section className="bg-white border border-slate-200 rounded-md p-4 mb-6">
        <div className="flex flex-wrap gap-2">
          {[
            { key: "all", label: "All" },
            { key: "unread", label: "Unread" },
            { key: "system", label: "System" },
            { key: "payment", label: "Payment" },
            { key: "enforcement", label: "Enforcement" },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={`px-3 py-1.5 rounded text-xs font-semibold border ${
                filter === item.key
                  ? "bg-[#006d32] text-white border-[#006d32]"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      {/* LIST */}
      <section className="bg-white border border-slate-200 rounded-md overflow-hidden">
        {filteredNotifications.length === 0 ? (
          <div className="p-10 text-center">
            <span className="material-symbols-outlined text-5xl text-slate-300 mb-3">
              notifications_off
            </span>
            <p className="font-semibold text-slate-600">No notifications</p>
            <p className="text-sm text-slate-400 mt-1">
              There are no notifications for this filter.
            </p>
          </div>
        ) : (
          filteredNotifications.map((item) => (
            <NotificationRow
              key={item.id}
              item={item}
              onRead={() => markAsRead(item.id)}
            />
          ))
        )}
      </section>
    </DashboardLayout>
  );
}

/* COMPONENTS */

function StatCard({ label, value }) {
  return (
    <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
      <div className="h-1 bg-[#006d32]" />
      <div className="p-4">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-2xl font-bold text-[#1a1c1c] mt-1">{value}</p>
      </div>
    </div>
  );
}

function NotificationRow({ item, onRead }) {
  let icon = "notifications";
  let color = "bg-slate-100 text-slate-600";

  if (item.type === "success") {
    icon = "check_circle";
    color = "bg-green-50 text-green-700";
  }

  if (item.type === "warning") {
    icon = "warning";
    color = "bg-yellow-50 text-yellow-700";
  }

  if (item.type === "error") {
    icon = "error";
    color = "bg-red-50 text-red-700";
  }

  return (
    <div
      className={`flex items-start gap-4 px-5 py-4 border-b border-slate-100 hover:bg-[#fafafa] ${
        !item.read ? "bg-green-50/30" : ""
      }`}
    >
      {/* ICON */}
      <div
        className={`w-10 h-10 rounded flex items-center justify-center shrink-0 ${color}`}
      >
        <span className="material-symbols-outlined text-[20px]">
          {icon}
        </span>
      </div>

      {/* CONTENT */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-slate-900">
                {item.title}
              </p>

              {!item.read && (
                <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded">
                  NEW
                </span>
              )}
            </div>

            <p className="text-sm text-slate-500 mt-1 leading-relaxed">
              {item.message}
            </p>
          </div>

          <span className="text-xs text-slate-400 shrink-0">
            {item.time}
          </span>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">
            {item.category}
          </span>

          {!item.read && (
            <button
              type="button"
              onClick={onRead}
              className="text-xs text-[#006d32] font-semibold hover:underline"
            >
              Mark as read
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default NotificationsPage;