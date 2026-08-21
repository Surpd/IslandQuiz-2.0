-- Keep the existing RPC behavior while preventing search_path resolution drift.
alter function public.increment_play_count(text) set search_path = public;
