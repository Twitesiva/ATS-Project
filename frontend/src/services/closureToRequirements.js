import { supabase } from "./supabaseClient";

async function resolveCreatedByEmail(bdName) {
  const raw = String(bdName || "").trim();
  if (!raw) return null;
  if (raw.includes("@")) return raw;

  const escaped = raw.replace(/,/g, " ");
  const { data, error } = await supabase
    .from("users")
    .select("email")
    .or(`email.ilike.%${escaped}%,name.ilike.%${escaped}%`)
    .limit(1);

  if (error) return raw;
  return String(data?.[0]?.email || "").trim() || raw;
}

async function resolveCompanyId(clientName) {
  const name = String(clientName || "").trim();
  if (!name) return null;

  const { data, error } = await supabase
    .from("companies")
    .select("id")
    .ilike("company_name", name)
    .order("id", { ascending: false })
    .limit(1);

  if (error) throw error;
  return data?.[0]?.id ?? null;
}

export async function mirrorClosureRowToRequirements(revenueRow) {
  const clientName = revenueRow?.client_name;
  const companyId = await resolveCompanyId(clientName);
  if (!companyId) throw new Error(`Client "${clientName}" not found in companies`);

  const createdBy = await resolveCreatedByEmail(revenueRow?.bd_name);

  const requirementPayload = {
    company_id: companyId,
    job_title: revenueRow?.position || "Closure",
    hire: revenueRow?.hire || null,
    status: "In Progress",
    location: revenueRow?.location || null,
    description: [
      revenueRow?.candidate_name ? `Candidate: ${revenueRow.candidate_name}` : null,
      revenueRow?.offer_status ? `Offer Status: ${revenueRow.offer_status}` : null,
      revenueRow?.doj ? `DOJ: ${revenueRow.doj}` : null,
    ].filter(Boolean).join(" | ") || null,
    created_by: createdBy,
    created_at: revenueRow?.doj ? new Date(revenueRow.doj).toISOString() : new Date().toISOString(),
  };

  const { error } = await supabase.from("requirements").insert([requirementPayload]);
  if (error) throw error;
  return true;
}

export async function mirrorClosureRowsToRequirements(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const results = await Promise.allSettled(list.map((r) => mirrorClosureRowToRequirements(r)));
  return {
    ok: results.every((r) => r.status === "fulfilled"),
    results,
  };
}

