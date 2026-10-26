-- Cross-account access tests for public.coffee_data.
-- Account A must not be able to read, create, change, take over or delete account B's rows,
-- and a signed-out visitor must not reach any row.
--
-- Run against a local or staging database that has the migration applied, never production:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/coffee_data_rls_test.sql
-- Everything runs inside one transaction that is rolled back, so no test rows are left behind.
-- Prints "coffee_data RLS: all checks passed" on success; any failed check stops with an error.

\o /dev/null
begin;

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok - %', what;
end $$;

-- Runs a statement as the current role and reports whether row-level security rejected it.
create function pg_temp.denied(stmt text) returns boolean language plpgsql as $$
begin
  execute stmt;
  return false;
exception when insufficient_privilege then
  return true;
end $$;

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-00000000000a', 'rls-test-a@example.invalid'),
  ('00000000-0000-4000-a000-00000000000b', 'rls-test-b@example.invalid');
insert into public.coffee_data (user_id, key, data) values
  ('00000000-0000-4000-a000-00000000000a', 'cf_beans', '[{"id": 1, "name": "A bean"}]'),
  ('00000000-0000-4000-a000-00000000000b', 'cf_beans', '[{"id": 2, "name": "B bean"}]'),
  ('00000000-0000-4000-a000-00000000000b', 'cf_brews', '[]');

select pg_temp.check(
  (select relrowsecurity from pg_class where oid = 'public.coffee_data'::regclass),
  'row level security is enabled on coffee_data');
select pg_temp.check(
  not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'coffee_data'
              and ('public' = any(roles) or 'anon' = any(roles))),
  'no policy is granted to public or anon');

-- Signed in as account A.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-00000000000a", "role": "authenticated"}', true);

select pg_temp.check((select count(*) from public.coffee_data) = 1, 'A sees only its own row');
select pg_temp.check(
  (select count(*) from public.coffee_data where user_id = '00000000-0000-4000-a000-00000000000b') = 0,
  'A cannot read B''s rows even when asking for B''s user_id');

select pg_temp.check(pg_temp.denied($$
  insert into public.coffee_data (user_id, key, data)
  values ('00000000-0000-4000-a000-00000000000b', 'cf_notes', '[]')
$$), 'A cannot create a row under B''s account');

-- The app saves with upsert on (user_id, key); aimed at B's existing row it must fail, not overwrite.
select pg_temp.check(pg_temp.denied($$
  insert into public.coffee_data (user_id, key, data)
  values ('00000000-0000-4000-a000-00000000000b', 'cf_beans', '[]')
  on conflict (user_id, key) do update set data = excluded.data
$$), 'A cannot overwrite B''s row through upsert');

update public.coffee_data set data = '[]' where user_id = '00000000-0000-4000-a000-00000000000b';
delete from public.coffee_data where user_id = '00000000-0000-4000-a000-00000000000b';

select pg_temp.check(pg_temp.denied($$
  update public.coffee_data set user_id = '00000000-0000-4000-a000-00000000000b'
  where user_id = '00000000-0000-4000-a000-00000000000a'
$$), 'A cannot hand its own row over to B');

update public.coffee_data set data = '[{"id": 1, "name": "A bean, edited"}]' where key = 'cf_beans';
select pg_temp.check(
  (select data->0->>'name' from public.coffee_data where key = 'cf_beans') = 'A bean, edited',
  'A can still change its own row');

-- Signed out.
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select pg_temp.check(pg_temp.denied('select 1 from public.coffee_data'), 'a signed-out visitor cannot read the table');
select pg_temp.check(pg_temp.denied($$
  insert into public.coffee_data (user_id, key, data)
  values ('00000000-0000-4000-a000-00000000000b', 'cf_notes', '[]')
$$), 'a signed-out visitor cannot write to the table');

-- Back as the owner: B's rows must be exactly as seeded.
reset role;
select pg_temp.check(
  (select data from public.coffee_data where user_id = '00000000-0000-4000-a000-00000000000b' and key = 'cf_beans')
    = '[{"id": 2, "name": "B bean"}]'::jsonb,
  'B''s row is unchanged after A tried to update and delete it');
select pg_temp.check(
  (select count(*) from public.coffee_data where user_id = '00000000-0000-4000-a000-00000000000b') = 2,
  'B still has both of its rows');

do $$ begin raise notice 'coffee_data RLS: all checks passed'; end $$;

rollback;
