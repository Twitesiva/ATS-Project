# ATS Database Tables - Complete Reference

## 1. STATUS HISTORY TABLE (`status_history`)
**Purpose:** Tracks all status changes/transitions for candidates. Stores old and new status for audit trail.

### Table Fields
| Field | Type | Purpose |
|-------|------|---------|
| `id` | integer (PK) | Primary key |
| `candidate_id` | integer | Foreign key linking to candidate_records.sl_no |
| `recruiter_name` | string | Recruiter who made the status change |
| `candidate_name` | string | Candidate full name |
| `client_name` | string | Client company name |
| `requirement` | string | Job requirement/position |
| `old_status` | string | Previous status (nullable) |
| `new_status` | string | Current/new status |
| `updated_at` | timestamp | ISO datetime of the change |

### Build Function (JavaScript)
```javascript
const buildHistoryRow = ({
  candidateId,
  recruiterName,
  candidateName,
  clientName,
  requirement,
  oldStatus,
  newStatus,
}) => ({
  candidate_id: toHistoryCandidateId(candidateId),
  recruiter_name: recruiterName || "-",
  candidate_name: candidateName || "-",
  client_name: clientName || null,
  requirement: requirement || null,
  old_status: oldStatus ?? null,
  new_status: newStatus || "Profile Submitted",
  updated_at: new Date().toISOString(),
});
```

### Key Queries

**Fetch all history with deduplication (Manager History page):**
```javascript
const { data, error } = await supabase
  .from("status_history")
  .select("id,candidate_id,recruiter_name,candidate_name,new_status,updated_at")
  .order("updated_at", { ascending: false })
  .order("id", { ascending: false });

// Deduplication logic: unique key = recruiter_name + candidate_id + new_status
const dedupeHistoryRows = (rows) => {
  const sorted = rows.sort((a, b) => 
    new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
  const seen = new Set();
  const deduped = [];
  sorted.forEach((row) => {
    const key = `${row.recruiter_name}-${row.candidate_id}-${row.new_status}`;
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(row);
  });
  return deduped;
};
```

**Insert status history:**
```javascript
const insertStatusHistoryRows = async (rows, source) => {
  const payload = Array.isArray(rows) ? rows : [rows];
  const { data, error } = await supabase
    .from("status_history")
    .insert(payload)
    .select("*");
  
  if (error) {
    console.error(`[status_history][${source}] insert failed`, { error, payload });
    return { ok: false, error };
  }
  console.log(`[status_history][${source}] insert success`, data || []);
  return { ok: true, data: data || [] };
};
```

**Update status history (when status changes):**
```javascript
// Look up latest history record for a candidate
const { data: existingHistoryRows, error: historyLookupError } = await supabase
  .from("status_history")
  .select("id")
  .eq("candidate_id", candidateHistoryId)
  .order("updated_at", { ascending: false });

if (existingHistoryRows?.length > 0) {
  const latestHistoryRowId = existingHistoryRows[0].id;
  const { error: historyUpdateError } = await supabase
    .from("status_history")
    .update(historyPayload)
    .eq("id", latestHistoryRowId);
}
```

### File Locations
- **Main History Display:** [frontend/src/pages/manager/History.jsx](frontend/src/pages/manager/History.jsx) (Lines 53-74)
- **History Row Building:** [frontend/src/pages/recruiter/Data.jsx](frontend/src/pages/recruiter/Data.jsx) (Lines 268-295)
- **Insert Function:** [frontend/src/pages/recruiter/Data.jsx](frontend/src/pages/recruiter/Data.jsx) (Lines 33-42)
- **Activity Tracking:** [frontend/src/pages/manager/Recruiters.jsx](frontend/src/pages/manager/Recruiters.jsx) (Line 63 queries this)

---

## 2. CANDIDATE RECORDS TABLE (`candidate_records`)
**Purpose:** Main table for recruiter-managed candidate data. Stores all candidate information and interview scheduling details.

