import AdminDashboardLayout from "../../layout/AdminDashboardLayout";
import OperationalWorkflowPanel from "../../components/admin/OperationalWorkflowPanel";
import { useLanguage } from "../../context/LanguageContext";

function AdminGuidelinesPage() {
  const { t } = useLanguage();

  return (
    <AdminDashboardLayout>
      <OperationalWorkflowPanel t={t} />
    </AdminDashboardLayout>
  );
}

export default AdminGuidelinesPage;
