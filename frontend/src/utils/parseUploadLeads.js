import Papa from "papaparse";
import * as XLSX from "xlsx";

function normalizeHeader(h) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "")
    .replaceAll("-", "_");
}

function getFirst(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "") return row[k];
  }
  return undefined;
}

function coercePhone10(v) {
  const digits = String(v || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return digits;
  // if length > 10, keep last 10
  if (digits.length > 10) return digits.slice(-10);
  return null;
}

function toArrayOrNull(v) {
  if (!v && v !== 0) return null;
  if (Array.isArray(v)) return v.filter(Boolean);
  const s = String(v).trim();
  if (!s) return null;
  if (s.startsWith("{") && s.endsWith("}")) {
    return s
      .slice(1, -1)
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }
  if (s.includes(",")) {
    return s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return [s];
}

export async function parseLeadsFile(file) {
  const name = (file?.name || "").toLowerCase();

  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheetName = wb.SheetNames?.[0];
    const ws = wb.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json(ws, { defval: "" });

    return raw.map((r) => normalizeRow(r));
  }

  if (name.endsWith(".csv")) {
    const text = await file.text();
    const parsed = await new Promise((resolve, reject) => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => resolve(res),
        error: (err) => reject(err),
      });
    });

    const rows = parsed?.data || [];
    return rows.map((r) => normalizeRow(r));
  }

  throw new Error("Unsupported file type. Please upload .csv or .xlsx/.xls");
}

function normalizeRow(row) {
  // Build normalized key map from row
  const normalized = {};
  for (const [k, v] of Object.entries(row || {})) {
    normalized[normalizeHeader(k)] = v;
  }

  const company_name = getFirst(normalized, ["company_name", "company", "companyname", "client", "companyname_"]);
  const contact_person = getFirst(normalized, ["contact_person", "contact", "poc", "pointofcontact", "point_of_contact"]);
  const poc = getFirst(normalized, ["poc", "pocs", "pointofcontact", "point_of_contact"]);
  const mode_of_source = getFirst(normalized, ["mode_of_source", "modeofsource", "mode", "source_mode"]);
  const email = getFirst(normalized, ["email"]);
  const phone = getFirst(normalized, ["phone", "mobile", "contact_number"]);
  const status = getFirst(normalized, ["status", "lead_status", "leadstatus"]) || "New";
  const priority = getFirst(normalized, ["priority", "lead_priority", "priority_level"]) || "Medium Priority";
  const source = getFirst(normalized, ["source"]);
  const industry = getFirst(normalized, ["industry"]);
  const website = getFirst(normalized, ["website", "url"]);
  const notes = getFirst(normalized, ["notes", "note", "description"]);

  const phone10 = coercePhone10(phone);

  // Prefer explicit POC if provided; otherwise use contact_person
  const pocVal = poc !== undefined && poc !== null && String(poc).trim() !== "" ? toArrayOrNull(poc) : toArrayOrNull(contact_person);

  return {
    company_name: String(company_name || "").trim(),
    contact_person: contact_person ? String(contact_person).trim() : null,
    poc: pocVal ? pocVal : null,
    mode_of_source: mode_of_source ? String(mode_of_source).trim() : null,
    email: email ? String(email).trim() : null,
    phone: phone10,
    status: String(status).trim(),
    priority: String(priority).trim(),
    source: source ? String(source).trim() : "LinkedIn",
    industry: industry ? String(industry).trim() : null,
    website: website ? String(website).trim() : null,
    notes: notes ? String(notes).trim() : null,
  };
}

