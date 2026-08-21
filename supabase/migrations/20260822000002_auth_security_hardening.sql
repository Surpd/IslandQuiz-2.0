-- Auth hardening: durable one-time Telegram credentials and hashed reset tokens.

create table if not exists public.telegram_login_nonces (
    nonce_hash text primary key,
    token_type text not null check (token_type in ('bot_login', 'complete')),
    expires_at timestamptz not null,
    consumed_at timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists telegram_login_nonces_expiry_idx
    on public.telegram_login_nonces (expires_at);

alter table public.telegram_login_nonces enable row level security;

revoke all on table public.telegram_login_nonces from anon, authenticated;
grant all on table public.telegram_login_nonces to service_role;

alter table public.password_resets
    add column if not exists token_hash text;

alter table public.password_resets
    alter column token drop not null;

update public.password_resets
set token_hash = encode(digest(token, 'sha256'), 'hex')
where token_hash is null
  and token is not null;

-- Existing reset credentials are retained in hashed form only.
update public.password_resets
set token = null
where token is not null;

create unique index if not exists password_resets_token_hash_idx
    on public.password_resets (token_hash)
    where token_hash is not null;

alter table public.password_resets enable row level security;
revoke all on table public.password_resets from anon, authenticated;
grant all on table public.password_resets to service_role;
