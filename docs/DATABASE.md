# IslandQuiz Database

## Source of truth

- Supabase project `IslandQuiz`, ref `epbtmudrgtjveoiaymxc`, PostgreSQL 17; inspected and migrated on 2026-08-22.
- This is a maintained snapshot, not a live schema contract. Recheck Supabase directly when it may be stale.
- Application-owned data is in `public`. Supabase-managed objects also exist in `auth`, `storage`, `realtime`, `vault` and `extensions`; application code does not use those tables directly.

## Database overview

Users own games. A game stores the complete content/configuration document in `games.data` (`jsonb`), not normalized question rows. Player Theme is not part of that persisted document: Offline launches receive it from Play Setup, while Online rooms own it in `online_rooms.state.theme`. Ratings link users to games. Quiz, Jeopardy, Millionaire and online Quiz attempts are stored in separate result tables; several result `game_id` columns are not foreign keys.

## Tables

All listed tables are in `public`. `—` means no default; `NULL` means nullable.

### users

| Column | Type | Nullable | Default | Key |
|---|---|---|---|---|
| id | text | no | — | PK |
| email | text | NULL | — | UNIQUE |
| password_hash | text | NULL | — | |
| name | text | no | — | |
| avatar | text | NULL | — | |
| bio | text | NULL | — | |
| subject | text | NULL | — | |
| role | text | NULL | `'user'` | |
| banned | boolean | NULL | `false` | |
| created_at | timestamptz | NULL | `now()` | |
| plan | text | NULL | `'free'` | |
| telegram_id | text | NULL | — | UNIQUE |
| telegram_username | text | NULL | — | |

Indexes: PK, `idx_users_email`, unique indexes on email and telegram_id (duplicate definitions exist). RLS enabled; policies are public profile SELECT and owner UPDATE.

### games

| Column | Type | Nullable | Default | Key |
|---|---|---|---|---|
| id | text | no | — | PK |
| kind | text | no | — | |
| data | jsonb | no | — | |
| owner_id | text | NULL | — | FK → users.id |
| owner_name | text | NULL | — | |
| visibility | text | NULL | `'private'` | |
| forked_from | text | NULL | — | |
| forked_owner_name | text | NULL | — | |
| tags | jsonb | NULL | — | |
| ratings_data | jsonb | NULL | — | |
| play_count | integer | NULL | `0` | |
| show_answers | boolean | NULL | `false` | |
| created_at | timestamptz | NULL | `now()` | |
| updated_at | timestamptz | NULL | `now()` | |

FK `games_owner_id_fkey` → `users(id)`. Indexes: PK, `idx_games_kind`, `idx_games_owner`, `idx_games_visibility`. RLS enabled; owner SELECT/INSERT/UPDATE/DELETE and public SELECT where `visibility = 'public'`.

### ratings

| Column | Type | Nullable | Default | Key |
|---|---|---|---|---|
| id | integer | no | sequence | PK |
| game_id | text | NULL | — | FK → games.id |
| user_id | text | NULL | — | FK → users.id |
| value | integer | NULL | — | CHECK 1..5 |
| created_at | timestamptz | NULL | `now()` | |

Indexes: PK, `idx_ratings_game`, duplicate unique indexes on `(game_id,user_id)`. RLS enabled; all SELECT plus INSERT/UPDATE own rating using `auth.uid()`.

### quiz_results

| Column | Type | Nullable | Default | Key |
|---|---|---|---|---|
| id | text | no | — | PK |
| game_id | text | no | — | |
| user_id | text | NULL | — | FK → users.id |
| player_name | text | no | — | |
| avatar | text | NULL | — | |
| score | integer | NULL | `0` | |
| max_score | integer | NULL | `0` | |
| correct_count | integer | NULL | `0` | |
| total_questions | integer | NULL | `0` | |
| time_sec | integer | NULL | `0` | |
| finished_at | timestamptz | NULL | `now()` | |
| answers | jsonb | NULL | — | |

Indexes: PK, `idx_quiz_results_game`. No FK from game_id to games. RLS enabled; SELECT policies for game owner or result owner via `auth.uid()`.

### jeopardy_results

| Column | Type | Nullable | Default | Key |
|---|---|---|---|---|
| id | text | no | — | PK |
| game_id | text | no | — | |
| played_at | timestamptz | NULL | `now()` | |
| teams | jsonb | no | — | |
| winner_id | text | NULL | — | |
| has_final | boolean | NULL | `false` | |

Indexes: PK, `idx_jeopardy_results_game`. No FKs. RLS enabled; no policies returned.

### millionaire_results

