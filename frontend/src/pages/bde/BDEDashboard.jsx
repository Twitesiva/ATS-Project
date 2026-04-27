import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../services/supabaseClient";
import { useAuth } from "../../context/AuthContext";

const KPICard = ({ title, value, color, subtitle }) => (
  <div style={{
    background: "#ffffff", borderRadius: "12px", padding: "20px 24px",
    borderLeft: `4px solid ${color}`, minWidth: 0,
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)"
  }}>
    <div style={{ color: "#555", fontSize: 12, marginBottom: 4 }}>{title}</div>
    <div style={{ color: "#000", fontSize: 26, fontWeight: 700 }}>{value ?? "—"}</div>
    {subtitle && <div style={{ color: color, fontSize: 11, marginTop: 2 }}>{subtitle}</div>}
  </div>
);

const FunnelBar = ({ label, count, total, color }) => {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ color: "#333", fontSize: 13 }}>{label}</span>
        <span style={{ color: "#000", fontSize: 13, fontWeight: 600 }}>
          {count} <span style={{ color: "#666", fontWeight: 400 }}>({pct}%)</span>
        </span>
      </div>
      <div style={{ height: 8, background: "#eee", borderRadius: 4, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${pct}%`, background: color,
          borderRadius: 4, transition: "width 0.6s ease"
        }} />
      </div>
    </div>
  );
};

export default function BDEDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState({});
  const [pipeline, setPipeline] = useState([]);
  const [followups, setFollowups] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.name) return;
    fetchDashboard();
  }, [user?.name]);

  const fetchDashboard = async () => {
    setLoading(true);

    // All queries scoped to logged-in user via created_by
    const [
      { data: leads },
      { data: clients },
      { data: pendingActs },
      { data: completedActs },
      { data: followupData },
    ] = await Promise.all([
      // Total leads — scoped by created_by
      supabase
        .from("companies")
        .select("id")
        .eq("created_by", user.name),

      // Converted clients — scoped by created_by
      supabase
        .from("companies")
        .select("id")
        .eq("status", "Client")
        .eq("created_by", user.name),

      // Pending follow-ups — scoped by created_by
      supabase
        .from("activities")
        .select("id")
        .eq("status", "Pending")
        .eq("created_by", user.name),

      // Completed activities — scoped by created_by
      supabase
        .from("activities")
        .select("id")
        .eq("status", "Completed")
        .eq("created_by", user.name),

      // Pending follow-ups list for display — scoped by created_by
      supabase
        .from("activities")
        .select("*, companies(company_name)")
        .eq("status", "Pending")
        .eq("created_by", user.name)
        .order("activity_datetime", { ascending: true })
        .limit(5),
    ]);

    // Build pipeline from leads statuses
    const stageMap = {};
    (leads || []).forEach((c) => {
      const stage = c.status || "Unknown";
      stageMap[stage] = (stageMap[stage] || 0) + 1;
    });

    const stageOrder = ["New", "Contacted", "Interested", "Negotiation", "Converted", "Lost"];
    const pipelineData = stageOrder
      .filter((s) => stageMap[s])
      .map((s) => ({ _id: s, count: stageMap[s] }));

    setStats({
      leads: (leads || []).length,
      clients: (clients || []).length,
      pendingActivities: (pendingActs || []).length,
      completedActivities: (completedActs || []).length,
    });

    setPipeline(pipelineData);
    setFollowups(followupData || []);
    setLoading(false);
  };

  const kpis = [
    { title: "Total Leads", value: stats.leads, color: "#4e8ef7" },
    { title: "Converted Clients", value: stats.clients, color: "#4ef7a4" },
    { title: "Pending Follow-ups", value: stats.pendingActivities, color: "#f7e44e", subtitle: "Needs attention" },
    { title: "Completed Activities", value: stats.completedActivities, color: "#4ef7f7" },
  ];

  const totalLeads = stats.leads || 1;

  return (
    <div style={{ padding: "28px 32px", background: "#ffffff", minHeight: "100vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <h1 style={{ color: "#000", fontSize: 26, fontWeight: 700, margin: 0 }}>BDE Dashboard</h1>
          <p style={{ color: "#666", margin: "4px 0 0", fontSize: 13 }}>Business Development Overview</p>
        </div>
        <button
          onClick={() => navigate("/bde/leads/new")}
          style={{ background: "#000", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 600, cursor: "pointer", fontSize: 14 }}
        >+ Add Lead</button>
      </div>

      {loading ? (
        <div style={{ color: "#666", textAlign: "center", paddingTop: 80, fontSize: 16 }}>Loading dashboard…</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16, marginBottom: 32 }}>
            {kpis.map((k) => <KPICard key={k.title} {...k} />)}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            {/* Pipeline */}
            <div style={{ background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
              <h3 style={{ color: "#000", margin: "0 0 20px", fontSize: 16 }}>Sales Pipeline</h3>
              {pipeline.length === 0 ? (
                <p style={{ color: "#666", fontSize: 13 }}>No pipeline data yet.</p>
              ) : pipeline.map((stage, i) => {
                const colors = ["#4e8ef7", "#f7a44e", "#c97ef7", "#f7e44e", "#4ef7a4", "#f74e4e"];
                return (
                  <FunnelBar key={stage._id} label={stage._id} count={stage.count} total={totalLeads} color={colors[i % colors.length]} />
                );
              })}
            </div>

            {/* Follow-ups */}
            <div style={{ background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h3 style={{ color: "#000", margin: 0, fontSize: 16 }}>Pending Follow-ups</h3>
                <button onClick={() => navigate("/bde/followups")} style={{ background: "none", border: "none", color: "#000", cursor: "pointer", fontSize: 12, fontWeight: 500 }}>View all →</button>
              </div>
              {followups.length === 0 ? (
                <p style={{ color: "#666", fontSize: 13 }}>No pending follow-ups.</p>
              ) : followups.map((f) => (
                <div key={f.id} style={{ padding: "10px 14px", background: "#f8f8f8", borderRadius: 8, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid #eee" }}>
                  <div>
                    <div style={{ color: "#000", fontSize: 13, fontWeight: 500 }}>{f.companies?.company_name || "Unknown"}</div>
                    <div style={{ color: "#666", fontSize: 11, marginTop: 2 }}>{f.notes?.slice(0, 50)}</div>
                  </div>
                  <div style={{ color: "#000", fontSize: 11, textAlign: "right", whiteSpace: "nowrap", marginLeft: 12 }}>
                    {f.activity_datetime ? new Date(f.activity_datetime).toLocaleDateString("en-IN") : "—"}
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