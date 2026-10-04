-- PROPOSAL — NOT APPLIED. Review only; do not run against any database
-- until it has been exercised on a scratch database (a Supabase branch).
-- It is exercised locally, against real Postgres semantics, by
-- lib/paymentsSql.test.ts (PGlite).
--
-- Fixes: a draw's amount_paid accumulated across payments but date_paid was a
-- flat overwrite, so $30,000 received in September plus $20,000 in October
-- reported the full $50,000 in October everywhere date_paid is read (monthly /
-- quarterly / annual billing, days-to-pay, "what got paid on date X").
--
-- MODEL
--   inv_draw_payments holds one row per receipt (its own amount and date).
--   inv_owner_draws.amount_paid / date_paid become CACHED, derived columns:
--     amount_paid = sum of live receipts, date_paid = latest live receipt date.
--   They are only ever written by the functions below, inside the same
--   transaction as the receipt change, so they cannot drift. Reports read the
--   receipts; totals/balances read the cache.
--
-- DEPLOY ORDER (nothing here has been run)
--   1. Apply to a scratch database; run the drift query below; exercise
--      record/void/correct once.
--   2. Apply to production (the backfill is idempotent).
--   3. Deploy the app version that calls these functions.
--   4. Re-run the drift query; it must return zero rows.
--   Drift query:
--     select d.id, d.draw_number, d.amount_paid, coalesce(sum(p.amount), 0) as receipts
--     from inv_owner_draws d
--     left join inv_draw_payments p on p.draw_id = d.id and p.deleted_at is null
--     group by d.id having round(d.amount_paid, 2) <> round(coalesce(sum(p.amount), 0), 2);
--
-- WHAT CAN AND CANNOT BE RECONSTRUCTED FOR LEGACY DRAWS
--   The backfill gives every draw with amount_paid > 0 exactly ONE receipt
--   (source = 'legacy') for its known total. It cannot know which dollars
--   arrived when on a draw that was really paid in installments before this
--   migration, so it invents no installment history; such a draw keeps its one
--   (possibly already-wrong) date until someone corrects it with
--   correct_draw_payment. A draw with money but no date_paid gets the date the
--   app already used for it in reports (lib/billingDates.ts paidDate: submitted,
--   then created) and date_inferred = true so those rows can be audited.
--
-- OUT OF SCOPE: refunds / negative adjustments. A wrong receipt is corrected by
-- voiding it and recording a replacement (correct_draw_payment).

