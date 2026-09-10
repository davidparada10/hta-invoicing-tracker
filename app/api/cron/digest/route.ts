import { NextRequest, NextResponse } from "next/server";
import { buildDigestContent } from "@/lib/digest";
import { sendGraphMail } from "@/lib/msGraph";

export const dynamic = "force-dynamic";

// Vercel Cron calls this on schedule (see vercel.json) with the standard
// "Authorization: Bearer $CRON_SECRET" header — reject anything else so this
// can't be used to spam the recipient list from the public internet.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const recipients = (process.env.DIGEST_RECIPIENT_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (recipients.length === 0) {
    return NextResponse.json({ error: "DIGEST_RECIPIENT_EMAILS is not set" }, { status: 500 });
  }

  try {
    const content = await buildDigestContent();
    if (!content) {
      return NextResponse.json({ sent: false, reason: "nothing to report" });
    }

    await sendGraphMail({ to: recipients, subject: content.subject, html: content.html });
    return NextResponse.json({ sent: true, subject: content.subject, recipients });
  } catch (err) {
    console.error("digest cron error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Digest failed" },
      { status: 500 }
    );
  }
}
