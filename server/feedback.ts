import type { SupabaseClient } from "@supabase/supabase-js";
import { InputError, RateLimitError } from "./submissions.js";

export const WANTS = ["net_worth", "rate_alerts", "fixed_expiry", "broker_compare", "investor", "other"] as const;
type Want = (typeof WANTS)[number];
const LANGS = ["zh", "en"] as const;
const PAGES = ["form", "result"] as const;
const MAX_MESSAGE = 1000;
const MAX_PER_DAY = 5;

export interface FeedbackInput {
  wants: Want[];
  message: string | null;
  lang: (typeof LANGS)[number] | null;
  page: (typeof PAGES)[number] | null;
}

const oneOf = <T extends string>(options: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (options as readonly string[]).includes(value);

function parseWants(value: unknown): Want[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new InputError("wants");
  const wants: Want[] = [];
  for (const w of value) {
    if (!oneOf(WANTS, w)) throw new InputError("wants");
    if (!wants.includes(w)) wants.push(w);
  }
  return wants;
}

function parseMessage(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new InputError("message");
  const trimmed = value.trim();
  if (trimmed.length > MAX_MESSAGE) throw new InputError("message");
  return trimmed || null;
}

function optional<T extends string>(options: readonly T[], value: unknown, field: string): T | null {
  if (value === undefined || value === null) return null;
  if (!oneOf(options, value)) throw new InputError(field);
  return value;
}

export function parseFeedback(body: unknown): FeedbackInput {
  if (typeof body !== "object" || body === null) throw new InputError("body");
  const b = body as Record<string, unknown>;
  const input = {
    wants: parseWants(b.wants),
    message: parseMessage(b.message),
    lang: optional(LANGS, b.lang, "lang"),
    page: optional(PAGES, b.page, "page"),
  };
  if (!input.wants.length && !input.message) throw new InputError("empty");
  return input;
}

export async function insertFeedback(
  db: SupabaseClient,
  input: FeedbackInput,
  ipHash: string,
  day: string,
): Promise<void> {
  const { count, error: countError } = await db
    .from("feedback")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .eq("submitted_on", day);
  if (countError) throw countError;
  if ((count ?? 0) >= MAX_PER_DAY) throw new RateLimitError();

  const { error } = await db.from("feedback").insert({
    wants: input.wants,
    message: input.message,
    lang: input.lang,
    page: input.page,
    ip_hash: ipHash,
    submitted_on: day,
  });
  if (error) throw error;
}
