# Checkpoint Troubleshooting Koneksi

Jika status di aplikasi masih **"Disconnected"** atau data tidak muncul, silakan lakukan pemeriksaan poin-poin berikut:

## 1. Konfigurasi Ekstensi Chrome
Pastikan file di dalam folder ekstensi sudah diubah (bukan lagi file `.example`):

- **manifest.json**:
  - Pastikan `host_permissions` sudah berisi URL Netlify Anda.
  - Format: `"https://your-app.netlify.app/*"` (harus diakhiri dengan `/*`).
  ![Supabase Setup](https://raw.githubusercontent.com/bhaktiutama/adimology/main/public/checkpoint07.png)
- **background.js**:
  - Pastikan variabel `APP_API_URL` sudah mengarah ke URL Netlify Anda + endpoint API.
  - Contoh: `const APP_API_URL = "https://your-app.netlify.app/api/update-token";`.
  ![Supabase Setup](https://raw.githubusercontent.com/bhaktiutama/adimology/main/public/checkpoint06.png)
- **Refresh Ekstensi**:
  - Jika Anda baru saja mengubah kode, buka `chrome://extensions/`, klik tombol **Refresh** (ikon putar) pada ekstensi Adimology, lalu refresh halaman Stockbit.

## 2. Struktur Database Supabase
Pastikan tabel sudah terbentuk di dashboard Supabase (Menu **Table Editor**):

- Cek apakah tabel-tabel berikut sudah ada:
![Supabase Setup](https://raw.githubusercontent.com/bhaktiutama/adimology/main/public/checkpoint01.png)
- Jika tabel tidak ada, ulangi langkah **A1 No. 4** (Jalankan script `000_init.sql` di SQL Editor).
- Redeploy Netlify.
![Supabase Setup](https://raw.githubusercontent.com/bhaktiutama/adimology/main/public/checkpoint05.png)

## 3. Environment Variables (Netlify)
Pastikan di dashboard Netlify (**Project configuration > Environment variables**) variabel berikut sudah benar dan tidak ada typo:
![Supabase Setup](https://raw.githubusercontent.com/bhaktiutama/adimology/main/public/checkpoint02.png)

| Key | Catatan |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Harus diawali `https://...` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Pastikan menyalin **Anon Public** key, bukan Service Role |
| `GEMINI_API_KEY` | Harus valid dari Google AI Studio |
| `CRON_SECRET` | Bebas, tapi pastikan tidak kosong |

## 4. Verifikasi Chrome Extension
1. Buka Extension di Chrome chrome://extensions/
2. Klik Service Worker.
![Supabase Setup](https://raw.githubusercontent.com/bhaktiutama/adimology/main/public/checkpoint04.png)
3. Jika ekstensi bekerja, Anda akan melihat log seperti: `Token successfully synced to API.`.
![Supabase Setup](https://raw.githubusercontent.com/bhaktiutama/adimology/main/public/checkpoint03.png)
4. Jika ada error merah, silakan screenshot dan tanyakan di group/issue.
