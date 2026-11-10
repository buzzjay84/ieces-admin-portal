-- Run after the enrollment dashboard, homepage slides, and news approval migrations.
-- Uses the Dashboard Manager's server-managed report allowlist, never user metadata.
begin;
create or replace function public.is_report_user()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(auth.role() = 'service_role' or (auth.role() = 'authenticated'
    and public.is_app_email_allowed('report', auth.jwt()->>'email')), false);
$$;
revoke all on function public.is_report_user() from public;
grant execute on function public.is_report_user() to anon, authenticated, service_role;

alter policy "Authenticated dashboard reads students" on public.students using (public.is_report_user());
alter policy "Authenticated dashboard reads profiles" on public.profiles using (public.is_report_user());
alter policy "authenticated manage homepage slides" on public.homepage_slides
  using (public.is_report_user()) with check (public.is_report_user());
alter policy "authenticated upload homepage photos" on storage.objects
  with check (bucket_id = 'homepage-photos' and public.is_report_user());
alter policy "authenticated update homepage photos" on storage.objects
  using (bucket_id = 'homepage-photos' and public.is_report_user())
  with check (bucket_id = 'homepage-photos' and public.is_report_user());
alter policy "authenticated delete homepage photos" on storage.objects
  using (bucket_id = 'homepage-photos' and public.is_report_user());
alter policy "Authenticated users read all articles" on public.news_articles
  using (status = 'approved' or public.is_report_user());

-- A submitted author_role is untrusted; only report staff may publish immediately.
create or replace function public.set_news_article_initial_status()
returns trigger language plpgsql set search_path = '' as $$
begin
  if public.is_report_user() then
    new.author_role := 'teacher'; new.status := 'approved';
  else
    new.author_role := 'student'; new.status := 'pending';
  end if;
  return new;
end;
$$;
drop policy if exists "Report staff moderate news updates" on public.news_articles;
create policy "Report staff moderate news updates" on public.news_articles as restrictive
  for update to public using (public.is_report_user()) with check (public.is_report_user());
drop policy if exists "Report staff moderate news deletes" on public.news_articles;
create policy "Report staff moderate news deletes" on public.news_articles as restrictive
  for delete to public using (public.is_report_user());
commit;
