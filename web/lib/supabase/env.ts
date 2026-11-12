export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// Kunci "publishable" (sb_publishable_...) atau kunci "anon" lama, kedua-duanya selamat didedahkan ke pelayar.
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
export const DATA_BUCKET = "data";
export const DATA_FILE = "bursa.json.gz";
