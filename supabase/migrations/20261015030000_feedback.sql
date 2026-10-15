-- What visitors want next, plus free-text feedback. Server-only, like the other tables.
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  wants text[] not null default '{}'
    check (wants <@ array['refinance_calc', 'rate_alerts', 'fixed_expiry', 'broker_compare', 'investor', 'other']::text[]),
  message text check (char_length(message) <= 1000),
  lang text check (lang in ('zh', 'en')),
  -- Where it was sent from, so feedback can be read in context.
  page text check (page in ('form', 'result')),
  ip_hash text not null,
  submitted_on date not null default (now() at time zone 'utc')::date,
  check (cardinality(wants) > 0 or char_length(coalesce(message, '')) > 0)
);

create index feedback_ip_day_idx on public.feedback (ip_hash, submitted_on);

alter table public.feedback enable row level security;
revoke all on table public.feedback from anon, authenticated;
