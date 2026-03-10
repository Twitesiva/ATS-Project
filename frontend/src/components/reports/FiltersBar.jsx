export default function FiltersBar({
  filters,
  onChange,
  onApply,
  onReset,
  clients = [],
  recruiters = [],
  statuses = [],
  showRecruiterFilter = false,
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

        <select
          value={filters.client || ""}
          onChange={(e) => onChange("client", e.target.value)}
          style={styles.input}
        >
          <option value="">All Clients</option>
          {clients.map((client) => (
            <option key={client} value={client}>
              {client}
            </option>
          ))}
        </select>

        {showRecruiterFilter && (
          <select
            value={filters.recruiter || ""}
            onChange={(e) => onChange("recruiter", e.target.value)}
            style={styles.input}
          >
            <option value="">All Recruiters</option>
            {recruiters.map((recruiter) => (
              <option key={recruiter} value={recruiter}>
                {recruiter}
              </option>
            ))}
          </select>
        )}

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