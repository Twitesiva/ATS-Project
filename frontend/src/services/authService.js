import { supabase } from "./supabaseClient";
import { canonicalizeRole } from "../utils/roles";

export async function normalizeAllUserRoles() {
  const [managerFix, recruiterFix, tlFix, hrFix] = await Promise.all([
    supabase.from("users").update({ role: "manager" }).eq("role", "Manager"),
    supabase.from("users").update({ role: "recruiter" }).eq("role", "Recruiter"),
    supabase.from("users").update({ role: "tl" }).eq("role", "TL"),
    supabase.from("users").update({ role: "hr" }).eq("role", "HR"),
  ]);

  const error = managerFix.error || recruiterFix.error || tlFix.error || hrFix.error;
  if (error) {
    console.error("[auth] normalizeAllUserRoles failed", error);
    return { error };
  }

  return { success: true };
}

export async function loginWithEmail(email, password) {
  await normalizeAllUserRoles();

  try {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", email.trim())
      .eq("password", password)
      .maybeSingle();

    if (error) {
      console.error("[auth] login query error", error);
      return { error: error.message || "Database connection error" };
    }

    if (!data) {
      return { error: "Invalid email or password" };
    }

  const normalizedRole = canonicalizeRole(data.role);
  const dbNormalizedRole = String(data.role || "").trim().toLowerCase();

  if (dbNormalizedRole !== normalizedRole && normalizedRole && dbNormalizedRole !== "admin") {
    const { error: roleNormalizeError } = await supabase
      .from("users")
      .update({ role: normalizedRole })
      .eq("id", data.id);

    if (roleNormalizeError) {
      console.error("[auth] role normalize failed", roleNormalizeError);
    }
  }

  const { error: onlineError } = await supabase
    .from("users")
    .update({ is_online: true, last_seen_at: new Date().toISOString() })
    .eq("id", data.id);

  if (onlineError) {
    console.error("[auth] is_online update failed", onlineError);
  }

      return {
        user: {
          id: data.id,
          email: data.email,
          role: normalizedRole,
          name: data.name || data.email.split("@")[0],
        },
      };
    } catch (err) {
      console.error("[auth] unexpected login error", err);
      return { error: "An unexpected error occurred during login" };
    }
}

export async function setUserOnlineStatus(userId, isOnline) {
  if (!userId) return;

  const { error } = await supabase
    .from("users")
    .update({ is_online: isOnline })
    .eq("id", userId);

  if (error) {
    console.error("[auth] setUserOnlineStatus failed", { userId, isOnline, error });
  }
}

export async function addRecruiter({ email, password, phone, role = "recruiter", name = null }) {
  const normalizedRole = canonicalizeRole(role || "recruiter");

  const { error } = await supabase
    .from("users")
    .insert([
      {
        email,
        password,
        phone_number: phone,
        role: normalizedRole,
        name: name || email?.split("@")[0] || null,
      },
    ]);

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
