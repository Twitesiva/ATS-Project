"""BDE APIs using Supabase (NO SQLITE)"""

from flask import Blueprint, request, jsonify
from datetime import datetime, timezone

from backend.services.supabase_client import get_supabase_client

bp = Blueprint("bde", __name__)

# =========================
# HELPERS
# =========================

def sb():
    return get_supabase_client()

def now():
    return datetime.now(timezone.utc).isoformat()

def to_int(val, default=0):
    try:
        return int(val)
    except:
        return default

# =========================
# COMPANIES (LEADS + CLIENTS)
# =========================

@bp.route("/bde/companies", methods=["GET"])
def get_companies():
    res = sb().from_("companies").select("*").order("created_at", desc=True).execute()
    return jsonify(res.data)


@bp.route("/bde/companies", methods=["POST"])
def create_company():
    data = request.json

    payload = {
        "company_name": data.get("companyName"),
        "contact_person": data.get("contactPerson"),
        "email": data.get("email"),
        "phone": data.get("phone"),
        "status": data.get("status", "Lead"),
        "stage": data.get("stage", "New"),
    }

    res = sb().from_("companies").insert(payload).execute()
    return jsonify(res.data), 201


@bp.route("/bde/companies/<int:company_id>", methods=["GET"])
def get_company(company_id):
    res = sb().from_("companies").select("*").eq("id", company_id).single().execute()
    return jsonify(res.data)


@bp.route("/bde/companies/<int:company_id>", methods=["PUT"])
def update_company(company_id):
    data = request.json

    payload = {
        "company_name": data.get("companyName"),
        "contact_person": data.get("contactPerson"),
        "email": data.get("email"),
        "phone": data.get("phone"),
        "status": data.get("status"),
        "stage": data.get("stage"),
    }

    res = sb().from_("companies").update(payload).eq("id", company_id).execute()
    return jsonify(res.data)


@bp.route("/bde/companies/<int:company_id>", methods=["DELETE"])
def delete_company(company_id):
    sb().from_("companies").delete().eq("id", company_id).execute()
    return jsonify({"success": True})


# =========================
# REQUIREMENTS
# =========================

@bp.route("/bde/requirements", methods=["GET"])
def get_requirements():
    res = sb().from_("requirements").select("*, companies(*)").order("created_at", desc=True).execute()
    return jsonify(res.data)


@bp.route("/bde/requirements", methods=["POST"])
def create_requirement():
    data = request.json

    payload = {
        "company_id": data.get("companyId"),
        "job_title": data.get("jobTitle"),
        "skills": data.get("skills"),
        "location": data.get("location"),
        "salary": data.get("salary"),
        "hire_mode": data.get("hireMode"),
        "number_of_openings": to_int(data.get("openings")),
        "status": data.get("status", "Open"),
    }

    res = sb().from_("requirements").insert(payload).execute()
    return jsonify(res.data), 201


@bp.route("/bde/requirements/<int:req_id>", methods=["PUT"])
def update_requirement(req_id):
    data = request.json

    payload = {
        "job_title": data.get("jobTitle"),
        "skills": data.get("skills"),
        "location": data.get("location"),
        "salary": data.get("salary"),
        "hire_mode": data.get("hireMode"),
        "number_of_openings": to_int(data.get("openings")),
        "status": data.get("status"),
    }

    res = sb().from_("requirements").update(payload).eq("id", req_id).execute()
    return jsonify(res.data)


@bp.route("/bde/requirements/<int:req_id>", methods=["DELETE"])
def delete_requirement(req_id):
    sb().from_("requirements").delete().eq("id", req_id).execute()
    return jsonify({"success": True})


# =========================
# ACTIVITIES (FOLLOWUPS + COMMUNICATION)
# =========================

@bp.route("/bde/activities", methods=["GET"])
def get_activities():
    res = sb().from_("activities") \
        .select("*, companies(*)") \
        .order("activity_datetime", desc=True) \
        .execute()

    return jsonify(res.data)


