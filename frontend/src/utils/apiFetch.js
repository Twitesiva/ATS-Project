import { API_BASE_URL } from "../services/api";

// Return the raw Response (some pages handle .ok / .json themselves)
export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem("ats_access_token");

  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
}
