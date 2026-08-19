---
name: debug-loop
description: Reproduce and verify an IslandQuiz runtime bug that survived a previously reported fix.
metadata:
  short-description: Debug a surviving runtime bug
---

# IslandQuiz debug loop

When a reported fix passed checks but the issue remains, stop blind patching. Read the
new failure and previous implementation, then identify the verification gap: missing
E2E coverage, unrealistic mock, wrong execution path, stale fixture, contract mismatch,
environment difference, async timing, or nullable runtime state.

Reproduce the original failure when feasible and create or identify a deterministic
regression check. Follow RED (failure reproduced), FIX (smallest justified change),
GREEN (the same check passes), then exercise the original user-visible/runtime path
again. Do not conclude success from a new unit test alone.

Use exploration only if the primary investigation cannot distinguish plausible causes.
Use the read-only `reviewer` when the bug survived multiple fixes or the change affects
security, contracts, state ownership, persistence, scoring, or another risky boundary.

Report the actual root cause, why earlier checks missed it, regression check added or
identified, exact checks now passing, runtime verification result, and remaining
uncertainty. Never claim DONE while the original failure is unverified.
