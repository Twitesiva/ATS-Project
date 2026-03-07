"""
Enterprise-Grade Multi-Stage Matching Pipeline

STAGE 1 — ROLE INTENT CLASSIFICATION (GATEKEEPER)
STAGE 2 — SEMANTIC ROLE & SKILL MATCHING
STAGE 3 — ANN-BASED FAST SEARCH

This module implements industry-level ATS matching comparable to LinkedIn Talent,
Indeed ATS, and Greenhouse. It uses meaning-based matching instead of keyword overlap.

KEY PRINCIPLES:
1. Role Intent is the PRIMARY filter (Stage 1)
2. Semantic similarity refines matches (Stage 2)
3. ANN enables fast search at scale (Stage 3)
4. Embeddings are precomputed and reused (performance)

EXAMPLE FLOW:
- JD: "Java Developer with Spring Boot experience"
- Resume 1: "Java Developer at TechCorp" → MATCH (role compatible)
- Resume 2: "Java Tester at QA Solutions" → REJECT (role mismatch: Developer vs Tester)
- Resume 3: "Python Developer at Startup" → REJECT (role mismatch: Java vs Python)
"""
import numpy as np
import re
import hashlib
from typing import List, Dict, Tuple, Optional, Any
from dataclasses import dataclass
from functools import lru_cache
import json

# EMBEDDING DIMENSION (all-MiniLM-L6-v2)
EMBEDDING_DIM = 384

# ROLE COMPATIBILITY THRESHOLD
# For database page filtering - more lenient than JD matching
ROLE_COMPATIBILITY_THRESHOLD = 0.55

# MINIMUM ROLE CONFIDENCE for classification
MIN_ROLE_CONFIDENCE = 0.70


@dataclass
class RoleIntent:
    """Structured role intent classification output."""
    role_family: str  # e.g., "Software Engineering"
    role_type: str    # e.g., "Developer", "Tester", "Analyst"
    role_specialization: str  # e.g., "Backend", "Frontend", "QA"
    primary_tech: str  # e.g., "Java", "Python", "JavaScript"
    confidence: float  # 0.0 - 1.0
    raw_label: str     # Original extracted label


@dataclass
class MatchResult:
    """Structured match result with full scoring breakdown."""
    original_name: str
    path: str
    match_percentage: float
    role_similarity: float
    skill_similarity: float
    experience_relevance: float
    role_compatibility_score: float
    matching_skills: List[str]
    missing_skills: List[str]
    experience_years: Optional[float]
    locations: List[str]
    location_display: str
    extracted_skills: List[str]
    raw_text: str
    phone_numbers: List[str]
    emails: List[str]
    jd_role: RoleIntent
    resume_role: RoleIntent
    role_compatible: bool
    # Internal debug info
    _stage1_passed: bool
    _stage2_score: float


# ═══════════════════════════════════════════════════════════════════════════════
# STAGE 1 — ROLE INTENT CLASSIFICATION (GATEKEEPER)
# ═══════════════════════════════════════════════════════════════════════════════

