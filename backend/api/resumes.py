"""GET /fetch-resumes: optional filters. GET /resume-file/<path>: serve original file for preview (Supabase Storage only)."""
import os
import mimetypes
from flask import Blueprint, request, jsonify, Response
from backend.services.storage import fetch_resumes
from backend.config import SUPABASE_RESUME_BUCKET
from backend.services.supabase_client import get_supabase_client
import numpy as np

bp = Blueprint("resumes", __name__)


def serialize_for_json(obj):
    """
    Recursively convert NumPy types to Python native types for JSON serialization.
    """
    if isinstance(obj, dict):
        return {k: serialize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [serialize_for_json(item) for item in obj]
    elif isinstance(obj, tuple):
        return [serialize_for_json(item) for item in obj]
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, (np.float32, np.float64)):
        return float(obj)
    elif isinstance(obj, (np.int32, np.int64)):
        return int(obj)
    elif isinstance(obj, np.bool_):
        return bool(obj)
    else:
        return obj


@bp.route("/resume-file/<path:filename>", methods=["GET"])
def serve_resume_file(filename):
    """Serve a resume file from Supabase Storage for preview. No path traversal."""
    if not filename or ".." in filename or os.path.isabs(filename):
        return jsonify({"error": "Invalid file path"}), 400

    safe_name = os.path.basename(filename)
    guessed_mime, _ = mimetypes.guess_type(safe_name)

    bucket = (SUPABASE_RESUME_BUCKET or "").strip()
    if not bucket:
        return jsonify({"error": "Storage bucket not configured"}), 500

    try:
        supabase = get_supabase_client()
        downloaded = supabase.storage.from_(bucket).download(safe_name)

        if isinstance(downloaded, (bytes, bytearray)):
            data = bytes(downloaded)
        elif hasattr(downloaded, "read"):
            data = downloaded.read()
        else:
            data = bytes(downloaded)

        return Response(data, mimetype=guessed_mime or "application/octet-stream")
    except Exception as e:
        return jsonify({"error": f"File not found: {e}"}), 404


@bp.route("/fetch-resumes", methods=["GET"])
@bp.route("/resumes", methods=["GET"])
def fetch():
    """
    Fetch resumes with filters.
    
    Standard filters:
    - location: substring match
    - skills: comma-separated list
    - skills_mode: 'any' or 'all'
    - experience_years: minimum years
    - phone_number: partial match
    
    Enterprise semantic filters:
    - role_filter: Filter by role type (e.g., "Developer", "Tester")
    - primary_skill: Filter by primary skill (e.g., "Python", "Java")
    - use_semantic_skills: 'true' to use embedding-based skill matching
    - semantic_threshold: Similarity threshold 0.0-1.0 (default: 0.75)
    - strict_role_skill_match: 'true' for strict role+skill gating (prevents "Python Developer" matching "Java Developer")
    """
    # DEBUG: Log request
    print(f"[API DEBUG] GET /api/fetch-resumes request received")
    print(f"[API DEBUG] Query params: {request.args.to_dict()}")
    
    location = (request.args.get("location") or "").strip()
    skills_str = (request.args.get("skills") or "").strip()
    role_skills_str = (request.args.get("role_skills") or "").strip()  # NEW: Role-specific skills
    skills_mode = (request.args.get("skills_mode") or "any").strip().lower()
    if skills_mode not in ("any", "all"):
        skills_mode = "any"
    experience = request.args.get("experience_years", type=float)
    phone_number = (request.args.get("phone_number") or "").strip()
    
    # ENTERPRISE: Semantic filter parameters
    role_filter = (request.args.get("role_filter") or "").strip()
    primary_skill_filter = (request.args.get("primary_skill") or "").strip()
    use_semantic_skills = request.args.get("use_semantic_skills", "false").lower() == "true"
    semantic_threshold = request.args.get("semantic_threshold", type=float, default=0.75)
    use_strict_role_skill_match = request.args.get("strict_role_skill_match", "false").lower() == "true"
    
    print(f"[API DEBUG] Parsed filters: location={location}, skills={skills_str}, role_skills={role_skills_str}, role={role_filter}")
    
    try:
        rows = fetch_resumes(
            location=location or None,
            skills=skills_str or None,
            role_skills=role_skills_str or None,  # NEW: Pass role skills separately
            skills_mode=skills_mode,
            experience_years=experience,
            phone_number=phone_number or None,
            # Enterprise filters
            role_filter=role_filter or None,
            primary_skill_filter=primary_skill_filter or None,
            use_semantic_skills=use_semantic_skills,
            semantic_threshold=semantic_threshold,
            use_strict_role_skill_match=use_strict_role_skill_match
        )
        print(f"[API DEBUG] fetch_resumes returned {len(rows)} resumes")
        
        response = {
            "resumes": rows,
            "filters_applied": {
                "semantic_mode": use_semantic_skills,
                "role_filter": role_filter or None
            }
        }
        print(f"[API DEBUG] Returning response with {len(rows)} resumes")
        return jsonify(serialize_for_json(response))
    except Exception as e:
        import traceback
        print(f"[API ERROR] Fetch resumes error: {e}")
        print(f"[API ERROR] Traceback: {traceback.format_exc()}")
        return jsonify({
            "resumes": [],
            "error": str(e),
            "details": traceback.format_exc()
        }), 200
