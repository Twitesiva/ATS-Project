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

    // ✅ FIX: capture the JWT access token from the session
    const accessToken = data?.session?.access_token || null;

    const { data: profile, error: profileError } = await Promise.race([
      supabase
        .from("users")
        .select("role, name, phone_number")
        .eq("auth_id", user.id)
        .maybeSingle(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Profile lookup timed out")), 10000)
      ),
    ]);

    if (profileError) {
      console.error("[auth] profile fetch failed", profileError);
    }

    const normalizedRole = canonicalizeRole(profile?.role);

    // Don't block login flow on online-status update.
    supabase
      .from("users")
      .update({ is_online: true, last_seen_at: new Date().toISOString() })
      .eq("auth_id", user.id)
      .then(({ error: onlineError }) => {
        if (onlineError) console.error("[auth] online status update failed", onlineError);
      });

    return {
      // ✅ FIX: return accessToken so Login.js can pass it to AuthContext
      accessToken,
      user: {
        id: user.id,
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
    .select("role, name, phone_number")
    .eq("auth_id", data.user.id)
    .maybeSingle();

  const normalizedRole = canonicalizeRole(profile?.role);

  return {
    id: data.user.id,
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
   CREATE RECRUITER
   Uses Supabase Auth — NO password stored in users table
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

  // Preferred: create user via backend using service-role (creates auth.users + users row).
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
    // Fallback for older deployments with no backend route configured.
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
    });

    if (signUpError) {
      return { error: signUpError.message };
    }

    const userId = data?.user?.id;

    if (!userId) {
      return { error: "Failed to create auth user" };
    }

    const userRow = {
      auth_id: userId,
      email: normalizedEmail,
      phone_number: phone,
      role: normalizedRole,
      name: name || normalizedEmail.split("@")[0] || null,
    };

    const { error: upsertError } = await supabase
      .from("users")
      .upsert([userRow], { onConflict: "email" });

    if (upsertError) return { error: upsertError.message };

    return { success: true };
  }
}
