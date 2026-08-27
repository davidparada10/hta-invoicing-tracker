import { DrawStatus, ProjectStatus } from "@/lib/types";

export type BadgeTone = "emerald" | "amber" | "orange" | "red" | "sky" | "slate";

/** Chip fill mixed onto a dark surface so light and dark look the same. */
export function badgeTone(tone: BadgeTone): string {
  return `tone-chip tone-${tone}`;
}

/** Larger filter-card fill — same hues as badgeTone. */
export function badgeCard(tone: BadgeTone, selected = false): string {
  return selected ? `tone-card tone-${tone} tone-card-selected` : `tone-card tone-${tone}`;
}

export const STATUS_STYLES: Record<DrawStatus, string> = {
  draft: badgeTone("slate"),
  submitted: badgeTone("sky"),
  approved: badgeTone("amber"),
  paid: badgeTone("emerald"),
};

export const PROJECT_STATUS_STYLES: Record<ProjectStatus, string> = {
  active: badgeTone("emerald"),
  closed: badgeTone("slate"),
};
