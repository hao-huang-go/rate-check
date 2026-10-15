-- Borrower profile on submissions. Residency changes what lenders offer, so stats group by it.
alter table public.submissions
  add column residency text not null default 'pr' check (residency in ('pr', 'visa', 'overseas')),
  add column income text check (income in ('payg', 'self'));

drop index if exists public.submissions_group_idx;
create index submissions_group_idx on public.submissions (residency, purpose, rate_kind, repayment, lvr_band);

drop function if exists public.submission_stats(text, text, text, text, text, numeric);

-- `exact`: same residency, purpose, rate type, repayment and LVR band.
-- `broad`: same residency, purpose and rate type, used while the exact group is still small.
create or replace function public.submission_stats(
  p_residency text,
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
  with broad as (
    select rate, lender, repayment, lvr_band
    from submissions
    where residency = p_residency and purpose = p_purpose and rate_kind = p_rate_kind
  ),
  grp as (
    select rate, lender from broad where repayment = p_repayment and lvr_band = p_lvr_band
  ),
  same_lender as (
    select rate from grp where p_lender is not null and lender = p_lender
  )
  select json_build_object(
    'exact', json_build_object(
      'n', (select count(*) from grp),
      'below', (select count(*) from grp where rate < p_your_rate),
      'ties', (select count(*) from grp where rate = p_your_rate),
      'p25', (select percentile_cont(0.25) within group (order by rate) from grp),
      'median', (select percentile_cont(0.5) within group (order by rate) from grp),
      'p75', (select percentile_cont(0.75) within group (order by rate) from grp)
    ),
    'broad', json_build_object(
      'n', (select count(*) from broad),
      'below', (select count(*) from broad where rate < p_your_rate),
      'ties', (select count(*) from broad where rate = p_your_rate),
      'p25', (select percentile_cont(0.25) within group (order by rate) from broad),
      'median', (select percentile_cont(0.5) within group (order by rate) from broad),
      'p75', (select percentile_cont(0.75) within group (order by rate) from broad)
    ),
    'lender_n', (select count(*) from same_lender),
    'lender_median', (select percentile_cont(0.5) within group (order by rate) from same_lender)
  );
$$;

revoke all on function public.submission_stats from public, anon, authenticated;

-- What borrowers got when they asked their lender for a better rate.
create table public.negotiations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lender text not null check (char_length(lender) between 1 and 80),
  before_rate numeric(6, 5) not null check (before_rate between 0.02 and 0.15),
  after_rate numeric(6, 5) not null check (after_rate between 0.02 and 0.15),
  -- asked: just asked; named_rate: quoted a competitor; discharge: requested discharge papers;
  -- refinanced: the lender wouldn't move enough, so they left (after_rate is the new lender's).
  method text not null check (method in ('asked', 'named_rate', 'discharge', 'refinanced')),
  purpose text check (purpose in ('OO', 'INV')),
  rate_kind text check (rate_kind in ('V', 'F1', 'F2', 'F3', 'F4', 'F5')),
  residency text check (residency in ('pr', 'visa', 'overseas')),
  ip_hash text not null,
  submitted_on date not null default (now() at time zone 'utc')::date
);

create index negotiations_lender_idx on public.negotiations (lender);
create index negotiations_ip_day_idx on public.negotiations (ip_hash, submitted_on);

alter table public.negotiations enable row level security;
revoke all on table public.negotiations from anon, authenticated;

-- Outcomes for one lender and across all lenders. A "cut" is before_rate - after_rate
-- among borrowers who stayed; refinancing counts as the lender not matching.
create or replace function public.negotiation_stats(p_lender text) returns json
language sql
stable
set search_path = public
as $$
  with lender_rows as (select * from negotiations where lender = p_lender),
  stayed as (select before_rate - after_rate as cut from lender_rows where method <> 'refinanced'),
  all_stayed as (select method, before_rate - after_rate as cut from negotiations where method <> 'refinanced')
  select json_build_object(
    'lender', json_build_object(
      'n', (select count(*) from lender_rows),
      'got_cut', (select count(*) from stayed where cut > 0),
      'median_cut', (select percentile_cont(0.5) within group (order by cut) from stayed where cut > 0)
    ),
    'all', json_build_object(
      'n', (select count(*) from negotiations),
      'got_cut', (select count(*) from all_stayed where cut > 0),
      'median_cut', (select percentile_cont(0.5) within group (order by cut) from all_stayed where cut > 0)
    ),
    'by_method', (
      select coalesce(json_object_agg(method, json_build_object('n', n, 'got_cut', got_cut)), '{}'::json)
      from (
        select method, count(*) as n, count(*) filter (where cut > 0) as got_cut
        from all_stayed group by method
      ) m
    )
  );
$$;

revoke all on function public.negotiation_stats from public, anon, authenticated;
