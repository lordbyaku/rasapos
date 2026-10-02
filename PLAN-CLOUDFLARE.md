# PLAN v1 — RasaPOS Cloud (Cloudflare Full)

**Status:** Final untuk implementasi v1 · **Tanggal:** 2026-10-02
**Menggantikan:** [PLAN.md](PLAN.md) (versi Supabase, disimpan sebagai arsip keputusan)
**Dasar keputusan:** [PERBANDINGAN-BACKEND.md](PERBANDINGAN-BACKEND.md)

---

## 0. Keputusan

| # | Topik | Keputusan |
|---|---|---|
| 1 | Platform | **Cloudflare Full**: satu Worker (API + aset statis) + Durable Objects SQLite (1 per tenant) + D1 (database inti) + R2 opsional |
| 2 | Hosting frontend | Aset statis di Worker yang sama (*Workers Static Assets*, penerus Cloudflare Pages). Gratis & tanpa batas, satu domain dengan API (tanpa CORS) |
| 3 | WEB APP MANAGEMENT | **Tidak diintegrasikan.** Diganti panel superadmin bawaan (`admin.html`) |
| 4 | Frontend | Vanilla JS tanpa bundler, fungsi global; CSS Tailwind di-build sekali; library di `public/vendor` (tanpa CDN, aman offline) |
| 5 | Perangkat | Tablet Android + Chrome ≥ 138 (PWA). Printer thermal via Web Serial (Bluetooth Classic), Web Bluetooth (BLE), RawBT, atau print browser |
| 6 | Offline | Wajib. IndexedDB + antrean operasi (outbox) + sinkron idempotent |
| 7 | Lisensi | Trial 14 hari (1 outlet), lalu **paket per 5 outlet**; masa tenggang 3 hari |
| 8 | Biaya | Mulai di Workers Free; upgrade Workers Paid ($5/bln) sebelum ±15 outlet aktif |

---

## 1. Arsitektur

```
Tablet / Browser (PWA vanilla JS)
   │ HTTPS JSON  /api/*                    │ WebSocket /api/ws
   ▼                                       ▼
Worker (src/index.js)
   ├─ aset statis public/  (index, backoffice, pos, kds, admin)
   ├─ /api/auth/*   → D1 CORE   (users, tenants, refresh_tokens, devices, pair_codes, resets, tenant_stats)
   ├─ /api/admin/*  → D1 CORE   (superadmin)
   └─ /api/t/*, /api/ws → Durable Object TenantDO  (idFromName("tenant:<id>"))
                              ├─ SQLite: outlet, staff, menu, meja, order, shift, tiket, stok, laporan…
                              ├─ operasi atomik (transactionSync) + idempotensi (op_id)
                              ├─ hub WebSocket per outlet (Hibernation API)
                              └─ alarm harian: statistik → D1, bersih-bersih, backup ke R2 (jika ada)
```

### 1.1 Prinsip
- **Isolasi tenant fisik**: data bisnis tiap tenant berada di SQLite milik DO-nya sendiri. Worker hanya meneruskan request ke DO milik `tenant_id` yang ada di token, bukan dari URL.
- **Server adalah sumber kebenaran saat online**; saat offline, perangkat menyimpan operasi dan server menerapkannya kemudian (idempotent by `op_id`).
- **Kode bersama** frontend ↔ backend: `public/js/shared/money.js` (hitung total) dan `public/js/shared/order-ops.js` (reducer operasi order). Keduanya diimpor oleh Worker, sehingga hasil hitung kasir offline = hasil server.
- **Hemat tulis**: item order, pembayaran, & item tiket disimpan sebagai JSON di baris induknya; laporan memakai tabel ringkasan harian.

