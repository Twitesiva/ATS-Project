import { useEffect, useState, useRef } from "react";
import { Chart, registerables } from "chart.js";
import { API_BASE_URL } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../services/supabaseClient";
Chart.register(...registerables);
// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  blue:   "#378ADD",
  green:  "#1D9E75",
  amber:  "#EF9F27",
  purple: "#534AB7",
  red:    "#E24B4A",
  text:   "#0f172a",
  sub:    "#475569",
  muted:  "#94a3b8",
  border: "#e2e8f0",
  bg:     "#f8fafc",
  card:   "#ffffff",
};
const gc = "rgba(128,128,128,0.1)", tc = "#888";
const baseO = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
};

// ─── Pure helpers ─────────────────────────────────────────────────────────────
function pct(a, b) { return b > 0 ? Math.round((a / b) * 100) : 0; }
function iso(d) { return d.toISOString().split("T")[0]; }
function normalizeText(v) { return String(v || "").trim().toLowerCase(); }
function buildUserKeys(user) {
  return [...new Set([normalizeText(user?.name), normalizeText(user?.email)].filter(Boolean))];
}
function matchesUser(value, keys) {
  if (!keys.length) return true;
  return keys.includes(normalizeText(value));
}

/** Build `n` consecutive ISO weeks (Mon–Sun) ending at the current week */
function buildWeeks(n = 8) {
  const today = new Date();
  const day = today.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const thisMonday = new Date(today);
  thisMonday.setUTCDate(today.getUTCDate() + diff);

  return Array.from({ length: n }, (_, i) => {
    const start = new Date(thisMonday);
    start.setUTCDate(thisMonday.getUTCDate() - (n - 1 - i) * 7);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    const ws = iso(start);
    const we = iso(end);

    // ISO week number
    const d = new Date(ws);
    const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    const dow = jan4.getUTCDay() || 7;
    const sow = new Date(jan4);
    sow.setUTCDate(jan4.getUTCDate() - dow + 1);
    const wn = Math.ceil(((d - sow) / 86400000 + 1) / 7);

    return {
      ws,
      we,
      label: `W${wn}, ${start.getUTCDate().toString().padStart(2, "0")}/${(start.getUTCMonth() + 1).toString().padStart(2, "0")}`,
    };
  });
}

/**
 * Compute all KPIs for one week from the four raw tables.
 *
 * BAR CHART DATA SOURCES (explicitly):
 *   Requirements  ← requirements table  (rows whose created_at is in [ws,we]
 *                                         and company_id belongs to this BDE)
 *   Meets         ← activities table    (rows whose activity_datetime is in [ws,we]
 *                                         AND type (case-insensitive) = "Meeting")
 *   Closures      ← revenue_tracker     (rows whose doj is in [ws,we]
 *                                         AND client_name matches one of this BDE's
 *                                         Client-status company names)
 */
