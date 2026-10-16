import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { balanceBand, LOAN_AGES, lvrBand, MAX_LVR, type LoanAge, type LvrBand } from "../src/bands.js";

const PURPOSES = ["OO", "INV"] as const;
const REPAYMENTS = ["PI", "IO"] as const;
const RATE_KINDS = ["V", "F1", "F2", "F3", "F4", "F5"] as const;
const RESIDENCIES = ["pr", "visa", "overseas"] as const;
const INCOMES = ["payg", "self"] as const;
const MAX_SUBMISSIONS_PER_DAY = 5;
// Below this many people in a group, percentiles would be noise and could single someone out.
export const MIN_GROUP_SIZE = 1;
const LENDER_PATTERN = /^[\p{L}\p{N} .,&'()\-/]{1,80}$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SubmissionInput {
  purpose: (typeof PURPOSES)[number];
  repayment: (typeof REPAYMENTS)[number];
  rateKind: (typeof RATE_KINDS)[number];
  balance: number;
  propertyValue: number;
  lender: string | null;
  rate: number;
  loanAge: LoanAge | null;
  residency: (typeof RESIDENCIES)[number];
  income: (typeof INCOMES)[number] | null;
}

interface StoredGroup {
  residency: string;
  purpose: string;
  repayment: string;
  rate_kind: string;
  lvr_band: LvrBand;
  lender: string | null;
  rate: number;
}

export interface GroupStats {
  n: number; // size of the exact group
  enough: boolean; // true when either the exact or the broad group can be shown
  scope: "exact" | "broad" | null;
  minGroupSize: number;
  // Present only when enough is true, for the group named by scope.
  shownN?: number;
  higherThanPct?: number; // share paying less than you, ties count half
  p25?: number;
  median?: number;
  p75?: number;
  lenderMedian?: number | null;
}

interface RawGroup {
  n: number;
  below: number;
  ties: number;
  p25: number | null;
  median: number | null;
  p75: number | null;
}

export class InputError extends Error {}

const oneOf = <T extends string>(options: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (options as readonly string[]).includes(value);

const finiteBetween = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

export function parseSubmission(body: unknown): SubmissionInput {
  if (typeof body !== "object" || body === null) throw new InputError("body");
  const b = body as Record<string, unknown>;

  if (!oneOf(PURPOSES, b.purpose)) throw new InputError("purpose");
  if (!oneOf(REPAYMENTS, b.repayment)) throw new InputError("repayment");
  if (!oneOf(RATE_KINDS, b.rateKind)) throw new InputError("rateKind");
  if (!finiteBetween(b.balance, 10_000, 20_000_000)) throw new InputError("balance");
  if (!finiteBetween(b.propertyValue, 10_000, 50_000_000)) throw new InputError("propertyValue");
  if (b.balance / b.propertyValue > MAX_LVR) throw new InputError("lvr");
  if (!finiteBetween(b.rate, 0.02, 0.15)) throw new InputError("rate");

  return {
    purpose: b.purpose,
    repayment: b.repayment,
    rateKind: b.rateKind,
    balance: b.balance,
    propertyValue: b.propertyValue,
    lender: parseLender(b.lender),
    rate: Math.round(b.rate * 100_000) / 100_000,
    loanAge: parseLoanAge(b.loanAge),
    residency: parseResidency(b.residency),
    income: parseIncome(b.income),
  };
}

// Residency and income are optional so clients from before the borrower-profile fields keep working.
function parseResidency(value: unknown): (typeof RESIDENCIES)[number] {
  if (value === null || value === undefined) return "pr";
  if (!oneOf(RESIDENCIES, value)) throw new InputError("residency");
  return value;
}

function parseIncome(value: unknown): (typeof INCOMES)[number] | null {
  if (value === null || value === undefined) return null;
  if (!oneOf(INCOMES, value)) throw new InputError("income");
  return value;
}

function parseLender(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !LENDER_PATTERN.test(value)) throw new InputError("lender");
  return value;
}

function parseLoanAge(value: unknown): LoanAge | null {
  if (value === null || value === undefined) return null;
  if (!oneOf(LOAN_AGES, value)) throw new InputError("loanAge");
  return value;
}

export function parseSubmissionId(id: string | null): string {
  if (!id || !UUID_PATTERN.test(id)) throw new InputError("id");
  return id;
}

export function hashIp(ip: string, salt: string, day: string): string {
  return createHash("sha256").update(`${salt}|${day}|${ip}`).digest("hex");
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}


export class RateLimitError extends Error {}

export async function insertSubmission(
  db: SupabaseClient,
  input: SubmissionInput,
  ipHash: string,
  day: string,
): Promise<string> {
  const { count, error: countError } = await db
    .from("submissions")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .eq("submitted_on", day);
  if (countError) throw countError;
  if ((count ?? 0) >= MAX_SUBMISSIONS_PER_DAY) throw new RateLimitError();

  const band = lvrBand(input.balance / input.propertyValue);
  if (!band) throw new InputError("lvr");

  const { data, error } = await db
    .from("submissions")
    .insert({
      purpose: input.purpose,
      repayment: input.repayment,
      rate_kind: input.rateKind,
      lvr_band: band,
      balance_band: balanceBand(input.balance),
      loan_age: input.loanAge,
      residency: input.residency,
      income: input.income,
      lender: input.lender,
      rate: input.rate,
      ip_hash: ipHash,
      submitted_on: day,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function getSubmissionGroup(db: SupabaseClient, id: string): Promise<StoredGroup | null> {
  const { data, error } = await db
    .from("submissions")
    .select("residency, purpose, repayment, rate_kind, lvr_band, lender, rate")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? { ...data, rate: Number(data.rate) } : null;
}

export async function groupStats(db: SupabaseClient, group: StoredGroup): Promise<GroupStats> {
  const { data, error } = await db.rpc("submission_stats", {
    p_residency: group.residency,
    p_purpose: group.purpose,
    p_repayment: group.repayment,
    p_rate_kind: group.rate_kind,
    p_lvr_band: group.lvr_band,
    p_lender: group.lender,
    p_your_rate: group.rate,
  });
  if (error) throw error;

  const exact = data.exact as RawGroup;
  const broad = data.broad as RawGroup;
  const n = Number(exact.n);
  const scope = n >= MIN_GROUP_SIZE ? "exact" : Number(broad.n) >= MIN_GROUP_SIZE ? "broad" : null;
  if (!scope) return { n, enough: false, scope: null, minGroupSize: MIN_GROUP_SIZE };

  const shown = scope === "exact" ? exact : broad;
  const shownN = Number(shown.n);
  return {
    n,
    enough: true,
    scope,
    minGroupSize: MIN_GROUP_SIZE,
    shownN,
    higherThanPct: (Number(shown.below) + Number(shown.ties) / 2) / shownN,
    p25: Number(shown.p25),
    median: Number(shown.median),
    p75: Number(shown.p75),
    lenderMedian: Number(data.lender_n) >= MIN_GROUP_SIZE ? Number(data.lender_median) : null,
  };
}
