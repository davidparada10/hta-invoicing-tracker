// Bounds Anthropic API cost on /api/chat. The app has no per-user auth (a
// single shared passcode), so anyone behind it could otherwise script
// repeated calls with only the request's own 120s timeout as a backstop.
// Generous by design — this is an abuse/cost guard, not a security gate like
// the login rate limiter — so normal interactive chatting never hits it.

import { createServerSupabaseClient } from "@/lib/supabase/server";

const MAX_REQUESTS = 30;
const WINDOW_MINUTES = 5;

// Rows older than a day can no longer affect any rate-limit decision (the
// window is 5 minutes) — sweep them on a small fraction of requests so the
// table doesn't grow unbounded across every distinct IP that's ever chatted,
// same approach as lib/auth/rateLimit.ts's login-attempt pruning.
async function pruneStaleChatRateLimit(
  supabase: ReturnType<typeof createServerSupabaseClient>
): Promise<void> {
  if (Math.random() > 0.05) return;
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await supabase.from("inv_chat_rate_limit").delete().lt("window_start", cutoff);
}

export async function checkChatRateLimit(
  ip: string
): Promise<{ limited: boolean; retryAfterSeconds?: number }> {
  const supabase = createServerSupabaseClient();
  const now = new Date();

  await pruneStaleChatRateLimit(supabase);

  const { data } = await supabase
    .from("inv_chat_rate_limit")
    .select("request_count, window_start")
    .eq("ip", ip)
    .maybeSingle();

  const windowExpired =
    !data || now.getTime() - new Date(data.window_start).getTime() > WINDOW_MINUTES * 60 * 1000;

  if (!windowExpired && data.request_count >= MAX_REQUESTS) {
    const retryAfterSeconds = Math.ceil(
      (new Date(data.window_start).getTime() + WINDOW_MINUTES * 60 * 1000 - now.getTime()) / 1000
    );
    return { limited: true, retryAfterSeconds: Math.max(retryAfterSeconds, 1) };
  }

  await supabase.from("inv_chat_rate_limit").upsert({
    ip,
    request_count: windowExpired ? 1 : data.request_count + 1,
    window_start: windowExpired ? now.toISOString() : data.window_start,
  });

  return { limited: false };
}
