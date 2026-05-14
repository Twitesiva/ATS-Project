"""
One-time migration: normalize `companies.created_by` to the BDE's email.

Why:
- Current RLS policies compare `companies.created_by` to the authenticated user's email
  (via the `users` table + auth.uid()).
- Older rows may have `created_by` saved as a name (e.g. "Priya") instead of email,
  which makes them invisible under RLS and also blocks updates.

Requires:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY (recommended) OR SUPABASE_KEY

Usage:
  python backend/scripts/fix_companies_created_by.py
"""

import os
from supabase import create_client


def main() -> int:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")

    if not url or not key:
        print("Missing env vars. Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY).")
        return 1

    sb = create_client(url, key)

    users = sb.from_("users").select("email,name").execute().data or []
    if not users:
        print("No rows found in users table; nothing to do.")
        return 0

    updated_total = 0
    for u in users:
        email = (u.get("email") or "").strip()
        name = (u.get("name") or "").strip()
        if not email or not name:
            continue

        # Find companies where created_by is the user's name (legacy)
        rows = sb.from_("companies").select("id,created_by").eq("created_by", name).execute().data or []
        if not rows:
            continue

        ids = [r["id"] for r in rows if r.get("id") is not None]
        if not ids:
            continue

        res = sb.from_("companies").update({"created_by": email}).in_("id", ids).execute()
        updated = len(res.data or [])
        updated_total += updated
        print(f"Updated {updated} companies: created_by '{name}' -> '{email}'")

    print(f"Done. Total updated: {updated_total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

