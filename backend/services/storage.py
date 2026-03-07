"""SQLite storage: insert resumes, fetch with optional filters."""
import json
from datetime import datetime

from backend.models.schema import get_db
from backend.services.nlp_pipeline import _normalize_skill as _normalize_skill_for_filter, format_phone_number, extract_phone_numbers, extract_emails
from backend.services.enterprise_matching import extract_semantic_role_intent

# Large alias map: lowercase alias -> canonical display value.
# Only the canonical values appear in the UI and filters.
# FILTER CLEANUP – NON-BREAKING CHANGE: Removed broad and work-mode location aliases (India, Pan India, Bharat, Remote, Hybrid, Onsite)
_LOCATION_ALIAS_MAP = {
    # States / regions
    "karnataka": "Karnataka",
    "tamil nadu": "Tamil Nadu",
    "tamilnadu": "Tamil Nadu",
    "maharashtra": "Maharashtra",
    "telangana": "Telangana",
    "andhra pradesh": "Andhra Pradesh",
    "kerala": "Kerala",
    "delhi": "Delhi",
    "uttar pradesh": "Uttar Pradesh",
    "haryana": "Haryana",
    "west bengal": "West Bengal",
    "gujarat": "Gujarat",
    "rajasthan": "Rajasthan",
    "madhya pradesh": "Madhya Pradesh",
    "odisha": "Odisha",
    "orissa": "Odisha",
    "punjab": "Punjab",
    "chhattisgarh": "Chhattisgarh",
    "jharkhand": "Jharkhand",
    "bihar": "Bihar",
    "assam": "Assam",
    "uttarakhand": "Uttarakhand",
    "himachal pradesh": "Himachal Pradesh",

    # Metro / city groups
    "bangalore": "Bangalore",
    "bengaluru": "Bangalore",

    "chennai": "Chennai",

    "hyderabad": "Hyderabad",

    "pune": "Pune",

    "mumbai": "Mumbai",
    "navi mumbai": "Navi Mumbai",

    "delhi ncr": "Delhi NCR",
    "ncr": "Delhi NCR",

    "kolkata": "Kolkata",

    "ahmedabad": "Ahmedabad",

    # Delhi NCR cities
    "noida": "Noida",
    "greater noida": "Greater Noida",
    "gurgaon": "Gurgaon",
    "gurugram": "Gurgaon",
    "faridabad": "Faridabad",
    "ghaziabad": "Ghaziabad",

    # Karnataka cities
    "mysore": "Mysore",
    "mysuru": "Mysore",
    "mangalore": "Mangalore",
    "mangaluru": "Mangalore",
    "hubli": "Hubli",
    "hubballi": "Hubli",
    "belgaum": "Belgaum",
    "belagavi": "Belgaum",
    "tumkur": "Tumkur",
    "davangere": "Davangere",

    # Tamil Nadu cities
    "coimbatore": "Coimbatore",
    "trichy": "Trichy",
    "tiruchirappalli": "Tiruchirappalli",
    "madurai": "Madurai",
    "salem": "Salem",
    "erode": "Erode",
    "vellore": "Vellore",
    "hosur": "Hosur",
    "tirunelveli": "Tirunelveli",
    "thoothukudi": "Thoothukudi",

    # Kerala cities
    "kochi": "Kochi",
    "cochin": "Kochi",
    "trivandrum": "Trivandrum",
    "thiruvananthapuram": "Thiruvananthapuram",
    "kozhikode": "Kozhikode",
    "calicut": "Kozhikode",
    "thrissur": "Thrissur",

    # Maharashtra cities
    "thane": "Thane",
    "nagpur": "Nagpur",
    "nashik": "Nashik",
    "aurangabad": "Aurangabad",
    "kolhapur": "Kolhapur",
    "solapur": "Solapur",

    # Telangana / Andhra cities
    "warangal": "Warangal",
    "karimnagar": "Karimnagar",
    "visakhapatnam": "Visakhapatnam",
    "vizag": "Visakhapatnam",
    "vijayawada": "Vijayawada",
    "guntur": "Guntur",
    "nellore": "Nellore",

    # MP cities
    "indore": "Indore",
    "bhopal": "Bhopal",

    # Rajasthan cities
    "jaipur": "Jaipur",
    "udaipur": "Udaipur",

    # Odisha cities
    "bhubaneswar": "Bhubaneswar",
    "cuttack": "Cuttack",

    # Punjab / Chandigarh
    "chandigarh": "Chandigarh",
    "mohali": "Mohali",

    # Bihar
    "patna": "Patna",

    # UP cities
    "lucknow": "Lucknow",
    "kanpur": "Kanpur",

    # Chhattisgarh
    "raipur": "Raipur",

    # Jharkhand
    "ranchi": "Ranchi",

    # Uttarakhand
    "dehradun": "Dehradun",

    # Assam
    "guwahati": "Guwahati",
}


