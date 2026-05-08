import { useState } from "react";
import AdminDashboardLayout from "../../layout/AdminDashboardLayout";
import UserDashboardLayout from "../../layout/UserDashboardLayout";
import { useNotifications } from "../../context/NotificationContext";
import {
  Button,
  PageHeader,
  Panel,
  StatCard,
  StatusPill,
} from "../../components/ui/SystemUI";
import { isAdminUser, getStoredUser } from "../../services/api";

function NotificationsPage() {
  const { notifications, markAsRead, markAllAsRead, unreadCount } = useNotifications();
  const [filter, setFilter] = useState("all");
  const Layout = isAdminUser(getStoredUser()) ? AdminDashboardLayout : UserDashboardLayout;

  const filtered = notifications.filter((item) => {
    if (filter === "all") return true;
    if (filter === "unread") return !item.read;
    return item.category === filter;
  });

  return (
    <Layout>
      <PageHeader
        eyebrow="Notification Center"
        title="Notifications"
        description="System alerts for application progress, payment, SLA, license, and enforcement events."
        actions={<Button onClick={markAllAsRead} icon="done_all">Mark All Read</Button>}
      />

      <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard label="Total" value={notifications.length} icon="notifications" />
        <StatCard label="Unread" value={unreadCount} icon="mark_email_unread" tone="amber" />
        <StatCard label="Payment" value={notifications.filter((n) => n.category === "payment").length} icon="payments" tone="blue" />
        <StatCard label="Enforcement" value={notifications.filter((n) => n.category === "enforcement").length} icon="qr_code_scanner" />
      </section>

      <Panel title="Filter" className="mb-6">
        <div className="flex flex-wrap gap-2">
          {["all", "unread", "system", "payment", "enforcement"].map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={`rounded-md border px-3 py-2 text-xs font-semibold capitalize ${
                filter === item
                  ? "border-emerald-700 bg-emerald-700 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Inbox" description={`${filtered.length} notification(s)`}>
        <div className="divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No notifications.</p>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => markAsRead(item.id)}
                className={`block w-full px-1 py-4 text-left hover:bg-slate-50 ${
                  !item.read ? "bg-emerald-50/40" : ""
                }`}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-950">{item.title}</p>
                      {!item.read && <StatusPill value="New" />}
                    </div>
                    <p className="mt-1 text-sm leading-5 text-slate-600">{item.message}</p>
                  </div>
                  <p className="text-xs text-slate-400">{item.time}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </Panel>
    </Layout>
  );
}

export default NotificationsPage;
