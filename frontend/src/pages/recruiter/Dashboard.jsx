import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Loader from "../../components/common/Loader";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../services/supabaseClient";
import { formatCurrency, sanitizeMarginValue } from "../../utils/reportHelpers";

const STATUS_COLORS = [
  "#0f766e",
  "#2563eb",
  "#f59e0b",
  "#16a34a",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#475569",
];

const INTERVIEW_STATUSES = new Set([
  "L1 Scheduled",
  "L2 Scheduled",
  "AI Interview",
  "Assessment Round",
  "HR Round",
]);

const REJECTED_STATUSES = new Set([
  "L1 Reject",
  "L2 Reject",
  "Final Round Rejected",
  "Drop Out By Client",
  "Drop Out By Candidate",
]);

const emptyDashboard = {
  kpis: [],
  hiringFunnel: [],
  activity: [],
  clientPerformance: [],
  statusDistribution: [],
  revenueAnalytics: [],
  efficiencyMetrics: [],
};

const normalizeText = (value) => String(value || "").trim().toLowerCase();

const toDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toDateKey = (value) => {
  const date = toDate(value);
  if (!date) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toShortDayLabel = (value) => {
  const date = toDate(value);
  if (!date) return "";
  return date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric" });
};

const getLastSevenDays = () => {
  const days = [];
  const today = new Date();

  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    days.push({
      key: toDateKey(date),
      label: toShortDayLabel(date),
    });
  }

  return days;
};

const getCurrentMonthKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const toMonthKey = (value) => {
  const date = toDate(value);
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const isInterviewStatus = (status) => {
  const normalizedStatus = normalizeText(status);
  return Array.from(INTERVIEW_STATUSES).some(
    (allowedStatus) => normalizeText(allowedStatus) === normalizedStatus
  );
};

const formatPercent = (value) => `${Number(value || 0).toFixed(1)}%`;

const formatRatio = (value) => {
  if (!Number.isFinite(value) || value <= 0) return "0.0 : 1";
  return `${value.toFixed(1)} : 1`;
};

const getRollingMonthlyTarget = (revenueRows) => {
  const monthlyRevenue = new Map();

  (revenueRows || []).forEach((row) => {
    const monthKey = toMonthKey(row.doj);
    if (!monthKey) return;
    monthlyRevenue.set(
      monthKey,
      (monthlyRevenue.get(monthKey) || 0) + sanitizeMarginValue(row.margin_value)
    );
  });

  const currentMonthKey = getCurrentMonthKey();
  const priorMonths = Array.from(monthlyRevenue.entries())
    .filter(([month]) => month !== currentMonthKey)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-3);

  if (priorMonths.length > 0) {
    return priorMonths.reduce((sum, [, revenue]) => sum + revenue, 0) / priorMonths.length;
  }

  return monthlyRevenue.get(currentMonthKey) || 0;
};

const getRevenueMatchKey = (candidateName, clientName) =>
  `${normalizeText(candidateName)}::${normalizeText(clientName)}`;

