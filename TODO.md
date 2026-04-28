# ATS Project – Comprehensive Test Plan

## Project Overview
Full-stack ATS (Applicant Tracking System) with Flask backend, React+Vite frontend, and Supabase PostgreSQL DB.

## Test Categories

### 1. Backend API Tests
- Upload API (`/upload`, `/bulk-upload-resumes`)
- Match API (`/match`)
- Resumes API (`/fetch-resumes`, `/resume-file/*`)
- Store API (`/store`)
- BDE API (`/bde/*` endpoints)
- Health check (`/health`)

### 2. Frontend Service Tests
- Auth context & role routing
- API service functions (axios wrappers)
- Reports service (Supabase queries)
- Data flow validation

### 3. Integration Tests
- End-to-end upload → parse → match → store flow
- Candidate lifecycle: add → update status → history → closure → revenue
- BDE workflow: lead → client → requirement → activity → closure

### 4. Data/Seed Tests
- Mock data generation for all tables
- Filter & search validation
- Edge cases (empty data, duplicates, boundary values)

## Files to Create
1. `backend/tests/test_api_upload.py` — Upload & bulk-upload tests
2. `backend/tests/test_api_match.py` — Resume-JD matching tests
3. `backend/tests/test_api_resumes.py` — Fetch resumes & file serving tests
4. `backend/tests/test_api_bde.py` — BDE CRUD & tracker tests
5. `backend/tests/test_services.py` — NLP, parser, storage unit tests
6. `frontend/src/tests/api.test.js` — Frontend API service tests
7. `frontend/src/tests/reportsService.test.js` — Reports data tests
8. `frontend/src/tests/auth.test.js` — Auth context tests
9. `tests/data/seed_data.json` — Seed/mock data for tests
10. `tests/integration/test_full_flow.py` — E2E integration tests

## Steps
- [x] Gather project understanding
- [x] Create test plan (TODO.md)
- [ ] Create seed/mock data
- [ ] Create backend API tests
- [ ] Create backend service tests
- [ ] Create frontend service tests
- [ ] Create integration tests
- [ ] Run & validate tests

