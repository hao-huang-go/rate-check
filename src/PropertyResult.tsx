import type { MetricStats } from "./api";
import type { Comparison, LoanProfile } from "./compare";
import { aud, pct } from "./format";
import { translate, type Lang, type MessageKey } from "./i18n";
import { Simulator } from "./Simulator";

interface Props {
  lang: Lang;
  profile: LoanProfile;
  comparison: Comparison;
  balanceEstimated: boolean;
  shared: boolean;
  crowd: MetricStats | null; // real participants with the same purpose and rate type
  minGroupSize: number;
  onShareClick: () => void;
}

// One loan: how it compares with the market, and the rate simulator.
export function PropertyResult({ lang, profile, comparison: c, balanceEstimated, shared, crowd, minGroupSize, onShareClick }: Props) {
  const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
  const total = c.lenders.length;
  const group = [
    t(`purpose.${profile.purpose}`),
    t(`repayment.${profile.repayment}`),
    profile.rateKind === "V" ? t("rateKind.V") : t("rateKind.F", { n: profile.rateKind.slice(1) }),
    `LVR ${pct(c.lvr, 0)}`,
    profile.residency !== "pr" ? t(`residency.${profile.residency}`) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const crowdReady = crowd && crowd.below !== undefined && crowd.ties !== undefined && crowd.n >= minGroupSize;

  return (
    <>
      {profile.residency !== "pr" && (
        <p className="card notice">{profile.residency === "visa" ? t("res.visaNote", { n: total }) : t("res.overseasNote")}</p>
      )}

      <section className="card">
        <p className="eyebrow">{t("res.group", { group })}</p>
        <div className="stats">
          <div>
            <span className="stat-label">{t("res.yours")}</span>
            <span className="stat-value accent">{pct(profile.rate)}</span>
          </div>
          <div>
            <span className="stat-label">{t("res.median")}</span>
            <span className="stat-value">{pct(c.median)}</span>
          </div>
          <div>
            <span className="stat-label">{t("res.best")}</span>
            <span className="stat-value">{pct(c.p10)}</span>
          </div>
        </div>

        <p className="headline">
          {c.cheaperCount > 0 ? t("res.cheaper", { n: c.cheaperCount, total }) : t("res.cheaperNone", { total })}
        </p>

        {c.overpayVsMedian > 0 && (
          <div className="overpay">
            <span>{t("res.overpay")}</span>
            <strong>{t("perYear", { amount: aud(c.overpayVsMedian) })}</strong>
          </div>
        )}

        {shared && crowd && (
          <p className="crowd-line">
            {crowdReady
              ? t("prop.crowd", {
                  n: crowd.n,
                  pct: Math.round(((crowd.n - crowd.below! - crowd.ties! / 2) / crowd.n) * 100),
                })
              : t("prop.crowdWaiting", { n: crowd.n, min: minGroupSize })}
          </p>
        )}

        <p className="note">
          {balanceEstimated ? t("prop.estimateFromRepayment", { balance: aud(profile.balance) }) : t("prop.estimate")}
        </p>
      </section>

      <Simulator lang={lang} profile={profile} comparison={c} unlocked={shared} onUnlockClick={onShareClick} />

    </>
  );
}
