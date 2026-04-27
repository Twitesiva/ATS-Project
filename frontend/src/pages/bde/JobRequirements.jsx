import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../../services/supabaseClient";
import { useAuth } from "../../context/AuthContext";
const inputStyle = {
  width: "100%", background: "#ffffff", border: "1px solid #d1d5db",
  color: "#0f172a", padding: "9px 12px", borderRadius: 8, fontSize: 13, boxSizing: "border-box",
};

const selectStyle = { ...inputStyle, cursor: "pointer" };

const STATUS_COLORS = { Open: "#4e8ef7", "In Progress": "#f7a44e", "Drop out": "#4ef7a4" };
const URGENCY_COLORS = { Critical: "#f74e4e", High: "#f7a44e", Medium: "#f7e44e", Low: "#4e8ef7" };

const Badge = ({ text, colorMap }) => (
  <span style={{
    background: `${(colorMap?.[text] || "#64748b")}22`, color: colorMap?.[text] || "#64748b",
    border: `1px solid ${(colorMap?.[text] || "#64748b")}44`,
    borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600,
  }}>{text}</span>
);

const EMPTY_FORM = {
  company_id: "", job_title: "", skills: "", experience: "",
  salary_min: "", salary_max: "", location: "",
  no_of_openings: "", mode: "", hire: "",
  urgency: "Medium", status: "Open", description: "",
};

// In the form section (lines ~152):
// Remove the mode_of_source select input entirely
const Field = ({ label, children, span }) => (
  <div style={{ marginBottom: 14, gridColumn: span === 2 ? "span 2" : undefined }}>
    <label style={{ color: "#475569", fontSize: 12, display: "block", marginBottom: 5 }}>{label}</label>
    {children}
  </div>
);

export default function JobRequirements() {
  const location = useLocation();
  const { user } = useAuth(); 
  const passedCompany = location.state?.company || null;
  const passedCompanyId = location.state?.companyId || "";
  const passedCompanyName = location.state?.companyName || "";

  const [requirements, setRequirements] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(!!passedCompanyId || !!passedCompany);
  const [filterStatus, setFilterStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    ...EMPTY_FORM,
    company_id: passedCompany?.id || passedCompanyId || "",
  });
  const [expError, setExpError] = useState("");

  const handleExpChange = (value) => {
    const numericOnly = value.replace(/\D/g, "");
    setForm((f) => ({ ...f, experience: numericOnly }));
    if (numericOnly && isNaN(Number(numericOnly))) {
      setExpError("Experience must be a number");
    } else {
      setExpError("");
    }
  };

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: reqs }, { data: companies }] = await Promise.all([
      supabase
        .from("requirements")
        .select("*, companies(company_name)")
        .ilike("created_by", `%${user?.name || ""}%`)  // ← filter by logged-in user
        .order("created_at", { ascending: false }),
      supabase.from("companies").select("id, company_name").eq("status", "Client"),
    ]);
    setRequirements(reqs || []);
    setClients(companies || []);
    setLoading(false);
  };

  useEffect(() => { 
    if (user?.name) fetchAll();  // ← wait for user to load
  }, [user?.name]);

  useEffect(() => {
    if (passedCompany) {
      setForm((prev) => ({ ...prev, company_id: passedCompany.id }));
      setShowForm(true);
    }
  }, [passedCompany?.id]);

  const handleSubmit = async () => {
    if (!form.company_id) return alert("Please select a client.");
    if (!form.job_title.trim()) return alert("Job title is required.");
    if (form.experience && isNaN(Number(form.experience))) {
      setExpError("Experience must be a number");
      return;
    }
    setSaving(true);
    const payload = {
  company_id: Number(form.company_id),
  job_title: form.job_title.trim(),
  skills: form.skills || null,
  experience: form.experience || null,
  salary_min: form.salary_min ? Number(form.salary_min) : null,
  salary_max: form.salary_max ? Number(form.salary_max) : null,
  location: form.location || null,
  no_of_openings: form.no_of_openings ? Number(form.no_of_openings) : null,
  mode: form.mode || null,
  hire: form.hire || null,
  urgency: form.urgency,
  status: form.status,
  description: form.description || null,
  created_by: user?.name, 
};
    let error;
    if (editingId) {
      ({ error } = await supabase.from("requirements").update(payload).eq("id", editingId));
    } else {
      ({ error } = await supabase.from("requirements").insert({
        ...payload,
        created_at: new Date().toISOString(),
      }));
    }
    if (error) { alert(error.message); setSaving(false); return; }
    setShowForm(false);
    setForm(EMPTY_FORM);
    setEditingId(null);
    setExpError("");
    fetchAll();
    setSaving(false);
  };

  const filtered = filterStatus
    ? requirements.filter((r) => r.status === filterStatus)
    : requirements;
    const uniqueByClientPosition = new Map();
