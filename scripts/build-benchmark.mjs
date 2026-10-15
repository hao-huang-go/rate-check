// Turns data/rates.json into the compact public/benchmark.json the app compares against.
// Keeps only rates an ordinary new borrower could actually apply for.
import { mkdir, readFile, writeFile } from "node:fs/promises";

// Eligibility-restricted, purpose-restricted, or temporary rates.
const RESTRICTED =
  /staff|employee|veteran|defen[cs]e|military|police|fire ?(fighter|service)|essential worker|nurse|green|\beco\b|sustainab|clean energy|solar|energy efficien|fee assistance|bridging|construction|land loan|reverse|equity release|intro|honeymoon|first home|\bfhb\b|special offer|guarantor|family pledge/i;

// Below this is a data-entry error or a fee-assistance sub-loan, not a market rate.
const MIN_PLAUSIBLE_RATE = 0.04;
const MAX_PLAUSIBLE_RATE = 0.15;

const FIXED_TERM_YEARS = { P1Y: 1, P12M: 1, P2Y: 2, P24M: 2, P3Y: 3, P36M: 3, P4Y: 4, P48M: 4, P5Y: 5, P60M: 5 };

function rateKind(row) {
  if (row.rateType === "VARIABLE") return "V";
  const years = FIXED_TERM_YEARS[row.fixedTerm];
  return years ? `F${years}` : null;
}

function keep(row) {
  if (row.rate < MIN_PLAUSIBLE_RATE || row.rate > MAX_PLAUSIBLE_RATE) return false;
  if (RESTRICTED.test(row.productName)) return false;
  if (row.purpose === "UNCONSTRAINED" || row.repayment === "UNCONSTRAINED") return false;
  // A fixed product's VARIABLE row is the revert rate after the fixed period ends.
  if (row.rateType === "VARIABLE" && /fixed/i.test(row.productName)) return false;
  return rateKind(row) !== null;
}

const { fetchedAt, rows } = JSON.parse(await readFile("data/rates.json", "utf8"));

const kept = rows.filter(keep).map((r) => ({
  l: r.brand,
  p: r.productName,
  u: r.purpose === "OWNER_OCCUPIED" ? "OO" : "INV",
  r: r.repayment === "PRINCIPAL_AND_INTEREST" ? "PI" : "IO",
  k: rateKind(r),
  lv: [r.lvrMin ?? 0, r.lvrMax ?? 1],
  a: [r.amountMin ?? 0, r.amountMax ?? null],
  rate: r.rate,
  o: r.hasOffset,
}));

// The same product often repeats identical rows across tiers we don't model.
const unique = [...new Map(kept.map((r) => [JSON.stringify(r), r])).values()];

await mkdir("public", { recursive: true });
await writeFile("public/benchmark.json", JSON.stringify({ fetchedAt, rows: unique }));
console.log(
  `${rows.length} raw rows -> ${unique.length} benchmark rows from ${new Set(unique.map((r) => r.l)).size} lenders`,
);
