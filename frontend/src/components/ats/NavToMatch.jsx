import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { canonicalizeRole } from "../../utils/roles";

export default function NavToMatch() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = canonicalizeRole(user?.role);

  const handleMatchNav = () => {
    if (role === "manager" || role === "recruiter" || role === "tl") {
      navigate(`/${role}/ats-match`);
    } else if (role === "hr") {
      navigate("/hr/dashboard");
    } else {
      navigate("/login");
    }
  };

  return (
    <div className="nav-to-search">
      <button type="button" className="btn btn-secondary" onClick={handleMatchNav}>
        <span className="btn-icon">🚀</span>
        Match Resumes
      </button>
    </div>
  );
}

