import { useEffect, useState } from "react";
import { supabase } from "../../services/supabaseClient";
import { useAuth } from "../../context/AuthContext";
const STATUS_COLORS = {
  "In Progress": "#4e8ef7",
  "Drop out": "#f74e4e",
  "Closure": "#4ef7a4",
};

const Badge = ({ text }) => (
  <span style={{
    background: `${STATUS_COLORS[text] || "#64748b"}22`,
    color: STATUS_COLORS[text] || "#64748b",
    border: `1px solid ${(STATUS_COLORS[text] || "#64748b")}44`,
    borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600,
  }}>{text}</span>
);

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

const Field = ({ label, children }) => (
  <div style={{ marginBottom: 14 }}>
    <label style={{ color: "#475569", fontSize: 12, display: "block", marginBottom: 5 }}>{label}</label>
    {children}
  </div>
);

export default function MasterTracker() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("");
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [editForm, setEditForm] = useState({});
const { user } = useAuth();
const userEmail = user?.email?.trim().toLowerCase() || "";
const userName  = user?.name?.trim().toLowerCase()  || "";
  useEffect(() => {
    if (user?.name) fetchAll();
  }, [user?.name]);  // ← waits until user is loaded

const fetchAll = async () => {
  setLoading(true);

  // 1. Requirements — In Progress + Drop out (scoped to this BDE)
  const { data: reqData, error: reqError } = await supabase
    .from("requirements")
    .select("*, companies(company_name, contact_person, phone, email, poc)")
    .in("status", ["In Progress", "Drop out"])
    .ilike("created_by", `%${user?.name || ""}%`)
    .order("created_at", { ascending: false });

  if (reqError) console.error("[requirements] fetch failed", reqError);

  // 2. Revenue tracker — Closures scoped to this BDE via bd_name
  const { data: revData, error: revError } = await supabase
    .from("revenue_tracker")
    .select("*")
    .eq("bd_name", user?.name || "")
    .order("doj", { ascending: false });

  if (revError) console.error("[revenue_tracker] fetch failed", revError);

  // 3. Companies map for SPOC/phone/email on closure rows
  const { data: companiesData } = await supabase
    .from("companies")
    .select("company_name, poc, phone, email, contact_person");

  const companyMap = new Map();
  (companiesData || []).forEach((c) => {
    companyMap.set(c.company_name?.trim().toLowerCase(), c);
  });

  // 4. Build requirement rows
  const requirementRows = (reqData || []).map((r) => ({
    _id: r.id,
    _type: r.status === "Drop out" ? "Drop Out" : "In Progress",
    date: r.created_at?.slice(0, 10) || "-",
    source: r.mode_of_source || r.mode || "-",
    client: r.companies?.company_name || "-",
    updates: r.job_title || "-",
    status: r.status || "-",
    status_from_ta: "-",
    hire_mode: r.hire || "-",
    spoc_name: Array.isArray(r.companies?.poc)
      ? r.companies.poc[0] || "-"
      : r.companies?.poc || r.companies?.contact_person || "-",
    mobile: r.companies?.phone || "-",
    mail: r.companies?.email || "-",
    payment_terms: r.payment_terms || r.created_by || "-",
  }));

  // 5. Build closure rows from revenue_tracker
  const closureRows = (revData || []).map((r) => {
    const clientKey = r.client_name?.trim().toLowerCase();
    const matched = companyMap.get(clientKey);

    return {
      _id: r.id,
      _type: "Closure",
      date: r.doj || "-",
      source: "-",
      client: r.client_name || "-",
      updates: r.position || "-",
      status: "Closure",
      status_from_ta: r.offer_status || "-",
      hire_mode: r.hire || "-",
      spoc_name: Array.isArray(matched?.poc)
        ? matched.poc[0] || "-"
        : matched?.poc || matched?.contact_person || "-",
      mobile: matched?.phone || "-",
      mail: matched?.email || "-",
      payment_terms: r.recruiter_name || "-",
    };
  });

  setRows([...requirementRows, ...closureRows]);
  setLoading(false);
};

 const handleEdit = (row) => {
   setEditingRow(row);
   setEditForm({ ...row });
   setEditModalOpen(true);
 };

  const handleDelete = async (row) => {
    if (!window.confirm(`Delete this ${row._type} entry?`)) return;

    try {
      if (row._type === "Closure") {
        const { error } = await supabase
          .from("revenue_tracker")
          .delete()
          .eq("id", row._id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("requirements")
          .delete()
          .eq("id", row._id);
        if (error) throw error;
      }
      fetchAll();
    } catch (err) {
      alert("Failed to delete: " + err.message);
    }
  };

  const handleSave = async () => {
    try {
      if (editingRow._type === "Closure") {
        const { error } = await supabase
          .from("revenue_tracker")
          .update({
            client_name: editForm.client,
            position: editForm.updates,
            doj: editForm.date ? new Date(editForm.date).toISOString() : null,
            offer_status: editForm.status_from_ta,
            hire: editForm.hire_mode,
            recruiter_name: editForm.created_by,
            payment_terms: editForm.payment_terms,
          })
          .eq("id", editingRow._id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("requirements")
          .update({
            job_title: editForm.updates,
            status: editForm.status,
            mode: editForm.source,
            hire: editForm.hire_mode,
            created_by: editForm.created_by,
            created_at: editForm.date ? new Date(editForm.date).toISOString() : null,
            payment_terms: editForm.payment_terms,
          })
          .eq("id", editingRow._id);
        if (error) throw error;
      }
      setEditModalOpen(false);
      fetchAll();
    } catch (err) {
      alert("Failed to update: " + err.message);
    }
  };
  const filtered = filterType ? rows.filter((r) => r._type === filterType) : rows;

  return (
    <div style={{ padding: "28px 32px", background: "#ffffff", minHeight: "100vh" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: "#0f172a", fontSize: 24, fontWeight: 700, margin: 0 }}>
          Master Tracker
        </h1>
        <p style={{ color: "#475569", margin: "4px 0 0", fontSize: 13 }}>
          Overview of BDE activity — In Progress, Drop Outs & Closures
        </p>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[
          { label: "All", value: "" },
          { label: "In Progress", value: "In Progress" },
          { label: "Drop Out", value: "Drop Out" },
          { label: "Closure", value: "Closure" },
        ].map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilterType(tab.value)}
            style={{
              background: filterType === tab.value ? "#eff6ff" : "transparent",
              border: `1px solid ${filterType === tab.value ? "#bfdbfe" : "#e2e8f0"}`,
              color: filterType === tab.value ? "#2563eb" : "#64748b",
              borderRadius: 20, padding: "5px 14px", cursor: "pointer", fontSize: 12,
            }}
          >
            {tab.label}
            <span style={{
              marginLeft: 6,
              background: "#f1f5f9",
              borderRadius: 10,
              padding: "1px 7px",
              fontSize: 11,
              color: "#475569",
            }}>
              {tab.value ? rows.filter((r) => r._type === tab.value).length : rows.length}
            </span>
          </button>
        ))}
      </div>

      <div style={{ background: "#f8fafc", borderRadius: 12, overflowX: "auto", border: "1px solid #e2e8f0" }}>
        <table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f1f5f9" }}>
               {[
                 "S.No", "Date", "Source", "Client", "Type",
                 "Updates", "Status", "Status from TA",
                 "Hire Mode", "SPOC Name", "Mobile", "Mail", "Payment Terms",
                 "Actions",
               ].map((h) => (
                <th key={h} style={{
                  color: "#475569", padding: "12px 14px", textAlign: "left",
                  fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                 <td colSpan={14} style={{ padding: "24px 14px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                   Loading…
                 </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                 <td colSpan={14} style={{ padding: "24px 14px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                   No records found.
                 </td>
              </tr>
            ) : (
              filtered.map((row, i) => (
                <tr key={i} style={{ borderTop: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "10px 14px", color: "#64748b", fontSize: 12 }}>{i + 1}</td>
                  <td style={{ padding: "10px 14px", color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>{row.date}</td>
                  <td style={{ padding: "10px 14px", color: "#64748b", fontSize: 12 }}>{row.source}</td>
                  <td style={{ padding: "10px 14px", color: "#0f172a", fontWeight: 500, fontSize: 13 }}>{row.client}</td>
                  <td style={{ padding: "10px 14px" }}><Badge text={row._type} /></td>
                  <td style={{ padding: "10px 14px", color: "#64748b", fontSize: 12 }}>{row.updates}</td>
                  <td style={{ padding: "10px 14px", color: "#64748b", fontSize: 12 }}>{row.status}</td>
                  <td style={{ padding: "10px 14px", color: "#64748b", fontSize: 12 }}>{row.status_from_ta}</td>
                  <td style={{ padding: "10px 14px", color: "#64748b", fontSize: 12 }}>{row.hire_mode}</td>
                  <td style={{ padding: "10px 14px", color: "#64748b", fontSize: 12 }}>{row.spoc_name}</td>
                  <td style={{ padding: "10px 14px", color: "#64748b", fontSize: 12 }}>{row.mobile}</td>
                  <td style={{ padding: "10px 14px", color: "#64748b", fontSize: 12 }}>{row.mail}</td>
                   <td style={{ padding: "10px 14px", color: "#64748b", fontSize: 12 }}>{row.payment_terms || row.created_by || "-"}</td>
                    <td style={{ padding: "10px 14px" }}>
                     <button
                       onClick={() => handleEdit(row)}
                       style={{
                         background: "#2563eb22",
                         color: "#2563eb",
                         border: "1px solid #2563eb55",
                         borderRadius: 6,
                         padding: "4px 10px",
                         cursor: "pointer",
                         fontSize: 11,
                         fontWeight: 600,
                         marginRight: 6,
                       }}
                     >
                       Edit
                     </button>
                     <button
                       onClick={() => handleDelete(row)}
                       style={{
                         background: "#f74e4e22",
                         color: "#f74e4e",
                         border: "1px solid #f74e4e55",
                         borderRadius: 6,
                         padding: "4px 10px",
                         cursor: "pointer",
                         fontSize: 11,
                         fontWeight: 600,
                       }}
                     >
                       Delete
                     </button>
                   </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
       </div>

       {/* Edit Modal */}
       {editModalOpen && editingRow && (
         <div style={{
           position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)",
           display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
         }}>
           <div style={{
             background: "#ffffff", borderRadius: 14, padding: 28, width: 520,
             boxShadow: "0 20px 50px rgba(15,23,42,0.12)", maxHeight: "90vh", overflowY: "auto",
           }}>
             <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
               <h2 style={{ color: "#0f172a", margin: 0, fontSize: 18 }}>
                 Edit {editingRow._type} Entry
               </h2>
               <button
                 onClick={() => setEditModalOpen(false)}
                 style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 20 }}
               >×</button>
             </div>

             <Field label="Client">
               <input style={inputStyle} value={editForm.client || ""} onChange={(e) => setEditForm({ ...editForm, client: e.target.value })} />
             </Field>

             <Field label="Date">
               <input
                 type="date"
                 style={inputStyle}
                 value={editForm.date ? editForm.date.slice(0, 10) : ""}
                 onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
               />
             </Field>

             {editingRow._type !== "Closure" && (
               <Field label="Source">
                 <input style={inputStyle} value={editForm.source || ""} onChange={(e) => setEditForm({ ...editForm, source: e.target.value })} />
               </Field>
             )}

             <Field label="Updates (Position/Job Title)">
               <input style={inputStyle} value={editForm.updates || ""} onChange={(e) => setEditForm({ ...editForm, updates: e.target.value })} />
             </Field>

             {editingRow._type !== "Closure" && (
               <Field label="Status">
                 <select
                   style={inputStyle}
                   value={editForm.status || ""}
                   onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                 >
                   <option value="">Select Status</option>
                   <option value="Open">Open</option>
                   <option value="In Progress">In Progress</option>
                   <option value="Drop out">Drop out</option>
                 </select>
               </Field>
             )}

             {editingRow._type === "Closure" && (
               <Field label="Status from TA">
                 <select
                   style={inputStyle}
                   value={editForm.status_from_ta || ""}
                   onChange={(e) => setEditForm({ ...editForm, status_from_ta: e.target.value })}
                 >
                   <option value="">Select Status</option>
                   <option value="Offered">Offered</option>
                   <option value="Accepted">Accepted</option>
                   <option value="Rejected">Rejected</option>
                   <option value="Pending">Pending</option>
                   <option value="Joined">Joined</option>
                 </select>
               </Field>
             )}

             <Field label="Hire Mode">
               <input style={inputStyle} value={editForm.hire_mode || ""} onChange={(e) => setEditForm({ ...editForm, hire_mode: e.target.value })} />
             </Field>

             {editingRow._type !== "Closure" && (
               <>
                 <Field label="SPOC Name">
                   <input style={inputStyle} value={editForm.spoc_name || ""} onChange={(e) => setEditForm({ ...editForm, spoc_name: e.target.value })} />
                 </Field>
                 <Field label="Mobile">
                   <input style={inputStyle} value={editForm.mobile || ""} onChange={(e) => setEditForm({ ...editForm, mobile: e.target.value })} />
                 </Field>
                 <Field label="Mail">
                   <input style={inputStyle} value={editForm.mail || ""} onChange={(e) => setEditForm({ ...editForm, mail: e.target.value })} />
                 </Field>
               </>
             )}

              <Field label="Payment Terms">
                <input style={inputStyle} value={editForm.payment_terms || editForm.created_by || ""} onChange={(e) => setEditForm({ ...editForm, payment_terms: e.target.value })} />
              </Field>

             <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24 }}>
               <button
                 onClick={() => setEditModalOpen(false)}
                 style={{ background: "#e2e8f0", color: "#0f172a", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer" }}
               >
                 Cancel
               </button>
               <button
                 onClick={handleSave}
                 style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer", fontWeight: 600 }}
               >
                 Save
               </button>
             </div>
           </div>
         </div>
       )}
     </div>
   );
 }