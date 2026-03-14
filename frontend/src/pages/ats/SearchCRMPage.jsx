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

  const loadResumes = async () => {
    setLoading(true);
    setError("");
    try {
      const params = {};
      if (filters.location.trim()) params.location = filters.location.trim();
      if (filters.skills.trim()) {
        params.skills = filters.skills.trim();
        params.skills_mode = filters.skillsMode;
      }
      if (filters.roleFilter.trim()) {
        params.role_filter = filters.roleFilter.trim();
        // Enable strict role matching when role filter is used
        params.strict_role_skill_match = "true";
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

  const handleBulkUploadClick = () => {
    if (bulkInputRef.current) bulkInputRef.current.click();
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
          <input
            ref={bulkInputRef}
            type="file"
            className="sr-only-input"
            multiple
            accept=".pdf,.docx,.zip"
            onChange={handleBulkFileChange}
          />
          <button type="button" className="btn btn-primary" disabled={bulkUploading} onClick={handleBulkUploadClick}>
            {bulkUploading ? "Uploading..." : "Bulk Upload Resumes"}
          </button>
          <NavToMatch />
        </div>
      </header>
      <SearchFilters filters={filters} onChange={setFilters} onApply={loadResumes} loading={loading} />
      {bulkResult?.summary && (
        <section className="bulk-upload-summary">
          <h3>Upload Summary</h3>
          <p>Successfully Uploaded: {bulkResult.summary.successful ?? 0}</p>
          <p>Failed: {bulkResult.summary.failed ?? 0}</p>
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
