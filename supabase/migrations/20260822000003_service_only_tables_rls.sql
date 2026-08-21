-- These tables are application-private. IslandQuiz accesses them through the
-- backend's privileged Supabase client, not through the browser Data API.

alter table public.settings enable row level security;
alter table public.error_logs enable row level security;
alter table public.ai_logs enable row level security;
alter table public.ai_usage enable row level security;
alter table public.feedback enable row level security;
alter table public.password_resets enable row level security;
alter table public.jeopardy_results enable row level security;
alter table public.online_quiz_results enable row level security;

revoke all on table public.settings from public, anon, authenticated;
revoke all on table public.error_logs from public, anon, authenticated;
revoke all on table public.ai_logs from public, anon, authenticated;
revoke all on table public.ai_usage from public, anon, authenticated;
revoke all on table public.feedback from public, anon, authenticated;
revoke all on table public.password_resets from public, anon, authenticated;
revoke all on table public.jeopardy_results from public, anon, authenticated;
revoke all on table public.online_quiz_results from public, anon, authenticated;

grant all on table public.settings to service_role;
grant all on table public.error_logs to service_role;
grant all on table public.ai_logs to service_role;
grant all on table public.ai_usage to service_role;
grant all on table public.feedback to service_role;
grant all on table public.password_resets to service_role;
grant all on table public.jeopardy_results to service_role;
grant all on table public.online_quiz_results to service_role;
