import { PRODUCT_FLAGS } from "./benchmarkWire";

export type Purpose = "OO" | "INV";
export type Repayment = "PI" | "IO";
export type RateKind = "V" | "F1" | "F2" | "F3" | "F4" | "F5";
export type Residency = "pr" | "visa" | "overseas"; // citizen/PR, temporary visa, overseas income or non-resident
export type Income = "payg" | "self";

export interface BenchmarkRow {
  l: string; // lender
  p: string; // product
  u: Purpose;
  r: Repayment;
  k: RateKind;
  lv: [number, number]; // LVR bounds as fractions
  a: [number, number | null]; // loan amount bounds in AUD
  rate: number; // fraction, 0.0624 = 6.24%
  o: boolean; // has offset account
  f: number; // PRODUCT_FLAGS
}

export interface Benchmark {
  fetchedAt: string;
  rows: BenchmarkRow[];
}

export interface LoanProfile {
  purpose: Purpose;
  repayment: Repayment;
  rateKind: RateKind;
  balance: number;
  propertyValue: number;
  lender: string | null;
  rate: number; // fraction
  residency: Residency;
  income: Income;
  firstHome: boolean;
  needOffset: boolean;
}

export interface LenderBest {
  lender: string;
  product: string;
  rate: number;
  hasOffset: boolean;
}

export interface Comparison {
  lvr: number;
  lenders: LenderBest[]; // one row per lender, cheapest first
  cheaperCount: number;
  median: number;
  p10: number;
  overpayVsMedian: number; // AUD per year, 0 when already at or below
  overpayVsP10: number;
  ownLender: LenderBest | null;
  overpayVsOwnLender: number;
}

export function lvrOf(profile: Pick<LoanProfile, "balance" | "propertyValue">): number {
  return profile.balance / profile.propertyValue;
}

// Whether this borrower is eligible for the product at all, as far as public data says.
function eligible(row: BenchmarkRow, profile: LoanProfile): boolean {
  if (profile.residency !== "pr" && row.f & PRODUCT_FLAGS.PR_ONLY) return false;
  if (profile.income === "self" && row.f & PRODUCT_FLAGS.PAYG_ONLY) return false;
  if (!profile.firstHome && row.f & PRODUCT_FLAGS.FHB_ONLY) return false;
  if (profile.needOffset && !row.o) return false;
  return true;
}

function matches(row: BenchmarkRow, profile: LoanProfile, lvr: number): boolean {
  const [minAmount, maxAmount] = row.a;
  return (
    eligible(row, profile) &&
    row.u === profile.purpose &&
    row.r === profile.repayment &&
    row.k === profile.rateKind &&
    lvr >= row.lv[0] &&
    lvr <= row.lv[1] &&
    profile.balance >= minAmount &&
    (maxAmount === null || profile.balance <= maxAmount)
  );
}

// One price per lender, so a lender with twenty products doesn't outweigh one with two.
function cheapestPerLender(rows: BenchmarkRow[]): LenderBest[] {
  const best = new Map<string, LenderBest>();
  for (const row of rows) {
    const current = best.get(row.l);
    if (!current || row.rate < current.rate) {
      best.set(row.l, { lender: row.l, product: row.p, rate: row.rate, hasOffset: row.o });
    }
  }
  return [...best.values()].sort((a, b) => a.rate - b.rate);
}

function quantile(sorted: number[], q: number): number {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

export function annualOverpay(yourRate: number, targetRate: number, balance: number): number {
  return Math.max(0, (yourRate - targetRate) * balance);
}

export function compare(benchmark: Benchmark, profile: LoanProfile): Comparison | null {
  const lvr = lvrOf(profile);
  const lenders = cheapestPerLender(benchmark.rows.filter((row) => matches(row, profile, lvr)));
  if (lenders.length === 0) return null;

  const rates = lenders.map((l) => l.rate);
  const median = quantile(rates, 0.5);
  const p10 = quantile(rates, 0.1);
  const ownLender = lenders.find((l) => l.lender === profile.lender) ?? null;

  return {
    lvr,
    lenders,
    cheaperCount: rates.filter((r) => r < profile.rate - 1e-9).length,
    median,
    p10,
    overpayVsMedian: annualOverpay(profile.rate, median, profile.balance),
    overpayVsP10: annualOverpay(profile.rate, p10, profile.balance),
    ownLender,
    overpayVsOwnLender: ownLender ? annualOverpay(profile.rate, ownLender.rate, profile.balance) : 0,
  };
}
