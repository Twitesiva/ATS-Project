import { supabase } from "./supabaseClient";
import { sanitizeMarginValue, normalizeRecruiter, normalizeStatus, parseRevenueValue } from "../utils/reportHelpers";

const isValidDate = (value) => {
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
};

const toDateInputValue = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const applyCandidateFilters = (query, filters = {}) => {
  let q = query;
  const dateField = filters.candidateDateField || "created_at";
  const isTimestampField = dateField === "created_at";

  if (filters.fromDate && isValidDate(filters.fromDate)) {
    q = q.gte(
      dateField,
      isTimestampField ? new Date(filters.fromDate).toISOString() : toDateInputValue(filters.fromDate)
    );
  }

  if (filters.toDate && isValidDate(filters.toDate)) {
    const end = new Date(filters.toDate);
    end.setHours(23, 59, 59, 999);
    q = q.lte(
      dateField,
      isTimestampField ? end.toISOString() : toDateInputValue(end)
    );
  }

  if (filters.client) {
    q = q.eq("client_name", filters.client);
  }

  if (filters.status) {
    q = q.eq("status", filters.status);
  }

  if (filters.recruiter) {
    q = q.ilike("recruiter", filters.recruiter);
  }

  return q;
};

const applyRevenueFilters = (query, filters = {}) => {
  let q = query;

  if (filters.fromDate && isValidDate(filters.fromDate)) {
    q = q.gte("doj", filters.fromDate);
  }

  if (filters.toDate && isValidDate(filters.toDate)) {
    q = q.lte("doj", filters.toDate);
  }

  if (filters.client) {
    q = q.eq("client_name", filters.client);
  }

  if (filters.recruiter) {
    q = q.ilike("recruiter_name", filters.recruiter);
  }

  return q;
};

// ✅ Reusable pagination helper — fetches ALL rows beyond Supabase's 1000 row cap
const normalizeComparableStatus = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const statusMatches = (status, expectedStatuses) =>
  expectedStatuses.has(normalizeComparableStatus(status));

const HIRING_FUNNEL_STATUS_GROUPS = {
  Screening: new Set([
    "profile submitted",
    "feedback pending",
    "duplicate",
    "assessment round",
    "shortlisted",
    "position hold",
  ]),
  Interview: new Set([
    "l1 scheduled",
    "l2 scheduled",
    "ai interview",
    "hr round",
    "interview scheduled",
  ]),
  Rejected: new Set([
    "l1 reject",
    "l2 reject",
    "final round rejected",
  ]),
  Dropout: new Set([
    "drop out by candidate",
    "drop out by client",
    "backout",
    "drop out",
  ]),
};

const HIRING_FUNNEL_STAGES = ["Screening", "Interview", "Rejected", "Dropout", "Closure"];

const fetchAllPages = async (buildQuery) => {
  const pageSize = 1000;
  let allData = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) { hasMore = false; break; }
    allData = allData.concat(data);
    hasMore = data.length === pageSize;
    from += pageSize;
  }

  return allData;
};

export const getCandidateStats = async (filters = {}) => {
  try {
    const rows = await fetchAllPages((from, to) =>
      applyCandidateFilters(
        supabase.from("candidate_records").select("id,status")
          .not("status", "in", '(Closure,Drop Out By Client,Drop Out By Candidate,Backout,Position Closed,L1 Reject,L2 Reject,Final Round Rejected)')
          .range(from, to),
        filters
      )
    );

    const totalCandidates = rows.length;
    const interviewsScheduled = rows.filter((r) =>
      ["L1 Scheduled","L2 Scheduled","AI Interview","Assessment Round","HR Round","Interview Scheduled"].includes(r.status)
    ).length;
    const shortlisted = rows.filter((r) => r.status === "Shortlisted").length;

    const revenueRows = await fetchAllPages((from, to) =>
      applyRevenueFilters(
        supabase.from("revenue_tracker").select("margin_value,doj").range(from, to),
        filters
      )
    );

    const revenue = revenueRows.reduce(
      (sum, row) => sum + sanitizeMarginValue(row.margin_value),
      0
    );

    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];



    const { count, error: closureError } = await supabase
      .from("revenue_tracker")
      .select("id", { count: "exact", head: true })
      .gte("doj", firstOfMonth)
      .lte("doj", lastOfMonth);

    

    if (closureError) throw closureError;

    return {
      totalCandidates,
      interviewsScheduled,
      shortlisted,
      closures: count ?? 0,
      revenue,
    };
  } catch (err) {
    console.error("getCandidateStats crashed:", err);
    return { totalCandidates: 0, interviewsScheduled: 0, shortlisted: 0, closures: 0, revenue: 0 };
  }
};

