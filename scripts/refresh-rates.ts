// Local counterpart of the daily cron: pull CDR rates, rebuild the benchmark, write the
// static fallback (public/benchmark.json). With --upload, also publish it like the cron does.
import { mkdir, writeFile } from "node:fs/promises";
import { buildBenchmark } from "../server/benchmark.js";
import { saveBenchmark } from "../server/benchmarkStore.js";
import { pullMortgageRates } from "../server/cdr.js";
import { supabaseFromEnv } from "../server/supabase.js";

const upload = process.argv.includes("--upload");

const pull = await pullMortgageRates();
const failed = pull.brands.filter((b) => b.error);
const partial = pull.brands.filter((b) => b.detailFailures);
console.log(`${pull.brands.length} brands, ${pull.rows.length} raw rows; failed: ${failed.map((b) => b.brand).join(", ") || "none"}; partial: ${partial.map((b) => `${b.brand} (${b.detailFailures}/${b.products})`).join(", ") || "none"}`);

await mkdir("data", { recursive: true });
await writeFile("data/rates.json", JSON.stringify({ fetchedAt: pull.fetchedAt, rows: pull.rows }, null, 1));

const benchmark = buildBenchmark(pull.rows, pull.fetchedAt);
await writeFile("public/benchmark.json", JSON.stringify(benchmark));
console.log(`benchmark: ${benchmark.lenders.length} lenders, ${benchmark.rows.length} rows`);

if (upload) {
  await saveBenchmark(supabaseFromEnv(), benchmark);
  console.log("uploaded to Supabase Storage");
}
