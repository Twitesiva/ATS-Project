import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chart, registerables } from "chart.js";
import Loader from "../../components/common/Loader";
import FiltersBar from "../../components/reports/FiltersBar";
import RevenueTrendChart from "../../components/reports/RevenueTrendChart";
import RecruiterPerformanceChart from "../../components/reports/RecruiterPerformanceChart";
import StatusPieChart from "../../components/reports/StatusPieChart";
import HiringFunnelChart from "../../components/reports/HiringFunnelChart";
import ClientPerformanceChart from "../../components/reports/ClientPerformanceChart";
import {
  getRevenueTrend,
  getRecruiterPerformanceAnalytics,
  getClientPerformance,
  getStatusDistribution,
  getHiringFunnel,
  getFilterOptions,
} from "../../services/reportsService";
import { groupByMonth } from "../../utils/reportHelpers";
import { supabase } from "../../services/supabaseClient";
import { getRoleQueryValues } from "../../utils/roles";

Chart.register(...registerables);

// ─── BDE Bar Chart ────────────────────────────────────────────────────────────
const BDE_STAGES = [
  { key: "leads",     label: "Leads" },
  { key: "responses", label: "Responses" },
  { key: "followUps", label: "Follow-ups" },
  { key: "meets",     label: "Meets" },
];

function BDEBarChart({ bdeMetrics }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  const stages = useMemo(
    () => BDE_STAGES.map((s) => ({
      ...s,
      value: Number(bdeMetrics?.[s.key] || 0),
    })),
    [bdeMetrics]
  );

  const maxVal = useMemo(
    () => Math.max(1, ...stages.map((s) => s.value)),
    [stages]
  );

  useEffect(() => {
    if (!canvasRef.current) return;
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: "bar",
      data: {
        labels:   stages.map((s) => s.label),
        datasets: [{
          data:            stages.map((s) => s.value),
          backgroundColor: ["#378ADD", "rgba(55,138,221,0.65)", "rgba(55,138,221,0.45)", "rgba(55,138,221,0.3)"],
          borderWidth:     0,
          borderRadius:    8,
          barThickness:    52,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `Value: ${c.parsed.y}` } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: "#64748b", font: { size: 12 } } },
          y: { beginAtZero: true, suggestedMax: Math.ceil((maxVal * 1.2) / 5) * 5, grid: { color: "#eef2f7" }, ticks: { color: "#64748b" } },
        },
        layout: { padding: { top: 4, bottom: 0, left: 4, right: 4 } },
      },
    });
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [stages, maxVal]);

  return (
    <div style={{ position: "relative", width: "100%", height: "260px" }}>
      <canvas ref={canvasRef} role="img" aria-label="BDE analytics chart" />
    </div>
  );
}

// ─── BDE KPI Tile ─────────────────────────────────────────────────────────────
function ChannelPieChart({ channel }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  const data = useMemo(() => ([
    { label: "Email",    value: Number(channel?.email || 0),    color: "#378ADD" },
    { label: "LinkedIn", value: Number(channel?.linkedin || 0), color: "#1D9E75" },
    { label: "Phone",    value: Number(channel?.phone || 0),    color: "#EF9F27" },
  ]), [channel]);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (chartRef.current) chartRef.current.destroy();

    chartRef.current = new Chart(canvasRef.current, {
      type: "doughnut",
      data: {
        labels: data.map((d) => d.label),
        datasets: [{
          data: data.map((d) => d.value),
          backgroundColor: data.map((d) => d.color),
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top", labels: { boxWidth: 10, color: "#0f172a" } },
          tooltip: { callbacks: { label: (c) => `${c.label}: ${c.parsed}` } },
        },
        cutout: "62%",
      },
    });

    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [data]);

  return (
    <div style={{ position: "relative", width: "100%", height: "260px" }}>
      <canvas ref={canvasRef} role="img" aria-label="Channel breakdown pie chart" />
    </div>
  );
}

function BDEKpiTile({ label, value, color = "#0f172a", active, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        border:       `2px solid ${active ? "#378ADD" : "#e2e8f0"}`,
        borderRadius: "12px",
        padding:      "14px 18px",
        cursor:       "pointer",
        background:   active ? "#EFF6FF" : "#fff",
        transition:   "all 0.15s",
        minWidth:     "140px",
      }}
    >
      <p style={{ margin: 0, fontSize: "11px", fontWeight: 700, color: "#64748b", letterSpacing: "0.05em", textTransform: "uppercase" }}>
        {label}
      </p>
      <p style={{ margin: "6px 0 0", fontSize: "28px", fontWeight: 700, color }}>
        {value}
      </p>
    </div>
  );
}

