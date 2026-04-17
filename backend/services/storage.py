"""Supabase storage: insert resumes, fetch with optional filters."""
import json
import re
import os
from datetime import datetime
from backend.services.supabase_client import get_supabase_client
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


def _find_duplicate_resume(emails, phone_numbers):
    """
    Check if a resume with same email or phone number exists in Supabase.
    Returns the resume_id if found, None otherwise.
    """
    supabase = get_supabase_client()
    
    # Check by email first (primary key)
    for email in emails:
        response = supabase.table("resumes").select("resume_id").eq("email", email.lower()).limit(1).execute()
        if response.data and len(response.data) > 0:
            return response.data[0]["resume_id"]
    
    # Check by phone number (fallback)
    for phone in phone_numbers:
        # Normalize phone for comparison (remove + for matching)
        phone_normalized = phone.replace("+", "")
        response = supabase.table("resumes").select("resume_id", "phone_number").execute()
        
        if response.data:
            for record in response.data:
                stored_phone = record.get("phone_number") or ""
                if stored_phone.replace("+", "") == phone_normalized:
                    return record["resume_id"]
    
    return None


def _normalize_phone_for_match(phone):
    """Normalize phone for duplicate matching."""
    return (phone or "").replace("+", "").strip()


def _name_from_filename(filename):
    """
    Derive display name from uploaded filename.
    Examples:
    - `sivabalan.pdf` -> `Sivabalan.pdf`
    - `john_doe.docx` -> `John Doe.docx`
    """
    raw_name = os.path.basename(filename or "").strip()
    if not raw_name:
        return ""
    base, ext = os.path.splitext(raw_name)
    if not base:
        return raw_name
    # Requirement: replace underscores with spaces and capitalize words,
    # while keeping original extension visible in UI.
    pretty_base = re.sub(r"_+", " ", base).strip()
    pretty_base = re.sub(r"\s{2,}", " ", pretty_base).title()
    return f"{pretty_base}{ext.lower()}"


def _is_embedding_column_error(exc):
    msg = str(exc or "").lower()
    return "embedding" in msg and ("pgrst204" in msg or "could not find the 'embedding' column" in msg)


def _safe_upsert_resume(supabase, duplicate_id, data):
    """
    Upsert one resume row.
    If the Supabase schema does not have `embedding`, retry once without it.
    """
    try:
        if duplicate_id:
            return supabase.table("resumes").update(data).eq("resume_id", duplicate_id).execute()
        return supabase.table("resumes").insert(data).execute()
    except Exception as e:
        if "embedding" in data and _is_embedding_column_error(e):
            fallback = dict(data)
            fallback.pop("embedding", None)
            if duplicate_id:
                return supabase.table("resumes").update(fallback).eq("resume_id", duplicate_id).execute()
            return supabase.table("resumes").insert(fallback).execute()
        raise