function computeWeekKPIs(ws, we, companies, requirements, activities, revenueRows) {
  // ── Companies created this week ──────────────────────────────────────────
  const weekComps   = companies.filter(c => { const d = (c.created_at || "").slice(0, 10); return d >= ws && d <= we; });
  const weekCompIds = new Set(weekComps.map(c => c.id));

  // ── Requirements (from requirements table) ───────────────────────────────
  const weekReqs = requirements.filter(r => {
    const d = (r.created_at || "").slice(0, 10);
    return d >= ws && d <= we && weekCompIds.has(r.company_id);
  });

  // ── Activities this week ─────────────────────────────────────────────────
  const weekActs = activities.filter(a => {
    const d = (a.activity_datetime || "").slice(0, 10);
    return d >= ws && d <= we;
  });

  // ── Meets: strictly activities.type = "Meeting" ──────────────────────────
  const clientMeet = weekActs.filter(a => ["demo", "meeting"].includes((a.type || "").trim().toLowerCase())).length;

  // ── Closures: revenue_tracker filtered by BDE's Client companies ─────────
  // Build a set of lowercase company_names that have status = "Client"
  const clientNames = new Set(
    companies
      .filter(c => (c.status || "").toLowerCase() === "client")
      .map(c => (c.company_name || "").trim().toLowerCase())
  );

  const weekClosures = revenueRows.filter(r => {
    const doj = (r.doj || "").slice(0, 10);
    if (doj < ws || doj > we) return false;
    const cn = (r.client_name || "").trim().toLowerCase();
    return clientNames.has(cn);
  });

  // ── Total lead generation: unique (company_id, contact, job_title) ───────
  const reqsByComp = {};
  weekReqs.forEach(r => { (reqsByComp[r.company_id] = reqsByComp[r.company_id] || []).push(r); });
  const leadCombos = new Set();
  weekComps.forEach(c => {
    const reqs = reqsByComp[c.id] || [];
    if (reqs.length) {
      reqs.forEach(r => leadCombos.add(`${c.id}|${(c.contact_person || "").trim()}|${(r.job_title || "").trim()}`));
    } else {
      leadCombos.add(`${c.id}|${(c.contact_person || "").trim()}|`);
    }
  });

  // ── Channel leads (source field ∪ activity type, deduplicated by company) ─
  const emailBySrc    = new Set(weekComps.filter(c => (c.source || "").toLowerCase().includes("email")).map(c => c.id));
  const linkedinBySrc = new Set(weekComps.filter(c => (c.source || "").toLowerCase().includes("linkedin")).map(c => c.id));
  const phoneBySrc    = new Set(weekComps.filter(c => { const s = (c.source || "").toLowerCase(); return s.includes("phone") || s.includes("call"); }).map(c => c.id));
  const emailByAct    = new Set(weekActs.filter(a => weekCompIds.has(a.company_id) && (a.type || "").toLowerCase() === "email").map(a => a.company_id));
  const linkedinByAct = new Set(weekActs.filter(a => weekCompIds.has(a.company_id) && (a.type || "").toLowerCase() === "linkedin").map(a => a.company_id));
  const phoneByAct    = new Set(weekActs.filter(a => weekCompIds.has(a.company_id) && ["call", "phone"].includes((a.type || "").toLowerCase())).map(a => a.company_id));
  const union = (a, b) => new Set([...a, ...b]);

  return {
    totalLeadGeneration: leadCombos.size,
    newLeadsEmail:       union(emailBySrc, emailByAct).size,
    newLeadsLinkedIn:    union(linkedinBySrc, linkedinByAct).size,
    newLeadsPhone:       union(phoneBySrc, phoneByAct).size,
    responsesReceived:   weekReqs.length,
    clientMeet,                                       // activities.type = Demo / Meeting
    followUps:           weekActs.filter(a => (a.status || "").toLowerCase() === "pending").length,
    newClients:          weekComps.filter(c => (c.status || "").toLowerCase() === "client").length,
    requirements:        weekReqs.length,             // requirements table
    closures:            weekClosures.length,          // revenue_tracker
    weekComps,
    weekReqs,
    weekActs,
    weekClosures,
  };
}

/** Flatten companies × requirements into deduped rows for the drill-down table */
function buildLeadRows(weekComps, weekReqs) {
  const reqsByComp = {};
  weekReqs.forEach(r => { (reqsByComp[r.company_id] = reqsByComp[r.company_id] || []).push(r); });
  const rows = [], seen = new Set();
  weekComps.forEach(c => {
    const combos = (reqsByComp[c.id] || []).length
      ? reqsByComp[c.id]
      : [{ id: null, job_title: "", created_at: c.created_at }];
    combos.forEach(r => {
      const job = (r.job_title || "").trim();
      const key = `${c.id}|${(c.contact_person || "").trim()}|${job}`;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({
        id:            `${c.id}-${r.id || "none"}`,
        activity_date: c.created_at || "",
        lead_name:     c.contact_person || c.company_name || "",
        company:       c.company_name || "",
        source:        c.source || c.stage || "",
        mobile:        c.phone || "",
        email:         c.email || "",
        status:        c.status || "",
        remarks:       c.remarks || "",
        position:      job,
      });
    });
  });
  return rows;
}

function buildRequirementRows(weekReqs, weekComps) {
  const companyById = Object.fromEntries((weekComps || []).map(c => [c.id, c]));
  return (weekReqs || []).map((r, idx) => {
    const company = companyById[r.company_id] || {};
    return {
      id: r.id || `requirement-${idx}`,
      activity_date: r.created_at || "",
      lead_name: company.contact_person || company.company_name || "",
      company: company.company_name || "",
      source: company.source || company.stage || "",
      mobile: company.phone || "",
      email: company.email || "",
      status: r.status || "",
      remarks: company.remarks || "",
      position: r.job_title || "",
    };
  });
}

function buildActivityRows(weekActs, weekComps) {
  const companyById = Object.fromEntries((weekComps || []).map(c => [c.id, c]));
  return (weekActs || []).map((a, idx) => {
    const company = companyById[a.company_id] || {};
    return {
      id: a.id || `activity-${idx}`,
      activity_date: a.activity_datetime || "",
      lead_name: company.contact_person || company.company_name || "",
      company: company.company_name || "",
      source: a.type || "",
      mobile: company.phone || "",
      email: company.email || "",
      status: a.status || "",
      remarks: a.notes || "",
      position: "",
    };
  });
}

