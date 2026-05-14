import { supabase } from "./supabaseClient";

async function requireSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const session = data?.session;
  if (!session) throw new Error("Not authenticated");
  return session;
}

export async function listRequirements() {
  await requireSession();
  const { data, error } = await supabase
    .from("requirements")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function listActivities() {
  await requireSession();
  const { data, error } = await supabase
    .from("activities")
    .select("*")
    .order("activity_datetime", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function listFollowUps() {
  await requireSession();
  const { data, error } = await supabase
    .from("activities")
    .select("*, companies(company_name, contact_person)")
    .order("activity_datetime", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createActivity(payload) {
  const session = await requireSession();
  const createdBy = session.user?.email || null;
  const { data, error } = await supabase
    .from("activities")
    .insert([{ ...payload, created_by: createdBy }])
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateActivity(id, payload) {
  await requireSession();
  const { data, error } = await supabase
    .from("activities")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
