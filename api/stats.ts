import {
  getSubmissionGroup,
  groupStats,
  InputError,
  parseSubmissionId,
} from "../server/submissions.js";
import { supabaseFromEnv } from "../server/supabase.js";

// Stats are only reachable with a submission id: you see the group after you've contributed to it.
export async function GET(request: Request): Promise<Response> {
  let id;
  try {
    id = parseSubmissionId(new URL(request.url).searchParams.get("id"));
  } catch (e) {
    if (e instanceof InputError) return Response.json({ error: "invalid", field: "id" }, { status: 400 });
    throw e;
  }

  try {
    const db = supabaseFromEnv();
    const group = await getSubmissionGroup(db, id);
    if (!group) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ id, stats: await groupStats(db, group) });
  } catch (e) {
    console.error("stats failed", { errorType: e instanceof Error ? e.name : typeof e });
    return Response.json({ error: "server" }, { status: 500 });
  }
}
