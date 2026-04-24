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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
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

  if (loading) {
    return <Loader text="Loading recruiter analytics..." />;
  }

  if (error) {
    return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>;
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-6 font-poppins">
      <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {dashboard.kpis.map((card) => (
          <MetricCard key={card.label} {...card} />
        ))}
      </section>

      <section className="grid grid-cols-12 gap-6">
        <ChartCard
          className="col-span-12 xl:col-span-8"
          title="Hiring Funnel"
          subtitle="Profile submitted, shortlisted, interview, offered, and rejected stages"
        >
          <div className="h-[360px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dashboard.hiringFunnel}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="stage" tick={{ fill: "#64748b", fontSize: 12 }} />
                <YAxis tick={{ fill: "#64748b", fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#4f46e5" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <div className="col-span-12 grid grid-cols-1 gap-6 xl:col-span-4">
          <ChartCard
            title="Recruitment Activity Chart"
            subtitle="Last 7 days candidate additions and interview scheduling"
            contentClassName="pt-0"
          >
            <div className="h-[160px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dashboard.activity}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="added" name="Added" stroke="#2563eb" strokeWidth={2} />
                  <Line
                    type="monotone"
                    dataKey="interviews"
                    name="Interviews"
                    stroke="#0ea5e9"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard
            title="Candidate Status Distribution Chart"
            subtitle="Current recruiter pipeline by status"
            contentClassName="pt-0"
          >
            <div className="h-[160px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={dashboard.statusDistribution} dataKey="value" nameKey="name" outerRadius={64} innerRadius={38} paddingAngle={2}>
                    {dashboard.statusDistribution.map((entry, index) => (
                      <Cell key={`${entry.name}-${index}`} fill={STATUS_COLORS[index % STATUS_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartCard
          title="Client Submission Volume"
          subtitle="Candidate submissions grouped by client"
          contentClassName="pt-0"
        >
          <div className="h-[220px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dashboard.clientPerformance}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="client" tick={{ fill: "#64748b", fontSize: 11 }} />
                <YAxis tick={{ fill: "#64748b", fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="candidates" fill="#6366f1" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

      </section>

      <section className="grid grid-cols-1 gap-6">
        <ChartCard title="Revenue Analytics" subtitle="Revenue tracker performance and target progress">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {dashboard.revenueAnalytics.map((card) => (
              <MetricCard key={card.label} {...card} />
            ))}
          </div>
        </ChartCard>
      </section>
    </div>
  );
}

function MetricCard({ label, value, note, trend }) {
  const trendIsPositive = Number(trend || 0) >= 0;
  return (
    <Card className="h-full rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="flex h-full flex-col justify-between p-5">
        <p className="m-0 text-sm text-gray-500">{label}</p>
        <p className="m-0 mt-3 text-2xl font-bold text-slate-900">{value}</p>
        <div className="mt-2 flex min-h-5 items-center justify-between gap-2">
          <p className="m-0 text-xs text-slate-500">{note}</p>
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
    <Card className={`min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:shadow-md ${className}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
        <CardDescription className="text-sm text-gray-500">{subtitle}</CardDescription>
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  );
}
