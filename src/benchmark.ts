import type { Benchmark, BenchmarkRow, Purpose, RateKind, Repayment } from "./compare";

// Mirrors the compact format written by scripts/build-benchmark.mjs.
interface WireBenchmark {
  v: 2;
  fetchedAt: string;
  lenders: [name: string, zh: string][];
  products: [lender: number, name: string, offset: 0 | 1][];
  rows: [
    product: number,
    purpose: 0 | 1,
    repayment: 0 | 1,
    kind: RateKind,
    lvrMin: number,
    lvrMax: number,
    amountMin: number,
    amountMax: number,
    rate: number,
  ][];
}

export interface Lender {
  name: string;
  zh: string;
}

export interface LoadedBenchmark extends Benchmark {
  lenders: Lender[];
}

const PURPOSES: Purpose[] = ["OO", "INV"];
const REPAYMENTS: Repayment[] = ["PI", "IO"];

export function decodeBenchmark(wire: WireBenchmark): LoadedBenchmark {
  const lenders = wire.lenders.map(([name, zh]) => ({ name, zh }));
  const rows: BenchmarkRow[] = wire.rows.map(
    ([product, purpose, repayment, kind, lvrMin, lvrMax, amountMin, amountMax, rate]) => {
      const [lender, name, offset] = wire.products[product];
      return {
        l: lenders[lender].name,
        p: name,
        u: PURPOSES[purpose],
        r: REPAYMENTS[repayment],
        k: kind,
        lv: [lvrMin / 1e4, lvrMax / 1e4],
        a: [amountMin, amountMax < 0 ? null : amountMax],
        rate: rate / 1e5,
        o: offset === 1,
      };
    },
  );
  lenders.sort((a, b) => a.name.localeCompare(b.name));
  return { fetchedAt: wire.fetchedAt, rows, lenders };
}

export async function loadBenchmark(): Promise<LoadedBenchmark> {
  const res = await fetch("/benchmark.json");
  return decodeBenchmark(await res.json());
}
