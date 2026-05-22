import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../services/supabaseClient";
import Loader from "../../components/common/Loader";
import { formatDate } from "../../utils/dateFormat";
import * as XLSX from "xlsx";
import { useAuth } from "../../context/AuthContext";
import { getAssignedRecruitersForTL } from "../../services/tlAssignmentsService";

const columns = [
  { key: "doj", label: "DOJ", type: "date" },
  { key: "recruiter_name", label: "Recruiter" },
  { key: "candidate_name", label: "Candidate Name" },
  { key: "client_name", label: "Client" },
  { key: "position", label: "Position" },
  { key: "location", label: "Location" },
];

// ✅ offered_ctc removed from table
const tableColumns = [
  ...columns,
  { key: "bd_name", label: "BD Name" },
  { key: "billing_rate", label: "Billing Rate" },
  { key: "margin_value", label: "Margin" },
  { key: "margin_percent", label: "Margin %" },
];

const headerMap = {
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
  "billing rate": "billing_rate",
  "margin value": "margin_value",
  "margin %": "margin_percent",
  "margin percent": "margin_percent",
  offer_status: "offer_status",
  status: "status",
};

const NUMERIC_FIELDS = new Set([
  "ctc",
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

// ✅ offered_ctc removed from emptyForm
const emptyForm = {
  ...tableColumns.reduce((acc, col) => {
    acc[col.key] = "";
    return acc;
  }, {}),
  hire: "",
  ctc: "",
  bd_name: "",
};

export default function TeamTracker() {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedRecruiter, setSelectedRecruiter] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [locationSearch, setLocationSearch] = useState("");
  const [recruiterOptions, setRecruiterOptions] = useState([]);
  const [bdeOptions, setBdeOptions] = useState([]);
  const [selectedBde, setSelectedBde] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [file, setFile] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [assignedRecruiters, setAssignedRecruiters] = useState([]);
  const [assignmentsLoaded, setAssignmentsLoaded] = useState(false);

  const allowedRecruiterNames = useMemo(() => {
    const tlName = String(user?.name || "").trim();
    const assigned = (assignedRecruiters || [])
      .map((r) => String(r?.name || "").trim())
      .filter(Boolean);
    const merged = [tlName, ...assigned].filter(Boolean);
    return Array.from(new Set(merged));
  }, [assignedRecruiters, user?.name]);

  const allowedRecruiterLowerSet = useMemo(() => {
    return new Set(
      allowedRecruiterNames.map((name) => String(name || "").trim().toLowerCase()).filter(Boolean)
    );
  }, [allowedRecruiterNames]);

  const recruiterOrFilter = useMemo(() => {
    const parts = (allowedRecruiterNames || [])
      .map((name) => String(name || "").trim())
      .filter(Boolean)
      .map((name) => `recruiter_name.ilike.${name.replaceAll(",", "\\,")}`);
    return parts.join(",");
  }, [allowedRecruiterNames]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!user?.id) return;
      setAssignmentsLoaded(false);
      const rows = await getAssignedRecruitersForTL(user.id);
      if (cancelled) return;
      setAssignedRecruiters(rows || []);
      setAssignmentsLoaded(true);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleFileUpload = async () => {
    if (!file) return;

    const reader = new FileReader();

    reader.onload = async (e) => {
      if (!assignmentsLoaded) return;
      if (!allowedRecruiterNames.length) {
        alert("No recruiters assigned to you.");
        return;
      }

      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: "array" });

      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      const formatted = jsonData.map((row) => ({
        doj: row.doj || null,
        recruiter_name: (row.recruiter_name || user?.name || null),
        candidate_name: row.candidate_name || null,
        client_name: row.client_name || null,
        position: row.position || null,
        location: row.location || null,
        hire: row.hire || null,
        ctc: numeric(row.ctc),
        billing_rate: numeric(row.billing_rate),
        margin_value: numeric(row.margin_value),
        margin_percent: numeric(row.margin_percent),
      }));

      const invalidRecruiters = Array.from(
        new Set(
          formatted
            .map((r) => String(r.recruiter_name || "").trim())
            .filter((name) => name && !allowedRecruiterLowerSet.has(name.toLowerCase()))
        )
      );
      if (invalidRecruiters.length) {
        alert(`Upload blocked. These recruiters are not assigned to you: ${invalidRecruiters.join(", ")}`);
        return;
      }

      const { error } = await supabase.from("revenue_tracker").insert(formatted);

      if (error) {
        console.error(error);
        alert("Upload failed");
      } else {
        alert("Upload successful");
        setShowUpload(false);
        setFile(null);
        fetchRecords();
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const fetchRecords = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from("revenue_tracker")
      .select("*")
      .order("doj", { ascending: false });

    if (!assignmentsLoaded) {
      setLoading(false);
      return;
    }

    if (!allowedRecruiterNames.length) {
      setRecords([]);
      setLoading(false);
      return;
    }

    // TL view = closures from TL + assigned recruiters only; exclude backouts
    query = query
      .or(recruiterOrFilter)
      .or("offer_status.is.null,offer_status.neq.Backout");

    if (fromDate) query = query.gte("doj", fromDate);
    if (toDate) query = query.lte("doj", toDate);
    if (selectedRecruiter) query = query.eq("recruiter_name", selectedRecruiter);
    if (selectedBde) query = query.eq("bd_name", selectedBde);
    if (clientSearch.trim()) query = query.ilike("client_name", `%${clientSearch.trim()}%`);
    if (locationSearch.trim()) query = query.ilike("location", `%${locationSearch.trim()}%`);

    const { data, error } = await query;
    if (error) {
      console.error("[team-tracker] fetch failed", error);
      setRecords([]);
      setLoading(false);
      return;
    }

    setRecords(data || []);
    setLoading(false);
  }, [fromDate, toDate, selectedRecruiter, selectedBde, clientSearch, locationSearch, assignmentsLoaded, allowedRecruiterNames, recruiterOrFilter]);

  const fetchRecruiterOptions = useCallback(async () => {
    if (!assignmentsLoaded) return;
    if (!allowedRecruiterNames.length) {
      setRecruiterOptions([]);
      return;
    }

    const { data, error } = await supabase
      .from("revenue_tracker")
      .select("recruiter_name")
      .or(recruiterOrFilter)
      .or("offer_status.is.null,offer_status.neq.Backout")
      .order("recruiter_name", { ascending: true });

    if (error) {
      console.error("[team-tracker] recruiter options fetch failed", error);
      setRecruiterOptions([]);
      return;
    }

    const unique = [...new Set((data || []).map((r) => r.recruiter_name).filter(Boolean))];
    setRecruiterOptions(unique);
  }, [allowedRecruiterNames, assignmentsLoaded, recruiterOrFilter]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  useEffect(() => {
    fetchRecruiterOptions();
  }, [fetchRecruiterOptions]);

  useEffect(() => {
    const fetchBdeOptions = async () => {
      const { data, error } = await supabase
        .from("users")
        .select("name")
        .eq("role", "bde")
        .order("name", { ascending: true });

      if (error) {
        console.error("[team-tracker] bde fetch failed", error);
        return;
      }
      setBdeOptions((data || []).map((u) => u.name).filter(Boolean));
    };
    fetchBdeOptions();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("team-tracker-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "revenue_tracker" },
        () => {
          fetchRecords();
          fetchRecruiterOptions();
        }
      )
      .subscribe((status) => {
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchRecords, fetchRecruiterOptions]);

  const orderedRows = useMemo(() => records, [records]);

  const openAdd = () => {
    setEditRecord(null);
    setForm({ ...emptyForm, hire: "Permanent" });
    setShowModal(true);
  };

  const openEdit = (row) => {
    setEditRecord(row);
    const next = { ...emptyForm };
    tableColumns.forEach((c) => {
      next[c.key] = row[c.key] ?? "";
    });
    next.hire = row.hire ?? "";
    next.ctc = row.ctc ?? "";
    next.bd_name = row.bd_name ?? "";
    setForm(next);
    setShowModal(true);
  };

  const closeModal = () => {
    if (saving) return;
    setShowModal(false);
    setEditRecord(null);
  };

  // ✅ Option A: both Permanent and Temporary use Margin = Billing Rate - CTC
  // Auto-calc but margin_value stays editable if user wants to override
  const calculateMargins = (row) => {
    const billingRate = numeric(row.billing_rate);
    const ctc = numeric(row.ctc);

    if (billingRate === null || ctc === null) {
      // If margin_value was manually typed, keep margin_percent in sync
      const marginValue = numeric(row.margin_value);
      const margin_percent =
        billingRate !== null && billingRate !== 0 && marginValue !== null
          ? parseFloat(((marginValue / billingRate) * 100).toFixed(2))
          : null;
      return { margin_value: null, margin_percent };
    }

    const margin_value = billingRate - ctc;
    const margin_percent =
      ctc !== 0 ? parseFloat(((margin_value / ctc) * 100).toFixed(2)) : null;

    return {
      margin_value: Number.isFinite(margin_value) ? margin_value : null,
      margin_percent: Number.isFinite(margin_percent) ? margin_percent : null,
    };
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => {
      // Enforce numbers-only for CTC/ECTC/Billing fields.
      if (name === "ctc" || name === "offered_ctc" || name === "billing_rate") {
        const isNumericOnly = /^\d*$/.test(String(value));
        if (!isNumericOnly) return prev;
      }

      const next = { ...prev, [name]: value };

      // ✅ If user manually edits margin_value, only recalc margin_percent
      if (name === "margin_value") {
        const billingRate = numeric(next.billing_rate);
        const marginValue = numeric(value);
        const margin_percent =
          billingRate !== null && billingRate !== 0 && marginValue !== null
            ? parseFloat(((marginValue / billingRate) * 100).toFixed(2))
            : null;
        return { ...next, margin_percent: margin_percent ?? "" };
      }

      // ✅ For billing_rate or ctc changes — auto-calc margin_value and margin_percent
      if (name === "billing_rate" || name === "ctc") {
        const margins = calculateMargins(next);
        return {
          ...next,
          margin_value: margins.margin_value ?? "",
          margin_percent: margins.margin_percent ?? "",
        };
      }

      return next;
    });
  };

  const toPayload = (row) => {
    const payload = {
      recruiter_name: row.recruiter_name || null,
      hire: row.hire === "" ? null : row.hire ?? null,
      ctc: numeric(row.ctc),
      bd_name: row.bd_name === "" ? null : row.bd_name ?? null,
    };

    tableColumns.forEach((col) => {
      if (col.key === "recruiter_name" || col.readOnly) return;
      const value = row[col.key];
      if (col.type === "date") {
        payload[col.key] = value || null;
      } else if (NUMERIC_FIELDS.has(col.key)) {
        payload[col.key] = numeric(value);
      } else {
        payload[col.key] = value === "" ? null : value ?? null;
      }
    });

    // ✅ Both Permanent and Temporary: use whatever margin_value user has (auto or manual)
    // margin_percent is always auto from margin_value / billing_rate
    const billingRate = numeric(row.billing_rate);
    const marginValue = numeric(row.margin_value);
    payload.margin_value = marginValue;
    payload.margin_percent =
      billingRate !== null && billingRate !== 0 && marginValue !== null
        ? parseFloat(((marginValue / billingRate) * 100).toFixed(2))
        : null;

    return payload;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (saving) return;

    setSaving(true);
    const payload = toPayload(form);

    const recruiterName = String(payload.recruiter_name || "").trim() || String(user?.name || "").trim();
    payload.recruiter_name = recruiterName || null;

    if (!payload.recruiter_name) {
      alert("Recruiter is required.");
      setSaving(false);
      return;
    }

    if (!allowedRecruiterLowerSet.has(String(payload.recruiter_name).toLowerCase())) {
      alert("You can only add revenue for your assigned recruiters (or yourself).");
      setSaving(false);
      return;
    }

    if (editRecord?.id) {
      const { error } = await supabase
        .from("revenue_tracker")
        .update(payload)
        .eq("id", editRecord.id);
      if (error) {
        alert(error.message);
        console.error("[team-tracker] update failed", error);
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase.from("revenue_tracker").insert([payload]);
      if (error) {
        alert(error.message);
        console.error("[team-tracker] insert failed", error);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setShowModal(false);
    setEditRecord(null);
    fetchRecords();
    fetchRecruiterOptions();
  };

  const handleDelete = async (id) => {
    if (!id || deletingId) return;

    const target = records.find((r) => r.id === id);
    const ok = window.confirm(
      `Delete revenue record for "${target?.candidate_name || "-"}"?`
    );
    if (!ok) return;

    setDeletingId(id);
    const { error } = await supabase.from("revenue_tracker").delete().eq("id", id);

    if (error) {
      alert(error.message);
      console.error("[team-tracker] delete failed", error);
      setDeletingId(null);
      return;
    }

    setRecords((prev) => prev.filter((r) => r.id !== id));
    setDeletingId(null);
  };

  return (
    <div style={styles.page}>
      <h2 style={styles.title}>Team Tracker</h2>

      <div style={styles.actionBar}>
        <button style={styles.button} onClick={() => setShowUpload(true)}>
          + Upload CSV/XLSX
        </button>

        <button style={styles.button} onClick={openAdd}>
          + Add Revenue
        </button>

        <select
          value={selectedRecruiter}
          onChange={(e) => setSelectedRecruiter(e.target.value)}
          style={styles.select}
        >
          <option value="">All Recruiters</option>
          {recruiterOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        <select
          value={selectedBde}
          onChange={(e) => setSelectedBde(e.target.value)}
          style={styles.select}
        >
          <option value="">All BDs</option>
          {bdeOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
        />
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
        />

        <input
          placeholder="Search Client..."
          value={clientSearch}
          onChange={(e) => setClientSearch(e.target.value)}
          style={styles.input}
        />
        <input
          placeholder="Search Location..."
          value={locationSearch}
          onChange={(e) => setLocationSearch(e.target.value)}
          style={styles.input}
        />
      </div>

      {showUpload && (
        <div style={styles.modal}>
          <div style={styles.modalBox}>
            <h3>Upload CSV / XLSX</h3>
            <input
              type="file"
              accept=".csv,.xlsx"
              onChange={(e) => setFile(e.target.files[0])}
            />
            <div style={{ marginTop: "10px", display: "flex", gap: "10px" }}>
              <button style={styles.button} onClick={handleFileUpload}>
                Upload
              </button>
              <button style={styles.button} onClick={() => setShowUpload(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={styles.loaderWrap}>
          <Loader text="Loading team revenue..." />
        </div>
      ) : (
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr>
                {tableColumns.map((c) => (
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
                  <td style={styles.td} colSpan={tableColumns.length + 1}>
                    No records found.
                  </td>
                </tr>
              ) : (
                orderedRows.map((row) => (
                  <tr key={row.id}>
                    {tableColumns.map((c) => (
                      <td key={`${row.id}-${c.key}`} style={styles.td}>
                        {c.type === "date"
                          ? formatDate(row[c.key])
                          : c.key === "billing_rate" || c.key === "margin_value"
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
        <TeamRevenueModal
          form={form}
          saving={saving}
          bdeOptions={bdeOptions}
          editing={Boolean(editRecord)}
          onChange={handleChange}
          onClose={closeModal}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function TeamRevenueModal({ form, saving, editing, bdeOptions, onChange, onClose, onSave }) {
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const formId = "team-revenue-form-tl";
  const hireType = String(form.hire || "").toLowerCase();
  const isPermanent = hireType === "permanent";
  const isTemporary = hireType === "temporary";

  const baseFields = [
    { key: "doj", label: "DOJ", type: "date" },
    { key: "recruiter_name", label: "Recruiter" },
    { key: "candidate_name", label: "Candidate Name" },
    { key: "client_name", label: "Client" },
    { key: "position", label: "Position" },
    { key: "location", label: "Location" },
  ];

  return (
    <div style={styles.overlay}>
      <div style={styles.modalShell}>
        <div style={styles.modalHeader}>
          <div style={styles.modalHeaderRow}>
            <h3 style={styles.modalTitle}>{editing ? "Edit Revenue" : "Add Revenue"}</h3>
            <button
              type="button"
              onClick={onClose}
              style={styles.closeBtn}
              disabled={saving}
            >
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
                {/* Base fields */}
                {baseFields.map((col) => (
                  <label key={col.key} style={styles.fieldLabel}>
                    {col.label}
                    <input
                      style={styles.modalInput}
                      type={col.type === "date" ? "date" : "text"}
                      name={col.key}
                      value={form[col.key] ?? ""}
                      onChange={onChange}
                    />
                  </label>
                ))}

                {/* BD Name */}
                <label style={styles.fieldLabel}>
                  BD Name
                  <select
                    name="bd_name"
                    value={form.bd_name ?? ""}
                    onChange={onChange}
                    style={styles.modalInput}
                  >
                    <option value="">Select BD</option>
                    {(bdeOptions || []).map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>

                {/* Hire Type */}
                <label style={styles.fieldLabel}>
                  Hire
                  <select
                    name="hire"
                    value={form.hire ?? ""}
                    onChange={onChange}
                    style={styles.modalInput}
                  >
                    <option value="">Select</option>
                    <option value="Permanent">Permanent</option>
                    <option value="Temporary">Temporary</option>
                  </select>
                </label>

                {/* ✅ PERMANENT: CTC + Billing Rate → auto Margin = BR - CTC, editable, auto Margin % */}
                {isPermanent && (
                  <>
                    <label style={styles.fieldLabel}>
                      CTC
                      <input
                        style={styles.modalInput}
                        type="text"
                        name="ctc"
                        value={form.ctc ?? ""}
                        onChange={onChange}
                        placeholder="Enter CTC"
                      />
                    </label>

                    <label style={styles.fieldLabel}>
                      Billing Rate
                      <input
                        style={styles.modalInput}
                        type="text"
                        name="billing_rate"
                        value={form.billing_rate ?? ""}
                        onChange={onChange}
                        placeholder="Enter billing rate"
                      />
                    </label>

                    <label style={styles.fieldLabel}>
                      Margin (auto = BR − CTC, editable)
                      <input
                        style={styles.modalInput}
                        type="text"
                        name="margin_value"
                        value={form.margin_value ?? ""}
                        onChange={onChange}
                        placeholder="Auto-calculated, override if needed"
                      />
                    </label>

                    <label style={styles.fieldLabel}>
                      Margin %
                      <input
                        style={{ ...styles.modalInput, background: "#f1f5f9", color: "#64748b" }}
                        type="text"
                        name="margin_percent"
                        value={form.margin_percent ?? ""}
                        readOnly
                        placeholder="Auto-calculated"
                      />
                    </label>
                  </>
                )}

                {/* ✅ TEMPORARY: CTC + Billing Rate → auto Margin + auto Margin % (both editable) */}
                {isTemporary && (
                  <>
                    <label style={styles.fieldLabel}>
                      CTC Per Month
                      <input
                        style={styles.modalInput}
                        type="text"
                        name="ctc"
                        value={form.ctc ?? ""}
                        onChange={onChange}
                        placeholder="Enter CTC"
                      />
                    </label>

                    <label style={styles.fieldLabel}>
                      Billing Rate
                      <input
                        style={styles.modalInput}
                        type="text"
                        name="billing_rate"
                        value={form.billing_rate ?? ""}
                        onChange={onChange}
                        placeholder="Enter billing rate"
                      />
                    </label>

                    <label style={styles.fieldLabel}>
                      Margin (auto-calc, editable)
                      <input
                        style={styles.modalInput}
                        type="text"
                        name="margin_value"
                        value={form.margin_value ?? ""}
                        onChange={onChange}
                        placeholder="Auto = Billing - CTC"
                      />
                    </label>

                    <label style={styles.fieldLabel}>
                      Margin %
                      <input
                        style={{ ...styles.modalInput, background: "#f1f5f9", color: "#64748b" }}
                        type="text"
                        name="margin_percent"
                        value={form.margin_percent ?? ""}
                        readOnly
                        placeholder="Auto-calculated"
                      />
                    </label>
                  </>
                )}

                {!isPermanent && !isTemporary && (
                  <div style={styles.hintCard}>
                    Select Hire type to enter Billing / Margin fields.
                  </div>
                )}
              </div>
            </div>
          </form>
        </div>

        <div style={styles.modalFooter}>
          <div style={styles.footerActions}>
            <button
              type="button"
              onClick={onClose}
              style={styles.secondaryBtn}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              form={formId}
              style={styles.primaryBtn}
              disabled={saving}
            >
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
  select: {
    padding: "6px",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    fontSize: "14px",
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
  actionBtns: {
    display: "flex",
    gap: "8px",
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
  modal: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
  modalBox: {
    background: "#fff",
    padding: "20px",
    borderRadius: "8px",
    width: "400px",
  },
  button: {
    padding: "6px 10px",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    cursor: "pointer",
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
  primaryBtn: {
    padding: "10px 18px",
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: "10px",
    cursor: "pointer",
    fontWeight: 600,
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
  hintCard: {
    gridColumn: "1 / -1",
    border: "1px dashed #cbd5e1",
    borderRadius: "12px",
    padding: "12px",
    color: "#475569",
    background: "#fff",
    fontSize: "14px",
  },
};
