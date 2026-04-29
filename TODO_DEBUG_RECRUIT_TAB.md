# Debug Plan: Recruit Tab Empty in Manager Reports

## Root Causes Found

### 1. `getFilterOptions` lowercases recruiter names (CRITICAL)
**File:** `src/services/reportsService.js`
- `getFilterOptions` returns recruiter names after calling `.toLowerCase()`.
- The dropdown shows `"manager"` but the database stores `"Manager"` (or other casing).
- **Supabase `.eq()` is case-sensitive by default.**
- `applyCandidateFilters` does `q.eq("recruiter", "manager")` → matches **0 rows**.
- **Client names are NOT lowercased**, so Client filter works perfectly.

### 2. `Reports.jsx` state management out of sync
- `handleReset()` does NOT clear `quickFilter`. UI shows "Manager" button active but filters are actually reset.
- `handleApply()` does NOT clear `quickFilter`. Manually applying filters keeps old quick-filter state.
- `handleQuickFilter("manager")` sets `filters = defaultFilters` but `appliedFilters = { filterType: "recruiter", filterValue: "manager" }`. The UI dropdown still shows **"Client"** while the actual applied filter is **"Recruiter"**.

### 3. `getReportsTableData` key mismatch
- **Candidate data** groups by key: `normalizeKey(clientName)` (client only).
- **Revenue data** groups by key: `normalizeKey(clientName)||normalizeKey(recruiter)` (client+recruiter composite).
- Revenue entries never match candidate entries → **Revenue column stays 0** even when data exists.

## Fixes

- [x] Fix 1: `getFilterOptions` → preserve original recruiter casing.
- [x] Fix 2: `applyCandidateFilters` / `applyRevenueFilters` → use `.ilike()` for recruiter (case-insensitive exact match).
- [x] Fix 3: `Reports.jsx` → sync `quickFilter`, `filters`, and `appliedFilters` correctly.
- [x] Fix 4: `getReportsTableData` → use consistent grouping key for candidate and revenue data.
- [x] Fix 5: Add debug logging points so user can trace data flow in browser console.

## Verification Steps
1. Open browser DevTools → Console.
2. Select "Recruiter" from filterType dropdown → check `[getFilterOptions]` recruiters list.
3. Select a recruiter → click Apply → check `[loadReports]` API filters and response counts.
4. If `recruiter` filter value casing differs from DB, `.ilike()` will now match.
5. Revenue should now merge into table rows thanks to consistent keys.

