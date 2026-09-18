-- supabase/add_card_visit_log.sql
-- ── GTM attribution: per-visit UTM logging for founder-led card pages ────
-- Additive only, separate from the existing kunal_card_visits counter
-- (that one stays exactly as-is — this is a new, independent log for
-- attribution, not a replacement). Written by POST /api/card-visit in
-- server.js, read by the GTM Head project (same Supabase project).

create extension if not exists "uuid-ossp";

create table if not exists card_visit_log (
  id           uuid primary key default uuid_generate_v4(),
  created_at   timestamptz not null default now(),
  card         text not null, -- 'kunal' | 'kunal_elite' | 'vedant' | 'vedant_elite' | ...
  utm_source   text,
  utm_campaign text,
  utm_content  text
);

create index if not exists idx_card_visit_log_card_time on card_visit_log (card, created_at desc);
create index if not exists idx_card_visit_log_utm_source on card_visit_log (utm_source) where utm_source is not null;

alter table card_visit_log enable row level security;
-- No policies — service-role only, same convention as the GTM Head's own tables.
