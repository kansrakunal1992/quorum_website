-- UNTESTED against a real database (standard Postgres syntax; safe to re-run). Read before running.
--
-- Adds the founder-qualification fields to the website's waitlist table. Before running:
--   1. Confirm the website's Supabase project, and that the table is really called `session_requests` (that is what server.js inserts into).
--   2. Confirm none of these columns already exists. (IF NOT EXISTS makes it safe to re-run.)
--   3. server.js is written to degrade gracefully: if these columns are missing it retries the legacy insert and appends the new
--      fields to additional_context, so deploying server.js BEFORE this migration does not break the form.
-- All columns are nullable text. The server validates values; there are no CHECK constraints on purpose, so a new option never needs a migration.
ALTER TABLE session_requests
  ADD COLUMN IF NOT EXISTS company               text,
  ADD COLUMN IF NOT EXISTS role                  text,
  ADD COLUMN IF NOT EXISTS company_size          text,
  ADD COLUMN IF NOT EXISTS decisions_per_quarter text,
  ADD COLUMN IF NOT EXISTS has_review_process    text,
  ADD COLUMN IF NOT EXISTS segment               text,   -- founder | feeder | champion | institution | exploring
  ADD COLUMN IF NOT EXISTS utm_source            text,
  ADD COLUMN IF NOT EXISTS utm_medium            text,
  ADD COLUMN IF NOT EXISTS utm_campaign          text,
  ADD COLUMN IF NOT EXISTS utm_content           text,
  ADD COLUMN IF NOT EXISTS cta                   text;   -- the button that opened the form (its data-track value)

COMMENT ON COLUMN session_requests.company IS 'Optional. Personal/business data: treat like the email column.';

-- Check afterwards:
--   select segment, role, company_size, utm_campaign, cta, count(*) from session_requests group by 1,2,3,4,5 order by 6 desc;
-- Rows saved before this migration keep NULLs here; rows saved by server.js before it ran carry the answers as text
-- in additional_context under a "[qualification]" heading.
