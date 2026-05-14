import axios from "axios";

/*
API Base URL configuration

Priority:
1. VITE_API_URL from environment variables
2. "/api" fallback
*/

const rawApiBaseUrl =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "http://localhost:5000/api" : "/api");
export const API_BASE_URL = rawApiBaseUrl.replace(/\/+$/, "");

// Axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// ✅ FIXED: attach JWT token + user email on every request automatically
api.interceptors.request.use((config) => {
  // Attach JWT token — required by @login_required and @require_role on all backend routes
  const token = localStorage.getItem("ats_access_token");
  if (token) {
    config.headers["Authorization"] = `Bearer ${token}`;
  }

  return config;
});

/*
Upload Job Description + Resume Files
Supports:
- JD text input
- JD file upload
- Multiple resume uploads
*/
// BDE Flask API calls with JWT token
export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem("ats_access_token");

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `API error ${res.status}`);
  }

  return res.json();
}
export async function uploadJobAndResumes(jobDescription, files, jdFile = null) {
  const form = new FormData();

  form.append("job_description", jobDescription || "");

  // optional JD file
  if (jdFile) {
    form.append("jd_file", jdFile);
  }

  // append resumes
  for (let i = 0; i < files.length; i++) {
    form.append("resumes", files[i]);
  }

  // ✅ use api instance (not raw axios) so the interceptor attaches the token
  const { data } = await api.post("/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });

  return data;
}

/*
Match resumes with job description
*/
export async function matchResumes(payload) {
  const { data } = await api.post("/match", payload);
  return data;
}

/*
Store resumes in database
*/
export async function storeResumes(resumes) {
  const { data } = await api.post("/store", { resumes });
  return data;
}

/*
Fetch stored resumes with optional filters
*/
export async function fetchResumes(params = {}) {
  const { data } = await api.get("/fetch-resumes", { params });
  return data;
}

/*
Bulk upload resumes (PDF/DOCX or ZIP)
*/
export async function bulkUploadResumes(files) {
  const form = new FormData();
  for (let i = 0; i < files.length; i++) {
    form.append("files", files[i]);
  }
  try {
    // ✅ use api instance so the interceptor attaches the token
    const { data } = await api.post("/bulk-upload-resumes", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  } catch (err) {
    // Compatibility fallback for environments where /api rewrite doesn't include new routes.
    if (err?.response?.status === 404 && API_BASE_URL !== "") {
      const { data } = await axios.post("/bulk-upload-resumes", form);
      return data;
    }
    throw err;
  }
}