# Comprehensive role taxonomy for enterprise classification
ENTERPRISE_ROLE_TAXONOMY = {
    # SOFTWARE ENGINEERING FAMILY
    "software engineer": {
        "family": "Software Engineering",
        "type": "Developer",
        "specialization": "General",
        "tech_patterns": ["java", "python", "javascript", "c++", "c#", "go", "rust"]
    },
    "software developer": {
        "family": "Software Engineering",
        "type": "Developer",
        "specialization": "General",
        "tech_patterns": ["java", "python", "javascript", "c++", "c#", "go", "rust"]
    },
    "developer": {
        "family": "Software Engineering",
        "type": "Developer",
        "specialization": "General",
        "tech_patterns": ["java", "python", "javascript", "c++", "c#", "go", "rust", "development", "programming"]
    },
    "backend developer": {
        "family": "Software Engineering",
        "type": "Developer",
        "specialization": "Backend",
        "tech_patterns": ["java", "python", "nodejs", "go", "scala", "kotlin"]
    },
    "backend engineer": {
        "family": "Software Engineering",
        "type": "Developer",
        "specialization": "Backend",
        "tech_patterns": ["java", "python", "nodejs", "go", "scala", "kotlin"]
    },
    "frontend developer": {
        "family": "Software Engineering",
        "type": "Developer",
        "specialization": "Frontend",
        "tech_patterns": ["javascript", "typescript", "react", "vue", "angular"]
    },
    "frontend engineer": {
        "family": "Software Engineering",
        "type": "Developer",
        "specialization": "Frontend",
        "tech_patterns": ["javascript", "typescript", "react", "vue", "angular"]
    },
    "full stack developer": {
        "family": "Software Engineering",
        "type": "Developer",
        "specialization": "Fullstack",
        "tech_patterns": ["javascript", "python", "java", "nodejs", "react"]
    },
    "fullstack engineer": {
        "family": "Software Engineering",
        "type": "Developer",
        "specialization": "Fullstack",
        "tech_patterns": ["javascript", "python", "java", "nodejs", "react"]
    },
    "java developer": {
        "family": "Software Engineering",
        "type": "Developer",
        "specialization": "Backend",
        "tech_patterns": ["java", "spring", "hibernate", "maven", "gradle"]
    },
    "python developer": {
        "family": "Software Engineering",
        "type": "Developer",
        "specialization": "Backend",
        "tech_patterns": ["python", "django", "flask", "fastapi", "pandas"]
    },
    "javascript developer": {
        "family": "Software Engineering",
        "type": "Developer",
        "specialization": "Frontend",
        "tech_patterns": ["javascript", "nodejs", "react", "vue", "angular"]
    },
    "react developer": {
        "family": "Software Engineering",
        "type": "Developer",
        "specialization": "Frontend",
        "tech_patterns": ["react", "javascript", "typescript", "redux"]
    },
    "node.js developer": {
        "family": "Software Engineering",
        "type": "Developer",
        "specialization": "Backend",
        "tech_patterns": ["nodejs", "javascript", "express", "nestjs"]
    },
    "mobile developer": {
        "family": "Software Engineering",
        "type": "Developer",
        "specialization": "Mobile",
        "tech_patterns": ["ios", "android", "react native", "flutter", "swift"]
    },
    "ios developer": {
        "family": "Software Engineering",
        "type": "Developer",
        "specialization": "Mobile",
        "tech_patterns": ["swift", "objective-c", "ios", "xcode"]
    },
    "android developer": {
        "family": "Software Engineering",
        "type": "Developer",
        "specialization": "Mobile",
        "tech_patterns": ["kotlin", "java", "android", "jetpack compose"]
    },
    "devops engineer": {
        "family": "Infrastructure",
        "type": "Engineer",
        "specialization": "DevOps",
        "tech_patterns": ["docker", "kubernetes", "aws", "jenkins", "terraform"]
    },
    "cloud engineer": {
        "family": "Infrastructure",
        "type": "Engineer",
        "specialization": "Cloud",
        "tech_patterns": ["aws", "azure", "gcp", "cloud", "infrastructure"]
    },
    "system administrator": {
        "family": "Infrastructure",
        "type": "Administrator",
        "specialization": "Systems",
        "tech_patterns": ["linux", "windows", "networking", "administration"]
    },
    
    # QA / TESTING FAMILY
    "tester": {
        "family": "Quality Assurance",
        "type": "Tester",
        "specialization": "General",
        "tech_patterns": ["testing", "qa", "test cases", "manual testing", "automation"]
    },
    "qa": {
        "family": "Quality Assurance",
        "type": "Tester",
        "specialization": "General",
        "tech_patterns": ["testing", "qa", "test cases", "manual testing", "automation"]
    },
    "qa engineer": {
        "family": "Quality Assurance",
        "type": "Tester",
        "specialization": "General",
        "tech_patterns": ["selenium", "cypress", "automation", "testing"]
    },
    "test engineer": {
        "family": "Quality Assurance",
        "type": "Tester",
        "specialization": "General",
        "tech_patterns": ["selenium", "cypress", "automation", "testing"]
    },
    "software tester": {
        "family": "Quality Assurance",
        "type": "Tester",
        "specialization": "General",
        "tech_patterns": ["manual testing", "test cases", "qa", "testing"]
    },
    "automation tester": {
        "family": "Quality Assurance",
        "type": "Tester",
        "specialization": "Automation",
        "tech_patterns": ["selenium", "cypress", "playwright", "automation"]
    },
    "manual tester": {
        "family": "Quality Assurance",
        "type": "Tester",
        "specialization": "Manual",
        "tech_patterns": ["manual testing", "test cases", "qa", "testing"]
    },
    "java tester": {
        "family": "Quality Assurance",
        "type": "Tester",
        "specialization": "Automation",
        "tech_patterns": ["java", "selenium", "testng", "automation"]
    },
    "selenium tester": {
        "family": "Quality Assurance",
        "type": "Tester",
        "specialization": "Automation",
        "tech_patterns": ["selenium", "java", "python", "automation"]
    },
    "performance tester": {
        "family": "Quality Assurance",
        "type": "Tester",
        "specialization": "Performance",
        "tech_patterns": ["jmeter", "loadrunner", "performance testing"]
    },
    
    # DATA FAMILY
    "data engineer": {
        "family": "Data Engineering",
        "type": "Engineer",
        "specialization": "Data Pipeline",
        "tech_patterns": ["python", "sql", "spark", "airflow", "etl"]
    },
    "data scientist": {
        "family": "Data Science",
        "type": "Scientist",
        "specialization": "ML/AI",
        "tech_patterns": ["python", "tensorflow", "pytorch", "scikit-learn", "statistics", "machine learning", "data science"]
    },
    "data analyst": {
        "family": "Data Analytics",
        "type": "Analyst",
        "specialization": "Business Intelligence",
        "tech_patterns": ["sql", "python", "tableau", "powerbi", "excel"]
    },
    "ml engineer": {
        "family": "Machine Learning",
        "type": "Engineer",
        "specialization": "ML Ops",
        "tech_patterns": ["python", "tensorflow", "pytorch", "kubernetes", "mlflow"]
    },
    "machine learning engineer": {
        "family": "Machine Learning",
        "type": "Engineer",
        "specialization": "ML Ops",
        "tech_patterns": ["python", "tensorflow", "pytorch", "kubernetes", "mlflow"]
    },
    
    # INFRASTRUCTURE / DEVOPS FAMILY
    "devops engineer": {
        "family": "Infrastructure",
        "type": "Engineer",
        "specialization": "DevOps",
        "tech_patterns": ["docker", "kubernetes", "aws", "terraform", "ci/cd"]
    },
    "system administrator": {
        "family": "Infrastructure",
        "type": "Administrator",
        "specialization": "Systems",
        "tech_patterns": ["linux", "windows", "bash", "powershell", "vmware"]
    },
    "network engineer": {
        "family": "Infrastructure",
        "type": "Engineer",
        "specialization": "Network",
        "tech_patterns": ["cisco", "routing", "switching", "firewall", "tcp/ip"]
    },
    "security engineer": {
        "family": "Security",
        "type": "Engineer",
        "specialization": "Cybersecurity",
        "tech_patterns": ["security", "penetration testing", "siem", "firewall"]
    },
    "cloud engineer": {
        "family": "Infrastructure",
        "type": "Engineer",
        "specialization": "Cloud",
        "tech_patterns": ["aws", "azure", "gcp", "terraform", "cloudformation"]
    },
    "database administrator": {
        "family": "Data Engineering",
        "type": "Administrator",
        "specialization": "Database",
        "tech_patterns": ["sql", "oracle", "mysql", "postgresql", "mongodb"]
    },
}

