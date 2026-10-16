import type { Household } from "./household";

export type FeedbackWant = "net_worth" | "rate_alerts" | "fixed_expiry" | "broker_compare" | "investor" | "other";

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
  cohorts: Record<"all" | "age" | "group" | "state", Record<"income" | "repayment" | "ratio" | "savings", MetricStats>>;
  rates: { position: number; stats: MetricStats }[];
  peers: PeerTable[];
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