def _normalize_location(value: str) -> str:
    return (value or "").strip().lower()


def _match_allowed_location(locations_list):
    """
    Given a list of raw resume locations, return the first canonical location
    (via _LOCATION_ALIAS_MAP) that matches case-insensitively.
    Longer aliases are checked first so that more specific matches (e.g.
    \"navi mumbai\") win over generic ones (\"mumbai\").
    Returns empty string if nothing matches.
    """
    if not locations_list:
        return ""

    # Pre-sort aliases by length (descending) so more specific aliases match first.
    alias_items = sorted(
        _LOCATION_ALIAS_MAP.items(),
        key=lambda kv: len(kv[0]),
        reverse=True,
    )

    for raw in locations_list:
        raw_norm = _normalize_location(raw)
        if not raw_norm:
            continue
        for alias, canonical in alias_items:
            if alias in raw_norm:
                return canonical
    return ""


def _find_duplicate_resume(conn, emails, phone_numbers):
    """
    Check if a resume with same email or phone number exists.
    Returns the resume_id if found, None otherwise.
    """
    # Check by email first (primary key)
    for email in emails:
        row = conn.execute(
            "SELECT resume_id FROM resumes WHERE email = ? LIMIT 1",
            (email.lower(),)
        ).fetchone()
        if row:
            return row["resume_id"]
    
    # Check by phone number (fallback)
    for phone in phone_numbers:
        # Normalize phone for comparison (remove + for matching)
        phone_normalized = phone.replace("+", "")
        row = conn.execute(
            "SELECT resume_id FROM resumes WHERE REPLACE(phone_number, '+', '') = ? LIMIT 1",
            (phone_normalized,)
        ).fetchone()
        if row:
            return row["resume_id"]
    
    return None