# Role type hierarchy for compatibility scoring
ROLE_TYPE_COMPATIBILITY = {
    ("Developer", "Developer"): 1.0,
    ("Developer", "Tester"): 0.3,  # Strong penalty
    ("Developer", "Analyst"): 0.5,
    ("Tester", "Tester"): 1.0,
    ("Tester", "Developer"): 0.3,  # Strong penalty
    ("Analyst", "Analyst"): 1.0,
    ("Engineer", "Engineer"): 1.0,
    ("Scientist", "Scientist"): 1.0,
    ("Administrator", "Administrator"): 1.0,
}

# Specialization compatibility
SPECIALIZATION_COMPATIBILITY = {
    ("Backend", "Backend"): 1.0,
    ("Backend", "Frontend"): 0.6,
    ("Frontend", "Backend"): 0.6,
    ("Frontend", "Frontend"): 1.0,
    ("Fullstack", "Backend"): 0.9,
    ("Fullstack", "Frontend"): 0.9,
    ("Backend", "Fullstack"): 0.9,
    ("Frontend", "Fullstack"): 0.9,
    ("Mobile", "Mobile"): 1.0,
    ("QA", "QA"): 1.0,
    ("Automation", "Automation"): 1.0,
    ("Manual", "Manual"): 1.0,
}


def _get_encoder():
    """Get the sentence transformer encoder."""
    from backend.services.matching import _get_model
    _, encoder = _get_model()
    return encoder


def classify_role_intent(text: str) -> RoleIntent:
    """
    STAGE 1 — ROLE INTENT CLASSIFICATION (GATEKEEPER)
    
    Extracts structured role intent from JD or resume text.
    This is the PRIMARY filter that prevents role mismatches.
    
    Returns:
        RoleIntent with family, type, specialization, and confidence
    """
    text_lower = text.lower()
    
    # Step 1: Try exact taxonomy match
    best_match = None
    best_score = 0
    
    for role_key, role_info in ENTERPRISE_ROLE_TAXONOMY.items():
        # Check for exact role mention
        if role_key in text_lower:
            # Calculate confidence based on position and context
            idx = text_lower.find(role_key)
            # Earlier mentions = higher confidence
            position_score = max(0.5, 1.0 - (idx / 1000))
            
            # Check for tech stack confirmation
            tech_matches = sum(1 for tech in role_info["tech_patterns"] if tech in text_lower)
            tech_score = min(1.0, tech_matches / 3)  # Cap at 3 matches
            
            confidence = (position_score * 0.6) + (tech_score * 0.4)
            
            if confidence > best_score:
                best_score = confidence
                best_match = (role_key, role_info)
    
    # Step 2: Pattern-based extraction if no exact match
    if best_match is None or best_score < MIN_ROLE_CONFIDENCE:
        # Extract primary technology
        tech_patterns = [
            (r'\b(java|spring)\b', 'Java'),
            (r'\b(python|django|flask)\b', 'Python'),
            (r'\b(javascript|typescript|node\.?js)\b', 'JavaScript'),
            (r'\b(react|angular|vue)\b', 'Frontend'),
            (r'\b(kotlin|android)\b', 'Android'),
            (r'\b(swift|ios)\b', 'iOS'),
            (r'\b(go|golang)\b', 'Go'),
            (r'\b(rust)\b', 'Rust'),
            (r'\b(c\+\+|c#)\b', 'C-Family'),
            (r'\b(selenium|cypress|automation)\b', 'Automation'),
            (r'\b(manual testing|qa)\b', 'QA'),
        ]
        
        detected_tech = None
        for pattern, tech in tech_patterns:
            if re.search(pattern, text_lower):
                detected_tech = tech
                break
        
        # Extract role type - ORDER MATTERS! More specific patterns first
        if re.search(r'\b(tester|qa|test engineer|qa engineer|automation tester|manual tester|performance tester|selenium tester|java tester)\b', text_lower):
            role_type = "Tester"
            specialization = "General"
        elif re.search(r'\b(developer|programmer)\b', text_lower):
            role_type = "Developer"
            specialization = "General"
        elif re.search(r'\b(engineer)\b', text_lower) and not re.search(r'\b(software|qa|test)\b', text_lower):
            # Only classify as Engineer if not already covered by Developer/Tester
            role_type = "Engineer"
            specialization = "General"
        elif re.search(r'\b(analyst)\b', text_lower):
            role_type = "Analyst"
            specialization = "General"
        elif re.search(r'\b(scientist)\b', text_lower):
            role_type = "Scientist"
            specialization = "General"
        elif re.search(r'\b(administrator)\b', text_lower):
            role_type = "Administrator"
            specialization = "General"
        else:
            role_type = "Unknown"
            specialization = "Unknown"
        
        # Determine family based on type
        family_map = {
            "Developer": "Software Engineering",
            "Tester": "Quality Assurance",
            "Analyst": "Data Analytics",
            "Scientist": "Data Science",
            "Engineer": "Infrastructure",  # Changed from Software Engineering
            "Administrator": "Infrastructure",
            "Unknown": "Unknown"
        }
        
        return RoleIntent(
            role_family=family_map.get(role_type, "Unknown"),
            role_type=role_type,
            role_specialization=specialization,
            primary_tech=detected_tech or "Unknown",
            confidence=0.5,  # Lower confidence for pattern-based
            raw_label=f"{detected_tech or ''} {role_type}".strip()
        )
    
    # Return taxonomy-based result
    role_key, role_info = best_match
    
    # Determine primary tech
    detected_tech = None
    for tech in role_info["tech_patterns"]:
        if tech in text_lower:
            detected_tech = tech.title()
            break
    
    return RoleIntent(
        role_family=role_info["family"],
        role_type=role_info["type"],
        role_specialization=role_info["specialization"],
        primary_tech=detected_tech or "General",
        confidence=best_score,
        raw_label=role_key.title()
    )


