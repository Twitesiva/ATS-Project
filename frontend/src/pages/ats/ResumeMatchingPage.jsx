import { useState, useCallback, useMemo, Suspense, lazy } from "react";
import { useNavigate } from "react-router-dom";
import JobDescriptionForm from "../../components/ats/JobDescriptionForm";
import ResumeUpload from "../../components/ats/ResumeUpload";
import NavToSearch from "../../components/ats/NavToSearch";
import { uploadJobAndResumes, matchResumes, storeResumes } from "../../services/api";

// PERFORMANCE UX IMPROVEMENT – NON-BREAKING: Lazy load heavy MatchResults component
const MatchResults = lazy(() => import("../../components/ats/MatchResults"));
const EnhancedMatchResults = lazy(() => import("../../components/ats/EnhancedMatchResults"));

const MIN_RESUMES = 1;
const MAX_RESUMES = 8;

// PERFORMANCE UX IMPROVEMENT – NON-BREAKING: Enhanced progress steps with status indicators
const PROGRESS_STEPS = [
  { label: "", status: "" },
  { label: "Uploading files...", status: "Files received, processing JD" },
  { label: "Analyzing resumes...", status: "AI extracting skills & experience" },
  { label: "Matching candidates...", status: "Computing match scores" },
  { label: "Finalizing results...", status: "Preparing your matches" }
];

// PERFORMANCE UX IMPROVEMENT – NON-BREAKING: Skeleton loader for results section
function ResultsSkeleton() {
  return (
    <section className="match-results">
      <div className="match-results-header">
        <div className="skeleton skeleton-title" style={{ width: "150px", height: "28px" }} />
        <div className="skeleton skeleton-count" style={{ width: "100px", height: "20px" }} />
      </div>
      <div className="results-grid">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton-card">
            <div className="skeleton skeleton-header" />
            <div className="skeleton skeleton-line" style={{ width: "80%" }} />
            <div className="skeleton skeleton-line" style={{ width: "60%" }} />
            <div className="skeleton skeleton-line" />
          </div>
        ))}
      </div>
    </section>
  );
}

