import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../services/supabaseClient"; 
import { useAuth } from "../../context/AuthContext";
const inputStyle = {
  width: "100%", background: "#0d1525", border: "1px solid #2a3550",
  color: "#fff", padding: "9px 12px", borderRadius: 8, fontSize: 13, boxSizing: "border-box",
};

const Modal = ({ title, onClose, children }) => (
  <div style={{
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000
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

const Field = ({ label, children }) => (
  <div style={{ marginBottom: 14 }}>
    <label style={{ color: "#8892a4", fontSize: 12, display: "block", marginBottom: 5 }}>{label}</label>
    {children}
  </div>
);

const STAGES = ["New", "Contacted", "Qualified", "Proposal", "Negotiation", "Closed"];

export default function ClientConversion() {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
const [selectedClient, setSelectedClient] = useState(null);
const { user } = useAuth();
  const [form, setForm] = useState({
    company_name: "",
    contact_person: "",
    email: "",
    phone: "",
    stage: "New",
    status: "Client",
  });

  const fetchClients = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("companies")
      .select("*")
      .eq("status", "Client")
      .eq("created_by", user?.name)
      .order("created_at", { ascending: false });

    if (error) setError(error.message);
    else setClients(data || []);
    setLoading(false);
  };

  useEffect(() => {
  if (user?.name) fetchClients();
}, [user?.name]);

  const handleSubmit = async () => {
    if (!form.company_name.trim()) return alert("Company name is required.");
    setSaving(true);
    const { error } = await supabase.from("companies").insert({
      company_name: form.company_name.trim(),
      contact_person: form.contact_person.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      stage: form.stage,
      status: "Client", // always Client on this page
      created_by: user?.name || null,
    });

    if (error) {
      alert(error.message);
    } else {
      setShowModal(false);
      setForm({ company_name: "", contact_person: "", email: "", phone: "", stage: "New", status: "Client" });
      await fetchClients();
    }
    setSaving(false);
  };

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div style={{ padding: "28px 32px", background: "#0d1525", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ color: "#fff", fontSize: 24, fontWeight: 700, margin: 0 }}>Client Conversion</h1>
          <p style={{ color: "#8892a4", margin: "4px 0 0", fontSize: 13 }}>
            {loading ? "Loading…" : `${clients.length} active client${clients.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{ background: "#4ef7a4", color: "#0d1525", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, cursor: "pointer", fontSize: 14 }}
        >
          + New Client
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div style={{ background: "#f74e4e22", border: "1px solid #f74e4e55", borderRadius: 8, padding: "12px 16px", color: "#f74e4e", marginBottom: 20, fontSize: 13 }}>
          Failed to load clients: {error}
        </div>
      )}

      {/* Client cards grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
        {loading ? (
          <p style={{ color: "#64748b" }}>Loading…</p>
        ) : clients.length === 0 ? (
          <p style={{ color: "#64748b" }}>No clients yet. Add your first one.</p>
        ) : (
          clients.map((c) => (
            <div key={c.id} style={{ background: "#f8fafc", borderRadius: 12, padding: 20, border: "1px solid #e5eaf2", boxShadow: "0 2px 8px #e5eaf2" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ color: "#0f172a", fontWeight: 600, fontSize: 15 }}>{c.company_name}</div>
                  <div style={{ color: "#475569", fontSize: 12, marginTop: 2 }}>{c.contact_person || "—"}</div>
                </div>
                {/* Stage badge */}
                <span style={{
                  background: "#e0e7ff", color: "#2563eb",
                  border: "1px solid #c7d2fe",
                  borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600,
                }}>
                  {c.stage || "—"}
                </span>
              </div>

              <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <div style={{ color: "#64748b", fontSize: 11 }}>Email</div>
                  <div style={{ color: "#0f172a", fontSize: 12 }}>{c.email || "—"}</div>
                </div>
                <div>
                  <div style={{ color: "#64748b", fontSize: 11 }}>Phone</div>
                  <div style={{ color: "#0f172a", fontSize: 12 }}>{c.phone || "—"}</div>
                </div>
                <div>
                  <div style={{ color: "#64748b", fontSize: 11 }}>Status</div>
                  <div style={{ color: "#059669", fontSize: 12, fontWeight: 600 }}>{c.status}</div>
                </div>
                <div>
                  <div style={{ color: "#64748b", fontSize: 11 }}>Added</div>
                  <div style={{ color: "#0f172a", fontSize: 12 }}>
                    {c.created_at ? new Date(c.created_at).toLocaleDateString("en-IN") : "—"}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button
                onClick={() => {
  setSelectedClient(c);
  setShowProfileModal(true);
}}
                  style={{ flex: 1, background: "#f1f5f9", color: "#0f172a", border: "none", borderRadius: 8, padding: "7px 0", cursor: "pointer", fontSize: 12 }}
                >
                  View Profile
                </button>
              </div>
            </div>
          ))
        )}
      </div>

{/* Profile Modal */}
{showProfileModal && selectedClient && (
  <Modal title="Client Profile" onClose={() => {
    setShowProfileModal(false);
    setSelectedClient(null);
  }}>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

      <Field label="Company Name">
        <input style={inputStyle} value={selectedClient.company_name || ""}
          onChange={e => setSelectedClient(c => ({ ...c, company_name: e.target.value }))} />
      </Field>

      <Field label="Contact Person">
        <input style={inputStyle} value={selectedClient.contact_person || ""}
          onChange={e => setSelectedClient(c => ({ ...c, contact_person: e.target.value }))} />
      </Field>

      <Field label="Email">
        <input style={inputStyle} value={selectedClient.email || ""}
          onChange={e => setSelectedClient(c => ({ ...c, email: e.target.value }))} />
      </Field>

      <Field label="Phone">
        <input style={inputStyle} value={selectedClient.phone || ""}
          onChange={e => setSelectedClient(c => ({ ...c, phone: e.target.value }))} />
      </Field>

      <Field label="Status">
        <input style={inputStyle} value={selectedClient.status || ""}
          onChange={e => setSelectedClient(c => ({ ...c, status: e.target.value }))} />
      </Field>

      <Field label="Stage">
        <select style={{ ...inputStyle, cursor: "pointer" }} value={selectedClient.stage || ""}
          onChange={e => setSelectedClient(c => ({ ...c, stage: e.target.value }))}>
          {STAGES.map(s => <option key={s}>{s}</option>)}
        </select>
      </Field>

      <Field label="Lead Status">
        <input style={inputStyle} value={selectedClient.lead_status || ""}
          onChange={e => setSelectedClient(c => ({ ...c, lead_status: e.target.value }))} />
      </Field>

      <Field label="Priority">
        <input style={inputStyle} value={selectedClient.priority || ""}
          onChange={e => setSelectedClient(c => ({ ...c, priority: e.target.value }))} />
      </Field>

      <Field label="Source">
        <input style={inputStyle} value={selectedClient.source || ""}
          onChange={e => setSelectedClient(c => ({ ...c, source: e.target.value }))} />
      </Field>

      <Field label="Mode of Source">
        <input style={inputStyle} value={selectedClient.mode_of_source || ""}
          onChange={e => setSelectedClient(c => ({ ...c, mode_of_source: e.target.value }))} />
      </Field>

      <Field label="Industry">
        <input style={inputStyle} value={selectedClient.industry || ""}
          onChange={e => setSelectedClient(c => ({ ...c, industry: e.target.value }))} />
      </Field>

      <Field label="Website">
        <input style={inputStyle} value={selectedClient.website || ""}
          onChange={e => setSelectedClient(c => ({ ...c, website: e.target.value }))} />
      </Field>
    </div>

    <div style={{ marginTop: 16 }}>
      <Field label="Notes">
        <textarea style={{ ...inputStyle, minHeight: 60 }} value={selectedClient.notes || ""}
          onChange={e => setSelectedClient(c => ({ ...c, notes: e.target.value }))} />
      </Field>

      <Field label="Remarks">
        <textarea style={{ ...inputStyle, minHeight: 60 }} value={selectedClient.remarks || ""}
          onChange={e => setSelectedClient(c => ({ ...c, remarks: e.target.value }))} />
      </Field>
    </div>

    <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
      <button
        onClick={() => { setShowProfileModal(false); setSelectedClient(null); }}
        style={{ background: "#2a3550", color: "#cdd5e0", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer" }}
      >
        Cancel
      </button>
      <button
        onClick={async () => {
          const { error } = await supabase
            .from("companies")
            .update({
              company_name:    selectedClient.company_name,
              contact_person:  selectedClient.contact_person,
              email:           selectedClient.email,
              phone:           selectedClient.phone,
              status:          selectedClient.status,
              stage:           selectedClient.stage,
              lead_status:     selectedClient.lead_status,
              priority:        selectedClient.priority,
              source:          selectedClient.source,
              mode_of_source:  selectedClient.mode_of_source,
              industry:        selectedClient.industry,
              website:         selectedClient.website,
              notes:           selectedClient.notes,
              remarks:         selectedClient.remarks,
            })
            .eq("id", selectedClient.id);

          if (error) {
            alert("Failed to save: " + error.message);
          } else {
            setShowProfileModal(false);
            setSelectedClient(null);
            await fetchClients();
          }
        }}
        style={{ background: "#4ef7a4", color: "#0d1525", border: "none", borderRadius: 8, padding: "9px 20px", fontWeight: 700, cursor: "pointer" }}
      >
        Save
      </button>
    </div>
  </Modal>
)}
    </div>
  );
}