create table if not exists inv_draw_payments (
  id uuid primary key default gen_random_uuid(),
  -- Cascade so the purge-trash cron can still hard-delete old trashed draws.
  draw_id uuid not null references inv_owner_draws(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  date_received date not null,
  source text not null check (source in ('manual', 'ai', 'legacy')),
  -- Caller-supplied retry key. Unique per draw across ALL rows, voided ones
  -- included: a retry of a payment that was later voided returns the original
  -- instead of silently re-applying it. A corrected payment gets a new key.
  idempotency_key text,
  date_inferred boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists inv_draw_payments_draw_key
  on inv_draw_payments (draw_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists inv_draw_payments_draw_live
  on inv_draw_payments (draw_id)
  where deleted_at is null;

create index if not exists inv_draw_payments_date_received
  on inv_draw_payments (date_received)
  where deleted_at is null;

-- One-time, idempotent backfill (see above). Includes soft-deleted draws so a
-- draw restored from Trash keeps its history.
insert into inv_draw_payments (draw_id, amount, date_received, source, date_inferred)
select d.id,
       d.amount_paid,
       coalesce(d.date_paid, d.date_submitted,
                (d.created_at at time zone 'America/Los_Angeles')::date),
       'legacy',
       d.date_paid is null
from inv_owner_draws d
where d.amount_paid > 0
  and not exists (select 1 from inv_draw_payments p where p.draw_id = d.id);

-- Recomputes the cached totals from the live receipts. Internal helper.
create or replace function inv_recompute_draw_payment_cache(p_draw_id uuid)
returns void
language plpgsql
as $$
begin
  update inv_owner_draws d
  set amount_paid = coalesce(
        (select sum(p.amount) from inv_draw_payments p
          where p.draw_id = d.id and p.deleted_at is null), 0),
      date_paid = (select max(p.date_received) from inv_draw_payments p
          where p.draw_id = d.id and p.deleted_at is null)
  where d.id = p_draw_id;
end;
$$;

-- Records a receipt and refreshes the draw's cached totals atomically.
--   * Locks the draw row, so concurrent calls on one draw are serialized.
--   * A repeated (draw, idempotency_key) returns the original receipt with
--     was_duplicate = true and changes nothing.
--   * Refuses to run if the cached amount_paid already disagrees with the sum
--     of receipts (drift), rather than silently baking the error in.
--   * p_set_paid also marks the draw paid and defaults amount_approved to the
--     requested amount when it is 0 (a genuine partial approval is kept).
create or replace function record_draw_payment(
  p_draw_id uuid,
  p_amount numeric,
  p_date date,
  p_source text,
  p_idempotency_key text default null,
  p_set_paid boolean default false
)
returns jsonb
language plpgsql
as $$
declare
  v_draw inv_owner_draws%rowtype;
  v_existing inv_draw_payments%rowtype;
  v_new inv_draw_payments%rowtype;
  v_receipts numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'payment amount must be greater than zero' using errcode = '22023';
  end if;
  if p_date is null then
    raise exception 'payment date is required' using errcode = '22023';
  end if;

  select * into v_draw from inv_owner_draws where id = p_draw_id for update;
  if not found or v_draw.deleted_at is not null then
    raise exception 'draw not found or deleted' using errcode = 'P0002';
  end if;

  if p_idempotency_key is not null then
    select * into v_existing from inv_draw_payments
      where draw_id = p_draw_id and idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object(
        'payment', to_jsonb(v_existing), 'was_duplicate', true,
        'amount_paid', v_draw.amount_paid, 'date_paid', v_draw.date_paid);
    end if;
  end if;

  select coalesce(sum(amount), 0) into v_receipts
    from inv_draw_payments where draw_id = p_draw_id and deleted_at is null;
  if round(coalesce(v_draw.amount_paid, 0), 2) <> round(v_receipts, 2) then
    raise exception 'payment history drift on draw %: cached amount_paid % vs receipts %',
      p_draw_id, v_draw.amount_paid, v_receipts using errcode = 'P0001';
  end if;

  insert into inv_draw_payments (draw_id, amount, date_received, source, idempotency_key)
  values (p_draw_id, round(p_amount, 2), p_date, p_source, p_idempotency_key)
  returning * into v_new;

  perform inv_recompute_draw_payment_cache(p_draw_id);

  if p_set_paid then
    update inv_owner_draws
    set status = 'paid',
        amount_approved = case when coalesce(amount_approved, 0) > 0
                               then amount_approved else amount_requested end
    where id = p_draw_id;
  end if;

  select * into v_draw from inv_owner_draws where id = p_draw_id;
  return jsonb_build_object(
    'payment', to_jsonb(v_new), 'was_duplicate', false,
    'amount_paid', v_draw.amount_paid, 'date_paid', v_draw.date_paid);
end;
$$;

-- Voids (soft-deletes) a receipt and refreshes the cache. Voiding an already
-- voided receipt is a no-op, so a double click is harmless.
create or replace function void_draw_payment(p_payment_id uuid, p_draw_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_draw inv_owner_draws%rowtype;
  v_payment inv_draw_payments%rowtype;
begin
  select * into v_draw from inv_owner_draws where id = p_draw_id for update;
  if not found or v_draw.deleted_at is not null then
    raise exception 'draw not found or deleted' using errcode = 'P0002';
  end if;

  select * into v_payment from inv_draw_payments
    where id = p_payment_id and draw_id = p_draw_id;
  if not found then
    raise exception 'payment not found on this draw' using errcode = 'P0002';
  end if;

  if v_payment.deleted_at is null then
    update inv_draw_payments set deleted_at = now() where id = p_payment_id;
    perform inv_recompute_draw_payment_cache(p_draw_id);
  end if;

  select * into v_draw from inv_owner_draws where id = p_draw_id;
  return jsonb_build_object(
    'was_noop', v_payment.deleted_at is not null,
    'amount_paid', v_draw.amount_paid, 'date_paid', v_draw.date_paid);
end;
$$;

-- Replaces a wrong receipt: voids the old one and records the corrected one in
-- a single transaction. Retrying with the same key returns the replacement.
create or replace function correct_draw_payment(
  p_payment_id uuid,
  p_draw_id uuid,
  p_new_amount numeric,
  p_new_date date,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_draw inv_owner_draws%rowtype;
  v_old inv_draw_payments%rowtype;
  v_existing inv_draw_payments%rowtype;
  v_new inv_draw_payments%rowtype;
begin
  if p_new_amount is null or p_new_amount <= 0 then
    raise exception 'payment amount must be greater than zero' using errcode = '22023';
  end if;
  if p_new_date is null then
    raise exception 'payment date is required' using errcode = '22023';
  end if;

  select * into v_draw from inv_owner_draws where id = p_draw_id for update;
  if not found or v_draw.deleted_at is not null then
    raise exception 'draw not found or deleted' using errcode = 'P0002';
  end if;

  if p_idempotency_key is not null then
    select * into v_existing from inv_draw_payments
      where draw_id = p_draw_id and idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object(
        'payment', to_jsonb(v_existing), 'was_duplicate', true,
        'amount_paid', v_draw.amount_paid, 'date_paid', v_draw.date_paid);
    end if;
  end if;

  select * into v_old from inv_draw_payments
    where id = p_payment_id and draw_id = p_draw_id and deleted_at is null;
  if not found then
    raise exception 'live payment not found on this draw' using errcode = 'P0002';
  end if;

  update inv_draw_payments set deleted_at = now() where id = p_payment_id;
  insert into inv_draw_payments (draw_id, amount, date_received, source, idempotency_key)
  values (p_draw_id, round(p_new_amount, 2), p_new_date, 'manual', p_idempotency_key)
  returning * into v_new;

  perform inv_recompute_draw_payment_cache(p_draw_id);

  select * into v_draw from inv_owner_draws where id = p_draw_id;
  return jsonb_build_object(
    'payment', to_jsonb(v_new), 'was_duplicate', false,
    'amount_paid', v_draw.amount_paid, 'date_paid', v_draw.date_paid);
end;
$$;

-- These functions mutate financial records. Supabase exposes public-schema
-- functions to the anon/authenticated roles through the API by default; the
-- app calls them only with the server-side service role, so close them to
-- everyone else. (Guarded so the file also runs on a plain Postgres.)
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    revoke all on function inv_recompute_draw_payment_cache(uuid) from public, anon, authenticated;
    revoke all on function record_draw_payment(uuid, numeric, date, text, text, boolean) from public, anon, authenticated;
    revoke all on function void_draw_payment(uuid, uuid) from public, anon, authenticated;
    revoke all on function correct_draw_payment(uuid, uuid, numeric, date, text) from public, anon, authenticated;
    grant execute on function inv_recompute_draw_payment_cache(uuid) to service_role;
    grant execute on function record_draw_payment(uuid, numeric, date, text, text, boolean) to service_role;
    grant execute on function void_draw_payment(uuid, uuid) to service_role;
    grant execute on function correct_draw_payment(uuid, uuid, numeric, date, text) to service_role;
  end if;
end;
$$;
