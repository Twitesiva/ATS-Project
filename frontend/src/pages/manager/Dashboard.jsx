import { useCallback, useEffect, useState } from "react";
import Loader from "../../components/common/Loader";
import { supabase } from "../../services/supabaseClient";
import {
  getRecruiterPerformance
} from "../../services/reportsService";
// FIX: parseRevenueValue added — it is used in loadDashboardKPIs
import { normalizeRecruiter, parseRevenueValue } from "../../utils/reportHelpers";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const INTERVIEW_STATUSES = new Set([
  "L1 Scheduled",
  "L2 Scheduled",
  "AI Interview",
  "Assessment Round",
  "HR Round",
  "Interview Scheduled",
]);
const EXCLUDED_STATUSES = [
  "Closure",
  "Drop Out",
  "Drop Out By Client",
  "Drop Out By Candidate",
  "Backout",
  "Back Out",
 
];
const getMonthBounds = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
  };
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  const [kpis, setKpis] = useState({
    totalActiveCandidates: 0,
    totalOpenPositions: 0,
    totalInterviewsScheduled: 0,
    totalClosuresThisMonth: 0,
    revenueThisMonth: 0,
    overallMarginPercent: 0,
  });
  const [recruiterAnalytics, setRecruiterAnalytics] = useState([]);
  const [hoveredCard, setHoveredCard] = useState(null);
  const [selectedRecruiter, setSelectedRecruiter] = useState("all");
  const [activeIndex, setActiveIndex] = useState(null);
  const [selectedMetric, setSelectedMetric] = useState(null);

  const loadDashboardKPIs = useCallback(async () => {
    setLoading(true);
    const { start, end } = getMonthBounds();

    const [
      activeCandidatesRes,
      openPositionsRes,
      interviewHistoryRes,
      closureHistoryRes,
      revenueRes,
      overallMarginRes,
    ] = await Promise.all([
      supabase
        .from("candidate_records")
        .select("*", { count: "exact" })
        .not("status", "in", "(Closure,Drop Out By Client,Drop Out By Candidate,Backout,Position Closed,L1 Reject,L2 Reject,Final Round Rejected)"),
      supabase.from("client_records").select("number_of_openings,closure"),
      supabase
        .from("candidate_records")
        .select("*", { count: "exact" })
        .in("status", [
          "L1 Scheduled",
          "L2 Scheduled",
          "AI Interview",
          "Assessment Round",
          "HR Round",
          "Interview Scheduled",
        ]),
      supabase
        .from("revenue_tracker")
        .select("*", { count: "exact" })
        .gte("doj", start)
        .lte("doj", end),
      supabase
        .from("revenue_tracker")
        .select("margin_value,doj")
        .gte("doj", start)
        .lte("doj", end),
      supabase.from("revenue_tracker").select("margin_value,billing_rate"),
    ]);

    const errors = [
      activeCandidatesRes.error,
      openPositionsRes.error,
      interviewHistoryRes.error,
      closureHistoryRes.error,
      revenueRes.error,
      overallMarginRes.error,
    ].filter(Boolean);

    if (errors.length) {
      console.error("Failed to load dashboard KPIs", errors);
      setLoading(false);
      return;
    }

    const totalOpenPositions = (openPositionsRes.data || []).reduce(
      (sum, row) => sum + toNumber(row.number_of_openings) - toNumber(row.closure),
      0
    );

    const revenueThisMonth = (revenueRes.data || []).reduce(
      (sum, row) => sum + parseRevenueValue(row.margin_value),
      0
    );

    const overallSums = (overallMarginRes.data || []).reduce(
      (acc, row) => {
        acc.margin += parseRevenueValue(row.margin_value);
        acc.billingRate += parseRevenueValue(row.billing_rate);
        return acc;
      },
      { margin: 0, billingRate: 0 }
    );

    const overallMarginPercent =
      overallSums.billingRate > 0
        ? (overallSums.margin / overallSums.billingRate) * 100
        : 0;

    setKpis({
      totalActiveCandidates: activeCandidatesRes.count || 0,
      totalOpenPositions,
      totalInterviewsScheduled: interviewHistoryRes.count || 0,
      totalClosuresThisMonth: closureHistoryRes.count || 0,
      revenueThisMonth,
      overallMarginPercent,
    });

    setLoading(false);
  }, []);

  const loadRecruiterAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);

    const [recruiterPerf, revenueRes] = await Promise.all([
      getRecruiterPerformance({}),
      supabase.from("revenue_tracker").select("recruiter_name, margin_value"),
    ]);

    // Build revenue and closures map from revenue_tracker
    const revenueMap = {};
    const closuresMap = {};
    (revenueRes.data || []).forEach((row) => {
      const name = normalizeRecruiter(row.recruiter_name);
      if (!revenueMap[name]) revenueMap[name] = 0;
      if (!closuresMap[name]) closuresMap[name] = 0;
      revenueMap[name] += parseRevenueValue(row.margin_value);
      closuresMap[name] += 1;
    });

    // Transform: candidates/interviews from getRecruiterPerformance,
    // closures and revenue from revenue_tracker
    const transformed = recruiterPerf.map(r => ({
      ...r,
      candidatesAdded: r.candidates ?? r.candidatesAdded ?? 0,
      closures: closuresMap[normalizeRecruiter(r.recruiter)] ?? 0,
      revenue: revenueMap[normalizeRecruiter(r.recruiter)] ?? 0,
    }));

    // Also add any recruiters present in revenue_tracker but missing from getRecruiterPerformance
    const existingNames = new Set(transformed.map(r => normalizeRecruiter(r.recruiter)));
    Object.keys(revenueMap).forEach(name => {
      if (!existingNames.has(name)) {
        transformed.push({
          recruiter: name,
          candidatesAdded: 0,
          interviews: 0,
          closures: closuresMap[name] ?? 0,
          revenue: revenueMap[name] ?? 0,
        });
      }
    });

    // Sort alphabetically
    transformed.sort((a, b) => a.recruiter.localeCompare(b.recruiter));

    console.log("Recruiter analytics:", transformed);
    setRecruiterAnalytics(transformed);
    setAnalyticsLoading(false);
  }, []);

  useEffect(() => {
    loadDashboardKPIs();

    const channel = supabase
      .channel("manager-dashboard-kpi")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "candidate_records" },
        loadDashboardKPIs
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "client_records" },
        loadDashboardKPIs
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "revenue_tracker" },
        loadDashboardKPIs
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "status_history" },
        loadDashboardKPIs
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadDashboardKPIs]);

  useEffect(() => {
    loadRecruiterAnalytics();

    const analyticsChannel = supabase
      .channel("manager-dashboard-recruiter-analytics")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "candidate_records" },
        loadRecruiterAnalytics
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "revenue_tracker" },
        loadRecruiterAnalytics
      )
      .subscribe();

    return () => {
      supabase.removeChannel(analyticsChannel);
    };
  }, [loadRecruiterAnalytics]);

  if (loading) {
    return <Loader text="Loading dashboard KPIs..." />;
  }

  const cards = [
    {
      title: "Total Active Candidates",
      value: kpis.totalActiveCandidates,
      subtitle: "Candidates not joined yet",
    },
    {
      title: "Total Interviews Scheduled",
      value: kpis.totalInterviewsScheduled,
      subtitle: "Candidates in interview stage",
    },
    {
      title: "Total Closures (This Month)",
      value: kpis.totalClosuresThisMonth,
      subtitle: "Joined this month",
    },
    {
      title: "Revenue This Month",
      value: `INR ${kpis.revenueThisMonth.toLocaleString("en-IN")}`,
      subtitle: "Sum of margin value this month",
    },
  ];

  if (loading) {
    return <Loader text="Loading dashboard KPIs..." />;
  }

  return (
    <div>
      <h2 style={{ marginBottom: "16px" }}>Manager Dashboard</h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: "14px",
        }}
      >
        {cards.map((card) => (
          <div
            key={card.title}
            onMouseEnter={() => setHoveredCard(card.title)}
            onMouseLeave={() => setHoveredCard(null)}
            style={{
              background: hoveredCard === card.title ? "#f0f4ff" : "#fff",
              border: hoveredCard === card.title ? "2px solid #1e40af" : "1px solid #e2e8f0",
              borderRadius: "12px",
              padding: "16px",
              boxShadow: hoveredCard === card.title
                ? "0 8px 16px rgba(30, 64, 175, 0.15)"
                : "0 2px 8px rgba(15, 23, 42, 0.06)",
              transition: "all 0.2s ease",
              cursor: "pointer",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: "14px",
                color: "#475569",
                fontWeight: 600,
              }}
            >
              {card.title}
            </p>
            <p
              style={{
                margin: "8px 0 6px",
                fontSize: "30px",
                lineHeight: 1.1,
                fontWeight: 700,
                color: "#0f172a",
              }}
            >
              {card.value}
            </p>
            <p style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>
              {card.subtitle}
            </p>
          </div>
        ))}
      </div>

      <section style={styles.analyticsSection}>
        <h3 style={styles.analyticsTitle}>Recruiter Performance Analytics</h3>

        {analyticsLoading ? (
          <div style={styles.analyticsLoaderWrap}>
            <Loader text="Loading recruiter analytics..." />
          </div>
        ) : recruiterAnalytics.length === 0 ? (
          <div style={styles.emptyState}>No recruiter analytics found.</div>
        ) : (

          <div style={styles.chartsContainer}>
            {/* Left: Bar Chart */}
            <div style={styles.chartWrapper}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h4 style={styles.chartTitle}>Recruiter Performance Overview</h4>
                <div style={{ display: "flex", gap: "10px" }}>
                  {selectedMetric && (
                    <button
                      onClick={() => setSelectedMetric(null)}
                      style={{
                        padding: "6px 12px",
                        background: "#f59e0b",
                        color: "#fff",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontSize: "12px",
                        fontWeight: 600,
                      }}
                    >
                      Reset Metric
                    </button>
                  )}
                  {selectedRecruiter !== "all" && (
                    <button
                      onClick={() => setSelectedRecruiter("all")}
                      style={{
                        padding: "6px 12px",
                        background: "#1e40af",
                        color: "#fff",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontSize: "12px",
                        fontWeight: 600,
                      }}
                    >
                      Reset Recruiter
                    </button>
                  )}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={430}>
                <BarChart
                  data={selectedRecruiter === "all" ? recruiterAnalytics : recruiterAnalytics.filter(r => r.recruiter === selectedRecruiter)}
                  margin={{ top: 30, right: 30, left: 0, bottom: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="recruiter"
                    angle={-45}
                    textAnchor="end"
                    height={100}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "#fff",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                    }}
                    formatter={(value) => value}
                    cursor={{ fill: "rgba(30, 64, 175, 0.1)" }}
                  />
                  <Legend
                    wrapperStyle={{ paddingTop: "20px" }}
                    onClick={(e) => {
                      const key = e.dataKey;
                      setSelectedMetric(selectedMetric === key ? null : key);
                    }}
                    style={{ cursor: "pointer" }}
                  />
                  {(selectedMetric === null || selectedMetric === "candidatesAdded") && (
                    <Bar dataKey="candidatesAdded" fill="#1e40af" name="Candidates Added" />
                  )}
                  {(selectedMetric === null || selectedMetric === "interviews") && (
                    <Bar dataKey="interviews" fill="#f59e0b" name="Interviews" />
                  )}
                  {(selectedMetric === null || selectedMetric === "closures") && (
                    <Bar dataKey="closures" fill="#10b981" name="Closures" />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Right: Pie Chart */}
            <div style={styles.chartWrapper}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h4 style={styles.chartTitle}>Revenue Contribution by Recruiter</h4>
                {selectedRecruiter !== "all" && (
                  <button
                    onClick={() => setSelectedRecruiter("all")}
                    style={{
                      padding: "6px 12px",
                      background: "#10b981",
                      color: "#fff",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontWeight: 600,
                    }}
                  >
                    Show All Recruiters
                  </button>
                )}
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={selectedRecruiter === "all" ? recruiterAnalytics : recruiterAnalytics.filter(r => r.recruiter === selectedRecruiter)}
                    dataKey="revenue"
                    nameKey="recruiter"
                    cx="50%"
                    cy="50%"
                    innerRadius={80}
                    outerRadius={130}
                    paddingAngle={2}
                    label={false}
                    onMouseEnter={(_, index) => setActiveIndex(index)}
                    onMouseLeave={() => setActiveIndex(null)}
                    onClick={(data) => {
                      setSelectedRecruiter(selectedRecruiter === data.recruiter ? "all" : data.recruiter);
                    }}
                  >
                    {(selectedRecruiter === "all" ? recruiterAnalytics : recruiterAnalytics.filter(r => r.recruiter === selectedRecruiter)).map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                        opacity={activeIndex === null || index === activeIndex ? 1 : 0.5}
                        style={{
                          filter: index === activeIndex ? "drop-shadow(0 0 12px rgba(0, 0, 0, 0.3))" : "none",
                          transition: "all 0.3s ease",
                          cursor: "pointer",
                          transform: index === activeIndex ? "scale(1.05)" : "scale(1)",
                          transformOrigin: "center",
                        }}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "#fff",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                    }}
                    formatter={(value) => `INR ${value.toLocaleString("en-IN")}`}
                    labelFormatter={(label) => `Recruiter: ${label}`}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    wrapperStyle={{ paddingTop: "20px", cursor: "pointer" }}
                    onMouseEnter={(e) => {
                      const index = recruiterAnalytics.findIndex(
                        (r) => r.recruiter === e.dataKey
                      );
                      setActiveIndex(index);
                    }}
                    onMouseLeave={() => setActiveIndex(null)}
                    onClick={(e) => {
                      setSelectedRecruiter(selectedRecruiter === e.dataKey ? "all" : e.dataKey);
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div style={styles.centerLabel}>
                <div style={styles.totalRevenue}>
                  INR {recruiterAnalytics
                    .reduce((sum, r) => sum + (Number(r.revenue) || 0), 0)
                    .toLocaleString("en-IN")}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

const COLORS = ["#1e40af", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

const styles = {
  analyticsSection: {
    marginTop: "22px",
  },
  analyticsTitle: {
    margin: "0 0 12px",
    fontSize: "20px",
    fontWeight: 700,
    color: "#0f172a",
  },
  analyticsLoaderWrap: {
    minHeight: "140px",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    background: "#fff",
  },
  emptyState: {
    padding: "18px",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    background: "#fff",
    color: "#64748b",
    fontSize: "14px",
  },
  chartsContainer: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "20px",
  },
  chartWrapper: {
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    background: "#fff",
    padding: "18px",
    position: "relative",
  },
  chartTitle: {
    margin: "0 0 16px",
    fontSize: "16px",
    fontWeight: 600,
    color: "#0f172a",
  },
  centerLabel: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    textAlign: "center",
    width: "100%",
    pointerEvents: "none",
  },
  totalRevenue: {
    fontSize: "20px",
    fontWeight: 700,
    color: "#0f172a",
  },
  tableWrap: {
    overflowX: "auto",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    background: "#fff",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: "760px",
  },
  th: {
    textAlign: "left",
    padding: "12px 14px",
    fontSize: "13px",
    fontWeight: 700,
    color: "#334155",
    background: "#f8fafc",
    borderBottom: "1px solid #e2e8f0",
    position: "sticky",
    top: 0,
    zIndex: 1,
  },
  td: {
    padding: "12px 14px",
    fontSize: "14px",
    color: "#0f172a",
    borderBottom: "1px solid #e2e8f0",
  },
  clientIntelSection: {
    marginTop: "22px",
  },
  clientIntelTitle: {
    margin: "0 0 12px",
    fontSize: "20px",
    fontWeight: 700,
    color: "#0f172a",
  },
  clientIntelLoaderWrap: {
    minHeight: "140px",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    background: "#fff",
  },
  clientGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "14px",
  },
  clientCard: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    padding: "16px",
    boxShadow: "0 2px 8px rgba(15, 23, 42, 0.06)",
  },
  clientCardTitle: {
    margin: 0,
    fontSize: "14px",
    color: "#475569",
    fontWeight: 600,
  },
  clientName: {
    margin: "8px 0 6px",
    fontSize: "26px",
    lineHeight: 1.1,
    fontWeight: 700,
    color: "#0f172a",
  },
  clientMetric: {
    margin: 0,
    fontSize: "12px",
    color: "#64748b",
    fontWeight: 600,
  },
  riskSection: {
    marginTop: "22px",
  },
  riskTitle: {
    margin: "0 0 12px",
    fontSize: "20px",
    fontWeight: 700,
    color: "#0f172a",
  },
  riskLoaderWrap: {
    minHeight: "140px",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    background: "#fff",
  },
  riskGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "14px",
  },
  riskCard: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    padding: "16px",
    boxShadow: "0 2px 8px rgba(15, 23, 42, 0.06)",
  },
  riskCardTitle: {
    margin: 0,
    fontSize: "14px",
    color: "#475569",
    fontWeight: 600,
  },
  riskValue: {
    margin: "8px 0 6px",
    fontSize: "30px",
    lineHeight: 1.1,
    fontWeight: 700,
    color: "#0f172a",
  },
  riskSub: {
    margin: 0,
    fontSize: "12px",
    color: "#64748b",
  },
};