const buildDashboardData = (candidateRows, revenueRows) => {
  const candidates = candidateRows || [];
  const revenue = revenueRows || [];

  const interviewsScheduled = candidates.filter((row) => isInterviewStatus(row.status)).length;
  const offers = candidates.filter((row) => String(row.status || "").trim() === "Offered").length;
  const activeClients = new Set(
    candidates.map((row) => String(row.client_name || "").trim()).filter(Boolean)
  ).size;

  const funnelStages = [
    "Profile Submitted",
    "Shortlisted",
    "Interview Stage",
    "Offered",
    "Rejected",
  ];
  const funnelMap = new Map([
    ["Profile Submitted", 0],
    ["Shortlisted", 0],
    ["Interview Stage", 0],
    ["Offered", 0],
    ["Rejected", 0],
  ]);
  candidates.forEach((row) => {
    const status = String(row.status || "").trim();
    const normalizedStatus = normalizeText(status);

    if (status === "Profile Submitted") {
      funnelMap.set("Profile Submitted", (funnelMap.get("Profile Submitted") || 0) + 1);
    }
    if (status === "Shortlisted") {
      funnelMap.set("Shortlisted", (funnelMap.get("Shortlisted") || 0) + 1);
    }
    if (isInterviewStatus(status)) {
      funnelMap.set("Interview Stage", (funnelMap.get("Interview Stage") || 0) + 1);
    }
    if (status === "Offered") {
      funnelMap.set("Offered", (funnelMap.get("Offered") || 0) + 1);
    }
    if (
      REJECTED_STATUSES.has(status) ||
      Array.from(REJECTED_STATUSES).some(
        (rejectedStatus) => normalizeText(rejectedStatus) === normalizedStatus
      )
    ) {
      funnelMap.set("Rejected", (funnelMap.get("Rejected") || 0) + 1);
    }
  });

  const activityMap = new Map(
    getLastSevenDays().map((day) => [
      day.key,
      { label: day.label, added: 0, interviews: 0 },
    ])
  );

  candidates.forEach((row) => {
    const addedKey = toDateKey(row.record_date || row.created_at);
    if (activityMap.has(addedKey)) {
      activityMap.get(addedKey).added += 1;
      if (isInterviewStatus(row.status)) {
        activityMap.get(addedKey).interviews += 1;
      }
    }
  });

  const clientMap = new Map();
  candidates.forEach((row) => {
    const client = String(row.client_name || "Unknown").trim() || "Unknown";
    const current = clientMap.get(client) || { client, candidates: 0 };
    current.candidates += 1;
    clientMap.set(client, current);
  });

  const statusMap = new Map();
  candidates.forEach((row) => {
    const status = String(row.status || "Unknown").trim() || "Unknown";
    statusMap.set(status, (statusMap.get(status) || 0) + 1);
  });

  const totalRevenue = revenue.reduce(
    (sum, row) => sum + sanitizeMarginValue(row.margin_value),
    0
  );
  const avgMargin =
    revenue.length > 0
      ? revenue.reduce((sum, row) => {
          const storedPercent = Number(row.margin_percent);
          if (Number.isFinite(storedPercent)) return sum + storedPercent;

          const billing = sanitizeMarginValue(row.billing_rate);
          const margin = sanitizeMarginValue(row.margin_value);
          return sum + (billing > 0 ? (margin / billing) * 100 : 0);
        }, 0) / revenue.length
      : 0;
  const avgBillingRate =
    revenue.length > 0
      ? revenue.reduce((sum, row) => sum + sanitizeMarginValue(row.billing_rate), 0) / revenue.length
      : 0;

  return {
    kpis: [
      {
        label: "Candidates Added",
        value: candidates.length.toLocaleString("en-IN"),
        note: "Count of Monthly Report rows",
      },
      {
        label: "Interviews Scheduled",
        value: interviewsScheduled.toLocaleString("en-IN"),
        note: "Monthly Report interview-stage statuses",
      },
      {
        label: "Offers",
        value: offers.toLocaleString("en-IN"),
        note: "Monthly Report status = Offered",
      },
      {
        label: "Active Clients",
        value: activeClients.toLocaleString("en-IN"),
        note: "Distinct clients in Monthly Report",
      },
    ],
    hiringFunnel: funnelStages.map((stage) => ({
      stage,
      value: funnelMap.get(stage) || 0,
    })),
    activity: Array.from(activityMap.values()),
    clientPerformance: Array.from(clientMap.values())
      .sort((a, b) => {
        if (b.candidates !== a.candidates) return b.candidates - a.candidates;
        return a.client.localeCompare(b.client);
      })
      .slice(0, 6),
    statusDistribution: Array.from(statusMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value),
    revenueAnalytics: [
      {
        label: "Total Revenue",
        value: formatCurrency(totalRevenue),
        note: "Sum of Revenue Tracker margin values",
      },
      {
        label: "Average Margin %",
        value: formatPercent(avgMargin),
        note: "Average Revenue Tracker margin percent",
      },
      {
        label: "Average Billing Rate",
        value: formatCurrency(avgBillingRate),
        note: "Average Revenue Tracker billing rate",
      },
      {
        label: "Total Revenue Records",
        value: revenue.length.toLocaleString("en-IN"),
        note: "Count of Revenue Tracker rows",
      },
    ],
    efficiencyMetrics: [],
  };
};

