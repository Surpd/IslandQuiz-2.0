-- Theme is a launch/room runtime setting, never persisted game configuration.
-- Keep every other game-data field unchanged, including questions and config values.
update public.games
set data = jsonb_set(data, '{config}', (data->'config') - 'theme', true)
where jsonb_typeof(data) = 'object'
  and jsonb_typeof(data->'config') = 'object'
  and (data->'config') ? 'theme';
