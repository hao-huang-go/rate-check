import type { RateKind } from "./compare";

// Compact benchmark format: lender and product tables, then one positional array per rate.
// Written by server/benchmark.ts, decoded by src/benchmark.ts.
export const BENCHMARK_FORMAT = 3;

export interface WireBenchmark {
  v: typeof BENCHMARK_FORMAT;
  fetchedAt: string;
  lenders: [name: string, zh: string][];
  products: [lender: number, name: string, offset: 0 | 1, flags: number][];
  rows: WireRow[];
}

// Product eligibility, classified from CDR eligibility text and product names.
export const PRODUCT_FLAGS = {
  PR_ONLY: 1, // explicitly Australian/NZ citizens or permanent residents only
  VISA_OK: 2, // explicitly open to visa holders or borrowers overseas
  PAYG_ONLY: 4, // explicitly PAYG employees only
  FHB_ONLY: 8, // first home buyers only
} as const;

export type WireRow = [
  product: number,
  purpose: 0 | 1, // 0 owner-occupied, 1 investment
  repayment: 0 | 1, // 0 principal & interest, 1 interest only
  kind: RateKind,
  lvrMin: number, // basis points of LVR, 8000 = 80%
  lvrMax: number,
  amountMin: number, // AUD
  amountMax: number, // AUD, -1 = no upper bound
  rate: number, // 1e-5 units, 6240 = 6.24%
];
