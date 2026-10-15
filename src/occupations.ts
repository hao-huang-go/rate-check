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

export function searchOccupations(data: OccupationData, query: string): OccupationHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  // A Chinese alias expands to its English term, e.g. 程序员 -> software engineer.
  const terms = [q, ...data.zh.filter(([alias]) => alias.toLowerCase().includes(q)).map(([, en]) => en.toLowerCase())];
  const hits = new Map<string, OccupationHit>();
  const add = (code: string, matched: string | null) => {
    if (hits.size < MAX_HITS * 3 && !hits.has(code)) hits.set(code, { code, title: data.occ[code], matched });
  };

  for (const term of terms) {
    for (const [code, title] of Object.entries(data.occ)) {
      if (title.toLowerCase().startsWith(term)) add(code, null);
    }
  }
  for (const term of terms) {
    for (const [code, title] of Object.entries(data.occ)) {
      if (title.toLowerCase().includes(term)) add(code, null);
    }
    for (const [title, code] of data.titles) {
      if (title.toLowerCase().includes(term)) add(code, title);
    }
  }
  return [...hits.values()].filter((h) => h.title).slice(0, MAX_HITS);
}

export function groupName(data: OccupationData, code: string, lang: "zh" | "en"): string {
  const group = data.groups[code.slice(0, 2)] ?? data.groups[code.slice(0, 1)];
  return group ? group[lang === "zh" ? 1 : 0] : "";
}
