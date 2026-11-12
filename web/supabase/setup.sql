-- Jalankan sekali dalam Supabase: SQL Editor > New query > tampal > Run.
-- 1. Storan tertutup untuk data harga (bukan awam).
insert into storage.buckets (id, name, public)
values ('data', 'data', false)
on conflict (id) do update set public = false;

-- 2. Hanya pengguna yang sudah log masuk boleh muat turun data.
--    Muat naik dibuat oleh GitHub Actions dengan kunci rahsia, yang memintas polisi ini.
drop policy if exists "Pengguna log masuk boleh baca data" on storage.objects;
create policy "Pengguna log masuk boleh baca data"
on storage.objects for select
to authenticated
using (bucket_id = 'data');
