import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch } from "../../utils/apiFetch";
import { deleteCompany, listCompanies, updateCompany } from "../../services/bdeCompanies";
import { normalizePhone10 } from "../../utils/phone";

const today = new Date().toISOString().split("T")[0];

const initialForm = {
  date: "",
  leadName: "",
  company: "",
  source: "",
  mobile: "",
  email: "",
  status: "",
  remarks: "",
};

export default function DailyTracker() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editRow, setEditRow] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState("all");

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const companies = await listCompanies();
        const todayRows = (companies || []).filter((c) =>
          String(c.created_at || "").startsWith(today)
        );
        setRows(todayRows);
      } catch (error) {
        console.error("Error fetching daily tracker:", error);
      }
      setLoading(false);
    };

    if (user?.email || user?.name) fetchData();
  }, [user?.email, user?.name]); // ← useEffect closes here

  // ↓ All handlers are OUTSIDE useEffect
  const handleEdit = (row) => {
    setEditRow(row);
    setForm({
      date: row.activity_date?.split("T")[0] || "",
      leadName: row.lead_name || row.contact_person || "",
      company: row.company_name || "",
      source: row.source || "",
      mobile: row.phone || "",
      email: row.email || "",
      status: row.status || "",
      remarks: row.remarks || row.notes || "",
    });
    setShowModal(true);
  };

  const handleDelete = async (row) => {
    if (!window.confirm("Delete this entry?")) return;
    try {
      await deleteCompany(row.id);
      setRows(rows.filter(r => r.id !== row.id));
    } catch (error) {
      console.error("Error deleting entry:", error);
    }
  };

  const handleSave = async () => {
    try {
      const updatedData = await updateCompany(editRow.id, {
        company_name: form.company,
        contact_person: form.leadName,
        source: form.source,
        phone: form.mobile,
        email: form.email,
        status: form.status,
        remarks: form.remarks,
      });
      setRows(rows.map(r =>
        r.id === editRow.id
          ? {
              ...r,
              contact_person: form.leadName,
              company_name: form.company,
              source: form.source,
              phone: form.mobile,
              email: form.email,
              status: form.status,
              remarks: form.remarks,
              notes: form.remarks,
              ...(updatedData || {}),
            }
          : r
      ));
      setShowModal(false);
      setEditRow(null);
    } catch (error) {
      console.error("Error saving entry:", error);
    }
  };

  const isNewLead = (row) =>
  row.activity_type === "new_lead" ||
  (row.created_at?.startsWith(today) &&
    !isFollowUp(row) &&
    !isConverted(row));
  const isConverted = (row) =>
  (row.status === "Converted" ||
    row.status === "Client" ||
    row.status === "Closure" ||
    row.activity_type === "conversion") &&
  row.activity_date &&
  new Date(row.activity_date).toISOString().split("T")[0] === today;

  const isFollowUp = (row) =>
    row.status === "Pending" ||
    row.status === "Completed";

  const todayRows = rows.filter((row) =>
    (row.activity_date || row.created_at || "").startsWith(today)
  );

