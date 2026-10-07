"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { DrawStatus, BudgetLine, DrawLineAllocation, OwnerDraw } from "@/lib/types";
import {
  getAllocationsForProject,
  getBudgetLinesForProject,
  getDrawsForProject,
  getLiveDraw,
  normalizeDrawSaveError,
  remainingBalanceForDraw,
} from "@/lib/data";
import {
  extractPdfText,
  parseDrawAllocationsFromXlsx,
  parseG702FromPdf,
  parseG702FromXlsx,
  ParsedG702Draw,
} from "@/lib/g702-parser";
import { isLenderPortalPdfText, parseLenderDrawFromPdf } from "@/lib/lender-portal-parser";
import { diffAllocations } from "@/lib/drawAllocations";
import { businessTodayISO } from "@/lib/format";
import {
  checkExplicitPayment,
  defaultCashReceived,
  ownerPaidFromAmounts,
} from "@/lib/paymentDefaults";
import { checkPriorPayment, correctDrawPayment, recordDrawPayment, voidDrawPayment } from "@/lib/paymentsRepo";

function normalizeMatchKey(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Maps a key to a budget line id only when the key is unique across all
// lines — an ambiguous key (e.g. duplicate item numbers on unrelated line
// items) is left out entirely rather than guessing and misfiling an amount.
function buildUniqueMatchMap(pairs: [string, string][]): Map<string, string> {
  const counts = new Map<string, number>();
  for (const [key] of pairs) counts.set(key, (counts.get(key) ?? 0) + 1);
  const map = new Map<string, string>();
  for (const [key, id] of pairs) {
    if (key && counts.get(key) === 1) map.set(key, id);
  }
  return map;
}

export interface UnmatchedAllocationLine {
  item_number: string;
  description: string;
  amount: number;
}

export interface ParsedG702Upload extends ParsedG702Draw {
  allocations: { budget_line_id: string; amount: number }[];
  allocationsMatched: number;
  allocationsFound: number;
  // Source rows that parsed fine but couldn't be matched to any budget
  // line (ambiguous or no match at all) — surfaced so a review step can
  // show exactly what got dropped instead of a bare count, per the
  // "surface unmatched lines before replacing anything" requirement.
  unmatchedLines: UnmatchedAllocationLine[];
}

async function matchAllocationsToBudgetLines(
  projectId: string,
  lines: { item_number: string; description: string; amount: number }[]
): Promise<{
  matched: { budget_line_id: string; amount: number }[];
  unmatched: UnmatchedAllocationLine[];
}> {
  if (lines.length === 0) return { matched: [], unmatched: [] };

  const supabase = createServerSupabaseClient();
  const { data: budgetLines, error } = await supabase
    .from("inv_project_budget_lines")
    .select("id, item_number, description")
    .eq("project_id", projectId);
  if (error) throw error;

  // Item numbers can collide across unrelated line items within the same
  // schedule of values (seen in practice — two different lines both
  // numbered "1"), so match on description text first and only fall back
  // to item number when a line has no unambiguous description match.
  const byDescription = buildUniqueMatchMap(
    (budgetLines ?? []).map((l) => [normalizeMatchKey(l.description), l.id])
  );
  const byItemNumber = buildUniqueMatchMap(
    (budgetLines ?? [])
      .filter((l) => l.item_number)
      .map((l) => [normalizeMatchKey(l.item_number!), l.id])
  );

  const matched: { budget_line_id: string; amount: number }[] = [];
  const unmatched: UnmatchedAllocationLine[] = [];
  for (const a of lines) {
    const budgetLineId =
      byDescription.get(normalizeMatchKey(a.description)) ??
      byItemNumber.get(normalizeMatchKey(a.item_number));
    if (budgetLineId) matched.push({ budget_line_id: budgetLineId, amount: a.amount });
    else unmatched.push(a);
  }
  return { matched, unmatched };
}

const MAX_G702_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB — real G702/G703 files are a few MB at most

export async function parseG702Upload(formData: FormData): Promise<ParsedG702Upload> {
  const file = formData.get("g702_file");
  if (!(file instanceof File)) {
    throw new Error("No file provided.");
  }
  if (file.size > MAX_G702_UPLOAD_BYTES) {
    throw new Error(
      `File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Max is 20MB.`
    );
  }
  const projectIdRaw = formData.get("project_id");
  const projectId = typeof projectIdRaw === "string" ? projectIdRaw : "";

  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const text = await extractPdfText(buffer);

    if (isLenderPortalPdfText(text)) {
      const parsed = await parseLenderDrawFromPdf(buffer);
      // The allocation against each budget line should reflect what the
      // lender actually approved, not merely what was requested — those two
      // columns can differ substantially (e.g. a partial approval), and
      // using "requested" here overstates what's actually been drawn
      // against the line.
      const allocationLines = parsed.allocations.map((a) => ({
        item_number: a.item_number,
        description: a.description,
        amount: a.approved_value,
      }));
      const { matched, unmatched } = projectId
        ? await matchAllocationsToBudgetLines(projectId, allocationLines)
        : { matched: [], unmatched: [] };
      return {
        draw_number: parsed.draw_number,
        period_end: parsed.period_end,
        date_submitted: parsed.date_submitted,
        // The lender's "Requested Value" is what the contractor asked for,
        // not what's actually collectible — this app tracks amount_requested
        // as the figure "Outstanding" is computed against, so using the true
        // requested total would keep showing a balance that was never going
        // to be approved. Use the approved total for both fields instead.
        amount_requested: parsed.amount_approved,
        amount_approved: parsed.amount_approved,
        retainage_held: parsed.retainage_held,
        allocations: matched,
        allocationsMatched: matched.length,
        allocationsFound: allocationLines.length,
        unmatchedLines: unmatched,
      };
    }

    const parsed = await parseG702FromPdf(buffer);
    return { ...parsed, allocations: [], allocationsMatched: 0, allocationsFound: 0, unmatchedLines: [] };
  }

  if (
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    file.type.includes("spreadsheet") ||
    file.type.includes("excel")
  ) {
    const parsed = parseG702FromXlsx(buffer);
    const allocationLines = parseDrawAllocationsFromXlsx(buffer).map((a) => ({
      item_number: a.item_number,
      description: a.description,
      amount: a.amount_this_period,
    }));
    const { matched, unmatched } = projectId
      ? await matchAllocationsToBudgetLines(projectId, allocationLines)
      : { matched: [], unmatched: [] };

    return {
      ...parsed,
      allocations: matched,
      allocationsMatched: matched.length,
      allocationsFound: allocationLines.length,
      unmatchedLines: unmatched,
    };
  }

  throw new Error("Unsupported file type. Please upload a .xlsx or .pdf file.");
}

