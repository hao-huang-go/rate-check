-- The refinance break-even calculator shipped inside the rate simulator; ask about net worth instead.
alter table public.feedback drop constraint if exists feedback_wants_check;
alter table public.feedback add constraint feedback_wants_check
  check (wants <@ array['net_worth', 'rate_alerts', 'fixed_expiry', 'broker_compare', 'investor', 'other', 'refinance_calc']::text[]);
