-- Percentile summary plus a fixed-bin histogram for one metric over one cohort.
-- Shown from the first submission: every group, however small, gets its distribution.
create or replace function public.metric_summary(vals double precision[], mine double precision,
                                                 lo double precision, hi double precision, bins integer)
returns json
language sql
immutable
as $$
  with v as (select unnest(vals) as x)
  select case when (select count(*) from v) = 0 or mine is null then
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
