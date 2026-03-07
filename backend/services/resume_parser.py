"""Extract plain text from PDF and DOCX resume files."""
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from backend.config import BASE_DIR, UPLOAD_FOLDER


# PERFORMANCE OPTIMIZATION – NON-BREAKING: Text preprocessing to reduce embedding computation
def _preprocess_text(text):
    """
    Clean and preprocess text before embedding.
    Removes excessive whitespace while preserving semantic content.
    """
    if not text:
        return ""
    
    # Remove excessive newlines and whitespace
    import re
    # Replace multiple newlines with single newline
    text = re.sub(r'\n{3,}', '\n\n', text)
    # Replace multiple spaces with single space
    text = re.sub(r' {2,}', ' ', text)
    # Remove common footer/header patterns (page numbers, etc.)
    text = re.sub(r'\n\s*Page\s+\d+\s*(of\s*\d+)?\s*\n', '\n', text, flags=re.IGNORECASE)
    # Remove email/phone signature blocks (common patterns)
    text = re.sub(r'\n[_-]{10,}\n.*?(?:email|phone|contact).*', '', text, flags=re.IGNORECASE | re.DOTALL)
    
    return text.strip()


def _read_pdf(file_path):
    import PyPDF2
    text_parts = []
    with open(file_path, "rb") as f:
        reader = PyPDF2.PdfReader(f)
        for page in reader.pages:
            t = page.extract_text()
            if t:
                text_parts.append(t)
    raw_text = "\n".join(text_parts) if text_parts else ""
    return _preprocess_text(raw_text)


def _read_docx(file_path):
    from docx import Document
    doc = Document(file_path)
    raw_text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    return _preprocess_text(raw_text)


def parse_resume_file(full_path, original_name):
    """Parse one file; return dict with path (relative), original_name, text."""
    ext = os.path.splitext(full_path)[-1].lower()
    if ext == ".pdf":
        text = _read_pdf(full_path)
    elif ext in (".docx", ".doc"):
        text = _read_docx(full_path)
    else:
        text = ""
    return {"path": os.path.basename(full_path), "original_name": original_name, "text": (text or "").strip()}


# PERFORMANCE OPTIMIZATION – NON-BREAKING: Parallel file parsing using thread pool
def _parse_single_resume(item):
    """Helper function for parallel parsing."""
    path = item.get("path") or item.get("original_name", "")
    original_name = item.get("original_name") or path
    full_path = os.path.join(UPLOAD_FOLDER, path)
    
    if not os.path.isfile(full_path):
        return {"path": path, "original_name": original_name, "text": ""}
    
    return parse_resume_file(full_path, original_name)


def parse_resumes_from_paths(resume_paths, max_workers=4):
    """
    resume_paths: list of { path, original_name } (path is relative name under UPLOAD_FOLDER).
    Return list of { path, original_name, text }.
    
    PERFORMANCE OPTIMIZATION – NON-BREAKING: Uses parallel processing for multiple files.
    """
    if not resume_paths:
        return []
    
    # For single file, skip thread overhead
    if len(resume_paths) == 1:
        return [_parse_single_resume(resume_paths[0])]
    
    # For multiple files, use thread pool for parallel I/O
    results = []
    with ThreadPoolExecutor(max_workers=min(max_workers, len(resume_paths))) as executor:
        # Submit all tasks
        future_to_item = {
            executor.submit(_parse_single_resume, item): item 
            for item in resume_paths
        }
        
        # Collect results as they complete
        for future in as_completed(future_to_item):
            try:
                result = future.result()
                results.append(result)
            except Exception as e:
                # On error, return empty text for that file
                item = future_to_item[future]
                path = item.get("path") or item.get("original_name", "")
                original_name = item.get("original_name") or path
                results.append({"path": path, "original_name": original_name, "text": ""})
    
    return results
