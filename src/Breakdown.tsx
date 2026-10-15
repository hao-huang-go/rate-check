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

  const hasOwn = profile.lender !== null && all.some((r) => r.own !== null);
  // "How much each condition changes the price" is measured on the borrower's own lender when we
  // know it, otherwise on the market median, relative to the row for their current terms.
  const priceOf = (r: BreakdownRow) => (hasOwn ? r.own : r.median);

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
      <div className={hasOwn ? "bd-head" : "bd-head no-own"}>
        <span />
        <span>{t("bd.median")}</span>
        {hasOwn && <span className="own-col">{profile.lender}</span>}
        <span>{t("bd.diff")}</span>
      </div>
      {groups
        .filter((g) => g.rows.length > 1)
        .map((g) => (
          <div key={g.title} className="bd-group">
            <p className="bd-title">{g.title}</p>
            {g.rows.map((r) => {
              const base = g.rows.find((x) => x.current);
              const price = priceOf(r);
              const basePrice = base ? priceOf(base) : null;
              const diff = price !== null && basePrice !== null ? price - basePrice : null;
              return (
                <div key={r.key} className={`bd-row${r.current ? " current" : ""}${hasOwn ? "" : " no-own"}`}>
                  <span className="bd-label">{g.label(r.key)}</span>
                  <span className="bd-num muted">{pct(r.median)}</span>
                  {hasOwn && <span className="bd-num">{r.own !== null ? pct(r.own) : "—"}</span>}
                  <span className={`bd-num bd-diff${diff !== null && diff > 0.00005 ? " up" : diff !== null && diff < -0.00005 ? " down" : ""}`}>
                    {r.current ? t("bd.now") : diff === null ? "—" : `${diff > 0 ? "+" : diff < 0 ? "−" : "±"}${pct(Math.abs(diff))}`}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      <p className="note">
        {hasOwn ? t("bd.legendOwn", { lender: profile.lender ?? "" }) : t("bd.legend")}
      </p>
    </section>
  );
}
