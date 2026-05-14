"""BDE APIs using Supabase (NO SQLITE) — JWT protected"""

from flask import Blueprint, request, jsonify
from datetime import datetime, timezone
from backend.services.supabase_client import get_supabase_client
from backend.utils.auth import login_required, require_role

bp = Blueprint("bde", __name__)

# =========================
# HELPERS
# =========================
@bp.route("/bde/me", methods=["GET"])
@login_required
def me():
    return jsonify(request.current_user)
def sb():
    # Use the user's JWT so RLS policies that depend on auth.uid() work.
    return get_supabase_client(getattr(request, "current_token", None))

def now():
    return datetime.now(timezone.utc).isoformat()

def to_int(val, default=0):
    try:
        return int(val)
    except Exception:
        return default

def get_any(data, *keys, default=None):
    for key in keys:
        if isinstance(data, dict) and key in data and data.get(key) is not None:
            return data.get(key)
    return default

def normalize_source_text(val):
    return " ".join((val or "").strip().lower().replace("-", " ").split())

def normalize_text(val):
    return " ".join((val or "").strip().lower().split())

def same_user_name(left, right):
    return normalize_text(left) == normalize_text(right)

def get_user_identifiers(user_name="", user_email=""):
    identifiers = []
    for val in [user_name, user_email]:
        normalized = normalize_text(val)
        if normalized and normalized not in identifiers:
            identifiers.append(normalized)
    return identifiers

def matches_user_identifier(value, identifiers):
    if not identifiers:
        return True
    return normalize_text(value) in identifiers

def get_filtered_bde_companies(sb_client, user_email):
    """
    Fetch companies created by this BDE (matched by email stored in created_by).
    HR calls this with user_email=None to get all companies.
    """
    query = sb_client.from_("companies").select(
        "id, company_name, contact_person, status, source, created_at, created_by, "
        "phone, email, remarks"
    )
    if user_email:
        query = query.eq("created_by", user_email)
    return query.execute().data or []

def build_channel_split(companies):
    def src_match(company, *keywords):
        src = normalize_source_text(company.get("source"))
        return any(kw in src for kw in keywords)

    return {
        "email":    len([c for c in companies if src_match(c, "email")]),
        "linkedin": len([c for c in companies if src_match(c, "linkedin", "linked in")]),
        "phone":    len([c for c in companies if src_match(c, "phone", "call", "cold call", "phone call", "calling")]),
    }

def get_bde_email():
    """
    Returns the current user's email from the JWT token.
    Returns None if the user is HR (so HR sees all data).
    """
    user = request.current_user
    role = user.get("role", "")
    if role == "HR":
        return None          # HR sees everything — no filter
    email = (user.get("email") or "").strip().lower()
    return email  # BDE filtered to their own data


# =========================
# USERS (for dropdowns)
# =========================

@bp.route("/users/bdes", methods=["GET"])
@require_role("manager", "HR")
def list_bde_users():
    """
    Returns a list of BDE users for manager/HR dropdowns.
    Uses the caller's JWT so existing RLS policies apply.
    """
    try:
        res = (
            sb()
            .from_("users")
            .select("id,name,full_name,role,email")
            .or_("role.ilike.%bde%,role.ilike.%bd%,role.ilike.%business development%")
            .order("name", desc=False)
            .execute()
        )
        return jsonify(res.data or [])
    except Exception as e:
        return jsonify({"error": "Failed to fetch BDE users", "details": str(e)}), 502

# =========================
# COMPANIES
# =========================

@bp.route("/bde/companies", methods=["GET"])
@login_required
def get_companies():
    try:
        bde_email = get_bde_email()
        query = sb().from_("companies").select("*").order("created_at", desc=True)
        if bde_email:
            query = query.ilike("created_by", bde_email)
        res = query.execute()
        return jsonify(res.data)
    except Exception as e:
        return jsonify({"error": "Failed to fetch companies", "details": str(e)}), 502


