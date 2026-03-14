"""Upload APIs: matching upload and bulk resume ingestion."""
from flask import Blueprint, request, jsonify
from backend.config import UPLOAD_FOLDER
from backend.utils.validation import validate_upload
import os
import uuid
import re
import zipfile
from concurrent.futures import ThreadPoolExecutor

# EXTENSION - SAFE TO REMOVE: Import JD extraction utility
from backend.utils.jd_extractor import extract_jd_text

bp = Blueprint("upload", __name__)


@bp.route("/upload", methods=["POST"])
def upload():
    """Handle resume and JD upload with comprehensive error handling."""
    try:
        print(f"\n[UPLOAD] Received upload request")
        print(f"[UPLOAD] Content-Type: {request.content_type}")

        # EXTENSION - SAFE TO REMOVE: JD file upload support
        # Get JD text from form (traditional method)
        job_description = request.form.get("job_description", "").strip()

        # EXTENSION - SAFE TO REMOVE: Check for JD file upload
        jd_file = request.files.get("jd_file")

        # EXTENSION - SAFE TO REMOVE: Validation - mutual exclusion
        has_jd_text = bool(job_description)
        has_jd_file = jd_file and jd_file.filename

        if has_jd_text and has_jd_file:
            print(f"[UPLOAD ERROR] Both JD text and file provided")
            return jsonify({"error": "Please provide JD as either text OR file, not both"}), 400

        # EXTENSION - SAFE TO REMOVE: Extract text from JD file if provided
        if has_jd_file:
            print(f"[UPLOAD] Processing JD file: {jd_file.filename}")
            success, result = extract_jd_text(jd_file)
            if not success:
                print(f"[UPLOAD ERROR] JD extraction failed: {result}")
                return jsonify({"error": result}), 400
            job_description = result
            print(f"[UPLOAD] JD extracted successfully ({len(result)} chars)")

        # Original validation continues with final job_description string
        files = request.files.getlist("resumes") or request.files.getlist("resumes[]")
        print(f"[UPLOAD] Received {len(files)} resume file(s)")

        valid, err = validate_upload(job_description, files)
        if not valid:
            print(f"[UPLOAD ERROR] Validation failed: {err}")
            return jsonify({"error": err or "Please upload Job Description and Resume"}), 400

        os.makedirs(UPLOAD_FOLDER, exist_ok=True)

        # PERFORMANCE ARCHITECTURE - CRITICAL: Import batch processing functions
        from backend.services.ann_index import init_ann_index, add_resume_to_index
        from backend.services.nlp_pipeline import extract_resume_entities
        from backend.services.resume_parser import parse_resumes_from_paths
        from backend.services.batch_optimizer import clear_request_caches

        # Initialize ANN index if needed
        print(f"[UPLOAD] Initializing ANN index...")
        init_ann_index()

        # PERFORMANCE OPTIMIZATION - CRITICAL: Batch save all files first
        resume_paths = []
        for f in files:
            try:
                ext = f.filename.rsplit(".", 1)[-1].lower()
                unique_name = f"{uuid.uuid4().hex}.{ext}"
                path = os.path.join(UPLOAD_FOLDER, unique_name)
                print(f"[UPLOAD] Saving file: {path}")
                f.save(path)
                resume_paths.append({"path": unique_name, "original_name": f.filename})
            except Exception as file_error:
                print(f"[UPLOAD ERROR] Failed to save file {f.filename}: {file_error}")
                raise Exception(f"File save error: {str(file_error)}")

        print(f"[UPLOAD] All files saved successfully")

        # PERFORMANCE OPTIMIZATION - CRITICAL: Batch parse all files in parallel
        print(f"[UPLOAD] Parsing resumes...")
        parsed_resumes = parse_resumes_from_paths(resume_paths)
        print(f"[UPLOAD] Parsed {len(parsed_resumes)} resumes")

        # PERFORMANCE OPTIMIZATION - CRITICAL: Batch extract entities for all resumes
        entity_results = []

        def extract_for_resume(parsed_item):
            if parsed_item["text"]:
                return extract_resume_entities(parsed_item["text"])
            return [], "", [], [], []

        print(f"[UPLOAD] Extracting entities...")
        with ThreadPoolExecutor(max_workers=min(4, len(parsed_resumes))) as executor:
            entity_results = list(executor.map(extract_for_resume, parsed_resumes))
        print(f"[UPLOAD] Entities extracted for {len(entity_results)} resumes")

        # PERFORMANCE OPTIMIZATION - CRITICAL: Add all to ANN index in batch
        print(f"[UPLOAD] Adding to ANN index...")
        for i, parsed in enumerate(parsed_resumes):
            if parsed["text"]:
                # Get corresponding entity results
                res_skills, res_exp, res_locations, res_phones, res_emails = entity_results[i]

                # Add to ANN index with full metadata
                metadata = {
                    "path": parsed["path"],
                    "original_name": parsed["original_name"],
                    "text": parsed["text"],
                    "raw_text": parsed["text"],
                    "text_preview": parsed["text"],
                    "skills": res_skills,
                    "experience_years": res_exp,
                    "locations": res_locations,
                    "phone_numbers": res_phones,
                    "emails": res_emails,
                }
                add_resume_to_index(parsed["text"], metadata)

        print(f"[UPLOAD] Added {len(parsed_resumes)} resumes to ANN index")

        # PERFORMANCE OPTIMIZATION - CRITICAL: Clear caches after request
        clear_request_caches()

        print(f"[UPLOAD SUCCESS] Upload completed successfully")
        return jsonify({"job_description": job_description, "resume_paths": resume_paths})

    except Exception as e:
        print(f"\n[UPLOAD ERROR] Critical error: {e}")
        import traceback

        traceback.print_exc()
        return jsonify({"error": f"Upload failed: {str(e)}"}), 500


