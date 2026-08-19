---
name: verify-task
description: Independently verify that a completed IslandQuiz task satisfies its acceptance criteria and real runtime behavior.
metadata:
  short-description: Verify an implemented IslandQuiz task
---

# IslandQuiz verification

Answer: “Does the completed work actually satisfy the task?” Read the task and
acceptance criteria, inspect `git diff` and relevant surrounding code, identify the
user-visible or runtime proof, and inspect the relevant tests.

Run focused automated checks first, then exercise the affected flow when feasible.
Check browser/runtime errors for frontend work and frontend/backend/API contracts when
applicable. Look specifically for static checks passing while runtime behavior remains
broken, nullable values, incorrect error paths, persistence gaps, authorization errors,
and tests asserting the wrong thing. A build, typecheck, lint, or unit suite alone is
never sufficient evidence for a user-facing runtime bug.

When a frontend change can affect the existing smoke path, run `cd frontend; npm run
test:e2e`. Treat its result as evidence only for the mocked login → Quiz Builder → save
→ Library reopen → offline player → answer/finish flow. It does not verify real
backend/Supabase persistence, Telegram, AI, online rooms, permissions, or production
results; add targeted regression/integration checks for those subsystems.

Use the read-only `reviewer` for sufficiently risky work or when independent review is
requested. Do not change application code unless the user explicitly asks for fixes.

Return `PASS` or `FAIL`, followed by concise evidence. Distinguish pre-existing baseline
failures from regressions introduced by the task, and never claim a check passed unless
it was actually run.
