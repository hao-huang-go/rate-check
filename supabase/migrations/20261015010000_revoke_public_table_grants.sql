-- Defence in depth on top of RLS: public roles get no table privileges at all.
revoke all on table public.submissions from anon, authenticated;
