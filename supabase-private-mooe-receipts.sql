-- Run in the shared Supabase SQL editor before using private receipt links.
-- Requires the Dashboard Manager's public.is_app_email_allowed(text, text).
begin;
update storage.buckets set public = false where id = 'mooe-receipts';

-- Restrictive policy also blocks older permissive policies for this bucket.
drop policy if exists "MOOE receipts require report access" on storage.objects;
create policy "MOOE receipts require report access" on storage.objects as restrictive
  for all to public
  using (bucket_id <> 'mooe-receipts' or
    (auth.role() = 'authenticated' and public.is_app_email_allowed('report', auth.jwt()->>'email')))
  with check (bucket_id <> 'mooe-receipts' or
    (auth.role() = 'authenticated' and public.is_app_email_allowed('report', auth.jwt()->>'email')));
drop policy if exists "Report users manage MOOE receipts" on storage.objects;
create policy "Report users manage MOOE receipts" on storage.objects for all to authenticated
  using (bucket_id = 'mooe-receipts' and public.is_app_email_allowed('report', auth.jwt()->>'email'))
  with check (bucket_id = 'mooe-receipts' and public.is_app_email_allowed('report', auth.jwt()->>'email'));
commit;
