import { useState, useEffect, useMemo, useRef } from "react";
import SearchFilters from "../../components/ats/SearchFilters";
import ResumeTable from "../../components/ats/ResumeTable";
import NavToMatch from "../../components/ats/NavToMatch";
import { fetchResumes, bulkUploadResumes } from "../../services/api";

// ─────────────────────────────────────────────────────────────────────────────
// SEMANTIC ROLE MATCHING — no external APIs
//
// How it works:
//   1. Strip noise words (seniority, employment type, punctuation)
//   2. Expand each remaining word using SYNONYM_MAP so "backend"→"backend",
//      "be"→"backend", "js"→"javascript", etc.
//   3. Score every entry in ROLE_DEFINITIONS by how many of its own tags
//      appear in the expanded input token set
//   4. Pick the highest-scoring entry (ties broken by definition specificity)
//
// Examples that now all resolve correctly:
//   "java backend developer"  == "backend java dev"  == "senior be java engineer"
//   "python developer"        → django, flask, fastapi, celery, sqlalchemy …
//   "react frontend"          == "fe react"          == "reactjs ui developer"
// ─────────────────────────────────────────────────────────────────────────────

const NOISE_WORDS = new Set([
  "senior", "junior", "lead", "principal", "staff", "associate", "mid",
  "sr", "jr", "entry", "level", "contract", "permanent", "temp",
  "full", "time", "part", "freelance", "remote", "onsite", "hybrid",
  "engineer", "developer", "dev", "programmer", "specialist", "expert",
  "consultant", "architect", "analyst", "manager", "intern",
]);

// alias → canonical token used in ROLE_DEFINITIONS tags
const SYNONYM_MAP = {
  // Generic FE/BE/FS
  "be":           "backend",
  "fe":           "frontend",
  "fs":           "fullstack",
  "ui":           "frontend",
  "ux":           "frontend",
  "full-stack":   "fullstack",
  "full_stack":   "fullstack",

  // Languages
  "js":           "javascript",
  "ts":           "typescript",
  "reactjs":      "react",
  "vuejs":        "vue",
  "angularjs":    "angular",
  "nextjs":       "react",
  "nuxtjs":       "vue",
  "py":           "python",
  "golang":       "go",
  "c#":           "csharp",
  "dotnet":       "dotnet",
  ".net":         "dotnet",
  "asp":          "dotnet",
  "cpp":          "cplusplus",
  "c++":          "cplusplus",

  // Roles / domains
  "sde":          "software",
  "swe":          "software",
  "qa":           "qa",
  "qe":           "qa",
  "tester":       "qa",
  "testing":      "qa",
  "devops":       "devops",
  "sre":          "devops",
  "mlops":        "ml",
  "ai":           "ml",
  "dl":           "ml",
  "nlp":          "ml",
  "machine":      "ml",
  "learning":     "ml",
  "data":         "data",
  "bi":           "data",
  "etl":          "data",
  "dba":          "database",
  "db":           "database",
  "mobile":       "mobile",
  "app":          "mobile",
  "cloud":        "cloud",
  "infra":        "devops",
  "automation":   "automation",
  "flutter":      "flutter",
  "android":      "android",
  "ios":          "ios",
  "spring":       "java",        // "spring boot developer" → java skills
  "hibernate":    "java",
  "django":       "python",
  "flask":        "python",
  "fastapi":      "python",
  "rails":        "ruby",
  "laravel":      "php",
  "express":      "node",
  "nodejs":       "node",
  "kubernetes":   "devops",
  "terraform":    "devops",
  "aws":          "cloud",
  "gcp":          "cloud",
  "azure":        "cloud",
};

