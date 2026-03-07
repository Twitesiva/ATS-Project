import { useEffect, useMemo, useState } from "react";
import { addRecruiter } from "../../services/authService";
import { supabase } from "../../services/supabaseClient";
import { canonicalizeRole, getRoleLabel, getRoleQueryValues } from "../../utils/roles";

const MANAGED_ROLES = ["recruiter", "tl"];

const formatDate = (value) => {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleDateString("en-GB");
};

const formatLastActivity = (value) => {
  if (!value) return "Last activity: No activity";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "Last activity: No activity";

  const now = new Date();
  const diffMs = now.getTime() - dt.getTime();
  const mins = Math.floor(diffMs / 60000);
  const days = Math.floor(diffMs / 86400000);

  if (mins < 1) return "Last activity: Just now";
  if (mins < 60) return `Last activity: ${mins} minute${mins === 1 ? "" : "s"} ago`;
  if (days === 0) return "Last activity: Today";
  if (days === 1) return "Last activity: Yesterday";
  return `Last activity: ${dt.toLocaleDateString()}`;
};

export default function Recruiters() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    role: "recruiter",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [hoveredCard, setHoveredCard] = useState(null);
  const [usersByRole, setUsersByRole] = useState({ recruiter: [], tl: [] });
  const [passwordTarget, setPasswordTarget] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", phone: "", role: "recruiter" });
  const [actionBusyId, setActionBusyId] = useState(null);

  const loadUsers = async () => {
    setError("");

    const [userResults, activityRes] = await Promise.all([
      Promise.all(
        MANAGED_ROLES.map((role) =>
          supabase
            .from("users")
            .select("id,name,email,phone_number,role,created_at,is_online")
            .in("role", getRoleQueryValues(role))
            .order("created_at", { ascending: false })
        )
      ),
      supabase.from("status_history").select("recruiter_name,updated_at").order("updated_at", { ascending: false }),
    ]);

    const userError = userResults.find((result) => result.error)?.error;
    if (userError) {
      console.error("[manager-users] users fetch failed", userError);
      setError(userError.message || "Failed to load users");
      return;
    }

    if (activityRes.error) {
      console.error("[manager-users] status_history fetch failed", activityRes.error);
      setError(activityRes.error.message || "Failed to load activity");
      return;
    }

    const latestActivityByName = new Map();
    (activityRes.data || []).forEach((row) => {
      const key = String(row.recruiter_name || "").trim().toLowerCase();
      if (!key || latestActivityByName.has(key)) return;
      latestActivityByName.set(key, row.updated_at);
    });

    const mapRows = (rows, role) =>
      (rows || []).map((row) => {
        const name = row?.name?.trim() || row?.email?.split("@")?.[0] || getRoleLabel(role);
        return {
          id: row.id,
          name,
          email: row.email || "-",
          phone_number: row.phone_number || "-",
          created_at: row.created_at || null,
          role: getRoleLabel(role),
          status: row.is_online ? "Active" : "Offline",
          stats: formatLastActivity(latestActivityByName.get(name.toLowerCase()) || null),
        };
      });

    setUsersByRole({
      recruiter: mapRows(userResults[0].data, "recruiter"),
      tl: mapRows(userResults[1].data, "tl"),
    });
  };

  useEffect(() => {
    loadUsers();

    const usersChannel = supabase
      .channel("manager-users")
      .on("postgres_changes", { event: "*", schema: "public", table: "users" }, loadUsers)
      .subscribe();

    const activityChannel = supabase
      .channel("manager-users-activity")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "status_history" }, loadUsers)
      .subscribe();

    return () => {
      supabase.removeChannel(usersChannel);
      supabase.removeChannel(activityChannel);
    };
  }, []);

  const allCards = useMemo(
    () => [...usersByRole.recruiter, ...usersByRole.tl],
    [usersByRole.recruiter, usersByRole.tl]
  );

  const handleAddUser = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      setError("Name, email, and password are required");
      return;
    }

    const result = await addRecruiter({
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password.trim(),
      phone: form.phone.trim(),
      role: canonicalizeRole(form.role),
    });

    if (result.error) {
      setError(result.error);
      return;
    }

    setMessage(`${getRoleLabel(form.role)} added successfully`);
    setForm({ name: "", email: "", password: "", phone: "", role: "recruiter" });
    await loadUsers();
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (!passwordTarget?.id) return;

    if (!newPassword.trim()) {
      setError("New password is required");
      return;
    }

    setActionBusyId(passwordTarget.id);
    const { error: updateError } = await supabase
      .from("users")
      .update({ password: newPassword.trim() })
      .eq("id", passwordTarget.id);
    setActionBusyId(null);

    if (updateError) {
      setError(updateError.message || "Failed to update password");
      return;
    }

    setMessage("Password updated successfully");
    setPasswordTarget(null);
    setNewPassword("");
    await loadUsers();
  };

  const handleDeleteUser = async (user, role) => {
    const ok = window.confirm(`Are you sure you want to delete this ${getRoleLabel(role)}?`);
    if (!ok) return;

    setActionBusyId(user.id);
    const { error: deleteError } = await supabase.from("users").delete().eq("id", user.id);
    setActionBusyId(null);

    if (deleteError) {
      setError(deleteError.message || "Failed to delete user");
      return;
    }

    setMessage(`${getRoleLabel(role)} deleted successfully`);
    await loadUsers();
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!editTarget?.id) return;

    if (!editForm.name.trim() || !editForm.email.trim()) {
      setError("Name and email are required");
      return;
    }

    setActionBusyId(editTarget.id);
    const { error: updateError } = await supabase
      .from("users")
      .update({
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        phone_number: editForm.phone.trim() || null,
        role: canonicalizeRole(editForm.role),
      })
      .eq("id", editTarget.id);
    setActionBusyId(null);

    if (updateError) {
      setError(updateError.message || "Failed to update user");
      return;
    }

    setMessage(`${getRoleLabel(editForm.role)} updated successfully`);
    setEditTarget(null);
    await loadUsers();
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h2 style={styles.title}>User Management</h2>
        <p style={styles.subtitle}>Create and manage recruiter and TL access</p>
      </header>

      <section style={styles.panel}>
        <div style={styles.panelHeader}>
          <div>
            <h3 style={styles.panelTitle}>Add User</h3>
            <p style={styles.panelSubtitle}>Managers can create Recruiter and TL access.</p>
          </div>
          <div style={styles.toggleWrap}>
            {MANAGED_ROLES.map((role) => (
              <button
                key={role}
                type="button"
                style={{
                  ...styles.secondaryBtn,
                  ...(form.role === role ? styles.activeToggle : {}),
                }}
                onClick={() => setForm((prev) => ({ ...prev, role }))}
              >
                Add {getRoleLabel(role)}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleAddUser} style={styles.formGrid}>
          <input
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            style={styles.input}
          />
          <input
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            style={styles.input}
          />
          <input
            placeholder="Password"
            value={form.password}
            onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
            style={styles.input}
            type="password"
          />
          <input
            placeholder="Phone Number"
            value={form.phone}
            onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
            style={styles.input}
          />
          <input value={getRoleLabel(form.role)} readOnly style={styles.input} />

          {error && <p style={styles.errorText}>{error}</p>}
          {message && <p style={styles.successText}>{message}</p>}

          <button type="submit" style={styles.primaryBtn}>
            Add {getRoleLabel(form.role)}
          </button>
        </form>
      </section>

      <section style={styles.grid}>
        {allCards.map((user, index) => (
          <article
            key={user.id || user.email}
            style={{
              ...styles.card,
              transform: hoveredCard === index ? "translateY(-2px)" : "translateY(0)",
              boxShadow:
                hoveredCard === index
                  ? "0 12px 24px rgba(15, 23, 42, 0.12)"
                  : "0 6px 16px rgba(15, 23, 42, 0.08)",
            }}
            onMouseEnter={() => setHoveredCard(index)}
            onMouseLeave={() => setHoveredCard(null)}
          >
            <div style={styles.cardTop}>
              <div>
                <h4 style={styles.cardName}>{user.name}</h4>
                <p style={styles.cardEmail}>{user.email}</p>
              </div>
              <span
                style={{
                  ...styles.statusPill,
                  background: user.status === "Active" ? "#dcfce7" : "#fee2e2",
                  color: user.status === "Active" ? "#166534" : "#991b1b",
                }}
              >
                {user.status}
              </span>
            </div>

            <div style={styles.metaRow}>
              <span style={styles.metaLabel}>Role</span>
              <span style={styles.metaValue}>{user.role}</span>
            </div>
            <div style={styles.metaRow}>
              <span style={styles.metaLabel}>Activity</span>
              <span style={styles.metaValue}>{user.stats}</span>
            </div>
          </article>
        ))}
      </section>

      {MANAGED_ROLES.map((role) => (
        <section key={role} style={styles.panel}>
          <h3 style={styles.panelTitle}>Manage {getRoleLabel(role)} Users</h3>
          <p style={styles.panelSubtitle}>
            Update profile details, change passwords, or remove {getRoleLabel(role)} access.
          </p>

          <div style={styles.tableContainer}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Name</th>
                  <th style={styles.th}>Email</th>
                  <th style={styles.th}>Phone Number</th>
                  <th style={styles.th}>Created At</th>
                  <th style={styles.th}>Online Status</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {usersByRole[role].length === 0 ? (
                  <tr>
                    <td style={styles.td} colSpan={6}>
                      No {getRoleLabel(role)} users found.
                    </td>
                  </tr>
                ) : (
                  usersByRole[role].map((user) => (
                    <tr key={user.id}>
                      <td style={styles.td}>{user.name}</td>
                      <td style={styles.td}>{user.email}</td>
                      <td style={styles.td}>{user.phone_number || "-"}</td>
                      <td style={styles.td}>{formatDate(user.created_at)}</td>
                      <td style={styles.td}>{user.status}</td>
                      <td style={styles.td}>
                        <div style={styles.actionBtns}>
                          <button
                            type="button"
                            style={styles.secondaryBtn}
                            onClick={() => {
                              setEditTarget(user);
                              setEditForm({
                                name: user.name,
                                email: user.email,
                                phone: user.phone_number || "",
                                role,
                              });
                            }}
                            disabled={actionBusyId === user.id}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            style={styles.secondaryBtn}
                            onClick={() => {
                              setPasswordTarget(user);
                              setNewPassword("");
                            }}
                            disabled={actionBusyId === user.id}
                          >
                            Change Password
                          </button>
                          <button
                            type="button"
                            style={styles.dangerBtn}
                            onClick={() => handleDeleteUser(user, role)}
                            disabled={actionBusyId === user.id}
                          >
                            {actionBusyId === user.id ? "Processing..." : `Delete ${getRoleLabel(role)}`}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {passwordTarget && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <h3 style={styles.modalTitle}>Change Password</h3>
            <p style={styles.modalSubtitle}>{passwordTarget.name} ({passwordTarget.email})</p>
            <form onSubmit={handleUpdatePassword}>
              <input
                type="password"
                placeholder="New Password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={styles.input}
              />
              <div style={styles.modalActions}>
                <button type="button" style={styles.secondaryBtn} onClick={() => setPasswordTarget(null)}>
                  Cancel
                </button>
                <button type="submit" style={styles.primaryBtn}>
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editTarget && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <h3 style={styles.modalTitle}>Edit {getRoleLabel(editForm.role)}</h3>
            <form onSubmit={handleUpdateUser}>
              <input
                placeholder="Name"
                value={editForm.name}
                onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                style={styles.input}
              />
              <input
                placeholder="Email"
                value={editForm.email}
                onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
                style={styles.input}
              />
              <input
                placeholder="Phone Number"
                value={editForm.phone}
                onChange={(e) => setEditForm((prev) => ({ ...prev, phone: e.target.value }))}
                style={styles.input}
              />
              <select
                value={editForm.role}
                onChange={(e) => setEditForm((prev) => ({ ...prev, role: e.target.value }))}
                style={styles.input}
              >
                {MANAGED_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {getRoleLabel(role)}
                  </option>
                ))}
              </select>

              <div style={styles.modalActions}>
                <button type="button" style={styles.secondaryBtn} onClick={() => setEditTarget(null)}>
                  Cancel
                </button>
                <button type="submit" style={styles.primaryBtn}>
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: {
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "18px",
  },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  title: {
    margin: 0,
    fontSize: "30px",
    fontWeight: 700,
    color: "#0f172a",
  },
  subtitle: {
    margin: 0,
    color: "#475569",
    fontSize: "15px",
  },
  panel: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "14px",
    padding: "18px",
    boxShadow: "0 6px 16px rgba(15, 23, 42, 0.06)",
  },
  panelHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
  },
  panelTitle: {
    margin: 0,
    fontSize: "20px",
    color: "#0f172a",
  },
  panelSubtitle: {
    margin: "6px 0 14px 0",
    color: "#64748b",
    fontSize: "14px",
  },
  toggleWrap: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },
  formGrid: {
    display: "grid",
    gap: "10px",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    alignItems: "center",
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    marginBottom: "10px",
    border: "1px solid #cbd5e1",
    borderRadius: "10px",
    outline: "none",
    fontSize: "14px",
    boxSizing: "border-box",
  },
  errorText: {
    color: "#dc2626",
    margin: "4px 0 10px 0",
    fontSize: "14px",
  },
  successText: {
    color: "#16a34a",
    margin: "4px 0 10px 0",
    fontSize: "14px",
  },
  primaryBtn: {
    border: "none",
    background: "#2563eb",
    color: "#ffffff",
    padding: "10px 14px",
    borderRadius: "10px",
    fontWeight: 600,
    cursor: "pointer",
  },
  secondaryBtn: {
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    color: "#0f172a",
    padding: "8px 12px",
    borderRadius: "10px",
    fontWeight: 600,
    cursor: "pointer",
  },
  activeToggle: {
    background: "#eff6ff",
    borderColor: "#2563eb",
    color: "#1d4ed8",
  },
  dangerBtn: {
    border: "1px solid #fecaca",
    background: "#fff1f2",
    color: "#b91c1c",
    padding: "8px 12px",
    borderRadius: "10px",
    fontWeight: 600,
    cursor: "pointer",
  },
  grid: {
    display: "grid",
    gap: "14px",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  },
  card: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "14px",
    padding: "16px",
    transition: "all 0.18s ease",
  },
  cardTop: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "10px",
    marginBottom: "14px",
  },
  cardName: {
    margin: 0,
    fontSize: "18px",
    color: "#0f172a",
  },
  cardEmail: {
    margin: "5px 0 0 0",
    fontSize: "13px",
    color: "#64748b",
    wordBreak: "break-word",
  },
  statusPill: {
    fontSize: "12px",
    fontWeight: 600,
    borderRadius: "999px",
    padding: "5px 10px",
    whiteSpace: "nowrap",
  },
  metaRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderTop: "1px solid #f1f5f9",
    paddingTop: "10px",
    marginTop: "10px",
  },
  metaLabel: {
    fontSize: "13px",
    color: "#64748b",
  },
  metaValue: {
    fontSize: "13px",
    color: "#0f172a",
    fontWeight: 600,
  },
  tableContainer: {
    width: "100%",
    overflowX: "auto",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    background: "#fff",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: "900px",
  },
  th: {
    textAlign: "left",
    padding: "10px 12px",
    borderBottom: "1px solid #e2e8f0",
    background: "#f8fafc",
    fontSize: "13px",
    color: "#334155",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "10px 12px",
    borderBottom: "1px solid #f1f5f9",
    fontSize: "14px",
    color: "#0f172a",
    verticalAlign: "middle",
    whiteSpace: "nowrap",
  },
  actionBtns: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.35)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modal: {
    width: "100%",
    maxWidth: "420px",
    background: "#fff",
    borderRadius: "14px",
    border: "1px solid #e2e8f0",
    boxShadow: "0 18px 40px rgba(2, 6, 23, 0.18)",
    padding: "16px",
  },
  modalTitle: {
    margin: 0,
    fontSize: "20px",
    color: "#0f172a",
  },
  modalSubtitle: {
    margin: "6px 0 12px 0",
    color: "#64748b",
    fontSize: "13px",
  },
  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "8px",
  },
};
