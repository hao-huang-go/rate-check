# Rate Check

Compare an Australian home loan rate against published rates for loans on the same terms
(purpose, repayment type, rate type, LVR, loan size).

Benchmarks come from public Consumer Data Right product data across every bank in the CDR register,
filtered to rates an ordinary new borrower can apply for.

```bash
nvm use        # Node 22
npm install
npm run dev
npm run data          # pull CDR rates (~1 min), rebuild the static fallback public/benchmark.json
npm run data:upload   # same, and publish to Supabase Storage like the daily cron
```

Rates refresh daily via Vercel Cron (`vercel.json` → `api/cron/refresh-rates.ts`), which stores
the benchmark in a private Supabase Storage bucket; the app reads it from `/api/benchmark` and
falls back to `public/benchmark.json`.

Server env (`.env.local` locally, Vercel project env in production): `SUPABASE_URL`,
`SUPABASE_SECRET_KEY`, `IP_HASH_SALT`, `CRON_SECRET`.
