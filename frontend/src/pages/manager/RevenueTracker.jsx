import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { supabase } from "../../services/supabaseClient";
import { useAuth } from "../../context/AuthContext";
import Loader from "../../components/common/Loader";
import { formatDate } from "../../utils/dateFormat";

const columns = [
  { key: "s_no", label: "S.No", type: "number" },
  { key: "doj", label: "DOJ", type: "date" },
  { key: "recruiter_name", label: "Recruiter" },
  { key: "candidate_name", label: "Candidate Name" },
  { key: "client_name", label: "Client" },
  { key: "position", label: "Position" },
  { key: "location", label: "Location" },
  { key: "hire", label: "Hire" },
  { key: "ctc", label: "CTC" },
  { key: "offered_ctc", label: "Offered CTC" },
  { key: "billing_rate", label: "Billing Rate" },
  { key: "margin_value", label: "Margin Value" },
  { key: "margin_percent", label: "Margin %" },
];

const headerMap = {
  "s no": "s_no",
  "s.no": "s_no",
  "sl no": "s_no",
  "serial no": "s_no",
  doj: "doj",
  recruiter: "recruiter_name",
  "recruiter name": "recruiter_name",
  "candidate name": "candidate_name",
  candidate: "candidate_name",
  client: "client_name",
  Client: "client_name",
  "client name": "client_name",
  position: "position",
  location: "location",
  hire: "hire",
  ctc: "ctc",
  "offered ctc": "offered_ctc",
  "billing rate": "billing_rate",
  "margin value": "margin_value",
  "margin %": "margin_percent",
  "margin percent": "margin_percent",
};

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

const NUMERIC_FIELDS = new Set([
  "s_no",
  "ctc",
  "offered_ctc",
  "billing_rate",
  "margin_value",
  "margin_percent",
]);

const numeric = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const cleaned = String(v).replace(/[\u20B9, ]/g, "").replace(/LPA/gi, "");
  if (cleaned === "") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatCurrency = (v) => {
  if (v === null || v === undefined || v === "") return "-";
  const parsed = Number(v);
  if (!Number.isFinite(parsed)) return "-";
  return `\u20B9${parsed.toLocaleString("en-IN")}`;
};

const toPayload = (row, recruiterName) => {
  const payload = {
    recruiter_name: recruiterName,
  };

  columns.forEach((col) => {
    if (col.key === "recruiter_name") return;

    const value = row[col.key];
    if (col.type === "date") {
      payload[col.key] = value || null;
    } else if (NUMERIC_FIELDS.has(col.key)) {
      payload[col.key] = numeric(value);
    } else {
      payload[col.key] = value === "" ? null : value ?? null;
    }
  });

  return payload;
};

const validateNumericFields = (row) => {
  const invalid = [];

  ["ctc", "offered_ctc", "billing_rate", "margin_value", "margin_percent"].forEach((key) => {
    const value = row[key];
    if (value == null || value === "") return;
    if (numeric(value) == null) invalid.push(key);
  });

  return invalid;
};

const emptyForm = columns.reduce((acc, col) => {
  acc[col.key] = "";
  return acc;
}, {});

