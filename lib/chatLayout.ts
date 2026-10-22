// Position and size of the floating chat window once the user has moved or
// resized it. Pure so the clamping rules are unit-tested: the window must
// always stay reachable (its title bar on screen) and never exceed the viewport.

export interface ChatBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MIN_W = 288; // 18rem
export const MIN_H = 320; // 20rem
const MARGIN = 8;
const KEEP_VISIBLE = 80; // px of the title bar that must stay on screen horizontally

export function clampBox(box: ChatBox, vw: number, vh: number): ChatBox {
  const maxW = Math.max(MIN_W, vw - MARGIN * 2);
  const maxH = Math.max(MIN_H, vh - MARGIN * 2);
  const w = Math.min(Math.max(box.w, MIN_W), maxW);
  const h = Math.min(Math.max(box.h, MIN_H), maxH);
  const x = Math.min(Math.max(box.x, KEEP_VISIBLE - w), vw - KEEP_VISIBLE);
  const y = Math.min(Math.max(box.y, 0), vh - 40);
  return { x, y, w, h };
}

// A large preset for reading wide tables: most of the window, centered.
export function largeBox(vw: number, vh: number): ChatBox {
  const w = Math.min(896, vw - MARGIN * 2);
  const h = Math.round(vh * 0.85);
  return clampBox({ x: Math.round((vw - w) / 2), y: Math.round((vh - h) / 2), w, h }, vw, vh);
}

export function parseStoredBox(raw: string | null): ChatBox | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    const nums = [v.x, v.y, v.w, v.h];
    if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
    return { x: v.x as number, y: v.y as number, w: v.w as number, h: v.h as number };
  } catch {
    return null;
  }
}
