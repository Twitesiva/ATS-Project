"""Supabase storage: insert resumes, fetch with optional filters."""
import json
import re
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


def store_resumes(resumes):
    """Insert or update resumes in Supabase. Prevents duplicates by email/phone. Returns count stored."""
    supabase = get_supabase_client()
    
    count = 0
    for r in resumes:
        name = r.get("original_name") or r.get("name") or "unknown"
        extracted_skills = r.get("extracted_skills") or []
        experience_years = r.get("experience_years")
        location_display = (r.get("location_display") or "").strip()
        locations = [location_display] if location_display else []
        match_percentage = r.get("match_percentage")
        resume_file_path = r.get("path") or r.get("resume_file_path") or ""
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
        
        # Check for duplicates
        duplicate_id = _find_duplicate_resume(emails, phone_numbers)
        
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
        if embedding is not None:
            data["embedding"] = embedding
        
        if duplicate_id:
            # Update existing record
            supabase.table("resumes").update(data).eq("resume_id", duplicate_id).execute()
            count += 1
        else:
            # Insert new record
            supabase.table("resumes").insert(data).execute()
            count += 1
    
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
    try:
        # DEBUG: Log function entry
        print(f"[DEBUG] fetch_resumes called with: role_filter={role_filter}, skills={skills}, location={location}")
        
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
        
        # Apply role filter with error handling
        if role_filter:
            print(f"[DEBUG] Processing role filter: '{role_filter}'")
            try:
                search_role = extract_semantic_role_intent(role_filter)
                role_filter_lower = role_filter.lower().strip()
                
                print(f"[DEBUG] Extracted search_role: type={search_role.role_type}, family={search_role.role_family}")
                
                if search_role.role_type and search_role.role_type != "Unknown":
                    query = query.eq("role_type", search_role.role_type)
                    print(f"[DEBUG] Applied exact role_type filter: {search_role.role_type}")
                else:
                    # For general searches, use OR filtering - corrected syntax for new Supabase client
                    if 'tester' in role_filter_lower or 'qa' in role_filter_lower or 'quality' in role_filter_lower:
                        query = query.or_("role_type.eq.Tester,role_family.ilike.%Quality%")
                        print("[DEBUG] Applied Tester/QA filter")
                    elif 'developer' in role_filter_lower or 'engineer' in role_filter_lower:
                        query = query.or_("role_type.in.(Developer,Engineer),role_family.ilike.%Engineering%")
                        print("[DEBUG] Applied Developer/Engineer filter")
                    elif 'data' in role_filter_lower:
                        query = query.or_("role_family.ilike.%Data%,role_type.in.(Analyst,Scientist,Engineer)")
                        print("[DEBUG] Applied Data filter")
                    elif 'analyst' in role_filter_lower:
                        query = query.or_("role_type.eq.Analyst,role_family.ilike.%Analytics%")
                        print("[DEBUG] Applied Analyst filter")
                    elif 'devops' in role_filter_lower:
                        query = query.or_("role_type.eq.Engineer,role_family.ilike.%DevOps%")
                        print("[DEBUG] Applied DevOps filter")
                    elif 'administrator' in role_filter_lower:
                        query = query.or_("role_type.eq.Administrator,role_family.ilike.%Infrastructure%")
                        print("[DEBUG] Applied Administrator filter")
                    else:
                        query = query.or_(f"role_type.ilike.%{role_filter}%,role_family.ilike.%{role_filter}%")
                        print(f"[DEBUG] Applied generic ILIKE filter: {role_filter}")
            except Exception as e:
                print(f"[WARNING] Role filter processing failed: {e}. Continuing without role filter.")
        
        # Execute query
        print(f"[DEBUG] Executing query...")
        response = query.execute()
        print(f"[DEBUG] Query executed successfully")
        
        # Safely extract rows
        rows = response.data if response else []
        print(f"[DEBUG] Rows returned: {len(rows)}")
        
        result = []
        seen_emails = set()
        seen_phones = set()
        
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
                
                # Skip duplicates in search results (keep latest by resume_id)
                if email and email in seen_emails:
                    continue
                if phone and phone in seen_phones:
                    continue
                        
                if email:
                    seen_emails.add(email)
                if phone:
                    seen_phones.add(phone)
                
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
        return result
        
    except Exception as e:
        print(f"[ERROR] Error in fetch_resumes: {e}")
        import traceback
        traceback.print_exc()
        return []
