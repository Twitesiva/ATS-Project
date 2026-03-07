"""
STRICT ROLE + PRIMARY SKILL MATCHING — ENTERPRISE HARD GATES

This module implements mandatory enterprise rules for eliminating false positives:

RULE 1 — ROLE TITLE DOMINANCE (HARD GATE):
    Resume PRIMARY ROLE must exactly match search role.
    "Java Developer" vs "Python Developer" → HARD REJECT

RULE 2 — PRIMARY SKILL DOMINANCE (HARD GATE):
    Resume PRIMARY SKILL must match search primary skill.
    Minor mentions ("Python basics") do NOT qualify.

RULE 3 — SECONDARY SKILLS ARE SUPPORTING ONLY:
    Can improve ranking, but NEVER cause inclusion of mismatched roles.

KEY CONCEPT:
- Primary Role: The main job function (Developer, Tester, Analyst)
- Primary Skill: The core technology/specialization (Java, Python, React)
- Secondary Skills: Supporting technologies that must not override primary
"""
import numpy as np
import re
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass

# STRICT THRESHOLDS — These are HARD GATES, not soft preferences
PRIMARY_ROLE_MATCH_REQUIRED = True  # Must match exactly
PRIMARY_SKILL_SIMILARITY_THRESHOLD = 0.75  # Strict semantic threshold
MIN_SKILL_CONFIDENCE = 0.70  # Minimum confidence for primary skill detection


@dataclass
class StrictRoleProfile:
    """Strict role profile with primary and secondary classifications."""
    primary_role: str  # e.g., "Developer", "Tester"
    primary_skill: str  # e.g., "Java", "Python"
    primary_skill_confidence: float  # 0.0 - 1.0
    secondary_skills: List[str]  # Supporting skills only
    role_family: str  # e.g., "Software Engineering"
    raw_title: str  # Original title from resume


@dataclass
class ParsedSearchQuery:
    """
    ENTERPRISE: Parsed search query with explicit role/skill separation.
    
    Input: "Python Developer, Django, REST"
    Parsed:
        - role: "Developer"
        - primary_skill: "Python"
        - secondary_skills: ["Django", "REST"]
    """
    role: str  # e.g., "Developer", "Tester"
    primary_skill: str  # e.g., "Python", "Java"
    secondary_skills: List[str]  # Supporting skills only
    raw_query: str  # Original search string


# ENTERPRISE: Known roles for search query parsing
ROLE_KEYWORDS = [
    "Developer", "Engineer", "Tester", "Analyst", 
    "Scientist", "Architect", "Manager", "Lead",
    "Consultant", "Specialist", "Administrator"
]

# ENTERPRISE: Known skills for search query parsing
# Programming languages and major technologies
KNOWN_SKILLS = [
    # Programming Languages
    "Java", "Python", "JavaScript", "TypeScript", "C++", "C#", "Go", "Rust",
    "PHP", "Ruby", "Swift", "Kotlin", "Scala", "Perl", "R", "MATLAB",
    # Web Frontend
    "React", "Angular", "Vue", "HTML", "CSS", "SASS", "LESS", "Bootstrap",
    # Web Backend  
    "Node.js", "Django", "Flask", "Spring", "Express", "FastAPI", "Laravel",
    "Rails", "ASP.NET", "GraphQL", "REST",
    # Databases
    "SQL", "PostgreSQL", "MySQL", "MongoDB", "Redis", "Elasticsearch",
    "Cassandra", "DynamoDB", "Oracle", "SQL Server",
    # Cloud/DevOps
    "AWS", "Azure", "GCP", "Docker", "Kubernetes", "Terraform", "Jenkins",
    "GitLab", "GitHub Actions", "CircleCI", "Travis CI",
    # Data/ML
    "TensorFlow", "PyTorch", "Spark", "Hadoop", "Kafka", "Airflow",
    "Pandas", "NumPy", "Scikit-learn", "Keras",
    # Testing
    "Selenium", "Cypress", "Jest", "JUnit", "TestNG", "Cucumber", "JMeter",
    "Postman", "SoapUI",
    # Mobile
    "Android", "iOS", "React Native", "Flutter", "Xamarin", "Ionic",
    # Other
    "Git", "Linux", "Windows", "Unix", "Shell", "Bash", "PowerShell"
]


