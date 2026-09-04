# IslandQuiz — instructions for coding agents

These instructions are the stable project-level policy. They do not describe the
current product state. Inspect the repository and the relevant current documents
before making assumptions about behavior, architecture, routes, APIs, schemas, or
deployment.

## Scope and source of truth

- Preserve unrelated changes already present in the working tree. Do not overwrite
  or revert user work.
- Keep every change within the requested scope. Do not perform unrelated refactors,
  formatting, dependency upgrades, or cleanup.
- The current code and configuration are the primary source of truth. Treat project
  documentation as secondary context and verify it against the affected code when it
  matters.
- Use the smallest relevant context: frontend code is under `frontend/`; backend code
  is under `backend/`; operational and architectural context is under `docs/`.
- Do not invent architectural, product, security, persistence, or deployment
  decisions. If the repository does not establish a safe answer, explain the gap.

## Safety and Git

- Never expose, add, or copy secrets, credentials, private keys, `.env` files, JWT
  secrets, service-role keys, or API keys into code, documentation, logs, or Git.
- Do not perform destructive database, filesystem, production-infrastructure, or
  history operations without an explicit request and clearly resolved targets.
- Do not commit, push, or deploy unless the owner explicitly requests that exact
  action. A code change or verification request is not permission for any of them.
- Do not silently change production infrastructure, production data, or production
  secrets.

## Implementation and verification

- Inspect the affected code and its consumers before changing a contract, shared
  state, persistence shape, authentication, authorization, or external integration.
- Keep layering and existing interfaces intact unless the task explicitly changes
  them. Prefer a minimal coherent fix over broad redesign.
- Verification must be proportional to scope and risk. Start with the cheapest
  credible static or targeted check; expand only when the affected behavior or
  acceptance criteria require it.
- Separate pre-existing failures and warnings from regressions caused by the current
  change. Do not broaden scope to repair an unrelated baseline.
- Report only checks that were actually run and distinguish static evidence from
  runtime evidence.

## Relevant project policies

Consult these documents only when relevant to the task:

- `docs/VERIFICATION.md` — proportional verification policy;
- `docs/DATABASE.md` — database context when schema or persistence is involved;
- `docs/DEPLOYMENT.md` — deployment context when deployment is explicitly in scope;
- `docs/DECISIONS.md` — recorded decisions when an existing decision is relevant.

The files in `docs/` are not a substitute for checking current code when their
contents may have become stale.
