import type { Household } from "./household";

export type NegotiationMethod = "asked" | "named_rate" | "discharge" | "refinanced";

export interface OutcomeStats {
  n: number;
  gotCutPct: number;
  medianCut: number | null;
}

export interface NegotiationStats {
  minGroupSize: number;
  lender: OutcomeStats | null;
  all: OutcomeStats | null;
  byMethod: Partial<Record<NegotiationMethod, { n: number; gotCutPct: number }>>;
}

export interface NegotiationReportInput {
  lender: string;
  beforeRate: number;
  afterRate: number;
  method: NegotiationMethod;
  purpose: string;
  rateKind: string;
  residency: string;
}

export type FeedbackWant = "refinance_calc" | "rate_alerts" | "fixed_expiry" | "broker_compare" | "investor" | "other";

export interface FeedbackInput {
  wants: FeedbackWant[];
  message: string | null;
  lang: string;
  page: "form" | "result";
}

export class ApiError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error ?? "server");
  return body as T;
}

export async function fetchNegotiationStats(lender: string): Promise<NegotiationStats> {
  return json(await fetch(`/api/negotiation?lender=${encodeURIComponent(lender)}`));
}

export async function reportNegotiation(input: NegotiationReportInput): Promise<NegotiationStats> {
  return json(
    await fetch("/api/negotiation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function sendFeedback(input: FeedbackInput): Promise<void> {
  await json(
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
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

export interface HouseholdStats {
  minGroupSize: number;
  cohorts: Record<"all" | "group" | "state", Record<"income" | "repayment" | "ratio" | "savings", MetricStats>>;
  rates: { position: number; stats: MetricStats }[];
}

export interface HouseholdResult {
  id: string;
  stats: HouseholdStats;
}

export async function submitHousehold(household: Household): Promise<HouseholdResult> {
  return json(
    await fetch("/api/household", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(household),
    }),
  );
}

export async function fetchHouseholdStats(id: string): Promise<HouseholdResult> {
  return json(await fetch(`/api/household?id=${encodeURIComponent(id)}`));
}
