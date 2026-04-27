import { useCallback, useMemo } from "react";

// PERFORMANCE UX IMPROVEMENT – NON-BREAKING: File size formatter for instant feedback
function formatFileSize(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// PERFORMANCE UX IMPROVEMENT – NON-BREAKING: File type icon component
function FileTypeIcon({ filename }) {
  const extension = filename.split('.').pop()?.toLowerCase();
  const icon = extension === 'pdf' ? '📄' : extension === 'docx' ? '📝' : '📎';
  return <span className="file-type-icon">{icon}</span>;
}

export default function ResumeUpload({ files, onChange, min, max }) {
  const uploadedCount = files.length;
  const maxReached = uploadedCount >= max;

  // PERFORMANCE OPTIMIZATION – SAFE: Memoize file count validation
  const fileCountStatus = useMemo(() => {
    if (uploadedCount === 0) return { valid: false, message: `Upload ${min}-${max} resumes` };
    if (uploadedCount < min) return { valid: false, message: `Need ${min - uploadedCount} more` };
    if (maxReached) return { valid: true, message: `Maximum ${max} files uploaded` };
    return { valid: true, message: `${uploadedCount} file${uploadedCount !== 1 ? 's' : ''} ready` };
  }, [uploadedCount, min, max, maxReached]);

  // PERFORMANCE OPTIMIZATION – SAFE: Memoized handlers to prevent re-renders
  const handleChange = useCallback((e) => {
    const selected = Array.from(e.target.files || []);
    const combined = [...files, ...selected];
    const trimmed = combined.length > max ? combined.slice(0, max) : combined;
    onChange(trimmed);
    e.target.value = "";
  }, [files, max, onChange]);

  const remove = useCallback((index) => {
    const next = files.filter((_, i) => i !== index);
    onChange(next);
  }, [files, onChange]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
      <label className="mb-2 block text-sm font-semibold text-slate-800">
        Resume Upload (PDF or DOCX, {min}-{max} files)
        <span className={`ml-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${fileCountStatus.valid ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
          {fileCountStatus.message}
        </span>
      </label>
      
      <div className="file-input-wrapper">
        <input
          type="file"
          accept=".pdf,.docx"
          multiple
          onChange={handleChange}
          disabled={maxReached}
          className="file-input"
          id="resume-upload"
        />
        <label
          htmlFor="resume-upload"
          className={[
            "file-input-label rounded-xl border border-dashed transition-all duration-200",
            maxReached
              ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
              : "border-slate-300 bg-slate-50 hover:border-blue-300 hover:bg-blue-50",
          ].join(" ")}
        >
          <span className="file-input-icon">📁</span>
          <span className="file-input-text text-sm text-slate-600">
            {maxReached ? `Maximum ${max} files reached` : files.length === 0 ? "Click to select files" : "Add more files..."}
          </span>
        </label>
      </div>

      <div className="mt-2 text-xs font-medium text-slate-600">
        Uploaded documents: {uploadedCount} / {max}
      </div>

      {maxReached ? (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs font-medium text-amber-700">
          Maximum upload limit reached. Remove a file to upload a new one.
        </div>
      ) : null}
      
      {files.length > 0 && (
        <ul className="mt-3 space-y-2 p-0">
          {files.map((f, i) => (
            <li key={i} className="file-item rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <FileTypeIcon filename={f.name} />
              <span className="file-name" title={f.name}>{f.name}</span>
              <span className="file-size">{formatFileSize(f.size)}</span>
              <button 
                type="button" 
                className="btn-link file-remove" 
                onClick={() => remove(i)}
                title="Remove file"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
