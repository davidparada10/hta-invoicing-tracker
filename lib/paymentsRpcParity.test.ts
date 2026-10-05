// Guards the JS test double (lib/testUtils/fakePaymentRpc.ts) against the real
// SQL: the same scripted scenario runs through both and every step must agree
// on outcome and on the draw/receipt state afterwards.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { createFakeSupabase } from "@/lib/testUtils/fakeSupabase";
import { fakePaymentRpc } from "@/lib/testUtils/fakePaymentRpc";

// The base migration plus the idempotency-conflict follow-up, in deploy order.
const MIGRATION = ["20261001120000_add_draw_payments.sql", "20261005090000_payment_idempotency_conflicts.sql"]
  .map((f) => readFileSync(join(process.cwd(), "supabase/migrations", f), "utf8"))
  .join("\n");

const DRAW = "aaaaaaaa-0000-0000-0000-000000000001";
const UNAPPROVED = "aaaaaaaa-0000-0000-0000-000000000002";
const TRASHED = "aaaaaaaa-0000-0000-0000-000000000003";

type Outcome = { ok: boolean; code?: string; duplicate?: boolean; noop?: boolean; id?: string };
type Snapshot = { paid: number; date: string | null; status: string; approved: number; live: string[]; all: number };

interface Impl {
  call(fn: string, args: unknown[]): Promise<Outcome>;
  setPaidDirectly(drawId: string, amount: number): Promise<void>;
  snapshot(drawId: string): Promise<Snapshot>;
}

const ARG_NAMES: Record<string, string[]> = {
  record_draw_payment: ["p_draw_id", "p_amount", "p_date", "p_source", "p_idempotency_key", "p_set_paid", "p_amount_explicit", "p_date_explicit"],
  void_draw_payment: ["p_payment_id", "p_draw_id"],
  correct_draw_payment: ["p_payment_id", "p_draw_id", "p_new_amount", "p_new_date", "p_idempotency_key"],
};

function normalize(data: Record<string, unknown> | null, code?: string): Outcome {
  if (code) return { ok: false, code };
  const payment = (data?.payment ?? null) as { id: string } | null;
  return { ok: true, duplicate: Boolean(data?.was_duplicate), noop: Boolean(data?.was_noop), id: payment?.id };
}

async function sqlImpl(): Promise<Impl> {
  const db = new PGlite();
  await db.exec(`
    create table inv_projects (id uuid primary key default gen_random_uuid());
    create table inv_owner_draws (
      id uuid primary key default gen_random_uuid(), project_id uuid, draw_number int,
      amount_requested numeric(12,2) not null default 0, amount_approved numeric(12,2) not null default 0,
      amount_paid numeric(12,2) not null default 0, date_paid date, date_approved date, date_submitted date,
      status text not null default 'draft', created_at timestamptz not null default now(), deleted_at timestamptz);
    insert into inv_owner_draws (id, amount_requested) values ('${DRAW}', 100000);
    insert into inv_owner_draws (id, amount_requested, amount_approved, status) values ('${UNAPPROVED}', 100000, 0, 'submitted');
    insert into inv_owner_draws (id, amount_requested, deleted_at) values ('${TRASHED}', 100000, now());
  `);
  await db.exec(MIGRATION);
  const casts: Record<string, string[]> = {
    record_draw_payment: ["uuid", "numeric", "date", "text", "text", "boolean", "boolean", "boolean"],
    void_draw_payment: ["uuid", "uuid"],
    correct_draw_payment: ["uuid", "uuid", "numeric", "date", "text"],
  };
  return {
    async call(fn, args) {
      const placeholders = args.map((_, i) => `$${i + 1}::${casts[fn][i]}`).join(", ");
      try {
        const r = await db.query<{ r: Record<string, unknown> }>(`select ${fn}(${placeholders}) as r`, args);
        return normalize(r.rows[0].r);
      } catch (e) {
        return normalize(null, (e as { code?: string }).code ?? "unknown");
      }
    },
    async setPaidDirectly(drawId, amount) {
      await db.query("update inv_owner_draws set amount_paid = $1 where id = $2", [amount, drawId]);
    },
    async snapshot(drawId) {
      const d = await db.query<{ paid: string; date: string | null; status: string; approved: string }>(
        "select amount_paid::text as paid, date_paid::text as date, status, amount_approved::text as approved from inv_owner_draws where id = $1",
        [drawId]
      );
      const live = await db.query<{ s: string }>(
        "select amount::text || '@' || date_received::text as s from inv_draw_payments where draw_id = $1 and deleted_at is null order by date_received, amount",
        [drawId]
      );
      const all = await db.query<{ n: number }>("select count(*)::int as n from inv_draw_payments where draw_id = $1", [drawId]);
      return {
        paid: Number(d.rows[0].paid),
        date: d.rows[0].date,
        status: d.rows[0].status,
        approved: Number(d.rows[0].approved),
        live: live.rows.map((r) => r.s.replace(/(\.\d*?)0+@/, "$1@").replace(/\.@/, "@")).sort(),
        all: all.rows[0].n,
      };
    },
  };
}

