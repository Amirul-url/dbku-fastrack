import { Navigate, useParams } from "react-router-dom";

function AdminApplicationDetailPage() {
  const { id } = useParams();

  return (
    <Navigate
      to={`/admin/applications/${id}/view/step-1?id=${id}`}
      replace
    />
  );
}

export default AdminApplicationDetailPage;
