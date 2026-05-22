import os
import jwt
from jwt.algorithms import ECAlgorithm
from functools import wraps
from flask import request, jsonify
from dotenv import load_dotenv
import json
from backend.services.supabase_client import get_supabase_client
load_dotenv()

# Supabase public key for ES256 verification
JWKS = {
    "alg": "ES256",
    "crv": "P-256",
    "ext": True,
    "key_ops": ["verify"],
    "kid": "c4921d36-c60b-451e-9180-41f3ae743f58",
    "kty": "EC",
    "use": "sig",
    "x": "2u_Lz9eKbCGzOJ_4H2uW04roGCAjgr4W9GzY8ayHzF0",
    "y": "UXYoYciGooiXFEJlasbMq4EMEsVxC7uqiy_rjrgyxjw"
}

PUBLIC_KEY = ECAlgorithm.from_jwk(json.dumps(JWKS))

def verify_token(token):
    try:
        payload = jwt.decode(
            token,
            PUBLIC_KEY,
            algorithms=["ES256"],
            options={"verify_aud": False}
        )
        return payload
    except jwt.ExpiredSignatureError:
        print("[JWT ERROR] Token expired")
        return None
    except jwt.InvalidTokenError as e:
        print(f"[JWT ERROR] {e}")
        return None
    except Exception as e:
        print(f"[JWT UNKNOWN ERROR] {e}")
        return None
def get_role_from_db(user_id):
    try:
        supabase = get_supabase_client()
        # Prefer the newest row if duplicates exist (until uniqueness constraints are applied).
        try:
            result = (
                supabase.table("users")
                .select("role,created_at,id")
                .eq("auth_id", user_id)
                .order("created_at", desc=True)
                .order("id", desc=True)
                .limit(1)
                .execute()
            )
        except Exception:
            result = supabase.table("users").select("role").eq("auth_id", user_id).limit(1).execute()

        rows = getattr(result, "data", None) or []
        if rows:
            return (rows[0].get("role") or "").strip().lower()
    except Exception as e:
        print(f"[AUTH] get_role_from_db error: {e}")
    return ""
def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Missing token"}), 401

        token = auth_header.split(" ", 1)[1]
        payload = verify_token(token)
        if not payload:
            return jsonify({"error": "Invalid or expired token"}), 401

        user_id = payload.get("sub")
        role = get_role_from_db(user_id)  # ✅ from DB

        request.current_user = {
            "id":    user_id,
            "email": payload.get("email"),
            "role":  role,
        }
        request.current_token = token
        return f(*args, **kwargs)
    return decorated
def require_role(*roles):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            auth_header = request.headers.get("Authorization", "")
            if not auth_header.startswith("Bearer "):
                return jsonify({"error": "Missing token"}), 401

            token = auth_header.split(" ", 1)[1]
            payload = verify_token(token)
            if not payload:
                return jsonify({"error": "Invalid or expired token"}), 401

            user_id = payload.get("sub")

            # ✅ Fetch role from public.users using auth_id
            role = get_role_from_db(user_id)
            allowed = {(r or "").strip().lower() for r in roles}

            if role not in allowed:
                return jsonify({"error": f"Access denied. Required: {sorted(allowed)}, your role: {role}"}), 403

            request.current_user = {
                "id":    user_id,
                "email": payload.get("email"),
                "role":  role,
            }
            request.current_token = token
            return f(*args, **kwargs)
        return decorated
    return decorator
