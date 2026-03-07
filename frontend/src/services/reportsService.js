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

export const getCandidateStats = async (filters = {}) => {
  const { data, error } = await applyCandidateFilters(
    supabase.from("candidate_records").select("id,status"),
    filters
  );

  if (error) throw error;

  const rows = data || [];

  const totalCandidates = rows.length;
  const interviewsScheduled = rows.filter((r) => r.status === "Interview Scheduled").length;
  const shortlisted = rows.filter((r) => r.status === "Shortlisted").length;
  const closures = rows.filter((r) => r.status === "Joined").length;

  const revenueQuery = applyRevenueFilters(
    supabase.from("revenue_tracker").select("margin_value,doj"),
    filters
  );
  const { data: revenueRows, error: revenueError } = await revenueQuery;
  if (revenueError) throw revenueError;

  const revenue = (revenueRows || []).reduce(
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
  const { data, error } = await applyRevenueFilters(
    supabase.from("revenue_tracker").select("margin_value,doj").order("doj", { ascending: true }),
    filters
  );

  if (error) throw error;
  return data || [];
};

export const getRecruiterPerformance = async (filters = {}) => {
  const { data, error } = await applyCandidateFilters(
    supabase.from("candidate_records").select("recruiter,id,status"),
    filters
  );

  if (error) throw error;

  const map = new Map();
  (data || []).forEach((row) => {
    const recruiter = String(row.recruiter || "Unknown").trim() || "Unknown";
    const current = map.get(recruiter) || { recruiter, candidates: 0, interviews: 0, closures: 0 };

    current.candidates += 1;
    if (row.status === "Interview Scheduled") current.interviews += 1;
    if (row.status === "Joined") current.closures += 1;

    map.set(recruiter, current);
  });

  return Array.from(map.values()).sort((a, b) => a.recruiter.localeCompare(b.recruiter));
};

export const getClientPerformance = async (filters = {}) => {
  const [candidateRes, revenueRes] = await Promise.all([
    applyCandidateFilters(
      supabase.from("candidate_records").select("client_name,id,status,recruiter"),
      filters
    ),
    applyRevenueFilters(
      supabase.from("revenue_tracker").select("client_name,margin_value,recruiter_name,doj"),
      filters
    ),
  ]);

  if (candidateRes.error) throw candidateRes.error;
  if (revenueRes.error) throw revenueRes.error;

  const map = new Map();

  (candidateRes.data || []).forEach((row) => {
    const client = String(row.client_name || "Unknown").trim() || "Unknown";
    const current = map.get(client) || {
      client,
      candidates: 0,
      interviews: 0,
      shortlisted: 0,
      closures: 0,
      revenue: 0,
    };

    current.candidates += 1;
    if (row.status === "Interview Scheduled") current.interviews += 1;
    if (row.status === "Shortlisted") current.shortlisted += 1;
    if (row.status === "Joined") current.closures += 1;

    map.set(client, current);
  });

  (revenueRes.data || []).forEach((row) => {
    const client = String(row.client_name || "Unknown").trim() || "Unknown";
    const current = map.get(client) || {
      client,
      candidates: 0,
      interviews: 0,
      shortlisted: 0,
      closures: 0,
      revenue: 0,
    };

    current.revenue += sanitizeMarginValue(row.margin_value);
    map.set(client, current);
  });

  return Array.from(map.values()).sort((a, b) => b.candidates - a.candidates);
};

export const getStatusDistribution = async (filters = {}) => {
  const { data, error } = await applyCandidateFilters(
    supabase.from("candidate_records").select("status"),
    filters
  );

  if (error) throw error;

  const map = new Map();
  (data || []).forEach((row) => {
    const status = String(row.status || "Unknown").trim() || "Unknown";
    map.set(status, (map.get(status) || 0) + 1);
  });

  return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
};

export const getHiringFunnel = async (filters = {}) => {
  const { data, error } = await applyCandidateFilters(
    supabase.from("candidate_records").select("status"),
    filters
  );

  if (error) throw error;

  const rows = data || [];

  return [
    { stage: "Submitted", value: rows.filter((r) => ["Profile Submitted", "Submitted"].includes(r.status)).length },
    { stage: "Interview", value: rows.filter((r) => /interview/i.test(String(r.status || ""))).length },
    { stage: "Offer", value: rows.filter((r) => /offer/i.test(String(r.status || ""))).length },
    { stage: "Joined", value: rows.filter((r) => r.status === "Joined").length },
  ];
};

export const getReportsTableData = async (filters = {}) => {
  return getClientPerformance(filters);
};

export const getFilterOptions = async (filters = {}) => {
  const [clientsRes, recruitersRes, statusesRes] = await Promise.all([
    applyCandidateFilters(
      supabase.from("candidate_records").select("client_name"),
      { ...filters, client: "", status: "" }
    ),
    applyCandidateFilters(
      supabase.from("candidate_records").select("recruiter"),
      { ...filters, recruiter: "", status: "" }
    ),
    applyCandidateFilters(
      supabase.from("candidate_records").select("status"),
      { ...filters, status: "" }
    ),
  ]);

  if (clientsRes.error) throw clientsRes.error;
  if (recruitersRes.error) throw recruitersRes.error;
  if (statusesRes.error) throw statusesRes.error;

  const clients = Array.from(
    new Set((clientsRes.data || []).map((r) => String(r.client_name || "").trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  const recruiters = Array.from(
    new Set((recruitersRes.data || []).map((r) => String(r.recruiter || "").trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  const statuses = Array.from(
    new Set((statusesRes.data || []).map((r) => String(r.status || "").trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  return { clients, recruiters, statuses };
};





