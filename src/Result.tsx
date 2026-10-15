import type { Comparison, LoanProfile } from "./compare";
import { aud, pct } from "./format";
import { translate, type Lang, type MessageKey } from "./i18n";
import { NegotiationCard } from "./NegotiationCard";
import { RateChart } from "./RateChart";
import { ShareCard } from "./ShareCard";

interface Props {
  lang: Lang;
  profile: LoanProfile;
  comparison: Comparison;
  savedId: string | null;
  onSubmitted: (id: string) => void;
  onRestart: () => void;
}

const LOWEST_SHOWN = 5;

export function Result({ lang, profile, comparison: c, savedId, onSubmitted, onRestart }: Props) {
  const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
  const total = c.lenders.length;
  const group = [
    t(`purpose.${profile.purpose}`),
    t(`repayment.${profile.repayment}`),
    profile.rateKind === "V" ? t("rateKind.V") : t("rateKind.F", { n: profile.rateKind.slice(1) }),
    `LVR ${pct(c.lvr, 0)}`,
  ].join(" · ");

  return (
    <div className="result">
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
          {c.cheaperCount > 0
            ? t("res.cheaper", { n: c.cheaperCount, total })
            : t("res.cheaperNone", { total })}
        </p>

        {c.overpayVsMedian > 0 && (
          <div className="overpay">
            <span>{t("res.overpay")}</span>
            <strong>{t("perYear", { amount: aud(c.overpayVsMedian) })}</strong>
          </div>
        )}
        {c.overpayVsP10 > 0 && (
          <p className="sub">
            {t("res.overpayBest")} <b>{t("perYear", { amount: aud(c.overpayVsP10) })}</b>
          </p>
        )}

        <h3>{t("res.chart", { total })}</h3>
        <RateChart rates={c.lenders.map((l) => l.rate)} yours={profile.rate} youLabel={t("res.chartYou")} />
      </section>

      {c.ownLender && (
        <section className="card own">
          {c.overpayVsOwnLender > 0 ? (
            <>
              <p className="headline-sm">
                {t("res.own", { lender: c.ownLender.lender, rate: pct(c.ownLender.rate) })}
              </p>
              <p className="sub">
                {t("res.ownTip", {
                  diff: pct(profile.rate - c.ownLender.rate),
                  amount: aud(c.overpayVsOwnLender),
                })}
              </p>
            </>
          ) : (
            <p className="headline-sm">{t("res.ownFine", { lender: c.ownLender.lender })}</p>
          )}
        </section>
      )}

      {c.overpayVsP10 > 0 && <NegotiationCard lang={lang} profile={profile} comparison={c} />}

      <section className="card">
        <h3>{t("res.lowest")}</h3>
        <ol className="lowest">
          {c.lenders.slice(0, LOWEST_SHOWN).map((l) => (
            <li key={l.lender}>
              <div>
                <span className="lender">{l.lender}</span>
                <span className="product">
                  {l.product}
                  {l.hasOffset && <span className="tag">{t("res.offset")}</span>}
                </span>
              </div>
              <span className="rate">{pct(l.rate)}</span>
            </li>
          ))}
        </ol>
        <p className="note">{t("res.lowestNote")}</p>
      </section>

      <ShareCard lang={lang} profile={profile} savedId={savedId} onSubmitted={onSubmitted} />

      <button className="ghost" onClick={onRestart}>
        {t("res.again")}
      </button>
    </div>
  );
}
