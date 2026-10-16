// Household questionnaire: answer options and their bands, shared by the wizard and the API.
import { lvrBand, type BalanceBand, type LvrBand, type OffsetBand } from "./bands.js";
import { monthlyRepayment } from "./simulate.js";
import { afterTax } from "./tax.js";
import type { Purpose, RateKind, Repayment, Residency } from "./compare.js";

export const STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"] as const;
export type AuState = (typeof STATES)[number];

export const AGE_BANDS = ["18-24", "25-29", "30-34", "35-39", "40-44", "45-54", "55-64", "65+"] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

export const ROLES = ["self", "partner", "other"] as const;
export type Role = (typeof ROLES)[number];

export const EXPERIENCE = ["0-1", "1-3", "3-5", "5-10", "10-15", "15-20", "20+"] as const;
export type Experience = (typeof EXPERIENCE)[number];

export const MONTHLY_BANDS = ["0-1k", "1k-2k", "2k-3k", "3k-4k", "4k-5k", "5k-6k", "6k-8k", "8k+"] as const;
export type MonthlyBand = (typeof MONTHLY_BANDS)[number];
export const MONTHLY_MIDPOINT: Record<MonthlyBand, number> = {
  "0-1k": 500, "1k-2k": 1500, "2k-3k": 2500, "3k-4k": 3500, "4k-5k": 4500, "5k-6k": 5500, "6k-8k": 7000, "8k+": 9000,
};

// Loan balance and property value are asked as ranges; the midpoints feed the rate comparison.
export const BALANCE_MIDPOINT: Record<BalanceBand, number> = {
  "0-300k": 200_000, "300k-500k": 400_000, "500k-750k": 625_000, "750k-1m": 875_000, "1m-1.5m": 1_250_000, "1.5m+": 1_800_000,
};

export const OFFSET_MIDPOINT: Record<OffsetBand, number> = {
  none: 0, "0-50k": 25_000, "50k-100k": 75_000, "100k-200k": 150_000, "200k-500k": 350_000, "500k+": 600_000,
};

export const VALUE_BANDS = ["0-500k", "500k-750k", "750k-1m", "1m-1.5m", "1.5m-2m", "2m-3m", "3m+"] as const;
export type ValueBand = (typeof VALUE_BANDS)[number];
export const VALUE_MIDPOINT: Record<ValueBand, number> = {
  "0-500k": 400_000, "500k-750k": 625_000, "750k-1m": 875_000, "1m-1.5m": 1_250_000, "1.5m-2m": 1_750_000, "2m-3m": 2_500_000, "3m+": 3_500_000,
};

export const SAVINGS_BANDS = ["0-10k", "10k-50k", "50k-100k", "100k-200k", "200k-500k", "500k-1m", "1m+"] as const;
export type SavingsBand = (typeof SAVINGS_BANDS)[number];

export const INCOME_ROUNDING = 5_000;
export const MAX_MEMBERS = 6;
export const MAX_PROPERTIES = 10;

export interface Member {
  role: Role;
  occupation: string; // 6-digit ANZSCO code as picked; only the 4-digit unit group is stored
  experience: Experience;
  income: number; // AUD/yr base before tax, excluding super (after-tax entries are converted first)
}

export interface Property {
  purpose: Purpose;
  lender: string | null;
  rate: number; // fraction
  rateKind: RateKind;
  repayment: Repayment;
  monthly: MonthlyBand;
  balance: BalanceBand | null; // null when the borrower doesn't know it
  offset?: OffsetBand | null; // null or missing when not answered, counted as no offset
  value: ValueBand;
}

export interface Household {
  residency: Residency;
  state: AuState;
  age: AgeBand; // of the person filling it in
  members: Member[];
  properties: Property[];
  savings: SavingsBand | null;
}

export const roundIncome = (income: number) => Math.round(income / INCOME_ROUNDING) * INCOME_ROUNDING;

// Assumed when estimating a balance from the repayment: a typical remaining term.
const ASSUMED_YEARS_LEFT = 25;

// The range midpoint when the borrower picked one, otherwise backed out of the monthly repayment:
// the loan that repayment would service at their rate.
export function propertyBalance(p: Pick<Property, "balance" | "monthly" | "rate" | "repayment">): number {
  if (p.balance) return BALANCE_MIDPOINT[p.balance];
  const perDollar = monthlyRepayment(1, p.rate, ASSUMED_YEARS_LEFT, p.repayment);
  return Math.round(MONTHLY_MIDPOINT[p.monthly] / perDollar / 10_000) * 10_000;
}

// Interest charged this month: the rate on what's owed after the offset, which is what the
// repayment doesn't say when a large offset is paying the loan down fast.
export function propertyMonthlyInterest(p: Pick<Property, "balance" | "monthly" | "rate" | "repayment" | "offset">): number {
  const owed = Math.max(0, propertyBalance(p) - OFFSET_MIDPOINT[p.offset ?? "none"]);
  return (owed * p.rate) / 12;
}

type LvrInput = Pick<Property, "balance" | "monthly" | "rate" | "repayment" | "value">;

export function propertyLvr(p: LvrInput): number {
  return propertyBalance(p) / VALUE_MIDPOINT[p.value];
}

// LVR from range midpoints can exceed what lenders publish; clamp into the top band.
export function propertyLvrBand(p: LvrInput): LvrBand {
  return lvrBand(Math.min(propertyLvr(p), 0.95)) ?? "90-95";
}

export function householdTotals(h: Pick<Household, "members" | "properties">) {
  return {
    income: h.members.reduce((sum, m) => sum + roundIncome(m.income), 0),
    incomeAfterTax: Math.round(h.members.reduce((sum, m) => sum + afterTax(roundIncome(m.income)), 0)),
    repayment: h.properties.reduce((sum, p) => sum + MONTHLY_MIDPOINT[p.monthly], 0),
    interest: Math.round(h.properties.reduce((sum, p) => sum + propertyMonthlyInterest(p), 0) / 10) * 10,
  };
}
