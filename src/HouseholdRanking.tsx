import { useState } from "react";
import type { HouseholdStats, MetricStats } from "./api";
import { householdTotals, SAVINGS_BANDS, type Household } from "./household";
import { moneyBand } from "./bandLabels";
import { aud, pct } from "./format";
import { translate, type Lang, type MessageKey } from "./i18n";

interface Props {
  lang: Lang;
  household: Household;
  stats: HouseholdStats;
  groupLabel: string;
}

type Cohort = "all" | "age" | "group" | "state";
type Metric = "income" | "repayment" | "ratio" | "savings";

// Common rule of thumb: repayments under 30% of take-home pay.
const RATIO_GUIDE = 0.3;

const kFormat = (v: number) => (v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}m` : `$${Math.round(v / 1000)}k`);

interface HistogramProps {
  stats: Required<Pick<MetricStats, "hist" | "lo" | "hi" | "p25" | "p50" | "p75">>;
  mine: number;
  format: (v: number) => string;
}

// Fixed-bin histogram from the server, your bin highlighted, quartile marks underneath.
function Histogram({ stats, mine, format }: HistogramProps) {
  const { hist, lo, hi } = stats;
  const tallest = Math.max(...hist, 1);
  const bin = Math.min(hist.length - 1, Math.max(0, Math.floor(((mine - lo) / (hi - lo)) * hist.length)));
  const at = (v: number) => `${Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100))}%`;
  return (
    <div className="hist">
      <div className="hist-bars">
        {hist.map((count, i) => (
          <span
            key={i}
            className={i === bin ? "you" : ""}
            style={{ height: `${Math.max(count ? 8 : 2, (count / tallest) * 100)}%` }}
          />
        ))}
        <span className="hist-median" style={{ left: at(stats.p50) }} />
      </div>
      <div className="hist-marks">
        {(["p25", "p50", "p75"] as const).map((k) => (
          <span key={k}>
            <i>{k === "p25" ? "25%" : k === "p50" ? "50%" : "75%"}</i>
            {format(stats[k])}
          </span>
        ))}
      </div>
    </div>
  );
}

const ready = (s: MetricStats | undefined): s is Required<MetricStats> =>
  !!s && s.hist !== undefined && s.below !== undefined && s.ties !== undefined;

export function HouseholdRanking({ lang, household, stats, groupLabel }: Props) {
  const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
  const [cohort, setCohort] = useState<Cohort>("all");

  const totals = householdTotals(household);
  const hasLoan = household.properties.length > 0;
  const mine: Record<Metric, number | null> = {
    income: totals.income,
    repayment: hasLoan ? totals.repayment : null,
    ratio: hasLoan && totals.incomeAfterTax > 0 ? (totals.repayment * 12) / totals.incomeAfterTax : null,
    savings: household.savings ? SAVINGS_BANDS.indexOf(household.savings) + 1 : null,
  };

  const cohortStats = stats.cohorts[cohort];
  const cohortN = cohortStats.income.n;
  const tabs: { key: Cohort; label: string }[] = [
    { key: "all", label: t("rank.all") },
    { key: "age", label: t("rank.ageTab", { age: household.age }) },
    { key: "group", label: groupLabel || t("rank.group") },
    { key: "state", label: household.state },
  ];

  const format: Record<Metric, (v: number) => string> = {
    income: kFormat,
    repayment: (v) => aud(v),
    ratio: (v) => pct(v, 0),
    savings: (v) => moneyBand(SAVINGS_BANDS[Math.min(6, Math.max(0, Math.round(v) - 1))], lang),
  };

  function headline(metric: Metric, s: Required<MetricStats>): string {
    const lowerShare = (s.below + s.ties / 2) / s.n; // share with a smaller value than you
    const higherShare = 1 - lowerShare;
    const top = Math.max(1, Math.round(higherShare * 100));
    switch (metric) {
      case "income":
        return t("rank.top", { n: top });
      case "savings":
        return t("rank.top", { n: top });
      case "repayment":
        return t("rank.repaymentRank", { n: Math.round(lowerShare * 100) });
      case "ratio":
        return t("rank.ratioRank", { n: Math.round(higherShare * 100) });
    }
  }

  const metrics: Metric[] = ["income", "repayment", "ratio", "savings"];

  return (
    <section className="card ranking">
      <h3>{t("rank.title")}</h3>
      <div className="tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={cohort === tab.key}
            className={cohort === tab.key ? "on" : ""}
            onClick={() => setCohort(tab.key)}
          >
            <span className="tab-label" title={tab.label}>
              {tab.label}
            </span>
            <small>{t("rank.people", { n: stats.cohorts[tab.key].income.n })}</small>
          </button>
        ))}
      </div>

      {cohortN < stats.minGroupSize && <p className="sub">{t("rank.waiting", { n: cohortN, min: stats.minGroupSize })}</p>}

      {metrics.map((metric) => {
        const s = cohortStats[metric];
        const value = mine[metric];
        if (value === null) return null;
        return (
          <div key={metric} className="metric">
            <div className="metric-head">
              <span className="metric-title">{t(`rank.${metric}`)}</span>
              {ready(s) && <span className="metric-rank">{headline(metric, s)}</span>}
            </div>
            {metric === "ratio" && (
              <p className={value > RATIO_GUIDE ? "ratio-guide over" : "ratio-guide"}>
                {t(value > RATIO_GUIDE ? "rank.ratioOver" : "rank.ratioUnder")}
              </p>
            )}
            {ready(s) ? (
              <>
                <Histogram stats={s} mine={value} format={format[metric]} />
                <p className="metric-foot">
                  <b>{t("rank.you", { v: format[metric](value) })}</b> · {t("rank.median", { v: format[metric](s.p50) })}
                </p>
              </>
            ) : (
              <p className="metric-foot">
                <b>{t("rank.you", { v: format[metric](value) })}</b> · {t("rank.collecting", { n: s.n, min: stats.minGroupSize })}
              </p>
            )}
          </div>
        );
      })}
      <p className="note">{t("rank.note")}</p>
    </section>
  );
}
