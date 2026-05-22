import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "./services/supabaseClient";
import { getRoleHomePath } from "./utils/roles";
// Add these imports
import TLLayout from "./components/layout/TLLayout";
import TLDashboard from "./pages/tl/Dashboard";
import TLATSMatch from "./pages/manager/ATSMatch";
import TLATSSearch from "./pages/manager/ATSSearch";
import TLClients from "./pages/manager/Clients";
import TLData from "./pages/tl/Data";
import TLHistory from "./pages/tl/History";
import TLTeamRevenue from "./pages/tl/TeamRevenueTracker";
import TLReports from "./pages/tl/Reports";
import ProtectedRoute from "./components/common/ProtectedRoute";
import { AuthProvider } from "./context/AuthContext";

import RecruiterLayout from "./components/layout/RecruiterLayout";
import ManagerLayout from "./components/layout/ManagerLayout";
import AdminLayout from "./components/layout/AdminLayout";
import BDELayout from "./components/layout/BDELayout";

import Login from "./pages/auth/Login";
import HRSignup from "./pages/auth/HRSignup";

/* Manager */
import ManagerDashboard from "./pages/manager/Dashboard";
import ManagerATSMatch from "./pages/manager/ATSMatch";
import ManagerATSSearch from "./pages/manager/ATSSearch";
import Recruiters from "./pages/manager/Recruiters";
import Clients from "./pages/manager/Clients";
import Data from "./pages/manager/Data";
import Reports from "./pages/manager/Reports";
import History from "./pages/manager/History";
import TeamRevenueTracker from "./pages/manager/TeamRevenueTracker";
import SalesTracker from "./pages/manager/SalesTracker";

/* Recruiter */
import RecruiterDashboard from "./pages/recruiter/Dashboard";
import RecruiterATSMatch from "./pages/recruiter/ATSMatch";
import RecruiterATSSearch from "./pages/recruiter/ATSSearch";
import RecruiterData from "./pages/recruiter/Data";
import RecruiterReports from "./pages/recruiter/Reports";
import RRevenueTracker from "./pages/recruiter/RevenueTracker";

/* Admin/HR */
import AdminDashboard from "./pages/admin/dashboard";
import AdminManagers from "./pages/admin/managers";
import AdminActivity from "./pages/admin/activity";
import AdminReports from "./pages/admin/reports";

/* BDE */
import BDEDashboard from "./pages/bde/BDEDashboard";
import LeadsManagement from "./pages/bde/LeadsManagement";
import ClientConversion from "./pages/bde/ClientConversion";
import JobRequirements from "./pages/bde/JobRequirements";
import FollowUps from "./pages/bde/FollowUps";
import RevenueAndPipeline from "./pages/bde/RevenueAndPipeline";
import CommunicationLog from "./pages/bde/CommunicationLog";
import PageClosure from "./pages/bde/PageClosure";
import DailyTracker from "./pages/bde/DailyTracker";
import WeeklyTracker from "./pages/bde/WeeklyTracker";
import MasterTracker from "./pages/bde/MasterTracker";

// ─── Root redirect: checks if HR exists ──────────────────────────────────────
// No HR → /signup (first-time setup)
// HR exists → /login (normal flow)
function RootRedirect() {
  const [destination, setDestination] = useState(null);

  useEffect(() => {
    const checkAll = async () => {
      try {
        // If already logged in → go to their dashboard
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data: profile } = await supabase
            .from("users")
            .select("role")
            .eq("auth_id", session.user.id)
            .maybeSingle();

          if (profile?.role) {
            const { getRoleHomePath } = await import("./utils/roles");
            setDestination(getRoleHomePath(profile.role));
            return;
          }
        }

        // No session → check if HR exists
        const { data: hrExists } = await supabase.rpc("check_hr_exists");
        setDestination(hrExists ? "/login" : "/signup");
      } catch (err) {
        console.error("[RootRedirect]", err);
        setDestination("/login");
      }
    };
    checkAll();
  }, []);

  if (!destination) {
    return (
      <div style={loaderStyle}>
        <p style={{ color: "#6b7280", fontSize: "14px" }}>Loading...</p>
      </div>
    );
  }

  return <Navigate to={destination} replace />;
}

