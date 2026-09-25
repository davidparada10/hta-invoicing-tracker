import { describe, expect, it } from "vitest";
import { computeRetentionRelease, isImplausibleRetainage } from "@/lib/retentionRelease";

function draw(id: string, retainage: number, status: "draft" | "submitted" | "approved" | "paid" = "paid") {
  return { id, status, retainage_held: retainage };
}

describe("computeRetentionRelease", () => {
  it("sums retention held across other posted draws", () => {
    const draws = [draw("d1", 5000), draw("d2", 3000), draw("editing", 1000)];
    const result = computeRetentionRelease(draws, "editing");
    expect(result.retentionHeldToDate).toBe(8000);
    expect(result.releaseAmount).toBe(-8000);
    expect(result.isInconsistent).toBe(false);
  });

  it("excludes another draft draw's retainage from the release amount", () => {
    const posted = [draw("d1", 5000), draw("d2", 3000)];
    const withoutDraft = computeRetentionRelease(posted, "editing");

    const withDraft = computeRetentionRelease(
      [...posted, draw("draft-draw", 999999, "draft")],
      "editing"
    );

    expect(withDraft.retentionHeldToDate).toBe(withoutDraft.retentionHeldToDate);
    expect(withDraft.releaseAmount).toBe(withoutDraft.releaseAmount);
  });

  it("creating a new draft (not yet saved as an id in the list) cannot change the release amount either", () => {
    const before = computeRetentionRelease([draw("d1", 5000), draw("d2", 3000)], "editing");
    const after = computeRetentionRelease(
      [draw("d1", 5000), draw("d2", 3000), draw("new-draft", 250000, "draft")],
      "editing"
    );
    expect(after.releaseAmount).toBe(before.releaseAmount);
  });

  it("nets in a prior posted release so the same retention can't be released twice", () => {
    // d1/d2 held $8k total; a prior draw already released all of it (-8000).
    const draws = [draw("d1", 5000), draw("d2", 3000), draw("prior-release", -8000)];
    const result = computeRetentionRelease(draws, "editing");
    expect(result.retentionHeldToDate).toBe(0);
    expect(result.releaseAmount).toBe(0);
    expect(result.isInconsistent).toBe(false);
  });

  it("does not flip an already-negative balance into a new positive withholding", () => {
    // A prior release over-released by $1,000 relative to what was ever held.
    const draws = [draw("d1", 5000), draw("prior-release", -6000)];
    const result = computeRetentionRelease(draws, "editing");
    expect(result.retentionHeldToDate).toBe(-1000);
    expect(result.releaseAmount).toBe(0);
    expect(result.isInconsistent).toBe(true);
  });

  it("excludes the draw currently being edited from its own release calculation", () => {
    const draws = [draw("editing", 999999), draw("d1", 5000)];
    const result = computeRetentionRelease(draws, "editing");
    expect(result.retentionHeldToDate).toBe(5000);
  });
});

describe("isImplausibleRetainage", () => {
  it("flags a parsed retainage well above normal 0/5/10% rates as likely cumulative", () => {
    // $30k retainage on a $100k draw (30%) is far above any real single-draw rate.
    expect(isImplausibleRetainage(30000, 100000)).toBe(true);
  });

  it("does not flag a normal retention amount", () => {
    expect(isImplausibleRetainage(5000, 100000)).toBe(false); // 5%
    expect(isImplausibleRetainage(10000, 100000)).toBe(false); // 10%
  });

  it("does not flag anything when there's no billed amount to compare against", () => {
    expect(isImplausibleRetainage(5000, 0)).toBe(false);
  });
});