@bp.route("/bde/companies", methods=["POST"])
@require_role("bde", "HR")
def create_company():
    data = request.json
    user = request.current_user

    payload = {
        "company_name":   get_any(data, "companyName", "company_name"),
        "contact_person": get_any(data, "contactPerson", "contact_person"),
        "email":          data.get("email"),
        "phone":          data.get("phone"),
        "source":         data.get("source"),
        "status":         get_any(data, "status", default="Lead"),
        "stage":          get_any(data, "stage", default="New"),
        "remarks":        get_any(data, "remarks", "notes"),
        "priority":       get_any(data, "priority"),
        "mode_of_source": get_any(data, "mode_of_source", "modeOfSource"),
        "industry":       get_any(data, "industry"),
        "website":        get_any(data, "website"),
        "lead_status":    get_any(data, "lead_status", "leadStatus"),
        "created_by":     user["email"],   # always from JWT — never from frontend
    }

    res = sb().from_("companies").insert(payload).execute()
    return jsonify(res.data), 201


@bp.route("/bde/companies/<int:company_id>", methods=["GET"])
@login_required
def get_company(company_id):
    bde_email = get_bde_email()
    query = sb().from_("companies").select("*").eq("id", company_id)
    if bde_email:
        # BDE can only fetch their own company
        query = query.ilike("created_by", bde_email)
    res = query.single().execute()
    if not res.data:
        return jsonify({"error": "Not found or access denied"}), 404
    return jsonify(res.data)


@bp.route("/bde/companies/<int:company_id>", methods=["PUT"])
@require_role("bde", "HR")
def update_company(company_id):
    bde_email = get_bde_email()
    data = request.json

    # Verify ownership before update (BDE can only update their own)
    if bde_email:
        check = sb().from_("companies").select("id").eq("id", company_id).ilike("created_by", bde_email).execute()
        if not check.data:
            return jsonify({"error": "Access denied"}), 403

    payload = {
        "company_name":   data.get("companyName"),
        "contact_person": data.get("contactPerson"),
        "email":          data.get("email"),
        "phone":          data.get("phone"),
        "source":         data.get("source"),
        "status":         data.get("status"),
        "stage":          data.get("stage"),
        "remarks":        data.get("remarks") or data.get("notes"),
    }

    res = sb().from_("companies").update(payload).eq("id", company_id).execute()
    return jsonify(res.data)


@bp.route("/bde/companies/<int:company_id>", methods=["DELETE"])
@require_role("bde", "HR")
def delete_company(company_id):
    bde_email = get_bde_email()

    # Verify ownership before delete
    if bde_email:
        check = sb().from_("companies").select("id").eq("id", company_id).eq("created_by", bde_email).execute()
        if not check.data:
            return jsonify({"error": "Access denied"}), 403

    sb().from_("companies").delete().eq("id", company_id).execute()
    return jsonify({"success": True})


# =========================
# REQUIREMENTS
# =========================

@bp.route("/bde/requirements", methods=["GET"])
@login_required
def get_requirements():
    bde_email = get_bde_email()
    if bde_email:
        # BDE sees only requirements for their own companies
        companies = sb().from_("companies").select("id").eq("created_by", bde_email).execute().data or []
        company_ids = [c["id"] for c in companies]
        if not company_ids:
            return jsonify([])
        res = sb().from_("requirements").select("*, companies(*)") \
            .in_("company_id", company_ids).order("created_at", desc=True).execute()
    else:
        # HR sees all
        res = sb().from_("requirements").select("*, companies(*)").order("created_at", desc=True).execute()
    return jsonify(res.data)


@bp.route("/bde/requirements", methods=["POST"])
@require_role("bde", "HR")
def create_requirement():
    bde_email = get_bde_email()
    data = request.json
    company_id = data.get("companyId")

    # BDE can only add requirements to their own companies
    if bde_email:
        check = sb().from_("companies").select("id").eq("id", company_id).eq("created_by", bde_email).execute()
        if not check.data:
            return jsonify({"error": "Access denied — company not yours"}), 403

    payload = {
        "company_id":        company_id,
        "job_title":         data.get("jobTitle"),
        "skills":            data.get("skills"),
        "location":          data.get("location"),
        "salary":            data.get("salary"),
        "hire_mode":         data.get("hireMode"),
        "number_of_openings": to_int(data.get("openings")),
        "status":            data.get("status", "Open"),
    }

    res = sb().from_("requirements").insert(payload).execute()
    return jsonify(res.data), 201