// ─── UI primitives ────────────────────────────────────────────────────────────
function MiniChart({ id, config, height = 200 }) {
  const ref = useRef(null);
  const inst = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    if (inst.current) inst.current.destroy();
    const t = setTimeout(() => { if (ref.current) inst.current = new Chart(ref.current, config); }, 50);
    return () => { clearTimeout(t); inst.current?.destroy(); };
  }, [config]);
  return <div style={{ position: "relative", width: "100%", height }}><canvas ref={ref} id={id} /></div>;
}

function MetricCard({ label, value, sub, subColor }) {
  return (
    <div style={{ background: C.bg, borderRadius: 8, padding: "12px 14px" }}>
      <p style={{ margin: "0 0 3px", fontSize: 11, color: C.sub }}>{label}</p>
      <p style={{ margin: 0, fontSize: 24, fontWeight: 500, color: C.text }}>{value}</p>
      {sub && <p style={{ margin: "3px 0 0", fontSize: 11, color: subColor || C.muted }}>{sub}</p>}
    </div>
  );
}

function Sec({ children }) {
  return <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 600, color: C.sub, letterSpacing: "0.06em", textTransform: "uppercase" }}>{children}</p>;
}

function Card({ children, style }) {
  return <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 12, padding: "1rem 1.25rem", ...style }}>{children}</div>;
}

