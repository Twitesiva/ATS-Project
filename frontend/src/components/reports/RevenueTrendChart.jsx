import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function RevenueTrendChart({ data = [] }) {
  return (
    <div style={styles.card}>
      <h4 style={styles.title}>Revenue Trend</h4>

      <div style={styles.chartWrap}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />

            <XAxis dataKey="month" />

            <YAxis />

            <Tooltip />

            <Line
              type="monotone"
              dataKey="revenue"
              stroke="#3b82f6"
              strokeWidth={3}
            />
          </LineChart>
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