def store_resumes(resumes):
    """Insert or update resumes in the table. Prevents duplicates by email/phone. Returns count stored."""
    conn = get_db()
    
    # Check if role columns exist
    cursor = conn.execute("PRAGMA table_info(resumes)")
    columns = {row["name"] for row in cursor.fetchall()}
    has_role_columns = "role_type" in columns and "primary_skill" in columns
    
    count = 0
    for r in resumes:
        name = r.get("original_name") or r.get("name") or "unknown"
        extracted_skills = json.dumps(r.get("extracted_skills") or [])
        experience_years = r.get("experience_years")
        location_display = (r.get("location_display") or "").strip()
        locations = json.dumps([location_display]) if location_display else json.dumps([])
        match_percentage = r.get("match_percentage")
        resume_file_path = r.get("path") or r.get("resume_file_path") or ""
        raw_text = r.get("raw_text") or ""
        
        # ENTERPRISE: Extract role and primary skill info
        role_label = r.get("role_label") or ""
        role_type = r.get("role_type") or ""
        role_family = r.get("role_family") or ""
        primary_skill = r.get("primary_skill") or ""
        
        # Extract phone and email for duplicate checking
        phone_numbers = r.get("phone_numbers") or []
        emails = r.get("emails") or []
        
        # Primary phone for storage (first one found)
        primary_phone = phone_numbers[0] if phone_numbers else None
        primary_email = emails[0] if emails else None
        
        # Determine if resume is matched (default to True for backward compatibility)
        is_matched = r.get("is_matched", True)
        
        uploaded_date = datetime.utcnow().isoformat() + "Z"
        
        # Check for duplicates
        duplicate_id = _find_duplicate_resume(conn, emails, phone_numbers)
        
        if duplicate_id:
            # Update existing record
            if has_role_columns:
                conn.execute(
                    """UPDATE resumes 
                       SET name = ?, email = ?, phone_number = ?, extracted_skills = ?, 
                           experience_years = ?, locations = ?, match_percentage = ?, 
                           resume_file_path = ?, uploaded_date = ?, raw_text = ?,
                           role_label = ?, role_type = ?, role_family = ?, primary_skill = ?,
                           is_matched = ?
                       WHERE resume_id = ?""",
                    (name, primary_email, primary_phone, extracted_skills, experience_years, 
                     locations, match_percentage, resume_file_path, uploaded_date, raw_text,
                     role_label, role_type, role_family, primary_skill, is_matched, duplicate_id),
                )
            else:
                conn.execute(
                    """UPDATE resumes 
                       SET name = ?, email = ?, phone_number = ?, extracted_skills = ?, 
                           experience_years = ?, locations = ?, match_percentage = ?, 
                           resume_file_path = ?, uploaded_date = ?, raw_text = ?,
                           is_matched = ?
                       WHERE resume_id = ?""",
                    (name, primary_email, primary_phone, extracted_skills, experience_years, 
                     locations, match_percentage, resume_file_path, uploaded_date, raw_text, is_matched, duplicate_id),
                )
        else:
            # Insert new record
            if has_role_columns:
                conn.execute(
                    """INSERT INTO resumes (name, email, phone_number, extracted_skills, experience_years, 
                           locations, match_percentage, resume_file_path, uploaded_date, raw_text,
                           role_label, role_type, role_family, primary_skill, is_matched)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (name, primary_email, primary_phone, extracted_skills, experience_years, 
                     locations, match_percentage, resume_file_path, uploaded_date, raw_text,
                     role_label, role_type, role_family, primary_skill, is_matched),
                )
            else:
                conn.execute(
                    """INSERT INTO resumes (name, email, phone_number, extracted_skills, experience_years, 
                           locations, match_percentage, resume_file_path, uploaded_date, raw_text, is_matched)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (name, primary_email, primary_phone, extracted_skills, experience_years, 
                     locations, match_percentage, resume_file_path, uploaded_date, raw_text, is_matched),
                )
        count += 1
    conn.commit()
    conn.close()
    return count


