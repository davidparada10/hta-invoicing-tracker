// Pure, client-safe aging helpers — kept out of lib/data.ts (which pulls in
// the server-only Supabase client) so components that need this can stay
// "use client" without bundling server code.

export type AgingBucket = "current" | "31-60" | "61-90" | "90+";

export function daysOpen(referenceDateISO: string, now: Date = new Date()): number {
  const ref = new Date(referenceDateISO);
  const diffMs = now.getTime() - ref.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export function agingBucket(days: number): AgingBucket {
  if (days > 90) return "90+";
  if (days > 60) return "61-90";
  if (days > 30) return "31-60";
  return "current";
}

export const AGING_BUCKETS: AgingBucket[] = ["current", "31-60", "61-90", "90+"];

export const AGING_BUCKET_LABEL: Record<AgingBucket, string> = {
  current: "0–30 days",
  "31-60": "31–60 days",
  "61-90": "61–90 days",
  "90+": "90+ days",
};

export const AGING_BUCKET_BADGE_STYLE: Record<AgingBucket, string> = {
  current: "bg-emerald-100 text-emerald-700",
  "31-60": "bg-amber-100 text-amber-700",
  "61-90": "bg-orange-100 text-orange-700",
  "90+": "bg-red-100 text-red-700",
};
