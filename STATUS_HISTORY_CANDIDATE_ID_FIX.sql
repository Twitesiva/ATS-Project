-- Fix: status_history.candidate_id type mismatch
-- -------------------------------------------
-- Current symptom in app:
--   "invalid input syntax for type bigint: '<uuid>'"
--
-- Root cause:
--   `public.candidate_records.id` is a UUID (text/uuid-like),
--   but `public.status_history.candidate_id` is `int8` (bigint).
--
-- Recommended fix:
--   Store candidate id as TEXT in status_history so it can hold UUIDs (and legacy bigint values).
--
-- Run in Supabase SQL editor.

ALTER TABLE public.status_history
  ALTER COLUMN candidate_id TYPE text
  USING candidate_id::text;

-- Optional: add an index for faster history lookups by candidate id
CREATE INDEX IF NOT EXISTS status_history_candidate_id_idx
  ON public.status_history (candidate_id);

