import { useEffect, useMemo, useState } from "react";
import { Bell, Search } from "lucide-react";
import { Outlet, useLocation } from "react-router-dom";
import RecruiterSidebar from "./RecruiterSidebar";

export default function RecruiterLayout({ sidebarRole = "recruiter" }) {
  const [collapsed, setCollapsed] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
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

  const sanitizeInput = (value) => value.replace(/[<>"'`]/g, "");

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

          <div className="mx-auto hidden w-full max-w-md items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 lg:flex">
            <Search size={16} className="mr-2 text-slate-400" />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(sanitizeInput(event.target.value))}
              placeholder="Search candidates, clients, reports..."
              className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              aria-label="Search"
            />
          </div>

          <div className="ml-auto flex items-center gap-3">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-all duration-200 hover:bg-slate-50 active:scale-[0.98]"
              aria-label="Notifications"
            >
              <Bell size={16} />
            </button>
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