| Column | Type | Nullable | Default | Key |
|---|---|---|---|---|
| id | text | no | — | PK |
| game_id | text | no | — | |
| user_id | text | NULL | — | FK → users.id |
| player_name | text | no | — | |
| avatar | text | NULL | — | |
| outcome | text | no | — | |
| won_amount | double precision | NULL | `0` | |
| guaranteed_amount | double precision | NULL | `0` | |
| reached_count | integer | NULL | `0` | |
| total_questions | integer | NULL | `0` | |
| time_sec | integer | NULL | `0` | |
| finished_at | timestamptz | NULL | `now()` | |
| answers | jsonb | NULL | — | |

Indexes: PK, `idx_millionaire_results_game`. No FK from game_id to games. RLS enabled; SELECT policies for game owner or result owner via `auth.uid()`.

### online_quiz_results

| Column | Type | Nullable | Default | Key |
|---|---|---|---|---|
| id | text | no | — | PK |
| game_id | text | no | — | |
| room_code | text | no | — | |
| played_at | timestamptz | NULL | `now()` | |
| duration_sec | integer | NULL | `0` | |
| players | jsonb | no | — | |

Indexes: PK, `idx_online_results_game`. No FKs or policies (RLS enabled).

### ai_usage

| Column | Type | Nullable | Default | Key |
|---|---|---|---|---|
| id | integer | no | sequence | PK |
| user_id | text | NULL | — | FK → users.id |
| request_type | text | NULL | — | |
| created_at | timestamptz | NULL | `now()` | |

Indexes: PK, `idx_ai_usage_user_date`, `ai_usage_quota_lookup_idx`. RLS enabled; direct `PUBLIC/anon/authenticated` grants revoked; backend uses service role and `consume_ai_quota` RPC.

### ai_logs

| Column | Type | Nullable | Default | Key |
|---|---|---|---|---|
| id | integer | no | sequence | PK |
| user_id | text | NULL | — | |
| model | text | NULL | — | |
| topic | text | NULL | — | |
| prompt_tokens | integer | NULL | — | |
| completion_tokens | integer | NULL | — | |
| success | boolean | NULL | — | |
| error | text | NULL | — | |
| created_at | timestamptz | NULL | `now()` | |

RLS enabled; direct `PUBLIC/anon/authenticated` grants revoked; backend-only telemetry.

### error_logs

| Column | Type | Nullable | Default | Key |
|---|---|---|---|---|
| id | integer | no | sequence | PK |
| message | text | NULL | — | |
| path | text | NULL | — | |
| created_at | timestamptz | NULL | `now()` | |

RLS enabled; direct `PUBLIC/anon/authenticated` grants revoked; backend-only sanitized logs.

### feedback

| Column | Type | Nullable | Default | Key |
|---|---|---|---|---|
| id | integer | no | sequence | PK |
| name | text | NULL | — | |
| email | text | NULL | — | |
| type | text | NULL | — | |
| message | text | NULL | — | |
| page_url | text | NULL | — | |
| created_at | timestamptz | NULL | `now()` | |

RLS enabled; direct `PUBLIC/anon/authenticated` grants revoked; feedback is submitted through backend.

### settings

| Column | Type | Nullable | Default | Key |
|---|---|---|---|---|
| key | text | no | — | PK |
| value | text | NULL | — | |

RLS enabled; direct `PUBLIC/anon/authenticated` grants revoked; settings are read/updated by admin backend routes.

### tags (Tag System v1)

| Column | Type | Nullable | Default | Key |
|---|---|---|---|---|
| id | uuid | no | `gen_random_uuid()` | PK |
| name | text | no | — | |
| canonical_name | text | no | — | UNIQUE |
| is_system | boolean | no | `false` | |
| created_at | timestamptz | no | `now()` | |
| updated_at | timestamptz | no | `now()` | |

The migration `supabase/migrations/20260820000000_tag_system_v1.sql` adds the
dictionary. Games continue to store the compatibility `tags` jsonb array; the
backend normalizes writes and maintains dictionary rows. RLS is enabled with an
explicit deny-by-default policy for `anon` and `authenticated`: the frontend
uses the backend API, while the backend's privileged key accesses tags after
IslandQuiz JWT/admin authorization. Existing game rows are not rewritten
automatically; the admin `import-legacy` operation safely seeds dictionary rows
from them, while `normalize-legacy` provides a dry-run/apply path that skips
invalid or over-limit games instead of silently dropping data.

### password_resets

