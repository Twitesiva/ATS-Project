"""Flask app: CORS, route registration, init DB."""
# -*- coding: utf-8 -*-
import os
import sys
import warnings

# Suppress non-critical warnings for clean executive demos
# TT warning comes from transformers/tokenizers internals and is harmless
warnings.filterwarnings("ignore", message=".*TT: undefined function.*")
warnings.filterwarnings("ignore", message=".*Tokenizers.*")

# Ensure project root is on path when running as python backend/app.py or flask run
if __name__ == "__main__" or "FLASK_APP" in os.environ:
    _root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if _root not in sys.path:
        sys.path.insert(0, _root)

from flask import Flask
from flask_cors import CORS

from backend.models.schema import init_db

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024  # 50 MB max file size

import logging
from logging.handlers import RotatingFileHandler

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Add file handler for production-style logging
if not os.path.exists("logs"):
    os.makedirs("logs")
file_handler = RotatingFileHandler("logs/ats_backend.log", maxBytes=10240000, backupCount=5)
file_handler.setFormatter(logging.Formatter(
    "%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]"
))
file_handler.setLevel(logging.INFO)
app.logger.addHandler(file_handler)
logger.addHandler(file_handler)

# Enable CORS for frontend-backend cross-domain requests.
CORS(
    app,
    resources={
        r"/api/*": {
            "origins": "*",
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization", "X-Requested-With"],
        }
    },
)

init_db()

# PERFORMANCE OPTIMIZATION - CRITICAL: Preload models at startup
from backend.utils.model_loader import preload_models

print("Preloading ML models (SentenceTransformer, SpaCy)...")
preload_models()
print("[OK] ML models preloaded successfully")

# PERFORMANCE ARCHITECTURE - CRITICAL: Initialize ANN index
from backend.services.ann_index import init_ann_index, load_index_from_db

print("Initializing ANN index...")
if init_ann_index():
    print("[OK] FAISS skeleton ready")
    print("Loading existing embeddings from database...")
    load_index_from_db()
    print("[OK] ANN index populated and ready")
else:
    print("[WARN] ANN index failed to initialize. System will use exact matching.")

# Register API routes
from backend.api.upload import bp as upload_bp
from backend.api.match import bp as match_bp
from backend.api.store import bp as store_bp
from backend.api.resumes import bp as resumes_bp

# Canonical API routes used by frontend and local direct tests
app.register_blueprint(upload_bp, url_prefix="/api")
app.register_blueprint(match_bp, url_prefix="/api")
app.register_blueprint(store_bp, url_prefix="/api")
app.register_blueprint(resumes_bp, url_prefix="/api")

# Compatibility registration for deployments where Nginx rewrites /api/* -> /*
# This keeps both forms working:
# - /api/upload, /api/match, /api/fetch-resumes
# - /upload, /match, /fetch-resumes
app.register_blueprint(upload_bp, url_prefix="", name="upload_plain")
app.register_blueprint(match_bp, url_prefix="", name="match_plain")
app.register_blueprint(store_bp, url_prefix="", name="store_plain")
app.register_blueprint(resumes_bp, url_prefix="", name="resumes_plain")


@app.route("/health")
def health():
    """Health check endpoint with system status."""
    from backend.services.ann_index import get_index_stats, is_ann_available

    return {
        "status": "ok",
        "models_loaded": True,
        "ann_available": is_ann_available(),
        "ann_stats": get_index_stats(),
    }


if __name__ == "__main__":
    app.run(debug=True, port=5000)