function Legend({ items, activeValue, onItemClick }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 8, fontSize: 12, color: C.sub, alignItems: "center" }}>
      {items.map(it => (
        <span key={it.label} onClick={onItemClick ? () => onItemClick(it.value || it.label) : undefined}
          style={{ display: "flex", alignItems: "center", gap: 5, cursor: onItemClick ? "pointer" : "default", padding: onItemClick ? "4px 8px" : 0, borderRadius: 999, border: onItemClick ? `0.5px solid ${activeValue === (it.value || it.label) ? "#AFA9EC" : "transparent"}` : "none", background: onItemClick && activeValue === (it.value || it.label) ? "#EEEDFE" : "transparent", color: onItemClick && activeValue === (it.value || it.label) ? "#3C3489" : C.sub }}>
          <span style={{ width: 10, height: 10, borderRadius: it.round ? "50%" : 2, background: it.color, display: "inline-block", transform: it.diamond ? "rotate(45deg)" : undefined }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = { "New": { bg: "#E6F1FB", color: "#185FA5" }, "New Lead": { bg: "#E6F1FB", color: "#185FA5" }, "Client": { bg: "#E1F5EE", color: "#085041" }, "Converted": { bg: "#E1F5EE", color: "#085041" }, "Pending": { bg: "#F5F0FF", color: "#4A3FB5" }, "Follow Up": { bg: "#F5F0FF", color: "#4A3FB5" }, "Closure": { bg: "#DCFCE7", color: "#166534" }, "Closed": { bg: "#DCFCE7", color: "#166534" } };
  const s = map[status] || { bg: C.bg, color: C.sub };
  return <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 500, background: s.bg, color: s.color, whiteSpace: "nowrap" }}>{status || "—"}</span>;
}

const TABLE_COLS = [
  { key: "activity_date", label: "Date",            width: 100 },
  { key: "lead_name",     label: "Contact Person",  width: 150 },
  { key: "company",       label: "Company",         width: 150 },
  { key: "position",      label: "Position (Req.)", width: 150 },
  { key: "source",        label: "Source",          width: 110 },
  { key: "mobile",        label: "Mobile",          width: 120 },
  { key: "email",         label: "Email",           width: 180 },
  { key: "status",        label: "Status",          width: 120 },
  { key: "remarks",       label: "Remarks",         width: 180 },
];

function KpiTable({ rows, label, onClose }) {
  const [search, setSearch] = useState("");
  const filtered = rows.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return ["lead_name","company","position","email","status","source"].some(k => (r[k]||"").toLowerCase().includes(q));
  });
  return (
    <div style={{ marginTop: "1.25rem", border: `0.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: C.bg, borderBottom: `0.5px solid ${C.border}`, gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.sub, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
          <span style={{ background: "#EEEDFE", color: "#3C3489", fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 999 }}>{filtered.length} records</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ position: "relative" }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
              style={{ padding: "5px 10px 5px 28px", fontSize: 12, border: `0.5px solid ${C.border}`, borderRadius: 6, background: C.card, color: C.text, outline: "none", width: 180 }} />
            <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: C.muted, fontSize: 12, pointerEvents: "none" }}>⌕</span>
          </div>
          <button onClick={onClose} style={{ padding: "5px 10px", fontSize: 11, border: `0.5px solid ${C.border}`, borderRadius: 6, background: "transparent", color: C.sub, cursor: "pointer" }}>✕ Close</button>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: C.bg }}>
              <th style={{ padding: "8px 12px", textAlign: "center", color: C.muted, fontSize: 11, fontWeight: 500, borderBottom: `0.5px solid ${C.border}`, width: 40 }}>#</th>
              {TABLE_COLS.map(col => (
                <th key={col.key} style={{ padding: "8px 12px", textAlign: "left", color: C.sub, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: `0.5px solid ${C.border}`, whiteSpace: "nowrap", minWidth: col.width }}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0
              ? <tr><td colSpan={TABLE_COLS.length + 1} style={{ padding: 32, textAlign: "center", color: C.muted, fontSize: 13 }}>No records found</td></tr>
              : filtered.map((row, idx) => (
                  <tr key={row.id || idx} style={{ borderBottom: `0.5px solid ${C.border}`, background: idx % 2 === 0 ? C.card : C.bg }}>
                    <td style={{ padding: "8px 12px", textAlign: "center", color: C.muted, fontSize: 11 }}>{idx + 1}</td>
                    <td style={{ padding: "8px 12px", color: C.muted, fontSize: 11, whiteSpace: "nowrap" }}>{(row.activity_date || "—").split("T")[0]}</td>
                    <td style={{ padding: "8px 12px", color: C.text, fontWeight: 500, whiteSpace: "nowrap" }}>{row.lead_name || "—"}</td>
                    <td style={{ padding: "8px 12px", color: C.sub, whiteSpace: "nowrap" }}>{row.company || "—"}</td>
                    <td style={{ padding: "8px 12px", color: C.sub, whiteSpace: "nowrap" }}>{row.position || <span style={{ color: C.muted, fontStyle: "italic" }}>No req</span>}</td>
                    <td style={{ padding: "8px 12px", color: C.sub, whiteSpace: "nowrap" }}>{row.source || "—"}</td>
                    <td style={{ padding: "8px 12px", color: C.sub, whiteSpace: "nowrap" }}>{row.mobile || "—"}</td>
                    <td style={{ padding: "8px 12px", color: C.blue, whiteSpace: "nowrap" }}>{row.email || "—"}</td>
                    <td style={{ padding: "8px 12px" }}><StatusBadge status={row.status} /></td>
                    <td style={{ padding: "8px 12px", color: C.sub, maxWidth: 200 }}><span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.remarks || "—"}</span></td>
                  </tr>
                ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}

function filterRowsByKpi(rows, filter) {
  switch (filter) {
    case "clients":  return rows.filter(r => ["client","converted"].includes((r.status||"").toLowerCase()));
    case "email":    return rows.filter(r => (r.source||"").toLowerCase().includes("email"));
    case "phone":    return rows.filter(r => { const s=(r.source||"").toLowerCase(); return s.includes("phone")||s.includes("call"); });
    case "linkedin": return rows.filter(r => (r.source||"").toLowerCase().includes("linkedin"));
    case "responses": return rows;
    case "followups": return rows.filter(r => (r.status||"").toLowerCase() === "pending");
    case "meets":     return rows.filter(r => ["demo", "meeting"].includes((r.source||"").toLowerCase()));
    default:         return rows;
  }
}

const KPI_LABELS = { clients:"New Clients", total:"Total Leads", email:"Email Leads", phone:"Phone Leads", linkedin:"LinkedIn Leads", responses:"Responses Received", followups:"To-do Follow-ups", meets:"Client Meets (Demo + Meeting)" };

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function WeeklyTrackerVisual({ user: userProp }) {
  const { user: authUser } = useAuth();
  const user = userProp || authUser;
  const [companies,    setCompanies]    = useState([]);
  const [requirements, setRequirements] = useState([]);
  const [activities,   setActivities]   = useState([]);
  const [revenueRows,  setRevenueRows]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);

  const [tab,          setTab]          = useState("weekly");
  const [selWeek,      setSelWeek]      = useState(7);
  const [weeklyMetric, setWeeklyMetric] = useState("all");
  const [kpiFilter,    setKpiFilter]    = useState(null);

  const userName = user?.name || user?.email || "";
  const userKeys = buildUserKeys(user);

  // ── Fetch all four tables in parallel ────────────────────────────────────
useEffect(() => {
  (async () => {
    setLoading(true);
    setError(null);

    try {
      // ✅ get session safely
      const { data: { session } } = await supabase.auth.getSession();

      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session?.access_token}`, // ✅ token added
      };

      const [cRes, rRes, aRes, revRes] = await Promise.all([
        fetch(`${API_BASE_URL}/bde/companies`, { headers }),
        fetch(`${API_BASE_URL}/bde/requirements`, { headers }),
        fetch(`${API_BASE_URL}/bde/activities`, { headers }),
        fetch(`${API_BASE_URL}/bde/revenue-tracker`, { headers }),
      ]);

      const [cData, rData, aData] = await Promise.all([
        cRes.json(),
        rRes.json(),
        aRes.json()
      ]);

      const revData = revRes.ok ? await revRes.json() : [];

      setCompanies(cData || []);
      setRequirements((rData || []).map(r => ({
        ...r,
        company_id: r.company_id ?? r.companies?.id
      })));
      setActivities((aData || []).map(a => ({
        ...a,
        company_id: a.company_id ?? a.companies?.id
      })));
      setRevenueRows(revData || []);

    } catch (err) {
      setError(err.message);
    }

    setLoading(false);
  })();
}, []);

  // ── Scope to this BDE's data ──────────────────────────────────────────────
  const matchedComps = userKeys.length ? companies.filter(c => matchesUser(c.created_by, userKeys)) : companies;
  const matchedActs = userKeys.length ? activities.filter(a => matchesUser(a.created_by, userKeys)) : activities;
