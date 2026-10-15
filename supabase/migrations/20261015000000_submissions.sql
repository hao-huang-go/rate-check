-- Anonymous rate submissions. Only banded values are stored, never exact amounts.
create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  purpose text not null check (purpose in ('OO', 'INV')),
  repayment text not null check (repayment in ('PI', 'IO')),
  rate_kind text not null check (rate_kind in ('V', 'F1', 'F2', 'F3', 'F4', 'F5')),
  lvr_band text not null check (lvr_band in ('0-60', '60-70', '70-80', '80-90', '90-95')),
  balance_band text not null check (balance_band in ('0-300k', '300k-500k', '500k-750k', '750k-1m', '1m-1.5m', '1.5m+')),
  loan_age text check (loan_age in ('<1y', '1-3y', '3-5y', '5y+')),
  lender text check (char_length(lender) <= 80),
  rate numeric(6, 5) not null check (rate between 0.02 and 0.15),
  -- sha256(salt || day || ip): lets us rate-limit per day without storing the IP.
  ip_hash text not null,
  submitted_on date not null default (now() at time zone 'utc')::date
);

create index submissions_group_idx on public.submissions (purpose, repayment, rate_kind, lvr_band);
create index submissions_ip_day_idx on public.submissions (ip_hash, submitted_on);

-- RLS on with no policies: the publishable key can neither read nor write.
-- Only the server (secret key) touches this table.
alter table public.submissions enable row level security;

-- Aggregates for one comparison group, plus where `your_rate` sits in it.
create or replace function public.submission_stats(
  p_purpose text,
  p_repayment text,
  p_rate_kind text,
  p_lvr_band text,
  p_lender text,
  p_your_rate numeric
) returns json
language sql
stable
set search_path = public
as $$
  with grp as (
    select rate, lender
    from submissions
    where purpose = p_purpose
      and repayment = p_repayment
      and rate_kind = p_rate_kind
      and lvr_band = p_lvr_band
  ),
  same_lender as (
    select rate from grp where p_lender is not null and lender = p_lender
  )
  select json_build_object(
    'n', (select count(*) from grp),
    'below', (select count(*) from grp where rate < p_your_rate),
    'ties', (select count(*) from grp where rate = p_your_rate),
    'p25', (select percentile_cont(0.25) within group (order by rate) from grp),
    'median', (select percentile_cont(0.5) within group (order by rate) from grp),
    'p75', (select percentile_cont(0.75) within group (order by rate) from grp),
    'lender_n', (select count(*) from same_lender),
    'lender_median', (select percentile_cont(0.5) within group (order by rate) from same_lender)
  );
$$;

revoke all on function public.submission_stats from public, anon, authenticated;
