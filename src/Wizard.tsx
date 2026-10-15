import { useEffect, useState } from "react";
import { BALANCE_BANDS } from "./bands";
import { moneyBand, yearsBand } from "./bandLabels";
import type { Lender } from "./benchmark";
import type { RateKind } from "./compare";
import { groupAmount } from "./format";
import {
  EXPERIENCE,
  MAX_MEMBERS,
  MAX_PROPERTIES,
  MONTHLY_BANDS,
  SAVINGS_BANDS,
  STATES,
  VALUE_BANDS,
  type Household,
  type Role,
} from "./household";
import { translate, type Lang, type MessageKey } from "./i18n";
import { groupName, loadOccupations, searchOccupations, type OccupationData } from "./occupations";
import { SearchSelect, type SearchOption } from "./SearchSelect";
import {
  newMember,
  newProperty,
  stepComplete,
  stepsFor,
  toHousehold,
  type Draft,
  type DraftMember,
  type DraftProperty,
  type Step,
} from "./wizardSteps";

interface Props {
  lang: Lang;
  lenders: Lender[];
  draft: Draft;
  onChange: (draft: Draft) => void;
  onFinish: (household: Household, share: boolean) => void;
  busy: boolean;
  error: string | null;
}

const RATE_KINDS: RateKind[] = ["V", "F1", "F2", "F3", "F4", "F5"];

interface ChoiceProps<T extends string> {
  options: { value: T; label: string }[];
  value: T | null;
  onPick: (value: T) => void;
  columns?: boolean;
}

