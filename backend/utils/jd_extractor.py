"""
EXTENSION – SAFE TO REMOVE
JD File Extraction Utility

Extracts plain text from PDF and DOCX job description files.
This is a new utility module added as an extension to support JD file uploads.
It does not modify any existing ATS logic.
"""
import os
import io


def _clean_text(text):
    """Clean extracted text: normalize whitespace, remove excessive newlines."""
    if not text:
        return ""
    # Replace multiple whitespace with single space
    lines = text.splitlines()
    cleaned_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped:
            cleaned_lines.append(stripped)
    # Join with single newlines, then normalize internal whitespace
    text = "\n".join(cleaned_lines)
    # Replace multiple spaces with single space
    while "  " in text:
        text = text.replace("  ", " ")
    return text.strip()


def extract_text_from_pdf(file_stream):
    """
    Extract text from a PDF file stream.
    
    Args:
        file_stream: File-like object (BytesIO or file handle)
    
    Returns:
        str: Extracted plain text
    """
    import PyPDF2
    text_parts = []
    try:
        # Ensure we're at the beginning of the stream
        file_stream.seek(0)
        reader = PyPDF2.PdfReader(file_stream)
        for page in reader.pages:
            t = page.extract_text()
            if t:
                text_parts.append(t)
    except Exception as e:
        # Return empty string on extraction failure
        return ""
    finally:
        try:
            file_stream.seek(0)
        except Exception:
            pass
    
    raw_text = "\n".join(text_parts)
    return _clean_text(raw_text)


def extract_text_from_docx(file_stream):
    """
    Extract text from a DOCX file stream.
    
    Args:
        file_stream: File-like object (BytesIO or file handle)
    
    Returns:
        str: Extracted plain text
    """
    from docx import Document
    try:
        # Ensure we're at the beginning of the stream
        file_stream.seek(0)
        doc = Document(file_stream)
        paragraphs = [p.text.strip() for p in doc.paragraphs if p.text and p.text.strip()]
        raw_text = "\n".join(paragraphs)
    except Exception as e:
        # Return empty string on extraction failure
        return ""
    finally:
        try:
            file_stream.seek(0)
        except Exception:
            pass
    
    return _clean_text(raw_text)


def extract_jd_text(file_storage):
    """
    Extract text from a JD file (PDF or DOCX).
    
    Args:
        file_storage: Flask FileStorage object or file-like object with filename
    
    Returns:
        tuple: (success: bool, text_or_error: str)
            - success=True: text_or_error contains the extracted text
            - success=False: text_or_error contains the error message
    """
    if not file_storage or not hasattr(file_storage, 'filename'):
        return False, "No file provided"
    
    filename = file_storage.filename
    if not filename or '.' not in filename:
        return False, "Invalid filename"
    
    ext = filename.rsplit(".", 1)[-1].lower()
    
    if ext == "pdf":
        try:
            text = extract_text_from_pdf(file_storage)
            if not text or not text.strip():
                return False, "Could not extract text from PDF (empty or corrupted)"
            return True, text
        except Exception as e:
            return False, f"PDF extraction error: {str(e)}"
    
    elif ext in ("docx", "doc"):
        try:
            text = extract_text_from_docx(file_storage)
            if not text or not text.strip():
                return False, "Could not extract text from DOCX (empty or corrupted)"
            return True, text
        except Exception as e:
            return False, f"DOCX extraction error: {str(e)}"
    
    else:
        return False, f"Unsupported file type: {ext}. Only PDF and DOCX are allowed."