### Table Fields
| Field | Type | Purpose |
|-------|------|---------|
| `id` | integer (PK) | Primary key |
| `sl_no` | integer | Serial number for display |
| `record_date` | date | Date candidate was added |
| `recruiter` | string | Recruiter assigned (or "manager" for manager view) |
| `client_name` | string | Client company |
| `requirement` | string | Job requirement/position |
| `location` | string | Work location |
| `candidate_name` | string | Candidate full name |
| `phone_number` | string | Phone contact |
| `email` | string | Email address |
| `ctc` | numeric | Current salary |
| `ectc` | numeric | Expected salary |
| `hire_mode` | string | Hire type (Direct, Contract, etc.) |
| `status` | string | Current interview/hiring status |
| `remarks` | string | Free text notes |
| `interview_date` | date | Scheduled interview date |
| `interview_time` | time | Scheduled interview time |

### Interview Statuses/Stages
```javascript
const INTERVIEW_STATUSES = [
  "Profile Submitted",      // Initial state
  "Feedback Pending",       // Awaiting client feedback
  "Duplicate",              // Duplicate profile
  "Drop Out By Client",     // Client rejected
  "Drop Out By Candidate",  // Candidate withdrew
  "Assessment Round",       // Assessment/coding round
  "HR Round",              // HR interview round
  "L1 Scheduled",          // Level 1 interview scheduled
  "L2 Scheduled",          // Level 2 interview scheduled
  "AI Interview",          // AI/Automated interview
  "Interview Scheduled",   // Generic interview scheduled
  "Shortlisted",           // Post-interview shortlist
  "Offered",               // Offer given
  "Backout",               // Candidate backout
  "Closure",               // Successful hire (moved to revenue_tracker)
  "L1 Reject",             // L1 rejection
  "L2 Reject",             // L2 rejection
  "Final Round Rejected",  // Final round rejection
  "Position Hold",         // Position put on hold
  "Position Closed",       // Position filled/closed
];
```

### Fetch Query
```javascript
const fetchRecords = async () => {
  let query = supabase
    .from("candidate_records")
    .select("*")
    .order("record_date", { ascending: false });

  // Filter by recruiter (or manager)
  if (isManagerView) {
    query = query.eq("recruiter", "manager");
  } else {
    query = query.eq("recruiter", user?.name);
  }

  // Search filter
  if (searchText) {
    query = query.ilike(searchBy, `%${searchText}%`);
  }

  // Record date filters
  if (fromDate) query = query.gte("record_date", fromDate);
  if (toDate) query = query.lte("record_date", toDate);

  // Interview date filters
  if (interviewFromDate) query = query.gte("interview_date", interviewFromDate);
  if (interviewToDate) query = query.lte("interview_date", interviewToDate);

  const { data, error } = await query;
  if (!error) setRecords(data || []);
};
```

### Insert New Candidate
```javascript
const payload = {
  sl_no: Number(form.sl_no),
  record_date: form.record_date,
  recruiter: isManagerView ? "manager" : user?.name,
  client_name: form.client_name,
  requirement: form.requirement,
  location: form.location,
  candidate_name: form.candidate_name,
  phone_number: form.phone_number,
  email: form.email,
  ctc: form.ctc,
  ectc: form.ectc,
  hire_mode: form.hire_mode,
  status: form.status,
  remarks: form.remarks,
  interview_date: form.interview_date,
  interview_time: form.interview_time,
};

const { data: insertedRow, error } = await supabase
  .from("candidate_records")
  .insert({ ...payload })
  .select("sl_no,recruiter,candidate_name,client_name,requirement,status")
  .single();
```

### Update Status (with history tracking)
```javascript
if (statusChanged) {
  let query = supabase
    .from("candidate_records")
    .update({ status: form.status })
    .eq("id", record.id);

  if (user?.role !== "manager") {
    query = query.eq("recruiter", user?.name);
  }

  const { data: updatedRows, error } = await query
    .select("id,sl_no,recruiter,candidate_name,client_name,requirement,status");

  // Then insert into status_history
  const historyPayload = {
    candidate_id: updatedRows[0].sl_no,
    recruiter_name: updatedRows[0].recruiter || user?.name || "-",
    candidate_name: updatedRows[0].candidate_name || "-",
    new_status: updatedRows[0].status || form.status,
    updated_at: new Date().toISOString(),
  };
  await supabase.from("status_history").insert([historyPayload]);
}
```

