// Pulls advertised residential mortgage rates from every bank in the CDR register,
// one normalised row per (product, rate, tier).

const REGISTER = "https://api.cdr.gov.au/cdr-register/v1/banking/data-holders/brands/summary";
const CONCURRENCY = 8;
const TIMEOUT_MS = 20_000;

// Holders support different version ranges per endpoint (Westpac lists only at v5
// but serves product detail only at v7), so negotiate per (holder, endpoint).
const VERSIONS = ["7", "6", "5", "4", "3"];

export interface RawRateRow {
  brand: string;
  productId: string;
  productName: string;
  purpose: string | null;
  repayment: string | null;
  rateType: "VARIABLE" | "FIXED";
  fixedTerm: string | null;
  lvrMin: number | null;
  lvrMax: number | null;
  amountMin: number | null;
  amountMax: number | null;
  rate: number;
  comparisonRate: number | null;
  hasOffset: boolean;
  annualFee: number;
  // Free text from the product's CDR eligibility list, classified in server/benchmark.ts.
  residencyText: string;
  employmentText: string;
}

export interface BrandResult {
  brand: string;
  products: number;
  detailFailures: number;
  error: string | null;
}

export interface CdrPull {
  fetchedAt: string;
  rows: RawRateRow[];
  brands: BrandResult[];
}

class HttpError extends Error {
  readonly status: number;

  constructor(status: number, url: string) {
    super(`${status} ${url}`);
    this.status = status;
  }
}

// CDR payloads are large and loosely shaped; we read only the fields we need.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

async function getJsonOnce(url: string, headers: Record<string, string>): Promise<Json> {
  const res = await fetch(url, {
    // No explicit `accept: application/json`: Westpac answers that (from Node) with
    // 200 and an empty product list. The default `*/*` gets JSON from every holder.
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new HttpError(res.status, url);
  return res.json();
}

const RETRY_DELAYS_MS = [1_000, 4_000];

// Timeouts, network errors, 429 and 5xx are worth retrying; anything else is a real answer.
function isTransient(e: unknown): boolean {
  return !(e instanceof HttpError) || e.status === 429 || e.status >= 500;
}

async function getJson(url: string, headers: Record<string, string>): Promise<Json> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await getJsonOnce(url, headers);
    } catch (e) {
      if (attempt >= RETRY_DELAYS_MS.length || !isTransient(e)) throw e;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }
}

class CdrClient {
  private readonly versions = new Map<string, string>();

  async get(url: string, cacheKey: string): Promise<Json> {
    const cached = this.versions.get(cacheKey);
    const order = cached ? [cached, ...VERSIONS.filter((v) => v !== cached)] : VERSIONS;
    let lastError: unknown;
    for (const v of order) {
      try {
        const body = await getJson(url, { "x-v": v, "x-min-v": "1" });
        this.versions.set(cacheKey, v);
        return body;
      } catch (e) {
        lastError = e;
        if (!(e instanceof HttpError) || (e.status !== 406 && e.status !== 400)) throw e;
      }
    }
    throw lastError;
  }
}

async function listBrands(): Promise<{ name: string; base: string }[]> {
  const body = await getJson(REGISTER, { "x-v": "1" });
  return body.data
    .filter((b: Json) => b.publicBaseUri)
    .map((b: Json) => ({ name: b.brandName, base: b.publicBaseUri.replace(/\/$/, "") }));
}

async function listMortgageProducts(client: CdrClient, base: string): Promise<Json[]> {
  const products: Json[] = [];
  let url: string | null =
    `${base}/cds-au/v1/banking/products?product-category=RESIDENTIAL_MORTGAGES&page-size=100`;
  while (url) {
    const body = await client.get(url, `${base}:list`);
    products.push(...body.data.products);
    const next: string | undefined = body.links?.next;
    url = next && next !== url ? next : null;
  }
  return products.filter((p) => p.productCategory === "RESIDENTIAL_MORTGAGES");
}

