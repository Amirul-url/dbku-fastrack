import {
  Navigate,
  BrowserRouter as Router,
  Routes,
  Route,
} from "react-router-dom";

/* AUTH */
import LoginMalaysian from "./pages/auth/LoginMalaysian";
import LoginNonMalaysian from "./pages/auth/LoginNonMalaysian";
import RegisterMalaysian from "./pages/auth/RegisterMalaysian";
import RegisterNonMalaysian from "./pages/auth/RegisterNonMalaysian";

/* HOME */
import HomePage from "./pages/home/HomePage";

/* DASHBOARD */
import UserDashboard from "./pages/dashboard/UserDashboard";
import AdminDashboard from "./pages/dashboard/AdminDashboard";

/* APPLICATION */
import UserApplicationsPage from "./pages/applications/UserApplicationsPage";
import ApplicationsPage from "./pages/applications/ApplicationsPage";
import ApplicationDetailPage from "./pages/applications/ApplicationDetailPage";
import SittingApplicationPage from "./pages/applications/steps/SittingApplicationPage";

/* OTHER */
import ReportsPage from "./pages/reports/ReportsPage";
import NotificationsPage from "./pages/notifications/NotificationsPage";

/* ===== AUTH HELPERS ===== */
function getUser() {
  try {
    return JSON.parse(localStorage.getItem("fastrack_user"));
  } catch {
    return null;
  }
}

function isAuthenticated() {
  return !!localStorage.getItem("fastrack_access_token");
}

function isAdmin(user) {
  const role = String(user?.role || "").toLowerCase();
  return role === "admin" || role === "staff";
}

function isUser(user) {
  const role = String(user?.role || "").toLowerCase();
  return role === "user" || role === "applicant";
}

/* ===== PROTECTED ROUTES ===== */
function PrivateRoute({ children }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login/malaysian" replace />;
  }
  return children;
}

function AdminRoute({ children }) {
  const user = getUser();

  if (!isAuthenticated()) {
    return <Navigate to="/login/malaysian" replace />;
  }

  if (!isAdmin(user)) {
    return <Navigate to="/user/dashboard" replace />;
  }

  return children;
}

function UserRoute({ children }) {
  const user = getUser();

  if (!isAuthenticated()) {
    return <Navigate to="/login/malaysian" replace />;
  }

  if (!isUser(user)) {
    return <Navigate to="/dashboard/admin" replace />;
  }

  return children;
}

function App() {
  return (
    <Router>
      <Routes>
        {/* ===== AUTH ===== */}
        <Route path="/" element={<LoginMalaysian />} />
        <Route path="/login/malaysian" element={<LoginMalaysian />} />
        <Route path="/login/non-malaysian" element={<LoginNonMalaysian />} />

        <Route path="/register/malaysian" element={<RegisterMalaysian />} />
        <Route path="/register/non-malaysian" element={<RegisterNonMalaysian />} />

        {/* ===== HOME ===== */}
        <Route
          path="/home"
          element={
            <PrivateRoute>
              <HomePage />
            </PrivateRoute>
          }
        />

        {/* ===== DASHBOARD ===== */}
        <Route
          path="/dashboard/admin"
          element={
            <AdminRoute>
              <AdminDashboard />
            </AdminRoute>
          }
        />

        <Route
          path="/user/dashboard"
          element={
            <UserRoute>
              <UserDashboard />
            </UserRoute>
          }
        />

        {/* ===== APPLICATION ===== */}
        <Route
          path="/applications"
          element={
            <UserRoute>
              <UserApplicationsPage />
            </UserRoute>
          }
        />

        <Route
          path="/admin/applications"
          element={
            <AdminRoute>
              <ApplicationsPage />
            </AdminRoute>
          }
        />

        <Route
          path="/applications/new"
          element={
            <UserRoute>
              <SittingApplicationPage />
            </UserRoute>
          }
        />

        <Route
          path="/applications/:id"
          element={
            <PrivateRoute>
              <ApplicationDetailPage />
            </PrivateRoute>
          }
        />

        {/* ===== REPORTS ===== */}
        <Route
          path="/reports"
          element={
            <AdminRoute>
              <ReportsPage />
            </AdminRoute>
          }
        />

        {/* ===== NOTIFICATIONS ===== */}
        <Route
          path="/notifications"
          element={
            <PrivateRoute>
              <NotificationsPage />
            </PrivateRoute>
          }
        />

        {/* ===== FALLBACK ===== */}
        <Route path="*" element={<Navigate to="/login/malaysian" replace />} />
      </Routes>
    </Router>
  );
}

export default App;