### Closure Flow (Auto-move to revenue_tracker)
```javascript
// When status is set to "Closure"
if ((form.status || "").trim().toLowerCase() === "closure") {
  const revenuePayload = {
    s_no: record.sl_no,
    doj: new Date().toISOString().split("T")[0],
    recruiter_name: record.recruiter || user?.name,
    candidate_name: form.candidate_name || record.candidate_name || "",
    client_name: form.client_name || record.client_name || "",
    position: form.requirement || record.requirement || "",
    location: form.location || record.location || "",
    hire: form.hire_mode || record.hire_mode || "",
    ctc: toNullableNumber(form.ctc) || record.ctc || null,
    offered_ctc: toNullableNumber(form.ectc) || record.ectc || null,
    billing_rate: null,
    margin_value: null,
    margin_percent: null,
  };

  // Insert into revenue_tracker
  const { error: revenueError } = await supabase
    .from("revenue_tracker")
    .insert([revenuePayload]);

  // Update status in candidate_records to "Closure"
  const { error: updateError } = await supabase
    .from("candidate_records")
    .update({ status: "Closure" })
    .eq("id", record.id);
}
```

### File Locations
- **Main Data Management:** [frontend/src/pages/recruiter/Data.jsx](frontend/src/pages/recruiter/Data.jsx)
  - Lines 130-162: Fetch with filters
  - Lines 590-615: Insert new candidate
  - Lines 1130-1310: Update status with history
  - Lines 1401-1420: Status dropdown options
- **Interview Scheduling:** Lines 705-710 (Interview date/time filters)
- **Table Display:** Lines 728-770 (Columns including interview_date, interview_time)

---

## 3. REVENUE TRACKER TABLE (`revenue_tracker`)
**Purpose:** Tracks successful hires/closures. Candidates moved here when status = "Closure".

### Table Fields
| Field | Type | Purpose |
|-------|------|---------|
| `id` | integer (PK) | Primary key |
| `s_no` | integer | Serial number |
| `doj` | date | Date of joining |
| `recruiter_name` | string | Recruiter who closed it |
| `candidate_name` | string | Hired candidate name |
| `client_name` | string | Client company |
| `position` | string | Job position |
| `location` | string | Work location |
| `hire` | string | Hire mode |
| `ctc` | numeric | Cost to client |
| `offered_ctc` | numeric | Offered CTC to candidate |
| `billing_rate` | numeric | Billing rate |
| `margin_value` | numeric | Profit margin |
| `margin_percent` | numeric | Profit percentage |
| `offer_status` | string | "YES" or "NO" for offer acceptance |

### Data Entry (Auto-populated from candidate_records)
When a candidate record status is changed to "Closure", the system automatically:
1. Creates a revenue_tracker entry with the candidate data
2. Checks for duplicates (candidate_name + client_name + recruiter_name)
3. Updates the candidate_records status to "Closure"

**Key Code Block:**
```javascript
// From EditCandidateModal in Data.jsx
const revenuePayload = {
  s_no: record.sl_no,
  doj: new Date().toISOString().split("T")[0],
  recruiter_name: record.recruiter || user?.name,
  candidate_name: form.candidate_name || record.candidate_name || "",
  client_name: form.client_name || record.client_name || "",
  position: form.requirement || record.requirement || "",
  location: form.location || record.location || "",
  hire: form.hire_mode || record.hire_mode || "",
  ctc: toNullableNumber(form.ctc) || record.ctc || null,
  offered_ctc: toNullableNumber(form.ectc) || record.ectc || null,
  billing_rate: null,
  margin_value: null,
  margin_percent: null,
};

const { error: revenueError } = await supabase
  .from("revenue_tracker")
  .insert([revenuePayload]);
```

