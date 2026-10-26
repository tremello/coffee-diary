-- Only for running the tests on a plain PostgreSQL (no Supabase): creates the minimum of what
-- Supabase provides, namely the anon/authenticated roles, auth.users and auth.uid().
-- Do not run this on a Supabase database; it already has all of these.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists auth;
grant usage on schema auth, public to anon, authenticated;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;