// PERFORMANCE UX IMPROVEMENT – NON-BREAKING: Early feedback status component
function AnalysisStatus({ step, fileCount }) {
  const currentStep = PROGRESS_STEPS[step] || PROGRESS_STEPS[0];
  
  return (
    <div className="analysis-status">
      <div className="status-header">
        <span className="status-spinner"></span>
        <span className="status-label">{currentStep.label}</span>
      </div>
      <div className="status-details">
        <span className="status-message">{currentStep.status}</span>
        {fileCount > 0 && (
          <span className="status-files">{fileCount} resume{fileCount !== 1 ? 's' : ''} queued</span>
        )}
      </div>
      <div className="status-steps">
        {PROGRESS_STEPS.slice(1).map((s, idx) => (
          <div 
            key={idx} 
            className={`status-step ${idx + 1 === step ? 'active' : ''} ${idx + 1 < step ? 'completed' : ''}`}
          >
            <span className="step-dot"></span>
            <span className="step-label">{s.label.split(' ')[0]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ResumeMatchingPage() {
  const navigate = useNavigate();
  const [jobDescription, setJobDescription] = useState("");
  const [resumeFiles, setResumeFiles] = useState([]);
  const [submitError, setSubmitError] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [previewResume, setPreviewResume] = useState(null);
  const [progressStep, setProgressStep] = useState(0);
  const [showEarlyResults, setShowEarlyResults] = useState(false);
  
  // EXTENSION – SAFE TO REMOVE: State for JD file upload
  const [jdFile, setJdFile] = useState(null);
  const [jdFileError, setJdFileError] = useState("");
  const [useEnhancedMatching, setUseEnhancedMatching] = useState(false);

  // PERFORMANCE OPTIMIZATION – SAFE: Memoize computed values
  const hasJdInput = useMemo(() => jobDescription.trim().length > 0 || jdFile !== null, [jobDescription, jdFile]);
  const canSubmit = useMemo(() => hasJdInput && resumeFiles.length >= MIN_RESUMES && resumeFiles.length <= MAX_RESUMES, [hasJdInput, resumeFiles.length]);

  // PERFORMANCE OPTIMIZATION – SAFE: Memoize event handlers to prevent unnecessary re-renders
  const handleJdChange = useCallback((value) => setJobDescription(value), []);
  const handleFilesChange = useCallback((files) => setResumeFiles(files), []);
  const handleJdFileChange = useCallback((file) => setJdFile(file), []);
  const handleJdFileError = useCallback((error) => setJdFileError(error), []);
  const handleClosePreview = useCallback(() => setPreviewResume(null), []);
  const handlePreview = useCallback((resume) => setPreviewResume(resume), []);

  const handleSubmit = async () => {
    if (!canSubmit) {
      setSubmitError("Please provide a job description (text or file) and upload at least one resume");
      return;
    }
    
    // EXTENSION – SAFE TO REMOVE: Validation - ensure only one JD input method
    if (jobDescription.trim() && jdFile) {
      setSubmitError("Please provide JD as either text OR file, not both");
      return;
    }
    
    setSubmitError("");
    setLoading(true);
    setResults(null);
    setShowEarlyResults(true);
    setProgressStep(1);
    
    // PERFORMANCE UX IMPROVEMENT – NON-BREAKING: Use requestAnimationFrame for smooth UI updates
    await new Promise(resolve => requestAnimationFrame(resolve));
    
    try {
      // EXTENSION – SAFE TO REMOVE: Pass jdFile to upload function
      const uploadData = await uploadJobAndResumes(jobDescription.trim(), resumeFiles, jdFile);
      setProgressStep(2);
      
      // PERFORMANCE UX IMPROVEMENT – NON-BREAKING: Yield to UI thread between steps
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const matchData = await matchResumes({
        job_description: uploadData.job_description,
        resume_paths: uploadData.resume_paths,
        use_enhanced_matching: useEnhancedMatching
      });
      
      setProgressStep(3);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      setResults(matchData.results || []);
      await storeResumes(matchData.results || []);
      setProgressStep(4);
    } catch (err) {
      setSubmitError(err.response?.data?.error || err.message || "Request failed");
      setShowEarlyResults(false);
    } finally {
      setLoading(false);
      setTimeout(() => {
        setProgressStep(0);
        setShowEarlyResults(false);
      }, 800);
    }
  };

  return (
    <div className="page resume-matching-page">
      {/* PAGE HEADER WITH CENTERED LOGO – NON-BREAKING: Title left, logo center, nav right */}
      {/* HEADER LAYOUT SWAP – NON-BREAKING: Logo first, then text title */}
      <header className="page-header">
        <img className="header-logo-img" src="../logos/Twite AI PNG 1.png" alt="Twite AI ATS" />
        <strong className="header-page-title">Resume Match</strong>
        <NavToSearch />
      </header>
      <section className="form-section">
        <div className="form-grid">
          {/* EXTENSION – SAFE TO REMOVE: Pass JD file props to JobDescriptionForm */}
          {/* PERFORMANCE OPTIMIZATION – SAFE: Using memoized handlers */}
          <JobDescriptionForm 
            value={jobDescription} 
            onChange={handleJdChange}
            jdFile={jdFile}
            onJdFileChange={handleJdFileChange}
            jdFileError={jdFileError}
            onJdFileError={handleJdFileError}
          />
          <ResumeUpload
            files={resumeFiles}
            onChange={handleFilesChange}
            min={MIN_RESUMES}
            max={MAX_RESUMES}
          />
        </div>
        
        {/* Enhanced Matching Toggle */}
        <div className="enhanced-toggle-section">
          <label className="toggle-container">
            <input 
              type="checkbox" 
              checked={useEnhancedMatching}
              onChange={(e) => setUseEnhancedMatching(e.target.checked)}
            />
            <span className="toggle-slider"></span>
            <span className="toggle-label">Use Enhanced Enterprise Matching</span>
          </label>
          <div className="toggle-description">
            Enable advanced role understanding, skill context analysis, and detailed match explanations
          </div>
        </div>
        
        {submitError && (
          <div className="error-banner">
            <span className="error-icon">⚠️</span>
            {submitError}
          </div>
        )}
        {/* PERFORMANCE UX IMPROVEMENT – NON-BREAKING: Enhanced submit section with instant feedback */}
        <div className="submit-section">
          <button
            type="button"
            className="btn btn-primary btn-large"
            disabled={!canSubmit || loading}
            onClick={handleSubmit}
          >
            {loading ? (
              <span className="btn-loading">
                <span className="spinner"></span>
                {PROGRESS_STEPS[progressStep]?.label || "Processing..."}
              </span>
            ) : (
              <>
                <span className="btn-icon">🚀</span>
                Match Resumes
              </>
            )}
          </button>
          
          {/* PERFORMANCE UX IMPROVEMENT – NON-BREAKING: Show analysis status during processing */}
          {loading && (
            <AnalysisStatus step={progressStep} fileCount={resumeFiles.length} />
          )}
          
          {/* PERFORMANCE UX IMPROVEMENT – NON-BREAKING: Instant file receipt confirmation */}
          {!loading && resumeFiles.length > 0 && (
            <div className="upload-confirmation">
              <span className="confirmation-icon">✓</span>
              <span>{resumeFiles.length} resume{resumeFiles.length !== 1 ? 's' : ''} ready for analysis</span>
            </div>
          )}
        </div>
      </section>
      
      {/* PERFORMANCE UX IMPROVEMENT – NON-BREAKING: Early results skeleton while loading */}
      {showEarlyResults && loading && (
        <ResultsSkeleton />
      )}
      
      {/* PERFORMANCE UX IMPROVEMENT – NON-BREAKING: Lazy load MatchResults with Suspense */}
      {results && results.length > 0 && !loading && (
        <Suspense fallback={<ResultsSkeleton />}>
          {useEnhancedMatching ? (
            <EnhancedMatchResults
              results={results}
              onPreview={handlePreview}
              previewResume={previewResume}
              onClosePreview={handleClosePreview}
            />
          ) : (
            <MatchResults
              results={results}
              onPreview={handlePreview}
              previewResume={previewResume}
              onClosePreview={handleClosePreview}
            />
          )}
        </Suspense>
      )}
    </div>
  );
}
