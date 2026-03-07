"""
Enhanced Enterprise-Grade Resume Matching System
Implements meaning-first matching with clear component weighting and explanations.
"""

from dataclasses import dataclass
from typing import List, Dict, Tuple, Optional
import numpy as np
import re
from backend.services.enterprise_matching import (
    classify_role_intent, 
    compute_role_compatibility,
    compute_role_embedding,
    compute_semantic_embedding
)
from backend.services.matching import _get_model


@dataclass
class MatchComponent:
    """Represents one component of the match score with explanation"""
    name: str
    score: float  # 0-1
    weight: float  # 0-1
    explanation: str
    details: Dict


@dataclass
class MatchExplanation:
    """Complete explanation of why a resume matched or didn't match"""
    overall_score: float
    quality_category: str
    components: List[MatchComponent]
    role_match: str
    skills_analysis: Dict
    experience_analysis: Dict
    summary: str


@dataclass
class EnhancedMatchResult:
    """Enhanced match result with detailed explanation"""
    original_name: str
    path: str
    match_percentage: float
    quality_category: str
    explanation: MatchExplanation
    matching_skills: List[str]
    missing_skills: List[str]
    extracted_skills: List[str]
    experience_years: Optional[float]
    locations: List[str]
    phone_numbers: List[str]
    emails: List[str]
    role_intent: Dict
    is_matched: bool


def extract_experience_context(resume_text: str, jd_experience_years: Optional[float]) -> Dict:
    """
    Analyze experience context - distinguish between professional experience and basic exposure.
    """
    experience_analysis = {
        "professional_context": 0.0,
        "years_mentioned": 0.0,
        "depth_indicators": [],
        "exposure_indicators": []
    }
    
    # Look for professional experience indicators
    professional_patterns = [
        r'\b(professionally|work experience|employment|role|position|responsibilities|led|managed|developed|implemented|designed)\b',
        r'\b(years? of experience|experience with|experienced in)\b',
        r'\b(senior|lead|principal|architect|manager)\b'
    ]
    
    exposure_patterns = [
        r'\b(basic|fundamental|introductory|familiar with|know about|learned)\b',
        r'\b(course|training|workshop|certification|academic)\b',
        r'\b(student|intern|project|assignment|homework)\b'
    ]
    
    # Count professional context mentions
    professional_matches = 0
    for pattern in professional_patterns:
        matches = len(re.findall(pattern, resume_text, re.IGNORECASE))
        professional_matches += matches
        if matches > 0:
            experience_analysis["depth_indicators"].append(pattern)
    
    # Count exposure mentions
    exposure_matches = 0
    for pattern in exposure_patterns:
        matches = len(re.findall(pattern, resume_text, re.IGNORECASE))
        exposure_matches += matches
        if matches > 0:
            experience_analysis["exposure_indicators"].append(pattern)
    
    # Calculate professional context score
    if professional_matches > 0:
        experience_analysis["professional_context"] = min(1.0, professional_matches / 5.0)
    
    # Extract experience years mentioned
    years_patterns = [
        r'(\d+(?:\.\d+)?)\s*(?:years?|yrs?)\s*(?:of experience|experience)',
        r'(?:experience of|have|has)\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)'
    ]
    
    years_found = []
    for pattern in years_patterns:
        matches = re.findall(pattern, resume_text, re.IGNORECASE)
        years_found.extend([float(m) for m in matches if m.replace('.', '').isdigit()])
    
    if years_found:
        experience_analysis["years_mentioned"] = max(years_found)
    
    return experience_analysis