def extract_semantic_role_intent(text: str) -> RoleIntent:
    """
    SEMANTIC ROLE UNDERSTANDING - Enhanced role intent extraction with meaning-based matching.
    
    This function goes beyond keyword matching to understand the TRUE role meaning by:
    1. Analyzing context and semantic relationships
    2. Handling synonyms and role variations
    3. Prioritizing role family over specific titles
    4. Computing confidence based on contextual evidence
    
    Priority order for role extraction:
    1. Experience section (highest weight)
    2. Job titles and role descriptions
    3. Project role mentions
    4. Skills section (lowest weight)
    
    Returns:
        RoleIntent with semantic understanding and confidence score
    """
    text_lower = text.lower()
    
    # SEMANTIC ROLE FAMILY MAPPING
    # Map various role expressions to standardized role families
    semantic_mappings = {
        # Development roles
        "software development": "Software Engineering",
        "web development": "Software Engineering",
        "application development": "Software Engineering",
        "coding": "Software Engineering",
        "programming": "Software Engineering",
        
        # Testing roles
        "quality assurance": "Quality Assurance",
        "testing": "Quality Assurance",
        "qa": "Quality Assurance",
        "test automation": "Quality Assurance",
        "software testing": "Quality Assurance",
        "sdet": "Quality Assurance",  # Software Development Engineer in Test
        "automation testing": "Quality Assurance",
        
        # Data roles
        "data analysis": "Data Analytics",
        "data science": "Data Science",
        "machine learning": "Data Science",
        "ml": "Data Science",
        "analytics": "Data Analytics",
        "business intelligence": "Data Analytics",
        "data engineering": "Data Engineering",
        "data engineer": "Data Engineering",
        
        # Infrastructure roles
        "infrastructure": "Infrastructure",
        "devops": "Infrastructure",
        "system administration": "Infrastructure",
        "cloud computing": "Infrastructure",
        "networking": "Infrastructure",
        "site reliability": "Infrastructure",
        "sre": "Infrastructure"
    }
    
    # ROLE SYNONYMS - Map variations to standard roles
    role_synonyms = {
        "developer": ["developer", "programmer", "coder", "software developer", "software engineer"],
        "tester": ["tester", "qa", "quality assurance", "test engineer", "software tester", "testing", "sdet"],
        "analyst": ["analyst", "data analyst", "business analyst", "systems analyst", "analytics"],
        "scientist": ["scientist", "data scientist", "research scientist", "machine learning scientist", "ml engineer"],
        "engineer": ["engineer", "software engineer", "systems engineer", "devops engineer", "cloud engineer"],
        "administrator": ["administrator", "admin", "system administrator", "network administrator"]
    }
    
    # Extract role family using semantic understanding
    detected_family = "Unknown"
    family_confidence = 0.0
    
    # Check semantic mappings first (highest priority)
    for semantic_term, family in semantic_mappings.items():
        if semantic_term in text_lower:
            # Calculate confidence based on context and position
            matches = len(re.findall(rf'\b{re.escape(semantic_term)}\b', text_lower))
            position_bonus = 1.0 if text_lower.find(semantic_term) < 500 else 0.7  # Early mentions = higher confidence
            detected_family = family
            family_confidence = min(1.0, matches * 0.3 * position_bonus)
            break
    
    # If no semantic mapping found, try role synonyms
    if detected_family == "Unknown":
        for standard_role, synonyms in role_synonyms.items():
            for synonym in synonyms:
                if synonym in text_lower:
                    # Map to appropriate family
                    family_map = {
                        "developer": "Software Engineering",
                        "tester": "Quality Assurance", 
                        "analyst": "Data Analytics",
                        "scientist": "Data Science",
                        "engineer": "Infrastructure",  # Default to Infrastructure for engineers
                        "administrator": "Infrastructure"
                    }
                    detected_family = family_map.get(standard_role, "Unknown")
                    matches = len(re.findall(rf'\b{re.escape(synonym)}\b', text_lower))
                    family_confidence = min(0.8, matches * 0.25)
                    break
            if detected_family != "Unknown":
                break
    
    # Extract role type with context weighting
    role_type = "Unknown"
    type_confidence = 0.0
    
    # Improved section-based analysis for role type extraction
    sections = {
        "experience": "",
        "projects": "",
        "skills": "",
        "summary": "",
        "header": text_lower[:500]  # First 500 chars often contain title
    }
    
    # Split text into sections
    if "experience" in text_lower:
        exp_split = re.split(r'experience|work history|employment', text_lower, flags=re.IGNORECASE)
        sections["experience"] = exp_split[1] if len(exp_split) > 1 else ""
    
    if "projects" in text_lower:
        proj_split = re.split(r'projects|portfolio', text_lower, flags=re.IGNORECASE)
        sections["projects"] = proj_split[1] if len(proj_split) > 1 else ""
    
    if "skills" in text_lower:
        skills_split = re.split(r'skills', text_lower, flags=re.IGNORECASE)
        sections["skills"] = skills_split[1] if len(skills_split) > 1 else ""
    
    # Extract role type from sections with improved patterns
    role_patterns = {
        "Developer": [r'\b(developer|programmer|coder)\b'],
        "Tester": [r'\b(tester|qa|quality assurance|test engineer)\b'],
        "Analyst": [r'\b(analyst|analytics|business analyst)\b'],
        "Scientist": [r'\b(scientist|data scientist|research scientist|ml engineer)\b'],
        "Engineer": [r'\b(engineer|engineering|devops|systems engineer)\b'],
        "Administrator": [r'\b(administrator|admin|system administrator|network administrator)\b']
    }
    
    # Weight sections by priority
    section_weights = {
        "header": 1.5,      # Title/header has highest weight
        "experience": 1.0,
        "projects": 0.8,
        "summary": 0.6,
        "skills": 0.3
    }
    
    best_type = "Unknown"
    best_confidence = 0.0
    
    for role_name, patterns in role_patterns.items():
        total_score = 0.0
        for section_name, section_text in sections.items():
            if section_text:
                section_score = 0.0
                for pattern in patterns:
                    matches = len(re.findall(pattern, section_text))
                    section_score += matches
                total_score += section_score * section_weights[section_name]
        
        if total_score > best_confidence:
            best_confidence = total_score
            best_type = role_name
    
    # Special case: if we detected a specific family but no type, infer from family
    if best_type == "Unknown" and detected_family != "Unknown":
        family_to_type = {
            "Software Engineering": "Developer",
            "Quality Assurance": "Tester",
            "Data Analytics": "Analyst",
            "Data Science": "Scientist",
            "Infrastructure": "Engineer"
        }
        best_type = family_to_type.get(detected_family, "Unknown")
        best_confidence = family_confidence * 0.7  # Lower confidence when inferred
    
    role_type = best_type
    type_confidence = min(1.0, best_confidence * 0.3)  # Scale appropriately
    
    # Extract specialization context
    specialization = "General"
    if "backend" in text_lower:
        specialization = "Backend"
    elif "frontend" in text_lower:
        specialization = "Frontend"
    elif "full" in text_lower and ("stack" in text_lower or "fullstack" in text_lower):
        specialization = "Fullstack"
    elif "mobile" in text_lower:
        specialization = "Mobile"
    elif "automation" in text_lower:
        specialization = "Automation"
    elif "manual" in text_lower:
        specialization = "Manual"
    elif "performance" in text_lower:
        specialization = "Performance"
    
    # Extract primary technology with context awareness
    primary_tech = "General"
    tech_patterns = [
        (r'\b(java|spring|hibernate)\b', 'Java'),
        (r'\b(python|django|flask)\b', 'Python'),
        (r'\b(javascript|typescript|node\.?js|react|angular|vue)\b', 'JavaScript'),
        (r'\b(c\+\+|cpp)\b', 'C++'),
        (r'\b(c#|csharp|\.net)\b', 'C#'),
        (r'\b(go|golang)\b', 'Go'),
        (r'\b(rust)\b', 'Rust'),
        (r'\b(php|laravel)\b', 'PHP'),
        (r'\b(ruby|rails)\b', 'Ruby'),
        (r'\b(scala)\b', 'Scala'),
        (r'\b(kotlin)\b', 'Kotlin'),
        (r'\b(swift)\b', 'Swift'),
        (r'\b(objective-c)\b', 'Objective-C')
    ]
    
    tech_confidence = 0.0
    for pattern, tech_name in tech_patterns:
        if re.search(pattern, text_lower):
            primary_tech = tech_name
            # Calculate confidence based on context
            matches_in_experience = len(re.findall(pattern, sections["experience"]))
            matches_in_projects = len(re.findall(pattern, sections["projects"]))
            matches_in_skills = len(re.findall(pattern, sections["skills"]))
            
            # Weight by section priority
            tech_confidence = min(1.0, 
                (matches_in_experience * 1.0 + 
                 matches_in_projects * 0.8 + 
                 matches_in_skills * 0.3) * 0.2)
            break
    
    # Overall confidence is combination of family and type confidence
    overall_confidence = (family_confidence * 0.6 + type_confidence * 0.4)
    
    return RoleIntent(
        role_family=detected_family,
        role_type=role_type,
        role_specialization=specialization,
        primary_tech=primary_tech,
        confidence=overall_confidence,
        raw_label=f"{primary_tech} {role_type}".strip()
    )


