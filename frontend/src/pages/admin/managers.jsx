import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../services/supabaseClient";
import Loader from "../../components/common/Loader";
import { addRecruiter, normalizeAllUserRoles } from "../../services/authService";
import { canonicalizeRole, getRoleLabel, getRoleQueryValues } from "../../utils/roles";

const MANAGED_ROLES = ["manager", "recruiter", "tl"];

const emptyForm = {
  name: "",
  email: "",
  password: "",
  phone: "",
  role: "manager",
};

const formatDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-GB");
};

function UsersTable({
  title,
  role,
  users,
  onEditUser,
  onChangePassword,
  onDeleteUser,
  actionBusyId,
}) {
  return (
    <section style={styles.panel}>
      <h3 style={styles.panelTitle}>{title}</h3>
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Name</th>
              <th style={styles.th}>Email</th>
              <th style={styles.th}>Phone</th>
              <th style={styles.th}>Role</th>
              <th style={styles.th}>Created Date</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td style={styles.td} colSpan={6}>
                  No {getRoleLabel(role)} users found.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id}>
                  <td style={styles.td}>{user.name || user.email?.split("@")[0] || "-"}</td>
                  <td style={styles.td}>{user.email || "-"}</td>
                  <td style={styles.td}>{user.phone_number || "-"}</td>
                  <td style={styles.td}>{getRoleLabel(role)}</td>
                  <td style={styles.td}>{formatDate(user.created_at)}</td>
                  <td style={styles.td}>
                    <div style={styles.rowActions}>
                      <button
                        type="button"
                        style={styles.secondaryBtn}
                        onClick={() => onEditUser(user, role)}
                        disabled={actionBusyId === user.id}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        style={styles.secondaryBtn}
                        onClick={() => onChangePassword(user)}
                        disabled={actionBusyId === user.id}
                      >
                        Change Password
                      </button>
                      <button
                        type="button"
                        style={styles.dangerBtn}
                        onClick={() => onDeleteUser(user, role)}
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
  );
}

