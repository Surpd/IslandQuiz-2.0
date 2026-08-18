# IslandQuiz Database

## Source of truth

- Supabase project `IslandQuiz`, ref `epbtmudrgtjveoiaymxc`, PostgreSQL 17; inspected read-only on 2026-08-18.
- This is a maintained snapshot, not a live schema contract. Recheck Supabase directly when it may be stale.
- Application-owned data is in `public`. Supabase-managed objects also exist in `auth`, `storage`, `realtime`, `vault` and `extensions`; application code does not use those tables directly.

## Database overview

Users own games. A game stores the complete game document in `games.data` (`jsonb`), not normalized question rows. Ratings link users to games. Quiz, Jeopardy, Millionaire and online Quiz attempts are stored in separate result tables; several result `game_id` columns are not foreign keys.

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

Indexes: PK, `idx_ai_usage_user_date`. RLS disabled; no policies.

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

RLS disabled; no policies or non-PK indexes.

### error_logs

| Column | Type | Nullable | Default | Key |
|---|---|---|---|---|
| id | integer | no | sequence | PK |
| message | text | NULL | — | |
| path | text | NULL | — | |
| created_at | timestamptz | NULL | `now()` | |

RLS disabled; no policies or non-PK indexes.

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

RLS disabled; no policies or non-PK indexes.

### settings

| Column | Type | Nullable | Default | Key |
|---|---|---|---|---|
| key | text | no | — | PK |
| value | text | NULL | — | |

RLS disabled; no policies.

### password_resets

| Column | Type | Nullable | Default | Key |
|---|---|---|---|---|
| id | integer | no | sequence | PK |
| email | text | no | — | |
| token | text | no | — | |
| expires_at | timestamptz | no | — | |

RLS disabled; no policies. No uniqueness or expiry CHECK constraint was found.

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
- `rooms.py`: in-memory rooms; no Supabase table.

## Views, functions and other relevant objects

- Application RPC: `public.increment_play_count(game_id text) RETURNS void`; increments `games.play_count` for the matching id.
- No application-owned views. Existing views are Supabase service views: `extensions.pg_stat_statements`, `extensions.pg_stat_statements_info`, `vault.decrypted_secrets`.
- Supabase-managed objects in `auth`, `storage`, `realtime`, `vault`, `extensions` are outside the application persistence contract.
- Supabase security advisor also reports mutable `search_path` on `increment_play_count`; no change was made.

## Known schema/code mismatches

- Confirmed security dependency: RLS policies use `auth.uid()`, while IslandQuiz authenticates with its own JWT and the backend creates a Supabase client from `SUPABASE_KEY`. Do not assume RLS sees the IslandQuiz user; verify key/role behavior before relying on RLS for authorization.
- Result routes use game_id links without database FKs for four result tables; orphan results are not prevented by the database.
- Six application tables (`settings`, `error_logs`, `ai_logs`, `ai_usage`, `feedback`, `password_resets`) have RLS disabled and no policies. This is a production security issue; no remediation was applied.
- `jeopardy_results` and `online_quiz_results` have RLS enabled but no policies, so the advisor reports them as RLS-enabled-without-policy.
- Reviewed backend queries otherwise matched the audited public columns. No confirmed missing-column or type mismatch was found.

## Agent rules

- Do not guess database schema.
- Consult `docs/DATABASE.md` before database-related changes.
- If this snapshot may be stale or the task depends on current production schema, inspect Supabase directly.
- Never modify production schema or data without explicit approval.
- Do not create migrations merely to make code match an assumption; verify the actual schema first.
