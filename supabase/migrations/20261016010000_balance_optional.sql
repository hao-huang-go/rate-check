-- Many borrowers don't know their exact balance; it's estimated from the repayment instead.
alter table public.household_properties alter column balance_band drop not null;