| Column | Type | Nullable | Default | Key |
|---|---|---|---|---|
| id | integer | no | sequence | PK |
| email | text | no | — | |
| token | text | NULL | — | legacy column; new writes leave it NULL |
| token_hash | text | NULL | — | partial UNIQUE index |
| expires_at | timestamptz | no | — | |

RLS enabled; direct `PUBLIC/anon/authenticated` grants revoked. Existing plaintext token values were converted to SHA-256 hashes and nulled; reset endpoint looks up only `token_hash` and atomically consumes valid rows.

### telegram_login_nonces

| Column | Type | Nullable | Default | Key |
|---|---|---|---|---|
| nonce_hash | text | no | — | PK |
| token_type | text | no | — | `bot_login` or `complete` |
| expires_at | timestamptz | no | — | |
| consumed_at | timestamptz | NULL | — | |
| created_at | timestamptz | no | `now()` | |

RLS enabled; direct `PUBLIC/anon/authenticated` grants revoked. Raw Telegram credentials are not stored.

### online_rooms

| Column | Type | Nullable | Default | Key |
|---|---|---|---|---|
| code | text | no | — | PK |
| game_kind | text | no | — | |
| game_id | text | no | — | |
| state | jsonb | no | — | resumable room state/snapshot |
| created_at | timestamptz | no | `now()` | |
| updated_at | timestamptz | no | `now()` | |
| expires_at | timestamptz | no | — | TTL cleanup boundary |

RLS enabled; direct `PUBLIC/anon/authenticated` grants revoked. `state.theme` is the room/session world and defaults to `classic`; runtime credentials inside `state._credentials` are HMAC digests, not raw values. For Quiz rooms, the signed/persisted runtime snapshot contains only the selected variant's questions; editor-only additional `games.data.variants` are not copied into the room snapshot.

## Relationships

```text
users
├── games.owner_id
├── ratings.user_id
├── quiz_results.user_id
├── millionaire_results.user_id
└── ai_usage.user_id

games
└── ratings.game_id
```

Result routes use game_id for all result tables, but only ratings.game_id is an FK. `jeopardy_results` and `online_quiz_results` have no user FK.

## Backend usage

- `backend/database.py`: Supabase client from `SUPABASE_URL` and `SUPABASE_KEY`.
- `auth.py`, `telegram_auth.py`, `users.py`, `admin.py`: users/password_resets; admin also settings/error_logs/ai_logs.
- `games.py`: games/ratings and `increment_play_count`.
- `results.py`: all four result tables and games access checks.
- `ai.py`: ai_usage. `feedback.py`: feedback.
- `rooms.py`: live in-memory rooms plus `online_rooms` persistence for restart resume.

## Views, functions and other relevant objects

- Application RPCs: `public.increment_play_count(game_id text) RETURNS void` (fixed `search_path`) and `public.consume_ai_quota(user_id, request_type, daily_limit) RETURNS boolean` (atomic quota reservation with transaction-scoped advisory lock).
- No application-owned views. Existing views are Supabase service views: `extensions.pg_stat_statements`, `extensions.pg_stat_statements_info`, `vault.decrypted_secrets`.
- Supabase-managed objects in `auth`, `storage`, `realtime`, `vault`, `extensions` are outside the application persistence contract.
- Supabase Security Advisor no longer reports mutable `search_path` for `increment_play_count`; INFO `RLS enabled without policy` remains intentional for service-only tables.

## Known schema/code mismatches

- Confirmed security boundary: RLS policies on user-facing tables may use `auth.uid()`, while IslandQuiz authenticates with its own JWT and the backend creates a privileged Supabase client. Service-only tables therefore deny direct Data API roles rather than guessing an `auth.uid()` mapping.
- Result routes use game_id links without database FKs for four result tables; orphan results are not prevented by the database.
- Service-only tables (`settings`, `error_logs`, `ai_logs`, `ai_usage`, `feedback`, `password_resets`, `telegram_login_nonces`, `online_rooms`) have RLS enabled and direct Data API grants revoked. Advisor INFO about missing policies is expected deny-by-default behavior.
- `tags` is protected by deny-by-default RLS; direct Supabase Data API access is intentionally blocked because tag access is mediated by the backend.
- `jeopardy_results` and `online_quiz_results` remain RLS-enabled without policies by design; backend service-role result save/read paths were preserved.
- Reviewed backend queries otherwise matched the audited public columns. No confirmed missing-column or type mismatch was found.

## Agent rules

- Do not guess database schema.
- Consult `docs/DATABASE.md` before database-related changes.
- If this snapshot may be stale or the task depends on current production schema, inspect Supabase directly.
- Never modify production schema or data without explicit approval.
- Do not create migrations merely to make code match an assumption; verify the actual schema first.
