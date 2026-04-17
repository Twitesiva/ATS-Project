import { useState, useEffect } from "react";
import axios from "axios";

const inputStyle = {
  width: "100%", background: "#0d1525", border: "1px solid #2a3550",
  color: "#fff", padding: "9px 12px", borderRadius: 8, fontSize: 13, boxSizing: "border-box",
};

const Modal = ({ title, onClose, children }) => (
  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
    <div style={{ background: "#1a2236", borderRadius: 14, padding: 28, width: 480 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ color: "#fff", margin: 0, fontSize: 18 }}>{title}</h2>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#8892a4", cursor: "pointer", fontSize: 20 }}>×</button>
      </div>
      {children}
    </div>
  </div>
);

export default function FollowUps() {
  const [followups, setFollowups] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [tab, setTab] = useState("today"); // today | upcoming | all
  const [form, setForm] = useState({ leadId: "", type: "Call", scheduledAt: "", notes: "", status: "Pending" });

  const fetchAll = () => {
    setLoading(true);
    Promise.all([
      axios.get("/api/bde/followups"),
      axios.get("/api/bde/leads?limit=100"),
    ]).then(([f, l]) => {
      setFollowups(f.data.followups || []);
      setLeads(l.data.leads || []);
    }).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

  const filtered = followups.filter((f) => {
    const d = new Date(f.scheduledAt);
    if (tab === "today") return d >= today && d < tomorrow;
    if (tab === "upcoming") return d >= tomorrow;
    return true;
  });

  const handleSubmit = async () => {
    try {
      await axios.post("/api/bde/followups", form);
      setShowModal(false);
      setForm({ leadId: "", type: "Call", scheduledAt: "", notes: "", status: "Pending" });
      fetchAll();
    } catch (err) {
      alert(err.response?.data?.message || "Error saving follow-up");
    }
  };

  const markDone = async (id) => {
    await axios.patch(`/api/bde/followups/${id}/status`, { status: "Done" });
    fetchAll();
  };

  const TYPE_ICONS = { Call: "📞", Meeting: "🤝", Email: "📧", Demo: "💻" };
  const STATUS_COLORS = { Pending: "#f7e44e", Done: "#4ef7a4", Missed: "#f74e4e" };

  const Field = ({ label, children }) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ color: "#8892a4", fontSize: 12, display: "block", marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );

  return (
    <div style={{ padding: "28px 32px", background: "#0d1525", minHeight: "100vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ color: "#fff", fontSize: 24, fontWeight: 700, margin: 0 }}>Follow-ups & Activity</h1>
          <p style={{ color: "#8892a4", margin: "4px 0 0", fontSize: 13 }}>
            {followups.filter((f) => f.status === "Pending").length} pending follow-ups
          </p>
        </div>
        <button onClick={() => setShowModal(true)} style={{ background: "#f7a44e", color: "#0d1525", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
          + Schedule Follow-up
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "#1a2236", borderRadius: 10, padding: 4, width: "fit-content" }}>
        {[["today", "Today"], ["upcoming", "Upcoming"], ["all", "All"]].map(([val, label]) => (
          <button key={val} onClick={() => setTab(val)} style={{
            background: tab === val ? "#0d1525" : "transparent",
            color: tab === val ? "#fff" : "#8892a4",
            border: "none", borderRadius: 8, padding: "7px 18px", cursor: "pointer", fontSize: 13, fontWeight: tab === val ? 600 : 400,
          }}>{label}</button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: "#8892a4" }}>Loading…</p>
      ) : filtered.length === 0 ? (
        <div style={{ background: "#1a2236", borderRadius: 12, padding: 40, textAlign: "center", color: "#8892a4" }}>
          No follow-ups for this period.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((f) => (
            <div key={f._id} style={{
              background: "#1a2236", borderRadius: 12, padding: "16px 20px",
              display: "flex", alignItems: "center", gap: 16,
              borderLeft: `4px solid ${STATUS_COLORS[f.status] || "#8892a4"}`,
              opacity: f.status === "Done" ? 0.6 : 1,
            }}>
              <div style={{ fontSize: 24, flexShrink: 0 }}>{TYPE_ICONS[f.type] || "📌"}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>{f.leadId?.companyName || "—"}</div>
                <div style={{ color: "#8892a4", fontSize: 12, marginTop: 2 }}>{f.notes?.slice(0, 80)}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ color: "#cdd5e0", fontSize: 12, fontWeight: 500 }}>
                  {new Date(f.scheduledAt).toLocaleDateString("en-IN")} {new Date(f.scheduledAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                </div>
                <div style={{ marginTop: 6, display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <span style={{
                    background: `${STATUS_COLORS[f.status]}22`, color: STATUS_COLORS[f.status],
                    border: `1px solid ${STATUS_COLORS[f.status]}55`,
                    borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600,
                  }}>{f.status}</span>
                  {f.status === "Pending" && (
                    <button onClick={() => markDone(f._id)} style={{ background: "#4ef7a422", color: "#4ef7a4", border: "1px solid #4ef7a455", borderRadius: 20, padding: "2px 10px", cursor: "pointer", fontSize: 11 }}>
                      Mark Done
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal title="Schedule Follow-up" onClose={() => setShowModal(false)}>
          <Field label="Lead / Company *">
            <select style={{ ...inputStyle, cursor: "pointer" }} value={form.leadId} onChange={(e) => setForm({ ...form, leadId: e.target.value })}>
              <option value="">Select Lead</option>
              {leads.map((l) => <option key={l._id} value={l._id}>{l.companyName} — {l.contactPerson}</option>)}
            </select>
          </Field>
          <Field label="Type">
            <select style={{ ...inputStyle, cursor: "pointer" }} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option>Call</option><option>Meeting</option><option>Email</option><option>Demo</option>
            </select>
          </Field>
          <Field label="Scheduled At *">
            <input style={inputStyle} type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
          </Field>
          <Field label="Notes / Agenda">
            <textarea style={{ ...inputStyle, height: 80, resize: "vertical" }} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setShowModal(false)} style={{ background: "#2a3550", color: "#cdd5e0", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer" }}>Cancel</button>
            <button onClick={handleSubmit} style={{ background: "#f7a44e", color: "#0d1525", border: "none", borderRadius: 8, padding: "9px 20px", fontWeight: 700, cursor: "pointer" }}>Schedule</button>
          </div>
        </Modal>
      )}
    </div>
  );
}