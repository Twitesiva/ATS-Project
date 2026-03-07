"""
Role Intent Extraction Service - Semantic Role Understanding for ATS

This module extracts and understands the ROLE INTENT from job descriptions and resumes,
enabling meaning-based matching instead of keyword matching.

KEY CONCEPTS:
- Role Intent: The actual job function (e.g., "Java Developer" vs "Java Tester")
- Semantic Understanding: Uses embeddings to capture meaning, not just keywords
- Context Awareness: Distinguishes between similar keywords in different contexts

EXAMPLES OF CORRECTED MATCHING:
- "Java Developer" JD should NOT match "Java Tester" resume (different role intent)
- "Python Developer" should NOT match "Java Developer" (different tech stack)
- "Backend Engineer" CAN match "Server-side Developer" (similar role intent)
"""
import re
import numpy as np
from typing import List, Tuple, Optional, Dict
from functools import lru_cache
import hashlib
import json

# Role taxonomy - common tech roles with their semantic meanings
ROLE_TAXONOMY = {
    # Development Roles
    "software engineer": {"category": "development", "focus": "general"},
    "software developer": {"category": "development", "focus": "general"},
    "backend developer": {"category": "development", "focus": "backend"},
    "backend engineer": {"category": "development", "focus": "backend"},
    "frontend developer": {"category": "development", "focus": "frontend"},
    "frontend engineer": {"category": "development", "focus": "frontend"},
    "full stack developer": {"category": "development", "focus": "fullstack"},
    "fullstack engineer": {"category": "development", "focus": "fullstack"},
    "java developer": {"category": "development", "focus": "java"},
    "python developer": {"category": "development", "focus": "python"},
    "javascript developer": {"category": "development", "focus": "javascript"},
    "react developer": {"category": "development", "focus": "react"},
    "node.js developer": {"category": "development", "focus": "nodejs"},
    "mobile developer": {"category": "development", "focus": "mobile"},
    "ios developer": {"category": "development", "focus": "ios"},
    "android developer": {"category": "development", "focus": "android"},
    "devops engineer": {"category": "development", "focus": "devops"},
    
    # Testing/QA Roles
    "qa engineer": {"category": "testing", "focus": "general"},
    "test engineer": {"category": "testing", "focus": "general"},
    "software tester": {"category": "testing", "focus": "general"},
    "automation tester": {"category": "testing", "focus": "automation"},
    "manual tester": {"category": "testing", "focus": "manual"},
    "java tester": {"category": "testing", "focus": "java"},
    "selenium tester": {"category": "testing", "focus": "selenium"},
    "performance tester": {"category": "testing", "focus": "performance"},
    
    # Data Roles
    "data engineer": {"category": "data", "focus": "engineering"},
    "data scientist": {"category": "data", "focus": "science"},
    "data analyst": {"category": "data", "focus": "analysis"},
    "ml engineer": {"category": "data", "focus": "ml"},
    "machine learning engineer": {"category": "data", "focus": "ml"},
    
    # Other Technical Roles
    "system administrator": {"category": "infrastructure", "focus": "sysadmin"},
    "network engineer": {"category": "infrastructure", "focus": "network"},
    "security engineer": {"category": "security", "focus": "general"},
    "cloud engineer": {"category": "infrastructure", "focus": "cloud"},
    "database administrator": {"category": "data", "focus": "dba"},
}

# Role intent keywords that help identify the actual role
ROLE_INDICATORS = {
    "development": ["develop", "build", "implement", "code", "program", "design", "architecture"],
    "testing": ["test", "qa", "quality assurance", "validate", "verify", "bug", "defect"],
    "data": ["data", "analytics", "ml", "machine learning", "model", "dataset"],
    "infrastructure": ["deploy", "infrastructure", "server", "cloud", "aws", "azure"],
}

# Cache for embeddings
_role_embedding_cache = {}


def _get_encoder():
    """Get the sentence transformer encoder."""
    from backend.services.matching import _get_model
    _, encoder = _get_model()
    return encoder


def _get_text_hash(text: str) -> str:
    """Generate hash for caching."""
    return hashlib.md5(text.encode()).hexdigest()


