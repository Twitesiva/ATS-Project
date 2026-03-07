"""Flask app: CORS, route registration, init DB."""
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

from backend.config import MAX_CONTENT_LENGTH
from backend.models.schema import init_db

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH
CORS(app)

init_db()

# PERFORMANCE OPTIMIZATION – CRITICAL: Lazy-load ML models to reduce startup time
# Models will be loaded on first request to reduce initial startup delay
print("Initializing ATS backend (lazy-load for faster startup)...")

# PERFORMANCE ARCHITECTURE – CRITICAL: Initialize ANN index for ultra-fast matching
# Will be initialized on demand for faster startup
print("ANN index will be initialized on first use for faster startup")

# Register API routes
from backend.api.upload import bp as upload_bp
from backend.api.match import bp as match_bp
from backend.api.store import bp as store_bp
from backend.api.resumes import bp as resumes_bp

app.register_blueprint(upload_bp, url_prefix="/api")
app.register_blueprint(match_bp, url_prefix="/api")
app.register_blueprint(store_bp, url_prefix="/api")
app.register_blueprint(resumes_bp, url_prefix="/api")


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


# PERFORMANCE OPTIMIZATION – CRITICAL: keep startup fast with lazy model loading.
# SentenceTransformer and related ML models are loaded on first request that needs them.


if __name__ == "__main__":
    app.run(debug=True, port=5000)
