import { useEffect, useState } from "react";
import { ApiError, fetchStats, submitRate, type SubmissionResult } from "./api";
import { LOAN_AGES, type LoanAge } from "./bands";
import type { LoanProfile } from "./compare";
import { pct } from "./format";
import { translate, type Lang, type MessageKey } from "./i18n";

interface Props {
  lang: Lang;
  profile: LoanProfile;
  savedId: string | null; // set when this exact profile was already submitted from this browser
  onSubmitted: (id: string) => void;
}

type Status = "idle" | "busy" | "error" | "rate_limited";

export function ShareCard({ lang, profile, savedId, onSubmitted }: Props) {
  const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
  const [loanAge, setLoanAge] = useState<LoanAge | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<SubmissionResult | null>(null);

  useEffect(() => {
    if (!savedId) return;
    let cancelled = false;
    fetchStats(savedId)
      .then((r) => !cancelled && setResult(r))
      .catch(() => {
        // Fall back to the submit form; resubmitting is harmless.
      });
    return () => {
      cancelled = true;
    };
  }, [savedId]);

  async function run(action: () => Promise<SubmissionResult>) {
    setStatus("busy");
    try {
      setResult(await action());
      setStatus("idle");
    } catch (e) {
      setStatus(e instanceof ApiError && e.code === "rate_limited" ? "rate_limited" : "error");
    }
  }

  if (result) {
    const s = result.stats;
    return (
      <section className="card share">
        <h3>{t("crowd.title")}</h3>
        {s.enough ? (
          <>
            {s.scope === "broad" && (
              <p className="sub">{t("crowd.broad", { n: s.n, min: s.minGroupSize })}</p>
            )}
            <p className="headline">
              {t("crowd.rank", { n: s.shownN ?? s.n, pct: Math.round((s.higherThanPct ?? 0) * 100) })}
            </p>
            <div className="stats">
              <div>
                <span className="stat-label">{t("crowd.p25")}</span>
                <span className="stat-value">{pct(s.p25 ?? 0)}</span>
              </div>
              <div>
                <span className="stat-label">{t("crowd.median")}</span>
                <span className="stat-value">{pct(s.median ?? 0)}</span>
              </div>
              <div>
                <span className="stat-label">{t("crowd.p75")}</span>
                <span className="stat-value">{pct(s.p75 ?? 0)}</span>
              </div>
            </div>
            {s.lenderMedian != null && profile.lender && (
              <p className="sub">
                {t("crowd.lender", { lender: profile.lender, rate: pct(s.lenderMedian) })}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="sub">{t("crowd.waiting", { n: s.n, min: s.minGroupSize })}</p>
            <button
              className="secondary"
              disabled={status === "busy"}
              onClick={() => run(() => fetchStats(result.id))}
            >
              {status === "busy" ? t("crowd.checking") : t("crowd.check")}
            </button>
          </>
        )}
        <p className="note">{t("crowd.anon")}</p>
      </section>
    );
  }

  return (
    <section className="card share">
      <h3>{t("share.title")}</h3>
      <p className="sub">{t("share.body")}</p>
      <fieldset className="field share-age">
        <legend>
          {t("share.loanAge")} <span className="optional">{t("share.optional")}</span>
        </legend>
        <div className="segmented" role="radiogroup">
          {LOAN_AGES.map((age) => (
            <button
              key={age}
              type="button"
              role="radio"
              aria-checked={loanAge === age}
              className={loanAge === age ? "on" : ""}
              onClick={() => setLoanAge(loanAge === age ? null : age)}
            >
              {t(`loanAge.${age}`)}
            </button>
          ))}
        </div>
      </fieldset>
      {status === "error" && <p className="error">{t("share.error")}</p>}
      {status === "rate_limited" && <p className="error">{t("share.rateLimited")}</p>}
      <button
        className="primary"
        disabled={status === "busy"}
        onClick={() =>
          run(async () => {
            const r = await submitRate(profile, loanAge);
            onSubmitted(r.id);
            return r;
          })
        }
      >
        {status === "busy" ? t("share.busy") : t("share.submit")}
      </button>
      <p className="note">{t("share.privacy")}</p>
    </section>
  );
}
