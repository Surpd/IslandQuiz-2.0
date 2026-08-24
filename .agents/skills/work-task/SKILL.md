---
name: work-task
description: Implement a normal IslandQuiz roadmap or backlog task with focused verification and selective delegation.
metadata:
  short-description: Implement and verify an IslandQuiz task
---

# IslandQuiz work task

Use one primary agent by default. Read the task in `docs/ROADMAP.md`, `docs/WORKPLAN.md`,
and `docs/BACKLOG.md`, then follow only the relevant references in the project docs.
Establish the user-visible result, acceptance criteria, affected subsystem, and cheapest
credible verification path. Check `git status` first and preserve unrelated user work.

Do not repeat a general architecture audit or reread unrelated documentation. Do not
spawn a subagent for trivial or well-understood work. Use built-in exploration only for
broad/cross-cutting investigation, an unclear root cause, an unfamiliar subsystem, or
several competing hypotheses.

Implement the smallest coherent change in the existing architecture. Avoid unrelated
refactoring. Run the narrowest useful checks first, then verify the real affected path:
targeted tests, API/integration checks, typecheck/build, and browser/E2E or direct API
exercise when applicable. Follow `docs/VERIFICATION.md` and use the smallest credible
check first. A build, lint, typecheck, or unit suite alone does not prove a
user-facing runtime task. Reproduce runtime bugs when feasible and add a focused
regression check when practical; do not add tests that merely mirror implementation.

For frontend changes, run the relevant targeted Playwright test first. The full smoke
suite uses mocked auth/games/results APIs and covers only login, Quiz Builder, save,
Library reopen, offline player, and answer/finish; it is not evidence for real
persistence, Telegram, AI, online rooms, permissions, or production results. Run
`cd frontend; npm run test:e2e` only when the change is broad/high-risk or acceptance
criteria require it. Use more targeted regression or integration checks when the task
reaches those areas.

Use the custom `reviewer` only for auth, authorization, permissions, WebSockets, scoring,
security, database consistency, AI contracts, major state changes, broad changes,
surviving fixes, ambiguous evidence, or an explicit request. If it returns material
FAIL findings, validate them against repository evidence, fix valid blockers, rerun
focused checks, and request one justified re-check. Do not loop on optional findings.

Update roadmap/workplan/backlog only when project state actually changed. Never mark a
task DONE without satisfying its acceptance criteria.

Finish with: task/result, changed files, checks, runtime verification, reviewer used and
why/result, regression coverage, and remaining risks. Never invent command or browser
results.

Usage policy: primary agent first; no automatic fan-out; delegate only when confidence
per token improves; prefer targeted checks; broaden verification only after they pass.
