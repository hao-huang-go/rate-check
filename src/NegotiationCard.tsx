import { useEffect, useState } from "react";
import { fetchNegotiationStats, type NegotiationStats } from "./api";
import type { Comparison, LenderBest, LoanProfile } from "./compare";
import { aud, pct } from "./format";
import { translate, type Lang, type MessageKey } from "./i18n";
import { NegotiationReport } from "./NegotiationReport";

interface Props {
  lang: Lang;
  profile: LoanProfile;
  comparison: Comparison;
}

const PURPOSE_EN = { OO: "owner-occupied", INV: "investment" } as const;
const REPAYMENT_EN = { PI: "principal and interest", IO: "interest-only" } as const;

function loanDescription(p: LoanProfile): string {
  const kind = p.rateKind === "V" ? "variable" : `${p.rateKind.slice(1)}-year fixed`;
  return `${PURPOSE_EN[p.purpose]} ${kind} ${REPAYMENT_EN[p.repayment]}`;
}

// A named competitor product works better than "other lenders are cheaper".
function competitorFor(c: Comparison, ownLender: string | null): LenderBest | null {
  return c.lenders.find((l) => l.lender !== ownLender) ?? null;
}

// The call script is always English: it's read out to an Australian lender.
function callScript(p: LoanProfile, c: Comparison): string {
  const competitor = competitorFor(c, p.lender);
  const ownBeatsMine = c.ownLender && c.ownLender.rate < p.rate;
  const lines = [
    `Hi, I have an ${loanDescription(p)} home loan with you. The balance is about ${aud(p.balance)} and my LVR is around ${pct(c.lvr, 0)}.`,
    `My current rate is ${pct(p.rate)}, and I'm considering refinancing.`,
  ];
  if (ownBeatsMine) {
    lines.push(`You're offering new customers ${pct(c.ownLender!.rate)} on the same terms.`);
  }
  if (competitor) {
    lines.push(
      `${competitor.lender} is advertising ${pct(competitor.rate)} on their ${competitor.product} for a loan like mine.`,
    );
  }
  lines.push(
    ownBeatsMine
      ? `Could you bring my rate down to at least the ${pct(c.ownLender!.rate)} you offer new customers, or closer to ${competitor ? pct(competitor.rate) : "that"}?`
      : `What's the best rate you can offer to keep my loan?`,
  );
  return lines.join(" ");
}

export function NegotiationCard({ lang, profile, comparison }: Props) {
  const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<NegotiationStats | null>(null);
  const script = callScript(profile, comparison);
  const competitor = competitorFor(comparison, profile.lender);

  useEffect(() => {
    if (!profile.lender) return;
    let cancelled = false;
    fetchNegotiationStats(profile.lender)
      .then((s) => !cancelled && setStats(s))
      .catch(() => {
        // Stats are a bonus; the script works without them.
      });
    return () => {
      cancelled = true;
    };
  }, [profile.lender]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the text is still selectable on the page.
    }
  }

  const lenderStats = stats?.lender;
  const allStats = stats?.all;

  return (
    <section className="card">
      <h3>{t("script.title")}</h3>

      {lenderStats ? (
        <p className="crowd-line">
          {t("nego.lenderStats", {
            lender: profile.lender ?? "",
            n: lenderStats.n,
            pct: Math.round(lenderStats.gotCutPct * 100),
            cut: lenderStats.medianCut !== null ? pct(lenderStats.medianCut) : "—",
          })}
        </p>
      ) : allStats ? (
        <p className="crowd-line">
          {t("nego.allStats", {
            n: allStats.n,
            pct: Math.round(allStats.gotCutPct * 100),
            cut: allStats.medianCut !== null ? pct(allStats.medianCut) : "—",
          })}
        </p>
      ) : null}

      <ol className="steps">
        <li>{t("nego.step1")}</li>
        <li>
          {competitor
            ? t("nego.step2", { lender: competitor.lender, rate: pct(competitor.rate) })
            : t("nego.step2generic")}
        </li>
        <li>{t("nego.step3")}</li>
      </ol>

      <details className="script-wrap">
        <summary>{t("script.copy")}</summary>
        <blockquote className="script" lang="en">
          {script}
        </blockquote>
        <button className="secondary" onClick={copy}>
          {copied ? t("script.copied") : t("script.copyBtn")}
        </button>
      </details>

      {profile.lender && (
        <NegotiationReport lang={lang} profile={profile} lender={profile.lender} onReported={setStats} />
      )}
    </section>
  );
}