### 1.2 Struktur Folder
```
POS-FNB/
├── public/                  # aset statis (dilayani Worker)
│   ├── index.html           # login owner/manajer, daftar, pairing perangkat
│   ├── backoffice.html      # dashboard pusat & manajemen
│   ├── pos.html             # kasir & waiter (tablet)
│   ├── kds.html             # kitchen display
│   ├── admin.html           # superadmin
│   ├── css/app.css          # hasil build Tailwind (src: styles/app.src.css)
│   ├── vendor/              # sweetalert2, chart.js, fontawesome (disalin dari node_modules)
│   ├── js/shared/           # money.js, order-ops.js (dipakai juga oleh Worker)
│   ├── js/core/             # api, idb, utils, ui, realtime, sync, escpos, printer, pwa
│   ├── js/{backoffice,pos,kds,admin}/
│   ├── manifest.json, sw.js, version.json, icons/
│   └── _headers
├── src/                     # Worker
│   ├── index.js             # router utama + export TenantDO
│   ├── lib/                 # http, jwt, crypto, validate, ids, time
│   ├── auth.js, admin.js, core-db.js
│   └── tenant/              # tenant-do.js, schema.js, modules (outlets, staff, menu, orders, shifts, kitchen, inventory, reports, promos, customers, files, sync)
├── migrations/              # D1 CORE (wrangler d1 migrations)
├── scripts/                 # vendor.mjs, icons.mjs, smoke.mjs, bump-version.mjs
├── test/                    # node:test (money, order-ops)
├── wrangler.jsonc, package.json, tailwind.config.js
├── README.md, CHANGELOG.md, CLAUDE.md
└── mockup/                  # mockup UI fase desain
```

### 1.3 Database CORE (D1)
| Tabel | Isi |
|---|---|
| `users` | id, email, password_hash, name, tenant_id, role (`owner`/`manager`), outlet_ids JSON, is_superadmin, created_at, last_login_at |
| `tenants` | id, name, owner_user_id, status (`trial`/`active`/`suspended`), trial_ends_at, paid_until, outlet_packs, created_at |
| `refresh_tokens` | token_hash, user_id, expires_at, revoked_at |
| `devices` | id, tenant_id, outlet_id, name, type (`pos`/`kds`), code (2 huruf), secret_hash, revoked_at, last_seen_at |
| `pair_codes` | code, tenant_id, outlet_id, type, name, expires_at, used_at |
| `password_resets` | token_hash, user_id, expires_at, used_at |
| `login_attempts` | key, count, window_start (rate limit login & pairing) |
| `tenant_stats` | tenant_id, date, outlets, trx, sales (diisi alarm harian DO) |
| `subscription_logs` | tenant_id, action, detail, by_user, created_at |

### 1.4 Database Tenant (SQLite di TenantDO)
| Tabel | Isi |
|---|---|
| `meta` | key/value (schema_version, tenant info, pengaturan channel & pajak default) |
| `outlets` | id, code, name, address, phone, tz_offset_min, day_cutoff_hour, tax_rate, tax_label, service_rate, tax_on_service, tax_inclusive, cash_rounding, receipt_header, receipt_footer, is_active |
| `staff` | id, name, pin_hash, pin_salt, role (`manager`/`cashier`/`waiter`/`kitchen`), outlet_ids JSON, permissions JSON, failed, locked_until, is_active |
| `categories` | id, name, color, station, sort, is_active |
| `modifier_groups` | id, name, min_select, max_select, options JSON `[{id,name,price,recipe}]` |
| `menus` | id, category_id, name, sku, price, station, taxable, image_id, modifier_group_ids JSON, recipe JSON, is_active, sort |
| `outlet_menus` | outlet_id, menu_id, price, is_available, sold_out_date |
| `channel_prices` | channel, menu_id, price |
| `areas`, `tables` | outlet_id, area_id, name, capacity, sort, dirty |
| `customers` | id, name, phone, points, visits, total_spent |
| `promos` | id, name, type (`percent`/`amount`), value, min_subtotal, days JSON, start_time, end_time, outlet_ids JSON, channels JSON, is_active |
| `shifts` | id, outlet_id, device_id, staff_id, business_date, opening_cash, expected_cash, closing_cash, status, summary JSON |
| `cash_movements` | id, shift_id, outlet_id, type (`in`/`out`/`no_sale`), amount, note |
| `orders` | id (UUID klien), outlet_id, order_no, business_date, type, channel, table_id, guests, customer_id, customer_name, status (`open`/`paid`/`void`), items JSON, discount JSON, totals JSON, payments JSON, shift_id, device_id, staff_id, offline, opened_at, closed_at, updated_at |
| `kitchen_tickets` | id, outlet_id, order_id, ticket_no, station, label, items JSON, status, created_at, started_at, done_at |
| `ops` | op_id, type, result, created_at (idempotensi) |
| `sales_daily`, `sales_items_daily`, `sales_hourly`, `payments_daily` | ringkasan untuk dashboard & laporan |
| `ingredients`, `stock`, `stock_moves`, `suppliers` | inventori (stock_moves 1 baris per operasi, item JSON) |
| `audit_logs` | void, refund, diskon, reprint, no-sale, anomali sinkron |
| `files` | id, mime, data BLOB (foto menu ≤ 200 KB) |
| `revoked_devices` | device_id |

