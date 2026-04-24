import { NavLink, useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Database,
  FileText,
  IndianRupee,
  LayoutDashboard,
  LogOut,
  UserSearch,
  BarChart3,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { setUserOnlineStatus } from "../../services/authService";

const groupedMenu = [
  {
    title: "Main",
    items: [{ label: "Dashboard", path: "/recruiter/dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Features",
    items: [
      { label: "Profile Matching", path: "/recruiter/ats-match", icon: UserSearch },
      { label: "Profile Database", path: "/recruiter/ats-search", icon: Database },
      { label: "Reports", path: "/recruiter/reports", icon: BarChart3 },
      { label: "Monthly Report", path: "/recruiter/data", icon: FileText },
    ],
  },
  {
    title: "Finance",
    items: [{ label: "Revenue Tracker", path: "/recruiter/rev-trac", icon: IndianRupee }],
  },
];

export default function RecruiterSidebar({ collapsed = false, onToggle }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await setUserOnlineStatus(user?.id, false);
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <aside className="flex h-full w-full flex-col px-2 py-3 font-poppins text-slate-800">
      <div className={collapsed ? "mb-4 flex flex-col items-center gap-2" : "mb-4 flex items-center justify-between px-2"}>
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-white">
            <img src="/logos/image.png" alt="Twite logo" className="h-full w-full object-contain" />
          </div>
          {!collapsed ? <h2 className="m-0 text-xl font-semibold text-[#26a5d9]">Twite ATS</h2> : null}
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-all duration-200 hover:bg-slate-50 active:scale-[0.98]"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>
      </div>

      <nav className={collapsed ? "flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto" : "flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-2"}>
        {groupedMenu.map((group) => (
          <div key={group.title} className={collapsed ? "w-full" : "flex w-full flex-col gap-2"}>
            {!collapsed ? <p className="m-0 px-2 text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400">{group.title}</p> : null}
            <div className={collapsed ? "flex w-full flex-col items-center gap-2" : "flex w-full flex-col gap-1"}>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      [
                        collapsed
                          ? "flex h-10 w-10 items-center justify-center rounded-xl no-underline transition-all duration-200"
                          : "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium no-underline transition-all duration-200",
                        isActive
                          ? "bg-blue-100 text-blue-600 font-semibold"
                          : "text-slate-600 hover:bg-blue-50 hover:text-blue-600",
                      ].join(" ")
                    }
                  >
                    <Icon size={17} />
                    {!collapsed ? <span>{item.label}</span> : null}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className={collapsed ? "mt-3 flex flex-col items-center gap-2 border-t border-slate-100 pt-3" : "mt-3 flex flex-col gap-1 border-t border-slate-100 pt-3 px-2"}>
        <button
          type="button"
          onClick={handleLogout}
          title={collapsed ? "Logout" : undefined}
          className={
            collapsed
              ? "flex h-10 w-10 items-center justify-center rounded-xl border border-blue-600 bg-blue-600 text-white transition-all duration-200 hover:bg-transparent hover:text-blue-600 active:scale-[0.98]"
              : "flex h-10 w-full items-center gap-3 rounded-xl border border-blue-600 bg-blue-600 px-3 text-sm font-medium text-white transition-all duration-200 hover:bg-transparent hover:text-blue-600 active:scale-[0.98]"
          }
        >
          <LogOut size={17} />
          {!collapsed ? "Logout" : null}
        </button>
      </div>
    </aside>
  );
}
