// Turns a raw CDR pull into the compact benchmark the app compares against.
// Keeps only rates an ordinary new borrower could actually apply for.
import type { RateKind } from "../src/compare.js";
import { BENCHMARK_FORMAT, PRODUCT_FLAGS, type WireBenchmark, type WireRow } from "../src/benchmarkWire.js";
import type { RawRateRow } from "./cdr.js";

// Eligibility-restricted, purpose-restricted, or temporary rates.
const RESTRICTED =
  /staff|employee|veteran|defen[cs]e|military|police|fire ?(fighter|service)|essential worker|nurse|green|\beco\b|sustainab|clean energy|solar|energy efficien|fee assistance|bridging|construction|land loan|reverse|equity release|intro|honeymoon|special offer|guarantor|family pledge/i;

// Alt/low doc loans serve borrowers who can't document income; a different market.
const LOW_DOC = /low ?doc|alt ?doc/i;
const FIRST_HOME = /first home|\bfhb\b/i;
const VISA_OK = /\bvisa\b|temporary resident|overseas|non-?resident(?!s?\.)|expat/i;
const NOT_FOR_NON_RESIDENTS = /not available for non-?residents/i;
const PR_ONLY = /citizen|permanent/i;
const PAYG_ONLY = /payg/i;
const SELF_EMPLOYED_OK = /self.?employ/i;

function productFlags(row: RawRateRow): number {
  let flags = 0;
  const residency = row.residencyText;
  if (VISA_OK.test(residency) && !NOT_FOR_NON_RESIDENTS.test(residency)) flags |= PRODUCT_FLAGS.VISA_OK;
  else if (PR_ONLY.test(residency)) flags |= PRODUCT_FLAGS.PR_ONLY;
  if (PAYG_ONLY.test(row.employmentText) && !SELF_EMPLOYED_OK.test(row.employmentText)) {
    flags |= PRODUCT_FLAGS.PAYG_ONLY;
  }
  if (FIRST_HOME.test(row.productName)) flags |= PRODUCT_FLAGS.FHB_ONLY;
  return flags;
}

// Below this is a data-entry error or a fee-assistance sub-loan, not a market rate.
const MIN_PLAUSIBLE_RATE = 0.04;
const MAX_PLAUSIBLE_RATE = 0.15;

const FIXED_TERM_YEARS: Record<string, number> = {
  P1Y: 1, P12M: 1, P2Y: 2, P24M: 2, P3Y: 3, P36M: 3, P4Y: 4, P48M: 4, P5Y: 5, P60M: 5,
};

// A bad CDR pull (register outage, a big four API down) must not replace good data.
// 2026-10-15 pull: 91 lenders, ~7300 rows, all four majors present.
const MIN_LENDERS = 70;
const MIN_ROWS = 5000;
const REQUIRED_LENDERS = ["CommBank", "Westpac", "ANZ", "NAB"];

// Familiar names, plus Chinese names people search by. Brands not listed keep their CDR name.
const LENDER_NAMES: Record<string, [name: string, zh: string]> = {
  CommBank: ["CommBank", "联邦银行 CBA"],
  Westpac: ["Westpac", "西太平洋银行 西太"],
  ANZ: ["ANZ", "澳新银行"],
  "ANZ Plus": ["ANZ Plus", "澳新银行"],
  "NATIONAL AUSTRALIA BANK": ["NAB", "国民银行 澳大利亚国民银行"],
  "ING BANK (Australia) Ltd": ["ING", "荷兰国际"],
  "Macquarie Bank Limited": ["Macquarie", "麦格理银行"],
  "St.George Bank": ["St.George", "圣乔治银行"],
  "Bank of Melbourne": ["Bank of Melbourne", "墨尔本银行"],
  BankSA: ["BankSA", "南澳银行"],
  Bankwest: ["Bankwest", "西澳银行"],
  "Bendigo Bank": ["Bendigo Bank", "本迪戈银行"],
  "Bank of Queensland Limited": ["BOQ", "昆士兰银行"],
  "Bank of China": ["Bank of China", "中国银行 中行"],
  "Bank of Sydney": ["Bank of Sydney", "悉尼银行"],
  UBank: ["ubank", ""],
  "AMP - My AMP": ["AMP", ""],
  "ME Bank - ME Go": ["ME Bank", ""],
  "Arab Bank Australia Limited": ["Arab Bank", ""],
  "Auswide Bank Ltd": ["Auswide Bank", ""],
  "Maitland Mutual Limited": ["Maitland Mutual", ""],
  "Northern Inland Credit Union Limited": ["Northern Inland CU", ""],
  "ORANGE CREDIT UNION LTD": ["Orange Credit Union", ""],
  "Police Credit Union Ltd": ["Police Credit Union", ""],
  "Australian Mutual Bank LTD": ["Australian Mutual Bank", ""],
  "Qantas Money Basic/Offset Home Loans": ["Qantas Money", ""],
  "BNK Bank (Goldfields Money/BCHL)": ["BNK Bank", ""],
};