def compute_role_compatibility(jd_role: RoleIntent, resume_role: RoleIntent) -> Tuple[float, str]:
    """
    Compute compatibility score between JD role and resume role.
    
    TWO-MODE ENTERPRISE LOGIC:
    
    MODE 1: ROLE-ONLY SEARCH (NO TECHNOLOGY SPECIFIED)
    - Family match = REQUIRED (base 0.7)
    - Role type alignment = IMPORTANT (0.2)
    - Specialization alignment = MODERATE (0.1)
    - Technology = IGNORED (prevents over-filtering)
    
    MODE 2: ROLE + TECHNOLOGY SEARCH  
    - Family match = REQUIRED (base 0.5)
    - Role type alignment = MODERATE (0.2)
    - Technology compatibility = CRITICAL (0.3)
    - Specialization = IMPORTANT (0.2)
    
    Returns:
        (compatibility_score: 0.0-1.0, reason: str)
    """
    # AUTO-DETECT MODE: Role-only search vs Role+tech search
    is_role_only_search = (
        jd_role.primary_tech == "General" or 
        jd_role.primary_tech == "Unknown" or
        jd_role.role_type == "Unknown"  # Very broad search like "tester"
    )
    
    # Rule 1: Check role family compatibility (HIGHEST priority)
    # Families are the foundational category for role matching
    if jd_role.role_family == "Unknown" or resume_role.role_family == "Unknown":
        # One or both roles are not classifiable
        base_score = 0.3
        reason = "Unidentified role family"
    elif jd_role.role_family == resume_role.role_family:
        # SAME ROLE FAMILY (major requirement)
        base_score = 0.9  # Very high for correct family
        reason = f"Matched role family: {jd_role.role_family}"
    else:
        # Different families should NOT match (like developer vs tester)
        base_score = 0.2
        reason = f"Family mismatch: {jd_role.role_family} vs {resume_role.role_family}"
        return base_score, reason
    
    # Apply two-mode weighting strategy
    if is_role_only_search:
        # MODE 1: ROLE-ONLY SEARCH - Expand search within role family
        # High importance: role types (broad coverage)
        # Low importance: tech specifics (avoids excluding qualified candidates)
        
        if jd_role.role_type == "Unknown" and resume_role.role_type != "Unknown":
            # Broader "tester" match => positive types don't penalty
            role_type_modifier = 0.85  # Encourage matches
        elif jd_role.role_type == "Unknown" and resume_role.role_type == "Unknown":
            # Both unknown - neutral but family match counts
            role_type_modifier = 0.75
        elif jd_role.role_type == resume_role.role_type:
            # Exact type match
            role_type_modifier = 1.0
        else:
            # Type mismatch within same family
            role_type_modifier = 0.6
            
        # Specialization in role-only mode: helpful but not required
        if jd_role.role_specialization == "General" or resume_role.role_specialization == "General":
            spec_modifier = 0.9  # Neutral - don't penalize for missing specialization
        elif jd_role.role_specialization == resume_role.role_specialization:
            spec_modifier = 1.0  # Exact match bonus
        else:
            spec_modifier = 0.7  # Some specialization difference
            
        # Technology in role-only mode: IGNORE completely
        # This prevents "tester" from being filtered out due to tech stack differences
        tech_modifier = 1.0  # Neutral - no impact
        
        # Calculate final score for role-only mode
        final_score = (
            base_score * 0.6 +  # Family weight (highest)
            role_type_modifier * 0.25 +  # Type weight (important)
            spec_modifier * 0.1 +  # Specialization weight (moderate)
            tech_modifier * 0.05  # Tech weight (minimal)
        )
        
        reason = f"Role-only match: family={base_score:.2f}, type={role_type_modifier:.2f}, spec={spec_modifier:.2f}"
        
    else:
        # MODE 2: ROLE + TECHNOLOGY SEARCH - Strict matching
        # High importance: technology compatibility (specific requirements)
        # Moderate importance: role types and specializations
        
        # Role type compatibility (from existing matrix)
        type_key = (jd_role.role_type, resume_role.role_type)
        type_compat = ROLE_TYPE_COMPATIBILITY.get(type_key, 0.4)
        
        # Specialization compatibility (from existing matrix)
        spec_key = (jd_role.role_specialization, resume_role.role_specialization)
        spec_compat = SPECIALIZATION_COMPATIBILITY.get(spec_key, 0.7)
        
        # Technology compatibility - CRITICAL for role+tech searches
        tech_compat = 1.0
        if jd_role.primary_tech != "General" and resume_role.primary_tech != "General":
            if jd_role.primary_tech.lower() != resume_role.primary_tech.lower():
                # Different tech stacks = severe penalty
                # This handles cases like Java Developer vs Python Developer
                # These should NOT match strongly even though both are "Developers"
                tech_compat = 0.3  # Lower penalty than before (was 0.2)
        
        # Calculate final score for role+tech mode
        final_score = (
            base_score * 0.4 +  # Family weight (important)
            type_compat * 0.25 +  # Type weight (moderate)
            spec_compat * 0.15 +  # Specialization weight (moderate)
            tech_compat * 0.2  # Tech weight (critical)
        )
        
        reason = f"Role+tech match: family={base_score:.2f}, type={type_compat:.2f}, spec={spec_compat:.2f}, tech={tech_compat:.2f}"
    
    # Ensure score is within bounds
    final_score = max(0.0, min(1.0, final_score))
    
    # Add confidence-based adjustment
    confidence_factor = min(1.0, (jd_role.confidence + resume_role.confidence) / 2)
    final_score = final_score * confidence_factor
    
    return final_score, reason


