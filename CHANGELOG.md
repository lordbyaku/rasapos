# Changelog

## [1.4.0] — 2026-10-04

Perbaikan tahap 1 dari audit kelayakan jual.

### Keamanan (anti-curang)
- **Persetujuan manager offline tidak bisa dipalsukan lagi.** Sebelumnya operasi offline cukup membawa ID manager. Kini tablet mengenkripsi PIN manager untuk server (RSA-OAEP per tenant); server memverifikasi PIN saat sinkron, bukti terikat ke satu operasi (tidak bisa dipakai ulang), tebakan salah ikut kunci 5×. Format lama tanpa bukti ditolak.
- **Hash PIN server tidak lagi dikirim ke tablet.** Tablet memakai verifier terpisah (`pin_check`, PBKDF2 100.000 iterasi, salt berbeda). Staff lama mendapat verifier setelah login online sekali.
- PIN manager tidak pernah tersimpan terbuka di antrean tablet (sebelumnya bisa, bila operasi tertunda saat online).
- Audit menandai persetujuan offline (`approval_offline`).

### Baru
- **Backup & pemulihan**: backup harian ke R2 (35 hari, termasuk PIN, kunci, foto), "Backup sekarang" & "Pulihkan" di superadmin (konfirmasi nama usaha, cadangan otomatis sebelum pulih). Aktif setelah R2 diaktifkan.
- **Impor menu CSV** dengan pratinjau, validasi per baris, kategori otomatis, pembaruan berdasarkan SKU/nama.
- **Superadmin → Sistem**: log error server, status email/backup/AI; cron harian (bersih-bersih + ringkasan error via email).
- **Email**: dukungan Cloudflare Email Service (binding `EMAIL`) selain Resend. "Lupa password" kini jujur bila email belum aktif.
- **Syarat & Ketentuan** dan **Kebijakan Privasi** (draf, UU PDP); persetujuan wajib saat daftar dan versinya dicatat.
- Domain produksi `pos.trisna.web.id` (APP_URL).

### Perbaikan (ditemukan simulasi)
- Impor: harga berupa teks (mis. "gratis") sempat lolos sebagai Rp 0 — kini ditolak.
- Impor: kategori sama beda huruf besar/kecil sempat dibuat dua kali — kini satu.

### Pengujian
- Skenario G7–G10 (anti-curang) & O1–O3: total 102 skenario, 3× berturut-turut lulus; uji pemulihan backup end-to-end; smoke & unit lulus.
- Migrasi: D1 `0005_error_events.sql`; skema tenant v2 (`staff.pin_check`) otomatis.

## [1.3.1] — 2026-10-03

Simulasi lanjutan fitur per tenant (96 skenario + 13 uji round robin AI, 3× berturut-turut lulus).

### Perbaikan
- Meja nonaktif: pasang/pindah meja dari tablet yang belum memuat ulang data kini ditolak jelas saat online (sebelumnya diterima). Operasi offline tetap diterima.
- Pelanggan nonaktif: id pelanggan juga dibuang saat **buka order** (sebelumnya hanya saat ubah order).
- Inventori dinyalakan lagi setelah sempat nonaktif: Back Office menampilkan **pengingat stock opname** beserta periodenya (bisa ditutup setelah opname).
- Asisten AI: tenant yang fiturnya dimatikan mendapat pesan "tidak aktif untuk usaha Anda" (sebelumnya tertutup pesan "belum diaktifkan").
- Status fitur di panel superadmin diselaraskan ulang dari tenant setiap malam / saat "Perbarui statistik"; kegagalan pencatatan memberi pesan jelas.

### Pengujian
- Skenario N1–N10: promo & pelanggan saat offline, order berjalan saat fitur dimatikan, WebSocket KDS ditolak, tiket dapur tetap untuk printer, pengingat opname, AI per usaha, input superadmin aneh, cermin panel menyimpang, semua fitur mati sekaligus.
- test/ai-keys.test.js: giliran merata, limit per menit/harian, kunci ditolak, gangguan jaringan, model salah, semua kunci istirahat, secret berganti, 30 permintaan bersamaan.

## [1.3.0] — 2026-10-03

### Baru
- **Fitur per tenant** — Superadmin → detail tenant → bagian **Fitur**: aktifkan/nonaktifkan per usaha
  (tercatat di riwayat langganan, tampil di daftar tenant):
  | Fitur | Jika dinonaktifkan |
  |---|---|
  | Layar Dapur (KDS) | Perangkat KDS tidak bisa dipasangkan; KDS yang sudah terpasang ditolak. Kasir tetap bisa "Kirim" & mencetak tiket dapur. Peran "Dapur" disembunyikan. |
  | Meja & denah | Tab Meja, pilih/pindah meja, dan kelola Area & Meja disembunyikan & ditolak server. Dine-in tetap bisa ("Makan di tempat"). |
  | Inventori & resep | Menu Inventori & editor resep disembunyikan; penjualan tidak memotong stok; endpoint stok ditolak. Resep lama tetap tersimpan. |
  | Promo, pelanggan & poin | Promo tidak dikirim ke kasir & ditolak server, data pelanggan/poin tidak dipakai (cukup nama pemesan). Diskon manual tetap ada. |
  | Asisten AI panduan | Panduan hanya memakai pencarian. |
