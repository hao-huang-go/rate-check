import { useState } from "react";
import { ApiError, reportNegotiation, type NegotiationMethod, type NegotiationStats } from "./api";
import type { LoanProfile } from "./compare";
import { translate, type Lang, type MessageKey } from "./i18n";

interface Props {
  lang: Lang;
  profile: LoanProfile;
  lender: string;
  onReported: (stats: NegotiationStats) => void;
}

const METHODS: NegotiationMethod[] = ["asked", "named_rate", "discharge", "refinanced"];

type Status = "closed" | "open" | "busy" | "done" | "error" | "rate_limited" | "invalid";

// "I called — here's what I got." Feeds the per-lender outcome stats.
export function NegotiationReport({ lang, profile, lender, onReported }: Props) {
  const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
  const [status, setStatus] = useState<Status>("closed");
  const [before, setBefore] = useState((profile.rate * 100).toFixed(2));
  const [after, setAfter] = useState("");
  const [method, setMethod] = useState<NegotiationMethod>("asked");

  if (status === "closed") {
    return (
      <button className="ghost report-toggle" onClick={() => setStatus("open")}>
        {t("nego.reportOpen")}
      </button>
    );
  }
  if (status === "done") return <p className="sub done">{t("nego.thanks")}</p>;

  async function submit() {
    const beforeRate = Number(before) / 100;
    const afterRate = Number(after) / 100;
    if (!(beforeRate >= 0.02 && beforeRate <= 0.15 && afterRate >= 0.02 && afterRate <= 0.15)) {
      setStatus("invalid");
      return;
    }
    setStatus("busy");
    try {
      onReported(
        await reportNegotiation({
          lender,
          beforeRate,
          afterRate,
          method,
          purpose: profile.purpose,
          rateKind: profile.rateKind,
          residency: profile.residency,
        }),
      );
      setStatus("done");
    } catch (e) {
      setStatus(e instanceof ApiError && e.code === "rate_limited" ? "rate_limited" : "error");
    }
  }

  return (
    <div className="report">
      <p className="headline-sm">{t("nego.reportTitle", { lender })}</p>
      <div className="row">
        <label className="field">
          <span>{t("nego.before")}</span>
          <div className="percent">
            <input inputMode="decimal" value={before} onChange={(e) => setBefore(e.target.value.replace(/[^\d.]/g, ""))} />
          </div>
        </label>
        <label className="field">
          <span>{t("nego.after")}</span>
          <div className="percent">
            <input
              inputMode="decimal"
              placeholder={t("ratePlaceholder")}
              value={after}
              onChange={(e) => setAfter(e.target.value.replace(/[^\d.]/g, ""))}
            />
          </div>
        </label>
      </div>
      <fieldset className="field">
        <legend>{t("nego.method")}</legend>
        <div className="segmented" role="radiogroup">
          {METHODS.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={method === m}
              className={method === m ? "on" : ""}
              onClick={() => setMethod(m)}
            >
              {t(`nego.method.${m}`)}
            </button>
          ))}
        </div>
      </fieldset>
      {status === "invalid" && <p className="error">{t("invalid")}</p>}
      {status === "error" && <p className="error">{t("share.error")}</p>}
      {status === "rate_limited" && <p className="error">{t("share.rateLimited")}</p>}
      <button className="primary" disabled={status === "busy"} onClick={submit}>
        {status === "busy" ? t("share.busy") : t("nego.submit")}
      </button>
      <p className="note">{t("crowd.anon")}</p>
    </div>
  );
}
