-- Each member of a household also ranks on their own income against every individual in the data.
-- Cohorts mirror the household ones; "group" uses that member's own occupation group.
create or replace function public.member_income_stats(p_id uuid) returns json
language sql
stable
set search_path = public
as $$
  with me as (select * from households where id = p_id),
  mine as (select * from household_members where household_id = p_id and income > 0),
  everyone as (
    select m.income, left(m.occupation_unit, 2) as grp, h.state, h.age_band, h.income_total
    from household_members m join households h on h.id = m.household_id
    where m.income > 0
  )
  select coalesce(json_agg(json_build_object(
    'position', x.position,
    'cohorts', json_build_object(
      'all',   metric_summary(array(select income::float8 from everyone), x.income, 0, 300000, 20),
      'age',   metric_summary(array(select income::float8 from everyone where age_band = (select age_band from me)), x.income, 0, 300000, 20),
      'group', metric_summary(array(select income::float8 from everyone where grp = left(x.occupation_unit, 2)), x.income, 0, 300000, 20),
      'state', metric_summary(array(select income::float8 from everyone where state = (select state from me)), x.income, 0, 300000, 20),
      'band',  metric_summary(array(select income::float8 from everyone where income_total <@ income_band_bounds((select income_total from me))), x.income, 0, 300000, 20)
    )
  ) order by x.position), '[]'::json)
  from mine x;
$$;

revoke all on function public.member_income_stats from public, anon, authenticated;
