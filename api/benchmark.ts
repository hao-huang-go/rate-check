import { loadLatestBenchmark } from "../server/benchmarkStore.js";
import { supabaseFromEnv } from "../server/supabase.js";

// Latest daily benchmark. Cached at the edge: it changes once a day.
export async function GET(): Promise<Response> {
  try {
    const body = await loadLatestBenchmark(supabaseFromEnv());
    if (!body) return Response.json({ error: "not_found" }, { status: 404 });
    return new Response(body, {
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (e) {
    console.error("benchmark load failed", { errorType: e instanceof Error ? e.name : typeof e });
    return Response.json({ error: "server" }, { status: 500 });
  }
}
