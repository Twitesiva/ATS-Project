import { useState } from "react";
import * as XLSX from "xlsx";
import { formatCurrency } from "../../utils/reportHelpers";

// All available columns
const ALL_COLUMNS = [
  { key: "client", label: "Client" },
  { key: "recruiter", label: "Recruiter" },
  { key: "candidates", label: "Candidates" },
  { key: "interviews", label: "Interviews" },
  { key: "shortlisted", label: "Shortlisted" },
  { key: "closures", label: "Closures" },
  { key: "revenue", label: "Revenue" },
];

const exportAsCsv = (rows, selectedColumns) => {
  const columns = selectedColumns.length > 0 ? selectedColumns : ALL_COLUMNS;
  const headers = columns.map((col) => col.label);

  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      columns
        .map((col) => {
          let value;
          if (col.key === "recruiter") {
            value = row[col.key] || "-";
          } else if (col.key === "revenue") {
            value = formatCurrency(row[col.key]);
          } else {
            value = row[col.key];
          }
          return `"${String(value ?? "").replaceAll('"', '""')}"`;
        })
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

const exportAsExcel = (rows, selectedColumns) => {
  const columns = selectedColumns.length > 0 ? selectedColumns : ALL_COLUMNS;
  const data = rows.map((row) => {
    const obj = {};
    columns.forEach((col) => {
      if (col.key === "recruiter") {
        obj[col.label] = row[col.key] || "-";
      } else if (col.key === "revenue") {
        obj[col.label] = formatCurrency(row[col.key]);
      } else {
        obj[col.label] = row[col.key];
      }
    });
    return obj;
  });

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Reports");
  XLSX.writeFile(workbook, "reports.xlsx");
};

export default function ReportsTable({ data = [], clients = [], recruiters = [] }) {
  const [selectedColumns, setSelectedColumns] = useState(ALL_COLUMNS);
  const [showColumnFilter, setShowColumnFilter] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  const toggleColumn = (key) => {
    setSelectedColumns((prev) =>
      prev.some((col) => col.key === key)
        ? prev.filter((col) => col.key !== key)
        : [...prev, ALL_COLUMNS.find((col) => col.key === key)]
    );
  };

  const selectAll = () => {
    setSelectedColumns(ALL_COLUMNS);
  };

  const deselectAll = () => {
    setSelectedColumns([]);
  };

  // Filter table data based on search value (search in both client and recruiter)
  const filteredData = data.filter((row) => {
    if (!searchValue.trim()) return true;
    const searchLower = searchValue.toLowerCase();
    const clientMatch = (row.client || "").toLowerCase().includes(searchLower);
    const recruiterMatch = (row.recruiter || "-").toLowerCase().includes(searchLower);
    return clientMatch || recruiterMatch;
  });

  return (
    <div style={styles.wrap}>
      <div style={styles.head}>
        <h4 style={styles.title}>Reports Table</h4>
        <div style={styles.actions}>
          <button
            type="button"
            style={styles.btn}
            onClick={() => setShowColumnFilter(!showColumnFilter)}
          >
            🔧 Select Columns
          </button>
          <button
            type="button"
            style={styles.btn}
            onClick={() => exportAsCsv(filteredData, selectedColumns)}
            disabled={selectedColumns.length === 0}
          >
            Export CSV
          </button>
          <button
            type="button"
            style={styles.btn}
            onClick={() => exportAsExcel(filteredData, selectedColumns)}
            disabled={selectedColumns.length === 0}
          >
            Export Excel
          </button>
        </div>
      </div>

      {/* Column Selection Modal */}
      {showColumnFilter && (
        <div style={styles.filterModal}>
          <div style={styles.filterHeader}>
            <h5 style={styles.filterTitle}>Select Columns to Export</h5>
            <button
              style={styles.closeBtn}
              onClick={() => setShowColumnFilter(false)}
            >
              ✕
            </button>
          </div>
          <div style={styles.filterOptions}>
            {ALL_COLUMNS.map((col) => (
              <label key={col.key} style={styles.label}>
                <input
                  type="checkbox"
                  checked={selectedColumns.some((c) => c.key === col.key)}
                  onChange={() => toggleColumn(col.key)}
                  style={styles.checkbox}
                />
                {col.label}
              </label>
            ))}
          </div>
          <div style={styles.filterActions}>
            <button style={styles.smallBtn} onClick={selectAll}>
              Select All
            </button>
            <button style={styles.smallBtn} onClick={deselectAll}>
              Clear All
            </button>
          </div>
        </div>
      )}

      {/* Separate Table Filter Bar - Search Input */}
      <div style={styles.tableFilterBar}>
        <input
          type="text"
          placeholder="Search Client / Recruiter..."
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          style={styles.searchInput}
        />
        {searchValue && (
          <button
            style={styles.clearSearchBtn}
            onClick={() => setSearchValue("")}
            title="Clear search"
          >
            ✕
          </button>
        )}
        <div style={styles.resultCount}>
          Showing {filteredData.length} of {data.length} rows
        </div>
      </div>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              {selectedColumns.map((col) => (
                <th key={col.key} style={styles.th}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredData.length === 0 ? (
              <tr>
                <td style={styles.td} colSpan={selectedColumns.length}>
                  No matching rows found.
                </td>
              </tr>
            ) : (
            filteredData.map((row, idx) => (
  <tr key={`${row.client}-${row.recruiter || "unknown"}-${idx}`}>
    {selectedColumns.map((col) => (
      <td key={col.key} style={styles.td}>
        {col.key === "recruiter"
          ? row[col.key] || "-"
          : col.key === "revenue"
          ? formatCurrency(row[col.key])
          : row[col.key]}
      </td>
    ))}
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
  filterModal: {
    background: "#f8fafc",
    border: "1px solid #cbd5e1",
    borderRadius: "10px",
    padding: "16px",
    marginBottom: "12px",
  },
  filterHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "12px",
  },
  filterTitle: {
    margin: 0,
    fontSize: "14px",
    color: "#0f172a",
    fontWeight: 600,
  },
  closeBtn: {
    background: "none",
    border: "none",
    fontSize: "20px",
    cursor: "pointer",
    color: "#64748b",
  },
  filterOptions: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: "12px",
    marginBottom: "12px",
  },
  label: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    cursor: "pointer",
    fontSize: "14px",
    color: "#0f172a",
  },
  checkbox: {
    cursor: "pointer",
    width: "16px",
    height: "16px",
  },
  filterActions: {
    display: "flex",
    gap: "8px",
    justifyContent: "flex-end",
  },
  smallBtn: {
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#0f172a",
    padding: "6px 10px",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: 500,
  },
  tableFilterBar: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "12px",
    background: "#f1f5f9",
    border: "1px solid #e2e8f0",
    borderRadius: "10px",
    marginBottom: "12px",
    flexWrap: "wrap",
  },
  searchInput: {
    border: "1px solid #cbd5e1",
    borderRadius: "8px",
    padding: "9px 12px",
    fontSize: "14px",
    background: "#fff",
    flex: 1,
    minWidth: "250px",
    outline: "none",
  },
  clearSearchBtn: {
    border: "none",
    background: "none",
    color: "#dc2626",
    fontSize: "18px",
    cursor: "pointer",
    padding: "4px 8px",
    fontWeight: 600,
  },
  resultCount: {
    fontSize: "13px",
    color: "#64748b",
    fontWeight: 500,
    marginLeft: "auto",
    minWidth: "150px",
    textAlign: "right",
    whiteSpace: "nowrap",
  },
  tableWrap: {
    overflowX: "auto",
    overflowY: "auto",
    border: "1px solid #e2e8f0",
    borderRadius: "10px",
    maxHeight: "600px",
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
    fontWeight: 600,
    position: "sticky",
    top: 0,
    zIndex: 10,
  },
  td: {
    borderBottom: "1px solid #f1f5f9",
    padding: "10px",
    fontSize: "14px",
    color: "#0f172a",
  },
};