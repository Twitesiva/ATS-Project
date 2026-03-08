import logging
import sys
import threading

logger = logging.getLogger(__name__)

# Singletons for models
_nlp = None
_encoder = None
_embedding_model = None
_stopwords = None

_lock = threading.Lock()

def get_nlp():
    """Lazy-load and return the spaCy NLP model."""
    global _nlp
    if _nlp is None:
        with _lock:
            if _nlp is None:
                import spacy
                model_name = "en_core_web_sm"
                try:
                    _nlp = spacy.load(model_name)
                    logger.info(f"[NLP] Loaded spaCy model: {model_name}")
                except OSError:
                    logger.warning(f"[NLP] spaCy model {model_name} not found. Downloading...")
                    import subprocess
                    subprocess.run([sys.executable, "-m", "spacy", "download", model_name], check=True, capture_output=True)
                    _nlp = spacy.load(model_name)
                    logger.info(f"[NLP] Downloaded and loaded spaCy model: {model_name}")
    return _nlp

def get_encoder():
    """Lazy-load and return the SentenceTransformer encoder."""
    global _encoder, _embedding_model
    if _encoder is None:
        with _lock:
            if _encoder is None:
                from sentence_transformers import SentenceTransformer
                model_name = "all-MiniLM-L6-v2"
                
                print(f"[NLP] Loading embedding model: {model_name}")
                try:
                    # Initialize SentenceTransformer
                    _embedding_model = SentenceTransformer(model_name)
                    # Assign the encode method to _encoder
                    _encoder = _embedding_model.encode
                    print(f"[NLP] Model loaded successfully: {model_name}")
                except Exception as e:
                    logger.error(f"[NLP] Failed to load SentenceTransformer model: {e}")
                    raise RuntimeError(f"Could not load embedding model: {e}")
    return _encoder

def get_stopwords():
    """Lazy-load and return the NLTK stopwords."""
    global _stopwords
    if _stopwords is None:
        with _lock:
            if _stopwords is None:
                import nltk
                try:
                    _stopwords = set(nltk.corpus.stopwords.words("english"))
                except LookupError:
                    print("[NLP] Downloading NLTK stopwords...")
                    nltk.download("stopwords", quiet=True)
                    _stopwords = set(nltk.corpus.stopwords.words("english"))
    return _stopwords

def preload_models():
    """
    Explicitly preload core models as requested:
    1. _get_nlp() (SpaCy)
    2. _get_stopwords() (NLTK)
    3. _get_encoder() (SentenceTransformer)
    
    Ensures no first-request latency.
    """
    try:
        print("[NLP] Preloading all models for startup...")
        
        # 1. Load spaCy
        get_nlp()
        
        # 2. Load stopwords
        get_stopwords()
        
        # 3. Load encoder
        get_encoder()
        
        logger.info("[NLP] All models preloaded successfully.")
        return True
    except Exception as e:
        logger.error(f"[NLP] Error during model preloading: {e}")
        return False

def get_system_health():
    """Verify if all required components are loaded and ready."""
    return {
        "spacy_loaded": _nlp is not None,
        "stopwords_loaded": _stopwords is not None,
        "encoder_loaded": _encoder is not None,
        "faiss_ready": "faiss" in sys.modules
    }
