import { insertComment, listComments, parseComment } from "../server/comments.js";
import { clientIp, hashDevice, hashIp, InputError, RateLimitError } from "../server/submissions.js";
import { supabaseFromEnv } from "../server/supabase.js";

const salt = () => process.env.IP_HASH_SALT ?? "";

// The comment wall, newest first, with which ones this device has liked.
export async function GET(request: Request): Promise<Response> {
  try {
    const comments = await listComments(supabaseFromEnv(), hashDevice(request.headers.get("x-device-id"), salt()));
    return Response.json({ comments }, { headers: { "cache-control": "private, max-age=15" } });
  } catch (e) {
    console.error("comments list failed", { errorType: e instanceof Error ? e.name : typeof e });
    return Response.json({ error: "server" }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  let input;
  try {
    input = parseComment(await request.json());
  } catch (e) {
    return Response.json({ error: "invalid", field: e instanceof InputError ? e.message : "body" }, { status: 400 });
  }
  const day = new Date().toISOString().slice(0, 10);
  try {
    const comment = await insertComment(
      supabaseFromEnv(),
      input,
      hashDevice(request.headers.get("x-device-id"), salt()),
      hashIp(clientIp(request), salt(), day),
      day,
    );
    return Response.json({ comment });
  } catch (e) {
    if (e instanceof RateLimitError) return Response.json({ error: "rate_limited" }, { status: 429 });
    console.error("comment insert failed", { errorType: e instanceof Error ? e.name : typeof e });
    return Response.json({ error: "server" }, { status: 500 });
  }
}
