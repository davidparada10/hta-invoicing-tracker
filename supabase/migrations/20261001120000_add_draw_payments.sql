-- PROPOSAL — NOT APPLIED. Review only; do not run against any database.
--
-- Fixes: a draw's amount_paid accumulates across payments but date_paid is
-- a flat overwrite, so a draw paid $30,000 in September and $20,000 in
-- October reports the full $50,000 in October everywhere that reads
-- date_paid (monthly/quarterly billing charts, days-to-pay, "what got paid
-- on date X"). See lib/paymentHistory.ts for the pure logic this table is
-- designed against (recordPayment, totalPaid, lastPaymentDate,
-- paymentsByPeriod), already written and unit-tested against synthetic
-- fixtures — this migration is the one piece that can't be exercised
-- locally, since it has to run against the real production schema.
--
-- inv_owner_draws.amount_paid/date_paid become DERIVED/CACHED columns under
-- this model (amount_paid = sum(inv_draw_payments.amount), date_paid =
-- max(date_received)) — kept for backward-compatible display only. Every
-- report that currently reads date_paid to bucket amount_paid into a single
-- period should instead read inv_draw_payments directly, one payment at a
-- time, once this is live. Exact call sites to flip (not done in this
-- pass): app/draws/actions.ts's markDrawPaid, lib/tools/write-tools.ts's
-- markDrawPaidTool, lib/billing.ts's buildBillingReport /
-- buildGroupedBillingBreakdown / daysToPay, lib/monthlyBilling.ts's
-- buildMonthlyBillingBuckets, lib/tools/read-tools.ts's
-- getRecentPaymentsTool.

create table if not exists inv_draw_payments (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null references inv_owner_draws(id),
  amount numeric(12, 2) not null check (amount > 0),
  date_received date not null,
  -- Mirrors inv_owner_draws' existing source distinction (manual form vs.
  -- the AI assistant's write tool) so a payment's origin stays visible.
  source text not null check (source in ('manual', 'ai')),
  -- Caller-supplied dedupe key (e.g. a client-generated UUID per payment
  -- attempt) — the idempotency guard markDrawPaidTool lacks today, where
  -- two identical agent calls both apply. Unique only among live rows, so
  -- a soft-deleted (corrected) payment doesn't block a legitimate retry
  -- under the same key.
  idempotency_key text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists inv_draw_payments_idempotency_key_live
  on inv_draw_payments (idempotency_key)
  where deleted_at is null and idempotency_key is not null;

create index if not exists inv_draw_payments_draw_id
  on inv_draw_payments (draw_id)
  where deleted_at is null;

-- One-time backfill: every existing draw with amount_paid > 0 gets exactly
-- one synthetic payment row dated at its current date_paid. This does NOT
-- attempt to reconstruct real installment history for a draw that was
-- actually paid in parts before this migration existed — there is no way
-- to recover which dollars arrived when, so this intentionally preserves
-- only the known total and the known (possibly already-wrong, per the bug
-- above) last-payment date, rather than inventing a plausible-looking
-- breakdown. Any draw whose true payment history matters before this date
-- needs a manual, case-by-case correction — out of scope for an automated
-- backfill.
insert into inv_draw_payments (draw_id, amount, date_received, source, created_at)
select id, amount_paid, date_paid, 'manual', now()
from inv_owner_draws
where amount_paid > 0
  and date_paid is not null
  and deleted_at is null;

-- NOT included in this proposal, deliberately: dropping or renaming
-- inv_owner_draws.amount_paid/date_paid, or any trigger to keep them in
-- sync with inv_draw_payments automatically. Until the call sites listed
-- above are actually switched over to read inv_draw_payments, those two
-- columns must stay the live, directly-written source of truth exactly as
-- they are today — this migration only adds the new table alongside them.
