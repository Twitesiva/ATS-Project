import { useState, useEffect, useMemo, useRef } from "react";
import SearchFilters from "../../components/ats/SearchFilters";
import ResumeTable from "../../components/ats/ResumeTable";
import NavToMatch from "../../components/ats/NavToMatch";
import { fetchResumes, bulkUploadResumes } from "../../services/api";

export default function SearchCRMPage() {
  const [filters, setFilters] = useState({ location: "", skills: "", skillsMode: "any", experienceYears: "", phoneNumber: "", roleFilter: "" });
  const [resumes, setResumes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [error, setError] = useState("");
  const [previewResume, setPreviewResume] = useState(null);
  const [bulkResult, setBulkResult] = useState(null);
  const bulkInputRef = useRef(null);

  const highlightKeywords = useMemo(() => {
    const list = [];
    if (filters.skills.trim()) list.push(...filters.skills.split(",").map((s) => s.trim()).filter(Boolean));
    if (filters.location.trim()) list.push(filters.location.trim());
    if (filters.phoneNumber.trim()) list.push(filters.phoneNumber.trim());
    if (filters.roleFilter.trim()) list.push(filters.roleFilter.trim());
    return list;
  }, [filters.skills, filters.location, filters.phoneNumber, filters.roleFilter]);
  const ROLE_SKILL_MAP = {
    // ================= DATA DOMAIN =================
    "data analyst": [
      "sql", "excel", "power bi", "tableau", "data visualization", "pandas"
    ],

    "business analyst": [
      "sql", "excel", "requirements gathering", "power bi", "communication"
    ],

    "data scientist": [
      "python", "machine learning", "deep learning", "pandas", "numpy",
      "scikit-learn", "tensorflow", "statistics"
    ],

    "machine learning engineer": [
      "python", "ml", "deep learning", "tensorflow", "pytorch", "numpy"
    ],

    "ai engineer": [
      "python", "nlp", "transformers", "deep learning", "llm", "pytorch"
    ],

    "data engineer": [
      "sql", "spark", "hadoop", "etl", "python", "airflow", "big data"
    ],

    // ================= SOFTWARE DOMAIN =================
    "java developer": [
      "java", "spring", "spring boot", "hibernate", "microservices"
    ],

    "python developer": [
      "python", "django", "flask", "fastapi"
    ],

    "frontend developer": [
      "html", "css", "javascript", "react", "typescript"
    ],

    "backend developer": [
      "node", "express", "spring", "django"
    ],

    "full stack developer": [
      "react", "node", "express", "mongodb", "sql"
    ],

    // ================= CLOUD / DEVOPS =================
    "devops engineer": [
      "aws", "azure", "docker", "kubernetes", "jenkins", "ci/cd", "linux"
    ],

    "cloud engineer": [
      "aws", "gcp", "azure", "cloud", "terraform", "docker"
    ]
  };
  const handleClearFilters = () => {
    const resetFilters = {
      location: "",
      skills: "",
      skillsMode: "any",
      experienceYears: "",
      phoneNumber: "",
      roleFilter: ""
    };

    setFilters(resetFilters);
  };
  const loadResumes = async () => {
    setLoading(true);
    setError("");
    // Show loading-state UI with empty results while data is being fetched.
    setResumes([]);
    setPreviewResume(null);
    try {
      const params = {};
      let expandedSkills = [];
      if (filters.roleFilter.trim()) {
        const role = filters.roleFilter.trim().toLowerCase();
        expandedSkills = ROLE_SKILL_MAP[role] || [];
      }
      if (filters.location.trim()) params.location = filters.location.trim();
      if (filters.skills.trim() || expandedSkills.length) {
        const manualSkills = filters.skills.trim();

        params.skills = [
          manualSkills,
          ...expandedSkills
        ]
          .filter(Boolean)
          .join(",");

        params.skills_mode = filters.skillsMode;
      }
      if (filters.experienceYears !== "" && filters.experienceYears != null) {
        const n = parseFloat(filters.experienceYears);
        if (!isNaN(n)) params.experience_years = n;
      }
      if (filters.phoneNumber.trim()) {
        params.phone_number = filters.phoneNumber.trim();
      }
      const data = await fetchResumes(params);
      const rows = data.resumes || [];
      setResumes(rows);
      setPreviewResume((prev) => (prev && rows.some((r) => r.resume_id === prev.resume_id) ? prev : null));
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to fetch");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadResumes();
  }, []);
  useEffect(() => {
    const delay = setTimeout(() => {
      loadResumes();
    }, 400);

    return () => clearTimeout(delay);
  }, [filters]);

  const handleBulkUploadClick = () => {
    if (bulkInputRef.current) bulkInputRef.current.click();
  };
  const handleRemoveFilter = (key) => {
    setFilters((prev) => ({
      ...prev,
      [key]: ""
    }));
  };
  const handleBulkFileChange = async (e) => {
    const selected = Array.from(e.target.files || []);
    e.target.value = "";
    if (selected.length === 0) return;

    setBulkUploading(true);
    setError("");
    setBulkResult(null);
    try {
      const result = await bulkUploadResumes(selected);
      setBulkResult(result);
      await loadResumes();
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Bulk upload failed");
    } finally {
      setBulkUploading(false);
    }
  };

  return (
    <div className="page search-crm-page">
      <header className="page-header">
        <img className="header-logo-img" src="/logos/Twite AI PNG 1.png" alt="Twite AI ATS" />
        <strong className="header-page-title">Resume Search</strong>
        <div className="search-header-actions">

          <button type="button" className="btn btn-primary" disabled={bulkUploading} onClick={handleBulkUploadClick}>
            {bulkUploading ? "Uploading..." : "Bulk Upload Resumes"}
          </button>
          <NavToMatch />
        </div>
      </header>
      <SearchFilters filters={filters} onChange={setFilters} loading={loading} onClear={handleClearFilters}
        onRemoveFilter={handleRemoveFilter} />
      {bulkResult?.summary && (
        <section className="bulk-upload-summary">
          <div className="bulk-upload-summary-header">
            <h3>Upload Summary</h3>
            <button type="button" className="btn btn-small btn-secondary" onClick={() => setBulkResult(null)}>
              Close
            </button>
          </div>
          <p>Successfully Uploaded: {bulkResult.summary.successful ?? 0}</p>
          <p>Failed: {bulkResult.summary.failed ?? 0}</p>
          {(bulkResult.summary.duplicates_found ?? 0) > 0 && (
            <>
              <p>Duplicates Found: {bulkResult.summary.duplicates_found}</p>
              <p className="bulk-upload-duplicate-message">
                {bulkResult.duplicate_message ||
                  "Duplicate resumes were detected. Only the latest resume was stored in the system."}
              </p>
            </>
          )}
          {Array.isArray(bulkResult.failed_files) && bulkResult.failed_files.length > 0 && (
            <div className="bulk-upload-failures">
              <strong>Failed Files:</strong>
              <ul>
                {bulkResult.failed_files.map((f, idx) => (
                  <li key={`${f.file}-${idx}`}>
                    {f.file} {"->"} {f.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
      {error && (
        <div className="error-banner">
          <span className="error-icon">!</span>
          {error}
        </div>
      )}
      <ResumeTable
        resumes={resumes}
        onPreview={setPreviewResume}
        previewResume={previewResume}
        onClosePreview={() => setPreviewResume(null)}
        highlightKeywords={highlightKeywords}
      />
    </div>
  );
}
