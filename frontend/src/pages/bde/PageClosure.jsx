import { useState, useEffect } from "react";
import { supabase } from "../../services/supabaseClient";
import { useAuth } from "../../context/AuthContext";

const inputStyle = {
  background: "#ffffff", border: "1px solid #d1d5db",
  color: "#0f172a", padding: "9px 12px", borderRadius: 8,
  fontSize: 13, boxSizing: "border-box", cursor: "pointer",
};

const OFFER_STATUS_COLORS = {
  Offered: "#4e8ef7",
  Accepted: "#4ef7a4",
  Rejected: "#f74e4e",
  Pending: "#f7a44e",
  Joined: "#c97ef7",
};

const STATUS_COLORS = {
  Active: "#4ef7a4",
  Inactive: "#f74e4e",
  Absconded: "#f7a44e",
};

const Badge = ({ text, colorMap }) => {
  const color = colorMap?.[text] || "#8892a4";
  return (
    <span style={{
      background: `${color}22`, color, border: `1px solid ${color}55`,
      borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600,
    }}>{text || "—"}</span>
  );
};

const SummaryCard = ({ label, value, sub, color }) => (
  <div style={{
    background: "#ffffff", borderRadius: 12, padding: "20px 24px",
    flex: 1, minWidth: 160, border: "1px solid #e2e8f0",
  }}>
    <div style={{ color: "#475569", fontSize: 12, marginBottom: 6 }}>{label}</div>
    <div style={{ color: "#0f172a", fontSize: 24, fontWeight: 700 }}>{value}</div>
    {sub && <div style={{ color: color, fontSize: 11, marginTop: 4 }}>{sub}</div>}
  </div>
);

