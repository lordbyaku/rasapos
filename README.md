# RasaPOS Cloud — POS Food & Beverage Multi-Outlet

POS untuk resto/kafe dengan banyak outlet: kasir tablet (tetap jalan saat offline), meja & open bill, kitchen display, printer Bluetooth, dashboard pusat realtime, inventori & resep. Berjalan sepenuhnya di **Cloudflare** (Workers + Durable Objects + D1).

Dokumen: [PLAN-CLOUDFLARE.md](PLAN-CLOUDFLARE.md) · [CHANGELOG.md](CHANGELOG.md) · [PERBANDINGAN-BACKEND.md](PERBANDINGAN-BACKEND.md)

## Aplikasi
| Halaman | Untuk |
|---|---|
| `/` | Login owner/manajer, daftar usaha, pairing perangkat |
| `/backoffice.html` | Dashboard pusat, transaksi, laporan, menu, outlet, staff, inventori, promo, pengaturan |
| `/pos.html` | Kasir/waiter di tablet (PIN staff) |
| `/kds.html` | Layar dapur |
| `/admin.html` | Superadmin (kelola tenant & langganan) |
| `/tutorial.html` | Panduan & training interaktif per peran (simulasi, kuis, sertifikat) + asisten "Tanya Panduan" |

## Menjalankan lokal
Butuh Node.js 20+.
```bash
npm install
npm run setup
npm run dev
```
Buka http://localhost:8787. Isi data demo (server harus berjalan):
```bash
npm run seed
```
- Owner demo: `demo@rasapos.local` / `demo12345`
- Superadmin: `admin@rasapos.local` / `admin12345`
- PIN staff: manager `111111`, kasir `1234`, waiter `2222`

Uji tablet: Back office → Perangkat → buat kode → buka `/` di tab lain → "Perangkat Outlet".

Test:
```bash
npm test
```
```bash
npm run smoke
```
Simulasi menyeluruh (82 skenario + fuzz, hanya ke server lokal):
```bash
npm run scenarios
```

## Deploy ke Cloudflare
1. `npx wrangler login`
2. `npx wrangler d1 create rasapos-core` → salin `database_id` ke `wrangler.jsonc`.
3. `npx wrangler secret put JWT_SECRET` (string acak ≥ 32 karakter). Opsional: `RESEND_API_KEY` + var `MAIL_FROM`.
4. Ubah `vars` di `wrangler.jsonc`: `APP_URL` (domain produksi), `SUPERADMIN_EMAILS`.
5. `npm run deploy`
6. Daftar dengan email superadmin di aplikasi.

Domain produksi: **https://pos.trisna.web.id** (Workers custom domain; `*.workers.dev` tetap aktif).

## Backup & pemulihan
**Status: aktif** (bucket `rasapos-backup`, dibuat 4 Okt 2026). Untuk instalasi baru: aktifkan R2 di dashboard → `npx wrangler r2 bucket create rasapos-backup` → binding `r2_buckets` di `wrangler.jsonc`.

Setelah aktif: backup otomatis tiap tenant setiap malam 03:30 WIB (`tenant-<id>/<tanggal>.json`, disimpan 35 hari) berisi semua data termasuk hash PIN, kunci persetujuan, dan foto menu.
Superadmin → klik tenant → **Backup**: "Backup sekarang" dan **Pulihkan** (ketik nama usaha untuk konfirmasi; keadaan sebelum pulih dicadangkan otomatis).
Database inti (D1) punya Time Travel bawaan Cloudflare (pemulihan titik waktu 30 hari): `npx wrangler d1 time-travel restore rasapos-core --timestamp <waktu>`.

## Email (reset password & ringkasan error)
Tanpa email, "Lupa password" menampilkan pesan untuk menghubungi admin (superadmin bisa reset dari panel).
Pilihan A — Cloudflare Email Service: Dashboard → Email Service → onboard domain pengirim (mis. `trisna.web.id`), isi var `MAIL_FROM` (mis. `noreply@trisna.web.id`), buka komentar `send_email` di `wrangler.jsonc`.
Pilihan B — Resend: `npx wrangler secret put RESEND_API_KEY` + isi `MAIL_FROM`.

## Keamanan anti-curang
- Persetujuan manager (void, diskon besar, refund) selalu diverifikasi server. Saat offline, tablet mengenkripsi PIN manager dengan kunci publik tenant (RSA-OAEP); server membuka & memverifikasi PIN saat sinkron. Bukti terikat ke satu transaksi, tidak bisa dipakai ulang; tebakan salah ikut terkunci 5×.
- Tablet tidak pernah menerima hash PIN server, hanya verifier terpisah (`pin_check`). Staff lama mendapat verifier setelah login online sekali (sebelum itu login offline belum tersedia untuk staff tersebut).
- Audit menandai persetujuan offline (`approval_offline`).

## Pemantauan
Superadmin → **Sistem**: error server 24 jam/7 hari, endpoint yang paling sering error, status email/backup/AI. Cron harian 08:00 WIB membersihkan log lama dan mengirim ringkasan error ke email superadmin (bila email aktif).

## Legal
`/syarat.html` dan `/privasi.html` (draf). Lengkapi bagian `[dalam kurung siku]` dan minta tinjauan ahli hukum. Pendaftar wajib mencentang persetujuan; versinya dicatat (`TERMS_VERSION` di `src/auth.js`).

## Tenant demo
`node scripts/demo-burger.mjs <URL> --email <email-owner> [--days 14] [--activate wrangler|admin]` membuat tenant **Burger Mantul** (Jogja, Solo, Semarang) lengkap: menu & varian, resep & stok, promo, member, staff, riwayat ±14 hari (tutup hari, void, refund), serta kondisi hari ini (shift buka, meja terisi, tiket dapur). Kredensial ditulis ke `.demo-burger-mantul.md` (diabaikan git).

