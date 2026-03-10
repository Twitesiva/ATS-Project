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
  getRevenueTrend,
  getRecruiterPerformance,
  getClientPerformance,
  getStatusDistribution,
  getHiringFunnel,
  getReportsTableData,
  getFilterOptions,
} from "../../services/reportsService";
import { groupByMonth } from "../../utils/reportHelpers";

const defaultFilters = {
  fromDate: "",
  toDate: "",
  client: "",
  recruiter: "",
  status: "",
};

export default function Reports() {
  const [filters, setFilters] = useState(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState(defaultFilters);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [options, setOptions] = useState({ clients: [], recruiters: [], statuses: [] });
  const [stats, setStats] = useState({});
  const [revenueTrend, setRevenueTrend] = useState([]);
  const [recruiterPerformance, setRecruiterPerformance] = useState([]);
  const [statusDistribution, setStatusDistribution] = useState([]);
  const [hiringFunnel, setHiringFunnel] = useState([]);
  const [clientPerformance, setClientPerformance] = useState([]);
  const [tableRows, setTableRows] = useState([]);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [
        statsRes,
        trendRes,
        recruiterRes,
        statusRes,
        funnelRes,
        clientRes,
        tableRes,
        optionsRes,
      ] = await Promise.all([
        getCandidateStats(appliedFilters),
        getRevenueTrend(appliedFilters),
        getRecruiterPerformance({ ...appliedFilters }),
        getStatusDistribution(appliedFilters),
        getHiringFunnel(appliedFilters),
        getClientPerformance(appliedFilters),
        getReportsTableData(appliedFilters),
        getFilterOptions(appliedFilters),
      ]);

      setStats(statsRes);
      setRevenueTrend(groupByMonth(trendRes, "doj", "margin_value"));
      setRecruiterPerformance(recruiterRes);
      setStatusDistribution(statusRes);
      setHiringFunnel(funnelRes);
      setClientPerformance(clientRes);
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
        clients={options.clients}
        recruiters={options.recruiters}
        statuses={options.statuses}
        showRecruiterFilter
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

          <ReportsTable data={tableRows} />
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