- Penegakan di server (Durable Object), bukan hanya disembunyikan di layar. Default semua aktif (tenant lama tidak berubah).
- Migrasi `0004_tenant_features.sql`. Skenario simulasi M1–M4 (86 skenario).


## [1.2.1] — 2026-10-03

### Perbaikan
- API key Gemini format baru (`AQ.…`, mengandung titik) ditolak "Format API key tidak valid". Kini format lama `AIza…` dan baru `AQ.…` diterima.
- Batas token jawaban AI dinaikkan (model Gemini 3 memakai sebagian token untuk "berpikir", jawaban bisa terpotong).


## [1.2.0] — 2026-10-03

### Baru
- **Superadmin → Asisten AI**: kelola sampai **5 API key Gemini** dari panel (tanpa terminal).
  - Kunci diuji ke Google sebelum disimpan, disimpan terenkripsi AES-GCM (turunan `JWT_SECRET`), hanya 4 karakter terakhir yang ditampilkan.
  - **Round robin + failover**: tiap pertanyaan memakai kunci giliran berikutnya; bila gagal langsung pindah ke kunci lain.
    Kunci kena limit per menit / kuota harian / ditolak otomatis diistirahatkan (cooldown) lalu dipakai lagi.
  - Status per kunci (jumlah panggilan, gagal, error terakhir), tombol Uji, Pulihkan, Nonaktifkan, Ganti nama, Hapus.
  - Model Gemini dan batas harian (per usaha & total) bisa diubah dari panel; nilai di `wrangler.jsonc` menjadi default.
- Migrasi `0003_ai_keys.sql` (tabel `ai_keys`, `app_settings`).


## [1.1.0] — 2026-10-03

### Baru
- **Asisten "Tanya Panduan"** di halaman tutorial (tombol mengambang, layar penuh di HP).
  - Pencarian panduan berbahasa Indonesia (BM25 + sinonim istilah kasir: void/batal, struk/nota, QRIS/non-tunai, dll.).
    Gratis, tanpa login, tetap jalan offline. Jawaban berisi potongan pelajaran + tautan langsung ke pelajarannya.
  - Jawaban AI opsional lewat **Gemini** (`POST /api/assist`): Worker memilih potongan panduan yang relevan, Gemini merangkum
    jawaban hanya dari potongan tersebut dan mencantumkan sumbernya. Aktif bila secret `GEMINI_API_KEY` diisi;
    wajib login akun/perangkat; dibatasi per usaha (`AI_TENANT_DAILY`) dan total (`AI_DAILY_LIMIT`).
    Gagal/kuota habis/offline → otomatis kembali ke pencarian.
- Isi panduan dipisah ke `public/js/tutorial-content.js` (dipakai halaman tutorial dan Worker).


## [1.0.1] — 2026-10-03

Hasil simulasi menyeluruh (`npm run scenarios`, 82 skenario: harga, modifier, void, diskon, promo, pembayaran,
refund, meja, offline, hak akses, input aneh, operasi bersamaan, fuzz 120 order + cek konsistensi laporan & kas).

### Keamanan
- **Kunci penyimpanan acak per tenant** (`tenants.do_key`, migrasi `0002`). Sebelumnya data tenant dialamatkan
  dengan nomor urut ID; jika database inti dibuat ulang, tenant baru bisa mendapat penyimpanan tenant lama.
  Tenant lama tetap memakai kunci `tenant:<id>`. Durable Object kini menolak konteks tenant yang tidak cocok
  dan menolak inisialisasi ulang oleh tenant lain.

### Perbaikan
- Request yang ditolak Durable Object sebelum body dibaca membuat request **berikutnya** gagal 500
  ("Can't read from request stream"). Body kini dibaca penuh di Worker sebelum diteruskan.
- Sisa tagihan < setengah satuan pembulatan setelah non-tunai (mis. QRIS 103.910 dari 103.950) tidak bisa
  diselesaikan karena "uang pas" tunai Rp 0 ditolak. Baris tunai Rp 0 kini dihitung untuk pembulatan.
- Approval offline dengan manager tidak dikenal/tidak berwenang membuat operasi tersangkut di antrean tablet;
  kini ditolak sebagai aturan bisnis (tersimpan, tidak diulang terus).
