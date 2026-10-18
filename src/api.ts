import { deviceId } from "./device";
import { visitSource } from "./source";
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
  cohorts: Record<"all" | "age" | "group" | "state" | "band", Record<"income" | "repayment" | "ratio" | "interest" | "savings" | "networth", MetricStats>>;
  // Each earning member's own income, ranked against all individuals.
  members: { position: number; cohorts: Record<"all" | "age" | "group" | "state" | "band", MetricStats> }[];
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
      body: JSON.stringify({ ...household, source: visitSource() }),
    }),
  );
}

export async function fetchHouseholdStats(id: string): Promise<HouseholdResult> {
  return json(await fetch(`/api/household?id=${encodeURIComponent(id)}`));
}

export interface Participants {
  households: number;
  people: number;
}

export async function fetchParticipantCount(): Promise<Participants | null> {
  try {
    const res = await fetch("/api/participants");
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<Participants>;
    return typeof body.households === "number" ? { households: body.households, people: body.people ?? body.households } : null;
  } catch {
    return null;
  }
}

export interface CommentItem {
  id: string;
  body: string;
  nickname: string | null;
  authorReply: string | null;
  likes: number;
  liked: boolean;
  createdAt: string;
}

export async function fetchComments(): Promise<CommentItem[]> {
  const body = await json<{ comments: CommentItem[] }>(await fetch("/api/comments", { headers: { "x-device-id": deviceId() } }));
  return body.comments;
}

export async function postComment(text: string, nickname: string): Promise<CommentItem> {
  const body = await json<{ comment: CommentItem }>(
    await fetch("/api/comments", {
      method: "POST",
      headers: { "content-type": "application/json", "x-device-id": deviceId() },
      body: JSON.stringify({ body: text, nickname: nickname || null }),
    }),
  );
  return body.comment;
}

export async function toggleCommentLike(id: string): Promise<{ likes: number; liked: boolean }> {
  return json(
    await fetch("/api/comment-like", {
      method: "POST",
      headers: { "content-type": "application/json", "x-device-id": deviceId() },
      body: JSON.stringify({ id }),
    }),
  );
}
