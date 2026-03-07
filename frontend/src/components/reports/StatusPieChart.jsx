import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

const COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2"];

export default function StatusPieChart({ data = [] }) {
  return (
    <div style={styles.card}>
      <h4 style={styles.title}>Status Distribution</h4>
      <div style={styles.chartWrap}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" outerRadius={100}>
              {data.map((entry, index) => (
                <Cell key={`${entry.name}-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const styles = {
  card: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    padding: "14px",
  },
  title: {
    margin: "0 0 10px",
    fontSize: "16px",
    color: "#0f172a",
  },
  chartWrap: {
    width: "100%",
    height: "300px",
  },
};