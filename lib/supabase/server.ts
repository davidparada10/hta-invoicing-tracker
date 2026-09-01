import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client. Uses the service-role (secret) key, which
// bypasses RLS and is never exposed to the browser. The app's shared-passcode
// middleware (see lib/auth) only gates the Next.js pages/routes themselves —
// it does nothing to protect Supabase's own REST API, which is a separately
// internet-reachable service. Using the anon/publishable key here previously
// meant every table's RLS policy had to allow full anon CRUD for the server
// to work at all, which meant anyone who extracted that key from the client
// JS bundle (NEXT_PUBLIC_ vars ship to the browser) could read/write every
// table directly, with no passcode involved.
export function createServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars"
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
