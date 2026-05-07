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
  getRecruiterPerformanceAnalytics,
  getClientPerformance,
  getStatusDistribution,
  getHiringFunnel,
  getFilterOptions,
} from "../../services/reportsService";
import { groupByMonth } from "../../utils/reportHelpers";
import { supabase } from "../../services/supabaseClient";
import { getRoleQueryValues } from "../../utils/roles";

const TABS = ["daily", "weekly", "monthly", "yearly"];
const MANAGER_RELATION_FIELDS = [
  "manager",
  "manager_name",
  "managerName",
  "reporting_manager",
  "reportingManager",
  "reports_to",
  "reportsTo",
  "created_by",
];

const defaultFilters = {
  fromDate: "",
  toDate: "",
  manager: "",
  recruiter: "",
  client: "",
  status: "",
  filterType: "client",
  filterValue: "",
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

const toDateInputValue = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getResolvedDateFilters = (activeTab, filters) => {
  if (activeTab) {
    const { start, end } = getTabRange(activeTab);
    return {
      fromDate: toDateInputValue(start),
      toDate: toDateInputValue(end),
    };
  }

  return {
    fromDate: filters.fromDate,
    toDate: filters.toDate,
  };
};

export default function AdminReports() {
  const [activeTab, setActiveTab] = useState("");
  const [filters, setFilters] = useState(defaultFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [managerOptions, setManagerOptions] = useState([]);
  const [recruiterUsers, setRecruiterUsers] = useState([]);
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
    const selectedClient = filters.filterType === "client" ? filters.filterValue : filters.client;
    const selectedRecruiter = filters.filterType === "recruiter" ? filters.filterValue : filters.recruiter;
    const actor = selectedRecruiter || "";
    const dateFilters = getResolvedDateFilters(activeTab, filters);

    return {
      ...dateFilters,
      client: selectedClient || "",
      recruiter: actor,
      status: filters.status,
      candidateDateField: "record_date",
    };
  }, [activeTab, filters]);

  const loadManagers = useCallback(async () => {
    const [managersRes, recruitersRes] = await Promise.all([
      supabase
        .from("users")
        .select("name,email")
        .in("role", getRoleQueryValues("manager"))
        .order("name", { ascending: true }),
      supabase
        .from("users")
        .select("*")
        .in("role", [...getRoleQueryValues("recruiter"), ...getRoleQueryValues("tl")])
        .order("name", { ascending: true }),
    ]);

    if (managersRes.error || recruitersRes.error) {
      console.error("[hr-reports] user options failed", managersRes.error || recruitersRes.error);
      return;
    }

    setManagerOptions(
      (managersRes.data || []).map((r) => r.name || r.email?.split("@")[0]).filter(Boolean)
    );
    setRecruiterUsers(recruitersRes.data || []);
  }, []);

  const recruiterOptions = useMemo(() => {
    const allRecruiters = options.recruiters || [];
    const selectedManager = String(filters.manager || "").trim().toLowerCase();
    if (!selectedManager) return allRecruiters;

    const teamNames = recruiterUsers
      .filter((row) =>
        MANAGER_RELATION_FIELDS.some((field) => {
          const value = row?.[field];
          if (value == null) return false;
          return String(value).trim().toLowerCase() === selectedManager;
        })
      )
      .map((row) => row.name || row.email?.split("@")?.[0])
      .filter(Boolean);

    if (!teamNames.length) return allRecruiters;

    const allowed = new Set(teamNames.map((name) => String(name).trim().toLowerCase()));
    const filteredRecruiters = allRecruiters.filter((name) =>
      allowed.has(String(name).trim().toLowerCase())
    );

    return filteredRecruiters.length ? filteredRecruiters : teamNames.sort((a, b) => a.localeCompare(b));
  }, [filters.manager, options.recruiters, recruiterUsers]);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const optionFilters = {
        ...serviceFilters,
        client: filters.filterType === "client" ? "" : serviceFilters.client,
        recruiter: filters.filterType === "recruiter" ? "" : serviceFilters.recruiter,
      };

      const [trendRes, recruiterRes, statusRes, funnelRes, clientRes, optionsRes] = await Promise.all([
        getRevenueTrend(serviceFilters),
        getRecruiterPerformanceAnalytics(serviceFilters),
        getStatusDistribution(serviceFilters),
        getHiringFunnel(serviceFilters),
        getClientPerformance(serviceFilters),
        getFilterOptions(optionFilters),
      ]);

      setRevenueTrend(groupByMonth(trendRes, "doj", "margin_value"));
      setRecruiterPerformance(recruiterRes);
      setStatusDistribution(statusRes);
      setHiringFunnel(funnelRes);
      setClientPerformance(clientRes);
      setOptions(optionsRes);

      let query = supabase
        .from("candidate_records")
        .select("record_date,client_name,requirement,recruiter,status");

      if (serviceFilters.fromDate) query = query.gte("record_date", serviceFilters.fromDate);
      if (serviceFilters.toDate) query = query.lte("record_date", serviceFilters.toDate);

      const actor = serviceFilters.recruiter;
      if (actor) query = query.ilike("recruiter", actor);
      if (serviceFilters.client) query = query.eq("client_name", serviceFilters.client);
      if (serviceFilters.status) query = query.eq("status", serviceFilters.status);

      const { data: candidates, error: candidateError } = await query;
      if (candidateError) throw candidateError;

      const rows = candidates || [];

      const dailyMap = new Map();
      rows.forEach((row) => {
        const dateKey = formatDate(row.record_date);
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
      const formatClientName = (name) => {
  return name
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase()); // capitalize
};
const normalize = (name) =>
  name.replace(/\s+/g, "").toLowerCase().trim();
setOptions({
  ...optionsRes,
  clients: Array.from(
    new Map(
      (optionsRes.clients || []).map((c) => {
       const key = normalize(c); // remove spaces + lowercase
        return [key, formatClientName(c)];
      })
    ).values()
  ),
});

      setDailyRows(
        Array.from(dailyMap.values()).map((item) => ({
          date: item.date,
          clientName: item.clientName,
          requirementsAddressed: item.requirementSet.size,
          profilesSubmitted: item.profilesSubmitted,
        }))
      );

      const statuses = rows.map((r) =>
        String(r.status || "")
          .trim()
          .toLowerCase()
          .replace(/\s+/g, " ")
      );
      const contains = (needle) => statuses.filter((s) => s.includes(needle)).length;
      const stats = {
        profileSubmitted: rows.length,
        interviews: statuses.filter((status) =>
          status.includes("interview") ||
          [
            "l1 scheduled",
            "l2 scheduled",
            "ai interview",
            "hr round",
            "interview scheduled",
          ].includes(status)
        ).length,
      };
      const pipelineExcludedStatuses = new Set([
        "joined",
        "closure",
        "closed",
        "l1 reject",
        "l2 reject",
        "final round rejected",
        "drop out by candidate",
        "drop out by client",
        "backout",
      ]);

      setPeriodMetrics({
        profilesSubmitted: stats.profileSubmitted,
        feedbackPending: contains("feedback pending"),
        duplicateProfiles: contains("duplicate"),
        shortlisted: contains("shortlisted"),
        rejected: statuses.filter((s) => s.includes("reject")).length,
        positionHold: statuses.filter((s) => s.includes("position hold") || s.includes("hold")).length,
        interviews: stats.interviews,
        pipeline: statuses.filter((status) => !pipelineExcludedStatuses.has(status)).length,
        closure: trendRes.length,
      });

      const teamMap = new Map();
      rows.forEach((row) => {
        const recruiterRaw = String(row.recruiter || "Unknown").trim() || "Unknown";
        const recruiterKey = recruiterRaw.toLowerCase().replace(/\s+/g, " ");
        const current = teamMap.get(recruiterKey) || {
          recruiter: formatClientName(recruiterRaw),
          profilesSubmitted: 0,
        };
        current.profilesSubmitted += 1;
        teamMap.set(recruiterKey, current);
      });

      setTeamSummary(
        Array.from(teamMap.values())
          .sort((a, b) => b.profilesSubmitted - a.profilesSubmitted)
      );
    } catch (err) {
      console.error("[hr-reports] load failed", err);
      setError(err?.message || "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }, [activeTab, filters, serviceFilters]);

  useEffect(() => {
    loadManagers();
  }, [loadManagers]);

 useEffect(() => {
  const delay = setTimeout(() => {
    loadReports();
  }, 300); // small delay

  return () => clearTimeout(delay);
}, [filters, activeTab]);
const handleFilterChange = (key, value) => {
  if (key === "fromDate" || key === "toDate") {
    setActiveTab("");
  }

  setFilters((prev) => {
    let updated = { ...prev, [key]: value };

    // 👉 Reset logic
    if (key === "filterType") {
      updated.filterValue = "";
      updated.client = "";
      updated.recruiter = "";
    }

    if (key === "filterValue") {
      updated.client = updated.filterType === "client" ? value : "";
      updated.recruiter = updated.filterType === "recruiter" ? value : "";
    }

    if (key === "recruiter") {
      updated.client = "";
      updated.filterType = "recruiter";
      updated.filterValue = value;
    }

    if (key === "manager") {
      updated.recruiter = "";
      updated.client = "";
      updated.filterValue = "";
    }

    return updated;
  });
};

  const handleReset = () => {
    setFilters(defaultFilters);
    setActiveTab("");
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
            onClick={() => setActiveTab((current) => (current === tab ? "" : tab))}
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
        onApply={loadReports}
        onReset={handleReset}
        clients={options.clients}
        recruiters={recruiterOptions}
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
                <h3 style={styles.panelTitle}>
                  {activeTab ? `${activeTab[0].toUpperCase() + activeTab.slice(1)} Metrics` : "All Reports Metrics"}
                </h3>
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
  border: "1px solid #2563eb",
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
