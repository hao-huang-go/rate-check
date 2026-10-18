import type { SupabaseClient } from "@supabase/supabase-js";
import { InputError, RateLimitError } from "./submissions.js";

const MAX_BODY = 300;
const MAX_NICKNAME = 20;
const MAX_PER_DAY = 5;
const LIST_LIMIT = 100;
// Links are the usual spam vector; the wall is for words.
const LINK_PATTERN = /(https?:\/\/|www\.|\.(com|net|org|au|cn|io|app)\b)/i;

export interface CommentInput {
  body: string;
  nickname: string | null;
}

export interface CommentRow {
  id: string;
  body: string;
  nickname: string | null;
  authorReply: string | null;
  likes: number;
  liked: boolean;
  createdAt: string;
}

export function parseComment(raw: unknown): CommentInput {
  if (typeof raw !== "object" || raw === null) throw new InputError("body");
  const b = raw as Record<string, unknown>;
  const body = typeof b.body === "string" ? b.body.trim() : "";
  if (!body || body.length > MAX_BODY) throw new InputError("body");
  if (LINK_PATTERN.test(body)) throw new InputError("link");
  const nickname = typeof b.nickname === "string" ? b.nickname.trim() : "";
  if (nickname.length > MAX_NICKNAME || LINK_PATTERN.test(nickname)) throw new InputError("nickname");
  return { body, nickname: nickname || null };
}

export async function listComments(db: SupabaseClient, deviceHash: string | null): Promise<CommentRow[]> {
  const { data, error } = await db
    .from("comments")
    .select("id, body, nickname, author_reply, likes, created_at")
    .eq("hidden", false)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (error) throw error;
  const rows = data ?? [];
  let liked = new Set<string>();
  if (deviceHash && rows.length) {
    const { data: mine, error: likeError } = await db
      .from("comment_likes")
      .select("comment_id")
      .eq("device_hash", deviceHash)
      .in("comment_id", rows.map((r) => r.id));
    if (likeError) throw likeError;
    liked = new Set((mine ?? []).map((l) => l.comment_id as string));
  }
  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    nickname: r.nickname,
    authorReply: r.author_reply,
    likes: r.likes,
    liked: liked.has(r.id),
    createdAt: r.created_at,
  }));
}

export async function insertComment(
  db: SupabaseClient,
  input: CommentInput,
  deviceHash: string | null,
  ipHash: string,
  day: string,
): Promise<CommentRow> {
  const { count, error: countError } = await db
    .from("comments")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .eq("submitted_on", day);
  if (countError) throw countError;
  if ((count ?? 0) >= MAX_PER_DAY) throw new RateLimitError();
  const { data, error } = await db
    .from("comments")
    .insert({ body: input.body, nickname: input.nickname, device_hash: deviceHash, ip_hash: ipHash, submitted_on: day })
    .select("id, body, nickname, author_reply, likes, created_at")
    .single();
  if (error) throw error;
  return {
    id: data.id,
    body: data.body,
    nickname: data.nickname,
    authorReply: data.author_reply,
    likes: data.likes,
    liked: false,
    createdAt: data.created_at,
  };
}

export async function toggleLike(db: SupabaseClient, id: string, deviceHash: string): Promise<{ likes: number; liked: boolean } | null> {
  const { data, error } = await db.rpc("toggle_comment_like", { p_comment: id, p_device_hash: deviceHash });
  if (error) throw error;
  return (data as { likes: number; liked: boolean } | null) ?? null;
}