function Choices<T extends string>({ options, value, onPick, columns }: ChoiceProps<T>) {
  return (
    <div className={columns ? "choices columns" : "choices"} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? "on" : ""}
          onClick={() => onPick(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Exact and prefix matches first, so "ING" finds ING before "Darling Downs Bank".
function searchLenders(lenders: Lender[], query: string): SearchOption[] {
  const q = query.trim().toLowerCase();
  const score = (l: Lender) => {
    const name = l.name.toLowerCase();
    if (name === q) return 0;
    if (name.startsWith(q)) return 1;
    if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(name)) return 2;
    if (l.zh && l.zh.toLowerCase().includes(q)) return 3;
    if (name.includes(q)) return 4;
    return null;
  };
  return lenders
    .map((l) => ({ l, s: score(l) }))
    .filter((x): x is { l: Lender; s: number } => x.s !== null)
    .sort((a, b) => a.s - b.s || a.l.name.localeCompare(b.l.name))
    .slice(0, 8)
    .map(({ l }) => ({ value: l.name, label: l.name, hint: l.zh.split(" ")[0] || undefined }));
}

export function Wizard({ lang, lenders, draft, onChange, onFinish, busy, error }: Props) {
  const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
  const [index, setIndex] = useState(0);
  const [occupations, setOccupations] = useState<OccupationData | null>(null);

  const steps = stepsFor(draft);
  const step = steps[Math.min(index, steps.length - 1)];
  const complete = stepComplete(draft, step);

  useEffect(() => {
    if (step.kind === "occupation" && !occupations) loadOccupations().then(setOccupations);
  }, [step.kind, occupations]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [index]);

  const go = (next: number) => setIndex(Math.max(0, Math.min(next, stepsFor(draft).length - 1)));
  const next = () => go(index + 1);

  function updateMember(i: number, patch: Partial<DraftMember>) {
    onChange({ ...draft, members: draft.members.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  }

  function updateProperty(i: number, patch: Partial<DraftProperty>) {
    onChange({ ...draft, properties: draft.properties.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  }

  // Pick a single-choice answer and move on, so tapping is all most steps need.
  function pickAndAdvance(apply: () => Draft) {
    const updated = apply();
    onChange(updated);
    setIndex((i) => Math.min(i + 1, stepsFor(updated).length - 1));
  }

  function addMember(role: Role) {
    const updated = { ...draft, members: [...draft.members, newMember(role)] };
    onChange(updated);
    setIndex(stepsFor(updated).findIndex((s) => s.kind === "occupation" && s.member === updated.members.length - 1));
  }

  function removeMember(i: number) {
    onChange({ ...draft, members: draft.members.filter((_, j) => j !== i) });
    setIndex(stepsFor({ ...draft, members: draft.members.filter((_, j) => j !== i) }).findIndex((s) => s.kind === "moreMembers"));
  }

  function addProperty() {
    const updated = { ...draft, hasProperty: true, properties: [...draft.properties, newProperty()] };
    onChange(updated);
    setIndex(
      stepsFor(updated).findIndex((s) => s.kind === "propertyLender" && s.property === updated.properties.length - 1),
    );
  }

  function removeProperty(i: number) {
    const properties = draft.properties.filter((_, j) => j !== i);
    const updated = { ...draft, properties, hasProperty: properties.length > 0 };
    onChange(updated);
    setIndex(stepsFor(updated).findIndex((s) => s.kind === (properties.length ? "moreProperties" : "hasProperty")));
  }

  const memberTitle = (role: Role, key: "occ" | "exp" | "income") => t(`wz.${key}.${role}`);
  const propertyNumber = (i: number) => (draft.properties.length > 1 ? t("wz.propertyN", { n: i + 1 }) : "");

  function renderStep(s: Step) {
    switch (s.kind) {
      case "residency":
        return (
          <>
            <h2>{t("wz.residency.title")}</h2>
            <p className="wz-label">{t("residency")}</p>
            <Choices
              value={draft.residency}
              onPick={(residency) => onChange({ ...draft, residency })}
              options={[
                { value: "pr", label: t("residency.pr") },
                { value: "visa", label: t("residency.visa") },
                { value: "overseas", label: t("residency.overseas") },
              ]}
            />
            <p className="wz-label">{t("wz.state")}</p>
            <Choices value={draft.state} onPick={(state) => onChange({ ...draft, state })} options={STATES.map((v) => ({ value: v, label: v }))} />
          </>
        );

      case "occupation": {
        const m = draft.members[s.member];
        return (
          <>
            <h2>{memberTitle(m.role, "occ")}</h2>
            <p className="wz-hint">{t("wz.occ.hint")}</p>
            {occupations ? (
              <SearchSelect
                key={s.member}
                id={`occupation-${s.member}`}
                placeholder={t("wz.occ.placeholder")}
                noMatch={t("wz.occ.noMatch")}
                selected={m.occupation ? { value: m.occupation.code, label: m.occupation.title, hint: groupName(occupations, m.occupation.code, lang) } : null}
                search={(q) =>
                  searchOccupations(occupations, q).map((h) => ({
                    value: h.code,
                    label: h.title,
                    hint: [h.matched && h.matched !== h.title ? h.matched : null, groupName(occupations, h.code, lang)].filter(Boolean).join(" · "),
                  }))
                }
                onSelect={(o) => updateMember(s.member, { occupation: o ? { code: o.value, title: o.label } : null })}
              />
            ) : (
              <div className="search-loading" />
            )}
          </>
        );
      }

      case "experience": {
        const m = draft.members[s.member];
        return (
          <>
            <h2>{memberTitle(m.role, "exp")}</h2>
            <Choices
              columns
              value={m.experience}
              options={EXPERIENCE.map((v) => ({ value: v, label: yearsBand(v, lang) }))}
              onPick={(experience) =>
                pickAndAdvance(() => ({ ...draft, members: draft.members.map((x, j) => (j === s.member ? { ...x, experience } : x)) }))
              }
            />
          </>
        );
      }

      case "income": {
        const m = draft.members[s.member];
        return (
          <>
            <h2>{memberTitle(m.role, "income")}</h2>
            <div className="money big-input">
              <input
                id={`income-${s.member}`}
                autoFocus
                inputMode="numeric"
                placeholder="120,000"
                value={m.income}
                onChange={(e) => updateMember(s.member, { income: groupAmount(e.target.value) })}
                onKeyDown={(e) => e.key === "Enter" && complete && next()}
              />
            </div>
            <p className="wz-hint">{t("wz.income.hint")}</p>
          </>
        );
      }

      case "moreMembers":
        return (
          <>
            <h2>{t("wz.more.title")}</h2>
            <ul className="wz-list">
              {draft.members.map((m, i) => (
                <li key={i}>
                  <span>
                    <b>{t(`wz.role.${m.role}`)}</b> · {m.occupation?.title} · ${groupAmount(m.income)}
                  </span>
                  {i > 0 && (
                    <button type="button" className="link" onClick={() => removeMember(i)}>
                      {t("wz.remove")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <div className="choices columns">
              <button type="button" onClick={next}>
                {t("wz.more.done")}
              </button>
              {draft.members.length < MAX_MEMBERS && !draft.members.some((m) => m.role === "partner") && (
                <button type="button" onClick={() => addMember("partner")}>
                  {t("wz.more.partner")}
                </button>
              )}
              {draft.members.length < MAX_MEMBERS && (
                <button type="button" onClick={() => addMember("other")}>
                  {t("wz.more.other")}
                </button>
              )}
            </div>
          </>
        );

      case "hasProperty":
        return (
          <>
            <h2>{t("wz.hasProperty.title")}</h2>
            <div className="choices columns">
              <button
                type="button"
                className={draft.hasProperty ? "on" : ""}
                onClick={() => (draft.properties.length ? pickAndAdvance(() => ({ ...draft, hasProperty: true })) : addProperty())}
              >
                {t("wz.hasProperty.yes")}
              </button>
              <button
                type="button"
                className={draft.hasProperty === false ? "on" : ""}
                onClick={() => {
                  const updated = { ...draft, hasProperty: false, properties: [] };
                  onChange(updated);
                  setIndex(stepsFor(updated).findIndex((x) => x.kind === "savings"));
                }}
              >
                {t("wz.hasProperty.no")}
              </button>
            </div>
          </>
        );

      case "propertyLender": {
        const p = draft.properties[s.property];
        return (
          <>
            <h2>
              {propertyNumber(s.property)}
              {t("wz.prop.lenderTitle")}
            </h2>
            <p className="wz-label">{t("purpose")}</p>
            <Choices
              value={p.purpose}
              onPick={(purpose) => updateProperty(s.property, { purpose })}
              options={[
                { value: "OO", label: t("purpose.OO") },
                { value: "INV", label: t("purpose.INV") },
              ]}
            />
            <p className="wz-label">{t("lender")}</p>
            <SearchSelect
              key={s.property}
              id={`lender-${s.property}`}
              placeholder={t("lenderPlaceholder")}
              noMatch={t("wz.lender.noMatch")}
              selected={p.lender ? { value: p.lender, label: p.lender } : null}
              search={(q) => searchLenders(lenders, q)}
              onSelect={(o) => updateProperty(s.property, { lender: o?.value ?? null, lenderSkipped: false })}
            />
            {!p.lender && (
              <label className="wz-check">
                <input
                  id={`lender-skip-${s.property}`}
                  type="checkbox"
                  checked={p.lenderSkipped}
                  onChange={(e) => updateProperty(s.property, { lenderSkipped: e.target.checked })}
                />
                {t("wz.lender.skip")}
              </label>
            )}
          </>
        );
      }

      case "propertyRate": {
        const p = draft.properties[s.property];
        return (
          <>
            <h2>
              {propertyNumber(s.property)}
              {t("wz.prop.rateTitle")}
            </h2>
            <div className="percent big-input">
              <input
                id={`rate-${s.property}`}
                autoFocus
                inputMode="decimal"
                placeholder={t("ratePlaceholder")}
                value={p.rate}
                onChange={(e) => updateProperty(s.property, { rate: e.target.value.replace(/[^\d.]/g, "") })}
              />
            </div>
            <p className="wz-label">{t("rateKind")}</p>
            <Choices
              value={p.rateKind}
              onPick={(rateKind) => updateProperty(s.property, { rateKind })}
              options={RATE_KINDS.map((k) => ({ value: k, label: k === "V" ? t("rateKind.V") : t("rateKind.F", { n: k.slice(1) }) }))}
            />
            <p className="wz-label">{t("repayment")}</p>
            <Choices
              value={p.repayment}
              onPick={(repayment) => updateProperty(s.property, { repayment })}
              options={[
                { value: "PI", label: t("repayment.PI") },
                { value: "IO", label: t("repayment.IO") },
              ]}
            />
          </>
        );
      }

      case "propertyAmounts": {
        const p = draft.properties[s.property];
        return (
          <>
            <h2>
              {propertyNumber(s.property)}
              {t("wz.prop.amountsTitle")}
            </h2>
            <p className="wz-label">{t("wz.prop.monthly")}</p>
            <Choices value={p.monthly} onPick={(monthly) => updateProperty(s.property, { monthly })} options={MONTHLY_BANDS.map((v) => ({ value: v, label: moneyBand(v, lang) }))} />
            <p className="wz-label">{t("balance")}</p>
            <Choices
              value={p.balanceUnknown ? "unknown" : p.balance}
              onPick={(v) =>
                updateProperty(s.property, v === "unknown" ? { balance: null, balanceUnknown: true } : { balance: v, balanceUnknown: false })
              }
              options={[
                ...BALANCE_BANDS.map((v) => ({ value: v, label: moneyBand(v, lang) })),
                { value: "unknown" as const, label: t("wz.prop.balanceUnknown") },
              ]}
            />
            <p className="wz-label">{t("propertyValue")}</p>
            <Choices value={p.value} onPick={(value) => updateProperty(s.property, { value })} options={VALUE_BANDS.map((v) => ({ value: v, label: moneyBand(v, lang) }))} />
          </>
        );
      }

      case "moreProperties":
        return (
          <>
            <h2>{t("wz.moreProps.title")}</h2>
            <ul className="wz-list">
              {draft.properties.map((p, i) => (
                <li key={i}>
                  <span>
                    <b>{t(p.purpose === "INV" ? "purpose.INV" : "purpose.OO")}</b> · {p.lender ?? "—"} · {p.rate}%
                  </span>
                  <button type="button" className="link" onClick={() => removeProperty(i)}>
                    {t("wz.remove")}
                  </button>
                </li>
              ))}
            </ul>
            <div className="choices columns">
              <button type="button" onClick={next}>
                {t("wz.moreProps.done")}
              </button>
              {draft.properties.length < MAX_PROPERTIES && (
                <button type="button" onClick={addProperty}>
                  {t("wz.moreProps.add")}
                </button>
              )}
            </div>
          </>
        );

      case "savings":
        return (
          <>
            <h2>{t("wz.savings.title")}</h2>
            <p className="wz-hint">{t("wz.savings.hint")}</p>
            <Choices
              columns
              value={draft.savings}
              options={SAVINGS_BANDS.map((v) => ({ value: v, label: moneyBand(v, lang) }))}
              onPick={(savings) => pickAndAdvance(() => ({ ...draft, savings, savingsSkipped: false }))}
            />
            <button type="button" className="ghost" onClick={() => pickAndAdvance(() => ({ ...draft, savings: null, savingsSkipped: true }))}>
              {t("wz.savings.skip")}
            </button>
          </>
        );

      case "review": {
        const household = toHousehold(draft);
        return (
          <>
            <h2>{t("wz.review.title")}</h2>
            <ul className="wz-list">
              {draft.members.map((m, i) => (
                <li key={`m${i}`}>
                  <span>
                    <b>{t(`wz.role.${m.role}`)}</b> · {m.occupation?.title} · {yearsBand(m.experience ?? "0-1", lang)} · ${groupAmount(m.income)}
                  </span>
                </li>
              ))}
              {household.properties.map((p, i) => (
                <li key={`p${i}`}>
                  <span>
                    <b>{t(p.purpose === "INV" ? "purpose.INV" : "purpose.OO")}</b> · {p.lender ?? "—"} · {(p.rate * 100).toFixed(2)}% · {t("wz.review.monthly", { amount: moneyBand(p.monthly, lang) })}
                  </span>
                </li>
              ))}
              <li>
                <span>
                  <b>{t("wz.review.savings")}</b> · {household.savings ? moneyBand(household.savings, lang) : t("wz.review.skipped")}
                </span>
              </li>
            </ul>
            {error && <p className="error">{error}</p>}
            <button className="primary" disabled={busy} onClick={() => onFinish(household, true)}>
              {busy ? t("share.busy") : t("wz.review.share")}
            </button>
            <p className="note">{t("wz.review.privacy")}</p>
            {household.properties.length > 0 && (
              <button className="ghost" disabled={busy} onClick={() => onFinish(household, false)}>
                {t("wz.review.noShare")}
              </button>
            )}
          </>
        );
      }
    }
  }

  const showContinue = !["experience", "moreMembers", "hasProperty", "moreProperties", "savings", "review"].includes(step.kind);

  return (
    <div className="wizard card">
      <div className="wz-progress" aria-hidden="true">
        <div style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
      </div>
      <p className="wz-step">{t("wz.step", { n: index + 1, total: steps.length })}</p>
      <div className="wz-body">{renderStep(step)}</div>
      <div className="wz-nav">
        {index > 0 && (
          <button type="button" className="ghost" onClick={() => go(index - 1)}>
            {t("wz.back")}
          </button>
        )}
        {showContinue && (
          <button type="button" className="primary" disabled={!complete} onClick={next}>
            {t("wz.continue")}
          </button>
        )}
      </div>
    </div>
  );
}
