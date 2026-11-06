-- 원두 카드 사진: a private Storage bucket where each account keeps its card photos under a folder named by its own id
-- ("<user id>/<random>.jpg" and "<user id>/<random>-t.jpg" for the small copy). Nobody else can list, read, add or delete them;
-- the app shows a photo through a signed link that lasts an hour.
--
-- Safe to run more than once: it creates the bucket only if missing and replaces just the four policies below.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bean-cards', 'bean-cards', false, 15728640, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 15728640, allowed_mime_types = array['image/jpeg'];

drop policy if exists bean_cards_select_own on storage.objects;
drop policy if exists bean_cards_insert_own on storage.objects;
drop policy if exists bean_cards_update_own on storage.objects;
drop policy if exists bean_cards_delete_own on storage.objects;

create policy bean_cards_select_own on storage.objects for select to authenticated
  using (bucket_id = 'bean-cards' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy bean_cards_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'bean-cards' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy bean_cards_update_own on storage.objects for update to authenticated
  using (bucket_id = 'bean-cards' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'bean-cards' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy bean_cards_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'bean-cards' and (storage.foldername(name))[1] = (select auth.uid())::text);