const filteredRows = activeTab === "new"
  ? todayRows.filter(isNewLead)
  : activeTab === "converted"
  ? todayRows.filter(isConverted)
  : activeTab === "followup"
  ? todayRows.filter(isFollowUp)
  : [...todayRows.filter(isNewLead), ...todayRows.filter(isFollowUp), ...todayRows.filter(isConverted)]
    .filter((row, idx, arr) => arr.findIndex(r => r.id === row.id) === idx);

  const stats = {
    total: todayRows.length,
    new: todayRows.filter(isNewLead).length,
    converted: todayRows.filter(isConverted).length,
    followup: todayRows.filter(isFollowUp).length,
  };

  return (
    <div style={{ padding: "28px 32px", background: "#ffffff", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: "#0f172a", fontSize: 24, fontWeight: 700, margin: 0 }}>Daily Tracker</h1>
        <p style={{ color: "#475569", margin: "4px 0 0", fontSize: 13 }}>
          Daily lead activity and conversions
          {user?.name && (
            <span style={{ marginLeft: 12, background: "#eff6ff", color: "#2563eb", borderRadius: 4, padding: "2px 10px", fontSize: 12, fontWeight: 600 }}>
              {user.name}
            </span>
          )}
        </p>
      </div>

      {/* Summary Cards */}
      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 16, marginBottom: 24 }}>
          {[
   { key: "all", label: "Total Activity Today", value: stats.total, color: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8" },
            { key: "new", label: "New Leads Today", value: stats.new, color: "#f0fdf4", border: "#bbf7d0", text: "#15803d" },
            { key: "followup", label: "Follow Up Today", value: stats.followup, color: "#fef9c3", border: "#fde047", text: "#854d0e" },
            { key: "converted", label: "Converted Today", value: stats.converted, color: "#fef3c7", border: "#fde68a", text: "#92400e" },
          ].map((card) => (
            <button
              key={card.key}
              onClick={() => setActiveTab(card.key)}
              style={{
                background: activeTab === card.key ? card.border : card.color,
                border: `1px solid ${card.border}`,
                borderRadius: 8,
                padding: "16px 20px",
                flex: 1,
                textAlign: "left",
                cursor: "pointer",
                minHeight: 100,
                boxShadow: activeTab === card.key ? "0 10px 25px rgba(37, 99, 235, 0.12)" : "none",
              }}
            >
             <div style={{ fontSize: 12, color: card.text, fontWeight: 600, marginBottom: 8 }}>{card.label}</div>
<div style={{ fontWeight: 700, fontSize: 28, color: card.text }}>{card.value}</div>
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <div style={{ background: "#f8fafc", borderRadius: 12, overflowX: "auto", border: "1px solid #e2e8f0" }}>
        <table style={{ width: "100%", minWidth: 1000, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f1f5f9" }}>
              {["Date", "Lead Name", "Company", "Source", "Mobile", "Email", "Status", "Remarks", "Action"].map((heading) => (
                <th key={heading} style={{ color: "#475569", padding: "12px 14px", textAlign: "left", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>Loading…</td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>No records found.</td>
              </tr>
            ) : filteredRows.map((row, idx) => (
              <tr key={row.id} style={{ borderTop: "1px solid #e2e8f0", background: idx % 2 === 0 ? "#fff" : "#f8fafc" }}>
                <td style={{ padding: "12px 14px", color: "#475569", fontSize: 13, whiteSpace: "nowrap" }}>
                  {row.activity_date ? new Date(row.activity_date).toLocaleDateString("en-IN") : "—"}
                </td>
                <td style={{ padding: "12px 14px", color: "#0f172a", fontSize: 13, fontWeight: 600 }}>
                  {row.lead_name || row.contact_person || "—"}
                </td>
                <td style={{ padding: "12px 14px", color: "#0f172a", fontSize: 13 }}>
                  {row.company_name || "—"}
                </td>
                <td style={{ padding: "12px 14px", color: "#475569", fontSize: 13 }}>
                  {row.source || "—"}
                </td>
                <td style={{ padding: "12px 14px", color: "#475569", fontSize: 13 }}>
                  {row.phone || "—"}
                </td>
                <td style={{ padding: "12px 14px", color: "#475569", fontSize: 13 }}>
                  {row.email || "—"}
                </td>
                <td style={{ padding: "12px 14px" }}>
                  <span style={{
                    background: row.status === "Converted" ? "#dcfce7" : row.status === "Pending" ? "#fef3c7" : "#f3f4f6",
                    color: row.status === "Converted" ? "#166534" : row.status === "Pending" ? "#b45309" : "#374151",
                    padding: "4px 10px",
                    borderRadius: 12,
                    fontSize: 12,
                    fontWeight: 600,
                  }}>
                    {row.status || "—"}
                  </span>
                </td>
                <td style={{ padding: "12px 14px", color: "#475569", fontSize: 13 }}>
                  {row.remarks || row.notes || "—"}
                </td>
                <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                  <button
                    onClick={() => handleEdit(row)}
                    style={{ marginRight: 8, background: "#e0e7ff", color: "#2563eb", border: "none", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(row)}
                    style={{ background: "#fee2e2", color: "#b91c1c", border: "none", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {showModal && (
        <div style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.35)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000
        }}>
          <div style={{
            background: "#fff", borderRadius: 14, padding: "32px 28px",
            width: "100%", maxWidth: 560,
            boxShadow: "0 8px 40px rgba(0,0,0,0.15)",
            maxHeight: "90vh", overflowY: "auto"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h2 style={{ color: "#0f172a", fontSize: 18, fontWeight: 700, margin: 0 }}>Edit Activity</h2>
              <button
                onClick={() => { setShowModal(false); setEditRow(null); }}
                style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#94a3b8", lineHeight: 1 }}
              >×</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 20px" }}>
              {[
                { key: "date", label: "Date", type: "date" },
                { key: "leadName", label: "Lead Name", type: "text" },
                { key: "company", label: "Company", type: "text" },
                { key: "source", label: "Source", type: "text" },
                { key: "mobile", label: "Mobile", type: "tel" },
                { key: "email", label: "Email", type: "email" },
                { key: "status", label: "Status", type: "select", options: ["Pending", "Converted", "Rejected"] },
                { key: "remarks", label: "Remarks", type: "text" },
              ].map(({ key, label, type, options }) => (
                <div key={key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ color: "#475569", fontSize: 12, fontWeight: 600 }}>{label}</label>
                  {type === "select" ? (
                    <select
                      value={form[key] || ""}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }}
                    >
                      <option value="">Select {label}</option>
                      {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  ) : (
                    <input
                      type={type}
                      value={form[key] || ""}
                      onChange={(e) =>
                        setForm({ ...form, [key]: key === "mobile" ? normalizePhone10(e.target.value) : e.target.value })
                      }
                      inputMode={key === "mobile" ? "numeric" : undefined}
                      maxLength={key === "mobile" ? 10 : undefined}
                      pattern={key === "mobile" ? "\\d{10}" : undefined}
                      style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }}
                    />
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 28, justifyContent: "flex-end" }}>
              <button
                onClick={() => { setShowModal(false); setEditRow(null); }}
                style={{ background: "#f1f5f9", color: "#475569", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer", fontSize: 13 }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
