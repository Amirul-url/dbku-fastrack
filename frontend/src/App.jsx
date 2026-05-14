import {
  Navigate,
  BrowserRouter as Router,
  Routes,
  Route,
  useParams,
} from "react-router-dom";

/* AUTH */
import LoginMalaysian from "./pages/auth/LoginMalaysian";
import RegisterMalaysian from "./pages/auth/RegisterMalaysian";
import ForgotPassword from "./pages/auth/ForgotPassword";
import FaqPage from "./pages/public/FaqPage";

/* HOME */
import AdminHomePage from "./pages/home/admin/AdminHomePage";

/* DASHBOARD */
import UserDashboard from "./pages/dashboard/UserDashboard";
import AdminDashboard from "./pages/dashboard/AdminDashboard";
import SuperAdminDashboard from "./pages/dashboard/SuperAdminDashboard";
import AdminDashboardLayout from "./layout/AdminDashboardLayout";

/* USER APPLICATION */
import UserApplicationsPage from "./pages/applications/user/UserApplicationsPage";
import UserProfilePage from "./pages/profile/UserProfilePage";

/* ADMIN APPLICATION */
import AdminApplicationsPage from "./pages/applications/admin/AdminApplicationsPage";
import AdminApplicationDetailPage from "./pages/applications/admin/AdminApplicationDetailPage";
import AdminApplicationStepNav from "./pages/applications/admin/AdminApplicationStepNav";

/* USER APPLICATION STEPS */
import SittingApplicationPage from "./pages/applications/user/steps/SittingApplicationPage";
import SubmittingPersonPage from "./pages/applications/user/steps/SubmittingPersonPage";
import PrintFormPage from "./pages/applications/user/steps/PrintFormPage";
import SupportingDocumentPage from "./pages/applications/user/steps/SupportingDocumentPage";
import DeclarationPage from "./pages/applications/user/steps/DeclarationPage";

/* ADMIN FLOW PAGES */
import AutoScreeningPage from "./pages/admin/auto-screening/AutoScreeningPage";
import TechnicalReviewPage from "./pages/admin/technical-review/TechnicalReviewPage";
import ApprovalPage from "./pages/admin/approval/ApprovalPage";
import PaymentPage from "./pages/admin/payment/PaymentPage";
import LicenseQrPage from "./pages/admin/license-qr/LicenseQrPage";

/* ENFORCEMENT / LICENSE */
import EnforcementScanPage from "./pages/enforcement/EnforcementScanPage";
import LicenseVerificationPage from "./pages/license/LicenseVerificationPage";

/* OTHER */
import ReportsPage from "./pages/reports/ReportsPage";
import NotificationsPage from "./pages/notifications/NotificationsPage";
import {
  clearAuthSession,
  getStoredUser,
  isAdminUser,
  isApplicantUser,
  isSuperAdminUser,
} from "./services/api";

function getUser() {
  return getStoredUser();
}

function isAuthenticated() {
  return !!localStorage.getItem("fastrack_access_token");
}

function isAdmin(user) {
  return isAdminUser(user);
}

function isSuperAdmin(user) {
  return isSuperAdminUser(user);
}

function isUser(user) {
  return isApplicantUser(user);
}

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
    if (isSuperAdmin(user)) {
      return <Navigate to="/superadmin/dashboard" replace />;
    }

    if (!isUser(user)) {
      clearAuthSession();
      return <Navigate to="/login/malaysian" replace />;
    }

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
    if (isSuperAdmin(user)) {
      return <Navigate to="/superadmin/dashboard" replace />;
    }

    if (!isAdmin(user)) {
      clearAuthSession();
      return <Navigate to="/login/malaysian" replace />;
    }

    return <Navigate to="/dashboard/admin" replace />;
  }

  return children;
}

