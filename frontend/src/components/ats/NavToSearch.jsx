import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { canonicalizeRole } from "../../utils/roles";

export default function NavToSearch() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = canonicalizeRole(user?.role);

  const handleSearchNav = () => {
    if (role === "manager" || role === "recruiter" || role === "tl") {
      navigate(`/${role}/ats-search`);
    } else if (role === "hr") {
      navigate("/hr/dashboard");
    } else {
      navigate("/login");
    }
  };

  return (
    <div className="nav-to-search">
      <button type="button" className="btn btn-secondary" onClick={handleSearchNav}>
        <span className="btn-icon">🔍</span>
        Search Database
      </button>
    </div>
  );
}