def calculate_skill_relevance(jd_skills: List[str], resume_skills: List[str], 
                            resume_text: str) -> Tuple[float, Dict]:
    """
    Calculate skill relevance based on context and depth, not just presence.
    """
    if not jd_skills:
        return 0.5, {"coverage": 0, "context_score": 0, "relevant_skills": []}
    
    if not resume_skills:
        return 0.0, {"coverage": 0, "context_score": 0, "relevant_skills": []}
    
    # Encode skills for semantic similarity
    _, encode = _get_model()
    try:
        jd_embeddings = encode(jd_skills)
        resume_embeddings = encode(resume_skills)
        
        # Normalize embeddings
        jd_embeddings = jd_embeddings / (np.linalg.norm(jd_embeddings, axis=1, keepdims=True) + 1e-9)
        resume_embeddings = resume_embeddings / (np.linalg.norm(resume_embeddings, axis=1, keepdims=True) + 1e-9)
        
        # Compute similarity matrix
        similarity_matrix = np.dot(jd_embeddings, resume_embeddings.T)
        
        # Analyze skill context in resume text
        relevant_skills = []
        total_context_score = 0
        
        for i, jd_skill in enumerate(jd_skills):
            best_sim = np.max(similarity_matrix[i])
            if best_sim >= 0.7:  # Semantic threshold
                best_idx = np.argmax(similarity_matrix[i])
                resume_skill = resume_skills[best_idx]
                
                # Check context - how skill is used in resume
                context_score = analyze_skill_context(resume_skill, resume_text)
                total_context_score += context_score
                relevant_skills.append({
                    "jd_skill": jd_skill,
                    "resume_skill": resume_skill,
                    "similarity": float(best_sim),
                    "context_score": context_score
                })
        
        # Calculate scores
        coverage = len(relevant_skills) / len(jd_skills)
        avg_context_score = total_context_score / len(relevant_skills) if relevant_skills else 0
        
        # Weight coverage more heavily than context (70/30 split)
        skill_score = (coverage * 0.7) + (avg_context_score * 0.3)
        
        details = {
            "coverage": coverage,
            "context_score": avg_context_score,
            "relevant_skills": relevant_skills[:5],  # Top 5 relevant skills
            "total_relevant": len(relevant_skills),
            "total_jd_skills": len(jd_skills)
        }
        
        return min(1.0, skill_score), details
        
    except Exception as e:
        # Fallback to simple matching
        matching_skills = [s for s in jd_skills if any(rs for rs in resume_skills 
                        if s.lower() in rs.lower() or rs.lower() in s.lower())]
        coverage = len(matching_skills) / len(jd_skills) if jd_skills else 0
        return coverage * 0.7, {
            "coverage": coverage,
            "context_score": 0.3,  # Default context score
            "relevant_skills": [{"jd_skill": s, "resume_skill": s, "similarity": 0.8, "context_score": 0.3} 
                              for s in matching_skills[:3]],
            "total_relevant": len(matching_skills),
            "total_jd_skills": len(jd_skills)
        }


def analyze_skill_context(skill: str, resume_text: str) -> float:
    """
    Analyze how a skill is used in the resume - professionally vs just listed.
    """
    # Sections where skills are used professionally
    professional_sections = ["experience", "work", "projects", "responsibilities", "achievements"]
    skills_section = ["skills", "technologies", "tools"]
    
    # Check which sections contain the skill
    skill_lower = skill.lower()
    professional_mentions = 0
    skills_section_mentions = 0
    
    lines = resume_text.lower().split('\n')
    current_section = ""
    
    for line in lines:
        # Track section changes
        if any(section in line for section in professional_sections):
            current_section = "professional"
        elif any(section in line for section in skills_section):
            current_section = "skills"
        
        # Count skill mentions in context
        if skill_lower in line:
            if current_section == "professional":
                professional_mentions += 1
            elif current_section == "skills":
                skills_section_mentions += 1
    
    # Score based on context
    if professional_mentions > 0:
        # Professional usage is highly valued
        return min(1.0, 0.7 + (professional_mentions * 0.1))
    elif skills_section_mentions > 0:
        # Just listed in skills section
        return min(0.6, 0.3 + (skills_section_mentions * 0.05))
    else:
        # Skill not found in context
        return 0.0


