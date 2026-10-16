-- What other households with similar income pay, by lender, for the same kind of loan.
-- Shown from a single submission upwards (the owner's call); the requester's own household is left out.
create or replace function public.income_band_bounds(income integer)
returns int4range
language sql
immutable
as $$
  select case
    when income < 60000 then int4range(0, 60000)
    when income < 90000 then int4range(60000, 90000)
    when income < 120000 then int4range(90000, 120000)
    when income < 160000 then int4range(120000, 160000)
    when income < 200000 then int4range(160000, 200000)
    when income < 250000 then int4range(200000, 250000)
    when income < 300000 then int4range(250000, 300000)
    when income < 400000 then int4range(300000, 400000)
    else int4range(400000, null)
  end;
$$;

create or replace function public.peer_lenders(p_id uuid) returns json
language sql
stable
set search_path = public
as $$
  with me as (select * from households where id = p_id),
  band as (select income_band_bounds(income_total) as r from me),
  mine as (select * from household_properties where household_id = p_id)
  select coalesce(json_agg(json_build_object(
    'position', m.position,
    'band', json_build_object('lo', lower((select r from band)), 'hi', upper((select r from band))),
    'rows', (
      select coalesce(json_agg(json_build_object('lender', x.lender, 'n', x.n, 'median', x.median, 'min', x.min)
                               order by x.median, x.lender), '[]'::json)
      from (
        select hp.lender, count(*) as n,
               percentile_cont(0.5) within group (order by hp.rate) as median,
               min(hp.rate) as min
        from household_properties hp
        join households h on h.id = hp.household_id
        where h.id <> p_id
          and hp.lender is not null
          and hp.purpose = m.purpose
          and hp.rate_kind = m.rate_kind
          and h.income_total <@ (select r from band)
        group by hp.lender
      ) x
    )
  ) order by m.position), '[]'::json)
  from mine m;
$$;

revoke all on function public.peer_lenders, public.income_band_bounds from public, anon, authenticated;
