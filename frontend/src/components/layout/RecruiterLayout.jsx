import { useEffect, useMemo, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import RecruiterSidebar from "./RecruiterSidebar";
import { useAuth } from "../../context/AuthContext";
import { setUserOnlineStatus } from "../../services/authService";

export default function RecruiterLayout({ sidebarRole = "recruiter" }) {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [dojNotifications, setDojNotifications] = useState([]);
  const notificationRef = useRef(null);
  const userMenuRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const sidebarWidth = collapsed ? 64 : 240;

  useEffect(() => {
    const applyResponsiveSidebar = () => {
      setCollapsed(window.innerWidth < 1024);
    };

    applyResponsiveSidebar();
    window.addEventListener("resize", applyResponsiveSidebar);
    return () => window.removeEventListener("resize", applyResponsiveSidebar);
  }, []);

  const pageTitle = useMemo(() => {
    const pageMap = {
      "/recruiter/dashboard": "Recruiter Analytics Dashboard",
      "/recruiter/ats-match": "Profile Matching",
      "/recruiter/ats-search": "Profile Database",
      "/recruiter/data": "Monthly Report",
      "/recruiter/reports": "Reports",
      "/recruiter/rev-trac": "Revenue Tracker",
    };

    return pageMap[location.pathname] || "Recruiter Dashboard";
  }, [location.pathname]);

  const safeUserName = useMemo(() => {
    const rawName = String(user?.name || "");
    return rawName.replace(/[<>"'`]/g, "").trim();
  }, [user?.name]);
  const safeUserEmail = useMemo(() => {
    const rawEmail = String(user?.email || "");
    return rawEmail.replace(/[<>"'`]/g, "").trim();
  }, [user?.email]);

  const userInitials = useMemo(() => {
    if (!safeUserName) return "U";
    const parts = safeUserName.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
  }, [safeUserName]);

  const handleLogout = async () => {
    await setUserOnlineStatus(user?.id, false);
    logout();
    navigate("/login", { replace: true });
  };

  useEffect(() => {
    const handleNotifications = (event) => {
      const nextRows = Array.isArray(event?.detail?.rows) ? event.detail.rows : [];
      setDojNotifications(nextRows);
    };

    window.addEventListener("recruiter-doj-notifications", handleNotifications);
    return () => window.removeEventListener("recruiter-doj-notifications", handleNotifications);
  }, []);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      const clickedInsideNotification = notificationRef.current?.contains(event.target);
      const clickedInsideUserMenu = userMenuRef.current?.contains(event.target);

      if (!clickedInsideNotification) setNotificationOpen(false);
      if (!clickedInsideUserMenu) setUserMenuOpen(false);
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#F8FAFC] font-poppins">
      <div
        className="fixed left-0 top-0 z-50 h-screen overflow-hidden border-r border-slate-200 bg-white shadow-[0_0_20px_rgba(0,0,0,0.05)] transition-[width] duration-[250ms] ease-in-out"
        style={{
          width: `${sidebarWidth}px`,
        }}
      >
        {sidebarRole === "recruiter" ? <RecruiterSidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} /> : null}
      </div>

      <div
        className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-[#F8FAFC] transition-[margin-left] duration-[250ms] ease-in-out"
        style={{ marginLeft: `${sidebarWidth}px` }}
      >
        <header className="sticky top-0 z-30 flex h-14 items-center border-b border-[#CBD5E1] bg-white px-6 shadow-[0_2px_8px_rgba(15,23,42,0.08)]">
          <div className="flex min-w-0 items-center">
            <h1 className="truncate text-lg font-semibold text-slate-900">{pageTitle}</h1>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div ref={notificationRef} className="relative">
              <button
                type="button"
                onClick={() => setNotificationOpen((prev) => !prev)}
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-500 transition-all duration-200 ease-in-out hover:bg-amber-100 hover:shadow-sm active:scale-[0.98]"
                aria-label="Notifications"
              >
                <Bell size={16} />
                {dojNotifications.length > 0 ? (
                  <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-blue-500" />
                ) : null}
              </button>

              {notificationOpen ? (
                <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.12)]">
                  <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">
                    DOJ Notifications
                  </div>
                  {dojNotifications.length === 0 ? (
                    <div className="px-4 py-5 text-xs text-slate-500">No upcoming DOJs in next 7 days</div>
                  ) : (
                    <div className="max-h-80 space-y-2 overflow-y-auto p-2">
                      {dojNotifications.map((row) => (
                        <div
                          key={row.id || `${row.candidate_name}-${row.client_name}-${row.doj}`}
                          className="rounded-xl border border-slate-100 px-3 py-3 transition-all duration-200 ease-in-out hover:bg-slate-50"
                        >
                          <div className="text-xs font-semibold text-slate-900">{row.candidate_name || "-"}</div>
                          <div className="mt-1 text-xs text-slate-600">
                            {row.client_name || "-"} {row.position ? `· ${row.position}` : ""}
                          </div>
                          <div className="mt-2 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                            {row.doj ? new Date(row.doj).toLocaleDateString("en-IN") : "-"}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
            <div ref={userMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setUserMenuOpen((prev) => !prev)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 text-sm font-bold text-blue-700 transition-all duration-200 ease-in-out hover:brightness-105 hover:shadow-sm"
                aria-label="User menu"
              >
                {userInitials}
              </button>

              {userMenuOpen ? (
                <div className="absolute right-0 top-11 z-50 w-64 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_12px_32px_rgba(15,23,42,0.12)]">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="m-0 text-sm font-semibold text-slate-900">{safeUserName || "-"}</p>
                    <p className="m-0 mt-1 text-xs text-slate-500">{safeUserEmail || "-"}</p>
                  </div>
                  <div className="my-3 h-px bg-slate-200" />
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition-all duration-200 ease-in-out hover:bg-slate-100"
                  >
                    Logout
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-x-auto overflow-y-auto bg-white p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
