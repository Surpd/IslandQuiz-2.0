-- Partial unique indexes need their predicate in the conflict target.
create or replace function public.apply_official_content_import(
  p_owner_id text,
  p_owner_name text,
  p_games jsonb
)
returns table(content_id text, game_id text, status text)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  item jsonb;
  inserted_id text;
  item_content_id text;
begin
  if jsonb_typeof(p_games) <> 'array' then
    raise exception 'official content payload must be an array';
  end if;

  for item in select value from jsonb_array_elements(p_games) loop
    item_content_id := item->>'content_id';
    inserted_id := gen_random_uuid()::text;
    insert into public.games (id, kind, data, owner_id, owner_name, visibility, tags, official_content_id)
    values (inserted_id, item->>'kind', item->'data', p_owner_id, p_owner_name, 'private', item->'tags', item_content_id)
    on conflict (official_content_id) where official_content_id is not null do nothing;
    if found then
      content_id := item_content_id;
      game_id := inserted_id;
      status := 'created';
    else
      select g.id into game_id from public.games g where g.official_content_id = item_content_id;
      content_id := item_content_id;
      status := 'skipped';
    end if;
    return next;
  end loop;
end;
$$;

revoke all on function public.apply_official_content_import(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_official_content_import(text, text, jsonb) to service_role;
