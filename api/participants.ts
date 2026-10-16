import { supabaseFromEnv } from "../server/supabase.js";

// How many households have taken part, for the header. Cached briefly at the edge.
export async function GET(): Promise<Response> {
  try {
    const { count, error } = await supabaseFromEnv().from("households").select("id", { count: "exact", head: true });
    if (error) throw error;
    return Response.json(
      { households: count ?? 0 },
      { headers: { "cache-control": "public, max-age=60, s-maxage=60, stale-while-revalidate=600" } },
    );
  } catch (e) {
    console.error("participant count failed", { errorType: e instanceof Error ? e.name : typeof e });
    return Response.json({ error: "server" }, { status: 500 });
  }
}
