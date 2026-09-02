// Throttles brute-forcing the shared site passcode. Vercel Functions are
// stateless/serverless — an in-memory counter wouldn't survive between
// invocations or be shared across concurrent instances — so the counter
// lives in Supabase (inv_login_attempts), the app's existing durable store,
// keyed by client IP.
//
// Window and lockout are deliberately the same length (15 min): once a
// lockout is set, by the time it naturally expires the counting window has
// necessarily aged past WINDOW_MINUTES too, so the next failed attempt
// always starts a fresh window instead of resuming a stale count.

import { ipAddress } from "@vercel/functions";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const MAX_FAILED_ATTEMPTS = 10;
const WINDOW_MINUTES = 15;
const LOCKOUT_MINUTES = 15;

export function getClientIp(request: Request): string {
  return ipAddress(request) ?? "unknown";
}

export async function checkLoginRateLimit(
  ip: string
): Promise<{ limited: boolean; retryAfterSeconds?: number }> {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("inv_login_attempts")
    .select("locked_until")
    .eq("ip", ip)
    .maybeSingle();

  if (!data?.locked_until) return { limited: false };

  const msRemaining = new Date(data.locked_until).getTime() - Date.now();
  if (msRemaining <= 0) return { limited: false };

  return { limited: true, retryAfterSeconds: Math.ceil(msRemaining / 1000) };
}

// Rows older than a day can no longer affect any rate-limit decision (window
// and lockout are both 15 minutes) — opportunistically sweep them on a small
// fraction of failed logins so the table doesn't grow unbounded over years of
// legitimate fat-fingered passcodes, without needing a separate cron job.
async function pruneStaleLoginAttempts(
  supabase: ReturnType<typeof createServerSupabaseClient>
): Promise<void> {
  if (Math.random() > 0.05) return;
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await supabase.from("inv_login_attempts").delete().lt("window_start", cutoff);
}

export async function recordFailedLogin(ip: string): Promise<void> {
  const supabase = createServerSupabaseClient();
  const now = new Date();

  await pruneStaleLoginAttempts(supabase);

  const { data } = await supabase
    .from("inv_login_attempts")
    .select("failed_count, window_start")
    .eq("ip", ip)
    .maybeSingle();

  const windowExpired =
    !data ||
    now.getTime() - new Date(data.window_start).getTime() > WINDOW_MINUTES * 60 * 1000;

  const nextCount = windowExpired ? 1 : data.failed_count + 1;
  const lockedUntil =
    nextCount >= MAX_FAILED_ATTEMPTS
      ? new Date(now.getTime() + LOCKOUT_MINUTES * 60 * 1000).toISOString()
      : null;

  await supabase.from("inv_login_attempts").upsert({
    ip,
    failed_count: nextCount,
    window_start: windowExpired ? now.toISOString() : data.window_start,
    locked_until: lockedUntil,
  });
}

export async function clearLoginAttempts(ip: string): Promise<void> {
  const supabase = createServerSupabaseClient();
  await supabase.from("inv_login_attempts").delete().eq("ip", ip);
}
