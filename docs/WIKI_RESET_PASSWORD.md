# Reset Password Adimology

Jika Anda lupa password proteksi aplikasi, Anda dapat mereset melalui Supabase SQL Editor.

## Langkah-langkah Reset

1. Buka [Supabase Dashboard](https://supabase.com/) dan login
2. Pilih project Adimology Anda
3. Buka **SQL Editor** di menu sebelah kiri
4. Copy dan paste query berikut:

```sql
UPDATE profile SET value = '', updated_at = now() WHERE key = 'password_hash';
UPDATE profile SET value = 'false', updated_at = now() WHERE key = 'password_enabled';
```

5. Klik **Run**
6. Refresh aplikasi Adimology di browser Anda

Setelah reset, aplikasi akan bisa diakses tanpa password. Anda dapat mengaktifkan dan mengatur password baru melalui ikon 🛡️ (Shield) di Navbar.

---
*Kembali ke [Halaman Utama Wiki](https://github.com/bhaktiutama/adimology/wiki)*
