import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../services/supabaseClient";

// 🔐 Only HR will know this code
const HR_SECRET_CODE = "TWITE@HR2026";

const STEPS = {
  CODE: "code",
  REGISTER: "register",
  SUCCESS: "success",
};

export default function HRSignup() {
  const navigate = useNavigate();
  const signupInFlightRef = useRef(false);

  const [step, setStep] = useState(STEPS.CODE);
  const [isFirstSetup, setIsFirstSetup] = useState(false);

  // Step 1
  const [secretCode, setSecretCode] = useState("");
  const [codeError, setCodeError] = useState("");

  // Step 2
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // ── Check if this is first-time setup (no HR exists) ──────────────────────
  useEffect(() => {
    const checkHR = async () => {
      try {
        const { data } = await supabase.rpc("check_hr_exists");
        setIsFirstSetup(!data); // true = no HR exists yet
      } catch (err) {
        console.error("[HRSignup] HR check failed", err);
      }
    };
    checkHR();
  }, []);

  // Step 1: Verify secret code
  const handleCodeSubmit = () => {
    if (!secretCode.trim()) {
      setCodeError("Please enter the secret code");
      return;
    }
    if (secretCode.trim() !== HR_SECRET_CODE) {
      setCodeError("Invalid code. Access denied.");
      return;
    }
    setCodeError("");
    setStep(STEPS.REGISTER);
  };

  // Step 2: Create HR account
  const handleSignup = async () => {
    if (signupInFlightRef.current || loading) return;

    setError("");

    if (!name || !email || !password) {
      setError("Please fill in all fields");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    signupInFlightRef.current = true;
    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      // Create user in Supabase Auth
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      const authUser = data?.user;
      if (!authUser) {
        setError("Failed to create auth account");
        return;
      }

      // Upsert user row to avoid accidental duplicates (e.g., double-click / retry)
      const { error: upsertError } = await supabase.from("users").upsert(
        [
          {
            auth_id: authUser.id,
            email: normalizedEmail,
            role: "HR",
            name,
            created_at: new Date().toISOString(),
          },
        ],
        { onConflict: "email" }
      );

      if (upsertError) {
        // If the DB doesn't have a unique constraint on `email`, fall back to select+update/insert.
        const needsFallback =
          upsertError?.code === "42P10" ||
          /there is no unique or exclusion constraint/i.test(
            upsertError?.message || ""
          );

        if (!needsFallback) {
          setError(upsertError.message);
          return;
        }

        const { data: existingUser, error: lookupError } = await supabase
          .from("users")
          .select("id")
          .eq("email", normalizedEmail)
          .maybeSingle();

        if (lookupError) {
          setError(lookupError.message);
          return;
        }

        if (existingUser?.id) {
          const { error: updateError } = await supabase
            .from("users")
            .update({ auth_id: authUser.id, role: "HR", name })
            .eq("id", existingUser.id);

          if (updateError) {
            setError(updateError.message);
            return;
          }
        } else {
          const { error: insertError } = await supabase.from("users").insert([
            {
              auth_id: authUser.id,
              email: normalizedEmail,
              role: "HR",
              name,
              created_at: new Date().toISOString(),
            },
          ]);

          if (insertError) {
            setError(insertError.message);
            return;
          }
        }
      }

      setStep(STEPS.SUCCESS);
    } catch (err) {
      console.error("[HRSignup] error", err);
      setError("Unexpected error. Please try again.");
    } finally {
      setLoading(false);
      signupInFlightRef.current = false;
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>

        {/* ── First-setup banner (only shown when no HR exists) ── */}
        {isFirstSetup && (
          <div style={styles.setupBanner}>
            🚀 No HR account found. Please create the first HR account to get started.
          </div>
        )}

        {/* Step 1: Secret Code */}
        {step === STEPS.CODE && (
          <>
            <h2 style={styles.title}>HR Sign Up</h2>
            <p style={styles.subtitle}>Enter the secret code to continue</p>
            <div style={styles.form}>
              <input
                type="password"
                placeholder="Secret Code"
                value={secretCode}
                onChange={(e) => setSecretCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCodeSubmit()}
                style={styles.input}
                autoComplete="off"
              />
              {codeError && <p style={styles.error}>{codeError}</p>}
              <button onClick={handleCodeSubmit} style={styles.primaryBtn}>
                Verify Code
              </button>
              {/* Only show Back to Login if this is NOT first-time setup */}
              {!isFirstSetup && (
                <button onClick={() => navigate("/login")} style={styles.backBtn}>
                  ← Back to Login
                </button>
              )}
            </div>
          </>
        )}

        {/* Step 2: Register */}
        {step === STEPS.REGISTER && (
          <>
            <h2 style={styles.title}>Create HR Account</h2>
            <p style={styles.subtitle}>Fill in your details below</p>
            <div style={styles.form}>
              <input
                type="text"
                placeholder="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={styles.input}
                autoComplete="name"
              />
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
                autoComplete="new-password"
              />
              {error && <p style={styles.error}>{error}</p>}
              <button
                onClick={handleSignup}
                style={{ ...styles.primaryBtn, opacity: loading ? 0.7 : 1 }}
                disabled={loading}
              >
                {loading ? "Creating Account..." : "Sign Up"}
              </button>
              {!isFirstSetup && (
                <button onClick={() => navigate("/login")} style={styles.backBtn}>
                  ← Back to Login
                </button>
              )}
            </div>
          </>
        )}

        {/* Step 3: Success */}
        {step === STEPS.SUCCESS && (
          <div style={styles.successWrap}>
            <div style={styles.successIcon}>✓</div>
            <h2 style={styles.title}>Account Created!</h2>
            <p style={styles.subtitle}>
              Your HR account has been created. You can now log in.
            </p>
            <button onClick={() => navigate("/login")} style={styles.primaryBtn}>
              Go to Login
            </button>
          </div>
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
  setupBanner: {
    background: "#fef3c7",
    border: "1px solid #f59e0b",
    borderRadius: "6px",
    padding: "10px 14px",
    fontSize: "13px",
    color: "#92400e",
    marginBottom: "16px",
    textAlign: "center",
    lineHeight: "1.5",
  },
  title: {
    textAlign: "center",
    marginBottom: "6px",
    fontSize: "22px",
    fontWeight: "700",
    color: "#111827",
  },
  subtitle: {
    textAlign: "center",
    fontSize: "13px",
    color: "#6b7280",
    marginBottom: "20px",
    marginTop: "0",
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
  primaryBtn: {
    padding: "10px",
    background: "#111827",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "14px",
  },
  backBtn: {
    padding: "8px",
    background: "transparent",
    color: "#6b7280",
    border: "none",
    cursor: "pointer",
    fontSize: "13px",
    textAlign: "center",
  },
  error: {
    color: "red",
    fontSize: "13px",
    textAlign: "center",
    margin: "0",
  },
  successWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "12px",
    padding: "12px 0",
  },
  successIcon: {
    width: "56px",
    height: "56px",
    borderRadius: "50%",
    background: "#111827",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "24px",
    fontWeight: "bold",
  },
};
