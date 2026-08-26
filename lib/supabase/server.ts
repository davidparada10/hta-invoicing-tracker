import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client. Uses the anon/publishable key — table RLS is
// intentionally open since access to the app itself is gated by the
// shared-passcode middleware (see lib/auth), not per-user Supabase auth.
export function createServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY env vars"
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false },
    // Next.js/Vercel cache fetch() responses by default (its Data Cache is
    // persistent across deployments, so a write from one environment — e.g.
    // a local dev server — can't invalidate a stale read cached by another,
    // like production). Every Supabase read is a fetch under the hood, and
    // this data changes on every write, so opt every request out of that
    // cache explicitly instead of relying on revalidatePath() to catch it.
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}
