export function formatCurrency(value: number | null | undefined): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

export function formatCurrencyCompact(value: number | null | undefined): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value ?? 0);
}

// Bare "YYYY-MM-DD" strings (no timezone) parse as UTC midnight, which
// shifts to the previous day — and near a month boundary, the previous
// month — in any timezone behind UTC. Appending a local time forces
// local-midnight parsing instead. Full timestamps (already carrying their
// own offset, e.g. created_at) are passed through unchanged.
export function parseLocalDate(value: string): Date {
  return new Date(value.length <= 10 ? `${value}T00:00:00` : value);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return parseLocalDate(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDaysToPay(days: number | null | undefined): string {
  if (days == null) return "—";
  return `${days} day${days === 1 ? "" : "s"}`;
}
