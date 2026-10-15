import { insertFeedback, parseFeedback } from "../server/feedback.js";
import { clientIp, hashIp, InputError, RateLimitError } from "../server/submissions.js";
import { supabaseFromEnv } from "../server/supabase.js";

export async function POST(request: Request): Promise<Response> {
  let input;
  try {
    input = parseFeedback(await request.json());
  } catch (e) {
    const field = e instanceof InputError ? e.message : "body";
    return Response.json({ error: "invalid", field }, { status: 400 });
  }

  const day = new Date().toISOString().slice(0, 10);
  const ipHash = hashIp(clientIp(request), process.env.IP_HASH_SALT ?? "", day);
  try {
    await insertFeedback(supabaseFromEnv(), input, ipHash, day);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof RateLimitError) return Response.json({ error: "rate_limited" }, { status: 429 });
    console.error("feedback submit failed", { errorType: e instanceof Error ? e.name : typeof e });
    return Response.json({ error: "server" }, { status: 500 });
  }
}
