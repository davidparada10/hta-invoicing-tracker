import * as XLSX from "xlsx";

// pdfjs-dist (used internally by pdf-parse) references the browser-only
// DOMMatrix API even for plain text extraction. Node has no such global,
// so polyfill it before pdf-parse loads — otherwise every PDF upload
// fails in Vercel's serverless runtime with "DOMMatrix is not defined".
// Static `import` is hoisted above this regardless of source order, so
// both the polyfill assignment and the pdf-parse load use `require` to
// guarantee they run in this exact sequence.
if (typeof (globalThis as { DOMMatrix?: unknown }).DOMMatrix === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (globalThis as { DOMMatrix?: unknown }).DOMMatrix = require("dommatrix");
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFParse } = require("pdf-parse") as typeof import("pdf-parse");

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const parsed = await parser.getText();
    return parsed.text;
  } finally {
    await parser.destroy();
  }
}

export interface ParsedG702Draw {
  draw_number?: number;
  period_end?: string;
  date_submitted?: string;
  amount_requested?: number;
  amount_approved?: number;
  retainage_held?: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[$,]/g, "").trim());
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function toISODate(v: unknown): string | undefined {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "string") {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return undefined;
}

type Grid = unknown[][];

function findLabelCell(grid: Grid, regex: RegExp): { row: number; col: number } | null {
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      if (typeof row[c] === "string" && regex.test(row[c] as string)) {
        return { row: r, col: c };
      }
    }
  }
  return null;
}

function findValueNear(
  grid: Grid,
  from: { row: number; col: number },
  predicate: (v: unknown) => boolean,
  extraRows = 1
): unknown {
  for (let r = from.row; r <= from.row + extraRows && r < grid.length; r++) {
    const row = grid[r] ?? [];
    const startCol = r === from.row ? from.col + 1 : 0;
    for (let c = startCol; c < row.length; c++) {
      if (predicate(row[c])) return row[c];
    }
  }
  return undefined;
}

export function parseG702FromXlsx(buffer: Buffer): ParsedG702Draw {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames.find((n) => /g702/i.test(n)) ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as Grid;

  const result: ParsedG702Draw = {};

  const appNoCell = findLabelCell(grid, /APPLICATION\s+NO/i);
  if (appNoCell) {
    const v = findValueNear(grid, appNoCell, (x) => typeof x === "number");
    const n = toNumber(v);
    if (n !== undefined) result.draw_number = Math.round(n);
  }

  const periodCell = findLabelCell(grid, /PERIOD\s+TO/i);
  if (periodCell) {
    const v = findValueNear(grid, periodCell, (x) => x instanceof Date || typeof x === "string");
    const d = toISODate(v);
    if (d) result.period_end = d;
  }

  const appDateCell = findLabelCell(grid, /APPLICATION\s+DATE/i);
  if (appDateCell) {
    const v = findValueNear(grid, appDateCell, (x) => x instanceof Date || typeof x === "string");
    const d = toISODate(v);
    if (d) result.date_submitted = d;
  }

  const paymentDueCell = findLabelCell(grid, /CURRENT PAYMENT DUE/i);
  if (paymentDueCell) {
    const v = findValueNear(grid, paymentDueCell, (x) => typeof x === "number");
    const n = toNumber(v);
    if (n !== undefined) result.amount_requested = round2(n);
  }

  const retainageCell = findLabelCell(grid, /Total Retainage/i);
  if (retainageCell) {
    const v = findValueNear(grid, retainageCell, (x) => typeof x === "number", 2);
    const n = toNumber(v);
    if (n !== undefined) result.retainage_held = round2(n);
  }

  return result;
}

function extractNear(
  text: string,
  label: RegExp,
  valuePattern: RegExp,
  window: number
): string | undefined {
  const m = label.exec(text);
  if (!m) return undefined;
  const start = m.index + m[0].length;
  const slice = text.slice(start, start + window);
  const v = valuePattern.exec(slice);
  return v ? v[0] : undefined;
}

const DATE_PATTERN = /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/;
// Requires a leading $ so bare line-reference numbers in label text
// (e.g. "Total Retainage (Line 5a + 5b ...)") aren't mistaken for the amount.
const MONEY_PATTERN = /\$\s*[\d,]+(?:\.\d{2})?/;

