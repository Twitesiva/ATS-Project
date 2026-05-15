import { createContext, useContext, useEffect, useState, useRef } from "react";
import { canonicalizeRole } from "../utils/roles";
import { supabase } from "../services/supabaseClient";

const AuthContext = createContext();

const normalizeUserRole = (userData) => {
  if (!userData) return null;
  return {
    ...userData,
    role: canonicalizeRole(userData.role),
  };
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const heartbeatRef = useRef(null);

  // ── Heartbeat: update last_seen_at every 30s while tab is open ──
  const startHeartbeat = (userId) => {
    stopHeartbeat(); // clear any existing

    // Mark online immediately
    supabase
      .from("users")
      .update({ is_online: true, last_seen_at: new Date().toISOString() })
      .eq("id", userId);

    // Update last_seen_at every 30 seconds
    heartbeatRef.current = setInterval(() => {
      supabase
        .from("users")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", userId);
    }, 30000);
  };

  const stopHeartbeat = () => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  };

  // ── Restore user from localStorage on page reload ──
  useEffect(() => {
    const saved = localStorage.getItem("ats_user");
    const parsed = saved ? JSON.parse(saved) : null;
    const normalized = normalizeUserRole(parsed);
    setUser(normalized);

    if (normalized) {
      localStorage.setItem("ats_user", JSON.stringify(normalized));
      startHeartbeat(normalized.id); // restart heartbeat on reload
    }

    setAuthLoading(false);
  }, []);

  // ── Restore JWT from Supabase session on page reload ──
  useEffect(() => {
    const restoreSessionToken = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) return;
        const token = data?.session?.access_token;
        if (token) localStorage.setItem("ats_access_token", token);
      } catch {
        // no-op
      }
    };
    restoreSessionToken();
  }, []);

  // ── Sync JWT token on auth state change ──
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session?.access_token) {
          localStorage.setItem("ats_access_token", session.access_token);
        }
        // If session ends (token expired), stop heartbeat and mark offline
        if (event === "SIGNED_OUT" || !session) {
          const saved = localStorage.getItem("ats_user");
          const parsed = saved ? JSON.parse(saved) : null;
          if (parsed?.id) {
            supabase
              .from("users")
              .update({ is_online: false, last_seen_at: new Date().toISOString() })
              .eq("id", parsed.id);
          }
          stopHeartbeat();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // ── Cleanup heartbeat on unmount ──
  useEffect(() => {
    return () => stopHeartbeat();
  }, []);

  const login = (userData, accessToken) => {
    const normalized = normalizeUserRole(userData);
    setUser(normalized);
    localStorage.setItem("ats_user", JSON.stringify(normalized));

    if (accessToken) {
      localStorage.setItem("ats_access_token", accessToken);
    }

    // ✅ Start heartbeat on login
    if (normalized?.id) {
      startHeartbeat(normalized.id);
    }
  };

  const logout = (userId) => {
    // ✅ Stop heartbeat on logout
    stopHeartbeat();

    // Mark offline
    const id = userId || user?.id;
    if (id) {
      supabase
        .from("users")
        .update({ is_online: false, last_seen_at: new Date().toISOString() })
        .eq("id", id);
    }

    setUser(null);
    localStorage.removeItem("ats_user");
    localStorage.removeItem("ats_access_token");
  };

  const getToken = () => localStorage.getItem("ats_access_token");

  return (
    <AuthContext.Provider value={{ user, authLoading, login, logout, getToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);