def _is_supported_resume_ext(filename):
    ext = os.path.splitext(filename or "")[-1].lower()
    return ext in (".pdf", ".docx")


def _extract_name_from_text(text, fallback_name):
    """
    Best-effort name extraction from the top of resume text.
    Falls back to filename stem if no plausible candidate is found.
    """
    fallback = os.path.splitext(os.path.basename(fallback_name or "unknown"))[0].strip() or "unknown"
    if not text:
        return fallback

    lines = [ln.strip() for ln in text.splitlines() if ln and ln.strip()]
    for line in lines[:12]:
        if len(line) < 2 or len(line) > 80:
            continue
        low = line.lower()
        if any(token in low for token in ("email", "phone", "mobile", "skills", "experience", "linkedin", "@")):
            continue
        if re.search(r"\d", line):
            continue
        words = [w for w in re.split(r"\s+", line) if w]
        if 2 <= len(words) <= 4 and all(re.fullmatch(r"[A-Za-z][A-Za-z\-'`]*", w) for w in words):
            return " ".join(words)
    return fallback


def _save_uploaded_resume_file(file_obj):
    """Save one uploaded resume file and return metadata dict."""
    ext = os.path.splitext(file_obj.filename or "")[-1].lower()
    unique_name = f"{uuid.uuid4().hex}{ext}"
    target_path = os.path.join(UPLOAD_FOLDER, unique_name)
    file_obj.save(target_path)
    return {"path": unique_name, "original_name": os.path.basename(file_obj.filename or unique_name)}


def _extract_resumes_from_zip(zip_file):
    """Extract supported resume files from an uploaded ZIP into uploads folder."""
    extracted = []
    failures = []
    zip_filename = zip_file.filename or "uploaded.zip"

    try:
        zip_file.stream.seek(0)
        with zipfile.ZipFile(zip_file.stream) as zf:
            for info in zf.infolist():
                if info.is_dir():
                    continue

                member_name = os.path.basename(info.filename or "")
                if not member_name:
                    continue
                if not _is_supported_resume_ext(member_name):
                    failures.append({"file": member_name, "reason": "Unsupported format (only PDF/DOCX allowed)"})
                    continue

                try:
                    with zf.open(info) as source:
                        content = source.read()
                    ext = os.path.splitext(member_name)[-1].lower()
                    unique_name = f"{uuid.uuid4().hex}{ext}"
                    target_path = os.path.join(UPLOAD_FOLDER, unique_name)
                    with open(target_path, "wb") as out:
                        out.write(content)
                    extracted.append({"path": unique_name, "original_name": member_name})
                except Exception:
                    failures.append({"file": member_name, "reason": "Corrupted file inside ZIP"})
    except zipfile.BadZipFile:
        failures.append({"file": zip_filename, "reason": "Corrupted ZIP file"})
    except Exception as e:
        failures.append({"file": zip_filename, "reason": f"ZIP processing failed: {str(e)}"})

    return extracted, failures


