-- Household benchmark: who earns what, what they owe, what they've saved, what rate they pay.
-- Everything is stored rounded or banded; nothing here names or contacts anyone.

create table public.households (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  residency text not null check (residency in ('pr', 'visa', 'overseas')),
  state text not null check (state in ('NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT')),
  members smallint not null check (members between 1 and 6),
  income_total integer not null check (income_total between 0 and 10000000), -- AUD/yr, base salaries, rounded to 5k
  primary_group text not null check (primary_group ~ '^[1-8][0-9]$'), -- ANZSCO sub-major group of the first member
  repayment_total integer not null check (repayment_total between 0 and 200000), -- AUD/month, from band midpoints
  property_count smallint not null check (property_count between 0 and 10),
  savings_band text check (savings_band in ('0-10k', '10k-50k', '50k-100k', '100k-200k', '200k-500k', '500k-1m', '1m+')),
  ip_hash text not null,
  submitted_on date not null default (now() at time zone 'utc')::date
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  position smallint not null,
  role text not null check (role in ('self', 'partner', 'other')),
  occupation_unit text not null check (occupation_unit ~ '^[1-8][0-9]{3}$'), -- ANZSCO unit group, not the 6-digit occupation
  experience text not null check (experience in ('0-1', '1-3', '3-5', '5-10', '10-15', '15-20', '20+')),
  income integer not null check (income between 0 and 5000000), -- AUD/yr base, rounded to 5k
  primary key (household_id, position)
);

create table public.household_properties (
  household_id uuid not null references public.households (id) on delete cascade,
  position smallint not null,
  purpose text not null check (purpose in ('OO', 'INV')),
  lender text check (char_length(lender) <= 80),
  rate numeric(6, 5) not null check (rate between 0.02 and 0.15),
  rate_kind text not null check (rate_kind in ('V', 'F1', 'F2', 'F3', 'F4', 'F5')),
  repayment_type text not null check (repayment_type in ('PI', 'IO')),
  monthly_band text not null check (monthly_band in ('0-1k', '1k-2k', '2k-3k', '3k-4k', '4k-5k', '5k-6k', '6k-8k', '8k+')),
  balance_band text not null check (balance_band in ('0-300k', '300k-500k', '500k-750k', '750k-1m', '1m-1.5m', '1.5m+')),
  lvr_band text not null check (lvr_band in ('0-60', '60-70', '70-80', '80-90', '90-95')),
  primary key (household_id, position)
);

create index households_ip_day_idx on public.households (ip_hash, submitted_on);
create index households_group_idx on public.households (primary_group);
create index households_state_idx on public.households (state);
create index household_properties_rate_idx on public.household_properties (purpose, rate_kind);

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_properties enable row level security;
revoke all on table public.households, public.household_members, public.household_properties from anon, authenticated;

-- One transaction for the household and all its members and properties. Validation happens in
-- the API first; the table constraints are the backstop.
create or replace function public.submit_household(p jsonb, p_ip_hash text) returns uuid
language plpgsql
set search_path = public
as $$
declare
  hid uuid;
begin
  insert into households (residency, state, members, income_total, primary_group, repayment_total,
                          property_count, savings_band, ip_hash)
  values (p->>'residency', p->>'state', (p->>'members')::smallint, (p->>'income_total')::integer,
          p->>'primary_group', (p->>'repayment_total')::integer, (p->>'property_count')::smallint,
          p->>'savings_band', p_ip_hash)
  returning id into hid;

  insert into household_members (household_id, position, role, occupation_unit, experience, income)
  select hid, (m->>'position')::smallint, m->>'role', m->>'occupation_unit', m->>'experience', (m->>'income')::integer
  from jsonb_array_elements(p->'member_rows') m;

  insert into household_properties (household_id, position, purpose, lender, rate, rate_kind, repayment_type,
                                    monthly_band, balance_band, lvr_band)
  select hid, (x->>'position')::smallint, x->>'purpose', x->>'lender', (x->>'rate')::numeric, x->>'rate_kind',
         x->>'repayment_type', x->>'monthly_band', x->>'balance_band', x->>'lvr_band'
  from jsonb_array_elements(p->'property_rows') x;

  return hid;