export async function parseG702FromPdf(buffer: Buffer): Promise<ParsedG702Draw> {
  const text = await extractPdfText(buffer);

  const result: ParsedG702Draw = {};

  const appNo = extractNear(text, /APPLICATION\s+NO\.?:?/i, /\d+/, 40);
  if (appNo) {
    const n = toNumber(appNo);
    if (n !== undefined) result.draw_number = Math.round(n);
  }

  const periodTo = extractNear(text, /PERIOD\s+TO:?/i, DATE_PATTERN, 40);
  const periodDate = periodTo ? toISODate(periodTo) : undefined;
  if (periodDate) result.period_end = periodDate;

  const appDate = extractNear(text, /APPLICATION\s+DATE:?/i, DATE_PATTERN, 40);
  const appDateIso = appDate ? toISODate(appDate) : undefined;
  if (appDateIso) result.date_submitted = appDateIso;

  const paymentDue = extractNear(text, /CURRENT PAYMENT DUE/i, MONEY_PATTERN, 80);
  const paymentNum = paymentDue ? toNumber(paymentDue) : undefined;
  if (paymentNum !== undefined) result.amount_requested = round2(paymentNum);

  const retainage = extractNear(text, /Total Retainage/i, MONEY_PATTERN, 120);
  const retainageNum = retainage ? toNumber(retainage) : undefined;
  if (retainageNum !== undefined) result.retainage_held = round2(retainageNum);

  return result;
}

export interface ParsedBudgetLine {
  item_number: string | null;
  category: string | null;
  description: string;
  scheduled_value: number;
}

export interface ParsedDrawAllocationLine {
  item_number: string;
  description: string;
  amount_this_period: number;
}

interface ScannedG703Row {
  item_number: string;
  category: string | null;
  description: string;
  scheduled_value: number;
  amount_this_period: number | undefined;
}

const STOP_LABEL = /^SUBTOTAL|^TOTAL\b|^CO\s*RECAP|^CO#\d/i;

function scanG703Rows(buffer: Buffer): ScannedG703Row[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName =
    wb.SheetNames.find((n) => /g703/i.test(n)) ??
    wb.SheetNames.find((n) => /csi/i.test(n)) ??
    wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as Grid;

  let headerRow = -1;
  let descCol = -1;
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const c = row.findIndex((v) => typeof v === "string" && /DESCRIPTION\s+OF\s+WORK/i.test(v));
    if (c !== -1) {
      headerRow = r;
      descCol = c;
      break;
    }
  }

  if (headerRow === -1) return [];

  const itemCol = descCol > 0 ? descCol - 1 : 0;
  const headerCells = grid[headerRow] ?? [];
  let scheduledCol = headerCells.findIndex(
    (v) => typeof v === "string" && /REVISED/i.test(v) && /(CONTRACT|AMT|AMOUNT)/i.test(v)
  );
  if (scheduledCol === -1) {
    scheduledCol = headerCells.findIndex((v) => typeof v === "string" && /SCHEDULE/i.test(v));
  }
  if (scheduledCol === -1) scheduledCol = descCol + 1;

  // "THIS PERIOD" identifies the work-completed-this-period column, but some
  // templates also use the phrase inside a retainage column header (e.g.
  // "RET. HELD THIS PERIOD") one row up, and split "WORK COMPLETED" into
  // "PREVIOUS APPLICATION" / "THIS PERIOD" sub-headers on the row below the
  // main header. Require an exact match (not merely containing the phrase)
  // and check the sub-header row first so the retainage column is never hit.
  const isExactThisPeriod = (v: unknown) => typeof v === "string" && /^this\s+period\.?$/i.test(v.trim());
  const subHeaderCells = grid[headerRow + 1] ?? [];
  let thisPeriodCol = subHeaderCells.findIndex(isExactThisPeriod);
  if (thisPeriodCol === -1) {
    thisPeriodCol = headerCells.findIndex(isExactThisPeriod);
  }

  const rows: ScannedG703Row[] = [];
  let category: string | null = null;

  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const itemVal = row[itemCol];
    const descVal = row[descCol];

    if (itemVal === null || itemVal === undefined || itemVal === "") {
      if (typeof descVal === "string" && descVal.trim()) {
        const trimmed = descVal.trim();
        if (STOP_LABEL.test(trimmed)) break;
        category = trimmed;
      }
      continue;
    }

    if (typeof descVal !== "string" || !descVal.trim()) continue;

    const scheduled = toNumber(row[scheduledCol]);
    const thisPeriod = thisPeriodCol !== -1 ? toNumber(row[thisPeriodCol]) : undefined;
    rows.push({
      item_number: String(itemVal).trim(),
      category,
      description: descVal.trim(),
      scheduled_value: scheduled !== undefined ? round2(scheduled) : 0,
      amount_this_period: thisPeriod !== undefined ? round2(thisPeriod) : undefined,
    });
  }

  return rows;
}

export function parseBudgetFromXlsx(buffer: Buffer): ParsedBudgetLine[] {
  return scanG703Rows(buffer).map(({ item_number, category, description, scheduled_value }) => ({
    item_number,
    category,
    description,
    scheduled_value,
  }));
}

export function parseDrawAllocationsFromXlsx(buffer: Buffer): ParsedDrawAllocationLine[] {
  return scanG703Rows(buffer)
    .filter((r) => r.amount_this_period !== undefined && r.amount_this_period !== 0)
    .map((r) => ({
      item_number: r.item_number,
      description: r.description,
      amount_this_period: r.amount_this_period as number,
    }));
}