const loaderStyle = {
  height: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#f3f4f6",
};
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>

          {/* Root — smart redirect based on HR existence */}
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<HRSignup />} />

          {/* ---------------- HR (Admin Layout) ---------------- */}
          <Route element={<ProtectedRoute roles={["hr", "admin"]} />}>
            <Route path="/hr" element={<AdminLayout sidebarRole="hr" />}>
              <Route index element={<Navigate to="dashboard" />} />
              <Route path="dashboard" element={<AdminDashboard />} />
              <Route path="managers" element={<AdminManagers />} />
              <Route path="activity" element={<AdminActivity />} />
              <Route path="reports" element={<AdminReports />} />
            </Route>
          </Route>

          <Route path="/admin/*" element={<Navigate to="/hr/dashboard" replace />} />

          {/* ---------------- Manager ---------------- */}
          <Route element={<ProtectedRoute role="manager" />}>
            <Route path="/manager" element={<ManagerLayout />}>
              <Route index element={<Navigate to="dashboard" />} />
              <Route path="dashboard" element={<ManagerDashboard />} />
              <Route path="ats-match" element={<ManagerATSMatch />} />
              <Route path="ats-search" element={<ManagerATSSearch />} />
              <Route path="recruiters" element={<Recruiters />} />
              <Route path="clients" element={<Clients />} />
              <Route path="data" element={<Data />} />
              <Route path="reports" element={<Reports />} />
              <Route path="rec-hist" element={<History />} />
              <Route path="tem-trac" element={<TeamRevenueTracker />} />
              <Route path="Sales" element={<SalesTracker />} />
            </Route>
          </Route>

          {/* ---------------- Recruiter ---------------- */}
          <Route element={<ProtectedRoute role="recruiter" />}>
            <Route path="/recruiter" element={<RecruiterLayout />}>
              <Route index element={<Navigate to="dashboard" />} />
              <Route path="dashboard" element={<RecruiterDashboard />} />
              <Route path="ats-match" element={<RecruiterATSMatch />} />
              <Route path="ats-search" element={<RecruiterATSSearch />} />
              <Route path="data" element={<RecruiterData />} />
              <Route path="rev-trac" element={<RRevenueTracker />} />
              <Route path="reports" element={<RecruiterReports />} />
            </Route>
          </Route>
{/* ---------------- TL ---------------- */}
<Route element={<ProtectedRoute role="tl" />}>
  <Route path="/tl" element={<TLLayout />}>
    <Route index element={<Navigate to="dashboard" />} />
    <Route path="dashboard"  element={<TLDashboard />} />
    <Route path="ats-match"  element={<TLATSMatch />} />
    <Route path="ats-search" element={<TLATSSearch />} />
    <Route path="data"       element={<TLData />} />
    <Route path="rec-hist"   element={<TLHistory />} />
    <Route path="tem-trac"   element={<TLTeamRevenue />} />
    <Route path="reports"    element={<TLReports />} />
  </Route>
</Route>
          {/* ---------------- BDE ---------------- */}
          <Route element={<ProtectedRoute role="bde" />}>
            <Route path="/bde" element={<BDELayout />}>
              <Route index element={<Navigate to="dashboard" />} />
              <Route path="dashboard" element={<BDEDashboard />} />
              <Route path="leads" element={<LeadsManagement />} />
              <Route path="leads/new" element={<LeadsManagement />} />
              <Route path="clients" element={<ClientConversion />} />
              <Route path="clients/:id" element={<ClientConversion />} />
              <Route path="requirements" element={<JobRequirements />} />
              <Route path="daily-tracker" element={<DailyTracker />} />
              <Route path="weekly-tracker" element={<WeeklyTracker />} />
              <Route path="master-tracker" element={<MasterTracker />} />
              <Route path="closures" element={<PageClosure />} />
              <Route path="followups" element={<FollowUps />} />
              <Route path="communications" element={<CommunicationLog />} />
              <Route path="*" element={<Navigate to="dashboard" replace />} />
            </Route>
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" />} />

        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
