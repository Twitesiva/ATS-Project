import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import ProtectedRoute from "./components/common/ProtectedRoute";
import { AuthProvider } from "./context/AuthContext";

import RecruiterLayout from "./components/layout/RecruiterLayout";
import ManagerLayout from "./components/layout/ManagerLayout";
import AdminLayout from "./components/layout/AdminLayout";

import Login from "./pages/auth/Login";

import ManagerDashboard from "./pages/manager/Dashboard";
import ManagerATSMatch from "./pages/manager/ATSMatch";
import ManagerATSSearch from "./pages/manager/ATSSearch";
import Recruiters from "./pages/manager/Recruiters";
import Clients from "./pages/manager/Clients";
import Data from "./pages/manager/Data";
import Reports from "./pages/manager/Reports";
import History from "./pages/manager/History";
import MRevenueTracker from "./pages/manager/RevenueTracker";
import TeamRevenueTracker from "./pages/manager/TeamRevenueTracker";
import SalesTracker from "./pages/manager/SalesTracker";

import RecruiterDashboard from "./pages/recruiter/Dashboard";
import RecruiterATSMatch from "./pages/recruiter/ATSMatch";
import RecruiterATSSearch from "./pages/recruiter/ATSSearch";
import RecruiterData from "./pages/recruiter/Data";
import RecruiterReports from "./pages/recruiter/Reports";
import RRevenueTracker from "./pages/recruiter/RevenueTracker";

import AdminDashboard from "./pages/admin/dashboard";
import AdminManagers from "./pages/admin/managers";
import AdminActivity from "./pages/admin/activity";
import AdminReports from "./pages/admin/reports";

import BDELayout from "./components/layout/BDELayout";

import BDEDashboard from "./pages/bde/BDEDashboard";
import LeadsManagement from "./pages/bde/LeadsManagement";
import ClientConversion from "./pages/bde/ClientConversion";
import JobRequirements from "./pages/bde/JobRequirements";
import FollowUps from "./pages/bde/FollowUps";
import RevenueAndPipeline from "./pages/bde/RevenueAndPipeline";
import CommunicationLog from "./pages/bde/CommunicationLog";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" />} />
          <Route path="/login" element={<Login />} />
          <Route path="/hr-login" element={<Login title="HR Login" />} />

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
              <Route path="rev-trac" element={<MRevenueTracker />} />
              <Route path="tem-trac" element={<TeamRevenueTracker />} />
              <Route path="Sales" element={<SalesTracker />} />
            </Route>
          </Route>

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

          <Route element={<ProtectedRoute role="tl" />}>
            <Route path="/tl" element={<RecruiterLayout sidebarRole="tl" />}>
              <Route index element={<Navigate to="dashboard" />} />
              <Route path="dashboard" element={<RecruiterDashboard />} />
              <Route path="ats-match" element={<RecruiterATSMatch />} />
              <Route path="ats-search" element={<RecruiterATSSearch />} />
              <Route path="data" element={<RecruiterData />} />
              <Route path="rev-trac" element={<RRevenueTracker />} />
              <Route path="reports" element={<RecruiterReports />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute role="bde" />}>
  <Route path="/bde" element={<BDELayout />}>
    <Route index element={<Navigate to="dashboard" />} />

    <Route path="dashboard" element={<BDEDashboard />} />
    <Route path="leads" element={<LeadsManagement />} />
    <Route path="leads/new" element={<LeadsManagement />} />
    <Route path="clients" element={<ClientConversion />} />
    <Route path="clients/:id" element={<ClientConversion />} />
    <Route path="requirements" element={<JobRequirements />} />
    <Route path="requirements/new" element={<JobRequirements />} />
    <Route path="followups" element={<FollowUps />} />
    <Route path="revenue" element={<RevenueAndPipeline />} />
    <Route path="pipeline" element={<RevenueAndPipeline />} />
    <Route path="communications" element={<CommunicationLog />} />
  </Route>
</Route>

          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
