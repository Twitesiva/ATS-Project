"""POST /upload: accept job_description + 1-8 resume files, save files, return paths."""
from flask import Blueprint, request, jsonify
from backend.config import UPLOAD_FOLDER
from backend.utils.validation import validate_upload
import os
import uuid

# EXTENSION – SAFE TO REMOVE: Import JD extraction utility
from backend.utils.jd_extractor import extract_jd_text

bp = Blueprint("upload", __name__)


@bp.route("/upload", methods=["POST"])
def upload():
    # EXTENSION – SAFE TO REMOVE: JD file upload support
    # Get JD text from form (traditional method)
    job_description = request.form.get("job_description", "").strip()
    
    # EXTENSION – SAFE TO REMOVE: Check for JD file upload
    jd_file = request.files.get("jd_file")
    
    # EXTENSION – SAFE TO REMOVE: Validation - mutual exclusion
    has_jd_text = bool(job_description)
    has_jd_file = jd_file and jd_file.filename
    
    if has_jd_text and has_jd_file:
        return jsonify({"error": "Please provide JD as either text OR file, not both"}), 400
    
    # EXTENSION – SAFE TO REMOVE: Extract text from JD file if provided
    if has_jd_file:
        success, result = extract_jd_text(jd_file)
        if not success:
            return jsonify({"error": result}), 400
        job_description = result
    
    # Original validation continues with final job_description string
    files = request.files.getlist("resumes") or request.files.getlist("resumes[]")
    valid, err = validate_upload(job_description, files)
    if not valid:
        return jsonify({"error": err or "Please upload Job Description and Resume"}), 400
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    
    # PERFORMANCE ARCHITECTURE – CRITICAL: Import batch processing functions
    from backend.services.ann_index import init_ann_index, add_resume_to_index
    from backend.services.nlp_pipeline import extract_resume_entities
    from backend.services.resume_parser import parse_resumes_from_paths
    from backend.services.batch_optimizer import clear_request_caches
    
    # Initialize ANN index if needed
    init_ann_index()
    
    # PERFORMANCE OPTIMIZATION – CRITICAL: Batch save all files first
    resume_paths = []
    for f in files:
        ext = f.filename.rsplit(".", 1)[-1].lower()
        unique_name = f"{uuid.uuid4().hex}.{ext}"
        path = os.path.join(UPLOAD_FOLDER, unique_name)
        f.save(path)
        resume_paths.append({"path": unique_name, "original_name": f.filename})
    
    # PERFORMANCE OPTIMIZATION – CRITICAL: Batch parse all files in parallel
    parsed_resumes = parse_resumes_from_paths(resume_paths)
    
    # PERFORMANCE OPTIMIZATION – CRITICAL: Batch extract entities for all resumes
    from concurrent.futures import ThreadPoolExecutor
    entity_results = []
    
    def extract_for_resume(parsed_item):
        if parsed_item["text"]:
            return extract_resume_entities(parsed_item["text"])
        return [], "", [], [], []
    
    with ThreadPoolExecutor(max_workers=min(4, len(parsed_resumes))) as executor:
        entity_results = list(executor.map(extract_for_resume, parsed_resumes))
    
    # PERFORMANCE OPTIMIZATION – CRITICAL: Add all to ANN index in batch
    for i, parsed in enumerate(parsed_resumes):
        if parsed["text"]:
            # Get corresponding entity results
            res_skills, res_exp, res_locations, res_phones, res_emails = entity_results[i]
            
            # Add to ANN index with full metadata
            metadata = {
                "path": parsed["path"],
                "original_name": parsed["original_name"],
                "text": parsed["text"],
                "skills": res_skills,
                "experience_years": res_exp,
                "locations": res_locations,
                "phone_numbers": res_phones,
                "emails": res_emails,
            }
            add_resume_to_index(parsed["text"], metadata)
    
    # PERFORMANCE OPTIMIZATION – CRITICAL: Clear caches after request
    clear_request_caches()
    
    return jsonify({"job_description": job_description, "resume_paths": resume_paths})