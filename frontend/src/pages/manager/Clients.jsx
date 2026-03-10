import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { supabase } from "../../services/supabaseClient";
import Loader from "../../components/common/Loader";
import { formatDate } from "../../utils/dateFormat";

const columnConfig = [
  { key: "s_no", label: "S.No", type: "number" },
  { key: "source", label: "Source" },
  { key: "client_name", label: "Client Name" },
  { key: "number_of_openings", label: "Number of Openings", type: "number" },
  { key: "req_name", label: "Req Name" },
  { key: "hire_mode", label: "Hire Mode" },
  { key: "req_shared_date", label: "Req Shared Date", type: "date" },
  { key: "profile_submitted_date", label: "Profile Submitted Date", type: "date" },
  { key: "profile_submissions", label: "Profile Submissions", type: "number" },
  { key: "feedback_pending", label: "Feedback Pending", type: "number" },
  { key: "interview_scheduled", label: "Interview Scheduled", type: "number" },
  { key: "l1_rejected", label: "L1 Rejected", type: "number" },
  { key: "l2_rejected", label: "L2 Rejected", type: "number" },
  { key: "dropped_out_by_client", label: "Dropped Out By Client", type: "number" },
  { key: "screen_rejected", label: "Screen Rejected", type: "number" },
  { key: "backout", label: "Backout", type: "number" },
  { key: "shortlisted", label: "Shortlisted", type: "number" },
  { key: "interview_fb_hold", label: "Interview FB Hold", type: "number" },
  { key: "duplicate", label: "Duplicate", type: "number" },
  { key: "closure", label: "Closure", type: "number" },
  { key: "position_got_closed", label: "Position Got Closed", type: "number" },
  { key: "position_got_hold", label: "Position Got Hold", type: "number" },
  { key: "remarks", label: "Remarks", type: "textarea" },
];

const headerMap = {
  "s no": "s_no",
  "s.no": "s_no",
  "S.No":"s_no",
  "serial no": "s_no",
  "sl no": "s_no",
  "source": "source",
  "client name": "client_name",
  "number of openings": "number_of_openings",
  "req name": "req_name",
  "requirement name": "req_name",
  "hire mode": "hire_mode",
  "req shared date": "req_shared_date",
  "profile submitted date": "profile_submitted_date",
  "profile submissions": "profile_submissions",
  "feedback pending": "feedback_pending",
  "interview scheduled": "interview_scheduled",
  "l1 rejected": "l1_rejected",
  "l2 rejected": "l2_rejected",
  "dropped out by client": "dropped_out_by_client",
  "screen rejected": "screen_rejected",
  "backout": "backout",
  "shortlisted": "shortlisted",
  "interview fb hold": "interview_fb_hold",
  "duplicate": "duplicate",
  "closure": "closure",
  "position got closed": "position_got_closed",
  "position got hold": "position_got_hold",
  "remarks": "remarks",
};

const numberFields = new Set(
  columnConfig.filter((c) => c.type === "number").map((c) => c.key)
);

