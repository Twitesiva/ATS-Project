import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { loginWithEmail } from "../../services/authService";
import { useAuth } from "../../context/AuthContext";
import Loader from "../../components/common/Loader";
import { getRoleHomePath } from "../../utils/roles";

export default function Login({ title = "ATS Login" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Please enter email and password");
      return;
    }

    setLoading(true);
    try {
      const result = await loginWithEmail(email, password);
      if (result.error) {
        setError(result.error);
        return;
      }

      // ✅ FIX: pass accessToken as second argument so AuthContext stores it
      // This makes the JWT available for all API calls as: Authorization: Bearer <token>
      login(result.user, result.accessToken);

      const nextPath = getRoleHomePath(result.user.role);
      if (nextPath === "/login") {
        setError("Invalid user role");
      } else {
        navigate(nextPath);
      }
    } finally {
      setLoading(false);
    }
  };

  const resolvedTitle = location.pathname === "/hr-login" ? "HR Login" : title;

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>{resolvedTitle}</h2>

        {loading ? (
          <div style={styles.loginLoaderWrap}>
            <Loader text="Signing in..." />
          </div>
        ) : (
          <form style={styles.form} onSubmit={handleLogin}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
              autoComplete="email"
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              autoComplete="current-password"
            />

            {error && <p style={styles.error}>{error}</p>}

            <button type="submit" style={styles.loginBtn}>
              Login
            </button>

            <div style={styles.divider}>
              <span style={styles.dividerLine} />
              <span style={styles.dividerText}>or</span>
              <span style={styles.dividerLine} />
            </div>

            <button
              type="button"
              onClick={() => navigate("/signup")}
              style={styles.signupBtn}
            >
              Sign Up (HR Only)
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    height: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#f3f4f6",
  },
  card: {
    width: "360px",
    padding: "24px",
    borderRadius: "8px",
    background: "#ffffff",
    boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
  },
  title: {
    textAlign: "center",
    marginBottom: "20px",
    fontSize: "22px",
    fontWeight: "700",
    color: "#111827",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  input: {
    padding: "10px",
    borderRadius: "6px",
    border: "1px solid #d1d5db",
    fontSize: "14px",
    outline: "none",
  },
  loginBtn: {
    padding: "10px",
    background: "#111827",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "14px",
  },
  signupBtn: {
    padding: "10px",
    background: "#ffffff",
    color: "#111827",
    border: "2px solid #111827",
    borderRadius: "6px",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "14px",
  },
  divider: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    margin: "4px 0",
  },
  dividerLine: {
    flex: 1,
    height: "1px",
    background: "#e5e7eb",
  },
  dividerText: {
    fontSize: "12px",
    color: "#9ca3af",
  },
  loginLoaderWrap: {
    minHeight: "220px",
  },
  error: {
    color: "red",
    fontSize: "13px",
    textAlign: "center",
    margin: "0",
  },
};
