import {
  insertNegotiation,
  negotiationStats,
  parseLenderParam,
  parseNegotiation,
} from "../server/negotiations.js";
import { clientIp, hashIp, InputError, RateLimitError } from "../server/submissions.js";
import { supabaseFromEnv } from "../server/supabase.js";

// Aggregates only, and only once a lender has enough reports, so this is safe to serve publicly.
export async function GET(request: Request): Promise<Response> {
  let lender;
  try {
    lender = parseLenderParam(new URL(request.url).searchParams.get("lender"));
  } catch {
    return Response.json({ error: "invalid", field: "lender" }, { status: 400 });
  }
  try {
    return Response.json(await negotiationStats(supabaseFromEnv(), lender), {
      headers: { "cache-control": "public, max-age=60, s-maxage=300" },
    });
  } catch (e) {
    console.error("negotiation stats failed", { errorType: e instanceof Error ? e.name : typeof e });
    return Response.json({ error: "server" }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  let input;
  try {
    input = parseNegotiation(await request.json());
  } catch (e) {
    const field = e instanceof InputError ? e.message : "body";
    return Response.json({ error: "invalid", field }, { status: 400 });
  }

  const db = supabaseFromEnv();
  const day = new Date().toISOString().slice(0, 10);
  const ipHash = hashIp(clientIp(request), process.env.IP_HASH_SALT ?? "", day);
  try {
    await insertNegotiation(db, input, ipHash, day);
    return Response.json(await negotiationStats(db, input.lender));
  } catch (e) {
    if (e instanceof RateLimitError) return Response.json({ error: "rate_limited" }, { status: 429 });
    console.error("negotiation submit failed", { errorType: e instanceof Error ? e.name : typeof e });
    return Response.json({ error: "server" }, { status: 500 });
  }
}
