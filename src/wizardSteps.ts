import type { BalanceBand, OffsetBand } from "./bands";
import type { Purpose, RateKind, Repayment, Residency } from "./compare";
import type { AgeBand, AuState, Experience, Household, MonthlyBand, Role, SavingsBand, ValueBand } from "./household";
import { grossFromAfterTax } from "./tax";

export interface DraftMember {
  role: Role;
  occupation: { code: string; title: string } | null;
  experience: Experience | null;
  income: string; // as typed, digits with separators
  incomeIsAfterTax: boolean;
}

export interface DraftProperty {
  purpose: Purpose | null;
  lender: string | null;
  lenderSkipped: boolean;
  rate: string; // as typed, percent
  rateKind: RateKind;
  repayment: Repayment;
  monthly: MonthlyBand | null;
  balance: BalanceBand | null;
  balanceUnknown: boolean;
  offset: OffsetBand | null;
  interest: string; // as typed, AUD/month; blank to use the estimate
  value: ValueBand | null;
}

export interface Draft {
  residency: Residency | null;
  state: AuState | null;
  age: AgeBand | null;
  members: DraftMember[];
  hasProperty: boolean | null;
  properties: DraftProperty[];
  savings: SavingsBand | null;
  savingsSkipped: boolean;
}

export type Step =
  | { kind: "residency" }
  | { kind: "occupation"; member: number }
  | { kind: "experience"; member: number }
  | { kind: "income"; member: number }
  | { kind: "moreMembers" }
  | { kind: "hasProperty" }
  | { kind: "propertyLender"; property: number }
  | { kind: "propertyRate"; property: number }
  | { kind: "propertyAmounts"; property: number }
  | { kind: "moreProperties" }
  | { kind: "savings" }
  | { kind: "review" };

export const newMember = (role: Role): DraftMember => ({
  role,
  occupation: null,
  experience: null,
  income: "",
  incomeIsAfterTax: false,
});

export const newProperty = (purpose: Purpose | null = null): DraftProperty => ({
  purpose,
  lender: null,
  lenderSkipped: false,
  rate: "",
  rateKind: "V",
  repayment: "PI",
  monthly: null,
  balance: null,
  balanceUnknown: false,
  offset: null,
  interest: "",
  value: null,
});

export const emptyDraft = (): Draft => ({
  residency: null,
  state: null,
  age: null,
  members: [newMember("self")],
  hasProperty: null,
  properties: [],
  savings: null,
  savingsSkipped: false,
});

// The step list is derived from the answers so far: adding a partner or a second property
// inserts its steps right where they belong, and the progress bar follows.
export function stepsFor(draft: Draft): Step[] {
  const steps: Step[] = [{ kind: "residency" }];
  draft.members.forEach((_, member) => {
    steps.push({ kind: "occupation", member }, { kind: "experience", member }, { kind: "income", member });
  });
  steps.push({ kind: "moreMembers" }, { kind: "hasProperty" });
  draft.properties.forEach((_, property) => {
    steps.push(
      { kind: "propertyLender", property },
      { kind: "propertyRate", property },
      { kind: "propertyAmounts", property },
    );
  });
  if (draft.properties.length) steps.push({ kind: "moreProperties" });
  steps.push({ kind: "savings" }, { kind: "review" });
  return steps;
}

export const parseNumber = (text: string) => Number(text.replace(/[^\d.]/g, "")) || 0;

const MIN_INCOME = 0;
const MAX_INCOME = 5_000_000;

export function stepComplete(draft: Draft, step: Step): boolean {
  switch (step.kind) {
    case "residency":
      return draft.residency !== null && draft.state !== null && draft.age !== null;
    case "occupation":
      return draft.members[step.member].occupation !== null;
    case "experience":
      return draft.members[step.member].experience !== null;
    case "income": {
      const income = parseNumber(draft.members[step.member].income);
      return draft.members[step.member].income.trim() !== "" && income >= MIN_INCOME && income <= MAX_INCOME;
    }
    case "propertyLender": {
      const p = draft.properties[step.property];
      return p.purpose !== null && (p.lender !== null || p.lenderSkipped);
    }
    case "propertyRate": {
      const rate = parseNumber(draft.properties[step.property].rate) / 100;
      return rate >= 0.02 && rate <= 0.15;
    }
    case "propertyAmounts": {
      const p = draft.properties[step.property];
      return p.monthly !== null && (p.balance !== null || p.balanceUnknown) && p.value !== null;
    }
    case "savings":
      return draft.savings !== null || draft.savingsSkipped;
    default:
      return true;
  }
}

// Only called once every step is complete.
// The income a member entered, as base salary before tax.
export function grossIncome(m: Pick<DraftMember, "income" | "incomeIsAfterTax">): number {
  const entered = parseNumber(m.income);
  return m.incomeIsAfterTax ? grossFromAfterTax(entered) : entered;
}

export function toHousehold(draft: Draft): Household {
  return {
    residency: draft.residency!,
    state: draft.state!,
    age: draft.age!,
    members: draft.members.map((m) => ({
      role: m.role,
      occupation: m.occupation!.code,
      experience: m.experience!,
      income: grossIncome(m),
    })),
    properties: draft.hasProperty
      ? draft.properties.map((p) => ({
          purpose: p.purpose!,
          lender: p.lender,
          rate: Math.round(parseNumber(p.rate) * 1000) / 100_000,
          rateKind: p.rateKind,
          repayment: p.repayment,
          monthly: p.monthly!,
          balance: p.balanceUnknown ? null : p.balance,
          offset: p.offset ?? null,
          interest: parseNumber(p.interest ?? "") || null,
          value: p.value!,
        }))
      : [],
    savings: draft.savingsSkipped ? null : draft.savings,
  };
}