### 1.5 Auth & Keamanan
- **Owner/manajer**: email + password (PBKDF2-SHA256, iterasi dapat diatur), access JWT HS256 15 menit + refresh token 30 hari (rotasi, hash disimpan di D1).
- **Perangkat**: owner membuat **kode pairing 6 digit** (berlaku 15 menit) di back office; tablet memasukkan kode → menerima `device_secret` (disimpan di perangkat) → ditukar dengan access JWT perangkat 12 jam.
- **Staff**: pilih nama + PIN di perangkat → DO memverifikasi (5x salah = kunci 5 menit) → **staff token** (JWT 16 jam). Request POS membawa token perangkat + staff token. PIN juga dicache (hash) untuk login offline.
- **Superadmin**: email di variabel `SUPERADMIN_EMAILS`; mendapat flag saat login.
- Permission per role: `manager` (semua di outletnya), `cashier` (order, bayar, shift), `waiter` (order, kirim dapur), `kitchen` (KDS). Void/refund/diskon > batas butuh PIN manager.
- Cabut perangkat → tercatat di D1 + `revoked_devices` di DO (berlaku seketika).
- Header keamanan & CSP via `public/_headers`; `connect-src 'self'`.

### 1.6 API (ringkas)
| Endpoint | Fungsi |
|---|---|
| `POST /api/auth/register` · `login` · `refresh` · `logout` · `forgot` · `reset` · `GET me` | Akun owner/manajer |
| `POST /api/auth/pair` · `device-token` | Pairing & token perangkat |
| `POST /api/t/staff-login` | PIN staff |
| `GET /api/t/bootstrap?outlet=` | Semua data master untuk perangkat (cache offline) |
| `POST /api/t/ops` | Batch operasi order/shift (online & sinkron offline), idempotent |
| `GET /api/t/orders?status=open` · `GET /api/t/orders/:id` | Order |
| `GET/PATCH /api/t/tickets` | KDS |
| `/api/t/outlets` · `staff` · `categories` · `menus` · `modifier-groups` · `outlet-menus` · `channel-prices` · `areas` · `tables` · `promos` · `customers` · `ingredients` · `stock` · `devices` · `pair-codes` | CRUD back office |
| `GET /api/t/reports/{summary,items,hourly,payments,staff,transactions,shifts,audit,stock,hpp}` | Laporan & export CSV |
| `GET /api/t/export` | Backup data tenant (JSON) |
| `GET /api/ws?token=&outlet=` | Realtime |
| `/api/admin/*` | Superadmin: tenant, paket, status, statistik |

### 1.7 Realtime
WebSocket ke TenantDO dengan tag `outlet:<id>` dan `owner`. Event: `order.updated`, `ticket.new`, `ticket.updated`, `menu.availability`, `sale.new`, `device.presence`. Klien reconnect otomatis dan memuat ulang data setelah tersambung.

### 1.8 Offline
- `bootstrap` dicache di IndexedDB; perangkat bisa dibuka & login PIN tanpa internet.
- Semua mutasi kasir adalah **operasi** `{op_id, type, order_id, payload, at, offline}` yang diterapkan lokal dengan `order-ops.js` lalu dikirim ke `/api/t/ops`. Jika gagal jaringan → masuk outbox, dikirim ulang berurutan.
- Nomor order dibuat perangkat: `<kodePerangkat><YYMMDD>-<urut>` (unik per outlet), jadi offline pun tidak bentrok.
- Saat offline **dinonaktifkan**: pindah/gabung/split meja, refund. Item yang dikirim ke dapur saat offline dicetak lokal (jika ada printer); tiket KDS dibuat saat sinkron.
- Harga transaksi offline mengikuti snapshot perangkat; selisih dengan harga server dicatat di audit (`price_mismatch`).
- `navigator.storage.persist()`, indikator jumlah pending, logout perangkat diblokir saat outbox belum kosong, Web Locks agar satu tab yang mengirim.

