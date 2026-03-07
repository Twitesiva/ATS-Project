import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

// EXTENSION – SAFE TO REMOVE: Updated to support JD file upload
// jobDescription: string (text input) or null/empty if using file
// files: array of resume files
// jdFile: optional File object for JD upload (PDF/DOCX)
export async function uploadJobAndResumes(jobDescription, files, jdFile = null) {
  const form = new FormData();
  form.append("job_description", jobDescription || "");
  
  // EXTENSION – SAFE TO REMOVE: Append JD file if provided
  if (jdFile) {
    form.append("jd_file", jdFile);
  }
  
  for (let i = 0; i < files.length; i++) {
    form.append("resumes", files[i]);
  }
  // Use direct post so no default Content-Type is set; browser adds multipart/form-data with boundary
  const { data } = await axios.post("/api/upload", form);
  return data;
}

export async function matchResumes(payload) {
  const { data } = await api.post("/match", payload);
  return data;
}

export async function storeResumes(resumes) {
  const { data } = await api.post("/store", { resumes });
  return data;
}

export async function fetchResumes(params = {}) {
  const { data } = await api.get("/fetch-resumes", { params });
  return data;
}
