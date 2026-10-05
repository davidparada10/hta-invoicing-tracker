-- PROPOSAL — NOT APPLIED. Review only. Apply AFTER
-- 20261001120000_add_draw_payments.sql (read-only check on 2026-10-05: that
-- migration's table and functions did not exist on the production database).
-- Safe to run whether or not the earlier migration was already applied: it only
-- drops the superseded function signature if present and recreates it.
--
-- Fixes: a retried payment request that reuses an idempotency key must either
-- return the original receipt (identical retry) or fail loudly (the key was
-- reused for a materially different amount or date), never silently succeed
-- with something other than what was asked for.
--
--   * record_draw_payment gains two flags saying whether the caller supplied an
--     amount / date explicitly. A "pay the remaining balance" request has no
--     explicit amount (its amount is derived from a balance that the first
--     attempt already changed), so only explicit values are compared. On a key
--     match with an explicit value that differs, it raises P0003.
--   * correct_draw_payment always compares (a correction always names both) and
--     raises P0003 on a mismatch.
--   * A duplicate still returns the ORIGINAL receipt, voided or not; a voided
--     receipt is never revived. The app reads payment.deleted_at to tell the
--     user it was recorded and later voided.
--
-- The draw row stays locked (for update) before the key lookup, so concurrent
-- requests with one key are serialized: one inserts, the rest see it.
--
-- Dropping the old six-argument signature matters: leaving it next to the new
-- one would make PostgREST named-argument calls ambiguous.

drop function if exists record_draw_payment(uuid, numeric, date, text, text, boolean);

create or replace function record_draw_payment(
  p_draw_id uuid,
  p_amount numeric,
  p_date date,
  p_source text,
  p_idempotency_key text default null,
  p_set_paid boolean default false,
  p_amount_explicit boolean default false,
  p_date_explicit boolean default false
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
      if (p_amount_explicit and round(p_amount, 2) <> v_existing.amount)
         or (p_date_explicit and p_date <> v_existing.date_received) then
        raise exception 'idempotency key already used for a different payment'
          using errcode = 'P0003';
      end if;
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
      if round(p_new_amount, 2) <> v_existing.amount or p_new_date <> v_existing.date_received then
        raise exception 'idempotency key already used for a different payment'
          using errcode = 'P0003';
      end if;
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

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    revoke all on function record_draw_payment(uuid, numeric, date, text, text, boolean, boolean, boolean) from public, anon, authenticated;
    revoke all on function correct_draw_payment(uuid, uuid, numeric, date, text) from public, anon, authenticated;
    grant execute on function record_draw_payment(uuid, numeric, date, text, text, boolean, boolean, boolean) to service_role;
    grant execute on function correct_draw_payment(uuid, uuid, numeric, date, text) to service_role;
  end if;
end;
$$;