function tierBounds(tiers: Json[] | undefined, predicate: (t: Json) => boolean): [number | null, number | null] {
  const t = (tiers ?? []).find(predicate);
  if (!t) return [null, null];
  const num = (v: unknown) => (v === undefined || v === null ? null : Number(v));
  return [num(t.minimumValue), num(t.maximumValue)];
}

const isLvrTier = (t: Json) => /lvr|loan to value/i.test(t.name ?? "") && t.unitOfMeasure === "PERCENT";
const isAmountTier = (t: Json) => t.unitOfMeasure === "DOLLAR";

// Some lenders publish LVR as 80 rather than 0.80.
const asFraction = (v: number | null) => (v !== null && v > 1 ? v / 100 : v);

function eligibilityText(detail: Json, type: string): string {
  return (detail.eligibility ?? [])
    .filter((e: Json) => e.eligibilityType === type)
    .map((e: Json) => [e.additionalValue, e.additionalInfo].filter(Boolean).join(" "))
    .join(" | ");
}

function normalise(brand: string, detail: Json): RawRateRow[] {
  const residencyText = eligibilityText(detail, "RESIDENCY_STATUS");
  const employmentText = eligibilityText(detail, "EMPLOYMENT_STATUS");
  const hasOffset = (detail.features ?? []).some((f: Json) => f.featureType === "OFFSET");
  const annualFee = (detail.fees ?? [])
    .filter((f: Json) => f.feeType === "PERIODIC" && /P1Y|P12M/.test(f.additionalValue ?? ""))
    .reduce((sum: number, f: Json) => sum + Number(f.amount ?? 0), 0);

  return (detail.lendingRates ?? [])
    .filter((r: Json) => r.lendingRateType === "VARIABLE" || r.lendingRateType === "FIXED")
    .map((r: Json): RawRateRow => {
      const [lvrMin, lvrMax] = tierBounds(r.tiers, isLvrTier);
      const [amountMin, amountMax] = tierBounds(r.tiers, isAmountTier);
      return {
        brand,
        productId: detail.productId,
        productName: detail.name,
        purpose: r.loanPurpose ?? null,
        repayment: r.repaymentType ?? null,
        rateType: r.lendingRateType,
        fixedTerm: r.lendingRateType === "FIXED" ? (r.additionalValue ?? null) : null,
        lvrMin: asFraction(lvrMin),
        lvrMax: asFraction(lvrMax),
        amountMin,
        amountMax,
        rate: Number(r.rate),
        comparisonRate: r.comparisonRate ? Number(r.comparisonRate) : null,
        hasOffset,
        annualFee,
        residencyText,
        employmentText,
      };
    });
}

async function fetchBrand(
  client: CdrClient,
  brand: { name: string; base: string },
): Promise<{ result: BrandResult; rows: RawRateRow[] }> {
  try {
    const products = await listMortgageProducts(client, brand.base);
    const rows: RawRateRow[] = [];
    let detailFailures = 0;
    for (const p of products) {
      try {
        const body = await client.get(
          `${brand.base}/cds-au/v1/banking/products/${encodeURIComponent(p.productId)}`,
          `${brand.base}:detail`,
        );
        rows.push(...normalise(brand.name, body.data));
      } catch {
        // one broken product shouldn't drop the whole brand
        detailFailures++;
      }
    }
    return { result: { brand: brand.name, products: products.length, detailFailures, error: null }, rows };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { result: { brand: brand.name, products: 0, detailFailures: 0, error }, rows: [] };
  }
}

async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
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

export async function pullMortgageRates(): Promise<CdrPull> {
  const client = new CdrClient();
  const brands = await listBrands();
  const results = await mapLimited(brands, CONCURRENCY, (b) => fetchBrand(client, b));
  return {
    fetchedAt: new Date().toISOString(),
    rows: results.flatMap((r) => r.rows),
    brands: results.map((r) => r.result),
  };
}
