"""
NLP pipeline: skills (noun phrases + embedding normalization), experience (regex + number parse),
locations (spaCy NER). All inferred from text; no hardcoded lists.
"""
import re
import sys
import logging
import hashlib
from functools import lru_cache

logger = logging.getLogger(__name__)

from backend.utils.model_loader import get_nlp, get_encoder, get_stopwords, preload_models

# PERFORMANCE OPTIMIZATION – NON-BREAKING: In-memory cache for extraction results
_skill_cache = {}
_location_cache = {}
_experience_cache = {}
_text_hash_cache = {}

def _get_nlp(): return get_nlp()
def _get_stopwords(): return get_stopwords()
def _get_encoder(): return get_encoder()


def _get_text_hash(text, length=10000):
    """
    Generate robust hash for text caching.
    Uses more of the text for unique identification.
    Normalized whitespace for better identity verification.
    """
    if not text:
        return ""
    
    # Normalize text slightly for better cache hits (whitespace normalization)
    text_sample = " ".join(text[:length].split())
    
    # Check simple cache
    if text_sample in _text_hash_cache:
        return _text_hash_cache[text_sample]
    
    h = hashlib.md5(text_sample.encode()).hexdigest()
    
    # LRU-style cache management (limit cache size to 2000 entries)
    if len(_text_hash_cache) > 2000:
        _text_hash_cache.clear()
        
    _text_hash_cache[text_sample] = h
    return h


def _normalize_skill(s):
    s = (s or "").strip().lower()
    return s if len(s) > 1 else ""


def _merge_similar_skills(skills, threshold=0.85):
    """Merge near-duplicate skills using embedding similarity; return deduplicated list."""
    if not skills:
        return []
    encoder = _get_encoder()
    import numpy as np
    # Encode without progress bar to avoid console spam
    vecs = encoder(skills, show_progress_bar=False)
    vecs = np.asarray(vecs)
    keep = []
    used = [False] * len(skills)
    for i, s in enumerate(skills):
        if used[i]:
            continue
        keep.append(s)
        for j in range(i + 1, len(skills)):
            if used[j]:
                continue
            sim = np.dot(vecs[i], vecs[j]) / (np.linalg.norm(vecs[i]) * np.linalg.norm(vecs[j]) + 1e-9)
            if sim >= threshold:
                used[j] = True
    return keep


# PERFORMANCE OPTIMIZATION – NON-BREAKING: Cached skill extraction
def extract_skills(text):
    """
    Extract skills from text: noun chunks + relevant nouns, filter stopwords/short,
    then merge near-duplicates via embeddings. No predefined skill list.
    Uses caching for repeated texts.
    """
    if not (text and str(text).strip()):
        return []
    
    # Check cache first
    text_hash = _get_text_hash(text)
    if text_hash in _skill_cache:
        return _skill_cache[text_hash]
    
    nlp = _get_nlp()
    stop = _get_stopwords()
    doc = nlp(text[:50000])  # cap length
    candidates = set()
    for chunk in doc.noun_chunks:
        raw = chunk.text.strip().lower()
        if len(raw) < 2 or raw in stop:
            continue
        if len(raw) > 60:
            continue
        candidates.add(raw)
    for token in doc:
        if token.pos_ in ("NOUN", "PROPN") and not token.is_stop and len(token.text) > 1:
            raw = token.text.strip().lower()
            if len(raw) <= 60:
                candidates.add(raw)
    skills = [s for s in candidates if _normalize_skill(s)]
    if not skills:
        _skill_cache[text_hash] = []
        return []
    
    result = _merge_similar_skills(list(skills))
    _skill_cache[text_hash] = result
    return result


