import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { setUserOnlineStatus } from "../../services/authService";
import { canonicalizeRole, getRoleLabel } from "../../utils/roles";
import {LayoutDashboard, UserSearch, Database, FileText,BarChart3,Users,Activity,IndianRupee, TrendingUp} from "lucide-react";
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
  { label: "Dashboard", path: `/${effectiveRole}/dashboard`, icon: <LayoutDashboard size={18} /> },
  { label: "Profile Matching", path: `/${effectiveRole}/ats-match`, icon: <UserSearch size={18} /> },
  { label: "Profile Database", path: `/${effectiveRole}/ats-search`, icon: <Database size={18} /> },
  { label: "Monthly Report", path: `/${effectiveRole}/data`, icon: <FileText size={18} /> },
  { label: "Revenue Tracker", path: `/${effectiveRole}/rev-trac`, icon: <IndianRupee size={18} /> },
  { label: "Reports", path: `/${effectiveRole}/reports`, icon: <BarChart3 size={18} /> },
];

  const menuConfig = {
    hr: [
      { label: "Dashboard", path: "/hr/dashboard" },
      { label: "User Management", path: "/hr/managers" },
      { label: "Activity", path: "/hr/activity" },
      { label: "Reports", path: "/hr/reports" },
    ],
   manager: [
  { label: "Dashboard", path: "/manager/dashboard", icon: <LayoutDashboard size={18} color="Blue" /> },
  { label: "Profile Matching", path: "/manager/ats-match", icon: <UserSearch size={18} /> },
  { label: "Profile Database", path: "/manager/ats-search", icon: <Database size={18} /> },
  { label: "Client Report", path: "/manager/clients", icon: <FileText size={18} /> },
  { label: "Monthly Report", path: "/manager/data", icon: <FileText size={18} /> },
  { label: "User Management", path: "/manager/recruiters", icon: <Users size={18} /> },
  { label: "TA Activity", path: "/manager/rec-hist", icon: <Activity size={18} /> },
  { label: "Team Revenue", path: "/manager/tem-trac", icon: <IndianRupee size={18} /> },
  { label: "Client Analysis", path: "/manager/Sales", icon: <TrendingUp size={18} /> },
  { label: "Reports", path: "/manager/reports", icon: <BarChart3 size={18} /> },
],
    recruiter: recruiterPortalMenu,
    tl: recruiterPortalMenu,
   bde: [
  { label: "Dashboard",     path: "/bde/dashboard",     icon: <LayoutDashboard size={18} /> },
  { label: "Leads",         path: "/bde/leads",         icon: <Users size={18} /> },
  { label: "Clients",       path: "/bde/clients",       icon: <FileText size={18} /> },
  { label: "Requirements",  path: "/bde/requirements",  icon: <Database size={18} /> },
  { label: "Follow-ups",    path: "/bde/followups",     icon: <Activity size={18} /> },
  { label: "Daily Tracker", path: "/bde/daily-tracker", icon: <BarChart3 size={18} /> },
  { label: "Weekly Tracker", path: "/bde/weekly-tracker", icon: <BarChart3 size={18} /> },
  { label: "Master Tracker", path: "/bde/master-tracker", icon: <BarChart3 size={18} /> },
  { label: "Revenue",       path: "/bde/revenue",       icon: <IndianRupee size={18} /> },
  { label: "Page Closures", path: "/bde/closures",      icon: <TrendingUp size={18} /> },
  { label: "Communications",path: "/bde/communications",icon: <BarChart3 size={18} /> },
],
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
              background: isActive 
  ? "linear-gradient(90deg, #2563eb, #3b82f6)" 
  : "transparent",
color: isActive ? "#fff" : "#cbd5f5",
boxShadow: isActive ? "0 4px 12px rgba(37, 99, 235, 0.4)" : "none",
            })}
          >
            <span style={{ display: "flex", alignItems: "center", opacity: 0.9 }}>
                {item.icon}
    </span>
           <span>{item.label}</span>
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
    background: "linear-gradient(180deg, #0f172a, #020617)",
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

  /* Hide scrollbar (Firefox + IE) */
  scrollbarWidth: "none",
  msOverflowStyle: "none",

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
  padding: "12px 14px",
  borderRadius: "10px",
  textDecoration: "none",
  fontWeight: "500",
  display: "flex",
  alignItems: "center",
  gap: "12px",
  color: "#cbd5f5",
  transition: "all 0.25s ease",
  cursor: "pointer",
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