def calculate_experience_alignment(jd_experience: Optional[float], 
                                 resume_experience_analysis: Dict) -> Tuple[float, Dict]:
    """
    Calculate experience alignment based on years and professional context.
    """
    experience_details = {
        "jd_required": jd_experience,
        "resume_mentioned": resume_experience_analysis["years_mentioned"],
        "context_score": resume_experience_analysis["professional_context"],
        "alignment_reasoning": ""
    }
    
    if jd_experience is None:
        # No experience requirement specified
        experience_score = 0.5 + (resume_experience_analysis["professional_context"] * 0.5)
        experience_details["alignment_reasoning"] = "No specific experience requirement"
    elif resume_experience_analysis["years_mentioned"] == 0:
        # No experience mentioned in resume
        experience_score = 0.2  # Low score
        experience_details["alignment_reasoning"] = "No experience years mentioned in resume"
    else:
        # Calculate experience alignment
        jd_years = jd_experience
        resume_years = resume_experience_analysis["years_mentioned"]
        
        # Experience difference factor
        exp_diff = abs(jd_years - resume_years)
        if exp_diff <= 1:
            exp_factor = 1.0  # Perfect match
        elif exp_diff <= 2:
            exp_factor = 0.8   # Close match
        elif exp_diff <= 3:
            exp_factor = 0.6   # Acceptable difference
        else:
            exp_factor = 0.3   # Significant difference
        
        # Combine with professional context
        experience_score = (exp_factor * 0.7) + (resume_experience_analysis["professional_context"] * 0.3)
        experience_details["alignment_reasoning"] = f"Required: {jd_years} years, Resume: {resume_years} years"
    
    experience_details["final_score"] = experience_score
    return min(1.0, experience_score), experience_details


def calculate_semantic_similarity(jd_text: str, resume_text: str) -> Tuple[float, Dict]:
    """
    Calculate semantic similarity using embeddings.
    """
    try:
        # Generate embeddings
        jd_embedding = compute_semantic_embedding(jd_text[:2000])
        resume_embedding = compute_semantic_embedding(resume_text[:2000])
        
        # Normalize and calculate cosine similarity
        jd_norm = np.linalg.norm(jd_embedding)
        resume_norm = np.linalg.norm(resume_embedding)
        
        if jd_norm > 0 and resume_norm > 0:
            jd_embedding = jd_embedding / jd_norm
            resume_embedding = resume_embedding / resume_norm
            similarity = float(np.dot(jd_embedding, resume_embedding))
            # Map from [-1,1] to [0,1]
            similarity = (similarity + 1) / 2
        else:
            similarity = 0.5
            
        details = {
            "method": "semantic_embedding",
            "raw_similarity": float(similarity),
            "text_length_jd": len(jd_text),
            "text_length_resume": len(resume_text)
        }
        
        return similarity, details
        
    except Exception as e:
        # Fallback to simple text similarity
        jd_words = set(jd_text.lower().split())
        resume_words = set(resume_text.lower().split())
        if jd_words:
            similarity = len(jd_words.intersection(resume_words)) / len(jd_words)
        else:
            similarity = 0.5
            
        return similarity, {
            "method": "keyword_overlap_fallback",
            "raw_similarity": similarity,
            "error": str(e)
        }


