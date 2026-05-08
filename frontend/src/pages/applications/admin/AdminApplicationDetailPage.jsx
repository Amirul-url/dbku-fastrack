import { Navigate, useParams } from "react-router-dom";

function AdminApplicationDetailPage() {
  const { id } = useParams();

  return (
    <Navigate
      to={`/admin/applications/${id}/step-1`}
      replace
    />
  );
}

export default AdminApplicationDetailPage;