import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  verifyPasscode,
} from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const { passcode } = await request.json().catch(() => ({ passcode: "" }));

  if (typeof passcode !== "string" || !verifyPasscode(passcode)) {
    return NextResponse.json({ error: "Incorrect passcode" }, { status: 401 });
  }

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
