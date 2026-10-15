import type { SupabaseClient } from "@supabase/supabase-js";
import { InputError, MIN_GROUP_SIZE, RateLimitError } from "./submissions.js";

const METHODS = ["asked", "named_rate", "discharge", "refinanced"] as const;
type Method = (typeof METHODS)[number];
const PURPOSES = ["OO", "INV"] as const;
const RATE_KINDS = ["V", "F1", "F2", "F3", "F4", "F5"] as const;
const RESIDENCIES = ["pr", "visa", "overseas"] as const;
const MAX_PER_DAY = 5;
const LENDER_PATTERN = /^[\p{L}\p{N} .,&'()\-/]{1,80}$/u;

export interface NegotiationInput {
  lender: string;
  beforeRate: number;
  afterRate: number;
  method: Method;
  purpose: string | null;
  rateKind: string | null;
  residency: string | null;
}

export interface OutcomeStats {
  n: number;
  gotCutPct: number; // share of borrowers who stayed and got a lower rate
  medianCut: number | null; // among those who got one, as a rate fraction
}

export interface NegotiationStats {
  minGroupSize: number;
  lender: OutcomeStats | null; // null until the lender has MIN_GROUP_SIZE reports
  all: OutcomeStats | null;
  byMethod: Partial<Record<Method, { n: number; gotCutPct: number }>>;
}

const oneOf = <T extends string>(options: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (options as readonly string[]).includes(value);

const rateIn = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0.02 && value <= 0.15;

function optional<T extends string>(options: readonly T[], value: unknown, field: string): T | null {
  if (value === null || value === undefined) return null;
  if (!oneOf(options, value)) throw new InputError(field);
  return value;
}

function parseLender(value: unknown): string {
  if (typeof value !== "string" || !LENDER_PATTERN.test(value)) throw new InputError("lender");
  return value;
}

function parseMethod(value: unknown): Method {
  if (!oneOf(METHODS, value)) throw new InputError("method");
  return value;
}

function parseRate(value: unknown, field: string): number {
  if (!rateIn(value)) throw new InputError(field);
  return Math.round(value * 100_000) / 100_000;
}

export function parseNegotiation(body: unknown): NegotiationInput {
  if (typeof body !== "object" || body === null) throw new InputError("body");
  const b = body as Record<string, unknown>;
  return {
    lender: parseLender(b.lender),
    beforeRate: parseRate(b.beforeRate, "beforeRate"),
    afterRate: parseRate(b.afterRate, "afterRate"),
    method: parseMethod(b.method),
    purpose: optional(PURPOSES, b.purpose, "purpose"),
    rateKind: optional(RATE_KINDS, b.rateKind, "rateKind"),
    residency: optional(RESIDENCIES, b.residency, "residency"),
  };
}

export function parseLenderParam(value: string | null): string {
  return parseLender(value);
}

export async function insertNegotiation(
  db: SupabaseClient,
  input: NegotiationInput,
  ipHash: string,
  day: string,
): Promise<void> {
  const { count, error: countError } = await db
    .from("negotiations")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .eq("submitted_on", day);
  if (countError) throw countError;
  if ((count ?? 0) >= MAX_PER_DAY) throw new RateLimitError();

  const { error } = await db.from("negotiations").insert({
    lender: input.lender,
    before_rate: input.beforeRate,
    after_rate: input.afterRate,
    method: input.method,
    purpose: input.purpose,
    rate_kind: input.rateKind,
    residency: input.residency,
    ip_hash: ipHash,
    submitted_on: day,
  });
  if (error) throw error;
}

interface RawOutcome {
  n: number;
  got_cut: number;
  median_cut: number | null;
}

function outcome(raw: RawOutcome): OutcomeStats | null {
  const n = Number(raw.n);
  if (n < MIN_GROUP_SIZE) return null;
  return {
    n,
    gotCutPct: Number(raw.got_cut) / n,
    medianCut: raw.median_cut === null ? null : Number(raw.median_cut),
  };
}

export async function negotiationStats(db: SupabaseClient, lender: string): Promise<NegotiationStats> {
  const { data, error } = await db.rpc("negotiation_stats", { p_lender: lender });
  if (error) throw error;

  const byMethod: NegotiationStats["byMethod"] = {};
  for (const [method, raw] of Object.entries(data.by_method as Record<string, { n: number; got_cut: number }>)) {
    const n = Number(raw.n);
    if (oneOf(METHODS, method) && n >= MIN_GROUP_SIZE) {
      byMethod[method] = { n, gotCutPct: Number(raw.got_cut) / n };
    }
  }
  return {
    minGroupSize: MIN_GROUP_SIZE,
    lender: outcome(data.lender),
    all: outcome(data.all),
    byMethod,
  };
}