export default function AdminManagers() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [usersByRole, setUsersByRole] = useState({
    manager: [],
    recruiter: [],
    tl: [],
  });
  const [form, setForm] = useState(emptyForm);
  const [passwordTarget, setPasswordTarget] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", phone: "", role: "recruiter" });
  const [actionBusyId, setActionBusyId] = useState(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");

    await normalizeAllUserRoles();

    const results = await Promise.all(
      MANAGED_ROLES.map((role) =>
        supabase
          .from("users")
          .select("id,name,email,phone_number,created_at,role")
          .in("role", getRoleQueryValues(role))
          .order("created_at", { ascending: false })
      )
    );

    const firstError = results.find((result) => result.error)?.error;
    if (firstError) {
      setError(firstError.message || "Failed to load users");
      setLoading(false);
      return;
    }

    setUsersByRole({
      manager: results[0].data || [],
      recruiter: results[1].data || [],
      tl: results[2].data || [],
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleFormChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    const normalizedRole = canonicalizeRole(form.role);
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      setError("Name, email, and password are required");
      return;
    }

    if (normalizedRole === "manager") {
      const { count, error: countError } = await supabase
        .from("users")
        .select("*", { count: "exact", head: true })
        .in("role", getRoleQueryValues("manager"));

      if (countError) {
        setError(countError.message || "Failed to validate manager limit");
        return;
      }

      if ((count || 0) > 0) {
        setError("A manager already exists in the system.");
        return;
      }
    }

    const result = await addRecruiter({
      email: form.email.trim(),
      password: form.password.trim(),
      phone: form.phone.trim(),
      role: normalizedRole,
      name: form.name.trim(),
    });

    if (result.error) {
      setError(result.error);
      return;
    }

    setMessage(`${getRoleLabel(normalizedRole)} added successfully`);
    setForm(emptyForm);
    await loadUsers();
  };

  const handleOpenPassword = (user) => {
    setPasswordTarget(user);
    setNewPassword("");
    setError("");
    setMessage("");
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
  };

  const handleOpenEdit = (user, role) => {
    setEditTarget({ ...user, role: canonicalizeRole(role) });
    setEditForm({
      name: user.name || "",
      email: user.email || "",
      phone: user.phone_number || "",
      role: canonicalizeRole(role),
    });
    setError("");
    setMessage("");
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!editTarget?.id) return;

    if (!editForm.name.trim() || !editForm.email.trim()) {
      setError("Name and email are required");
      return;
    }

    const nextRole = canonicalizeRole(editForm.role);
    if (nextRole === "manager" && editTarget.role !== "manager") {
      const { count, error: countError } = await supabase
        .from("users")
        .select("*", { count: "exact", head: true })
        .in("role", getRoleQueryValues("manager"));

      if (countError) {
        setError(countError.message || "Failed to validate manager limit");
        return;
      }

      if ((count || 0) > 0) {
        setError("A manager already exists in the system.");
        return;
      }
    }

    setActionBusyId(editTarget.id);
    const { error: updateError } = await supabase
      .from("users")
      .update({
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        phone_number: editForm.phone.trim() || null,
        role: nextRole,
      })
      .eq("id", editTarget.id);
    setActionBusyId(null);

    if (updateError) {
      setError(updateError.message || "Failed to update user");
      return;
    }

    setMessage(`${getRoleLabel(nextRole)} updated successfully`);
    setEditTarget(null);
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

  if (loading) return <Loader text="Loading HR user management..." />;

  return (
    <div style={styles.page}>
      <h2 style={styles.title}>HR User Management</h2>
      {error && <p style={styles.error}>{error}</p>}
      {message && <p style={styles.success}>{message}</p>}

      <section style={styles.panel}>
        <div style={styles.addHead}>
          <h3 style={styles.panelTitle}>Add User</h3>
          <div style={styles.toggleWrap}>
            {MANAGED_ROLES.map((role) => (
              <button
                key={role}
                type="button"
                style={{
                  ...styles.secondaryBtn,
                  ...(form.role === role ? styles.activeToggle : {}),
                }}
                onClick={() => handleFormChange("role", role)}
              >
                + Add {getRoleLabel(role)}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleAddUser} style={styles.formGrid}>
          <input
            style={styles.input}
            placeholder="Name"
            value={form.name}
            onChange={(e) => handleFormChange("name", e.target.value)}
          />
          <input
            style={styles.input}
            placeholder="Email"
            value={form.email}
            onChange={(e) => handleFormChange("email", e.target.value)}
          />
          <input
            type="password"
            style={styles.input}
            placeholder="Password"
            value={form.password}
            onChange={(e) => handleFormChange("password", e.target.value)}
          />
          <input
            style={styles.input}
            placeholder="Phone Number"
            value={form.phone}
            onChange={(e) => handleFormChange("phone", e.target.value)}
          />
          <input style={styles.input} value={getRoleLabel(form.role)} readOnly />
          <button type="submit" style={styles.primaryBtn}>
            Add {getRoleLabel(form.role)}
          </button>
        </form>
      </section>

      <UsersTable
        title="Managers"
        role="manager"
        users={usersByRole.manager}
        onEditUser={handleOpenEdit}
        onChangePassword={handleOpenPassword}
        onDeleteUser={handleDeleteUser}
        actionBusyId={actionBusyId}
      />

      <UsersTable
        title="Recruiters"
        role="recruiter"
        users={usersByRole.recruiter}
        onEditUser={handleOpenEdit}
        onChangePassword={handleOpenPassword}
        onDeleteUser={handleDeleteUser}
        actionBusyId={actionBusyId}
      />

      <UsersTable
        title="TL"
        role="tl"
        users={usersByRole.tl}
        onEditUser={handleOpenEdit}
        onChangePassword={handleOpenPassword}
        onDeleteUser={handleDeleteUser}
        actionBusyId={actionBusyId}
      />

      {passwordTarget && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <h3 style={styles.modalTitle}>Change Password</h3>
            <p style={styles.modalSubtitle}>{passwordTarget.email}</p>
            <form onSubmit={handleUpdatePassword}>
              <input
                type="password"
                placeholder="New Password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={styles.input}
              />
              <div style={styles.rowActions}>
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
            <h3 style={styles.modalTitle}>Edit {getRoleLabel(editTarget.role)}</h3>
            <form onSubmit={handleUpdateUser} style={styles.formGrid}>
              <input
                style={styles.input}
                placeholder="Name"
                value={editForm.name}
                onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
              />
              <input
                style={styles.input}
                placeholder="Email"
                value={editForm.email}
                onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
              />
              <input
                style={styles.input}
                placeholder="Phone Number"
                value={editForm.phone}
                onChange={(e) => setEditForm((prev) => ({ ...prev, phone: e.target.value }))}
              />
              <select
                style={styles.input}
                value={editForm.role}
                onChange={(e) => setEditForm((prev) => ({ ...prev, role: e.target.value }))}
              >
                {MANAGED_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {getRoleLabel(role)}
                  </option>
                ))}
              </select>
              <div style={styles.rowActions}>
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
  page: { display: "flex", flexDirection: "column", gap: "14px" },
  title: { margin: 0, fontSize: "30px", color: "#0f172a" },
  panel: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "14px" },
  panelTitle: { margin: 0, fontSize: "20px", color: "#0f172a" },
  addHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    flexWrap: "wrap",
    marginBottom: "10px",
  },
  toggleWrap: { display: "flex", gap: "8px", flexWrap: "wrap" },
  formGrid: {
    display: "grid",
    gap: "10px",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    alignItems: "center",
  },
  tableWrap: { overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: "10px" },
  table: { width: "100%", borderCollapse: "collapse", minWidth: "980px" },
  th: {
    textAlign: "left",
    background: "#f8fafc",
    borderBottom: "1px solid #e2e8f0",
    padding: "10px",
    fontSize: "13px",
    color: "#334155",
  },
  td: {
    borderBottom: "1px solid #f1f5f9",
    padding: "10px",
    fontSize: "14px",
    color: "#0f172a",
    verticalAlign: "top",
  },
  rowActions: { display: "flex", gap: "8px", alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" },
  primaryBtn: {
    border: "none",
    background: "#2563eb",
    color: "#fff",
    borderRadius: "8px",
    padding: "8px 12px",
    fontWeight: 600,
    cursor: "pointer",
  },
  secondaryBtn: {
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#0f172a",
    borderRadius: "8px",
    padding: "8px 12px",
    fontWeight: 600,
    cursor: "pointer",
  },
  activeToggle: { background: "#eff6ff", borderColor: "#2563eb", color: "#1d4ed8" },
  dangerBtn: {
    border: "1px solid #fecaca",
    background: "#fff1f2",
    color: "#b91c1c",
    borderRadius: "8px",
    padding: "8px 12px",
    fontWeight: 600,
    cursor: "pointer",
  },
  input: { width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "10px" },
  error: { margin: 0, color: "#dc2626" },
  success: { margin: 0, color: "#16a34a" },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.35)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modal: {
    width: "100%",
    maxWidth: "720px",
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    padding: "16px",
  },
  modalTitle: { margin: 0, fontSize: "20px", color: "#0f172a" },
  modalSubtitle: { margin: "6px 0 12px", fontSize: "13px", color: "#64748b" },
};
