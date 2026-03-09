# ML Models Directory

This directory contains locally cached ML models for offline usage.

## Directory Structure

```
backend/models/
├── all-MiniLM-L6-v2/          # SentenceTransformer model
│   ├── config.json
│   ├── modules.json
│   ├── pytorch_model.bin
│   ├── sentence_bert_config.json
│   ├── tokenizer.json
│   └── vocab.txt
└── README.md                   # This file
```

## Setup Instructions

### 1. Download Models (First Time Only)

Run the download script once:

```bash
cd backend
python download_models.py
```

This will:
- Download `all-MiniLM-L6-v2` from HuggingFace
- Save it to `backend/models/all-MiniLM-L6-v2/`
- Download spaCy's `en_core_web_sm` model

### 2. Verify Installation

After download completes, you should see:

```
✅ SentenceTransformer model saved to: backend/models/all-MiniLM-L6-v2
✅ spaCy model downloaded successfully
```

### 3. Run Backend

```bash
python app.py
```

The backend will now load models from the local directory instead of downloading them every time.

## Benefits

### Before (Online Mode)
- ❌ Downloads model on every startup
- ❌ Slow startup time (~30-60 seconds)
- ❌ Requires internet connection
- ❌ Rate limiting from HuggingFace
- ❌ Inconsistent performance

### After (Local Mode)
- ✅ Loads model from disk instantly
- ✅ Fast startup time (~2-5 seconds)
- ✅ Works offline
- ✅ No rate limiting
- ✅ Consistent performance

## Model Details

### SentenceTransformer: all-MiniLM-L6-v2

- **Purpose:** Generate embeddings for resume-JD matching
- **Size:** ~90 MB
- **Type:** Sentence-BERT model
- **Usage:** Semantic similarity search
- **Source:** https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2

### spaCy: en_core_web_sm

- **Purpose:** NLP pipeline (tokenization, POS tagging, NER)
- **Size:** ~12 MB
- **Type:** Small English model
- **Usage:** Resume text processing
- **Source:** https://spacy.io/models/en

## Configuration

Models are configured in `backend/config.py`:

```python
# Local models directory
MODELS_DIR = os.path.join(BASE_DIR, "models")

# Use local model path
SENTENCE_TRANSFORMER_MODEL = os.path.join(MODELS_DIR, "all-MiniLM-L6-v2")
```

## Troubleshooting

### Issue: "OSError: Can't load model from '...'"

**Solution:** Run the download script again:
```bash
python download_models.py
```

### Issue: "ModuleNotFoundError: No module named 'sentence_transformers'"

**Solution:** Install dependencies:
```bash
pip install -r requirements.txt
```

### Issue: Model loads from HuggingFace anyway

**Check:** 
1. Verify model exists in `backend/models/`
2. Check console logs for `[NLP] Loaded model from local path` message
3. Ensure `local_files_only=True` is set in code

## For Developers

### Adding New Models

If you need to add another model:

1. Update `download_models.py`:
```python
model = SentenceTransformer("model-name")
model.save(os.path.join(MODELS_DIR, "model-name"))
```

2. Update `config.py`:
```python
NEW_MODEL = os.path.join(MODELS_DIR, "model-name")
```

3. Use in your service:
```python
model = SentenceTransformer(
    config.NEW_MODEL,
    local_files_only=True
)
```

## Maintenance

### Clearing Cache (If Needed)

To force re-download:

```bash
# Delete models directory
rm -rf backend/models/all-MiniLM-L6-v2

# Re-run download
python download_models.py
```

### Updating Model Version

1. Delete old model folder
2. Update model name in `config.py`
3. Run `download_models.py` again

## Performance Metrics

### Startup Time Comparison

| Scenario | Time | Network Required |
|----------|------|------------------|
| **First Run (Download)** | ~60s | ✅ Yes |
| **Subsequent Runs (Local)** | ~3s | ❌ No |
| **Without Local Cache** | ~45s | ✅ Yes |

### Memory Usage

- **SentenceTransformer:** ~200 MB RAM
- **spaCy:** ~50 MB RAM
- **Total:** ~250 MB RAM

## References

- [SentenceTransformers Documentation](https://www.sbert.net/)
- [HuggingFace Model Hub](https://huggingface.co/models)
- [spaCy Documentation](https://spacy.io/usage/models)

---

**Last Updated:** March 7, 2026  
**Model Version:** all-MiniLM-L6-v2  
**Status:** ✅ Production Ready
