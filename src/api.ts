import { deviceId } from "./device";
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
  readonly id: string | null; // the existing submission, for "already_submitted"

  constructor(code: string, id: string | null = null) {
    super(code);
    this.code = code;
    this.id = id;
  }
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error ?? "server", typeof body.id === "string" ? body.id : null);
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
  cohorts: Record<"all" | "age" | "group" | "state" | "band", Record<"income" | "repayment" | "ratio" | "interest" | "savings", MetricStats>>;
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
      headers: { "content-type": "application/json", "x-device-id": deviceId() },
      body: JSON.stringify(household),
    }),
  );
}

export async function fetchHouseholdStats(id: string): Promise<HouseholdResult> {
  return json(await fetch(`/api/household?id=${encodeURIComponent(id)}`));
}

export async function fetchParticipantCount(): Promise<number | null> {
  try {
    const res = await fetch("/api/participants");
    if (!res.ok) return null;
    const body = (await res.json()) as { households?: unknown };
    return typeof body.households === "number" ? body.households : null;
  } catch {
    return null;
  }
}