def parse_search_query(search_query: str) -> ParsedSearchQuery:
    """
    ENTERPRISE: Parse comma-separated search query into structured components.
    
    Input examples:
        - "Python Developer"
        - "Python Developer, Django, REST"
        - "Java Tester, Selenium"
        - "React Frontend Developer, TypeScript"
    
    Parsing rules:
        1. Split by commas to get components
        2. First component contains role + primary skill
        3. Remaining components are secondary skills
        4. Extract role from first component (Developer, Tester, etc.)
        5. Extract primary skill from first component (Python, Java, etc.)
    """
    if not search_query or not search_query.strip():
        return ParsedSearchQuery(
            role="Unknown",
            primary_skill="General",
            secondary_skills=[],
            raw_query=search_query or ""
        )
    
    # Split by commas and clean
    parts = [p.strip() for p in search_query.split(",") if p.strip()]
    
    if not parts:
        return ParsedSearchQuery(
            role="Unknown",
            primary_skill="General",
            secondary_skills=[],
            raw_query=search_query
        )
    
    # First part contains role and primary skill
    first_part = parts[0].lower()
    
    # Extract role
    role = "Unknown"
    for role_keyword in ROLE_KEYWORDS:
        if role_keyword.lower() in first_part:
            role = role_keyword
            break
    
    # Extract primary skill from first part
    primary_skill = "General"
    # Sort by length (descending) to match "JavaScript" before "Java"
    sorted_skills = sorted(KNOWN_SKILLS, key=len, reverse=True)
    for skill in sorted_skills:
        skill_lower = skill.lower().replace(".", r"\.")  # Escape dots for regex
        # Use word boundary matching
        pattern = rf'\b{re.escape(skill_lower)}\b'
        if re.search(pattern, first_part):
            primary_skill = skill
            break
    
    # Secondary skills from remaining parts
    secondary_skills = []
    for part in parts[1:]:
        part_lower = part.lower()
        # Check if it's a known skill
        for skill in sorted_skills:
            skill_lower = skill.lower()
            pattern = rf'\b{re.escape(skill_lower)}\b'
            if re.search(pattern, part_lower):
                secondary_skills.append(skill)
                break
        else:
            # If not a known skill, add as-is (might be a custom skill)
            secondary_skills.append(part.strip())
    
    return ParsedSearchQuery(
        role=role,
        primary_skill=primary_skill,
        secondary_skills=secondary_skills,
        raw_query=search_query
    )


# Role type patterns — for extracting PRIMARY role
def _get_role_patterns():
    """Return patterns for identifying primary roles."""
    return {
        "Developer": [
            r'\b(software\s+developer|software\s+engineer)\b',
            r'\b(backend|frontend|full[-\s]?stack)\s+developer\b',
            r'\b(java|python|javascript|react|node\.?js)\s+developer\b',
            r'\bmobile\s+(developer|engineer)\b',
            r'\b(devops|cloud)\s+engineer\b',
        ],
        "Tester": [
            r'\b(qa\s+engineer|test\s+engineer)\b',
            r'\b(software\s+tester|automation\s+tester)\b',
            r'\b(manual|performance)\s+tester\b',
            r'\b(java|selenium)\s+tester\b',
        ],
        "Analyst": [
            r'\b(data\s+analyst|business\s+analyst)\b',
            r'\b(systems\s+analyst)\b',
        ],
        "Scientist": [
            r'\b(data\s+scientist|machine\s+learning\s+engineer|ml\s+engineer)\b',
        ],
        "Engineer": [
            r'\b(data\s+engineer|security\s+engineer)\b',
            r'\bnetwork\s+engineer\b',
        ],
    }


