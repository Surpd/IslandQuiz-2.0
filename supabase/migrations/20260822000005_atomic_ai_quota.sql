-- Atomically reserve one AI request for a user and request type.
-- The advisory lock is transaction-scoped and only serializes the same quota
-- bucket, so concurrent requests cannot pass the count check together.

create index if not exists ai_usage_quota_lookup_idx
    on public.ai_usage (user_id, request_type, created_at);

create or replace function public.consume_ai_quota(
    p_user_id text,
    p_request_type text,
    p_daily_limit integer
)
returns boolean
language plpgsql
set search_path = public
as $$
declare
    usage_count integer;
    utc_day_start timestamptz := (timezone('UTC', now())::date)::timestamp at time zone 'UTC';
begin
    if p_daily_limit is null then
        return true;
    end if;

    if p_user_id is null or p_request_type is null or p_daily_limit < 1 then
        return false;
    end if;

    perform pg_advisory_xact_lock(
        hashtextextended(p_user_id || ':' || p_request_type, 0)
    );

    select count(*)
    into usage_count
    from public.ai_usage
    where user_id = p_user_id
      and request_type = p_request_type
      and created_at >= utc_day_start;

    if usage_count >= p_daily_limit then
        return false;
    end if;

    insert into public.ai_usage (user_id, request_type)
    values (p_user_id, p_request_type);

    return true;
end;
$$;

revoke all on function public.consume_ai_quota(text, text, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(text, text, integer) to service_role;
