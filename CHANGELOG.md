# Changelog

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
