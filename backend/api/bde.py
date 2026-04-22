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
        "created_by": get_current_user(),  # logged-in user name
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
        "created_by": get_current_user(), # logged-in user name
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
# DAILY TRACKER
# =========================

@bp.route("/bde/daily-tracker", methods=["GET"])
def get_daily_tracker():
    from datetime import date
    import traceback

    try:
        today = date.today().isoformat()
        start = f"{today}T00:00:00"
        end   = f"{today}T23:59:59"

        bde_name = request.args.get("bde", "").strip()

        sb_client = sb()

        # Fetch companies
        companies_query = sb_client.from_("companies") \
            .select("*") \
            .gte("created_at", start) \
            .lte("created_at", end)

        if bde_name:
            companies_query = companies_query.eq("created_by", bde_name)

        companies_res = companies_query.execute()
        companies_rows = companies_res.data or []

        # Remap company fields
        mapped_companies = [
            {
                **row,
                "activity_date": row.get("created_at"),
                "lead_name":     row.get("contact_person") or row.get("company_name"),
                "company_name": row.get("company_name") or "",
                "source":        row.get("source") or row.get("stage") or "",
                "phone":         row.get("phone") or "",
                "email":         row.get("email") or "",
                "status":        row.get("status") or "",
                "remarks":       row.get("remarks") or "",
                "activity_type": "new_lead",
            }
            for row in companies_rows
        ]

        # Fetch activities for today (including follow ups)
        activities_query = sb_client.from_("activities") \
            .select("*") \
            .gte("activity_datetime", start) \
            .lte("activity_datetime", end)

        if bde_name:
            activities_query = activities_query.eq("created_by", bde_name)

        activities_res = activities_query.execute()
        activities_rows = activities_res.data or []

        # Fetch company names for mapping
        company_ids = [r.get("company_id") for r in activities_rows if r.get("company_id")]
        company_map = {}
        if company_ids:
            companies_for_map = sb_client.from_("companies") \
                .select("id, company_name") \
                .in_("id", company_ids) \
                .execute().data or []
            company_map = {c["id"]: c["company_name"] for c in companies_for_map}

        # Remap activity fields
        mapped_activities = [
            {
                **row,
                "activity_date": row.get("activity_datetime"),
                "lead_name":     row.get("contact_person") or company_map.get(row.get("company_id"), ""),
                "company_name": company_map.get(row.get("company_id"), ""),
                "source":        row.get("type") or "",
                "phone":         row.get("phone") or "",
                "email":         row.get("email") or "",
                "status":        row.get("status") or "",
                "remarks":       row.get("notes") or "",
                "activity_type": row.get("type") or "",
            }
            for row in activities_rows
        ]

        # Combine companies and activities
        all_mapped = mapped_companies + mapped_activities

        return jsonify(all_mapped)

    except Exception as e:
        traceback.print_exc()  # prints full error in Flask terminal
        return jsonify({"error": str(e)}), 500

# =========================
# WEEKLY TRACKER
# =========================

@bp.route("/bde/weekly-tracker", methods=["GET"])
def get_weekly_tracker():
    from datetime import date, timedelta

    sb_client = sb()

    # Optional: filter by logged-in user name
    user_name = request.args.get("user", "").strip()

    today = date.today()
    weeks = []
    current_week_start = today - timedelta(days=today.weekday())

    for i in range(8):
        week_start = current_week_start - timedelta(weeks=i)
        week_end = week_start + timedelta(days=6)
        weeks.append((week_start, week_end))

    # Fetch companies — filter by created_by if user provided
    companies_query = sb_client.from_("companies").select("id, company_name, status, stage, created_at, created_by")
    if user_name:
        companies_query = companies_query.eq("created_by", user_name)
    companies = companies_query.execute().data or []
    company_ids = {c["id"] for c in companies if c.get("id") is not None}
    client_names = {
        (c.get("company_name") or "").strip().lower()
        for c in companies
        if (c.get("status") == "Client") and c.get("company_name")
    }

    # Fetch activities — filter by created_by if user provided
    activities_query = sb_client.from_("activities").select("id, type, status, activity_datetime, company_id, created_by")
    if user_name:
        activities_query = activities_query.eq("created_by", user_name)
    activities = activities_query.execute().data or []

    requirements = sb_client.from_("requirements") \
        .select("id, company_id, created_at") \
        .execute().data or []

    # Fetch revenue_tracker for joined candidates
    revenue_res = sb_client.from_("revenue_tracker") \
        .select("client_name, doj, offer_status") \
        .execute()
    revenue = revenue_res.data or []

    result = []

    for week_start, week_end in weeks:
        ws = week_start.isoformat()
        we = week_end.isoformat()
        week_label = f"W{week_start.isocalendar()[1]}, {week_start.strftime('%d/%m')}"

        week_activities = [
            a for a in activities
            if a.get("activity_datetime") and ws <= a["activity_datetime"][:10] <= we
        ]

        week_companies = [
            c for c in companies
            if c.get("created_at") and ws <= c["created_at"][:10] <= we
        ]

        week_requirements = [
            r for r in requirements
            if r.get("created_at")
            and ws <= r["created_at"][:10] <= we
        ]

        week_closures = [
            r for r in revenue
            if r.get("doj")
            and ws <= r["doj"][:10] <= we
            and (
                not user_name
                or (r.get("client_name") or "").strip().lower() in client_names
            )
        ]

        new_clients = len([
            r for r in week_closures
            if r.get("offer_status") == "Joined"
        ])

        result.append({
            "week": week_label,
            "week_start": ws,
            "week_end": we,
            "bdName": user_name or "All",
            "newClients": new_clients,
            "totalLeadGeneration": len(week_companies),
            "requirements": len(week_requirements),
            "closures": len(week_closures),
            "newLeadsEmail": len([a for a in week_activities if a.get("type") == "Email"]),
            "newLeadsPhone": len([a for a in week_activities if a.get("type") == "Call"]),
            "newLeadsLinkedIn": len([a for a in week_activities if a.get("type") == "LinkedIn"]),
            "responsesReceived": len([a for a in week_activities if a.get("type") == "Proposal"]),
            "followUps": len([a for a in week_activities if a.get("status") == "Pending"]),
            "clientMeet": len([a for a in week_activities if a.get("type") == "Meeting"]),
        })

    return jsonify(result)


