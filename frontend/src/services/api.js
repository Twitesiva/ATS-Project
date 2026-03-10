import axios from "axios";

/*
API Base URL configuration

Priority:
1. VITE_API_URL from environment variables
2. "/api" fallback
*/

const rawApiBaseUrl = import.meta.env.VITE_API_URL || "/api";
export const API_BASE_URL = rawApiBaseUrl.replace(/\/+$/, "");

// Axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

/*
Upload Job Description + Resume Files
Supports:
- JD text input
- JD file upload
- Multiple resume uploads
*/
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

  const { data } = await axios.post(`${API_BASE_URL}/upload`, form);

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
