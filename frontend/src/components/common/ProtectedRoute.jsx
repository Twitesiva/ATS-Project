import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Loader from "./Loader";
import { getRoleHomePath, roleMatches } from "../../utils/roles";

export default function ProtectedRoute({ role, roles }) {
  const { user, authLoading } = useAuth();

  if (authLoading) {
    return (
      <div style={{ width: "100%", height: "100vh" }}>
        <Loader text="Validating session..." />
      </div>
    );
  }

  // not logged in
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const allowedRoles = roles || (role ? [role] : []);
  if (allowedRoles.length > 0 && !roleMatches(user.role, allowedRoles)) {
    return <Navigate to={getRoleHomePath(user.role)} replace />;
  }

  return <Outlet />;
}
