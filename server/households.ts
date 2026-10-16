import type { SupabaseClient } from "@supabase/supabase-js";
import { BALANCE_BANDS, OFFSET_BANDS } from "../src/bands.js";
import {
  AGE_BANDS,
  EXPERIENCE,
  householdTotals,
  MAX_MEMBERS,
  MAX_PROPERTIES,
  MONTHLY_BANDS,
  propertyLvrBand,
  ROLES,
  roundIncome,
  SAVINGS_BANDS,
  STATES,
  VALUE_BANDS,
  type Household,
  type Member,
  type Property,
} from "../src/household.js";
import { InputError, MIN_GROUP_SIZE, RateLimitError } from "./submissions.js";

const RESIDENCIES = ["pr", "visa", "overseas"] as const;
const PURPOSES = ["OO", "INV"] as const;
const RATE_KINDS = ["V", "F1", "F2", "F3", "F4", "F5"] as const;
const REPAYMENTS = ["PI", "IO"] as const;
const MAX_PER_DAY = 5;
const OCCUPATION_PATTERN = /^[1-8]\d{5}$/;
const LENDER_PATTERN = /^[\p{L}\p{N} .,&'()\-/]{1,80}$/u;

const oneOf = <T extends string>(options: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (options as readonly string[]).includes(value);

function pick<T extends string>(options: readonly T[], value: unknown, field: string): T {
  if (!oneOf(options, value)) throw new InputError(field);
  return value;
}

function finite(value: unknown, min: number, max: number, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new InputError(field);
  return value;
}

function parseMember(raw: unknown): Member {
  if (typeof raw !== "object" || raw === null) throw new InputError("member");
  const m = raw as Record<string, unknown>;
  if (typeof m.occupation !== "string" || !OCCUPATION_PATTERN.test(m.occupation)) throw new InputError("occupation");
  return {
    role: pick(ROLES, m.role, "role"),
    occupation: m.occupation,
    experience: pick(EXPERIENCE, m.experience, "experience"),
    income: finite(m.income, 0, 5_000_000, "income"),
  };
}

function parseLender(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !LENDER_PATTERN.test(value)) throw new InputError("lender");
  return value;
}

function parseProperty(raw: unknown): Property {
  if (typeof raw !== "object" || raw === null) throw new InputError("property");
  const p = raw as Record<string, unknown>;
  return {
    purpose: pick(PURPOSES, p.purpose, "purpose"),
    lender: parseLender(p.lender),
    rate: Math.round(finite(p.rate, 0.02, 0.15, "rate") * 100_000) / 100_000,
    rateKind: pick(RATE_KINDS, p.rateKind, "rateKind"),
    repayment: pick(REPAYMENTS, p.repayment, "repayment"),
    monthly: pick(MONTHLY_BANDS, p.monthly, "monthly"),
    balance: p.balance === null || p.balance === undefined ? null : pick(BALANCE_BANDS, p.balance, "balance"),
    offset: p.offset === null || p.offset === undefined ? null : pick(OFFSET_BANDS, p.offset, "offset"),
    interest: p.interest === null || p.interest === undefined ? null : Math.round(finite(p.interest, 0, 100_000, "interest")),
    value: pick(VALUE_BANDS, p.value, "value"),
  };
}

function parseSavings(value: unknown): Household["savings"] {
  if (value === null || value === undefined) return null;
  return pick(SAVINGS_BANDS, value, "savings");
}

export function parseHousehold(body: unknown): Household {
  if (typeof body !== "object" || body === null) throw new InputError("body");
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.members) || b.members.length < 1 || b.members.length > MAX_MEMBERS) throw new InputError("members");
  if (!Array.isArray(b.properties) || b.properties.length > MAX_PROPERTIES) throw new InputError("properties");
  const members = b.members.map(parseMember);
  if (members[0].role !== "self") throw new InputError("role");
  return {
    residency: pick(RESIDENCIES, b.residency, "residency"),
    state: pick(STATES, b.state, "state"),
    age: pick(AGE_BANDS, b.age, "age"),
    members,
    properties: b.properties.map(parseProperty),
    savings: parseSavings(b.savings),
  };
}