function doubleImpl(): Impl {
  const tables: Record<string, Record<string, unknown>[]> = {
    inv_owner_draws: [
      { id: DRAW, amount_requested: 100000, amount_approved: 0, amount_paid: 0, date_paid: null, status: "draft", deleted_at: null },
      { id: UNAPPROVED, amount_requested: 100000, amount_approved: 0, amount_paid: 0, date_paid: null, status: "submitted", deleted_at: null },
      { id: TRASHED, amount_requested: 100000, amount_approved: 0, amount_paid: 0, date_paid: null, status: "draft", deleted_at: "2026-01-01" },
    ],
    inv_draw_payments: [],
  };
  const supabase = createFakeSupabase(tables, { rpc: fakePaymentRpc });
  const num = (s: string) => String(Number(s));
  return {
    async call(fn, args) {
      const named = Object.fromEntries(ARG_NAMES[fn].map((k, i) => [k, args[i]]));
      const { data, error } = await supabase.rpc(fn, named);
      return error ? normalize(null, error.code) : normalize(data);
    },
    async setPaidDirectly(drawId, amount) {
      (tables.inv_owner_draws.find((d) => d.id === drawId) as { amount_paid: number }).amount_paid = amount;
    },
    async snapshot(drawId) {
      const d = tables.inv_owner_draws.find((x) => x.id === drawId) as Record<string, unknown>;
      const rows = (tables.inv_draw_payments as Record<string, unknown>[]).filter((p) => p.draw_id === drawId);
      return {
        paid: Number(d.amount_paid),
        date: (d.date_paid as string | null) ?? null,
        status: String(d.status),
        approved: Number(d.amount_approved),
        live: rows
          .filter((p) => !p.deleted_at)
          .map((p) => `${num(String(p.amount))}@${p.date_received}`)
          .sort(),
        all: rows.length,
      };
    },
  };
}

type Step = {
  label: string;
  run: (impl: Impl, ids: Record<string, string>) => Promise<Outcome>;
  after: string; // draw whose state is compared after the step
};