@bp.route("/bde/requirements/<int:req_id>", methods=["PUT"])
@require_role("bde", "HR")
def update_requirement(req_id):
    bde_email = get_bde_email()

    if bde_email:
        # Verify the requirement belongs to one of BDE's companies
        req = sb().from_("requirements").select("company_id").eq("id", req_id).single().execute()
        if not req.data:
            return jsonify({"error": "Not found"}), 404
        company_check = sb().from_("companies").select("id") \
            .eq("id", req.data["company_id"]).eq("created_by", bde_email).execute()
        if not company_check.data:
            return jsonify({"error": "Access denied"}), 403

    data = request.json
    payload = {
        "job_title":          data.get("jobTitle"),
        "skills":             data.get("skills"),
        "location":           data.get("location"),
        "salary":             data.get("salary"),
        "hire_mode":          data.get("hireMode"),
        "number_of_openings": to_int(data.get("openings")),
        "status":             data.get("status"),
    }

    res = sb().from_("requirements").update(payload).eq("id", req_id).execute()
    return jsonify(res.data)


@bp.route("/bde/requirements/<int:req_id>", methods=["DELETE"])
@require_role("bde", "HR")
def delete_requirement(req_id):
    bde_email = get_bde_email()

    if bde_email:
        req = sb().from_("requirements").select("company_id").eq("id", req_id).single().execute()
        if not req.data:
            return jsonify({"error": "Not found"}), 404
        company_check = sb().from_("companies").select("id") \
            .eq("id", req.data["company_id"]).eq("created_by", bde_email).execute()
        if not company_check.data:
            return jsonify({"error": "Access denied"}), 403

    sb().from_("requirements").delete().eq("id", req_id).execute()
    return jsonify({"success": True})


# =========================
# ACTIVITIES
# =========================

@bp.route("/bde/activities", methods=["GET"])
@login_required
def get_activities():
    bde_email = get_bde_email()
    query = sb().from_("activities").select("*, companies(*)").order("activity_datetime", desc=True)
    if bde_email:
        query = query.eq("created_by", bde_email)
    res = query.execute()
    return jsonify(res.data)


@bp.route("/bde/activities", methods=["POST"])
@require_role("bde", "HR")
def create_activity():
    try:
        data = request.json
        user = request.current_user

        payload = {
            "company_id":        data.get("companyId"),
            "type":              data.get("type"),
            "notes":             data.get("notes"),
            "activity_datetime": data.get("datetime"),
            "status":            data.get("status", "Pending"),
            "created_by":        user["email"],   # from JWT, not header
            "created_at":        now(),
        }

        res = sb().from_("activities").insert(payload).execute()
        return jsonify(res.data), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/bde/activities/<int:act_id>", methods=["PUT"])
@require_role("bde", "HR")
def update_activity(act_id):
    bde_email = get_bde_email()

    if bde_email:
        check = sb().from_("activities").select("id").eq("id", act_id).eq("created_by", bde_email).execute()
        if not check.data:
            return jsonify({"error": "Access denied"}), 403

    data = request.json
    payload = {
        "type":              data.get("type"),
        "subject":           data.get("subject"),
        "notes":             data.get("notes"),
        "activity_datetime": data.get("datetime"),
        "status":            data.get("status"),
    }

    res = sb().from_("activities").update(payload).eq("id", act_id).execute()
    return jsonify(res.data)


@bp.route("/bde/activities/<int:act_id>", methods=["DELETE"])
@require_role("bde", "HR")
def delete_activity(act_id):
    bde_email = get_bde_email()

    if bde_email:
        check = sb().from_("activities").select("id").eq("id", act_id).eq("created_by", bde_email).execute()
        if not check.data:
            return jsonify({"error": "Access denied"}), 403

    sb().from_("activities").delete().eq("id", act_id).execute()
    return jsonify({"success": True})


