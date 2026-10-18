import { toggleLike } from "../server/comments.js";
import { hashDevice, parseSubmissionId } from "../server/submissions.js";
import { supabaseFromEnv } from "../server/supabase.js";

// Like or unlike a comment; one like per device.
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  let id;
  try {
    id = parseSubmissionId(typeof body?.id === "string" ? body.id : null);
  } catch {
    return Response.json({ error: "invalid", field: "id" }, { status: 400 });
  }
  const deviceHash = hashDevice(request.headers.get("x-device-id"), process.env.IP_HASH_SALT ?? "");
  if (!deviceHash) return Response.json({ error: "invalid", field: "device" }, { status: 400 });
  try {
    const result = await toggleLike(supabaseFromEnv(), id, deviceHash);
    if (!result) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json(result);
  } catch (e) {
    console.error("comment like failed", { errorType: e instanceof Error ? e.name : typeof e });
    return Response.json({ error: "server" }, { status: 500 });
  }
}
