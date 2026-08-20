-- Tag System v1. Keep games.tags as the compatibility payload; this table is the
-- canonical dictionary used for autocomplete and administrative management.
create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  canonical_name text not null unique,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tags_system_name on public.tags (is_system, name);

-- Backend uses its own JWT and the privileged Supabase client, matching the
-- existing settings/ai_usage/error_logs access model. RLS policy work remains
-- governed by the project's identity decision.
alter table public.tags disable row level security;

insert into public.tags (name, canonical_name, is_system)
select value, lower(value), true
from unnest(array[
  'Математика', 'Русский язык', 'Литература', 'История', 'Обществознание',
  'География', 'Биология', 'Физика', 'Химия', 'Информатика',
  'Английский язык', 'Окружающий мир', 'Общая эрудиция',
  '1 класс', '2 класс', '3 класс', '4 класс', '5 класс', '6 класс',
  '7 класс', '8 класс', '9 класс', '10 класс', '11 класс'
]::text[]) as value
on conflict (canonical_name) do update set is_system = true, name = excluded.name;
