"""
Matching service: Sentence Transformer embeddings, cosine similarity for document match,
and skill-level matching/missing via embedding similarity. No hardcoded skills.
"""
import numpy as np
from functools import lru_cache
import hashlib

from backend.utils.model_loader import get_encoder, preload_models as preload_model

def _get_model():
    encoder = get_encoder()
    # For backward compatibility with existing code that expects (model, encoder)
    # We'll just return (None, encoder) since we mainly use the encoder
    return None, encoder


# PERFORMANCE OPTIMIZATION – NON-BREAKING: Preload model at module import (optional, called at startup)
def preload_model():
    """Preload embedding model at application startup to avoid first-request delay."""
    _get_model()


def _cosine_similarity(a, b):
    a = np.asarray(a).flatten()
    b = np.asarray(b).flatten()
    n = np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9)
    return float(np.clip(n, -1.0, 1.0))


# PERFORMANCE OPTIMIZATION – NON-BREAKING: Vectorized batch cosine similarity computation
def _batch_cosine_similarity(jd_embeddings, res_embeddings):
    """
    Compute cosine similarity matrix between JD skills and resume skills.
    Returns matrix of shape (num_jd_skills, num_res_skills).
    """
    jd_norm = np.linalg.norm(jd_embeddings, axis=1, keepdims=True)
    res_norm = np.linalg.norm(res_embeddings, axis=1, keepdims=True)
    # Avoid division by zero
    jd_norm = np.where(jd_norm == 0, 1e-9, jd_norm)
    res_norm = np.where(res_norm == 0, 1e-9, res_norm)
    
    jd_normalized = jd_embeddings / jd_norm
    res_normalized = res_embeddings / res_norm
    
    # Matrix multiplication: (num_jd, num_res)
    similarity_matrix = np.dot(jd_normalized, res_normalized.T)
    return np.clip(similarity_matrix, -1.0, 1.0)


# PERFORMANCE OPTIMIZATION – NON-BREAKING: In-memory cache for JD embeddings
_jd_embedding_cache = {}

# PERFORMANCE OPTIMIZATION – CRITICAL: Use centralized JD embedding caching
# The old cache is deprecated, now using batch_optimizer module
def _get_jd_embedding_cached(job_description, encode_func):
    """DEPRECATED: Use batch_optimizer.get_jd_embedding_cached instead."""
    from backend.services.batch_optimizer import get_jd_embedding_cached
    return get_jd_embedding_cached(job_description)


def clear_jd_cache():
    """Clear JD embedding cache (useful for memory management)."""
    # Clear the old cache
    global _jd_embedding_cache
    _jd_embedding_cache.clear()
    # Also clear the new cache
    from backend.services.batch_optimizer import clear_request_caches
    clear_request_caches()


def _location_matches(jd_loc, res_loc):
    """True if JD location and resume location match (case-insensitive, substring)."""
    if not jd_loc or not res_loc:
        return False
    j = (jd_loc or "").strip().lower()
    r = (res_loc or "").strip().lower()
    return j in r or r in j



def compute_location_display(jd_locations, res_locations):
    """
    Compute a single location string for display.

    - If JD has location(s): prefer a resume location that matches any JD location (substring);
      else use first resume location; else "User has not mentioned a location in the resume".
    - If JD has no location: use first resume location or "Resume does not contain a location".
    """
    jd_list = [loc for loc in (jd_locations or []) if loc and str(loc).strip()]
    res_list = [loc for loc in (res_locations or []) if loc and str(loc).strip()]

    if jd_list:
        for jd_loc in jd_list:
            for res_loc in res_list:
                if _location_matches(jd_loc, res_loc):
                    return res_loc
        if res_list:
            return res_list[0]
        return "User has not mentioned a location in the resume"

    if res_list:
        return res_list[0]
    return "Resume does not contain a location"
