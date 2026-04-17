import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const STATUS_COLORS = {
  New: "#4e8ef7",
  Contacted: "#f7e44e",
  Interested: "#f7a44e",
  Negotiation: "#c97ef7",
  Converted: "#4ef7a4",
  Lost: "#f74e4e",
};

const PRIORITY_COLORS = { Hot: "#f74e4e", Warm: "#f7a44e", Cold: "#4e8ef7" };

const Badge = ({ text, colorMap }) => (
  <span style={{
    background: `${(colorMap[text] || "#8892a4")}22`,
    color: colorMap[text] || "#8892a4",
    border: `1px solid ${(colorMap[text] || "#8892a4")}55`,
    borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600,
  }}>{text}</span>
);

const Modal = ({ title, onClose, children }) => (
  <div style={{
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
  }}>
    <div style={{ background: "#1a2236", borderRadius: 14, padding: 28, width: 560, maxHeight: "90vh", overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ color: "#fff", margin: 0, fontSize: 18 }}>{title}</h2>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#8892a4", cursor: "pointer", fontSize: 20 }}>×</button>
      </div>
      {children}
    </div>
  </div>
);

const FormField = ({ label, children }) => (
  <div style={{ marginBottom: 16 }}>
    <label style={{ color: "#8892a4", fontSize: 12, display: "block", marginBottom: 6 }}>{label}</label>
    {children}
  </div>
);

const inputStyle = {
  width: "100%", background: "#0d1525", border: "1px solid #2a3550",
  color: "#fff", padding: "9px 12px", borderRadius: 8, fontSize: 13, boxSizing: "border-box",
};

const selectStyle = { ...inputStyle, cursor: "pointer" };