filtered.forEach((row) => {
  const key = `${row.client_name?.trim().toLowerCase() || ""}||${row.position?.trim().toLowerCase() || ""}`;
  const existing = uniqueByClientPosition.get(key);
  if (!existing || new Date(row.doj) > new Date(existing.doj)) {
    uniqueByClientPosition.set(key, row);
  }
});
  return (
    <div style={{ padding: "28px 32px", background: "#ffffff", minHeight: "100vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ color: "#0f172a", fontSize: 24, fontWeight: 700, margin: 0 }}>Job Requirements</h1>
          <p style={{ color: "#475569", margin: "4px 0 0", fontSize: 13 }}>BDE → Recruiter handoff</p>
        </div>
        <button
          onClick={() => { setForm(EMPTY_FORM); setEditingId(null); setExpError(""); setShowForm(!showForm); }}
          style={{ background: "#eff6ff", color: "#2563eb", border: "1px solid #c7d2fe", borderRadius: 8, padding: "10px 20px", fontWeight: 600, cursor: "pointer", fontSize: 14 }}
        >
          {showForm ? "Hide Form" : "+ Create Requirement"}
        </button>
      </div>

      {showForm && (
        <div style={{ background: "#f8fafc", borderRadius: 12, padding: 24, marginBottom: 24, border: "1px solid #e2e8f0" }}>
          <h3 style={{ color: "#0f172a", margin: "0 0 20px", fontSize: 16 }}>
            {editingId ? "Edit Requirement" : "New Job Requirement"}
            {(passedCompanyName || passedCompany?.company_name) && !editingId && (
              <span style={{ color: "#c97ef7", fontWeight: 400, fontSize: 14, marginLeft: 10 }}>
                — {passedCompanyName || passedCompany?.company_name}
              </span>
            )}
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

            <Field label="Client *">
              <select
                style={selectStyle}
                value={form.company_id}
                onChange={(e) => setForm({ ...form, company_id: e.target.value })}
              >
                <option value="">Select Client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.company_name}</option>
                ))}
              </select>
            </Field>

            <Field label="Mode of Source">
              <select
                style={selectStyle}
                value={form.mode_of_source}
                onChange={(e) => setForm({ ...form, mode_of_source: e.target.value })}
              >
                <option value="">Select</option>
                <option value="Direct">Direct</option>
                <option value="Layer">Layer</option>
              </select>
            </Field>

            <Field label="Job Title *">
              <input
                style={inputStyle}
                placeholder="e.g. Senior React Developer"
                value={form.job_title}
                onChange={(e) => setForm({ ...form, job_title: e.target.value })}
              />
            </Field>
<Field label="Created By">
  <input
    style={{ ...inputStyle, background: "#f1f5f9", color: "#64748b" }}
    value={user?.name || "—"}
    readOnly
  />
</Field>
            <Field label="Experience">
              <input
                style={inputStyle}
                placeholder="e.g. 3"
                value={form.experience}
                onChange={(e) => handleExpChange(e.target.value)}
              />
              {expError && <div style={{ color: "#f74e4e", fontSize: 11, marginTop: 4 }}>{expError}</div>}
            </Field>

            <Field label="Skills Required (comma separated)" span={2}>
              <input
                style={inputStyle}
                placeholder="React, Node.js, MongoDB, AWS"
                value={form.skills}
                onChange={(e) => setForm({ ...form, skills: e.target.value })}
              />
            </Field>
            <Field label="No of Opening">
  <input
    style={inputStyle}
    type="number"
    placeholder="e.g. 5"
    value={form.no_of_openings}
    onChange={(e) => setForm({ ...form, no_of_openings: e.target.value })}
  />
</Field>

<Field label="Mode">
  <select
    style={selectStyle}
    value={form.mode}
    onChange={(e) => setForm({ ...form, mode: e.target.value })}
  >
    <option value="">Select</option>
    <option value="Email">Email</option>
    <option value="Phone">Phone</option>
    <option value="Linkedin">Linkedin</option>
  </select>
</Field>
            <Field label="Hire">
  <select
    style={selectStyle}
    value={form.hire}
    onChange={(e) => setForm({ ...form, hire: e.target.value })}
  >
    <option value="">Select</option>
    <option value="Permanent">Permanent</option>
    <option value="Contract">Contract</option>
  </select>
</Field>

            <Field label="Location">
              <input
                style={inputStyle}
                placeholder="e.g. Remote, Chennai, Bangalore"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </Field>

            <Field label="Urgency">
              <select
                style={selectStyle}
                value={form.urgency}
                onChange={(e) => setForm({ ...form, urgency: e.target.value })}
              >
                <option>Critical</option>
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </select>
            </Field>

            <Field label="Salary Min (₹)">
              <input
                style={inputStyle}
                type="number"
                placeholder="e.g. 800000"
                value={form.salary_min}
                onChange={(e) => setForm({ ...form, salary_min: e.target.value })}
              />
            </Field>

            <Field label="Salary Max (₹)">
              <input
                style={inputStyle}
                type="number"
                placeholder="e.g. 1500000"
                value={form.salary_max}
                onChange={(e) => setForm({ ...form, salary_max: e.target.value })}
              />
            </Field>

            <Field label="Status">
              <select
                style={selectStyle}
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option>Open</option>
                <option>In Progress</option>
                <option>Drop out</option>
                <option>Closure</option>
    
              </select>
            </Field>

            <Field label="Job Description" span={2}>
              <textarea
                style={{ ...inputStyle, height: 80, resize: "vertical" }}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>

          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              onClick={() => { setShowForm(false); setEditingId(null); }}
              style={{ background: "#e2e8f0", color: "#0f172a", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer" }}
            >Cancel</button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              style={{ background: saving ? "#e2e8f0" : "#c97ef7", color: "#0f172a", border: "none", borderRadius: 8, padding: "9px 20px", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer" }}
            >
              {saving ? "Saving…" : editingId ? "Update Requirement" : "Create Requirement"}
            </button>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["", "Open", "In Progress", "Drop out"].map((s) => (
          <button key={s} onClick={() => setFilterStatus(s)} style={{
            background: filterStatus === s ? "#eff6ff" : "transparent",
            border: `1px solid ${filterStatus === s ? "#bfdbfe" : "#e2e8f0"}`,
            color: filterStatus === s ? "#2563eb" : "#64748b",
            borderRadius: 20, padding: "5px 14px", cursor: "pointer", fontSize: 12,
          }}>{s || "All"}</button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: "#f8fafc", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f1f5f9" }}>
             {["#", "Client","Created By", "Job Title", "Skills", "Location", "No of Opening", "Mode", "Salary", "Urgency", "Status", "Actions"].map((h) => (
                <th key={h} style={{ color: "#8892a4", padding: "12px 14px", textAlign: "left", fontSize: 12, fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <><tr><td colSpan={11} style={{ color: "#64748b", textAlign: "center", padding: 40 }}>Loading…</td></tr><tr><td colSpan={11} style={{ color: "#64748b", textAlign: "center", padding: 40 }}>No requirements found.</td></tr></>
            ) : filtered.map((req, i) => (
              <tr key={req.id} style={{ borderTop: "1px solid #e2e8f0" }}>
                <td style={{ padding: "10px 14px", color: "#64748b", fontSize: 12 }}>{i + 1}</td>
                <td style={{ padding: "10px 14px", color: "#0f172a", fontSize: 13 }}>{req.companies?.company_name || "—"}</td>
                <td style={{ padding: "10px 14px", fontSize: 13, color: "#0f172a" }}>{req.created_by || "—"}</td>
                <td style={{ padding: "10px 14px" }}>
                  <div style={{ color: "#0f172a", fontWeight: 500, fontSize: 13 }}>{req.job_title}</div>
                  <div style={{ color: "#64748b", fontSize: 11 }}>{req.experience}</div>
                </td>
                <td style={{ padding: "10px 14px", color: "#64748b", fontSize: 12 }}>{req.skills || "—"}</td>
             <td style={{ padding: "10px 14px", color: "#0f172a", fontSize: 12 }}>{req.location || "—"}</td>
<td style={{ padding: "10px 14px", color: "#0f172a", fontSize: 12, fontWeight: 600 }}>{req.no_of_openings || "—"}</td>
<td style={{ padding: "10px 14px", color: "#64748b", fontSize: 12 }}>{req.mode || "—"}</td>
<td style={{ padding: "10px 14px", color: "#4ef7a4", fontSize: 12, fontWeight: 500 }}>
                  {req.salary_min && req.salary_max
                    ? `₹${Math.round(req.salary_min / 1000)}K–${Math.round(req.salary_max / 1000)}K`
                    : "—"}
                </td>
                <td style={{ padding: "10px 14px" }}><Badge text={req.urgency} colorMap={URGENCY_COLORS} /></td>
                <td style={{ padding: "10px 14px" }}><Badge text={req.status} colorMap={STATUS_COLORS} /></td>
                <td style={{ padding: "10px 14px" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => {
                        setForm({
                          company_id: req.company_id,
                          mode_of_source: req.mode_of_source || "",
                          mode: req.mode || "",
                          job_title: req.job_title || "",
                          skills: req.skills || "",
                          experience: req.experience || "",
                          salary_min: req.salary_min || "",
                          salary_max: req.salary_max || "",
                          location: req.location || "",
                          urgency: req.urgency || "Medium",
                          status: req.status || "Open",
                          description: req.description || "",
                        });
                        setEditingId(req.id);
                        setShowForm(true);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      style={{ background: "#eff6ff", border: "1px solid #bfdbfe", color: "#2563eb", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 11 }}
                    >Edit</button>
                    <button
                      onClick={async () => {
                        if (!window.confirm("Delete this requirement?")) return;
                        const { error } = await supabase.from("requirements").delete().eq("id", req.id);
                        if (error) return alert(error.message);
                        fetchAll();
                      }}
                      style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 11 }}
                    >Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
