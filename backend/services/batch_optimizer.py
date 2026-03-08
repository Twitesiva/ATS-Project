"""
Batch Processing Optimizer for ATS System

This module implements enterprise-grade optimizations for multi-resume processing:
- Batch embedding computation
- Model singleton pattern
- Caching strategies
- Memory-efficient processing
- Parallel processing where beneficial

OPTIMIZATION PRINCIPLES:
1. Load models once at startup (singleton pattern)
2. Batch encode all texts in single calls
3. Cache expensive computations
4. Reuse parsed entities per request
5. Minimize redundant operations
"""

import numpy as np
import hashlib
from typing import List, Dict, Tuple, Optional, Any
from functools import lru_cache
import logging

logger = logging.getLogger(__name__)

# Global model singleton
_model_singleton = None
_encoder_singleton = None

# Global caches
_embedding_cache = {}
_entity_cache = {}
_role_cache = {}

# PERFORMANCE OPTIMIZATION – CRITICAL: Model loading singleton
def get_model_singleton():
    """
    Ensure SentenceTransformer model is loaded ONCE at backend startup.
    Returns (model, encoder) tuple.
    """
    global _model_singleton, _encoder_singleton
    
    if _model_singleton is None:
        from sentence_transformers import SentenceTransformer
        from backend.config import SENTENCE_TRANSFORMER_MODEL
        import os
        
        logger.info(f"Loading SentenceTransformer model from {SENTENCE_TRANSFORMER_MODEL}...")
        try:
            # Check if path exists
            if os.path.isdir(SENTENCE_TRANSFORMER_MODEL):
                logger.info("Local model directory found. Loading in offline mode...")
                _model_singleton = SentenceTransformer(SENTENCE_TRANSFORMER_MODEL)
            else:
                logger.warning(f"Local path {SENTENCE_TRANSFORMER_MODEL} not found. Attempting online load...")
                _model_singleton = SentenceTransformer("all-MiniLM-L6-v2")
                
            _encoder_singleton = _model_singleton.encode
            logger.info("SentenceTransformer model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load SentenceTransformer: {e}")
            # Final fallback
            try:
                logger.info("Using emergency fallback to online model...")
                _model_singleton = SentenceTransformer("all-MiniLM-L6-v2")
                _encoder_singleton = _model_singleton.encode
            except Exception as e2:
                logger.critical(f"CRITICAL: All model loading attempts failed: {e2}")
                raise RuntimeError(f"ML Model Loading Failure: {e2}")
    
    return _model_singleton, _encoder_singleton

# PERFORMANCE OPTIMIZATION – CRITICAL: Batch embedding computation
def batch_encode_texts(texts: List[str], max_length: int = 8000) -> np.ndarray:
    """
    Batch encode multiple texts in a single encode() call.
    
    Args:
        texts: List of text strings to encode
        max_length: Maximum length per text (truncation)
    
    Returns:
        numpy array of embeddings (len(texts), embedding_dim)
    """
    if not texts:
        return np.array([])
    
    # Truncate texts to prevent memory issues
    truncated_texts = [text[:max_length] for text in texts]
    
    # Get encoder from singleton
    _, encoder = get_model_singleton()
    
    # Single batch encode call - this is the key optimization
    embeddings = encoder(truncated_texts)
    return np.asarray(embeddings, dtype=np.float32)

# PERFORMANCE OPTIMIZATION – CRITICAL: JD embedding caching
def get_jd_embedding_cached(job_description: str) -> np.ndarray:
    """
    Get JD embedding with content-based caching.
    Uses first 1000 chars for cache key to balance accuracy and hit rate.
    """
    # Generate cache key from first 1000 chars
    cache_key = hashlib.md5(job_description[:1000].encode()).hexdigest()
    
    if cache_key in _embedding_cache:
        return _embedding_cache[cache_key]
    
    # Compute embedding
    _, encoder = get_model_singleton()
    embedding = encoder([job_description[:8000]])[0]
    embedding = np.asarray(embedding, dtype=np.float32)
    
    # Normalize
    norm = np.linalg.norm(embedding)
    if norm > 0:
        embedding = embedding / norm
    
    # Cache it
    _embedding_cache[cache_key] = embedding
    return embedding

# PERFORMANCE OPTIMIZATION – CRITICAL: Role embedding caching
def get_role_embeddings_cached(roles: List[str], contexts: List[str]) -> np.ndarray:
    """
    Get role embeddings for multiple roles with caching.
    """
    if not roles:
        return np.array([])
    
    # Create combined descriptions
    role_descriptions = []
    for role, context in zip(roles, contexts):
        desc = f"Role: {role}. Context: {context}".strip()
        role_descriptions.append(desc[:1000])
    
    # Encode in batch
    return batch_encode_texts(role_descriptions)

# PERFORMANCE OPTIMIZATION – CRITICAL: Batch cosine similarity
def batch_cosine_similarity_matrix(a_embeddings: np.ndarray, b_embeddings: np.ndarray) -> np.ndarray:
    """
    Compute cosine similarity matrix between two sets of embeddings.
    Returns matrix of shape (len(a_embeddings), len(b_embeddings))
    """
    if len(a_embeddings) == 0 or len(b_embeddings) == 0:
        return np.array([])
    
    # Normalize embeddings
    a_norm = np.linalg.norm(a_embeddings, axis=1, keepdims=True)
    b_norm = np.linalg.norm(b_embeddings, axis=1, keepdims=True)
    
    # Avoid division by zero
    a_norm = np.where(a_norm == 0, 1e-9, a_norm)
    b_norm = np.where(b_norm == 0, 1e-9, b_norm)
    
    a_normalized = a_embeddings / a_norm
    b_normalized = b_embeddings / b_norm
    
    # Matrix multiplication for batch similarity
    similarity_matrix = np.dot(a_normalized, b_normalized.T)
    return np.clip(similarity_matrix, -1.0, 1.0)

# PERFORMANCE OPTIMIZATION – CRITICAL: Clear caches between requests
def clear_request_caches():
    """Clear temporary caches at the end of each request to prevent memory leaks."""
    global _embedding_cache, _entity_cache, _role_cache
    _embedding_cache.clear()
    _entity_cache.clear()
    _role_cache.clear()
    logger.debug("Request caches cleared")

# PERFORMANCE OPTIMIZATION – CRITICAL: Preload model at startup
def preload_models_optimized():
    """Preload all models at application startup for instant first request."""
    logger.info("Preloading optimized models...")
    
    # Load SentenceTransformer model
    get_model_singleton()
    
    # Load spaCy model
    from backend.services.nlp_pipeline import _get_nlp
    _get_nlp()
    
    # Load stopwords
    from backend.services.nlp_pipeline import _get_stopwords
    _get_stopwords()
    
    logger.info("All models preloaded successfully")