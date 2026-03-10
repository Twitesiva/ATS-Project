import { useCallback, useEffect, useState } from "react";
import Loader from "../../components/common/Loader";
import RevenueTrendChart from "../../components/reports/RevenueTrendChart";
import RecruiterPerformanceChart from "../../components/reports/RecruiterPerformanceChart";
import ClientPerformanceChart from "../../components/reports/ClientPerformanceChart";
import StatusPieChart from "../../components/reports/StatusPieChart";
import {
  getRecruiterPerformance,
  getClientPerformance,
  getStatusDistribution,
} from "../../services/reportsService";
import { groupByMonth, sanitizeMarginValue, formatCurrency } from "../../utils/reportHelpers";
import { supabase } from "../../services/supabaseClient";
import { getRoleQueryValues } from "../../utils/roles";

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState({
    totalManagers: 0,
    totalRecruiters: 0,
    totalTls: 0,
    totalCandidates: 0,
    totalClients: 0,
    totalRevenue: 0,
  });

  const [recruiterPerformance, setRecruiterPerformance] = useState([]);
  const [clientPerformance, setClientPerformance] = useState([]);
  const [statusDistribution, setStatusDistribution] = useState([]);
  const [monthlyHiringTrend, setMonthlyHiringTrend] = useState([]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);

    const [
      managersRes,
      recruitersRes,
      tlRes,
      candidatesRes,
      clientsRes,
      revenueRes,
      candidateDatesRes,
      recruiterPerfRes,
      clientPerfRes,
      statusDistRes,
    ] = await Promise.all([
      supabase.from("users").select("*", { count: "exact" }).in("role", getRoleQueryValues("manager")),
      supabase.from("users").select("*", { count: "exact" }).in("role", getRoleQueryValues("recruiter")),
      supabase.from("users").select("*", { count: "exact" }).in("role", getRoleQueryValues("tl")),
      supabase.from("candidate_records").select("*", { count: "exact" }),
      supabase.from("candidate_records").select("client_name"),
      supabase.from("revenue_tracker").select("margin_value"),
      supabase.from("candidate_records").select("created_at").order("created_at", { ascending: true }),
      getRecruiterPerformance({}),
      getClientPerformance({}),
      getStatusDistribution({}),
    ]);

    const firstError =
      managersRes.error ||
      recruitersRes.error ||
      tlRes.error ||
      candidatesRes.error ||
      clientsRes.error ||
      revenueRes.error ||
      candidateDatesRes.error;

    if (firstError) {
      console.error("[admin-dashboard] failed", firstError);
      setLoading(false);
      return;
    }

    const uniqueClients = new Set(
      (clientsRes.data || [])
        .map((row) => String(row.client_name || "").trim())
        .filter(Boolean)
    );

    const totalRevenue = (revenueRes.data || []).reduce(
      (sum, row) => sum + sanitizeMarginValue(row.margin_value),
      0
    );

    setKpis({
      totalManagers: managersRes.count || 0,
      totalRecruiters: recruitersRes.count || 0,
      totalTls: tlRes.count || 0,
      totalCandidates: candidatesRes.count || 0,
      totalClients: uniqueClients.size,
      totalRevenue,
    });

    const topRecruiters = (recruiterPerfRes || [])
      .slice()
      .sort((a, b) => b.candidates - a.candidates)
      .slice(0, 8);

    const topClients = (clientPerfRes || [])
      .slice()
      .sort((a, b) => b.candidates - a.candidates)
      .slice(0, 8);

    setRecruiterPerformance(topRecruiters);
    setClientPerformance(topClients);
    setStatusDistribution(statusDistRes || []);
    setMonthlyHiringTrend(groupByMonth(candidateDatesRes.data || [], "created_at"));

    setLoading(false);
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  if (loading) return <Loader text="Loading HR dashboard..." />;

  const cards = [
    { title: "Total Managers", value: kpis.totalManagers },
    { title: "Total Recruiters", value: kpis.totalRecruiters },
    { title: "Total TLs", value: kpis.totalTls },
    { title: "Total Candidates", value: kpis.totalCandidates },
    { title: "Total Clients", value: kpis.totalClients },
    { title: "Total Revenue", value: formatCurrency(kpis.totalRevenue) },
  ];

  return (
    <div style={styles.page}>
      <h2 style={styles.title}>HR Dashboard</h2>

      <div style={styles.kpiGrid}>
        {cards.map((card) => (
          <div key={card.title} style={styles.kpiCard}>
            <p style={styles.kpiLabel}>{card.title}</p>
            <p style={styles.kpiValue}>{card.value}</p>
          </div>
        ))}
      </div>

      <div style={styles.chartGrid}>
        <RecruiterPerformanceChart data={recruiterPerformance} />
        <ClientPerformanceChart data={clientPerformance} />
      </div>

      <div style={styles.chartGrid}>
        <StatusPieChart data={statusDistribution} />
        <RevenueTrendChart data={monthlyHiringTrend} />
      </div>
    </div>
  );
}

const styles = {
  page: { display: "flex", flexDirection: "column", gap: "14px" },
  title: { margin: 0, fontSize: "30px", color: "#0f172a" },
  kpiGrid: {
    display: "grid",
    gap: "12px",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  },
  kpiCard: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    padding: "14px",
  },
  kpiLabel: { margin: 0, color: "#64748b", fontWeight: 600, fontSize: "13px" },
  kpiValue: { margin: "8px 0 0", color: "#0f172a", fontSize: "28px", fontWeight: 700 },
  chartGrid: {
    display: "grid",
    gap: "12px",
    gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
  },
};