export default function RecruiterDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dashboard, setDashboard] = useState(emptyDashboard);

  const recruiterName = useMemo(() => user?.name || "", [user?.name]);

  const loadDashboard = useCallback(async () => {
    if (!recruiterName) {
      setDashboard(emptyDashboard);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    const [candidateRes, revenueRes] = await Promise.all([
      supabase
        .from("candidate_records")
        .select(
          "id,status,record_date,created_at,updated_at,interview_date,candidate_name,client_name"
        )
        .eq("recruiter", recruiterName),
      supabase
        .from("revenue_tracker")
        .select(
          "id,candidate_name,client_name,margin_value,margin_percent,billing_rate,doj"
        )
        .eq("recruiter_name", recruiterName),
    ]);

    const queryError = candidateRes.error || revenueRes.error;
    if (queryError) {
      console.error("Failed to load recruiter analytics dashboard", queryError);
      setError(queryError.message || "Failed to load recruiter analytics");
      setDashboard(emptyDashboard);
      setLoading(false);
      return;
    }

    setDashboard(buildDashboardData(candidateRes.data, revenueRes.data));
    setLoading(false);
  }, [recruiterName]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (!recruiterName) return undefined;

    const channel = supabase
      .channel("recruiter-analytics-dashboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "candidate_records" },
        loadDashboard
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "revenue_tracker" },
        loadDashboard
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadDashboard, recruiterName]);

  if (loading) {
    return <Loader text="Loading recruiter analytics..." />;
  }

  if (error) {
    return <div style={styles.error}>{error}</div>;
  }

  return (
    <div style={styles.page}>
      <div style={styles.heroCard}>
        <div>
          <h2 style={styles.title}>Recruiter Analytics Dashboard</h2>
          <p style={styles.subtitle}>
            Read-only analytics sourced from Profile Database, Monthly Report, Revenue Tracker,
            and Reports.
          </p>
        </div>
        <div style={styles.sourcePills}>
          {["Profile Database", "Monthly Report", "Revenue Tracker", "Reports"].map((label) => (
            <span key={label} style={styles.sourcePill}>
              {label}
            </span>
          ))}
        </div>
      </div>

      <section style={styles.section}>
        <SectionHeader title="KPI Overview" subtitle="Core recruiter performance indicators" />
        <div style={styles.cardGrid4}>
          {dashboard.kpis.map((card) => (
            <MetricCard key={card.label} {...card} accent="teal" />
          ))}
        </div>
      </section>

      <div style={styles.chartGrid}>
        <ChartCard
          title="Hiring Funnel"
          subtitle="Profile submitted, shortlisted, interview, offered, and rejected stages"
        >
          <div style={styles.chartWrap}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dashboard.hiringFunnel}>
                <CartesianGrid strokeDasharray="3 3" stroke="#dbe4f0" />
                <XAxis dataKey="stage" tick={{ fill: "#4b5563", fontSize: 12 }} />
                <YAxis tick={{ fill: "#4b5563", fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#0f766e" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Recruitment Activity Chart"
          subtitle="Last 7 days candidate additions and interview scheduling"
        >
          <div style={styles.chartWrap}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dashboard.activity}>
                <CartesianGrid strokeDasharray="3 3" stroke="#dbe4f0" />
                <XAxis dataKey="label" tick={{ fill: "#4b5563", fontSize: 12 }} />
                <YAxis tick={{ fill: "#4b5563", fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="added"
                  name="Candidates Added"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                />
                <Line
                  type="monotone"
                  dataKey="interviews"
                  name="Interviews Scheduled"
                  stroke="#f59e0b"
                  strokeWidth={2.5}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <div style={styles.chartGrid}>
        <ChartCard
          title="Client Submission Volume"
          subtitle="Candidate submissions grouped by client"
        >
          <div style={styles.chartWrap}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dashboard.clientPerformance}>
                <CartesianGrid strokeDasharray="3 3" stroke="#dbe4f0" />
                <XAxis dataKey="client" tick={{ fill: "#4b5563", fontSize: 12 }} />
                <YAxis tick={{ fill: "#4b5563", fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="candidates"
                  name="Candidate Submissions"
                  fill="#2563eb"
                  radius={[8, 8, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Candidate Status Distribution Chart"
          subtitle="Current recruiter pipeline by status"
        >
          <div style={styles.chartWrap}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={dashboard.statusDistribution}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={100}
                  innerRadius={52}
                  paddingAngle={2}
                >
                  {dashboard.statusDistribution.map((entry, index) => (
                    <Cell
                      key={`${entry.name}-${index}`}
                      fill={STATUS_COLORS[index % STATUS_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <section style={styles.section}>
        <SectionHeader
          title="Revenue Analytics"
          subtitle="Revenue tracker performance and target progress"
        />
        <div style={styles.cardGrid4}>
          {dashboard.revenueAnalytics.map((card) => (
            <MetricCard key={card.label} {...card} accent="blue" />
          ))}
        </div>
      </section>

      {dashboard.efficiencyMetrics.length > 0 ? (
        <section style={styles.section}>
          <SectionHeader
            title="Hiring Efficiency Metrics"
            subtitle="Cycle speed, conversion, and acceptance analytics"
          />
          <div style={styles.cardGrid3}>
            {dashboard.efficiencyMetrics.map((card) => (
              <MetricCard key={card.label} {...card} accent="amber" />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div style={styles.sectionHeader}>
      <h3 style={styles.sectionTitle}>{title}</h3>
      <p style={styles.sectionSubtitle}>{subtitle}</p>
    </div>
  );
}

function MetricCard({ label, value, note, accent }) {
  const accentStyle = accent === "blue" ? styles.accentBlue : accent === "amber" ? styles.accentAmber : styles.accentTeal;

  return (
    <div style={{ ...styles.metricCard, ...accentStyle }}>
      <p style={styles.metricLabel}>{label}</p>
      <p style={styles.metricValue}>{value}</p>
      <p style={styles.metricNote}>{note}</p>
    </div>
  );
}

function ChartCard({ title, subtitle, children }) {
  return (
    <section style={styles.chartCard}>
      <div style={styles.sectionHeader}>
        <h3 style={styles.sectionTitle}>{title}</h3>
        <p style={styles.sectionSubtitle}>{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

const styles = {
  page: {
    display: "flex",
    flexDirection: "column",
    gap: "18px",
    width: "100%",
    minWidth: 0,
  },
  heroCard: {
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
    flexWrap: "wrap",
    padding: "22px",
    borderRadius: "20px",
    border: "1px solid #c7d2fe",
    background:
      "linear-gradient(135deg, rgba(240,253,250,1) 0%, rgba(239,246,255,1) 55%, rgba(250,245,255,1) 100%)",
    boxShadow: "0 12px 28px rgba(15, 23, 42, 0.08)",
  },
  title: {
    margin: 0,
    fontSize: "32px",
    lineHeight: 1.1,
    color: "#0f172a",
    fontWeight: 800,
  },
  subtitle: {
    margin: "10px 0 0",
    maxWidth: "720px",
    fontSize: "14px",
    lineHeight: 1.6,
    color: "#475569",
  },
  sourcePills: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
    alignItems: "flex-start",
  },
  sourcePill: {
    padding: "8px 12px",
    borderRadius: "999px",
    background: "rgba(255,255,255,0.82)",
    border: "1px solid #dbeafe",
    color: "#0f172a",
    fontSize: "12px",
    fontWeight: 700,
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  sectionHeader: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  sectionTitle: {
    margin: 0,
    fontSize: "20px",
    color: "#0f172a",
    fontWeight: 800,
  },
  sectionSubtitle: {
    margin: 0,
    fontSize: "13px",
    color: "#64748b",
  },
  cardGrid4: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "14px",
  },
  cardGrid3: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "14px",
  },
  metricCard: {
    padding: "18px",
    borderRadius: "18px",
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)",
  },
  accentTeal: {
    background: "linear-gradient(180deg, #ffffff 0%, #f0fdfa 100%)",
    borderColor: "#99f6e4",
  },
  accentBlue: {
    background: "linear-gradient(180deg, #ffffff 0%, #eff6ff 100%)",
    borderColor: "#bfdbfe",
  },
  accentAmber: {
    background: "linear-gradient(180deg, #ffffff 0%, #fffbeb 100%)",
    borderColor: "#fde68a",
  },
  metricLabel: {
    margin: 0,
    fontSize: "13px",
    color: "#475569",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  metricValue: {
    margin: "10px 0 8px",
    fontSize: "30px",
    lineHeight: 1.05,
    color: "#0f172a",
    fontWeight: 800,
  },
  metricNote: {
    margin: 0,
    fontSize: "12px",
    color: "#64748b",
    lineHeight: 1.5,
  },
  chartGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
    gap: "14px",
  },
  chartCard: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "18px",
    borderRadius: "18px",
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    boxShadow: "0 10px 28px rgba(15, 23, 42, 0.06)",
    minWidth: 0,
  },
  chartWrap: {
    width: "100%",
    height: "320px",
    minWidth: 0,
  },
  error: {
    padding: "14px 16px",
    borderRadius: "12px",
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#b91c1c",
    fontSize: "14px",
  },
};
