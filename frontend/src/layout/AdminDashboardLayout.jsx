import AppShell from "./AppShell";

function AdminDashboardLayout({ children }) {
  return <AppShell role="admin">{children}</AppShell>;
}

export default AdminDashboardLayout;
