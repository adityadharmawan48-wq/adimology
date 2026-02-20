# Checkpoint Troubleshooting Koneksi

Jika status di aplikasi masih **"Disconnected"** atau data tidak muncul, silakan lakukan pemeriksaan poin-poin berikut:

## 1. Konfigurasi Ekstensi Chrome
Pastikan file di dalam folder ekstensi sudah diubah (bukan lagi file `.example`):

- **manifest.json**:
  - Pastikan `host_permissions` sudah berisi URL Netlify Anda.
  - Format: `"https://your-app.netlify.app/*"` (harus diakhiri dengan `/*`).
- **background.js**:
  - Pastikan variabel `APP_API_URL` sudah mengarah ke URL Netlify Anda + endpoint API.
  - Contoh: `const APP_API_URL = "https://your-app.netlify.app/api/update-token";`.
- **Refresh Ekstensi**:
  - Jika Anda baru saja mengubah kode, buka `chrome://extensions/`, klik tombol **Refresh** (ikon putar) pada ekstensi Adimology, lalu refresh halaman Stockbit.

## 2. Struktur Database Supabase
Pastikan tabel sudah terbentuk di dashboard Supabase (Menu **Table Editor**):

- Cek apakah tabel-tabel berikut sudah ada:
  - `analysis_history`
  - `emiten_list`
  - `stockbit_tokens`
  - `watchlist`
  - `watchlist_history`
- Jika tabel tidak ada, ulangi langkah **A1 No. 14** (Jalankan script `000_init.sql` di SQL Editor).

## 3. Environment Variables (Netlify)
Pastikan di dashboard Netlify (**Site configuration > Environment variables**) variabel berikut sudah benar dan tidak ada typo:

| Key | Catatan |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Harus diawali `https://...` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Pastikan menyalin **Anon Public** key, bukan Service Role |
| `GEMINI_API_KEY` | Harus valid dari Google AI Studio |
| `CRON_SECRET` | Bebas, tapi pastikan tidak kosong |

## 4. Cara Verifikasi Manual
1. Buka Stockbit di Chrome.
2. Klik kanan di mana saja > **Inspect**.
3. Buka tab **Console**.
4. Jika ekstensi bekerja, Anda akan melihat log seperti: `[Stockbit Token] Token updated successfully`.
5. Jika ada error merah, silakan screenshot dan tanyakan di group/issue.