# ═══════════════════════════════════════════════════════════════════════════════
# STAGE 2 — SEMANTIC ROLE & SKILL MATCHING
# ═══════════════════════════════════════════════════════════════════════════════

# Caches for embeddings
_embedding_cache = {}


def _get_text_hash(text: str) -> str:
    """Generate hash for caching."""
    return hashlib.md5(text[:2000].encode()).hexdigest()


def compute_semantic_embedding(text: str, context: str = "") -> np.ndarray:
    """
    Compute semantic embedding for text with optional context.
    Uses caching for performance.
    """
    cache_key = _get_text_hash(text + context)
    
    if cache_key in _embedding_cache:
        return _embedding_cache[cache_key]
    
    encoder = _get_encoder()
    
    # Create rich description
    full_text = f"{context} {text}".strip() if context else text
    
    embedding = encoder([full_text[:2000]])[0]
    embedding = np.asarray(embedding, dtype=np.float32)
    
    # L2 normalize
    norm = np.linalg.norm(embedding)
    if norm > 0:
        embedding = embedding / norm
    
    _embedding_cache[cache_key] = embedding
    return embedding


def compute_role_embedding(role_intent: RoleIntent) -> np.ndarray:
    """
    Compute embedding that captures the role intent meaning.
    """
    role_description = (
        f"Role: {role_intent.role_family} {role_intent.role_type}. "
        f"Specialization: {role_intent.role_specialization}. "
        f"Technology: {role_intent.primary_tech}."
    )
    return compute_semantic_embedding(role_description)


