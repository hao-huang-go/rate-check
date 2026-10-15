import { useState } from "react";
import { MAX_LVR } from "./bands";
import type { Lender } from "./benchmark";
import {
  lvrOf,
  type Income,
  type LoanProfile,
  type Purpose,
  type RateKind,
  type Repayment,
  type Residency,
} from "./compare";
import { groupAmount, parseAmount, pct } from "./format";
import { translate, type Lang, type MessageKey } from "./i18n";

interface Props {
  lang: Lang;
  lenders: Lender[];
  initial: LoanProfile | null;
  onSubmit: (profile: LoanProfile) => void;
}

const RATE_KINDS: RateKind[] = ["V", "F1", "F2", "F3", "F4", "F5"];

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <fieldset className="field">
      <legend>{label}</legend>
      <div className="segmented" role="radiogroup">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className={value === o.value ? "on" : ""}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

// Accepts the English name, or any Chinese name/alias the user typed instead of picking.
function resolveLender(lenders: Lender[], typed: string): string | null {
  const q = typed.trim().toLowerCase();
  if (!q) return null;
  const exact = lenders.find((l) => l.name.toLowerCase() === q);
  if (exact) return exact.name;
  const alias = lenders.find((l) => l.zh && l.zh.split(" ").some((z) => z.toLowerCase() === q || z.includes(typed.trim())));
  return alias?.name ?? null;
}

export function LoanForm({ lang, lenders, initial, onSubmit }: Props) {
  const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars);

  const [purpose, setPurpose] = useState<Purpose>(initial?.purpose ?? "OO");
  const [repayment, setRepayment] = useState<Repayment>(initial?.repayment ?? "PI");
  const [rateKind, setRateKind] = useState<RateKind>(initial?.rateKind ?? "V");
  const [balance, setBalance] = useState(initial ? groupAmount(String(initial.balance)) : "");
  const [propertyValue, setPropertyValue] = useState(
    initial ? groupAmount(String(initial.propertyValue)) : "",
  );
  const [lender, setLender] = useState(initial?.lender ?? "");
  const [rate, setRate] = useState(initial ? (initial.rate * 100).toFixed(2) : "");
  const [residency, setResidency] = useState<Residency>(initial?.residency ?? "pr");
  const [income, setIncome] = useState<Income>(initial?.income ?? "payg");
  const [firstHome, setFirstHome] = useState(initial?.firstHome ?? false);
  const [needOffset, setNeedOffset] = useState(initial?.needOffset ?? false);
  const [error, setError] = useState<string | null>(null);

  const balanceNum = parseAmount(balance);
  const valueNum = parseAmount(propertyValue);
  const lvr = balanceNum > 0 && valueNum > 0 ? lvrOf({ balance: balanceNum, propertyValue: valueNum }) : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const rateNum = Number(rate) / 100;
    if (!balanceNum || !valueNum || !(rateNum > 0.01 && rateNum < 0.2)) {
      setError(t("invalid"));
      return;
    }
    if (lvr !== null && lvr > MAX_LVR) {
      setError(t("lvrTooHigh"));
      return;
    }
    setError(null);
    onSubmit({
      purpose,
      repayment,
      rateKind,
      balance: balanceNum,
      propertyValue: valueNum,
      lender: resolveLender(lenders, lender),
      rate: rateNum,
      residency,
      income,
      firstHome,
      needOffset,
    });
  }

  return (
    <form className="card form" onSubmit={submit} noValidate>
      <Segmented
        label={t("residency")}
        value={residency}
        onChange={setResidency}
        options={[
          { value: "pr", label: t("residency.pr") },
          { value: "visa", label: t("residency.visa") },
          { value: "overseas", label: t("residency.overseas") },
        ]}
      />
      <Segmented
        label={t("purpose")}
        value={purpose}
        onChange={setPurpose}
        options={[
          { value: "OO", label: t("purpose.OO") },
          { value: "INV", label: t("purpose.INV") },
        ]}
      />
      <Segmented
        label={t("repayment")}
        value={repayment}
        onChange={setRepayment}
        options={[
          { value: "PI", label: t("repayment.PI") },
          { value: "IO", label: t("repayment.IO") },
        ]}
      />
      <Segmented
        label={t("rateKind")}
        value={rateKind}
        onChange={setRateKind}
        options={RATE_KINDS.map((k) => ({
          value: k,
          label: k === "V" ? t("rateKind.V") : t("rateKind.F", { n: k.slice(1) }),
        }))}
      />

      <div className="row">
        <label className="field">
          <span>{t("balance")}</span>
          <div className="money">
            <input
              inputMode="numeric"
              placeholder="600,000"
              value={balance}
              onChange={(e) => setBalance(groupAmount(e.target.value))}
            />
          </div>
        </label>
        <label className="field">
          <span>{t("propertyValue")}</span>
          <div className="money">
            <input
              inputMode="numeric"
              placeholder="800,000"
              value={propertyValue}
              onChange={(e) => setPropertyValue(groupAmount(e.target.value))}
            />
          </div>
        </label>
      </div>
      {lvr !== null && <p className="hint">{t("lvrIs", { lvr: pct(lvr, 0) })}</p>}

      <label className="field">
        <span>{t("lender")}</span>
        <input
          list="lenders"
          placeholder={t("lenderPlaceholder")}
          value={lender}
          onChange={(e) => setLender(e.target.value)}
        />
        <datalist id="lenders">
          {lenders.map((l) => (
            <option key={l.name} value={l.name} label={l.zh || undefined} />
          ))}
        </datalist>
      </label>

      <label className="field">
        <span>{t("rate")}</span>
        <div className="percent">
          <input
            inputMode="decimal"
            placeholder={t("ratePlaceholder")}
            value={rate}
            onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ""))}
          />
        </div>
      </label>

      <details className="more" open={income === "self" || firstHome || needOffset}>
        <summary>{t("more.title")}</summary>
        <Segmented
          label={t("income")}
          value={income}
          onChange={setIncome}
          options={[
            { value: "payg", label: t("income.payg") },
            { value: "self", label: t("income.self") },
          ]}
        />
        <Segmented
          label={t("firstHome")}
          value={firstHome ? "yes" : "no"}
          onChange={(v) => setFirstHome(v === "yes")}
          options={[
            { value: "no", label: t("no") },
            { value: "yes", label: t("yes") },
          ]}
        />
        <Segmented
          label={t("needOffset")}
          value={needOffset ? "yes" : "no"}
          onChange={(v) => setNeedOffset(v === "yes")}
          options={[
            { value: "no", label: t("needOffset.no") },
            { value: "yes", label: t("needOffset.yes") },
          ]}
        />
      </details>

      {error && <p className="error">{error}</p>}
      <button className="primary" type="submit">
        {t("submit")}
      </button>
    </form>
  );
}
