# Dev Log

A running record of work sessions on this app. Time is a floor, not exact —
see [`npm run time-log`](scripts/time-log.mjs) for the authoritative,
git-derived numbers behind these entries (commit-gap clustering, +15min
buffer per session). This file adds the "what" and "why" that commit
messages don't capture at a glance.

**Convention:** add one entry per work session, newest first, before ending
the session. Keep it to 2-4 bullets — what shipped and why it mattered, not
a commit-by-commit transcript.

---

## 2026-09-04 (later)
- Weekend day-of-month due dates now roll back to the prior Friday (e.g. Oct 25, 2026 → Fri Oct 23). Added cadence fields to Add Project (previously Edit-only) and server-side range validation on draw_due_day — caught and fixed a real regression along the way: EditProjectModal had no error handling, so the new validation crashed to Next's full error page instead of showing inline.

## 2026-09-04
- Found Workflow was missing an entire flow for the draw-cadence feature (data architecture and AI-tools sections had been updated, but not the flow diagram itself, or "Where Things Live"). Added Flow 7 and the missing file references. Help page also didn't mention the new 20MB upload cap — added.

## 2026-09-03 (night)
- Added getDrawScheduleStatus so the chat assistant can finally see the draw-cadence data — before this, "which invoices do I need to work on" could only describe draws that already exist, blind to a project needing a brand-new draft per its schedule. Verified live: the assistant now folds cadence status into that answer.
- Fixed a second gap in the cadence feature: isDrawOverdue/isDrawUrgent/nextDrawLabel never checked project status, so a closed project could nag red/bold forever if it still had a cadence set from when it was active. Gated all three on active status.

## 2026-09-03 (even later)
- Fixed a timezone bug in the period-matching code from earlier today: bare "YYYY-MM-DD" dates (period_end/date_submitted) parsed as UTC midnight shift to the previous day — and for the 1st of a month, the previous month — in any timezone behind UTC. Would have broken the just-added cycle check exactly at month boundaries. Confirmed and fixed.

## 2026-09-03 (later)
- Found and fixed a real gap while spot-checking Corinth/Delmas: the cycle-satisfied check matched on when a draw *record was created*, not the period it bills for — a late August draft (created Sept 2) would have silently satisfied September's cadence too. Now matches on period_end/date_submitted instead. Also switched "Next Draw" from a generic "Due last Thursday" to the resolved calendar date ("Due Sep 24"), computed once server-side per project instead of recomputed client-side.

## 2026-09-03
- "Next Draw" column now turns red/bold starting 5 days before the due date (not just once overdue) — same "no draw created yet this cycle" check, so it clears the moment a draft exists and the next cycle's date takes over automatically since due dates are computed live, never stored.

## 2026-09-02 (late night)
- New feature: recurring draw cadence per project. Added `draw_due_type`/`draw_due_day` to inv_projects (day-of-month or last-weekday-of-month, editable in Edit Project), a `lib/drawSchedule.ts` helper that flags a project "overdue" once its cycle's due date passes with no draw created yet, a dashboard alert banner listing overdue projects, and a "Next Draw" column in the by-project table. Seeded per the actual schedule: Aneta/Pacific/Centinela/Hi Point/St. Rest on the 25th, Broadway/Gilmore/Victoria on the 15th, Delmas/Corinth on the last Thursday; Valley left unscheduled (wrapping up soon). Email reminders noted as a likely follow-up once this lands.

## 2026-09-02 (night)
- Replaced the inline "Draft" badge in the by-project table with a dedicated Draft column showing the dollar amount directly (amber when nonzero) instead of hiding it behind a hover tooltip.

## 2026-09-02 (evening)
- Draft Invoices Total now highlights amber ("Needs to be submitted") whenever there's real draft $ sitting around — same warning color used elsewhere for "needs attention," so it reads as a priority action item instead of a neutral stat. Reverts to the plain card style when there are no drafts.

## 2026-09-02 (later)
- Repositioned "Draft Invoices Total" next to "Open Draws" (same draw-pipeline family) instead of sitting alone next to the placeholder boxes, and added a "Not yet submitted" subtitle so it doesn't read as already-billed money next to the other $ totals.

## 2026-09-02
- Moving a draw's status to "submitted" via the status dropdown now auto-fills the submitted date (if not already set) — matches the existing approved/paid auto-fill behavior, which had no equivalent for submitted.

## 2026-09-01 (night)
- Added a "Draft invoices total" dashboard stat, plus 3 unfilled boxes reserved for stats to come.
- Draft draws now show up in the dashboard's Open Draws table (previously invisible there entirely) so status can be changed with one click, without opening the project — kept out of the dollar totals and aging summary since they're not real invoices yet.

## 2026-09-01 (evening)
- Capped G702/G703 uploads at 20MB, client- and server-side. Previously the server buffered the whole file into memory before any validation ran — no limit stood between an arbitrarily large upload and the xlsx/PDF parser.

## 2026-09-01 (later)
- **Security fix**: the login page's `?next=` redirect target was read straight from the URL and passed unvalidated to `router.push()`. A crafted link to the real app domain (`/login?next=https://evil.example`) redirected a user to an attacker's site immediately after they entered their real passcode — reproduced end-to-end locally. Now rejects anything that isn't a same-origin relative path.

