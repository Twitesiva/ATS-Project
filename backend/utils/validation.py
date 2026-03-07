"""File type/size and JD/resume presence validation."""
from backend.config import (
    ALLOWED_EXTENSIONS,
    MIN_RESUMES,
    MAX_RESUMES,
    MAX_CONTENT_LENGTH,
)


def allowed_file(filename):
    """Return True if filename has an allowed extension."""
    if not filename or "." not in filename:
        return False
    return filename.rsplit(".", 1)[-1].lower() in ALLOWED_EXTENSIONS


def validate_upload(job_description, files):
    """
    Validate upload: JD non-empty, 1-8 files, each PDF or DOCX, within size.
    Return (True, None) if valid, else (False, error_message).
    """
    if not job_description or not (job_description and str(job_description).strip()):
        return False, "Job description is required"
    if not files:
        return False, "At least one resume is required"
    file_list = list(files) if hasattr(files, "__iter__") and not isinstance(files, (str, bytes)) else [files]
    if len(file_list) < MIN_RESUMES:
        return False, f"At least {MIN_RESUMES} resume is required"
    if len(file_list) > MAX_RESUMES:
        return False, f"Maximum {MAX_RESUMES} resumes allowed"
    for f in file_list:
        if not getattr(f, "filename", None):
            return False, "Invalid file"
        if not allowed_file(f.filename):
            return False, f"Only PDF and DOCX are allowed. Got: {f.filename}"
        try:
            f.seek(0, 2)
            size = f.tell()
            f.seek(0)
            if size > MAX_CONTENT_LENGTH:
                return False, f"File {f.filename} exceeds maximum size (10 MB)"
        except (OSError, AttributeError, Exception):
            try:
                f.seek(0)
            except Exception:
                pass
            # Non-seekable or other stream: skip size check (Flask still enforces MAX_CONTENT_LENGTH)
    return True, None
