const sampleRows = [
  {
    week: "14, 02/04",
    bdName: "Sweety",
    newClients: 0,
    totalLeadGeneration: 4,
    newLeadsEmail: 1,
    newLeadsPhone: 1,
    newLeadsLinkedIn: 2,
    responsesReceived: 1,
    followUps: 0,
    clientMeet: 0,
    remarks: "",
  },
];

export default function WeeklyTracker() {
  return (
    <div style={{ padding: "28px 32px", background: "#ffffff", minHeight: "100vh" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: "#0f172a", fontSize: 24, fontWeight: 700, margin: 0 }}>Weekly Tracker</h1>
        <p style={{ color: "#475569", margin: "4px 0 0", fontSize: 13 }}>
          Track weekly BDE lead generation and client activities.
        </p>
      </div>

      <div style={{ background: "#f8fafc", borderRadius: 12, overflowX: "auto", border: "1px solid #e2e8f0" }}>
        <table style={{ width: "100%", minWidth: 1000, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f1f5f9" }}>
              {["Week", "BD Name", "New Clients Acquired", "Total Lead Generation", "New Leads via Email", "New Leads via Phone", "New Leads via LinkedIn", "Responses Received", "To do Follow-ups", "Client Meet", "Remarks"].map((heading) => (
                <th key={heading} style={{ color: "#475569", padding: "12px 14px", textAlign: "left", fontSize: 12, fontWeight: 600 }}>{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sampleRows.map((row, index) => (
              <tr key={index} style={{ borderTop: "1px solid #e2e8f0" }}>
                <td style={{ padding: "12px 14px", color: "#475569", fontSize: 13 }}>{row.week}</td>
                <td style={{ padding: "12px 14px", color: "#0f172a", fontSize: 13, fontWeight: 600 }}>{row.bdName}</td>
                <td style={{ padding: "12px 14px", color: "#475569", fontSize: 13 }}>{row.newClients}</td>
                <td style={{ padding: "12px 14px", color: "#475569", fontSize: 13 }}>{row.totalLeadGeneration}</td>
                <td style={{ padding: "12px 14px", color: "#475569", fontSize: 13 }}>{row.newLeadsEmail}</td>
                <td style={{ padding: "12px 14px", color: "#475569", fontSize: 13 }}>{row.newLeadsPhone}</td>
                <td style={{ padding: "12px 14px", color: "#475569", fontSize: 13 }}>{row.newLeadsLinkedIn}</td>
                <td style={{ padding: "12px 14px", color: "#475569", fontSize: 13 }}>{row.responsesReceived}</td>
                <td style={{ padding: "12px 14px", color: "#475569", fontSize: 13 }}>{row.followUps}</td>
                <td style={{ padding: "12px 14px", color: "#475569", fontSize: 13 }}>{row.clientMeet}</td>
                <td style={{ padding: "12px 14px", color: "#475569", fontSize: 13 }}>{row.remarks || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
