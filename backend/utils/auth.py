from flask import request
from backend.services.supabase_client import get_supabase_client

# ✅ Add this instead
def get_current_user():
    email = request.headers.get("X-User-Email", "").strip()
    return email if email else None