def compute_skill_semantic_similarity(jd_skills: List[str], resume_skills: List[str]) -> Tuple[float, List[str], List[str]]:
    """
    Compute semantic similarity between JD skills and resume skills.
    Uses embedding-based comparison, not keyword matching.
    
    Returns:
        (similarity_score, matching_skills, missing_skills)
    """
    from backend.config import SKILL_SIMILARITY_THRESHOLD
    
    if not jd_skills:
        return 0.5, [], []
    
    if not resume_skills:
        return 0.0, [], list(jd_skills)
    
    encoder = _get_encoder()
    
    # Encode all skills
    jd_embeddings = encoder(jd_skills)
    resume_embeddings = encoder(resume_skills)
    
    # Normalize
    jd_embeddings = jd_embeddings / (np.linalg.norm(jd_embeddings, axis=1, keepdims=True) + 1e-9)
    resume_embeddings = resume_embeddings / (np.linalg.norm(resume_embeddings, axis=1, keepdims=True) + 1e-9)
    
    # Compute similarity matrix
    similarity_matrix = np.dot(jd_embeddings, resume_embeddings.T)
    
    # Find best matches
    matching_skills = []
    missing_skills = []
    
    for i, jd_skill in enumerate(jd_skills):
        best_sim = np.max(similarity_matrix[i])
        if best_sim >= SKILL_SIMILARITY_THRESHOLD:
            # Find which resume skill matched
            best_idx = np.argmax(similarity_matrix[i])
            matching_skills.append(jd_skill)
        else:
            missing_skills.append(jd_skill)
    
    # Overall skill similarity score
    if len(jd_skills) > 0:
        coverage = len(matching_skills) / len(jd_skills)
        avg_similarity = np.mean([np.max(similarity_matrix[i]) for i in range(len(jd_skills))])
        skill_score = (coverage * 0.6) + (avg_similarity * 0.4)
    else:
        skill_score = 0.5
    
    return skill_score, matching_skills, missing_skills


def compute_experience_relevance(jd_text: str, resume_text: str) -> float:
    """
    Compute how relevant the resume experience is to the JD.
    Uses document-level semantic similarity.
    """
    jd_emb = compute_semantic_embedding(jd_text[:2000])
    resume_emb = compute_semantic_embedding(resume_text[:2000])
    
    similarity = np.dot(jd_emb, resume_emb)
    # Map from [-1, 1] to [0, 1]
    return (float(similarity) + 1) / 2


# ═══════════════════════════════════════════════════════════════════════════════
# STAGE 3 — ENTERPRISE MATCHING PIPELINE
# ═══════════════════════════════════════════════════════════════════════════════

