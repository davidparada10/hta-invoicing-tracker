// Runs the REAL proposed migration (supabase/migrations/20261001120000_add_draw_payments.sql)
// against an in-process Postgres (PGlite) — nothing here touches any real
// database. The two tables the migration depends on are stubbed with just the
// columns it reads/writes.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

// The base migration plus the idempotency-conflict follow-up, in deploy order.
const MIGRATION = ["20261001120000_add_draw_payments.sql", "20261005090000_payment_idempotency_conflicts.sql"]
  .map((f) => readFileSync(join(process.cwd(), "supabase/migrations", f), "utf8"))
  .join("\n");

const STUB_SCHEMA = `
  create table inv_projects (id uuid primary key default gen_random_uuid());
  create table inv_owner_draws (
    id uuid primary key default gen_random_uuid(),
    project_id uuid,
    draw_number int,
    amount_requested numeric(12,2) not null default 0,
    amount_approved numeric(12,2) not null default 0,
    amount_paid numeric(12,2) not null default 0,
    date_paid date,
    date_approved date,
    date_submitted date,
    status text not null default 'draft',
    created_at timestamptz not null default now(),
    deleted_at timestamptz
  );
`;

async function freshDb(seed?: string): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(STUB_SCHEMA);
  if (seed) await db.exec(seed);
  await db.exec(MIGRATION);
  return db;
}

async function newDraw(db: PGlite, fields: Record<string, string | number | null> = {}): Promise<string> {
  const cols = { amount_requested: 100000, ...fields };
  const names = Object.keys(cols);
  const res = await db.query<{ id: string }>(
    `insert into inv_owner_draws (${names.join(",")}) values (${names.map((_, i) => `$${i + 1}`).join(",")}) returning id`,
    Object.values(cols)
  );
  return res.rows[0].id;
}

async function drawState(db: PGlite, id: string) {
  const r = await db.query<{ amount_paid: string; date_paid: string | null; status: string; amount_approved: string }>(
    "select amount_paid::text, date_paid::text, status, amount_approved::text from inv_owner_draws where id = $1",
    [id]
  );
  return r.rows[0];
}

async function receipts(db: PGlite, drawId: string, live = true) {
  const r = await db.query<{ amount: string; date_received: string; source: string; deleted_at: string | null }>(
    `select amount::text, date_received::text, source, deleted_at::text from inv_draw_payments
      where draw_id = $1 ${live ? "and deleted_at is null" : ""} order by date_received, created_at`,
    [drawId]
  );
  return r.rows;
}

const record = (
  db: PGlite,
  drawId: string,
  amount: number,
  date: string,
  key: string | null = null,
  setPaid = false,
  source = "manual"
) =>
  db.query<{ record_draw_payment: Record<string, unknown> }>(
    "select record_draw_payment($1::uuid, $2::numeric, $3::date, $4, $5, $6) as record_draw_payment",
    [drawId, amount, date, source, key, setPaid]
  );

describe("backfill", () => {
  let db: PGlite;
  let ids: Record<string, string>;

  beforeAll(async () => {
    // Seed legacy draws BEFORE the migration runs.
    const seed = `
      insert into inv_owner_draws (id, amount_requested, amount_paid, date_paid, status) values
        ('00000000-0000-0000-0000-000000000001', 100000, 100000, '2026-07-24', 'paid');
      insert into inv_owner_draws (id, amount_requested, amount_paid, date_paid, date_submitted, status) values
        ('00000000-0000-0000-0000-000000000002', 70000, 70000, null, '2026-06-30', 'paid');
      insert into inv_owner_draws (id, amount_requested, amount_paid, date_paid, status, deleted_at) values
        ('00000000-0000-0000-0000-000000000003', 5000, 5000, '2026-05-01', 'paid', now());
      insert into inv_owner_draws (id, amount_requested, amount_paid, status) values
        ('00000000-0000-0000-0000-000000000004', 9000, 0, 'submitted');
    `;
    db = await freshDb(seed);
    ids = {
      dated: "00000000-0000-0000-0000-000000000001",
      undated: "00000000-0000-0000-0000-000000000002",
      trashed: "00000000-0000-0000-0000-000000000003",
      unpaid: "00000000-0000-0000-0000-000000000004",
    };
  }, 60000);

  it("gives a paid draw exactly one legacy receipt with its known total and date — no invented installments", async () => {
    expect(await receipts(db, ids.dated)).toEqual([
      { amount: "100000.00", date_received: "2026-07-24", source: "legacy", deleted_at: null },
    ]);
  });

  it("keeps money that has no date_paid, using the date reports already used for it (submitted) and flagging it as inferred", async () => {
    const r = await db.query("select amount::text, date_received::text, date_inferred from inv_draw_payments where draw_id = $1", [ids.undated]);
    expect(r.rows).toEqual([{ amount: "70000.00", date_received: "2026-06-30", date_inferred: true }]);
  });

  it("includes soft-deleted draws so Trash → restore keeps their history", async () => {
    expect(await receipts(db, ids.trashed)).toHaveLength(1);
  });

  it("creates nothing for a draw with no money received", async () => {
    expect(await receipts(db, ids.unpaid)).toHaveLength(0);
  });

  it("is idempotent — re-running the migration adds no duplicate receipts", async () => {
    await db.exec(MIGRATION);
    const n = await db.query<{ n: number }>("select count(*)::int as n from inv_draw_payments");
    expect(n.rows[0].n).toBe(3);
  });

  it("leaves the cached draw totals untouched, and they agree with the receipts (no drift)", async () => {
    const drift = await db.query(
      `select d.id from inv_owner_draws d
       left join inv_draw_payments p on p.draw_id = d.id and p.deleted_at is null
       group by d.id having round(d.amount_paid, 2) <> round(coalesce(sum(p.amount), 0), 2)`
    );
    expect(drift.rows).toHaveLength(0);
  });
});

