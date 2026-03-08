"""Download and save ML models locally for offline usage."""
import os
import sys

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sentence_transformers import SentenceTransformer
import spacy

print("=" * 60)
print("DOWNLOADING ML MODELS FOR LOCAL STORAGE")
print("=" * 60)

# Create models directory
models_dir = os.path.join(os.path.dirname(__file__), "models")
os.makedirs(models_dir, exist_ok=True)
print(f"\nModels directory: {models_dir}")

# Download SentenceTransformer model
print("\n1. Downloading SentenceTransformer model (all-MiniLM-L6-v2)...")
try:
    model = SentenceTransformer("all-MiniLM-L6-v2")
    model_path = os.path.join(models_dir, "all-MiniLM-L6-v2")
    model.save(model_path)
    print(f"✅ SentenceTransformer model saved to: {model_path}")
except Exception as e:
    print(f"❌ Error downloading SentenceTransformer model: {e}")
    import traceback
    traceback.print_exc()

# Download spaCy model
print("\n2. Downloading spaCy model (en_core_web_sm)...")
try:
    spacy.cli.download("en_core_web_sm")
    print("✅ spaCy model downloaded successfully")
except Exception as e:
    print(f"❌ Error downloading spaCy model: {e}")

print("\n" + "=" * 60)
print("MODEL DOWNLOAD COMPLETE")
print("=" * 60)
print("\nNext steps:")
print("1. Verify models are in backend/models/ directory")
print("2. Update config.py to use local model paths")
print("3. Run backend/app.py - models will load from local folder")