@bp.route("/bde/activities", methods=["POST"])
def create_activity():
    data = request.json

    payload = {
        "company_id": data.get("companyId"),
        "type": data.get("type"),
        "subject": data.get("subject"),
        "notes": data.get("notes"),
        "activity_datetime": data.get("datetime"),
        "status": data.get("status", "Completed"),
    }

    res = sb().from_("activities").insert(payload).execute()
    return jsonify(res.data), 201


@bp.route("/bde/activities/<int:act_id>", methods=["PUT"])
def update_activity(act_id):
    data = request.json

    payload = {
        "type": data.get("type"),
        "subject": data.get("subject"),
        "notes": data.get("notes"),
        "activity_datetime": data.get("datetime"),
        "status": data.get("status"),
    }

    res = sb().from_("activities").update(payload).eq("id", act_id).execute()
    return jsonify(res.data)


@bp.route("/bde/activities/<int:act_id>", methods=["DELETE"])
def delete_activity(act_id):
    sb().from_("activities").delete().eq("id", act_id).execute()
    return jsonify({"success": True})


# =========================
@bp.route("/bde/daily-tracker", methods=["GET"])
def get_daily_tracker():
    """Fetch companies created today."""

    from datetime import date
    today = date.today().isoformat()

    res = sb().from_("companies") \
        .select("*") \
        .gte("created_at", f"{today}T00:00:00") \
        .lte("created_at", f"{today}T23:59:59") \
        .order("created_at", desc=True) \
        .execute()

    return jsonify(res.data or [])


# =========================
# PAGE CLOSURES
# =========================

@bp.route("/bde/closures", methods=["GET"])
def get_closures():
    """
    Returns revenue_tracker rows whose client_name matches
    any company with status = 'Client' in the companies table.
    Supports optional query params:
      - month: YYYY-MM  (filters by doj month)
      - offer_status: e.g. Offered / Accepted / Joined
      - search: free-text across client_name, candidate_name, recruiter_name, position
    """
    sb_client = sb()

    # 1. Fetch all BDE client names
    clients_res = sb_client.from_("companies") \
        .select("company_name") \
        .eq("status", "Client") \
        .execute()

    client_names = [
        c["company_name"].strip().lower()
        for c in (clients_res.data or [])
        if c.get("company_name")
    ]

    if not client_names:
        return jsonify([])

    # 2. Fetch all revenue_tracker rows ordered by doj desc
    revenue_res = sb_client.from_("revenue_tracker") \
        .select("*") \
        .order("doj", desc=True) \
        .execute()

    rows = revenue_res.data or []

    # 3. Filter: only rows matching a BDE client
    rows = [
        r for r in rows
        if r.get("client_name", "").strip().lower() in client_names
    ]

    # 4. Optional filters from query params
    month = request.args.get("month", "").strip()        # e.g. "2024-06"
    offer_status = request.args.get("offer_status", "").strip()
    search = request.args.get("search", "").strip().lower()

    if month:
        def matches_month(r):
            doj = r.get("doj", "")
            return doj.startswith(month) if doj else False
        rows = [r for r in rows if matches_month(r)]

    if offer_status:
        rows = [r for r in rows if r.get("offer_status") == offer_status]

    if search:
        def matches_search(r):
            return any(
                search in (r.get(field) or "").lower()
                for field in ["client_name", "candidate_name", "recruiter_name", "position"]
            )
        rows = [r for r in rows if matches_search(r)]

    return jsonify(rows)


