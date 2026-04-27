import { useState, useCallback, useMemo, Suspense, lazy } from "react";
import { ArrowRight, Brain, CheckCircle2, FileSearch, ScanSearch, Sparkles } from "lucide-react";
import JobDescriptionForm from "../../components/ats/JobDescriptionForm";
import ResumeUpload from "../../components/ats/ResumeUpload";
import NavToSearch from "../../components/ats/NavToSearch";
import { uploadJobAndResumes, matchResumes, storeResumes } from "../../services/api";

const EnhancedMatchResults = lazy(() => import("../../components/ats/EnhancedMatchResults"));

const MIN_RESUMES = 1;
const MAX_RESUMES = 8;

const PROGRESS_STEPS = [
  { label: "", status: "", icon: Brain },
  { label: "Uploading files...", status: "Files received, processing JD", icon: FileSearch },
  { label: "Analyzing resumes...", status: "AI extracting skills & experience", icon: ScanSearch },
  { label: "Matching candidates...", status: "Computing match scores", icon: Sparkles },
  { label: "Finalizing results...", status: "Preparing your matches", icon: CheckCircle2 },
];

function ResultsSkeleton() {
  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
      <div className="mb-4 flex items-center justify-between">
        <div className="h-7 w-44 animate-pulse rounded-lg bg-slate-200" />
        <div className="h-5 w-28 animate-pulse rounded-full bg-slate-200" />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-slate-200 p-4">
            <div className="mb-3 h-5 w-2/5 animate-pulse rounded bg-slate-200" />
            <div className="mb-2 h-20 animate-pulse rounded-lg bg-slate-100" />
            <div className="mb-2 h-3 w-4/5 animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-3/5 animate-pulse rounded bg-slate-200" />
          </div>
        ))}
      </div>
    </section>
  );
}