# =========================
# DAILY TRACKER
# =========================

@bp.route("/bde/daily-tracker", methods=["GET"])
@login_required
def get_daily_tracker():
    from datetime import date
    import traceback

    try:
        today = date.today().isoformat()
        start = f"{today}T00:00:00"
        end   = f"{today}T23:59:59"

        user = request.current_user
        role = user.get("role", "")

        # BDE: always filter by their own email
        # HR: can pass ?bde= to filter a specific BDE, or see all
        if role == "bde":
            bde_email = user["email"]
        else:
            bde_email = request.args.get("bde", "").strip() or None

        sb_client = sb()

        companies_query = sb_client.from_("companies").select("*") \
            .gte("created_at", start).lte("created_at", end)
        if bde_email:
            companies_query = companies_query.eq("created_by", bde_email)
        companies_rows = companies_query.execute().data or []

        mapped_companies = [
            {
                **row,
                "activity_date": row.get("created_at"),
                "lead_name":     row.get("contact_person") or row.get("company_name"),
                "company_name":  row.get("company_name") or "",
                "source":        row.get("source") or row.get("stage") or "",
                "phone":         row.get("phone") or "",
                "email":         row.get("email") or "",
                "status":        row.get("status") or "",
                "remarks":       row.get("remarks") or "",
                "activity_type": "new_lead",
            }
            for row in companies_rows
        ]

        activities_query = sb_client.from_("activities").select("*") \
            .gte("activity_datetime", start).lte("activity_datetime", end)
        if bde_email:
            activities_query = activities_query.eq("created_by", bde_email)
        activities_rows = activities_query.execute().data or []

        company_ids = [r.get("company_id") for r in activities_rows if r.get("company_id")]
        company_map = {}
        if company_ids:
            companies_for_map = sb_client.from_("companies").select("id, company_name") \
                .in_("id", company_ids).execute().data or []
            company_map = {c["id"]: c["company_name"] for c in companies_for_map}

        mapped_activities = [
            {
                **row,
                "activity_date": row.get("activity_datetime"),
                "lead_name":     row.get("contact_person") or company_map.get(row.get("company_id"), ""),
                "company_name":  company_map.get(row.get("company_id"), ""),
                "source":        row.get("type") or "",
                "phone":         row.get("phone") or "",
                "email":         row.get("email") or "",
                "status":        row.get("status") or "",
                "remarks":       row.get("notes") or "",
                "activity_type": row.get("type") or "",
            }
            for row in activities_rows
        ]

        return jsonify(mapped_companies + mapped_activities)

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# =========================
# WEEKLY TRACKER
# =========================

