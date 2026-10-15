import type { LoanProfile } from "./compare";

// Kept only in this browser so a borrower can come back and see their group fill up.
const KEY = "rate-check.submission.v1";

const PROFILE_DEFAULTS: Pick<LoanProfile, "residency" | "income" | "firstHome" | "needOffset"> = {
  residency: "pr",
  income: "payg",
  firstHome: false,
  needOffset: false,
};

export interface SavedSubmission {
  id: string;
  profile: LoanProfile;
  savedAt: string;
}

export function loadSaved(): SavedSubmission | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    // Saved before borrower-profile fields existed, so those may be missing.
    const saved = JSON.parse(raw) as Omit<SavedSubmission, "profile"> & { profile: Partial<LoanProfile> };
    const profile = { ...PROFILE_DEFAULTS, ...saved.profile } as LoanProfile;
    return { ...saved, profile };
  } catch {
    return null;
  }
}

export function saveSubmission(id: string, profile: LoanProfile): SavedSubmission {
  const saved = { id, profile, savedAt: new Date().toISOString() };
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    // Private mode or blocked storage: the result still shows, it just won't be remembered.
  }
  return saved;
}

export function sameProfile(a: LoanProfile, b: LoanProfile): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
