import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Loader from "../../components/common/Loader";
import { supabase } from "../../services/supabaseClient";
import { formatDate } from "../../utils/dateFormat";

const CHART_COLORS = [
  "#0f766e",
  "#2563eb",
  "#f59e0b",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#16a34a",
  "#475569",
];

const columnConfig = [
  { key: "s_no", label: "S.No", type: "number" },
  { key: "client_name", label: "Client Name" },
  { key: "bd", label: "BD" },
  { key: "hire_mode", label: "Hire Mode" },
  { key: "onboarded_month", label: "Onboarded Month", type: "month" },
  { key: "offboarded_month", label: "Offboarded Month", type: "month" },
  { key: "status", label: "Status" },
  { key: "remarks", label: "Remarks", type: "textarea" },
  { key: "profiles_submitted", label: "Profiles Submitted", type: "number" },
  { key: "feedback_pending", label: "Feedback Pending", type: "number" },
  { key: "duplicate_profiles", label: "Duplicate Profiles", type: "number" },
  { key: "interview_scheduled", label: "Interview Scheduled", type: "number" },
  { key: "rejected", label: "Rejected", type: "number" },
  { key: "position_hold", label: "Position Hold", type: "number" },
  { key: "position_closed", label: "Position Closed", type: "number" },
  { key: "client_dropouts", label: "Client Dropouts", type: "number" },
  { key: "candidate_dropouts", label: "Candidate Dropouts", type: "number" },
  { key: "closure", label: "Closure", type: "number" },
];

const headerMap = {
  "s no": "s_no",
  "s.no": "s_no",
  "sl no": "s_no",
  "serial no": "s_no",
  "client name": "client_name",
  client: "client_name",
  bd: "bd",
  "hire mode": "hire_mode",
  "onboarded month": "onboarded_month",
  "offboarded month": "offboarded_month",
  status: "status",
  remarks: "remarks",
  "profiles submitted": "profiles_submitted",
  "profile submitted": "profiles_submitted",
  "feedback pending": "feedback_pending",
  "duplicate profiles": "duplicate_profiles",
  duplicate: "duplicate_profiles",
  "interview scheduled": "interview_scheduled",
  rejected: "rejected",
  "position hold": "position_hold",
  "position closed": "position_closed",
  "client dropouts": "client_dropouts",
  "candidate dropouts": "candidate_dropouts",
  closure: "closure",
};

const numberFields = new Set(
  columnConfig.filter((column) => column.type === "number").map((column) => column.key)
);

const emptyForm = columnConfig.reduce((acc, column) => {
  acc[column.key] = "";
  return acc;
}, {});

