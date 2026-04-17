"""BDE and users APIs used by frontend BDE pages."""
import os
import sqlite3
import uuid
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from backend.services.supabase_client import get_supabase_client

bp = Blueprint("bde", __name__)

_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
_DB_PATH = os.path.join(_DATA_DIR, "bde.sqlite3")
_REVENUE_TARGET = 1000000.0


def _utc_now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _new_id():
    return uuid.uuid4().hex


def _to_float(value, default=0.0):
    try:
        if value is None or value == "":
            return float(default)
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def _to_nullable_float(value):
    try:
        if value is None or value == "":
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_int(value, default=0):
    try:
        if value is None or value == "":
            return int(default)
        return int(value)
    except (TypeError, ValueError):
        return int(default)


def _parse_bool(value):
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in {"1", "true", "yes", "y"}


def _normalize_datetime(value):
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None

    # datetime-local input comes as "YYYY-MM-DDTHH:MM" (naive), keep ISO format.
    try:
        dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
        return dt.isoformat()
    except ValueError:
        return text


def _month_bounds(month_value):
    text = str(month_value or "").strip()
    now = datetime.now(timezone.utc)
    if len(text) == 7 and text[4] == "-":
        year = _to_int(text[:4], now.year)
        month = min(max(_to_int(text[5:7], now.month), 1), 12)
    else:
        year = now.year
        month = now.month

    start = datetime(year, month, 1, tzinfo=timezone.utc)
    if month == 12:
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(year, month + 1, 1, tzinfo=timezone.utc)
    return start.isoformat(), end.isoformat()