@bp.route("/bde/closures/summary", methods=["GET"])
def get_closures_summary():
    """
    Returns aggregate stats for Page Closures:
      - total_closures
      - total_billing
      - total_margin_value
      - avg_margin_percent
    Accepts same query params as /bde/closures (month, offer_status, search).
    Reuses the same filter logic by calling the closures endpoint internally.
    """
    sb_client = sb()

    # Reuse client names fetch
    clients_res = sb_client.from_("companies") \
        .select("company_name") \
        .eq("status", "Client") \
        .execute()

    client_names = [
        c["company_name"].strip().lower()
        for c in (clients_res.data or [])
        if c.get("company_name")
    ]

    if not client_names:
        return jsonify({
            "total_closures": 0,
            "total_billing": 0,
            "total_margin_value": 0,
            "avg_margin_percent": 0,
        })

    revenue_res = sb_client.from_("revenue_tracker") \
        .select("*") \
        .order("doj", desc=True) \
        .execute()

    rows = revenue_res.data or []
    rows = [
        r for r in rows
        if r.get("client_name", "").strip().lower() in client_names
    ]

    # Apply same optional filters
    month = request.args.get("month", "").strip()
    offer_status = request.args.get("offer_status", "").strip()
    search = request.args.get("search", "").strip().lower()

    if month:
        rows = [r for r in rows if (r.get("doj") or "").startswith(month)]

    if offer_status:
        rows = [r for r in rows if r.get("offer_status") == offer_status]

    if search:
        rows = [
            r for r in rows
            if any(
                search in (r.get(f) or "").lower()
                for f in ["client_name", "candidate_name", "recruiter_name", "position"]
            )
        ]

    total_billing = sum(r.get("billing_rate") or 0 for r in rows)
    total_margin = sum(r.get("margin_value") or 0 for r in rows)
    margin_pcts = [r.get("margin_percent") for r in rows if r.get("margin_percent") is not None]
    avg_margin_pct = round(sum(margin_pcts) / len(margin_pcts), 2) if margin_pcts else 0

    return jsonify({
        "total_closures": len(rows),
        "total_billing": round(total_billing, 2),
        "total_margin_value": round(total_margin, 2),
        "avg_margin_percent": avg_margin_pct,
    })


@bp.route("/bde/closures/months", methods=["GET"])
def get_closure_months():
    """
    Returns sorted list of distinct YYYY-MM months available
    in revenue_tracker for BDE clients. Used to populate
    the month filter dropdown in the frontend.
    """
    sb_client = sb()

    clients_res = sb_client.from_("companies") \
        .select("company_name") \
        .eq("status", "Client") \
        .execute()

    client_names = [
        c["company_name"].strip().lower()
        for c in (clients_res.data or [])
        if c.get("company_name")
    ]

    if not client_names:
        return jsonify([])

    revenue_res = sb_client.from_("revenue_tracker") \
        .select("doj, client_name") \
        .order("doj", desc=True) \
        .execute()

    months = set()
    for r in (revenue_res.data or []):
        if r.get("client_name", "").strip().lower() in client_names:
            doj = r.get("doj", "")
            if doj and len(doj) >= 7:
                months.add(doj[:7])  # "YYYY-MM"

    return jsonify(sorted(months, reverse=True))


# =========================
# DASHBOARD
# =========================

@bp.route("/bde/dashboard", methods=["GET"])
def dashboard():
    sb_client = sb()

    companies = sb_client.from_("companies").select("status, stage").execute().data or []
    requirements = sb_client.from_("requirements").select("status").execute().data or []
    activities = sb_client.from_("activities").select("status").execute().data or []

    # Closures count — revenue rows matching BDE clients
    client_names = [
        c["status"].strip().lower()
        for c in companies
        if c.get("status") == "Client"
    ]

    # Get client company names for closure count
    clients_res = sb_client.from_("companies") \
        .select("company_name") \
        .eq("status", "Client") \
        .execute()

    bde_client_names = [
        c["company_name"].strip().lower()
        for c in (clients_res.data or [])
        if c.get("company_name")
    ]

    total_closures = 0
    if bde_client_names:
        revenue_res = sb_client.from_("revenue_tracker") \
            .select("client_name") \
            .execute()
        total_closures = sum(
            1 for r in (revenue_res.data or [])
            if r.get("client_name", "").strip().lower() in bde_client_names
        )

    return jsonify({
        "totalCompanies": len(companies),
        "leads": len(companies),
        "clients": len([c for c in companies if c["status"] == "Client"]),
        "openRequirements": len([r for r in requirements if r["status"] == "Open"]),
        "closedRequirements": len([r for r in requirements if r["status"] == "Closed"]),
        "pendingActivities": len([a for a in activities if a["status"] == "Pending"]),
        "completedActivities": len([a for a in activities if a["status"] == "Completed"]),
        "totalClosures": total_closures,
    })