// Only coarse values leave this function: 4-digit occupation groups, incomes rounded to 5k, bands.
function toRow(h: Household) {
  const totals = householdTotals(h);
  return {
    residency: h.residency,
    state: h.state,
    age_band: h.age,
    members: h.members.length,
    income_total: totals.income,
    income_after_tax_total: totals.incomeAfterTax,
    primary_group: h.members[0].occupation.slice(0, 2),
    repayment_total: totals.repayment,
    interest_total: h.properties.length ? totals.interest : null,
    property_count: h.properties.length,
    savings_band: h.savings,
    member_rows: h.members.map((m, position) => ({
      position,
      role: m.role,
      occupation_unit: m.occupation.slice(0, 4),
      experience: m.experience,
      income: roundIncome(m.income),
    })),
    property_rows: h.properties.map((p, position) => ({
      position,
      purpose: p.purpose,
      lender: p.lender,
      rate: p.rate,
      rate_kind: p.rateKind,
      repayment_type: p.repayment,
      monthly_band: p.monthly,
      balance_band: p.balance,
      offset_band: p.offset ?? null,
      lvr_band: propertyLvrBand(p),
    })),
  };
}

export class AlreadySubmittedError extends Error {
  readonly id: string;

  constructor(id: string) {
    super("already_submitted");
    this.id = id;
  }
}

async function findByDevice(db: SupabaseClient, deviceHash: string): Promise<string | null> {
  const { data, error } = await db.from("households").select("id").eq("device_hash", deviceHash).limit(1);
  if (error) throw error;
  return data?.[0]?.id ?? null;
}

export async function insertHousehold(
  db: SupabaseClient,
  h: Household,
  ipHash: string,
  deviceHash: string | null,
  day: string,
): Promise<string> {
  if (deviceHash) {
    const existing = await findByDevice(db, deviceHash);
    if (existing) throw new AlreadySubmittedError(existing);
  }
  const { count, error: countError } = await db
    .from("households")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .eq("submitted_on", day);
  if (countError) throw countError;
  if ((count ?? 0) >= MAX_PER_DAY) throw new RateLimitError();

  const { data, error } = await db.rpc("submit_household", { p: { ...toRow(h), device_hash: deviceHash }, p_ip_hash: ipHash });
  if (error?.code === "23505" && deviceHash) {
    const existing = await findByDevice(db, deviceHash);
    if (existing) throw new AlreadySubmittedError(existing);
  }
  if (error) throw error;
  return data as string;
}

export interface MetricStats {
  n: number;
  below?: number;
  ties?: number;
  p25?: number;
  p50?: number;
  p75?: number;
  lo?: number;
  hi?: number;
  hist?: number[];
}

export interface PeerRow {
  lender: string;
  n: number;
  median: number;
  min: number;
}

export interface PeerTable {
  position: number;
  band: { lo: number; hi: number | null };
  rows: PeerRow[];
}

export interface HouseholdStats {
  minGroupSize: number;
  cohorts: Record<"all" | "age" | "group" | "state" | "band", Record<"income" | "repayment" | "ratio" | "interest" | "savings", MetricStats>>;
  rates: { position: number; stats: MetricStats }[];
  peers: PeerTable[];
}

export async function householdStats(db: SupabaseClient, id: string): Promise<HouseholdStats | null> {
  const [stats, peers] = await Promise.all([
    db.rpc("household_stats", { p_id: id }),
    db.rpc("peer_lenders", { p_id: id }),
  ]);
  if (stats.error) throw stats.error;
  if (peers.error) throw peers.error;
  if (!stats.data) return null;
  return {
    minGroupSize: MIN_GROUP_SIZE,
    ...(stats.data as Omit<HouseholdStats, "minGroupSize" | "peers">),
    peers: (peers.data ?? []) as PeerTable[],
  };
}