describe("record_draw_payment", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await freshDb();
  }, 60000);

  // The brief's regression example.
  it("keeps each receipt's own amount and date: $30,000 in September + $20,000 in October", async () => {
    const id = await newDraw(db);
    await record(db, id, 30000, "2026-09-20");
    await record(db, id, 20000, "2026-10-05");

    expect(await drawState(db, id)).toMatchObject({ amount_paid: "50000.00", date_paid: "2026-10-05" });

    const byMonth = await db.query<{ month: string; total: string }>(
      `select to_char(date_received, 'YYYY-MM') as month, sum(amount)::text as total
         from inv_draw_payments where draw_id = $1 and deleted_at is null group by 1 order by 1`,
      [id]
    );
    expect(byMonth.rows).toEqual([
      { month: "2026-09", total: "30000.00" },
      { month: "2026-10", total: "20000.00" },
    ]);
  });

  it("returns the original receipt for a repeated idempotency key and changes nothing", async () => {
    const id = await newDraw(db);
    const first = await record(db, id, 20000, "2026-10-01", "ai:tool-call-1", false, "ai");
    const second = await record(db, id, 20000, "2026-10-01", "ai:tool-call-1", false, "ai");

    expect(first.rows[0].record_draw_payment.was_duplicate).toBe(false);
    expect(second.rows[0].record_draw_payment.was_duplicate).toBe(true);
    expect(await receipts(db, id)).toHaveLength(1);
    expect((await drawState(db, id)).amount_paid).toBe("20000.00");
  });

  it("scopes idempotency keys to the draw — the same key on another draw is independent", async () => {
    const a = await newDraw(db);
    const b = await newDraw(db);
    await record(db, a, 100, "2026-10-01", "same-key");
    const r = await record(db, b, 100, "2026-10-01", "same-key");
    expect(r.rows[0].record_draw_payment.was_duplicate).toBe(false);
  });

  it("never dedupes receipts recorded without a key (ordinary manual entry)", async () => {
    const id = await newDraw(db);
    await record(db, id, 500, "2026-09-01");
    await record(db, id, 500, "2026-09-01");
    expect(await receipts(db, id)).toHaveLength(2);
  });

  it("a retry of a payment that was later voided does not silently re-apply it", async () => {
    const id = await newDraw(db);
    const first = await record(db, id, 8000, "2026-10-01", "retry-key");
    const paymentId = (first.rows[0].record_draw_payment.payment as { id: string }).id;
    await db.query("select void_draw_payment($1::uuid, $2::uuid)", [paymentId, id]);

    const retry = await record(db, id, 8000, "2026-10-01", "retry-key");
    expect(retry.rows[0].record_draw_payment.was_duplicate).toBe(true);
    expect((await drawState(db, id)).amount_paid).toBe("0.00");
  });

  const recordFlags = (id: string, amount: number, date: string, key: string, amountExplicit: boolean, dateExplicit: boolean) =>
    db.query(
      "select record_draw_payment($1::uuid, $2::numeric, $3::date, 'manual', $4, false, $5, $6) as r",
      [id, amount, date, key, amountExplicit, dateExplicit]
    );

  it("a key reused with a different EXPLICIT amount or date is a conflict, not a silent success", async () => {
    const id = await newDraw(db);
    await recordFlags(id, 40000, "2026-10-01", "conflict-key", true, true);
    await expect(recordFlags(id, 39999, "2026-10-01", "conflict-key", true, false)).rejects.toMatchObject({ code: "P0003" });
    await expect(recordFlags(id, 40000, "2026-10-02", "conflict-key", false, true)).rejects.toMatchObject({ code: "P0003" });
    expect(await receipts(db, id)).toHaveLength(1);
  });

  it("an identical explicit retry, or a derived-amount retry, returns the original", async () => {
    const id = await newDraw(db);
    await recordFlags(id, 40000, "2026-10-01", "same-key", true, true);
    const same = await recordFlags(id, 40000, "2026-10-01", "same-key", true, true);
    expect((same.rows[0] as { r: { was_duplicate: boolean } }).r.was_duplicate).toBe(true);
    // A "pay the remaining balance" retry recomputes a different amount from the changed balance; not compared.
    const derived = await recordFlags(id, 60000, "2026-10-05", "same-key", false, false);
    expect((derived.rows[0] as { r: { was_duplicate: boolean } }).r.was_duplicate).toBe(true);
    expect(await receipts(db, id)).toHaveLength(1);
  });

  it("simultaneous requests with one key record exactly one receipt", async () => {
    const id = await newDraw(db);
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => recordFlags(id, 25000, "2026-10-03", "race-key", true, true))
    );
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const dupes = results.filter((r) => r.status === "fulfilled" && (r.value.rows[0] as { r: { was_duplicate: boolean } }).r.was_duplicate);
    expect(dupes).toHaveLength(4);
    expect(await receipts(db, id)).toHaveLength(1);
    expect((await drawState(db, id)).amount_paid).toBe("25000.00");
  });

  it("a correction key reused with a different amount or date conflicts", async () => {
    const id = await newDraw(db);
    const first = await record(db, id, 8000, "2026-10-01");
    const paymentId = (first.rows[0].record_draw_payment.payment as { id: string }).id;
    await db.query("select correct_draw_payment($1::uuid, $2::uuid, 7000, '2026-10-02'::date, 'fix-key')", [paymentId, id]);
    await expect(
      db.query("select correct_draw_payment($1::uuid, $2::uuid, 7100, '2026-10-02'::date, 'fix-key')", [paymentId, id])
    ).rejects.toMatchObject({ code: "P0003" });
  });

  it("refuses to run when the cached total already disagrees with the receipts (drift), leaving everything untouched", async () => {
    const id = await newDraw(db);
    await record(db, id, 1000, "2026-09-01");
    await db.query("update inv_owner_draws set amount_paid = 9999 where id = $1", [id]); // simulate drift

    await expect(record(db, id, 500, "2026-09-02")).rejects.toThrow(/drift/i);
    expect(await receipts(db, id)).toHaveLength(1); // the failed call inserted nothing
    expect((await drawState(db, id)).amount_paid).toBe("9999.00");
  });

  it("rejects a non-positive amount, a missing date, and a missing or deleted draw", async () => {
    const id = await newDraw(db);
    await expect(record(db, id, 0, "2026-09-01")).rejects.toThrow(/greater than zero/);
    await expect(record(db, id, -5, "2026-09-01")).rejects.toThrow(/greater than zero/);
    await expect(
      db.query("select record_draw_payment($1::uuid, 100::numeric, null::date, 'manual')", [id])
    ).rejects.toThrow(/date is required/);
    await expect(record(db, "11111111-1111-1111-1111-111111111111", 100, "2026-09-01")).rejects.toThrow(/not found/);

    const gone = await newDraw(db, { deleted_at: "2026-01-01T00:00:00Z" });
    await expect(record(db, gone, 100, "2026-09-01")).rejects.toThrow(/not found or deleted/);
  });

  it("set_paid marks the draw paid and defaults a missing approval, but keeps a genuine partial approval", async () => {
    const unapproved = await newDraw(db, { amount_requested: 100000, amount_approved: 0, status: "submitted" });
    await record(db, unapproved, 80000, "2026-10-01", null, true);
    expect(await drawState(db, unapproved)).toMatchObject({ status: "paid", amount_approved: "100000.00" });

    const partial = await newDraw(db, { amount_requested: 100000, amount_approved: 90000, status: "approved" });
    await record(db, partial, 90000, "2026-10-01", null, true);
    expect(await drawState(db, partial)).toMatchObject({ status: "paid", amount_approved: "90000.00" });
  });

  it("rounds to the cent", async () => {
    const id = await newDraw(db);
    await record(db, id, 100.004, "2026-10-01");
    expect((await drawState(db, id)).amount_paid).toBe("100.00");
  });
});

