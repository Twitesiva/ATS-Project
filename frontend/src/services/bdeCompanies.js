import { supabase } from "./supabaseClient";

async function requireSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const session = data?.session;
  if (!session) throw new Error("Not authenticated");
  return session;
}

export async function listCompanies({ status, search } = {}) {
  await requireSession();
  let q = supabase
    .from("companies")
    .select("*")
    .order("created_at", { ascending: false });

  if (status) q = q.eq("status", status);
  if (search) {
    const term = String(search).trim();
    if (term) {
      // Search across common text columns
      const escaped = term.replaceAll('"', '\\"');
      q = q.or(
        `company_name.ilike.%${escaped}%,contact_person.ilike.%${escaped}%,email.ilike.%${escaped}%,phone.ilike.%${escaped}%`
      );
    }
  }

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function createCompany(payload) {
  const session = await requireSession();
  const createdBy = session.user?.email || null;
  const { data, error } = await supabase
    .from("companies")
    .insert([{ ...payload, created_by: createdBy }])
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateCompany(id, payload) {
  await requireSession();
  const { data, error } = await supabase
    .from("companies")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCompany(id) {
  await requireSession();
  const { error } = await supabase.from("companies").delete().eq("id", id);
  if (error) throw error;
  return true;
}