## Impor menu
Back Office → Menu & Harga → **Impor CSV** (template tersedia). Kolom: nama, harga, kategori, stasiun, sku, deskripsi, pajak. Pratinjau dulu; SKU/nama sama → diperbarui; kategori baru dibuat otomatis; maks. 1000 baris.

## Paket & harga (lihat /syarat.html)
| Paket | Bulanan | Tahunan | Atur di Superadmin → tenant → Fitur |
|---|---|---|---|
| Basic | Rp 100.000 | Rp 1.000.000 | matikan **Layar Dapur (KDS)** & **Inventori & resep** |
| Pro | Rp 200.000 | Rp 2.000.000 | semua fitur aktif |

Harga per paket (maks. 5 outlet). Pembayaran: transfer SeaBank a.n. Haritrisna Suryadimarta, konfirmasi via WhatsApp; aktifkan lewat Superadmin → Perpanjang langganan.

## Fitur per tenant
Superadmin → klik tenant → **Fitur**: KDS, Meja & denah, Inventori & resep, Promo/pelanggan/poin, Asisten AI bisa dimatikan per usaha
(mis. usaha yang hanya butuh transaksi). Ditegakkan di server; tablet menyesuaikan saat memuat ulang data. Definisi: `public/js/shared/features.js`.

## Asisten panduan (Tanya Panduan)
Tombol **Tanya Panduan** di `/tutorial.html` menjawab pertanyaan dari isi panduan.
- **Tanpa pengaturan apa pun:** pencarian panduan (gratis, jalan offline) — menampilkan potongan pelajaran paling relevan + tautan ke pelajarannya.
- **Opsional, jawaban AI (Gemini, gratis):** buat API key di [Google AI Studio](https://aistudio.google.com/apikey), lalu masukkan di
  **Superadmin → Asisten AI → Tambah API key** (maks. 5 kunci, langsung diuji ke Google, disimpan terenkripsi).
  - Kunci dipakai **bergiliran (round robin)**. Kunci yang kena limit per menit diistirahatkan sesuai saran Google, kuota harian habis → sampai reset harian, kunci ditolak → 6 jam; permintaan otomatis pindah ke kunci berikutnya.
  - Di panel yang sama: model, batas pertanyaan per usaha & total per 24 jam, status/riwayat error tiap kunci, tombol Uji/Pulihkan/Nonaktifkan.
  - Alternatif lewat terminal: `npx wrangler secret put GEMINI_API_KEY` (ikut bergiliran).
  - Kuota gratis Google dihitung **per project**, bukan per kunci: beberapa kunci dari project yang sama tetap berbagi satu kuota.
  - Kunci dienkripsi dengan `JWT_SECRET`; jika secret itu diganti, kunci AI harus dimasukkan ulang.

  Jawaban AI hanya untuk pengguna yang login (akun Back Office atau tablet yang sudah dipasangkan); tanpa login/offline/kuota habis otomatis kembali ke pencarian.
  Catatan: di tier gratis, Google boleh memakai isi pertanyaan untuk meningkatkan produknya — jangan ketik data pribadi/rahasia di chat.

## Tablet & printer
- Android + **Chrome ≥ 138**, buka aplikasi lalu "Install/Tambahkan ke layar utama".
- Pengaturan perangkat → Printer: **Web Serial** (Bluetooth Classic, printer thermal umum), **BLE**, atau **RawBT**. Pasangkan printer di Bluetooth Android dulu.
- Laci kas dibuka lewat printer (ESC/POS).

## Offline
Transaksi, kirim dapur, bayar, dan shift tetap bisa saat internet putus; data disimpan di tablet dan dikirim otomatis saat online. Pindah/gabung/split bill, refund, tutup shift & tutup hari butuh online. Jangan hapus data browser selama header menampilkan "tertunda".

## Kapasitas & kuota Cloudflare (hasil `scripts/capacity.mjs`)
Diukur dengan alur tablet asli (1 request per aksi kasir, layar dapur, back office), `DEBUG_METRICS=1` di `.dev.vars`:
per transaksi ±8,3 request, ±10 baris ditulis, ±150 baris dibaca. Proyeksi **3 tenant × 10 outlet × 100 trx/hari**:

| Kuota Free (per hari) | Pemakaian | |
|---|---|---|
| Worker requests 100.000 | ±31.000 | 31% |
| Durable Object requests 100.000 | ±37.000 | 37% |
| Baris ditulis 100.000 | ±30.000 (bisa ±2× bila indeks dihitung) | 30–60% |
| Baris dibaca 5.000.000 | 1,0 jt (hari 1) → ±5 jt (±1 tahun, karena backup harian membaca semua data) | 21% → 100% |

Di paket Free, melewati satu batas = operasi **gagal** sampai 07:00 WIB. Rekomendasi: **Workers Paid ($5/bln)** saat tenant berbayar pertama;
kebutuhan skenario di atas (±0,9 jt req Worker, ±1,1 jt req DO, ±0,9 jt baris tulis per bulan) masih di dalam kuota Paid (± $5,02/bln).
Satu tenant = satu Durable Object: simulasi 10 outlet bersamaan memproses ±105 request/detik tanpa error (kebutuhan puncak ±1 request/detik).

## Update aplikasi
Push ke branch `main` → Cloudflare otomatis build & deploy. **Jika ada file baru di `migrations/`, jalankan dulu sebelum push:**
```bash
npm run db:migrate:remote
```
