# Penapis Bursa (Next.js)

Versi Next.js website Penapis Bursa, dengan log masuk emel + kata laluan melalui Supabase.
Hanya pengguna yang ditambah oleh pentadbir boleh masuk.

- `app/login` halaman log masuk, `app/auth/logout` log keluar
- `proxy.ts` menutup semua halaman kecuali `/login`
- `components/Screener.tsx` memuat turun `bursa.json.gz` dari storan Supabase (tertutup) dan
  menjalankan logik penapis asal (`lib/screener-engine.js`, dipindahkan dari `docs/index.html`)
- Data dimuat naik setiap petang oleh `.github/workflows/kemas-kini-data.yml`

## Setup sekali

1. Supabase: buat projek, jalankan `supabase/setup.sql` dalam SQL Editor.
2. Supabase > Authentication > Sign In / Providers: matikan **Allow new users to sign up**.
3. Supabase > Authentication > Users > Add user > Create new user (tandakan Auto Confirm).
4. GitHub > Settings > Secrets and variables > Actions: tambah `SUPABASE_URL` dan `SUPABASE_SECRET_KEY`.
5. Vercel: import repo, Root Directory = `web`, tambah env `NEXT_PUBLIC_SUPABASE_URL` dan
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

## Jalankan di komputer

```
cp .env.example .env.local   # isi nilai dari Supabase
npm install
npm run dev
```