export const getRevenueTrend = async (filters = {}) => {
  const data = await fetchAllPages((from, to) =>
    applyRevenueFilters(
      supabase.from("revenue_tracker").select("margin_value,doj").order("doj", { ascending: true }).range(from, to),
      filters
    )
  );

  return data;
};

export const getRecruiterPerformance = async (filters = {}) => {

  const allData = await fetchAllPages((from, to) =>
    applyCandidateFilters(
      supabase.from("candidate_records").select("recruiter,id,status").range(from, to),
      filters
    )
  );

 

  const map = new Map();
  allData.forEach((row) => {
    const recruiterRaw = row.recruiter;
    const recruiter = normalizeRecruiter(recruiterRaw);
    const current = map.get(recruiter) || { recruiter, candidates: 0, interviews: 0, closures: 0 };

    current.candidates += 1;
    if (["L1 Scheduled","L2 Scheduled","AI Interview","Assessment Round","HR Round","Interview Scheduled"].includes(row.status)) current.interviews += 1;
    if (row.status === "Closure") current.closures += 1;

    map.set(recruiter, current);
  });

  const result = Array.from(map.values()).sort((a, b) => a.recruiter.localeCompare(b.recruiter));
  return result;
};

export const getRecruiterPerformanceAnalytics = async (filters = {}) => {
  const [recruiterPerf, revenueRows] = await Promise.all([
    getRecruiterPerformance(filters),
    fetchAllPages((from, to) =>
      applyRevenueFilters(
        supabase.from("revenue_tracker").select("recruiter_name,margin_value,doj,client_name").range(from, to),
        filters
      )
    ),
  ]);

  const revenueMap = {};
  const closuresMap = {};

  (revenueRows || []).forEach((row) => {
    const name = normalizeRecruiter(row.recruiter_name);
    if (!revenueMap[name]) revenueMap[name] = 0;
    if (!closuresMap[name]) closuresMap[name] = 0;
    revenueMap[name] += parseRevenueValue(row.margin_value);
    closuresMap[name] += 1;
  });

  const transformed = (recruiterPerf || []).map((row) => {
    const name = normalizeRecruiter(row.recruiter);
    return {
      ...row,
      recruiter: row.recruiter,
      candidates: row.candidates ?? row.candidatesAdded ?? 0,
      candidatesAdded: row.candidates ?? row.candidatesAdded ?? 0,
      interviews: row.interviews ?? 0,
      closures: closuresMap[name] ?? 0,
      revenue: revenueMap[name] ?? 0,
    };
  });

  const existingNames = new Set(transformed.map((row) => normalizeRecruiter(row.recruiter)));
  Object.keys(revenueMap).forEach((name) => {
    if (!existingNames.has(name)) {
      transformed.push({
        recruiter: name,
        candidates: 0,
        candidatesAdded: 0,
        interviews: 0,
        closures: closuresMap[name] ?? 0,
        revenue: revenueMap[name] ?? 0,
      });
    }
  });

  return transformed.sort((a, b) => a.recruiter.localeCompare(b.recruiter));
};

export const getClientPerformance = async (filters = {}) => {
  const [candidateData, revenueData] = await Promise.all([
    fetchAllPages((from, to) =>
      applyCandidateFilters(
        supabase.from("candidate_records").select("client_name,id,status,recruiter").range(from, to),
        filters
      )
    ),
    fetchAllPages((from, to) =>
      applyRevenueFilters(
        supabase.from("revenue_tracker").select("client_name,margin_value,recruiter_name,doj").range(from, to),
        filters
      )
    ),
  ]);

  const map = new Map();

  candidateData.forEach((row) => {
    const client = String(row.client_name || "Unknown").trim() || "Unknown";
    const current = map.get(client) || { client, candidates: 0, interviews: 0, shortlisted: 0, closures: 0, revenue: 0 };

    current.candidates += 1;
    if (["L1 Scheduled","L2 Scheduled","AI Interview","Assessment Round","HR Round","Interview Scheduled"].includes(row.status)) current.interviews += 1;
    if (row.status === "Shortlisted") current.shortlisted += 1;
    if (row.status === "Closure") current.closures += 1;

    map.set(client, current);
  });

  revenueData.forEach((row) => {
    const client = String(row.client_name || "Unknown").trim() || "Unknown";
    const current = map.get(client) || { client, candidates: 0, interviews: 0, shortlisted: 0, closures: 0, revenue: 0 };

    current.revenue += sanitizeMarginValue(row.margin_value);
    map.set(client, current);
  });

  return Array.from(map.values()).sort((a, b) => b.candidates - a.candidates);
};

export const getStatusDistribution = async (filters = {}) => {
  const allData = await fetchAllPages((from, to) =>
    applyCandidateFilters(
      supabase.from("candidate_records").select("status").range(from, to),
      filters
    )
  );

  const map = new Map();
  allData.forEach((row) => {
    const raw = String(row.status || "Unknown").trim() || "Unknown";
    const status = normalizeStatus(raw);
    map.set(status, (map.get(status) || 0) + 1);
  });

  return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
};

