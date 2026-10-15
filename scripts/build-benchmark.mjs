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

// Familiar names, plus Chinese names people search by. Brands not listed keep their CDR name.
const LENDER_NAMES = {
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
  "Great Southern Bank": ["Great Southern Bank", ""],
  "Newcastle Permanent": ["Newcastle Permanent", ""],
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

// Compact wire format: lender and product tables, then one positional array per rate.
// Decoded back into rows by src/benchmark.ts.
const lenders = [];
const lenderIndex = new Map();
const products = [];
const productIndex = new Map();
const encoded = new Map();

for (const r of rows.filter(keep)) {
  const [name, zh] = LENDER_NAMES[r.brand] ?? [r.brand, ""];
  if (!lenderIndex.has(name)) {
    lenderIndex.set(name, lenders.length);
    lenders.push([name, zh]);
  }
  const productKey = `${name}\u0000${r.productName}\u0000${r.hasOffset}`;
  if (!productIndex.has(productKey)) {
    productIndex.set(productKey, products.length);
    products.push([lenderIndex.get(name), r.productName.trim(), r.hasOffset ? 1 : 0]);
  }
  const row = [
    productIndex.get(productKey),
    r.purpose === "OWNER_OCCUPIED" ? 0 : 1,
    r.repayment === "PRINCIPAL_AND_INTEREST" ? 0 : 1,
    rateKind(r),
    Math.round((r.lvrMin ?? 0) * 1e4),
    Math.round((r.lvrMax ?? 1) * 1e4),
    r.amountMin ?? 0,
    r.amountMax ?? -1,
    Math.round(r.rate * 1e5),
  ];
  // The same product often repeats identical rows across tiers we don't model.
  encoded.set(row.join(","), row);
}

await mkdir("public", { recursive: true });
await writeFile(
  "public/benchmark.json",
  JSON.stringify({ v: 2, fetchedAt, lenders, products, rows: [...encoded.values()] }),
);
console.log(`${rows.length} raw rows -> ${encoded.size} benchmark rows from ${lenders.length} lenders`);
