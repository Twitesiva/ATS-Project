"""POST /match: run parser + NLP + matching, return per-resume results."""
from flask import Blueprint, request, jsonify
import numpy as np
import logging

logger = logging.getLogger(__name__)

bp = Blueprint("match", __name__)


def serialize_for_json(obj):
    """
    Recursively convert NumPy types to Python native types for JSON serialization.
    
    Converts:
    - numpy.float32/float64 → float
    - numpy.int32/int64 → int
    - numpy arrays → list
    - numpy booleans → bool
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


@bp.route("/match", methods=["POST"])
def match():
    """
    Enterprise-grade matching endpoint with multi-stage pipeline.
    
    STAGE 1: Role Intent Classification (Gatekeeper)
    STAGE 2: ANN-based Fast Search (if available)
    STAGE 3: Semantic Role & Skill Matching
    
    Query params:
        - use_enterprise_matching: Enable enterprise pipeline (default: True)
        - use_ann: Enable ANN search (default: True)
        - min_role_compatibility: Role filter threshold 0.0-1.0 (default: 0.65)
    """
    data = request.get_json() or {}
    job_description = (data.get("job_description") or "").strip()
    resume_paths = data.get("resume_paths") or []
    
    # Enterprise pipeline flags
    use_enterprise = data.get("use_enterprise_matching", True)
    use_ann = data.get("use_ann", True)
    min_role_compat = data.get("min_role_compatibility", 0.65)
    # For the matching page, we want to return all resumes (matched and unmatched)
    # Set use_role_gatekeeper=False by default to return all results
    use_role_gatekeeper = data.get("use_role_gatekeeper", False)
    
    if not job_description:
        return jsonify({"error": "Job description is required"}), 400
    if not resume_paths:
        return jsonify({"error": "At least one resume path is required"}), 400
    
    # Import services
    from backend.services.resume_parser import parse_resumes_from_paths
    from backend.services.nlp_pipeline import extract_jd_entities, extract_resume_entities
    from backend.services.matching import compute_location_display
    from backend.services.ann_index import is_ann_available
    from backend.services.enterprise_matching import (
        classify_role_intent,
        run_enterprise_matching,
        match_result_to_dict
    )
    from backend.services.enhanced_matching import run_enhanced_batch_matching, extract_experience_from_jd, enhanced_match_to_dict

    try:
        # Extract JD entities
        jd_skills, jd_locations = extract_jd_entities(job_description)
        
        # STAGE 1: Classify JD Role Intent (always run)
        jd_role = classify_role_intent(job_description)
        print(f"\n[JD ROLE INTENT] {jd_role.role_family} | {jd_role.role_type} | {jd_role.role_specialization} | {jd_role.primary_tech}")
        
        # ENTERPRISE PIPELINE
        if use_enterprise:
            print("\n[ENTERPRISE MATCHING PIPELINE ENABLED]")
            
            # Try ANN first for large batches
            if use_ann and is_ann_available() and len(resume_paths) > 5:
                from backend.services.ann_index import run_ann_matching_enterprise
                
                print("[STAGE 2] Using ANN-based fast search...")
                ann_results = run_ann_matching_enterprise(
                    job_description=job_description,
                    jd_skills=jd_skills,
                    jd_role_intent={
                        "role_type": jd_role.role_type,
                        "role_family": jd_role.role_family,
                        "role_specialization": jd_role.role_specialization,
                        "primary_tech": jd_role.primary_tech
                    },
                    top_k=len(resume_paths),
                    min_role_compatibility=min_role_compat
                )
                
                if ann_results:
                    # Add location display
                    for result in ann_results:
                        result["location_display"] = compute_location_display(
                            jd_locations,
                            result.get("locations", [])
                        )
                    
                    print(f"[STAGE 3] ANN matching complete: {len(ann_results)} results")
                    response = {"results": ann_results, "pipeline": "enterprise_ann"}
                    return jsonify(serialize_for_json(response))
            
            # FALLBACK: Full enterprise pipeline without ANN
            print("[STAGE 2] Parsing resumes...")
            parsed = parse_resumes_from_paths(resume_paths, max_workers=4)
            
            resume_items = []
            for item in parsed:
                res_skills, res_exp, res_locations, res_phones, res_emails = extract_resume_entities(item["text"])
                resume_items.append({
                    "text": item["text"],
                    "original_name": item["original_name"],
                    "path": item["path"],
                    "skills": res_skills,
                    "experience_years": res_exp,
                    "locations": res_locations,
                    "phone_numbers": res_phones,
                    "emails": res_emails,
                })
            
            # Check if enhanced matching is requested
            use_enhanced = data.get("use_enhanced_matching", False)
            
            if use_enhanced:
                print("[STAGE 3] Running ENHANCED enterprise matching...")
                # Extract JD experience requirement
                jd_experience = extract_experience_from_jd(job_description)
                
                enhanced_results = run_enhanced_batch_matching(
                    job_description=job_description,
                    resume_items=resume_items,
                    jd_skills=jd_skills,
                    jd_experience=jd_experience
                )
                
                # Convert enhanced results to API format
                results = [enhanced_match_to_dict(r) for r in enhanced_results]
                print(f"[COMPLETE] Enhanced pipeline: {len(results)} matches")
                response = {"results": results, "pipeline": "enhanced_full"}
                return jsonify(serialize_for_json(response))
            else:
                print("[STAGE 3] Running standard enterprise matching...")
                # Determine if we should apply role gatekeeping or return all resumes
                # By default, for the matching page we want to return all resumes to show matched/unmatched
                # Set use_role_gatekeeper=False to return all resumes regardless of compatibility
                use_role_gatekeeper = data.get("use_role_gatekeeper", False)
                
                match_results = run_enterprise_matching(
                    job_description=job_description,
                    resume_items=resume_items,
                    jd_skills=jd_skills,
                    jd_locations=jd_locations,
                    use_role_gatekeeper=use_role_gatekeeper,
                    min_role_compatibility=min_role_compat
                )
                
                # Convert to API format
                results = [match_result_to_dict(r) for r in match_results]
            
            print(f"[COMPLETE] Enterprise pipeline: {len(results)} matches")
            response = {"results": results, "pipeline": "enterprise_full"}
            return jsonify(serialize_for_json(response))
        
        # LEGACY PIPELINE (fallback)
        else:
            print("\n[LEGACY MATCHING PIPELINE]")
            from backend.services.matching import run_batch_matching
            
            parsed = parse_resumes_from_paths(resume_paths, max_workers=4)
            
            resume_items = []
            for item in parsed:
                res_skills, res_exp, res_locations, res_phones, res_emails = extract_resume_entities(item["text"])
                resume_items.append({
                    "text": item["text"],
                    "original_name": item["original_name"],
                    "path": item["path"],
                    "skills": res_skills,
                    "experience_years": res_exp,
                    "locations": res_locations,
                    "phone_numbers": res_phones,
                    "emails": res_emails,
                })
            
            results = run_batch_matching(
                job_description,
                resume_items,
                jd_skills,
                jd_locations,
                use_semantic_roles=False
            )
            
            response = {"results": results, "pipeline": "legacy"}
            return jsonify(serialize_for_json(response))
            
    except Exception as e:
        import traceback
        import uuid
        error_id = str(uuid.uuid4())[:8]
        logger.error(f"[API ERROR] [{error_id}] Match failure: {e}")
        traceback.print_exc()
        
        # Determine error category for better user feedback
        error_type = type(e).__name__
        message = str(e)
        
        status_code = 500
        if isinstance(e, ValueError):
            status_code = 400
            
        return jsonify({
            "status": "error",
            "error_id": error_id,
            "error_type": error_type,
            "message": message,
            "suggestion": "Please check if the job description and resumes are valid and try again."
        }), status_code