// ─── BDE Dashboard View ───────────────────────────────────────────────────────
function BDEDashboardView({ bdeMetrics, bdeSummary, bdeRecords, fromDate, toDate }) {
  const [activeKpi, setActiveKpi] = useState(null); // null | "leads" | "clients" | "closures" | "responses" | "followUps" | "meets"

  const totalClients  = bdeSummary.reduce((a, r) => a + r.clients,    0);
  const totalClosures = bdeSummary.reduce((a, r) => a + r.closures,   0);
  const totalLeads    = bdeSummary.reduce((a, r) => a + r.totalLeads, 0);

  const kpis = [
    { key: "leads",     label: "Total Leads",   value: totalLeads,              color: "#0f172a" },
    { key: "responses", label: "Responses",      value: bdeMetrics.responses,    color: "#0C447C" },
    { key: "followUps", label: "Follow-ups",     value: bdeMetrics.followUps,    color: "#0C447C" },
    { key: "meets",     label: "Meets",          value: bdeMetrics.meets,        color: "#0C447C" },
    { key: "clients",   label: "Clients Won",    value: totalClients,            color: "#085041" },
    { key: "closures",  label: "Closures",       value: totalClosures,           color: "#085041" },
  ];

  // Records to show under the clicked KPI
  const visibleRecords = useMemo(() => {
    if (!activeKpi) return [];
    if (activeKpi === "leads")    return bdeSummary.map((r) => ({ bde: r.bde, value: r.totalLeads,  label: "Leads" }));
    if (activeKpi === "clients")  return bdeSummary.map((r) => ({ bde: r.bde, value: r.clients,     label: "Clients" }));
    if (activeKpi === "closures") return bdeSummary.map((r) => ({ bde: r.bde, value: r.closures,    label: "Closures" }));
    // responses / followUps / meets — show per-company records if available
    return (bdeRecords[activeKpi] || []);
  }, [activeKpi, bdeSummary, bdeRecords]);

  const handleKpiClick = (key) => setActiveKpi((cur) => (cur === key ? null : key));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* ── KPI Tiles ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
        {kpis.map((k) => (
          <BDEKpiTile
            key={k.key}
            label={k.label}
            value={k.value}
            color={k.color}
            active={activeKpi === k.key}
            onClick={() => handleKpiClick(k.key)}
          />
        ))}
      </div>

      {/* ── Records table (shown when a KPI is clicked) ── */}
      {activeKpi && (
        <section style={styles.panel}>
          <h3 style={{ ...styles.panelTitle, fontSize: "15px" }}>
            {kpis.find((k) => k.key === activeKpi)?.label} — Records
          </h3>
          {visibleRecords.length === 0 ? (
            <p style={{ color: "#64748b", fontSize: "14px" }}>No records found.</p>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    {activeKpi === "leads" || activeKpi === "clients" || activeKpi === "closures" ? (
                      <>
                        <th style={styles.th}>BDE Name</th>
                        <th style={styles.th}>{kpis.find((k) => k.key === activeKpi)?.label}</th>
                      </>
                    ) : (
                      <>
                        <th style={styles.th}>Company</th>
                        <th style={styles.th}>BDE</th>
                        <th style={styles.th}>Date</th>
                        <th style={styles.th}>Status</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {visibleRecords.map((row, i) => (
                    <tr key={i}>
                      {activeKpi === "leads" || activeKpi === "clients" || activeKpi === "closures" ? (
                        <>
                          <td style={styles.td}>{getNameFromEmail(row.bde)}</td>
                          <td style={styles.td}>{row.value}</td>
                        </>
                      ) : (
                        <>
                          <td style={styles.td}>{row.company || "-"}</td>
                          <td style={styles.td}>{getNameFromEmail(row.bde || "-")}</td>
                          <td style={styles.td}>{row.date ? formatDate(row.date) : "-"}</td>
                          <td style={styles.td}>{row.status || "-"}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ── Charts row ── */}
      <div style={styles.grid2}>
        {/* Bar chart */}
        <div style={{ ...styles.panel, background: "#f8fafc" }}>
          <p style={{ margin: "0 0 12px", fontSize: "11px", fontWeight: 700, color: "#334155", letterSpacing: "0.06em" }}>
            LEADS · RESPONSES · FOLLOW-UPS · MEETS
          </p>
          <BDEBarChart bdeMetrics={{ ...bdeMetrics, leads: totalLeads }} />
        </div>

        {/* BDE breakdown table */}
        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>BDE Team Breakdown</h3>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>BDE Name</th>
                  <th style={styles.th}>Leads</th>
                  <th style={styles.th}>Clients</th>
                  <th style={styles.th}>Closures</th>
                </tr>
              </thead>
              <tbody>
                {bdeSummary.length === 0 ? (
                  <tr><td style={styles.td} colSpan={4}>No BDE data found.</td></tr>
                ) : (
                  <>
                    {bdeSummary.map((row) => (
                      <tr key={row.bde}>
                        <td style={styles.td}>{getNameFromEmail(row.bde)}</td>
                        <td style={styles.td}>{row.totalLeads}</td>
                        <td style={styles.td}>{row.clients}</td>
                        <td style={styles.td}>{row.closures}</td>
                      </tr>
                    ))}
                    <tr style={{ background: "#f8fafc", fontWeight: 700 }}>
                      <td style={styles.td}>Total</td>
                      <td style={styles.td}>{totalLeads}</td>
                      <td style={styles.td}>{totalClients}</td>
                      <td style={styles.td}>{totalClosures}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ BDE General Tracker View (non-weekly) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function BDEGeneralTrackerView({ bdeGeneral, bdeMetrics, bdeRecords, bdeCompanyRows, bdeClientCompanyIds, bdeRevenueTrend, bdeHiringFunnel, bdeConvertedSummary, fromDate, toDate }) {
  const [activeKpi, setActiveKpi] = useState(null); // null | "responses" | "followUps" | "meets"

  const tiles = useMemo(() => ([
    { key: "totalLeads", label: "Total Leads",    value: bdeGeneral.totalLeads,       color: "#0f172a" },
    { key: "emailLeads", label: "Email Leads",    value: bdeGeneral.channel.email,    color: "#0f172a" },
    { key: "phoneLeads", label: "Phone Leads",    value: bdeGeneral.channel.phone,    color: "#0f172a" },
    { key: "linkedinLeads", label: "LinkedIn Leads", value: bdeGeneral.channel.linkedin, color: "#0f172a" },
    { key: "responses",  label: "Responses",      value: bdeGeneral.responses,        color: "#0f172a" },
    { key: "followUps",  label: "To-do Follow-ups", value: bdeGeneral.followUps,      color: "#0f172a" },
    { key: "meets",      label: "Client Meet",    value: bdeGeneral.meets,            color: "#0f172a" },
  ]), [bdeGeneral]);

  const companyRecords = useMemo(() => {
    if (!activeKpi) return [];
    const srcMatch = (row, needle) => String(row?.source || "").toLowerCase().includes(needle);
    if (activeKpi === "totalLeads") return bdeCompanyRows || [];
    if (activeKpi === "emailLeads") return (bdeCompanyRows || []).filter((r) => srcMatch(r, "email"));
    if (activeKpi === "phoneLeads") return (bdeCompanyRows || []).filter((r) => srcMatch(r, "phone") || srcMatch(r, "call"));
    if (activeKpi === "linkedinLeads") return (bdeCompanyRows || []).filter((r) => srcMatch(r, "linkedin"));
    return [];
  }, [activeKpi, bdeCompanyRows, bdeClientCompanyIds]);

  const activityRecords = useMemo(() => {
    if (!activeKpi) return [];
    if (activeKpi === "responses") return bdeRecords.responses || [];
    if (activeKpi === "followUps") return bdeRecords.followUps || [];
    if (activeKpi === "meets")     return bdeRecords.meets || [];
    return [];
  }, [activeKpi, bdeRecords]);

  const activeKind = useMemo(() => {
    if (!activeKpi) return "";
    if (["responses", "followUps", "meets"].includes(activeKpi)) return "activity";
    if (["totalLeads", "emailLeads", "phoneLeads", "linkedinLeads"].includes(activeKpi)) return "company";
    return "";
  }, [activeKpi]);

  const onTileClick = (key) => setActiveKpi((cur) => (cur === key ? null : key));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={styles.panel}>
        <h3 style={{ ...styles.panelTitle, marginBottom: 6 }}>
          {bdeGeneral.selectedBde ? `${bdeGeneral.selectedBde} — BDE Tracker` : "BDE Tracker"}
        </h3>
        <p style={{ margin: 0, color: "#64748b", fontSize: "12px" }}>
          {fromDate || "-"} → {toDate || "-"}
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
        {tiles.map((t) => (
          <BDEKpiTile
            key={t.key}
            label={t.label}
            value={t.value}
            color={t.color}
            active={activeKpi === t.key}
            onClick={() => onTileClick(t.key)}
          />
        ))}
      </div>

      {activeKpi && (
        <section style={styles.panel}>
          <h3 style={{ ...styles.panelTitle, fontSize: "15px" }}>
            {tiles.find((t) => t.key === activeKpi)?.label} — Records
          </h3>
          {activeKind === "company" && companyRecords.length === 0 ? (
            <p style={{ color: "#64748b", fontSize: "14px" }}>No records found.</p>
          ) : activeKind === "activity" && activityRecords.length === 0 ? (
            <p style={{ color: "#64748b", fontSize: "14px" }}>No records found.</p>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                {activeKind === "activity" ? (
                  <>
                    <thead>
                      <tr>
                        <th style={styles.th}>Company</th>
                        <th style={styles.th}>BDE</th>
                        <th style={styles.th}>Date</th>
                        <th style={styles.th}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activityRecords.map((row, i) => (
                        <tr key={i}>
                          <td style={styles.td}>{row.company || "-"}</td>
                          <td style={styles.td}>{getNameFromEmail(row.bde || "-")}</td>
                          <td style={styles.td}>{row.date ? formatDate(row.date) : "-"}</td>
                          <td style={styles.td}>{row.status || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                ) : (
                  <>
                    <thead>
                      <tr>
                        <th style={styles.th}>Date</th>
                        <th style={styles.th}>Contact Person</th>
                        <th style={styles.th}>Company</th>
                        <th style={styles.th}>Source</th>
                        <th style={styles.th}>Mobile</th>
                        <th style={styles.th}>Email</th>
                        <th style={styles.th}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {companyRecords.map((row) => (
                        <tr key={row.id}>
                          <td style={styles.td}>{row.created_at ? formatDate(row.created_at) : "-"}</td>
                          <td style={styles.td}>{row.contact_person || "-"}</td>
                          <td style={styles.td}>{row.company_name || "-"}</td>
                          <td style={styles.td}>{row.source || "-"}</td>
                          <td style={styles.td}>{row.phone || "-"}</td>
                          <td style={styles.td}>{row.email || "-"}</td>
                          <td style={styles.td}>{row.status || row.lead_status || row.stage || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}
              </table>
            </div>
          )}
        </section>
      )}

      <div style={styles.grid2}>
        <div style={{ ...styles.panel, background: "#f8fafc" }}>
          <p style={{ margin: "0 0 12px", fontSize: "11px", fontWeight: 700, color: "#334155", letterSpacing: "0.06em" }}>
            LEADS · RESPONSES · FOLLOW-UPS · MEETS
          </p>
          <BDEBarChart bdeMetrics={bdeMetrics} />
        </div>

        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>Channel Breakdown</h3>
          <ChannelPieChart channel={bdeGeneral.channel} />
        </div>
      </div>

      <div style={styles.grid2}>
        <RevenueTrendChart data={bdeRevenueTrend} />
        <HiringFunnelChart data={bdeHiringFunnel} />
      </div>

      {!bdeGeneral.selectedBde && (
        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>BDE Converted Clients</h3>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>BDE</th>
                  <th style={styles.th}>Converted Clients</th>
                </tr>
              </thead>
              <tbody>
                {bdeConvertedSummary.length === 0 ? (
                  <tr><td style={styles.td} colSpan={2}>No converted clients found.</td></tr>
                ) : (
                  bdeConvertedSummary.map((row) => (
                    <tr key={row.bde}>
                      <td style={styles.td}>{getNameFromEmail(row.bde)}</td>
                      <td style={styles.td}>{row.converted}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────
const TABS = ["daily", "weekly", "monthly", "yearly"];
const MANAGER_RELATION_FIELDS = [
  "manager", "manager_name", "managerName", "reporting_manager",
  "reportingManager", "reports_to", "reportsTo", "created_by",
];
const defaultFilters = {
  fromDate: "", toDate: "", manager: "", recruiter: "",
  client: "", status: "", filterType: "client", filterValue: "",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getTabRange = (tab) => {
  const now = new Date();
  if (tab === "daily") {
    const s = new Date(now); s.setHours(0, 0, 0, 0);
    const e = new Date(now); e.setHours(23, 59, 59, 999);
    return { start: s, end: e };
  }
  if (tab === "weekly") {
    const d    = new Date(now);
    const diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
    const s    = new Date(d); s.setDate(d.getDate() + diff); s.setHours(0, 0, 0, 0);
    const e    = new Date(s); e.setDate(s.getDate() + 6);    e.setHours(23, 59, 59, 999);
    return { start: s, end: e };
  }
  if (tab === "monthly") {
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    s.setHours(0, 0, 0, 0);
    const e = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    e.setHours(23, 59, 59, 999);
    return { start: s, end: e };
  }
  const s = new Date(now.getFullYear(), 0, 1);    s.setHours(0, 0, 0, 0);
  const e = new Date(now.getFullYear(), 11, 31);  e.setHours(23, 59, 59, 999);
  return { start: s, end: e };
};

const formatDate = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString("en-GB");
};

const toDateInputValue = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const getNameFromEmail = (value) => {
  const raw      = String(value || "").trim();
  if (!raw) return "-";
  const at       = raw.indexOf("@");
  const namePart = at > 0 ? raw.slice(0, at) : raw;
  return namePart.trim() || "-";
};

const getResolvedDateFilters = (activeTab, filters) => {
  if (activeTab) {
    const { start, end } = getTabRange(activeTab);
    return { fromDate: toDateInputValue(start), toDate: toDateInputValue(end) };
  }
  return { fromDate: filters.fromDate, toDate: filters.toDate };
};

const formatName = (name) =>
  String(name).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

const normalize = (name) =>
  String(name).replace(/\s+/g, "").toLowerCase().trim();

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AdminReports() {
  const [activeTab, setActiveTab] = useState("");
  const [filters,   setFilters]   = useState(defaultFilters);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");

  const [managerOptions, setManagerOptions] = useState([]);
  const [recruiterUsers, setRecruiterUsers] = useState([]);
  const [options,        setOptions]        = useState({ clients: [], recruiters: [], statuses: [] });
  const [bdeUsers,       setBdeUsers]       = useState([]);
  const [bdeUsersError,  setBdeUsersError]  = useState("");

  const [revenueTrend,         setRevenueTrend]         = useState([]);
  const [recruiterPerformance, setRecruiterPerformance] = useState([]);
  const [statusDistribution,   setStatusDistribution]   = useState([]);
  const [hiringFunnel,         setHiringFunnel]         = useState([]);
  const [clientPerformance,    setClientPerformance]    = useState([]);
  const [dailyRows,            setDailyRows]            = useState([]);

  const [periodMetrics, setPeriodMetrics] = useState({
    profilesSubmitted: 0, feedbackPending: 0, duplicateProfiles: 0,
    shortlisted: 0, rejected: 0, positionHold: 0,
    interviews: 0, pipeline: 0, closure: 0,
  });

  const [recruiterSummary, setRecruiterSummary] = useState([]);
  const [bdeSummary,       setBdeSummary]       = useState([]);
  const [bdeMetrics,       setBdeMetrics]       = useState({ leads: 0, responses: 0, followUps: 0, meets: 0 });
  // Detailed records per KPI for drill-down (responses, followUps, meets)
  const [bdeRecords, setBdeRecords] = useState({ responses: [], followUps: [], meets: [] });
  const [bdeGeneral, setBdeGeneral] = useState({
    selectedBde: "",
    channel: { email: 0, linkedin: 0, phone: 0 },
    newClients: 0,
    totalLeads: 0,
    responses: 0,
    followUps: 0,
    meets: 0,
  });
  const [bdeCompanyRows, setBdeCompanyRows] = useState([]);
  const [bdeClientCompanyIds, setBdeClientCompanyIds] = useState(new Set());
  const [bdeRevenueTrend, setBdeRevenueTrend] = useState([]);
  const [bdeConvertedSummary, setBdeConvertedSummary] = useState([]);
  const [bdeHiringFunnel, setBdeHiringFunnel] = useState([]);

  // ── serviceFilters ──────────────────────────────────────────────────────────
  const serviceFilters = useMemo(() => {
    const selectedClient    = filters.filterType === "client"    ? filters.filterValue : filters.client;
    const selectedRecruiter = filters.filterType === "recruiter" ? filters.filterValue : filters.recruiter;
    const selectedBde       = filters.filterType === "bde"       ? filters.filterValue : "";
    const dateFilters       = getResolvedDateFilters(activeTab, filters);
    return {
      ...dateFilters,
      client:             selectedClient    || "",
      recruiter:          selectedRecruiter || "",
      bde:                selectedBde       || "",
      status:             filters.status,
      candidateDateField: "record_date",
    };
  }, [activeTab, filters]);

  // ── viewType derived from filterType ───────────────────────────────────────
  // "BDE" is now just another filterType option handled in FiltersBar
  // We detect it via filters.filterType === "bde"
  const isBDEView = filters.filterType === "bde";

  // ── Load managers ───────────────────────────────────────────────────────────
  const loadManagers = useCallback(async () => {
    const [managersRes, recruitersRes] = await Promise.all([
      supabase.from("users").select("name,email").in("role", getRoleQueryValues("manager")).order("name", { ascending: true }),
      supabase.from("users").select("*").in("role", [...getRoleQueryValues("recruiter"), ...getRoleQueryValues("tl")]).order("name", { ascending: true }),
    ]);
    if (managersRes.error || recruitersRes.error) return;
    setManagerOptions((managersRes.data || []).map((r) => r.name || r.email?.split("@")[0]).filter(Boolean));
    setRecruiterUsers(recruitersRes.data || []);
  }, []);

  const recruiterOptions = useMemo(() => {
    const all = options.recruiters || [];
    const mgr = String(filters.manager || "").trim().toLowerCase();
    if (!mgr) return all;
    const teamNames = recruiterUsers
      .filter((row) => MANAGER_RELATION_FIELDS.some((f) => String(row?.[f] || "").trim().toLowerCase() === mgr))
      .map((row) => row.name || row.email?.split("@")?.[0])
      .filter(Boolean);
    if (!teamNames.length) return all;
    const allowed = new Set(teamNames.map((n) => n.trim().toLowerCase()));
    const filtered = all.filter((n) => allowed.has(n.trim().toLowerCase()));
    return filtered.length ? filtered : teamNames.sort((a, b) => a.localeCompare(b));
  }, [filters.manager, options.recruiters, recruiterUsers]);

  const bdeOptions = useMemo(() => {
    const names = (bdeUsers || [])
      .map((u) => String(u?.name || u?.email?.split("@")?.[0] || "").trim())
      .filter(Boolean);
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  }, [bdeUsers]);

  useEffect(() => {
    const fetchBDEUsers = async () => {
      try {
        setBdeUsersError("");

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) console.error("[director-reports:bde_users] session lookup failed", sessionError);

        const session = sessionData?.session || null;
        if (!session?.access_token) {
          setBdeUsers([]);
          setBdeUsersError("Not logged into Supabase (RLS blocks users list)");
          return;
        }

        const { data, error } = await supabase
          .from("users")
          .select("id,name,role,email")
          .or("role.ilike.%bde%,role.ilike.%bd%,role.ilike.%business development%")
          .order("name", { ascending: true });

        if (error) {
          console.error("[director-reports:bde_users] fetch failed", error);
          setBdeUsers([]);
          setBdeUsersError(error.message || "Failed to load BDE users");
          return;
        }

        setBdeUsers(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("[director-reports:bde_users] fetch failed", error);
        setBdeUsers([]);
        setBdeUsersError(error?.message || "Failed to load BDE users");
      }
    };
    fetchBDEUsers();
  }, []);

  // ── Load BDE data ───────────────────────────────────────────────────────────
  const loadBDEData = useCallback(async (fromDate, toDate, selectedBde = "") => {
    try {
      const normalizeKey = (v) => String(v || "").trim().toLowerCase().replace(/\s+/g, "");
      const selectedKey = normalizeKey(selectedBde);

      const selectedKeys = (() => {
        if (!selectedKey) return [];
        const exactMatches = (bdeUsers || []).filter((u) => normalizeKey(u?.name) === selectedKey);
        const pool = exactMatches.length ? exactMatches : (bdeUsers || []);
        const matched = pool.filter((u) => {
          const nameKey = normalizeKey(u?.name);
          const emailKey = normalizeKey(u?.email);
          if (nameKey && nameKey === selectedKey) return true;
          if (emailKey && emailKey.includes(selectedKey)) return true;
          return false;
        });
        const keys = matched.flatMap((u) => [normalizeKey(u?.email), normalizeKey(u?.name)]).filter(Boolean);
        return Array.from(new Set(keys));
      })();

      const matchesSelected = (createdBy) => {
        if (!selectedKey) return true;
        const raw = String(createdBy || "");
        const key = normalizeKey(raw);
        if (!selectedKeys.length) return key.includes(selectedKey);
        return selectedKeys.some((k) => key.includes(k));
      };

      let cq = supabase
        .from("companies")
        .select("id, company_name, contact_person, phone, email, status, created_by, created_at, lead_status, stage, source");
      if (fromDate) cq = cq.gte("created_at", fromDate);
      if (toDate)   cq = cq.lte("created_at", `${toDate}T23:59:59`);

      const { data: companies, error: compError } = await cq;
      if (compError) throw compError;

      const allCompanies = (companies || []).filter((c) => matchesSelected(c.created_by));
      const companyIds   = allCompanies.map((c) => c.id);
      setBdeCompanyRows(allCompanies);

      // BDE hiring funnel (Leads -> Clients -> Closure -> Drop out) derived from companies table
      const statusText = (row) => String(row?.status || row?.lead_status || row?.stage || "").trim().toLowerCase();
      const isConverted = (s) => s === "converted" || s.includes("converted") || s.includes("client");
      const isClosure = (s) => s.includes("closure") || s === "closed" || s.includes("closed");
      const isDropout = (s) => s.includes("drop out") || s.includes("dropout") || s.includes("drop");

      const clientsCount = allCompanies.filter((c) => isConverted(statusText(c))).length;
      const closureCount = allCompanies.filter((c) => isClosure(statusText(c))).length;
      const dropoutCount = allCompanies.filter((c) => isDropout(statusText(c))).length;
      setBdeHiringFunnel([
        { stage: "Leads", value: allCompanies.length },
        { stage: "Clients", value: clientsCount },
        { stage: "Closure", value: closureCount },
        { stage: "Drop out", value: dropoutCount },
      ]);

      // Converted leads -> clients summary (only meaningful when viewing "All BDE")
      if (!selectedBde) {
        const convMap = new Map();
        allCompanies.forEach((c) => {
          const status = String(c.status || c.lead_status || c.stage || "").trim().toLowerCase();
          if (status !== "converted") return;
          const bdeName = formatName(String(c.created_by || "Unknown").trim() || "Unknown");
          const key = bdeName.toLowerCase();
          convMap.set(key, (convMap.get(key) || { bde: bdeName, converted: 0 }));
          convMap.get(key).converted += 1;
        });
        setBdeConvertedSummary(Array.from(convMap.values()).sort((a, b) => b.converted - a.converted));
      } else {
        setBdeConvertedSummary([]);
      }

      // Revenue trend (revenue_tracker) for selected BDE (uses bd_name)
      try {
        let rq = supabase.from("revenue_tracker").select("margin_value, doj, bd_name");
        if (fromDate) rq = rq.gte("doj", fromDate);
        if (toDate)   rq = rq.lte("doj", toDate);
        if (selectedBde) rq = rq.eq("bd_name", selectedBde);
        const { data: revRows, error: revError } = await rq;
        if (revError) throw revError;
        setBdeRevenueTrend(groupByMonth(revRows || [], "doj", "margin_value"));
      } catch (revErr) {
        console.error("[bde-reports] revenue trend failed", revErr);
        setBdeRevenueTrend([]);
      }

      if (companyIds.length === 0) {
        setBdeMetrics({ leads: 0, responses: 0, followUps: 0, meets: 0 });
        setBdeSummary([]);
        setBdeRecords({ responses: [], followUps: [], meets: [] });
        setBdeClientCompanyIds(new Set());
        setBdeRevenueTrend([]);
        setBdeConvertedSummary([]);
        setBdeHiringFunnel([]);
        setBdeGeneral({
          selectedBde: selectedBde || "",
          channel: { email: 0, linkedin: 0, phone: 0 },
          newClients: 0,
          totalLeads: 0,
          responses: 0,
          followUps: 0,
          meets: 0,
        });
        return;
      }

      // Requirements (clients)
      const { data: requirements } = await supabase
        .from("requirements").select("company_id, created_by").in("company_id", companyIds);

      // Activities — fetch responses, follow-ups, meets
      const { data: activities } = await supabase
        .from("activities")
        .select("company_id, type, created_at, created_by, status, notes")
        .in("company_id", companyIds);

      const acts = activities || [];

      const companiesWithReq = new Set((requirements || []).map((r) => r.company_id));
      setBdeClientCompanyIds(companiesWithReq);
      const companiesWithClosure = new Set(
        allCompanies.filter((c) => /close/i.test(String(c.lead_status || c.stage || ""))).map((c) => c.id)
      );

      // Build company id → name map
      const companyMap = new Map(allCompanies.map((c) => [c.id, c.company_name || c.id]));

      // Classify activities
      const responseRecords  = acts.filter((a) => /response/i.test(a.type || "")).map((a) => ({
        company: companyMap.get(a.company_id) || "-", bde: a.created_by || "-",
        date: a.created_at, status: a.status || a.notes || "-",
      }));
      const followUpRecords  = acts.filter((a) => /follow.?up/i.test(a.type || "")).map((a) => ({
        company: companyMap.get(a.company_id) || "-", bde: a.created_by || "-",
        date: a.created_at, status: a.status || a.notes || "-",
      }));
      const meetRecords      = acts.filter((a) => /meet|demo|call/i.test(a.type || "")).map((a) => ({
        company: companyMap.get(a.company_id) || "-", bde: a.created_by || "-",
        date: a.created_at, status: a.status || a.notes || "-",
      }));

      setBdeRecords({ responses: responseRecords, followUps: followUpRecords, meets: meetRecords });

      // Per-BDE summary
      const bdeMap = new Map();
      allCompanies.forEach((company) => {
        const bdeName = formatName(String(company.created_by || "Unknown").trim());
        const key     = bdeName.toLowerCase();
        const cur     = bdeMap.get(key) || { bde: bdeName, totalLeads: 0, clients: 0, closures: 0 };
        cur.totalLeads += 1;
        if (companiesWithReq.has(company.id))     cur.clients  += 1;
        if (companiesWithClosure.has(company.id)) cur.closures += 1;
        bdeMap.set(key, cur);
      });

      setBdeSummary(Array.from(bdeMap.values()).sort((a, b) => b.totalLeads - a.totalLeads));
      setBdeMetrics({
        leads:     allCompanies.length,
        responses: responseRecords.length,
        followUps: followUpRecords.length,
        meets:     meetRecords.length,
      });

      const channel = { email: 0, linkedin: 0, phone: 0 };
      allCompanies.forEach((c) => {
        const src = String(c.source || "").toLowerCase();
        if (src.includes("email")) channel.email += 1;
        else if (src.includes("linkedin")) channel.linkedin += 1;
        else if (src.includes("phone") || src.includes("call")) channel.phone += 1;
      });

      setBdeGeneral({
        selectedBde: selectedBde || "",
        channel,
        newClients: companiesWithReq.size,
        totalLeads: allCompanies.length,
        responses: responseRecords.length,
        followUps: followUpRecords.length,
        meets: meetRecords.length,
      });
    } catch (err) {
      console.error("[bde-reports] failed", err);
      setBdeMetrics({ leads: 0, responses: 0, followUps: 0, meets: 0 });
      setBdeSummary([]);
      setBdeRecords({ responses: [], followUps: [], meets: [] });
      setBdeCompanyRows([]);
      setBdeClientCompanyIds(new Set());
      setBdeRevenueTrend([]);
      setBdeConvertedSummary([]);
      setBdeHiringFunnel([]);
      setBdeGeneral({
        selectedBde: selectedBde || "",
        channel: { email: 0, linkedin: 0, phone: 0 },
        newClients: 0,
        totalLeads: 0,
        responses: 0,
        followUps: 0,
        meets: 0,
      });
    }
  }, [bdeUsers]);

  // ── Load all reports ────────────────────────────────────────────────────────
  const loadReports = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const optionFilters = {
        ...serviceFilters,
        client:    filters.filterType === "client"    ? "" : serviceFilters.client,
        recruiter: filters.filterType === "recruiter" ? "" : serviceFilters.recruiter,
      };

      const [trendRes, recruiterRes, statusRes, funnelRes, clientRes, optionsRes] = await Promise.all([
        getRevenueTrend(serviceFilters),
        getRecruiterPerformanceAnalytics(serviceFilters),
        getStatusDistribution(serviceFilters),
        getHiringFunnel(serviceFilters),
        getClientPerformance(serviceFilters),
        getFilterOptions(optionFilters),
      ]);

      setRevenueTrend(groupByMonth(trendRes, "doj", "margin_value"));
      setRecruiterPerformance(recruiterRes);
      setStatusDistribution(statusRes);
      setHiringFunnel(funnelRes);
      setClientPerformance(clientRes);
      setOptions({
        ...optionsRes,
        clients: Array.from(
          new Map((optionsRes.clients || []).map((c) => [normalize(c), formatName(c)])).values()
        ),
      });

      let q = supabase.from("candidate_records").select("record_date,client_name,requirement,recruiter,status");
      if (serviceFilters.fromDate)  q = q.gte("record_date", serviceFilters.fromDate);
      if (serviceFilters.toDate)    q = q.lte("record_date", serviceFilters.toDate);
      if (serviceFilters.recruiter) q = q.ilike("recruiter", serviceFilters.recruiter);
      if (serviceFilters.client)    q = q.eq("client_name", serviceFilters.client);
      if (serviceFilters.status)    q = q.eq("status", serviceFilters.status);

      const { data: candidates, error: candidateError } = await q;
      if (candidateError) throw candidateError;
      const rows = candidates || [];

      // Daily rows
      const dailyMap = new Map();
      rows.forEach((row) => {
        const dateKey = formatDate(row.record_date);
        const client  = String(row.client_name || "Unknown").trim() || "Unknown";
        const key     = `${dateKey}__${client}`;
        const cur     = dailyMap.get(key) || { date: dateKey, clientName: client, requirementSet: new Set(), profilesSubmitted: 0 };
        if (row.requirement) cur.requirementSet.add(String(row.requirement).trim());
        cur.profilesSubmitted += 1;
        dailyMap.set(key, cur);
      });
      setDailyRows(
        Array.from(dailyMap.values()).map((item) => ({
          date: item.date, clientName: item.clientName,
          requirementsAddressed: item.requirementSet.size,
          profilesSubmitted:     item.profilesSubmitted,
        }))
      );

      // Period metrics
      const statuses = rows.map((r) => String(r.status || "").trim().toLowerCase().replace(/\s+/g, " "));
      const contains = (needle) => statuses.filter((s) => s.includes(needle)).length;
      const pipelineExcluded = new Set([
        "joined","closure","closed","l1 reject","l2 reject",
        "final round rejected","drop out by candidate","drop out by client","backout",
      ]);
      setPeriodMetrics({
        profilesSubmitted: rows.length,
        feedbackPending:   contains("feedback pending"),
        duplicateProfiles: contains("duplicate"),
        shortlisted:       contains("shortlisted"),
        rejected:          statuses.filter((s) => s.includes("reject")).length,
        positionHold:      statuses.filter((s) => s.includes("position hold") || s.includes("hold")).length,
        interviews:        statuses.filter((s) =>
          s.includes("interview") ||
          ["l1 scheduled","l2 scheduled","ai interview","hr round","interview scheduled"].includes(s)
        ).length,
        pipeline: statuses.filter((s) => !pipelineExcluded.has(s)).length,
        closure:  trendRes.length,
      });

      // Recruiter summary
      const recMap = new Map();
      rows.forEach((row) => {
        const raw = String(row.recruiter || "Unknown").trim() || "Unknown";
        const key = raw.toLowerCase().replace(/\s+/g, " ");
        const cur = recMap.get(key) || { recruiter: formatName(raw), profilesSubmitted: 0 };
        cur.profilesSubmitted += 1;
        recMap.set(key, cur);
      });
      setRecruiterSummary(Array.from(recMap.values()).sort((a, b) => b.profilesSubmitted - a.profilesSubmitted));

      // BDE data
      await loadBDEData(serviceFilters.fromDate, serviceFilters.toDate, serviceFilters.bde);
    } catch (err) {
      console.error("[hr-reports] load failed", err);
      setError(err?.message || "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }, [activeTab, filters, serviceFilters, loadBDEData]);

  useEffect(() => { loadManagers(); }, [loadManagers]);
  useEffect(() => {
    const delay = setTimeout(() => { loadReports(); }, 300);
    return () => clearTimeout(delay);
  }, [filters, activeTab]);

  const handleFilterChange = (key, value) => {
    if (key === "fromDate" || key === "toDate") setActiveTab("");
    setFilters((prev) => {
      let updated = { ...prev, [key]: value };
      if (key === "filterType")  { updated.filterValue = ""; updated.client = ""; updated.recruiter = ""; }
      if (key === "filterValue") {
        updated.client    = updated.filterType === "client"    ? value : "";
        updated.recruiter = updated.filterType === "recruiter" ? value : "";
      }
      if (key === "recruiter")   { updated.client = ""; updated.filterType = "recruiter"; updated.filterValue = value; }
      if (key === "filterValue" && updated.filterType === "manager") {
        updated.manager = value;
        updated.client = "";
        updated.recruiter = "";
      }
      if (key === "manager")     { updated.recruiter = ""; updated.client = ""; updated.filterValue = ""; }
      return updated;
    });
  };

  const handleReset = () => {
    setFilters(defaultFilters);
    setActiveTab("");
  };

  const metricCards = [
    { label: "Profiles Submitted",  value: periodMetrics.profilesSubmitted },
    { label: "Feedback Pending",    value: periodMetrics.feedbackPending    },
    { label: "Duplicate Profiles",  value: periodMetrics.duplicateProfiles  },
    { label: "Shortlisted",         value: periodMetrics.shortlisted        },
    { label: "Rejected",            value: periodMetrics.rejected           },
    { label: "Position Hold",       value: periodMetrics.positionHold       },
    { label: "Interviews",          value: periodMetrics.interviews         },
    { label: "Pipeline",            value: periodMetrics.pipeline           },
    { label: "Closure",             value: periodMetrics.closure            },
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={styles.page}>
      <h2 style={styles.title}>Director Reports</h2>

      {/* Tabs */}
      <div style={styles.tabWrap}>
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            style={{ ...styles.tabBtn, ...(activeTab === tab ? styles.activeTab : {}) }}
            onClick={() => setActiveTab((cur) => (cur === tab ? "" : tab))}
          >
            {tab[0].toUpperCase() + tab.slice(1)} Report
          </button>
        ))}
      </div>


      {/* FiltersBar — BDE is added as an option inside filterType */}
      <FiltersBar
        filters={filters}
        onChange={handleFilterChange}
        onApply={loadReports}
        onReset={handleReset}
        clients={options.clients}
        recruiters={recruiterOptions}
        managers={managerOptions}
        bdes={bdeUsersError ? [bdeUsersError] : bdeOptions}
        statuses={options.statuses}
        showStatusFilter={!isBDEView}
        showRecruiterFilter
        extraFilterTypes={[{ value: "manager", label: "Manager" }, { value: "bde", label: "BDE" }]}
      />

      {loading ? (
        <Loader text="Loading reports..." />
      ) : error ? (
        <div style={styles.error}>{error}</div>
      ) : isBDEView ? (
        /* ── BDE Dashboard ── */
        <BDEGeneralTrackerView
          bdeGeneral={bdeGeneral}
          bdeMetrics={bdeMetrics}
          bdeRecords={bdeRecords}
          bdeCompanyRows={bdeCompanyRows}
          bdeClientCompanyIds={bdeClientCompanyIds}
          bdeRevenueTrend={bdeRevenueTrend}
          bdeHiringFunnel={bdeHiringFunnel}
          bdeConvertedSummary={bdeConvertedSummary}
          fromDate={serviceFilters.fromDate}
          toDate={serviceFilters.toDate}
        />
      ) : (
        <>
          {/* ── Recruiter / Client charts ── */}
          <div style={styles.grid2}>
            <RevenueTrendChart data={revenueTrend} />
            <RecruiterPerformanceChart data={recruiterPerformance} />
          </div>
          <div style={styles.grid2}>
            <HiringFunnelChart data={hiringFunnel} />
            <StatusPieChart data={statusDistribution} />
          </div>
          <ClientPerformanceChart data={clientPerformance} />

          {activeTab === "daily" ? (
            <section style={styles.panel}>
              <h3 style={styles.panelTitle}>Daily Report</h3>
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Date</th>
                      <th style={styles.th}>Client Name</th>
                      <th style={styles.th}>Requirements Addressed</th>
                      <th style={styles.th}>Profiles Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyRows.length === 0 ? (
                      <tr><td style={styles.td} colSpan={4}>No daily rows found.</td></tr>
                    ) : (
                      dailyRows.map((row, idx) => (
                        <tr key={`${row.date}-${row.clientName}-${idx}`}>
                          <td style={styles.td}>{row.date}</td>
                          <td style={styles.td}>{row.clientName}</td>
                          <td style={styles.td}>{row.requirementsAddressed}</td>
                          <td style={styles.td}>{row.profilesSubmitted}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            <>
              <section style={styles.panel}>
                <h3 style={styles.panelTitle}>
                  {activeTab ? `${activeTab[0].toUpperCase() + activeTab.slice(1)} Metrics` : "All Reports Metrics"}
                </h3>
                <div style={styles.metricsGrid}>
                  {metricCards.map((card) => (
                    <div key={card.label} style={styles.metricCard}>
                      <p style={styles.metricLabel}>{card.label}</p>
                      <p style={styles.metricValue}>{card.value}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section style={styles.panel}>
                <h3 style={styles.panelTitle}>Recruiter Summary</h3>
                <div style={styles.tableWrap}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Recruiter</th>
                        <th style={styles.th}>Profiles Submitted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recruiterSummary.length === 0 ? (
                        <tr><td style={styles.td} colSpan={2}>No recruiter data found.</td></tr>
                      ) : (
                        recruiterSummary.map((row) => (
                          <tr key={row.recruiter}>
                            <td style={styles.td}>{row.recruiter}</td>
                            <td style={styles.td}>{row.profilesSubmitted}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  page:              { display: "flex", flexDirection: "column", gap: "14px" },
  title:             { margin: 0, fontSize: "30px", color: "#0f172a" },
  tabWrap:           { display: "flex", flexWrap: "wrap", gap: "8px" },
  tabBtn:            { border: "1px solid #cbd5e1", background: "#fff", color: "#0f172a", borderRadius: "8px", padding: "8px 12px", fontWeight: 600, cursor: "pointer" },
  activeTab:         { border: "1px solid #2563eb", color: "#1d4ed8", background: "#eff6ff" },
  grid2:             { display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))" },
  managerFilterWrap: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "14px" },
  input:             { width: "100%", maxWidth: "320px", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "9px 10px", fontSize: "14px" },
  panel:             { background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "14px" },
  panelTitle:        { margin: "0 0 10px", fontSize: "18px", color: "#0f172a" },
  tableWrap:         { overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: "10px" },
  table:             { width: "100%", borderCollapse: "collapse", minWidth: "400px" },
  th:                { textAlign: "left", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", padding: "10px", fontSize: "13px", color: "#334155" },
  td:                { borderBottom: "1px solid #f1f5f9", padding: "10px", fontSize: "14px", color: "#0f172a" },
  metricsGrid:       { display: "grid", gap: "10px", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" },
  metricCard:        { border: "1px solid #e2e8f0", borderRadius: "10px", padding: "10px" },
  metricLabel:       { margin: 0, color: "#64748b", fontSize: "12px", fontWeight: 600 },
  metricValue:       { margin: "6px 0 0", color: "#0f172a", fontSize: "24px", fontWeight: 700 },
  error:             { border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", borderRadius: "10px", padding: "10px 12px", fontSize: "14px" },
};
