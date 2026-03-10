import { useRef } from "react";

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
    <div className="form-group">
      <label htmlFor="jd">Job Description (required)</label>
      
      {/* EXTENSION – SAFE TO REMOVE: File upload section */}
      <div className="jd-file-upload" style={{ marginBottom: "12px" }}>
        <label 
          className={`file-input-label ${isFileDisabled ? 'disabled' : ''}`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 12px",
            border: "1px dashed #ccc",
            borderRadius: "6px",
            cursor: isFileDisabled ? "not-allowed" : "pointer",
            opacity: isFileDisabled ? 0.6 : 1,
            backgroundColor: isFileDisabled ? "#f5f5f5" : "#fafafa"
          }}
        >
          <span>📄</span>
          <span>
            {jdFile ? jdFile.name : "Upload JD as PDF or DOCX (optional)"}
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx"
            onChange={handleFileChange}
            disabled={isFileDisabled}
            style={{ display: "none" }}
          />
        </label>
        
        {jdFile && (
          <button
            type="button"
            onClick={handleClearFile}
            style={{
              marginTop: "4px",
              fontSize: "12px",
              color: "#666",
              background: "none",
              border: "none",
              cursor: "pointer",
              textDecoration: "underline"
            }}
          >
            Clear file
          </button>
        )}
        
        {isFileDisabled && (
          <p style={{ fontSize: "12px", color: "#888", marginTop: "4px" }}>
            File upload disabled while text is entered
          </p>
        )}
      </div>
      
      {/* Original textarea - unchanged behavior */}
      <textarea
        id="jd"
        className="textarea jd-input"
        rows={10}
        placeholder={isTextDisabled ? "JD will be extracted from uploaded file..." : "Paste the job description here..."}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={isTextDisabled}
        style={isTextDisabled ? { 
          backgroundColor: "#f5f5f5", 
          cursor: "not-allowed",
          opacity: 0.6 
        } : {}}
      />
      
      {isTextDisabled && (
        <p style={{ fontSize: "12px", color: "#888", marginTop: "4px" }}>
          Text input disabled while file is uploaded
        </p>
      )}
      
      {jdFileError && (
        <p style={{ fontSize: "12px", color: "#d32f2f", marginTop: "4px" }}>
          ⚠️ {jdFileError}
        </p>
      )}
    </div>
  );
}
