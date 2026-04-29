import { useCallback, useEffect, useMemo, useState } from "react";
import Loader from "../../components/common/Loader";
import FiltersBar from "../../components/reports/FiltersBar";
import KpiCards from "../../components/reports/KpiCards";
import RevenueTrendChart from "../../components/reports/RevenueTrendChart";
import RecruiterPerformanceChart from "../../components/reports/RecruiterPerformanceChart";
import StatusPieChart from "../../components/reports/StatusPieChart";
import HiringFunnelChart from "../../components/reports/HiringFunnelChart";
import ClientPerformanceChart from "../../components/reports/ClientPerformanceChart";
import ReportsTable from "../../components/reports/ReportsTable";

import {
  getCandidateStats,
  getRecruiterPerformance,
  getReportsTableData,
  getFilterOptions,
  getRevenueTrend,
  getStatusDistribution,
} from "../../services/reportsService";
import { normalizeRecruiter } from "../../utils/reportHelpers";

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
  const [filters, setFilters] = useState(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState(defaultFilters);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [quickFilter, setQuickFilter] = useState("");
  const [revenueTrend, setRevenueTrend] = useState([]); // correct usage
  const [statusDistribution, setStatusDistribution] = useState([]);

  const [options, setOptions] = useState({
    clients: [],
    recruiters: [],
    statuses: [],
  });

  const [stats, setStats] = useState({});
  const [tableRows, setTableRows] = useState([]);
  const [recruiterPerformance, setRecruiterPerformance] = useState([]);

  const handleQuickFilter = (value) => {
    setQuickFilter(value);

    setFilters(defaultFilters);

    if (value === "manager") {
      setAppliedFilters({
        ...defaultFilters,
        filterType: "recruiter",
        filterValue: "manager",
      });
    } else {
      setAppliedFilters(defaultFilters);
    }
  };

  // Status Distribution now uses API data for all statuses (or filtered)

  // Hiring Funnel
  const hiringFunnel = useMemo(() => {
    let screening = 0;
    let interview = 0;
    let closure = 0;

    tableRows.forEach((row) => {
      screening += row.candidates || 0;
      interview += row.interviews || 0;
      closure += row.closures || 0;
    });

    return [
      { stage: "Screening", value: screening },
      { stage: "Interview", value: interview },
      { stage: "Closure", value: closure },
    ];
  }, [tableRows]);

  // Client Performance
  const clientPerformance = useMemo(() => {
    const map = {};

    tableRows.forEach((row) => {
      const client = row.client || "Unknown";
      const candidates = Number(row.candidates) || 0;

      map[client] = (map[client] || 0) + candidates;
    });

    return Object.entries(map)
      .map(([client, candidates]) => ({
        client,
        candidates,
      }))
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

    try {
      const apiFilters = getApiFilters(appliedFilters);
      console.log("Manager Reports apiFilters:", apiFilters);

      const [statsRes, recruiterPerfRes, tableRes, optionsRes, trendRes, statusDistRes] = await Promise.all([
        getCandidateStats(apiFilters),
        getRecruiterPerformance(apiFilters),
        getReportsTableData(apiFilters),
        getFilterOptions(apiFilters),
        getRevenueTrend(apiFilters),
        getStatusDistribution(apiFilters),
      ]);

      setStatusDistribution(statusDistRes);

      console.log("Manager Reports recruiterPerfRes (Nandhini/Manager):", recruiterPerfRes.filter(r => r.recruiter.toLowerCase().includes('nand') || r.recruiter.toLowerCase().includes('manag')).map(r => ({recruiter: r.recruiter, cand: r.candidates, int: r.interviews, clos: r.closures})));
      console.log("Manager Reports tableRows sample:", tableRes.slice(0,3));

      // FIXED Revenue Trend logic
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
        Object.entries(grouped).map(([month, revenue]) => ({
          month,
          revenue,
        }))
      );

      setStats(statsRes);
      setRecruiterPerformance(recruiterPerfRes);
      setTableRows(tableRes);
      setOptions(optionsRes);
    } catch (err) {
      console.error("Failed to load manager reports", err);
      setError(err?.message || "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }, [appliedFilters]);

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
            <RecruiterPerformanceChart data={recruiterPerformance} />
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