# PERFORMANCE OPTIMIZATION – NON-BREAKING: Cached experience extraction
def extract_experience_years(text):
    """
    Extract experience in years from resume text via regex patterns.
    Returns max of found values (e.g. 5 years in X, 3 in Y -> 5). No hardcoded ranges.
    Uses caching for repeated texts.
    """
    if not (text and str(text).strip()):
        return None
    
    # Check cache first
    text_hash = _get_text_hash(text)
    cache_key = f"exp_{text_hash}"
    if cache_key in _experience_cache:
        return _experience_cache[cache_key]
    
    numbers = []
    # Patterns: "N years", "N+ years", "N - Y years", "N-Y years of experience", "experience of N years"
    # Supports decimal values like "4.5 years" in addition to whole numbers
    patterns = [
        r"(?:^|\s)(\d+(?:\.\d+)?)\s*\+\s*years?(?:\s+of\s+experience)?",
        r"(?:^|\s)(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*years?(?:\s+of\s+experience)?",
        r"(?:^|\s)(\d+(?:\.\d+)?)\s*years?(?:\s+of\s+experience)?(?:\s+in\s+)?",
        r"experience\s+of\s+(\d+(?:\.\d+)?)\s*years?",
        r"(\d+(?:\.\d+)?)\s*years?\s+experience",
    ]
    for pat in patterns:
        for m in re.finditer(pat, text, re.IGNORECASE):
            g = m.groups()
            if len(g) == 2:
                try:
                    numbers.append(max(float(g[0]), float(g[1])))
                except ValueError:
                    pass
            elif g:
                try:
                    numbers.append(float(g[0]))
                except (ValueError, IndexError):
                    pass
    
    result = max(numbers) if numbers else None
    _experience_cache[cache_key] = result
    return result


# Non-location terms to exclude (case-insensitive). Keep only real geographic places.
_NON_LOCATION_BLOCKLIST = frozenset({
    # Work arrangement / generic
    # Note: we now allow "remote", "work from home", "hybrid", "onsite" to be
    # treated as location categories, so they are NOT included here.
    "on-site", "onsite", "on site", "in-office", "in office",
    "distributed", "wfh", "office", "headquarters", "hq",
    "global", "worldwide", "local", "n/a", "na", "tbd", "anywhere",
    # Common mis-tagged entities (company, product, team, role)
    "client ai", "google", "microsoft", "azure", "salesforce", "slack", "acme",
    "engineering", "client success", "ai", "client", "success",
})
# Company-like suffixes: exclude e.g. "Acme Corp", "Foo Inc."
_COMPANY_SUFFIX_PATTERN = re.compile(
    r"\s+(?:inc\.?|ltd\.?|llc\.?|l\.l\.c\.?|corp\.?|corporation|co\.?|company)\s*$",
    re.IGNORECASE,
)


def _is_real_location(text):
    """
    Return False if text is a known non-location (company, product, team, work arrangement).
    Only real geographic places (city, state, country, region) should return True.
    """
    if not text or len(text) < 2:
        return False
    key = text.strip().lower()
    if key in _NON_LOCATION_BLOCKLIST:
        return False
    if _COMPANY_SUFFIX_PATTERN.search(text):
        return False
    # Single token "AI" or similar tech/role terms often mis-tagged as GPE
    if key in ("ai", "hr", "it", "r&d", "rd"):
        return False
    return True


# PERFORMANCE OPTIMIZATION – NON-BREAKING: Cached location extraction
def extract_locations(text):
    """
    Extract locations via spaCy NER (GPE, LOC). Deduplicate, clean, and filter out
    non-locations (company names, products, work arrangements, etc.).
    Only real geographic places are returned.
    Uses caching for repeated texts.
    """
    if not (text and str(text).strip()):
        return []
    
    # Check cache first
    text_hash = _get_text_hash(text)
    if text_hash in _location_cache:
        return _location_cache[text_hash]
    
    nlp = _get_nlp()
    doc = nlp(text[:50000])
    seen = set()
    out = []
    for ent in doc.ents:
        if ent.label_ in ("GPE", "LOC"):
            loc = ent.text.strip()
            key = loc.lower()
            if not key or key in seen or len(loc) <= 1:
                continue
            if not _is_real_location(loc):
                continue
            seen.add(key)
            out.append(loc)
    
    _location_cache[text_hash] = out
    return out


def extract_jd_entities(job_description):
    """Return (jd_skills, jd_locations) for job description."""
    jd_skills = extract_skills(job_description)
    jd_locations = extract_locations(job_description)
    return jd_skills, jd_locations


