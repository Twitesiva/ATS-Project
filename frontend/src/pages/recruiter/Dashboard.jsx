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
import { Briefcase, CalendarCheck2, CheckCircle2, CircleAlert, Users } from "lucide-react";
import Loader from "../../components/common/Loader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../services/supabaseClient";
import { formatCurrency, sanitizeMarginValue } from "../../utils/reportHelpers";

const STATUS_COLORS = [
  "#1D4ED8",
  "#2563EB",
  "#3B82F6",
  "#60A5FA",
  "#93C5FD",
  "#BFDBFE",
  "#DBEAFE",
  "#1E40AF",
];
const FUNNEL_COLORS = {
  "Profile Submitted": "#60A5FA",
  Shortlisted: "#8B5CF6",
  "Interview Stage": "#F59E0B",
  Offered: "#22C55E",
  Rejected: "#FB7185",
};

const INTERVIEW_STATUSES = new Set([
  "L1 Scheduled",
  "L2 Scheduled",
  "AI Interview",
  "Assessment Round",
  "HR Round",
  "Interview Scheduled",
]);

const REJECTED_STATUSES = new Set([
  "L1 Reject",
  "L2 Reject",
  "Final Round Rejected",
  "Drop Out By Client",
  "Drop Out By Candidate",
  "Backout",
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

const getUpcomingDojRows = (rows) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const seen = new Set();

  return (rows || [])
    .filter((row) => {
      if (!row.doj) return false;
      const key = `${row.candidate_name}-${row.client_name}-${row.doj}`;
      if (seen.has(key)) return false;
      seen.add(key);

      const doj = new Date(row.doj);
      doj.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((doj - today) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 7;
    })
    .sort((a, b) => new Date(a.doj).getTime() - new Date(b.doj).getTime());
};

const buildDashboardData = (candidateRows, revenueRows) => {
  const candidates = candidateRows || [];
  const revenue = revenueRows || [];

  const interviewsScheduled = candidates.filter((row) => isInterviewStatus(row.status)).length;
  const offers = revenue.filter((row) => String(row.offer_status || "").trim().toUpperCase() === "YES").length;
  const activeClients = new Set(
    candidates.map((row) => String(row.client_name || "").trim().toLowerCase()).filter(Boolean)
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
    const normalizedStatus = normalizeText(row.status);

    // Profile Submitted
    if (["profile submitted", "profile submission", "feedback pending"].includes(normalizedStatus)) {
      funnelMap.set("Profile Submitted", (funnelMap.get("Profile Submitted") || 0) + 1);
    }

    // Shortlisted
    if (normalizedStatus === "shortlisted") {
      funnelMap.set("Shortlisted", (funnelMap.get("Shortlisted") || 0) + 1);
    }

    // Interview Stage
    if ([
      "l1 scheduled",
      "l2 scheduled",
      "ai interview",
      "assessment round",
      "hr round",
      "interview scheduled"
    ].includes(normalizedStatus)) {
      funnelMap.set("Interview Stage", (funnelMap.get("Interview Stage") || 0) + 1);
    }

    // Offered - counted separately from revenue

    // Rejected
    if ([
      "drop out by client",
      "backout",
      "l1 reject",
      "l1 rejected",
      "l2 reject",
      "l2 rejected",
      "final round rejected",
      "drop out by candidate"
    ].includes(normalizedStatus)) {
      funnelMap.set("Rejected", (funnelMap.get("Rejected") || 0) + 1);
    }
  });
  // Offered comes from revenue tracker offer_status = YES
  funnelMap.set("Offered", revenue.filter((row) => String(row.offer_status || "").trim().toUpperCase() === "YES").length);
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
        note: "Offered candidates from Revenue Report",
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
  const [revenueData, setRevenueData] = useState([]);
  const recruiterName = useMemo(() => user?.name || "", [user?.name]);
  const currentDateLabel = useMemo(
    () =>
      new Date().toLocaleDateString("en-GB", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      }),
    []
  );
  const upcomingDojRows = useMemo(() => getUpcomingDojRows(revenueData), [revenueData]);

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
          "id,candidate_name,client_name,margin_value,margin_percent,billing_rate,doj,offer_status"
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
    setRevenueData(revenueRes.data || []);
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

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("recruiter-doj-notifications", {
        detail: { rows: upcomingDojRows },
      })
    );
  }, [upcomingDojRows]);

  useEffect(() => () => {
    window.dispatchEvent(
      new CustomEvent("recruiter-doj-notifications", {
        detail: { rows: [] },
      })
    );
  }, []);

  if (loading) {
    return <Loader text="Loading recruiter analytics..." />;
  }

  if (error) {
    return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>;
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-8 font-poppins">
      <section className="mb-1">
        <h2 className="m-0 text-2xl font-bold text-gray-900">Welcome back, {recruiterName} 👋</h2>
        <p className="m-0 mt-1 text-sm text-gray-500">{currentDateLabel}</p>
      </section>

      <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {dashboard.kpis.map((card) => (
          <MetricCard key={card.label} {...card} variant="kpi" />
        ))}
      </section>

      <section className="grid grid-cols-12 gap-6">
        <ChartCard
          className="col-span-12 xl:col-span-8"
          title="Hiring Funnel"
          subtitle="Profile submitted, shortlisted, interview, offered, and rejected stages"
        >
          {hasFunnelData(dashboard.hiringFunnel) ? (
            <div className="h-[360px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dashboard.hiringFunnel}>
                  <CartesianGrid strokeDasharray="2 4" stroke="#E5E7EB" />
                  <XAxis dataKey="stage" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<StyledTooltip />} />
                  <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                    {dashboard.hiringFunnel.map((stageRow) => (
                      <Cell key={stageRow.stage} fill={FUNNEL_COLORS[stageRow.stage] || "#2563EB"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <ChartEmptyState />
          )}
        </ChartCard>

        <div className="col-span-12 grid grid-cols-1 gap-6 xl:col-span-4">
          <ChartCard
            title="Recruitment Activity Chart"
            subtitle="Last 7 days candidate additions and interview scheduling"
            contentClassName="pt-0"
          >
            {hasActivityData(dashboard.activity) ? (
              <div className="h-[160px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dashboard.activity}>
                    <CartesianGrid strokeDasharray="2 4" stroke="#E5E7EB" />
                    <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<StyledTooltip />} />
                    <Line type="monotone" dataKey="added" name="Added" stroke="#2563EB" strokeWidth={2.5} dot={false} />
                    <Line
                      type="monotone"
                      dataKey="interviews"
                      name="Interviews"
                      stroke="#8B5CF6"
                      strokeWidth={2.5}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <ChartEmptyState />
            )}
          </ChartCard>

          <ChartCard
            title="Candidate Status Distribution Chart"
            subtitle="Current recruiter pipeline by status"
            contentClassName="pt-0"
          >
            {hasDistributionData(dashboard.statusDistribution) ? (
              <div className="h-[160px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={dashboard.statusDistribution} dataKey="value" nameKey="name" outerRadius={64} innerRadius={38} paddingAngle={2}>
                      {dashboard.statusDistribution.map((entry, index) => (
                        <Cell key={`${entry.name}-${index}`} fill={STATUS_COLORS[index % STATUS_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<StyledTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <ChartEmptyState />
            )}
          </ChartCard>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartCard
          title="Client Submission Volume"
          subtitle="Candidate submissions grouped by client"
          contentClassName="pt-0"
        >
          {hasClientData(dashboard.clientPerformance) ? (
            <div className="h-[220px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dashboard.clientPerformance}>
                  <CartesianGrid strokeDasharray="2 4" stroke="#E5E7EB" />
                  <XAxis dataKey="client" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<StyledTooltip />} />
                  <Bar dataKey="candidates" fill="#F59E0B" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <ChartEmptyState />
          )}
        </ChartCard>

      </section>

      <section className="grid grid-cols-1 gap-6">
        <ChartCard title="Revenue Analytics" subtitle="Revenue tracker performance and target progress">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {dashboard.revenueAnalytics.map((card) => (
              <MetricCard key={card.label} {...card} variant="revenue" />
            ))}
          </div>
        </ChartCard>
      </section>
    </div>
  );
}

function MetricCard({ label, value, note, trend, variant = "kpi" }) {
  const trendIsPositive = Number(trend || 0) >= 0;
  const tintClassByLabel = {
    "Candidates Added": "bg-blue-50/70 border-t-4 border-t-blue-500",
    "Interviews Scheduled": "bg-purple-50/70 border-t-4 border-t-purple-500",
    Offers: "bg-green-50/70 border-t-4 border-t-green-500",
    "Active Clients": "bg-orange-50/70 border-t-4 border-t-orange-500",
    "Total Revenue": "bg-slate-50 border-t-2 border-t-green-500",
    "Total Revenue Records": "bg-slate-50 border-t-2 border-t-blue-500",
  };
  const tintClass = tintClassByLabel[label] || "bg-white";
  const accentStyleByLabel = {
    "Candidates Added": {
      badge: "bg-blue-100 text-blue-700",
      icon: Users,
    },
    "Interviews Scheduled": {
      badge: "bg-purple-100 text-purple-700",
      icon: CalendarCheck2,
    },
    Offers: {
      badge: "bg-green-100 text-green-700",
      icon: CheckCircle2,
    },
    "Active Clients": {
      badge: "bg-orange-100 text-orange-700",
      icon: Briefcase,
    },
    "Total Revenue": {
      badge: "bg-green-100 text-green-700",
      icon: CheckCircle2,
    },
    "Total Revenue Records": {
      badge: "bg-blue-100 text-blue-700",
      icon: CircleAlert,
    },
  };
  const accent = accentStyleByLabel[label] || { badge: "bg-slate-100 text-slate-700", icon: CircleAlert };
  const Icon = accent.icon;
  const cardElevation = variant === "revenue" ? "shadow-[0_8px_20px_rgba(15,23,42,0.06)]" : "shadow-[0_8px_24px_rgba(15,23,42,0.08)]";
  return (
    <Card className={`h-full rounded-2xl border border-slate-200 ${tintClass} ${cardElevation} transition-all duration-200 ease-in-out hover:-translate-y-[4px] hover:shadow-[0_12px_28px_rgba(15,23,42,0.12)]`}>
      <CardContent className="flex h-full flex-col justify-between p-6">
        <div className="flex items-center justify-between gap-2">
          <p className="m-0 text-xs font-medium tracking-wide text-gray-500">{label}</p>
          <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${accent.badge}`}>
            <Icon size={16} />
          </span>
        </div>
        <p className="m-0 mt-3 text-3xl font-bold text-gray-900 xl:text-4xl">{value}</p>
        <div className="mt-2 flex min-h-5 items-center justify-between gap-2">
          <p className="m-0 text-xs text-gray-500">{note}</p>
          {typeof trend === "number" ? (
            <span className={`text-xs font-semibold ${trendIsPositive ? "text-emerald-600" : "text-rose-600"}`}>
              {trendIsPositive ? "+" : ""}
              {trend.toFixed(1)}%
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, subtitle, children, className = "", contentClassName = "" }) {
  return (
    <Card className={`min-w-0 rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.08)] transition-all duration-200 ease-in-out hover:-translate-y-[4px] hover:shadow-[0_12px_28px_rgba(15,23,42,0.12)] ${className}`}>
      <CardHeader className="p-6 pb-2">
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
        <CardDescription className="text-sm text-gray-500">{subtitle}</CardDescription>
      </CardHeader>
      <CardContent className={`p-6 ${contentClassName}`}>{children}</CardContent>
    </Card>
  );
}

function StyledTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-[0_6px_18px_rgba(15,23,42,0.1)]">
      {label ? <p className="m-0 mb-1 text-slate-600">{label}</p> : null}
      {payload.map((entry) => (
        <p key={`${entry.name}-${entry.dataKey}`} className="m-0 text-slate-800">
          <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: entry.color }} />
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

function ChartEmptyState() {
  return (
    <div className="flex h-[220px] items-center justify-center">
      <p className="m-0 text-sm text-slate-400">No data available yet</p>
    </div>
  );
}

function hasFunnelData(rows) {
  return Array.isArray(rows) && rows.some((row) => Number(row.value) > 0);
}

function hasActivityData(rows) {
  return Array.isArray(rows) && rows.some((row) => Number(row.added) > 0 || Number(row.interviews) > 0);
}

function hasDistributionData(rows) {
  return Array.isArray(rows) && rows.some((row) => Number(row.value) > 0);
}

function hasClientData(rows) {
  return Array.isArray(rows) && rows.some((row) => Number(row.candidates) > 0);
}
