import { useState, useEffect } from "react";
import { supabase } from "../../services/supabaseClient";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
const inputStyle = {
  width: "100%", background: "#ffffff", border: "1px solid #d1d5db",
  color: "#0f172a", padding: "9px 12px", borderRadius: 8, fontSize: 13, boxSizing: "border-box",
};
const CustomCalendar = ({ children, onClickOutside }) => {
  return (
    <div style={{ position: "relative" }}>
      {children}

      {/* ✅ FIXED FOOTER */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          background: "#fff",
          borderTop: "1px solid #e2e8f0",
          padding: "8px 10px",
          display: "flex",
          justifyContent: "flex-end",
          zIndex: 10
        }}
      >
        <button
          onClick={() => {
  onClickOutside();
  setShowModal(false); // closes modal too
}}
          style={{
            background: "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "6px 14px",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600
          }}
        >
        </button>
      </div>
    </div>
  );
};
const Modal = ({ title, onClose, children }) => (
  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
    <div style={{ background: "#ffffff", borderRadius: 14, padding: 28, width: 480, boxShadow: "0 20px 50px rgba(15,23,42,0.12)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ color: "#0f172a", margin: 0, fontSize: 18 }}>{title}</h2>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 20 }}>×</button>
      </div>
      {children}
    </div>
  </div>
);

const Field = ({ label, children }) => (
  <div style={{ marginBottom: 14 }}>
    <label style={{ color: "#8892a4", fontSize: 12, display: "block", marginBottom: 5 }}>{label}</label>
    {children}
  </div>
);

const TYPE_ICONS = { Call: "📞", Meeting: "🤝", Email: "📧", Demo: "💻" };
const STATUS_COLORS = { Pending: "#f7e44e", Completed: "#4ef7a4", Missed: "#f74e4e" };

const EMPTY_FORM = { company_id: "", type: "Call", activity_datetime: "", notes: "", status: "Pending" };

export default function FollowUps() {
  const [followups, setFollowups] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [tab, setTab] = useState("today");
  const [form, setForm] = useState(EMPTY_FORM);
  const [dateTime, setDateTime] = useState("");

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: acts }, { data: comps }] = await Promise.all([
      supabase
        .from("activities")
        .select("*, companies(company_name, contact_person)")
        .order("activity_datetime", { ascending: true }),
      supabase
        .from("companies")
        .select("id, company_name, contact_person")
        .order("company_name"),
    ]);
    setFollowups(acts || []);
    setCompanies(comps || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const filtered = followups.filter((f) => {
    const d = new Date(f.activity_datetime);
    if (tab === "today") return d >= today && d < tomorrow;
    if (tab === "upcoming") return d >= tomorrow;
    return true;
  });

  const handleSubmit = async () => {
    if (!form.company_id) return alert("Please select a company.");
    if (!form.activity_datetime) return alert("Please set a date and time.");
    const { error } = await supabase.from("activities").insert({
      company_id: Number(form.company_id),
      type: form.type,
      activity_datetime: form.activity_datetime,
      notes: form.notes || null,
      status: form.status,
    });
    if (error) return alert(error.message);
    setShowModal(false);
    setForm(EMPTY_FORM);
    fetchAll();
  };

  const markDone = async (id) => {
    const { error } = await supabase.from("activities").update({ status: "Completed" }).eq("id", id);
    if (error) return alert(error.message);
    fetchAll();
  };

  return (
    <div style={{ padding: "28px 32px", background: "#ffffff", minHeight: "100vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ color: "#0f172a", fontSize: 24, fontWeight: 700, margin: 0 }}>Follow-ups & Activity</h1>
          <p style={{ color: "#475569", margin: "4px 0 0", fontSize: 13 }}>
            {followups.filter((f) => f.status === "Pending").length} pending follow-ups
          </p>
        </div>
        <button onClick={() => setShowModal(true)} style={{ background: "#f7a44e", color: "#0d1525", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
          + Schedule Follow-up
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "#f8fafc", borderRadius: 10, padding: 4, width: "fit-content" }}>
        {[["today", "Today"], ["upcoming", "Upcoming"], ["all", "All"]].map(([val, label]) => (
          <button key={val} onClick={() => setTab(val)} style={{
            background: tab === val ? "#2563eb" : "#ffffff",
            color: tab === val ? "#fff" : "#475569",
            border: `1px solid ${tab === val ? "#2563eb" : "#e2e8f0"}`, borderRadius: 8, padding: "7px 18px", cursor: "pointer", fontSize: 13, fontWeight: tab === val ? 600 : 400,
          }}>{label}</button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: "#475569" }}>Loading…</p>
      ) : filtered.length === 0 ? (
        <div style={{ background: "#f8fafc", borderRadius: 12, padding: 40, textAlign: "center", color: "#475569", border: "1px solid #e2e8f0" }}>
          No follow-ups for this period.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((f) => (
            <div key={f.id} style={{
              background: "#ffffff", borderRadius: 12, padding: "16px 20px",
              display: "flex", alignItems: "center", gap: 16,
              borderLeft: `4px solid ${STATUS_COLORS[f.status] || "#8892a4"}`,
              border: "1px solid #e2e8f0",
              opacity: f.status === "Completed" ? 0.6 : 1,
            }}>
              <div style={{ fontSize: 24, flexShrink: 0 }}>{TYPE_ICONS[f.type] || "📌"}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "#0f172a", fontWeight: 600, fontSize: 14 }}>
                  {f.companies?.company_name || "—"}
                </div>
                <div style={{ color: "#475569", fontSize: 12, marginTop: 2 }}>{f.notes?.slice(0, 80)}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ color: "#475569", fontSize: 12, fontWeight: 500 }}>
                  {new Date(f.activity_datetime).toLocaleDateString("en-IN")}{" "}
                  {new Date(f.activity_datetime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                </div>
                <div style={{ marginTop: 6, display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <span style={{
                    background: `${STATUS_COLORS[f.status] || "#8892a4"}22`,
                    color: STATUS_COLORS[f.status] || "#8892a4",
                    border: `1px solid ${STATUS_COLORS[f.status] || "#8892a4"}55`,
                    borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600,
                  }}>{f.status}</span>
                  {f.status === "Pending" && (
                    <button onClick={() => markDone(f.id)} style={{ background: "#4ef7a422", color: "#4ef7a4", border: "1px solid #4ef7a455", borderRadius: 20, padding: "2px 10px", cursor: "pointer", fontSize: 11 }}>
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
          <Field label="Company *">
            <select style={{ ...inputStyle, cursor: "pointer" }} value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value })}>
              <option value="">Select Company</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.company_name}{c.contact_person ? ` — ${c.contact_person}` : ""}</option>
              ))}
            </select>
          </Field>
          <Field label="Type">
            <select style={{ ...inputStyle, cursor: "pointer" }} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option>Call</option><option>Meeting</option><option>Email</option><option>Demo</option>
            </select>
          </Field>
     <Field label="Scheduled At">
            <DatePicker
              selected={
                form.activity_datetime
                  ? new Date(form.activity_datetime)
                  : null
              }
              onChange={(date) =>
                setForm({
                  ...form,
                  activity_datetime: date.toISOString(),
                })
              }
              showTimeSelect
              dateFormat="dd-MM-yyyy HH:mm"
              calendarContainer={CustomCalendar}
              customInput={<input style={inputStyle} />}
            />
          </Field>

          <Field label="Notes / Agenda">
            <textarea style={{ ...inputStyle, height: 80, resize: "vertical" }} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setShowModal(false)} style={{ background: "#e2e8f0", color: "#0f172a", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer" }}>Cancel</button>
            <button onClick={handleSubmit} style={{ background: "#f7a44e", color: "#0d1525", border: "none", borderRadius: 8, padding: "9px 20px", fontWeight: 700, cursor: "pointer" }}>Schedule</button>
          </div>
        </Modal>
      )}
    </div>
  );
}