def store_resumes(resumes):
    """Insert or update resumes in Supabase. Prevents duplicates by email/phone. Returns count stored."""
    supabase = get_supabase_client()

    # PERFORMANCE: Preload existing identifiers once for O(1) duplicate checks.
    existing = supabase.table("resumes").select("resume_id,email,phone_number").execute()
    email_to_resume_id = {}
    phone_to_resume_id = {}
    embedding_supported = True
    for row in (existing.data or []):
        rid = row.get("resume_id")
        if not rid:
            continue
        email = (row.get("email") or "").strip().lower()
        phone = _normalize_phone_for_match(row.get("phone_number"))
        if email:
            email_to_resume_id[email] = rid
        if phone:
            phone_to_resume_id[phone] = rid

    count = 0
    for r in resumes:
        filename_name = _name_from_filename(r.get("original_name"))
        name = filename_name or r.get("name") or "unknown"
        extracted_skills = r.get("extracted_skills") or []
        experience_years = r.get("experience_years")
        location_display = (r.get("location_display") or "").strip()
        locations = [location_display] if location_display else []
        match_percentage = r.get("match_percentage")
        # Prefer a durable URL if provided (e.g. Supabase Storage public/signed URL).
        resume_file_path = r.get("resume_file_url") or r.get("public_url") or r.get("path") or r.get("resume_file_path") or ""
        raw_text = r.get("raw_text") or r.get("text_preview") or ""
        
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
        
        # Determine if resume is matched
        is_matched = r.get("is_matched", True)
        
        # PRODUCTION: Embedding storage
        embedding = r.get("embedding")
        if embedding is not None and hasattr(embedding, "tolist"):
            embedding = embedding.tolist()
            
        uploaded_date = datetime.utcnow().isoformat() + "Z"
        
        # Check for duplicates using preloaded maps.
        duplicate_id = None
        for email in emails:
            key = (email or "").strip().lower()
            if key and key in email_to_resume_id:
                duplicate_id = email_to_resume_id[key]
                break
        if duplicate_id is None:
            for phone in phone_numbers:
                key = _normalize_phone_for_match(phone)
                if key and key in phone_to_resume_id:
                    duplicate_id = phone_to_resume_id[key]
                    break
        
        # Prepare data object
        data = {
            "name": name,
            "email": primary_email,
            "phone_number": primary_phone,
            "extracted_skills": extracted_skills,
            "experience_years": experience_years,
            "locations": locations,
            "match_percentage": match_percentage,
            "resume_file_path": resume_file_path,
            "uploaded_date": uploaded_date,
            "raw_text": raw_text,
            "role_label": role_label,
            "role_type": role_type,
            "role_family": role_family,
            "primary_skill": primary_skill,
            "is_matched": is_matched
        }
        
        # Only add embedding if it exists to prevent PGRST204 errors 
        # when the 'embedding' column hasn't been created in Supabase yet
        if embedding is not None and embedding_supported:
            data["embedding"] = embedding
        
        if duplicate_id:
            # Update existing record
            try:
                _safe_upsert_resume(supabase, duplicate_id, data)
            except Exception as e:
                if _is_embedding_column_error(e):
                    embedding_supported = False
                    data.pop("embedding", None)
                    _safe_upsert_resume(supabase, duplicate_id, data)
                else:
                    raise
            count += 1
            # Keep maps fresh if key values changed.
            if primary_email:
                email_to_resume_id[primary_email.lower()] = duplicate_id
            if primary_phone:
                phone_to_resume_id[_normalize_phone_for_match(primary_phone)] = duplicate_id
        else:
            # Insert new record
            try:
                insert_resp = _safe_upsert_resume(supabase, None, data)
            except Exception as e:
                if _is_embedding_column_error(e):
                    embedding_supported = False
                    data.pop("embedding", None)
                    insert_resp = _safe_upsert_resume(supabase, None, data)
                else:
                    raise
            count += 1
            inserted = (insert_resp.data or [{}])[0]
            new_resume_id = inserted.get("resume_id")
            if new_resume_id:
                if primary_email:
                    email_to_resume_id[primary_email.lower()] = new_resume_id
                if primary_phone:
                    phone_to_resume_id[_normalize_phone_for_match(primary_phone)] = new_resume_id
    
    return count


