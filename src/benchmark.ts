import type { WireBenchmark } from "./benchmarkWire";
import type { Benchmark, BenchmarkRow, Purpose, Repayment } from "./compare";

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

// Today's rates come from the daily cron via /api/benchmark; the bundled static copy keeps
// the page working if that's unavailable (local dev without Supabase, a storage outage).
export async function loadBenchmark(): Promise<LoadedBenchmark> {
  try {
    const res = await fetch("/api/benchmark");
    if (res.ok) return decodeBenchmark(await res.json());
  } catch {
    // fall through to the static copy
  }
  const res = await fetch("/benchmark.json");
  return decodeBenchmark(await res.json());
}