### Duplicate Check
```javascript
const { data: existing } = await supabase
  .from("revenue_tracker")
  .select("id")
  .eq("candidate_name", revenuePayload.candidate_name)
  .eq("client_name", revenuePayload.client_name)
  .eq("recruiter_name", revenuePayload.recruiter_name)
  .limit(1);

if (existing && existing.length > 0) {
  alert("Candidate already exists in Revenue Tracker!");
  return;
}
```

### File Locations
- **Closure Logic:** [frontend/src/pages/recruiter/Data.jsx](frontend/src/pages/recruiter/Data.jsx) Lines 1130-1190
- **Revenue Tracker Display:** [frontend/src/pages/manager/RevenueTracker.jsx](frontend/src/pages/manager/RevenueTracker.jsx) Lines 1-25 (columns definition)
- **Column Mapping:** Lines 20-32 in RevenueTracker.jsx

---

## 4. ACTIVITY TRACKING (Users Table)
**Purpose:** Track user activity and online status for admin activity monitoring.

### Tracked Fields
| Field | Purpose |
|-------|---------|
| `id` | User ID |
| `name` | User name |
| `email` | Email address |
| `role` | User role (manager, recruiter, tl, admin) |
| `is_online` | Boolean for online status |
| `last_seen_at` | ISO timestamp of last activity |

### Activity Update
```javascript
const touchUserLastSeen = async (userId, source) => {
  if (!userId) return;
  const { error } = await supabase
    .from("users")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) {
    console.error(`[last_seen_at][${source}] update failed`, error);
  }
};

// Called on every data operation: "single_save", "csv_upload", "status_update", "candidate_update", "manual_add"
```

### Admin Activity Query
```javascript
const { data, error } = await supabase
  .from("users")
  .select("name,email,role,is_online,last_seen_at")
  .in("role", [
    ...getRoleQueryValues("manager"),
    ...getRoleQueryValues("recruiter"),
    ...getRoleQueryValues("tl"),
  ])
  .order("last_seen_at", { ascending: false });
```

### Activity Statistics
```javascript
const stats = {
  managersOnline: managers.filter((r) => r.is_online).length,
  managersOffline: managers.filter((r) => !r.is_online).length,
  recruitersOnline: recruiters.filter((r) => r.is_online).length,
  recruitersOffline: recruiters.filter((r) => !r.is_online).length,
  tlsOnline: tls.filter((r) => r.is_online).length,
  tlsOffline: tls.filter((r) => !r.is_online).length,
};
```

### File Locations
- **Activity Touch:** [frontend/src/pages/recruiter/Data.jsx](frontend/src/pages/recruiter/Data.jsx) Lines 47-54
- **Admin Activity Page:** [frontend/src/pages/admin/activity.jsx](frontend/src/pages/admin/activity.jsx) Lines 1-60

---

## Summary: Data Flow & Relationships

### Complete Interview Workflow
```
candidate_records (Profile Submitted)
    ↓
status_history (logs: null → "Profile Submitted")
    ↓
[Recruiter updates status to L1/L2/AI Interview]
    ↓
status_history (logs: old_status → new_status)
    ↓
[Sets interview_date and interview_time]
    ↓
candidate_records (interview_date, interview_time filled)
    ↓
[Status changes to "Offered" or "Closure"]
    ↓
status_history (logs transition)
    ↓
[If "Closure" status]
    ↓
revenue_tracker (auto-insert with candidate data)
    ↓
candidate_records (updated to status="Closure")
```

### Key Observations
1. **Two-table approach:** `candidate_records` is source of truth, `status_history` is audit log
2. **Interview tracking:** `interview_date` and `interview_time` fields in `candidate_records`
3. **Closure automation:** Setting status to "Closure" triggers auto-insert into `revenue_tracker`
4. **Deduplication:** Status history deduped by (recruiter_name, candidate_id, new_status) combination
5. **Activity audit:** All operations touching these tables update `users.last_seen_at`
