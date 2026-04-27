import { useRef } from "react";
import { X } from "lucide-react";

// EXTENSION – SAFE TO REMOVE: JD file upload support added
// This component now supports both text input and file upload for JD
export default function JobDescriptionForm({ 
  value, 
  onChange, 
  // EXTENSION – SAFE TO REMOVE: New props for file upload
  jdFile, 
  onJdFileChange,
  jdFileError,
  onJdFileError
}) {
  const fileInputRef = useRef(null);
  
  // EXTENSION – SAFE TO REMOVE: Determine if text input is disabled
  const isTextDisabled = Boolean(jdFile);
  
  // EXTENSION – SAFE TO REMOVE: Determine if file input is disabled
  const isFileDisabled = Boolean(value && value.trim());
  
  // EXTENSION – SAFE TO REMOVE: Handle file selection
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      const ext = file.name.split('.').pop().toLowerCase();
      if (!['pdf', 'docx'].includes(ext)) {
        onJdFileError && onJdFileError("Only PDF and DOCX files are allowed");
        // Clear the file input
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        return;
      }
      onJdFileError && onJdFileError("");
      onJdFileChange && onJdFileChange(file);
    }
  };
  
  // EXTENSION – SAFE TO REMOVE: Clear file selection
  const handleClearFile = () => {
    onJdFileChange && onJdFileChange(null);
    onJdFileError && onJdFileError("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
      <label htmlFor="jd" className="mb-2 block text-sm font-semibold text-slate-800">
        Job Description (required)
      </label>

      <div className="mb-3">
        <label
          className={[
            "flex items-center gap-2 rounded-xl border border-dashed px-3 py-2.5 text-sm transition-all duration-200",
            isFileDisabled
              ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
              : "cursor-pointer border-slate-300 bg-slate-50 text-slate-600 hover:border-blue-300 hover:bg-blue-50",
          ].join(" ")}
        >
          <span>📄</span>
          <span className="truncate">{jdFile ? jdFile.name : "Upload JD as PDF or DOCX (optional)"}</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx"
            onChange={handleFileChange}
            disabled={isFileDisabled}
            className="hidden"
          />
        </label>

        {jdFile ? (
          <button
            type="button"
            onClick={handleClearFile}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-all duration-200 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
          >
            <X size={12} />
            Clear file
          </button>
        ) : null}

        {isFileDisabled ? (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs font-medium text-amber-700">
            File upload disabled while text is entered
          </div>
        ) : null}
      </div>

      <textarea
        id="jd"
        className={[
          "textarea jd-input w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 transition-all duration-200 placeholder:text-slate-400",
          isTextDisabled ? "cursor-not-allowed bg-slate-50 opacity-70" : "focus:border-blue-400 focus:ring-2 focus:ring-blue-100",
        ].join(" ")}
        rows={10}
        placeholder={isTextDisabled ? "JD will be extracted from uploaded file..." : "Paste the job description here..."}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={isTextDisabled}
      />

      {isTextDisabled ? (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs font-medium text-amber-700">
          Text input disabled while file is uploaded
        </div>
      ) : null}
      {jdFileError ? <p className="mt-1 text-xs text-red-600">⚠️ {jdFileError}</p> : null}
    </div>
  );
}
