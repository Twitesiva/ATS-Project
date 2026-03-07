import { useCallback, useEffect, useMemo, useState } from "react";
import Loader from "../../components/common/Loader";
import FiltersBar from "../../components/reports/FiltersBar";
import RevenueTrendChart from "../../components/reports/RevenueTrendChart";
import RecruiterPerformanceChart from "../../components/reports/RecruiterPerformanceChart";
import StatusPieChart from "../../components/reports/StatusPieChart";
import HiringFunnelChart from "../../components/reports/HiringFunnelChart";
import ClientPerformanceChart from "../../components/reports/ClientPerformanceChart";
import {
  getRevenueTrend,
  getRecruiterPerformance,
  getClientPerformance,
  getStatusDistribution,
  getHiringFunnel,
  getFilterOptions,
} from "../../services/reportsService";
import { groupByMonth } from "../../utils/reportHelpers";
import { supabase } from "../../services/supabaseClient";
import { getRoleQueryValues } from "../../utils/roles";

const TABS = ["daily", "weekly", "monthly", "yearly"];

const defaultFilters = {
  fromDate: "",
  toDate: "",
  manager: "",
  recruiter: "",
  client: "",
  status: "",
};

const getTabRange = (tab) => {
  const now = new Date();

  if (tab === "daily") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  if (tab === "weekly") {
    const date = new Date(now);
    const day = date.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const start = new Date(date);
    start.setDate(date.getDate() + diffToMonday);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  if (tab === "monthly") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  const start = new Date(now.getFullYear(), 0, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now.getFullYear(), 11, 31);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const formatDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-GB");
};

export default function AdminReports() {
  const [activeTab, setActiveTab] = useState("daily");
  const [filters, setFilters] = useState(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState(defaultFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [managerOptions, setManagerOptions] = useState([]);
  const [options, setOptions] = useState({ clients: [], recruiters: [], statuses: [] });

  const [revenueTrend, setRevenueTrend] = useState([]);
  const [recruiterPerformance, setRecruiterPerformance] = useState([]);
  const [statusDistribution, setStatusDistribution] = useState([]);
  const [hiringFunnel, setHiringFunnel] = useState([]);
  const [clientPerformance, setClientPerformance] = useState([]);

  const [dailyRows, setDailyRows] = useState([]);
  const [periodMetrics, setPeriodMetrics] = useState({
    profilesSubmitted: 0,
    feedbackPending: 0,
    duplicateProfiles: 0,
    shortlisted: 0,
    rejected: 0,
    positionHold: 0,
    interviews: 0,
    pipeline: 0,
    closure: 0,
  });
  const [teamSummary, setTeamSummary] = useState([]);

  const serviceFilters = useMemo(() => {
    const actor = appliedFilters.recruiter || appliedFilters.manager || "";
    return {
      fromDate: appliedFilters.fromDate,
      toDate: appliedFilters.toDate,
      client: appliedFilters.client,
      recruiter: actor,
      status: appliedFilters.status,
    };
  }, [appliedFilters]);

  const loadManagers = useCallback(async () => {
    const { data, error: managersError } = await supabase
      .from("users")
      .select("name,email")
      .in("role", getRoleQueryValues("manager"))
      .order("name", { ascending: true });

    if (managersError) {
      console.error("[hr-reports] manager options failed", managersError);
      return;
    }

    setManagerOptions(
      (data || []).map((r) => r.name || r.email?.split("@")[0]).filter(Boolean)
    );
  }, []);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [trendRes, recruiterRes, statusRes, funnelRes, clientRes, optionsRes] = await Promise.all([
        getRevenueTrend(serviceFilters),
        getRecruiterPerformance(serviceFilters),
        getStatusDistribution(serviceFilters),
        getHiringFunnel(serviceFilters),
        getClientPerformance(serviceFilters),
        getFilterOptions(serviceFilters),
      ]);

      setRevenueTrend(groupByMonth(trendRes, "doj", "margin_value"));
      setRecruiterPerformance(recruiterRes);
      setStatusDistribution(statusRes);
      setHiringFunnel(funnelRes);
      setClientPerformance(clientRes);
      setOptions(optionsRes);

      const baseRange = getTabRange(activeTab);
      const fromDate = appliedFilters.fromDate ? new Date(appliedFilters.fromDate) : baseRange.start;
      fromDate.setHours(0, 0, 0, 0);
      const toDate = appliedFilters.toDate ? new Date(appliedFilters.toDate) : baseRange.end;
      toDate.setHours(23, 59, 59, 999);

      let query = supabase
        .from("candidate_records")
        .select("created_at,client_name,requirement,recruiter,status")
        .gte("created_at", fromDate.toISOString())
        .lte("created_at", toDate.toISOString());

      const actor = serviceFilters.recruiter;
      if (actor) query = query.eq("recruiter", actor);
      if (serviceFilters.client) query = query.eq("client_name", serviceFilters.client);
      if (serviceFilters.status) query = query.eq("status", serviceFilters.status);

      const { data: candidates, error: candidateError } = await query;
      if (candidateError) throw candidateError;

      const rows = candidates || [];

      const dailyMap = new Map();
      rows.forEach((row) => {
        const dateKey = formatDate(row.created_at);
        const client = String(row.client_name || "Unknown").trim() || "Unknown";
        const key = `${dateKey}__${client}`;

        const current = dailyMap.get(key) || {
          date: dateKey,
          clientName: client,
          requirementSet: new Set(),
          profilesSubmitted: 0,
        };

        if (row.requirement) current.requirementSet.add(String(row.requirement).trim());
        current.profilesSubmitted += 1;

        dailyMap.set(key, current);
      });

      setDailyRows(
        Array.from(dailyMap.values()).map((item) => ({
          date: item.date,
          clientName: item.clientName,
          requirementsAddressed: item.requirementSet.size,
          profilesSubmitted: item.profilesSubmitted,
        }))
      );

      const statuses = rows.map((r) => String(r.status || "").toLowerCase());
      const contains = (needle) => statuses.filter((s) => s.includes(needle)).length;

      setPeriodMetrics({
        profilesSubmitted: rows.length,
        feedbackPending: contains("feedback pending"),
        duplicateProfiles: contains("duplicate"),
        shortlisted: contains("shortlisted"),
        rejected: statuses.filter((s) => s.includes("reject")).length,
        positionHold: statuses.filter((s) => s.includes("position hold") || s.includes("hold")).length,
        interviews: contains("interview"),
        pipeline: rows.filter((r) => !["joined", "closure", "closed"].includes(String(r.status || "").toLowerCase())).length,
        closure: statuses.filter((s) => s.includes("joined") || s.includes("closure")).length,
      });

      const teamMap = new Map();
      rows.forEach((row) => {
        const recruiter = String(row.recruiter || "Unknown").trim() || "Unknown";
        teamMap.set(recruiter, (teamMap.get(recruiter) || 0) + 1);
      });

      setTeamSummary(
        Array.from(teamMap.entries())
          .map(([recruiter, profilesSubmitted]) => ({ recruiter, profilesSubmitted }))
          .sort((a, b) => b.profilesSubmitted - a.profilesSubmitted)
      );
    } catch (err) {
      console.error("[hr-reports] load failed", err);
      setError(err?.message || "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }, [activeTab, appliedFilters, serviceFilters]);

  useEffect(() => {
    loadManagers();
  }, [loadManagers]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleApply = () => {
    setAppliedFilters(filters);
  };

  const handleReset = () => {
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
  };

  const metricCards = [
    { label: "Profiles Submitted", value: periodMetrics.profilesSubmitted },
    { label: "Feedback Pending", value: periodMetrics.feedbackPending },
    { label: "Duplicate Profiles", value: periodMetrics.duplicateProfiles },
    { label: "Shortlisted", value: periodMetrics.shortlisted },
    { label: "Rejected", value: periodMetrics.rejected },
    { label: "Position Hold", value: periodMetrics.positionHold },
    { label: "Interviews", value: periodMetrics.interviews },
    { label: "Pipeline", value: periodMetrics.pipeline },
    { label: "Closure", value: periodMetrics.closure },
  ];

  return (
    <div style={styles.page}>
      <h2 style={styles.title}>HR Reports</h2>

      <div style={styles.tabWrap}>
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            style={{ ...styles.tabBtn, ...(activeTab === tab ? styles.activeTab : {}) }}
            onClick={() => setActiveTab(tab)}
          >
            {tab[0].toUpperCase() + tab.slice(1)} Report
          </button>
        ))}
      </div>

      <div style={styles.managerFilterWrap}>
        <select
          value={filters.manager}
          onChange={(e) => handleFilterChange("manager", e.target.value)}
          style={styles.input}
        >
          <option value="">All Managers</option>
          {managerOptions.map((manager) => (
            <option key={manager} value={manager}>
              {manager}
            </option>
          ))}
        </select>
      </div>

      <FiltersBar
        filters={filters}
        onChange={handleFilterChange}
        onApply={handleApply}
        onReset={handleReset}
        clients={options.clients}
        recruiters={options.recruiters}
        statuses={options.statuses}
        showRecruiterFilter
      />

      {loading ? (
        <Loader text="Loading reports..." />
      ) : error ? (
        <div style={styles.error}>{error}</div>
      ) : (
        <>
          <div style={styles.grid2}>
            <RevenueTrendChart data={revenueTrend} />
            <RecruiterPerformanceChart data={recruiterPerformance} />
          </div>

          <div style={styles.grid2}>
            <HiringFunnelChart data={hiringFunnel} />
            <StatusPieChart data={statusDistribution} />
          </div>

          <ClientPerformanceChart data={clientPerformance} />

          {activeTab === "daily" ? (
            <section style={styles.panel}>
              <h3 style={styles.panelTitle}>Daily Report</h3>
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Date</th>
                      <th style={styles.th}>Client Name</th>
                      <th style={styles.th}>Requirements Addressed</th>
                      <th style={styles.th}>Profiles Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyRows.length === 0 ? (
                      <tr>
                        <td style={styles.td} colSpan={4}>No daily rows found.</td>
                      </tr>
                    ) : (
                      dailyRows.map((row, idx) => (
                        <tr key={`${row.date}-${row.clientName}-${idx}`}>
                          <td style={styles.td}>{row.date}</td>
                          <td style={styles.td}>{row.clientName}</td>
                          <td style={styles.td}>{row.requirementsAddressed}</td>
                          <td style={styles.td}>{row.profilesSubmitted}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            <>
              <section style={styles.panel}>
                <h3 style={styles.panelTitle}>{activeTab[0].toUpperCase() + activeTab.slice(1)} Metrics</h3>
                <div style={styles.metricsGrid}>
                  {metricCards.map((card) => (
                    <div key={card.label} style={styles.metricCard}>
                      <p style={styles.metricLabel}>{card.label}</p>
                      <p style={styles.metricValue}>{card.value}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section style={styles.panel}>
                <h3 style={styles.panelTitle}>Team Summary</h3>
                <div style={styles.tableWrap}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Recruiter</th>
                        <th style={styles.th}>Profiles Submitted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teamSummary.length === 0 ? (
                        <tr>
                          <td style={styles.td} colSpan={2}>No team summary found.</td>
                        </tr>
                      ) : (
                        teamSummary.map((row) => (
                          <tr key={row.recruiter}>
                            <td style={styles.td}>{row.recruiter}</td>
                            <td style={styles.td}>{row.profilesSubmitted}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

const styles = {
  page: { display: "flex", flexDirection: "column", gap: "14px" },
  title: { margin: 0, fontSize: "30px", color: "#0f172a" },
  tabWrap: { display: "flex", flexWrap: "wrap", gap: "8px" },
  tabBtn: {
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#0f172a",
    borderRadius: "8px",
    padding: "8px 12px",
    fontWeight: 600,
    cursor: "pointer",
  },
  activeTab: {
    borderColor: "#2563eb",
    color: "#1d4ed8",
    background: "#eff6ff",
  },
  grid2: {
    display: "grid",
    gap: "12px",
    gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
  },
  managerFilterWrap: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    padding: "14px",
  },
  input: {
    width: "100%",
    maxWidth: "320px",
    border: "1px solid #cbd5e1",
    borderRadius: "8px",
    padding: "9px 10px",
    fontSize: "14px",
  },
  panel: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    padding: "14px",
  },
  panelTitle: { margin: "0 0 10px", fontSize: "18px", color: "#0f172a" },
  tableWrap: { overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: "10px" },
  table: { width: "100%", borderCollapse: "collapse", minWidth: "760px" },
  th: { textAlign: "left", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", padding: "10px", fontSize: "13px", color: "#334155" },
  td: { borderBottom: "1px solid #f1f5f9", padding: "10px", fontSize: "14px", color: "#0f172a" },
  metricsGrid: { display: "grid", gap: "10px", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" },
  metricCard: { border: "1px solid #e2e8f0", borderRadius: "10px", padding: "10px" },
  metricLabel: { margin: 0, color: "#64748b", fontSize: "12px", fontWeight: 600 },
  metricValue: { margin: "6px 0 0", color: "#0f172a", fontSize: "24px", fontWeight: 700 },
  error: {
    border: "1px solid #fecaca",
    background: "#fef2f2",
    color: "#b91c1c",
    borderRadius: "10px",
    padding: "10px 12px",
    fontSize: "14px",
  },
};
