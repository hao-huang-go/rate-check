import type { Repayment } from "./compare.js";

// Monthly repayment on a standard amortising loan, or interest only.
export function monthlyRepayment(balance: number, annualRate: number, years: number, repayment: Repayment): number {
  const r = annualRate / 12;
  if (repayment === "IO") return balance * r;
  const n = years * 12;
  if (r === 0) return balance / n;
  return (balance * r) / (1 - (1 + r) ** -n);
}

export interface Simulation {
  monthlyNow: number;
  monthlyTarget: number;
  monthlySaving: number;
  // Interest saved in the first year; the figure the rest of the page uses (rate gap x balance).
  yearlyInterestSaving: number;
  termSaving: number; // over the remaining term, at today's rates
  breakEvenMonths: number | null; // null when there's nothing to recover, Infinity when it never pays back
}

export function simulate(args: {
  balance: number;
  currentRate: number;
  targetRate: number;
  years: number;
  repayment: Repayment;
  switchCost: number; // 0 when staying with the same lender
  cashback: number;
}): Simulation {
  const monthlyNow = monthlyRepayment(args.balance, args.currentRate, args.years, args.repayment);
  const monthlyTarget = monthlyRepayment(args.balance, args.targetRate, args.years, args.repayment);
  const monthlySaving = monthlyNow - monthlyTarget;
  const netCost = args.switchCost - args.cashback;
  return {
    monthlyNow,
    monthlyTarget,
    monthlySaving,
    yearlyInterestSaving: (args.currentRate - args.targetRate) * args.balance,
    termSaving: monthlySaving * args.years * 12 - netCost,
    breakEvenMonths: netCost <= 0 ? null : monthlySaving <= 0 ? Infinity : Math.ceil(netCost / monthlySaving),
  };
}
