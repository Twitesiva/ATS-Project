"""Admin user management endpoints (service-role required).

This module provides backend-only routes for privileged operations that the
frontend (anon/authenticated clients) cannot perform, such as updating another
user's Supabase Auth password.
"""

from __future__ import annotations

from flask import Blueprint, request

from backend.services.supabase_client import get_supabase_client
from backend.utils.auth import require_role

bp = Blueprint("admin_users", __name__)


@bp.post("/admin/users")
@require_role("manager", "hr")
def admin_create_user():
    """
    Create a Supabase Auth user and upsert their profile row in public.users.

    Body:
      {
        "email": "<string>",
        "password": "<string>",
        "role": "<string>",
        "name": "<string|null>",
        "phone_number": "<string|null>"
      }
    """
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip().lower()
    password = (body.get("password") or "").strip()
    role = (body.get("role") or "recruiter").strip()
    name = body.get("name")
    phone_number = body.get("phone_number")

    if not email:
        return {"ok": False, "error": "email is required"}, 400
    if not password:
        return {"ok": False, "error": "password is required"}, 400
    if len(password) < 6:
        return {"ok": False, "error": "Password must be at least 6 characters"}, 400

    import os

    if not (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")):
        return {
            "ok": False,
            "error": "Backend missing SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY) for auth admin operations",
        }, 500

    supabase = get_supabase_client()

    try:
        created = supabase.auth.admin.create_user(
            {
                "email": email,
                "password": password,
                # Create users ready to login immediately (no email confirmation flow)
                "email_confirm": True,
            }
        )
        auth_user = getattr(created, "user", None) or (created.get("user") if isinstance(created, dict) else None)
        auth_id = (getattr(auth_user, "id", None) or (auth_user.get("id") if isinstance(auth_user, dict) else None) or "").strip()
    except Exception as e:
        return {"ok": False, "error": str(e)}, 500

    if not auth_id:
        return {"ok": False, "error": "Failed to create auth user"}, 500

    # Keep public.users in sync with auth.users
    user_row = {
        "auth_id": auth_id,
        "email": email,
        "role": role,
        "name": name or email.split("@")[0] if email else None,
        "phone_number": phone_number or None,
    }

    try:
        # Prefer upsert on email; if constraint doesn't exist, fall back to lookup.
        upsert = supabase.table("users").upsert(user_row, on_conflict="email").execute()
        if getattr(upsert, "error", None):
            raise RuntimeError(str(upsert.error))
    except Exception:
        try:
            existing = supabase.table("users").select("id").eq("email", email).limit(1).execute()
            existing_row = (getattr(existing, "data", None) or existing.get("data") if isinstance(existing, dict) else []) or []
            existing_id = (existing_row[0].get("id") if existing_row else None)
            if existing_id:
                supabase.table("users").update(user_row).eq("id", existing_id).execute()
            else:
                supabase.table("users").insert(user_row).execute()
        except Exception as e:
            return {"ok": False, "error": f"Auth user created, but failed to upsert users row: {e}"}, 500

    return {"ok": True, "auth_id": auth_id}


@bp.patch("/admin/users/password")
@require_role("manager", "hr")
def update_user_password():
    """
    Update a Supabase Auth user's password.

    Body:
      { "auth_id": "<uuid>", "new_password": "<string>" }

    Notes:
    - Requires backend to be configured with SUPABASE_SERVICE_ROLE_KEY
      (or another key with admin privileges).
    """
    body = request.get_json(silent=True) or {}
    auth_id = (body.get("auth_id") or "").strip()
    new_password = (body.get("new_password") or "").strip()

    if not auth_id:
        return {"ok": False, "error": "auth_id is required"}, 400
    if not new_password:
        return {"ok": False, "error": "new_password is required"}, 400
    if len(new_password) < 6:
        return {"ok": False, "error": "Password must be at least 6 characters"}, 400

    # Hard fail if backend isn't configured with service role.
    # Without it, Supabase Auth admin APIs will reject the request.
    import os

    if not (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")):
        return {
            "ok": False,
            "error": "Backend missing SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY) for auth admin operations",
        }, 500

    supabase = get_supabase_client()

    try:
        # supabase-py v2 admin API
        supabase.auth.admin.update_user_by_id(auth_id, {"password": new_password})
    except Exception as e:
        return {"ok": False, "error": str(e)}, 500

    return {"ok": True}
