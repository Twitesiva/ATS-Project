"""
Matching service: Sentence Transformer embeddings, cosine similarity for document match,
and skill-level matching/missing via embedding similarity. No hardcoded skills.
"""
import numpy as np
from functools import lru_cache
import hashlib

_encoder = None
_model = None

# PERFORMANCE OPTIMIZATION – NON-BREAKING: Global model singleton with eager loading support
def _get_model():
    global _encoder, _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        from backend.config import SENTENCE_TRANSFORMER_MODEL
        _model = SentenceTransformer(SENTENCE_TRANSFORMER_MODEL)
        _encoder = _model.encode
    return _model, _encoder


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


def run_matching(job_description, resume_text, jd_skills, resume_skills, use_semantic_roles=True):
    """
    Compute document-level match percentage with SEMANTIC ROLE UNDERSTANDING.
    
    NEW: When use_semantic_roles=True, uses meaning-based matching instead of keyword matching.
    This prevents incorrect matches like "Java Developer" JD matching "Java Tester" resumes.
    
    Scoring breakdown (semantic mode):
    - 50% Role intent similarity (semantic understanding of actual job function)
    - 30% Skill semantic similarity (meaning of skills, not just keyword overlap)
    - 20% Experience relevance (document-level context similarity)
    
    Returns (match_percentage 0-100, matching_skills list, missing_skills list).
    """
    from backend.config import SKILL_SIMILARITY_THRESHOLD
    
    # SEMANTIC ROLE MATCHING – NON-BREAKING: Use new semantic matching if enabled
    if use_semantic_roles:
        from backend.services.role_intent import compute_semantic_match_score
        
        result = compute_semantic_match_score(
            jd_text=job_description,
            resume_text=resume_text,
            jd_skills=jd_skills,
            resume_skills=resume_skills
        )
        
        return (
            result["match_percentage"],
            result["matching_skills"],
            result["missing_skills"]
        )
    
    # LEGACY: Original keyword-based matching (fallback)
    _, encode = _get_model()
    
    # PERFORMANCE OPTIMIZATION – CRITICAL: Use batch optimizer for JD embedding
    from backend.services.batch_optimizer import get_jd_embedding_cached
    jd_emb = get_jd_embedding_cached(job_description)
    res_emb = encode([resume_text[:8000]])[0]
    doc_sim = _cosine_similarity(jd_emb, res_emb)
    match_percentage = (doc_sim + 1) / 2 * 100  # map [-1,1] to [0,100]

    if not jd_skills:
        return round(match_percentage, 2), [], []

    # Skill-level: for each JD skill, check if any resume skill is similar enough
    if not resume_skills:
        return round(match_percentage, 2), [], list(jd_skills)

    # PERFORMANCE OPTIMIZATION – NON-BREAKING: Batch encode all skills at once
    all_skills = list(resume_skills) + list(jd_skills)
    all_embeddings = encode(all_skills)
    
    res_embeddings = all_embeddings[:len(resume_skills)]
    jd_embeddings = all_embeddings[len(resume_skills):]
    
    # PERFORMANCE OPTIMIZATION – NON-BREAKING: Vectorized similarity computation
    similarity_matrix = _batch_cosine_similarity(jd_embeddings, res_embeddings)
    max_similarities = np.max(similarity_matrix, axis=1)
    
    matching = [
        jd_skills[i] 
        for i, sim in enumerate(max_similarities) 
        if sim >= SKILL_SIMILARITY_THRESHOLD
    ]
    missing = [s for s in jd_skills if s not in matching]
    
    return round(match_percentage, 2), matching, missing


