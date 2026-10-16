import type { PeerTable } from "./api";
import { pct } from "./format";
import { translate, type Lang, type MessageKey } from "./i18n";

interface Props {
  lang: Lang;
  table: PeerTable;
  ownLender: string | null;
  loanLabel: string;
}

const kFormat = (v: number) => `$${Math.round(v / 1000)}k`;

// Other households in the same income band, same kind of loan: which lender, what rate.
export function PeerLenders({ lang, table, ownLender, loanLabel }: Props) {
  const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
  const band = table.band.hi === null ? t("peer.bandOver", { lo: kFormat(table.band.lo) }) : `${kFormat(table.band.lo)}–${kFormat(table.band.hi)}`;

  return (
    <section className="card peers">
      <h3>{t("peer.title")}</h3>
      <p className="sub">{t("peer.scope", { band, loan: loanLabel })}</p>
      {table.rows.length ? (
        <table className="peer-table">
          <thead>
            <tr>
              <th>{t("peer.lender")}</th>
              <th>{t("peer.people")}</th>
              <th>{t("peer.median")}</th>
              <th>{t("peer.lowest")}</th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r) => (
              <tr key={r.lender} className={r.lender === ownLender ? "own-row" : ""}>
                <td>{r.lender}</td>
                <td>{r.n}</td>
                <td>{pct(r.median)}</td>
                <td>{r.n > 1 ? pct(r.min) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="sub">{t("peer.empty")}</p>
      )}
    </section>
  );
}