# Primary skill patterns — technology stack identification
def _get_skill_patterns():
    """Return patterns for identifying primary skills."""
    return {
        # Programming Languages
        "Java": [r'\bjava\b(?!script)', r'\bspring\b', r'\bhibernate\b', r'\bmaven\b', r'\bgradle\b'],
        "Python": [r'\bpython\b', r'\bdjango\b', r'\bflask\b', r'\bfastapi\b', r'\bpandas\b', r'\bnumpy\b'],
        "JavaScript": [r'\bjavascript\b', r'\bjs\b', r'\bnode\.?js\b', r'\bexpress\b'],
        "TypeScript": [r'\btypescript\b', r'\bts\b'],
        "React": [r'\breact\b', r'\breactjs\b', r'\bredux\b', r'\bnext\.?js\b'],
        "Angular": [r'\bangular\b', r'\bng\b'],
        "Vue": [r'\bvue\.?js\b', r'\bvue\b'],
        "Go": [r'\bgo\s+lang\b', r'\bgolang\b'],
        "Rust": [r'\brust\b(?!\s+script)'],
        "C++": [r'\bc\+\+\b', r'\bcpp\b'],
        "C#": [r'\bc#\b', r'\bdotnet\b', r'\.net\b'],
        "PHP": [r'\bphp\b', r'\blaravel\b'],
        "Ruby": [r'\bruby\b', r'\brails\b'],
        "Swift": [r'\bswift\b', r'\bios\s+development\b'],
        "Kotlin": [r'\bkotlin\b', r'\bandroid\s+development\b'],
        "SQL": [r'\bsql\b', r'\bpostgresql\b', r'\bmysql\b', r'\boracle\b'],
        
        # Testing
        "Selenium": [r'\bselenium\b', r'\bwebdriver\b'],
        "Cypress": [r'\bcypress\b'],
        "JMeter": [r'\bjmeter\b'],
        
        # Data/ML
        "TensorFlow": [r'\btensorflow\b', r'\btf\b'],
        "PyTorch": [r'\bpytorch\b'],
        "Spark": [r'\bspark\b', r'\bpyspark\b'],
        "AWS": [r'\baws\b', r'\bamazon\s+web\s+services\b'],
        "Azure": [r'\bazure\b', r'\bmicrosoft\s+azure\b'],
        "Docker": [r'\bdocker\b', r'\bkubernetes\b', r'\bk8s\b'],
    }


def _count_skill_mentions(text: str, patterns: List[str]) -> int:
    """Count how many times skill patterns appear in text."""
    text_lower = text.lower()
    count = 0
    for pattern in patterns:
        matches = re.findall(pattern, text_lower)
        count += len(matches)
    return count


def _is_primary_skill_context(text: str, skill: str, patterns: List[str]) -> Tuple[bool, float]:
    """
    Determine if a skill is used as PRIMARY skill (not just mentioned).
    
    Returns:
        (is_primary: bool, confidence: float)
    """
    text_lower = text.lower()
    skill_lower = skill.lower()
    
    # Count mentions using patterns
    mention_count = _count_skill_mentions(text, patterns)
    
    # Check if skill appears in title (strong indicator)
    title_bonus = 0
    
    # Check for primary skill indicators (case-insensitive)
    primary_indicators = [
        f'{skill_lower} developer',
        f'{skill_lower} engineer',
        f'senior {skill_lower}',
        f'{skill_lower} expert',
        f'expert in {skill_lower}',
        f'{skill_lower} specialist',
        f'extensive {skill_lower}',
        f'advanced {skill_lower}',
        f'{skill_lower} programming',
    ]
    
    secondary_indicators = [
        f'basic {skill_lower}',
        f'familiar with {skill_lower}',
        f'knowledge of {skill_lower}',
        f'exposure to {skill_lower}',
        f'used {skill_lower} for',
        f'{skill_lower} scripts',
        f'{skill_lower} basics',
    ]
    
    primary_score = sum(1 for p in primary_indicators if p in text_lower)
    secondary_score = sum(1 for s in secondary_indicators if s in text_lower)
    
    # Calculate confidence
    if mention_count == 0:
        return False, 0.0
    
    # Base confidence from mention frequency
    base_confidence = min(0.5, mention_count / 10)
    
    # Primary indicators boost confidence significantly
    primary_boost = primary_score * 0.25
    
    # Secondary indicators reduce confidence
    secondary_penalty = secondary_score * 0.15
    
    confidence = min(1.0, base_confidence + primary_boost - secondary_penalty)
    
    # Is primary if we have good confidence AND some primary indicators
    is_primary = confidence >= MIN_SKILL_CONFIDENCE or (primary_score >= 2 and confidence >= 0.5)
    
    return is_primary, confidence


