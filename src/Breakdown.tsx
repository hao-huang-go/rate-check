import type { Breakdown as BreakdownData, BreakdownRow, LoanProfile } from "./compare";
import { pct } from "./format";
import { translate, type Lang, type MessageKey } from "./i18n";

interface Props {
  lang: Lang;
  profile: LoanProfile;
  data: BreakdownData;
}

// One criterion changed at a time, everything else held at the borrower's profile.
export function Breakdown({ lang, profile, data }: Props) {
  const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
  const all = [...data.lvr, ...data.rateKind, ...data.offset, ...data.purpose, ...data.repayment];
  if (!all.length) return null;

  // Shared scale so bars compare across groups, padded so the shortest bar is still visible.
  const lo = Math.min(...all.map((r) => r.best), profile.rate) - 0.002;
  const hi = Math.max(...all.map((r) => r.median), profile.rate) + 0.001;
  const pos = (rate: number) => `${((rate - lo) / (hi - lo)) * 100}%`;

  const groups: { title: string; rows: BreakdownRow[]; label: (key: string) => string }[] = [
    { title: t("bd.lvr"), rows: data.lvr, label: (k) => (k === "0-60" ? "≤60%" : `${k.replace("-", "–")}%`) },
    {
      title: t("rateKind"),
      rows: data.rateKind,
      label: (k) => (k === "V" ? t("rateKind.V") : t("rateKind.F", { n: k.slice(1) })),
    },
    { title: "Offset", rows: data.offset, label: (k) => (k === "yes" ? t("bd.offsetYes") : t("bd.offsetNo")) },
    { title: t("purpose"), rows: data.purpose, label: (k) => t(k === "OO" ? "purpose.OO" : "purpose.INV") },
    { title: t("repayment"), rows: data.repayment, label: (k) => t(k === "PI" ? "repayment.PI" : "repayment.IO") },
  ];

  return (
    <section className="card breakdown">
      <h3>{t("bd.title")}</h3>
      <div className="bd-head">
        <span />
        <span />
        <span>{t("bd.best")}</span>
        <span>{t("bd.median")}</span>
      </div>
      {groups
        .filter((g) => g.rows.length > 1)
        .map((g) => (
          <div key={g.title} className="bd-group">
            <p className="bd-title">{g.title}</p>
            {g.rows.map((r) => (
              <div key={r.key} className={r.current ? "bd-row current" : "bd-row"}>
                <span className="bd-label">{g.label(r.key)}</span>
                <span className="bd-track">
                  <span className="bd-bar" style={{ left: pos(r.best), width: `calc(${pos(r.median)} - ${pos(r.best)})` }} />
                  <span className="bd-you" style={{ left: pos(profile.rate) }} />
                </span>
                <span className="bd-num">{pct(r.best)}</span>
                <span className="bd-num muted">{pct(r.median)}</span>
              </div>
            ))}
          </div>
        ))}
      <p className="note">{t("bd.legend", { rate: pct(profile.rate) })}</p>
    </section>
  );
}