function getMonthOptions(data) {
  const set = new Set();
  data.forEach((r) => {
    if (r.doj) {
      const d = new Date(r.doj);
      set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
  });
  return [...set].sort().reverse();
}

function fmtCurrency(n) {
  if (n == null) return "—";
  return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export default function PageClosure() {
  const [allData, setAllData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [monthFilter, setMonthFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const { user } = useAuth();
useEffect(() => {
  const load = async () => {
    setLoading(true);

    const { data: revenue, error: revenueError } = await supabase
      .from("revenue_tracker")
      .select("*")
      .eq("bd_name", user?.name || "")
      .order("doj", { ascending: false });

    if (revenueError) {
      console.error("Failed to fetch revenue:", revenueError);
      setLoading(false);
      return;
    }

    setAllData(revenue || []);
    setLoading(false);
  };

  if (user?.name) load();
}, [user?.name]);

  const monthOptions = getMonthOptions(allData);

  const displayed = allData.filter((r) => {
    if (monthFilter) {
      const d = new Date(r.doj);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (ym !== monthFilter) return false;
    }
    if (statusFilter && r.offer_status !== statusFilter) return false;
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      return (
        r.client_name?.toLowerCase().includes(q) ||
        r.candidate_name?.toLowerCase().includes(q) ||
        r.recruiter_name?.toLowerCase().includes(q) ||
        r.position?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalClosures = displayed.length;
  const totalBilling = displayed.reduce((s, r) => s + (r.billing_rate || 0), 0);
  const totalMargin = displayed.reduce((s, r) => s + (r.margin_value || 0), 0);
  const avgMarginPct = displayed.length
    ? (displayed.reduce((s, r) => s + (r.margin_percent || 0), 0) / displayed.length).toFixed(1)
    : 0;

  return (
    <div style={{ padding: "28px 32px", background: "#ffffff", minHeight: "100vh" }}>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: "#0f172a", fontSize: 24, fontWeight: 700, margin: 0 }}>Page Closures</h1>
        <p style={{ color: "#475569", margin: "4px 0 0", fontSize: 13 }}>
          Revenue entries for your converted clients
        </p>
      </div>

      <div style={{ display: "flex", gap: 16, marginBottom: 28, flexWrap: "wrap" }}>
        <SummaryCard label="Total Closures" value={totalClosures} sub="entries matched" color="#4e8ef7" />
        <SummaryCard label="Total Billing" value={fmtCurrency(totalBilling)} sub="billing rate sum" color="#4ef7a4" />
        <SummaryCard label="Total Margin" value={fmtCurrency(totalMargin)} sub="margin value sum" color="#c97ef7" />
        <SummaryCard label="Avg Margin %" value={`${avgMarginPct}%`} sub="across closures" color="#f7a44e" />
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <input
          placeholder="Search client, candidate, recruiter..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          style={{ ...inputStyle, width: 260 }}
        />
        <select
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          style={{ ...inputStyle, width: 160 }}
        >
          <option value="">All Months</option>
          {monthOptions.map((m) => {
            const [y, mo] = m.split("-");
            const label = new Date(y, mo - 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
            return <option key={m} value={m}>{label}</option>;
          })}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ ...inputStyle, width: 160 }}
        >
          <option value="">All Offer Status</option>
          {Object.keys(OFFER_STATUS_COLORS).map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        {(monthFilter || searchFilter || statusFilter) && (
          <button
            onClick={() => { setMonthFilter(""); setSearchFilter(""); setStatusFilter(""); }}
            style={{ ...inputStyle, background: "#e2e8f0", color: "#0f172a", border: "none", cursor: "pointer" }}
          >
            Clear
          </button>
        )}
      </div>

      <div style={{ background: "#ffffff", borderRadius: 12, overflowX: "auto", border: "1px solid #e2e8f0" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {[
                "SL", "DOJ", "Client", "Candidate", "Recruiter",
                "Position", "Location", "Hire", "CTC", "Offered CTC",
                "Billing Rate", "Margin Value", "Margin %", "Offer Status", "Status",
              ].map((h) => (
                <th key={h} style={{
                  color: "#475569", padding: "12px 12px", textAlign: "left",
                  fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={15} style={{ color: "#8892a4", textAlign: "center", padding: 48 }}>
                  Loading closures…
                </td>
              </tr>
            ) : displayed.length === 0 ? (
              <tr>
                <td colSpan={15} style={{ color: "#8892a4", textAlign: "center", padding: 48 }}>
                  {allData.length === 0
                    ? "No revenue entries found for your clients yet."
                    : "No results match your filters."}
                </td>
              </tr>
            ) : displayed.map((row, i) => (
              <tr key={row.id} style={{ borderTop: "1px solid #e2e8f0" }}>
                <td style={{ padding: "12px 12px", color: "#475569", fontSize: 13, width: 36 }}>{i + 1}</td>
                <td style={{ padding: "12px 12px", color: "#475569", fontSize: 13, whiteSpace: "nowrap" }}>
                  {row.doj ? new Date(row.doj).toLocaleDateString("en-IN") : "—"}
                </td>
                <td style={{ padding: "12px 12px" }}>
                  <div style={{ color: "#0f172a", fontWeight: 600, fontSize: 13 }}>{row.client_name}</div>
                </td>
                <td style={{ padding: "12px 12px" }}>
                  <div style={{ color: "#475569", fontSize: 13 }}>{row.candidate_name}</div>
                </td>
                <td style={{ padding: "12px 12px", color: "#475569", fontSize: 13 }}>{row.recruiter_name}</td>
                <td style={{ padding: "12px 12px", color: "#475569", fontSize: 13 }}>{row.position || "—"}</td>
                <td style={{ padding: "12px 12px", color: "#475569", fontSize: 12 }}>{row.location || "—"}</td>
                <td style={{ padding: "12px 12px", color: "#475569", fontSize: 12 }}>{row.hire || "—"}</td>
                <td style={{ padding: "12px 12px", color: "#4ef7a4", fontSize: 13, fontWeight: 600 }}>{fmtCurrency(row.ctc)}</td>
                <td style={{ padding: "12px 12px", color: "#4ef7a4", fontSize: 13, fontWeight: 600 }}>{fmtCurrency(row.offered_ctc)}</td>
                <td style={{ padding: "12px 12px", color: "#4ef7a4", fontSize: 13, fontWeight: 600 }}>{fmtCurrency(row.billing_rate)}</td>
                <td style={{ padding: "12px 12px", color: "#c97ef7", fontSize: 13, fontWeight: 600 }}>{fmtCurrency(row.margin_value)}</td>
                <td style={{ padding: "12px 12px", color: "#f7a44e", fontSize: 13, fontWeight: 600 }}>
                  {row.margin_percent != null ? `${Number(row.margin_percent).toFixed(1)}%` : "—"}
                </td>
                <td style={{ padding: "12px 12px" }}>
                  <Badge text={row.offer_status} colorMap={OFFER_STATUS_COLORS} />
                </td>
                <td style={{ padding: "12px 12px" }}>
                  <Badge text={row.status} colorMap={STATUS_COLORS} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!loading && displayed.length > 0 && (
        <div style={{ color: "#556070", fontSize: 12, marginTop: 12, textAlign: "right" }}>
          Showing {displayed.length} of {allData.length} closure{allData.length !== 1 ? "s" : ""}
        </div>
      )}

    </div>
  );
}