def fetch_resumes(
    location=None,
    skills=None,
    role_skills=None,
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
    - skills: comma-separated MANUAL SKILLS; skills_mode 'any' or 'all'
    - role_skills: comma-separated ROLE-SPECIFIC SKILLS (used with role_filter)
    - experience_years: minimum years (>=).
    - phone_number: partial or full phone number match.
    
    ENTERPRISE SEMANTIC FILTERS:
    - role_filter: Filter by role type (e.g., "Developer", "Tester")
    - use_semantic_skills: Use embedding-based skill matching instead of keyword
    - semantic_threshold: Minimum similarity for semantic matching (0.0-1.0)
    """
    try:
        # DEBUG: Log function entry
        print(f"[DEBUG] fetch_resumes called with: role_filter={role_filter}, role_skills={role_skills}, skills={skills}, location={location}")

        # Parse role-specific skills (used with role filter)
        role_skills_list = []
        if role_skills:
            for raw in str(role_skills).split(","):
                raw_trimmed = raw.strip()
                normalized = _normalize_skill_for_filter(raw_trimmed)
                if normalized:
                    role_skills_list.append(normalized)
            # De-duplicate while preserving order
            seen = set()
            role_skills_list = [s for s in role_skills_list if not (s in seen or seen.add(s))]
            print(f"[DEBUG] ✓ Parsed role_skills_list({len(role_skills_list)}): {role_skills_list}")
        else:
            print(f"[DEBUG] ✗ No role_skills provided")

        # Parse manual skills filter (separate from role)
        skills_list = []
        if skills:
            for raw in str(skills).split(","):
                raw_trimmed = raw.strip()
                normalized = _normalize_skill_for_filter(raw_trimmed)
                if normalized:
                    skills_list.append(normalized)
            # De-duplicate while preserving order
            seen = set()
            skills_list = [s for s in skills_list if not (s in seen or seen.add(s))]
            print(f"[DEBUG] ✓ Parsed manual skills_list({len(skills_list)}): {skills_list}")
        else:
            print(f"[DEBUG] ✗ No manual skills provided")
        if skills_mode not in ("any", "all"):
            skills_mode = "any"
        
        supabase = get_supabase_client()
        print(f"[DEBUG] Supabase client initialized")
        
        # Build base query
        query = supabase.table("resumes").select("*")
        print(f"[DEBUG] Initial query built")
        
        # Apply location filter (search in raw_text field)
        if location:
            print(f"[DEBUG] Location search: {location}")
            query = query.ilike("raw_text", f"%{location}%")
            print(f"[DEBUG] Applied raw_text location filter")
        
        # Apply phone number filter (partial match on text field)
        if phone_number:
            print(f"[DEBUG] Applying phone_number filter: {phone_number}")
            query = query.ilike("phone_number", f"%{phone_number}%")
            print(f"[DEBUG] Applied phone_number filter")
        
        # Apply experience filter
        if experience_years is not None:
            query = query.gte("experience_years", experience_years)
            print(f"[DEBUG] Applied experience filter: >= {experience_years}")
        
        # Execute query BEFORE applying role filter (so all resumes are fetched first)
        print(f"[DEBUG] Executing base query with location/phone/experience filters...")
        response = query.execute()
        print(f"[DEBUG] Query executed successfully")
        
        # Safely extract rows
        rows = response.data if response else []
        total_resumes = len(rows)
        print(f"[DEBUG] Total resumes from DB: {total_resumes}")

        # Apply role filter (POST-FETCH) with error handling
        # This avoids missing resumes due to missing role_type field
        if role_filter:
            print(f"[DEBUG] Processing role filter: '{role_filter}'")
            print(f"[DEBUG] Resumes before role filter: {len(rows)}")
            
            import re
            role_filter_lower = role_filter.lower().strip()
            
            def _row_matches_role_filter(row):
                """
                Check if resume matches the role filter by checking:
                1. role_type field - must contain ALL filter words (order-independent)
                2. role_family field - must contain ALL filter words (order-independent)
                3. raw_text content (fallback)
                """
                # Split filter into words for exact matching
                filter_words = set(w for w in role_filter_lower.split() if w)
                if not filter_words:
                    return False
                
                # Check role_type - ALL filter words must be present
                role_type = (row.get("role_type") or "").lower()
                if role_type:
                    role_type_words = set(w for w in role_type.split() if w)
                    # All filter words must be in role_type words
                    if filter_words.issubset(role_type_words):
                        print(f"[DEBUG] ROLE MATCH (role_type exact): {row.get('name')} - role_type='{role_type}'")
                        return True
                
                # Check role_family - ALL filter words must be present
                role_family = (row.get("role_family") or "").lower()
                if role_family:
                    role_family_words = set(w for w in role_family.split() if w)
                    if filter_words.issubset(role_family_words):
                        print(f"[DEBUG] ROLE MATCH (role_family exact): {row.get('name')} - role_family='{role_family}'")
                        return True
                
                # Fallback: check raw_text for role keywords (full phrase match)
                raw_text = (row.get("raw_text") or "").lower()
                if role_filter_lower in raw_text:
                    print(f"[DEBUG] ROLE MATCH (raw_text): {row.get('name')}")
                    return True
                
                # No match
                role_type_val = row.get("role_type") or "NULL"
                role_family_val = row.get("role_family") or "NULL"
                print(f"[DEBUG] ROLE NO_MATCH: {row.get('name')} - role_type='{role_type_val}' role_family='{role_family_val}' (needed: {filter_words})")
                return False
            
            before = len(rows)
            rows = [r for r in rows if _row_matches_role_filter(r)]
            after = len(rows)
            print(f"[DEBUG] Role filter '{role_filter_lower}': {before} -> {after} resumes")
        
        if role_skills_list:
            import re
            print(f"[DEBUG] APPLYING ROLE SKILLS FILTER - Looking for ANY of: {role_skills_list}")
            
            matches_found = 0
            
            def _row_matches_role_skills(row):
                nonlocal matches_found
                extracted = row.get("extracted_skills") or []
                if isinstance(extracted, str):
                    try:
                        extracted = json.loads(extracted)
                    except Exception:
                        extracted = []

                normalized_row_skills = set()
                for s in (extracted or []):
                    ns = _normalize_skill_for_filter(s)
                    if ns:
                        normalized_row_skills.add(ns)

                raw_text = (row.get("raw_text") or "").lower()
                resume_name = row.get("name", "Unknown")
                
                # For role skills, use "any" matching - at least ONE role skill should match
                for role_skill in role_skills_list:
                    if role_skill in normalized_row_skills:
                        print(f"[MATCH] Resume '{resume_name}': Found skill '{role_skill}' in extracted_skills")
                        matches_found += 1
                        return True
                    
                    # Also check in raw_text
                    if role_skill in raw_text:
                        print(f"[MATCH] Resume '{resume_name}': Found skill '{role_skill}' in raw_text")
                        matches_found += 1
                        return True
                
                return False

            before = len(rows)
            rows = [r for r in rows if _row_matches_role_skills(r)]
            print(f"[DEBUG] Role skills filter: {before} -> {len(rows)} resumes ({matches_found} matched)")

        # Apply manual skills filter separately and independently
        if skills_list:
            import re  # Import once for the filter operation
            print(f"[DEBUG] Applying MANUAL SKILLS filter: {skills_list}, mode={skills_mode}")
            
            def _row_matches_manual_skills(row):
                extracted = row.get("extracted_skills") or []
                if isinstance(extracted, str):
                    try:
                        extracted = json.loads(extracted)
                    except Exception:
                        extracted = []

                normalized_row_skills = set()
                for s in (extracted or []):
                    ns = _normalize_skill_for_filter(s)
                    if ns:
                        normalized_row_skills.add(ns)

                raw_text = (row.get("raw_text") or "").lower()
                resume_name = row.get("name", "Unknown")

                def has_term(term):
                    """
                    Check if term exists in extracted skills or raw text.
                    Handles multi-word skills like "spring boot" intelligently.
                    """
                    if not term:
                        return False
                    
                    term_normalized = _normalize_skill_for_filter(term)
                    if not term_normalized:
                        return False
                    
                    # 1. Check for exact match in extracted skills
                    if term_normalized in normalized_row_skills:
                        return True
                    
                    # 2. For raw text, check exact phrase match
                    if term_normalized in raw_text:
                        return True
                    
                    # 3. Check partial word matches in raw text using word boundaries
                    pattern = r'\b' + re.escape(term_normalized) + r'\b'
                    if re.search(pattern, raw_text):
                        return True
                    
                    # 4. For multi-word skills, check if all individual words exist
                    if " " in term_normalized:
                        words = [w for w in term_normalized.split() if w]
                        # All words must exist in extracted skills
                        words_matched = sum(1 for word in words if word in normalized_row_skills)
                        if words_matched == len(words):
                            return True
                        
                        # Check if all words appear in raw text with word boundaries
                        all_words_in_text = all(
                            re.search(r'\b' + re.escape(word) + r'\b', raw_text)
                            for word in words
                        )
                        if all_words_in_text:
                            return True
                    
                    return False

                if skills_mode == "all":
                    matches = all(has_term(t) for t in skills_list)
                else:
                    matches = any(has_term(t) for t in skills_list)
                
                return matches

            before = len(rows)
            rows = [r for r in rows if _row_matches_manual_skills(r)]
            print(f"[DEBUG] Manual skills filter applied: {before} -> {len(rows)} (mode={skills_mode})")
        
        result = []
        # BUGFIX: Removed overly-aggressive deduplication by email/phone
        # Multiple candidates can have same contact info (data entry errors, shared contacts, etc.)
        # Let the user see all results and handle deduplication manually if needed
        
        for row in rows:
            try:
                # Handle locations field safely
                locations_list = row.get("locations") or []
                if isinstance(locations_list, str):
                    try:
                        locations_list = json.loads(locations_list)
                    except:
                        locations_list = []
                
                # Normalize resume locations to one of the fixed allowed values, or blank.
                location_display = _match_allowed_location(locations_list)
                
                # Handle email and phone safely
                email = row.get("email") or ""
                phone = row.get("phone_number") or ""
                
                # Handle extracted_skills field safely
                extracted_skills = row.get("extracted_skills") or []
                if isinstance(extracted_skills, str):
                    try:
                        extracted_skills = json.loads(extracted_skills)
                    except:
                        extracted_skills = []
                
                # Build resume item with safe defaults
                item = {
                    "resume_id": row.get("resume_id", ""),
                    "name": row.get("name", "Unknown"),
                    "email": email,
                    "phone_number": phone,
                    "extracted_skills": extracted_skills,
                    "experience_years": row.get("experience_years"),
                    "locations": locations_list,
                    "location_display": location_display,
                    "match_percentage": row.get("match_percentage") or 0,
                    "resume_file_path": row.get("resume_file_path", ""),
                    "uploaded_date": row.get("uploaded_date", ""),
                    "raw_text": row.get("raw_text") or "",
                    "text_preview": row.get("raw_text") or "",
                    "phone_number_display": format_phone_number(phone) if phone else "",
                    # ENTERPRISE: Include role information if available
                    "role_label": row.get("role_label"),
                    "role_type": row.get("role_type"),
                    "role_family": row.get("role_family"),
                    "primary_skill": row.get("primary_skill"),
                    # Include match status
                    "is_matched": bool(row.get("is_matched", True)) if row.get("is_matched") is not None else True,
                }
                result.append(item)
            except Exception as row_error:
                print(f"[WARNING] Failed to process row {row.get('resume_id', 'unknown')}: {row_error}")
                # Continue processing other rows instead of crashing
        
        print(f"[DEBUG] Successfully processed {len(result)} resumes after deduplication")
        print(f"[DEBUG SUMMARY] Filters applied: role={role_filter}, role_skills={bool(role_skills_list)}, manual_skills={bool(skills_list)}, location={location}, phone={phone_number}, exp={experience_years}")
        print(f"[DEBUG SUMMARY] Result: {len(result)} matching resumes")
        return result
        
    except Exception as e:
        print(f"[ERROR] Error in fetch_resumes: {e}")
        import traceback
        traceback.print_exc()
        return []
