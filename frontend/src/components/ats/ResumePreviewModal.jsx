import PdfPreviewWithHighlights from "./PdfPreviewWithHighlights";

function getFileExtension(path) {
  if (!path || typeof path !== "string") return "";
  const last = path.split(".").pop();
  return last ? last.toLowerCase() : "";
}

export default function ResumePreviewModal({ resume, onClose, highlightKeywords }) {
  if (!resume) return null;
  const rawText = resume.raw_text || "";
  const filePath = resume.resume_file_path || resume.path || "";
  const fileUrl = filePath ? `/api/resume-file/${encodeURIComponent(filePath)}` : null;
  const isPdf = getFileExtension(filePath) === "pdf";
  const isWord = ["doc", "docx"].includes(getFileExtension(filePath));
  const hasFilters = highlightKeywords && highlightKeywords.length > 0;
  const termsToHighlight = hasFilters ? highlightKeywords : (resume.matching_skills || []);

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Resume preview">
      <div className="modal-content resume-preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{resume.original_name || resume.name || "Resume"}</h3>
          <button type="button" className="btn-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>
        <div className="modal-body resume-preview-body">
          {/* PDF: react-pdf with text-layer highlighting only; file never modified */}
          {fileUrl && isPdf && (
            <section className="resume-preview-original" aria-label="Original file">
              <PdfPreviewWithHighlights fileUrl={fileUrl} highlightKeywords={hasFilters ? highlightKeywords : []} />
            </section>
          )}

          {/* Word: read-only text; when filters applied, temporary span/mark highlights in same block (no overlay) */}
          {fileUrl && isWord && (
            <section className="resume-preview-original resume-preview-docx" aria-label="Original file">
              <p className="resume-preview-docx-label">Text preview (Word document)</p>
              {rawText ? (
                <div className="resume-preview-text resume-preview-text-content">
                  {hasFilters ? (
                    <pre className="resume-preview-text-content-pre">
                      {termsToHighlight.reduce((text, term) => {
                        const re = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
                        return text.replace(re, "<mark>$1</mark>");
                      }, rawText)}
                    </pre>
                  ) : (
                    <pre className="resume-preview-text-content-pre">{rawText}</pre>
                  )}
                </div>
              ) : (
                <p>No text available.</p>
              )}
              <a href={fileUrl} download className="resume-preview-download" rel="noopener noreferrer">
                Download original file
              </a>
            </section>
          )}

          {fileUrl && !isPdf && !isWord && (
            <section className="resume-preview-original">
              <a href={fileUrl} download className="resume-preview-download" rel="noopener noreferrer">
                Download file
              </a>
            </section>
          )}

          {/* No file path: text-only fallback (e.g. Match page or legacy data) */}
          {!fileUrl && (
            <section className="resume-preview-text-only">
              <div className="resume-preview-text">
                {rawText ? (
                  hasFilters ? (
                    <pre>
                      {termsToHighlight.reduce((text, term) => {
                        const re = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
                        return text.replace(re, "<mark>$1</mark>");
                      }, rawText)}
                    </pre>
                  ) : (
                    <pre>{rawText}</pre>
                  )
                ) : (
                  <p>No text available for preview.</p>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}