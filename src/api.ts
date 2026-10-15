import type { LoanAge } from "./bands";
import type { LoanProfile } from "./compare";

export interface GroupStats {
  n: number;
  enough: boolean;
  scope: "exact" | "broad" | null;
  minGroupSize: number;
  shownN?: number;
  higherThanPct?: number;
  p25?: number;
  median?: number;
  p75?: number;
  lenderMedian?: number | null;
}

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

export interface SubmissionResult {
  id: string;
  stats: GroupStats;
}

export class ApiError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

async function parse(res: Response): Promise<SubmissionResult> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error ?? "server");
  return body as SubmissionResult;
}

export async function submitRate(profile: LoanProfile, loanAge: LoanAge | null): Promise<SubmissionResult> {
  const res = await fetch("/api/submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...profile, loanAge }),
  });
  return parse(res);
}

export async function fetchStats(id: string): Promise<SubmissionResult> {
  return parse(await fetch(`/api/stats?id=${encodeURIComponent(id)}`));
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
