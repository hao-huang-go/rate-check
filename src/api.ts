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
