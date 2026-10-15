import { useState } from "react";
import type { Comparison, LoanProfile } from "./compare";
import { aud, pct } from "./format";
import { translate, type Lang, type MessageKey } from "./i18n";
import { simulate } from "./simulate";

interface Props {
  lang: Lang;
  profile: LoanProfile;
  comparison: Comparison;
  unlocked: boolean;
  onUnlockClick: () => void;
}

// Typical refinance outlay: discharge fee, government registration fees, settlement/application.
const DEFAULT_SWITCH_COST = 800;
const DEFAULT_YEARS = 25;
const STEP = 0.0001; // 0.01 percentage point

export function Simulator({ lang, profile, comparison: c, unlocked, onUnlockClick }: Props) {
  const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars);

  const minRate = Math.max(0.03, Math.floor((c.lenders[0].rate - 0.002) / STEP) * STEP);
  const maxRate = profile.rate;
  const presets = [
    c.ownLender && c.ownLender.rate < profile.rate
      ? { key: "own", label: t("sim.presetOwn", { lender: c.ownLender.lender }), rate: c.ownLender.rate }
      : null,
    c.median < profile.rate ? { key: "median", label: t("sim.presetMedian"), rate: c.median } : null,
    c.p10 < profile.rate ? { key: "p10", label: t("sim.presetP10"), rate: c.p10 } : null,
  ].filter((p): p is { key: string; label: string; rate: number } => p !== null);

  const [target, setTarget] = useState(presets[0]?.rate ?? profile.rate);
  const [years, setYears] = useState(DEFAULT_YEARS);
  const [refinance, setRefinance] = useState(false);
  const [switchCost, setSwitchCost] = useState(DEFAULT_SWITCH_COST);
  const [cashback, setCashback] = useState(0);

  if (!unlocked) {
    return (
      <section className="card sim locked">
        <h3>{t("sim.title")}</h3>
        <ul className="sim-teaser">
          <li>{t("sim.teaser1")}</li>
          <li>{t("sim.teaser2")}</li>
          <li>{t("sim.teaser3")}</li>
        </ul>
        <button className="primary" onClick={onUnlockClick}>
          {t("sim.unlock")}
        </button>
      </section>
    );
  }

  if (maxRate <= minRate) {
    return (
      <section className="card sim">
        <h3>{t("sim.title")}</h3>
        <p className="sub">{t("sim.alreadyLow")}</p>
      </section>
    );
  }

  const result = simulate({
    balance: profile.balance,
    currentRate: profile.rate,
    targetRate: target,
    years,
    repayment: profile.repayment,
    switchCost: refinance ? switchCost : 0,
    cashback: refinance ? cashback : 0,
  });
  const cheaperLenders = c.lenders.filter((l) => l.rate < target - 1e-9).length;

  return (
    <section className="card sim">
      <h3>{t("sim.title")}</h3>

      <div className="segmented sim-presets">
        {presets.map((p) => (
          <button
            key={p.key}
            type="button"
            className={Math.abs(target - p.rate) < 1e-9 ? "on" : ""}
            onClick={() => setTarget(p.rate)}
          >
            {p.label} {pct(p.rate)}
          </button>
        ))}
      </div>

      <label className="field sim-slider">
        <span>
          {t("sim.target")} <b>{pct(target)}</b>
        </span>
        <input
          id="sim-target"
          type="range"
          min={minRate}
          max={maxRate}
          step={STEP}
          value={target}
          onChange={(e) => setTarget(Number(e.target.value))}
        />
      </label>

      {profile.repayment === "PI" && (
        <label className="field sim-slider">
          <span>
            {t("sim.years")} <b>{t("sim.yearsValue", { n: years })}</b>
          </span>
          <input id="sim-years" type="range" min={1} max={30} step={1} value={years} onChange={(e) => setYears(Number(e.target.value))} />
        </label>
      )}

      <div className="stats sim-stats">
        <div>
          <span className="stat-label">{t("sim.monthly", { saving: aud(result.monthlySaving) })}</span>
          <span className="stat-value">{aud(result.monthlyTarget)}</span>
        </div>
        <div>
          <span className="stat-label">{t("sim.perYear")}</span>
          <span className="stat-value accent">{aud(result.yearlyInterestSaving)}</span>
        </div>
        <div>
          <span className="stat-label">{t("sim.term", { n: years })}</span>
          <span className="stat-value">{aud(result.termSaving)}</span>
        </div>
      </div>
      <p className="sub">
        {t("sim.rank", { n: cheaperLenders, total: c.lenders.length, now: aud(result.monthlyNow) })}
      </p>

      <label className="sim-toggle">
        <input id="sim-refinance" type="checkbox" checked={refinance} onChange={(e) => setRefinance(e.target.checked)} />
        {t("sim.refinance")}
      </label>

      {refinance && (
        <div className="sim-refi">
          <label className="field sim-slider">
            <span>
              {t("sim.switchCost")} <b>{aud(switchCost)}</b>
            </span>
            <input id="sim-cost" type="range" min={0} max={3000} step={50} value={switchCost} onChange={(e) => setSwitchCost(Number(e.target.value))} />
          </label>
          <label className="field sim-slider">
            <span>
              {t("sim.cashback")} <b>{aud(cashback)}</b>
            </span>
            <input id="sim-cashback" type="range" min={0} max={5000} step={250} value={cashback} onChange={(e) => setCashback(Number(e.target.value))} />
          </label>
          <p className="headline-sm">
            {result.breakEvenMonths === null
              ? t("sim.breakEvenNow")
              : result.breakEvenMonths === Infinity
                ? t("sim.breakEvenNever")
                : t("sim.breakEven", { n: result.breakEvenMonths })}
          </p>
        </div>
      )}

      <p className="note">{t("sim.note")}</p>
    </section>
  );
}
