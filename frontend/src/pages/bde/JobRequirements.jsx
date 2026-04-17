import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";

const inputStyle = {
  width: "100%", background: "#0d1525", border: "1px solid #2a3550",
  color: "#fff", padding: "9px 12px", borderRadius: 8, fontSize: 13, boxSizing: "border-box",
};

const STATUS_COLORS = { Open: "#4e8ef7", "In Progress": "#f7a44e", Closed: "#4ef7a4" };
const URGENCY_COLORS = { Critical: "#f74e4e", High: "#f7a44e", Medium: "#f7e44e", Low: "#4e8ef7" };

const Badge = ({ text, colorMap }) => (
  <span style={{
    background: `${(colorMap?.[text] || "#8892a4")}22`, color: colorMap?.[text] || "#8892a4",
    border: `1px solid ${(colorMap?.[text] || "#8892a4")}44`,
    borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600,
  }}>{text}</span>
);

export default function JobRequirements() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [requirements, setRequirements] = useState([]);
  const [clients, setClients] = useState([]);
  const [recruiters, setRecruiters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(!!searchParams.get("clientId"));
  const [filterStatus, setFilterStatus] = useState("");

  const [form, setForm] = useState({
    clientId: searchParams.get("clientId") || "",
    jobTitle: "", skills: "", experience: "",
    salaryMin: "", salaryMax: "", location: "",
    urgency: "Medium", status: "Open",
    assignedTo: "", description: "",
  });

  useEffect(() => {
    Promise.all([
      axios.get("/api/bde/requirements"),
      axios.get("/api/bde/clients"),
      axios.get("/api/users?role=recruiter"),
    ]).then(([r, c, rec]) => {
      setRequirements(r.data.requirements || []);
      setClients(c.data.clients || []);
      setRecruiters(rec.data || []);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const handleSubmit = async () => {
    try {
      const payload = { ...form, skills: form.skills.split(",").map((s) => s.trim()).filter(Boolean) };
      await axios.post("/api/bde/requirements", payload);
      setShowForm(false);
      const updated = await axios.get("/api/bde/requirements");
      setRequirements(updated.data.requirements || []);
      setForm({ clientId: "", jobTitle: "", skills: "", experience: "", salaryMin: "", salaryMax: "", location: "", urgency: "Medium", status: "Open", assignedTo: "", description: "" });
    } catch (err) {
      alert(err.response?.data?.message || "Error saving requirement");
    }
  };

  const filtered = filterStatus ? requirements.filter((r) => r.status === filterStatus) : requirements;

  const Field = ({ label, children, span }) => (
    <div style={{ marginBottom: 14, gridColumn: span === 2 ? "span 2" : undefined }}>
      <label style={{ color: "#8892a4", fontSize: 12, display: "block", marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );

  return (
    <div style={{ padding: "28px 32px", background: "#0d1525", minHeight: "100vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ color: "#fff", fontSize: 24, fontWeight: 700, margin: 0 }}>Job Requirements</h1>
          <p style={{ color: "#8892a4", margin: "4px 0 0", fontSize: 13 }}>BDE → Recruiter handoff</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={{ background: "#c97ef7", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 600, cursor: "pointer", fontSize: 14 }}>
          {showForm ? "Hide Form" : "+ Create Requirement"}
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div style={{ background: "#1a2236", borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <h3 style={{ color: "#fff", margin: "0 0 20px", fontSize: 16 }}>New Job Requirement</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Field label="Client *">
              <select style={{ ...inputStyle, cursor: "pointer" }} value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
                <option value="">Select Client</option>
                {clients.map((c) => <option key={c._id} value={c._id}>{c.companyName}</option>)}
              </select>
            </Field>
            <Field label="Job Title *">
              <input style={inputStyle} placeholder="e.g. Senior React Developer" value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
            </Field>
            <Field label="Skills Required (comma separated)" span={2}>
              <input style={inputStyle} placeholder="React, Node.js, MongoDB, AWS" value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} />
            </Field>
            <Field label="Experience">
              <input style={inputStyle} placeholder="e.g. 3-5 years" value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} />
            </Field>
            <Field label="Location">
              <input style={inputStyle} placeholder="e.g. Remote, Chennai, Bangalore" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </Field>
            <Field label="Salary Min (₹)">
              <input style={inputStyle} type="number" placeholder="e.g. 800000" value={form.salaryMin} onChange={(e) => setForm({ ...form, salaryMin: e.target.value })} />
            </Field>
            <Field label="Salary Max (₹)">
              <input style={inputStyle} type="number" placeholder="e.g. 1500000" value={form.salaryMax} onChange={(e) => setForm({ ...form, salaryMax: e.target.value })} />
            </Field>
            <Field label="Urgency">
              <select style={{ ...inputStyle, cursor: "pointer" }} value={form.urgency} onChange={(e) => setForm({ ...form, urgency: e.target.value })}>
                <option>Critical</option><option>High</option><option>Medium</option><option>Low</option>
              </select>
            </Field>
            <Field label="Assign to Recruiter">
              <select style={{ ...inputStyle, cursor: "pointer" }} value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}>
                <option value="">Select Recruiter</option>
                {recruiters.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}
              </select>
            </Field>
            <Field label="Job Description" span={2}>
              <textarea style={{ ...inputStyle, height: 80, resize: "vertical" }} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setShowForm(false)} style={{ background: "#2a3550", color: "#cdd5e0", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer" }}>Cancel</button>
            <button onClick={handleSubmit} style={{ background: "#c97ef7", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontWeight: 600, cursor: "pointer" }}>Create Requirement</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["", "Open", "In Progress", "Closed"].map((s) => (
          <button key={s} onClick={() => setFilterStatus(s)} style={{
            background: filterStatus === s ? "#2a3550" : "transparent",
            border: `1px solid ${filterStatus === s ? "#4e8ef7" : "#2a3550"}`,
            color: filterStatus === s ? "#4e8ef7" : "#8892a4",
            borderRadius: 20, padding: "5px 14px", cursor: "pointer", fontSize: 12,
          }}>{s || "All"}</button>
        ))}
      </div>

      {/* Requirements Table */}
      <div style={{ background: "#1a2236", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#0d1525" }}>
              {["#", "Client", "Job Title", "Skills", "Location", "Salary", "Urgency", "Status", "Assigned To"].map((h) => (
                <th key={h} style={{ color: "#8892a4", padding: "12px 14px", textAlign: "left", fontSize: 12, fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ color: "#8892a4", textAlign: "center", padding: 40 }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} style={{ color: "#8892a4", textAlign: "center", padding: 40 }}>No requirements found.</td></tr>
            ) : filtered.map((req, i) => (
              <tr key={req._id} style={{ borderTop: "1px solid #0d1525" }}>
                <td style={{ padding: "10px 14px", color: "#8892a4", fontSize: 12 }}>{i + 1}</td>
                <td style={{ padding: "10px 14px", color: "#cdd5e0", fontSize: 13 }}>{req.clientId?.companyName || "—"}</td>
                <td style={{ padding: "10px 14px" }}>
                  <div style={{ color: "#fff", fontWeight: 500, fontSize: 13 }}>{req.jobTitle}</div>
                  <div style={{ color: "#8892a4", fontSize: 11 }}>{req.experience}</div>
                </td>
                <td style={{ padding: "10px 14px", color: "#8892a4", fontSize: 12 }}>{(req.skills || []).slice(0, 3).join(", ")}</td>
                <td style={{ padding: "10px 14px", color: "#cdd5e0", fontSize: 12 }}>{req.location}</td>
                <td style={{ padding: "10px 14px", color: "#4ef7a4", fontSize: 12, fontWeight: 500 }}>
                  {req.salaryMin && req.salaryMax ? `₹${Math.round(req.salaryMin / 1000)}K–${Math.round(req.salaryMax / 1000)}K` : "—"}
                </td>
                <td style={{ padding: "10px 14px" }}><Badge text={req.urgency} colorMap={URGENCY_COLORS} /></td>
                <td style={{ padding: "10px 14px" }}><Badge text={req.status} colorMap={STATUS_COLORS} /></td>
                <td style={{ padding: "10px 14px", color: "#cdd5e0", fontSize: 12 }}>{req.assignedTo?.name || "Unassigned"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}