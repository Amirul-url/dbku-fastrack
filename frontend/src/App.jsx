import { Navigate, BrowserRouter as Router, Routes, Route } from "react-router-dom";

/* AUTH */
import LoginMalaysian from "./pages/auth/LoginMalaysian";
import LoginNonMalaysian from "./pages/auth/LoginNonMalaysian";
import RegisterMalaysian from "./pages/auth/RegisterMalaysian";
import RegisterNonMalaysian from "./pages/auth/RegisterNonMalaysian";

/* NEW HOME PAGE */
import HomePage from "./pages/home/HomePage";

/* DASHBOARD */
import AdminDashboard from "./pages/dashboard/AdminDashboard";

/* APPLICATION */
import ApplicationsPage from "./pages/applications/ApplicationsPage";
import ApplicationDetailPage from "./pages/applications/ApplicationDetailPage";
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

/* WORKFLOW */
import AutoScreeningPage from "./pages/screening/AutoScreeningPage";
import TechnicalReviewPage from "./pages/review/TechnicalReviewPage";
import ApprovalPage from "./pages/approval/ApprovalPage";

/* PAYMENT & LICENSE */
import PaymentPage from "./pages/payment/PaymentPage";
import LicenseQrPage from "./pages/license/LicenseQrPage";

/* ENFORCEMENT */
import EnforcementScanPage from "./pages/enforcement/EnforcementScanPage";

/* REPORTS & NOTIFICATIONS */
import ReportsPage from "./pages/reports/ReportsPage";
import NotificationsPage from "./pages/notifications/NotificationsPage";

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

        {/* ===== HOME (NEW AFTER LOGIN) ===== */}
        <Route path="/home" element={<HomePage />} />

        {/* ===== DASHBOARD ===== */}
        <Route
          path="/dashboard"
          element={<Navigate to="/dashboard/admin" replace />}
        />
        <Route path="/dashboard/admin" element={<AdminDashboard />} />

        {/* ===== APPLICATION ===== */}
        <Route path="/applications" element={<ApplicationsPage />} />
        <Route path="/applications/new" element={<SittingApplicationPage />} />
        <Route path="/applications/client-department" element={<ClientDepartmentPage />} />
        <Route path="/applications/submitting-person" element={<SubmittingPersonPage />} />
        <Route path="/applications/land-details" element={<LandDetailsPage />} />
        <Route path="/applications/building-plan" element={<BuildingPlanPage />} />
        <Route path="/applications/proposal-analysis" element={<ProposalAnalysisPage />} />
        <Route path="/applications/site-inspection" element={<SiteInspectionPage />} />
        <Route path="/applications/building-plan-checklist" element={<BuildingPlanChecklistPage />} />
        <Route path="/applications/print-form" element={<PrintFormPage />} />
        <Route path="/applications/supporting-document" element={<SupportingDocumentPage />} />
        <Route path="/applications/declaration" element={<DeclarationPage />} />
        
        <Route path="/applications/:applicationId/edit" element={<SittingApplicationPage />} />
        <Route path="/applications/:applicationId/client-department" element={<ClientDepartmentPage />} />
        <Route path="/applications/:applicationId/submitting-person" element={<SubmittingPersonPage />} />
        <Route path="/applications/:applicationId/land-details" element={<LandDetailsPage />} />
        <Route path="/applications/:applicationId/building-plan" element={<BuildingPlanPage />} />
        <Route path="/applications/:applicationId/proposal-analysis" element={<ProposalAnalysisPage />} />
        <Route path="/applications/:applicationId/site-inspection" element={<SiteInspectionPage />} />
        <Route path="/applications/:applicationId/building-plan-checklist" element={<BuildingPlanChecklistPage />} />
        <Route path="/applications/:applicationId/print-form" element={<PrintFormPage />} />
        <Route path="/applications/:applicationId/supporting-document" element={<SupportingDocumentPage />} />
        <Route path="/applications/:applicationId/declaration" element={<DeclarationPage />} />
        
        <Route path="/applications/:id" element={<ApplicationDetailPage />} />

        {/* ===== WORKFLOW ===== */}
        <Route path="/auto-screening" element={<AutoScreeningPage />} />
        <Route path="/technical-review" element={<TechnicalReviewPage />} />
        <Route path="/approval" element={<ApprovalPage />} />

        {/* ===== PAYMENT & LICENSE ===== */}
        <Route path="/payment" element={<PaymentPage />} />
        <Route path="/license-qr" element={<LicenseQrPage />} />

        {/* ===== ENFORCEMENT ===== */}
        <Route path="/enforcement" element={<EnforcementScanPage />} />

        {/* ===== REPORTS ===== */}
        <Route path="/reports" element={<ReportsPage />} />

        {/* ===== NOTIFICATIONS ===== */}
        <Route path="/notifications" element={<NotificationsPage />} />

        {/* ===== FALLBACK ===== */}
        <Route
          path="*"
          element={<Navigate to="/login/malaysian" replace />}
        />
      </Routes>
    </Router>
  );
}

export default App;