import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../services/supabaseClient";
import Loader from "../../components/common/Loader";
import { formatDate } from "../../utils/dateFormat";

const columns = [
  { key: "s_no", label: "S.No" },
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

export default function TeamTracker() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedRecruiter, setSelectedRecruiter] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [locationSearch, setLocationSearch] = useState("");
  const [recruiterOptions, setRecruiterOptions] = useState([]);

  const fetchRecords = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from("revenue_tracker")
      .select("*")
      .order("doj", { ascending: false });

    if (fromDate) query = query.gte("doj", fromDate);
    if (toDate) query = query.lte("doj", toDate);
    if (selectedRecruiter) query = query.eq("recruiter_name", selectedRecruiter);
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
  }, [fromDate, toDate, selectedRecruiter, clientSearch, locationSearch]);

  const fetchRecruiterOptions = useCallback(async () => {
    const { data, error } = await supabase
      .from("revenue_tracker")
      .select("recruiter_name")
      .order("recruiter_name", { ascending: true });

    if (error) {
      console.error("[team-tracker] recruiter options fetch failed", error);
      setRecruiterOptions([]);
      return;
    }

    const unique = [...new Set((data || []).map((r) => r.recruiter_name).filter(Boolean))];
    setRecruiterOptions(unique);
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  useEffect(() => {
    fetchRecruiterOptions();
  }, [fetchRecruiterOptions]);

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
        console.log("[team-tracker] realtime status", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchRecords, fetchRecruiterOptions]);

  const orderedRows = useMemo(() => records, [records]);

  return (
    <div style={styles.page}>
      <h2 style={styles.title}>Team Tracker</h2>

      <div style={styles.actionBar}>
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

      {loading ? (
        <div style={styles.loaderWrap}>
          <Loader text="Loading team revenue..." />
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
              </tr>
            </thead>
            <tbody>
              {orderedRows.length === 0 ? (
                <tr>
                  <td style={styles.td} colSpan={columns.length}>
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
                          : row[c.key] == null || row[c.key] === ""
                            ? "-"
                            : String(row[c.key])}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
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
};

