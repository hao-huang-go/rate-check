import { buildBenchmark, IncompletePullError } from "../../server/benchmark.js";
import { saveBenchmark } from "../../server/benchmarkStore.js";
import { pullMortgageRates } from "../../server/cdr.js";
import { supabaseFromEnv } from "../../server/supabase.js";

// Daily, triggered by Vercel Cron (vercel.json). Vercel sends `Authorization: Bearer $CRON_SECRET`.
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const pull = await pullMortgageRates();
  const failedBrands = pull.brands.filter((b) => b.error).map((b) => b.brand);

  try {
    const benchmark = buildBenchmark(pull.rows, pull.fetchedAt);
    await saveBenchmark(supabaseFromEnv(), benchmark);
    const summary = {
      fetchedAt: pull.fetchedAt,
      lenders: benchmark.lenders.length,
      rows: benchmark.rows.length,
      failedBrands,
      seconds: Math.round((Date.now() - started) / 1000),
    };
    console.log("rates refreshed", summary);
    return Response.json(summary);
  } catch (e) {
    if (e instanceof IncompletePullError) {
      // Keep yesterday's data rather than ship a partial pull.
      console.error("rates refresh refused", { reason: e.message, failedBrands });
      return Response.json({ error: "incomplete_pull", reason: e.message, failedBrands }, { status: 502 });
    }
    console.error("rates refresh failed", { errorType: e instanceof Error ? e.name : typeof e });
    return Response.json({ error: "server" }, { status: 500 });
  }
}
