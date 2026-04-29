// Fixed
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export default function RecruiterPerformanceChart({ data = [] }) {
  return (
    <div style={styles.card}>
      <h4 style={styles.title}>Recruiter Performance</h4>
      <div style={styles.chartWrap}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="recruiter" angle={-45} textAnchor="end" height={70} tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="candidates" fill="#1e40af" name="Candidates" />
            <Bar dataKey="interviews" fill="#f59e0b" name="Interviews" />
            <Bar dataKey="closures" fill="#10b981" name="Closures" />
          </BarChart>
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