end;
$$;

-- Percentile summary plus a fixed-bin histogram for one metric over one cohort.
-- Below the minimum cohort size only n comes back, so small groups reveal nothing.
create or replace function public.metric_summary(vals double precision[], mine double precision,
                                                 lo double precision, hi double precision, bins integer)
returns json
language sql
immutable
as $$
  with v as (select unnest(vals) as x)
  select case when (select count(*) from v) < 5 or mine is null then
    json_build_object('n', (select count(*) from v))
  else json_build_object(
    'n', (select count(*) from v),
    'below', (select count(*) from v where x < mine),
    'ties', (select count(*) from v where x = mine),
    'p25', (select percentile_cont(0.25) within group (order by x) from v),
    'p50', (select percentile_cont(0.5) within group (order by x) from v),
    'p75', (select percentile_cont(0.75) within group (order by x) from v),
    'lo', lo, 'hi', hi,
    'hist', (select json_agg(coalesce(c, 0) order by b)
             from generate_series(1, bins) b
             left join (select least(greatest(width_bucket(x, lo, hi, bins), 1), bins) as bucket, count(*) as c
                        from v group by 1) h on h.bucket = b)
  ) end;
$$;

-- Ranking of one household across cohorts: everyone, same occupation group, same state.
create or replace function public.household_stats(p_id uuid) returns json
language plpgsql
stable
set search_path = public
as $$
declare
  me households;
  result json;
begin
  select * into me from households where id = p_id;
  if not found then return null; end if;

  with savings_rank(band, ord) as (
    values ('0-10k', 1), ('10k-50k', 2), ('50k-100k', 3), ('100k-200k', 4), ('200k-500k', 5), ('500k-1m', 6), ('1m+', 7)
  ),
  cohorts(name, filter_group, filter_state) as (
    values ('all', null::text, null::text), ('group', me.primary_group, null), ('state', null, me.state)
  ),
  cohort_rows as (
    select c.name, h.*
    from cohorts c
    join households h on (c.filter_group is null or h.primary_group = c.filter_group)
                     and (c.filter_state is null or h.state = c.filter_state)
  ),
  my_savings as (select ord from savings_rank where band = me.savings_band)
  select json_object_agg(name, metrics) into result
  from (
    select cr.name, json_build_object(
      'income', metric_summary(array_agg(cr.income_total::double precision), me.income_total, 0, 400000, 20),
      'repayment', metric_summary(array_agg(cr.repayment_total::double precision) filter (where cr.property_count > 0),
                                  case when me.property_count > 0 then me.repayment_total end, 0, 10000, 20),
      'ratio', metric_summary(array_agg(cr.repayment_total * 12.0 / nullif(cr.income_total, 0)) filter (where cr.property_count > 0 and cr.income_total > 0),
                              case when me.property_count > 0 and me.income_total > 0 then me.repayment_total * 12.0 / me.income_total end, 0, 0.8, 20),
      'savings', metric_summary(array_agg(s.ord::double precision) filter (where s.ord is not null),
                                (select ord from my_savings), 0.5, 7.5, 7)
    ) as metrics
    from cohort_rows cr
    left join savings_rank s on s.band = cr.savings_band
    group by cr.name
  ) m;

  return json_build_object(
    'cohorts', result,
    'rates', (
      select coalesce(json_agg(json_build_object(
        'position', mp.position,
        'stats', metric_summary(
          array(select hp.rate::double precision from household_properties hp
                where hp.purpose = mp.purpose and hp.rate_kind = mp.rate_kind),
          mp.rate, 0.05, 0.09, 20)
      ) order by mp.position), '[]'::json)
      from household_properties mp where mp.household_id = p_id
    )
  );
end;
$$;

revoke all on function public.submit_household, public.household_stats, public.metric_summary from public, anon, authenticated;
