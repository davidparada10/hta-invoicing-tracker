import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  verifyPasscode,
} from "@/lib/auth/session";
import {
  checkLoginRateLimit,
  clearLoginAttempts,
  getClientIp,
  recordFailedLogin,
} from "@/lib/auth/rateLimit";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  const { limited, retryAfterSeconds } = await checkLoginRateLimit(ip);
  if (limited) {
    const minutes = Math.ceil((retryAfterSeconds ?? 0) / 60);
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds ?? 900) } }
    );
  }

  const { passcode } = await request.json().catch(() => ({ passcode: "" }));

  if (typeof passcode !== "string" || !verifyPasscode(passcode)) {
    await recordFailedLogin(ip);
    return NextResponse.json({ error: "Incorrect passcode" }, { status: 401 });
  }

  await clearLoginAttempts(ip);
  const token = await createSessionToken();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
