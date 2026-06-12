import { Navigate, useLocation } from "react-router-dom";
import ProcessWorkspace from "../ProcessWorkspace";
import { getStoredUser } from "../../../services/api";

function LicenseQrPage() {
  const location = useLocation();
  const department = String(getStoredUser()?.department || "").trim().toUpperCase();

  if (department === "PT(IKL)") {
    return <Navigate to={`/admin/e-licenses/payment${location.search}`} replace />;
  }

  return <ProcessWorkspace type="license" />;
}

export default LicenseQrPage;