const normalize = (value) =>
  String(value ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/[\u200B-\u200D]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/[._-]+/g, " ")
    .replace(/[\t\r\n]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

const normalizedHeaderMap = Object.entries(headerMap).reduce((acc, [k, v]) => {
  acc[normalize(k)] = v;
  return acc;
}, {});

const toNullableNumber = (value) => {
  if (value === "" || value == null) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const toPayload = (row) => {
  const payload = {};

  columnConfig.forEach((col) => {
    const value = row[col.key];
    if (numberFields.has(col.key)) {
      payload[col.key] = toNullableNumber(value);
    } else if (col.type === "date") {
      payload[col.key] = value || null;
    } else {
      payload[col.key] = value === "" ? null : value ?? null;
    }
  });

  return payload;
};

const emptyForm = columnConfig.reduce((acc, col) => {
  acc[col.key] = "";
  return acc;
}, {});

const detectDelimiter = (csvText) => {
  const firstLine = String(csvText || "").split(/\r\n|\n|\r/, 1)[0] || "";
  const counts = {
    "\t": (firstLine.match(/\t/g) || []).length,
    ",": (firstLine.match(/,/g) || []).length,
    ";": (firstLine.match(/;/g) || []).length,
    "|": (firstLine.match(/\|/g) || []).length,
  };

  let best = ",";
  let bestCount = -1;
  for (const [delimiter, count] of Object.entries(counts)) {
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return bestCount > 0 ? best : ",";
};

export default function Clients() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [clientSearch, setClientSearch] = useState("");

  const fetchRows = async () => {
    setLoading(true);

    let query = supabase.from("client_records").select("*").order("id", { ascending: false });

    if (clientSearch.trim()) {
      query = query.ilike("client_name", `%${clientSearch.trim()}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[client_records] fetch failed", error);
      setRows([]);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRows();
  }, [clientSearch]);

  const orderedRows = useMemo(() => rows, [rows]);

  const handleOpenAdd = () => {
    setEditingRow(null);
    setForm({ ...emptyForm });
    setShowModal(true);
  };

  const handleOpenEdit = (row) => {
    setEditingRow(row);
    const next = { ...emptyForm };
    columnConfig.forEach((col) => {
      next[col.key] = row[col.key] ?? "";
    });
    setForm(next);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    if (saving) return;
    setShowModal(false);
    setEditingRow(null);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);

    const payload = toPayload(form);

    if (editingRow?.id) {
      const { error } = await supabase
        .from("client_records")
        .update(payload)
        .eq("id", editingRow.id);

      if (error) {
        alert(error.message);
        console.error("[client_records] update failed", error);
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase.from("client_records").insert([payload]);
      if (error) {
        alert(error.message);
        console.error("[client_records] insert failed", error);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setShowModal(false);
    setEditingRow(null);
    fetchRows();
  };

  const handleDelete = async (id) => {
    if (!id || deletingId) return;

    const target = rows.find((r) => r.id === id);
    const ok = window.confirm(`Delete client record for "${target?.client_name || "-"}"?`);
    if (!ok) return;

    setDeletingId(id);
    const { error } = await supabase.from("client_records").delete().eq("id", id);

    if (error) {
      alert(error.message);
      console.error("[client_records] delete failed", error);
      setDeletingId(null);
      return;
    }

    setRows((prev) => prev.filter((r) => r.id !== id));
    setDeletingId(null);
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    let parsedRows = [];

    try {
      if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const firstSheet = workbook.Sheets[firstSheetName];
        parsedRows = XLSX.utils.sheet_to_json(firstSheet, { defval: "", raw: false });
      } else {
        const csvText = await file.text();
        const delimiter = detectDelimiter(csvText);
        const parsed = await new Promise((resolve, reject) => {
          Papa.parse(csvText, {
            header: true,
            skipEmptyLines: "greedy",
            delimiter,
            transformHeader: (header) => {
              const key = normalize(header);
              return normalizedHeaderMap[key] || key;
            },
            transform: (value) =>
              typeof value === "string"
                ? value.replace(/^\uFEFF/, "").replace(/\u00A0/g, " ").trim()
                : value,
            complete: (results) => resolve(results.data || []),
            error: (error) => reject(error),
          });
        });
        parsedRows = parsed;
      }
    } catch (err) {
      alert("Unable to parse uploaded file");
      console.error(err);
      e.target.value = "";
      return;
    }

    const mappedRows = (parsedRows || []).map((row) => {
      const normalizedRow = {};
      Object.entries(row || {}).forEach(([k, v]) => {
        const key = normalizedHeaderMap[normalize(k)] || normalize(k);
        normalizedRow[key] = typeof v === "string" ? v.trim() : v;
      });
      return toPayload(normalizedRow);
    });

    const validRows = mappedRows.filter((row) =>
      Object.values(row).some((value) => value !== null && value !== "")
    );

    if (!validRows.length) {
      alert("No valid rows found in file.");
      e.target.value = "";
      return;
    }

    const { error } = await supabase.from("client_records").insert(validRows);
    if (error) {
      alert(error.message);
      console.error("[client_records] upload insert failed", error);
      e.target.value = "";
      return;
    }

    alert("Upload successful.");
    fetchRows();
    e.target.value = "";
  };

  return (
    <div style={styles.page}>
      <h2 style={styles.title}>Client Records</h2>

      <div style={styles.actionBar}>
        <button onClick={handleOpenAdd} style={styles.primaryBtn}>
          + Add Client Record
        </button>

        <label style={styles.uploadBtn}>
          Upload CSV/XLSX
          <input type="file" accept=".csv,.xlsx,.xls" onChange={handleUpload} style={styles.hiddenInput} />
        </label>

        <input
          placeholder="Search by Client Name..."
          value={clientSearch}
          onChange={(e) => setClientSearch(e.target.value)}
          style={styles.input}
        />
      </div>

      {loading ? (
        <div style={styles.loaderWrap}>
          <Loader text="Loading client records..." />
        </div>
      ) : (
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr>
                {columnConfig.map((col) => (
                  <th key={col.key} style={styles.th}>
                    {col.label}
                  </th>
                ))}
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orderedRows.length === 0 ? (
                <tr>
                  <td style={styles.td} colSpan={columnConfig.length + 1}>
                    No records found.
                  </td>
                </tr>
              ) : (
                orderedRows.map((row) => (
                  <tr key={row.id}>
                    {columnConfig.map((col) => (
                      <td
                        key={`${row.id}-${col.key}`}
                        style={styles.td}
                        title={row[col.key] == null || row[col.key] === "" ? "-" : String(row[col.key])}
                      >
                        {col.type === "date"
                          ? formatDate(row[col.key])
                          : row[col.key] == null || row[col.key] === ""
                            ? "-"
                            : String(row[col.key])}
                      </td>
                    ))}
                    <td style={styles.td}>
                      <div style={styles.actionBtns}>
                        <button style={styles.editBtn} onClick={() => handleOpenEdit(row)}>
                          Edit
                        </button>
                        <button
                          style={styles.deleteBtn}
                          onClick={() => handleDelete(row.id)}
                          disabled={deletingId === row.id}
                        >
                          {deletingId === row.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <ClientRecordModal
          form={form}
          editingRow={editingRow}
          saving={saving}
          onChange={handleChange}
          onClose={handleCloseModal}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function ClientRecordModal({ form, editingRow, saving, onChange, onClose, onSave }) {
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const formId = "client-record-form";

  return (
    <div style={styles.overlay}>
      <div style={styles.modalShell}>
        <div style={styles.modalHeader}>
          <div style={styles.modalHeaderRow}>
            <h3 style={styles.modalTitle}>
              {editingRow ? "Edit Client Record" : "Add Client Record"}
            </h3>
            <button type="button" onClick={onClose} style={styles.closeBtn}>
              x
            </button>
          </div>
        </div>

        <div style={styles.modalBody}>
          <form id={formId} onSubmit={onSave} style={styles.form}>
            <div style={styles.sectionCard}>
              <div style={styles.sectionHead}>
                <h4 style={styles.sectionTitle}>Client Information</h4>
              </div>
              <div style={styles.sectionGrid}>
                {columnConfig.map((col) => (
                  <label key={col.key} style={styles.fieldLabel}>
                    {col.label}
                    {col.type === "textarea" ? (
                      <textarea
                        style={styles.modalTextarea}
                        name={col.key}
                        value={form[col.key]}
                        onChange={onChange}
                      />
                    ) : (
                      <input
                        style={styles.modalInput}
                        type={col.type === "date" ? "date" : "text"}
                        name={col.key}
                        value={form[col.key]}
                        onChange={onChange}
                      />
                    )}
                  </label>
                ))}
              </div>
            </div>
          </form>
        </div>

        <div style={styles.modalFooter}>
          <div style={styles.footerActions}>
            <button type="button" onClick={onClose} style={styles.secondaryBtn} disabled={saving}>
              Cancel
            </button>
            <button type="submit" form={formId} style={styles.primaryBtn} disabled={saving}>
              {saving ? "Saving..." : editingRow ? "Update" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    width: "100%",
    minWidth: 0,
    overflowX: "hidden",
  },
  title: {
    margin: "0 0 12px 0",
    fontSize: "32px",
    fontWeight: 700,
    color: "#0f172a",
  },
  actionBar: {
    display: "flex",
    gap: "10px",
    marginBottom: "14px",
    flexWrap: "wrap",
  },
  primaryBtn: {
    padding: "10px 18px",
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: "10px",
    cursor: "pointer",
    fontWeight: 600,
  },
  uploadBtn: {
    padding: "10px 18px",
    background: "#0f172a",
    color: "#fff",
    border: "none",
    borderRadius: "10px",
    cursor: "pointer",
    fontWeight: 600,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  hiddenInput: {
    display: "none",
  },
  editBtn: {
    padding: "6px 10px",
    border: "1px solid #cbd5e1",
    borderRadius: "8px",
    background: "#fff",
    color: "#0f172a",
    cursor: "pointer",
  },
  deleteBtn: {
    padding: "6px 10px",
    border: "1px solid #fecaca",
    borderRadius: "8px",
    background: "#fff1f2",
    color: "#b91c1c",
    cursor: "pointer",
  },
  actionBtns: {
    display: "flex",
    gap: "8px",
  },
  input: {
    padding: "6px",
    width: "220px",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    fontSize: "14px",
  },
  loaderWrap: {
    width: "100%",
    minHeight: "280px",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    background: "#fff",
  },
  tableContainer: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    overflowX: "auto",
    overflowY: "auto",
    maxHeight: "70vh",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    background: "#fff",
  },
  table: {
    width: "max-content",
    minWidth: "100%",
    borderCollapse: "collapse",
    tableLayout: "auto",
  },
  th: {
    border: "1px solid #cbd5e1",
    padding: "8px 10px",
    whiteSpace: "nowrap",
    background: "#f8fafc",
    position: "sticky",
    top: 0,
    zIndex: 2,
    fontWeight: 600,
    textAlign: "left",
  },
  td: {
    border: "1px solid #cbd5e1",
    padding: "8px 10px",
    whiteSpace: "nowrap",
    background: "#fff",
    maxWidth: "240px",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    zIndex: 1000,
  },
  modalShell: {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    background: "#fff",
    width: "78vw",
    maxWidth: "1100px",
    minWidth: "320px",
    maxHeight: "88vh",
    borderRadius: "14px",
    boxShadow: "0 20px 50px rgba(2, 6, 23, 0.25)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  modalHeader: {
    padding: "16px 20px",
    borderBottom: "1px solid #e2e8f0",
    background: "#fff",
    flexShrink: 0,
  },
  modalHeaderRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
  },
  modalTitle: {
    margin: 0,
    fontSize: "30px",
    fontWeight: 800,
    color: "#0f172a",
  },
  closeBtn: {
    width: "38px",
    height: "38px",
    borderRadius: "10px",
    border: "1px solid #d1d5db",
    background: "#fff",
    color: "#111827",
    cursor: "pointer",
    fontSize: "22px",
    lineHeight: 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  modalBody: {
    padding: "18px 20px",
    overflowY: "auto",
    overflowX: "hidden",
    flex: 1,
    background: "#f8fafc",
  },
  modalFooter: {
    padding: "14px 20px",
    borderTop: "1px solid #e2e8f0",
    background: "#fff",
    flexShrink: 0,
  },
  footerActions: {
    display: "flex",
    justifyContent: "space-between",
    width: "100%",
    alignItems: "center",
    gap: "10px",
  },
  secondaryBtn: {
    padding: "10px 18px",
    borderRadius: "10px",
    border: "1px solid #d1d5db",
    background: "#fff",
    color: "#111827",
    cursor: "pointer",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  sectionCard: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "14px",
    padding: "14px",
  },
  sectionHead: {
    marginBottom: "10px",
    paddingBottom: "8px",
    borderBottom: "1px solid #e5e7eb",
  },
  sectionTitle: {
    margin: 0,
    fontSize: "18px",
    fontWeight: 700,
    color: "#0f172a",
  },
  sectionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: "12px 16px",
  },
  fieldLabel: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    fontSize: "12px",
    fontWeight: 600,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: "0.02em",
  },
  modalInput: {
    height: "44px",
    borderRadius: "12px",
    border: "1px solid #cbd5e1",
    background: "#fff",
    padding: "0 12px",
    fontSize: "15px",
    color: "#0f172a",
    outline: "none",
  },
  modalTextarea: {
    minHeight: "88px",
    borderRadius: "12px",
    border: "1px solid #cbd5e1",
    background: "#fff",
    padding: "10px 12px",
    fontSize: "15px",
    color: "#0f172a",
    outline: "none",
    resize: "vertical",
    fontFamily: "inherit",
  },
};

















