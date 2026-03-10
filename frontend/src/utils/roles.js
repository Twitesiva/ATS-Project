export const canonicalizeRole = (role) => {
  const value = String(role || "").trim().toLowerCase();

  if (value === "admin" || value === "hr") return "hr";
  if (value === "manager") return "manager";
  if (value === "recruiter") return "recruiter";
  if (value === "tl") return "tl";
  return value;
};

export const getRoleLabel = (role) => {
  const canonical = canonicalizeRole(role);

  if (canonical === "hr") return "HR";
  if (canonical === "manager") return "Manager";
  if (canonical === "recruiter") return "Recruiter";
  if (canonical === "tl") return "TL";
  return String(role || "");
};

export const getRoleHomePath = (role) => {
  const canonical = canonicalizeRole(role);

  if (canonical === "hr") return "/hr/dashboard";
  if (canonical === "manager") return "/manager/dashboard";
  if (canonical === "recruiter") return "/recruiter/dashboard";
  if (canonical === "tl") return "/tl/dashboard";
  return "/login";
};

export const roleMatches = (userRole, allowedRoles = []) => {
  const canonicalUserRole = canonicalizeRole(userRole);
  return allowedRoles.map(canonicalizeRole).includes(canonicalUserRole);
};

export const getRoleQueryValues = (role) => {
  const canonical = canonicalizeRole(role);

  if (canonical === "hr") {
    return ["hr", "HR", "admin", "Admin"];
  }

  if (canonical === "manager") {
    return ["manager", "Manager"];
  }

  if (canonical === "recruiter") {
    return ["recruiter", "Recruiter"];
  }

  if (canonical === "tl") {
    return ["tl", "TL"];
  }

  return [role];
};