export default function LeadsManagement() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [filters, setFilters] = useState({ status: "", priority: "", search: "" });

  const [form, setForm] = useState({
    companyName: "", contactPerson: "", email: "", phone: "",
    status: "New", priority: "Warm", source: "LinkedIn",
    industry: "", website: "", notes: "",
  });

  const fetchLeads = () => {
    setLoading(true);
    const params = {};
    if (filters.status) params.status = filters.status;
    if (filters.priority) params.priority = filters.priority;
    if (filters.search) params.search = filters.search;
    axios.get("/api/bde/leads", { params })
      .then((r) => setLeads(r.data.leads || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchLeads(); }, [filters]);

  const handleSubmit = async () => {
    try {
      if (selectedLead) {
        await axios.put(`/api/bde/leads/${selectedLead._id}`, form);
      } else {
        await axios.post("/api/bde/leads", form);
      }
      setShowModal(false);
      setSelectedLead(null);
      setForm({ companyName: "", contactPerson: "", email: "", phone: "", status: "New", priority: "Warm", source: "LinkedIn", industry: "", website: "", notes: "" });
      fetchLeads();
    } catch (err) {
      alert(err.response?.data?.message || "Error saving lead");
    }
  };

  const openEdit = (lead) => {
    setSelectedLead(lead);
    setForm({ ...lead });
    setShowModal(true);
  };

  const addNote = async () => {
    if (!noteText.trim()) return;
    await axios.post(`/api/bde/leads/${selectedLead._id}/notes`, { note: noteText });
    setNoteText("");
    const updated = await axios.get(`/api/bde/leads/${selectedLead._id}`);
    setSelectedLead(updated.data);
  };

  const updateStatus = async (id, status) => {
    await axios.patch(`/api/bde/leads/${id}/status`, { status });
    fetchLeads();
  };

  const convertToClient = async (lead) => {
    if (!window.confirm(`Convert "${lead.companyName}" to client?`)) return;
    await axios.post(`/api/bde/leads/${lead._id}/convert`);
    fetchLeads();
    navigate("/bde/clients");
  };

  return (
    <div style={{ padding: "28px 32px", background: "#0d1525", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ color: "#fff", fontSize: 24, fontWeight: 700, margin: 0 }}>Leads Management</h1>
          <p style={{ color: "#8892a4", margin: "4px 0 0", fontSize: 13 }}>{leads.length} leads total</p>
        </div>
        <button onClick={() => { setSelectedLead(null); setShowModal(true); }} style={{
          background: "#4e8ef7", color: "#fff", border: "none", borderRadius: 8,
          padding: "10px 20px", fontWeight: 600, cursor: "pointer", fontSize: 14,
        }}>+ Add Lead</button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <input
          placeholder="Search company, contact..."
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          style={{ ...inputStyle, width: 220 }}
        />
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} style={{ ...selectStyle, width: 150 }}>
          <option value="">All Status</option>
          {Object.keys(STATUS_COLORS).map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value })} style={{ ...selectStyle, width: 140 }}>
          <option value="">All Priority</option>
          <option>Hot</option><option>Warm</option><option>Cold</option>
        </select>
        {(filters.status || filters.priority || filters.search) && (
          <button onClick={() => setFilters({ status: "", priority: "", search: "" })} style={{
            background: "#2a3550", color: "#cdd5e0", border: "none", borderRadius: 8,
            padding: "8px 14px", cursor: "pointer", fontSize: 13,
          }}>Clear</button>
        )}
      </div>

      {/* Table */}
      <div style={{ background: "#1a2236", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#0d1525" }}>
              {["SL", "Company", "Contact", "Source", "Status", "Priority", "Created", "Actions"].map((h) => (
                <th key={h} style={{ color: "#8892a4", padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ color: "#8892a4", textAlign: "center", padding: 40 }}>Loading…</td></tr>
            ) : leads.length === 0 ? (
              <tr><td colSpan={8} style={{ color: "#8892a4", textAlign: "center", padding: 40 }}>No leads found.</td></tr>
            ) : leads.map((lead, i) => (
              <tr key={lead._id} style={{ borderTop: "1px solid #0d1525" }}>
                <td style={{ padding: "12px 16px", color: "#8892a4", fontSize: 13 }}>{i + 1}</td>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ color: "#fff", fontWeight: 500, fontSize: 13 }}>{lead.companyName}</div>
                  <div style={{ color: "#8892a4", fontSize: 11 }}>{lead.industry}</div>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ color: "#cdd5e0", fontSize: 13 }}>{lead.contactPerson}</div>
                  <div style={{ color: "#8892a4", fontSize: 11 }}>{lead.phone}</div>
                </td>
                <td style={{ padding: "12px 16px", color: "#cdd5e0", fontSize: 13 }}>{lead.source}</td>
                <td style={{ padding: "12px 16px" }}>
                  <select
                    value={lead.status}
                    onChange={(e) => updateStatus(lead._id, e.target.value)}
                    style={{ background: `${STATUS_COLORS[lead.status]}22`, border: `1px solid ${STATUS_COLORS[lead.status]}55`, color: STATUS_COLORS[lead.status], borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                  >
                    {Object.keys(STATUS_COLORS).map((s) => <option key={s} style={{ background: "#1a2236", color: "#fff" }}>{s}</option>)}
                  </select>
                </td>
                <td style={{ padding: "12px 16px" }}><Badge text={lead.priority} colorMap={PRIORITY_COLORS} /></td>
                <td style={{ padding: "12px 16px", color: "#8892a4", fontSize: 12 }}>{new Date(lead.createdAt).toLocaleDateString("en-IN")}</td>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => openEdit(lead)} style={{ background: "#2a3550", border: "none", color: "#cdd5e0", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 11 }}>Edit</button>
                    <button onClick={() => { setSelectedLead(lead); setShowNotesModal(true); }} style={{ background: "#2a3550", border: "none", color: "#4e8ef7", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 11 }}>Notes</button>
                    {lead.status === "Negotiation" && (
                      <button onClick={() => convertToClient(lead)} style={{ background: "#4ef7a422", border: "1px solid #4ef7a455", color: "#4ef7a4", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 11 }}>Convert</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <Modal title={selectedLead ? "Edit Lead" : "Add New Lead"} onClose={() => { setShowModal(false); setSelectedLead(null); }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
            <FormField label="Company Name *">
              <input style={inputStyle} value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
            </FormField>
            <FormField label="Contact Person">
              <input style={{ ...inputStyle, marginLeft: 8 }} value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
            </FormField>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <FormField label="Email"><input style={inputStyle} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></FormField>
            <FormField label="Phone"><input style={inputStyle} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></FormField>
            <FormField label="Status">
              <select style={selectStyle} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {Object.keys(STATUS_COLORS).map((s) => <option key={s}>{s}</option>)}
              </select>
            </FormField>
            <FormField label="Priority">
              <select style={selectStyle} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                <option>Hot</option><option>Warm</option><option>Cold</option>
              </select>
            </FormField>
            <FormField label="Source">
              <select style={selectStyle} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                {["LinkedIn", "Referral", "Cold Call", "Email", "Website", "Event", "Other"].map((s) => <option key={s}>{s}</option>)}
              </select>
            </FormField>
            <FormField label="Industry"><input style={inputStyle} value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} /></FormField>
          </div>
          <FormField label="Website"><input style={inputStyle} value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></FormField>
          <FormField label="Initial Notes">
            <textarea style={{ ...inputStyle, height: 80, resize: "vertical" }} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </FormField>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setShowModal(false)} style={{ background: "#2a3550", color: "#cdd5e0", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer" }}>Cancel</button>
            <button onClick={handleSubmit} style={{ background: "#4e8ef7", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontWeight: 600, cursor: "pointer" }}>
              {selectedLead ? "Update" : "Add Lead"}
            </button>
          </div>
        </Modal>
      )}

      {/* Notes Modal */}
      {showNotesModal && selectedLead && (
        <Modal title={`Notes — ${selectedLead.companyName}`} onClose={() => setShowNotesModal(false)}>
          <div style={{ maxHeight: 260, overflowY: "auto", marginBottom: 16 }}>
            {(selectedLead.communicationHistory || []).length === 0 ? (
              <p style={{ color: "#8892a4", fontSize: 13 }}>No notes yet.</p>
            ) : [...(selectedLead.communicationHistory || [])].reverse().map((n, i) => (
              <div key={i} style={{ background: "#0d1525", borderRadius: 8, padding: "10px 14px", marginBottom: 8 }}>
                <div style={{ color: "#cdd5e0", fontSize: 13 }}>{n.note}</div>
                <div style={{ color: "#8892a4", fontSize: 11, marginTop: 4 }}>{new Date(n.date).toLocaleString("en-IN")}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              style={{ ...inputStyle, flex: 1 }} placeholder="Add a note..."
              value={noteText} onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addNote()}
            />
            <button onClick={addNote} style={{ background: "#4e8ef7", color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", cursor: "pointer", fontWeight: 600 }}>Add</button>
          </div>
        </Modal>
      )}
    </div>
  );
}