def extract_strict_role_profile(text: str, title: str = "") -> StrictRoleProfile:
    """
    Extract strict role profile with primary role and primary skill.
    
    This enforces RULE 1 and RULE 2 of enterprise matching.
    """
    text_to_analyze = f"{title} {text}".strip() if title else text
    text_lower = text_to_analyze.lower()
    
    # STEP 1: Extract PRIMARY ROLE
    primary_role = "Unknown"
    role_family = "Unknown"
    
    role_patterns = _get_role_patterns()
    role_scores = {}
    
    for role, patterns in role_patterns.items():
        score = 0
        for pattern in patterns:
            matches = re.findall(pattern, text_lower)
            score += len(matches) * 2  # Title matches weighted higher
        if score > 0:
            role_scores[role] = score
    
    if role_scores:
        primary_role = max(role_scores, key=role_scores.get)
        # Map to family
        family_map = {
            "Developer": "Software Engineering",
            "Tester": "Quality Assurance",
            "Analyst": "Data Analytics",
            "Scientist": "Data Science",
            "Engineer": "Infrastructure"
        }
        role_family = family_map.get(primary_role, "Unknown")
    
    # STEP 2: Extract PRIMARY SKILL
    primary_skill = "General"
    primary_skill_confidence = 0.0
    secondary_skills = []
    
    skill_patterns = _get_skill_patterns()
    skill_scores = {}
    
    # SPECIAL CASE: Check if skill appears directly in title (e.g., "Python Developer")
    title_lower = title.lower() if title else ""
    title_skill = None
    for skill in skill_patterns.keys():
        if skill.lower() in title_lower:
            # Check that it's not part of another word (e.g., "Java" in "JavaScript")
            skill_pos = title_lower.find(skill.lower())
            if skill_pos >= 0:
                # Check word boundaries
                before = title_lower[max(0, skill_pos-1):skill_pos]
                after_end = skill_pos + len(skill)
                after = title_lower[after_end:after_end+1] if after_end < len(title_lower) else ""
                
                if (not before or not before.isalpha()) and (not after or not after.isalpha()):
                    title_skill = skill
                    break
    
    for skill, patterns in skill_patterns.items():
        is_primary, confidence = _is_primary_skill_context(text_to_analyze, skill, patterns)
        mention_count = _count_skill_mentions(text_to_analyze, patterns)
        
        # If skill is in title, boost it significantly
        if skill == title_skill:
            is_primary = True
            confidence = max(confidence, 0.95)  # High confidence for title match
        
        if mention_count > 0 or skill == title_skill:
            skill_scores[skill] = {
                "mentions": mention_count,
                "is_primary": is_primary,
                "confidence": confidence
            }
    
    # Find the best primary skill
    if skill_scores:
        # Sort by confidence first, then by mentions
        sorted_skills = sorted(
            skill_scores.items(),
            key=lambda x: (x[1]["confidence"], x[1]["mentions"]),
            reverse=True
        )
        
        # Top skill with sufficient confidence is primary
        for skill, data in sorted_skills:
            if data["is_primary"] and data["confidence"] >= MIN_SKILL_CONFIDENCE:
                primary_skill = skill
                primary_skill_confidence = data["confidence"]
                break
        
        # If no primary found but we have a title skill, use it
        if primary_skill == "General" and title_skill:
            primary_skill = title_skill
            primary_skill_confidence = 0.95
        
        # Remaining skills are secondary
        for skill, data in sorted_skills:
            if skill != primary_skill and data["mentions"] > 0:
                secondary_skills.append(skill)
    
    return StrictRoleProfile(
        primary_role=primary_role,
        primary_skill=primary_skill,
        primary_skill_confidence=primary_skill_confidence,
        secondary_skills=secondary_skills[:10],  # Limit secondary skills
        role_family=role_family,
        raw_title=title or ""
    )


