import { extractPdfText } from "@/lib/g702-parser";

// Some lenders (e.g. Conventus, via their "SwiftDraws" portal) export a draw
// request as a PDF with its own table layout — not an AIA G702/G703. Columns:
// ITEM #, DESCRIPTION OF WORK, REVISED SCHEDULED VALUE, TOTAL DISBURSED,
// BALANCE TO FINISH, REQUESTED VALUE, APPROVED VALUES, APPROVED LESS
// RETAINAGE, IMPROVEMENT INDICATOR. pdf-parse linearizes the table into one
// text line per physical PDF text run, so a row's cells are split across
// several lines whenever its description wraps.

export interface ParsedLenderAllocation {
  item_number: string;
  description: string;
  requested_value: number;
}

export interface ParsedLenderDraw {
  draw_number?: number;
  period_end?: string;
  amount_requested?: number;
  amount_approved?: number;
  retainage_held?: number;
  allocations: ParsedLenderAllocation[];
}

export function isLenderPortalPdfText(text: string): boolean {
  return /ITEM\s*#/i.test(text) && /REVISED/i.test(text) && /SCHEDULED/i.test(text) && /TOTALS/i.test(text);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseAmountToken(token: string): number | null {
  const m = /^\$?([\d,]+\.\d{2})$/.exec(token.trim());
  if (!m) return null;
  return Number(m[1].replace(/,/g, ""));
}

function isPercentToken(token: string): boolean {
  return /^[\d.]+%$/.test(token.trim());
}

function isRetainageNoteToken(token: string): boolean {
  return /retainage/i.test(token);
}

function toISODateFromSlash(s: string): string | undefined {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s.trim());
  if (!m) return undefined;
  const [, mo, d, y] = m;
  const year = y.length === 2 ? `20${y}` : y;
  const date = new Date(Number(year), Number(mo) - 1, Number(d));
  if (isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10);
}

interface ParsedRow {
  item_number: string;
  description: string;
  numbers: number[]; // [revised, disbursed, balance, requested, approved, approvedLessRetainage]
}

function parseRow(lines: string[], start: number, end: number): ParsedRow {
  const startMatch = /^(\d+)\s*\t(.*)$/.exec(lines[start]);
  const item_number = startMatch ? startMatch[1] : "";
  const firstLineRest = startMatch ? startMatch[2] : lines[start];

  const descParts: string[] = [];
  const numbers: number[] = [];
  let descriptionDone = false;

  const cellsForLine = (line: string, isFirst: boolean) =>
    (isFirst ? firstLineRest : line).split("\t").map((c) => c.trim()).filter(Boolean);

  for (let li = start; li < end && numbers.length < 6; li++) {
    const cells = cellsForLine(lines[li], li === start);
    for (const cell of cells) {
      if (numbers.length >= 6) break;
      if (isPercentToken(cell) || isRetainageNoteToken(cell)) continue;
      const amt = parseAmountToken(cell);
      if (amt !== null) {
        numbers.push(amt);
        descriptionDone = true;
        continue;
      }
      if (!descriptionDone) descParts.push(cell);
    }
  }

  const description = descParts
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*$/, "")
    .trim();

  return { item_number, description, numbers };
}

export async function parseLenderDrawFromPdf(buffer: Buffer): Promise<ParsedLenderDraw> {
  const text = await extractPdfText(buffer);
  const lines = text.split("\n").map((l) => l.trim());

  let draw_number: number | undefined;
  let period_end: string | undefined;
  for (const line of lines) {
    const drawMatch = /Draw\s+Request\s+(\d+)/i.exec(line);
    if (drawMatch) draw_number = Number(drawMatch[1]);
    const dateMatch = /Effective\s+on\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i.exec(line);
    if (dateMatch) period_end = toISODateFromSlash(dateMatch[1]);
  }

  const totalsIdx = lines.findIndex((l) => /^TOTALS\b/i.test(l));
  if (totalsIdx === -1) {
    throw new Error(
      "Could not find a TOTALS row in this file — it doesn't look like a recognized lender draw export."
    );
  }

  const rowStarts: number[] = [];
  for (let i = 0; i < totalsIdx; i++) {
    if (/^\d+\s*\t/.test(lines[i])) rowStarts.push(i);
  }
  if (rowStarts.length === 0) {
    throw new Error("Could not find any line items in this file.");
  }

  const rows = rowStarts.map((start, i) => {
    const end = i + 1 < rowStarts.length ? rowStarts[i + 1] : totalsIdx;
    return parseRow(lines, start, end);
  });

  const incompleteRows = rows.filter((r) => r.numbers.length < 6);
  if (incompleteRows.length > 0) {
    throw new Error(
      `Could not fully read ${incompleteRows.length} line item(s) in this file (expected 6 amounts per row, e.g. item ${incompleteRows[0].item_number}). Enter this draw's numbers manually instead.`
    );
  }

  const totalsAmounts = lines[totalsIdx]
    .split("\t")
    .map((c) => c.trim())
    .filter(Boolean)
    .map(parseAmountToken)
    .filter((n): n is number => n !== null);
  // TOTALS row: revised, disbursed, balance, requested, approved, approvedLessRetainage
  if (totalsAmounts.length < 6) {
    throw new Error("Could not read the TOTALS row's amounts in this file.");
  }
  const [, , , totalsRequested, totalsApproved, totalsApprovedLessRetainage] = totalsAmounts;

  const sumRequested = round2(rows.reduce((acc, r) => acc + r.numbers[3], 0));
  const sumApproved = round2(rows.reduce((acc, r) => acc + r.numbers[4], 0));

  if (Math.abs(sumRequested - totalsRequested) > 0.02 || Math.abs(sumApproved - totalsApproved) > 0.02) {
    throw new Error(
      `The line items in this file don't add up to its own TOTALS row (requested: parsed ${sumRequested} vs file's ${totalsRequested}). Something in this file's layout wasn't read correctly — enter this draw's numbers manually instead of trusting this import.`
    );
  }

  const retainage_held = round2(totalsApproved - totalsApprovedLessRetainage);

  const allocations: ParsedLenderAllocation[] = rows
    .filter((r) => r.numbers[3] !== 0)
    .map((r) => ({
      item_number: r.item_number,
      description: r.description,
      requested_value: round2(r.numbers[3]),
    }));

  return {
    draw_number,
    period_end,
    amount_requested: round2(totalsRequested),
    amount_approved: round2(totalsApproved),
    retainage_held,
    allocations,
  };
}