def generate_match_explanation(components: List[MatchComponent], 
                             role_compatibility: float,
                             skills_details: Dict,
                             experience_details: Dict,
                             overall_score: float) -> MatchExplanation:
    """
    Generate human-readable explanation for the match result.
    """
    # Determine quality category
    if overall_score >= 0.8:
        quality_category = "Excellent Match"
    elif overall_score >= 0.65:
        quality_category = "Good Match"
    elif overall_score >= 0.4:
        quality_category = "Partial Match"
    else:
        quality_category = "Not Suitable"
    
    # Role analysis
    if role_compatibility >= 0.8:
        role_match = "Strong role alignment - role family and specialization match perfectly"
    elif role_compatibility >= 0.6:
        role_match = "Good role alignment with minor specialization differences"
    elif role_compatibility >= 0.4:
        role_match = "Role family matches but significant specialization mismatch"
    else:
        role_match = "Role family mismatch - different functional areas"
    
    # Skills analysis summary
    skills_summary = {
        "coverage": f"{skills_details.get('coverage', 0)*100:.0f}% of required skills found",
        "context": "Skills used professionally in experience" if skills_details.get('context_score', 0) > 0.6 
                   else "Skills mentioned in skills section",
        "relevant_count": skills_details.get('total_relevant', 0)
    }
    
    # Experience analysis summary
    exp_summary = {
        "alignment": experience_details.get('alignment_reasoning', 'Experience analysis completed'),
        "context_strength": "Strong professional context" if experience_details.get('context_score', 0) > 0.6 
                           else "Limited professional context"
    }
    
    # Generate summary statement
    if overall_score >= 0.7:
        summary = "High compatibility match with strong role alignment and relevant skills experience"
    elif overall_score >= 0.5:
        summary = "Moderate match with acceptable role compatibility and some skill overlap"
    elif overall_score >= 0.3:
        summary = "Low compatibility with role or skill misalignment issues"
    else:
        summary = "Poor match with significant role and skill gaps"
    
    return MatchExplanation(
        overall_score=overall_score,
        quality_category=quality_category,
        components=components,
        role_match=role_match,
        skills_analysis=skills_summary,
        experience_analysis=exp_summary,
        summary=summary
    )


def enhanced_compute_match(jd_text: str, resume_text: str, jd_skills: List[str], 
                          resume_skills: List[str], jd_experience: Optional[float] = None) -> EnhancedMatchResult:
    """
    Compute enhanced enterprise-grade match with detailed explanation.
    """
    # STAGE 1: Role Intent Analysis
    jd_role = classify_role_intent(jd_text)
    resume_role = classify_role_intent(resume_text)
    role_compatibility, _ = compute_role_compatibility(jd_role, resume_role)
    
    # STAGE 2: Extract resume context for experience analysis
    experience_analysis = extract_experience_context(resume_text, jd_experience)
    
    # STAGE 3: Component-based scoring
    components = []
    
    # Role Compatibility (40% weight)
    role_component = MatchComponent(
        name="Role Compatibility",
        score=role_compatibility,
        weight=0.40,
        explanation="Match between job role family and specialization vs resume role",
        details={
            "jd_role": {
                "family": jd_role.role_family,
                "type": jd_role.role_type,
                "tech": jd_role.primary_tech
            },
            "resume_role": {
                "family": resume_role.role_family,
                "type": resume_role.role_type,
                "tech": resume_role.primary_tech
            },
            "compatibility_score": role_compatibility
        }
    )
    components.append(role_component)
    
    # Skill Relevance (30% weight)
    skill_score, skills_details = calculate_skill_relevance(jd_skills, resume_skills, resume_text)
    skill_component = MatchComponent(
        name="Skill Relevance",
        score=skill_score,
        weight=0.30,
        explanation="Relevance and context of skills matching job requirements",
        details=skills_details
    )
    components.append(skill_component)
    
    # Experience Alignment (20% weight)
    experience_score, experience_details = calculate_experience_alignment(jd_experience, experience_analysis)
    experience_component = MatchComponent(
        name="Experience Alignment",
        score=experience_score,
        weight=0.20,
        explanation="Years of experience match and professional context alignment",
        details=experience_details
    )
    components.append(experience_component)
    
    # Semantic Similarity (10% weight)
    semantic_score, semantic_details = calculate_semantic_similarity(jd_text, resume_text)
    semantic_component = MatchComponent(
        name="Semantic Similarity",
        score=semantic_score,
        weight=0.10,
        explanation="Overall text meaning and content alignment",
        details=semantic_details
    )
    components.append(semantic_component)
    
    # STAGE 4: Calculate final weighted score
    weighted_score = sum(comp.score * comp.weight for comp in components)
    
    # Generate explanation
    explanation = generate_match_explanation(
        components=components,
        role_compatibility=role_compatibility,
        skills_details=skills_details,
        experience_details=experience_details,
        overall_score=weighted_score
    )
    
    # Determine matching skills and missing skills
    matching_skills = [s["jd_skill"] for s in skills_details.get("relevant_skills", [])]
    missing_skills = [s for s in jd_skills if s not in matching_skills]
    
    # Extract other entities
    from backend.services.nlp_pipeline import extract_resume_entities
    res_skills, res_exp, res_locations, res_phones, res_emails = extract_resume_entities(resume_text)
    
    # Create enhanced result
    return EnhancedMatchResult(
        original_name="resume.pdf",  # This will be updated by caller
        path="temp/path",           # This will be updated by caller
        match_percentage=round(weighted_score * 100, 2),
        quality_category=explanation.quality_category,
        explanation=explanation,
        matching_skills=matching_skills,
        missing_skills=missing_skills,
        extracted_skills=resume_skills,
        experience_years=experience_analysis["years_mentioned"] or res_exp,
        locations=res_locations,
        phone_numbers=res_phones,
        emails=res_emails,
        role_intent={
            "role_family": resume_role.role_family,
            "role_type": resume_role.role_type,
            "role_specialization": resume_role.role_specialization,
            "primary_tech": resume_role.primary_tech
        },
        is_matched=weighted_score >= 0.4  # Threshold for match qualification
    )