@bp.route("/bde/weekly-tracker", methods=["GET"])
@login_required
def get_weekly_tracker():
    from datetime import date, timedelta

    sb_client = sb()
    user = request.current_user
    role = user.get("role", "")

    # BDE: always their own email. HR: can pass ?user= to view a specific BDE.
    if role == "bde":
        bde_email = user["email"]
        user_name = user.get("name", "")
    else:
        bde_email = request.args.get("email", "").strip() or None
        user_name = request.args.get("user", "").strip()

    today = date.today()
    weeks = []
    current_week_start = today - timedelta(days=today.weekday())
    for i in range(8):
        week_start = current_week_start - timedelta(weeks=i)
        week_end   = week_start + timedelta(days=6)
        weeks.append((week_start, week_end))

    all_companies = get_filtered_bde_companies(sb_client, bde_email)
    company_ids = [c["id"] for c in all_companies if c.get("id") is not None]

    all_requirements = []
    if company_ids:
        all_requirements = sb_client.from_("requirements") \
            .select("id, company_id, job_title, created_at") \
            .in_("company_id", company_ids).execute().data or []

    reqs_by_company = {}
    for r in all_requirements:
        cid = r.get("company_id")
        if cid:
            reqs_by_company.setdefault(cid, []).append(r)

    activities_query = sb_client.from_("activities").select(
        "id, type, status, activity_datetime, company_id, created_by"
    )
    if bde_email:
        activities_query = activities_query.eq("created_by", bde_email)
    all_activities = activities_query.execute().data or []

    client_names = {
        (c.get("company_name") or "").strip().lower()
        for c in all_companies
        if c.get("status") == "Client" and c.get("company_name")
    }

    revenue = sb_client.from_("revenue_tracker").select("client_name, doj, offer_status").execute().data or []

    result = []
    for week_start, week_end in weeks:
        ws = week_start.isoformat()
        we = week_end.isoformat()
        week_label = f"W{week_start.isocalendar()[1]}, {week_start.strftime('%d/%m')}"

        week_companies = [
            c for c in all_companies
            if c.get("created_at") and ws <= c["created_at"][:10] <= we
        ]

        lead_combos = set()
        for c in week_companies:
            cid     = c["id"]
            contact = (c.get("contact_person") or "").strip()
            reqs    = reqs_by_company.get(cid, [])
            if reqs:
                for r in reqs:
                    lead_combos.add((cid, contact, (r.get("job_title") or "").strip()))
            else:
                lead_combos.add((cid, contact, ""))

        week_channel_split = build_channel_split(week_companies)

        week_requirements = [
            r for r in all_requirements
            if r.get("created_at") and ws <= r["created_at"][:10] <= we
        ]

        week_activities = [
            a for a in all_activities
            if a.get("activity_datetime") and ws <= a["activity_datetime"][:10] <= we
        ]

        responses_received = len([
            a for a in week_activities
            if (a.get("type") or "").strip().lower() == "response"
        ])
        client_meet = len([
            a for a in week_activities
            if (a.get("type") or "").strip().lower() in ("demo", "meeting", "client meet")
        ])
        follow_ups = len([
            a for a in week_activities
            if (a.get("status") or "").strip().lower() == "pending"
        ])

        week_closures = [
            r for r in revenue
            if r.get("doj") and ws <= r["doj"][:10] <= we
            and (not bde_email or (r.get("client_name") or "").strip().lower() in client_names)
        ]

        result.append({
            "week":                week_label,
            "week_start":          ws,
            "week_end":            we,
            "bdName":              user_name or (bde_email or "All"),
            "newClients":          len([c for c in week_companies if (c.get("status") or "").strip().lower() == "client"]),
            "totalLeadGeneration": len(lead_combos),
            "requirements":        len(week_requirements),
            "closures":            len(week_closures),
            "newLeadsEmail":       week_channel_split["email"],
            "newLeadsPhone":       week_channel_split["phone"],
            "newLeadsLinkedIn":    week_channel_split["linkedin"],
            "responsesReceived":   responses_received,
            "followUps":           follow_ups,
            "clientMeet":          client_meet,
        })

    return jsonify(result)


@bp.route("/bde/channel-split-summary", methods=["GET"])
@login_required
def get_channel_split_summary():
    sb_client = sb()
    user = request.current_user
    role = user.get("role", "")

    if role == "bde":
        bde_email = user["email"]
        user_name = user.get("name", "")
    else:
        bde_email = request.args.get("email", "").strip() or None
        user_name = request.args.get("user", "").strip()

    companies = get_filtered_bde_companies(sb_client, bde_email)
    split = build_channel_split(companies)

    return jsonify({
        "bdName":   user_name or (bde_email or "All"),
        "scope":    "all_companies",
        "email":    split["email"],
        "linkedin": split["linkedin"],
        "phone":    split["phone"],
        "total":    split["email"] + split["linkedin"] + split["phone"],
    })


