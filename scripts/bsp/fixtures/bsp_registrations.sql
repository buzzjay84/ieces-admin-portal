-- BSP online registration
-- Run once in Supabase → SQL Editor (project joilvslvsioayrjshuxg).
--
-- Public website visitors may only INSERT a registration.
-- Only signed-in users listed in public.bsp_admins can read, import, or delete them
-- (used by the BSP Registration desktop app).

create table if not exists public.bsp_registrations (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  reg_type          text not null check (reg_type in ('scout', 'adult')),
  status            text not null default 'pending' check (status in ('pending', 'imported', 'rejected')),
  imported_at       timestamptz,

  -- unit / school
  sponsor           text not null default '' check (char_length(sponsor) <= 200),
  unit_type         text check (unit_type in ('Langkay', 'Kawan', 'Troop', 'Outfit', 'Circle')),
  unit_no           text check (char_length(unit_no) <= 30),

  -- person
  surname           text not null check (char_length(surname) between 1 and 80),
  given_name        text not null check (char_length(given_name) between 1 and 80),
  middle_initial    text check (char_length(middle_initial) <= 5),
  sex               text check (sex in ('M', 'F')),
  birthdate         date,
  contact_no        text check (char_length(contact_no) <= 40),

  -- scout (learner)
  grade_section     text check (char_length(grade_section) <= 60),
  reg_status        text check (reg_status in ('N', 'RR')),
  card_no           text check (char_length(card_no) <= 40),
  highest_rank      text check (char_length(highest_rank) <= 60),
  years_in_scouting int  check (years_in_scouting between 0 and 60),
  guardian_name     text check (char_length(guardian_name) <= 120),

  -- adult (teacher / school head / coordinator)
  role              text check (role in ('UL_LANGKAY', 'UL_KAWAN', 'UL_TROOP', 'UL_OUTFIT', 'UL_CIRCLE', 'LAY_ISR', 'LAY_DIST', 'LAY_LCS')),
  civil_status      text check (char_length(civil_status) <= 20),
  tenure            text check (char_length(tenure) <= 40),
  card_expiration   date,
  birthplace        text check (char_length(birthplace) <= 120),
  religion          text check (char_length(religion) <= 60),
  occupation        text check (char_length(occupation) <= 80),
  position_title    text check (char_length(position_title) <= 80),
  email             text check (char_length(email) <= 120),

  consent           boolean not null check (consent)
);

create index if not exists bsp_registrations_status_idx on public.bsp_registrations (status, created_at);

-- Keep in sync with bsp_prevent_duplicate_learners.sql (existing installations).
create unique index if not exists bsp_registrations_unique_learner_idx
  on public.bsp_registrations (
    lower(trim(regexp_replace(sponsor, '[[:space:]]+', ' ', 'g'))),
    lower(trim(regexp_replace(surname, '[[:space:]]+', ' ', 'g'))),
    lower(trim(regexp_replace(given_name, '[[:space:]]+', ' ', 'g'))),
    (coalesce(birthdate, '-infinity'::date))
  )
  where reg_type = 'scout' and status <> 'rejected';

-- Who may read/import registrations (Supabase Auth e-mails)
create table if not exists public.bsp_admins (
  email text primary key
);

create or replace function public.is_bsp_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.bsp_admins where lower(email) = lower(auth.jwt() ->> 'email'));
$$;

alter table public.bsp_registrations enable row level security;
alter table public.bsp_admins enable row level security;  -- no policies: not readable through the API

drop policy if exists "public can submit" on public.bsp_registrations;
create policy "public can submit" on public.bsp_registrations
  for insert to anon, authenticated
  with check (status = 'pending' and imported_at is null);

drop policy if exists "admins can read" on public.bsp_registrations;
create policy "admins can read" on public.bsp_registrations
  for select to authenticated using (public.is_bsp_admin());

drop policy if exists "admins can update" on public.bsp_registrations;
create policy "admins can update" on public.bsp_registrations
  for update to authenticated using (public.is_bsp_admin()) with check (public.is_bsp_admin());

drop policy if exists "admins can delete" on public.bsp_registrations;
create policy "admins can delete" on public.bsp_registrations
  for delete to authenticated using (public.is_bsp_admin());

grant insert on public.bsp_registrations to anon, authenticated;
grant select, update, delete on public.bsp_registrations to authenticated;

-- ▼ Put the e-mail of the Supabase Auth account you will sign in with in the desktop app.
--   (Create it in Supabase → Authentication → Users → Add user, if you don't have one.)
insert into public.bsp_admins (email) values ('CHANGE-ME@example.com')
on conflict do nothing;
