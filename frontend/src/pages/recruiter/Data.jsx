import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../services/supabaseClient";
import { useAuth } from "../../context/AuthContext";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import Loader from "../../components/common/Loader";
import { formatDate } from "../../utils/dateFormat";

const buildHistoryRow = ({
  candidateId,
  recruiterName,
  candidateName,
  clientName,
  requirement,
  oldStatus,
  newStatus,
}) => ({
  candidate_id: candidateId || null,
  recruiter_name: recruiterName || "-",
  candidate_name: candidateName || "-",
  client_name: clientName || null,
  requirement: requirement || null,
  old_status: oldStatus ?? null,
  new_status: newStatus || "Profile Submitted",
  updated_at: new Date().toISOString(),
});

const insertStatusHistoryRows = async (rows, source) => {
  const payload = Array.isArray(rows) ? rows : [rows];
  const { data, error } = await supabase.from("status_history").insert(payload).select("*");

  if (error) {
    console.error(`[status_history][${source}] insert failed`, { error, payload });
    return { ok: false, error };
  }

  console.log(`[status_history][${source}] insert success`, data || []);
  return { ok: true, data: data || [] };
};

const touchUserLastSeen = async (userId, source) => {
  if (!userId) return;
  const { error } = await supabase
    .from("users")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) {
    console.error(`[last_seen_at][${source}] update failed`, error);
  }
};

const headerMap = {
  "record date": "record_date",
  "date": "record_date",
  "recruiter": "recruiter",
  "recruiter name": "recruiter",
  "client name": "client_name",
  "client": "client_name",
  "requirement": "requirement",
  "location": "location",
  "candidate name": "candidate_name",
  "candidate": "candidate_name",
  "phone number": "phone_number",
  "mobile": "phone_number",
  "mobile number": "phone_number",
  "contact no": "phone_number",
  "contact no.": "phone_number",
  "phone no": "phone_number",
  "phone no.": "phone_number",
  "ph no": "phone_number",
  "phone": "phone_number",
  "email": "email",
  "email id": "email",
  "email address": "email",
  "e mail": "email",
  "ctc": "ctc",
  "ectc": "ectc",
  "hire mode": "hire_mode",
  "status": "status",
  "remarks": "remarks",
  "interview date": "interview_date",
  "interview time": "interview_time",
};

const INTERVIEW_STATUSES = new Set([
  "ai interview",
  "assessment round",
  "hr round",
  "interview scheduled",
  "l1 scheduled",
  "l2 scheduled",
]);

const REJECTED_STATUSES = new Set([
  "final round rejected",
  "l1 reject",
  "l1 rejected",
  "l2 reject",
  "l2 rejected",
  "profile reject",
  "profile rejected",
  "rejected",
]);

