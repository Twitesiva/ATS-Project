import { useState, useEffect } from "react";
import axios from "axios";

const inputStyle = {
  width: "100%", background: "#0d1525", border: "1px solid #2a3550",
  color: "#fff", padding: "9px 12px", borderRadius: 8, fontSize: 13, boxSizing: "border-box",
};

const TYPE_ICONS = { Call: "📞", Email: "📧", Meeting: "🤝", Proposal: "📄", Contract: "📝", Other: "💬" };
const TYPE_COLORS = { Call: "#4e8ef7", Email: "#f7e44e", Meeting: "#4ef7a4", Proposal: "#c97ef7", Contract: "#f7a44e", Other: "#8892a4" };

export default function CommunicationLog() {
  const [logs, setLogs] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ leadId: "", type: "Call", subject: "", content: "", date: new Date().toISOString().slice(0, 16) });

  const fetchLogs = () => {
    const params = selectedLead ? { leadId: selectedLead } : {};
    axios.get("/api/bde/communications", { params })
      .then((r) => setLogs(r.data.logs || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    axios.get("/api/bde/leads?limit=200")
      .then((r) => setLeads(r.data.leads || []))
      .catch(console.error);
  }, []);

  useEffect(() => { fetchLogs(); }, [selectedLead]);

  const handleSubmit = async () => {
    try {
      await axios.post("/api/bde/communications", form);
      setShowForm(false);
      setForm({ leadId: selectedLead || "", type: "Call", subject: "", content: "", date: new Date().toISOString().slice(0, 16) });
      fetchLogs();
    } catch (err) {
      alert(err.response?.data?.message || "Error saving log");
    }
  };

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
          <h1 style={{ color: "#fff", fontSize: 24, fontWeight: 700, margin: 0 }}>Communication Log</h1>
          <p style={{ color: "#8892a4", margin: "4px 0 0", fontSize: 13 }}>Calls, emails, meetings & proposals</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={{ background: "#4ef7f7", color: "#0d1525", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
          {showForm ? "Hide" : "+ Log Communication"}
        </button>
      </div>

      {/* Filter by Lead */}
      <div style={{ marginBottom: 20 }}>
        <select
          value={selectedLead} onChange={(e) => setSelectedLead(e.target.value)}
          style={{ ...inputStyle, width: 260, cursor: "pointer" }}
        >
          <option value="">All Leads / Clients</option>
          {leads.map((l) => <option key={l._id} value={l._id}>{l.companyName} — {l.contactPerson}</option>)}
        </select>
      </div>

      {/* Log Form */}
      {showForm && (
        <div style={{ background: "#1a2236", borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 16 }}>New Communication Entry</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Field label="Lead / Client *">
              <select style={{ ...inputStyle, cursor: "pointer" }} value={form.leadId} onChange={(e) => setForm({ ...form, leadId: e.target.value })}>
                <option value="">Select Lead</option>
                {leads.map((l) => <option key={l._id} value={l._id}>{l.companyName}</option>)}
              </select>
            </Field>
            <Field label="Type">
              <select style={{ ...inputStyle, cursor: "pointer" }} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {Object.keys(TYPE_ICONS).map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Subject / Title">
              <input style={inputStyle} placeholder="e.g. Initial discovery call" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </Field>
            <Field label="Date & Time">
              <input style={inputStyle} type="datetime-local" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Field>
          </div>
          <Field label="Notes / Summary">
            <textarea style={{ ...inputStyle, height: 100, resize: "vertical" }} placeholder="Key discussion points, outcomes, next steps..." value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
          </Field>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setShowForm(false)} style={{ background: "#2a3550", color: "#cdd5e0", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer" }}>Cancel</button>
            <button onClick={handleSubmit} style={{ background: "#4ef7f7", color: "#0d1525", border: "none", borderRadius: 8, padding: "9px 20px", fontWeight: 700, cursor: "pointer" }}>Save Log</button>
          </div>
        </div>
      )}

      {/* Timeline */}
      {loading ? (
        <p style={{ color: "#8892a4" }}>Loading…</p>
      ) : logs.length === 0 ? (
        <div style={{ background: "#1a2236", borderRadius: 12, padding: 40, textAlign: "center", color: "#8892a4" }}>No communication logs found.</div>
      ) : (
        <div style={{ position: "relative", paddingLeft: 32 }}>
          {/* Timeline line */}
          <div style={{ position: "absolute", left: 10, top: 0, bottom: 0, width: 2, background: "#2a3550" }} />

          {logs.map((log) => (
            <div key={log._id} style={{ position: "relative", marginBottom: 20 }}>
              {/* Dot */}
              <div style={{
                position: "absolute", left: -28, top: 14, width: 16, height: 16,
                borderRadius: "50%", background: TYPE_COLORS[log.type] || "#8892a4",
                border: "3px solid #0d1525", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 8,
              }} />
              <div style={{ background: "#1a2236", borderRadius: 12, padding: "16px 20px", border: "1px solid #2a3550" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div>
                    <span style={{
                      background: `${TYPE_COLORS[log.type]}22`, color: TYPE_COLORS[log.type],
                      border: `1px solid ${TYPE_COLORS[log.type]}44`,
                      borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600, marginRight: 10,
                    }}>{TYPE_ICONS[log.type]} {log.type}</span>
                    <span style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>{log.subject}</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: "#8892a4", fontSize: 12 }}>{new Date(log.date).toLocaleDateString("en-IN")}</div>
                    <div style={{ color: "#8892a4", fontSize: 11 }}>{new Date(log.date).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                </div>
                <div style={{ color: "#8892a4", fontSize: 12, marginBottom: 6 }}>
                  🏢 {log.leadId?.companyName || "—"} · {log.leadId?.contactPerson || ""}
                </div>
                {log.content && <div style={{ color: "#cdd5e0", fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{log.content}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}