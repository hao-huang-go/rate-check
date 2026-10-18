import { supabaseFromEnv } from "../server/supabase.js";

// How many households and people have taken part, for the header. Cached briefly at the edge.
export async function GET(): Promise<Response> {
  try {
    const { data, error } = await supabaseFromEnv().rpc("participant_totals");
    if (error) throw error;
    const totals = data as { households: number; people: number };
    return Response.json(totals, { headers: { "cache-control": "public, max-age=60, s-maxage=60, stale-while-revalidate=600" } });
  } catch (e) {
    console.error("participant count failed", { errorType: e instanceof Error ? e.name : typeof e });
    return Response.json({ error: "server" }, { status: 500 });
  }
}
