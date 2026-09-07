-- Conversations are device-local. Remove any legacy remote chat data.
drop table if exists public.messages cascade;
drop table if exists public.conversations cascade;

create or replace function public.erase_my_records()
returns void language plpgsql security invoker set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  delete from public.documents where user_id = auth.uid();
end $$;
revoke all on function public.erase_my_records() from public, anon;
grant execute on function public.erase_my_records() to authenticated;
