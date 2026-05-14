import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { listCompanies } from "../../services/bdeCompanies";
import { createActivity, listFollowUps } from "../../services/bdeData";

const inputStyle = {
  width: "100%",
  background: "#ffffff",
  border: "1px solid #d1d5db",
  color: "#0f172a",
  padding: "9px 12px",
  borderRadius: 8,
  fontSize: 13,
  boxSizing: "border-box",
};

const TYPE_ICONS = {
  Call: "📞",
  Email: "📧",
  Meeting: "🤝",
  Proposal: "📄",
  Contract: "📝",
  Other: "💬",
};
const TYPE_COLORS = {
  Call: "#4e8ef7",
  Email: "#f7e44e",
  Meeting: "#4ef7a4",
  Proposal: "#c97ef7",
  Contract: "#f7a44e",
  Other: "#8892a4",
};

const Field = ({ label, children }) => (
  <div style={{ marginBottom: 14 }}>
    <label style={{ color: "#475569", fontSize: 12, display: "block", marginBottom: 5 }}>{label}</label>
    {children}
  </div>
);

const EMPTY_FORM = {
  company_id: "",
  type: "Call",
  subject: "",
  notes: "",
  activity_datetime: new Date().toISOString().slice(0, 16),
};

export default function CommunicationLog() {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompany, setSelectedCompany] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const fetchCompanies = async () => {
    try {
      const comps = await listCompanies();
      setCompanies(comps || []);
    } catch (e) {
      console.error(e);
      setCompanies([]);
    }
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const all = await listFollowUps();
      const filtered = selectedCompany
        ? (all || []).filter((a) => String(a.company_id) === String(selectedCompany))
        : (all || []);
      setLogs(filtered);
    } catch (e) {
      console.error(e);
      setLogs([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!user?.email && !user?.name) return;
    fetchCompanies();
  }, [user?.email, user?.name]);

  useEffect(() => {
    if (!user?.email && !user?.name) return;
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompany, user?.email, user?.name]);

  const handleSubmit = async () => {
    if (!form.company_id) return alert("Please select a company.");
    try {
      await createActivity({
        company_id: Number(form.company_id),
        type: form.type,
        subject: form.subject || null,
        notes: form.notes || null,
        activity_datetime: form.activity_datetime,
        status: "Completed",
      });
    } catch (e) {
      return alert(e?.message || "Failed to save log");
    }

    setShowForm(false);
    setForm({ ...EMPTY_FORM, company_id: selectedCompany });
    fetchLogs();
  };

  return (
    <div style={{ padding: "28px 32px", background: "#ffffff", minHeight: "100vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ color: "#0f172a", fontSize: 24, fontWeight: 700, margin: 0 }}>Communication Log</h1>
          <p style={{ color: "#475569", margin: "4px 0 0", fontSize: 13 }}>Calls, emails, meetings & proposals</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{ background: "#4ef7f7", color: "#0d1525", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, cursor: "pointer", fontSize: 14 }}
        >
          {showForm ? "Hide" : "+ Log Communication"}
        </button>
      </div>

      <div style={{ marginBottom: 20 }}>
        <select value={selectedCompany} onChange={(e) => setSelectedCompany(e.target.value)} style={{ ...inputStyle, width: 260, cursor: "pointer" }}>
          <option value="">All Companies</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.company_name}
              {c.contact_person ? ` — ${c.contact_person}` : ""}
            </option>
          ))}
        </select>
      </div>

      {showForm && (
        <div style={{ background: "#f8fafc", borderRadius: 12, padding: 24, marginBottom: 24, border: "1px solid #e2e8f0" }}>
          <h3 style={{ color: "#0f172a", margin: "0 0 16px", fontSize: 16 }}>New Communication Entry</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Field label="Company *">
              <select style={{ ...inputStyle, cursor: "pointer" }} value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value })}>
                <option value="">Select Company</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Type">
              <select style={{ ...inputStyle, cursor: "pointer" }} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {Object.keys(TYPE_ICONS).map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Subject / Title">
              <input style={inputStyle} placeholder="e.g. Initial discovery call" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </Field>
            <Field label="Date & Time">
              <input style={inputStyle} type="datetime-local" value={form.activity_datetime} onChange={(e) => setForm({ ...form, activity_datetime: e.target.value })} />
            </Field>
          </div>
          <Field label="Notes / Summary">
            <textarea
              style={{ ...inputStyle, height: 100, resize: "vertical" }}
              placeholder="Key discussion points, outcomes, next steps..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setShowForm(false)} style={{ background: "#e2e8f0", color: "#0f172a", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer" }}>
              Cancel
            </button>
            <button onClick={handleSubmit} style={{ background: "#4ef7f7", color: "#0d1525", border: "none", borderRadius: 8, padding: "9px 20px", fontWeight: 700, cursor: "pointer" }}>
              Save Log
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ color: "#64748b" }}>Loading…</p>
      ) : logs.length === 0 ? (
        <div style={{ background: "#f8fafc", borderRadius: 12, padding: 40, textAlign: "center", color: "#64748b", border: "1px solid #e2e8f0" }}>
          No communication logs found.
        </div>
      ) : (
        <div style={{ position: "relative", paddingLeft: 32 }}>
          <div style={{ position: "absolute", left: 10, top: 0, bottom: 0, width: 2, background: "#cbd5e1" }} />
          {logs.map((log) => (
            <div key={log.id} style={{ position: "relative", marginBottom: 20 }}>
              <div
                style={{
                  position: "absolute",
                  left: -28,
                  top: 14,
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: TYPE_COLORS[log.type] || "#8892a4",
                  border: "3px solid #ffffff",
                }}
              />
              <div style={{ background: "#ffffff", borderRadius: 12, padding: "16px 20px", border: "1px solid #e2e8f0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div>
                    <span
                      style={{
                        background: `${TYPE_COLORS[log.type] || "#8892a4"}22`,
                        color: TYPE_COLORS[log.type] || "#8892a4",
                        border: `1px solid ${(TYPE_COLORS[log.type] || "#8892a4")}44`,
                        borderRadius: 20,
                        padding: "2px 10px",
                        fontSize: 11,
                        fontWeight: 600,
                        marginRight: 10,
                      }}
                    >
                      {TYPE_ICONS[log.type] || "💬"} {log.type}
                    </span>
                    <span style={{ color: "#0f172a", fontSize: 14, fontWeight: 600 }}>{log.subject || "—"}</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: "#475569", fontSize: 12 }}>{new Date(log.activity_datetime).toLocaleDateString("en-IN")}</div>
                    <div style={{ color: "#475569", fontSize: 11 }}>
                      {new Date(log.activity_datetime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
                <div style={{ color: "#475569", fontSize: 12, marginBottom: 6 }}>
                  🏢 {log.companies?.company_name || "—"}
                  {log.companies?.contact_person ? ` · ${log.companies.contact_person}` : ""}
                </div>
                {log.notes && <div style={{ color: "#475569", fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{log.notes}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