def _normalize_phone_number(digits_only):
    """
    Normalize and validate a phone number string.
    Returns normalized number or None if invalid.
    """
    if not digits_only:
        return None
    
    # Handle + prefix
    has_plus = digits_only.startswith('+')
    if has_plus:
        digits_only = digits_only[1:]
    
    # Remove any remaining non-digits
    digits_only = re.sub(r'\D', '', digits_only)
    
    # Validate length (10-15 digits)
    if len(digits_only) < 10 or len(digits_only) > 15:
        return None
    
    # Indian number validation: should start with 6-9 for 10-digit numbers
    if len(digits_only) == 10 and not digits_only[0] in '6789':
        return None
    
    # Add + prefix back if it was there
    if has_plus:
        return '+' + digits_only
    return digits_only


def _extract_phone_numbers_fallback(text):
    """
    Fallback extraction for heavily spaced phone numbers.
    Handles patterns like: + 91 8 55 59 97 006, Contact: + 91 77208 16006
    """
    if not text:
        return []
    
    found = set()
    
    # Pattern 1: + followed by country code with spaces, then spaced digits
    # Matches: + 91 8 55 59 97 006, +91 77208 16006, + 91 77208 16006
    plus_patterns = [
        # + 91 followed by spaced digits (various spacing)
        r'\+\s*91\s+(?:\d\s*){10}',
        r'\+\s*91\s+\d{5}\s+\d{5}',
        r'\+\s*91\s+\d{3,5}\s+\d{3,5}',
    ]
    
    for pattern in plus_patterns:
        matches = re.findall(pattern, text)
        for match in matches:
            normalized = _normalize_phone_number(match)
            if normalized:
                found.add(normalized)
    
    # Pattern 2: Look for "Contact" or "Phone" or "Mobile" followed by spaced digits
    contact_patterns = [
        # Contact/Phone/Mobile: + 91 ... or 91 ... or digits
        r'(?:Contact|Phone|Mobile|Tel|Cell)[\s:]*\+?\s*91\s+(?:\d[\s\-]*){10,12}',
        r'(?:Contact|Phone|Mobile|Tel|Cell)[\s:]*\+?\s*91\s+\d[\s\-]*\d[\s\-]*\d[\s\-]*\d[\s\-]*\d[\s\-]*\d[\s\-]*\d[\s\-]*\d[\s\-]*\d[\s\-]*\d',
    ]
    
    for pattern in contact_patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        for match in matches:
            # Extract just the number part
            number_match = re.search(r'\+?\s*91\s+(?:\d[\s\-]*){10,12}', match)
            if number_match:
                normalized = _normalize_phone_number(number_match.group())
                if normalized:
                    found.add(normalized)
    
    # Pattern 3: Aggressive extraction - find sequences of digits separated by single spaces
    # that total 10+ digits (for OCR/spaced out numbers)
    spaced_digit_pattern = r'(?:\d\s+){9,14}\d'
    matches = re.findall(spaced_digit_pattern, text)
    for match in matches:
        # Check if it looks like a phone number (starts with valid digit)
        digits = re.sub(r'\D', '', match)
        if len(digits) >= 10 and len(digits) <= 12 and digits[0] in '6789':
            normalized = _normalize_phone_number(digits)
            if normalized:
                found.add(normalized)
    
    return list(found)


