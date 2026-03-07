"""Application configuration: paths, DB, upload folder, model names."""
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
DATABASE_PATH = os.path.join(BASE_DIR, "ats_resumes.db")
MAX_CONTENT_LENGTH = 10 * 1024 * 1024  # 10 MB per file
ALLOWED_EXTENSIONS = {"pdf", "docx"}
MIN_RESUMES = 1
MAX_RESUMES = 8
SENTENCE_TRANSFORMER_MODEL = "all-MiniLM-L6-v2"
SPACY_MODEL = "en_core_web_sm"
SKILL_SIMILARITY_THRESHOLD = 0.5
