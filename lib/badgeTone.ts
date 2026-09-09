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

/** Plain colored text, no chip fill/ring — for a status word or age figure
    sitting in a table row rather than a standalone badge. */
export function badgeText(tone: BadgeTone): string {
  return `tone-text tone-${tone}`;
}

export const STATUS_STYLES: Record<DrawStatus, string> = {
  draft: badgeTone("slate"),
  submitted: badgeTone("sky"),
  approved: badgeTone("amber"),
  paid: badgeTone("emerald"),
};

/** Plain colored text — same hues as STATUS_STYLES, for a status word
    sitting directly in a table row rather than a standalone pill. */
export const STATUS_TEXT_STYLES: Record<DrawStatus, string> = {
  draft: badgeText("slate"),
  submitted: badgeText("sky"),
  approved: badgeText("amber"),
  paid: badgeText("emerald"),
};

export const PROJECT_STATUS_STYLES: Record<ProjectStatus, string> = {
  active: badgeTone("emerald"),
  closed: badgeTone("slate"),
};

/** Plain colored text — same hues as PROJECT_STATUS_STYLES. */
export const PROJECT_STATUS_TEXT_STYLES: Record<ProjectStatus, string> = {
  active: badgeText("emerald"),
  closed: badgeText("slate"),
};
