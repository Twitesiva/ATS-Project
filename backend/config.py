"""Application configuration: paths, DB, upload folder, model names."""
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")

# Local models directory for offline ML model loading
MODELS_DIR = os.path.join(BASE_DIR, "models")
os.makedirs(MODELS_DIR, exist_ok=True)

# Supabase configuration (loaded from environment or defaults)
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://vnojbpuphsvzrvmjxoei.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZub2picHVwaHN2enJ2bWp4b2VpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4MTc1NDMsImV4cCI6MjA4NzM5MzU0M30.ah660DfGEpsa6XBcyjVDc7snPk8lqvadUZjgTtizbSQ")

MAX_CONTENT_LENGTH = 10 * 1024 * 1024  # 10 MB per file
ALLOWED_EXTENSIONS = {"pdf", "docx"}
MIN_RESUMES = 1
MAX_RESUMES = 8

# Use local model path if available, otherwise fallback to HuggingFace
SENTENCE_TRANSFORMER_MODEL = os.path.join(MODELS_DIR, "all-MiniLM-L6-v2")
SPACY_MODEL = "en_core_web_sm"  # spaCy handles its own caching
SKILL_SIMILARITY_THRESHOLD = 0.5
