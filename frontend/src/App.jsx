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

/* APPLICATION STEPS */
import SittingApplicationPage from "./pages/applications/steps/SittingApplicationPage";
import ClientDepartmentPage from "./pages/applications/steps/ClientDepartmentPage";
import SubmittingPersonPage from "./pages/applications/steps/SubmittingPersonPage";
import LandDetailsPage from "./pages/applications/steps/LandDetailsPage";
import BuildingPlanPage from "./pages/applications/steps/BuildingPlanPage";
import ProposalAnalysisPage from "./pages/applications/steps/ProposalAnalysisPage";
import SiteInspectionPage from "./pages/applications/steps/SiteInspectionPage";
import BuildingPlanChecklistPage from "./pages/applications/steps/BuildingPlanChecklistPage";
import PrintFormPage from "./pages/applications/steps/PrintFormPage";
import SupportingDocumentPage from "./pages/applications/steps/SupportingDocumentPage";
import DeclarationPage from "./pages/applications/steps/DeclarationPage";

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
        <Route
          path="/register/non-malaysian"
          element={<RegisterNonMalaysian />}
        />

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

        {/* ===== USER APPLICATION LIST ===== */}
        <Route
          path="/applications"
          element={
            <UserRoute>
              <UserApplicationsPage />
            </UserRoute>
          }
        />

        {/* ===== ADMIN APPLICATION LIST ===== */}
        <Route
          path="/admin/applications"
          element={
            <AdminRoute>
              <ApplicationsPage />
            </AdminRoute>
          }
        />

        {/* ===== NEW APPLICATION STEP 1 ===== */}
        <Route
          path="/applications/new"
          element={
            <UserRoute>
              <SittingApplicationPage />
            </UserRoute>
          }
        />

        {/* ===== APPLICATION STEP ROUTES ===== */}
        <Route
          path="/applications/:applicationId/edit"
          element={
            <UserRoute>
              <SittingApplicationPage />
            </UserRoute>
          }
        />

        <Route
          path="/applications/:applicationId/client-department"
          element={
            <UserRoute>
              <ClientDepartmentPage />
            </UserRoute>
          }
        />

        <Route
          path="/applications/:applicationId/submitting-person"
          element={
            <UserRoute>
              <SubmittingPersonPage />
            </UserRoute>
          }
        />

        <Route
          path="/applications/:applicationId/land-details"
          element={
            <UserRoute>
              <LandDetailsPage />
            </UserRoute>
          }
        />

        <Route
          path="/applications/:applicationId/building-plan"
          element={
            <UserRoute>
              <BuildingPlanPage />
            </UserRoute>
          }
        />

        <Route
          path="/applications/:applicationId/proposal-analysis"
          element={
            <UserRoute>
              <ProposalAnalysisPage />
            </UserRoute>
          }
        />

        <Route
          path="/applications/:applicationId/site-inspection"
          element={
            <UserRoute>
              <SiteInspectionPage />
            </UserRoute>
          }
        />

        <Route
          path="/applications/:applicationId/building-plan-checklist"
          element={
            <UserRoute>
              <BuildingPlanChecklistPage />
            </UserRoute>
          }
        />

        <Route
          path="/applications/:applicationId/print-form"
          element={
            <UserRoute>
              <PrintFormPage />
            </UserRoute>
          }
        />

        <Route
          path="/applications/:applicationId/supporting-document"
          element={
            <UserRoute>
              <SupportingDocumentPage />
            </UserRoute>
          }
        />

        <Route
          path="/applications/:applicationId/declaration"
          element={
            <UserRoute>
              <DeclarationPage />
            </UserRoute>
          }
        />

        {/* ===== APPLICATION DETAIL ===== */}
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