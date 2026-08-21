-- Minimal durable room snapshot for restart recovery. WebSocket connections
-- remain process-local; this table only stores resumable game state.

create table if not exists public.online_rooms (
    code text primary key,
    game_kind text not null,
    game_id text not null,
    state jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    expires_at timestamptz not null
);

create index if not exists online_rooms_expiry_idx
    on public.online_rooms (expires_at);

alter table public.online_rooms enable row level security;
revoke all on table public.online_rooms from public, anon, authenticated;
grant all on table public.online_rooms to service_role;
