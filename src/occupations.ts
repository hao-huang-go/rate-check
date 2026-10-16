// ANZSCO 2022 occupations (ABS, CC BY 4.0) with Chinese aliases, loaded when the occupation step opens.
export interface OccupationData {
  groups: Record<string, [en: string, zh: string]>; // 1-digit major and 2-digit sub-major groups
  occ: Record<string, string>; // 6-digit code -> principal title
  titles: [title: string, code: string][]; // alternative titles and specialisations
  zh: [alias: string, englishTerm: string][];
}

export interface OccupationHit {
  code: string;
  title: string; // principal title
  matched: string | null; // the alternative title that matched, when it isn't the principal one
}

let cache: Promise<OccupationData> | null = null;

export function loadOccupations(): Promise<OccupationData> {
  cache ??= fetch("/occupations.json").then((res) => res.json());
  return cache;
}

const MAX_HITS = 8;

// Seniority and filler words people add to a job title ("Senior Audit Manager") that ANZSCO
// doesn't code separately. They still count, but less than the words naming the work itself.
const GENERIC = new Set([
  "manager", "senior", "junior", "lead", "principal", "head", "chief", "officer", "assistant", "associate",
  "specialist", "consultant", "graduate", "director", "supervisor", "team", "of", "and", "the", "in",
]);

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);

// Higher is better; 0 means no match. A query with any specific word must match one of them.
function score(term: string, title: string): number {
  const t = title.toLowerCase();
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`^${escaped}\\b`).test(t)) return 100;
  if (new RegExp(`\\b${escaped}\\b`).test(t)) return 90;
  if (new RegExp(`\\b${escaped}`).test(t)) return 70;
  const titleWords = words(t);
  let total = 0;
  let specific = 0;
  let specificHits = 0;
  for (const w of words(term)) {
    const generic = GENERIC.has(w);
    if (!generic) specific++;
    if (titleWords.some((tw) => tw.startsWith(w))) {
      total += generic ? 1 : 10;
      if (!generic) specificHits++;
    }
  }
  return specific > 0 && specificHits === 0 ? 0 : total;
}

export function searchOccupations(data: OccupationData, query: string): OccupationHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  // A Chinese alias expands to its English term, e.g. 程序员 -> software engineer, 审计经理 -> auditor.
  const aliases = data.zh.filter(([alias]) => alias.toLowerCase().includes(q) || q.includes(alias.toLowerCase()));
  const terms = [q, ...aliases.map(([, en]) => en.toLowerCase())];

  const best = new Map<string, { hit: OccupationHit; score: number }>();
  const consider = (code: string, title: string, matched: string | null) => {
    const principal = data.occ[code];
    if (!principal) return;
    const s = Math.max(...terms.map((term) => score(term, title))) + (matched ? 0 : 1);
    if (s <= 1) return;
    const current = best.get(code);
    if (!current || s > current.score) best.set(code, { hit: { code, title: principal, matched }, score: s });
  };

  for (const [code, title] of Object.entries(data.occ)) consider(code, title, null);
  for (const [title, code] of data.titles) consider(code, title, title);

  return [...best.values()]
    .sort((a, b) => b.score - a.score || a.hit.title.length - b.hit.title.length)
    .slice(0, MAX_HITS)
    .map((x) => x.hit);
}

export function groupName(data: OccupationData, code: string, lang: "zh" | "en"): string {
  const group = data.groups[code.slice(0, 2)] ?? data.groups[code.slice(0, 1)];
  return group ? group[lang === "zh" ? 1 : 0] : "";
}