@bp.route("/bulk-upload-resumes", methods=["POST"])
def bulk_upload_resumes():
    """
    Bulk resume ingestion endpoint.

    Supports:
    - multiple PDF/DOCX files
    - one or more ZIP files containing PDF/DOCX resumes

    Flow:
    upload -> parse text -> extract fields -> store DB -> create embeddings -> add to FAISS.
    """
    try:
        os.makedirs(UPLOAD_FOLDER, exist_ok=True)

        uploaded_files = request.files.getlist("files") or request.files.getlist("resumes")
        if not uploaded_files:
            return jsonify({"error": "No files uploaded"}), 400

        saved_resume_entries = []
        failed_files = []

        # Stage 1: save direct resume files and extract zip members.
        for f in uploaded_files:
            original_name = os.path.basename(f.filename or "")
            if not original_name:
                continue

            ext = os.path.splitext(original_name)[-1].lower()
            if ext == ".zip":
                extracted, zip_failures = _extract_resumes_from_zip(f)
                saved_resume_entries.extend(extracted)
                failed_files.extend(zip_failures)
                continue

            if not _is_supported_resume_ext(original_name):
                failed_files.append({"file": original_name, "reason": "Unsupported format (only PDF/DOCX/ZIP allowed)"})
                continue

            try:
                saved_resume_entries.append(_save_uploaded_resume_file(f))
            except Exception:
                failed_files.append({"file": original_name, "reason": "Failed to save uploaded file"})

        if not saved_resume_entries:
            return jsonify(
                {
                    "summary": {
                        "uploaded": 0,
                        "successful": 0,
                        "failed": len(failed_files),
                    },
                    "failed_files": failed_files,
                    "message": "No valid resumes to process",
                }
            ), 400

        from backend.services.resume_parser import parse_resumes_from_paths
        from backend.services.nlp_pipeline import extract_resume_entities
        from backend.services.storage import store_resumes
        from backend.services.ann_index import init_ann_index, add_resume_to_index
        from backend.services.enterprise_matching import extract_semantic_role_intent
        from backend.utils.model_loader import get_encoder

        # Stage 2: parse text.
        parsed_resumes = parse_resumes_from_paths(saved_resume_entries, max_workers=8)

        valid_parsed = []
        for parsed in parsed_resumes:
            if not parsed.get("text"):
                failed_files.append(
                    {
                        "file": parsed.get("original_name") or parsed.get("path") or "unknown",
                        "reason": "Could not extract text (corrupted or image-only resume)",
                    }
                )
                continue
            valid_parsed.append(parsed)

        if not valid_parsed:
            return jsonify(
                {
                    "summary": {
                        "uploaded": len(saved_resume_entries),
                        "successful": 0,
                        "failed": len(failed_files),
                    },
                    "failed_files": failed_files,
                    "message": "No parseable resumes found",
                }
            ), 400

        # Stage 3: entity extraction in parallel.
        def _extract_entities(parsed_item):
            skills, exp, locations, phones, emails = extract_resume_entities(parsed_item["text"])
            role = extract_semantic_role_intent(parsed_item["text"])
            name = _extract_name_from_text(parsed_item["text"], parsed_item.get("original_name", "unknown"))
            return {
                "skills": skills,
                "experience_years": exp,
                "locations": locations,
                "phone_numbers": phones,
                "emails": emails,
                "role_label": role.raw_label,
                "role_type": role.role_type,
                "role_family": role.role_family,
                "primary_skill": role.primary_tech,
                "name": name,
            }

        with ThreadPoolExecutor(max_workers=min(8, len(valid_parsed))) as executor:
            extracted_entities = list(executor.map(_extract_entities, valid_parsed))

        # Stage 4: embeddings in batches.
        encoder = get_encoder()
        texts = [p["text"][:8000] for p in valid_parsed]
        embeddings = []
        batch_size = 64
        for i in range(0, len(texts), batch_size):
            batch_vectors = encoder(texts[i : i + batch_size], show_progress_bar=False)
            embeddings.extend([vec.tolist() for vec in batch_vectors])

        # Stage 5: build payload for DB and ANN.
        records_to_store = []
        ann_payloads = []
        for parsed, entities, emb in zip(valid_parsed, extracted_entities, embeddings):
            location_display = entities["locations"][0] if entities["locations"] else ""
            record = {
                "name": entities["name"],
                "original_name": parsed["original_name"],
                "path": parsed["path"],
                "raw_text": parsed["text"],
                "text_preview": parsed["text"],
                "location_display": location_display,
                "locations": entities["locations"],
                "extracted_skills": entities["skills"],
                "experience_years": entities["experience_years"],
                "phone_numbers": entities["phone_numbers"],
                "emails": entities["emails"],
                "role_label": entities["role_label"],
                "role_type": entities["role_type"],
                "role_family": entities["role_family"],
                "primary_skill": entities["primary_skill"],
                "match_percentage": 0,
                "is_matched": True,
                "embedding": emb,
            }
            records_to_store.append(record)
            ann_payloads.append((parsed["text"], record))

        stored_count = store_resumes(records_to_store)

        # Stage 6: ANN indexing for matching pipeline compatibility.
        ann_added = 0
        if init_ann_index():
            for resume_text, record in ann_payloads:
                ann_metadata = {
                    "path": record["path"],
                    "original_name": record["original_name"],
                    "text": record["raw_text"],
                    "raw_text": record["raw_text"],
                    "text_preview": record["text_preview"],
                    "skills": record["extracted_skills"],
                    "experience_years": record["experience_years"],
                    "locations": record["locations"],
                    "phone_numbers": record["phone_numbers"],
                    "emails": record["emails"],
                    "role_label": record["role_label"],
                    "role_type": record["role_type"],
                    "role_family": record["role_family"],
                    "primary_skill": record["primary_skill"],
                }
                if add_resume_to_index(resume_text, ann_metadata):
                    ann_added += 1

        successful = len(records_to_store)
        return jsonify(
            {
                "summary": {
                    "uploaded": len(saved_resume_entries),
                    "successful": successful,
                    "stored": stored_count,
                    "indexed": ann_added,
                    "failed": len(failed_files),
                },
                "failed_files": failed_files,
            }
        )
    except Exception as e:
        import traceback

        traceback.print_exc()
        return jsonify({"error": f"Bulk upload failed: {str(e)}"}), 500
