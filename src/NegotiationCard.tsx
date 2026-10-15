import { useState } from "react";
import type { Comparison, LoanProfile } from "./compare";
import { aud, pct } from "./format";
import { translate, type Lang, type MessageKey } from "./i18n";

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

// The call script is always English: it's read out to an Australian lender.
function callScript(p: LoanProfile, c: Comparison): string {
  const lines = [
    `Hi, I have an ${loanDescription(p)} home loan with you. The balance is about ${aud(p.balance)} and my LVR is around ${pct(c.lvr, 0)}.`,
    `My current rate is ${pct(p.rate)}.`,
  ];
  if (c.ownLender && c.ownLender.rate < p.rate) {
    lines.push(`I can see you're offering new customers ${pct(c.ownLender.rate)} on the same terms.`);
  }
  lines.push(
    `Other lenders are advertising rates as low as ${pct(c.p10)} for a loan like mine, and I'm considering refinancing.`,
    c.ownLender && c.ownLender.rate < p.rate
      ? `Could you review my rate and bring it down to at least the ${pct(c.ownLender.rate)} you offer new customers?`
      : `Could you review my rate and tell me the best you can offer to keep my loan?`,
  );
  return lines.join(" ");
}

export function NegotiationCard({ lang, profile, comparison }: Props) {
  const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
  const [copied, setCopied] = useState(false);
  const script = callScript(profile, comparison);

  async function copy() {
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the text is still selectable on the page.
    }
  }

  return (
    <section className="card">
      <h3>{t("script.title")}</h3>
      <p className="sub">{t("script.intro")}</p>
      <blockquote className="script" lang="en">
        {script}
      </blockquote>
      <button className="secondary" onClick={copy}>
        {copied ? t("script.copied") : t("script.copy")}
      </button>
    </section>
  );
}
