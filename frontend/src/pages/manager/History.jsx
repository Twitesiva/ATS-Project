import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../services/supabaseClient";
import Loader from "../../components/common/Loader";

function dedupeHistoryRows(rows) {
  const sorted = [...(rows || [])].sort(
    (a, b) =>
      new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime() ||
      Number(b.id || 0) - Number(a.id || 0)
  );
  const seen = new Set();
  const deduped = [];

  // Exact key required: recruiter_name + candidate_id + new_status
  sorted.forEach((row) => {
    const key = `${row.recruiter_name ?? ""}-${row.candidate_id ?? ""}-${row.new_status ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(row);
  });

  return deduped;
}

function mapRow(row) {
  return {
    id: row.id,
    candidateId: row.candidate_id ?? null,
    recruiterName: row.recruiter_name || "-",
    candidateName: row.candidate_name || "-",
    status: row.new_status || "-",
    updatedAt: row.updated_at || null,
  };
}

function formatDateTimeDDMMYYYY(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();

  const hours24 = date.getHours();
  const hours12 = hours24 % 12 || 12;
  const hh = String(hours12).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  const period = hours24 >= 12 ? "PM" : "AM";

  return `${dd}/${mm}/${yyyy}, ${hh}:${mi}:${ss} ${period}`;
}

export default function History() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let mounted = true;

    const loadRows = async () => {
      setLoading(true);
      setError("");

      const { data, error } = await supabase
        .from("status_history")
        .select("id,candidate_id,recruiter_name,candidate_name,new_status,updated_at")
        .order("updated_at", { ascending: false })
        .order("id", { ascending: false });

      if (!mounted) return;

      if (error) {
        console.error("[manager-history] fetch failed", error);
        setError(error.message || "Failed to load history");
        setLoading(false);
        return;
      }

      console.log("[manager-history] fetch success", data || []);
      const dedupedRows = dedupeHistoryRows(data || []);
      console.log("[manager-history] rows after dedupe", {
        total: (data || []).length,
        deduped: dedupedRows.length,
      });
      setRows(dedupedRows);
      setLoading(false);
    };

    loadRows();

    const channel = supabase
      .channel("manager-history-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "status_history" },
        (payload) => {
          console.log("[manager-history] realtime insert", payload.new);
          setRows((prev) => {
            const merged = [payload.new, ...prev];
            return dedupeHistoryRows(merged);
          });
        }
      )
      .subscribe((status) => {
        console.log("[manager-history] realtime status", status);
      });

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const sortedRows = useMemo(() => rows.map(mapRow), [rows]);

  return (
    <div style={styles.page}>
      <h2 style={styles.title}>Recruiters History</h2>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Recruiter</th>
              <th style={styles.th}>Candidate</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Date & Time</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td style={styles.td} colSpan={4}>
                  <div style={styles.loaderCell}>
                    <Loader size="small" text="Loading history..." />
                  </div>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td style={styles.td} colSpan={4}>
                  {error}
                </td>
              </tr>
            ) : sortedRows.length === 0 ? (
              <tr>
                <td style={styles.td} colSpan={4}>
                  No status updates found
                </td>
              </tr>
            ) : (
              sortedRows.map((r) => (
                <tr key={r.id}>
                  <td style={styles.td}>{r.recruiterName}</td>
                  <td style={styles.td}>{r.candidateName}</td>
                  <td style={styles.td}>{r.status}</td>
                  <td style={styles.td}>
                    {formatDateTimeDDMMYYYY(r.updatedAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styles = {
  page: {
    padding: "20px",
  },
  title: {
    margin: "0 0 12px 0",
  },
  tableWrap: {
    border: "1px solid #dbe3ef",
    borderRadius: "10px",
    overflow: "auto",
    background: "#fff",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: "780px",
  },
  th: {
    textAlign: "left",
    padding: "10px 12px",
    borderBottom: "1px solid #dbe3ef",
    background: "#f8fafc",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "10px 12px",
    borderBottom: "1px solid #eef2f7",
    whiteSpace: "nowrap",
  },
  loaderCell: {
    width: "100%",
    minHeight: "80px",
  },
};
