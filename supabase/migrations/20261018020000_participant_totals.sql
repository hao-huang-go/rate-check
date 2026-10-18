-- Households and the people in them, for the header count.
create or replace function public.participant_totals() returns json
language sql
stable
set search_path = public
as $$
  select json_build_object('households', count(*), 'people', coalesce(sum(members), 0)) from households;
$$;

revoke all on function public.participant_totals from public, anon, authenticated;
