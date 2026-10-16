import { AlreadySubmittedError, householdStats, insertHousehold, parseHousehold } from "../server/households.js";
import { clientIp, hashDevice, hashIp, InputError, parseSubmissionId, RateLimitError } from "../server/submissions.js";
import { supabaseFromEnv } from "../server/supabase.js";

export async function POST(request: Request): Promise<Response> {
  let household;
  try {
    household = parseHousehold(await request.json());
  } catch (e) {
    const field = e instanceof InputError ? e.message : "body";
    return Response.json({ error: "invalid", field }, { status: 400 });
  }

  const db = supabaseFromEnv();
  const day = new Date().toISOString().slice(0, 10);
  const salt = process.env.IP_HASH_SALT ?? "";
  const ipHash = hashIp(clientIp(request), salt, day);
  const deviceHash = hashDevice(request.headers.get("x-device-id"), salt);
  try {
    const id = await insertHousehold(db, household, ipHash, deviceHash, day);
    return Response.json({ id, stats: await householdStats(db, id) });
  } catch (e) {
    if (e instanceof RateLimitError) return Response.json({ error: "rate_limited" }, { status: 429 });
    if (e instanceof AlreadySubmittedError) return Response.json({ error: "already_submitted", id: e.id }, { status: 409 });
    console.error("household submit failed", { errorType: e instanceof Error ? e.name : typeof e });
    return Response.json({ error: "server" }, { status: 500 });
  }
}

// Stats are only reachable with a submission id: you see the rankings after you've contributed.
export async function GET(request: Request): Promise<Response> {
  let id;
  try {
    id = parseSubmissionId(new URL(request.url).searchParams.get("id"));
  } catch {
    return Response.json({ error: "invalid", field: "id" }, { status: 400 });
  }
  try {
    const stats = await householdStats(supabaseFromEnv(), id);
    if (!stats) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ id, stats });
  } catch (e) {
    console.error("household stats failed", { errorType: e instanceof Error ? e.name : typeof e });
    return Response.json({ error: "server" }, { status: 500 });
  }
}
