// src/services/authService.js

import { supabase } from "./supabaseClient";
import { canonicalizeRole } from "../utils/roles";
import { apiFetch } from "../utils/apiFetch";

export async function normalizeAllUserRoles() {
  try {
    const { data: users, error } = await supabase.from("users").select("id,role");
    if (error) {
      console.error("[auth] normalizeAllUserRoles fetch failed", error);
      return;
    }

    const updates = (users || [])
      .map((user) => {
        const currentRole = user?.role ?? null;
        const normalizedRole = canonicalizeRole(currentRole);
        if (!user?.id || !currentRole || normalizedRole === currentRole) return null;
        return { id: user.id, role: normalizedRole };
      })
      .filter(Boolean);

    if (updates.length === 0) return;

    const results = await Promise.all(
      updates.map((update) =>
        supabase.from("users").update({ role: update.role }).eq("id", update.id)
      )
    );

    const firstError = results.find((result) => result.error)?.error;
    if (firstError) {
      console.error("[auth] normalizeAllUserRoles update failed", firstError);
    }
  } catch (err) {
    console.error("[auth] normalizeAllUserRoles failed", err);
  }
}

/* -----------------------------
   LOGIN (Supabase Auth)
------------------------------*/
export async function loginWithEmail(email, password) {
  try {
    const normalizedEmail = (email || "").trim().toLowerCase();

    const { data, error } = await Promise.race([
      supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Login timed out")), 10000)
      ),
    ]);

    if (error) return { error: error.message };

    const user = data?.user;
    if (!user) return { error: "Login failed" };

    const accessToken = data?.session?.access_token || null;

    const { data: profile, error: profileError } = await Promise.race([
      supabase
        .from("users")
        .select("id, role, name, phone_number")
        .eq("auth_id", user.id)
        // Defensive: some environments ended up with duplicate rows for the same auth_id.
        // limit(1) avoids PostgREST's "multiple rows returned" error when using maybeSingle().
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Profile lookup timed out")), 10000)
      ),
    ]);

    if (profileError) {
      console.error("[auth] profile fetch failed", profileError);
    }

    const normalizedRole = canonicalizeRole(profile?.role);
    if (!profile?.id) {
      return { error: "User profile not found. Please contact an admin." };
    }
    if (!normalizedRole) {
      return {
        error:
          "Your account is missing a valid role (or has duplicate user records). Please contact an admin.",
      };
    }

    supabase
      .from("users")
      .update({ is_online: true, last_seen_at: new Date().toISOString() })
      .eq("auth_id", user.id)
      .then(({ error: onlineError }) => {
        if (onlineError) console.error("[auth] online status update failed", onlineError);
      });

    return {
      accessToken,
      user: {
        // `id` must be the `public.users.id` (used across the app, e.g. heartbeat updates).
        id: profile.id,
        auth_id: user.id,
        email: user.email,
        role: normalizedRole,
        name: profile?.name || user.email.split("@")[0],
      },
    };
  } catch (err) {
    console.error("[auth] login error", err);
    return { error: "Unexpected login error" };
  }
}

/* -----------------------------
   GET CURRENT USER
------------------------------*/
export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("users")
    .select("id, role, name, phone_number")
    .eq("auth_id", data.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const normalizedRole = canonicalizeRole(profile?.role);
  if (!normalizedRole) return null;

  return {
    id: profile?.id ?? null,
    auth_id: data.user.id,
    email: data.user.email,
    role: normalizedRole,
    name: profile?.name || data.user.email.split("@")[0],
  };
}

/* -----------------------------
   LOGOUT
------------------------------*/
export async function logout(userId) {
  if (userId) {
    await supabase
      .from("users")
      .update({ is_online: false, last_seen_at: new Date().toISOString() })
      .eq("auth_id", userId);
  }

  const { error } = await supabase.auth.signOut();

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

/* -----------------------------
   ONLINE STATUS
------------------------------*/
export async function setUserOnlineStatus(userId, isOnline) {
  if (!userId) return;

  const { error } = await supabase
    .from("users")
    .update({
      is_online: isOnline,
      last_seen_at: new Date().toISOString(),
    })
    .eq("auth_id", userId);

  if (error) {
    console.error("[auth] setUserOnlineStatus failed", error);
  }
}

/* -----------------------------
   CREATE USER (Recruiter / TL / etc.)
   Primary path: backend /admin/users (service-role, no duplicate risk)
   Fallback path: supabase.auth.signUp — cleans up any trigger-inserted duplicate rows
------------------------------*/
export async function addRecruiter({
  email,
  password,
  phone,
  role = "recruiter",
  name = null,
}) {
  const normalizedRole = canonicalizeRole(role || "recruiter");
  const normalizedEmail = (email || "").trim().toLowerCase();

  if (!normalizedRole) {
    return { error: "Invalid role selected" };
  }

  // ── Primary: backend route using service-role key ──────────────────────────
  // This is the safest path — backend controls both auth.users and public.users
  // insertion atomically, so no duplicates.
  try {
    const res = await apiFetch("/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email: normalizedEmail,
        password,
        role: normalizedRole,
        name,
        phone_number: phone || null,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { error: body?.error || "Failed to create user" };
    }

    return { success: true };
  } catch (e) {
    // IMPORTANT: Do NOT fall back to supabase.auth.signUp.
    // If the backend /admin/users call partially succeeded (auth created and
    // a trigger inserted a default profile row), the fallback will create a
    // second profile row, producing recruiter+tl duplicates.
    return { error: e?.message || "Failed to create user" };
  }
}
