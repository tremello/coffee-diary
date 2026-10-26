-- Read-only: shows how public.coffee_data is protected right now. Safe to run in the
-- Supabase dashboard SQL editor on production; it changes nothing.
-- Expected: rls_enabled true; exactly the four *_own policies, each for {authenticated}
-- and comparing auth.uid() with user_id; anon with no privileges; a unique index on (user_id, key).
select 'table' as what, c.relname as name,
       format('rls_enabled=%s force=%s', c.relrowsecurity, c.relforcerowsecurity) as detail
from pg_class c where c.oid = 'public.coffee_data'::regclass
union all
select 'policy', p.policyname,
       format('%s %s for %s using (%s) with check (%s)', p.permissive, p.cmd, p.roles, p.qual, p.with_check)
from pg_policies p where p.schemaname = 'public' and p.tablename = 'coffee_data'
union all
select 'grant', g.grantee, string_agg(g.privilege_type, ', ' order by g.privilege_type)
from information_schema.role_table_grants g
where g.table_schema = 'public' and g.table_name = 'coffee_data' and g.grantee in ('anon', 'authenticated', 'PUBLIC')
group by g.grantee
union all
select 'index', i.indexname, i.indexdef
from pg_indexes i where i.schemaname = 'public' and i.tablename = 'coffee_data'
union all
select 'column', a.attname, format_type(a.atttypid, a.atttypmod) || coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), '')
from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
where a.attrelid = 'public.coffee_data'::regclass and a.attnum > 0 and not a.attisdropped
order by 1, 2;
