import { useCallback, useEffect, useState } from "react";
import Loader from "../../components/common/Loader";
import { supabase } from "../../services/supabaseClient";
import { getRoleLabel, getRoleQueryValues } from "../../utils/roles";

const formatLastSeen = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-GB");
};

export default function AdminActivity() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    managersOnline: 0,
    managersOffline: 0,
    recruitersOnline: 0,
    recruitersOffline: 0,
    tlsOnline: 0,
    tlsOffline: 0,
  });
  const [rows, setRows] = useState([]);

  const loadActivity = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("users")
      .select("name,email,role,is_online,last_seen_at")
      .in("role", [
        ...getRoleQueryValues("manager"),
        ...getRoleQueryValues("recruiter"),
        ...getRoleQueryValues("tl"),
      ])
      .order("last_seen_at", { ascending: false });

    if (error) {
      console.error("[admin-activity] failed", error);
      setLoading(false);
      return;
    }

    const allRows = data || [];
    const managers = allRows.filter((r) => String(r.role || "").toLowerCase() === "manager");
    const recruiters = allRows.filter((r) => String(r.role || "").toLowerCase() === "recruiter");
    const tls = allRows.filter((r) => String(r.role || "").toLowerCase() === "tl");

    setStats({
      managersOnline: managers.filter((r) => r.is_online).length,
      managersOffline: managers.filter((r) => !r.is_online).length,
      recruitersOnline: recruiters.filter((r) => r.is_online).length,
      recruitersOffline: recruiters.filter((r) => !r.is_online).length,
      tlsOnline: tls.filter((r) => r.is_online).length,
      tlsOffline: tls.filter((r) => !r.is_online).length,
    });

    setRows(allRows);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadActivity();

    const channel = supabase
      .channel("admin-activity-users")
      .on("postgres_changes", { event: "*", schema: "public", table: "users" }, loadActivity)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadActivity]);

  if (loading) return <Loader text="Loading activity..." />;

  const cards = [
    { title: "Managers Online", value: stats.managersOnline, sub: "Currently active managers" },
    { title: "Managers Offline", value: stats.managersOffline, sub: "Currently inactive managers" },
    { title: "Recruiters Online", value: stats.recruitersOnline, sub: "Currently active recruiters" },
    { title: "Recruiters Offline", value: stats.recruitersOffline, sub: "Currently inactive recruiters" },
    { title: "TL Online", value: stats.tlsOnline, sub: "Currently active team leads" },
    { title: "TL Offline", value: stats.tlsOffline, sub: "Currently inactive team leads" },
  ];

  return (
    <div style={styles.page}>
      <h2 style={styles.title}>HR Activity</h2>

      <div style={styles.grid}>
        {cards.map((card) => (
          <div key={card.title} style={styles.card}>
            <p style={styles.label}>{card.title}</p>
            <p style={styles.value}>{card.value}</p>
            <p style={styles.sub}>{card.sub}</p>
          </div>
        ))}
      </div>

      <section style={styles.panel}>
        <h3 style={styles.panelTitle}>User Status</h3>
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>User Name</th>
                <th style={styles.th}>Role</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td style={styles.td} colSpan={4}>No user activity found.</td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <tr key={`${row.email}-${idx}`}>
                    <td style={styles.td}>{row.name || row.email?.split("@")[0] || "-"}</td>
                    <td style={styles.td}>{getRoleLabel(row.role)}</td>
                    <td style={styles.td}>{row.is_online ? "Online" : "Offline"}</td>
                    <td style={styles.td}>{formatLastSeen(row.last_seen_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const styles = {
  page: { display: "flex", flexDirection: "column", gap: "14px" },
  title: { margin: 0, fontSize: "30px", color: "#0f172a" },
  grid: {
    display: "grid",
    gap: "12px",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  },
  card: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    padding: "14px",
  },
  label: { margin: 0, color: "#64748b", fontSize: "13px", fontWeight: 600 },
  value: { margin: "8px 0 4px", fontSize: "30px", color: "#0f172a", fontWeight: 700 },
  sub: { margin: 0, color: "#64748b", fontSize: "12px" },
  panel: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "14px" },
  panelTitle: { margin: "0 0 10px", fontSize: "20px", color: "#0f172a" },
  tableWrap: { overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: "10px" },
  table: { width: "100%", borderCollapse: "collapse", minWidth: "700px" },
  th: { textAlign: "left", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", padding: "10px", fontSize: "13px", color: "#334155" },
  td: { borderBottom: "1px solid #f1f5f9", padding: "10px", fontSize: "14px", color: "#0f172a" },
};
