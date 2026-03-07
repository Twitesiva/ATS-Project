"""POST /store: persist match results into SQLite."""
from flask import Blueprint, request, jsonify
from backend.services.storage import store_resumes

bp = Blueprint("store", __name__)


@bp.route("/store", methods=["POST"])
def store():
    """
    Persist match results into SQLite.
    
    Stores ALL resumes regardless of match status.
    """
    data = request.get_json() or {}
    resumes = data.get("resumes") or []
    
    # Store ALL resumes regardless of match status
    # Previously this would reject empty results when all were filtered out
    # Now we want to store all resumes even if they didn't match
    try:
        count = store_resumes(resumes)
        return jsonify({
            "stored": count,
            "message": f"Successfully stored {count} resume(s)",
            "status": "success"
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500
