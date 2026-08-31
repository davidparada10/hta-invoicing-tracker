#!/usr/bin/env node
// Estimates time spent building the app from git commit history.
//
// Clusters commits into "sessions" using a gap threshold — commits less than
// SESSION_GAP_MINUTES apart are treated as one continuous session, since a
// commit marks the end of a chunk of work rather than the start. Each
// session's duration gets a small buffer added (SESSION_BUFFER_MINUTES) to
// account for the work that led up to its first commit.
//
// This only sees committed work — time spent reading, testing, or discussing
// without a commit isn't counted, so treat the total as a floor, not exact.
//
// Usage: node scripts/time-log.mjs [--since=<git-date-expr>] [--json]

import { execSync } from "node:child_process";

const SESSION_GAP_MINUTES = 45;
const SESSION_BUFFER_MINUTES = 15;

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const sinceArg = args.find((a) => a.startsWith("--since="));
const since = sinceArg ? sinceArg.split("=")[1] : null;

function getCommits() {
  const sinceFlag = since ? `--since="${since}"` : "";
  const raw = execSync(`git log ${sinceFlag} --reverse --format="%at|%s"`, {
    encoding: "utf8",
    cwd: new URL("..", import.meta.url).pathname,
  }).trim();
  if (!raw) return [];
  return raw.split("\n").map((line) => {
    const [ts, ...rest] = line.split("|");
    return { time: Number(ts), subject: rest.join("|") };
  });
}

function clusterSessions(commits) {
  const sessions = [];
  let current = { start: commits[0].time, end: commits[0].time, commits: [commits[0]] };

  for (const commit of commits.slice(1)) {
    if (commit.time - current.end > SESSION_GAP_MINUTES * 60) {
      sessions.push(current);
      current = { start: commit.time, end: commit.time, commits: [commit] };
    } else {
      current.end = commit.time;
      current.commits.push(commit);
    }
  }
  sessions.push(current);
  return sessions;
}

function formatDuration(minutes) {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

const commits = getCommits();
if (commits.length === 0) {
  console.log("No commits found.");
  process.exit(0);
}

const sessions = clusterSessions(commits);
const rows = sessions.map((s) => {
  const rawMinutes = (s.end - s.start) / 60;
  const bufferedMinutes = rawMinutes + SESSION_BUFFER_MINUTES;
  return {
    start: new Date(s.start * 1000),
    end: new Date(s.end * 1000),
    rawMinutes,
    bufferedMinutes,
    commitCount: s.commits.length,
    firstSubject: s.commits[0].subject,
    lastSubject: s.commits[s.commits.length - 1].subject,
  };
});

const totalMinutes = rows.reduce((acc, r) => acc + r.bufferedMinutes, 0);

if (asJson) {
  console.log(
    JSON.stringify(
      {
        sessions: rows.map((r) => ({
          start: r.start.toISOString(),
          end: r.end.toISOString(),
          minutes: Math.round(r.bufferedMinutes),
          commitCount: r.commitCount,
        })),
        totalMinutes: Math.round(totalMinutes),
        totalHours: Math.round((totalMinutes / 60) * 10) / 10,
      },
      null,
      2
    )
  );
  process.exit(0);
}

console.log(`\nTime log — ${sessions.length} session${sessions.length === 1 ? "" : "s"}, ${commits.length} commits\n`);
for (const r of rows) {
  const dateStr = r.start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const startStr = r.start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const endStr = r.end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  console.log(
    `${dateStr}  ${startStr}–${endStr}  ${formatDuration(r.bufferedMinutes).padStart(8)}  (${r.commitCount} commit${
      r.commitCount === 1 ? "" : "s"
    })  ${r.lastSubject.slice(0, 60)}`
  );
}
console.log(`\nTotal: ${formatDuration(totalMinutes)} (${(totalMinutes / 60).toFixed(1)}h)\n`);
console.log(
  `Note: derived from commit timestamps only (${SESSION_GAP_MINUTES}min gap = new session, +${SESSION_BUFFER_MINUTES}min buffer per session). Undercounts uncommitted work.`
);