function AnalysisStatus({ step, fileCount, files, jobDescription, jdFile }) {
  const currentStep = PROGRESS_STEPS[step] || PROGRESS_STEPS[0];
  const normalizedStep = Math.max(1, Math.min(4, step || 1));
  const progressPercent = normalizedStep * 25;

  const previewSkills = useMemo(() => {
    const source = String(jobDescription || jdFile?.name || "").toLowerCase();
    const ignore = new Set([
      "with",
      "from",
      "that",
      "this",
      "have",
      "will",
      "your",
      "experience",
      "years",
      "developer",
      "engineer",
    ]);
    const words = source
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !ignore.has(w));
    return Array.from(new Set(words)).slice(0, 6);
  }, [jobDescription, jdFile?.name]);

  return (
    <div className="mt-4 rounded-2xl border border-blue-100 bg-white p-4 shadow-[0_12px_28px_rgba(37,99,235,0.1)]">
      <div className="flex items-center gap-3">
        <div className="relative h-10 w-10">
          <span className="absolute inset-0 animate-ping rounded-full border border-blue-300" />
          <span className="absolute inset-1 grid place-items-center rounded-full bg-blue-100 text-blue-700">
            <Brain size={16} />
          </span>
        </div>
        <div>
          <p className="m-0 text-sm font-semibold text-slate-900">{currentStep.label}</p>
          <p className="m-0 text-xs text-slate-500">{currentStep.status}</p>
          {fileCount > 0 ? (
            <p className="m-0 mt-0.5 text-xs font-medium text-blue-600">
              {fileCount} resume{fileCount !== 1 ? "s" : ""} queued
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-200 ease-in-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <span className="text-xs font-semibold text-slate-600">{progressPercent}%</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {PROGRESS_STEPS.slice(1).map((s, idx) => {
          const Icon = s.icon;
          const active = idx + 1 === step;
          const completed = idx + 1 < step;
          return (
            <span
              key={s.label}
              className={[
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all duration-200",
                completed
                  ? "bg-emerald-100 text-emerald-700"
                  : active
                    ? "bg-blue-100 text-blue-700"
                    : "bg-slate-100 text-slate-500",
              ].join(" ")}
            >
              <Icon size={11} />
              {s.label.split(" ")[0]}
            </span>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="m-0 mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">JD Context</p>
          <div className="absolute left-0 right-0 top-[-35%] h-[40%] animate-[ai-scan_2.2s_linear_infinite] bg-gradient-to-b from-transparent via-blue-300/30 to-transparent" />
          <div className="relative z-10 flex flex-wrap gap-1.5">
            {previewSkills.length > 0
              ? previewSkills.map((skill) => (
                  <span key={skill} className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">
                    {skill}
                  </span>
                ))
              : <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">processing</span>}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="m-0 mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Resume Queue</p>
          <div className="space-y-1.5">
            {(files || []).slice(0, 3).map((file, idx) => (
              <div
                key={`${file.name}-${idx}`}
                className="truncate rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-600"
                style={{ animation: `ai-slide-in 0.45s ease ${idx * 0.12}s backwards` }}
              >
                {file.name}
              </div>
            ))}
            {(!files || files.length === 0) ? <div className="h-6 w-full rounded-lg border border-slate-200 bg-white" /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ResumeMatchingPage() {
  const [jobDescription, setJobDescription] = useState("");
  const [resumeFiles, setResumeFiles] = useState([]);
  const [submitError, setSubmitError] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [previewResume, setPreviewResume] = useState(null);
  const [progressStep, setProgressStep] = useState(0);
  const [showEarlyResults, setShowEarlyResults] = useState(false);

  const [jdFile, setJdFile] = useState(null);
  const [jdFileError, setJdFileError] = useState("");

  const hasJdInput = useMemo(() => jobDescription.trim().length > 0 || jdFile !== null, [jobDescription, jdFile]);
  const canSubmit = useMemo(
    () => hasJdInput && resumeFiles.length >= MIN_RESUMES && resumeFiles.length <= MAX_RESUMES,
    [hasJdInput, resumeFiles.length]
  );

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

    if (jobDescription.trim() && jdFile) {
      setSubmitError("Please provide JD as either text OR file, not both");
      return;
    }

    setSubmitError("");
    setLoading(true);
    setResults(null);
    setShowEarlyResults(true);
    setProgressStep(1);

    await new Promise((resolve) => requestAnimationFrame(resolve));

    try {
      const uploadData = await uploadJobAndResumes(jobDescription.trim(), resumeFiles, jdFile);
      setProgressStep(2);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const matchData = await matchResumes({
        job_description: uploadData.job_description,
        resume_paths: uploadData.resume_paths,
        use_enhanced_matching: true,
      });

      setProgressStep(3);
      await new Promise((resolve) => setTimeout(resolve, 50));

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
    <div className="mx-auto w-full max-w-[1400px] p-6">
      <header className="mb-6 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-[0_6px_20px_rgba(15,23,42,0.08)]">
        <div className="flex items-center">
          <strong className="text-2xl font-semibold text-slate-900">Resume Match</strong>
        </div>
        <NavToSearch />
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-gradient-to-r from-blue-50 via-white to-blue-50 px-3.5 py-1.5 text-xs font-semibold text-blue-700 shadow-[0_4px_12px_rgba(37,99,235,0.12)]">
          <span className="relative inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-700">
            <span className="absolute inset-0 animate-ping rounded-full bg-blue-200/70" />
            <Brain size={12} className="relative z-10" />
          </span>
          <span className="tracking-wide">AI Powered Analysis</span>
          <span className="ml-0.5 inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse [animation-delay:120ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse [animation-delay:240ms]" />
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <JobDescriptionForm
            value={jobDescription}
            onChange={handleJdChange}
            jdFile={jdFile}
            onJdFileChange={handleJdFileChange}
            jdFileError={jdFileError}
            onJdFileError={handleJdFileError}
          />
          <ResumeUpload files={resumeFiles} onChange={handleFilesChange} min={MIN_RESUMES} max={MAX_RESUMES} />
        </div>

        {submitError ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{submitError}</div>
        ) : null}

        <div className="mt-4 border-t border-slate-200 pt-4">
          <button
            type="button"
            className="group inline-flex items-center gap-2 rounded-xl border border-blue-600 bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(37,99,235,0.28)] transition-all duration-200 ease-in-out hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-[0_12px_24px_rgba(37,99,235,0.32)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!canSubmit || loading}
            onClick={handleSubmit}
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="spinner" />
                {PROGRESS_STEPS[progressStep]?.label || "Processing..."}
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <span>Match Resumes with AI</span>
                <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-0.5" />
              </span>
            )}
          </button>

          {loading ? (
            <AnalysisStatus
              step={progressStep}
              fileCount={resumeFiles.length}
              files={resumeFiles}
              jobDescription={jobDescription}
              jdFile={jdFile}
            />
          ) : null}

          {!loading && resumeFiles.length > 0 ? (
            <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
              <span>✓</span>
              <span>{resumeFiles.length} resume{resumeFiles.length !== 1 ? "s" : ""} ready for analysis</span>
            </div>
          ) : null}
        </div>
      </section>

      {showEarlyResults && loading ? <ResultsSkeleton /> : null}

      {results && results.length > 0 && !loading ? (
        <Suspense fallback={<ResultsSkeleton />}>
          <EnhancedMatchResults
            results={results}
            onPreview={handlePreview}
            previewResume={previewResume}
            onClosePreview={handleClosePreview}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