function toNumber(value: FormDataEntryValue | null): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function toNullableString(value: FormDataEntryValue | null): string | null {
  const s = (value ?? "").toString().trim();
  return s.length ? s : null;
}

interface AllocationInput {
  budget_line_id: string;
  amount: number;
}

function parseAllocations(formData: FormData): AllocationInput[] {
  const raw = formData.get("allocations");
  if (typeof raw !== "string" || !raw.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(
      (a): a is AllocationInput =>
        a && typeof a.budget_line_id === "string" && typeof a.amount === "number"
    )
    .filter((a) => a.amount !== 0);
}

async function saveAllocations(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  drawId: string,
  allocations: AllocationInput[]
) {
  // Upsert the new set (on the draw_id+budget_line_id unique constraint)
  // rather than inserting fresh rows — a plain insert collides with any
  // existing row for a budget line still present in the new set, which is
  // the common case (editing a draw normally keeps most of its line items).
  // Only budget lines genuinely dropped from this draw get deleted, and only
  // after the upsert succeeds, so a failed write never wipes prior data.
  // See lib/drawAllocations.ts for the (unit-tested) diffing logic itself.
  const { data: existing, error: selectError } = await supabase
    .from("inv_draw_line_allocations")
    .select("id, budget_line_id")
    .eq("draw_id", drawId);
  if (selectError) throw selectError;

  const { toUpsert, staleIds } = diffAllocations(existing ?? [], allocations);

  if (toUpsert.length > 0) {
    const { error: upsertError } = await supabase.from("inv_draw_line_allocations").upsert(
      toUpsert.map((a) => ({
        draw_id: drawId,
        budget_line_id: a.budget_line_id,
        amount: a.amount,
      })),
      { onConflict: "draw_id,budget_line_id" }
    );
    if (upsertError) throw upsertError;
  }

  if (staleIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("inv_draw_line_allocations")
      .delete()
      .in("id", staleIds);
    if (deleteError) throw deleteError;
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// What the edit form asks to do about a payment on this save. The form sends
// an INTENT ("default" = collect what's still collectible, "explicit" = this
// amount), never an owner-paid total: the server works that out itself from
// the allocations being saved and the budget-line flags in the database.
interface PaymentIntent {
  mode: "none" | "default" | "explicit";
  amount: number;
  date: string | null;
  // A date was sent but isn't a valid YYYY-MM-DD.
  dateInvalid: boolean;
  key: string | null;
  confirmOverpayment: boolean;
}

function parsePaymentIntent(formData: FormData): PaymentIntent {
  const raw = formData.get("payment_mode");
  const mode = raw === "default" || raw === "explicit" ? raw : "none";
  const amount = Number(formData.get("payment_amount"));
  const date = toNullableString(formData.get("payment_date"));
  const validDate = date !== null && ISO_DATE.test(date);
  return {
    mode,
    amount: Number.isFinite(amount) ? amount : 0,
    date: validDate ? date : null,
    dateInvalid: date !== null && !validDate,
    key: toNullableString(formData.get("payment_key")),
    confirmOverpayment: formData.get("confirm_overpayment") === "true",
  };
}

// Resolves the payment (if any) to record with this save, validating it BEFORE
// anything is written so a rejected payment never leaves a half-saved draw.
async function resolvePaymentForSave(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  args: {
    intent: PaymentIntent;
    projectId: string;
    requested: number;
    alreadyReceived: number;
    allocations: AllocationInput[];
  }
): Promise<{ error: string } | { amount: number; date: string } | null> {
  const { intent } = args;
  if (intent.mode === "none") return null;
  if (intent.dateInvalid) return { error: "Enter the payment date as a valid date." };

  const { data: lines, error } = await supabase
    .from("inv_project_budget_lines")
    .select("id, excluded_from_contract")
    .eq("project_id", args.projectId)
    .is("deleted_at", null);
  if (error) throw error;

  const ownerPaid = ownerPaidFromAmounts(
    Object.fromEntries(args.allocations.map((a) => [a.budget_line_id, a.amount])),
    (lines ?? []) as { id: string; excluded_from_contract: boolean }[]
  );

  const date = intent.date ?? businessTodayISO();
  if (intent.mode === "default") {
    const amount = defaultCashReceived({
      requested: args.requested,
      ownerPaid,
      alreadyReceived: args.alreadyReceived,
    });
    return amount > 0 ? { amount, date } : null;
  }

  const check = checkExplicitPayment({
    amount: intent.amount,
    requested: args.requested,
    ownerPaid,
    alreadyReceived: args.alreadyReceived,
    confirmOverpayment: intent.confirmOverpayment,
  });
  if (!check.ok) return { error: check.error };
  return { amount: intent.amount, date };
}

// The earlier receipt (if any) this save's payment key already recorded. Only
// values the user actually chose are compared: a "pay what's collectible"
// request derives its amount from a balance the first attempt changed.
function priorPaymentForSave(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  drawId: string,
  intent: PaymentIntent
) {
  if (intent.mode === "none") return Promise.resolve({ kind: "none" } as const);
  return checkPriorPayment(supabase, drawId, intent.key, {
    amount: intent.mode === "explicit" ? intent.amount : undefined,
    date: intent.date ?? undefined,
  });
}

// Returns { error } instead of throwing. Next.js strips the .message off
// any thrown Server Action error in production, keeping only an opaque
// digest — a real, readable Error object still reaches the client as a
// "Minified React error #441" with no actual explanation (seen live twice:
// a check-constraint violation, then a plain duplicate-draw-number clash
// that should have been an ordinary validation message). Returning the
// failure as normal serialized data sidesteps that redaction entirely, and
// the try/catch below is a last-resort net so nothing this function itself
// didn't anticipate can throw its way past that same redaction either.
export async function upsertDraw(formData: FormData): Promise<{ error?: string }> {
  try {
    const supabase = createServerSupabaseClient();
    const id = toNullableString(formData.get("id"));
    const projectId = formData.get("project_id") as string;
    const allocations = parseAllocations(formData);

    const payload = {
      project_id: projectId,
      draw_number: toNumber(formData.get("draw_number")),
      period_start: toNullableString(formData.get("period_start")),
      period_end: toNullableString(formData.get("period_end")),
      amount_requested: toNumber(formData.get("amount_requested")),
      amount_approved: toNumber(formData.get("amount_approved")),
      retainage_held: toNumber(formData.get("retainage_held")),
      // amount_paid / date_paid are deliberately NOT written here: they are a
      // cache of the draw's payment receipts, kept in step by the database
      // functions in lib/paymentsRepo.ts. Writing them from a form would let
      // them drift from the receipts.
      date_submitted: toNullableString(formData.get("date_submitted")),
      date_approved: toNullableString(formData.get("date_approved")),
      status: formData.get("status") as string,
      notes: toNullableString(formData.get("notes")),
    };

    // A draw can be marked paid without ever passing through "approved"; same
    // defaulting as the approved transition, keeping a genuine partial approval.
    if (payload.status === "paid" && !(payload.amount_approved > 0)) {
      payload.amount_approved = payload.amount_requested;
    }

    if (
      payload.period_start &&
      payload.period_end &&
      new Date(payload.period_end) < new Date(payload.period_start)
    ) {
      return { error: "Period end date can't be before the period start date." };
    }

    const paymentIntent = parsePaymentIntent(formData);
    let paymentToRecord: { amount: number; date: string } | null = null;

    let drawId = id;
    if (id) {
      const existing = await getLiveDraw(supabase, { id });
      // Scoped by project, not just id, so an ordinary edit can never move
      // a draw between projects — the form always submits the project it
      // was opened from, and a mismatch here means the row it's trying to
      // touch isn't actually the one the user is looking at.
      if (!existing || existing.project_id !== projectId) {
        return { error: "This draw no longer exists, has been deleted, or belongs to a different project." };
      }

      // Stamp today on the actual transition into a status, same rule as the
      // quick status dropdown (updateDrawStatus) — but only when the date
      // field wasn't itself deliberately edited in this save, so a real
      // backdated submission date typed here is still respected.
      const today = businessTodayISO();
      if (
        payload.status === "submitted" &&
        existing.status !== "submitted" &&
        payload.date_submitted === existing.date_submitted
      ) {
        payload.date_submitted = today;
      }
      if (
        payload.status === "approved" &&
        existing.status !== "approved" &&
        existing.status !== "paid" &&
        payload.date_approved === existing.date_approved
      ) {
        payload.date_approved = today;
      }

      // A retry of a save whose payment already went through must not be
      // judged against the balance that payment changed: look for the receipt
      // under this key first. A replay still saves the draw's own edits (an
      // update is naturally repeatable) but records nothing more.
      const prior = await priorPaymentForSave(supabase, id, paymentIntent);
      if (prior.kind === "error") return { error: prior.error };

      if (prior.kind === "none") {
        const resolved = await resolvePaymentForSave(supabase, {
          intent: paymentIntent,
          projectId,
          requested: payload.amount_requested,
          alreadyReceived: Number(existing.amount_paid) || 0,
          allocations,
        });
        if (resolved && "error" in resolved) {
          // Re-check: a concurrent request with this key may have just landed.
          const again = await priorPaymentForSave(supabase, id, paymentIntent);
          if (again.kind === "error") return { error: again.error };
          if (again.kind === "none") return { error: resolved.error };
        } else {
          paymentToRecord = resolved;
        }
      }

      const { error } = await supabase
        .from("inv_owner_draws")
        .update(payload)
        .eq("id", id)
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .select("id")
        .single();
      if (error) {
        return {
          error:
            error.code === "PGRST116"
              ? "This draw no longer exists, has been deleted, or belongs to a different project."
              : normalizeDrawSaveError(error, payload.draw_number).message,
        };
      }
    } else {
      const resolved = await resolvePaymentForSave(supabase, {
        intent: paymentIntent,
        projectId,
        requested: payload.amount_requested,
        alreadyReceived: 0,
        allocations,
      });
      if (resolved && "error" in resolved) return { error: resolved.error };
      paymentToRecord = resolved;

      const { data, error } = await supabase
        .from("inv_owner_draws")
        .insert({ ...payload, amount_paid: 0, date_paid: null })
        .select("id")
        .single();
      if (error) return { error: normalizeDrawSaveError(error, payload.draw_number).message };
      drawId = data.id;
    }

    if (drawId) {
      await saveAllocations(supabase, drawId, allocations);
    }

    if (drawId && paymentToRecord) {
      try {
        await recordDrawPayment(supabase, {
          drawId,
          amount: paymentToRecord.amount,
          date: paymentToRecord.date,
          source: "manual",
          idempotencyKey: paymentIntent.key,
          amountExplicit: paymentIntent.mode === "explicit",
          dateExplicit: paymentIntent.date !== null,
        });
      } catch (err) {
        revalidatePath(`/projects/${projectId}`);
        revalidatePath("/");
        return {
          error: `The draw was saved, but its payment wasn't recorded: ${
            err instanceof Error ? err.message : "unknown error"
          }`,
        };
      }
    }

    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save this draw." };
  }
}

// Returns { error } rather than throwing — see normalizeDrawSaveError above
// for why (Next.js strips thrown Server Action error messages in
// production). Both mutations here re-check deleted_at, not just the lookup,
// since a concurrent delete between the two would otherwise silently
// "resurrect" the row into a paid/updated state instead of failing.
//
// Recording a payment goes through the database function behind
// recordDrawPayment, which adds the receipt AND refreshes the draw's cached
// amount_paid/date_paid in one transaction. The amount it defaults to — and
// the owner-paid scope it nets out — is always worked out here from the draw's
// saved allocations; a client-supplied excluded total is never read.
export async function markDrawPaid(
  id: string,
  projectId: string,
  amountReceived?: number,
  datePaid?: string,
  options: { idempotencyKey?: string; confirmOverpayment?: boolean } = {}
): Promise<{ error?: string }> {
  try {
    const supabase = createServerSupabaseClient();

    const draw = await getLiveDraw(supabase, { id });
    if (!draw || draw.project_id !== projectId) {
      return { error: "This draw no longer exists or has been deleted." };
    }
    if (datePaid !== undefined && datePaid !== "" && !ISO_DATE.test(datePaid)) {
      return { error: "Enter the payment date as a valid date." };
    }

    // An identical retry returns the original success BEFORE the balance is
    // judged — that balance was changed by the very payment being repeated.
    // A key reused for a different amount/date, or for a payment since
    // voided, is refused instead. The database function is still the guard for
    // concurrent requests; this lookup only makes the retry's answer correct.
    const explicit = { amount: amountReceived, date: datePaid || undefined };
    const settle = async (rejection: string): Promise<{ error?: string }> => {
      const prior = await checkPriorPayment(supabase, id, options.idempotencyKey, explicit);
      if (prior.kind === "error") return { error: prior.error };
      if (prior.kind === "replay") return {};
      return { error: rejection };
    };
    const earlier = await checkPriorPayment(supabase, id, options.idempotencyKey, explicit);
    if (earlier.kind === "error") return { error: earlier.error };
    if (earlier.kind === "replay") return {};

    const alreadyReceived = Number(draw.amount_paid) || 0;
    const { remaining, excludedAllocated } = await remainingBalanceForDraw(supabase, draw);
    // Money already covers the draw (e.g. the payment was entered but the status
    // never moved off approved): there is nothing left to record, so only the
    // status changes. The existing receipts and their dates stay as they are.
    if (amountReceived === undefined && draw.status !== "paid" && alreadyReceived > 0 && !(remaining > 0.005)) {
      const payload: Record<string, unknown> = { status: "paid" };
      if (!(Number(draw.amount_approved) > 0)) payload.amount_approved = draw.amount_requested;
      const { error } = await supabase
        .from("inv_owner_draws")
        .update(payload)
        .eq("id", id)
        .is("deleted_at", null)
        .select("id")
        .single();
      if (error) return { error: "This draw no longer exists or has been deleted." };
      revalidatePath(`/projects/${projectId}`);
      revalidatePath("/");
      return {};
    }

    const received = amountReceived ?? remaining;
    if (!(received > 0)) return settle("Amount received must be greater than zero.");

    if (amountReceived !== undefined) {
      const check = checkExplicitPayment({
        amount: received,
        requested: Number(draw.amount_requested) || 0,
        ownerPaid: excludedAllocated,
        alreadyReceived,
        confirmOverpayment: options.confirmOverpayment === true,
      });
      if (!check.ok) return settle(check.error);
    }

    await recordDrawPayment(supabase, {
      drawId: id,
      amount: received,
      date: datePaid || businessTodayISO(),
      source: "manual",
      idempotencyKey: options.idempotencyKey ?? null,
      setPaid: true,
      amountExplicit: amountReceived !== undefined,
      dateExplicit: Boolean(datePaid),
    });

    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not mark this draw paid." };
  }
}

export async function updateDrawStatus(
  id: string,
  projectId: string,
  status: DrawStatus,
  idempotencyKey?: string
): Promise<{ error?: string }> {
  try {
    const supabase = createServerSupabaseClient();
    const today = businessTodayISO();

    const draw = await getLiveDraw(supabase, { id });
    if (!draw || draw.project_id !== projectId) {
      return { error: "This draw no longer exists or has been deleted." };
    }

    const payload: Record<string, unknown> = { status };

    // Stamp a date on the actual transition into a status, not just "if the
    // field happens to be empty" — a still-draft draw can already carry a
    // date_submitted the G702/xlsx parser guessed from the billing period,
    // which isn't a real submission date and shouldn't block the real one.
    if (status === "submitted" && draw.status !== "submitted") {
      payload.date_submitted = today;
    }

    if (status === "paid") {
      // A retried change that already recorded its payment is a success, and a
      // payment that was recorded and then voided is never quietly re-applied.
      const earlier = await checkPriorPayment(supabase, id, idempotencyKey);
      if (earlier.kind === "error") return { error: earlier.error };
      if (earlier.kind === "replay") return {};

      // Moving to paid with nothing received yet records the full collectible
      // amount as a receipt (requested minus owner-paid scope) — marking paid
      // must never book owner-paid subcontractor money as HTA's own cash. A
      // draw that already has money received keeps its receipts untouched;
      // only the status changes. Either way a missing approved amount defaults
      // to the requested one, and a genuine partial approval is kept.
      const alreadyReceived = Number(draw.amount_paid) || 0;
      if (alreadyReceived <= 0) {
        // Not remainingBalanceForDraw's `remaining`: openBalance reads 0 for a
        // draft, and a draft moved straight to paid still has money to record.
        const { excludedAllocated } = await remainingBalanceForDraw(supabase, draw);
        const collectible = defaultCashReceived({
          requested: Number(draw.amount_requested) || 0,
          ownerPaid: excludedAllocated,
          alreadyReceived: 0,
        });
        if (collectible > 0) {
          await recordDrawPayment(supabase, {
            drawId: id,
            amount: collectible,
            date: today,
            source: "manual",
            idempotencyKey: idempotencyKey ?? null,
            setPaid: true,
          });
          revalidatePath(`/projects/${projectId}`);
          revalidatePath("/");
          return {};
        }
      }
      if (!(Number(draw.amount_approved) > 0)) payload.amount_approved = draw.amount_requested;
    }
    if (status === "approved" && draw.status !== "approved" && draw.status !== "paid") {
      payload.date_approved = today;
      if (!(Number(draw.amount_approved) > 0)) payload.amount_approved = draw.amount_requested;
    }

    const { error } = await supabase
      .from("inv_owner_draws")
      .update(payload)
      .eq("id", id)
      .is("deleted_at", null)
      .select("id")
      .single();
    if (error) return { error: "This draw no longer exists or has been deleted." };

    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update this draw's status." };
  }
}

// Voids one receipt (the history is kept, just marked void) and refreshes the
// draw's cached totals in the same database transaction.
export async function voidPayment(
  paymentId: string,
  drawId: string,
  projectId: string
): Promise<{ error?: string }> {
  try {
    const supabase = createServerSupabaseClient();
    const draw = await getLiveDraw(supabase, { id: drawId });
    if (!draw || draw.project_id !== projectId) {
      return { error: "This draw no longer exists or has been deleted." };
    }
    await voidDrawPayment(supabase, { paymentId, drawId });
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not void this payment." };
  }
}

// Replaces a wrong receipt: voids it and records the corrected amount/date in
// one transaction. Retrying with the same key returns the replacement.
export async function correctPayment(
  paymentId: string,
  drawId: string,
  projectId: string,
  amount: number,
  date: string,
  idempotencyKey?: string
): Promise<{ error?: string }> {
  try {
    if (!(amount > 0)) return { error: "Amount received must be greater than zero." };
    if (!ISO_DATE.test(date)) return { error: "Enter the payment date as a valid date." };
    const supabase = createServerSupabaseClient();
    const draw = await getLiveDraw(supabase, { id: drawId });
    if (!draw || draw.project_id !== projectId) {
      return { error: "This draw no longer exists or has been deleted." };
    }
    await correctDrawPayment(supabase, { paymentId, drawId, amount, date, idempotencyKey: idempotencyKey ?? null });
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not correct this payment." };
  }
}

export async function deleteDraw(id: string, projectId: string) {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("inv_owner_draws")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/");
}

export async function restoreDraw(id: string, projectId: string) {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("inv_owner_draws")
    .update({ deleted_at: null })
    .eq("id", id);
  if (error) throw error;
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/");
}

export async function getDrawFormContext(projectId: string): Promise<{
  draws: OwnerDraw[];
  budgetLines: BudgetLine[];
  allocations: DrawLineAllocation[];
}> {
  const [draws, budgetLines, allocations] = await Promise.all([
    getDrawsForProject(projectId),
    getBudgetLinesForProject(projectId),
    getAllocationsForProject(projectId),
  ]);
  return { draws, budgetLines, allocations };
}
