// Pure, client-safe aging helpers — kept out of lib/data.ts (which pulls in
// the server-only Supabase client) so components that need this can stay
// "use client" without bundling server code.

import { badgeCard, badgeTone } from "@/lib/badgeTone";
import { parseLocalDate } from "@/lib/format";

export type AgingBucket = "current" | "31-60" | "61-90" | "90+";

export function daysOpen(referenceDateISO: string, now: Date = new Date()): number {
  const ref = parseLocalDate(referenceDateISO);
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
  current: badgeTone("emerald"),
  "31-60": badgeTone("amber"),
  "61-90": badgeTone("orange"),
  "90+": badgeTone("red"),
};

/** Filter cards above the open-draws table — same hue as the age chips, stronger when selected. */
export const AGING_BUCKET_CARD_STYLE: Record<AgingBucket, { idle: string; selected: string }> = {
  current: { idle: badgeCard("emerald"), selected: badgeCard("emerald", true) },
  "31-60": { idle: badgeCard("amber"), selected: badgeCard("amber", true) },
  "61-90": { idle: badgeCard("orange"), selected: badgeCard("orange", true) },
  "90+": { idle: badgeCard("red"), selected: badgeCard("red", true) },
};
