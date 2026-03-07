import { useNavigate } from "react-router-dom";

export default function NavToMatch() {
  const navigate = useNavigate();
  return (
    <div className="nav-to-search">
      <button type="button" className="btn btn-secondary" onClick={() => navigate("/")}>
        <span className="btn-icon">🚀</span>
        Match Resumes
      </button>
    </div>
  );
}
