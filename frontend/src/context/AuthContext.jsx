import { createContext, useContext, useEffect, useState } from "react";
import { canonicalizeRole } from "../utils/roles";

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
    const saved = localStorage.getItem("ats_user");
    const parsed = saved ? JSON.parse(saved) : null;
    const normalized = normalizeUserRole(parsed);
    setUser(normalized);

    if (normalized) {
      localStorage.setItem("ats_user", JSON.stringify(normalized));
    }

    setAuthLoading(false);
  }, []);

  const login = (userData) => {
    const normalized = normalizeUserRole(userData);
    setUser(normalized);
    localStorage.setItem("ats_user", JSON.stringify(normalized));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("ats_user");
  };

  return (
    <AuthContext.Provider value={{ user, authLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