function SuperAdminRoute({ children }) {
  const user = getUser();

  if (!isAuthenticated()) {
    return <Navigate to="/login/malaysian" replace />;
  }

  if (!isSuperAdmin(user)) {
    if (isAdmin(user)) {
      return <Navigate to="/dashboard/admin" replace />;
    }

    if (isUser(user)) {
      return <Navigate to="/user/dashboard" replace />;
    }

    clearAuthSession();
    return <Navigate to="/login/malaysian" replace />;
  }

  return children;
}

function RedirectAdminStep({ toStep }) {
  const { applicationId } = useParams();

  return (
    <Navigate
      to={`/admin/applications/${applicationId}/step-${toStep}`}
      replace
    />
  );
}

function App() {
  return (
    <Router>
      <Routes>
        {/* PUBLIC LICENSE VERIFY */}
        <Route
          path="/license/verify/:licenseId"
          element={<LicenseVerificationPage />}
        />

        {/* AUTH */}
        <Route path="/" element={<LoginMalaysian />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/login/malaysian" element={<LoginMalaysian />} />
        <Route path="/register/malaysian" element={<RegisterMalaysian />} />
        <Route path="/faq" element={<FaqPage />} />

        {/* ADMIN HOME */}
        <Route
          path="/home"
          element={
            <AdminRoute>
              <AdminHomePage />
            </AdminRoute>
          }
        />

        {/* DASHBOARDS */}
        <Route
          path="/superadmin/dashboard"
          element={
            <SuperAdminRoute>
              <SuperAdminDashboard />
            </SuperAdminRoute>
          }
        />

        <Route
          path="/superadmin/users"
          element={
            <SuperAdminRoute>
              <SuperAdminDashboard view="users" />
            </SuperAdminRoute>
          }
        />

        <Route
          path="/superadmin/admins"
          element={
            <SuperAdminRoute>
              <SuperAdminDashboard view="admins" />
            </SuperAdminRoute>
          }
        />

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

        <Route
          path="/user/profile"
          element={
            <UserRoute>
              <UserProfilePage />
            </UserRoute>
          }
        />

        {/* APPLICATION LISTS */}
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
              <AdminApplicationsPage />
            </AdminRoute>
          }
        />

        {/* ADMIN APPLICATION DETAIL */}
        <Route
          path="/admin/applications/:id"
          element={
            <AdminRoute>
              <AdminApplicationDetailPage />
            </AdminRoute>
          }
        />

        {/* ADMIN READ-ONLY APPLICATION VIEW */}
        <Route
          path="/admin/applications/:applicationId/view/step-1"
          element={
            <AdminRoute>
              <SittingApplicationPage
                LayoutComponent={AdminDashboardLayout}
                mode="admin-view"
              />
            </AdminRoute>
          }
        />

        <Route
          path="/admin/applications/:applicationId/view/step-2"
          element={
            <AdminRoute>
              <SubmittingPersonPage
                LayoutComponent={AdminDashboardLayout}
                mode="admin-view"
              />
            </AdminRoute>
          }
        />

        <Route
          path="/admin/applications/:applicationId/view/step-3"
          element={
            <AdminRoute>
              <SupportingDocumentPage
                LayoutComponent={AdminDashboardLayout}
                mode="admin-view"
              />
            </AdminRoute>
          }
        />

        <Route
          path="/admin/applications/:applicationId/view/step-4"
          element={
            <AdminRoute>
              <DeclarationPage
                LayoutComponent={AdminDashboardLayout}
                mode="admin-view"
              />
            </AdminRoute>
          }
        />

        <Route
          path="/admin/applications/:applicationId/view/step-5"
          element={
            <AdminRoute>
              <PrintFormPage
                LayoutComponent={AdminDashboardLayout}
                mode="admin-view"
              />
            </AdminRoute>
          }
        />

        {/* ADMIN APPLICATION STEPS */}
        <Route
          path="/admin/applications/:applicationId/step-1"
          element={
            <AdminRoute>
              <SittingApplicationPage
                LayoutComponent={AdminDashboardLayout}
                StepNavComponent={AdminApplicationStepNav}
                mode="admin"
              />
            </AdminRoute>
          }
        />

        <Route
          path="/admin/applications/:applicationId/step-2"
          element={
            <AdminRoute>
              <SubmittingPersonPage
                LayoutComponent={AdminDashboardLayout}
                StepNavComponent={AdminApplicationStepNav}
                mode="admin"
              />
            </AdminRoute>
          }
        />

        <Route
          path="/admin/applications/:applicationId/step-3"
          element={
            <AdminRoute>
              <SupportingDocumentPage
                LayoutComponent={AdminDashboardLayout}
                StepNavComponent={AdminApplicationStepNav}
                mode="admin"
              />
            </AdminRoute>
          }
        />

        <Route
          path="/admin/applications/:applicationId/step-4"
          element={
            <AdminRoute>
              <DeclarationPage
                LayoutComponent={AdminDashboardLayout}
                StepNavComponent={AdminApplicationStepNav}
                mode="admin"
              />
            </AdminRoute>
          }
        />

        <Route
          path="/admin/applications/:applicationId/step-5"
          element={
            <AdminRoute>
              <PrintFormPage
                LayoutComponent={AdminDashboardLayout}
                StepNavComponent={AdminApplicationStepNav}
                mode="admin"
              />
            </AdminRoute>
          }
        />

        <Route
          path="/admin/applications/:applicationId/step-6"
          element={
            <AdminRoute>
              <RedirectAdminStep toStep={3} />
            </AdminRoute>
          }
        />

        <Route
          path="/admin/applications/:applicationId/step-7"
          element={
            <AdminRoute>
              <RedirectAdminStep toStep={3} />
            </AdminRoute>
          }
        />

        <Route
          path="/admin/applications/:applicationId/step-8"
          element={
            <AdminRoute>
              <RedirectAdminStep toStep={3} />
            </AdminRoute>
          }
        />

        <Route
          path="/admin/applications/:applicationId/step-9"
          element={
            <AdminRoute>
              <RedirectAdminStep toStep={5} />
            </AdminRoute>
          }
        />

        <Route
          path="/admin/applications/:applicationId/step-10"
          element={
            <AdminRoute>
              <RedirectAdminStep toStep={3} />
            </AdminRoute>
          }
        />

        <Route
          path="/admin/applications/:applicationId/step-11"
          element={
            <AdminRoute>
              <RedirectAdminStep toStep={4} />
            </AdminRoute>
          }
        />

        {/* USER APPLICATION STEPS */}
        <Route
          path="/applications/new"
          element={
            <UserRoute>
              <SittingApplicationPage />
            </UserRoute>
          }
        />

        <Route
          path="/applications/:applicationId/edit"
          element={
            <UserRoute>
              <SittingApplicationPage />
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

        {/* ADMIN FLOW PAGES */}
        <Route
          path="/admin/auto-screening"
          element={
            <AdminRoute>
              <AutoScreeningPage />
            </AdminRoute>
          }
        />

        <Route
          path="/admin/technical-review"
          element={
            <AdminRoute>
              <TechnicalReviewPage />
            </AdminRoute>
          }
        />

        <Route
          path="/admin/approval"
          element={
            <AdminRoute>
              <ApprovalPage />
            </AdminRoute>
          }
        />

        <Route
          path="/admin/payment"
          element={
            <AdminRoute>
              <PaymentPage />
            </AdminRoute>
          }
        />

        <Route
          path="/admin/license-qr"
          element={
            <AdminRoute>
              <LicenseQrPage />
            </AdminRoute>
          }
        />

        <Route
          path="/admin/enforcement"
          element={
            <AdminRoute>
              <EnforcementScanPage />
            </AdminRoute>
          }
        />

        {/* OTHER */}
        <Route
          path="/reports"
          element={
            <AdminRoute>
              <ReportsPage />
            </AdminRoute>
          }
        />

        <Route
          path="/notifications"
          element={
            <PrivateRoute>
              <NotificationsPage />
            </PrivateRoute>
          }
        />

        <Route path="*" element={<Navigate to="/login/malaysian" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
