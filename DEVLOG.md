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

## 2026-08-31, 11:26 AM–12:11 PM (~1h)
- Brought the Workflow doc's AI Assistant flow current with the 5 new tools added earlier the same day.

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
