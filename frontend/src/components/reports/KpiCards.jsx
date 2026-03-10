import { formatCurrency } from "../../utils/reportHelpers";

export default function KpiCards({ stats }) {
  const cards = [
    { label: "Total Candidates", value: stats.totalCandidates || 0 },
    { label: "Interviews Scheduled", value: stats.interviewsScheduled || 0 },
    { label: "Shortlisted", value: stats.shortlisted || 0 },
    { label: "Closures", value: stats.closures || 0 },
    { label: "Revenue", value: formatCurrency(stats.revenue || 0) },
  ];

  return (
    <div style={styles.grid}>
      {cards.map((card) => (
        <div key={card.label} style={styles.card}>
          <p style={styles.label}>{card.label}</p>
          <p style={styles.value}>{card.value}</p>
        </div>
      ))}
    </div>
  );
}

const styles = {
  grid: {
    display: "grid",
    gap: "12px",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  },
  card: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    padding: "14px",
  },
  label: {
    margin: 0,
    fontSize: "13px",
    color: "#64748b",
    fontWeight: 600,
  },
  value: {
    margin: "8px 0 0",
    fontSize: "28px",
    fontWeight: 700,
    color: "#0f172a",
    lineHeight: 1.1,
  },
};