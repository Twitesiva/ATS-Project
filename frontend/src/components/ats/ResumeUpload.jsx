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
  // PERFORMANCE OPTIMIZATION – SAFE: Memoize file count validation
  const fileCountStatus = useMemo(() => {
    if (files.length === 0) return { valid: false, message: `Upload ${min}-${max} resumes` };
    if (files.length < min) return { valid: false, message: `Need ${min - files.length} more` };
    if (files.length > max) return { valid: false, message: `Too many files (max ${max})` };
    return { valid: true, message: `${files.length} file${files.length !== 1 ? 's' : ''} ready` };
  }, [files.length, min, max]);

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
    <div className="form-group">
      <label>
        Resume Upload (PDF or DOCX, {min}-{max} files)
        {/* PERFORMANCE UX IMPROVEMENT – NON-BREAKING: Instant file count feedback */}
        <span className={`file-count-badge ${fileCountStatus.valid ? 'valid' : ''}`}>
          {fileCountStatus.message}
        </span>
      </label>
      
      {/* PERFORMANCE UX IMPROVEMENT – NON-BREAKING: Enhanced file input with drag-drop feel */}
      <div className="file-input-wrapper">
        <input
          type="file"
          accept=".pdf,.docx"
          multiple
          onChange={handleChange}
          className="file-input"
          id="resume-upload"
        />
        <label htmlFor="resume-upload" className="file-input-label">
          <span className="file-input-icon">📁</span>
          <span className="file-input-text">
            {files.length === 0 ? "Click to select files" : "Add more files..."}
          </span>
        </label>
      </div>
      
      {/* PERFORMANCE UX IMPROVEMENT – NON-BREAKING: Enhanced file list with instant feedback */}
      {files.length > 0 && (
        <ul className="file-list">
          {files.map((f, i) => (
            <li key={i} className="file-item">
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
