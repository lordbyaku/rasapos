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
| `/tutorial.html` | Panduan & training interaktif per peran (simulasi, kuis, sertifikat) |

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

## Deploy ke Cloudflare
1. `npx wrangler login`
2. `npx wrangler d1 create rasapos-core` → salin `database_id` ke `wrangler.jsonc`.
3. `npx wrangler secret put JWT_SECRET` (string acak ≥ 32 karakter). Opsional: `RESEND_API_KEY` + var `MAIL_FROM`.
4. Ubah `vars` di `wrangler.jsonc`: `APP_URL` (domain produksi), `SUPERADMIN_EMAILS`.
5. `npm run deploy`
6. Daftar dengan email superadmin di aplikasi.

Opsional: backup harian ke R2 (aktifkan blok `r2_buckets` di `wrangler.jsonc`).

## Tablet & printer
- Android + **Chrome ≥ 138**, buka aplikasi lalu "Install/Tambahkan ke layar utama".
- Pengaturan perangkat → Printer: **Web Serial** (Bluetooth Classic, printer thermal umum), **BLE**, atau **RawBT**. Pasangkan printer di Bluetooth Android dulu.
- Laci kas dibuka lewat printer (ESC/POS).

## Offline
Transaksi, kirim dapur, bayar, dan shift tetap bisa saat internet putus; data disimpan di tablet dan dikirim otomatis saat online. Pindah/gabung/split bill, refund, tutup shift & tutup hari butuh online. Jangan hapus data browser selama header menampilkan "tertunda".

## Kuota Cloudflare Free (perkiraan)
100 rb baris tulis/hari ≈ ±24 outlet aktif. Upgrade **Workers Paid ($5/bln)** sebelum ±15 outlet.