@bp.route("/bde/weekly-leads", methods=["GET"])
@login_required
def get_weekly_leads():
    sb_client  = sb()
    user = request.current_user
    role = user.get("role", "")

    if role == "bde":
        bde_email = user["email"]
    else:
        bde_email = request.args.get("email", "").strip() or None

    week_start = request.args.get("week_start", "").strip()
    week_end   = request.args.get("week_end",   "").strip()

    q = sb_client.from_("companies").select(
        "id, company_name, contact_person, source, phone, email, status, remarks, created_at, created_by"
    )
    if bde_email:
        q = q.eq("created_by", bde_email)
    if week_start:
        q = q.gte("created_at", week_start)
    if week_end:
        q = q.lte("created_at", week_end + "T23:59:59")
    companies = q.execute().data or []

    company_ids = [c["id"] for c in companies if c.get("id")]
    all_reqs = []
    if company_ids:
        all_reqs = sb_client.from_("requirements") \
            .select("id, company_id, job_title, created_at") \
            .in_("company_id", company_ids).execute().data or []

    reqs_by_company = {}
    for r in all_reqs:
        reqs_by_company.setdefault(r["company_id"], []).append(r)

    rows = []
    seen = set()
    for c in companies:
        cid     = c["id"]
        contact = (c.get("contact_person") or "").strip()
        reqs    = reqs_by_company.get(cid, [])
        combos  = reqs if reqs else [{"id": None, "job_title": "", "created_at": c.get("created_at")}]

        for r in combos:
            job = (r.get("job_title") or "").strip()
            key = (cid, contact, job)
            if key in seen:
                continue
            seen.add(key)
            rows.append({
                "id":            f"{cid}-{r.get('id') or 'none'}",
                "activity_date": c.get("created_at", ""),
                "lead_name":     contact or c.get("company_name", ""),
                "company":       c.get("company_name", ""),
                "source":        c.get("source", ""),
                "mobile":        c.get("phone", ""),
                "email":         c.get("email", ""),
                "status":        c.get("status", ""),
                "remarks":       c.get("remarks", ""),
                "position":      job,
            })

    return jsonify(rows)


# =========================
# CLOSURES
# =========================

@bp.route("/bde/closures", methods=["GET"])
@login_required
def get_closures():
    sb_client = sb()
    user = request.current_user
    role = user.get("role", "")

    # BDE: only their own clients. HR: all clients.
    clients_query = sb_client.from_("companies").select("company_name").eq("status", "Client")
    if role == "bde":
        clients_query = clients_query.eq("created_by", user["email"])
    clients_res = clients_query.execute()

    client_names = [
        c["company_name"].strip().lower()
        for c in (clients_res.data or [])
        if c.get("company_name")
    ]
    if not client_names:
        return jsonify([])

    revenue_res = sb_client.from_("revenue_tracker").select("*").order("doj", desc=True).execute()
    rows = [
        r for r in (revenue_res.data or [])
        if r.get("client_name", "").strip().lower() in client_names
    ]

    month        = request.args.get("month",        "").strip()
    offer_status = request.args.get("offer_status", "").strip()
    search       = request.args.get("search",       "").strip().lower()

    if month:
        rows = [r for r in rows if (r.get("doj") or "").startswith(month)]
    if offer_status:
        rows = [r for r in rows if r.get("offer_status") == offer_status]
    if search:
        rows = [
            r for r in rows
            if any(search in (r.get(f) or "").lower() for f in ["client_name", "candidate_name", "recruiter_name", "position"])
        ]

    return jsonify(rows)


