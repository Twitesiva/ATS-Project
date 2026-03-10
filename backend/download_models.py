"""Download and save ML models locally for offline usage."""
import os
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from sentence_transformers import SentenceTransformer
    import spacy
except ImportError as e:
    print(f"[ERROR] Missing dependency: {e}")
    print("Install backend deps first:")
    print("python -m pip install -r backend/requirements.txt")
    raise SystemExit(1)


def ensure_sentence_transformer(models_dir: Path) -> bool:
    print("\n1. Ensuring SentenceTransformer model (all-MiniLM-L6-v2)...")
    model_path = models_dir / "all-MiniLM-L6-v2"

    # Reuse local copy if already present
    if model_path.exists() and any(model_path.iterdir()):
        print(f"[OK] SentenceTransformer model already present: {model_path}")
        return True

    try:
        model = SentenceTransformer("all-MiniLM-L6-v2")
        model.save(str(model_path))
        print(f"[OK] SentenceTransformer model saved to: {model_path}")
        return True
    except Exception as e:
        print(f"[ERROR] SentenceTransformer setup failed: {e}")
        return False


def ensure_spacy_model() -> bool:
    print("\n2. Ensuring spaCy model (en_core_web_sm)...")

    # First prefer already installed model (offline-safe)
    try:
        spacy.load("en_core_web_sm")
        print("[OK] spaCy model already installed and loadable")
        return True
    except Exception:
        pass

    # Fallback to download only if not installed
    try:
        spacy.cli.download("en_core_web_sm")
        spacy.load("en_core_web_sm")
        print("[OK] spaCy model downloaded and loadable")
        return True
    except Exception as e:
        print(f"[ERROR] spaCy model setup failed: {e}")
        print("Install it manually (with network enabled):")
        print("python -m pip install en_core_web_sm @ https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.7.1/en_core_web_sm-3.7.1.tar.gz")
        return False


def main() -> int:
    print("=" * 60)
    print("DOWNLOADING ML MODELS FOR LOCAL STORAGE")
    print("=" * 60)

    models_dir = Path(__file__).resolve().parent / "models"
    models_dir.mkdir(parents=True, exist_ok=True)
    print(f"\nModels directory: {models_dir}")

    st_ok = ensure_sentence_transformer(models_dir)
    spacy_ok = ensure_spacy_model()

    print("\n" + "=" * 60)
    print("MODEL SETUP SUMMARY")
    print("=" * 60)
    print(f"SentenceTransformer: {'OK' if st_ok else 'FAILED'}")
    print(f"spaCy en_core_web_sm: {'OK' if spacy_ok else 'FAILED'}")

    if st_ok and spacy_ok:
        print("\n[OK] All required models are ready")
        return 0

    print("\n[ERROR] One or more models are not ready")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
