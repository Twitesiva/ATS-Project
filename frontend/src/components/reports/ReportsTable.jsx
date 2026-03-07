import * as XLSX from "xlsx";
import { formatCurrency } from "../../utils/reportHelpers";

const exportAsCsv = (rows) => {
  const headers = [
    "Client",
    "Recruiter",
    "Candidates",
    "Interviews",
    "Shortlisted",
    "Closures",
    "Revenue",
  ];

  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      [
        row.client,
        row.recruiter || "-",
        row.candidates,
        row.interviews,
        row.shortlisted,
        row.closures,
        row.revenue,
      ]
        .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
        .join(",")
    ),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "reports.csv";
  link.click();
  URL.revokeObjectURL(url);
};

const exportAsExcel = (rows) => {
  const worksheet = XLSX.utils.json_to_sheet(
    rows.map((row) => ({
      Client: row.client,
      Recruiter: row.recruiter || "-",
      Candidates: row.candidates,
      Interviews: row.interviews,
      Shortlisted: row.shortlisted,
      Closures: row.closures,
      Revenue: row.revenue,
    }))
  );

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Reports");
  XLSX.writeFile(workbook, "reports.xlsx");
};

export default function ReportsTable({ data = [] }) {
  return (
    <div style={styles.wrap}>
      <div style={styles.head}>
        <h4 style={styles.title}>Reports Table</h4>
        <div style={styles.actions}>
          <button type="button" style={styles.btn} onClick={() => exportAsCsv(data)}>
            Export CSV
          </button>
          <button type="button" style={styles.btn} onClick={() => exportAsExcel(data)}>
            Export Excel
          </button>
        </div>
      </div>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Client</th>
              <th style={styles.th}>Recruiter</th>
              <th style={styles.th}>Candidates</th>
              <th style={styles.th}>Interviews</th>
              <th style={styles.th}>Shortlisted</th>
              <th style={styles.th}>Closures</th>
              <th style={styles.th}>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td style={styles.td} colSpan={7}>
                  No report rows found.
                </td>
              </tr>
            ) : (
              data.map((row, idx) => (
                <tr key={`${row.client}-${row.recruiter || idx}`}>
                  <td style={styles.td}>{row.client}</td>
                  <td style={styles.td}>{row.recruiter || "-"}</td>
                  <td style={styles.td}>{row.candidates}</td>
                  <td style={styles.td}>{row.interviews}</td>
                  <td style={styles.td}>{row.shortlisted}</td>
                  <td style={styles.td}>{row.closures}</td>
                  <td style={styles.td}>{formatCurrency(row.revenue)}</td>
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
  wrap: {
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    background: "#fff",
    padding: "14px",
  },
  head: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    marginBottom: "10px",
    flexWrap: "wrap",
  },
  title: {
    margin: 0,
    fontSize: "16px",
    color: "#0f172a",
  },
  actions: {
    display: "flex",
    gap: "8px",
  },
  btn: {
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#0f172a",
    padding: "8px 12px",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: 600,
  },
  tableWrap: {
    overflowX: "auto",
    border: "1px solid #e2e8f0",
    borderRadius: "10px",
  },
  table: {
    width: "100%",
    minWidth: "760px",
    borderCollapse: "collapse",
  },
  th: {
    background: "#f8fafc",
    borderBottom: "1px solid #e2e8f0",
    textAlign: "left",
    padding: "10px",
    fontSize: "13px",
    color: "#334155",
  },
  td: {
    borderBottom: "1px solid #f1f5f9",
    padding: "10px",
    fontSize: "14px",
    color: "#0f172a",
  },
};