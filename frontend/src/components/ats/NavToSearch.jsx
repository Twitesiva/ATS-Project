import { useNavigate } from "react-router-dom";

export default function NavToSearch() {
  const navigate = useNavigate();
  return (
    <div className="nav-to-search">
      <button type="button" className="btn btn-secondary" onClick={() => navigate("/search")}>
        <span className="btn-icon">🔍</span>
        Search Database
      </button>
    </div>
  );
}
