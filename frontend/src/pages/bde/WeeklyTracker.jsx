import { useEffect, useState, useRef } from "react";
import { supabase } from "../../services/supabaseClient";
import { Chart, registerables } from "chart.js";
import { API_BASE_URL } from "../../services/api";
Chart.register(...registerables); 
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
const baseO = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } };

function pct(a, b) { return b > 0 ? Math.round((a / b) * 100) : 0; }
function avg(arr)  { return arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length * 10) / 10 : 0; }

// ── Chart.js loader ──
function useChartJS() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (window.Chart) { setReady(true); return; }
    window.Chart = Chart;
    setReady(true);
  }, []);
  return ready;
}

// ── Chart wrapper ──
function MiniChart({ id, config, height = 200 }) {
  const ref  = useRef(null);
  const inst = useRef(null);
  useEffect(() => {
    if (!ref.current || !window.Chart) return;
    if (inst.current) inst.current.destroy();
    const timer = setTimeout(() => {
      inst.current = new window.Chart(ref.current, config);
    }, 50);
    return () => { clearTimeout(timer); inst.current?.destroy(); };
  }, [config]);
  return (
    <div style={{ position: "relative", width: "100%", height }}>
      <canvas ref={ref} id={id} />
    </div>
  );
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

function DetailTile({ label, value, color = C.text }) {
  return (
    <div style={{ background: C.bg, borderRadius: 10, padding: "12px 14px", border: `0.5px solid ${C.border}` }}>
      <p style={{ margin: "0 0 6px", fontSize: 11, color: C.sub, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</p>
      <p style={{ margin: 0, fontSize: 22, fontWeight: 600, color }}>{value}</p>
    </div>
  );
}

function Sec({ children }) {
  return (
    <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 600, color: C.sub, letterSpacing: "0.06em", textTransform: "uppercase" }}>
      {children}
    </p>
  );
}

function Card({ children, style }) {
  return (
    <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 12, padding: "1rem 1.25rem", ...style }}>
      {children}
    </div>
  );
}

