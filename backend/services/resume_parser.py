"""Extract plain text from PDF and DOCX resume files."""
import os
import io
from concurrent.futures import ThreadPoolExecutor, as_completed
from backend.config import UPLOAD_FOLDER

try:
    import pdfplumber
except Exception:
    pdfplumber = None

try:
    import PyPDF2
except Exception:
    PyPDF2 = None

try:
    from docx import Document
except Exception:
    Document = None


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
    """Read PDF text with pdfplumber (primary) and PyPDF2 (fallback)."""
    text_parts = []
    
    # Try pdfplumber first (better layout preservation)
    try:
        if pdfplumber is None:
            raise ImportError("pdfplumber not available")
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                t = page.extract_text()
                if t:
                    text_parts.append(t)
        if text_parts:
            raw_text = "\n".join(text_parts)
            return _preprocess_text(raw_text)
    except Exception as e:
        print(f"[PARSER] pdfplumber failed: {e}. Falling back to PyPDF2.")
    
    # Fallback to PyPDF2
    try:
        if PyPDF2 is None:
            raise ImportError("PyPDF2 not available")
        text_parts = []
        with open(file_path, "rb") as f:
            reader = PyPDF2.PdfReader(f)
            for page in reader.pages:
                t = page.extract_text()
                if t:
                    text_parts.append(t)
        raw_text = "\n".join(text_parts) if text_parts else ""
        return _preprocess_text(raw_text)
    except Exception as e:
        print(f"[PARSER] PyPDF2 also failed: {e}")
        return ""


def _read_pdf_from_bytes(data):
    """Read PDF text directly from bytes (in-memory)."""
    text_parts = []
    
    # Try pdfplumber first
    try:
        if pdfplumber is None:
            raise ImportError("pdfplumber not available")
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            for page in pdf.pages:
                t = page.extract_text()
                if t:
                    text_parts.append(t)
        if text_parts:
            raw_text = "\n".join(text_parts)
            return _preprocess_text(raw_text)
    except Exception as e:
        print(f"[PARSER] pdfplumber (bytes) failed: {e}. Falling back to PyPDF2.")
    
    # Fallback to PyPDF2
    try:
        if PyPDF2 is None:
            raise ImportError("PyPDF2 not available")
        text_parts = []
        reader = PyPDF2.PdfReader(io.BytesIO(data))
        for page in reader.pages:
            t = page.extract_text()
            if t:
                text_parts.append(t)
        raw_text = "\n".join(text_parts) if text_parts else ""
        return _preprocess_text(raw_text)
    except Exception as e:
        print(f"[PARSER] PyPDF2 (bytes) also failed: {e}")
        return ""


def _read_docx(file_path):
    if Document is None:
        return ""
    doc = Document(file_path)
    chunks = []
    chunks.extend(p.text.strip() for p in doc.paragraphs if p.text and p.text.strip())
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                cell_text = (cell.text or "").strip()
                if cell_text:
                    chunks.append(cell_text)
    if not chunks:
        try:
            import zipfile
            import xml.etree.ElementTree as ET

            with zipfile.ZipFile(file_path) as zf:
                xml_parts = [name for name in zf.namelist() if name.startswith("word/") and name.endswith(".xml")]
                for part in xml_parts:
                    xml_bytes = zf.read(part)
                    root = ET.fromstring(xml_bytes)
                    for node in root.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t"):
                        value = (node.text or "").strip()
                        if value:
                            chunks.append(value)
        except Exception:
            pass
    raw_text = "\n".join(chunks)
    return _preprocess_text(raw_text)