## 2026-09-01
- Mobile pass at 375px: fixed the floating chat bubble permanently covering bottom-right action links (e.g. "Mark Paid") with no way to scroll clear of it; fixed the Draw form's 3-column date row clipping to "mm/dd" on phones; fixed the Draw form's Schedule of Values table being clipped with no horizontal scroll, making the rightmost columns unreachable.
- Flagged over-drawn Schedule of Values line items in red, in both the SoV tab and the live Draw form's allocation table (Balance/Balance to Finish going negative had no visual warning before).
- Reviewed dark mode and the Add/Edit Project, Add Line, and Edit Project modals (mobile) for contrast/layout issues — none found.

## 2026-08-31, 6:41–7:00 PM (~19m)
- UI/UX pass: filled two `aria-hidden` empty placeholder boxes on the dashboard (Total Retainage Held, Open Draws) that had sat blank since early on.
- Fixed Billing Summary's "Outstanding" figures showing red even when negative — a negative value there just means more was received than billed in that specific bucket (cash-basis quarter split), not money owed; now only red when actually positive.

## 2026-08-31, 6:14–6:41 PM (~42m)
- **Critical security fix**: found that every table's RLS policy allowed full anon read/write, and the server used the anon key (`NEXT_PUBLIC_`-prefixed, shipped to every browser) — meaning anyone could pull the anon key from the JS bundle and read/write the entire database directly via Supabase's REST API, completely bypassing the passcode. Verified exploitable with a plain `curl` before the fix, and blocked afterward. Switched the server to the service-role key and locked down RLS to default-deny for anon/authenticated.
- Removed the now-fully-unused client-side Supabase client.
- Fixed Workflow/Help docs left stale by the fix above and an older "Mark Paid" behavior change.

## 2026-08-31, 3:07–3:20 PM (~27m)
- Upgraded `xlsx` (parses every uploaded G702/G703 file) off a version with two unpatched high-severity CVEs — npm's registry doesn't carry the fix, had to install from SheetJS's own CDN.
- Raised the chat API's timeout from 30s to 120s — too tight for a multi-tool-call agent turn.

## 2026-08-31, 11:26 AM–12:25 PM (~1h)
- Brought the Workflow doc's AI Assistant flow current with the 5 new tools added earlier the same day.
- Added a git-derived time-log script, this DEVLOG, and CLAUDE.md session conventions.
- Closed a real data-integrity gap: no layer (DB, chat tools, or manual forms) rejected a negative dollar amount on a draw or budget line. Added DB `CHECK` constraints plus matching validation everywhere else.

## 2026-08-31, 9:02–10:04 AM (~1h17m)
- Fixed drag-and-drop for G702 upload, and a duplicate-draw-number bug (added a DB unique constraint + friendly error instead of a raw crash).
- Fixed the assistant rendering markdown tables as raw `| a | b |` text.
- Added `getRecentPayments`, `getAgingSummary`, `getBillingSummary`, `getScheduleOfValues`, and `updateDraw` tools to the AI assistant — closing gaps where it could only answer some questions by looping over every project instead of one call, or couldn't answer/act at all.
- Fixed "approved" status not auto-filling the approved dollar amount, the same way "paid" already auto-fills the paid amount.

## 2026-08-27, 9:13–9:25 PM (~28m)
- Fixed Balance to Complete and % Billed of Contract to include retainage held — they were quietly overstating remaining balance by whatever had been billed-but-retained.

## 2026-08-27, 4:50–5:32 PM (~57m)
- Fixed the schedule-of-values mismatch warning to account for retention (gross vs. net G702 accounting) and paginated a per-project query against the same 1000-row Supabase cap that once caused a bigger bug.

## 2026-08-27, 2:33–2:38 PM (~21m)
- Softened light-mode chip/badge colors to match dark mode's restraint.

## 2026-08-27, 10:08 AM–12:53 PM (~3h)
- Dashboard stat fills, partial-pay support, SoV mismatch warning, collections filters.
- Renamed Budget → Schedule of Values; multiple header/logo restyles and color tuning passes.

## 2026-08-26, 7:54 PM (~15m)
- Made the app mobile-responsive.

## 2026-08-26, 5:01–5:56 PM (~1h9m)
- Removed the unused lender-portal budget parser; fixed a crash on bad project links and a silent budget-line truncation bug.
- Added the aging view, a 60+ day alert banner, and the Billing Summary page.

## 2026-08-26, 1:16–3:55 PM (~2h54m)
- Counted underpaid draws as still open; added Project Budget/Balance-to-Complete/Retainage to the dashboard.
- Added a lender-portal (Conventus/SwiftDraws) PDF parser; removed subcontractor invoice tracking.
- Added Google Places address autocomplete (three iterations to land on a reliable loader).

## 2026-08-26, 10:50–11:55 AM (~1h20m)
- Added per-draw schedule of values with cents precision and G703 auto-fill, plus a configurable retention rate.

## 2026-08-26, 9:51–10:05 AM (~28m)
- Fixed a production crash from `pdf-parse`'s DOMMatrix dependency and a missing worker file in the deploy bundle.

## 2026-08-25, 10:45–11:12 PM (~42m)
- Fixed the AI assistant not blocking input during a pending write approval; added PDF upload support for G702 draws.

## 2026-08-25, 5:52–6:30 PM (~53m)
- Added project/budget management, the "How it works" page, and the AI assistant (as a floating bubble), switching it to call Anthropic directly.

## 2026-08-25, 4:01–4:31 PM (~45m)
- Initial build: dashboard, owner draws, project CRUD.
