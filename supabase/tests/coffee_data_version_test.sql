-- Checks the save-conflict guard from migrations/20261026000100_coffee_data_version.sql:
-- every write moves version on, and a save aimed at an old version changes nothing.
-- Run like coffee_data_rls_test.sql (test database only; everything is rolled back).
\o /dev/null
begin;

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok - %', what;
end $$;

insert into auth.users (id, email) values ('00000000-0000-4000-a000-00000000000a', 'version-test-a@example.invalid');
insert into public.coffee_data (user_id, key, data) values ('00000000-0000-4000-a000-00000000000a', 'cf_beans', '[]');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-00000000000a", "role": "authenticated"}', true);

select pg_temp.check((select version from public.coffee_data where key = 'cf_beans') = 1, 'a new row starts at version 1');

-- Phone and laptop both read version 1. The phone saves first.
with saved as (
  update public.coffee_data set data = '[{"id": 1, "remaining": 185}]' where key = 'cf_beans' and version = 1 returning version
) select pg_temp.check((select version from saved) = 2, 'the first save lands and moves the row to version 2');

-- The laptop's save still names version 1, so it must not overwrite the phone's.
with saved as (
  update public.coffee_data set data = '[{"id": 1, "remaining": 180}]' where key = 'cf_beans' and version = 1 returning version
) select pg_temp.check((select count(*) from saved) = 0, 'a save against the old version changes nothing');
select pg_temp.check(
  (select data->0->>'remaining' from public.coffee_data where key = 'cf_beans') = '185',
  'the first save is still there');

-- An app version that doesn't know about versions (plain upsert) still moves the version on.
insert into public.coffee_data (user_id, key, data) values ('00000000-0000-4000-a000-00000000000a', 'cf_beans', '[{"id": 1, "remaining": 165}]')
  on conflict (user_id, key) do update set data = excluded.data;
select pg_temp.check((select version from public.coffee_data where key = 'cf_beans') = 3, 'an upsert from an older app also moves the version on');

-- A save can't set the version to whatever it likes.
update public.coffee_data set data = '[]', version = 99 where key = 'cf_beans';
select pg_temp.check((select version from public.coffee_data where key = 'cf_beans') = 4, 'the version only ever goes up by one per write');

do $$ begin raise notice 'coffee_data version: all checks passed'; end $$;

rollback;
