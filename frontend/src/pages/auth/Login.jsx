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

      login(result.user);
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
          <form onSubmit={handleLogin} style={styles.form}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
            />

            {error && <p style={styles.error}>{error}</p>}

            <button type="submit" style={styles.loginBtn}>
              Login
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
  },
  loginBtn: {
    padding: "10px",
    background: "#111827",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontWeight: "600",
  },
  loginLoaderWrap: {
    minHeight: "220px",
  },
  error: {
    color: "red",
    fontSize: "13px",
    textAlign: "center",
  },
};