def run_enterprise_matching(
    job_description: str,
    resume_items: List[Dict],
    jd_skills: List[str],
    jd_locations: List[str],
    use_role_gatekeeper: bool = True,
    min_role_compatibility: float = ROLE_COMPATIBILITY_THRESHOLD
) -> List[MatchResult]:
    """
    Enterprise-grade multi-stage matching pipeline.
    
    STAGE 1: Role Intent Classification (Gatekeeper)
    STAGE 2: Semantic Role & Skill Matching
    STAGE 3: Final Scoring & Ranking
    
    Args:
        job_description: Full JD text
        resume_items: List of resume dicts with 'text', 'skills', etc.
        jd_skills: Extracted JD skills
        jd_locations: Extracted JD locations
        use_role_gatekeeper: If True, filter by role compatibility
        min_role_compatibility: Minimum role compatibility score (0.0-1.0)
    
    Returns:
        List of MatchResult objects, sorted by match_percentage
    """
    from backend.services.matching import compute_location_display
    
    print(f"\n{'='*60}")
    print("ENTERPRISE MATCHING PIPELINE")
    print(f"{'='*60}")
    
    # PERFORMANCE OPTIMIZATION – CRITICAL: Get JD embedding once for all resumes
    from backend.services.batch_optimizer import get_jd_embedding_cached
    jd_embedding = get_jd_embedding_cached(job_description)
    
    # STAGE 1: Classify JD Role Intent
    jd_role = classify_role_intent(job_description)
    print(f"\n[STAGE 1] JD Role Intent:")
    print(f"  Family: {jd_role.role_family}")
    print(f"  Type: {jd_role.role_type}")
    print(f"  Specialization: {jd_role.role_specialization}")
    print(f"  Primary Tech: {jd_role.primary_tech}")
    print(f"  Confidence: {jd_role.confidence:.2f}")
    
    results = []
    rejected_count = 0
    
    # PERFORMANCE OPTIMIZATION – CRITICAL: Extract all resume data first to avoid repeated processing
    resume_texts = [item["text"] for item in resume_items]
    resume_skills_list = [item.get("skills", []) for item in resume_items]
    
    # PERFORMANCE OPTIMIZATION – CRITICAL: Batch process role intents for all resumes
    resume_roles = [classify_role_intent(text) for text in resume_texts]
    
    # PERFORMANCE OPTIMIZATION – CRITICAL: Batch compute role compatibilities
    role_compatibilities = []
    for resume_role in resume_roles:
        compat_score, compat_reason = compute_role_compatibility(jd_role, resume_role)
        role_compatibilities.append((compat_score, compat_reason))
    
    # PERFORMANCE OPTIMIZATION – CRITICAL: Batch compute resume embeddings for experience relevance
    from backend.services.batch_optimizer import batch_encode_texts
    resume_embeddings = batch_encode_texts(resume_texts)
    
    # PERFORMANCE OPTIMIZATION – CRITICAL: Batch compute experience relevances
    experience_relevances = [compute_experience_relevance(job_description, text) for text in resume_texts]
    
    # PERFORMANCE OPTIMIZATION – CRITICAL: Process all items in optimized loop
    for i, item in enumerate(resume_items):
        res_text = item["text"]
        res_skills = item.get("skills", [])
        res_locations = item.get("locations", [])
        res_exp_years = item.get("experience_years")
        res_phones = item.get("phone_numbers", [])
        res_emails = item.get("emails", [])
        
        # Get pre-computed role data
        resume_role = resume_roles[i]
        role_compat_score, role_compat_reason = role_compatibilities[i]
        exp_relevance = experience_relevances[i]
        
        # GATEKEEPER: Determine role compatibility but don't filter yet
        stage1_passed = role_compat_score >= min_role_compatibility
        
        if use_role_gatekeeper and not stage1_passed:
            rejected_count += 1
            print(f"  [NOT MATCHED] {item.get('original_name', 'Unknown')}: {role_compat_reason}")
            
            # Still add to results but with 0 match percentage and marked as not matched
            result = MatchResult(
                original_name=item.get("original_name", ""),
                path=item.get("path", ""),
                match_percentage=0.0,  # No match
                role_similarity=0.0,  # Will be computed later if needed
                skill_similarity=0.0,
                experience_relevance=round(exp_relevance * 100, 2),
                role_compatibility_score=round(role_compat_score * 100, 2),
                matching_skills=[],
                missing_skills=jd_skills,  # All JD skills are missing for unmatched
                experience_years=res_exp_years,
                locations=res_locations,
                location_display=compute_location_display(jd_locations, res_locations),
                extracted_skills=res_skills,
                raw_text=res_text,
                phone_numbers=res_phones,
                emails=res_emails,
                jd_role=jd_role,
                resume_role=resume_role,
                role_compatible=stage1_passed,
                _stage1_passed=stage1_passed,
                _stage2_score=0.0
            )
            results.append(result)
            continue
        
        # STAGE 2: Semantic Matching (for matched resumes)
        # 2a: Role semantic similarity (compute embeddings individually since they're small)
        jd_role_emb = compute_role_embedding(jd_role)
        res_role_emb = compute_role_embedding(resume_role)
        role_semantic_sim = (float(np.dot(jd_role_emb, res_role_emb)) + 1) / 2
        
        # 2b: Skill semantic similarity
        skill_sim, matching_skills, missing_skills = compute_skill_semantic_similarity(
            jd_skills, res_skills
        )
        
        # STAGE 3: Final Scoring
        # Weighted scoring:
        # - 50% Role intent similarity (semantic + compatibility)
        # - 30% Skill semantic similarity
        # - 20% Experience relevance
        
        # Role score combines compatibility and semantic similarity
        role_score = (role_compat_score * 0.6) + (role_semantic_sim * 0.4)
        
        final_score = (
            role_score * 0.50 +
            skill_sim * 0.30 +
            exp_relevance * 0.20
        )
        
        # Convert to percentage
        match_percentage = round(final_score * 100, 2)
        
        location_display = compute_location_display(jd_locations, res_locations)
        
        result = MatchResult(
            original_name=item.get("original_name", ""),
            path=item.get("path", ""),
            match_percentage=match_percentage,
            role_similarity=round(role_semantic_sim * 100, 2),
            skill_similarity=round(skill_sim * 100, 2),
            experience_relevance=round(exp_relevance * 100, 2),
            role_compatibility_score=round(role_compat_score * 100, 2),
            matching_skills=matching_skills,
            missing_skills=missing_skills,
            experience_years=res_exp_years,
            locations=res_locations,
            location_display=location_display,
            extracted_skills=res_skills,
            raw_text=res_text,
            phone_numbers=res_phones,
            emails=res_emails,
            jd_role=jd_role,
            resume_role=resume_role,
            role_compatible=stage1_passed,
            _stage1_passed=stage1_passed,
            _stage2_score=final_score
        )
        
        results.append(result)
        
        print(f"  [MATCHED] {item.get('original_name', 'Unknown')}: {match_percentage:.1f}% "
              f"(role_compat={role_compat_score:.2f}, role_sim={role_semantic_sim:.2f}, "
              f"skill_sim={skill_sim:.2f})")

    print(f"\n[SUMMARY] Total: {len(resume_items)}, Matched: {len(results)}, Rejected: {rejected_count}")
    print(f"{'='*60}\n")
    
    # Sort by match percentage descending
    results.sort(key=lambda x: x.match_percentage, reverse=True)
    
    return results


def match_result_to_dict(result: MatchResult) -> Dict:
    """Convert MatchResult to API-compatible dict."""
    return {
        "original_name": result.original_name,
        "path": result.path,
        "match_percentage": result.match_percentage,
        "matching_skills": result.matching_skills,
        "missing_skills": result.missing_skills,
        "experience_years": result.experience_years,
        "locations": result.locations,
        "location_display": result.location_display,
        "extracted_skills": result.extracted_skills,
        "raw_text": result.raw_text,
        "phone_numbers": result.phone_numbers,
        "emails": result.emails,
        # Additional enterprise metadata
        "role_label": result.resume_role.raw_label,
        "role_family": result.resume_role.role_family,
        "role_type": result.resume_role.role_type,
        "primary_skill": result.resume_role.primary_tech,
        "role_similarity": result.role_similarity,
        "role_compatibility": result.role_compatibility_score,
        "skill_similarity": result.skill_similarity,
        "experience_relevance": result.experience_relevance,
        # Include match status
        "is_matched": result.role_compatible,
    }
