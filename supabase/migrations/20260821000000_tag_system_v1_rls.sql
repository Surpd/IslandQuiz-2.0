-- Tag System v1: keep direct Supabase Data API access deny-by-default.
-- IslandQuiz frontend uses the backend API; the backend's privileged key
-- bypasses RLS after its own JWT/admin authorization checks.
alter table public.tags enable row level security;

drop policy if exists tags_direct_api_denied on public.tags;
create policy tags_direct_api_denied
on public.tags
for all
to anon, authenticated
using (false)
with check (false);