const userComps   = matchedComps;
const userCompIds = new Set(userComps.map(c => c.id));
const userReqs    = requirements.filter(r => userCompIds.has(r.company_id));
const userActs    = matchedActs;

  // ── Revenue rows scoped to this BDE's client companies ───────────────────
  const bdeClientNames = new Set(
    userComps
      .filter(c => (c.status || "").toLowerCase() === "client")
      .map(c => (c.company_name || "").trim().toLowerCase())
  );
  const userRevenue = revenueRows.filter(r =>
    bdeClientNames.has((r.client_name || "").trim().toLowerCase())
  );

  // ── 8-week grid ───────────────────────────────────────────────────────────
  const weeks = buildWeeks(8);
  const weekData = weeks.map(w =>
    computeWeekKPIs(w.ws, w.we, userComps, userReqs, userActs, userRevenue)
  );

  // ── Derived arrays ────────────────────────────────────────────────────────
  const wLabels   = weeks.map(w => w.label);
  const total     = weekData.map(d => d.totalLeadGeneration);
  const email     = weekData.map(d => d.newLeadsEmail);
  const phone     = weekData.map(d => d.newLeadsPhone);
  const linkedin  = weekData.map(d => d.newLeadsLinkedIn);
  const responses = weekData.map(d => d.responsesReceived);
  const followups = weekData.map(d => d.followUps);
  const meets     = weekData.map(d => d.clientMeet);      // activities.type = "Meeting"
  const clients   = weekData.map(d => d.newClients);
  const reqArr    = weekData.map(d => d.requirements);    // requirements table
  const closures  = weekData.map(d => d.closures);        // revenue_tracker

  const n         = weeks.length;
  const sumTotal  = total.reduce((s,v)=>s+v,0);
  const sumCli    = clients.reduce((s,v)=>s+v,0);
  const sumResp   = responses.reduce((s,v)=>s+v,0);
  const avgLead   = +(sumTotal/n).toFixed(1);
  const overallRR = pct(sumResp, sumTotal);
  const bestIdx   = total.indexOf(Math.max(...total, 0));
  const dE = email.reduce((s,v)=>s+v,0), dL = linkedin.reduce((s,v)=>s+v,0), dP = phone.reduce((s,v)=>s+v,0);

  // ── Chart configs ─────────────────────────────────────────────────────────
  const trendCfg = {
    type: "line",
    data: { labels: wLabels, datasets: [
      { data: total,     borderColor: C.blue,   backgroundColor: "rgba(55,138,221,0.07)", fill: true,  tension: 0.35, pointRadius: 4, pointBackgroundColor: C.blue   },
      { data: responses, borderColor: C.green,  borderDash: [5,3], fill: false, tension: 0.35, pointRadius: 4, pointStyle: "circle",  pointBackgroundColor: C.green  },
      { data: meets,     borderColor: C.purple, fill: false, tension: 0.35, pointRadius: 5, pointStyle: "rectRot", pointBackgroundColor: C.purple },
    ]},
    options: { ...baseO, scales: { x: { ticks: { color: tc, autoSkip: false }, grid: { color: gc } }, y: { beginAtZero: true, ticks: { color: tc }, grid: { color: gc } } } },
  };

  const donutCfg = {
    type: "doughnut",
    data: { labels: ["Email","LinkedIn","Phone"], datasets: [{ data: [dE,dL,dP], backgroundColor: [C.blue,C.green,C.amber], borderWidth: 0, hoverOffset: 4 }] },
    options: { ...baseO, cutout: "62%", layout: { padding: 8 } },
  };

  // Req → Closure bar (last 4 weeks)
  // Requirements = requirements table | Meets = activities type=Meeting | Closures = revenue_tracker
  const last4 = weekData.slice(-4);
  const last4Labels = weeks.slice(-4).map(w => w.label);