function Legend({ items, activeValue, onItemClick }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 8, fontSize: 12, color: C.sub, alignItems: "center" }}>
      {items.map(it => (
        <span
          key={it.label}
          onClick={onItemClick ? () => onItemClick(it.value || it.label) : undefined}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            cursor: onItemClick ? "pointer" : "default",
            padding: onItemClick ? "4px 8px" : 0,
            borderRadius: 999,
            border: onItemClick ? `0.5px solid ${(activeValue === (it.value || it.label)) ? "#AFA9EC" : "transparent"}` : "none",
            background: onItemClick && activeValue === (it.value || it.label) ? "#EEEDFE" : "transparent",
            color: onItemClick && activeValue === (it.value || it.label) ? "#3C3489" : C.sub,
          }}
        >
          <span style={{ width: 10, height: 10, borderRadius: it.round ? "50%" : 2, background: it.color, display: "inline-block", transform: it.diamond ? "rotate(45deg)" : undefined }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

function Funnel({ stages }) {
  const max = stages[0]?.val || 1;
  return (
    <div>
      {stages.map((s, i) => (
        <div key={s.label}>
          <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 36px", gap: 10, alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: C.sub }}>{s.label}</span>
            <div style={{ background: C.bg, borderRadius: 4, height: 8, overflow: "hidden" }}>
              <div style={{ width: `${pct(s.val, max)}%`, height: "100%", background: s.color, borderRadius: 4 }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 500, color: C.text, textAlign: "right" }}>{s.val}</span>
          </div>
          {i < stages.length - 1 && (
            <div style={{ fontSize: 10, color: C.muted, paddingLeft: 150, marginBottom: 4 }}>
              ↓ {pct(stages[i + 1].val, s.val)}% conversion
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const HM_PALETTES = [
  ["#E6F1FB","#B5D4F4","#85B7EB","#378ADD","#185FA5"],
  ["#FAEEDA","#FAC775","#EF9F27","#BA7517","#854F0B"],
  ["#E1F5EE","#9FE1CB","#5DCAA5","#1D9E75","#0F6E56"],
  ["#EEEDFE","#CECBF6","#AFA9EC","#7F77DD","#534AB7"],
  ["#EAF3DE","#C0DD97","#97C459","#639922","#3B6D11"],
];
const HM_TEXT = ["#0C447C","#633806","#085041","#3C3489","#27500A"];

function Heatmap({ weeks, email, phone, linkedin, responses, meets }) {
  const channels = ["Email","Phone","LinkedIn","Responses","Meets"];
  const rowsData = [email, phone, linkedin, responses, meets];
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: `80px repeat(${weeks.length},minmax(0,1fr))`, gap: 3, minWidth: 500 }}>
        <div />
        {weeks.map(w => (
          <div key={w} style={{ fontSize: 10, color: C.muted, textAlign: "center", paddingBottom: 2 }}>{w}</div>
        ))}
        {channels.map((ch, ci) => (
          <>
            <div key={ch} style={{ fontSize: 11, color: C.sub, display: "flex", alignItems: "center" }}>{ch}</div>
            {rowsData[ci].map((v, wi) => {
              const mx  = Math.max(...rowsData[ci]);
              const idx = mx === 0 ? 0 : Math.round((v / mx) * 4);
              const fg  = idx >= 3 ? "#fff" : HM_TEXT[ci];
              return (
                <div key={wi} style={{ background: HM_PALETTES[ci][idx], color: fg, height: 30, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 500 }}>
                  {v}
                </div>
              );
            })}
          </>
        ))}
      </div>
    </div>
  );
}

function WowCompare({ metrics }) {
  return (
    <div>
      {metrics.map(m => {
        const pctVal = pct(m.val, m.max);
        const pctAvg = pct(m.avg, m.max);
        const diff   = +(m.val - m.avg).toFixed(1);
        return (
          <div key={m.label} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: C.sub }}>{m.label}</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: C.text }}>
                {m.val}{" "}
                <span style={{ fontWeight: 400, color: diff >= 0 ? C.green : C.red, fontSize: 11 }}>
                  {diff >= 0 ? "+" : ""}{diff} vs avg
                </span>
              </span>
            </div>
            <div style={{ position: "relative", height: 8, background: C.bg, borderRadius: 4, overflow: "visible" }}>
              <div style={{ width: `${pctVal}%`, height: "100%", background: C.blue, borderRadius: 4 }} />
              <div style={{ position: "absolute", top: -2, left: `${pctAvg}%`, width: 2, height: 12, background: C.red, borderRadius: 1 }} title="Average" />
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 3, fontSize: 10, color: C.muted }}>
              <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <span style={{ width: 8, height: 3, background: C.blue, borderRadius: 2, display: "inline-block" }} />This week
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <span style={{ width: 2, height: 8, background: C.red, borderRadius: 1, display: "inline-block" }} />8-week avg
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ChannelPerf({ total, email, phone, linkedin }) {
  const channels = [
    { name: "Email",    val: email,    color: C.blue  },
    { name: "LinkedIn", val: linkedin, color: C.green },
    { name: "Phone",    val: phone,    color: C.amber },
  ].sort((a, b) => b.val - a.val);
  const maxCh  = Math.max(...channels.map(c => c.val), 1);
  const rankBg = ["#EEEDFE","#E1F5EE","#FAEEDA"];
  const rankFg = ["#3C3489","#085041","#633806"];
  return (
    <div>
      {channels.map((ch, idx) => (
        <div key={ch.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: idx < channels.length - 1 ? `0.5px solid ${C.border}` : "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 80 }}>
            <div style={{ width: 20, height: 20, borderRadius: "50%", background: rankBg[idx], color: rankFg[idx], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 500 }}>
              {idx + 1}
            </div>
            <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{ch.name}</span>
          </div>
          <div style={{ background: C.bg, borderRadius: 4, height: 7, flex: 1, margin: "0 10px", overflow: "hidden" }}>
            <div style={{ width: `${pct(ch.val, maxCh)}%`, height: "100%", background: ch.color, borderRadius: 4 }} />
          </div>
          <div style={{ textAlign: "right", minWidth: 60 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{ch.val}</span>
            <span style={{ fontSize: 11, color: C.muted }}> · {pct(ch.val, total)}%</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Insights({ total, avgTotal, rr, clients, meets, topChannel }) {
  const items = [];
  if (total > avgTotal)
    items.push({ text: `Strong lead week — ${total} leads, ${total - avgTotal} above the 8-week average of ${avgTotal}.`, color: "#085041", bg: "#E1F5EE" });
  else
    items.push({ text: `Slower week — ${total} leads vs average of ${avgTotal}. Consider ramping outreach.`, color: "#7C1F1F", bg: "#FCEBEB" });
  if (rr >= 25)
    items.push({ text: `Excellent response rate at ${rr}% — well above the 20% benchmark.`, color: "#085041", bg: "#E1F5EE" });
  else if (rr > 0)
    items.push({ text: `Response rate of ${rr}% — follow up on unopened emails to lift conversion.`, color: "#633806", bg: "#FAEEDA" });
  items.push({ text: `${topChannel.name} was the top channel with ${topChannel.val} leads (${pct(topChannel.val, total)}% of week total).`, color: "#185FA5", bg: "#E6F1FB" });
  if (clients > 0)
    items.push({ text: `${clients} client${clients > 1 ? "s" : ""} acquired — great conversion this week!`, color: "#085041", bg: "#E1F5EE" });
  else
    items.push({ text: `No clients acquired this week — ${meets} meet${meets !== 1 ? "s" : ""} scheduled. Nurture pipeline.`, color: "#5F5E5A", bg: "#F1EFE8" });
  return (
    <div>
      {items.map((it, i) => (
        <div key={i} style={{ padding: "8px 12px", background: it.bg, borderRadius: 6, marginBottom: 6, fontSize: 12, color: it.color }}>
          {it.text}
        </div>
      ))}
    </div>
  );
}

// ── Funnel tab component (Leads → Clients → Requirements → Closures) ──
function FunnelChart({ funnel }) {
  const { leads, clients, requirements, closures } = funnel;
  const vals   = [leads, clients, requirements, closures];
  const labels = ["Leads", "Clients", "Requirements", "Closures"];
  const colors = [C.blue, C.green, C.amber, C.purple];

  const funnelBarCfg = {
    type: "bar",
    data: {
      labels,
      datasets: [{
        data: vals,
        backgroundColor: colors,
        borderRadius: 4,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.parsed.x}  (${pct(ctx.parsed.x, leads)}% of leads)`,
          },
        },
      },
      scales: {
        x: { beginAtZero: true, ticks: { color: tc }, grid: { color: gc } },
        y: { ticks: { color: tc, font: { size: 13 } }, grid: { display: false } },
      },
    },
  };

  const convPairs = [
    { from: "Leads",        to: "Clients",      a: leads,        b: clients,      color: C.green  },
    { from: "Clients",      to: "Requirements", a: clients,      b: requirements, color: C.amber  },
    { from: "Requirements", to: "Closures",     a: requirements, b: closures,     color: C.purple },
  ];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10, marginBottom: "1.25rem" }}>
        {[
          { label: "Leads",        val: leads        },
          { label: "Clients",      val: clients      },
          { label: "Requirements", val: requirements },
          { label: "Closures",     val: closures     },
        ].map((m, i) => (
          <div key={m.label} style={{ background: C.bg, borderRadius: 8, padding: "12px 14px" }}>
            <p style={{ margin: "0 0 3px", fontSize: 11, color: C.sub }}>{m.label}</p>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 500, color: colors[i] }}>{m.val}</p>
            <p style={{ margin: "3px 0 0", fontSize: 11, color: C.muted }}>
              {i === 0 ? "Total pipeline" : `${pct(m.val, leads)}% of leads`}
            </p>
          </div>
        ))}
      </div>

      <Card style={{ marginBottom: "1.25rem" }}>
        <Sec>Conversion funnel</Sec>
        <Legend items={[
          { label: "Leads",        color: C.blue   },
          { label: "Clients",      color: C.green  },
          { label: "Requirements", color: C.amber  },
          { label: "Closures",     color: C.purple },
        ]} />
        <MiniChart key="funnel-bar" id="c-funnel-bar" config={funnelBarCfg} height={220} />
      </Card>

      <Card>
        <Sec>Stage-by-stage conversion rate</Sec>
        {convPairs.map(p => {
          const rate = pct(p.b, p.a);
          return (
            <div key={p.from} style={{ display: "grid", gridTemplateColumns: "180px 1fr 100px", gap: 12, alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: C.sub }}>{p.from} → {p.to}</span>
              <div style={{ background: C.bg, borderRadius: 4, height: 8, overflow: "hidden" }}>
                <div style={{ width: `${rate}%`, height: "100%", background: p.color, borderRadius: 4 }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 500, color: C.text, textAlign: "right" }}>
                {p.b} <span style={{ fontWeight: 400, color: C.muted, fontSize: 11 }}>({rate}%)</span>
              </span>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
export default function WeeklyTrackerVisual({ user }) {
  const chartReady = useChartJS();

  const [rows,    setRows]    = useState([]);
  const [todayRows, setTodayRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState("weekly");
  const [selWeek, setSelWeek] = useState(0);
  const [weeklyMetric, setWeeklyMetric] = useState("all");

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      try {
        const params = new URLSearchParams();
        if (user?.name) params.append("user", user.name);
        
        const url = `${API_BASE_URL}/bde/weekly-tracker${params.toString() ? '?' + params.toString() : ''}`;
        const res = await fetch(url);
        
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const data = await res.json();
        setRows(data);

        // Fetch today's data
        const todayUrl = `${API_BASE_URL}/bde/daily-tracker?bde=${encodeURIComponent(user?.name || "")}`;
        const todayRes = await fetch(todayUrl);
        if (todayRes.ok) {
          const todayData = await todayRes.json();
          setTodayRows(Array.isArray(todayData) ? todayData : []);
        }
      } catch (err) {
        console.error("Failed to fetch weekly tracker:", err);
        setRows([]);
      }

      setLoading(false);
    };

    fetchData();
  }, [user]);

  // Calculate today's metrics
  const today = new Date().toISOString().split("T")[0];
  const todayData = todayRows.filter(r => {
    const rowDate = (r.activity_date || r.created_at || "").split("T")[0];
    return rowDate === today;
  });
  const todayTotalActivity = todayData.length;
  const todayNewLeads = todayData.filter(r => r.status === "New" || r.status === "New Lead").length;
  const todayConverted = todayData.filter(r => r.status === "Client" || r.status === "Converted").length;
  const todayRequirements = todayData.filter(r => r.status === "Requirement").length;
  const todayFollowUps = todayData.filter(r => r.status === "Pending" || r.status === "Follow Up").length;
  // derive arrays
  const chronoRows = [...rows].reverse();
  const weeks     = chronoRows.map(r => r.week);
  const dates     = chronoRows.map(r => `${r.week_start} → ${r.week_end}`);
  const email     = chronoRows.map(r => r.newLeadsEmail     || 0);
  const phone     = chronoRows.map(r => r.newLeadsPhone     || 0);
  const linkedin  = chronoRows.map(r => r.newLeadsLinkedIn  || 0);
  const responses = chronoRows.map(r => r.responsesReceived || 0);
  const followups = chronoRows.map(r => r.followUps         || 0);
  const meets     = chronoRows.map(r => r.clientMeet        || 0);
  const clients   = chronoRows.map(r => r.newClients        || 0);
  const requirements = chronoRows.map(r => r.requirements   || 0);
  const closures     = chronoRows.map(r => r.closures       || 0);
  const total     = chronoRows.map((_, i) => email[i] + phone[i] + linkedin[i]);
  const last4Rows = chronoRows.slice(-4);
  const last4Weeks = last4Rows.map(r => r.week);
  const last4Requirements = last4Rows.map(r => r.requirements || 0);
  const last4Meets = last4Rows.map(r => r.clientMeet || 0);
  const last4Closures = last4Rows.map(r => r.closures || 0);

  const n = weeks.length || 1;

  const sumTotal    = total.reduce((s, v) => s + v, 0);
  const sumClients  = clients.reduce((s, v) => s + v, 0);
  const sumResp     = responses.reduce((s, v) => s + v, 0);
  const avgLead     = +(sumTotal / n).toFixed(1);
  const overallRR   = pct(sumResp, sumTotal);
  const bestWeekIdx = total.indexOf(Math.max(...total));

  const trendCfg = {
    type: "line",
    data: {
      labels: weeks,
      datasets: [
        { data: total,     borderColor: C.blue,   backgroundColor: "rgba(55,138,221,0.07)", fill: true,  tension: 0.35, pointRadius: 4, pointBackgroundColor: C.blue   },
        { data: responses, borderColor: C.green,  borderDash: [5, 3], fill: false, tension: 0.35, pointRadius: 4, pointStyle: "circle",  pointBackgroundColor: C.green  },
        { data: meets,     borderColor: C.purple, fill: false, tension: 0.35, pointRadius: 5, pointStyle: "rectRot", pointBackgroundColor: C.purple },
      ],
    },
    options: { ...baseO, scales: { x: { ticks: { color: tc, autoSkip: false }, grid: { color: gc } }, y: { beginAtZero: true, ticks: { color: tc }, grid: { color: gc } } } },
  };

  const dE = email.reduce((s, v) => s + v, 0);
  const dL = linkedin.reduce((s, v) => s + v, 0);
  const dP = phone.reduce((s, v) => s + v, 0);

  const donutCfg = {
    type: "doughnut",
    data: { labels: ["Email","LinkedIn","Phone"], datasets: [{ data: [dE, dL, dP], backgroundColor: [C.blue, C.green, C.amber], borderWidth: 0, hoverOffset: 4 }] },
    options: { ...baseO, cutout: "62%", layout: { padding: 8 } },
  };

  const stackedCfg = {
    type: "bar",
    data: {
      labels: weeks,
      datasets: [
        { data: email,    backgroundColor: C.blue,  stack: "s", borderRadius: 0 },
        { data: linkedin, backgroundColor: C.green, stack: "s", borderRadius: 0 },
        { data: phone,    backgroundColor: C.amber, stack: "s", borderRadius: 0 },
      ],
    },
    options: { ...baseO, scales: { x: { stacked: true, ticks: { color: tc, autoSkip: false }, grid: { display: false } }, y: { stacked: true, ticks: { color: tc }, grid: { color: gc } } } },
  };

  const funnelStages = [
    { label: "Leads generated",    val: sumTotal,                              color: C.blue   },
    { label: "Responses received", val: sumResp,                               color: C.green  },
    { label: "Follow-ups done",    val: followups.reduce((s, v) => s + v, 0), color: C.amber  },
    { label: "Client meets",       val: meets.reduce((s, v) => s + v, 0),     color: C.purple },
    { label: "Clients acquired",   val: sumClients,                           color: "#D85A30" },
  ];

  const sw          = selWeek < n ? selWeek : 0;
  const swRow       = chronoRows[sw] || {};
  const swEmail     = email[sw]     || 0;
  const swPhone     = phone[sw]     || 0;
  const swLinkedin  = linkedin[sw]  || 0;
  const swTotal     = total[sw]     || 0;
  const swResp      = responses[sw] || 0;
  const swReqs      = requirements[sw] || 0;
  const swMeets     = meets[sw]     || 0;
  const swClients   = clients[sw]   || 0;
  const swClosures  = closures[sw]  || 0;
  const swFollowups = followups[sw] || 0;
  const swRR        = pct(swResp, swTotal);
  const avgTotalN   = Math.round(sumTotal / n);
  const weekFunnel  = {
    leads: swTotal,
    clients: swClients,
    requirements: swReqs,
    closures: swClosures,
  };

  const reqToClosureDatasets = [
    weeklyMetric === "all" || weeklyMetric === "requirements"
      ? { label: "Requirements", data: last4Requirements, backgroundColor: "#2643ad", borderRadius: 4, barThickness: 22 }
      : null,
    weeklyMetric === "all" || weeklyMetric === "meets"
      ? { label: "Meets", data: last4Meets, backgroundColor: C.amber, borderRadius: 4, barThickness: 22 }
      : null,
    weeklyMetric === "all" || weeklyMetric === "closures"
      ? { label: "Closures", data: last4Closures, backgroundColor: C.green, borderRadius: 4, barThickness: 22 }
      : null,
  ].filter(Boolean);

  const reqToClosureCfg = {
    type: "bar",
    data: {
      labels: last4Weeks,
      datasets: reqToClosureDatasets,
    },
    options: {
      ...baseO,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#ffffff",
          titleColor: C.text,
          bodyColor: C.text,
          borderColor: C.border,
          borderWidth: 1,
          padding: 14,
          displayColors: true,
          callbacks: {
            title: items => items[0]?.label || "",
            label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y}`,
          },
        },
      },
      scales: {
        x: { ticks: { color: tc, autoSkip: false, minRotation: 35, maxRotation: 35 }, grid: { color: gc } },
        y: { beginAtZero: true, ticks: { color: tc, precision: 0 }, grid: { color: gc } },
      },
    },
  };

  const swDonutCfg = {
    type: "doughnut",
    data: { labels: ["Email","LinkedIn","Phone"], datasets: [{ data: [swEmail, swLinkedin, swPhone], backgroundColor: [C.blue, C.green, C.amber], borderWidth: 0, hoverOffset: 4 }] },
    options: { ...baseO, cutout: "62%", layout: { padding: 8 }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.parsed}` } } } },
  };

  const swBarCfg = {
    type: "bar",
    data: { labels: ["Leads","Responses","Follow-ups","Meets"], datasets: [{ data: [swTotal, swResp, swFollowups, swMeets], backgroundColor: [C.blue, C.green, C.amber, C.purple], borderRadius: 4, borderSkipped: false }] },
    options: { ...baseO, scales: { x: { ticks: { color: tc, autoSkip: false }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: tc }, grid: { color: gc } } } },
  };

  const wowMetrics = [
    { label: "Total leads", val: swTotal,     avg: avgTotalN,                         max: Math.max(...total,     1) },
    { label: "Responses",   val: swResp,      avg: Math.round(+avg(responses)),       max: Math.max(...responses, 1) },
    { label: "Meets",       val: swMeets,     avg: Math.round(+avg(meets) * 10) / 10, max: Math.max(...meets,     1) },
    { label: "Follow-ups",  val: swFollowups, avg: Math.round(+avg(followups)),       max: Math.max(...followups, 1) },
  ];

  const topCh = [
    { name: "Email",    val: swEmail    },
    { name: "LinkedIn", val: swLinkedin },
    { name: "Phone",    val: swPhone    },
  ].sort((a, b) => b.val - a.val)[0] || { name: "Email", val: 0 };

  const tabStyle = active => ({
    padding: "8px 18px", fontSize: 13, fontWeight: 500,
    border: `0.5px solid ${active ? "#AFA9EC" : C.border}`,
    borderRadius: 6,
    background: active ? "#EEEDFE" : "transparent",
    color: active ? "#3C3489" : C.sub,
    cursor: "pointer",
  });

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: C.muted, fontSize: 13 }}>Loading weekly tracker…</div>;
  }

  if (!chartReady || rows.length === 0) {
    return <div style={{ padding: 40, textAlign: "center", color: C.muted, fontSize: 13 }}>{rows.length === 0 ? "No data found." : "Preparing charts…"}</div>;
  }

  return (
    <div style={{ padding: "28px 32px", background: "#ffffff", minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>

      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: 8 }}>
        <div>
          <p style={{ margin: 0, fontSize: 17, fontWeight: 500, color: C.text }}>
            {user?.name || "BDE"} — BDE tracker
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: C.muted }}>
            {weeks[0]} ({dates[0]?.split(" ")[0]}) → {weeks[weeks.length - 1]} ({dates[dates.length - 1]?.split(" ").slice(2).join(" ")}) &nbsp;·&nbsp; Live data
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={tabStyle(tab === "weekly")} onClick={() => setTab("weekly")}>BDE weekly analysis</button>
          <button style={tabStyle(tab === "single")} onClick={() => setTab("single")}>Week drilldown</button>
        </div>
      </div>

      {/* ── PANEL: weekly ── */}
      {tab === "weekly" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10, marginBottom: "1.25rem" }}>
            <MetricCard label="Total leads (8 wks)" value={sumTotal}       sub={`${weeks[bestWeekIdx]} was best week`}                      subColor={C.green} />
            <MetricCard label="Avg leads/week"      value={avgLead}        sub="Target: 15"                                                 subColor={avgLead >= 15 ? C.green : C.red} />
            <MetricCard label="Response rate"       value={`${overallRR}%`} sub={overallRR >= 20 ? "+vs target" : "-vs target"}            subColor={overallRR >= 20 ? C.green : C.red} />
            <MetricCard label="Clients acquired"    value={sumClients}     sub={`Conv. rate ${+(sumClients / sumTotal * 100).toFixed(1)}%`} subColor={C.green} />
          </div>


          <Card style={{ marginBottom: "1.25rem" }}>
            <Sec>Lead generation trend — all {n} weeks</Sec>
            <Legend items={[
              { label: "Total leads",  color: C.blue   },
              { label: "Responses",    color: C.green,  round: true    },
              { label: "Client meets", color: C.purple, diamond: true  },
            ]} />
            <MiniChart key={`trend-${tab}`} id="c-trend" config={trendCfg} height={210} />
          </Card>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: "1.25rem", marginBottom: "1.25rem" }}>
            <Card>
              <Sec>BDE channel split (all weeks)</Sec>
              <Legend items={[
                { label: `Email ${pct(dE, dE + dL + dP)}%`,    color: C.blue  },
                { label: `LinkedIn ${pct(dL, dE + dL + dP)}%`, color: C.green },
                { label: `Phone ${pct(dP, dE + dL + dP)}%`,    color: C.amber },
              ]} />
              <MiniChart key={`donut-${tab}`} id="c-donut" config={donutCfg} height={170} />
            </Card>
            <Card>
              <Sec>BDE requirement to closure overview</Sec>
              <Legend
                activeValue={weeklyMetric}
                onItemClick={(value) => setWeeklyMetric(current => current === value ? "all" : value)}
                items={[
                  { label: "Requirements", color: C.blue, value: "requirements" },
                  { label: "Meets", color: C.amber, value: "meets" },
                  { label: "Closures", color: C.green, value: "closures" },
                ]}
              />
              <MiniChart key="c-req-closure" id="c-req-closure" config={reqToClosureCfg} height={250} />
            </Card>
          </div>
        </div>
      )}

      {/* ── PANEL: funnel ── */}

      {/* ── PANEL: single week ── */}
      {tab === "single" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: "1.25rem" }}>
            <span style={{ fontSize: 12, color: C.sub }}>Select week:</span>
            {weeks.map((w, i) => (
              <button
                key={w}
                onClick={() => setSelWeek(i)}
                style={{
                  padding: "5px 12px", fontSize: 12, fontWeight: 500,
                  border: `0.5px solid ${i === sw ? "#AFA9EC" : C.border}`,
                  borderRadius: 20,
                  background: i === sw ? "#EEEDFE" : "transparent",
                  color: i === sw ? "#3C3489" : C.sub,
                  cursor: "pointer",
                }}
              >
                {w}
              </button>
            ))}
          </div>


          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: "1.25rem", marginBottom: "1.25rem" }}>
            <Card>
              <Sec>Channel breakdown</Sec>
              <MiniChart key={`sw-donut-${sw}`} id="c-single-donut" config={swDonutCfg} height={180} />
            </Card>
            <Card>
              <Sec>Leads vs responses vs meets</Sec>
              <MiniChart key={`sw-bar-${sw}`} id="c-single-bar" config={swBarCfg} height={180} />
            </Card>
          </div>

          <Card style={{ marginBottom: "1.25rem" }}>
            <Sec>Weekly tracker snapshot</Sec>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
              <div>
                <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: C.text }}>{swRow.week || weeks[sw]}</p>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: C.muted }}>{swRow.bdName || user?.name || "BDE"} · {dates[sw]}</p>
              </div>
              <div style={{ padding: "8px 12px", borderRadius: 999, background: "#EEEDFE", color: "#3C3489", fontSize: 12, fontWeight: 600 }}>
                {swClients > 0 ? `${swClients} client${swClients > 1 ? "s" : ""} acquired` : "Pipeline in progress"}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: 10, marginBottom: 10 }}>
              <DetailTile label="New Clients" value={swClients} color={C.green} />
              <DetailTile label="Total Leads" value={swTotal} color={C.blue} />
              <DetailTile label="Email Leads" value={swEmail} color={C.blue} />
              <DetailTile label="Phone Leads" value={swPhone} color={C.amber} />
              <DetailTile label="LinkedIn Leads" value={swLinkedin} color={C.green} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10 }}>
              <DetailTile label="Responses" value={swResp} color={C.green} />
              <DetailTile label="Follow-ups" value={swFollowups} color={C.amber} />
              <DetailTile label="Client Meet" value={swMeets} color={C.purple} />
              <DetailTile label="Remarks" value={swRow.remarks || "No remarks"} color={swRow.remarks ? C.text : C.muted} />
            </div>
          </Card>

        </div>
      )}
    </div>
  );
}
