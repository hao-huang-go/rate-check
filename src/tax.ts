// Australian resident income tax, 2026-27: legislated rates (the 16% bracket falls to 15% from
// 1 July 2026), the 2% Medicare levy and the low income tax offset. It ignores the Medicare levy
// low-income reduction and other offsets, so it's an estimate for comparison, not a tax return.

const BRACKETS: [from: number, rate: number][] = [
  [0, 0],
  [18_200, 0.15],
  [45_000, 0.3],
  [135_000, 0.37],
  [190_000, 0.45],
];
const MEDICARE_LEVY = 0.02;

function incomeTax(gross: number): number {
  let tax = 0;
  for (let i = 0; i < BRACKETS.length; i++) {
    const [from, rate] = BRACKETS[i];
    const to = BRACKETS[i + 1]?.[0] ?? Infinity;
    if (gross > from) tax += (Math.min(gross, to) - from) * rate;
  }
  return tax;
}

// Up to $700, tapering to $325 at $45,000 and to nothing at $66,667.
function lowIncomeTaxOffset(gross: number): number {
  if (gross <= 37_500) return 700;
  if (gross <= 45_000) return 700 - (gross - 37_500) * 0.05;
  if (gross <= 66_667) return 325 - (gross - 45_000) * 0.015;
  return 0;
}

export function afterTax(gross: number): number {
  const tax = Math.max(0, incomeTax(gross) - lowIncomeTaxOffset(gross)) + gross * MEDICARE_LEVY;
  return gross - tax;
}

// Inverse of afterTax by bisection; after-tax income rises monotonically with gross.
export function grossFromAfterTax(net: number): number {
  if (net <= 0) return 0;
  let lo = net;
  let hi = net * 2.5;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (afterTax(mid) < net) lo = mid;
    else hi = mid;
  }
  return Math.round(hi);
}