def apply_strict_role_skill_gate(
    search_query: str,
    resume_profile: StrictRoleProfile
) -> Tuple[bool, str]:
    """
    Apply HARD GATES for role + skill matching.
    
    RULE 1: Primary role must match
    RULE 2: Primary skill must match (with strict semantic threshold)
    RULE 3: Secondary skills NEVER override primary mismatches
    
    Returns:
        (passes: bool, reason: str)
    """
    # ENTERPRISE: Parse search query with comma-separated support
    parsed_search = parse_search_query(search_query)
    
    # GATE 1: Primary Role Match (HARD)
    if parsed_search.role != "Unknown":
        if resume_profile.primary_role != parsed_search.role:
            return False, (
                f"ROLE MISMATCH: search={parsed_search.role}, "
                f"resume={resume_profile.primary_role}"
            )
    
    # GATE 2: Primary Skill Match (HARD)
    if parsed_search.primary_skill != "General":
        # STRICT: Resume must have a primary skill identified
        if resume_profile.primary_skill == "General":
            return False, (
                f"SKILL MISMATCH: resume has no clear primary skill, "
                f"search requires {parsed_search.primary_skill}"
            )
        
        # STRICT: Exact match required (case-insensitive)
        if resume_profile.primary_skill.lower() != parsed_search.primary_skill.lower():
            # Skills don't match exactly - check if they're semantically similar
            from backend.services.enterprise_matching import compute_semantic_embedding
            
            try:
                search_emb = compute_semantic_embedding(parsed_search.primary_skill)
                resume_emb = compute_semantic_embedding(resume_profile.primary_skill)
                
                similarity = float(np.dot(search_emb, resume_emb))
                similarity = (similarity + 1) / 2  # Normalize to 0-1
                
                # STRICT REJECTION: Different programming languages are NOT similar
                # Java vs Python, C++ vs JavaScript, etc. should NEVER match
                programming_languages = ["java", "python", "javascript", "typescript", "c++", "c#", "go", "rust", "php", "ruby", "swift", "kotlin"]
                search_is_lang = parsed_search.primary_skill.lower() in programming_languages
                resume_is_lang = resume_profile.primary_skill.lower() in programming_languages
                
                if search_is_lang and resume_is_lang and parsed_search.primary_skill.lower() != resume_profile.primary_skill.lower():
                    return False, (
                        f"SKILL MISMATCH: Different programming languages. "
                        f"search={parsed_search.primary_skill}, "
                        f"resume={resume_profile.primary_skill}"
                    )
                
                # For non-language skills, use semantic similarity
                if similarity < PRIMARY_SKILL_SIMILARITY_THRESHOLD:
                    return False, (
                        f"SKILL MISMATCH: search={parsed_search.primary_skill}, "
                        f"resume={resume_profile.primary_skill}, "
                        f"similarity={similarity:.2f} < {PRIMARY_SKILL_SIMILARITY_THRESHOLD}"
                    )
                
                # Even with good similarity, resume must be confident about its primary skill
                if resume_profile.primary_skill_confidence < MIN_SKILL_CONFIDENCE:
                    return False, (
                        f"SKILL UNCERTAIN: resume primary skill confidence "
                        f"{resume_profile.primary_skill_confidence:.2f} < {MIN_SKILL_CONFIDENCE}"
                    )
                    
            except Exception as e:
                # Fallback: require exact match
                return False, (
                    f"SKILL MISMATCH: search={parsed_search.primary_skill}, "
                    f"resume={resume_profile.primary_skill} (semantic check failed: {e})"
                )
    
    # GATE 3: Secondary Skills Check (SOFT - for scoring only)
    # Secondary skills can boost score but NEVER override primary mismatches
    # This is handled by the caller after hard gates pass
    
    return True, "PASS: Role and skill match confirmed"


def filter_by_strict_matching(
    search_query: str,
    resumes: List[Dict]
) -> Tuple[List[Dict], List[Dict]]:
    """
    Filter resumes using strict role + skill gates.
    
    Returns:
        (matched_resumes: List[Dict], rejected_resumes: List[Dict])
    """
    matched = []
    rejected = []
    
    for resume in resumes:
        raw_text = resume.get("raw_text", "")
        title = resume.get("role_label", "")
        
        # Extract strict profile
        profile = extract_strict_role_profile(raw_text, title)
        
        # Apply hard gates
        passes, reason = apply_strict_role_skill_gate(search_query, profile)
        
        # Add profile info to resume
        resume["_strict_profile"] = {
            "primary_role": profile.primary_role,
            "primary_skill": profile.primary_skill,
            "primary_skill_confidence": profile.primary_skill_confidence,
            "secondary_skills": profile.secondary_skills
        }
        
        if passes:
            matched.append(resume)
        else:
            resume["_rejection_reason"] = reason
            rejected.append(resume)
    
    return matched, rejected
