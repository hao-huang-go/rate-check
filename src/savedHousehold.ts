import type { Household } from "./household";
import type { Draft } from "./wizardSteps";

// Kept only in this browser: the last shared household (to come back to its rankings)
// and an unfinished questionnaire.
const SAVED_KEY = "rate-check.household.v1";
const DRAFT_KEY = "rate-check.draft.v1";

export interface SavedHousehold {
  id: string;
  household: Household;
  savedAt: string;
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or blocked storage: things just won't be remembered.
  }
}

export const loadSavedHousehold = () => read<SavedHousehold>(SAVED_KEY);

export function saveHousehold(id: string, household: Household): SavedHousehold {
  const saved = { id, household, savedAt: new Date().toISOString() };
  write(SAVED_KEY, saved);
  return saved;
}

export const loadDraft = () => read<Draft>(DRAFT_KEY);
export const saveDraft = (draft: Draft | null) => write(DRAFT_KEY, draft);