export default function MRevenueTracker() {
  const { user } = useAuth();

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [searchText, setSearchText] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const fetchRecords = async () => {
    if (!user?.name) return;

    setLoading(true);
    let query = supabase
      .from("revenue_tracker")
      .select("*")
      .eq("recruiter_name", user.name)
      .order("doj", { ascending: false });

    if (fromDate) query = query.gte("doj", fromDate);
    if (toDate) query = query.lte("doj", toDate);
    if (searchText.trim()) {
      const q = searchText.trim().replace(/,/g, "");
      query = query.or(`candidate_name.ilike.%${q}%,client_name.ilike.%${q}%`);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[revenue_tracker] fetch failed", error);
      setRecords([]);
    } else {
      setRecords(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (user?.name) fetchRecords();
  }, [user?.name]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const openAdd = () => {
    setEditRecord(null);
    setForm({
      ...emptyForm,
      recruiter_name: user?.name || "",
    });
    setShowModal(true);
  };

  const openEdit = (row) => {
    setEditRecord(row);
    const next = { ...emptyForm };
    columns.forEach((c) => {
      next[c.key] = row[c.key] ?? "";
    });
    setForm(next);
    setShowModal(true);
  };

  const closeModal = () => {
    if (saving) return;
    setShowModal(false);
    setEditRecord(null);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!user?.name) return;

    setSaving(true);

    const invalidFields = validateNumericFields(form);
    if (invalidFields.length) {
      alert(`Invalid numeric values in: ${invalidFields.join(", ")}`);
      setSaving(false);
      return;
    }

    const payload = toPayload(form, user.name);

    if (editRecord?.id) {
      const { error } = await supabase
        .from("revenue_tracker")
        .update(payload)
        .eq("id", editRecord.id)
        .eq("recruiter_name", user.name);

      if (error) {
        alert(error.message);
        console.error("[revenue_tracker] update failed", error);
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase.from("revenue_tracker").insert([payload]);
      if (error) {
        alert(error.message);
        console.error("[revenue_tracker] insert failed", error);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setShowModal(false);
    setEditRecord(null);
    fetchRecords();
  };

  const handleDelete = async (id) => {
    if (!id || deletingId) return;

    const target = records.find((r) => r.id === id);
    const ok = window.confirm(`Delete revenue record for "${target?.candidate_name || "-"}"?`);
    if (!ok) return;

    setDeletingId(id);
    const { error } = await supabase
      .from("revenue_tracker")
      .delete()
      .eq("id", id)
      .eq("recruiter_name", user.name);

    if (error) {
      alert(error.message);
      console.error("[revenue_tracker] delete failed", error);
      setDeletingId(null);
      return;
    }

    setRecords((prev) => prev.filter((r) => r.id !== id));
    setDeletingId(null);
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !user?.name) return;

    const fileName = file.name.toLowerCase();
    let parsedRows = [];

    try {
      if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        parsedRows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
      } else {
        const csvText = await file.text();
        const delimiter = detectDelimiter(csvText);
        parsedRows = await new Promise((resolve, reject) => {
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
            error: reject,
          });
        });
      }
    } catch (err) {
      console.error("[revenue_tracker] parse failed", err);
      alert("Unable to parse uploaded file");
      e.target.value = "";
      return;
    }

    const payloadRows = [];
    for (const row of parsedRows || []) {
      const normalizedRow = {};
      Object.entries(row || {}).forEach(([k, v]) => {
        const mappedKey = normalizedHeaderMap[normalize(k)] || normalize(k);
        normalizedRow[mappedKey] = typeof v === "string" ? v.trim() : v;
      });

      const invalidFields = validateNumericFields(normalizedRow);
      if (invalidFields.length) {
        alert(`Invalid numeric values in upload row for: ${invalidFields.join(", ")}`);
        e.target.value = "";
        return;
      }

      payloadRows.push(toPayload(normalizedRow, user.name));
    }

    const validRows = payloadRows.filter((row) =>
      Object.values(row).some((v) => v !== null && v !== "")
    );

    if (!validRows.length) {
      alert("No valid rows found in file.");
      e.target.value = "";
      return;
    }

    const { error } = await supabase.from("revenue_tracker").insert(validRows);
    if (error) {
      alert(error.message);
      console.error("[revenue_tracker] upload insert failed", error);
      e.target.value = "";
      return;
    }

    alert("Upload successful.");
    fetchRecords();
    e.target.value = "";
  };

  const orderedRows = useMemo(() => records, [records]);

  return (
    <div style={styles.page}>
      <h2 style={styles.title}>Revenue Tracker</h2>

      <div style={styles.actionBar}>
        <button onClick={openAdd} style={styles.primaryBtn}>
          + Add Revenue
        </button>

        <label style={styles.uploadBtn}>
          Upload CSV/XLSX
          <input type="file" accept=".csv,.xlsx,.xls" onChange={handleUpload} style={styles.hiddenInput} />
        </label>

        <input
          placeholder="Search Candidate / Client..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={styles.input}
        />

        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />

        <button onClick={fetchRecords} style={styles.primaryBtn}>
          Apply
        </button>
      </div>

      {loading ? (
        <div style={styles.loaderWrap}>
          <Loader text="Loading revenue records..." />
        </div>
      ) : (
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} style={styles.th}>
                    {c.label}
                  </th>
                ))}
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orderedRows.length === 0 ? (
                <tr>
                  <td style={styles.td} colSpan={columns.length + 1}>
                    No records found.
                  </td>
                </tr>
              ) : (
                orderedRows.map((row) => (
                  <tr key={row.id}>
                    {columns.map((c) => (
                      <td key={`${row.id}-${c.key}`} style={styles.td}>
                        {c.type === "date"
                          ? formatDate(row[c.key])
                          : c.key === "ctc" ||
                              c.key === "offered_ctc" ||
                              c.key === "billing_rate" ||
                              c.key === "margin_value"
                            ? formatCurrency(row[c.key])
                            : c.key === "margin_percent"
                              ? row[c.key] == null || row[c.key] === ""
                                ? "-"
                                : `${Number(row[c.key]).toFixed(2)}%`
                              : row[c.key] == null || row[c.key] === ""
                                ? "-"
                                : String(row[c.key])}
                      </td>
                    ))}
                    <td style={styles.td}>
                      <div style={styles.actionBtns}>
                        <button style={styles.editBtn} onClick={() => openEdit(row)}>
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
        <RevenueModal
          form={form}
          saving={saving}
          editing={Boolean(editRecord)}
          onChange={handleChange}
          onClose={closeModal}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function RevenueModal({ form, saving, editing, onChange, onClose, onSave }) {
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const formId = "revenue-form-manager";

  return (
    <div style={styles.overlay}>
      <div style={styles.modalShell}>
        <div style={styles.modalHeader}>
          <div style={styles.modalHeaderRow}>
            <h3 style={styles.modalTitle}>{editing ? "Edit Revenue" : "Add Revenue"}</h3>
            <button type="button" onClick={onClose} style={styles.closeBtn}>
              x
            </button>
          </div>
        </div>

        <div style={styles.modalBody}>
          <form id={formId} onSubmit={onSave} style={styles.form}>
            <div style={styles.sectionCard}>
              <div style={styles.sectionHead}>
                <h4 style={styles.sectionTitle}>Revenue Details</h4>
              </div>
              <div style={styles.sectionGrid}>
                {columns.map((col) => (
                  <label key={col.key} style={styles.fieldLabel}>
                    {col.label}
                    <input
                      style={styles.modalInput}
                      type={col.type === "date" ? "date" : "text"}
                      name={col.key}
                      value={form[col.key] ?? ""}
                      onChange={onChange}
                      readOnly={col.key === "recruiter_name"}
                    />
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
              {saving ? "Saving..." : editing ? "Update" : "Save"}
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
};

