const normalizeText = (value) =>
  String(value ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/[\u200B-\u200D]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/[._-]+/g, " ")
    .replace(/[\t\r\n]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

const normalizedHeaderMap = Object.entries(headerMap).reduce((acc, [key, value]) => {
  acc[normalizeText(key)] = value;
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

const toNullableNumber = (value) => {
  if (value === "" || value == null) return null;
  const cleaned = String(value).replace(/,/g, "").trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const toNumber = (value) => toNullableNumber(value) || 0;

const toPayload = (row) => {
  const payload = {};

  columnConfig.forEach((column) => {
    const value = row[column.key];
    if (numberFields.has(column.key)) {
      payload[column.key] = toNullableNumber(value);
      return;
    }

    if (column.type === "month") {
      payload[column.key] = value || null;
      return;
    }

    payload[column.key] = value === "" ? null : value ?? null;
  });

  return payload;
};

const mapUploadedRow = (row) => {
  const normalizedRow = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    const mappedKey = normalizedHeaderMap[normalizeText(key)] || normalizeText(key);
    normalizedRow[mappedKey] = typeof value === "string" ? value.trim() : value;
  });
  return toPayload(normalizedRow);
};

const normalizeHireMode = (value) => {
  const normalized = normalizeText(value);
  if (!normalized) return "Unknown";
  if (normalized.includes("contract")) return "Contract";
  if (normalized.includes("permanent")) return "Permanent";
  return String(value).trim() || "Unknown";
};

const parseMonthValue = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const raw = String(value).trim();
  if (!raw) return null;

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;

  const monthMatch = raw.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    return new Date(Number(monthMatch[1]), Number(monthMatch[2]) - 1, 1);
  }

  const slashMatch = raw.match(/^(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    return new Date(Number(slashMatch[2]), Number(slashMatch[1]) - 1, 1);
  }

  return null;
};

const toMonthKey = (value) => {
  const date = parseMonthValue(value);
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const toMonthLabel = (value) => {
  const date = parseMonthValue(value);
  if (!date) return "Unknown";
  return date.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
};

const getAnalyticsFromRows = (rows) => {
  const clientMap = new Map();
  const pipelineMap = new Map();
  const statusMap = new Map();
  const hireModeMap = new Map();
  const trendMap = new Map();

  const totals = rows.reduce(
    (acc, row) => {
      const client = String(row.client_name || "").trim() || "Unknown";
      const status = String(row.status || "").trim() || "Unknown";
      const monthKey = toMonthKey(row.onboarded_month);
      const monthLabel = toMonthLabel(row.onboarded_month);
      const hireMode = normalizeHireMode(row.hire_mode);

      const submitted = toNumber(row.profiles_submitted);
      const interviews = toNumber(row.interview_scheduled);
      const rejected = toNumber(row.rejected);
      const closures = toNumber(row.closure);

      acc.profilesSubmitted += submitted;
      acc.interviews += interviews;
      acc.rejected += rejected;
      acc.closures += closures;
      acc.feedbackPending += toNumber(row.feedback_pending);
      acc.duplicateProfiles += toNumber(row.duplicate_profiles);
      acc.clientDropouts += toNumber(row.client_dropouts);
      acc.candidateDropouts += toNumber(row.candidate_dropouts);
      acc.positionHold += toNumber(row.position_hold);
      acc.positionClosed += toNumber(row.position_closed);

      clientMap.set(client, (clientMap.get(client) || 0) + submitted);

      const pipeline = pipelineMap.get(client) || {
        client,
        submitted: 0,
        interviews: 0,
        rejected: 0,
        closures: 0,
      };
      pipeline.submitted += submitted;
      pipeline.interviews += interviews;
      pipeline.rejected += rejected;
      pipeline.closures += closures;
      pipelineMap.set(client, pipeline);

      statusMap.set(status, (statusMap.get(status) || 0) + 1);
      hireModeMap.set(hireMode, (hireModeMap.get(hireMode) || 0) + submitted);

      if (monthKey) {
        const trend = trendMap.get(monthKey) || {
          key: monthKey,
          label: monthLabel,
          submissions: 0,
          interviews: 0,
        };
        trend.submissions += submitted;
        trend.interviews += interviews;
        trendMap.set(monthKey, trend);
      }

      return acc;
    },
    {
      profilesSubmitted: 0,
      interviews: 0,
      rejected: 0,
      closures: 0,
      feedbackPending: 0,
      duplicateProfiles: 0,
      clientDropouts: 0,
      candidateDropouts: 0,
      positionHold: 0,
      positionClosed: 0,
    }
  );

  return {
    kpis: [
      { label: "Profiles Submitted", value: totals.profilesSubmitted.toLocaleString("en-IN"), note: "Sum of profiles submitted" },
      { label: "Interviews Scheduled", value: totals.interviews.toLocaleString("en-IN"), note: "Sum of interview scheduled" },
      { label: "Rejected", value: totals.rejected.toLocaleString("en-IN"), note: "Sum of rejected counts" },
      { label: "Closures", value: totals.closures.toLocaleString("en-IN"), note: "Sum of closure counts" },
    ],
    clientPerformance: Array.from(clientMap.entries())
      .map(([client, submissions]) => ({ client, submissions }))
      .sort((a, b) => b.submissions - a.submissions || a.client.localeCompare(b.client)),
    pipeline: Array.from(pipelineMap.values()).sort(
      (a, b) => b.submitted - a.submitted || a.client.localeCompare(b.client)
    ),
    statusDistribution: Array.from(statusMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value),
    hireModeSplit: Array.from(hireModeMap.entries()).map(([name, value]) => ({ name, value })),
    trend: Array.from(trendMap.values()).sort((a, b) => a.key.localeCompare(b.key)),
    risks: [
      { label: "Feedback Pending", value: totals.feedbackPending },
      { label: "Duplicate Profiles", value: totals.duplicateProfiles },
      { label: "Client Dropouts", value: totals.clientDropouts },
      { label: "Candidate Dropouts", value: totals.candidateDropouts },
      { label: "Position Hold", value: totals.positionHold },
      { label: "Position Closed", value: totals.positionClosed },
    ],
  };
};
export default function SalesTracker() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });

  const [analyticsClient, setAnalyticsClient] = useState("");
  const [analyticsStartMonth, setAnalyticsStartMonth] = useState("");
  const [analyticsEndMonth, setAnalyticsEndMonth] = useState("");
  const [analyticsHireMode, setAnalyticsHireMode] = useState("");
  const [tableSearch, setTableSearch] = useState("");

  const fetchRows = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sales_tracker")
      .select("*")
      .order("id", { ascending: false });

    if (error) {
      console.error("[sales_tracker] fetch failed", error);
      setRows([]);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRows();
  }, []);

  const clientOptions = useMemo(
    () =>
      Array.from(new Set(rows.map((row) => String(row.client_name || "").trim()).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b)
      ),
    [rows]
  );

  const analyticsRows = useMemo(() => {
    const startKey = analyticsStartMonth || "";
    const endKey = analyticsEndMonth || "";

    return rows.filter((row) => {
      const client = String(row.client_name || "").trim();
      const rowHireMode = normalizeHireMode(row.hire_mode);
      const rowMonthKey = toMonthKey(row.onboarded_month);

      if (analyticsClient && client !== analyticsClient) return false;
      if (analyticsHireMode && rowHireMode !== analyticsHireMode) return false;
      if (startKey && rowMonthKey && rowMonthKey < startKey) return false;
      if (endKey && rowMonthKey && rowMonthKey > endKey) return false;
      if ((startKey || endKey) && !rowMonthKey) return false;
      return true;
    });
  }, [rows, analyticsClient, analyticsStartMonth, analyticsEndMonth, analyticsHireMode]);

  const dashboard = useMemo(() => getAnalyticsFromRows(analyticsRows), [analyticsRows]);

  const tableRows = useMemo(() => {
    const query = normalizeText(tableSearch);
    if (!query) return rows;

    return rows.filter((row) =>
      columnConfig.some((column) => normalizeText(row[column.key]).includes(query))
    );
  }, [rows, tableSearch]);

  const handleOpenAdd = () => {
    setEditingRow(null);
    setForm({ ...emptyForm });
    setShowModal(true);
  };

  const handleOpenEdit = (row) => {
    setEditingRow(row);
    const next = { ...emptyForm };
    columnConfig.forEach((column) => {
      next[column.key] = row[column.key] ?? "";
    });
    setForm(next);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    if (saving) return;
    setShowModal(false);
    setEditingRow(null);
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);

    const payload = toPayload(form);

    if (editingRow?.id) {
      const { error } = await supabase.from("sales_tracker").update(payload).eq("id", editingRow.id);
      if (error) {
        alert(error.message);
        console.error("[sales_tracker] update failed", error);
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase.from("sales_tracker").insert([payload]);
      if (error) {
        alert(error.message);
        console.error("[sales_tracker] insert failed", error);
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

    const target = rows.find((row) => row.id === id);
    const ok = window.confirm(`Delete sales record for "${target?.client_name || "-"}"?`);
    if (!ok) return;

    setDeletingId(id);
    const { error } = await supabase.from("sales_tracker").delete().eq("id", id);
    if (error) {
      alert(error.message);
      console.error("[sales_tracker] delete failed", error);
      setDeletingId(null);
      return;
    }

    setRows((prev) => prev.filter((row) => row.id !== id));
    setDeletingId(null);
  };

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    let parsedRows = [];

    try {
      if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        parsedRows = XLSX.utils.sheet_to_json(firstSheet, { defval: "", raw: false });
      } else {
        const csvText = await file.text();
        const delimiter = detectDelimiter(csvText);
        parsedRows = await new Promise((resolve, reject) => {
          Papa.parse(csvText, {
            header: true,
            skipEmptyLines: "greedy",
            delimiter,
            transformHeader: (header) => {
              const key = normalizeText(header);
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
    } catch (error) {
      alert("Unable to parse uploaded file");
      console.error("[sales_tracker] upload parse failed", error);
      event.target.value = "";
      return;
    }

    const validRows = (parsedRows || [])
      .map((row) => mapUploadedRow(row))
      .filter((row) => Object.values(row).some((value) => value !== null && value !== ""));

    if (!validRows.length) {
      alert("No valid rows found in file.");
      event.target.value = "";
      return;
    }

    const { error } = await supabase.from("sales_tracker").insert(validRows);
    if (error) {
      alert(error.message);
      console.error("[sales_tracker] upload insert failed", error);
      event.target.value = "";
      return;
    }

    alert("Upload successful.");
    fetchRows();
    event.target.value = "";
  };

  if (loading) {
    return <Loader text="Loading client analysis..." />;
  }

  return (
    <div style={styles.page}>
      <div style={styles.heroCard}>
        <div>
          <h2 style={styles.title}>Client Analysis</h2>
          <p style={styles.subtitle}>
            Visual analytics from sales_tracker, followed by the full manual management table.
          </p>
        </div>
      </div>

      <section style={styles.filterCard}>
        <div style={styles.sectionHeader}>
          <h3 style={styles.sectionTitle}>Filters</h3>
          <p style={styles.sectionSubtitle}>All analytics update instantly when filters change.</p>
        </div>
        <div style={styles.filterGrid}>
          <label style={styles.filterLabel}>
            Client Name
            <select value={analyticsClient} onChange={(event) => setAnalyticsClient(event.target.value)} style={styles.filterInput}>
              <option value="">All Clients</option>
              {clientOptions.map((client) => (
                <option key={client} value={client}>{client}</option>
              ))}
            </select>
          </label>
          <label style={styles.filterLabel}>
            Start Month
            <input type="month" value={analyticsStartMonth} onChange={(event) => setAnalyticsStartMonth(event.target.value)} style={styles.filterInput} />
          </label>
          <label style={styles.filterLabel}>
            End Month
            <input type="month" value={analyticsEndMonth} onChange={(event) => setAnalyticsEndMonth(event.target.value)} style={styles.filterInput} />
          </label>
          <label style={styles.filterLabel}>
            Hire Mode
            <select value={analyticsHireMode} onChange={(event) => setAnalyticsHireMode(event.target.value)} style={styles.filterInput}>
              <option value="">All Hire Modes</option>
              <option value="Permanent">Permanent</option>
              <option value="Contract">Contract</option>
            </select>
          </label>
        </div>
      </section>

      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <h3 style={styles.sectionTitle}>KPI Summary</h3>
          <p style={styles.sectionSubtitle}>Summary based on the current analytics filter set.</p>
        </div>
        <div style={styles.cardGrid4}>
          {dashboard.kpis.map((card) => (
            <MetricCard key={card.label} {...card} />
          ))}
        </div>
      </section>
      <div style={styles.chartGrid}>
        <ChartCard title="Client Submission Volume" subtitle="Profiles submitted by client">
          <div style={styles.chartWrap}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dashboard.clientPerformance}>
                <CartesianGrid strokeDasharray="3 3" stroke="#dbe4f0" />
                <XAxis dataKey="client" tick={{ fill: "#4b5563", fontSize: 12 }} />
                <YAxis tick={{ fill: "#4b5563", fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="submissions" fill="#2563eb" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Pipeline By Client" subtitle="Submission, interview, rejection, and closure mix">
          <div style={styles.chartWrap}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dashboard.pipeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="#dbe4f0" />
                <XAxis dataKey="client" tick={{ fill: "#4b5563", fontSize: 12 }} />
                <YAxis tick={{ fill: "#4b5563", fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="submitted" stackId="pipeline" fill="#0f766e" />
                <Bar dataKey="interviews" stackId="pipeline" fill="#2563eb" />
                <Bar dataKey="rejected" stackId="pipeline" fill="#dc2626" />
                <Bar dataKey="closures" stackId="pipeline" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <div style={styles.chartGrid}>
        <ChartCard title="Status Distribution" subtitle="Record count by status">
          <div style={styles.chartWrap}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={dashboard.statusDistribution} dataKey="value" nameKey="name" outerRadius={100} innerRadius={52} paddingAngle={2}>
                  {dashboard.statusDistribution.map((entry, index) => (
                    <Cell key={`${entry.name}-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Hire Mode Split" subtitle="Profiles submitted by hire mode">
          <div style={styles.chartWrap}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dashboard.hireModeSplit}>
                <CartesianGrid strokeDasharray="3 3" stroke="#dbe4f0" />
                <XAxis dataKey="name" tick={{ fill: "#4b5563", fontSize: 12 }} />
                <YAxis tick={{ fill: "#4b5563", fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#7c3aed" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <div style={styles.chartGrid}>
        <ChartCard title="Hiring Trend" subtitle="Monthly submissions and interviews">
          <div style={styles.chartWrap}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dashboard.trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#dbe4f0" />
                <XAxis dataKey="label" tick={{ fill: "#4b5563", fontSize: 12 }} />
                <YAxis tick={{ fill: "#4b5563", fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="submissions" name="Profiles Submitted" stroke="#0f766e" strokeWidth={2.5} />
                <Line type="monotone" dataKey="interviews" name="Interviews Scheduled" stroke="#2563eb" strokeWidth={2.5} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Risk Indicators" subtitle="Operational risk counters from the same table">
          <div style={styles.riskGrid}>
            {dashboard.risks.map((item, index) => (
              <div key={item.label} style={styles.riskCard}>
                <span style={{ ...styles.riskDot, background: CHART_COLORS[index % CHART_COLORS.length] }} />
                <p style={styles.riskLabel}>{item.label}</p>
                <p style={styles.riskValue}>{item.value.toLocaleString("en-IN")}</p>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      <section style={styles.tableSection}>
        <div style={styles.sectionHeader}>
          <h3 style={styles.sectionTitle}>Client Analysis Table</h3>
          <p style={styles.sectionSubtitle}>
            Manual add, CSV/XLSX upload, edit, delete, and search on sales_tracker.
          </p>
        </div>

        <div style={styles.actionBar}>
          <button onClick={handleOpenAdd} style={styles.primaryBtn}>+ Add Sales Record</button>
          <label style={styles.uploadBtn}>
            Upload CSV/XLSX
            <input type="file" accept=".csv,.xlsx,.xls" onChange={handleUpload} style={styles.hiddenInput} />
          </label>
          <input placeholder="Search table..." value={tableSearch} onChange={(event) => setTableSearch(event.target.value)} style={styles.searchInput} />
        </div>

        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr>
                {columnConfig.map((column) => (
                  <th key={column.key} style={styles.th}>{column.label}</th>
                ))}
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 ? (
                <tr>
                  <td style={styles.td} colSpan={columnConfig.length + 1}>No records found.</td>
                </tr>
              ) : (
                tableRows.map((row) => (
                  <tr key={row.id}>
                    {columnConfig.map((column) => (
                      <td key={`${row.id}-${column.key}`} style={styles.td} title={row[column.key] == null || row[column.key] === "" ? "-" : String(row[column.key])}>
                        {column.type === "month"
                          ? row[column.key]
                            ? toMonthLabel(row[column.key])
                            : "-"
                          : column.type === "date"
                            ? formatDate(row[column.key])
                            : row[column.key] == null || row[column.key] === ""
                              ? "-"
                              : String(row[column.key])}
                      </td>
                    ))}
                    <td style={styles.td}>
                      <div style={styles.actionBtns}>
                        <button style={styles.editBtn} onClick={() => handleOpenEdit(row)}>Edit</button>
                        <button style={styles.deleteBtn} onClick={() => handleDelete(row.id)} disabled={deletingId === row.id}>
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
      </section>

      {showModal ? (
        <SalesTrackerModal
          form={form}
          editingRow={editingRow}
          saving={saving}
          onChange={handleChange}
          onClose={handleCloseModal}
          onSave={handleSave}
        />
      ) : null}
    </div>
  );
}

function MetricCard({ label, value, note }) {
  return (
    <div style={styles.metricCard}>
      <p style={styles.metricLabel}>{label}</p>
      <p style={styles.metricValue}>{value}</p>
      <p style={styles.metricNote}>{note}</p>
    </div>
  );
}

function ChartCard({ title, subtitle, children }) {
  return (
    <section style={styles.chartCard}>
      <div style={styles.sectionHeader}>
        <h3 style={styles.sectionTitle}>{title}</h3>
        <p style={styles.sectionSubtitle}>{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function SalesTrackerModal({ form, editingRow, saving, onChange, onClose, onSave }) {
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const formId = "sales-tracker-form";

  return (
    <div style={styles.overlay}>
      <div style={styles.modalShell}>
        <div style={styles.modalHeader}>
          <div style={styles.modalHeaderRow}>
            <h3 style={styles.modalTitle}>{editingRow ? "Edit Sales Record" : "Add Sales Record"}</h3>
            <button type="button" onClick={onClose} style={styles.closeBtn}>x</button>
          </div>
        </div>

        <div style={styles.modalBody}>
          <form id={formId} onSubmit={onSave} style={styles.form}>
            <div style={styles.sectionCard}>
              <div style={styles.sectionHead}>
                <h4 style={styles.modalSectionTitle}>Sales Tracker Details</h4>
              </div>
              <div style={styles.sectionGrid}>
                {columnConfig.map((column) => (
                  <label key={column.key} style={styles.fieldLabel}>
                    {column.label}
                    {column.type === "textarea" ? (
                      <textarea style={styles.modalTextarea} name={column.key} value={form[column.key]} onChange={onChange} />
                    ) : (
                      <input style={styles.modalInput} type={column.type === "month" ? "month" : "text"} name={column.key} value={form[column.key]} onChange={onChange} />
                    )}
                  </label>
                ))}
              </div>
            </div>
          </form>
        </div>

        <div style={styles.modalFooter}>
          <div style={styles.footerActions}>
            <button type="button" onClick={onClose} style={styles.secondaryBtn} disabled={saving}>Cancel</button>
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
    display: "flex",
    flexDirection: "column",
    gap: "18px",
    width: "100%",
    minWidth: 0,
  },
  heroCard: {
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
    flexWrap: "wrap",
    padding: "22px",
    borderRadius: "20px",
    border: "1px solid #c7d2fe",
    background:
      "linear-gradient(135deg, rgba(240,253,250,1) 0%, rgba(239,246,255,1) 55%, rgba(250,245,255,1) 100%)",
    boxShadow: "0 12px 28px rgba(15, 23, 42, 0.08)",
  },
  title: {
    margin: 0,
    fontSize: "32px",
    lineHeight: 1.1,
    color: "#0f172a",
    fontWeight: 800,
  },
  subtitle: {
    margin: "10px 0 0",
    fontSize: "14px",
    lineHeight: 1.6,
    color: "#475569",
    maxWidth: "760px",
  },
  filterCard: {
    padding: "18px",
    borderRadius: "18px",
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    boxShadow: "0 10px 28px rgba(15, 23, 42, 0.06)",
  },
  filterGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "14px",
    marginTop: "12px",
  },
  filterLabel: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    fontSize: "12px",
    fontWeight: 700,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },
  filterInput: {
    height: "44px",
    borderRadius: "12px",
    border: "1px solid #cbd5e1",
    background: "#fff",
    padding: "0 12px",
    fontSize: "15px",
    color: "#0f172a",
    outline: "none",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  sectionHeader: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  sectionTitle: {
    margin: 0,
    fontSize: "20px",
    color: "#0f172a",
    fontWeight: 800,
  },
  sectionSubtitle: {
    margin: 0,
    fontSize: "13px",
    color: "#64748b",
  },
  cardGrid4: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "14px",
  },
  metricCard: {
    padding: "18px",
    borderRadius: "18px",
    background: "linear-gradient(180deg, #ffffff 0%, #eff6ff 100%)",
    border: "1px solid #bfdbfe",
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)",
  },
  metricLabel: {
    margin: 0,
    fontSize: "13px",
    color: "#475569",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  metricValue: {
    margin: "10px 0 8px",
    fontSize: "30px",
    lineHeight: 1.05,
    color: "#0f172a",
    fontWeight: 800,
  },
  metricNote: {
    margin: 0,
    fontSize: "12px",
    color: "#64748b",
    lineHeight: 1.5,
  },
  chartGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
    gap: "14px",
  },
  chartCard: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "18px",
    borderRadius: "18px",
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    boxShadow: "0 10px 28px rgba(15, 23, 42, 0.06)",
    minWidth: 0,
  },
  chartWrap: {
    width: "100%",
    height: "320px",
    minWidth: 0,
  },
  riskGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: "12px",
  },
  riskCard: {
    padding: "14px",
    borderRadius: "14px",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
  },
  riskDot: {
    display: "inline-block",
    width: "10px",
    height: "10px",
    borderRadius: "999px",
    marginBottom: "10px",
  },
  riskLabel: {
    margin: 0,
    fontSize: "12px",
    color: "#64748b",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },
  riskValue: {
    margin: "8px 0 0",
    fontSize: "26px",
    fontWeight: 800,
    color: "#0f172a",
  },
  tableSection: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  actionBar: {
    display: "flex",
    gap: "10px",
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
  searchInput: {
    padding: "10px 12px",
    width: "260px",
    border: "1px solid #cbd5e1",
    borderRadius: "10px",
    fontSize: "14px",
  },
  tableContainer: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    overflowX: "auto",
    overflowY: "auto",
    maxHeight: "70vh",
    border: "1px solid #cbd5e1",
    borderRadius: "14px",
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
  modalSectionTitle: {
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
