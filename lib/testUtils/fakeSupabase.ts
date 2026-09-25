// A minimal in-memory fake of the subset of the Supabase query builder this
// app's Server Actions and AI tools actually use (select/eq/is/order/range/
// maybeSingle/single/update/insert) — enough to exercise real mutation
// functions end to end against synthetic fixtures, without a real database.
// Shared by lib/data.test.ts, app/draws/actions.test.ts, and
// lib/tools/write-tools.test.ts.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export interface FakeSupabaseOptions {
  // Fires once, right after the first successful read that returns a row
  // from the given table — for simulating a row changing (e.g. soft-deleted,
  // reassigned) *between* a function's lookup and its own write, the same
  // race a real concurrent request could cause. Deleted after firing once.
  raceHooks?: Record<string, (row: Row) => void>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createFakeSupabase(tables: Record<string, Row[]>, options: FakeSupabaseOptions = {}): any {
  const raceHooks = { ...options.raceHooks };

  return {
    from(table: string) {
      if (!tables[table]) tables[table] = [];
      let op: "select" | "update" | "insert" = "select";
      let patch: Row = {};
      let toInsert: Row[] = [];
      let predicate: (r: Row) => boolean = () => true;

      function applyFilter(fn: (r: Row) => boolean) {
        const prev = predicate;
        predicate = (r) => prev(r) && fn(r);
      }

      function execute(): Row[] {
        if (op === "insert") {
          tables[table].push(...toInsert);
          return toInsert;
        }
        const matched = tables[table].filter(predicate);
        if (op === "update") {
          for (const row of matched) Object.assign(row, patch);
        }
        return matched;
      }

      function fireRaceHookIfAny(row: Row | undefined) {
        const hook = raceHooks[table];
        if (hook && row) {
          hook(row);
          delete raceHooks[table];
        }
      }

      const builder = {
        select() {
          return builder;
        },
        eq(col: string, val: unknown) {
          applyFilter((r) => r[col] === val);
          return builder;
        },
        is(col: string, val: unknown) {
          applyFilter((r) => r[col] === val);
          return builder;
        },
        order() {
          return builder;
        },
        update(values: Row) {
          op = "update";
          patch = values;
          return builder;
        },
        insert(rows: Row | Row[]) {
          op = "insert";
          toInsert = Array.isArray(rows) ? rows : [rows];
          return builder;
        },
        range() {
          const rows = execute();
          return Promise.resolve({ data: rows, error: null });
        },
        // Real Supabase query builders are themselves thenable — code that
        // does `const { data, error } = await supabase.from(x).select()...`
        // with no terminal .single()/.maybeSingle()/.range() call (e.g.
        // getProjects()) relies on that. Without this, `await builder`
        // resolves to the builder object itself, not a { data, error }
        // shape, and destructuring silently produces `data: undefined`.
        then(resolve: (v: { data: Row[]; error: null }) => void) {
          resolve({ data: execute(), error: null });
        },
        maybeSingle() {
          const rows = execute();
          if (op === "select") fireRaceHookIfAny(rows[0]);
          return Promise.resolve({ data: rows[0] ?? null, error: null });
        },
        single() {
          const rows = execute();
          if (op === "select") fireRaceHookIfAny(rows[0]);
          if (rows.length === 0) {
            return Promise.resolve({
              data: null,
              error: { code: "PGRST116", message: "no rows returned" },
            });
          }
          return Promise.resolve({ data: rows[0], error: null });
        },
      };
      return builder;
    },
  };
}
