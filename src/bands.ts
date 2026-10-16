// Banding shared by the browser and the API. Exact amounts never leave the browser's form state;
// the server re-derives bands from what it receives and stores only the bands.

export const LVR_BANDS = ["0-60", "60-70", "70-80", "80-90", "90-95"] as const;
export type LvrBand = (typeof LVR_BANDS)[number];

export const BALANCE_BANDS = ["0-300k", "300k-500k", "500k-750k", "750k-1m", "1m-1.5m", "1.5m+"] as const;
export type BalanceBand = (typeof BALANCE_BANDS)[number];

// Money sitting in offset accounts against the loan; "none" when there isn't any.
export const OFFSET_BANDS = ["none", "0-50k", "50k-100k", "100k-200k", "200k-500k", "500k+"] as const;
export type OffsetBand = (typeof OFFSET_BANDS)[number];

export const LOAN_AGES = ["<1y", "1-3y", "3-5y", "5y+"] as const;
export type LoanAge = (typeof LOAN_AGES)[number];

export const MAX_LVR = 0.95;

const LVR_UPPER: [number, LvrBand][] = [
  [0.6, "0-60"],
  [0.7, "60-70"],
  [0.8, "70-80"],
  [0.9, "80-90"],
  [MAX_LVR, "90-95"],
];

const BALANCE_UPPER: [number, BalanceBand][] = [
  [300_000, "0-300k"],
  [500_000, "300k-500k"],
  [750_000, "500k-750k"],
  [1_000_000, "750k-1m"],
  [1_500_000, "1m-1.5m"],
];

export function lvrBand(lvr: number): LvrBand | null {
  return LVR_UPPER.find(([upper]) => lvr <= upper + 1e-9)?.[1] ?? null;
}

export function balanceBand(balance: number): BalanceBand {
  return BALANCE_UPPER.find(([upper]) => balance <= upper)?.[1] ?? "1.5m+";
}