const rcDatasets = [
    weeklyMetric === "all" || weeklyMetric === "leads"
      ? { label: "Leads",    data: last4.map(d => d.totalLeadGeneration), backgroundColor: C.blue,  borderRadius: 0, barPercentage: 1.0, categoryPercentage: 0.5 }
      : null,
    weeklyMetric === "all" || weeklyMetric === "meets"
      ? { label: "Meets",    data: last4.map(d => d.clientMeet),          backgroundColor: C.amber, borderRadius: 0, barPercentage: 1.0, categoryPercentage: 0.5 }
      : null,
    weeklyMetric === "all" || weeklyMetric === "closures"
      ? { label: "Closures", data: last4.map(d => d.closures),            backgroundColor: C.green, borderRadius: 0, barPercentage: 1.0, categoryPercentage: 0.5 }
      : null,
  ].filter(Boolean);

  const rcCfg = {
    type: "bar",
    data: { labels: last4Labels, datasets: rcDatasets },
    options: {
      ...baseO,
      plugins: { legend: { display: false }, tooltip: { backgroundColor: "#fff", titleColor: C.text, bodyColor: C.text, borderColor: C.border, borderWidth: 1, padding: 14, displayColors: true } },
      scales: {
        x: { ticks: { color: tc, autoSkip: false, minRotation: 35, maxRotation: 35 }, grid: { color: gc } },
        y: { beginAtZero: true, ticks: { color: tc, precision: 0 }, grid: { color: gc } },
      },
    },
  };

  // ── Selected week ─────────────────────────────────────────────────────────
  const sw        = Math.min(selWeek, n-1);
  const swD       = weekData[sw] || {};
  const swW       = weeks[sw]    || {};
  const swTotal   = swD.totalLeadGeneration || 0;
  const swEmail   = swD.newLeadsEmail       || 0;
  const swPhone   = swD.newLeadsPhone       || 0;
  const swLI      = swD.newLeadsLinkedIn    || 0;
  const swResp    = swD.responsesReceived   || 0;
  const swMeets   = swD.clientMeet          || 0;
  const swFU      = swD.followUps           || 0;
  const swCli     = swD.newClients          || 0;
  const swClose   = swD.closures            || 0;

  const swLeadRows = buildLeadRows(swD.weekComps || [], swD.weekReqs || []);
  const swRequirementRows = buildRequirementRows(swD.weekReqs || [], swD.weekComps || []);
  const swActivityRows = buildActivityRows(swD.weekActs || [], swD.weekComps || []);
  const kpiBaseRows =
    kpiFilter === "responses" ? swRequirementRows :
    ["followups", "meets"].includes(kpiFilter) ? swActivityRows :
    swLeadRows;
  const kpiRows    = kpiFilter ? filterRowsByKpi(kpiBaseRows, kpiFilter) : [];

  const swDonutCfg = {
    type: "doughnut",
    data: { labels: ["Email","LinkedIn","Phone"], datasets: [{ data: [swEmail,swLI,swPhone], backgroundColor: [C.blue,C.green,C.amber], borderWidth: 0, hoverOffset: 4 }] },
    options: { ...baseO, cutout: "62%", layout: { padding: 8 }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx=>`${ctx.label}: ${ctx.parsed}` } } } },
  };
  const swBarCfg = {
    type: "bar",
    data: { labels: ["Leads","Responses","Follow-ups","Meets"], datasets: [{ data: [swTotal,swResp,swFU,swMeets], backgroundColor: [C.blue,C.green,C.amber,C.purple], borderRadius: 4, borderSkipped: false }] },
    options: { ...baseO, scales: { x: { ticks: { color: tc, autoSkip: false }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: tc }, grid: { color: gc } } } },
  };

  // ── Style helpers ─────────────────────────────────────────────────────────
  const tabStyle = a => ({ padding: "8px 18px", fontSize: 13, fontWeight: 500, border: `0.5px solid ${a?"#AFA9EC":C.border}`, borderRadius: 6, background: a?"#EEEDFE":"transparent", color: a?"#3C3489":C.sub, cursor: "pointer" });
  const tileStyle = f => ({ background: kpiFilter===f?"#EEEDFE":C.bg, border:`0.5px solid ${kpiFilter===f?"#AFA9EC":C.border}`, borderRadius:10, padding:"12px 14px", cursor:"pointer", transition:"background 0.15s", userSelect:"none" });
  const tileLbl   = f => ({ margin:"0 0 6px", fontSize:11, textTransform:"uppercase", letterSpacing:"0.04em", color: kpiFilter===f?"#3C3489":C.sub });

  const kpiRow1 = [
    { label:"New Clients",    val:swCli,   color:C.green,  filter:"clients"  },
    { label:"Total Leads",    val:swTotal, color:C.blue,   filter:"total"    },
    { label:"Email Leads",    val:swEmail, color:C.blue,   filter:"email"    },
    { label:"Phone Leads",    val:swPhone, color:C.amber,  filter:"phone"    },
    { label:"LinkedIn Leads", val:swLI,    color:C.green,  filter:"linkedin" },
  ];
  const kpiRow2 = [
    { label:"Responses",        val:swResp,  color:C.green,  filter:"responses" },
    { label:"To-do Follow-ups", val:swFU,    color:C.amber,  filter:"followups" },
    { label:"Client Meet",      val:swMeets, color:C.purple, filter:"meets"     },
  ];

  if (loading) return <div style={{padding:40,textAlign:"center",color:C.muted,fontSize:13}}>Loading companies · requirements · activities · revenue_tracker…</div>;
  if (error)   return <div style={{padding:40,textAlign:"center",color:C.red,  fontSize:13}}>Error: {error}</div>;

  return (
    <div style={{ padding:"28px 32px", background:"#ffffff", minHeight:"100vh", fontFamily:"system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1.25rem", flexWrap:"wrap", gap:8 }}>
        <div>
          <p style={{ margin:0, fontSize:17, fontWeight:500, color:C.text }}>{userName || "All BDEs"} — BDE Tracker</p>
          <p style={{ margin:"2px 0 0", fontSize:12, color:C.muted }}>{weeks[0]?.label} → {weeks[n-1]?.label} · Live · companies · requirements · activities · revenue_tracker</p>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <button style={tabStyle(tab==="weekly")} onClick={()=>setTab("weekly")}>BDE weekly analysis</button>
          <button style={tabStyle(tab==="single")} onClick={()=>setTab("single")}>Week drilldown</button>
        </div>
      </div>

    {/* ── Weekly overview ── */}
{tab === "weekly" && (
  <div>
    <div style={{ display:"grid", gridTemplateColumns:"repeat(4,minmax(0,1fr))", gap:10, marginBottom:"1.25rem" }}>
      <MetricCard label="Total leads (8 wks)"  value={sumTotal}        sub={`${wLabels[bestIdx]||"—"} was best`}                       subColor={C.green} />
      <MetricCard label="Avg leads / week"      value={avgLead}         sub="Target: 15"                                                subColor={avgLead>=15?C.green:C.red} />
      <MetricCard label="Response rate"         value={`${overallRR}%`} sub={overallRR>=20?"+vs target":"–vs target"}                   subColor={overallRR>=20?C.green:C.red} />
      <MetricCard label="Clients acquired"      value={sumCli}          sub={`Conv. ${+(sumCli/(sumTotal||1)*100).toFixed(1)}%`}        subColor={C.green} />
    </div>

    <Card style={{ marginBottom:"1.25rem" }}>
      <Sec>Lead generation trend — all {n} weeks</Sec>
      <Legend items={[{ label:"Total leads", color:C.blue }, { label:"Responses", color:C.green, round:true }, { label:"Client meets", color:C.purple, diamond:true }]} />
      <MiniChart key="trend" id="c-trend" config={trendCfg} height={210} />
    </Card>

    <div style={{ display:"grid", gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)", gap:"1.25rem", marginBottom:"1.25rem" }}>
      <Card>
        <Sec>Channel split — all weeks</Sec>
        <Legend items={[{ label:`Email ${pct(dE,dE+dL+dP)}%`, color:C.blue }, { label:`LinkedIn ${pct(dL,dE+dL+dP)}%`, color:C.green }, { label:`Phone ${pct(dP,dE+dL+dP)}%`, color:C.amber }]} />
        <MiniChart key="donut" id="c-donut" config={donutCfg} height={170} />
      </Card>

      <Card>
        <Sec>Leads → closure (last 4 weeks)</Sec>
        <Legend
          activeValue={weeklyMetric}
          onItemClick={v => setWeeklyMetric(cur => cur===v?"all":v)}
          items={[
            { label:"Leads",    color:C.blue,  value:"leads"    },
            { label:"Meets",    color:C.amber, value:"meets"    },
            { label:"Closures", color:C.green, value:"closures" }
          ]}
        />
        <MiniChart key="rc" id="c-rc" config={rcCfg} height={230} />
      </Card>
    </div>
  </div>
)}

      {/* ── Week drilldown ── */}
      {tab === "single" && (
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:"1.25rem" }}>
            <span style={{ fontSize:12, color:C.sub }}>Select week:</span>
            {weeks.map((w,i) => (
              <button key={w.ws} onClick={()=>{ setSelWeek(i); setKpiFilter(null); }}
                style={{ padding:"5px 12px", fontSize:12, fontWeight:500, border:`0.5px solid ${i===sw?"#AFA9EC":C.border}`, borderRadius:20, background:i===sw?"#EEEDFE":"transparent", color:i===sw?"#3C3489":C.sub, cursor:"pointer" }}>
                {w.label}
              </button>
            ))}
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)", gap:"1.25rem", marginBottom:"1.25rem" }}>
            <Card>
              <Sec>Channel breakdown — companies.source + activities.type</Sec>
              <Legend items={[{ label:"Email", color:C.blue },{ label:"LinkedIn", color:C.green },{ label:"Phone", color:C.amber }]} />
              <MiniChart key={`sw-donut-${sw}`} id="c-sw-donut" config={swDonutCfg} height={180} />
            </Card>
            <Card>
              <Sec>Leads · responses · meets (type=Meeting)</Sec>
              <MiniChart key={`sw-bar-${sw}`} id="c-sw-bar" config={swBarCfg} height={180} />
            </Card>
          </div>

          <Card>
            <Sec>Weekly tracker snapshot</Sec>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, marginBottom:14, flexWrap:"wrap" }}>
              <div>
                <p style={{ margin:0, fontSize:16, fontWeight:600, color:C.text }}>{swW.label}</p>
                <p style={{ margin:"4px 0 0", fontSize:12, color:C.muted }}>{userName||"All BDEs"} · {swW.ws} → {swW.we}</p>
              </div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                <div style={{ padding:"7px 12px", borderRadius:999, background:"#EEEDFE", color:"#3C3489", fontSize:12, fontWeight:600 }}>
                  {swCli>0?`${swCli} client${swCli>1?"s":""} acquired`:"Pipeline in progress"}
                </div>
                {swClose>0 && (
                  <div style={{ padding:"7px 12px", borderRadius:999, background:"#E1F5EE", color:"#085041", fontSize:12, fontWeight:600 }}>
                    {swClose} closure{swClose>1?"s":""} (revenue tracker)
                  </div>
                )}
              </div>
            </div>

            <p style={{ margin:"0 0 10px", fontSize:11, color:C.muted }}>Click any tile to view the records below</p>

            {/* Row 1 — 5 tiles */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,minmax(0,1fr))", gap:10, marginBottom:10 }}>
              {kpiRow1.map(k => (
                <div key={k.filter} onClick={()=>setKpiFilter(f=>f===k.filter?null:k.filter)} style={tileStyle(k.filter)}>
                  <p style={tileLbl(k.filter)}>{k.label}</p>
                  <p style={{ margin:0, fontSize:22, fontWeight:600, color:k.color }}>{k.val}</p>
                </div>
              ))}
            </div>

            {/* Row 2 — 3 tiles */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,minmax(0,1fr))", gap:10, marginBottom:10 }}>
              {kpiRow2.map(k => (
                <div key={k.filter} onClick={()=>setKpiFilter(f=>f===k.filter?null:k.filter)} style={tileStyle(k.filter)}>
                  <p style={tileLbl(k.filter)}>{k.label}</p>
                  <p style={{ margin:0, fontSize:22, fontWeight:600, color:k.color }}>{k.val}</p>
                </div>
              ))}
            </div>

            {/* Closures tile — read-only, sourced from revenue_tracker */}
            <div style={{ padding:"12px 14px", borderRadius:10, background:"#E1F5EE", border:"0.5px solid #9FE1CB", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div>
                <p style={{ margin:"0 0 4px", fontSize:11, color:"#085041", textTransform:"uppercase", letterSpacing:"0.04em", fontWeight:600 }}>Closures</p>
                <p style={{ margin:0, fontSize:22, fontWeight:600, color:C.green }}>{swClose}</p>
              </div>
              <div style={{ textAlign:"right" }}>
                <span style={{ fontSize:10, color:"#085041", background:"#9FE1CB", borderRadius:6, padding:"3px 8px", display:"block", marginBottom:3 }}>revenue_tracker</span>
                <span style={{ fontSize:10, color:C.muted }}>client_name ∈ Client companies · position match</span>
              </div>
            </div>

            {kpiFilter && (
              <KpiTable rows={kpiRows} label={KPI_LABELS[kpiFilter]||kpiFilter} onClose={()=>setKpiFilter(null)} />
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