def fetch_resumes(
    location=None,
    skills=None,
    skills_mode="any",
    experience_years=None,
    phone_number=None,
    role_filter=None,
    primary_skill_filter=None,
    use_semantic_skills=False,
    semantic_threshold=0.75,
    use_strict_role_skill_match=False
):
    """
    Fetch resumes with optional filters. Returns list of dicts with keys matching schema.
    
    STANDARD FILTERS:
    - location: substring match in locations JSON.
    - skills: comma-separated; skills_mode 'any' or 'all'.
    - experience_years: minimum years (>=).
    - phone_number: partial or full phone number match.
    
    ENTERPRISE SEMANTIC FILTERS:
    - role_filter: Filter by role type (e.g., "Developer", "Tester")
    - use_semantic_skills: Use embedding-based skill matching instead of keyword
    - semantic_threshold: Minimum similarity for semantic matching (0.0-1.0)
    """
    conn = get_db()
    
    # Check if role columns exist
    cursor = conn.execute("PRAGMA table_info(resumes)")
    columns = {row["name"] for row in cursor.fetchall()}
    has_role_columns = "role_label" in columns and "role_type" in columns
    
    query = """SELECT resume_id, name, email, phone_number, extracted_skills, 
                      experience_years, locations, match_percentage, 
                      resume_file_path, uploaded_date, raw_text"""
    
    # Add role columns if they exist
    if has_role_columns:
        query += ", role_label, role_type, role_family, primary_skill"
    else:
        query += ", NULL as role_label, NULL as role_type, NULL as role_family, NULL as primary_skill"
    
    # Add is_matched column if it exists
    cursor = conn.execute("PRAGMA table_info(resumes)")
    columns = {row["name"] for row in cursor.fetchall()}
    if "is_matched" in columns:
        query += ", is_matched"
    else:
        query += ", 1 as is_matched"  # Default to True for backward compatibility
    
    query += " FROM resumes WHERE 1=1"
    params = []

    if experience_years is not None:
        query += " AND (experience_years IS NOT NULL AND experience_years >= ?)"
        params.append(experience_years)
    
    # ENTERPRISE: Refined Role-based filtering with contextual awareness
    # Updated to use semantic role matching with proper role family separation
    if role_filter and has_role_columns:
        import re
        from backend.services.enterprise_matching import classify_role_intent, compute_role_compatibility
        from backend.services.role_intent import compute_role_similarity
        
        # Parse the role filter to identify intent using semantic understanding
        role_filter_lower = role_filter.lower().strip()
        
        # Classify the search role intent using enhanced semantic understanding
        search_role = extract_semantic_role_intent(role_filter)
        
        # Database-level filtering for performance (first stage gate)
        if search_role.role_type and search_role.role_type != "Unknown":
            # Filter by role type family to avoid cross-family matches
            query += " AND role_type = ?"
            params.append(search_role.role_type)
        else:
            # For general searches, match based on role_family or role_type
            role_type_pattern = role_filter_lower
            if 'tester' in role_type_pattern or 'qa' in role_type_pattern or 'quality' in role_type_pattern:
                query += " AND (role_type = 'Tester' OR role_family LIKE '%Quality%')"
                params.extend([f'%Tester%', f'%Quality%'])
            elif 'developer' in role_type_pattern or 'engineer' in role_type_pattern:
                query += " AND (role_type = 'Developer' OR role_type = 'Engineer' OR role_family LIKE '%Engineering%')"
            elif 'data' in role_type_pattern:
                query += " AND (role_family LIKE '%Data%' OR role_type IN ('Analyst', 'Scientist', 'Engineer'))"
            elif 'analyst' in role_type_pattern:
                query += " AND (role_type = 'Analyst' OR role_family LIKE '%Analytics%')"
            elif 'devops' in role_type_pattern:
                query += " AND (role_type = 'Engineer' OR role_family LIKE '%DevOps%')"
            elif 'administrator' in role_type_pattern:
                query += " AND (role_type = 'Administrator' OR role_family LIKE '%Infrastructure%')"
            else:
                # Fallback - broader search but still family-aware
                query += " AND (role_type LIKE ? OR role_family LIKE ?)"
                params.extend([f'%{role_filter}%', f'%{role_filter}%'])

    cursor = conn.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    result = []
    seen_emails = set()
    seen_phones = set()
    
    for row in rows:
        locations_list = json.loads(row["locations"]) if row["locations"] else []
        # Normalize resume locations to one of the fixed allowed values, or blank.
        location_display = _match_allowed_location(locations_list)
        
        email = row["email"] or ""
        phone = row["phone_number"] or ""
        
        # Skip duplicates in search results (keep latest by resume_id)
        if email and email in seen_emails:
            continue
        if phone and phone in seen_phones:
            continue
            
        if email:
            seen_emails.add(email)
        if phone:
            seen_phones.add(phone)
        
        item = {
            "resume_id": row["resume_id"],
            "name": row["name"],
            "email": email,
            "phone_number": phone,
            "extracted_skills": json.loads(row["extracted_skills"]) if row["extracted_skills"] else [],
            "experience_years": row["experience_years"],
            "locations": locations_list,
            "location_display": location_display,
            "match_percentage": row["match_percentage"],
            "resume_file_path": row["resume_file_path"],
            "uploaded_date": row["uploaded_date"],
            "raw_text": row["raw_text"] or "",
            "phone_number_display": format_phone_number(phone) if phone else "",
            # ENTERPRISE: Include role information if available
            "role_label": row["role_label"] if row["role_label"] else None,
            "role_type": row["role_type"] if row["role_type"] else None,
            "role_family": row["role_family"] if row["role_family"] else None,
            "primary_skill": row["primary_skill"] if row["primary_skill"] else None,
            # Include match status
            "is_matched": bool(row["is_matched"]) if row["is_matched"] is not None else True,
        }
        result.append(item)

    # ENTERPRISE: Semantic skill filtering
    # Uses embedding-based similarity instead of keyword matching
    if skills and use_semantic_skills:
        from backend.services.enterprise_matching import compute_skill_semantic_similarity
        
        raw_parts = [p.strip() for p in skills.split(",") if p and p.strip()]
        
        if raw_parts:
            filtered = []
            for item in result:
                res_skills = item.get("extracted_skills") or []
                
                # Compute semantic similarity between filter skills and resume skills
                similarity, matching, missing = compute_skill_semantic_similarity(
                    raw_parts, res_skills
                )
                
                # Check if similarity meets threshold
                if skills_mode == "all":
                    # All filter skills must have a match above threshold
                    if len(missing) == 0 and similarity >= semantic_threshold:
                        item["semantic_skill_match"] = round(similarity * 100, 2)
                        filtered.append(item)
                else:
                    # Any skill match above threshold
                    if similarity >= semantic_threshold:
                        item["semantic_skill_match"] = round(similarity * 100, 2)
                        filtered.append(item)
            
            result = filtered
    
    # STANDARD: Keyword-based skills filter (fallback)
    elif skills:
        raw_parts = [p for p in skills.split(",") if p and p.strip()]
        skill_list = []
        for part in raw_parts:
            norm = _normalize_skill_for_filter(part)
            if norm:
                skill_list.append(norm)

        if skill_list:
            def _matches_any(user_skill: str, resume_skills: list[str]) -> bool:
                """
                Return True if the user-entered skill matches any resume skill.

                Rules (all on normalized, lowercase strings):
                - Exact match: user_skill == resume_skill
                - Sensible partials: user_skill is a substring of resume_skill or
                  vice versa (e.g. "html" vs "html5", "html/css").
                """
                for rs in resume_skills:
                    if user_skill == rs:
                        return True
                    if user_skill in rs or rs in user_skill:
                        return True
                return False

            filtered = []
            for item in result:
                raw_res_skills = item.get("extracted_skills") or []
                res_skills = []
                for s in raw_res_skills:
                    norm = _normalize_skill_for_filter(s)
                    if norm:
                        res_skills.append(norm)

                if skills_mode == "all":
                    if all(_matches_any(sk, res_skills) for sk in skill_list):
                        filtered.append(item)
                else:
                    if any(_matches_any(sk, res_skills) for sk in skill_list):
                        filtered.append(item)
            result = filtered

    # Location filter: match the user-entered location text directly against
    # the full resume text (raw_text), case-insensitive. If location is empty,
    # do not filter by location at all.
    if location:
        loc_lower = location.strip().lower()
        if loc_lower:
            result = [
                item
                for item in result
                if loc_lower in (item.get("raw_text") or "").lower()
            ]

    # Phone number filter: partial or full match against stored phone number
    if phone_number:
        phone_query = phone_number.strip()
        if phone_query:
            result = [
                item
                for item in result
                if phone_query in (item.get("phone_number") or "")
            ]

    # ENTERPRISE: CONTEXT-AWARE ROLE + SKILL MATCHING (INTELLIGENT GATES)
    # This ensures accurate matching while avoiding false positives/negatives
    if use_strict_role_skill_match and (role_filter or primary_skill_filter):
        from backend.services.enterprise_matching import classify_role_intent, compute_role_compatibility
        from backend.services.role_intent import compute_role_similarity, extract_role_context
        
        # Classify the search role intent using enhanced semantic understanding
        search_role = extract_semantic_role_intent(role_filter or "")
        
        # AUTO-DETECTION: Determine search mode (improved logic)
        # MODE 1: Role-only search - when user enters broad role terms without specific tech
        # MODE 2: Role+tech search - when specific technology is mentioned
        is_role_only_search = (
            search_role.primary_tech == "General" or 
            search_role.primary_tech == "Unknown" or
            search_role.role_type == "Unknown" or  # Broad terms like "tester", "qa"
            search_role.confidence < 0.5  # Low confidence = likely broad search
        )
        
        # MODE-SPECIFIC THRESHOLDS
        if is_role_only_search:
            # MODE 1: ROLE-ONLY SEARCH - More permissive thresholds
            # Lower threshold to include more relevant candidates within role family
            role_compatibility_threshold = 0.4  # Lowered from 0.5
            require_skill_dominance = False     # Don't require tech dominance
        else:
            # MODE 2: ROLE + TECHNOLOGY SEARCH - Strict thresholds
            role_compatibility_threshold = 0.6  # Higher threshold for specific requirements
            require_skill_dominance = True      # Require tech dominance
        
        filtered = []
        rejected_candidates = []  # Store candidates that failed initial filtering for recovery consideration
        
        for item in result:
            raw_text = item.get("raw_text", "")
            title = item.get("role_label", "")
            
            # Extract resume role intent using enhanced semantic understanding
            resume_role = extract_semantic_role_intent(raw_text)
            
            # Compute role compatibility using semantic matching
            compatibility_score, reason = compute_role_compatibility(search_role, resume_role)
            
            # Context-aware skill dominance check (only for MODE 2)
            skill_match_confident = True
            if require_skill_dominance and search_role.primary_tech and search_role.primary_tech != "General":
                # Check if the primary skill appears in key sections (experience, projects)
                # rather than just skills list
                skill_lower = search_role.primary_tech.lower()
                text_lower = raw_text.lower()
                
                # Look for skill in experience section (high priority)
                experience_sections = re.split(r'(?:experience|work history|employment)', text_lower, flags=re.IGNORECASE)
                experience_text = experience_sections[1] if len(experience_sections) > 1 else ""
                
                # Look for skill in project sections (high priority)
                project_sections = re.split(r'(?:projects|portfolio)', text_lower, flags=re.IGNORECASE)
                project_text = project_sections[1] if len(project_sections) > 1 else ""
                
                # Count mentions in high-priority sections vs skills section
                high_priority_text = experience_text + " " + project_text
                skills_section = ""
                if "skills:" in text_lower:
                    skills_split = text_lower.split("skills:", 1)
                    if len(skills_split) > 1:
                        skills_section = skills_split[1].split("\n", 1)[0]
                
                high_priority_mentions = len(re.findall(rf'\b{re.escape(skill_lower)}\b', high_priority_text))
                skills_mentions = len(re.findall(rf'\b{re.escape(skill_lower)}\b', skills_section))
                
                # Skill dominance rule: must appear more in high-priority sections
                # or have significant presence overall
                if high_priority_mentions == 0 and skills_mentions > 0:
                    # Skill only in skills section - not dominant
                    skill_match_confident = False
                elif high_priority_mentions + skills_mentions < 2:
                    # Very limited mentions - not confident
                    skill_match_confident = False
            
            # Apply intelligent filtering with mode-specific logic
            passes_filter = (
                compatibility_score >= role_compatibility_threshold and  # Mode-specific threshold
                (skill_match_confident or not require_skill_dominance) and  # Only check skill dominance in MODE 2
                resume_role.role_type != "Unknown"  # Valid role classification
            )
            
            # Add detailed matching info for debugging
            item["_role_matching"] = {
                "search_mode": "ROLE-ONLY" if is_role_only_search else "ROLE+TECH",
                "search_role": {
                    "type": search_role.role_type,
                    "family": search_role.role_family,
                    "primary_tech": search_role.primary_tech,
                    "specialization": search_role.role_specialization,
                    "confidence": round(search_role.confidence, 2),
                    "semantic_analysis": "enhanced"  # Indicates semantic role understanding is active
                },
                "resume_role": {
                    "type": resume_role.role_type,
                    "family": resume_role.role_family,
                    "primary_tech": resume_role.primary_tech,
                    "specialization": resume_role.role_specialization,
                    "confidence": round(resume_role.confidence, 2)
                },
                "compatibility_score": round(compatibility_score, 2),
                "skill_match_confident": skill_match_confident,
                "passes_filter": passes_filter,
                "threshold_used": role_compatibility_threshold,
                "skill_dominance_required": require_skill_dominance
            }
            
            if passes_filter:
                filtered.append(item)
            else:
                # Store rejected candidates for potential recovery
                rejected_candidates.append({
                    "item": item,
                    "compatibility_score": compatibility_score,
                    "reason": reason,
                    "resume_role": resume_role
                })
                mode_text = "ROLE-ONLY" if is_role_only_search else "ROLE+TECH"
                item["_rejection_reason"] = f"Mode: {mode_text}, Role compatibility: {compatibility_score:.2f}, Skill dominance: {skill_match_confident}, {reason}"
                # Debug logging
                print(f"  [FILTER REJECTED] {item.get('name', 'Unknown')}: {item['_rejection_reason']}")
        
        # ROLE FAMILY RECOVERY LAYER
        # Apply recovery logic for role-only searches to prevent under-matching
        if is_role_only_search and rejected_candidates:
            recovery_threshold = max(0.3, role_compatibility_threshold - 0.15)  # 15% more lenient for recovery
            recovered_count = 0
            
            print(f"  [RECOVERY] Attempting role family recovery with threshold: {recovery_threshold:.2f}")
            
            for candidate in rejected_candidates:
                item = candidate["item"]
                resume_role = candidate["resume_role"]
                original_score = candidate["compatibility_score"]
                
                # ROLE FAMILY RECOVERY RULES:
                # 1. Must belong to SAME role family
                # 2. Role intent evident in strong sections (experience, projects, summary)
                # 3. Score close to threshold (within recovery range)
                # 4. NOT different role family
                # 5. NOT conflicting primary role intent
                
                can_recover = (
                    search_role.role_family != "Unknown" and
                    resume_role.role_family != "Unknown" and
                    search_role.role_family == resume_role.role_family and  # SAME role family
                    original_score >= recovery_threshold and  # Close to threshold
                    resume_role.role_type != "Unknown" and  # Valid role type
                    "family mismatch" not in candidate["reason"].lower() and  # No family conflicts
                    "unidentified role family" not in candidate["reason"].lower()  # Valid classification
                )
                
                if can_recover:
                    # Apply small penalty for recovered matches (5-10%)
                    recovered_score = max(0.35, original_score - 0.08)  # 8% penalty
                    
                    # Update item with recovery info
                    item["_role_matching"]["recovered_match"] = True
                    item["_role_matching"]["original_score"] = round(original_score, 2)
                    item["_role_matching"]["recovered_score"] = round(recovered_score, 2)
                    item["_role_matching"]["recovery_reason"] = "Role family recovery applied"
                    item["_role_matching"]["compatibility_score"] = round(recovered_score, 2)
                    
                    # Add to filtered results with recovered score
                    filtered.append(item)
                    recovered_count += 1
                    
                    print(f"  [RECOVERED] {item.get('name', 'Unknown')}: {resume_role.role_family} | Score: {original_score:.2f} → {recovered_score:.2f}")
            
            if recovered_count > 0:
                print(f"  [RECOVERY COMPLETE] Recovered {recovered_count} candidates for role family: {search_role.role_family}")
        
        result = filtered

    return result