def extract_phone_numbers(text):
    """
    Extract phone numbers from text using regex patterns.
    Supports various formats: +91-98765-43210, +91 98765 43210, 9876543210,
    09876543210, (987) 654-3210, + 91 8 55 59 97 006, etc.
    Returns list of found phone numbers (normalized to digits only for storage).
    """
    if not (text and str(text).strip()):
        return []
    
    # Primary patterns - standard formats
    patterns = [
        # International format: +91-98765-43210, +91 98765 43210
        r'\+\d{1,3}[-.\s]?\d{5}[-.\s]?\d{5}',
        # Indian mobile: 98765-43210, 98765 43210, 9876543210
        r'\b[6-9]\d{4}[-.\s]?\d{5}\b',
        # With country code in parentheses: +91 (987) 654-3210
        r'\+\d{1,3}\s?\(\d{3,5}\)\s?\d{3}[-.\s]?\d{4}',
        # US format: (987) 654-3210
        r'\(\d{3}\)\s?\d{3}[-.\s]?\d{4}',
        # 10-11 digit numbers starting with 0
        r'\b0\d{10}\b',
    ]
    
    found = set()
    for pattern in patterns:
        matches = re.findall(pattern, text)
        for match in matches:
            # Normalize: remove all non-digit characters except leading +
            normalized = match.strip()
            if normalized.startswith('+'):
                digits_only = '+' + re.sub(r'\D', '', normalized[1:])
            else:
                digits_only = re.sub(r'\D', '', normalized)
                # If starts with 0, remove it for consistency
                if digits_only.startswith('0') and len(digits_only) > 10:
                    digits_only = digits_only[1:]
            validated = _normalize_phone_number(digits_only)
            if validated:
                found.add(validated)
    
    # Fallback extraction for heavily spaced/OCR numbers
    fallback_results = _extract_phone_numbers_fallback(text)
    for num in fallback_results:
        found.add(num)
    
    # Deduplication: if we have both +91 version and plain version, keep only +91 version
    # Also handle cases where the same number appears in different formats
    deduplicated = set()
    seen_last_10 = set()  # Track last 10 digits for dedup
    
    for num in found:
        # Get last 10 digits for comparison
        digits = re.sub(r'\D', '', num)
        last_10 = digits[-10:] if len(digits) >= 10 else digits
        
        if last_10 in seen_last_10:
            continue
        
        seen_last_10.add(last_10)
        # Prefer numbers with +91 prefix for Indian numbers
        if len(digits) == 10 and digits[0] in '6789':
            deduplicated.add('+91' + digits)
        else:
            deduplicated.add(num)
    
    result = sorted(list(deduplicated))
    
    # Log if no phones found (for debugging)
    if not result and (text and len(text) > 100):
        # Check if text contains phone-like patterns that we missed
        if re.search(r'\+\s*91|\b91\s*\d|\b[6-9]\d{9}\b', text):
            logger.warning(f"Phone extraction: Potential phone number in text but extraction failed. Text preview: {text[:200]}...")
    
    return result


def format_phone_number(phone):
    """
    Format phone number for display.
    +919876543210 -> +91 98765 43210
    9876543210 -> 98765 43210
    """
    if not phone:
        return ""
    
    phone = str(phone).strip()
    
    # Handle +91 format
    if phone.startswith('+91') and len(phone) >= 12:
        return f"+91 {phone[3:8]} {phone[8:]}"
    elif phone.startswith('+') and len(phone) >= 10:
        # Other international format
        country_code_end = 1
        while country_code_end < len(phone) and phone[country_code_end].isdigit():
            country_code_end += 1
        if country_code_end > 1:
            return f"{phone[:country_code_end]} {phone[country_code_end:country_code_end+5]} {phone[country_code_end+5:]}"
    
    # Handle 10 digit Indian numbers
    if len(phone) == 10:
        return f"{phone[:5]} {phone[5:]}"
    
    return phone


def extract_emails(text):
    """
    Extract email addresses from text using regex.
    Returns list of found email addresses.
    """
    if not (text and str(text).strip()):
        return []
    
    # Email regex pattern
    pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
    matches = re.findall(pattern, text)
    
    # Deduplicate while preserving order
    seen = set()
    result = []
    for email in matches:
        email_lower = email.lower()
        if email_lower not in seen:
            seen.add(email_lower)
            result.append(email_lower)
    
    return result


def extract_resume_entities(resume_text):
    """Return (skills, experience_years, locations, phone_numbers, emails) for resume text."""
    skills = extract_skills(resume_text)
    exp = extract_experience_years(resume_text)
    locations = extract_locations(resume_text)
    phone_numbers = extract_phone_numbers(resume_text)
    emails = extract_emails(resume_text)
    return skills, exp, locations, phone_numbers, emails