export const getHiringFunnel = async (filters = {}) => {
  const [candidateRows, revenueRows] = await Promise.all([
    fetchAllPages((from, to) =>
      applyCandidateFilters(
        supabase.from("candidate_records").select("status").range(from, to),
        filters
      )
    ),
    fetchAllPages((from, to) =>
      applyRevenueFilters(
        supabase.from("revenue_tracker").select("id").range(from, to),
        filters
      )
    ),
  ]);

  const counts = {
    Screening: 0,
    Interview: 0,
    Rejected: 0,
    Dropout: 0,
    Closure: revenueRows.length,
  };

  candidateRows.forEach((row) => {
    for (const [stage, statuses] of Object.entries(HIRING_FUNNEL_STATUS_GROUPS)) {
      if (statusMatches(row.status, statuses)) {
        counts[stage] += 1;
        break;
      }
    }
  });

  return HIRING_FUNNEL_STAGES.map((stage) => ({ stage, value: counts[stage] }));
};

export const getReportsTableData = async (filters = {}) => {
  const [candidateData, revenueData] = await Promise.all([
    fetchAllPages((from, to) =>
      applyCandidateFilters(
        supabase.from("candidate_records").select("client_name,id,status,recruiter").range(from, to),
        filters
      )
    ),
    fetchAllPages((from, to) =>
      applyRevenueFilters(
        supabase.from("revenue_tracker").select("client_name,margin_value,recruiter_name,doj").range(from, to),
        filters
      )
    ),
  ]);

  // Add normalizeClient for consistency (Dashboard has it)
  const normalizeClient = (value) => String(value || "").trim() || "Unknown";

  const map = new Map();

  candidateData.forEach((row) => {
    const clientRaw = String(row.client_name || "Unknown").trim() || "Unknown";
    const recruiterRaw = row.recruiter;
    const recruiterNorm = normalizeRecruiter(recruiterRaw);
    const clientNorm = normalizeClient(clientRaw);
    const key = `${clientNorm}|||${recruiterNorm}`;
    const current = map.get(key) || { client: clientRaw, recruiter: recruiterNorm, candidates: 0, interviews: 0, shortlisted: 0, closures: 0, revenue: 0 };

    current.candidates += 1;
    if (["L1 Scheduled","L2 Scheduled","AI Interview","Assessment Round","HR Round","Interview Scheduled"].includes(row.status)) current.interviews += 1;
    if (row.status === "Shortlisted") current.shortlisted += 1;
    if (row.status === "Closure") current.closures += 1;

    map.set(key, current);
  });

  revenueData.forEach((row) => {
    const clientRaw = String(row.client_name || "Unknown").trim() || "Unknown";
    const recruiterNorm = normalizeRecruiter(row.recruiter_name);
    const clientNorm = normalizeClient(clientRaw);
    const key = `${clientNorm}|||${recruiterNorm}`;
    let current = map.get(key);
    if (!current) {
      current = { client: clientRaw, recruiter: recruiterNorm, candidates: 0, interviews: 0, shortlisted: 0, closures: 0, revenue: 0 };
      map.set(key, current);
    }

    current.revenue += sanitizeMarginValue(row.margin_value);
  });

  return Array.from(map.values()).sort((a, b) =>
    a.client.localeCompare(b.client) || a.recruiter.localeCompare(b.recruiter)
  );
};

export const getFilterOptions = async (filters = {}) => {
  const [clientsData, recruitersData, statusesData] = await Promise.all([
    fetchAllPages((from, to) =>
      applyCandidateFilters(
        supabase.from("candidate_records").select("client_name").range(from, to),
        { ...filters, client: "", status: "" }
      )
    ),
    fetchAllPages((from, to) =>
      applyCandidateFilters(
        supabase.from("candidate_records").select("recruiter").range(from, to),
        { ...filters, recruiter: "", status: "" }
      )
    ),
    fetchAllPages((from, to) =>
      applyCandidateFilters(
        supabase.from("candidate_records").select("status").range(from, to),
        { ...filters, status: "" }
      )
    ),
  ]);

  const clients = [...new Set(clientsData.map((r) => String(r.client_name || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  const recruiters = [
    ...new Set(
      recruitersData
        .map((r) =>
          String(r.recruiter || "")
            .trim()
            .toLowerCase() // 🔥 normalize
        )
        .filter(Boolean)
    ),
  ];


  // ✅ Normalize statuses before deduplicating — collapses "Backout"/"Back Out"/"Dropout" etc.
  const statuses = [
    ...new Set(
      statusesData
        .map((r) => normalizeStatus(String(r.status || "").trim()))
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b));

  return { clients, recruiters, statuses };
};
