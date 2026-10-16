-- One submission per device: a salted hash of a random id the browser keeps in localStorage.
alter table public.households add column device_hash text;
create unique index households_device_hash_key on public.households (device_hash) where device_hash is not null;

create or replace function public.submit_household(p jsonb, p_ip_hash text) returns uuid
language plpgsql
set search_path = public
as $$
declare
  hid uuid;
begin
  insert into households (residency, state, age_band, members, income_total, income_after_tax_total, primary_group,
                          repayment_total, interest_total, property_count, savings_band, ip_hash, device_hash)
  values (p->>'residency', p->>'state', p->>'age_band', (p->>'members')::smallint, (p->>'income_total')::integer,
          (p->>'income_after_tax_total')::integer, p->>'primary_group', (p->>'repayment_total')::integer,
          (p->>'interest_total')::integer, (p->>'property_count')::smallint, p->>'savings_band', p_ip_hash,
          p->>'device_hash')
  returning id into hid;

  insert into household_members (household_id, position, role, occupation_unit, experience, income)
  select hid, (m->>'position')::smallint, m->>'role', m->>'occupation_unit', m->>'experience', (m->>'income')::integer
  from jsonb_array_elements(p->'member_rows') m;

  insert into household_properties (household_id, position, purpose, lender, rate, rate_kind, repayment_type,
                                    monthly_band, balance_band, offset_band, lvr_band)
  select hid, (x->>'position')::smallint, x->>'purpose', x->>'lender', (x->>'rate')::numeric, x->>'rate_kind',
         x->>'repayment_type', x->>'monthly_band', x->>'balance_band', x->>'offset_band', x->>'lvr_band'
  from jsonb_array_elements(p->'property_rows') x;

  return hid;
end;
$$;

revoke all on function public.submit_household from public, anon, authenticated;
