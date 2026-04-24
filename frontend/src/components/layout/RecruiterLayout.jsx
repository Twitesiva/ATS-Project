import { useEffect, useMemo, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { Outlet, useLocation } from "react-router-dom";
import RecruiterSidebar from "./RecruiterSidebar";

export default function RecruiterLayout({ sidebarRole = "recruiter" }) {
  const [collapsed, setCollapsed] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [dojNotifications, setDojNotifications] = useState([]);
  const notificationRef = useRef(null);
  const location = useLocation();
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
      if (!notificationRef.current || notificationRef.current.contains(event.target)) return;
      setNotificationOpen(false);
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#f8f9fb] font-poppins">
      <div
        className="fixed left-0 top-0 z-50 h-screen overflow-hidden border-r border-slate-200 bg-white shadow-[0_0_20px_rgba(0,0,0,0.05)] transition-[width] duration-[250ms] ease-in-out"
        style={{
          width: `${sidebarWidth}px`,
        }}
      >
        {sidebarRole === "recruiter" ? <RecruiterSidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} /> : null}
      </div>

      <div
        className="flex h-full min-w-0 flex-1 flex-col overflow-hidden transition-[margin-left] duration-[250ms] ease-in-out"
        style={{ marginLeft: `${sidebarWidth}px` }}
      >
        <header className="flex h-14 items-center border-b border-slate-200 bg-white px-6">
          <div className="flex min-w-0 items-center">
            <h1 className="truncate text-lg font-semibold text-slate-900">{pageTitle}</h1>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div ref={notificationRef} className="relative">
              <button
                type="button"
                onClick={() => setNotificationOpen((prev) => !prev)}
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-500 transition-all duration-200 ease-in-out hover:bg-amber-100 active:scale-[0.98]"
                aria-label="Notifications"
              >
                <Bell size={16} />
                {dojNotifications.length > 0 ? (
                  <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-blue-500" />
                ) : null}
              </button>

              {notificationOpen ? (
                <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">
                    DOJ Notifications
                  </div>
                  {dojNotifications.length === 0 ? (
                    <div className="px-4 py-4 text-xs text-slate-500">No upcoming DOJs in next 7 days</div>
                  ) : (
                    <div className="max-h-80 overflow-y-auto">
                      {dojNotifications.map((row) => (
                        <div key={row.id || `${row.candidate_name}-${row.client_name}-${row.doj}`} className="border-b border-slate-100 px-4 py-3">
                          <div className="text-xs font-semibold text-slate-900">{row.candidate_name || "-"}</div>
                          <div className="mt-1 text-xs text-slate-600">
                            {row.client_name || "-"} {row.position ? `· ${row.position}` : ""}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {row.doj ? new Date(row.doj).toLocaleDateString("en-IN") : "-"}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
              RA
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-x-auto overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