export default function RecruiterData({ scopeRole }) {
  const { user } = useAuth();
  const effectiveRole = scopeRole || user?.role;
  const isManagerView = effectiveRole === "manager";

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const [searchBy, setSearchBy] = useState("candidate_name");
  const [searchText, setSearchText] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [interviewFromDate, setInterviewFromDate] = useState("");
  const [statusFilter, setStatusFilter] = useState(null);
  const [kpiFilter, setKpiFilter] = useState(null);
  const [interviewToDate, setInterviewToDate] = useState("");

  const handleClearFilters = () => {
    setSearchBy("candidate_name");
    setSearchText("");
    setFromDate("");
    setToDate("");
    setInterviewFromDate("");
    setInterviewToDate("");
    setStatusFilter(null);
    setKpiFilter(null);
  };

  const fetchRecords = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from("candidate_records")
      .select("*")
      .order("record_date", { ascending: false });

    if (isManagerView) {
      query = query.eq("recruiter", "manager");
    } else {
      query = query.eq("recruiter", user?.name);
    }

    if (searchText) {
      query = query.ilike(searchBy, `%${searchText}%`);
    }

    if (fromDate) query = query.gte("record_date", fromDate);
    if (toDate) query = query.lte("record_date", toDate);
    if (interviewFromDate) query = query.gte("interview_date", interviewFromDate);
    if (interviewToDate) query = query.lte("interview_date", interviewToDate);

    const { data, error } = await query;
    if (!error) setRecords(data || []);
    setLoading(false);
  }, [fromDate, interviewFromDate, interviewToDate, isManagerView, searchBy, searchText, toDate, user?.name]);

  const fetchRecordsRef = useRef(fetchRecords);
  fetchRecordsRef.current = fetchRecords;

  useEffect(() => {
    if (!user?.id) return;
    fetchRecords();
  }, [user?.id, fetchRecords]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`candidate-records-live-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "candidate_records" }, () => {
        fetchRecordsRef.current?.();
      })
      .subscribe((status) => {
        console.log("[candidate_records] realtime status", status);
      });

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  const normalize = (value) =>
    String(value ?? "")
      .replace(/^\uFEFF/, "")
      .replace(/[\u200B-\u200D]/g, "")
      .replace(/\u00A0/g, " ")
      .replace(/[\t\r\n]+/g, " ")
      .replace(/[._-]+/g, " ")
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
      if (count > bestCount) { best = delimiter; bestCount = count; }
    }
    return bestCount > 0 ? best : ",";
  };

  const getCanonicalKey = (key) => {
    const normalized = normalize(key);
    return normalizedHeaderMap[normalized] || normalized;
  };

  const parseCSVRows = (csvText) =>
    new Promise((resolve, reject) => {
      const delimiter = detectDelimiter(csvText);
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

  const transformCSVRow = (row, index) => {
    const clean = {};
    for (const [k, v] of Object.entries(row)) {
      const value = typeof v === "string" ? v.replace(/\u00A0/g, " ").trim() : v;
      const canonicalKey = normalizedHeaderMap[normalize(k)] || normalize(k);
      if (clean[canonicalKey] == null || clean[canonicalKey] === "") {
        clean[canonicalKey] = value;
      }
    }

    const isBlank = (v) => v == null || (typeof v === "string" && normalize(v) === "");
    if (isBlank(clean.recruiter)) throw new Error("Recruiter missing in CSV row");
    if (isBlank(clean.client_name)) throw new Error("Client Name missing in CSV row");

    return {
      record_date: clean.record_date || new Date().toISOString().split("T")[0],
      recruiter: clean.recruiter,
      client_name: clean.client_name,
      requirement: clean.requirement || "",
      location: clean.location || "",
      candidate_name: clean.candidate_name || "",
      phone_number: clean.phone_number || "",
      email: clean.email || "",
      ctc: clean.ctc ? Number(clean.ctc) : null,
      ectc: clean.ectc ? Number(clean.ectc) : null,
      hire_mode: clean.hire_mode || "",
      status: clean.status || "Profile Submitted",
      remarks: clean.remarks || null,
      interview_date: clean.interview_date || null,
      interview_time: clean.interview_time || null,
    };
  };

  const handleCSVUpload = async (e) => {
    const file = e.target.files[0];
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
        parsedRows = await parseCSVRows(csvText);
      }
    } catch (err) {
      alert("Unable to parse uploaded file");
      console.error(err);
      return;
    }

    const validRows = [];
    const errors = [];

    parsedRows.forEach((row, index) => {
      try {
        validRows.push(transformCSVRow(row, index));
      } catch (err) {
        errors.push(`Row ${index + 2}: ${err.message} (Recruiter / Client Name mandatory)`);
      }
    });

    if (errors.length) {
      alert("CSV Upload Failed \n\n" + errors.slice(0, 5).join("\n") + (errors.length > 5 ? "\n..." : ""));
      console.error(errors);
      return;
    }

    const payloadRows = isManagerView
      ? validRows.map((row) => ({ ...row, recruiter: "manager" }))
      : validRows.map((row) => ({ ...row, recruiter: user?.name }));

    const makeMatchKey = (email, phone, client, role) => {
      const e = String(email || "").trim().toLowerCase();
      const p = String(phone || "").trim();
      const c = String(client || "").trim().toLowerCase();
      const r = String(role || "").trim().toLowerCase();
      return `${e}__${p}__${c}__${r}`;
    };

    const scopedRecruiter = isManagerView ? "manager" : user?.name;

    const decoratedRows = payloadRows.map((row) => {
      const email = String(row.email || "").trim().toLowerCase();
      const phone = String(row.phone_number || "").trim();
      const client = String(row.client_name || "").trim().toLowerCase();
      const role = String(row.requirement || "").trim().toLowerCase();
      const isMatchable = email && phone && client && role;
      return {
        ...row,
        _matchKey: isMatchable ? makeMatchKey(email, phone, client, role) : null,
        _isMatchable: Boolean(isMatchable),
      };
    });

    const matchableRows = decoratedRows.filter((r) => r._isMatchable);
    const existingByMatchKey = new Map();

    if (matchableRows.length) {
      const { data: existingRows, error: existingError } = await supabase
        .from("candidate_records")
        .select("id, email, phone_number, client_name, requirement, status, recruiter")
        .eq("recruiter", scopedRecruiter);

      if (existingError) { alert(existingError.message); console.error(existingError); return; }

      (existingRows || []).forEach((row) => {
        const key = makeMatchKey(row.email, row.phone_number, row.client_name, row.requirement);
        existingByMatchKey.set(key, row);
      });
    }

    const rowsToInsert = [];
    const rowsToUpdate = [];

    decoratedRows.forEach((row) => {
      const cleanRow = {
        record_date: row.record_date,
        recruiter: row.recruiter,
        client_name: row.client_name,
        requirement: row.requirement,
        location: row.location,
        candidate_name: row.candidate_name,
        phone_number: row.phone_number || row.Phone || row.mobile || " ",
        email: row.email,
        ctc: row.ctc,
        ectc: row.ectc,
        hire_mode: row.hire_mode,
        status: row.status,
        remarks: row.remarks,
        interview_date: row.interview_date,
        interview_time: row.interview_time,
      };

      if (row._isMatchable && existingByMatchKey.has(row._matchKey)) {
        rowsToUpdate.push({ existing: existingByMatchKey.get(row._matchKey), payload: cleanRow });
      } else {
        rowsToInsert.push(cleanRow);
      }
    });

    let insertedRows = [];
    if (rowsToInsert.length) {
      const { data, error } = await supabase
        .from("candidate_records")
        .upsert(rowsToInsert, { onConflict: "email,phone_number,client_name,requirement", ignoreDuplicates: true })
        .select("id,recruiter,candidate_name,client_name,requirement,status");

      if (error) { alert(error.message); console.error(error); return; }
      insertedRows = data || [];
    }

    const updatedRows = [];
    for (const item of rowsToUpdate) {
      const { existing, payload } = item;
      const { data, error } = await supabase
        .from("candidate_records")
        .update(payload)
        .eq("id", existing.id)
        .select("id,recruiter,candidate_name,client_name,requirement,status")
        .single();

      if (error) { console.error("[csv_upload] update existing row failed", { error, existing, payload }); continue; }
      updatedRows.push({ ...data, _oldStatus: existing.status || null });
    }

    const historyRows = [
      ...insertedRows.map((r) => buildHistoryRow({
        candidateId: r.id, recruiterName: r.recruiter || user?.name,
        candidateName: r.candidate_name, clientName: r.client_name,
        requirement: r.requirement, oldStatus: null, newStatus: r.status || "Profile Submitted",
      })),
      ...updatedRows.map((r) => buildHistoryRow({
        candidateId: r.id, recruiterName: r.recruiter || user?.name,
        candidateName: r.candidate_name, clientName: r.client_name,
        requirement: r.requirement, oldStatus: r._oldStatus, newStatus: r.status || "Profile Submitted",
      })),
    ];

    if (historyRows.length) await insertStatusHistoryRows(historyRows, "csv_upload");
    await touchUserLastSeen(user?.id, "csv_upload");
    alert("CSV uploaded successfully ✅");
    fetchRecords();
  };

  const handleSave = async (form) => {
    const payload = {
      record_date: form.record_date,
      recruiter: isManagerView ? "manager" : user?.name,
      client_name: form.client_name,
      requirement: form.requirement,
      location: form.location,
      candidate_name: form.candidate_name,
      phone_number: form.phone_number,
      email: form.email,
      ctc: form.ctc,
      ectc: form.ectc,
      hire_mode: form.hire_mode,
      status: form.status,
      remarks: form.remarks,
      interview_date: form.interview_date,
      interview_time: form.interview_time,
    };

    const { data: insertedRow, error } = await supabase
      .from("candidate_records")
      .insert({ ...payload })
      .select("id,recruiter,candidate_name,client_name,requirement,status")
      .single();

    if (error) {
      console.log("code:", error.code, "message:", error.message);
      alert(JSON.stringify(error));
      return;
    }

    if (insertedRow) {
      await insertStatusHistoryRows(
        buildHistoryRow({
          candidateId: insertedRow.id,
          recruiterName: insertedRow.recruiter || user?.name,
          candidateName: insertedRow.candidate_name,
          clientName: insertedRow.client_name,
          requirement: insertedRow.requirement,
          oldStatus: null,
          newStatus: insertedRow.status || "Profile Submitted",
        }),
        "single_save"
      );
    }
    await touchUserLastSeen(user?.id, "single_save");
    setShowModal(false);
    fetchRecords();
  };

  const handleDelete = async (id) => {
    if (!id || deletingId) return;
    const target = records.find((r) => r.id === id);
    const ok = window.confirm(`Delete candidate "${target?.candidate_name || "-"}"?`);
    if (!ok) return;

    setDeletingId(id);
    let query = supabase.from("candidate_records").delete().eq("id", id);
    query = isManagerView ? query.eq("recruiter", "manager") : query.eq("recruiter", user?.name);

    const { error } = await query;
    if (error) {
      alert(error.message);
      console.error("[candidate_records] delete failed", error);
      setDeletingId(null);
      return;
    }

    setRecords((prev) => prev.filter((r) => r.id !== id));
    setDeletingId(null);
  };

  const recruiterKpiStats = useMemo(() => {
    const stats = { permanent: 0, contract: 0, backout: 0, interview: 0, rejected: 0 };
    records.forEach((record) => {
      const hireMode = String(record.hire_mode || "").trim().toLowerCase();
      const status = String(record.status || "").trim().toLowerCase();
      if (hireMode === "permanent") stats.permanent += 1;
      if (hireMode === "contract") stats.contract += 1;
      if (status === "backout") stats.backout += 1;
      if (INTERVIEW_STATUSES.has(status)) stats.interview += 1;
      if (REJECTED_STATUSES.has(status) || status.includes("rejected")) stats.rejected += 1;
    });
    return stats;
  }, [records]);

  const kpiCards = [
    { key: "permanent", label: "Permanent", value: recruiterKpiStats.permanent },
    { key: "contract",  label: "Contract",  value: recruiterKpiStats.contract  },
    { key: "backout",   label: "Backout",   value: recruiterKpiStats.backout   },
    { key: "interview", label: "Interview", value: recruiterKpiStats.interview },
    { key: "rejected",  label: "Rejected",  value: recruiterKpiStats.rejected  },
  ];

  const displayedRecords = useMemo(() => {
    let filtered = records;

    if (statusFilter) {
      filtered = filtered.filter((r) => {
        const s = String(r.status || "").trim().toLowerCase();
        return statusFilter === "drop out" ? s.includes("drop out") : s === statusFilter;
      });
    }

    if (kpiFilter) {
      filtered = filtered.filter((r) => {
        const hireMode = String(r.hire_mode || "").trim().toLowerCase();
        const status   = String(r.status    || "").trim().toLowerCase();
        if (kpiFilter === "permanent") return hireMode === "permanent";
        if (kpiFilter === "contract")  return hireMode === "contract";
        if (kpiFilter === "backout")   return status === "backout";
        if (kpiFilter === "interview") return INTERVIEW_STATUSES.has(status);
        if (kpiFilter === "rejected")  return REJECTED_STATUSES.has(status) || status.includes("rejected");
        return true;
      });
    }

    return filtered;
  }, [kpiFilter, records, statusFilter]);

  return (
    <div style={styles.page}>
      <h2>{isManagerView ? "Monthly Report" : "Recruiter Data"}</h2>

      <div style={styles.actionBar}>
        <button onClick={() => setShowModal(true)} style={styles.primaryBtn}>+ Add Candidate</button>

        <label style={styles.uploadBtn}>
          Upload CSV/XLSX
          <input type="file" accept=".csv,.xlsx,.xls" onChange={handleCSVUpload} style={styles.hiddenInput} />
        </label>

        <select
          value={statusFilter || ""}
          onChange={(e) => setStatusFilter(e.target.value || null)}
          style={{ padding: "10px 16px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#fff", fontSize: "14px", fontWeight: 600, color: "#0f172a", cursor: "pointer", minWidth: "220px" }}
        >
          <option value="">All Statuses</option>
          <option value="profile submitted">Profile Submitted</option>
          <option value="feedback pending">Feedback Pending</option>
          <option value="duplicate">Duplicate</option>
          <option value="drop out by client">Drop Out By Client</option>
          <option value="drop out by candidate">Drop Out By Candidate</option>
          <option value="assessment round">Assessment Round</option>
          <option value="hr round">HR Round</option>
          <option value="l1 scheduled">L1 Scheduled</option>
          <option value="l2 scheduled">L2 Scheduled</option>
          <option value="ai interview">AI Interview</option>
          <option value="offered">Offered</option>
          <option value="closure">Closure</option>
          <option value="backout">Backout</option>
          <option value="l1 reject">L1 Reject</option>
          <option value="l2 reject">L2 Reject</option>
          <option value="final round rejected">Final Round Rejected</option>
          <option value="shortlisted">Shortlisted</option>
          <option value="position hold">Position Hold</option>
          <option value="position closed">Position Closed</option>
          <option value="interview scheduled">Interview Scheduled</option>
        </select>

        <select value={searchBy} onChange={(e) => setSearchBy(e.target.value)} style={styles.select}>
          <option value="candidate_name">Candidate Name</option>
          <option value="client_name">Client Name</option>
        </select>

        <input placeholder="Search..." value={searchText} onChange={(e) => setSearchText(e.target.value)} style={styles.input} />

        <span style={styles.filterLabel}>Record Date</span>
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={styles.dateInput} />
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={styles.dateInput} />

        <span style={styles.filterLabel}>Interview Date</span>
        <input type="date" value={interviewFromDate} onChange={(e) => setInterviewFromDate(e.target.value)} style={styles.dateInput} />
        <input type="date" value={interviewToDate} onChange={(e) => setInterviewToDate(e.target.value)} style={styles.dateInput} />

        <button onClick={handleClearFilters} style={styles.secondaryBtnSolid}>Clear Filters</button>
      </div>

      <div style={styles.kpiGrid}>
        <div style={styles.kpiRow}>
          {kpiCards.map((card) => (
            <button
              key={card.key}
              type="button"
              style={{ ...styles.kpiCardSmall, ...(kpiFilter === card.key ? styles.kpiCardSmallActive : {}) }}
              onClick={() => setKpiFilter((current) => (current === card.key ? null : card.key))}
            >
              <div style={styles.kpiLabel}>{card.label}</div>
              <div style={styles.kpiValueSmall}>{card.value.toLocaleString("en-IN")}</div>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={styles.loaderWrap}><Loader text="Loading candidates..." /></div>
      ) : (
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Date</th>
                <th style={styles.th}>Recruiter</th>
                <th style={styles.th}>Client</th>
                <th style={styles.th}>Requirement</th>
                <th style={styles.th}>Location</th>
                <th style={styles.th}>Candidate</th>
                <th style={styles.th}>Phone</th>
                <th style={styles.th}>Email</th>
                <th style={styles.th}>CTC</th>
                <th style={styles.th}>ECTC</th>
                <th style={styles.th}>Hire Mode</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Remarks</th>
                <th style={styles.th}>Interview Date</th>
                <th style={styles.th}>Interview Time</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayedRecords.map((r) => (
                <tr key={r.id}>
                  <td style={styles.td}>{formatDate(r.record_date)}</td>
                  <td style={styles.td}>{r.recruiter}</td>
                  <td style={styles.td}>{r.client_name}</td>
                  <td style={styles.td}>{r.requirement}</td>
                  <td style={styles.td}>{r.location}</td>
                  <td style={styles.td}>{r.candidate_name}</td>
                  <td style={styles.td}>{r.phone_number}</td>
                  <td style={styles.td}>{r.email}</td>
                  <td style={styles.td}>{r.ctc || "-"}</td>
                  <td style={styles.td}>{r.ectc || "-"}</td>
                  <td style={styles.td}>{r.hire_mode}</td>
                  <td style={styles.td}>{r.status}</td>
                  <td style={styles.td} title={r.remarks || "-"}>{r.remarks || "-"}</td>
                  <td style={styles.td}>{formatDate(r.interview_date)}</td>
                  <td style={styles.td}>{r.interview_time || "-"}</td>
                  <td style={styles.td}>
                    <div style={styles.actionBtns}>
                      <button style={styles.editBtn} onClick={() => setEditRecord(r)}>Edit</button>
                      <button
                        style={styles.deleteBtn}
                        onClick={() => handleDelete(r.id)}
                        disabled={deletingId === r.id}
                      >
                        {deletingId === r.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <AddCandidateModal user={user} onClose={() => setShowModal(false)} onSaved={fetchRecords} />
      )}
      {editRecord && (
        <EditCandidateModal record={editRecord} onClose={() => setEditRecord(null)} onUpdated={fetchRecords} />
      )}
    </div>
  );
}

/* ------------------------- ADD CANDIDATE MODAL ------------------------- */

function AddCandidateModal({ user, onClose, onSaved }) {
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = originalOverflow; };
  }, []);

  const [form, setForm] = useState({
    record_date: "", client_name: "", requirement: "", location: "",
    candidate_name: "", phone_number: "", email: "", ctc: "", ectc: "",
    hire_mode: "", status: "", remarks: "", interview_date: "", interview_time: "",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "ctc" || name === "ectc") {
      const isNumericOnly = /^\d*$/.test(String(value));
      if (!isNumericOnly) return;
      return setForm({ ...form, [name]: value });
    }

    return setForm({ ...form, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user?.id) { alert("Session error. Please login again."); return; }

    const payload = {
      record_date: form.record_date,
      recruiter: user?.role === "manager" ? "manager" : user?.name,
      client_name: form.client_name,
      requirement: form.requirement,
      location: form.location,
      candidate_name: form.candidate_name,
      phone_number: form.phone_number,
      email: form.email,
      ctc: form.ctc || null,
      ectc: form.ectc || null,
      hire_mode: form.hire_mode,
      status: form.status || "Profile Submitted",
      remarks: form.remarks || null,
      interview_date: form.interview_date || null,
      interview_time: form.interview_time || null,
    };

    const emailKey = String(payload.email || "").trim().toLowerCase();
    const phoneKey = String(payload.phone_number || "").trim();
    const recruiterScope = payload.recruiter;

    let upsertedRow = null;
    let error = null;

    if (emailKey && phoneKey) {
      const { data: existingRows, error: existingError } = await supabase
        .from("candidate_records")
        .select("id,recruiter,candidate_name,client_name,requirement,status")
        .eq("recruiter", recruiterScope)
        .eq("email", emailKey)
        .eq("phone_number", phoneKey)
        .eq("client_name", payload.client_name)
        .limit(1);

      if (existingError) { alert(existingError.message); return; }

      const existingRow = existingRows?.[0] || null;

      if (existingRow) {
        const { data: updatedRow, error: updateError } = await supabase
          .from("candidate_records")
          .update(payload)
          .eq("id", existingRow.id)
          .select("id,recruiter,candidate_name,client_name,requirement,status")
          .single();
        upsertedRow = updatedRow;
        error = updateError;
      } else {
        const { data: insertedRows, error: insertError } = await supabase
          .from("candidate_records")
          .insert([payload])
          .select("id,recruiter,candidate_name,client_name,requirement,status");
        upsertedRow = insertedRows?.[0] || null;
        error = insertError;
      }
    } else {
      const { data: insertedRows, error: insertError } = await supabase
        .from("candidate_records")
        .insert([payload])
        .select("id,recruiter,candidate_name,client_name,requirement,status");
      upsertedRow = insertedRows?.[0] || null;
      error = insertError;
    }

    if (error) { alert(error.message); return; }

    if (upsertedRow) {
      await insertStatusHistoryRows(
        buildHistoryRow({
          candidateId: upsertedRow.id,
          recruiterName: upsertedRow.recruiter || user?.name,
          candidateName: upsertedRow.candidate_name,
          clientName: upsertedRow.client_name,
          requirement: upsertedRow.requirement,
          oldStatus: null,
          newStatus: upsertedRow.status || "Profile Submitted",
        }),
        "manual_add"
      );
    }
    await touchUserLastSeen(user?.id, "manual_add");
    onSaved();
    onClose();
  };

  const formId = "add-candidate-form";

  return (
    <div style={styles.overlay}>
      <div style={styles.modalShell}>
        <div style={styles.modalHeader}>
          <div style={styles.modalHeaderRow}>
            <h3 style={styles.modalTitle}>Add Candidate</h3>
            <button type="button" onClick={onClose} style={styles.closeBtn}>x</button>
          </div>
        </div>

        <div style={styles.modalBody}>
          <form id={formId} onSubmit={handleSubmit} style={styles.form}>
            <div style={styles.sectionCard}>
              <div style={styles.sectionHead}><h4 style={styles.sectionTitle}>Personal Information</h4></div>
              <div style={styles.sectionGrid}>
                <label style={styles.fieldLabel}>
                  Record Date
                  <input style={styles.modalInput} type="date" name="record_date" onChange={handleChange} required />
                </label>
                <label style={styles.fieldLabel}>
                  Candidate Name
                  <input style={styles.modalInput} name="candidate_name" onChange={handleChange} required />
                </label>
                <label style={styles.fieldLabel}>
                  Email
                  <input style={styles.modalInput} name="email" onChange={handleChange} />
                </label>
                <label style={styles.fieldLabel}>
                  Phone
                  <input
                    style={styles.modalInput} name="phone_number" type="tel" maxLength={10} inputMode="numeric"
                    onChange={(e) => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 10); handleChange(e); }}
                  />
                </label>
              </div>
            </div>

            <div style={styles.sectionCard}>
              <div style={styles.sectionHead}><h4 style={styles.sectionTitle}>Job Details</h4></div>
              <div style={styles.sectionGrid}>
                <label style={styles.fieldLabel}>
                  Client
                  <input style={styles.modalInput} name="client_name" onChange={handleChange} required />
                </label>
                <label style={styles.fieldLabel}>
                  Requirement
                  <input style={styles.modalInput} name="requirement" onChange={handleChange} />
                </label>
                <label style={styles.fieldLabel}>
                  Location
                  <input style={styles.modalInput} name="location" onChange={handleChange} />
                </label>
                <label style={styles.fieldLabel}>
                  Hire Mode
                  <select style={styles.modalInput} name="hire_mode" onChange={handleChange}>
                    <option value="">Select</option>
                    <option value="Permanent">Permanent</option>
                    <option value="Contract">Contract</option>
                  </select>
                </label>
                <label style={styles.fieldLabel}>
                  Status
                  <select style={styles.modalInput} name="status" onChange={handleChange}>
                    <option value="Profile Submitted">Profile Submitted</option>
                    <option value="Feedback Pending">Feedback Pending</option>
                    <option value="Duplicate">Duplicate</option>
                    <option value="Drop Out By Client">Drop Out By Client</option>
                    <option value="Drop Out By Candidate">Drop Out By Candidate</option>
                    <option value="Assessment Round">Assessment Round</option>
                    <option value="HR Round">HR Round</option>
                    <option value="L1 Scheduled">L1 Scheduled</option>
                    <option value="L2 Scheduled">L2 Scheduled</option>
                    <option value="AI Interview">AI Interview</option>
                    <option value="Offered">Offered</option>
                    <option value="Closure">Closure</option>
                    <option value="Backout">Backout</option>
                    <option value="L1 Reject">L1 Reject</option>
                    <option value="L2 Reject">L2 Reject</option>
                    <option value="Final Round Rejected">Final Round Rejected</option>
                    <option value="Shortlisted">Shortlisted</option>
                    <option value="Position Hold">Position Hold</option>
                    <option value="Position Closed">Position Closed</option>
                    <option value="Interview Scheduled">Interview Scheduled</option>
                  </select>
                </label>
                <label style={styles.fieldLabel}>
                  Remarks
                  <textarea style={styles.modalTextarea} name="remarks" value={form.remarks} onChange={handleChange} />
                </label>
              </div>
            </div>

            <div style={styles.sectionCard}>
              <div style={styles.sectionHead}><h4 style={styles.sectionTitle}>Compensation</h4></div>
              <div style={styles.sectionGrid}>
                  <label style={styles.fieldLabel}>CTC<input style={styles.modalInput} name="ctc" inputMode="numeric" onChange={handleChange} /></label>
                  <label style={styles.fieldLabel}>ECTC<input style={styles.modalInput} name="ectc" inputMode="numeric" onChange={handleChange} /></label>
              </div>
            </div>

            <div style={styles.sectionCard}>
              <div style={styles.sectionHead}><h4 style={styles.sectionTitle}>Interview Details</h4></div>
              <div style={styles.sectionGrid}>
                <label style={styles.fieldLabel}>
                  Interview Date
                  <input style={styles.modalInput} type="date" name="interview_date" onChange={handleChange} />
                </label>
                <label style={styles.fieldLabel}>
                  Interview Time
                  <input style={styles.modalInput} type="time" name="interview_time" onChange={handleChange} />
                </label>
              </div>
            </div>
          </form>
        </div>

        <div style={styles.modalFooter}>
          <div style={styles.footerActions}>
            <button type="button" onClick={onClose} style={styles.secondaryBtn}>Cancel</button>
            <button type="submit" form={formId} style={styles.primaryBtn}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------- EDIT CANDIDATE MODAL ------------------------- */

function EditCandidateModal({ record, onClose, onUpdated }) {
  const { user } = useAuth();

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = originalOverflow; };
  }, []);

  const [form, setForm] = useState({
    candidate_name: record.candidate_name || "",
    email:          record.email          || "",
    phone_number:   record.phone_number   || "",
    client_name:    record.client_name    || "",
    requirement:    record.requirement    || "",
    location:       record.location       || "",
    ctc:            record.ctc  ?? "",
    ectc:           record.ectc ?? "",
    hire_mode:      record.hire_mode      || "",
    remarks:        record.remarks        || "",
    interview_date: record.interview_date || "",
    interview_time: record.interview_time || "",
    status:         record.status         || "",
  });

  const [showClosureModal, setShowClosureModal] = useState(false);
  const [closurePayload,   setClosurePayload]   = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "ctc" || name === "ectc") {
      const isNumericOnly = /^\d*$/.test(String(value));
      if (!isNumericOnly) return;
    }

    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const toNullableNumber = (value) => {
    if (value === "" || value == null) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const handleUpdate = async (e) => {
    e.preventDefault();

    const previousStatus = record.status || null;
    const statusChanged  = (form.status || null) !== previousStatus;

    const nonStatusChanged =
      form.candidate_name  !== (record.candidate_name  || "") ||
      form.email           !== (record.email           || "") ||
      form.phone_number    !== (record.phone_number    || "") ||
      form.client_name     !== (record.client_name     || "") ||
      form.requirement     !== (record.requirement     || "") ||
      form.location        !== (record.location        || "") ||
      String(form.ctc)     !== String(record.ctc  ?? "") ||
      String(form.ectc)    !== String(record.ectc ?? "") ||
      form.hire_mode       !== (record.hire_mode       || "") ||
      form.remarks         !== (record.remarks         || "") ||
      form.interview_date  !== (record.interview_date  || "") ||
      form.interview_time  !== (record.interview_time  || "");

    if (!statusChanged && !nonStatusChanged) { onClose(); return; }

    // Always save non-status fields first
    if (nonStatusChanged) {
      const nonStatusPayload = {
        candidate_name : form.candidate_name,
        email          : form.email,
        phone_number   : form.phone_number,
        client_name    : form.client_name,
        requirement    : form.requirement,
        location       : form.location,
        ctc            : toNullableNumber(form.ctc),
        ectc           : toNullableNumber(form.ectc),
        hire_mode      : form.hire_mode,
        remarks        : form.remarks        || null,
        interview_date : form.interview_date || null,
        interview_time : form.interview_time || null,
      };

      let nonStatusQuery = supabase.from("candidate_records").update(nonStatusPayload).eq("id", record.id);
      if (user?.role !== "manager") nonStatusQuery = nonStatusQuery.eq("recruiter", user?.name);

      const { error: nonStatusError } = await nonStatusQuery;
      if (nonStatusError) {
        console.error("[candidate_update] non-status update failed", nonStatusError);
        alert(nonStatusError.message);
        return;
      }
    }

    // For Closure: open the editable confirmation modal
    if (statusChanged && (form.status || "").trim().toLowerCase() === "closure") {
      const draft = {
        doj            : new Date().toISOString().split("T")[0],
        recruiter_name : record.recruiter || user?.name,
        candidate_name : form.candidate_name || record.candidate_name || "",
        client_name    : form.client_name    || record.client_name    || "",
        position       : form.requirement    || record.requirement    || "",
        location       : form.location       || record.location       || "",
        hire           : form.hire_mode      || record.hire_mode      || "",
        ctc            : toNullableNumber(form.ctc)  ?? record.ctc  ?? null,
        offered_ctc    : toNullableNumber(form.ectc) ?? record.ectc ?? null,
        billing_rate   : null,
        margin_value   : null,
        margin_percent : null,
      };
      setClosurePayload(draft);
      setShowClosureModal(true);
      return;
    }

    // Normal status change (not closure)
    if (statusChanged) {
      let query = supabase.from("candidate_records").update({ status: form.status }).eq("id", record.id);
      if (user?.role !== "manager") query = query.eq("recruiter", user?.name);

      const { data: updatedRows, error } = await query.select("id,recruiter,candidate_name,client_name,requirement,status");
      if (error) { console.error("[status_update] failed", error); alert(error.message); return; }
      if (!updatedRows?.length) { alert("Unable to update status for this record."); return; }

      const updated = updatedRows[0];

      // ── If changed FROM Closure TO Backout → update requirements row to "Drop Out" ──
      const prevStatusNorm = (record.status || "").trim().toLowerCase();
      const newStatusNorm  = (form.status   || "").trim().toLowerCase();
    if (prevStatusNorm === "closure" && newStatusNorm === "backout") {
  // Update requirements table
  const { error: reqError } = await supabase
    .from("requirements")
    .update({ status: "Drop Out" })
    .eq("job_title",  record.requirement || "")
    .eq("created_by", user?.email        || "");

  if (reqError) {
    console.error("[status_update] requirements Drop Out update failed", reqError);
  }

  // ── Also update revenue_tracker so MasterTracker reflects backout ──
  const { error: revError } = await supabase
    .from("revenue_tracker")
    .update({ offer_status: "Backout" })
    .eq("candidate_name", record.candidate_name || "")
    .eq("client_name",    record.client_name    || "")
    .eq("recruiter_name", record.recruiter      || "");

  if (revError) {
    console.error("[status_update] revenue_tracker backout update failed", revError);
  }
}

      const historyPayload = {
        candidate_id   : updated.id,
        recruiter_name : updated.recruiter || user?.name || "-",
        candidate_name : updated.candidate_name || "-",
        new_status     : updated.status || form.status,
        updated_at     : new Date().toISOString(),
      };

      const { data: existingHistoryRows, error: historyLookupError } = await supabase
        .from("status_history").select("id").eq("candidate_id", updated.id).order("updated_at", { ascending: false });

      if (historyLookupError) {
        console.error("[status_update] status_history lookup failed", historyLookupError);
      } else if ((existingHistoryRows || []).length > 0) {
        const { error: historyUpdateError } = await supabase
          .from("status_history").update(historyPayload).eq("id", existingHistoryRows[0].id);
        if (historyUpdateError) console.error("[status_update] status_history update failed", historyUpdateError);
      } else {
        const { error: historyInsertError } = await supabase.from("status_history").insert([historyPayload]);
        if (historyInsertError) console.error("[status_update] status_history insert failed", historyInsertError);
      }

      await touchUserLastSeen(user?.id, "status_update");
    } else if (nonStatusChanged) {
      await touchUserLastSeen(user?.id, "candidate_update");
    }

    onUpdated();
    onClose();
  };

  const formId = "edit-candidate-form";

  return (
    <>
      <div style={styles.overlay}>
        <div style={styles.modalShell}>
          <div style={styles.modalHeader}>
            <div style={styles.modalHeaderRow}>
              <h3 style={styles.modalTitle}>Edit Candidate</h3>
              <button type="button" onClick={onClose} style={styles.closeBtn}>x</button>
            </div>
          </div>

          <div style={styles.modalBody}>
            <form id={formId} onSubmit={handleUpdate} style={styles.form}>
              <div style={styles.sectionCard}>
                <div style={styles.sectionHead}><h4 style={styles.sectionTitle}>Personal Information</h4></div>
                <div style={styles.sectionGrid}>
                  <label style={styles.fieldLabel}>
                    Candidate Name
                    <input style={styles.modalInput} name="candidate_name" value={form.candidate_name} onChange={handleChange} />
                  </label>
                  <label style={styles.fieldLabel}>
                    Email
                    <input style={styles.modalInput} name="email" value={form.email} onChange={handleChange} />
                  </label>
                  <label style={styles.fieldLabel}>
                    Phone
                    <input
                      style={styles.modalInput} name="phone_number" type="tel" maxLength={10} inputMode="numeric"
                      value={form.phone_number}
                      onChange={(e) => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 10); handleChange(e); }}
                    />
                  </label>
                  <label style={styles.fieldLabel}>
                    Location
                    <input style={styles.modalInput} name="location" value={form.location} onChange={handleChange} />
                  </label>
                </div>
              </div>

              <div style={styles.sectionCard}>
                <div style={styles.sectionHead}><h4 style={styles.sectionTitle}>Job Details</h4></div>
                <div style={styles.sectionGrid}>
                  <label style={styles.fieldLabel}>
                    Client
                    <input style={styles.modalInput} name="client_name" value={form.client_name} onChange={handleChange} />
                  </label>
                  <label style={styles.fieldLabel}>
                    Requirement
                    <input style={styles.modalInput} name="requirement" value={form.requirement} onChange={handleChange} />
                  </label>
                  <label style={styles.fieldLabel}>
                    Hire Mode
                    <select style={styles.modalInput} name="hire_mode" value={form.hire_mode} onChange={handleChange}>
                      <option value="">Select</option>
                      <option value="Permanent">Permanent</option>
                      <option value="Contract">Contract</option>
                    </select>
                  </label>
                  <label style={styles.fieldLabel}>
                    Remarks
                    <textarea style={styles.modalTextarea} name="remarks" value={form.remarks} onChange={handleChange} />
                  </label>
                  <label style={styles.fieldLabel}>
                    Status
                    <select style={styles.modalInput} name="status" value={form.status} onChange={handleChange}>
                      <option value="Profile Submitted">Profile Submitted</option>
                      <option value="Feedback Pending">Feedback Pending</option>
                      <option value="Duplicate">Duplicate</option>
                      <option value="Drop Out By Client">Drop Out By Client</option>
                      <option value="Drop Out By Candidate">Drop Out By Candidate</option>
                      <option value="Assessment Round">Assessment Round</option>
                      <option value="HR Round">HR Round</option>
                      <option value="L1 Scheduled">L1 Scheduled</option>
                      <option value="L2 Scheduled">L2 Scheduled</option>
                      <option value="AI Interview">AI Interview</option>
                      <option value="Offered">Offered</option>
                      <option value="Closure">Closure</option>
                      <option value="Backout">Backout</option>
                      <option value="L1 Reject">L1 Reject</option>
                      <option value="L2 Reject">L2 Reject</option>
                      <option value="Final Round Rejected">Final Round Rejected</option>
                      <option value="Shortlisted">Shortlisted</option>
                      <option value="Position Hold">Position Hold</option>
                      <option value="Position Closed">Position Closed</option>
                      <option value="Interview Scheduled">Interview Scheduled</option>
                    </select>
                  </label>
                </div>
              </div>

              <div style={styles.sectionCard}>
                <div style={styles.sectionHead}><h4 style={styles.sectionTitle}>Compensation</h4></div>
                <div style={styles.sectionGrid}>
                  <label style={styles.fieldLabel}>CTC<input style={styles.modalInput} name="ctc" value={form.ctc} inputMode="numeric" onChange={handleChange} /></label>
                  <label style={styles.fieldLabel}>ECTC<input style={styles.modalInput} name="ectc" value={form.ectc} inputMode="numeric" onChange={handleChange} /></label>
                </div>
              </div>

              <div style={styles.sectionCard}>
                <div style={styles.sectionHead}><h4 style={styles.sectionTitle}>Interview Details</h4></div>
                <div style={styles.sectionGrid}>
                  <label style={styles.fieldLabel}>
                    Interview Date
                    <input style={styles.modalInput} type="date" name="interview_date" value={form.interview_date} onChange={handleChange} />
                  </label>
                  <label style={styles.fieldLabel}>
                    Interview Time
                    <input style={styles.modalInput} type="time" name="interview_time" value={form.interview_time} onChange={handleChange} />
                  </label>
                </div>
              </div>
            </form>
          </div>

          <div style={styles.modalFooter}>
            <div style={styles.footerActions}>
              <button type="button" onClick={onClose} style={styles.secondaryBtn}>Cancel</button>
              <button type="submit" form={formId} style={styles.primaryBtn}>Save Changes</button>
            </div>
          </div>
        </div>
      </div>

      {showClosureModal && closurePayload && (
        <ClosureConfirmModal
          initialData   = {closurePayload}
          recordId      = {record.id}
          recruiterName = {record.recruiter || user?.name}
          userEmail     = {user?.email}
          userId        = {user?.id}
          onConfirm={() => { setShowClosureModal(false); onUpdated(); onClose(); }}
          onCancel ={() => { setShowClosureModal(false); setClosurePayload(null); }}
        />
      )}
    </>
  );
}

/* ------------------------- CLOSURE CONFIRM MODAL ------------------------- */

function ClosureConfirmModal({ initialData, recordId, recruiterName, userEmail, userId, onConfirm, onCancel }) {
  const [form, setForm] = useState({ ...initialData });
  const [saving, setSaving] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "ctc" || name === "offered_ctc" || name === "billing_rate") {
      const isNumericOnly = /^\d*$/.test(String(value));
      if (!isNumericOnly) return;
    }
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleConfirm = async () => {
    setSaving(true);

    const { data: existing } = await supabase
      .from("revenue_tracker")
      .select("id")
      .eq("candidate_name", form.candidate_name)
      .eq("client_name",    form.client_name)
      .eq("recruiter_name", form.recruiter_name)
      .limit(1);

    if (existing && existing.length > 0) {
      alert("Candidate already exists in Revenue Tracker!");
      setSaving(false);
      onCancel();
      return;
    }

    const toNum = (v) => (v !== "" && v != null ? Number(v) : null);

    const revenuePayload = {
      doj            : form.doj            || null,
      recruiter_name : form.recruiter_name || recruiterName,
      bd_name        : userEmail           || "",
      candidate_name : form.candidate_name || "",
      client_name    : form.client_name    || "",
      position       : form.position       || "",
      location       : form.location       || "",
      hire           : form.hire           || "",
      ctc            : toNum(form.ctc),
      offered_ctc    : toNum(form.offered_ctc),
      billing_rate   : toNum(form.billing_rate),
      margin_value   : toNum(form.margin_value),
      margin_percent : toNum(form.margin_percent),
    };

    const { error: revenueError } = await supabase.from("revenue_tracker").insert([revenuePayload]);
    if (revenueError) {
      console.error("[closure] revenue_tracker insert failed", revenueError);
      alert("Failed to add to Revenue Tracker: " + revenueError.message);
      setSaving(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("candidate_records").update({ status: "Closure" }).eq("id", recordId);
    if (updateError) {
      console.error("[closure] candidate_records status update failed", updateError);
      alert("Added to Revenue Tracker but failed to update status: " + updateError.message);
      setSaving(false);
      return;
    }

    // ── Insert into requirements table on closure ──
    const requirementPayload = {
      job_title          : form.position       || "",
      location           : form.location       || "",
      hire_mode          : form.hire           || "",
      hire               : form.hire           || "",
      status             : "Closed",
      created_by         : userEmail           || "",
      salary             : form.offered_ctc != null ? String(form.offered_ctc) : null,
      salary_min         : toNum(form.ctc),
      salary_max         : toNum(form.offered_ctc),
      number_of_openings : 1,
      no_of_openings     : 1,
      urgency            : "Medium",
    };

    const { error: requirementError } = await supabase.from("requirements").insert([requirementPayload]);
    if (requirementError) {
      console.error("[closure] requirements insert failed", requirementError);
      // Non-blocking — closure still succeeds even if this fails
      alert("Saved to Revenue Tracker ✅ but failed to add to Requirements: " + requirementError.message);
    }

    await touchUserLastSeen(userId, "closure_confirm");
    alert("Candidate added to Revenue Tracker, Requirements, and status updated to Closure ✅");
    onConfirm();
  };

  const fieldStyle = {
    height: "44px", borderRadius: "10px", border: "1px solid #e5e7eb",
    background: "#f3f4f6", padding: "0 12px", fontSize: "15px",
    color: "#0f172a", outline: "none", width: "100%", boxSizing: "border-box",
  };
  const labelStyle = {
    display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px",
    fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.02em",
  };
  const gridStyle = {
    display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px 16px",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: "14px", width: "580px", maxWidth: "95%", maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 50px rgba(2,6,23,0.28)", overflow: "hidden" }}>

        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", flexShrink: 0 }}>
          <h3 style={{ margin: 0, fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>
            Confirm Closure — Revenue Tracker Entry
          </h3>
          <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#64748b" }}>
            Review and edit the details before saving to Revenue Tracker.
          </p>
        </div>

        <div style={{ padding: "18px 20px", overflowY: "auto", flex: 1 }}>
          <div style={gridStyle}>
            <label style={labelStyle}>Date of Joining<input style={fieldStyle} type="date" name="doj" value={form.doj || ""} onChange={handleChange} /></label>
            <label style={labelStyle}>Recruiter Name<input style={fieldStyle} name="recruiter_name" value={form.recruiter_name || ""} onChange={handleChange} /></label>
            <label style={labelStyle}>Candidate Name<input style={fieldStyle} name="candidate_name" value={form.candidate_name || ""} onChange={handleChange} /></label>
            <label style={labelStyle}>Client Name<input style={fieldStyle} name="client_name" value={form.client_name || ""} onChange={handleChange} /></label>
            <label style={labelStyle}>Position / Requirement<input style={fieldStyle} name="position" value={form.position || ""} onChange={handleChange} /></label>
            <label style={labelStyle}>Location<input style={fieldStyle} name="location" value={form.location || ""} onChange={handleChange} /></label>
            <label style={labelStyle}>
              Hire Type
              <select style={fieldStyle} name="hire" value={form.hire || ""} onChange={handleChange}>
                <option value="">Select</option>
                <option value="Permanent">Permanent</option>
                <option value="Contract">Contract</option>
              </select>
            </label>
            <label style={labelStyle}>CTC<input style={fieldStyle} name="ctc" type="number" value={form.ctc ?? ""} onChange={handleChange} /></label>
            <label style={labelStyle}>Offered CTC (ECTC)<input style={fieldStyle} name="offered_ctc" type="number" value={form.offered_ctc ?? ""} onChange={handleChange} /></label>
            <label style={labelStyle}>Billing Rate<input style={fieldStyle} name="billing_rate" type="number" value={form.billing_rate ?? ""} onChange={handleChange} /></label>
            <label style={labelStyle}>Margin Value<input style={fieldStyle} name="margin_value" type="number" value={form.margin_value ?? ""} onChange={handleChange} /></label>
            <label style={labelStyle}>Margin %<input style={fieldStyle} name="margin_percent" type="number" value={form.margin_percent ?? ""} onChange={handleChange} /></label>
          </div>
        </div>

        <div style={{ padding: "14px 20px", borderTop: "1px solid #e2e8f0", flexShrink: 0, display: "flex", justifyContent: "space-between", gap: "10px" }}>
          <button type="button" onClick={onCancel} disabled={saving}
            style={{ padding: "10px 18px", borderRadius: "10px", border: "1px solid #d1d5db", background: "#fff", color: "#111827", cursor: "pointer", fontWeight: 600 }}>
            Cancel
          </button>
          <button type="button" onClick={handleConfirm} disabled={saving}
            style={{ padding: "10px 22px", borderRadius: "10px", border: "none", background: "linear-gradient(90deg,#6c5ce7,#5a4fcf)", color: "#fff", cursor: "pointer", fontWeight: 700 }}>
            {saving ? "Saving…" : "Confirm & Save to Revenue Tracker"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- STYLES ----------------------------- */

const styles = {
  actionBar: { display: "flex", gap: "10px", marginBottom: "14px", flexWrap: "wrap" },
  page: { width: "100%", minWidth: 0, overflowX: "hidden" },
  primaryBtn: { padding: "10px 18px", background: "linear-gradient(90deg, #6c5ce7, #5a4fcf)", color: "#fff", border: "none", borderRadius: "10px", cursor: "pointer", fontWeight: 600 },
  secondaryBtnSolid: { padding: "10px 18px", background: "#64748b", color: "#fff", border: "none", borderRadius: "10px", cursor: "pointer", fontWeight: 600 },
  filterLabel: { fontWeight: 600, color: "#475569", fontSize: "13px", alignSelf: "center", marginRight: "4px" },
  dateInput: { padding: "6px", borderRadius: "6px", border: "1px solid #cbd5e1" },
  uploadBtn: { padding: "10px 18px", background: "#0f172a", color: "#fff", border: "none", borderRadius: "10px", cursor: "pointer", fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center" },
  hiddenInput: { display: "none" },
  select: { padding: "6px" },
  editBtn: { padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: "8px", background: "#fff", color: "#0f172a", cursor: "pointer" },
  deleteBtn: { padding: "6px 10px", border: "1px solid #fecaca", borderRadius: "8px", background: "#fff1f2", color: "#b91c1c", cursor: "pointer" },
  actionBtns: { display: "flex", gap: "8px" },
  input: { padding: "6px", width: "200px" },
  table: { width: "max-content", minWidth: "100%", borderCollapse: "collapse", tableLayout: "auto" },
  tableContainer: { width: "100%", maxWidth: "100%", minWidth: 0, overflowX: "auto", overflowY: "auto", maxHeight: "70vh", border: "1px solid #cbd5e1", borderRadius: "6px", background: "#fff" },
  loaderWrap: { width: "100%", minHeight: "280px", border: "1px solid #cbd5e1", borderRadius: "6px", background: "#fff" },
  th: { border: "1px solid #cbd5e1", padding: "8px 10px", whiteSpace: "nowrap", background: "#f8fafc", position: "sticky", top: 0, zIndex: 2, fontWeight: 600, textAlign: "left" },
  td: { border: "1px solid #cbd5e1", padding: "8px 10px", whiteSpace: "nowrap", background: "#fff" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000 },
  modalShell: { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", background: "#fff", width: "520px", maxWidth: "95%", minWidth: "320px", maxHeight: "88vh", borderRadius: "14px", boxShadow: "0 20px 50px rgba(2, 6, 23, 0.25)", display: "flex", flexDirection: "column", overflow: "hidden" },
  modalHeader: { padding: "16px 20px", borderBottom: "1px solid #e2e8f0", background: "#fff", flexShrink: 0 },
  modalHeaderRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" },
  modalTitle: { margin: 0, fontSize: "22px", fontWeight: 800, color: "#0f172a" },
  closeBtn: { width: "38px", height: "38px", borderRadius: "10px", border: "1px solid #d1d5db", background: "#fff", color: "#111827", cursor: "pointer", fontSize: "22px", lineHeight: 1, display: "inline-flex", alignItems: "center", justifyContent: "center" },
  modalBody: { padding: "18px 20px", overflowY: "auto", overflowX: "hidden", flex: 1, background: "#ffffff" },
  modalFooter: { padding: "14px 20px", borderTop: "1px solid #e2e8f0", background: "#fff", flexShrink: 0 },
  footerActions: { display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center", gap: "10px" },
  secondaryBtn: { padding: "10px 18px", borderRadius: "10px", border: "1px solid #d1d5db", background: "#fff", color: "#111827", cursor: "pointer" },
  kpiGrid: { margin: "0 0 18px" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px" },
  kpiCardSmall: { background: "#f0fdf4", borderWidth: "1px", borderStyle: "solid", borderColor: "#bbf7d0", borderRadius: "10px", padding: "12px 16px", minHeight: "72px", display: "flex", flexDirection: "column", justifyContent: "space-between", cursor: "pointer", textAlign: "left", boxShadow: "0 6px 16px rgba(15, 23, 42, 0.04)" },
  kpiCardSmallActive: { background: "#eef2ff", borderWidth: "2px", borderColor: "#6366f1", boxShadow: "0 8px 22px rgba(79, 70, 229, 0.18)" },
  kpiLabel: { color: "#4338ca", fontSize: "13px", fontWeight: 700 },
  kpiValueSmall: { color: "#0f172a", fontSize: "24px", fontWeight: 800, lineHeight: 1 },
  form: { display: "flex", flexDirection: "column", gap: "16px" },
  sectionCard: { background: "#ffffff", border: "none", borderRadius: "14px", padding: "10px 0" },
  sectionHead: { marginBottom: "10px", paddingBottom: "8px", borderBottom: "1px solid #e5e7eb" },
  sectionTitle: { margin: 0, fontSize: "16px", fontWeight: 600, color: "#0f172a" },
  sectionGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px 16px" },
  fieldLabel: { display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.02em" },
  modalInput: { height: "44px", borderRadius: "10px", border: "1px solid #e5e7eb", background: "#f3f4f6", padding: "0 12px", fontSize: "15px", color: "#0f172a", outline: "none" },
  modalTextarea: { minHeight: "88px", borderRadius: "12px", border: "1px solid #e5e7eb", background: "#f3f4f6", padding: "10px 12px", fontSize: "15px", color: "#0f172a", outline: "none", resize: "vertical", fontFamily: "inherit" },
};