const steps: Step[] = [
  { label: "record $30k Sept", after: DRAW, run: async (i, ids) => { const o = await i.call("record_draw_payment", [DRAW, 30000, "2026-09-20", "manual", "k1", false]); ids.A = o.id!; return o; } },
  { label: "record $20k Oct", after: DRAW, run: async (i, ids) => { const o = await i.call("record_draw_payment", [DRAW, 20000, "2026-10-05", "manual", "k2", false]); ids.B = o.id!; return o; } },
  { label: "retry k1 (duplicate)", after: DRAW, run: (i) => i.call("record_draw_payment", [DRAW, 30000, "2026-09-20", "manual", "k1", false]) },
  { label: "zero amount rejected", after: DRAW, run: (i) => i.call("record_draw_payment", [DRAW, 0, "2026-09-20", "manual", null, false]) },
  { label: "void B", after: DRAW, run: (i, ids) => i.call("void_draw_payment", [ids.B, DRAW]) },
  { label: "void B again (noop)", after: DRAW, run: (i, ids) => i.call("void_draw_payment", [ids.B, DRAW]) },
  { label: "retry k2 after void (duplicate, not re-applied)", after: DRAW, run: (i) => i.call("record_draw_payment", [DRAW, 20000, "2026-10-05", "manual", "k2", false]) },
  { label: "correct A to $25k on Sep 25", after: DRAW, run: (i, ids) => i.call("correct_draw_payment", [ids.A, DRAW, 25000, "2026-09-25", "k3"]) },
  { label: "retry correction (duplicate)", after: DRAW, run: (i, ids) => i.call("correct_draw_payment", [ids.A, DRAW, 25000, "2026-09-25", "k3"]) },
  { label: "correct the already-voided A", after: DRAW, run: (i, ids) => i.call("correct_draw_payment", [ids.A, DRAW, 1, "2026-09-26", "k4"]) },
  { label: "k1 retried with a derived (non-explicit) amount returns the original", after: DRAW, run: (i) => i.call("record_draw_payment", [DRAW, 99, "2026-09-21", "manual", "k1", false, false, false]) },
  { label: "k1 retried with the same explicit amount and date returns the original", after: DRAW, run: (i) => i.call("record_draw_payment", [DRAW, 30000, "2026-09-20", "manual", "k1", false, true, true]) },
  { label: "k1 reused with a different explicit amount conflicts", after: DRAW, run: (i) => i.call("record_draw_payment", [DRAW, 29999, "2026-09-20", "manual", "k1", false, true, false]) },
  { label: "k1 reused with a different explicit date conflicts", after: DRAW, run: (i) => i.call("record_draw_payment", [DRAW, 30000, "2026-09-21", "manual", "k1", false, false, true]) },
  { label: "k3 correction reused with a different amount conflicts", after: DRAW, run: (i, ids) => i.call("correct_draw_payment", [ids.A, DRAW, 26000, "2026-09-25", "k3"]) },
  { label: "drift injected then record refused", after: DRAW, run: async (i) => { await i.setPaidDirectly(DRAW, 9999); return i.call("record_draw_payment", [DRAW, 100, "2026-10-09", "manual", null, false]); } },
  { label: "set_paid defaults a missing approval", after: UNAPPROVED, run: (i) => i.call("record_draw_payment", [UNAPPROVED, 80000, "2026-10-01", "manual", null, true]) },
  { label: "recording on a trashed draw refused", after: TRASHED, run: (i) => i.call("record_draw_payment", [TRASHED, 100, "2026-10-01", "manual", null, false]) },
];

describe("JS test double ≡ real SQL", () => {
  let sql: Impl;
  const dbl = doubleImpl();

  beforeAll(async () => {
    sql = await sqlImpl();
  }, 60000);

  it("agrees with the real SQL at every step of the scenario", async () => {
    const sqlIds: Record<string, string> = {};
    const dblIds: Record<string, string> = {};
    for (const step of steps) {
      const a = await step.run(sql, sqlIds);
      const b = await step.run(dbl, dblIds);
      const strip = (o: Outcome) => ({ ok: o.ok, code: o.code, duplicate: o.duplicate, noop: o.noop }); // ids differ by construction
      expect({ step: step.label, outcome: strip(b) }).toEqual({ step: step.label, outcome: strip(a) });
      expect({ step: step.label, state: await dbl.snapshot(step.after) }).toEqual({
        step: step.label,
        state: await sql.snapshot(step.after),
      });
    }
  }, 60000);
});