### 1.9 Perhitungan Uang (`money.js`)
Subtotal (item non-void) → diskon item → diskon order (manual/promo) → service charge (dine-in, jika diaktifkan outlet) → pajak (PBJT, basis termasuk service jika `tax_on_service`; item `taxable=0` dikecualikan) → pembulatan **hanya untuk pembayaran tunai** (ke 100). Mode harga termasuk pajak didukung (pajak diekstrak per order). Semua nilai Rupiah integer.

---

## 2. Fitur v1 (yang dikerjakan sampai selesai)

**Fase 1 — Fondasi**: proyek Worker + D1 + DO, migrasi, auth owner (register/login/refresh/reset), trial & paket, outlet, staff + PIN, pairing perangkat, kategori, menu, grup modifier (varian = grup wajib 1 pilihan), override per outlet, area & meja, upload foto, build CSS & vendor, PWA, panel superadmin.

**Fase 2 — POS Kasir**: login PIN, buka/tutup shift, kas masuk/keluar/no-sale, tipe order & channel, grid menu + modifier + catatan, keranjang, open bill & meja, kirim dapur, void (PIN manager), diskon, service & pajak, pembayaran multi-metode & split payment, struk (ESC/POS & print browser), cetak ulang, tutup hari, pindah/gabung/split bill.

**Fase 3 — Dashboard Pusat & Laporan**: pemilih outlet, KPI, grafik per jam & per outlet, channel, status outlet live, feed transaksi realtime, laporan (ringkasan, menu, jam, pembayaran, kasir, shift, void/audit, pajak), export CSV, detail transaksi, refund.

**Fase 4 — Dapur**: tiket per stasiun, KDS realtime dengan timer & status, recall, cetak tiket dapur otomatis.

**Fase 5 — Offline**: cache bootstrap, outbox, sinkron idempotent, indikator, pengaman data lokal.

**Fase 6 — Inventori**: bahan baku, resep per menu & per opsi modifier, stok per outlet, potong stok otomatis saat lunas, pembelian (stok masuk), opname, waste, transfer antar outlet, laporan stok & HPP/margin.

**Fase 7 — Lanjutan**: harga per channel & komisi (penjualan neto), promo otomatis (jadwal/hari/minimal belanja), pelanggan & poin, backup/export, statistik superadmin.

**Backlog v2 (di luar v1, butuh pihak ketiga/keputusan bisnis)**: QR self-order, QRIS dinamis (Midtrans/Xendit), integrasi API GoFood/GrabFood, APK (TWA/Capacitor), reservasi, akuntansi.

---

## 3. Kuota & Monitoring
- Free: 100 rb baris tulis/hari, 100 rb request Worker/hari, 100 rb request DO/hari, 5 GB storage, CPU 10 ms/request.
- Target ±25 baris tulis per transaksi → kapasitas Free ±24 outlet (estimasi, ukur saat pilot via metrik Cloudflare).
- Panel superadmin menampilkan statistik harian per tenant. Peringatan kuota memakai notifikasi Cloudflare (dashboard).

## 4. Kebutuhan dari Pemilik Proyek
1. Akun Cloudflare + `npx wrangler login` (untuk membuat D1 & deploy).
2. Email superadmin (diisi ke `SUPERADMIN_EMAILS`).
3. (Opsional) API key Resend + domain pengirim untuk email reset password. Tanpa ini, reset password dilakukan superadmin.
4. (Opsional) Domain sendiri.
5. Tablet Android + printer Bluetooth untuk uji nyata (tidak bisa diuji dari environment developer).
6. Harga paket 5 outlet (untuk teks di halaman langganan).
