import { useState, useEffect, useMemo } from "react";
import SearchFilters from "../../components/ats/SearchFilters";
import ResumeTable from "../../components/ats/ResumeTable";
import NavToMatch from "../../components/ats/NavToMatch";
import { fetchResumes } from "../../services/api";

export default function SearchCRMPage() {
  const [filters, setFilters] = useState({ location: "", skills: "", skillsMode: "any", experienceYears: "", phoneNumber: "", roleFilter: "" });
  const [resumes, setResumes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [previewResume, setPreviewResume] = useState(null);

  const highlightKeywords = useMemo(() => {
    const list = [];
    if (filters.skills.trim())
      list.push(...filters.skills.split(",").map((s) => s.trim()).filter(Boolean));
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

  return (
    <div className="page search-crm-page">
      {/* PAGE HEADER WITH CENTERED LOGO – NON-BREAKING: Logo left, title center, nav right */}
      <header className="page-header">
        <img className="header-logo-img" src="../logos/Twite AI PNG 1.png" alt="Twite AI ATS" />
        <strong className="header-page-title">Resume Search</strong>
        <NavToMatch />
      </header>
      <SearchFilters filters={filters} onChange={setFilters} onApply={loadResumes} loading={loading} />
      {error && (
        <div className="error-banner">
          <span className="error-icon">⚠️</span>
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
