import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../services/supabaseClient";
import Loader from "../../components/common/Loader";
import { useAuth } from "../../context/AuthContext";
import { getAssignedRecruitersForTL } from "../../services/tlAssignmentsService";

function dedupeHistoryRows(rows) {
  return [...(rows || [])].sort(
    (a, b) =>
      new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime() ||
      Number(b.id || 0) - Number(a.id || 0)
  );
}

function mapRow(row) {
  return {
    id: row.id,
    candidateId: row.candidate_id ?? null,
    recruiterName: (row.recruiter_name || "-").trim(),
    candidateName: (row.candidate_name || "-").trim(),
    status: (row.new_status || "-").trim(),
    updatedAt: row.updated_at || null,
  };
}

export default function History() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [searchMode, setSearchMode] = useState("candidate");
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const tableWrapRef = useRef(null);
  const dragRef = useRef(null);
  const [scrollInfo, setScrollInfo] = useState({ scrollTop: 0, clientHeight: 0, scrollHeight: 0 });
  const [recruiterOptions, setRecruiterOptions] = useState([]);
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

  const allowedRecruiterLowerSet = useMemo(() => {
    return new Set(
      allowedRecruiterNames.map((name) => String(name || "").trim().toLowerCase()).filter(Boolean)
    );
  }, [allowedRecruiterNames]);

  const recruiterOrFilter = useMemo(() => {
    // Supabase `.or()` filter for case-insensitive exact match.
    // Example: "recruiter_name.ilike.Sherin,recruiter_name.ilike.Shiva"
    // NOTE: We intentionally avoid `.in()` because status_history often contains mixed casing/spacing.
    const parts = (allowedRecruiterNames || [])
      .map((name) => String(name || "").trim())
      .filter(Boolean)
      // Escape commas to avoid breaking the OR syntax.
      .map((name) => `recruiter_name.ilike.${name.replaceAll(",", "\\,")}`);
    return parts.join(",");
  }, [allowedRecruiterNames]);

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

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const fetchRecruiters = async () => {
      if (!assignmentsLoaded) return;
      if (allowedRecruiterNames.length === 0) {
        setRecruiterOptions([]);
        return;
      }
      const pageSize = 1000;
      let allNames = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from("status_history")
          .select("recruiter_name")
          .or(recruiterOrFilter)
          .not("recruiter_name", "is", null)
          .neq("recruiter_name", "")
          .range(from, from + pageSize - 1);

        if (error) break;
        if (!data || data.length === 0) { hasMore = false; break; }

        allNames = allNames.concat(data.map((r) => r.recruiter_name));
        hasMore = data.length === pageSize;
        from += pageSize;
      }

      const unique = [...new Set(allNames)].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" })
      );
      setRecruiterOptions(unique);
    };
    fetchRecruiters();
  }, [allowedRecruiterNames, assignmentsLoaded, recruiterOrFilter]);

  useEffect(() => {
    let mounted = true;

    const loadRows = async () => {
      if (!user?.id) return;
      if (!assignmentsLoaded) return;
      setLoading(true);
      setError("");

      if (allowedRecruiterNames.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      const pageSize = 1000;
      let allData = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from("status_history")
          .select("id,candidate_id,recruiter_name,candidate_name,new_status,updated_at")
          .or(recruiterOrFilter)
          .order("updated_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, from + pageSize - 1);

        if (error) {
          console.error("[tl-history] fetch failed", error);
          if (mounted) {
            setError(error.message || "Failed to load history");
            setLoading(false);
          }
          return;
        }

        if (!data || data.length === 0) { hasMore = false; break; }

        allData = allData.concat(data);
        hasMore = data.length === pageSize;
        from += pageSize;
      }

      if (!mounted) return;

      setRows(dedupeHistoryRows(allData));
      setLoading(false);
    };

    loadRows();

    const channel = supabase
      .channel(`tl-history-live-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "status_history" },
        (payload) => {
          setRows((prev) => {
            const recruiterName = String(payload?.new?.recruiter_name || "").trim();
            if (!allowedRecruiterLowerSet.has(recruiterName.toLowerCase())) return prev;
            const merged = [payload.new, ...prev];
            return dedupeHistoryRows(merged);
          });
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [allowedRecruiterLowerSet, assignmentsLoaded, recruiterOrFilter, user?.id]);

  const mappedRows = useMemo(() => rows.map(mapRow), [rows]);

  const filteredRows = useMemo(() => {
    const text = (searchText || "").trim().toLowerCase();
    const statusValue = (statusFilter || "all").trim();

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let rangeStart = null;
    let rangeEnd = null;

    if (dateFilter === "today") {
      rangeStart = startOfToday;
      rangeEnd = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    } else if (dateFilter === "last7") {
      rangeStart = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);
      rangeEnd = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    } else if (dateFilter === "last30") {
      rangeStart = new Date(startOfToday.getTime() - 30 * 24 * 60 * 60 * 1000);
      rangeEnd = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    } else if (dateFilter === "custom") {
      if (fromDate) rangeStart = new Date(`${fromDate}T00:00:00`);
      if (toDate) rangeEnd = new Date(`${toDate}T23:59:59`);
    }

    return mappedRows.filter((r) => {
      // Status filter
      if (statusValue !== "all" && String(r.status || "").trim().toLowerCase() !== statusValue.trim().toLowerCase()) return false;

      // Role filter
      if (roleFilter !== "all") {
        const isTL = String(r.recruiterName || "").trim().toLowerCase() === String(user?.name || "").trim().toLowerCase();
        if (roleFilter === "tl" && !isTL) return false;
        if (roleFilter === "recruiter" && isTL) return false;
      }

      // Search filter
      if (text) {
        if (searchMode === "recruiter") {
          const recruiterLower = String(r.recruiterName || "").trim().toLowerCase();
          const searchLower = (searchText || "").trim().toLowerCase();
          if (recruiterLower !== searchLower) return false;
        } else {
          const candidateLower = String(r.candidateName || "").toLowerCase();
          if (!candidateLower.includes(text)) return false;
        }
      }

      // Date range filter
      if (rangeStart || rangeEnd) {
        if (!r.updatedAt) return false;
        const d = new Date(r.updatedAt);
        if (Number.isNaN(d.getTime())) return false;
        if (rangeStart && d < rangeStart) return false;
        if (rangeEnd && d > rangeEnd) return false;
      }

      return true;
    });
  }, [mappedRows, searchMode, searchText, statusFilter, dateFilter, fromDate, toDate, roleFilter, user?.name]);

  useEffect(() => {
    const el = tableWrapRef.current;
    if (!el) return;

    const update = () => {
      setScrollInfo({
        scrollTop: el.scrollTop || 0,
        clientHeight: el.clientHeight || 0,
        scrollHeight: el.scrollHeight || 0,
      });
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    let ro = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(update);
      ro.observe(el);
    }

    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      if (ro) ro.disconnect();
    };
  }, [loading, error, mappedRows.length, filteredRows.length]);

  const vScroll = useMemo(() => {
    const { scrollTop, clientHeight, scrollHeight } = scrollInfo;
    const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
    const canScroll = maxScrollTop > 1;

    const MIN_THUMB_PX = 160;
    const trackHeight = Math.max(0, clientHeight - 10);
    let thumbHeight = canScroll ? Math.round((clientHeight * clientHeight) / scrollHeight) : trackHeight;
    thumbHeight = Math.max(MIN_THUMB_PX, thumbHeight);
    thumbHeight = Math.min(trackHeight, thumbHeight);

    const maxThumbTop = Math.max(0, trackHeight - thumbHeight);
    const thumbTop = canScroll && maxScrollTop > 0 ? Math.round((scrollTop / maxScrollTop) * maxThumbTop) : 0;

    return { canScroll, trackHeight, thumbHeight, thumbTop, maxScrollTop, maxThumbTop };
  }, [scrollInfo]);

  const setScrollTopFromThumbTop = (thumbTop) => {
    const el = tableWrapRef.current;
    if (!el) return;
    if (!vScroll.canScroll || vScroll.maxThumbTop <= 0) return;
    const clamped = Math.max(0, Math.min(vScroll.maxThumbTop, thumbTop));
    const nextScrollTop = (clamped / vScroll.maxThumbTop) * vScroll.maxScrollTop;
    el.scrollTop = nextScrollTop;
  };

  const handleTrackMouseDown = (e) => {
    if (e.target?.dataset?.thumb === "1") return;
    const el = tableWrapRef.current;
    if (!el) return;
    const trackRect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - trackRect.top - 5;
    setScrollTopFromThumbTop(y - vScroll.thumbHeight / 2);
  };

  const handleThumbMouseDown = (e) => {
    e.preventDefault();
    const el = tableWrapRef.current;
    if (!el) return;
    dragRef.current = { startY: e.clientY, startThumbTop: vScroll.thumbTop };

    const onMove = (ev) => {
      if (!dragRef.current) return;
      const dy = ev.clientY - dragRef.current.startY;
      setScrollTopFromThumbTop(dragRef.current.startThumbTop + dy);
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const STATUS_OPTIONS = useMemo(
    () => [
      "Profile Submitted",
      "Feedback Pending",
      "Duplicate",
      "Drop Out By Client",
      "Drop Out By Candidate",
      "Assessment Round",
      "HR Round",
      "Director Round",
      "L1 Scheduled",
      "L2 Scheduled",
      "AI Interview",
      "Offered",
      "Closure",
      "Backout",
      "L1 Reject",
      "L2 Reject",
      "Final Round Rejected",
      "Shortlisted",
      "Position Hold",
      "Position Closed",
    ],
    []
  );

  const handleRoleFilter = (role) => {
    setRoleFilter((prev) => (prev === role ? "all" : role));
  };

  return (
    <div style={styles.page}>
      <style>{`
        .history-table-wrap { scrollbar-width: none; }
        .history-table-wrap::-webkit-scrollbar { width: 0; height: 0; }
      `}</style>

      <h2 style={styles.title}>Recruiters History</h2>

      <div style={styles.roleCards}>
        <button
          type="button"
          onClick={() => handleRoleFilter("tl")}
          style={roleFilter === "tl" ? styles.roleCardActive : styles.roleCard}
        >
          TL
        </button>
        <button
          type="button"
          onClick={() => handleRoleFilter("recruiter")}
          style={roleFilter === "recruiter" ? styles.roleCardActive : styles.roleCard}
        >
          Recruiter
        </button>
      </div>

      <div style={styles.filtersBar}>
        <div style={styles.searchModeGroup} role="group" aria-label="Search mode">
          <button
            type="button"
            onClick={() => { setSearchMode("candidate"); setSearchText(""); }}
            style={searchMode === "candidate" ? styles.modeBtnActive : styles.modeBtn}
          >
            Candidate
          </button>
          <button
            type="button"
            onClick={() => { setSearchMode("recruiter"); setSearchText(""); }}
            style={searchMode === "recruiter" ? styles.modeBtnActive : styles.modeBtn}
          >
            Recruiter
          </button>
        </div>

        {searchMode === "recruiter" ? (
          <select
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={styles.select}
          >
            <option value="">All Recruiters</option>
            {recruiterOptions.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        ) : (
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search candidate..."
            style={styles.searchInput}
          />
        )}

        <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} style={styles.select}>
          <option value="all">All dates</option>
          <option value="today">Today</option>
          <option value="last7">Last 7 days</option>
          <option value="last30">Last 30 days</option>
          <option value="custom">Custom range</option>
        </select>

        {dateFilter === "custom" && (
          <>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={styles.dateInput} />
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={styles.dateInput} />
          </>
        )}

        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={styles.select}>
          <option value="all">All status</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => {
            setSearchMode("candidate");
            setSearchText("");
            setStatusFilter("all");
            setDateFilter("all");
            setFromDate("");
            setToDate("");
            setRoleFilter("all");
          }}
          style={styles.clearBtn}
        >
          Clear Filters
        </button>
      </div>

      <div style={styles.tableOuter}>
        <div style={styles.tableScroll} className="history-table-wrap" ref={tableWrapRef}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Recruiter</th>
                <th style={styles.th}>Candidate</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Date & Time</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td style={styles.td} colSpan={4}>
                    <div style={styles.loaderCell}>
                      <Loader size="small" text="Loading history..." />
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td style={styles.td} colSpan={4}>{error}</td>
                </tr>
              ) : mappedRows.length === 0 ? (
                <tr>
                  <td style={styles.td} colSpan={4}>No status updates found</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td style={styles.td} colSpan={4}>No results match your filters</td>
                </tr>
              ) : (
                filteredRows.map((r) => (
                  <tr key={r.id}>
                    <td style={styles.td}>{r.recruiterName}</td>
                    <td style={styles.td}>{r.candidateName}</td>
                    <td style={styles.td}>{r.status}</td>
                    <td style={styles.td}>
                      {r.updatedAt ? new Date(r.updatedAt).toLocaleString() : "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {vScroll.canScroll && (
          <div style={styles.vScrollTrack} onMouseDown={handleTrackMouseDown} aria-hidden="true">
            <div
              data-thumb="1"
              style={{
                ...styles.vScrollThumb,
                height: `${vScroll.thumbHeight}px`,
                transform: `translateY(${vScroll.thumbTop}px)`,
              }}
              onMouseDown={handleThumbMouseDown}
            />
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    padding: "20px",
    height: "100vh",
    overflow: "hidden",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
  },
  title: {
    margin: "0 0 12px 0",
    flexShrink: 0,
  },
  roleCards: {
    display: "flex",
    gap: "10px",
    marginBottom: "12px",
  },
  roleCard: {
    padding: "10px 20px",
    border: "1px solid #cbd5e1",
    borderRadius: "10px",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: "14px",
    color: "#0f172a",
  },
  roleCardActive: {
    padding: "10px 20px",
    border: "1px solid #2563eb",
    borderRadius: "10px",
    background: "#2563eb",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: "14px",
    color: "#fff",
  },
  filtersBar: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    alignItems: "center",
    marginBottom: "12px",
    width: "100%",
    flexShrink: 0,
  },
  searchModeGroup: {
    display: "inline-flex",
    border: "1px solid #cbd5e1",
    borderRadius: "10px",
    overflow: "hidden",
    background: "#fff",
  },
  modeBtn: {
    padding: "8px 12px",
    border: "none",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 700,
    color: "#0f172a",
  },
  modeBtnActive: {
    padding: "8px 12px",
    border: "none",
    background: "#2563eb",
    cursor: "pointer",
    fontWeight: 700,
    color: "#fff",
  },
  searchInput: {
    height: "36px",
    padding: "0 10px",
    borderRadius: "10px",
    border: "1px solid #cbd5e1",
    minWidth: "220px",
    outline: "none",
  },
  select: {
    height: "36px",
    padding: "0 10px",
    borderRadius: "10px",
    border: "1px solid #cbd5e1",
    background: "#fff",
    cursor: "pointer",
  },
  dateInput: {
    height: "36px",
    padding: "0 10px",
    borderRadius: "10px",
    border: "1px solid #cbd5e1",
  },
  clearBtn: {
    height: "36px",
    padding: "0 12px",
    borderRadius: "10px",
    border: "1px solid #d1d5db",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 700,
  },
  tableOuter: {
    border: "1px solid #dbe3ef",
    borderRadius: "10px",
    background: "#fff",
    width: "100%",
    flex: 1,
    minHeight: 0,
    position: "relative",
    overflow: "hidden",
  },
  tableScroll: {
    width: "100%",
    height: "100%",
    overflowX: "auto",
    overflowY: "auto",
    paddingRight: "18px",
  },
  vScrollTrack: {
    position: "absolute",
    top: "5px",
    bottom: "5px",
    right: "5px",
    width: "14px",
    background: "#f1f5f9",
    borderRadius: "12px",
    border: "1px solid #e2e8f0",
    zIndex: 3,
  },
  vScrollThumb: {
    width: "100%",
    background: "#94a3b8",
    borderRadius: "12px",
    cursor: "grab",
    boxShadow: "0 6px 16px rgba(2, 6, 23, 0.12)",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: "780px",
  },
  th: {
    textAlign: "left",
    padding: "10px 12px",
    borderBottom: "1px solid #dbe3ef",
    background: "#f8fafc",
    whiteSpace: "nowrap",
    position: "sticky",
    top: 0,
    zIndex: 2,
  },
  td: {
    padding: "10px 12px",
    borderBottom: "1px solid #eef2f7",
    whiteSpace: "nowrap",
  },
  loaderCell: {
    width: "100%",
    minHeight: "80px",
  },
};
