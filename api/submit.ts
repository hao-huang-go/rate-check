import {
  clientIp,
  getSubmissionGroup,
  groupStats,
  hashIp,
  InputError,
  insertSubmission,
  parseSubmission,
  RateLimitError,
  supabaseFromEnv,
} from "../server/submissions.js";

export async function POST(request: Request): Promise<Response> {
  let input;
  try {
    input = parseSubmission(await request.json());
  } catch (e) {
    const field = e instanceof InputError ? e.message : "body";
    return Response.json({ error: "invalid", field }, { status: 400 });
  }

  const db = supabaseFromEnv();
  const day = new Date().toISOString().slice(0, 10);
  const ipHash = hashIp(clientIp(request), process.env.IP_HASH_SALT ?? "", day);

  try {
    const id = await insertSubmission(db, input, ipHash, day);
    const group = await getSubmissionGroup(db, id);
    const stats = group ? await groupStats(db, group) : null;
    return Response.json({ id, stats });
  } catch (e) {
    if (e instanceof RateLimitError) return Response.json({ error: "rate_limited" }, { status: 429 });
    if (e instanceof InputError) return Response.json({ error: "invalid", field: e.message }, { status: 400 });
    console.error("submit failed", { errorType: e instanceof Error ? e.name : typeof e });
    return Response.json({ error: "server" }, { status: 500 });
  }
}
