import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const inputStyle = {
  width: "100%", background: "#0d1525", border: "1px solid #2a3550",
  color: "#fff", padding: "9px 12px", borderRadius: 8, fontSize: 13, boxSizing: "border-box",
};

const Modal = ({ title, onClose, children }) => (
  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
    <div style={{ background: "#1a2236", borderRadius: 14, padding: 28, width: 600, maxHeight: "90vh", overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ color: "#fff", margin: 0, fontSize: 18 }}>{title}</h2>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#8892a4", cursor: "pointer", fontSize: 20 }}>×</button>
      </div>
      {children}
    </div>
  </div>
);

export default function ClientConversion() {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    companyName: "", contactPerson: "", email: "", phone: "",
    industry: "", billingTerms: "Monthly", contractValue: "",
    contractStartDate: "", contractEndDate: "",
    assignedRecruiter: "", assignedManager: "",
    status: "Active", notes: "",
  });
  const [recruiters, setRecruiters] = useState([]);
  const [managers, setManagers] = useState([]);

  useEffect(() => {
    Promise.all([
      axios.get("/api/bde/clients"),
      axios.get("/api/users?role=recruiter"),
      axios.get("/api/users?role=manager"),
    ]).then(([c, r, m]) => {
      setClients(c.data.clients || []);
      setRecruiters(r.data || []);
      setManagers(m.data || []);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const handleSubmit = async () => {
    try {
      await axios.post("/api/bde/clients", form);
      setShowModal(false);
      const updated = await axios.get("/api/bde/clients");
      setClients(updated.data.clients || []);
    } catch (err) {
      alert(err.response?.data?.message || "Error saving client");
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
          <h1 style={{ color: "#fff", fontSize: 24, fontWeight: 700, margin: 0 }}>Client Conversion</h1>
          <p style={{ color: "#8892a4", margin: "4px 0 0", fontSize: 13 }}>{clients.length} active clients</p>
        </div>
        <button onClick={() => setShowModal(true)} style={{ background: "#4ef7a4", color: "#0d1525", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
          + New Client
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
        {loading ? <p style={{ color: "#8892a4" }}>Loading…</p> : clients.map((c) => (
          <div key={c._id} style={{ background: "#1a2236", borderRadius: 12, padding: 20, border: "1px solid #2a3550" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ color: "#fff", fontWeight: 600, fontSize: 15 }}>{c.companyName}</div>
                <div style={{ color: "#8892a4", fontSize: 12, marginTop: 2 }}>{c.industry}</div>
              </div>
              <span style={{
                background: c.status === "Active" ? "#4ef7a422" : "#f74e4e22",
                color: c.status === "Active" ? "#4ef7a4" : "#f74e4e",
                border: `1px solid ${c.status === "Active" ? "#4ef7a455" : "#f74e4e55"}`,
                borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600,
              }}>{c.status}</span>
            </div>
            <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <div style={{ color: "#8892a4", fontSize: 11 }}>Contact</div>
                <div style={{ color: "#cdd5e0", fontSize: 12 }}>{c.contactPerson}</div>
              </div>
              <div>
                <div style={{ color: "#8892a4", fontSize: 11 }}>Billing</div>
                <div style={{ color: "#cdd5e0", fontSize: 12 }}>{c.billingTerms}</div>
              </div>
              <div>
                <div style={{ color: "#8892a4", fontSize: 11 }}>Contract Value</div>
                <div style={{ color: "#4ef7a4", fontSize: 13, fontWeight: 600 }}>₹{Number(c.contractValue || 0).toLocaleString("en-IN")}</div>
              </div>
              <div>
                <div style={{ color: "#8892a4", fontSize: 11 }}>Recruiter</div>
                <div style={{ color: "#cdd5e0", fontSize: 12 }}>{c.assignedRecruiter?.name || "—"}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button onClick={() => navigate(`/bde/requirements/new?clientId=${c._id}`)} style={{ flex: 1, background: "#2a3550", color: "#4e8ef7", border: "none", borderRadius: 8, padding: "7px 0", cursor: "pointer", fontSize: 12, fontWeight: 500 }}>
                + Requirement
              </button>
              <button onClick={() => navigate(`/bde/clients/${c._id}`)} style={{ flex: 1, background: "#2a3550", color: "#cdd5e0", border: "none", borderRadius: 8, padding: "7px 0", cursor: "pointer", fontSize: 12 }}>
                View Profile
              </button>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <Modal title="Create Client Profile" onClose={() => setShowModal(false)}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Field label="Company Name *">
              <input style={inputStyle} value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
            </Field>
            <Field label="Contact Person">
              <input style={inputStyle} value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
            </Field>
            <Field label="Email">
              <input style={inputStyle} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Phone">
              <input style={inputStyle} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Industry">
              <input style={inputStyle} value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
            </Field>
            <Field label="Billing Terms">
              <select style={{ ...inputStyle, cursor: "pointer" }} value={form.billingTerms} onChange={(e) => setForm({ ...form, billingTerms: e.target.value })}>
                <option>Monthly</option><option>Quarterly</option><option>Annual</option><option>Per Placement</option>
              </select>
            </Field>
            <Field label="Contract Value (₹)">
              <input style={inputStyle} type="number" value={form.contractValue} onChange={(e) => setForm({ ...form, contractValue: e.target.value })} />
            </Field>
            <Field label="Status">
              <select style={{ ...inputStyle, cursor: "pointer" }} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option>Active</option><option>On Hold</option><option>Inactive</option>
              </select>
            </Field>
            <Field label="Contract Start">
              <input style={inputStyle} type="date" value={form.contractStartDate} onChange={(e) => setForm({ ...form, contractStartDate: e.target.value })} />
            </Field>
            <Field label="Contract End">
              <input style={inputStyle} type="date" value={form.contractEndDate} onChange={(e) => setForm({ ...form, contractEndDate: e.target.value })} />
            </Field>
            <Field label="Assign Recruiter">
              <select style={{ ...inputStyle, cursor: "pointer" }} value={form.assignedRecruiter} onChange={(e) => setForm({ ...form, assignedRecruiter: e.target.value })}>
                <option value="">Select Recruiter</option>
                {recruiters.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}
              </select>
            </Field>
            <Field label="Assign Manager">
              <select style={{ ...inputStyle, cursor: "pointer" }} value={form.assignedManager} onChange={(e) => setForm({ ...form, assignedManager: e.target.value })}>
                <option value="">Select Manager</option>
                {managers.map((m) => <option key={m._id} value={m._id}>{m.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Notes">
            <textarea style={{ ...inputStyle, height: 70, resize: "vertical" }} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <button onClick={() => setShowModal(false)} style={{ background: "#2a3550", color: "#cdd5e0", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer" }}>Cancel</button>
            <button onClick={handleSubmit} style={{ background: "#4ef7a4", color: "#0d1525", border: "none", borderRadius: 8, padding: "9px 20px", fontWeight: 700, cursor: "pointer" }}>Create Client</button>
          </div>
        </Modal>
      )}
    </div>
  );
}