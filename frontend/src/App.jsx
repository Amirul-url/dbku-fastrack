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
import AdminHomePage from "./pages/home/admin/AdminHomePage";

/* DASHBOARD */
import UserDashboard from "./pages/dashboard/UserDashboard";
import AdminDashboard from "./pages/dashboard/AdminDashboard";

/* USER APPLICATION */
import UserApplicationsPage from "./pages/applications/user/UserApplicationsPage";

/* ADMIN APPLICATION */
import AdminApplicationsPage from "./pages/applications/admin/AdminApplicationsPage";
import AdminApplicationDetailPage from "./pages/applications/admin/AdminApplicationDetailPage";

/* ADMIN APPLICATION STEPS */
import AdminStep1Page from "./pages/applications/admin/steps/AdminStep1Page";
import AdminStep2Page from "./pages/applications/admin/steps/AdminStep2Page";
import AdminStep3Page from "./pages/applications/admin/steps/AdminStep3Page";
import AdminStep4Page from "./pages/applications/admin/steps/AdminStep4Page";
import AdminStep5Page from "./pages/applications/admin/steps/AdminStep5Page";
import AdminStep6Page from "./pages/applications/admin/steps/AdminStep6Page";
import AdminStep7Page from "./pages/applications/admin/steps/AdminStep7Page";
import AdminStep8Page from "./pages/applications/admin/steps/AdminStep8Page";
import AdminStep9Page from "./pages/applications/admin/steps/AdminStep9Page";
import AdminStep10Page from "./pages/applications/admin/steps/AdminStep10Page";
import AdminStep11Page from "./pages/applications/admin/steps/AdminStep11Page";

/* USER APPLICATION STEPS */
import SittingApplicationPage from "./pages/applications/user/steps/SittingApplicationPage";
import ClientDepartmentPage from "./pages/applications/user/steps/ClientDepartmentPage";
import SubmittingPersonPage from "./pages/applications/user/steps/SubmittingPersonPage";
import LandDetailsPage from "./pages/applications/user/steps/LandDetailsPage";
import BuildingPlanPage from "./pages/applications/user/steps/BuildingPlanPage";
import ProposalAnalysisPage from "./pages/applications/user/steps/ProposalAnalysisPage";
import SiteInspectionPage from "./pages/applications/user/steps/SiteInspectionPage";
import BuildingPlanChecklistPage from "./pages/applications/user/steps/BuildingPlanChecklistPage";
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
    if (!isAdmin(user)) {
      clearAuthSession();
      return <Navigate to="/login/malaysian" replace />;
    }

    return <Navigate to="/dashboard/admin" replace />;
  }

  return children;
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
        <Route path="/login/malaysian" element={<LoginMalaysian />} />
        <Route path="/login/non-malaysian" element={<LoginNonMalaysian />} />
        <Route path="/register/malaysian" element={<RegisterMalaysian />} />
        <Route
          path="/register/non-malaysian"
          element={<RegisterNonMalaysian />}
        />

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

        {/* ADMIN NEW APPLICATION */}
        <Route
          path="/admin/applications/new"
          element={
            <AdminRoute>
              <AdminStep1Page />
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

        {/* ADMIN APPLICATION STEPS */}
        <Route
          path="/admin/applications/:applicationId/step-1"
          element={
            <AdminRoute>
              <AdminStep1Page />
            </AdminRoute>
          }
        />

        <Route
          path="/admin/applications/:applicationId/step-2"
          element={
            <AdminRoute>
              <AdminStep2Page />
            </AdminRoute>
          }
        />

        <Route
          path="/admin/applications/:applicationId/step-3"
          element={
            <AdminRoute>
              <AdminStep3Page />
            </AdminRoute>
          }
        />

        <Route
          path="/admin/applications/:applicationId/step-4"
          element={
            <AdminRoute>
              <AdminStep4Page />
            </AdminRoute>
          }
        />

        <Route
          path="/admin/applications/:applicationId/step-5"
          element={
            <AdminRoute>
              <AdminStep5Page />
            </AdminRoute>
          }
        />

        <Route
          path="/admin/applications/:applicationId/step-6"
          element={
            <AdminRoute>
              <AdminStep6Page />
            </AdminRoute>
          }
        />

        <Route
          path="/admin/applications/:applicationId/step-7"
          element={
            <AdminRoute>
              <AdminStep7Page />
            </AdminRoute>
          }
        />

        <Route
          path="/admin/applications/:applicationId/step-8"
          element={
            <AdminRoute>
              <AdminStep8Page />
            </AdminRoute>
          }
        />

        <Route
          path="/admin/applications/:applicationId/step-9"
          element={
            <AdminRoute>
              <AdminStep9Page />
            </AdminRoute>
          }
        />

        <Route
          path="/admin/applications/:applicationId/step-10"
          element={
            <AdminRoute>
              <AdminStep10Page />
            </AdminRoute>
          }
        />

        <Route
          path="/admin/applications/:applicationId/step-11"
          element={
            <AdminRoute>
              <AdminStep11Page />
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
