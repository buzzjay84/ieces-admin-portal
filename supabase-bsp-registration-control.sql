-- Run after the existing BSP schema. Keeps registration open until an admin closes it.
begin;
create table if not exists public.bsp_registration_control (
  id boolean primary key default true check (id),
  enabled boolean not null default true
);
insert into public.bsp_registration_control (id, enabled) values (true, true) on conflict (id) do nothing;
alter table public.bsp_registration_control enable row level security;
revoke all on public.bsp_registration_control from anon, authenticated;
grant select on public.bsp_registration_control to anon, authenticated;
grant update (enabled) on public.bsp_registration_control to authenticated;
drop policy if exists "public registration status" on public.bsp_registration_control;
create policy "public registration status" on public.bsp_registration_control for select to anon, authenticated using (true);
drop policy if exists "BSP admins control registration" on public.bsp_registration_control;
create policy "BSP admins control registration" on public.bsp_registration_control for update to authenticated
  using (public.is_bsp_admin()) with check (public.is_bsp_admin());
-- Public submissions require an open website; BSP administrators can still register people on desktop.
-- Existing validation policies still apply to both.
drop policy if exists "registration must be open" on public.bsp_registrations;
create policy "registration must be open" on public.bsp_registrations as restrictive for insert to anon, authenticated
  with check (public.is_bsp_admin() or exists (select 1 from public.bsp_registration_control where id = true and enabled));
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
    and schemaname = 'public' and tablename = 'bsp_registration_control') then
    alter publication supabase_realtime add table public.bsp_registration_control;
  end if;
end $$;
commit;
