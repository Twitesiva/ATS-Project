// src/utils/roles.js

export const canonicalizeRole = (role) => {
  const value = String(role || "").trim().toLowerCase();

  if (value === "hr" || value === "admin") return "hr"; // admin and hr are the same
  if (value === "manager")   return "manager";
  if (value === "recruiter") return "recruiter";
  if (value === "tl")        return "tl";
  if (value === "bde")       return "bde";

  return null; // unknown role returns null instead of raw value
};

export const getRoleLabel = (role) => {
  const canonical = canonicalizeRole(role);

  if (canonical === "hr")        return "Director";
  if (canonical === "manager")   return "Manager";
  if (canonical === "recruiter") return "Recruiter";
  if (canonical === "tl")        return "TL";
  if (canonical === "bde")       return "BDE";
  return String(role || "");
};

export const getRoleHomePath = (role) => {
  const canonical = canonicalizeRole(role);

  if (canonical === "hr")        return "/hr/dashboard";
  if (canonical === "manager")   return "/manager/dashboard";
  if (canonical === "recruiter") return "/recruiter/dashboard";
  if (canonical === "tl")        return "/tl/dashboard";
  if (canonical === "bde")       return "/bde/dashboard";
  return "/login";
};

export const roleMatches = (userRole, allowedRoles = []) => {
  const canonicalUserRole = canonicalizeRole(userRole);
  return allowedRoles.map(canonicalizeRole).includes(canonicalUserRole);
};

export const getRoleQueryValues = (role) => {
  const canonical = canonicalizeRole(role);

  if (canonical === "hr")        return ["hr", "HR", "admin", "Admin"];
  if (canonical === "manager")   return ["manager", "Manager"];
  if (canonical === "recruiter") return ["recruiter", "Recruiter"];
  if (canonical === "tl")        return ["tl", "TL"];
  if (canonical === "bde")       return [
    "bde",
    "BDE",
    "bd",
    "BD",
    "business development",
    "Business Development",
  ];

  return [role];
};
