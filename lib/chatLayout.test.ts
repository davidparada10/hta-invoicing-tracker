import { describe, expect, it } from "vitest";
import { MIN_H, MIN_W, clampBox, largeBox, parseStoredBox } from "@/lib/chatLayout";

describe("clampBox", () => {
  it("leaves a box that fits unchanged", () => {
    expect(clampBox({ x: 100, y: 50, w: 400, h: 500 }, 1200, 800)).toEqual({ x: 100, y: 50, w: 400, h: 500 });
  });
  it("enforces the minimum and maximum size", () => {
    const small = clampBox({ x: 0, y: 0, w: 10, h: 10 }, 1200, 800);
    expect([small.w, small.h]).toEqual([MIN_W, MIN_H]);
    const big = clampBox({ x: 0, y: 0, w: 5000, h: 5000 }, 1200, 800);
    expect([big.w, big.h]).toEqual([1200 - 16, 800 - 16]);
  });
  it("keeps the title bar reachable when dragged off screen", () => {
    const off = clampBox({ x: 5000, y: 5000, w: 400, h: 500 }, 1200, 800);
    expect(off.x).toBe(1200 - 80);
    expect(off.y).toBe(800 - 40);
    const left = clampBox({ x: -5000, y: -50, w: 400, h: 500 }, 1200, 800);
    expect(left.x).toBe(80 - 400);
    expect(left.y).toBe(0);
  });
  it("still fits a viewport smaller than the minimum", () => {
    const b = clampBox({ x: 0, y: 0, w: 400, h: 500 }, 300, 300);
    expect(b.w).toBe(MIN_W);
    expect(b.h).toBe(MIN_H);
  });
});

describe("largeBox", () => {
  it("is centered and inside the viewport", () => {
    const b = largeBox(1400, 900);
    expect(b.w).toBe(896);
    expect(b.x).toBe(252);
    expect(b.y + b.h).toBeLessThanOrEqual(900);
  });
});

describe("parseStoredBox", () => {
  it("accepts a saved box and rejects anything else", () => {
    expect(parseStoredBox('{"x":1,"y":2,"w":300,"h":400}')).toEqual({ x: 1, y: 2, w: 300, h: 400 });
    expect(parseStoredBox(null)).toBeNull();
    expect(parseStoredBox("nope")).toBeNull();
    expect(parseStoredBox('{"x":"1","y":2,"w":3,"h":4}')).toBeNull();
    expect(parseStoredBox('{"x":1,"y":2,"w":3}')).toBeNull();
  });
});
