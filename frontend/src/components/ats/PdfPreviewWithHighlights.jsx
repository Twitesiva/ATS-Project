import { useState, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

// Configure worker in same module as Document/Page (required by react-pdf). Vite-friendly.
try {
  const workerUrl = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).href;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
} catch {
  // Fallback for environments where new URL with package path fails
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a customTextRenderer that wraps matching keywords in <mark> inside the PDF text layer.
 * Returns a string (HTML) for use with text layer innerHTML. No file modification.
 */
function makeCustomTextRenderer(keywords) {
  if (!keywords || keywords.length === 0) {
    return ({ str }) => escapeHtml(str ?? "");
  }
  const trimmed = keywords.map((k) => (k || "").trim()).filter(Boolean);
  if (trimmed.length === 0) {
    return ({ str }) => escapeHtml(str ?? "");
  }
  const pattern = trimmed.map(escapeRegex).join("|");
  const re = new RegExp(`(${pattern})`, "gi");
  return ({ str }) => {
    const safe = escapeHtml(str ?? "");
    return safe.replace(re, "<mark>$1</mark>");
  };
}

export default function PdfPreviewWithHighlights({ fileUrl, highlightKeywords }) {
  const [numPages, setNumPages] = useState(null);
  const [error, setError] = useState(null);

  const customTextRenderer = useCallback(
    makeCustomTextRenderer(highlightKeywords || []),
    [highlightKeywords]
  );

  const onLoadSuccess = useCallback(({ numPages: n }) => setNumPages(n), []);
  const onLoadError = useCallback((err) => setError(err?.message || "Failed to load PDF"), []);

  if (error) {
    return (
      <div className="resume-preview-pdf-error">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="resume-preview-pdf">
      <Document
        file={fileUrl}
        onLoadSuccess={onLoadSuccess}
        onLoadError={onLoadError}
        loading={<p className="resume-preview-pdf-loading">Loading PDF…</p>}
      >
        {numPages != null &&
          Array.from({ length: numPages }, (_, i) => (
            <Page
              key={i}
              pageNumber={i + 1}
              renderTextLayer={true}
              customTextRenderer={customTextRenderer}
              className="resume-preview-pdf-page"
            />
          ))}
      </Document>
    </div>
  );
}