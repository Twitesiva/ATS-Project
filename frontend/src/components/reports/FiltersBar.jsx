export default function FiltersBar({
  filters,
  onChange,
  onApply,
  onReset,
  clients = [],
  recruiters = [],
  assignedRecruiters = [],   // ← new: TL's scoped recruiter list
  statuses = [],
  bdes = [],
  managers = [],
  showRecruiterFilter = false,
  extraFilterTypes = [],
  showStatusFilter = true,
}) {
  const filterTypes = [
    { value: "client", label: "Client" },
    ...(showRecruiterFilter ? [{ value: "recruiter", label: "Recruiter" }] : []),
    ...(extraFilterTypes || []),
  ];

  const valueLabel =
    filters.filterType === "recruiter"
      ? "All Recruiters"
      : filters.filterType === "manager"
        ? "All Managers"
        : filters.filterType === "bde"
          ? "All BDE"
          : "All Clients";

  // ── key change: when filterType is "recruiter", prefer assignedRecruiters
  // if provided (TL portal), otherwise fall back to recruiters (other portals)
  const valueOptions =
    filters.filterType === "recruiter"
      ? (assignedRecruiters.length ? assignedRecruiters : recruiters)
      : filters.filterType === "manager"
        ? managers
        : filters.filterType === "bde"
          ? bdes
          : clients;

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

        {/* Client / Recruiter */}
        <div style={styles.combinedFilterContainer}>
          <select
            value={filters.filterType || "client"}
            onChange={(e) => {
              onChange("filterType", e.target.value);
              onChange("filterValue", ""); // clear value on type switch
            }}
            style={styles.filterTypeSelect}
          >
            {filterTypes.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>

          <select
            value={filters.filterValue || ""}
            onChange={(e) => onChange("filterValue", e.target.value)}
            style={styles.filterValueSelect}
          >
            <option value="">{valueLabel}</option>
            {valueOptions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <select
          value={filters.status || ""}
          onChange={(e) => onChange("status", e.target.value)}
          style={{ ...styles.input, display: showStatusFilter ? "block" : "none" }}
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