def _read_docx_from_bytes(data):
    """Read DOCX text directly from bytes (in-memory)."""
    if Document is None:
        return ""
    try:
        doc = Document(io.BytesIO(data))
        chunks = []
        chunks.extend(p.text.strip() for p in doc.paragraphs if p.text and p.text.strip())
        for table in doc.tables:
            for row in table.rows:
                for cell in row.cells:
                    cell_text = (cell.text or "").strip()
                    if cell_text:
                        chunks.append(cell_text)
        if not chunks:
            try:
                import zipfile
                import xml.etree.ElementTree as ET

                with zipfile.ZipFile(io.BytesIO(data)) as zf:
                    xml_parts = [name for name in zf.namelist() if name.startswith("word/") and name.endswith(".xml")]
                    for part in xml_parts:
                        xml_bytes = zf.read(part)
                        root = ET.fromstring(xml_bytes)
                        for node in root.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t"):
                            value = (node.text or "").strip()
                            if value:
                                chunks.append(value)
            except Exception:
                pass
        raw_text = "\n".join(chunks)
        return _preprocess_text(raw_text)
    except Exception as e:
        print(f"[PARSER] DOCX from bytes failed: {e}")
        return ""


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


def parse_resume_bytes(data, original_name, path):
    """
    Parse a resume directly from in-memory bytes.
    
    Args:
        data: File bytes (bytes or bytearray)
        original_name: Original filename for display
        path: Unique path/identifier used for storage reference
    
    Returns:
        dict: {"path": path, "original_name": original_name, "text": extracted_text}
    """
    ext = os.path.splitext(original_name or path or "")[-1].lower()
    if ext == ".pdf":
        text = _read_pdf_from_bytes(data)
    elif ext in (".docx", ".doc"):
        text = _read_docx_from_bytes(data)
    else:
        text = ""
    return {"path": path, "original_name": original_name, "text": (text or "").strip()}


# PERFORMANCE OPTIMIZATION – NON-BREAKING: Parallel file parsing using thread pool
def _parse_single_resume(item):
    """Helper function for parallel parsing.
    
    Fallback: if file is not on local disk, attempts to download from Supabase Storage.
    This ensures compatibility with the new Supabase-Storage-only upload flow.
    """
    path = item.get("path") or item.get("original_name", "")
    original_name = item.get("original_name") or path
    full_path = os.path.join(UPLOAD_FOLDER, path)
    
    if os.path.isfile(full_path):
        return parse_resume_file(full_path, original_name)
    
    # FALLBACK: Download from Supabase Storage if file is not local
    try:
        from backend.services.supabase_client import get_supabase_client
        from backend.config import SUPABASE_RESUME_BUCKET
        bucket = (SUPABASE_RESUME_BUCKET or "").strip()
        if bucket:
            supabase = get_supabase_client()
            downloaded = supabase.storage.from_(bucket).download(path)
            if downloaded:
                data = bytes(downloaded)
                return parse_resume_bytes(data, original_name, path)
    except Exception as e:
        print(f"[PARSER] Supabase fallback failed for {path}: {e}")
    
    return {"path": path, "original_name": original_name, "text": ""}


def _parse_single_resume_entry(item):
    """Helper function for parallel in-memory parsing."""
    path = item.get("path") or item.get("original_name", "")
    original_name = item.get("original_name") or path
    data = item.get("bytes")
    
    if not data:
        return {"path": path, "original_name": original_name, "text": ""}
    
    return parse_resume_bytes(data, original_name, path)


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


def parse_resumes_from_entries(entries, max_workers=4):
    """
    Parse resumes directly from in-memory byte entries.
    
    entries: list of { bytes, path, original_name } where bytes is the file content.
    Return list of { path, original_name, text }.
    
    This replaces parse_resumes_from_paths for Supabase Storage workflows where
    files are never saved to local disk.
    """
    if not entries:
        return []
    
    # For single file, skip thread overhead
    if len(entries) == 1:
        return [_parse_single_resume_entry(entries[0])]
    
    # For multiple files, use thread pool for parallel parsing
    results = []
    with ThreadPoolExecutor(max_workers=min(max_workers, len(entries))) as executor:
        future_to_item = {
            executor.submit(_parse_single_resume_entry, item): item
            for item in entries
        }
        
        for future in as_completed(future_to_item):
            try:
                result = future.result()
                results.append(result)
            except Exception as e:
                item = future_to_item[future]
                path = item.get("path") or item.get("original_name", "")
                original_name = item.get("original_name") or path
                results.append({"path": path, "original_name": original_name, "text": ""})
    
    return results

