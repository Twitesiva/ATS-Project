import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const KPICard = ({ title, value, color, subtitle }) => (
  <div style={{
    background: "#ffffff",
    borderRadius: "12px",
    padding: "20px 24px",
    borderLeft: `4px solid ${color}`,
    minWidth: 0,
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

      <div style={{
        height: 8,
        background: "#eee",
        borderRadius: 4,
        overflow: "hidden"
      }}>
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: color,
            borderRadius: 4,
            transition: "width 0.6s ease"
          }}
        />
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
      axios.get("/api/bde/dashboard"),
      axios.get("/api/bde/companies"),
      axios.get("/api/bde/activities"),
    ]).then(([dashRes, companiesRes, activitiesRes]) => {
      const companies = companiesRes.data || [];

      setStats({ ...dashRes.data, leads: companies.length });

      const stageMap = {};
      companies.forEach(c => {
        const stage = c.stage || "Unknown";
        stageMap[stage] = (stageMap[stage] || 0) + 1;
      });

      const stageOrder = ["New", "Contacted", "Interested", "Negotiation", "Converted", "Lost"];

      const pipelineData = stageOrder
        .filter(s => stageMap[s])
        .map(s => ({ _id: s, count: stageMap[s] }));

      setPipeline(pipelineData);

      const pending = (activitiesRes.data || [])
        .filter(a => a.status === "Pending")
        .slice(0, 5);

      setFollowups(pending);
    })
    .catch(console.error)
    .finally(() => setLoading(false));
  }, []);

  const kpis = [
    { title: "Total Leads", value: stats?.leads, color: "#4e8ef7" },
    { title: "Converted Clients", value: stats?.clients, color: "#4ef7a4" },
    { title: "Open Requirements", value: stats?.openRequirements, color: "#f7a44e" },
    { title: "Closed Requirements", value: stats?.closedRequirements, color: "#c97ef7" },
    { title: "Pending Follow-ups", value: stats?.pendingActivities, color: "#f7e44e", subtitle: "Needs attention" },
    { title: "Completed Activities", value: stats?.completedActivities, color: "#4ef7f7" },
    { title: "Total Companies", value: stats?.totalCompanies, color: "#f74e4e" },
  ];

  const totalLeads = stats?.leads || 1;

  return (
    <div style={{ padding: "28px 32px", background: "#ffffff", minHeight: "100vh" }}>
      
      {/* Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 28
      }}>
        <div>
          <h1 style={{ color: "#000", fontSize: 26, fontWeight: 700, margin: 0 }}>
            BDE Dashboard
          </h1>
          <p style={{ color: "#666", margin: "4px 0 0", fontSize: 13 }}>
            Business Development Overview
          </p>
        </div>

        <button
          onClick={() => navigate("/bde/leads/new")}
          style={{
            background: "#000",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "10px 20px",
            fontWeight: 600,
            cursor: "pointer",
            fontSize: 14
          }}
        >
          + Add Lead
        </button>
      </div>

      {loading ? (
        <div style={{ color: "#666", textAlign: "center", paddingTop: 80, fontSize: 16 }}>
          Loading dashboard…
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 16,
            marginBottom: 32
          }}>
            {kpis.map((k) => <KPICard key={k.title} {...k} />)}
          </div>

          {/* Bottom Section */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>

            {/* Pipeline */}
            <div style={{
              background: "#fff",
              borderRadius: 12,
              padding: 24,
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)"
            }}>
              <h3 style={{ color: "#000", margin: "0 0 20px", fontSize: 16 }}>
                Sales Pipeline
              </h3>

              {pipeline.length === 0 ? (
                <p style={{ color: "#666", fontSize: 13 }}>No pipeline data yet.</p>
              ) : pipeline.map((stage, i) => {
                const colors = ["#4e8ef7", "#f7a44e", "#c97ef7", "#f7e44e", "#4ef7a4", "#f74e4e"];
                return (
                  <FunnelBar
                    key={stage._id}
                    label={stage._id}
                    count={stage.count}
                    total={totalLeads}
                    color={colors[i % colors.length]}
                  />
                );
              })}
            </div>

            {/* Followups */}
            <div style={{
              background: "#fff",
              borderRadius: 12,
              padding: 24,
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)"
            }}>
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16
              }}>
                <h3 style={{ color: "#000", margin: 0, fontSize: 16 }}>
                  Pending Follow-ups
                </h3>

                <button
                  onClick={() => navigate("/bde/followups")}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#000",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 500
                  }}
                >
                  View all →
                </button>
              </div>

              {followups.length === 0 ? (
                <p style={{ color: "#666", fontSize: 13 }}>No pending follow-ups.</p>
              ) : followups.map((f) => (
                <div key={f.id} style={{
                  padding: "10px 14px",
                  background: "#f8f8f8",
                  borderRadius: 8,
                  marginBottom: 8,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  border: "1px solid #eee"
                }}>
                  <div>
                    <div style={{ color: "#000", fontSize: 13, fontWeight: 500 }}>
                      {f.companies?.company_name || "Unknown"}
                    </div>
                    <div style={{ color: "#666", fontSize: 11, marginTop: 2 }}>
                      {f.subject || f.notes?.slice(0, 50)}
                    </div>
                  </div>

                  <div style={{
                    color: "#000",
                    fontSize: 11,
                    textAlign: "right",
                    whiteSpace: "nowrap",
                    marginLeft: 12
                  }}>
                    {f.activity_datetime
                      ? new Date(f.activity_datetime).toLocaleDateString("en-IN")
                      : "—"}
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