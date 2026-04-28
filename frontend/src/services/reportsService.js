import { supabase } from "./supabaseClient";
import { sanitizeMarginValue } from "../utils/reportHelpers";

const isValidDate = (value) => {
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
};

const applyCandidateFilters = (query, filters = {}) => {
  let q = query;

  if (filters.fromDate && isValidDate(filters.fromDate)) {
    q = q.gte("created_at", new Date(filters.fromDate).toISOString());
  }

  if (filters.toDate && isValidDate(filters.toDate)) {
    const end = new Date(filters.toDate);
    end.setHours(23, 59, 59, 999);
    q = q.lte("created_at", end.toISOString());
  }

  if (filters.client) {
    q = q.eq("client_name", filters.client);
  }

  if (filters.status) {
    q = q.eq("status", filters.status);
  }

  if (filters.recruiter) {
    q = q.eq("recruiter", filters.recruiter);
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
    q = q.eq("recruiter_name", filters.recruiter);
  }

  return q;
};

// ✅ Reusable pagination helper — fetches ALL rows beyond Supabase's 1000 row cap
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
  const rows = await fetchAllPages((from, to) =>
    applyCandidateFilters(
      supabase.from("candidate_records").select("id,status")
        .not("status", "in", "(Closure,Drop Out By Client,Drop Out By Candidate,Backout,Position Closed,L1 Reject,L2 Reject,Final Round Rejected)")
        .range(from, to),
      filters
    )
  );

  const totalCandidates = rows.length;
  const interviewsScheduled = rows.filter((r) => ["L1 Scheduled","L2 Scheduled","AI Interview","Assessment Round","HR Round","Interview Scheduled"].includes(r.status)).length;
  const shortlisted = rows.filter((r) => r.status === "Shortlisted").length;
  const closures = rows.filter((r) => r.status === "Closure").length;

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

  return {
    totalCandidates,
    interviewsScheduled,
    shortlisted,
    closures,
    revenue,
  };
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
    const recruiter = String(row.recruiter || "Unknown").trim() || "Unknown";
    const current = map.get(recruiter) || { recruiter, candidates: 0, interviews: 0, closures: 0 };

    current.candidates += 1;
    if (["L1 Scheduled","L2 Scheduled","AI Interview","Assessment Round","HR Round","Interview Scheduled"].includes(row.status)) current.interviews += 1;
    if (row.status === "Closure") current.closures += 1;

    map.set(recruiter, current);
  });

  return Array.from(map.values()).sort((a, b) => a.recruiter.localeCompare(b.recruiter));
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
    const status = String(row.status || "Unknown").trim() || "Unknown";
    map.set(status, (map.get(status) || 0) + 1);
  });

  return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
};

export const getHiringFunnel = async (filters = {}) => {
  const rows = await fetchAllPages((from, to) =>
    applyCandidateFilters(
      supabase.from("candidate_records").select("status").range(from, to),
      filters
    )
  );

  return [
    { stage: "Screening", value: rows.filter((r) => ["Screen Select","Screen Reject","Screen rejected"].includes(r.status)).length },
    { stage: "Interview", value: rows.filter((r) => ["L1 Scheduled","L2 Scheduled"].includes(r.status)).length },
    { stage: "Rejected", value: rows.filter((r) => ["L1 Reject","L2 Reject","Final Round Reject"].includes(r.status)).length },
    { stage: "Dropout", value: rows.filter((r) => ["Drop Out","Back Out","Backout"].includes(r.status)).length },
    { stage: "Closure", value: rows.filter((r) => r.status === "Closure").length },
  ];
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

  const normalizeKey = (str) =>
    String(str || "").toLowerCase().replace(/[\s\-\[\]()_.,]/g, "");

  const map = new Map();

  candidateData.forEach((row) => {
    const clientRaw = String(row.client_name || "Unknown").trim() || "Unknown";
    const recruiter = String(row.recruiter || "Unknown").trim() || "Unknown";
    const key = `${normalizeKey(clientRaw)}||${normalizeKey(recruiter)}`;
    const current = map.get(key) || { client: clientRaw, recruiter, candidates: 0, interviews: 0, shortlisted: 0, closures: 0, revenue: 0 };

    current.candidates += 1;
    if (["L1 Scheduled","L2 Scheduled","AI Interview","Assessment Round","HR Round","Interview Scheduled"].includes(row.status)) current.interviews += 1;
    if (row.status === "Shortlisted") current.shortlisted += 1;
    if (row.status === "Closure") current.closures += 1;

    map.set(key, current);
  });

  revenueData.forEach((row) => {
    const clientRaw = String(row.client_name || "Unknown").trim() || "Unknown";
    const recruiter = String(row.recruiter_name || "Unknown").trim() || "Unknown";
    const key = `${normalizeKey(clientRaw)}||${normalizeKey(recruiter)}`;
    const current = map.get(key) || { client: clientRaw, recruiter, candidates: 0, interviews: 0, shortlisted: 0, closures: 0, revenue: 0 };

    current.revenue += sanitizeMarginValue(row.margin_value);
    map.set(key, current);
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
  const recruiters = [...new Set(recruitersData.map((r) => String(r.recruiter || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const statuses = [...new Set(statusesData.map((r) => String(r.status || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  return { clients, recruiters, statuses };
};