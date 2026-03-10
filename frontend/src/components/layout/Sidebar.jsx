import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { setUserOnlineStatus } from "../../services/authService";
import { canonicalizeRole, getRoleLabel } from "../../utils/roles";

export default function Sidebar({ role }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const effectiveRole = canonicalizeRole(role);

  const handleLogout = async () => {
    await setUserOnlineStatus(user?.id, false);
    logout();
    navigate("/login", { replace: true });
  };

  const recruiterPortalMenu = [
    { label: "Dashboard", path: `/${effectiveRole}/dashboard` },
    { label: "Profile Matching", path: `/${effectiveRole}/ats-match` },
    { label: "Profile Database", path: `/${effectiveRole}/ats-search` },
    { label: "Monthly Report", path: `/${effectiveRole}/data` },
    { label: "Revenue Tracker", path: `/${effectiveRole}/rev-trac` },
    { label: "Reports", path: `/${effectiveRole}/reports` },
  ];

  const menuConfig = {
    hr: [
      { label: "Dashboard", path: "/hr/dashboard" },
      { label: "User Management", path: "/hr/managers" },
      { label: "Activity", path: "/hr/activity" },
      { label: "Reports", path: "/hr/reports" },
    ],
    manager: [
      { label: "Dashboard", path: "/manager/dashboard" },
      { label: "Profile Matching", path: "/manager/ats-match" },
      { label: "Profile Database", path: "/manager/ats-search" },
      { label: "Client Report", path: "/manager/clients" },
      { label: "Monthly Report", path: "/manager/data" },
      { label: "User Management", path: "/manager/recruiters" },
      { label: "TA Activity", path: "/manager/rec-hist" },
      { label: "Manager Revenue", path: "/manager/rev-trac" },
      { label: "Team Revenue", path: "/manager/tem-trac" },
      { label: "Client Analysis", path: "/manager/Sales" },
      { label: "Reports", path: "/manager/reports" },
    ],
    recruiter: recruiterPortalMenu,
    tl: recruiterPortalMenu,
  };

  const menus = menuConfig[effectiveRole] || [];
  const userRoleLabel = getRoleLabel(user?.role);
  const portalLabel = `${getRoleLabel(effectiveRole)} Portal`;

  return (
    <aside style={styles.sidebar}>
      <h2 style={styles.logo}>Twite ATS</h2>
      <div style={styles.portalTag}>{portalLabel}</div>

      {user && (
        <div style={styles.userBox}>
          <div style={styles.userEmail}>{user.email}</div>
          <div style={styles.userRole}>{userRoleLabel}</div>
        </div>
      )}

      <div style={styles.menuList}>
        {menus.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            style={({ isActive }) => ({
              ...styles.link,
              background: isActive ? "#2563eb" : "transparent",
              color: isActive ? "#fff" : "#e5e7eb",
            })}
          >
            {item.label}
          </NavLink>
        ))}
      </div>

      <button onClick={handleLogout} style={styles.logout}>
        Logout
      </button>
    </aside>
  );
}

const styles = {
  sidebar: {
    width: "220px",
    height: "100%",
    background: "#111827",
    color: "#fff",
    padding: "16px",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  menuList: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  logo: {
    textAlign: "center",
    marginBottom: "4px",
  },
  portalTag: {
    textAlign: "center",
    color: "#93c5fd",
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    marginBottom: "8px",
  },
  userBox: {
    background: "#1f2937",
    padding: "10px",
    borderRadius: "6px",
    marginBottom: "12px",
    textAlign: "center",
  },
  userEmail: {
    fontSize: "13px",
    fontWeight: "600",
    color: "#e5e7eb",
    wordBreak: "break-all",
  },
  userRole: {
    fontSize: "12px",
    color: "#9ca3af",
    marginTop: "4px",
  },
  link: {
    padding: "10px",
    borderRadius: "6px",
    textDecoration: "none",
    fontWeight: "500",
  },
  logout: {
    marginTop: "auto",
    padding: "10px",
    background: "#dc2626",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
  },
};
