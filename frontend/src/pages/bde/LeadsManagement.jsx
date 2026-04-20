import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../services/supabaseClient";

const STATUS_COLORS = {
  New: "#4e8ef7",
  Contacted: "#f7e44e",
  Interested: "#f7a44e",
  Negotiation: "#c97ef7",
  Converted: "#4ef7a4",
  Lost: "#f74e4e",
};

const PRIORITY_COLORS = { "High": "#f74e4e", "Medium": "#f7a44e", "Low": "#4e8ef7" };

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

const EMPTY_FORM = {
  company_name: "", contact_person: "", poc: "", mode_of_source: "", email: "", phone: "",
  status: "New", priority: "Medium Priority", source: "LinkedIn",
  industry: "", website: "", notes: "",
};

// ── Helper: safely coerce poc (text[]) to a JS array ────────────
function safePocArray(poc) {
  if (Array.isArray(poc)) return poc;
  if (!poc) return [];
  // Supabase may return a string like "{dhana,john}" for text[]
  if (typeof poc === "string") {
    const trimmed = poc.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return trimmed.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean);
    }
    return [trimmed];
  }
  return [];
}

// ── Smart POC cell used in each table row ───────────────────────
function PocCell({ lead, onUpdate }) {
  const [mode, setMode] = useState("select"); // "select" | "new"
  const [newVal, setNewVal] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  // Derive options from lead.poc (text[]) + any other rows for same company
  const pocArray = safePocArray(lead.poc);
  const [options, setOptions] = useState(pocArray);

  // Current active POC = last element in array (most recently set)
  const currentPoc = pocArray.length > 0 ? pocArray[pocArray.length - 1] : "";

  // On mount, fetch all unique POCs for this company from the DB
  useEffect(() => {
    const fetchOptions = async () => {
      const { data } = await supabase
        .from("companies")
        .select("poc, contact_person")
        .ilike("company_name", lead.company_name);
      if (data?.length) {
        const set = new Set();
        data.forEach((r) => {
          safePocArray(r.poc).forEach((p) => set.add(p));
          if (r.contact_person) set.add(r.contact_person);
        });
        setOptions([...set]);
      }
    };
    if (lead.company_name) fetchOptions();
  }, [lead.company_name, lead.poc]);

  useEffect(() => {
    if (mode === "new" && inputRef.current) inputRef.current.focus();
  }, [mode]);

  // Save a chosen/typed value — appends to existing array if not present
  const save = async (value) => {
    setSaving(true);
    const existing = safePocArray(lead.poc);
    const updated = existing.includes(value) ? existing : [...existing, value];
    const { error } = await supabase
      .from("companies")
      .update({ poc: updated })
      .eq("id", lead.id);
    if (!error) onUpdate();
    setSaving(false);
    setMode("select");
    setNewVal("");
  };

  if (mode === "new") {
    return (
      <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
        <input
          ref={inputRef}
          value={newVal}
          onChange={(e) => setNewVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newVal.trim()) save(newVal.trim());
            if (e.key === "Escape") { setMode("select"); setNewVal(""); }
          }}
          placeholder="Type POC name..."
          style={{ ...inputStyle, width: 120, padding: "4px 8px", fontSize: 12 }}
        />
        <button
          onClick={() => newVal.trim() && save(newVal.trim())}
          disabled={saving}
          style={{ background: "#4e8ef7", border: "none", color: "#fff", borderRadius: 5, padding: "4px 8px", cursor: "pointer", fontSize: 11, fontWeight: 600 }}
        >✓</button>
        <button
          onClick={() => { setMode("select"); setNewVal(""); }}
          style={{ background: "#2a3550", border: "none", color: "#8892a4", borderRadius: 5, padding: "4px 8px", cursor: "pointer", fontSize: 11 }}
        >✕</button>
      </div>
    );
  }

  return (
    <select
      value={currentPoc}
      onChange={async (e) => {
        if (e.target.value === "__new__") {
          setMode("new");
        } else {
          // Replace active POC: keep all but last, then append selected
          const existing = safePocArray(lead.poc);
          // Just store the chosen value as the only/last entry (or append if new)
          const updated = existing.includes(e.target.value)
            ? existing
            : [...existing, e.target.value];
          const { error } = await supabase
            .from("companies")
            .update({ poc: updated })
            .eq("id", lead.id);
          if (!error) onUpdate();
        }
      }}
      style={{ ...selectStyle, padding: "5px 8px", fontSize: 12 }}
    >
      <option value="">Select POC</option>
      {options.map((p, i) => <option key={i} value={p}>{p}</option>)}
      <option value="__new__">＋ New POC</option>
    </select>
  );
}