describe("void_draw_payment / correct_draw_payment", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await freshDb();
  }, 60000);

  async function twoReceipts() {
    const id = await newDraw(db);
    const a = await record(db, id, 30000, "2026-09-20");
    const b = await record(db, id, 20000, "2026-10-05");
    const ida = (a.rows[0].record_draw_payment.payment as { id: string }).id;
    const idb = (b.rows[0].record_draw_payment.payment as { id: string }).id;
    return { id, ida, idb };
  }

  it("voiding a receipt recomputes the total and the latest date", async () => {
    const { id, idb } = await twoReceipts();
    await db.query("select void_draw_payment($1::uuid, $2::uuid)", [idb, id]);
    expect(await drawState(db, id)).toMatchObject({ amount_paid: "30000.00", date_paid: "2026-09-20" });
    expect(await receipts(db, id, false)).toHaveLength(2); // history is kept, just marked void
  });

  it("voiding the same receipt twice is a harmless no-op", async () => {
    const { id, idb } = await twoReceipts();
    await db.query("select void_draw_payment($1::uuid, $2::uuid)", [idb, id]);
    const again = await db.query<{ v: { was_noop: boolean } }>(
      "select void_draw_payment($1::uuid, $2::uuid) as v",
      [idb, id]
    );
    expect(again.rows[0].v.was_noop).toBe(true);
    expect((await drawState(db, id)).amount_paid).toBe("30000.00");
  });

  it("refuses to void a receipt that belongs to a different draw", async () => {
    const { ida } = await twoReceipts();
    const other = await newDraw(db);
    await expect(db.query("select void_draw_payment($1::uuid, $2::uuid)", [ida, other])).rejects.toThrow(/not found/);
  });

  it("corrects a receipt atomically: old one voided, replacement recorded, totals refreshed", async () => {
    const { id, idb } = await twoReceipts();
    await db.query(
      "select correct_draw_payment($1::uuid, $2::uuid, 25000::numeric, '2026-10-12'::date, 'fix-1')",
      [idb, id]
    );
    expect(await drawState(db, id)).toMatchObject({ amount_paid: "55000.00", date_paid: "2026-10-12" });
    const live = await receipts(db, id);
    expect(live.map((r) => r.amount)).toEqual(["30000.00", "25000.00"]);
  });

  it("a retried correction (same key) returns the replacement and doesn't apply twice", async () => {
    const { id, idb } = await twoReceipts();
    const call = () =>
      db.query<{ c: { was_duplicate: boolean } }>(
        "select correct_draw_payment($1::uuid, $2::uuid, 25000::numeric, '2026-10-12'::date, 'fix-retry') as c",
        [idb, id]
      );
    expect((await call()).rows[0].c.was_duplicate).toBe(false);
    expect((await call()).rows[0].c.was_duplicate).toBe(true);
    expect((await drawState(db, id)).amount_paid).toBe("55000.00");
  });

  it("a failed correction (bad amount) leaves the original receipt live — nothing half-applied", async () => {
    const { id, idb } = await twoReceipts();
    await expect(
      db.query("select correct_draw_payment($1::uuid, $2::uuid, 0::numeric, '2026-10-12'::date)", [idb, id])
    ).rejects.toThrow(/greater than zero/);
    expect((await drawState(db, id)).amount_paid).toBe("50000.00");
    expect(await receipts(db, id)).toHaveLength(2);
  });

  it("cannot correct a receipt that was already voided", async () => {
    const { id, idb } = await twoReceipts();
    await db.query("select void_draw_payment($1::uuid, $2::uuid)", [idb, id]);
    await expect(
      db.query("select correct_draw_payment($1::uuid, $2::uuid, 1::numeric, '2026-10-12'::date)", [idb, id])
    ).rejects.toThrow(/live payment not found/);
  });
});

describe("draw lifecycle", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await freshDb();
  }, 60000);

  it("hard-deleting a draw (the purge-trash cron) removes its receipts instead of failing on the foreign key", async () => {
    const id = await newDraw(db);
    await record(db, id, 1000, "2026-09-01");
    await db.query("delete from inv_owner_draws where id = $1", [id]);
    const left = await db.query("select 1 from inv_draw_payments where draw_id = $1", [id]);
    expect(left.rows).toHaveLength(0);
  });

  it("soft-deleting a draw leaves its receipts in place, so restoring brings the history back", async () => {
    const id = await newDraw(db);
    await record(db, id, 1000, "2026-09-01");
    await db.query("update inv_owner_draws set deleted_at = now() where id = $1", [id]);
    expect(await receipts(db, id)).toHaveLength(1);
    await db.query("update inv_owner_draws set deleted_at = null where id = $1", [id]);
    await record(db, id, 500, "2026-09-02"); // works again after restore, no drift
    expect((await drawState(db, id)).amount_paid).toBe("1500.00");
  });
});
