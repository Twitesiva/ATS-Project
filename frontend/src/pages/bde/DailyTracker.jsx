import { useEffect, useState } from "react";
import { supabase } from "../../services/supabaseClient";

const initialForm = {
  sno: "",
  date: "",
  source: "",
  client: "",
  type: "",
  updates: "",
  status: "",
  statusFromTA: "",
  hireMode: "",
  spocName: "",
  mobile: "",
  mail: "",
  paymentTerms: "",
  companyName: "",
  remarks: "",
  domains: "",
  contactedThrough: "",
};

export default function DailyTracker() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editRow, setEditRow] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [showModal, setShowModal] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [companyFilter, setCompanyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [hireModeFilter, setHireModeFilter] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/bde/daily-tracker");
        const data = await response.json();
        if (Array.isArray(data)) {
          setRows(data || []);
          // Extract company names from the nested companies data
          const companyNames = [...new Set(
            (data || [])
              .map(r => r.companies?.company_name || r.companyName)
              .filter(Boolean)
          )];
          setCompanies(companyNames);
        }
      } catch (error) {
        console.error("Error fetching daily tracker data:", error);
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  const filteredRows = rows.filter(row =>
    (!companyFilter || row.companies?.company_name === companyFilter || row.companyName === companyFilter) &&
    (!statusFilter || row.status === statusFilter) &&
    (!hireModeFilter || row.hire_mode === hireModeFilter || row.hireMode === hireModeFilter)
  );

  const handleEdit = (row) => {
    setEditRow(row);
    setForm(row);
    setShowModal(true);
  };

  const handleDelete = async (row) => {
    if (!window.confirm("Delete this entry?")) return;
    try {
      await fetch(`/api/bde/activities/${row.id}`, { method: "DELETE" });
      setRows(rows.filter(r => r.id !== row.id));
    } catch (error) {
      console.error("Error deleting activity:", error);
    }
  };

  const handleSave = async () => {
    try {
      const response = await fetch(`/api/bde/activities/${editRow.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const updatedData = await response.json();
      setRows(rows.map(r => (r.id === editRow.id ? updatedData[0] || form : r)));
      setShowModal(false);
      setEditRow(null);
    } catch (error) {
      console.error("Error saving activity:", error);
    }
  };

  return (
    <div style={{ padding: "28px 32px", background: "#ffffff", minHeight: "100vh" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: "#0f172a", fontSize: 24, fontWeight: 700, margin: 0 }}>Daily Tracker</h1>
        <p style={{ color: "#475569", margin: "4px 0 0", fontSize: 13 }}>
          Track daily BDE activity and lead follow-ups.
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 16, marginBottom: 18 }}>
        <select value={companyFilter} onChange={e => setCompanyFilter(e.target.value)} style={{ padding: 8, borderRadius: 6, border: "1px solid #e2e8f0" }}>
          <option value="">All Companies</option>
          {companies.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: 8, borderRadius: 6, border: "1px solid #e2e8f0" }}>
          <option value="">All Status</option>
          <option value="Pending">Pending</option>
          <option value="Completed">Completed</option>
          <option value="In Progress">In Progress</option>
        </select>
        <select value={hireModeFilter} onChange={e => setHireModeFilter(e.target.value)} style={{ padding: 8, borderRadius: 6, border: "1px solid #e2e8f0" }}>
          <option value="">All Hire Modes</option>
          <option value="Contract">Contract</option>
          <option value="Permanent">Permanent</option>
        </select>
      </div>

      <div style={{ background: "#f8fafc", borderRadius: 12, overflowX: "auto", border: "1px solid #e2e8f0" }}>
        <table style={{ width: "100%", minWidth: 1200, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f1f5f9" }}>
              {["S.No", "Date", "Source", "Client", "Type", "Updates", "Status", "Status from TA", "Hire Mode", "SPOC Name", "Mobile", "Mail", "Payment Terms", "Company Name", "Remarks", "Domains", "Contacted Through"].map((heading) => (
                <th key={heading} style={{ color: "#475569", padding: "12px 14px", textAlign: "left", fontSize: 12, fontWeight: 600 }}>{heading}</th>
              ))}
              <th style={{ color: "#475569", padding: "12px 14px", textAlign: "left", fontSize: 12, fontWeight: 600 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={18} style={{ textAlign: "center", padding: 40 }}>Loading…</td></tr>
            ) : filteredRows.length === 0 ? (
              <tr><td colSpan={18} style={{ textAlign: "center", padding: 40 }}>No records found.</td></tr>
            ) : filteredRows.map((row) => (
              <tr key={row.id} style={{ borderTop: "1px solid #e2e8f0" }}>
                <td style={{ padding: "12px 14px", color: "#0f172a", fontSize: 13, fontWeight: 600 }}>{row.companies?.company_name || "N/A"}</td>
                <td style={{ padding: "12px 14px", color: "#475569", fontSize: 13 }}>{new Date(row.activity_datetime).toLocaleDateString()}</td>
                <td style={{ padding: "12px 14px", color: "#475569", fontSize: 13 }}>{new Date(row.activity_datetime).toLocaleTimeString()}</td>
                <td style={{ padding: "12px 14px", color: "#475569", fontSize: 13 }}>{row.type}</td>
                <td style={{ padding: "12px 14px", color: "#475569", fontSize: 13 }}>{row.subject}</td>
                <td style={{ padding: "12px 14px", color: "#475569", fontSize: 13 }}>{row.notes}</td>
                <td style={{ padding: "12px 14px", color: "#2563eb", fontSize: 13, fontWeight: 600 }}>{row.status}</td>
                <td style={{ padding: "12px 14px" }}>
                  <button onClick={() => handleEdit(row)} style={{ marginRight: 8, background: "#e0e7ff", color: "#2563eb", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>Edit</button>
                  <button onClick={() => handleDelete(row)} style={{ background: "#fee2e2", color: "#b91c1c", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 28, minWidth: 400, boxShadow: "0 8px 32px #e5eaf2" }}>
            <h2 style={{ color: "#0f172a", marginBottom: 18 }}>Edit Entry</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {Object.keys(initialForm).map((key) => (
                <div key={key} style={{ marginBottom: 10 }}>
                  <label style={{ color: "#475569", fontSize: 12, marginBottom: 2, display: "block" }}>{key}</label>
                  <input
                    style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #e2e8f0", marginBottom: 4 }}
                    value={form[key] ?? ""}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
              <button onClick={() => setShowModal(false)} style={{ background: "#e5eaf2", color: "#0f172a", border: "none", borderRadius: 8, padding: "8px 18px", cursor: "pointer" }}>Cancel</button>
              <button onClick={handleSave} style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", cursor: "pointer", fontWeight: 600 }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