@bp.route("/bde/weekly-team-performance", methods=["GET"])
def get_weekly_team_performance():
    from datetime import date, timedelta

    sb_client = sb()
    week_start_param = request.args.get("week_start", "").strip()

    today = date.today()
    current_week_end = today - timedelta(days=today.weekday())
    default_week_start = current_week_end - timedelta(days=6)

    try:
        week_start = date.fromisoformat(week_start_param) if week_start_param else default_week_start
    except ValueError:
        week_start = default_week_start

    week_end = week_start + timedelta(days=6)
    ws = week_start.isoformat()
    we = week_end.isoformat()

    companies = sb_client.from_("companies") \
        .select("id, company_name, status, created_by, created_at") \
        .execute().data or []

    requirements = sb_client.from_("requirements") \
        .select("id, company_id, created_at") \
        .execute().data or []

    activities = sb_client.from_("activities") \
        .select("type, company_id, created_by, activity_datetime") \
        .execute().data or []

    revenue = sb_client.from_("revenue_tracker") \
        .select("client_name, doj, recruiter_name") \
        .execute().data or []

    team_map = {}
    company_owner = {}
    client_owner = {}

    for company in companies:
        owner = (company.get("created_by") or "").strip() or "manager"
        team_map.setdefault(owner, {
            "name": owner,
            "requirements": 0,
            "meets": 0,
            "closures": 0,
        })
        if company.get("id") is not None:
            company_owner[company["id"]] = owner
        client_name = (company.get("company_name") or "").strip().lower()
        if client_name and company.get("status") == "Client":
            client_owner[client_name] = owner

    for activity in activities:
        owner = (activity.get("created_by") or "").strip() or company_owner.get(activity.get("company_id")) or "manager"
        team_map.setdefault(owner, {
            "name": owner,
            "requirements": 0,
            "meets": 0,
            "closures": 0,
        })

    for row in revenue:
        revenue_owner = (row.get("recruiter_name") or "").strip()
        owner = revenue_owner or client_owner.get((row.get("client_name") or "").strip().lower()) or "manager"
        team_map.setdefault(owner, {
            "name": owner,
            "requirements": 0,
            "meets": 0,
            "closures": 0,
        })

    for req in requirements:
        created_at = req.get("created_at")
        owner = company_owner.get(req.get("company_id"))
        if created_at and owner and ws <= created_at[:10] <= we:
            team_map.setdefault(owner, {"name": owner, "requirements": 0, "meets": 0, "closures": 0})
            team_map[owner]["requirements"] += 1

    for activity in activities:
        activity_date = activity.get("activity_datetime")
        owner = (activity.get("created_by") or "").strip() or company_owner.get(activity.get("company_id")) or "manager"
        if activity_date and ws <= activity_date[:10] <= we and activity.get("type") == "Meeting":
            team_map.setdefault(owner, {"name": owner, "requirements": 0, "meets": 0, "closures": 0})
            team_map[owner]["meets"] += 1

    for row in revenue:
        doj = row.get("doj")
        revenue_owner = (row.get("recruiter_name") or "").strip()
        owner = revenue_owner or client_owner.get((row.get("client_name") or "").strip().lower()) or "manager"
        if doj and owner and ws <= doj[:10] <= we:
            team_map.setdefault(owner, {"name": owner, "requirements": 0, "meets": 0, "closures": 0})
            team_map[owner]["closures"] += 1

    result = sorted(
        [
            item for item in team_map.values()
            if item["requirements"] > 0 or item["meets"] > 0 or item["closures"] > 0
        ],
        key=lambda item: (item["requirements"] + item["meets"] + item["closures"], item["name"].lower()),
        reverse=True,
    )

    return jsonify(result)


# =========================
# PAGE CLOSURES
# =========================

@bp.route("/bde/closures", methods=["GET"])
def get_closures():
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
        .select("*") \
        .order("doj", desc=True) \
        .execute()

    rows = revenue_res.data or []

    rows = [
        r for r in rows
        if r.get("client_name", "").strip().lower() in client_names
    ]

    month = request.args.get("month", "").strip()
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
                months.add(doj[:7])

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
