import { Navigate, useLocation } from "react-router-dom";
import ProcessWorkspace from "../ProcessWorkspace";

function PaymentPage() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);

  if (!searchParams.get("id")) {
    return <Navigate to="/dashboard/admin?view=personal" replace />;
  }

  return <ProcessWorkspace type="payment" />;
}

export default PaymentPage;
