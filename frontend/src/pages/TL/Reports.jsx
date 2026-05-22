import { useCallback, useEffect, useMemo, useState } from "react";
import Loader from "../../components/common/Loader";
import FiltersBar from "../../components/reports/FiltersBar";
import KpiCards from "../../components/reports/KpiCards";
import RevenueTrendChart from "../../components/reports/RevenueTrendChart";
import StatusPieChart from "../../components/reports/StatusPieChart";
import HiringFunnelChart from "../../components/reports/HiringFunnelChart";
import ClientPerformanceChart from "../../components/reports/ClientPerformanceChart";
import ReportsTable from "../../components/reports/ReportsTable";

import {
  getCandidateStats,
  getReportsTableData,
  getFilterOptions,
  getRevenueTrend,
  getStatusDistribution,
  getHiringFunnel,
} from "../../services/reportsService";
import { useAuth } from "../../context/AuthContext";
import { getAssignedRecruitersForTL } from "../../services/tlAssignmentsService";

const defaultFilters = {
  fromDate: "",
  toDate: "",
  client: "",
  recruiter: "",
  status: "",
  filterType: "client",
  filterValue: "",
};

export default function Reports() {
  const { user } = useAuth();
  const [filters, setFilters] = useState(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState(defaultFilters);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [quickFilter, setQuickFilter] = useState("");
  const [revenueTrend, setRevenueTrend] = useState([]);
  const [statusDistribution, setStatusDistribution] = useState([]);
  const [hiringFunnel, setHiringFunnel] = useState([]);

  const [options, setOptions] = useState({
    clients: [],
    recruiters: [],
    statuses: [],
  });

  const [stats, setStats] = useState({});
  const [tableRows, setTableRows] = useState([]);
  const [assignedRecruiters, setAssignedRecruiters] = useState([]);
  const [assignmentsLoaded, setAssignmentsLoaded] = useState(false);

  const allowedRecruiterNames = useMemo(() => {
    const tlName = String(user?.name || "").trim();
    const assigned = (assignedRecruiters || [])
      .map((r) => String(r?.name || "").trim())
      .filter(Boolean);
    const merged = [tlName, ...assigned].filter(Boolean);
    return Array.from(new Set(merged));
  }, [assignedRecruiters, user?.name]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!user?.id) return;
      setAssignmentsLoaded(false);
      const rows = await getAssignedRecruitersForTL(user.id);
      if (cancelled) return;
      setAssignedRecruiters(rows || []);
      setAssignmentsLoaded(true);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleQuickFilter = (value) => {
    setQuickFilter(value);
    setFilters(defaultFilters);
    if (value === "tl") {
      setAppliedFilters({
        ...defaultFilters,
        filterType: "recruiter",
        filterValue: String(user?.name || "").trim(),
      });
    } else {
      setAppliedFilters(defaultFilters);
    }
  };

  // Client Performance
  const clientPerformance = useMemo(() => {
    const map = {};
    tableRows.forEach((row) => {
      const client = row.client || "Unknown";
      const candidates = Number(row.candidates) || 0;
      map[client] = (map[client] || 0) + candidates;
    });
    return Object.entries(map)
      .map(([client, candidates]) => ({ client, candidates }))
      .sort((a, b) => b.candidates - a.candidates);
  }, [tableRows]);

  // Filter helper
  const getApiFilters = (filterObj) => {
    const apiFilters = { ...filterObj };
    if (!filterObj.filterValue) {
      apiFilters.client = "";
      apiFilters.recruiter = "";
      return apiFilters;
    }
    if (filterObj.filterType === "recruiter") {
      apiFilters.recruiter = filterObj.filterValue;
      apiFilters.client = "";
    } else {
      apiFilters.client = filterObj.filterValue;
      apiFilters.recruiter = "";
    }
    return apiFilters;
  };

  // API Call
  const loadReports = useCallback(async () => {
    setLoading(true);
    setError("");

    if (!assignmentsLoaded) {
      setLoading(false);
      return;
    }

    try {
      if (!allowedRecruiterNames.length) {
        setStats({ totalCandidates: 0, interviewsScheduled: 0, shortlisted: 0, closures: 0, revenue: 0 });
        setTableRows([]);
        setOptions({ clients: [], recruiters: [], statuses: [] });
        setRevenueTrend([]);
        setStatusDistribution([]);
        setHiringFunnel([]);
        return;
      }

      const apiFilters = {
        ...getApiFilters(appliedFilters),
        recruiterIn: allowedRecruiterNames,
        recruiterNameIn: allowedRecruiterNames,
      };

      const [statsRes, tableRes, optionsRes, trendRes, statusDistRes, funnelRes] = await Promise.all([
        getCandidateStats(apiFilters),
        getReportsTableData(apiFilters),
        getFilterOptions(apiFilters),
        getRevenueTrend(apiFilters),
        getStatusDistribution(apiFilters),
        getHiringFunnel(apiFilters),
      ]);

      setStatusDistribution(statusDistRes);
      setHiringFunnel(funnelRes);

      // Revenue Trend logic
      const grouped = {};
      trendRes.forEach((row) => {
        if (!row.doj) return;
        const date = new Date(row.doj);
        const month = date.toLocaleString("default", {
          month: "short",
          year: "numeric",
        });
        const revenue = Number(row.margin_value) || 0;
        grouped[month] = (grouped[month] || 0) + revenue;
      });

      setRevenueTrend(
        Object.entries(grouped).map(([month, revenue]) => ({ month, revenue }))
      );

      setStats(statsRes);
      setTableRows(tableRes);

      const allowedRecruiterDropdown = allowedRecruiterNames
        .map((n) => String(n || "").trim().toLowerCase())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
      const mergedRecruiters = Array.from(
        new Set([...(optionsRes?.recruiters || []), ...allowedRecruiterDropdown])
      ).sort((a, b) => a.localeCompare(b));

      setOptions({ ...(optionsRes || {}), recruiters: mergedRecruiters });
    } catch (err) {
      console.error("Failed to load TL reports", err);
      setError(err?.message || "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }, [allowedRecruiterNames, appliedFilters, assignmentsLoaded]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleApply = () => {
    setAppliedFilters(filters);
  };

  const handleReset = () => {
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
  };

  const hasError = useMemo(() => Boolean(error), [error]);

  return (
    <div style={styles.page}>
      <h2 style={styles.title}>Reports</h2>

     <FiltersBar
  filters={filters}
  onChange={handleFilterChange}
  onApply={handleApply}
  onReset={handleReset}
  clients={options?.clients || []}
  recruiters={options?.recruiters || []}
  assignedRecruiters={allowedRecruiterNames}
  showRecruiterFilter={true}
  statuses={options?.statuses || []}
  quickFilter={quickFilter}
  onQuickFilter={handleQuickFilter}
/>

      {loading ? (
        <Loader text="Loading reports..." />
      ) : hasError ? (
        <div style={styles.error}>{error}</div>
      ) : (
        <>
          <KpiCards stats={stats} />

          <div style={styles.grid2}>
            <RevenueTrendChart data={revenueTrend} />
          </div>

          <div style={styles.grid2}>
            <HiringFunnelChart data={hiringFunnel} />
            <StatusPieChart data={statusDistribution} />
          </div>

          <ClientPerformanceChart data={clientPerformance} />

          <ReportsTable
            data={tableRows}
            clients={options?.clients || []}
            recruiters={options?.recruiters || []}
          />
        </>
      )}
    </div>
  );
}

const styles = {
  page: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  title: {
    margin: 0,
    fontSize: "30px",
    color: "#0f172a",
  },
  grid2: {
    display: "grid",
    gap: "12px",
    gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
  },
  error: {
    border: "1px solid #fecaca",
    background: "#fef2f2",
    color: "#b91c1c",
    borderRadius: "10px",
    padding: "10px 12px",
    fontSize: "14px",
  },
};