// ── Role definitions ──────────────────────────────────────────────────────────
// tags   : canonical tokens that identify this role (scored against input)
// skills : skill keywords sent to the backend search
const ROLE_DEFINITIONS = [
  // ── DATA ──────────────────────────────────────────────────────────────────
  {
    tags: ["data", "ml"],
    skills: ["python", "machine learning", "deep learning", "pandas", "numpy",
             "scikit-learn", "tensorflow", "statistics", "r", "data analysis",
             "pytorch", "regression", "classification"],
  },
  {
    tags: ["data", "engineer"],
    skills: ["sql", "spark", "hadoop", "etl", "python", "airflow", "big data",
             "kafka", "snowflake", "redshift", "postgresql", "hive", "pipeline"],
  },
  {
    tags: ["data", "analyst"],
    skills: ["sql", "excel", "power bi", "tableau", "data visualization",
             "pandas", "analytics", "etl", "reporting", "python", "r"],
  },
  {
    tags: ["business", "analyst"],
    skills: ["sql", "excel", "requirements gathering", "power bi",
             "brd", "documentation", "jira", "confluence", "agile"],
  },
  {
    tags: ["ml"],
    skills: ["python", "machine learning", "deep learning", "tensorflow", "pytorch",
             "scikit-learn", "mlops", "model training", "computer vision", "nlp",
             "transformers", "llm", "hugging face", "langchain", "generative ai",
             "bert", "gpt"],
  },

  // ── JAVA ──────────────────────────────────────────────────────────────────
  {
    tags: ["java", "backend"],
    skills: ["java", "spring", "spring boot", "hibernate", "microservices",
             "maven", "gradle", "junit", "servlet", "jpa", "rest api",
             "collections", "multithreading", "kafka", "docker"],
  },
  {
    tags: ["java", "fullstack"],
    skills: ["java", "spring boot", "react", "angular", "html", "css",
             "sql", "rest api", "microservices", "docker", "maven"],
  },
  {
    tags: ["java"],
    skills: ["java", "spring", "spring boot", "hibernate", "microservices",
             "maven", "gradle", "junit", "rest api", "collections", "multithreading"],
  },

  // ── PYTHON ────────────────────────────────────────────────────────────────
  {
    tags: ["python", "backend"],
    skills: ["python", "django", "flask", "fastapi", "asyncio", "pytest",
             "celery", "sqlalchemy", "rest api", "docker", "postgresql", "redis"],
  },
  {
    tags: ["python", "fullstack"],
    skills: ["python", "django", "flask", "fastapi", "react", "html", "css",
             "sql", "rest api", "docker", "celery"],
  },
  {
    tags: ["python"],
    skills: ["python", "django", "flask", "fastapi", "asyncio", "pytest",
             "pip", "celery", "sqlalchemy", "requests", "rest api", "pandas"],
  },

  // ── NODE / JS ─────────────────────────────────────────────────────────────
  {
    tags: ["node", "backend"],
    skills: ["node", "express", "javascript", "typescript", "npm", "rest api",
             "async/await", "mongodb", "sql", "middleware", "authentication", "docker"],
  },
  {
    tags: ["node"],
    skills: ["node", "express", "javascript", "npm", "rest api",
             "async/await", "mongodb", "sql", "middleware", "authentication"],
  },

  // ── FRONTEND ──────────────────────────────────────────────────────────────
  {
    tags: ["react", "frontend"],
    skills: ["react", "javascript", "typescript", "jsx", "hooks", "redux",
             "context api", "npm", "webpack", "css", "html", "tailwind", "next.js"],
  },
  {
    tags: ["react"],
    skills: ["react", "javascript", "typescript", "jsx", "hooks", "redux",
             "context api", "npm", "webpack", "css", "html"],
  },
  {
    tags: ["angular"],
    skills: ["angular", "typescript", "rxjs", "ngrx", "html", "css",
             "npm", "angular cli", "jasmine", "karma"],
  },
  {
    tags: ["vue"],
    skills: ["vue", "vuex", "pinia", "javascript", "typescript",
             "html", "css", "npm", "vite", "composition api"],
  },
  {
    tags: ["frontend"],
    skills: ["html", "css", "javascript", "react", "typescript",
             "vue", "angular", "webpack", "npm", "responsive design",
             "bootstrap", "tailwind", "sass"],
  },

  // ── FULLSTACK ─────────────────────────────────────────────────────────────
  {
    tags: ["fullstack", "react", "node"],
    skills: ["react", "node", "express", "mongodb", "sql", "javascript",
             "typescript", "rest api", "html", "css", "docker"],
  },
  {
    tags: ["fullstack", "java"],
    skills: ["java", "spring boot", "react", "html", "css", "sql",
             "rest api", "microservices", "docker"],
  },
  {
    tags: ["fullstack", "python"],
    skills: ["python", "django", "flask", "fastapi", "react", "html",
             "css", "sql", "rest api", "docker"],
  },
  {
    tags: ["fullstack"],
    skills: ["react", "node", "express", "mongodb", "sql", "javascript",
             "python", "java", "rest api", "html", "css", "typescript"],
  },

  // ── MOBILE ────────────────────────────────────────────────────────────────
  {
    tags: ["android"],
    skills: ["android", "java", "kotlin", "xml", "android studio",
             "firebase", "rest api", "sqlite", "gradle"],
  },
  {
    tags: ["ios"],
    skills: ["ios", "swift", "objective-c", "xcode", "cocoa",
             "uikit", "core data", "rest api", "firebase"],
  },
  {
    tags: ["mobile", "react"],
    skills: ["react native", "javascript", "typescript", "expo",
             "firebase", "redux", "rest api", "android", "ios"],
  },
  {
    tags: ["mobile", "flutter"],
    skills: ["flutter", "dart", "firebase", "rest api",
             "bloc", "provider", "android", "ios"],
  },
  {
    tags: ["flutter"],
    skills: ["flutter", "dart", "firebase", "rest api",
             "bloc", "provider", "android", "ios"],
  },
  {
    tags: ["mobile"],
    skills: ["android", "ios", "kotlin", "swift", "react native",
             "flutter", "firebase", "rest api"],
  },

  // ── BACKEND (generic) ─────────────────────────────────────────────────────
  {
    tags: ["backend"],
    skills: ["rest api", "graphql", "microservices", "database design", "docker",
             "sql", "authentication", "caching", "redis", "linux"],
  },

  // ── OTHER LANGUAGES ───────────────────────────────────────────────────────
  {
    tags: ["go"],
    skills: ["go", "golang", "gin", "goroutines", "channels", "rest api",
             "grpc", "docker", "kubernetes", "microservices"],
  },
  {
    tags: ["csharp", "dotnet"],
    skills: ["c#", "asp.net", ".net", "linq", "entity framework",
             "mvc", "visual studio", "nuget", "wpf", "blazor"],
  },
  {
    tags: ["cplusplus"],
    skills: ["c++", "stl", "oop", "memory management", "pointers",
             "cmake", "data structures", "algorithms"],
  },
  {
    tags: ["php"],
    skills: ["php", "laravel", "symfony", "composer", "mysql",
             "rest api", "blade", "eloquent"],
  },
  {
    tags: ["ruby"],
    skills: ["ruby", "rails", "activerecord", "rspec", "bundler",
             "rest api", "postgresql", "redis"],
  },

  // ── DEVOPS / CLOUD ────────────────────────────────────────────────────────
  {
    tags: ["devops"],
    skills: ["aws", "azure", "docker", "kubernetes", "jenkins", "ci/cd",
             "linux", "terraform", "ansible", "git", "monitoring",
             "prometheus", "grafana", "bash"],
  },
  {
    tags: ["cloud"],
    skills: ["aws", "gcp", "azure", "cloud", "terraform", "docker",
             "kubernetes", "cloud architecture", "ec2", "s3", "lambda",
             "serverless"],
  },

  // ── QA ────────────────────────────────────────────────────────────────────
  {
    tags: ["qa", "automation"],
    skills: ["selenium", "automation", "python", "java", "test automation",
             "cucumber", "testng", "ci/cd", "pytest", "cypress"],
  },
  {
    tags: ["qa"],
    skills: ["testing", "selenium", "jira", "junit", "automation",
             "test cases", "manual testing", "regression testing",
             "performance testing", "load testing", "jmeter"],
  },

  // ── DATABASE ──────────────────────────────────────────────────────────────
  {
    tags: ["database"],
    skills: ["sql", "postgresql", "mysql", "mongodb", "oracle",
             "database design", "indexing", "stored procedures",
             "redis", "cassandra"],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Tokeniser: lowercase → strip separators → split → drop noise → expand aliases
// ─────────────────────────────────────────────────────────────────────────────
function tokeniseRole(roleText) {
  const raw = (roleText || "").toLowerCase().trim();
  const spaced = raw.replace(/[_\-/+.]+/g, " ").replace(/\s+/g, " ");
  const tokens = new Set();

  for (const word of spaced.split(" ").filter(Boolean)) {
    if (NOISE_WORDS.has(word)) continue;
    const canonical = SYNONYM_MAP[word] ?? word;
    tokens.add(canonical);
    // Also add the raw word in case it matches a tag directly (e.g. "node", "go")
    if (canonical !== word) tokens.add(word);
  }
  return tokens;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scorer + resolver — pure, synchronous, zero network calls
// ─────────────────────────────────────────────────────────────────────────────
function getSkillsForRole(roleText) {
  if (!roleText?.trim()) return [];
  const tokens = tokeniseRole(roleText);
  if (tokens.size === 0) return [];

  let bestScore = 0;
  let bestSkills = [];
  let bestTagCount = 0;

  for (const defn of ROLE_DEFINITIONS) {
    const score = defn.tags.filter((tag) => tokens.has(tag)).length;
    if (score === 0) continue;

    if (score > bestScore || (score === bestScore && defn.tags.length > bestTagCount)) {
      bestScore = score;
      bestSkills = defn.skills;
      bestTagCount = defn.tags.length;
    }
  }

  return bestSkills;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function SearchCRMPage() {
  const [filters, setFilters] = useState({
    location: "",
    skills: "",
    skillsMode: "any",
    experienceYears: "",
    phoneNumber: "",
    roleFilter: "",
  });
  const [resumes, setResumes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [error, setError] = useState("");
  const [previewResume, setPreviewResume] = useState(null);
  const [bulkResult, setBulkResult] = useState(null);
  const bulkInputRef = useRef(null);

  // Derived synchronously — no async, no API
  const resolvedRoleSkills = useMemo(
    () => getSkillsForRole(filters.roleFilter),
    [filters.roleFilter]
  );

  const highlightKeywords = useMemo(() => {
    const list = [];
    
    // Add manually entered skills
    if (filters.skills.trim())
      list.push(...filters.skills.split(",").map((s) => s.trim()).filter(Boolean));
    
    // Add location
    if (filters.location.trim()) list.push(filters.location.trim());
    
    // Add phone number
    if (filters.phoneNumber.trim()) list.push(filters.phoneNumber.trim());
    
    // ADD RESOLVED ROLE SKILLS (not the role name itself!)
    if (filters.roleFilter.trim() && resolvedRoleSkills.length > 0) {
      list.push(...resolvedRoleSkills);
    }
    
    return list;
  }, [filters.skills, filters.location, filters.phoneNumber, filters.roleFilter, resolvedRoleSkills]);

  const loadResumes = async () => {
    setLoading(true);
    setError("");
    setResumes([]);
    setPreviewResume(null);
    try {
      const params = {};

      if (filters.roleFilter.trim()) {
        params.role_filter = filters.roleFilter.trim();
      }

      if (filters.location.trim()) params.location = filters.location.trim();

      if (resolvedRoleSkills.length > 0) {
        params.role_skills = resolvedRoleSkills.join(",");
      }

      if (filters.skills.trim()) {
        const manual = filters.skills.split(",").map((s) => s.trim()).filter(Boolean);
        if (manual.length > 0) {
          params.skills = manual.join(",");
          params.skills_mode = filters.skillsMode;
        }
      }

      if (filters.experienceYears !== "" && filters.experienceYears != null) {
        const n = parseFloat(filters.experienceYears);
        if (!isNaN(n)) params.experience_years = n;
      }

      if (filters.phoneNumber.trim()) params.phone_number = filters.phoneNumber.trim();

      const data = await fetchResumes(params);
      const rows = data.resumes || [];
      setResumes(rows);
      setPreviewResume((prev) =>
        prev && rows.some((r) => r.resume_id === prev.resume_id) ? prev : null
      );
    } catch (err) {
      console.error("[ERROR] Failed to load resumes:", err);
      setError(err.response?.data?.error || err.message || "Failed to fetch");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadResumes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const delay = setTimeout(loadResumes, 400);
    return () => clearTimeout(delay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const handleClearFilters = () =>
    setFilters({ location: "", skills: "", skillsMode: "any",
                 experienceYears: "", phoneNumber: "", roleFilter: "" });

  const handleRemoveFilter = (key) =>
    setFilters((prev) => ({ ...prev, [key]: "" }));

  const handleBulkUploadClick = () => bulkInputRef.current?.click();

  const handleBulkFileChange = async (e) => {
    const selected = Array.from(e.target.files || []);
    e.target.value = "";
    if (!selected.length) return;
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
          <button type="button" className="btn btn-primary"
            disabled={bulkUploading} onClick={handleBulkUploadClick}>
            {bulkUploading ? "Uploading..." : "Bulk Upload Resumes"}
          </button>
          <input ref={bulkInputRef} type="file" multiple
            accept=".pdf,.doc,.docx,.zip,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/zip"
            onChange={handleBulkFileChange} style={{ display: "none" }} disabled={bulkUploading} />
          <NavToMatch />
        </div>
      </header>

      <SearchFilters filters={filters} onChange={setFilters} loading={loading}
        onClear={handleClearFilters} onRemoveFilter={handleRemoveFilter} />

      {/* Role skills banner */}
      {resolvedRoleSkills.length > 0 && !filters.skills.trim() && (
        <section className="role-expanded-skills">
          <div className="expanded-skills-header">
            <strong>🔍 Searching for "{filters.roleFilter}" role with related skills:</strong>
          </div>
          <div className="expanded-skills-list">
            {resolvedRoleSkills.map((skill, idx) => (
              <span key={idx} className="skill-badge">{skill}</span>
            ))}
          </div>
          <p className="expanded-skills-info">
            Role-based search automatically includes {resolvedRoleSkills.length} related skills.
            Add manual skills separately if needed.
          </p>
        </section>
      )}

      {/* Combined search banner */}
      {filters.skills.trim() && filters.roleFilter.trim() && (
        <section className="role-expanded-skills"
          style={{ backgroundColor: "#fff3cd", borderColor: "#ffc107" }}>
          <div className="expanded-skills-header">
            <strong>🎯 Combined Search: "{filters.roleFilter}" + Manual Skills</strong>
          </div>
          <p className="expanded-skills-info">
            Finding {filters.roleFilter}s who also have: <strong>{filters.skills}</strong>
          </p>
        </section>
      )}

      {/* Bulk upload summary */}
      {bulkResult?.summary && (
        <section className="bulk-upload-summary">
          <div className="bulk-upload-summary-header">
            <h3>Upload Summary</h3>
            <button type="button" className="btn btn-small btn-secondary"
              onClick={() => setBulkResult(null)}>Close</button>
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
                  <li key={`${f.file}-${idx}`}>{f.file} {"→"} {f.reason}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {error && (
        <div className="error-banner">
          <span className="error-icon">!</span>{error}
        </div>
      )}

      <ResumeTable resumes={resumes} onPreview={setPreviewResume}
        previewResume={previewResume} onClosePreview={() => setPreviewResume(null)}
        highlightKeywords={highlightKeywords} />
    </div>
  );
}