export default function LeadsManagement() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [filters, setFilters] = useState({ status: "", priority: "", search: "" });
  const [form, setForm] = useState(EMPTY_FORM);

  // Form POC state
  const [formPocOptions, setFormPocOptions] = useState([]);
  const [formNewPoc, setFormNewPoc] = useState(false);

  const fetchLeads = async () => {
    setLoading(true);
    let query = supabase
      .from("companies")
      .select("*")
      .neq("status", "Client")
      .order("created_at", { ascending: false });

    if (filters.status) query = query.eq("status", filters.status);
    if (filters.priority) query = query.eq("priority", filters.priority);
    if (filters.search) query = query.or(
      `company_name.ilike.%${filters.search}%,contact_person.ilike.%${filters.search}%`
    );

    const { data, error } = await query;
    if (error) console.error(error);
    else setLeads(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchLeads(); }, [filters]);

  // Auto-fetch existing POCs when company name is typed in the form
  const handleCompanyNameChange = async (name) => {
    setForm((f) => ({ ...f, company_name: name, poc: "" }));
    setFormNewPoc(false);
    if (name.trim().length < 1) { setFormPocOptions([]); return; }
    const { data } = await supabase
      .from("companies")
      .select("poc, contact_person")
      .ilike("company_name", `%${name.trim()}%`)
      .limit(50);
    if (data?.length) {
      const allPocs = new Set();
      data.forEach((r) => {
        safePocArray(r.poc).forEach((p) => allPocs.add(p));
        if (r.contact_person) allPocs.add(r.contact_person);
      });
      setFormPocOptions([...allPocs]);
    } else {
      setFormPocOptions([]);
    }
  };

  const handleSubmit = async () => {
    if (!form.company_name.trim()) return alert("Company name is required.");

    // poc stored as text[] — wrap the single selected string in an array
    const pocValue = form.poc ? [form.poc] : null;

    const payload = {
      company_name: form.company_name.trim(),
      contact_person: form.contact_person || null,
      poc: pocValue,
      mode_of_source: form.mode_of_source || null,
      email: form.email || null,
      phone: form.phone || null,
      status: form.status,
      priority: form.priority,
      source: form.source,
      industry: form.industry || null,
      website: form.website || null,
      notes: form.notes || null,
    };

    let error;
    if (selectedLead) {
      ({ error } = await supabase.from("companies").update(payload).eq("id", selectedLead.id));
    } else {
      ({ error } = await supabase.from("companies").insert(payload));
    }

    if (error) return alert(error.message);
    setShowModal(false);
    setSelectedLead(null);
    setForm(EMPTY_FORM);
    setFormPocOptions([]);
    setFormNewPoc(false);
    fetchLeads();
  };

  const openEdit = (lead) => {
    setSelectedLead(lead);
    const pocArr = safePocArray(lead.poc);
    const activePoc = pocArr.length > 0 ? pocArr[pocArr.length - 1] : "";
    setForm({
      company_name: lead.company_name || "",
      contact_person: lead.contact_person || "",
      poc: activePoc,
      mode_of_source: lead.mode_of_source || "",
      email: lead.email || "",
      phone: lead.phone || "",
      status: lead.status || "New",
      priority: lead.priority || "Medium Priority",
      source: lead.source || "LinkedIn",
      industry: lead.industry || "",
      website: lead.website || "",
      notes: lead.notes || "",
    });

    // Fetch all POCs for this company name
    (async () => {
      const { data } = await supabase
        .from("companies")
        .select("poc, contact_person")
        .ilike("company_name", lead.company_name);
      if (data?.length) {
        const set = new Set();
        data.forEach((r) => {
          safePocArray(r.poc).forEach((p) => set.add(p));
          if (r.contact_person) set.add(r.contact_person);
        });
        setFormPocOptions([...set]);
      } else {
        setFormPocOptions(pocArr);
      }
    })();

    setFormNewPoc(false);
    setShowModal(true);
  };

  const deleteLead = async (id) => {
    if (!window.confirm("Delete this lead?")) return;
    const { error } = await supabase.from("companies").delete().eq("id", id);
    if (error) return alert(error.message);
    fetchLeads();
  };

  const addNote = async () => {
    if (!noteText.trim()) return;

    // Safely coerce communication_history to array
    let existing = selectedLead.communication_history;
    if (!Array.isArray(existing)) {
      try {
        existing = existing ? JSON.parse(existing) : [];
      } catch {
        existing = [];
      }
    }

    const updated = [...existing, { note: noteText.trim(), date: new Date().toISOString() }];
    const { error } = await supabase
      .from("companies")
      .update({ communication_history: updated })
      .eq("id", selectedLead.id);
    if (error) return alert(error.message);
    setNoteText("");
    setSelectedLead({ ...selectedLead, communication_history: updated });
  };

  const updateStatus = async (id, status) => {
    const dbStatus = status === "Converted" ? "Client" : status;
    const { error } = await supabase.from("companies").update({ status: dbStatus }).eq("id", id);
    if (error) return alert(error.message);
    fetchLeads();
  };

  const convertToClient = async (lead) => {
    if (!window.confirm(`Convert "${lead.company_name}" to client?`)) return;
    const { error } = await supabase.from("companies").update({ status: "Client" }).eq("id", lead.id);
    if (error) return alert(error.message);
    fetchLeads();
    navigate("/bde/clients");
  };

  return (
    <div style={{ padding: "28px 32px", background: "#f8fafc", minHeight: "100vh" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ color: "#222", fontSize: 24, fontWeight: 700, margin: 0 }}>Leads Management</h1>
          <p style={{ color: "#64748b", margin: "4px 0 0", fontSize: 13 }}>{leads.length} leads total</p>
        </div>
        <button
          onClick={() => {
            setSelectedLead(null);
            setForm(EMPTY_FORM);
            setFormPocOptions([]);
            setFormNewPoc(false);
            setShowModal(true);
          }}
          style={{ background: "#4e8ef7", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 600, cursor: "pointer", fontSize: 14 }}
        >+ Add Lead</button>
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
          <option>High</option><option>Medium</option><option>Low</option>
        </select>
        {(filters.status || filters.priority || filters.search) && (
          <button onClick={() => setFilters({ status: "", priority: "", search: "" })} style={{
            background: "#2a3550", color: "#cdd5e0", border: "none", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 13,
          }}>Clear</button>
        )}
      </div>

      {/* Table */}
      <div style={{ background: "#f8fafc", borderRadius: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1050 }}>
          <thead>
            <tr style={{ background: "#e5eaf2" }}>
              {["SL", "Company", "Contact", "POC", "Mode of Source", "Source", "Status", "Priority", "Created", "Actions"].map((h) => (
                <th key={h} style={{ color: "#222", padding: "12px 12px", textAlign: "left", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ color: "#64748b", textAlign: "center", padding: 40 }}>Loading…</td></tr>
            ) : leads.length === 0 ? (
              <tr><td colSpan={10} style={{ color: "#64748b", textAlign: "center", padding: 40 }}>No leads found.</td></tr>
            ) : leads.map((lead, i) => (
              <tr key={lead.id} style={{ borderTop: "1px solid #e5eaf2", background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>

                <td style={{ padding: "12px 12px", color: "#222", fontSize: 13, width: 36 }}>{i + 1}</td>

                <td style={{ padding: "12px 12px" }}>
                  <div style={{ color: "#0f172a", fontWeight: 500, fontSize: 13 }}>{lead.company_name}</div>
                  <div style={{ color: "#64748b", fontSize: 11 }}>{lead.industry}</div>
                </td>

                <td style={{ padding: "12px 12px" }}>
                  <div style={{ color: "#0f172a", fontSize: 13 }}>{lead.contact_person}</div>
                  <div style={{ color: "#475569", fontSize: 11 }}>{lead.phone}</div>
                </td>

               
               <td style={{ padding: "12px 12px", minWidth: 160, color: "#0f172a", fontSize: 13 }}>
  {safePocArray(lead.poc).length > 0
    ? safePocArray(lead.poc)[safePocArray(lead.poc).length - 1]
    : "—"}
</td>
                <td style={{ padding: "12px 12px" }}>
                  <select
                    value={lead.mode_of_source || ""}
                    onChange={async (e) => {
                      const { error } = await supabase.from("companies").update({ mode_of_source: e.target.value }).eq("id", lead.id);
                      if (!error) fetchLeads();
                    }}
                    style={{ ...selectStyle, padding: "5px 8px", fontSize: 12, color: "#0f172a", background: "#fff" }}
                  >
                    <option value="">Select</option>
                    <option value="Direct">Direct</option>
                    <option value="Layer">Layer</option>
                  </select>
                </td>

                <td style={{ padding: "12px 12px", color: "#0f172a", fontSize: 13 }}>{lead.source}</td>

                <td style={{ padding: "12px 12px" }}>
                  <select
                    value={lead.status}
                    onChange={(e) => updateStatus(lead.id, e.target.value)}
                    style={{ background: `${STATUS_COLORS[lead.status]}22`, border: `1px solid ${STATUS_COLORS[lead.status]}55`, color: STATUS_COLORS[lead.status], borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer", backgroundColor: "#fff" }}
                  >
                    {Object.keys(STATUS_COLORS).map((s) => <option key={s} style={{ background: "#fff", color: "#0f172a" }}>{s}</option>)}
                  </select>
                </td>

                <td style={{ padding: "12px 12px" }}><Badge text={lead.priority} colorMap={PRIORITY_COLORS} /></td>

                <td style={{ padding: "12px 12px", color: "#0f172a", fontSize: 12, whiteSpace: "nowrap" }}>
                  {lead.created_at ? new Date(lead.created_at).toLocaleDateString("en-IN") : "—"}
                </td>

                {/* ── Actions column ── */}
                <td style={{ padding: "12px 12px", minWidth: 130 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>

                    {/* Row 1: Edit + Notes */}
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => openEdit(lead)}
                        style={{ background: "#e5eaf2", border: "none", color: "#0f172a", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 11 }}
                      >Edit</button>
                      <button
                        onClick={() => { setSelectedLead(lead); setShowNotesModal(true); }}
                        style={{ background: "#e5eaf2", border: "none", color: "#2563eb", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 11 }}
                      >Notes</button>
                    </div>

                    {/* Delete */}
                    <button
                      onClick={() => deleteLead(lead.id)}
                      style={{
                        background: "#fee2e2",
                        border: "1px solid #fecaca",
                        color: "#b91c1c",
                        borderRadius: 6,
                        padding: "5px 0",
                        cursor: "pointer",
                        fontSize: 11,
                        fontWeight: 700,
                        width: "100%",
                        textAlign: "center",
                      }}
                    >Delete</button>

                  </div>
                </td>

              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <Modal
          title={selectedLead ? "Edit Lead" : "Add New Lead"}
          onClose={() => { setShowModal(false); setSelectedLead(null); setFormNewPoc(false); }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <FormField label="Company Name *">
              <input
                style={inputStyle}
                value={form.company_name}
                onChange={(e) => handleCompanyNameChange(e.target.value)}
              />
            </FormField>
            <FormField label="Contact Person">
              <input style={inputStyle} value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} />
            </FormField>

            {/* Smart POC — dropdown if existing POCs found for company, else plain input */}
            <FormField label="Point of Contact (POC)">
              {formPocOptions.length > 0 && !formNewPoc ? (
                <select
                  style={selectStyle}
                  value={form.poc}
                  onChange={(e) => {
                    if (e.target.value === "__new__") {
                      setFormNewPoc(true);
                      setForm({ ...form, poc: "" });
                    } else {
                      setForm({ ...form, poc: e.target.value });
                    }
                  }}
                >
                  <option value="">-- Select existing POC --</option>
                  {formPocOptions.map((p, idx) => <option key={idx} value={p}>{p}</option>)}
                  <option value="__new__">＋ Add New POC</option>
                </select>
              ) : (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    style={{ ...inputStyle, flex: 1 }}
                    value={form.poc}
                    placeholder={formNewPoc ? "Type new POC name..." : "Enter POC name"}
                    autoFocus={formNewPoc}
                    onChange={(e) => setForm({ ...form, poc: e.target.value })}
                  />
                  {formNewPoc && (
                    <button
                      onClick={() => { setFormNewPoc(false); setForm({ ...form, poc: "" }); }}
                      title="Back to dropdown"
                      style={{ background: "#2a3550", border: "none", color: "#8892a4", borderRadius: 6, padding: "8px 10px", cursor: "pointer", fontSize: 13 }}
                    >↩ Back</button>
                  )}
                </div>
              )}
              {form.company_name.trim().length > 0 && formPocOptions.length === 0 && !formNewPoc && (
                <div style={{ color: "#556070", fontSize: 11, marginTop: 4 }}>No existing POCs found for this company.</div>
              )}
            </FormField>

            <FormField label="Mode of Source">
              <select style={selectStyle} value={form.mode_of_source} onChange={(e) => setForm({ ...form, mode_of_source: e.target.value })}>
                <option value="">Select</option>
                <option value="Direct">Direct</option>
                <option value="Layer">Layer</option>
              </select>
            </FormField>
            <FormField label="Email">
              <input style={inputStyle} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </FormField>
            <FormField label="Phone">
              <input style={inputStyle} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </FormField>
            <FormField label="Status">
              <select style={selectStyle} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {Object.keys(STATUS_COLORS).map((s) => <option key={s}>{s}</option>)}
              </select>
            </FormField>
            <FormField label="Priority">
              <select style={selectStyle} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                <option>High Priority</option><option>Medium Priority</option><option>Low Priority</option>
              </select>
            </FormField>
            <FormField label="Source">
              <select style={selectStyle} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                {["LinkedIn", "Referral", "Cold Call", "Email", "Website", "Event", "Other"].map((s) => <option key={s}>{s}</option>)}
              </select>
            </FormField>
            <FormField label="Industry">
              <input style={inputStyle} value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
            </FormField>
          </div>
          <FormField label="Website">
            <input style={inputStyle} value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
          </FormField>
          <FormField label="Initial Notes">
            <textarea style={{ ...inputStyle, height: 80, resize: "vertical" }} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </FormField>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => { setShowModal(false); setFormNewPoc(false); }} style={{ background: "#2a3550", color: "#cdd5e0", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer" }}>Cancel</button>
            <button onClick={handleSubmit} style={{ background: "#4e8ef7", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontWeight: 600, cursor: "pointer" }}>
              {selectedLead ? "Update" : "Add Lead"}
            </button>
          </div>
        </Modal>
      )}

      {/* Notes Modal */}
      {showNotesModal && selectedLead && (
        <Modal title={`Notes — ${selectedLead.company_name}`} onClose={() => setShowNotesModal(false)}>
          <div style={{ maxHeight: 260, overflowY: "auto", marginBottom: 16 }}>
            {(selectedLead.communication_history || []).length === 0 ? (
              <p style={{ color: "#8892a4", fontSize: 13 }}>No notes yet.</p>
            ) : [...(selectedLead.communication_history || [])].reverse().map((n, i) => (
              <div key={i} style={{ background: "#0d1525", borderRadius: 8, padding: "10px 14px", marginBottom: 8 }}>
                <div style={{ color: "#cdd5e0", fontSize: 13 }}>{n.note}</div>
                <div style={{ color: "#8892a4", fontSize: 11, marginTop: 4 }}>{new Date(n.date).toLocaleString("en-IN")}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              style={{ ...inputStyle, flex: 1 }}
              placeholder="Add a note..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addNote()}
            />
            <button onClick={addNote} style={{ background: "#4e8ef7", color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", cursor: "pointer", fontWeight: 600 }}>Add</button>
          </div>
        </Modal>
      )}
    </div>
  );
}