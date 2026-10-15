import { useEffect, useMemo, useState } from "react";
import type { HouseholdStats } from "./api";
import type { LoadedBenchmark } from "./benchmark";
import { breakdown, compare, type LoanProfile } from "./compare";
import { FeedbackCard } from "./FeedbackCard";
import { propertyBalance, VALUE_MIDPOINT, type Household, type Property } from "./household";
import { HouseholdRanking } from "./HouseholdRanking";
import { translate, type Lang, type MessageKey } from "./i18n";
import { groupName, loadOccupations } from "./occupations";
import { pct } from "./format";
import { PropertyResult } from "./PropertyResult";

interface Props {
  lang: Lang;
  benchmark: LoadedBenchmark;
  household: Household;
  stats: HouseholdStats | null; // null when the household wasn't shared
  onShare: () => void;
  sharing: boolean;
  onRestart: () => void;
}

// Range midpoints (or a repayment-based estimate) stand in for the exact balance and value.
function profileFor(property: Property, household: Household): LoanProfile {
  const balance = propertyBalance(property);
  return {
    purpose: property.purpose,
    repayment: property.repayment,
    rateKind: property.rateKind,
    balance,
    propertyValue: Math.max(VALUE_MIDPOINT[property.value], balance / 0.95),
    lender: property.lender,
    rate: property.rate,
    residency: household.residency,
    income: "payg",
    firstHome: false,
    needOffset: false,
  };
}

export function HouseholdResults({ lang, benchmark, household, stats, onShare, sharing, onRestart }: Props) {
  const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
  const [selected, setSelected] = useState(0);
  const [groupLabel, setGroupLabel] = useState("");

  useEffect(() => {
    loadOccupations().then((data) => setGroupLabel(groupName(data, household.members[0].occupation, lang)));
  }, [household, lang]);

  const analyses = useMemo(
    () =>
      household.properties.map((p) => {
        const profile = profileFor(p, household);
        return { profile, comparison: compare(benchmark, profile), breakdown: breakdown(benchmark, profile) };
      }),
    [benchmark, household],
  );

  const current = analyses[selected];

  return (
    <div className="result">
      {stats ? (
        <HouseholdRanking lang={lang} household={household} stats={stats} groupLabel={groupLabel} />
      ) : (
        <section className="card share" id="share">
          <h3>{t("hr.shareTitle")}</h3>
          <p className="sub">{t("hr.shareBody")}</p>
          <button className="primary" disabled={sharing} onClick={onShare}>
            {sharing ? t("share.busy") : t("hr.shareButton")}
          </button>
          <p className="note">{t("wz.review.privacy")}</p>
        </section>
      )}

      {analyses.length > 1 && (
        <div className="tabs property-tabs" role="tablist">
          {household.properties.map((p, i) => (
            <button key={i} role="tab" aria-selected={selected === i} className={selected === i ? "on" : ""} onClick={() => setSelected(i)}>
              {t(p.purpose === "INV" ? "purpose.INV" : "purpose.OO")}
              <small>
                {p.lender ?? "—"} · {pct(p.rate)}
              </small>
            </button>
          ))}
        </div>
      )}

      {current && current.comparison ? (
        <PropertyResult
          key={selected}
          lang={lang}
          profile={current.profile}
          comparison={current.comparison}
          breakdown={current.breakdown}
          balanceEstimated={household.properties[selected].balance === null}
          shared={stats !== null}
          crowd={stats?.rates.find((r) => r.position === selected)?.stats ?? null}
          minGroupSize={stats?.minGroupSize ?? 5}
          onShareClick={() => document.getElementById("share")?.scrollIntoView({ behavior: "smooth", block: "start" })}
        />
      ) : (
        current && <p className="card error">{t("noMatch")}</p>
      )}

      <FeedbackCard lang={lang} page="result" startOpen={true} />

      <section className="card coffee">
        <div>
          <h3>{t("coffee.title")}</h3>
          <p className="sub">{t("coffee.body")}</p>
        </div>
        <a className="secondary" href="https://buymeacoffee.com/tyah0510" target="_blank" rel="noopener noreferrer">
          {t("coffee.button")}
        </a>
      </section>

      <button className="ghost" onClick={onRestart}>
        {t("res.again")}
      </button>
    </div>
  );
}
