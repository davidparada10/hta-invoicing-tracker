import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseG702FromXlsx } from "@/lib/g702-parser";

function book(rows: unknown[][]): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "G702");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("parseG702FromXlsx amount requested", () => {
  it("uses current payment due on an ordinary application", () => {
    const r = parseG702FromXlsx(book([["8.", "CURRENT PAYMENT DUE", null, null, null, null, 147913.98]]));
    expect(r.amount_requested).toBe(147913.98);
  });

  it("uses the total current amount due when retainage is released in the same application", () => {
    const r = parseG702FromXlsx(
      book([
        ["8.", "CURRENT PAYMENT DUE", null, null, null, null, 147913.98],
        [null, "CURRENT RETENTION RELEASE", null, null, null, null, 294578.23],
        [null, "TOTAL CURRENT AMOUNT DUE", null, null, null, null, 442492.21],
      ])
    );
    expect(r.amount_requested).toBe(442492.21);
  });
});
