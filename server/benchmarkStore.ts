import type { SupabaseClient } from "@supabase/supabase-js";
import type { WireBenchmark } from "../src/benchmarkWire.js";

// Private bucket: only the server (secret key) reads or writes it.
const BUCKET = "benchmark";
const LATEST = "latest.json";

export async function ensureBucket(db: SupabaseClient): Promise<void> {
  const { data } = await db.storage.getBucket(BUCKET);
  if (data) return;
  const { error } = await db.storage.createBucket(BUCKET, { public: false });
  if (error && !/already exists/i.test(error.message)) throw error;
}

// Writes the day's snapshot (kept for history and future rate-change tracking) and replaces latest.
export async function saveBenchmark(db: SupabaseClient, benchmark: WireBenchmark): Promise<void> {
  await ensureBucket(db);
  const body = JSON.stringify(benchmark);
  const day = benchmark.fetchedAt.slice(0, 10);
  for (const path of [`snapshots/${day}.json`, LATEST]) {
    const { error } = await db.storage
      .from(BUCKET)
      .upload(path, body, { contentType: "application/json", upsert: true });
    if (error) throw error;
  }
}

export async function loadLatestBenchmark(db: SupabaseClient): Promise<string | null> {
  const { data, error } = await db.storage.from(BUCKET).download(LATEST);
  if (error || !data) return null;
  return data.text();
}