def extract_role_label(text: str) -> str:
    """
    Extract the primary role label from text (JD or resume).
    Uses pattern matching + semantic understanding.
    
    Returns a standardized role label like "Java Developer", "QA Engineer", etc.
    """
    text_lower = text.lower()
    
    # First try exact matches from taxonomy
    for role in sorted(ROLE_TAXONOMY.keys(), key=len, reverse=True):
        if role in text_lower:
            return role.title()
    
    # Pattern-based extraction for common formats
    patterns = [
        # "X Developer", "X Engineer", "X Tester"
        r'([a-z]+(?:\s+[a-z]+)?)\s+(developer|engineer|tester|analyst|scientist|administrator)',
        # "X Y Developer" (e.g., "Java Backend Developer")
        r'([a-z]+)\s+([a-z]+)\s+(developer|engineer)',
    ]
    
    for pattern in patterns:
        matches = re.findall(pattern, text_lower)
        if matches:
            # Return the most specific match
            match = matches[0]
            if isinstance(match, tuple):
                return ' '.join(match).title()
            return match.title()
    
    # Default: extract from first sentence if it mentions a role
    first_sentence = text.split('.')[0].lower()
    if any(word in first_sentence for word in ['seeking', 'looking', 'position', 'role', 'hire']):
        for role_type in ['developer', 'engineer', 'tester', 'analyst', 'manager', 'lead']:
            if role_type in first_sentence:
                # Extract words before the role type
                idx = first_sentence.find(role_type)
                prefix = first_sentence[max(0, idx-30):idx].strip()
                words = prefix.split()[-3:]  # Last 3 words before role
                if words:
                    return ' '.join(words + [role_type]).title()
    
    return "Unknown"


def extract_role_context(text: str) -> str:
    """
    Extract rich context about the role from text.
    This includes responsibilities, key activities, and domain focus.
    """
    sentences = text.split('.')
    context_parts = []
    
    for sentence in sentences:
        sentence_lower = sentence.lower()
        # Look for sentences describing responsibilities or activities
        if any(indicator in sentence_lower for indicator in 
               ['responsible', 'develop', 'build', 'test', 'design', 'implement', 
                'manage', 'lead', 'create', 'maintain', 'support', 'work']):
            context_parts.append(sentence.strip())
        
        # Stop after collecting enough context
        if len(' '.join(context_parts)) > 500:
            break
    
    return ' '.join(context_parts[:5])  # Top 5 relevant sentences


def compute_role_embedding(role_label: str, context: str) -> np.ndarray:
    """
    Compute a semantic embedding that captures the role intent.
    Combines role label with contextual information.
    """
    cache_key = _get_text_hash(role_label + context[:200])
    
    if cache_key in _role_embedding_cache:
        return _role_embedding_cache[cache_key]
    
    encoder = _get_encoder()
    
    # Create a rich role description
    role_description = f"Role: {role_label}. Context: {context}"
    
    # Generate embedding
    embedding = encoder([role_description[:1000]])[0]
    embedding = np.asarray(embedding, dtype=np.float32)
    
    # Normalize
    norm = np.linalg.norm(embedding)
    if norm > 0:
        embedding = embedding / norm
    
    _role_embedding_cache[cache_key] = embedding
    return embedding


def compute_skill_embedding(skills: List[str]) -> np.ndarray:
    """
    Compute a semantic embedding for a set of skills.
    This captures the skill profile as a vector.
    """
    if not skills:
        return np.zeros(384, dtype=np.float32)
    
    cache_key = _get_text_hash(','.join(sorted(skills)))
    
    if cache_key in _role_embedding_cache:
        return _role_embedding_cache[cache_key]
    
    encoder = _get_encoder()
    
    # Create skill profile description
    skill_text = f"Skills: {', '.join(skills)}"
    
    embedding = encoder([skill_text[:1000]])[0]
    embedding = np.asarray(embedding, dtype=np.float32)
    
    # Normalize
    norm = np.linalg.norm(embedding)
    if norm > 0:
        embedding = embedding / norm
    
    _role_embedding_cache[cache_key] = embedding
    return embedding


def compute_role_similarity(
    jd_role_embedding: np.ndarray,
    resume_role_embedding: np.ndarray
) -> float:
    """
    Compute semantic similarity between JD role and resume role.
    Returns score between 0 and 1.
    """
    similarity = np.dot(jd_role_embedding, resume_role_embedding)
    # Map from [-1, 1] to [0, 1]
    return (float(similarity) + 1) / 2


