-- supabase/add_gtm_short_links.sql
-- ── Clean branded redirect links for outreach/nurture emails ────────────
-- Written by GTM Head when it drafts a message (lib/shortLink.ts there),
-- read by this website's GET /go/:code route (server.js). Codes are
-- short-lived in spirit (one email, one click-through window) but never
-- expired/deleted automatically — kept for the attribution history.

create table if not exists gtm_short_links (
  code            text primary key,
  destination_url text not null,
  card            text, -- 'kunal' | 'kunal_elite' — for the click-log write in /go/:code
  created_at      timestamptz not null default now()
);

alter table gtm_short_links enable row level security;
-- No policies — service-role only (same convention as card_visit_log).
