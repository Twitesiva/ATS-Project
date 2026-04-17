import { useState, useEffect } from "react";
import axios from "axios";
import { useLocation } from "react-router-dom";

// ─── Revenue Tracking ─────────────────────────────────────────
export function RevenueTracking() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  useEffect(() => {
    setLoading(true);
    axios.get("/api/bde/revenue", { params: { month } })
      .then((r) => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [month]);

  const target = data?.monthlyTarget || 1000000;
  const achieved = data?.totalRevenue || 0;
  const pct = Math.min(100, Math.round((achieved / target) * 100));

  return (
    <div style={{ padding: "28px 32px", background: "#0d1525", minHeight: "100vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ color: "#fff", fontSize: 24, fontWeight: 700, margin: 0 }}>Revenue Tracking</h1>
          <p style={{ color: "#8892a4", margin: "4px 0 0", fontSize: 13 }}>BDE performance & deals</p>
        </div>
        <input
          type="month" value={month} onChange={(e) => setMonth(e.target.value)}
          style={{ background: "#1a2236", border: "1px solid #2a3550", color: "#fff", borderRadius: 8, padding: "8px 12px", fontSize: 13 }}
        />
      </div>

      {/* Target Progress */}
      <div style={{ background: "#1a2236", borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ color: "#cdd5e0", fontSize: 14, fontWeight: 500 }}>Monthly Target Progress</span>
          <span style={{ color: pct >= 100 ? "#4ef7a4" : "#f7a44e", fontSize: 14, fontWeight: 700 }}>{pct}%</span>
        </div>
        <div style={{ height: 12, background: "#0d1525", borderRadius: 6, overflow: "hidden", marginBottom: 8 }}>
          <div style={{ height: "100%", width: `${pct}%`, background: pct >= 100 ? "#4ef7a4" : pct >= 60 ? "#f7a44e" : "#4e8ef7", borderRadius: 6, transition: "width 0.8s ease" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "#8892a4", fontSize: 12 }}>Achieved: <span style={{ color: "#4ef7a4", fontWeight: 600 }}>₹{achieved.toLocaleString("en-IN")}</span></span>
          <span style={{ color: "#8892a4", fontSize: 12 }}>Target: <span style={{ color: "#fff", fontWeight: 600 }}>₹{target.toLocaleString("en-IN")}</span></span>
        </div>
      </div>

      {/* Stats Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Total Revenue", value: `₹${((data?.totalRevenue || 0) / 1000).toFixed(0)}K`, color: "#4ef7a4" },
          { label: "Closed Deals", value: data?.closedDeals || 0, color: "#4e8ef7" },
          { label: "Avg Deal Value", value: `₹${((data?.avgDealValue || 0) / 1000).toFixed(0)}K`, color: "#c97ef7" },
          { label: "Commission", value: `₹${((data?.commission || 0) / 1000).toFixed(0)}K`, color: "#f7a44e" },
        ].map((s) => (
          <div key={s.label} style={{ background: "#1a2236", borderRadius: 12, padding: 20, textAlign: "center" }}>
            <div style={{ color: s.color, fontSize: 26, fontWeight: 700 }}>{loading ? "—" : s.value}</div>
            <div style={{ color: "#8892a4", fontSize: 12, marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Client Revenue Table */}
      <div style={{ background: "#1a2236", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #0d1525" }}>
          <h3 style={{ color: "#fff", margin: 0, fontSize: 15 }}>Revenue by Client</h3>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#0d1525" }}>
              {["Client", "Deals Closed", "Revenue", "Commission", "Last Deal"].map((h) => (
                <th key={h} style={{ color: "#8892a4", padding: "10px 16px", textAlign: "left", fontSize: 12, fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ color: "#8892a4", textAlign: "center", padding: 32 }}>Loading…</td></tr>
            ) : (data?.byClient || []).length === 0 ? (
              <tr><td colSpan={5} style={{ color: "#8892a4", textAlign: "center", padding: 32 }}>No revenue data for this period.</td></tr>
            ) : (data.byClient || []).map((c, i) => (
              <tr key={i} style={{ borderTop: "1px solid #0d1525" }}>
                <td style={{ padding: "12px 16px", color: "#fff", fontSize: 13, fontWeight: 500 }}>{c.client}</td>
                <td style={{ padding: "12px 16px", color: "#cdd5e0", fontSize: 13 }}>{c.deals}</td>
                <td style={{ padding: "12px 16px", color: "#4ef7a4", fontSize: 13, fontWeight: 600 }}>₹{c.revenue.toLocaleString("en-IN")}</td>
                <td style={{ padding: "12px 16px", color: "#f7a44e", fontSize: 13 }}>₹{c.commission.toLocaleString("en-IN")}</td>
                <td style={{ padding: "12px 16px", color: "#8892a4", fontSize: 12 }}>{c.lastDeal ? new Date(c.lastDeal).toLocaleDateString("en-IN") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Sales Pipeline (Kanban) ────────────────────────────────────
const STAGES = ["New", "Contacted", "Interested", "Negotiation", "Converted", "Lost"];
const STAGE_COLORS = { New: "#4e8ef7", Contacted: "#f7e44e", Interested: "#f7a44e", Negotiation: "#c97ef7", Converted: "#4ef7a4", Lost: "#f74e4e" };

export function SalesPipeline() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(null);

  useEffect(() => {
    axios.get("/api/bde/leads?limit=200")
      .then((r) => setLeads(r.data.leads || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const byStage = STAGES.reduce((acc, s) => {
    acc[s] = leads.filter((l) => l.status === s);
    return acc;
  }, {});

  const handleDrop = async (stage) => {
    if (!dragging || dragging.status === stage) return;
    const prev = [...leads];
    setLeads((ls) => ls.map((l) => l._id === dragging._id ? { ...l, status: stage } : l));
    try {
      await axios.patch(`/api/bde/leads/${dragging._id}/status`, { status: stage });
    } catch {
      setLeads(prev);
    }
    setDragging(null);
  };

  const PRIORITY_COLORS = { Hot: "#f74e4e", Warm: "#f7a44e", Cold: "#4e8ef7" };

  return (
    <div style={{ padding: "28px 32px", background: "#0d1525", minHeight: "100vh" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: "#fff", fontSize: 24, fontWeight: 700, margin: 0 }}>Sales Pipeline</h1>
        <p style={{ color: "#8892a4", margin: "4px 0 0", fontSize: 13 }}>Drag & drop leads across stages</p>
      </div>

      {loading ? (
        <p style={{ color: "#8892a4" }}>Loading pipeline…</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, overflowX: "auto" }}>
          {STAGES.map((stage) => (
            <div
              key={stage}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(stage)}
              style={{ minWidth: 180 }}
            >
              {/* Column Header */}
              <div style={{ background: `${STAGE_COLORS[stage]}22`, border: `1px solid ${STAGE_COLORS[stage]}55`, borderRadius: 10, padding: "8px 12px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: STAGE_COLORS[stage], fontSize: 12, fontWeight: 700 }}>{stage}</span>
                <span style={{ background: `${STAGE_COLORS[stage]}33`, color: STAGE_COLORS[stage], borderRadius: 12, padding: "1px 8px", fontSize: 11 }}>{byStage[stage].length}</span>
              </div>

              {/* Cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 100 }}>
                {byStage[stage].map((lead) => (
                  <div
                    key={lead._id}
                    draggable
                    onDragStart={() => setDragging(lead)}
                    style={{
                      background: "#1a2236", borderRadius: 10, padding: "12px 14px",
                      cursor: "grab", border: "1px solid #2a3550",
                      opacity: dragging?._id === lead._id ? 0.5 : 1,
                      transition: "opacity 0.2s",
                    }}
                  >
                    <div style={{ color: "#fff", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{lead.companyName}</div>
                    <div style={{ color: "#8892a4", fontSize: 11, marginBottom: 8 }}>{lead.contactPerson}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{
                        background: `${PRIORITY_COLORS[lead.priority]}22`, color: PRIORITY_COLORS[lead.priority],
                        borderRadius: 12, padding: "1px 8px", fontSize: 10, fontWeight: 600,
                      }}>{lead.priority}</span>
                      <span style={{ color: "#8892a4", fontSize: 10 }}>{lead.source}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RevenueAndPipeline() {
  const location = useLocation();
  const isPipelineRoute = location.pathname.endsWith("/pipeline");
  return isPipelineRoute ? <SalesPipeline /> : <RevenueTracking />;
}
