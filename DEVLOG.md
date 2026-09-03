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

## 2026-09-03
- Fixed a real "AGE" bug on Open Draws, caught via 6122 Victoria draw #7: it was created as a draft with date_submitted already set to 2026-08-25 (the G702/xlsx parser guesses this from the billing period at import), then later flipped to submitted — but both status-change paths (the quick dropdown and the Edit Draw modal) only auto-stamped date_submitted/date_approved when that field was empty, so the parser's guessed date silently survived instead of the real submission date, showing 9 days old instead of a few hours. Both paths now key off the actual status transition instead of field-emptiness; the Edit Draw modal additionally respects a date the user deliberately typed over the pre-filled one. Verified all three cases (dropdown, modal with untouched date, modal with an edited date) against a disposable test project, then corrected Victoria draw #7's date_submitted to today.

## 2026-09-02 (evening, second pass)
- Found the same date-parsing bug (already fixed twice this session in lib/drawSchedule.ts and lib/format.ts) lurking in two more files: lib/aging.ts's daysOpen() and lib/billing.ts's yearAndQuarterOf()/daysToPay() all parsed bare "YYYY-MM-DD" dates with plain new Date(), shifting to the wrong day (and near a boundary, the wrong quarter) in any timezone behind UTC. Extracted the fix into a shared parseLocalDate() in lib/format.ts instead of patching a fourth copy inline. Verified live: Billing Summary's quarter totals actually shifted after deploying, confirming previously-misbucketed draws now land correctly.
- AddressAutocomplete had no real fallback if the Google Maps widget ever failed to load (key revoked, quota hit, an outage) — the only other input lived inside `<noscript>`, inert with JS enabled. Added a visible, editable plain input that only steps aside once the real widget actually attaches, so the address field can never go permanently dead.
- Also caught a small gap in my own prior fix: the new inv_chat_rate_limit table had no cleanup, unlike inv_login_attempts. Added the same pruning for consistency.

## 2026-09-02 (late afternoon)
- Ran a wide, four-pronged audit (security, UX/error-handling, docs/dead-code, performance/AI-safety) and fixed most of what it found. Biggest one: re-importing a G703 schedule of values used to delete every budget line and recreate it, and inv_draw_line_allocations cascades on budget_line_id — so a routine re-import (e.g. a corrected spreadsheet) silently wiped every draw's allocation history, even for line items that hadn't changed. Now matches incoming rows to existing ones by item_number and updates in place; verified against a disposable test project that a line's ID and its $2,000 draw allocation survive a re-import that changes its value, while a genuinely-dropped line is still removed correctly.
- Added rate limiting to /api/chat (30 req/5min per IP) — it had no cost/abuse guard at all, unlike /api/login, and there's no per-user auth to fall back on. Also swapped the login rate limiter's hand-rolled X-Forwarded-For parsing for @vercel/functions' official ipAddress() helper (the suspected spoofing turned out not to be exploitable on Vercel per their own docs, but the helper is more robust regardless), pinned the AI agent's tool-loop cap explicitly instead of relying on an SDK default, and added a magnitude sanity check to budget imports (warns past a 5x swing before overwriting real numbers).
- Reordered the draw-allocation and budget-import writes to insert-before-delete so a failure partway through leaves prior data intact, added non-negative/date-range validation on draws, matched G703's 20MB upload cap to G702's (it had none), fixed Draw/Budget-line Save buttons allowing a double-submit, and gave Modal.tsx real dialog semantics (focus trap, Escape-to-close, aria-modal) — previously Tab could escape into the page behind every modal in the app. Removed one fully-unused component (StatusBadge.tsx) and added opportunistic cleanup for old inv_login_attempts rows.

## 2026-09-02 (early afternoon)
- Follow-up sweep found the same silent-failure pattern in two more places: DrawStatusSelect and ProjectStatusSelect changed a draw's/project's status inside `startTransition` with no `await`/`catch`, so a failed update left the dropdown showing the new value with no rollback and no error message. Both now revert the select and alert on failure. Also wrapped app/api/chat and app/api/login in try/catch so an unexpected error (bad request body, a rate-limit-store hiccup) returns a structured JSON error instead of an unstructured 500.
- While testing the fix, a `fetch` override meant to simulate a failed request didn't actually intercept the Server Action call — it went through for real and briefly flipped 1723 Corinth's status to "closed" before being caught and restored. Confirmed directly against the database it's back to `active`; no other side effects (project status doesn't cascade to anything).

## 2026-09-02 (midday)
- Found 3 spots with no error handling around Server Actions that throw on any Supabase error, while auditing the app post-upgrade: DrawsSection's and BudgetSection's delete handlers fired the delete inside `startTransition` with no `await`/`catch` (a failed delete silently left the row in place with zero feedback), and BudgetSection's add/edit form had no `try/catch` at all (any save error would crash to Next's full-page error boundary — the same bug already fixed once in EditProjectModal on 09-04, just not applied to its sibling modal). Brought all three in line with the established try/catch + inline-error pattern used elsewhere (MarkPaidButton, DrawFormModal, EditProjectModal). Verified live: add/edit/delete on a budget line still works end-to-end.

## 2026-09-02 (later morning)
- Upgraded Next.js 14.2.35 → 16.3.4 (React 18 → 19.2.8) to get off 5 unpatched high-severity CVEs in the 14.x line — no code changes to app behavior, purely a platform upgrade. Ran the official codemod (async params/searchParams, middleware.ts → proxy.ts rename, ESLint flat-config migration), then fixed what it got wrong: reverted an incorrectly-added `instant` route export (requires `cacheComponents`, which we're not adopting), renamed `experimental.serverComponentsExternalPackages` to top-level `serverExternalPackages` by hand, and pinned `eslint@9.39.5` after the codemod's auto-selected `eslint@10` crashed against the bundled `eslint-plugin-react`.
- Biggest real risk was Turbopack (now the default bundler) breaking the pdf-parse/dommatrix native-module workaround that's caused two prior production crashes — verified live by uploading a PDF through the Add Draw modal and confirming `parseG702Upload` still runs clean. Also spot-checked the chat assistant (AI SDK + Anthropic tool calls), login rate-limiting, billing/help/workflow pages, and mobile — all clean, no console errors.
- New `react-hooks/set-state-in-effect` lint rule (from the updated `eslint-plugin-react-hooks`) flagged 4 pre-existing, legitimate effects (hydration-safe mount flags, URL-to-state sync, modal form reset) — downgraded to a warning rather than refactoring mid-upgrade; noted in `eslint.config.mjs` for future revisiting.

## 2026-09-02 (evening)
- Rate-limited /api/login: 10 failed passcode attempts from an IP within 15 minutes locks it out for 15 minutes, even against a subsequently-correct passcode. Counter lives in a new inv_login_attempts table (RLS locked down like everything else) since Vercel Functions are stateless — an in-memory counter wouldn't survive between invocations. Verified against the real endpoint: lockout triggers on the 10th failure, blocks a correct passcode while active, and clears on success.
- Also versioned the pre-push build check with Husky (was a local-only .git/hooks script) after 5 consecutive deployments broke on an ESLint-only error that `tsc --noEmit` alone never catches.

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
