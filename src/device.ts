// A random id for this browser, kept in localStorage, so one device submits one household.
const DEVICE_KEY = "rate-check.device.v1";

let fallback: string | null = null;

export function deviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    fallback ??= crypto.randomUUID();
    return fallback;
  }
}
