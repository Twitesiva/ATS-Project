export const sanitizeMarginValue = (value) => {
  const cleaned = String(value ?? "")
    .replace(/[\u20B9,\s]/g, "")
    .replace(/lpa/gi, "")
    .trim();

  const numeric = parseFloat(cleaned);
  return Number.isFinite(numeric) ? numeric : 0;
};
const STATUS_ALIAS_MAP = {
  // ── Drop Out variants ──────────────────────────
  "backout":          "Drop Out",
  "back out":         "Drop Out",
  "dropped out":      "Drop Out",
  "dropout":          "Drop Out",
  // "drop out" is already the canonical form, keep as-is

  // ── Reject variants ───────────────────────────
  "screen reject":    "Screen Reject",   // "Screen reject" (lowercase r)

  // ── Position Hold variants ────────────────────
  "position hold":    "Position On Hold",
  // "position on hold" is already canonical
};

const STATUS_GROUP_MAP = {
  "submitted": "Submitted",
  "profile submitted": "Submitted",
  "selected": "Screening Selected",
  "screen select": "Screening Selected",
  "shortlisted": "Screening Selected",
  "rejected": "Screening Rejected",
  "screen reject": "Screening Rejected",
  "screen rejected": "Screening Rejected",
  "profile rejected": "Screening Rejected",
  "duplicate": "Screening Rejected",
  "interview scheduled": "Interview In Progress",
  "interviewed": "Interview In Progress",
  "l1 scheduled": "Interview In Progress",
  "l2 scheduled": "Interview In Progress",
  "ai interview": "AI Interview",
  "interview rejected": "Interview Rejected",
  "l1 reject": "Interview Rejected",
  "l2 reject": "Interview Rejected",
  "final round reject": "Interview Rejected",
  "final round rejected": "Interview Rejected",
  "offered": "Offered",
  "offer released": "Offered",
  "offer rejected": "Offer Rejected",
  "closure": "Closed",
  "joined": "Closed",
  "position closed": "Closed",
  "drop out": "Dropped",
  "drop out by candidate": "Dropped",
  "drop out by client": "Dropped",
  "backout": "Dropped",
  "back out": "Dropped",
  "dropped out": "Dropped",
  "dropout": "Dropped",
  "on hold": "On Hold",
  "position hold": "On Hold",
  "position on hold": "On Hold",
  "feedback pending": "On Hold",
};

export function normalizeStatus(status) {
  if (!status) return "Unknown";
  const key = status.toLowerCase().trim();

  if (STATUS_GROUP_MAP[key]) return STATUS_GROUP_MAP[key];

  // Check alias map (case-insensitive)
  for (const [alias, canonical] of Object.entries(STATUS_ALIAS_MAP)) {
    if (alias === key) return canonical;
  }

  // Return trimmed original (preserves casing for non-duplicates)
  return status.trim();
}
export const formatCurrency = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "INR 0";
  return `INR ${num.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
};

export const groupByMonth = (rows, dateKey, valueKey) => {
  const map = new Map();

  (rows || []).forEach((row) => {
    const date = new Date(row?.[dateKey]);
    if (Number.isNaN(date.getTime())) return;

    const label = date.toLocaleString("en-IN", {
      month: "short",
      year: "numeric",
    });

    const current = map.get(label) || 0;
    const value = valueKey ? sanitizeMarginValue(row?.[valueKey]) : 1;
    map.set(label, current + value);
  });

  return Array.from(map.entries()).map(([month, value]) => ({
    month,
    value,
    revenue: value,
  }));
};
export const parseRevenueValue = (value) => {
  const cleanValue = String(value ?? "")
    .replace(/[\u20B9,LPA\s]/gi, "")
    .trim();
  const numericValue = parseFloat(cleanValue);
  return Number.isFinite(numericValue) ? numericValue : 0;
};

export const normalizeClient = (value) => {
  const name = String(value || "").trim();
  return name || "Unknown";
};

export const calculateConversionRate = (numerator, denominator) => {
  const num = Number(numerator) || 0;
  const den = Number(denominator) || 0;
  if (den <= 0) return 0;
  return (num / den) * 100;
};

export const toDateInputValue = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().split("T")[0];
};

// Normalize recruiter name consistently across Dashboard and Reports
export const normalizeRecruiter = (value) => {
  const name = String(value || "").trim();
  if (!name) return "Unknown";
  const cleaned = name.includes("@") ? name.split("@")[0] : name;
  return cleaned
    .split(/[\s_]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
};
