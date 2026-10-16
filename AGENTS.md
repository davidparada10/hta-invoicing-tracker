# Project instructions

- When a functional change is made (a fix, a new feature, a behavior change), update
  [`/help`](app/help/page.tsx) and [`/workflow`](app/workflow/page.tsx) in the same
  session if the change affects what those pages describe.
- At the end of a work session, add an entry to [`DEVLOG.md`](DEVLOG.md) — newest first,
  2-4 bullets on what shipped and why, not a commit-by-commit transcript. Run
  `npm run time-log` for the actual session time/commit range to put in the entry heading.
