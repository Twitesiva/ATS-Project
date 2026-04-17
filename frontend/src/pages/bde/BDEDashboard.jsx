import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const KPICard = ({ title, value, icon, color, subtitle }) => (
  <div style={{
    background: "#1a2236",
    borderRadius: "12px",
    padding: "20px 24px",
    borderLeft: `4px solid ${color}`,
    display: "flex",
    alignItems: "center",
    gap: "16px",
    minWidth: 0,
  }}>
    <div style={{
      width: 48, height: 48, borderRadius: "10px",
      background: `${color}22`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 22, flexShrink: 0,
    }}>{icon}</div>
    <div style={{ minWidth: 0 }}>
      <div style={{ color: "#8892a4", fontSize: 12, marginBottom: 4 }}>{title}</div>
      <div style={{ color: "#fff", fontSize: 26, fontWeight: 700 }}>{value ?? "—"}</div>
      {subtitle && <div style={{ color: color, fontSize: 11, marginTop: 2 }}>{subtitle}</div>}
    </div>
  </div>
);

const FunnelBar = ({ label, count, total, color }) => {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ color: "#cdd5e0", fontSize: 13 }}>{label}</span>
        <span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{count} <span style={{ color: "#8892a4", fontWeight: 400 }}>({pct}%)</span></span>
      </div>
      <div style={{ height: 8, background: "#0d1525", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
};

export default function BDEDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [pipeline, setPipeline] = useState([]);
  const [followups, setFollowups] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      axios.get("/api/bde/dashboard/stats"),
      axios.get("/api/bde/dashboard/pipeline"),
      axios.get("/api/bde/followups?limit=5&pending=true"),
    ]).then(([s, p, f]) => {
      setStats(s.data);
      setPipeline(p.data);
      setFollowups(f.data.followups || []);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const kpis = [
    { title: "Total Leads", value: stats?.totalLeads, icon: "🎯", color: "#4e8ef7" },
    { title: "Active Leads", value: stats?.activeLeads, icon: "🔥", color: "#f7a44e" },
    { title: "Converted Clients", value: stats?.convertedClients, icon: "✅", color: "#4ef7a4" },
    { title: "Lost Leads", value: stats?.lostLeads, icon: "❌", color: "#f74e4e" },
    { title: "Monthly Revenue", value: stats?.monthlyRevenue ? `₹${(stats.monthlyRevenue / 1000).toFixed(0)}K` : "—", icon: "💰", color: "#c97ef7" },
    { title: "Pending Follow-ups", value: stats?.pendingFollowups, icon: "📞", color: "#f7e44e", subtitle: "Needs attention" },
    { title: "New Requirements", value: stats?.newRequirements, icon: "📋", color: "#4ef7f7" },
  ];

  const totalLeads = stats?.totalLeads || 1;

  return (
    <div style={{ padding: "28px 32px", background: "#0d1525", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <h1 style={{ color: "#fff", fontSize: 26, fontWeight: 700, margin: 0 }}>BDE Dashboard</h1>
          <p style={{ color: "#8892a4", margin: "4px 0 0", fontSize: 13 }}>Business Development Overview</p>
        </div>
        <button
          onClick={() => navigate("/bde/leads/new")}
          style={{
            background: "#4e8ef7", color: "#fff", border: "none", borderRadius: 8,
            padding: "10px 20px", fontWeight: 600, cursor: "pointer", fontSize: 14,
          }}
        >+ Add Lead</button>
      </div>

      {loading ? (
        <div style={{ color: "#8892a4", textAlign: "center", paddingTop: 80, fontSize: 16 }}>Loading dashboard…</div>
      ) : (
        <>
          {/* KPI Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16, marginBottom: 32 }}>
            {kpis.map((k) => <KPICard key={k.title} {...k} />)}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            {/* Pipeline Funnel */}
            <div style={{ background: "#1a2236", borderRadius: 12, padding: 24 }}>
              <h3 style={{ color: "#fff", margin: "0 0 20px", fontSize: 16 }}>Sales Pipeline</h3>
              {pipeline.length === 0 ? (
                <p style={{ color: "#8892a4", fontSize: 13 }}>No pipeline data yet.</p>
              ) : pipeline.map((stage, i) => {
                const colors = ["#4e8ef7", "#f7a44e", "#c97ef7", "#f7e44e", "#4ef7a4", "#f74e4e"];
                return <FunnelBar key={stage._id} label={stage._id} count={stage.count} total={totalLeads} color={colors[i % colors.length]} />;
              })}
            </div>

            {/* Pending Follow-ups */}
            <div style={{ background: "#1a2236", borderRadius: 12, padding: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h3 style={{ color: "#fff", margin: 0, fontSize: 16 }}>Pending Follow-ups</h3>
                <button onClick={() => navigate("/bde/followups")} style={{ background: "none", border: "none", color: "#4e8ef7", cursor: "pointer", fontSize: 12 }}>View all →</button>
              </div>
              {followups.length === 0 ? (
                <p style={{ color: "#8892a4", fontSize: 13 }}>No pending follow-ups.</p>
              ) : followups.map((f) => (
                <div key={f._id} style={{
                  padding: "10px 14px", background: "#0d1525", borderRadius: 8,
                  marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div>
                    <div style={{ color: "#cdd5e0", fontSize: 13, fontWeight: 500 }}>{f.leadId?.companyName || "Unknown"}</div>
                    <div style={{ color: "#8892a4", fontSize: 11, marginTop: 2 }}>{f.notes?.slice(0, 50)}</div>
                  </div>
                  <div style={{ color: "#f7a44e", fontSize: 11, textAlign: "right", whiteSpace: "nowrap", marginLeft: 12 }}>
                    {new Date(f.scheduledAt).toLocaleDateString("en-IN")}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}