def _get_conn():
    conn = sqlite3.connect(_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _init_db():
    os.makedirs(_DATA_DIR, exist_ok=True)
    with _get_conn() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS leads (
                id TEXT PRIMARY KEY,
                company_name TEXT NOT NULL,
                contact_person TEXT,
                email TEXT,
                phone TEXT,
                status TEXT NOT NULL DEFAULT 'New',
                priority TEXT NOT NULL DEFAULT 'Warm',
                source TEXT NOT NULL DEFAULT 'LinkedIn',
                industry TEXT,
                website TEXT,
                notes TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS lead_notes (
                id TEXT PRIMARY KEY,
                lead_id TEXT NOT NULL,
                note TEXT NOT NULL,
                date TEXT NOT NULL,
                FOREIGN KEY (lead_id) REFERENCES leads(id)
            );

            CREATE TABLE IF NOT EXISTS clients (
                id TEXT PRIMARY KEY,
                company_name TEXT NOT NULL,
                contact_person TEXT,
                email TEXT,
                phone TEXT,
                industry TEXT,
                billing_terms TEXT DEFAULT 'Monthly',
                contract_value REAL DEFAULT 0,
                contract_start_date TEXT,
                contract_end_date TEXT,
                assigned_recruiter TEXT,
                assigned_manager TEXT,
                status TEXT DEFAULT 'Active',
                notes TEXT,
                source_lead_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS requirements (
                id TEXT PRIMARY KEY,
                client_id TEXT NOT NULL,
                job_title TEXT NOT NULL,
                skills_csv TEXT,
                experience TEXT,
                salary_min REAL,
                salary_max REAL,
                location TEXT,
                urgency TEXT DEFAULT 'Medium',
                status TEXT DEFAULT 'Open',
                assigned_to TEXT,
                description TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (client_id) REFERENCES clients(id)
            );

            CREATE TABLE IF NOT EXISTS followups (
                id TEXT PRIMARY KEY,
                lead_id TEXT NOT NULL,
                type TEXT DEFAULT 'Call',
                scheduled_at TEXT NOT NULL,
                notes TEXT,
                status TEXT DEFAULT 'Pending',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (lead_id) REFERENCES leads(id)
            );

            CREATE TABLE IF NOT EXISTS communications (
                id TEXT PRIMARY KEY,
                lead_id TEXT NOT NULL,
                type TEXT DEFAULT 'Call',
                subject TEXT,
                content TEXT,
                date TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (lead_id) REFERENCES leads(id)
            );

            CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
            CREATE INDEX IF NOT EXISTS idx_followups_status ON followups(status);
            CREATE INDEX IF NOT EXISTS idx_followups_schedule ON followups(scheduled_at);
            CREATE INDEX IF NOT EXISTS idx_clients_created ON clients(created_at);
            """
        )


def _fetch_users_from_supabase(role=None):
    try:
        supabase = get_supabase_client()
        response = supabase.from_("users").select("id,name,email,role").order("name").execute()
        rows = response.data or []
    except Exception:
        return []

    normalized_role = (role or "").strip().lower()
    users = []
    for row in rows:
        row_role = (row.get("role") or "").strip().lower()
        if normalized_role and row_role != normalized_role:
            continue
        users.append(
            {
                "_id": str(row.get("id")),
                "id": row.get("id"),
                "name": row.get("name") or "",
                "email": row.get("email") or "",
                "role": row_role,
            }
        )
    return users


def _users_by_id():
    users = _fetch_users_from_supabase()
    return {str(u["_id"]): u for u in users}


def _load_lead_map():
    with _get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, company_name, contact_person, email, phone, status, priority, source,
                   industry, website, notes, created_at, updated_at
            FROM leads
            """
        ).fetchall()
    mapping = {}
    for row in rows:
        mapping[row["id"]] = _lead_row_to_api(row, include_history=False)
    return mapping


def _lead_history(lead_id):
    with _get_conn() as conn:
        rows = conn.execute(
            "SELECT note, date FROM lead_notes WHERE lead_id = ? ORDER BY date ASC",
            (lead_id,),
        ).fetchall()
    return [{"note": r["note"], "date": r["date"]} for r in rows]


def _lead_row_to_api(row, include_history=False):
    payload = {
        "_id": row["id"],
        "companyName": row["company_name"],
        "contactPerson": row["contact_person"] or "",
        "email": row["email"] or "",
        "phone": row["phone"] or "",
        "status": row["status"] or "New",
        "priority": row["priority"] or "Warm",
        "source": row["source"] or "LinkedIn",
        "industry": row["industry"] or "",
        "website": row["website"] or "",
        "notes": row["notes"] or "",
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }
    if include_history:
        payload["communicationHistory"] = _lead_history(row["id"])
    return payload


def _client_row_to_api(row, users_lookup):
    recruiter = users_lookup.get(str(row["assigned_recruiter"])) if row["assigned_recruiter"] else None
    manager = users_lookup.get(str(row["assigned_manager"])) if row["assigned_manager"] else None
    return {
        "_id": row["id"],
        "companyName": row["company_name"],
        "contactPerson": row["contact_person"] or "",
        "email": row["email"] or "",
        "phone": row["phone"] or "",
        "industry": row["industry"] or "",
        "billingTerms": row["billing_terms"] or "Monthly",
        "contractValue": _to_float(row["contract_value"], 0),
        "contractStartDate": row["contract_start_date"] or "",
        "contractEndDate": row["contract_end_date"] or "",
        "assignedRecruiter": recruiter,
        "assignedManager": manager,
        "status": row["status"] or "Active",
        "notes": row["notes"] or "",
        "sourceLeadId": row["source_lead_id"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def _requirement_row_to_api(row, client_lookup, users_lookup):
    raw_skills = (row["skills_csv"] or "").strip()
    skills = [s.strip() for s in raw_skills.split(",") if s.strip()]
    return {
        "_id": row["id"],
        "clientId": client_lookup.get(row["client_id"]) if row["client_id"] else None,
        "jobTitle": row["job_title"] or "",
        "skills": skills,
        "experience": row["experience"] or "",
        "salaryMin": row["salary_min"],
        "salaryMax": row["salary_max"],
        "location": row["location"] or "",
        "urgency": row["urgency"] or "Medium",
        "status": row["status"] or "Open",
        "assignedTo": users_lookup.get(str(row["assigned_to"])) if row["assigned_to"] else None,
        "description": row["description"] or "",
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def _followup_row_to_api(row, lead_lookup):
    return {
        "_id": row["id"],
        "leadId": lead_lookup.get(row["lead_id"]) if row["lead_id"] else None,
        "type": row["type"] or "Call",
        "scheduledAt": row["scheduled_at"],
        "notes": row["notes"] or "",
        "status": row["status"] or "Pending",
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def _communication_row_to_api(row, lead_lookup):
    return {
        "_id": row["id"],
        "leadId": lead_lookup.get(row["lead_id"]) if row["lead_id"] else None,
        "type": row["type"] or "Call",
        "subject": row["subject"] or "",
        "content": row["content"] or "",
        "date": row["date"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def _compute_revenue(month_value):
    start_iso, end_iso = _month_bounds(month_value)
    with _get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, company_name, contract_value, created_at, status
            FROM clients
            WHERE created_at >= ? AND created_at < ?
            ORDER BY created_at DESC
            """,
            (start_iso, end_iso),
        ).fetchall()

    total_revenue = 0.0
    by_client = {}
    closed_deals = 0
    for row in rows:
        if (row["status"] or "").strip().lower() == "inactive":
            continue
        revenue = _to_float(row["contract_value"], 0)
        total_revenue += revenue
        closed_deals += 1
        key = row["company_name"] or "Unknown"
        current = by_client.get(key) or {
            "client": key,
            "deals": 0,
            "revenue": 0.0,
            "commission": 0.0,
            "lastDeal": None,
        }
        current["deals"] += 1
        current["revenue"] += revenue
        current["commission"] += revenue * 0.1
        if not current["lastDeal"] or (row["created_at"] or "") > current["lastDeal"]:
            current["lastDeal"] = row["created_at"]
        by_client[key] = current

    by_client_list = sorted(by_client.values(), key=lambda item: item["revenue"], reverse=True)
    average = (total_revenue / closed_deals) if closed_deals else 0.0

    return {
        "month": str(month_value or "")[:7],
        "monthlyTarget": _REVENUE_TARGET,
        "totalRevenue": round(total_revenue, 2),
        "closedDeals": closed_deals,
        "avgDealValue": round(average, 2),
        "commission": round(total_revenue * 0.1, 2),
        "byClient": by_client_list,
    }


@bp.route("/users", methods=["GET"])
def list_users():
    role = (request.args.get("role") or "").strip().lower()
    users = _fetch_users_from_supabase(role=role or None)
    return jsonify(users)


@bp.route("/bde/leads", methods=["GET"])
def list_leads():
    status = (request.args.get("status") or "").strip()
    priority = (request.args.get("priority") or "").strip()
    search = (request.args.get("search") or "").strip().lower()
    limit = _to_int(request.args.get("limit"), 0)

    query = """
        SELECT id, company_name, contact_person, email, phone, status, priority, source,
               industry, website, notes, created_at, updated_at
        FROM leads
        WHERE 1=1
    """
    params = []
    if status:
        query += " AND status = ?"
        params.append(status)
    if priority:
        query += " AND priority = ?"
        params.append(priority)
    if search:
        query += " AND (LOWER(company_name) LIKE ? OR LOWER(contact_person) LIKE ? OR LOWER(email) LIKE ?)"
        wildcard = f"%{search}%"
        params.extend([wildcard, wildcard, wildcard])
    query += " ORDER BY created_at DESC"
    if limit > 0:
        query += " LIMIT ?"
        params.append(limit)

    with _get_conn() as conn:
        rows = conn.execute(query, tuple(params)).fetchall()
    return jsonify({"leads": [_lead_row_to_api(row, include_history=False) for row in rows]})


@bp.route("/bde/leads", methods=["POST"])
def create_lead():
    payload = request.get_json() or {}
    company_name = (payload.get("companyName") or "").strip()
    if not company_name:
        return jsonify({"message": "Company name is required"}), 400

    now = _utc_now_iso()
    lead_id = _new_id()
    lead_values = (
        lead_id,
        company_name,
        (payload.get("contactPerson") or "").strip(),
        (payload.get("email") or "").strip(),
        (payload.get("phone") or "").strip(),
        (payload.get("status") or "New").strip(),
        (payload.get("priority") or "Warm").strip(),
        (payload.get("source") or "LinkedIn").strip(),
        (payload.get("industry") or "").strip(),
        (payload.get("website") or "").strip(),
        (payload.get("notes") or "").strip(),
        now,
        now,
    )

    with _get_conn() as conn:
        conn.execute(
            """
            INSERT INTO leads (
                id, company_name, contact_person, email, phone, status, priority, source,
                industry, website, notes, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            lead_values,
        )

        initial_note = (payload.get("notes") or "").strip()
        if initial_note:
            conn.execute(
                "INSERT INTO lead_notes (id, lead_id, note, date) VALUES (?, ?, ?, ?)",
                (_new_id(), lead_id, initial_note, now),
            )

        row = conn.execute(
            """
            SELECT id, company_name, contact_person, email, phone, status, priority, source,
                   industry, website, notes, created_at, updated_at
            FROM leads
            WHERE id = ?
            """,
            (lead_id,),
        ).fetchone()
    return jsonify(_lead_row_to_api(row, include_history=True)), 201


@bp.route("/bde/leads/<lead_id>", methods=["GET"])
def get_lead(lead_id):
    with _get_conn() as conn:
        row = conn.execute(
            """
            SELECT id, company_name, contact_person, email, phone, status, priority, source,
                   industry, website, notes, created_at, updated_at
            FROM leads
            WHERE id = ?
            """,
            (lead_id,),
        ).fetchone()
    if not row:
        return jsonify({"message": "Lead not found"}), 404
    return jsonify(_lead_row_to_api(row, include_history=True))


@bp.route("/bde/leads/<lead_id>", methods=["PUT"])
def update_lead(lead_id):
    payload = request.get_json() or {}
    now = _utc_now_iso()

    with _get_conn() as conn:
        existing = conn.execute("SELECT id FROM leads WHERE id = ?", (lead_id,)).fetchone()
        if not existing:
            return jsonify({"message": "Lead not found"}), 404

        conn.execute(
            """
            UPDATE leads
            SET company_name = ?, contact_person = ?, email = ?, phone = ?,
                status = ?, priority = ?, source = ?, industry = ?, website = ?,
                notes = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                (payload.get("companyName") or "").strip(),
                (payload.get("contactPerson") or "").strip(),
                (payload.get("email") or "").strip(),
                (payload.get("phone") or "").strip(),
                (payload.get("status") or "New").strip(),
                (payload.get("priority") or "Warm").strip(),
                (payload.get("source") or "LinkedIn").strip(),
                (payload.get("industry") or "").strip(),
                (payload.get("website") or "").strip(),
                (payload.get("notes") or "").strip(),
                now,
                lead_id,
            ),
        )
        row = conn.execute(
            """
            SELECT id, company_name, contact_person, email, phone, status, priority, source,
                   industry, website, notes, created_at, updated_at
            FROM leads
            WHERE id = ?
            """,
            (lead_id,),
        ).fetchone()

    return jsonify(_lead_row_to_api(row, include_history=False))


@bp.route("/bde/leads/<lead_id>/status", methods=["PATCH"])
def update_lead_status(lead_id):
    payload = request.get_json() or {}
    status = (payload.get("status") or "").strip()
    if not status:
        return jsonify({"message": "Status is required"}), 400

    with _get_conn() as conn:
        row = conn.execute("SELECT id FROM leads WHERE id = ?", (lead_id,)).fetchone()
        if not row:
            return jsonify({"message": "Lead not found"}), 404

        conn.execute(
            "UPDATE leads SET status = ?, updated_at = ? WHERE id = ?",
            (status, _utc_now_iso(), lead_id),
        )

    return jsonify({"success": True})


@bp.route("/bde/leads/<lead_id>/notes", methods=["POST"])
def add_lead_note(lead_id):
    payload = request.get_json() or {}
    note = (payload.get("note") or "").strip()
    if not note:
        return jsonify({"message": "Note is required"}), 400

    now = _utc_now_iso()
    with _get_conn() as conn:
        row = conn.execute("SELECT id FROM leads WHERE id = ?", (lead_id,)).fetchone()
        if not row:
            return jsonify({"message": "Lead not found"}), 404
        conn.execute(
            "INSERT INTO lead_notes (id, lead_id, note, date) VALUES (?, ?, ?, ?)",
            (_new_id(), lead_id, note, now),
        )
        conn.execute(
            "UPDATE leads SET updated_at = ? WHERE id = ?",
            (now, lead_id),
        )
    return jsonify({"success": True})


@bp.route("/bde/leads/<lead_id>/convert", methods=["POST"])
def convert_lead_to_client(lead_id):
    now = _utc_now_iso()
    with _get_conn() as conn:
        lead = conn.execute(
            """
            SELECT id, company_name, contact_person, email, phone, industry, notes
            FROM leads
            WHERE id = ?
            """,
            (lead_id,),
        ).fetchone()
        if not lead:
            return jsonify({"message": "Lead not found"}), 404

        existing = conn.execute(
            "SELECT id FROM clients WHERE source_lead_id = ? LIMIT 1",
            (lead_id,),
        ).fetchone()
        if existing:
            conn.execute(
                "UPDATE leads SET status = 'Converted', updated_at = ? WHERE id = ?",
                (now, lead_id),
            )
            return jsonify({"success": True, "clientId": existing["id"]})

        client_id = _new_id()
        conn.execute(
            """
            INSERT INTO clients (
                id, company_name, contact_person, email, phone, industry, billing_terms,
                contract_value, contract_start_date, contract_end_date, assigned_recruiter,
                assigned_manager, status, notes, source_lead_id, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, 'Monthly', 0, NULL, NULL, NULL, NULL, 'Active', ?, ?, ?, ?)
            """,
            (
                client_id,
                lead["company_name"],
                lead["contact_person"] or "",
                lead["email"] or "",
                lead["phone"] or "",
                lead["industry"] or "",
                lead["notes"] or "",
                lead_id,
                now,
                now,
            ),
        )
        conn.execute(
            "UPDATE leads SET status = 'Converted', updated_at = ? WHERE id = ?",
            (now, lead_id),
        )

    return jsonify({"success": True, "clientId": client_id}), 201


@bp.route("/bde/clients", methods=["GET"])
def list_clients():
    with _get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, company_name, contact_person, email, phone, industry, billing_terms,
                   contract_value, contract_start_date, contract_end_date, assigned_recruiter,
                   assigned_manager, status, notes, source_lead_id, created_at, updated_at
            FROM clients
            ORDER BY created_at DESC
            """
        ).fetchall()
    users_lookup = _users_by_id()
    return jsonify({"clients": [_client_row_to_api(row, users_lookup) for row in rows]})


@bp.route("/bde/clients", methods=["POST"])
def create_client():
    payload = request.get_json() or {}
    company_name = (payload.get("companyName") or "").strip()
    if not company_name:
        return jsonify({"message": "Company name is required"}), 400

    now = _utc_now_iso()
    client_id = _new_id()
    with _get_conn() as conn:
        conn.execute(
            """
            INSERT INTO clients (
                id, company_name, contact_person, email, phone, industry, billing_terms,
                contract_value, contract_start_date, contract_end_date, assigned_recruiter,
                assigned_manager, status, notes, source_lead_id, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                client_id,
                company_name,
                (payload.get("contactPerson") or "").strip(),
                (payload.get("email") or "").strip(),
                (payload.get("phone") or "").strip(),
                (payload.get("industry") or "").strip(),
                (payload.get("billingTerms") or "Monthly").strip(),
                _to_float(payload.get("contractValue"), 0),
                (payload.get("contractStartDate") or "").strip() or None,
                (payload.get("contractEndDate") or "").strip() or None,
                (payload.get("assignedRecruiter") or "").strip() or None,
                (payload.get("assignedManager") or "").strip() or None,
                (payload.get("status") or "Active").strip(),
                (payload.get("notes") or "").strip(),
                (payload.get("sourceLeadId") or "").strip() or None,
                now,
                now,
            ),
        )
        row = conn.execute(
            """
            SELECT id, company_name, contact_person, email, phone, industry, billing_terms,
                   contract_value, contract_start_date, contract_end_date, assigned_recruiter,
                   assigned_manager, status, notes, source_lead_id, created_at, updated_at
            FROM clients
            WHERE id = ?
            """,
            (client_id,),
        ).fetchone()
    users_lookup = _users_by_id()
    return jsonify(_client_row_to_api(row, users_lookup)), 201


@bp.route("/bde/requirements", methods=["GET"])
def list_requirements():
    with _get_conn() as conn:
        req_rows = conn.execute(
            """
            SELECT id, client_id, job_title, skills_csv, experience, salary_min, salary_max,
                   location, urgency, status, assigned_to, description, created_at, updated_at
            FROM requirements
            ORDER BY created_at DESC
            """
        ).fetchall()
        client_rows = conn.execute(
            """
            SELECT id, company_name, contact_person, email, phone, industry, billing_terms,
                   contract_value, contract_start_date, contract_end_date, assigned_recruiter,
                   assigned_manager, status, notes, source_lead_id, created_at, updated_at
            FROM clients
            """
        ).fetchall()

    users_lookup = _users_by_id()
    client_lookup = {row["id"]: _client_row_to_api(row, users_lookup) for row in client_rows}
    data = [_requirement_row_to_api(row, client_lookup, users_lookup) for row in req_rows]
    return jsonify({"requirements": data})


@bp.route("/bde/requirements", methods=["POST"])
def create_requirement():
    payload = request.get_json() or {}
    client_id = (payload.get("clientId") or "").strip()
    job_title = (payload.get("jobTitle") or "").strip()
    if not client_id or not job_title:
        return jsonify({"message": "clientId and jobTitle are required"}), 400

    skills = payload.get("skills") or []
    if isinstance(skills, list):
        skills_csv = ", ".join([str(s).strip() for s in skills if str(s).strip()])
    else:
        skills_csv = str(skills).strip()

    now = _utc_now_iso()
    requirement_id = _new_id()
    with _get_conn() as conn:
        client_exists = conn.execute("SELECT id FROM clients WHERE id = ?", (client_id,)).fetchone()
        if not client_exists:
            return jsonify({"message": "Client not found"}), 404

        conn.execute(
            """
            INSERT INTO requirements (
                id, client_id, job_title, skills_csv, experience, salary_min, salary_max,
                location, urgency, status, assigned_to, description, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                requirement_id,
                client_id,
                job_title,
                skills_csv,
                (payload.get("experience") or "").strip(),
                _to_nullable_float(payload.get("salaryMin")),
                _to_nullable_float(payload.get("salaryMax")),
                (payload.get("location") or "").strip(),
                (payload.get("urgency") or "Medium").strip(),
                (payload.get("status") or "Open").strip(),
                (payload.get("assignedTo") or "").strip() or None,
                (payload.get("description") or "").strip(),
                now,
                now,
            ),
        )

    return jsonify({"success": True, "_id": requirement_id}), 201


@bp.route("/bde/followups", methods=["GET"])
def list_followups():
    pending_only = _parse_bool(request.args.get("pending"))
    limit = _to_int(request.args.get("limit"), 0)

    query = """
        SELECT id, lead_id, type, scheduled_at, notes, status, created_at, updated_at
        FROM followups
        WHERE 1=1
    """
    params = []
    if pending_only:
        query += " AND status = 'Pending'"
    query += " ORDER BY scheduled_at ASC"
    if limit > 0:
        query += " LIMIT ?"
        params.append(limit)

    with _get_conn() as conn:
        rows = conn.execute(query, tuple(params)).fetchall()
    lead_lookup = _load_lead_map()
    data = [_followup_row_to_api(row, lead_lookup) for row in rows]
    return jsonify({"followups": data})


@bp.route("/bde/followups", methods=["POST"])
def create_followup():
    payload = request.get_json() or {}
    lead_id = (payload.get("leadId") or "").strip()
    scheduled_at = _normalize_datetime(payload.get("scheduledAt"))
    if not lead_id or not scheduled_at:
        return jsonify({"message": "leadId and scheduledAt are required"}), 400

    now = _utc_now_iso()
    with _get_conn() as conn:
        lead_exists = conn.execute("SELECT id FROM leads WHERE id = ?", (lead_id,)).fetchone()
        if not lead_exists:
            return jsonify({"message": "Lead not found"}), 404

        followup_id = _new_id()
        conn.execute(
            """
            INSERT INTO followups (id, lead_id, type, scheduled_at, notes, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                followup_id,
                lead_id,
                (payload.get("type") or "Call").strip(),
                scheduled_at,
                (payload.get("notes") or "").strip(),
                (payload.get("status") or "Pending").strip(),
                now,
                now,
            ),
        )

    return jsonify({"success": True, "_id": followup_id}), 201


@bp.route("/bde/followups/<followup_id>/status", methods=["PATCH"])
def update_followup_status(followup_id):
    payload = request.get_json() or {}
    status = (payload.get("status") or "").strip()
    if not status:
        return jsonify({"message": "Status is required"}), 400

    with _get_conn() as conn:
        row = conn.execute("SELECT id FROM followups WHERE id = ?", (followup_id,)).fetchone()
        if not row:
            return jsonify({"message": "Follow-up not found"}), 404
        conn.execute(
            "UPDATE followups SET status = ?, updated_at = ? WHERE id = ?",
            (status, _utc_now_iso(), followup_id),
        )
    return jsonify({"success": True})


@bp.route("/bde/communications", methods=["GET"])
def list_communications():
    lead_id = (request.args.get("leadId") or "").strip()
    query = """
        SELECT id, lead_id, type, subject, content, date, created_at, updated_at
        FROM communications
        WHERE 1=1
    """
    params = []
    if lead_id:
        query += " AND lead_id = ?"
        params.append(lead_id)
    query += " ORDER BY date DESC"

    with _get_conn() as conn:
        rows = conn.execute(query, tuple(params)).fetchall()
    lead_lookup = _load_lead_map()
    return jsonify({"logs": [_communication_row_to_api(row, lead_lookup) for row in rows]})


@bp.route("/bde/communications", methods=["POST"])
def create_communication():
    payload = request.get_json() or {}
    lead_id = (payload.get("leadId") or "").strip()
    if not lead_id:
        return jsonify({"message": "leadId is required"}), 400
    log_date = _normalize_datetime(payload.get("date")) or _utc_now_iso()

    now = _utc_now_iso()
    with _get_conn() as conn:
        lead_exists = conn.execute("SELECT id FROM leads WHERE id = ?", (lead_id,)).fetchone()
        if not lead_exists:
            return jsonify({"message": "Lead not found"}), 404

        log_id = _new_id()
        conn.execute(
            """
            INSERT INTO communications (id, lead_id, type, subject, content, date, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                log_id,
                lead_id,
                (payload.get("type") or "Call").strip(),
                (payload.get("subject") or "").strip(),
                (payload.get("content") or "").strip(),
                log_date,
                now,
                now,
            ),
        )
    return jsonify({"success": True, "_id": log_id}), 201


@bp.route("/bde/dashboard/pipeline", methods=["GET"])
def dashboard_pipeline():
    with _get_conn() as conn:
        rows = conn.execute(
            """
            SELECT status, COUNT(*) AS count
            FROM leads
            GROUP BY status
            """
        ).fetchall()
    order = ["New", "Contacted", "Interested", "Negotiation", "Converted", "Lost"]
    counts = {row["status"]: _to_int(row["count"], 0) for row in rows}
    payload = [{"_id": stage, "count": counts.get(stage, 0)} for stage in order if counts.get(stage, 0) > 0]
    return jsonify(payload)


@bp.route("/bde/dashboard/stats", methods=["GET"])
def dashboard_stats():
    with _get_conn() as conn:
        total_leads = conn.execute("SELECT COUNT(*) AS c FROM leads").fetchone()["c"]
        active_leads = conn.execute(
            """
            SELECT COUNT(*) AS c
            FROM leads
            WHERE status IN ('New', 'Contacted', 'Interested', 'Negotiation')
            """
        ).fetchone()["c"]
        converted = conn.execute("SELECT COUNT(*) AS c FROM leads WHERE status = 'Converted'").fetchone()["c"]
        lost = conn.execute("SELECT COUNT(*) AS c FROM leads WHERE status = 'Lost'").fetchone()["c"]
        pending = conn.execute("SELECT COUNT(*) AS c FROM followups WHERE status = 'Pending'").fetchone()["c"]

        start_iso, end_iso = _month_bounds(datetime.now(timezone.utc).strftime("%Y-%m"))
        new_requirements = conn.execute(
            "SELECT COUNT(*) AS c FROM requirements WHERE created_at >= ? AND created_at < ?",
            (start_iso, end_iso),
        ).fetchone()["c"]

    revenue = _compute_revenue(datetime.now(timezone.utc).strftime("%Y-%m"))
    return jsonify(
        {
            "totalLeads": _to_int(total_leads, 0),
            "activeLeads": _to_int(active_leads, 0),
            "convertedClients": _to_int(converted, 0),
            "lostLeads": _to_int(lost, 0),
            "monthlyRevenue": _to_float(revenue.get("totalRevenue"), 0),
            "pendingFollowups": _to_int(pending, 0),
            "newRequirements": _to_int(new_requirements, 0),
        }
    )


@bp.route("/bde/revenue", methods=["GET"])
def bde_revenue():
    month = request.args.get("month")
    return jsonify(_compute_revenue(month))


_init_db()