# PERFORMANCE OPTIMIZATION – NON-BREAKING: Batch matching for multiple resumes
def run_batch_matching(job_description, resume_items, jd_skills, jd_locations, use_semantic_roles=True):
    """
    Process multiple resumes in batch with SEMANTIC ROLE UNDERSTANDING.
    
    NEW: When use_semantic_roles=True, uses meaning-based matching to understand
    actual role intent, preventing incorrect matches like Java Developer vs Java Tester.
    
    Args:
        job_description: JD text
        resume_items: List of dicts with 'text', 'skills', 'locations', etc.
        jd_skills: Extracted JD skills
        jd_locations: Extracted JD locations
        use_semantic_roles: Enable semantic role-based matching (default: True)
    
    Returns:
        List of result dicts in the same order as resume_items
    """
    from backend.config import SKILL_SIMILARITY_THRESHOLD
    
    if not resume_items:
        return []
    
    # PERFORMANCE OPTIMIZATION – CRITICAL: Use batch optimizer for JD embedding
    from backend.services.batch_optimizer import get_jd_embedding_cached, batch_encode_texts
    jd_emb = get_jd_embedding_cached(job_description)
    
    # SEMANTIC ROLE MATCHING – NON-BREAKING: Use semantic matching if enabled
    if use_semantic_roles:
        from backend.services.role_intent import compute_semantic_match_score
        
        results = []
        for item in resume_items:
            res_text = item["text"]
            res_skills = item.get("skills", [])
            res_locations = item.get("locations", [])
            res_exp = item.get("experience_years")
            res_phones = item.get("phone_numbers", [])
            res_emails = item.get("emails", [])
            
            # Compute semantic match with role understanding
            match_result = compute_semantic_match_score(
                jd_text=job_description,
                resume_text=res_text,
                jd_skills=jd_skills,
                resume_skills=res_skills
            )
            
            location_display = compute_location_display(jd_locations, res_locations)
            
            results.append({
                "original_name": item.get("original_name", ""),
                "path": item.get("path", ""),
                "match_percentage": match_result["match_percentage"],
                "matching_skills": match_result["matching_skills"],
                "missing_skills": match_result["missing_skills"],
                "experience_years": res_exp,
                "locations": res_locations,
                "location_display": location_display,
                "extracted_skills": res_skills,
                "raw_text": res_text,
                "phone_numbers": res_phones,
                "emails": res_emails,
                # Additional semantic info for debugging
                "_semantic_scores": {
                    "role_similarity": match_result.get("role_similarity"),
                    "skill_similarity": match_result.get("skill_similarity"),
                    "experience_relevance": match_result.get("experience_relevance"),
                } if match_result.get("role_similarity") else None
            })
        
        # Sort by match percentage descending
        results.sort(key=lambda x: x["match_percentage"] or 0, reverse=True)
        return results
    
    # LEGACY: Original keyword-based batch matching (fallback)
    _, encode = _get_model()

    # PERFORMANCE OPTIMIZATION – CRITICAL: Batch encode all resume texts at once
    resume_texts = [item["text"][:8000] for item in resume_items]
    resume_embeddings = batch_encode_texts(resume_texts)
    
    # PERFORMANCE OPTIMIZATION – CRITICAL: Batch encode all JD skills once
    jd_skill_embeddings = encode(jd_skills) if jd_skills else np.array([])
    
    results = []
    for idx, item in enumerate(resume_items):
        res_text = item["text"]
        res_skills = item.get("skills", [])
        res_locations = item.get("locations", [])
        res_exp = item.get("experience_years")
        res_phones = item.get("phone_numbers", [])
        res_emails = item.get("emails", [])
        
        # Document similarity
        res_emb = resume_embeddings[idx]
        doc_sim = _cosine_similarity(jd_emb, res_emb)
        match_percentage = (doc_sim + 1) / 2 * 100
        
        # Skill matching with vectorized computation
        matching_skills = []
        missing_skills = list(jd_skills) if jd_skills else []
        
        if jd_skills and res_skills:
            # PERFORMANCE OPTIMIZATION – CRITICAL: Batch encode resume skills once per item
            res_skill_embeddings = encode(res_skills)
            
            # PERFORMANCE OPTIMIZATION – CRITICAL: Vectorized similarity matrix
            from backend.services.batch_optimizer import batch_cosine_similarity_matrix
            similarity_matrix = batch_cosine_similarity_matrix(jd_skill_embeddings, res_skill_embeddings)
            max_similarities = np.max(similarity_matrix, axis=1)
            
            matching_skills = [
                jd_skills[i] 
                for i, sim in enumerate(max_similarities) 
                if sim >= SKILL_SIMILARITY_THRESHOLD
            ]
            missing_skills = [s for s in jd_skills if s not in matching_skills]
        
        location_display = compute_location_display(jd_locations, res_locations)
        
        results.append({
            "original_name": item.get("original_name", ""),
            "path": item.get("path", ""),
            "match_percentage": round(match_percentage, 2),
            "matching_skills": matching_skills,
            "missing_skills": missing_skills,
            "experience_years": res_exp,
            "locations": res_locations,
            "location_display": location_display,
            "extracted_skills": res_skills,
            "raw_text": res_text,
            "phone_numbers": res_phones,
            "emails": res_emails,
        })

    # Sort by match percentage descending
    results.sort(key=lambda x: x["match_percentage"] or 0, reverse=True)
    return results


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
