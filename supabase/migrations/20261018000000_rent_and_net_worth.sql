-- Investment properties' rent offsets their cost: repayment and interest pressure use what's left after
-- rent. Net worth (property equity + savings + other investments, estimated from ranges) becomes a ranking.
alter table public.households
  add column rent_total integer check (rent_total between 0 and 1000000), -- monthly, AUD
  add column net_worth integer check (net_worth between -100000000 and 1000000000),
  add column investments_band text check (investments_band in ('0-10k', '10k-50k', '50k-100k', '100k-200k', '200k-500k', '500k-1m', '1m+'));
alter table public.household_properties
  add column rent_band text check (rent_band in ('0-400', '400-500', '500-600', '600-700', '700-800', '800-1000', '1000+'));

create or replace function public.submit_household(p jsonb, p_ip_hash text) returns uuid
language plpgsql
set search_path = public
as $$
declare
  hid uuid;
begin
  insert into households (residency, state, age_band, members, income_total, income_after_tax_total, primary_group,
                          repayment_total, interest_total, property_count, savings_band, ip_hash, device_hash, source,
                          rent_total, net_worth, investments_band)
  values (p->>'residency', p->>'state', p->>'age_band', (p->>'members')::smallint, (p->>'income_total')::integer,
          (p->>'income_after_tax_total')::integer, p->>'primary_group', (p->>'repayment_total')::integer,
          (p->>'interest_total')::integer, (p->>'property_count')::smallint, p->>'savings_band', p_ip_hash,
          p->>'device_hash', p->>'source',
          (p->>'rent_total')::integer, (p->>'net_worth')::integer, p->>'investments_band')
  returning id into hid;

  insert into household_members (household_id, position, role, occupation_unit, experience, income)
  select hid, (m->>'position')::smallint, m->>'role', m->>'occupation_unit', m->>'experience', (m->>'income')::integer
  from jsonb_array_elements(p->'member_rows') m;

  insert into household_properties (household_id, position, purpose, lender, rate, rate_kind, repayment_type,
                                    monthly_band, balance_band, offset_band, rent_band, lvr_band)
  select hid, (x->>'position')::smallint, x->>'purpose', x->>'lender', (x->>'rate')::numeric, x->>'rate_kind',
         x->>'repayment_type', x->>'monthly_band', x->>'balance_band', x->>'offset_band', x->>'rent_band', x->>'lvr_band'
  from jsonb_array_elements(p->'property_rows') x;

  return hid;
end;
$$;

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
  cohorts(name, filter_group, filter_state, filter_age, filter_income) as (
    values ('all', null::text, null::text, null::text, null::int4range), ('age', null, null, me.age_band, null),
           ('group', me.primary_group, null, null, null), ('state', null, me.state, null, null),
           ('band', null, null, null, income_band_bounds(me.income_total))
  ),
  cohort_rows as (
    select c.name, h.*
    from cohorts c
    join households h on (c.filter_group is null or h.primary_group = c.filter_group)
                     and (c.filter_state is null or h.state = c.filter_state)
                     and (c.filter_age is null or h.age_band = c.filter_age)
                     and (c.filter_income is null or h.income_total <@ c.filter_income)
  ),
  my_savings as (select ord from savings_rank where band = me.savings_band)
  select json_object_agg(name, metrics) into result
  from (
    select cr.name, json_build_object(
      'income', metric_summary(array_agg(cr.income_total::double precision), me.income_total, 0, 400000, 20),
      'repayment', metric_summary(array_agg(cr.repayment_total::double precision) filter (where cr.property_count > 0),
                                  case when me.property_count > 0 then me.repayment_total end, 0, 10000, 20),
      'ratio', metric_summary(array_agg(greatest(cr.repayment_total - coalesce(cr.rent_total, 0), 0) * 12.0 / nullif(cr.income_after_tax_total, 0)) filter (where cr.property_count > 0 and cr.income_after_tax_total > 0),
                              case when me.property_count > 0 and me.income_after_tax_total > 0 then greatest(me.repayment_total - coalesce(me.rent_total, 0), 0) * 12.0 / me.income_after_tax_total end, 0, 1, 20),
      'interest', metric_summary(array_agg(greatest(cr.interest_total - coalesce(cr.rent_total, 0), 0) * 12.0 / nullif(cr.income_after_tax_total, 0)) filter (where cr.interest_total is not null and cr.income_after_tax_total > 0),
                                 case when me.interest_total is not null and me.income_after_tax_total > 0 then greatest(me.interest_total - coalesce(me.rent_total, 0), 0) * 12.0 / me.income_after_tax_total end, 0, 0.6, 20),
      'networth', metric_summary(array_agg(cr.net_worth::double precision) filter (where cr.net_worth is not null),
                                 me.net_worth, 0, 3000000, 20),
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

revoke all on function public.submit_household, public.household_stats from public, anon, authenticated;
