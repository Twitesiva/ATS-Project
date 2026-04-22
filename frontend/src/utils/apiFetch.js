/**
 * Drop-in replacement for fetch() that automatically attaches
 * the logged-in user's name as X-User-Name header.
 * The backend reads this via get_current_user() — never trust frontend body for auth.
 */
export function apiFetch(url, options = {}) {
  const saved = localStorage.getItem("ats_user");
  const user = saved ? JSON.parse(saved) : null;

  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(user?.name ? { "X-User-Name": user.name } : {}),
      ...(options.headers || {}),
    },
  });
}