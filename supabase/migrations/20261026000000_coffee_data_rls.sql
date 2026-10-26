-- coffee_data: one row per (account, data key) holding that key's whole JSON value.
-- The browser talks to Supabase with the publishable key, so these row-level security
-- policies are the only thing keeping one account's rows away from another account.
--
-- Safe to run more than once, and safe on the existing production table:
-- it creates only what is missing and replaces whatever policies the table has with the four below.

-- Matches the live table as of 2026-10-26 (checked with checks/inspect_coffee_data_security.sql).
create table if not exists public.coffee_data (
  user_id uuid not null,
  key text not null,
  data jsonb not null default '[]'::jsonb,
  updated_at timestamptz default now(),
  constraint coffee_data_pkey primary key (user_id, key)
);

-- The app upserts with onConflict "user_id,key", which needs a unique index on exactly those columns
-- (the live table's primary key is one).
do $$
begin
  if not exists (
    select 1
    from pg_index i
    join pg_class t on t.oid = i.indrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'coffee_data' and i.indisunique
      and (select array_agg(a.attname::text order by a.attname)
           from unnest(i.indkey) k join pg_attribute a on a.attrelid = t.oid and a.attnum = k) = array['key', 'user_id']
  ) then
    alter table public.coffee_data add constraint coffee_data_user_id_key_key unique (user_id, key);
  end if;
end $$;

alter table public.coffee_data enable row level security;
-- Also apply the policies to the table owner, so nothing but service_role (which bypasses RLS) skips them.
alter table public.coffee_data force row level security;

-- Signed-out visitors get nothing at all.
revoke all on public.coffee_data from anon;
grant select, insert, update, delete on public.coffee_data to authenticated;

-- Policies are OR-ed together, so one leftover broad policy (e.g. a dashboard "enable read for all")
-- would undo the rest. Drop every existing policy on the table and recreate the full set below.
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'coffee_data' loop
    execute format('drop policy %I on public.coffee_data', p.policyname);
  end loop;
end $$;

create policy "coffee_data_select_own" on public.coffee_data
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "coffee_data_insert_own" on public.coffee_data
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- with check stops a row from being handed over to another account by changing user_id.
create policy "coffee_data_update_own" on public.coffee_data
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "coffee_data_delete_own" on public.coffee_data
  for delete to authenticated
  using ((select auth.uid()) = user_id);
