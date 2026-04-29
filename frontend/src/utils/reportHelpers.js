export const sanitizeMarginValue = (value) => {
  const cleaned = String(value ?? "")
    .replace(/[\u20B9,\s]/g, "")
    .replace(/lpa/gi, "")
    .trim();

  const numeric = parseFloat(cleaned);
  return Number.isFinite(numeric) ? numeric : 0;
};

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

  return Array.from(map.entries()).map(([month, value]) => ({ month, value }));
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
