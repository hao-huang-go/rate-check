export function pct(rate: number, digits = 2): string {
  return `${(rate * 100).toFixed(digits)}%`;
}

export function aud(amount: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(Math.round(amount / 10) * 10);
}

export function parseAmount(text: string): number {
  const n = Number(text.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function groupAmount(text: string): string {
  const digits = text.replace(/\D/g, "");
  return digits ? Number(digits).toLocaleString("en-AU") : "";
}
