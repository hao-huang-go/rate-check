# Rate Check

Compare an Australian home loan rate against published rates for loans on the same terms
(purpose, repayment type, rate type, LVR, loan size).

Benchmarks come from public Consumer Data Right product data across every bank in the CDR register,
filtered to rates an ordinary new borrower can apply for.

```bash
npm install
npm run data   # pull CDR rates (~1 min) and rebuild public/benchmark.json
npm run dev
```