def compute_semantic_match_score(
    jd_text: str,
    resume_text: str,
    jd_skills: List[str],
    resume_skills: List[str],
    jd_role_embedding: Optional[np.ndarray] = None,
    resume_role_embedding: Optional[np.ndarray] = None
) -> Dict:
    """
    Compute a comprehensive semantic match score.
    
    Scoring breakdown:
    - 50% Role intent similarity (semantic understanding of the actual job function)
    - 30% Skill semantic similarity (meaning of skills, not just keyword overlap)
    - 20% Experience relevance (derived from text context)
    
    Returns dict with scores and match details.
    """
    from backend.config import SKILL_SIMILARITY_THRESHOLD
    
    encoder = _get_encoder()
    
    # Get or compute role embeddings
    if jd_role_embedding is None:
        jd_role_label = extract_role_label(jd_text)
        jd_role_context = extract_role_context(jd_text)
        jd_role_embedding = compute_role_embedding(jd_role_label, jd_role_context)
    
    if resume_role_embedding is None:
        resume_role_label = extract_role_label(resume_text)
        resume_role_context = extract_role_context(resume_text)
        resume_role_embedding = compute_role_embedding(resume_role_label, resume_role_context)
    
    # 1. Role Intent Similarity (50%)
    role_similarity = compute_role_similarity(jd_role_embedding, resume_role_embedding)
    
    # 2. Skill Semantic Similarity (30%)
    if jd_skills and resume_skills:
        jd_skill_emb = compute_skill_embedding(jd_skills)
        resume_skill_emb = compute_skill_embedding(resume_skills)
        skill_similarity = compute_role_similarity(jd_skill_emb, resume_skill_emb)
        
        # Also compute individual skill matches for detail
        jd_skill_embs = encoder(jd_skills)
        resume_skill_embs = encoder(resume_skills)
        
        matching_skills = []
        missing_skills = []
        
        for i, jd_skill in enumerate(jd_skills):
            jd_emb = jd_skill_embs[i]
            best_match = None
            best_sim = 0
            
            for j, res_skill in enumerate(resume_skills):
                sim = np.dot(jd_emb, resume_skill_embs[j]) / (
                    np.linalg.norm(jd_emb) * np.linalg.norm(resume_skill_embs[j]) + 1e-9
                )
                if sim > best_sim:
                    best_sim = sim
                    best_match = res_skill
            
            if best_sim >= SKILL_SIMILARITY_THRESHOLD:
                matching_skills.append(jd_skill)
            else:
                missing_skills.append(jd_skill)
    else:
        skill_similarity = 0.5  # Neutral if no skills
        matching_skills = []
        missing_skills = list(jd_skills) if jd_skills else []
    
    # 3. Experience Relevance (20%)
    # Use document-level semantic similarity as proxy for experience relevance
    jd_doc_emb = encoder([jd_text[:2000]])[0]
    resume_doc_emb = encoder([resume_text[:2000]])[0]
    
    jd_doc_emb = jd_doc_emb / (np.linalg.norm(jd_doc_emb) + 1e-9)
    resume_doc_emb = resume_doc_emb / (np.linalg.norm(resume_doc_emb) + 1e-9)
    
    experience_relevance = (float(np.dot(jd_doc_emb, resume_doc_emb)) + 1) / 2
    
    # Weighted final score
    final_score = (
        role_similarity * 0.50 +
        skill_similarity * 0.30 +
        experience_relevance * 0.20
    )
    
    return {
        "match_percentage": round(final_score * 100, 2),
        "role_similarity": round(role_similarity * 100, 2),
        "skill_similarity": round(skill_similarity * 100, 2),
        "experience_relevance": round(experience_relevance * 100, 2),
        "matching_skills": matching_skills,
        "missing_skills": missing_skills,
        "role_match": role_similarity >= 0.6,  # Threshold for role compatibility
    }


def is_role_compatible(jd_role: str, resume_role: str, threshold: float = 0.6) -> bool:
    """
    Check if two roles are semantically compatible.
    Used for filtering out mismatched roles.
    """
    jd_emb = compute_role_embedding(jd_role, "")
    resume_emb = compute_role_embedding(resume_role, "")
    similarity = compute_role_similarity(jd_emb, resume_emb)
    return similarity >= threshold


def serialize_embedding(embedding: np.ndarray) -> bytes:
    """Serialize numpy array to bytes for database storage."""
    return embedding.tobytes()


def deserialize_embedding(data: bytes, dtype=np.float32) -> np.ndarray:
    """Deserialize bytes back to numpy array."""
    return np.frombuffer(data, dtype=dtype)