- Diskon persen > 100% ditolak.
- Jumlah item harus bilangan bulat 1–9999 (teks/pecahan sebelumnya diam-diam jadi 1).
- Nominal pembayaran negatif/bukan angka ditolak dengan pesan jelas (sebelumnya diam-diam dibuang).
- Superadmin lokal dipisah lewat `.dev.vars` (`SUPERADMIN_EMAILS`) agar tidak bentrok dengan produksi.

## [1.0.0] — 2026-10-02

Rilis pertama RasaPOS Cloud (Cloudflare Full). Plan: [PLAN-CLOUDFLARE.md](PLAN-CLOUDFLARE.md).

### Fase 1 — Fondasi
- Worker tunggal (API + aset statis), D1 `CORE`, Durable Object `TenantDO` (SQLite per tenant), migrasi skema berversi.
- Auth owner/manajer (PBKDF2 + JWT + refresh token berotasi), lupa/reset password (Resend opsional), rate limit login/pairing.
- Lisensi: trial 14 hari (1 outlet), paket per 5 outlet, masa tenggang 3 hari.
- Outlet (pajak PBJT, service, pembulatan tunai, zona waktu, jam tutup hari), area & meja, staff + PIN (manager wajib 6 digit, lockout 5x salah), hak akses per peran/kustom.
- Pairing perangkat dengan kode 6 digit, cabut perangkat seketika.
- Master menu: kategori, menu, grup modifier/varian, foto (WebP), override harga/ketersediaan per outlet.
- Panel superadmin (`admin.html`) menggantikan WEB APP MANAGEMENT.

### Fase 2 — Kasir (POS)
- Login PIN (online & offline), shift (modal, kas masuk/keluar, buka laci, tutup + selisih), tutup hari (Z-report).
- Order dine-in/take away/online, modifier & catatan, open bill, kirim dapur per stasiun, tahan item, void (PIN manager), diskon item/order, promo, pelanggan.
- Pembayaran multi metode & split, pembulatan khusus tunai, struk (ESC/POS Web Serial/BLE/RawBT/print browser), WhatsApp, cetak ulang, refund.
- Meja: denah per area, status realtime, pindah/gabung/split bill.

### Fase 3 — Dashboard pusat & laporan
- Dashboard multi-outlet realtime (KPI vs periode sebelumnya, per jam/hari per outlet, channel, status outlet, feed transaksi).
- Transaksi lintas outlet (filter, detail, refund, CSV), laporan harian/menu/kasir/shift/pembayaran & channel/pajak/tutup hari/audit/HPP.

### Fase 4 — Dapur
- KDS realtime (timer warna, Mulai/Siap, centang item, riwayat & panggil ulang, suara, cetak tiket otomatis).

### Fase 5 — Offline
- Cache bootstrap IndexedDB, outbox operasi idempotent, sinkron otomatis, operasi offline dicatat atas nama staff pelakunya, service worker cache-first.

### Fase 6 — Inventori
- Bahan baku, resep per menu & opsi modifier, potong stok otomatis (teragregasi per order), pembelian (harga rata-rata), waste, opname, transfer antar outlet, HPP & margin.

### Fase 7 — Lanjutan
- Harga per channel & komisi (penjualan neto), promo otomatis terjadwal, poin pelanggan, backup JSON, statistik superadmin.

### Panduan & training (`/tutorial.html`)
- 15 modul per peran (Pemilik, Manager, Kasir, Waiter, Dapur): 54 pelajaran langkah demi langkah dengan petunjuk lokasi menu, tips & peringatan.
- 11 simulator latihan yang aman (login PIN, buka shift, kalkulator pajak, pairing, membuat pesanan, pembayaran split, void dengan PIN manager, status meja, tutup shift, layar dapur, mode offline) — memakai rumus `money.js` yang sama dengan kasir.
- Kuis per modul (32 soal, lulus ≥ 70%) dengan pembahasan, pencarian topik, FAQ, progres tersimpan di perangkat, dan sertifikat yang bisa dicetak/PDF.
- Tautan dari halaman login, menu Back Office, dan menu kasir; tersedia offline.

### Perbaikan selama pengujian
- Numpad pembayaran kini mengganti nominal terisi otomatis; tunai ditolak jika non-tunai sudah melunasi (aturan bersama server).
- Render POS memakai `setTimeout` (bukan rAF) agar tidak macet saat layar tidak aktif.
- Cetak otomatis hanya untuk printer thermal (print browser tidak memblokir kasir).
- Tiket dapur memakai waktu asli transaksi offline; KDS hanya menampilkan tiket 16 jam terakhir; tutup hari menuntaskan tiket.
- Kegagalan approval/izin tidak membuat outbox macet atau membuang data.
