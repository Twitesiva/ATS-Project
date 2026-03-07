import { useCallback, useEffect, useState } from "react";
import Loader from "../../components/common/Loader";
import { supabase } from "../../services/supabaseClient";

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

const parseRevenueValue = (value) => {
  const cleanValue = String(value ?? "")
    .replace(/[\u20B9,LPA\s]/gi, "")
    .trim();

  const numericValue = parseFloat(cleanValue);
  return Number.isFinite(numericValue) ? numericValue : 0;
};

const normalizeRecruiter = (value) => {
  const name = String(value || "").trim();
  return name || "Unknown";
};

const normalizeClient = (value) => {
  const name = String(value || "").trim();
  return name || "Unknown";
};

const getDayDiff = (startValue, endValue) => {
  const start = new Date(startValue);
  const end = new Date(endValue);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  return Number.isFinite(diff) && diff >= 0 ? diff : null;
};

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [clientIntelLoading, setClientIntelLoading] = useState(true);
  const [riskLoading, setRiskLoading] = useState(true);

  const [kpis, setKpis] = useState({
    totalActiveCandidates: 0,
    totalOpenPositions: 0,
    totalInterviewsScheduled: 0,
    totalClosuresThisMonth: 0,
    revenueThisMonth: 0,
    overallMarginPercent: 0,
  });
  const [recruiterAnalytics, setRecruiterAnalytics] = useState([]);
  const [clientIntelligence, setClientIntelligence] = useState({
    topHiringClient: { client: "-", metric: "0 Closures" },
    fastestClosingClient: { client: "-", metric: "Avg 0 days" },
    slowestDecisionClient: { client: "-", metric: "Avg 0 days" },
    highestOfferRejectionRate: { client: "-", metric: "0% rejection" },
  });
  const [riskAlerts, setRiskAlerts] = useState({
    stuckCandidates: 0,
    inactiveRecruiters: 0,
    duplicateCandidates: 0,
  });

  const loadDashboardKPIs = useCallback(async () => {
    setLoading(true);
    const { start, end } = getMonthBounds();

    const [
      activeCandidatesRes,
      openPositionsRes,
      interviewsRes,
      closuresRes,
      revenueRes,
      overallMarginRes,
    ] = await Promise.all([
      supabase
        .from("candidate_records")
        .select("*", { count: "exact" })
        .neq("status", "Joined")
        ,
      supabase.from("client_records").select("number_of_openings"),
      supabase
        .from("candidate_records")
        .select("*", { count: "exact" })
        .eq("status", "Interview Scheduled")
        ,
      supabase
        .from("candidate_records")
        .select("*", { count: "exact" })
        .eq("status", "Joined")
        .gte("record_date", start)
        .lte("record_date", end)
        ,
      supabase
        .from("revenue_tracker")
        .select("margin_value,doj")
        .gte("doj", start)
        .lte("doj", end)
        ,
      supabase.from("revenue_tracker").select("margin_value,offered_ctc"),
    ]);

    const errors = [
      activeCandidatesRes.error,
      openPositionsRes.error,
      interviewsRes.error,
      closuresRes.error,
      revenueRes.error,
      overallMarginRes.error,
    ].filter(Boolean);

    if (errors.length) {
      console.error("Failed to load dashboard KPIs", errors);
      setLoading(false);
      return;
    }

    const totalOpenPositions = (openPositionsRes.data || []).reduce(
      (sum, row) => sum + toNumber(row.number_of_openings),
      0
    );

    const revenueThisMonth = (revenueRes.data || []).reduce(
      (sum, row) => sum + parseRevenueValue(row.margin_value),
      0
    );

    const overallSums = (overallMarginRes.data || []).reduce(
      (acc, row) => {
        acc.margin += parseRevenueValue(row.margin_value);
        acc.offeredCTC += parseRevenueValue(row.offered_ctc);
        return acc;
      },
      { margin: 0, offeredCTC: 0 }
    );

    const overallMarginPercent =
      overallSums.offeredCTC > 0
        ? (overallSums.margin / overallSums.offeredCTC) * 100
        : 0;

    setKpis({
      totalActiveCandidates: activeCandidatesRes.count || 0,
      totalOpenPositions,
      totalInterviewsScheduled: interviewsRes.count || 0,
      totalClosuresThisMonth: closuresRes.count || 0,
      revenueThisMonth,
      overallMarginPercent,
    });

    setLoading(false);
  }, []);

  const loadRecruiterAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);

    const [candidateRes, revenueRes] = await Promise.all([
      supabase.from("candidate_records").select("recruiter,status,created_at"),
      supabase.from("revenue_tracker").select("recruiter_name,margin_value,doj"),
    ]);

    const queryError = candidateRes.error || revenueRes.error;
    if (queryError) {
      console.error("Failed to load recruiter analytics", queryError);
      setAnalyticsLoading(false);
      return;
    }

    const recruiterMap = {};

    (candidateRes.data || []).forEach((row) => {
      const recruiter = normalizeRecruiter(row.recruiter);
      if (!recruiterMap[recruiter]) {
        recruiterMap[recruiter] = {
          recruiter,
          candidatesAdded: 0,
          interviews: 0,
          closures: 0,
          revenue: 0,
        };
      }

      recruiterMap[recruiter].candidatesAdded += 1;

      if (row.status === "Interview Scheduled") {
        recruiterMap[recruiter].interviews += 1;
      }

      if (row.status === "Joined") {
        recruiterMap[recruiter].closures += 1;
      }
    });

    (revenueRes.data || []).forEach((row) => {
      const recruiter = normalizeRecruiter(row.recruiter_name);
      if (!recruiterMap[recruiter]) {
        recruiterMap[recruiter] = {
          recruiter,
          candidatesAdded: 0,
          interviews: 0,
          closures: 0,
          revenue: 0,
        };
      }

      recruiterMap[recruiter].revenue += toNumber(row.margin_value);
    });

    const mergedRows = Object.values(recruiterMap).sort((a, b) =>
      a.recruiter.localeCompare(b.recruiter)
    );

    setRecruiterAnalytics(mergedRows);
    setAnalyticsLoading(false);
  }, []);

  const loadClientIntelligence = useCallback(async () => {
    setClientIntelLoading(true);

    const { data, error } = await supabase
      .from("candidate_records")
      .select("client_name,status,created_at,interview_date")
      ;

    if (error) {
      console.error("Failed to load client intelligence", error);
      setClientIntelLoading(false);
      return;
    }

    const clientMap = {};

    (data || []).forEach((row) => {
      const client = normalizeClient(row.client_name);
      if (!clientMap[client]) {
        clientMap[client] = {
          client,
          totalCandidates: 0,
          joinedCount: 0,
          rejectedCount: 0,
          totalDays: 0,
          daysCount: 0,
        };
      }

      clientMap[client].totalCandidates += 1;

      if (row.status === "Joined") {
        clientMap[client].joinedCount += 1;
      }

      if (/reject/i.test(String(row.status || ""))) {
        clientMap[client].rejectedCount += 1;
      }

      const days = getDayDiff(row.created_at, row.interview_date);
      if (days != null) {
        clientMap[client].totalDays += days;
        clientMap[client].daysCount += 1;
      }
    });

    const clients = Object.values(clientMap);

    const topHiring = clients.reduce(
      (best, current) =>
        current.joinedCount > best.joinedCount ? current : best,
      { client: "-", joinedCount: 0 }
    );

    const withAvgDays = clients
      .filter((c) => c.daysCount > 0)
      .map((c) => ({ ...c, avgDays: c.totalDays / c.daysCount }));

    const fastest = withAvgDays.reduce(
      (best, current) =>
        current.avgDays < best.avgDays ? current : best,
      { client: "-", avgDays: Number.POSITIVE_INFINITY }
    );

    const slowest = withAvgDays.reduce(
      (best, current) =>
        current.avgDays > best.avgDays ? current : best,
      { client: "-", avgDays: Number.NEGATIVE_INFINITY }
    );

    const withRejectionRate = clients
      .filter((c) => c.totalCandidates > 0)
      .map((c) => ({
        ...c,
        rejectionRate: c.rejectedCount / c.totalCandidates,
      }));

    const highestRejection = withRejectionRate.reduce(
      (best, current) =>
        current.rejectionRate > best.rejectionRate ? current : best,
      { client: "-", rejectionRate: 0 }
    );

    setClientIntelligence({
      topHiringClient: {
        client: topHiring.client,
        metric: `${topHiring.joinedCount || 0} Closures`,
      },
      fastestClosingClient: {
        client: fastest.client,
        metric:
          Number.isFinite(fastest.avgDays) && fastest.avgDays !== Number.POSITIVE_INFINITY
            ? `Avg ${fastest.avgDays.toFixed(1)} days`
            : "Avg 0 days",
      },
      slowestDecisionClient: {
        client: slowest.client,
        metric:
          Number.isFinite(slowest.avgDays) && slowest.avgDays !== Number.NEGATIVE_INFINITY
            ? `Avg ${slowest.avgDays.toFixed(1)} days`
            : "Avg 0 days",
      },
      highestOfferRejectionRate: {
        client: highestRejection.client,
        metric: `${(highestRejection.rejectionRate * 100 || 0).toFixed(1)}% rejection`,
      },
    });

    setClientIntelLoading(false);
  }, []);

  const loadRiskAlerts = useCallback(async () => {
    setRiskLoading(true);

    const now = new Date();

    const stuckThreshold = new Date(now);
    stuckThreshold.setDate(stuckThreshold.getDate() - 7);

    const inactiveThreshold = new Date(now);
    inactiveThreshold.setDate(inactiveThreshold.getDate() - 7);

    const [stuckRes, inactiveRes, duplicateRes] = await Promise.all([
      supabase
        .from("candidate_records")
        .select("*", { count: "exact" })
        .not("status", "in", '("Joined","Rejected")')
        .lt("updated_at", stuckThreshold.toISOString())
        ,
      supabase
        .from("users")
        .select("*", { count: "exact" })
        .eq("role", "recruiter")
        .lt("last_seen_at", inactiveThreshold.toISOString()),
      supabase
        .from("candidate_records")
        .select("id,email,phone_number")
        ,
    ]);

    const riskError = stuckRes.error || inactiveRes.error || duplicateRes.error;

    if (riskError) {
      console.error("Failed to load risk alerts", riskError);
      setRiskLoading(false);
      return;
    }

    const emailCounts = {};
    const phoneCounts = {};

    (duplicateRes.data || []).forEach((row) => {
      const email = String(row.email || "").trim().toLowerCase();
      const phone = String(row.phone_number || "").trim();

      if (email) {
        emailCounts[email] = (emailCounts[email] || 0) + 1;
      }

      if (phone) {
        phoneCounts[phone] = (phoneCounts[phone] || 0) + 1;
      }
    });

    let duplicateCandidates = 0;

    (duplicateRes.data || []).forEach((row) => {
      const email = String(row.email || "").trim().toLowerCase();
      const phone = String(row.phone_number || "").trim();

      const isDuplicateEmail = email && emailCounts[email] > 1;
      const isDuplicatePhone = phone && phoneCounts[phone] > 1;

      if (isDuplicateEmail || isDuplicatePhone) {
        duplicateCandidates += 1;
      }
    });

    setRiskAlerts({
      stuckCandidates: stuckRes.count || 0,
      inactiveRecruiters: inactiveRes.count || 0,
      duplicateCandidates,
    });

    setRiskLoading(false);
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

  useEffect(() => {
    loadClientIntelligence();

    const clientIntelChannel = supabase
      .channel("manager-dashboard-client-intelligence")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "candidate_records" },
        loadClientIntelligence
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "candidate_records" },
        loadClientIntelligence
      )
      .subscribe();

    return () => {
      supabase.removeChannel(clientIntelChannel);
    };
  }, [loadClientIntelligence]);

  useEffect(() => {
    loadRiskAlerts();

    const riskChannel = supabase
      .channel("manager-dashboard-risk-alerts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "candidate_records" },
        loadRiskAlerts
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "candidate_records" },
        loadRiskAlerts
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "users" },
        loadRiskAlerts
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "users" },
        loadRiskAlerts
      )
      .subscribe();

    return () => {
      supabase.removeChannel(riskChannel);
    };
  }, [loadRiskAlerts]);

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
      title: "Total Open Positions",
      value: kpis.totalOpenPositions,
      subtitle: "Current openings across clients",
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
    {
      title: "Overall Margin %",
      value: `${kpis.overallMarginPercent.toFixed(2)}%`,
      subtitle: "Across all revenue records",
    },
  ];

  const clientCards = [
    {
      title: "Top Hiring Client",
      client: clientIntelligence.topHiringClient.client,
      metric: clientIntelligence.topHiringClient.metric,
    },
    {
      title: "Fastest Closing Client",
      client: clientIntelligence.fastestClosingClient.client,
      metric: clientIntelligence.fastestClosingClient.metric,
    },
    {
      title: "Slowest Decision Client",
      client: clientIntelligence.slowestDecisionClient.client,
      metric: clientIntelligence.slowestDecisionClient.metric,
    },
    {
      title: "Highest Offer Rejection Rate",
      client: clientIntelligence.highestOfferRejectionRate.client,
      metric: clientIntelligence.highestOfferRejectionRate.metric,
    },
  ];

  const riskCards = [
    {
      title: "Candidates Stuck > 7 Days",
      value: riskAlerts.stuckCandidates,
      subtitle: `${riskAlerts.stuckCandidates} candidates waiting too long`,
    },
    {
      title: "Recruiter Inactivity",
      value: riskAlerts.inactiveRecruiters,
      subtitle: `${riskAlerts.inactiveRecruiters} recruiter inactive`,
    },
    {
      title: "Duplicate Candidates",
      value: riskAlerts.duplicateCandidates,
      subtitle: `${riskAlerts.duplicateCandidates} duplicates detected`,
    },
  ];

  return (
    <div>
      <h2 style={{ marginBottom: "16px" }}>Manager Dashboard</h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "14px",
        }}
      >
        {cards.map((card) => (
          <div
            key={card.title}
            style={{
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              padding: "16px",
              boxShadow: "0 2px 8px rgba(15, 23, 42, 0.06)",
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
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Recruiter</th>
                  <th style={styles.th}>Candidates Added</th>
                  <th style={styles.th}>Interviews</th>
                  <th style={styles.th}>Closures</th>
                  <th style={styles.th}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {recruiterAnalytics.map((row) => (
                  <tr key={row.recruiter}>
                    <td style={styles.td}>{row.recruiter}</td>
                    <td style={styles.td}>{row.candidatesAdded}</td>
                    <td style={styles.td}>{row.interviews}</td>
                    <td style={styles.td}>{row.closures}</td>
                    <td style={styles.td}>{`INR ${row.revenue.toLocaleString("en-IN")}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={styles.clientIntelSection}>
        <h3 style={styles.clientIntelTitle}>Client Intelligence</h3>

        {clientIntelLoading ? (
          <div style={styles.clientIntelLoaderWrap}>
            <Loader text="Loading client intelligence..." />
          </div>
        ) : (
          <div style={styles.clientGrid}>
            {clientCards.map((card) => (
              <div key={card.title} style={styles.clientCard}>
                <p style={styles.clientCardTitle}>{card.title}</p>
                <p style={styles.clientName}>{card.client}</p>
                <p style={styles.clientMetric}>{card.metric}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={styles.riskSection}>
        <h3 style={styles.riskTitle}>Risk & Alerts</h3>

        {riskLoading ? (
          <div style={styles.riskLoaderWrap}>
            <Loader text="Loading risk alerts..." />
          </div>
        ) : (
          <div style={styles.riskGrid}>
            {riskCards.map((card) => (
              <div key={card.title} style={styles.riskCard}>
                <p style={styles.riskCardTitle}>{card.title}</p>
                <p style={styles.riskValue}>{card.value}</p>
                <p style={styles.riskSub}>{card.subtitle}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

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





