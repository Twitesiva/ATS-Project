import { useCallback, useEffect, useMemo, useState } from "react";
import Loader from "../../components/common/Loader";
import FiltersBar from "../../components/reports/FiltersBar";
import KpiCards from "../../components/reports/KpiCards";
import RevenueTrendChart from "../../components/reports/RevenueTrendChart";
import HiringFunnelChart from "../../components/reports/HiringFunnelChart";
import ClientPerformanceChart from "../../components/reports/ClientPerformanceChart";
import ReportsTable from "../../components/reports/ReportsTable";
import {
  getCandidateStats,
  getRevenueTrend,
  getClientPerformance,
  getHiringFunnel,
  getReportsTableData,
  getFilterOptions,
} from "../../services/reportsService";
import { groupByMonth } from "../../utils/reportHelpers";
import { useAuth } from "../../context/AuthContext";

const defaultFilters = {
  fromDate: "",
  toDate: "",
  client: "",
  recruiter: "",
  status: "",
};

export default function Reports() {
  const { user } = useAuth();

  const [filters, setFilters] = useState(defaultFilters);


  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [options, setOptions] = useState({ clients: [], recruiters: [], statuses: [] });
  const [stats, setStats] = useState({});
  const [revenueTrend, setRevenueTrend] = useState([]);
  const [hiringFunnel, setHiringFunnel] = useState([]);
  const [clientPerformance, setClientPerformance] = useState([]);
  const [tableRows, setTableRows] = useState([]);

  const scopedFilters = useMemo(
    () => ({ ...filters, recruiter: user?.name || "" }),
    [filters, user?.name]
  );

  const loadReports = useCallback(async () => {
    if (!user?.name) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const [statsRes, trendRes, funnelRes, clientRes, tableRes, optionsRes] = await Promise.all([
        getCandidateStats(scopedFilters),
        getRevenueTrend(scopedFilters),
        getHiringFunnel(scopedFilters),
        getClientPerformance(scopedFilters),
        getReportsTableData(scopedFilters),
        getFilterOptions(scopedFilters),
      ]);

      setStats(statsRes || {});
      setRevenueTrend(groupByMonth(trendRes, "doj", "margin_value"));
      setHiringFunnel(funnelRes);
      setClientPerformance(clientRes);
      setTableRows(tableRes);
      setOptions(optionsRes || { clients: [], recruiters: [], statuses: [] });
    } catch (err) {
      console.error("Failed to load recruiter reports", err);
      setError(err?.message || "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }, [scopedFilters, user?.name]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleReset = () => {
    setFilters(defaultFilters);
  };

  const hasError = useMemo(() => Boolean(error), [error]);

  return (
    <div style={styles.page}>
      <h2 style={styles.title}>Reports</h2>

      <FiltersBar
        filters={filters}
        onChange={handleFilterChange}
        onReset={handleReset}
        clients={options?.clients || []}
        statuses={options?.statuses || []}
        showRecruiterFilter={false}
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
  <HiringFunnelChart data={hiringFunnel} />
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
