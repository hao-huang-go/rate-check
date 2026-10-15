// Pulls advertised residential mortgage rates from every bank in the CDR register
// and writes one normalised row per (product, rate, tier) to data/rates.json.
import { mkdir, writeFile } from "node:fs/promises";

const REGISTER =
  "https://api.cdr.gov.au/cdr-register/v1/banking/data-holders/brands/summary";
const CONCURRENCY = 8;
const TIMEOUT_MS = 20_000;

class HttpError extends Error {
  constructor(status, url) {
    super(`${status} ${url}`);
    this.status = status;
  }
}

async function getJson(url, headers) {
  const res = await fetch(url, {
    headers: { accept: "application/json", ...headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new HttpError(res.status, url);
  return res.json();
}

// Holders support different version ranges per endpoint (Westpac lists only at v5
// but serves product detail only at v7), so negotiate per (holder, endpoint).
const VERSIONS = ["7", "6", "5", "4", "3"];
const versionCache = new Map();

async function getCds(url, cacheKey) {
  const cached = versionCache.get(cacheKey);
  const order = cached ? [cached, ...VERSIONS.filter((v) => v !== cached)] : VERSIONS;
  let lastError;
  for (const v of order) {
    try {
      const body = await getJson(url, { "x-v": v, "x-min-v": "1" });
      versionCache.set(cacheKey, v);
      return body;
    } catch (e) {
      lastError = e;
      if (e.status !== 406 && e.status !== 400) throw e;
    }
  }
  throw lastError;
}

async function listBrands() {
  const body = await getJson(REGISTER, { "x-v": "1" });
  return body.data
    .filter((b) => b.publicBaseUri)
    .map((b) => ({ name: b.brandName, base: b.publicBaseUri.replace(/\/$/, "") }));
}

async function listMortgageProducts(base) {
  const products = [];
  let url = `${base}/cds-au/v1/banking/products?product-category=RESIDENTIAL_MORTGAGES&page-size=100`;
  while (url) {
    const body = await getCds(url, `${base}:list`);
    products.push(...body.data.products);
    const next = body.links?.next;
    url = next && next !== url ? next : null;
  }
  return products.filter((p) => p.productCategory === "RESIDENTIAL_MORTGAGES");
}

function tierBounds(tiers, predicate) {
  const t = (tiers ?? []).find(predicate);
  if (!t) return [null, null];
  const num = (v) => (v === undefined || v === null ? null : Number(v));
  return [num(t.minimumValue), num(t.maximumValue)];
}

const isLvrTier = (t) => /lvr|loan to value/i.test(t.name ?? "") && t.unitOfMeasure === "PERCENT";
const isAmountTier = (t) => t.unitOfMeasure === "DOLLAR";

// Some lenders publish LVR as 80 rather than 0.80.
const asFraction = (v) => (v !== null && v > 1 ? v / 100 : v);

function normalise(brand, detail) {
  const hasOffset = (detail.features ?? []).some((f) => f.featureType === "OFFSET");
  const annualFee = (detail.fees ?? [])
    .filter((f) => f.feeType === "PERIODIC" && /P1Y|P12M/.test(f.additionalValue ?? ""))
    .reduce((sum, f) => sum + Number(f.amount ?? 0), 0);

  return (detail.lendingRates ?? [])
    .filter((r) => r.lendingRateType === "VARIABLE" || r.lendingRateType === "FIXED")
    .map((r) => {
      const [lvrMin, lvrMax] = tierBounds(r.tiers, isLvrTier);
      const [amountMin, amountMax] = tierBounds(r.tiers, isAmountTier);
      return {
        brand: brand.name,
        productId: detail.productId,
        productName: detail.name,
        purpose: r.loanPurpose ?? null,
        repayment: r.repaymentType ?? null,
        rateType: r.lendingRateType,
        fixedTerm: r.lendingRateType === "FIXED" ? r.additionalValue ?? null : null,
        lvrMin: asFraction(lvrMin),
        lvrMax: asFraction(lvrMax),
        amountMin,
        amountMax,
        rate: Number(r.rate),
        comparisonRate: r.comparisonRate ? Number(r.comparisonRate) : null,
        hasOffset,
        annualFee,
      };
    });
}

async function mapLimited(items, limit, fn) {
  const results = [];
  let next = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function fetchBrand(brand) {
  try {
    const products = await listMortgageProducts(brand.base);
    const rows = [];
    let detailFailures = 0;
    for (const p of products) {
      try {
        const body = await getCds(
          `${brand.base}/cds-au/v1/banking/products/${encodeURIComponent(p.productId)}`,
          `${brand.base}:detail`,
        );
        rows.push(...normalise(brand, body.data));
      } catch {
        // one broken product shouldn't drop the whole brand
        detailFailures++;
      }
    }
    return { brand: brand.name, products: products.length, rows, detailFailures, error: null };
  } catch (e) {
    return { brand: brand.name, products: 0, rows: [], detailFailures: 0, error: e.message };
  }
}

const brands = await listBrands();
console.log(`${brands.length} brands in register`);
const results = await mapLimited(brands, CONCURRENCY, fetchBrand);

const rows = results.flatMap((r) => r.rows);
const failed = results.filter((r) => r.error);
await mkdir("data", { recursive: true });
await writeFile(
  "data/rates.json",
  JSON.stringify({ fetchedAt: new Date().toISOString(), rows }, null, 1),
);
console.log(
  `${results.filter((r) => r.rows.length).length} brands with mortgage rates, ${rows.length} rate rows`,
);
console.log(`${failed.length} brands failed:`, failed.map((f) => `${f.brand} (${f.error})`).join("; "));
const partial = results.filter((r) => r.detailFailures);
console.log(
  `${partial.length} brands with failed product details:`,
  partial.map((r) => `${r.brand} (${r.detailFailures}/${r.products})`).join("; "),
);
