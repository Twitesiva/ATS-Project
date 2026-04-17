export default function FiltersBar({
  filters,
  onChange,
  onApply,
  onReset,
  clients = [],
  recruiters = [],
  statuses = [],
}) {
  return (
    <div style={styles.wrap}>
      <div style={styles.grid}>
        <input
          type="date"
          value={filters.fromDate || ""}
          onChange={(e) => onChange("fromDate", e.target.value)}
          style={styles.input}
          placeholder="From Date"
        />

        <input
          type="date"
          value={filters.toDate || ""}
          onChange={(e) => onChange("toDate", e.target.value)}
          style={styles.input}
          placeholder="To Date"
        />

        {/* Combined Client/Recruiter Filter */}
        <div style={styles.combinedFilterContainer}>
          <select
            value={filters.filterType || "client"}
            onChange={(e) => {
              onChange("filterType", e.target.value);
              // Clear the search value when switching types
              onChange("filterValue", "");
            }}
            style={styles.filterTypeSelect}
          >
            <option value="client">Client</option>
            <option value="recruiter">Recruiter</option>
          </select>

          <select
            value={filters.filterValue || ""}
            onChange={(e) => onChange("filterValue", e.target.value)}
            style={styles.filterValueSelect}
          >
            <option value="">
              {filters.filterType === "recruiter" ? "All Recruiters" : "All Clients"}
            </option>
            {(filters.filterType === "recruiter" ? recruiters : clients).map(
              (item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              )
            )}
          </select>
        </div>

        <select
          value={filters.status || ""}
          onChange={(e) => onChange("status", e.target.value)}
          style={styles.input}
        >
          <option value="">All Status</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      <div style={styles.actions}>
        <button type="button" style={styles.primaryBtn} onClick={onApply}>
          Apply
        </button>
        <button type="button" style={styles.secondaryBtn} onClick={onReset}>
          Reset
        </button>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    padding: "14px",
    background: "#fff",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  grid: {
    display: "grid",
    gap: "10px",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  },
  input: {
    width: "100%",
    border: "1px solid #cbd5e1",
    borderRadius: "8px",
    padding: "9px 10px",
    fontSize: "14px",
    boxSizing: "border-box",
    background: "#fff",
  },
  combinedFilterContainer: {
    display: "grid",
    gridTemplateColumns: "120px 1fr",
    gap: "8px",
    width: "100%",
  },
  filterTypeSelect: {
    border: "1px solid #cbd5e1",
    borderRadius: "8px",
    padding: "9px 10px",
    fontSize: "14px",
    boxSizing: "border-box",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 500,
  },
  filterValueSelect: {
    border: "1px solid #cbd5e1",
    borderRadius: "8px",
    padding: "9px 10px",
    fontSize: "14px",
    boxSizing: "border-box",
    background: "#fff",
    cursor: "pointer",
  },
  actions: {
    display: "flex",
    gap: "8px",
    justifyContent: "flex-end",
  },
  primaryBtn: {
    border: "none",
    background: "#2563eb",
    color: "#fff",
    borderRadius: "8px",
    padding: "8px 14px",
    fontWeight: 600,
    cursor: "pointer",
  },
  secondaryBtn: {
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#0f172a",
    borderRadius: "8px",
    padding: "8px 14px",
    fontWeight: 600,
    cursor: "pointer",
  },
};