export class IncompletePullError extends Error {}

function rateKind(row: RawRateRow): RateKind | null {
  if (row.rateType === "VARIABLE") return "V";
  const years = row.fixedTerm ? FIXED_TERM_YEARS[row.fixedTerm] : undefined;
  return years ? (`F${years}` as RateKind) : null;
}

function keep(row: RawRateRow): boolean {
  if (row.rate < MIN_PLAUSIBLE_RATE || row.rate > MAX_PLAUSIBLE_RATE) return false;
  if (RESTRICTED.test(row.productName) || LOW_DOC.test(row.productName)) return false;
  if (row.purpose === "UNCONSTRAINED" || row.repayment === "UNCONSTRAINED") return false;
  // A fixed product's VARIABLE row is the revert rate after the fixed period ends.
  if (row.rateType === "VARIABLE" && /fixed/i.test(row.productName)) return false;
  return rateKind(row) !== null;
}

export function buildBenchmark(rows: RawRateRow[], fetchedAt: string): WireBenchmark {
  const lenders: [string, string][] = [];
  const lenderIndex = new Map<string, number>();
  const products: [number, string, 0 | 1, number][] = [];
  const productIndex = new Map<string, number>();
  const encoded = new Map<string, WireRow>();

  for (const r of rows.filter(keep)) {
    const [name, zh] = LENDER_NAMES[r.brand] ?? [r.brand, ""];
    if (!lenderIndex.has(name)) {
      lenderIndex.set(name, lenders.length);
      lenders.push([name, zh]);
    }
    const flags = productFlags(r);
    const productKey = `${name}\u0000${r.productName}\u0000${r.hasOffset}\u0000${flags}`;
    if (!productIndex.has(productKey)) {
      productIndex.set(productKey, products.length);
      products.push([lenderIndex.get(name)!, r.productName.trim(), r.hasOffset ? 1 : 0, flags]);
    }
    const row: WireRow = [
      productIndex.get(productKey)!,
      r.purpose === "OWNER_OCCUPIED" ? 0 : 1,
      r.repayment === "PRINCIPAL_AND_INTEREST" ? 0 : 1,
      rateKind(r)!,
      Math.round((r.lvrMin ?? 0) * 1e4),
      Math.round((r.lvrMax ?? 1) * 1e4),
      r.amountMin ?? 0,
      r.amountMax ?? -1,
      Math.round(r.rate * 1e5),
    ];
    // The same product often repeats identical rows across tiers we don't model.
    encoded.set(row.join(","), row);
  }

  const missingMajors = REQUIRED_LENDERS.filter((name) => !lenderIndex.has(name));
  if (lenders.length < MIN_LENDERS || encoded.size < MIN_ROWS || missingMajors.length) {
    throw new IncompletePullError(
      `${lenders.length} lenders, ${encoded.size} rows, missing majors: ${missingMajors.join(", ") || "none"}`,
    );
  }

  return { v: BENCHMARK_FORMAT, fetchedAt, lenders, products, rows: [...encoded.values()] };
}
