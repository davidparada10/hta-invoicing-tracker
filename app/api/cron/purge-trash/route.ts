import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const RETENTION_DAYS = 30;

// Vercel Cron calls this on schedule (see vercel.json) with the standard
// "Authorization: Bearer $CRON_SECRET" header — same gate as the digest
// cron, so this can't be triggered from the public internet.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const supabase = createServerSupabaseClient();

  try {
    const [draws, budgetLines] = await Promise.all([
      supabase
        .from("inv_owner_draws")
        .delete()
        .not("deleted_at", "is", null)
        .lt("deleted_at", cutoff)
        .select("id"),
      supabase
        .from("inv_project_budget_lines")
        .delete()
        .not("deleted_at", "is", null)
        .lt("deleted_at", cutoff)
        .select("id"),
    ]);
    if (draws.error) throw draws.error;
    if (budgetLines.error) throw budgetLines.error;

    return NextResponse.json({
      purgedDraws: draws.data?.length ?? 0,
      purgedBudgetLines: budgetLines.data?.length ?? 0,
    });
  } catch (err) {
    console.error("purge-trash cron error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Purge failed" },
      { status: 500 }
    );
  }
}
