export function formatCurrency(value: number | null | undefined): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

// Whole-dollar, sign-preserving — for a compact subline where exact cents
// would just be noise (the precise figure stays available via a tooltip or
// the project detail page).
export function formatCurrencyRounded(value: number | null | undefined): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
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

// HTA's own business timezone — draw cadences, "today" stamps, and
// aging/billing year/quarter boundaries all need to agree on HTA's actual
// wall-clock date. The server process's own timezone can't be trusted for
// this: Vercel's Node runtime defaults to UTC, which is already "tomorrow"
// for several hours every Pacific evening — confirmed live: a draw marked
// submitted at 6pm PT on Sep 30 got stamped date_submitted = 2026-10-01
// because `new Date().toISOString()` read the UTC calendar date instead.
const BUSINESS_TIMEZONE = "America/Los_Angeles";

/** "YYYY-MM-DD" for the given instant (default: now) in HTA's own timezone. */
export function businessTodayISO(instant: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Local-midnight Date for the given instant's business-timezone calendar day. */
export function businessToday(instant: Date = new Date()): Date {
  return parseLocalDate(businessTodayISO(instant));
}

// UTC-anchored calendar-day timestamp for a bare "YYYY-MM-DD" string, or
// (via businessTodayISO) for a full timestamp like created_at — the same
// resolution "now" itself gets. Date.UTC has no DST, so diffing two of
// these is always exact, unlike dividing elapsed milliseconds by 24h, which
// undercounts a span that crosses a DST transition in the runtime's own
// timezone.
function calendarDayTimestamp(value: string): number {
  const iso = value.length <= 10 ? value : businessTodayISO(new Date(value));
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

// Same, but for a Date that's already a resolved calendar day (e.g. from
// businessToday() or parseLocalDate(dateOnlyString)) — reads its components
// directly rather than re-running it through businessTodayISO, which would
// double-convert and could shift the date by a day depending on the
// runtime's own timezone.
function calendarDayTimestampOfDate(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Whole calendar days from `aISO` to `b`, independent of the server/
 * browser's runtime timezone and immune to DST. `aISO` may be a bare date
 * or a full timestamp; `b` is a resolved calendar-date Date. Not clamped —
 * callers that want "never negative" (like daysOpen) clamp explicitly.
 */
export function calendarDaysBetween(aISO: string, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((calendarDayTimestampOfDate(b) - calendarDayTimestamp(aISO)) / msPerDay);
}
