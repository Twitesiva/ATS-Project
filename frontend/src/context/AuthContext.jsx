import { createContext, useContext, useEffect, useState } from "react";
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

  useEffect(() => {
    // Restore user profile from localStorage on page reload
    const saved = localStorage.getItem("ats_user");
    const parsed = saved ? JSON.parse(saved) : null;
    const normalized = normalizeUserRole(parsed);
    setUser(normalized);

    if (normalized) {
      localStorage.setItem("ats_user", JSON.stringify(normalized));
    }

    setAuthLoading(false);
  }, []);

  useEffect(() => {
    // Restore JWT from existing Supabase session (important on page reload)
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

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session?.access_token) {
          localStorage.setItem("ats_access_token", session.access_token);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Call this after successful Supabase login:
  // login(userProfile, session.access_token)

  const login = (userData, accessToken) => {
    const normalized = normalizeUserRole(userData);
    setUser(normalized);
    localStorage.setItem("ats_user", JSON.stringify(normalized));

    // Save JWT so all API calls can attach it as: Authorization: Bearer <token>
    if (accessToken) {
      localStorage.setItem("ats_access_token", accessToken);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("ats_user");
    localStorage.removeItem("ats_access_token");
  };

  // Helper to get the token for API calls:
  // const { getToken } = useAuth();
  // fetch('/api/...', { headers: { Authorization: `Bearer ${getToken()}` } })
  const getToken = () => localStorage.getItem("ats_access_token");

  return (
    <AuthContext.Provider value={{ user, authLoading, login, logout, getToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
