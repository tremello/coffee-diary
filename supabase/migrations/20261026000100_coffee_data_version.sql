-- Lets two devices save the same data key without overwriting each other.
-- Every write bumps version; the app saves with "update ... where version = <the version it merged against>",
-- so a save that lost a race changes nothing, and the app reads the newer copy, merges and tries again.
-- Until this runs, the app keeps its older save (upsert plus a re-check), which can drop one of two
-- stock deductions made at the same moment. Safe to run more than once; existing rows start at version 1.

alter table public.coffee_data add column if not exists version bigint not null default 1;

-- Done in the database so that every writer, including an older app version still open on some device,
-- moves the version on; otherwise a newer device couldn't notice that write.
create or replace function public.coffee_data_bump_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists coffee_data_bump_version on public.coffee_data;
create trigger coffee_data_bump_version before update on public.coffee_data
  for each row execute function public.coffee_data_bump_version();
