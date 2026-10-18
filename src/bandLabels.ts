import type { Lang } from "./i18n";

// "0-1k" -> "Under $1k" / "$1k 以下"; "1k-2k" -> "$1k–2k"; "8k+" -> "$8k+" / "$8k 以上".
export function moneyBand(band: string, lang: Lang): string {
  if (band.endsWith("+")) {
    const v = band.slice(0, -1);
    return lang === "zh" ? `$${v} 以上` : `$${v}+`;
  }
  const [lo, hi] = band.split("-");
  if (lo === "0") return lang === "zh" ? `$${hi} 以下` : `Under $${hi}`;
  return `$${lo}–${hi}`;
}

// "0-1" -> "Under 1 year" / "不到 1 年"; "20+" -> "20+ years" / "20 年以上".
export function yearsBand(band: string, lang: Lang): string {
  if (band.endsWith("+")) {
    const v = band.slice(0, -1);
    return lang === "zh" ? `${v} 年以上` : `${v}+ years`;
  }
  const [lo, hi] = band.split("-");
  if (lo === "0") return lang === "zh" ? `不到 ${hi} 年` : `Under ${hi} year${hi === "1" ? "" : "s"}`;
  return lang === "zh" ? `${lo}–${hi} 年` : `${lo}–${hi} years`;
}

// "400-500" -> "$400–500/周" / "$400–500/wk"; "1000+" -> "$1000+/周".
export function weeklyBand(band: string, lang: Lang): string {
  const unit = lang === "zh" ? "/周" : "/wk";
  if (band.endsWith("+")) return `$${band.slice(0, -1)}+${unit}`;
  const [lo, hi] = band.split("-");
  if (lo === "0") return lang === "zh" ? `$${hi}/周以下` : `Under $${hi}/wk`;
  return `$${lo}–${hi}${unit}`;
}
