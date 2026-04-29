export default function FiltersBar({
  filters,
  onChange,
  onApply,
  onReset,
  clients = [],
  recruiters = [],
  statuses = [],
  quickFilter,
  onQuickFilter,
}) { 
  return (
    <div style={styles.wrap}>
      <div style={styles.grid}>
        <input
          type="date"
          value={filters.fromDate || ""}
          onChange={(e) => onChange("fromDate", e.target.value)}
          style={styles.input}
        />

        <input
          type="date"
          value={filters.toDate || ""}
          onChange={(e) => onChange("toDate", e.target.value)}
          style={styles.input}
        />
        <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
          <button
            onClick={() => onQuickFilter("")}
            style={quickFilter === "" ? activeBtn : btn}
          >
            All
          </button>

          <button
            onClick={() => onQuickFilter("manager")}
            style={quickFilter === "manager" ? activeBtn : btn}
          >
            Manager
          </button>
        </div>

        {/* Client / Recruiter */}
        <div style={styles.combinedFilterContainer}>
          <select
            value={filters.filterType || "client"}
            onChange={(e) => {
              onChange("filterType", e.target.value);
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
              {filters.filterType === "recruiter"
                ? "All Recruiters"
                : "All Clients"}
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

      {/* CLEAN BUTTONS */}
      <div style={styles.actions}>
        <button style={styles.primaryBtn} onClick={onApply}>
          Apply
        </button>

        <button style={styles.secondaryBtn} onClick={onReset}>
          Reset
        </button>
      </div>
    </div>
  );
}
const btn = {
  padding: "8px 12px",
  borderRadius: "8px",
  border: "1px solid #ccc",
  background: "#fff",
  cursor: "pointer",
};

const activeBtn = {
  ...btn,
  background: "#2563eb",
  color: "#fff",
  fontWeight: "bold",
};
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
    border: "1px solid #cbd5e1",
    borderRadius: "8px",
    padding: "9px 10px",
  },
  combinedFilterContainer: {
    display: "grid",
    gridTemplateColumns: "120px 1fr",
    gap: "8px",
  },
  filterTypeSelect: {
    border: "1px solid #cbd5e1",
    borderRadius: "8px",
    padding: "9px 10px",
  },
  filterValueSelect: {
    border: "1px solid #cbd5e1",
    borderRadius: "8px",
    padding: "9px 10px",
  },
  actions: {
    display: "flex",
    gap: "10px",
    justifyContent: "flex-end",
  },
  primaryBtn: {
    background: "#2563eb",
    color: "#fff",
    border: "none",
    padding: "8px 14px",
    borderRadius: "8px",
    cursor: "pointer",
  },
  secondaryBtn: {
    border: "1px solid #cbd5e1",
    background: "#fff",
    padding: "8px 14px",
    borderRadius: "8px",
    cursor: "pointer",
  },
};