const summaryItems = [
  {
    title: "Daily Tracker",
    lastUpdated: "Today",
    description: "Contains each day’s client contact details, follow-up status, and payment terms.",
  },
  {
    title: "Weekly Tracker",
    lastUpdated: "This week",
    description: "Summarizes weekly lead generation, responses, and follow-up actions.",
  },
];

export default function MasterTracker() {
  return (
    <div style={{ padding: "28px 32px", background: "#ffffff", minHeight: "100vh" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: "#0f172a", fontSize: 24, fontWeight: 700, margin: 0 }}>Master Tracker</h1>
        <p style={{ color: "#475569", margin: "4px 0 0", fontSize: 13 }}>
          Use the master tracker for an overview of daily and weekly BDE activity.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 24 }}>
        {summaryItems.map((item) => (
          <div key={item.title} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20 }}>
            <h3 style={{ color: "#0f172a", margin: 0, fontSize: 16 }}>{item.title}</h3>
            <p style={{ color: "#475569", fontSize: 13, margin: "8px 0 0" }}>{item.description}</p>
            <div style={{ marginTop: 12, color: "#64748b", fontSize: 12 }}>Last updated: {item.lastUpdated}</div>
          </div>
        ))}
      </div>

      <div style={{ background: "#f8fafc", borderRadius: 12, overflowX: "auto", border: "1px solid #e2e8f0" }}>
        <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f1f5f9" }}>
              {[
                "S.No",
                "Date",
                "Source",
                "Client",
                "Type",
                "Updates",
                "Status",
                "Status from TA",
                "Hire Mode",
                "SPOC Name",
                "Mobile",
                "Mail",
                "Payment Terms",
              ].map((heading) => (
                <th key={heading} style={{ color: "#475569", padding: "12px 14px", textAlign: "left", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderTop: "1px solid #e2e8f0" }}>
              <td colSpan={13} style={{ padding: "24px 14px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                No records found.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