@bp.route("/bde/closures/summary", methods=["GET"])
@login_required
def get_closures_summary():
    sb_client = sb()
    user = request.current_user
    role = user.get("role", "")

    clients_query = sb_client.from_("companies").select("company_name").eq("status", "Client")
    if role == "bde":
        clients_query = clients_query.eq("created_by", user["email"])
    clients_res = clients_query.execute()

    client_names = [
        c["company_name"].strip().lower()
        for c in (clients_res.data or [])
        if c.get("company_name")
    ]
    if not client_names:
        return jsonify({"total_closures": 0, "total_billing": 0, "total_margin_value": 0, "avg_margin_percent": 0})

    revenue_res = sb_client.from_("revenue_tracker").select("*").order("doj", desc=True).execute()
    rows = [
        r for r in (revenue_res.data or [])
        if r.get("client_name", "").strip().lower() in client_names
    ]

    month        = request.args.get("month",        "").strip()
    offer_status = request.args.get("offer_status", "").strip()
    search       = request.args.get("search",       "").strip().lower()

    if month:
        rows = [r for r in rows if (r.get("doj") or "").startswith(month)]
    if offer_status:
        rows = [r for r in rows if r.get("offer_status") == offer_status]
    if search:
        rows = [
            r for r in rows
            if any(search in (r.get(f) or "").lower() for f in ["client_name", "candidate_name", "recruiter_name", "position"])
        ]

    total_billing = sum(r.get("billing_rate") or 0 for r in rows)
    total_margin  = sum(r.get("margin_value") or 0 for r in rows)
    margin_pcts   = [r.get("margin_percent") for r in rows if r.get("margin_percent") is not None]
    avg_margin_pct = round(sum(margin_pcts) / len(margin_pcts), 2) if margin_pcts else 0

    return jsonify({
        "total_closures":     len(rows),
        "total_billing":      round(total_billing, 2),
        "total_margin_value": round(total_margin, 2),
        "avg_margin_percent": avg_margin_pct,
    })


@bp.route("/bde/closures/months", methods=["GET"])
@login_required
def get_closure_months():
    sb_client = sb()
    user = request.current_user
    role = user.get("role", "")

    clients_query = sb_client.from_("companies").select("company_name").eq("status", "Client")
    if role == "bde":
        clients_query = clients_query.eq("created_by", user["email"])
    clients_res = clients_query.execute()

    valid_companies = {
        (c.get("company_name") or "").strip().lower()
        for c in (clients_res.data or [])
        if c.get("company_name")
    }
    if not valid_companies:
        return jsonify([])

    all_closures = sb_client.from_("revenue_tracker").select("doj, client_name, position").execute().data or []
    filtered = [
        r for r in all_closures
        if (r.get("client_name") or "").strip().lower() in valid_companies
    ]

    months = {r["doj"][:7] for r in filtered if r.get("doj") and len(r.get("doj", "")) >= 7}
    return jsonify(sorted(months, reverse=True))


# =========================
# DASHBOARD
# =========================

@bp.route("/bde/dashboard", methods=["GET"])
@login_required
def dashboard():
    sb_client = sb()
    user = request.current_user
    role = user.get("role", "")

    companies_query = sb_client.from_("companies").select("status, stage")
    if role == "bde":
        companies_query = companies_query.eq("created_by", user["email"])
    companies = companies_query.execute().data or []

    # For requirements and activities, filter to BDE's companies
    company_ids = [c["id"] for c in sb_client.from_("companies").select("id")
                   .eq("created_by", user["email"]).execute().data or []] if role == "bde" else None

    req_query = sb_client.from_("requirements").select("status")
    act_query = sb_client.from_("activities").select("status")
    if company_ids is not None:
        req_query = req_query.in_("company_id", company_ids) if company_ids else req_query.eq("id", -1)
        act_query = act_query.in_("company_id", company_ids) if company_ids else act_query.eq("id", -1)

    requirements = req_query.execute().data or []
    activities   = act_query.execute().data or []

    bde_client_names = [
        c["company_name"].strip().lower()
        for c in companies
        if c.get("status") == "Client" and c.get("company_name")
    ]

    total_closures = 0
    if bde_client_names:
        revenue_res = sb_client.from_("revenue_tracker").select("client_name").execute()
        total_closures = sum(
            1 for r in (revenue_res.data or [])
            if r.get("client_name", "").strip().lower() in bde_client_names
        )

    return jsonify({
        "totalCompanies":      len(companies),
        "leads":               len(companies),
        "clients":             len([c for c in companies if c["status"] == "Client"]),
        "openRequirements":    len([r for r in requirements if r["status"] == "Open"]),
        "closedRequirements":  len([r for r in requirements if r["status"] == "Closed"]),
        "pendingActivities":   len([a for a in activities if a["status"] == "Pending"]),
        "completedActivities": len([a for a in activities if a["status"] == "Completed"]),
        "totalClosures":       total_closures,
    })