def run_enhanced_batch_matching(job_description: str, resume_items: List[Dict], 
                              jd_skills: List[str], jd_experience: Optional[float] = None) -> List[EnhancedMatchResult]:
    """
    Process multiple resumes with enhanced matching logic.
    """
    results = []
    
    # Extract JD experience requirement
    jd_exp_text = extract_experience_from_jd(job_description)
    if jd_experience is None and jd_exp_text:
        jd_experience = jd_exp_text
    
    for item in resume_items:
        result = enhanced_compute_match(
            jd_text=job_description,
            resume_text=item["text"],
            jd_skills=jd_skills,
            resume_skills=item["skills"],
            jd_experience=jd_experience
        )
        
        # Update result with proper metadata
        result.original_name = item["original_name"]
        result.path = item["path"]
        
        results.append(result)
    
    return results


def extract_experience_from_jd(jd_text: str) -> Optional[float]:
    """
    Extract experience requirement from job description.
    """
    # Look for common experience patterns
    patterns = [
        r'(\d+(?:\.\d+)?)\s*(?:\+)?\s*(?:years?|yrs?)\s*(?:of experience|experience|required)',
        r'(?:minimum|at least|requires?)\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)',
        r'(?:experience[:\s]+)(\d+(?:\.\d+)?)\s*(?:\+)?\s*(?:years?|yrs?)'
    ]
    
    for pattern in patterns:
        match = re.search(pattern, jd_text, re.IGNORECASE)
        if match:
            try:
                return float(match.group(1))
            except ValueError:
                continue
    
    return None


def enhanced_match_to_dict(result: EnhancedMatchResult) -> Dict:
    """
    Convert EnhancedMatchResult to dictionary for JSON serialization.
    """
    return {
        "original_name": result.original_name,
        "path": result.path,
        "match_percentage": result.match_percentage,
        "quality_category": result.quality_category,
        "explanation": {
            "overall_score": result.explanation.overall_score,
            "quality_category": result.explanation.quality_category,
            "components": [
                {
                    "name": comp.name,
                    "score": comp.score,
                    "weight": comp.weight,
                    "explanation": comp.explanation,
                    "details": comp.details
                }
                for comp in result.explanation.components
            ],
            "role_match": result.explanation.role_match,
            "skills_analysis": result.explanation.skills_analysis,
            "experience_analysis": result.explanation.experience_analysis,
            "summary": result.explanation.summary
        },
        "matching_skills": result.matching_skills,
        "missing_skills": result.missing_skills,
        "extracted_skills": result.extracted_skills,
        "experience_years": result.experience_years,
        "locations": result.locations,
        "phone_numbers": result.phone_numbers,
        "emails": result.emails,
        "role_intent": result.role_intent,
        "is_matched": result.is_matched
    }