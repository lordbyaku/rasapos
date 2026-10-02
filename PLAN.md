# PLAN: RasaPOS Cloud — POS Food & Beverage Multi-Outlet

> ⚠️ **ARSIP** — plan ini (versi Supabase) sudah digantikan oleh [PLAN-CLOUDFLARE.md](PLAN-CLOUDFLARE.md).

**Status:** Draft v0.2 (sudah direview: keputusan, risiko, printer, limit infrastruktur)
**Tanggal:** 2026-10-02
**Referensi:** `D:\0ANTIGRAVITY\opencode\TOKO-CLOUD` (TokoPOS Cloud)
**Mockup UI:** folder [`mockup/`](./mockup/index.html), jalankan `python -m http.server 5510 --directory mockup` lalu buka `http://localhost:5510`
**Simulasi limit:** [`mockup/simulasi-limit.html`](./mockup/simulasi-limit.html)

> Nama "RasaPOS" dan warna oranye hanya placeholder (sesuai mockup).

---

## 0. Keputusan yang Sudah Diambil

| # | Topik | Keputusan |
|---|---|---|
| 1 | Supabase | **Project baru**, terpisah dari TOKO-CLOUD. Prefix tabel `fnb_` tetap dipakai agar mudah dibaca. |
| 2 | Mode offline | Dikerjakan **sesuai urutan fase** (Fase 5), tetapi arsitektur **offline-ready sejak Fase 1**: UUID dari klien, item order append-only, transaksi idempotent. |
| 3 | Perangkat | **Tablet Android + printer thermal Bluetooth wajib didukung.** Utama: **PWA di Chrome ≥ 138** (lihat §7). APK hanya opsional. |
| 4 | Branding | Sementara mengikuti mockup (RasaPOS, oranye). |
| 5 | Lisensi | **1 tenant berlangganan per paket 5 outlet** (5, 10, 15, … outlet). |
| 6 | Hosting frontend | **Cloudflare** (Pages / Workers Static Assets): gratis, boleh komersial, request aset statis tanpa batas. Vercel & DomaiNesia tidak dipakai. |
| 7 | Backend/database | **Supabase akan diganti.** Usulan: stack Cloudflare (Workers + Durable Objects SQLite + D1 + R2), lihat §12. **Menunggu konfirmasi** sebelum §4 ditulis ulang. |

---

## 1. Ringkasan

POS khusus F&B (resto, kafe, kedai kopi, warung makan, food court) setara Moka / Pawoon / ESB, dengan:

- **Multi-tenant**: satu pemilik usaha (tenant/brand) = satu akun, data terisolasi via RLS.
- **Multi-outlet**: satu tenant bisa punya banyak outlet (cabang). Menu dikelola terpusat, sedangkan harga dan ketersediaan bisa diatur per outlet.
- **Master/HQ view**: owner dan manajer area melihat dashboard & transaksi **semua outlet** (gabungan maupun per outlet) secara real-time.
- **Fitur khas F&B**: meja & open bill, take away, delivery/online (GoFood, GrabFood, ShopeeFood), modifier & varian, Kitchen Display (KDS), printer dapur per stasiun, split bill, service charge & PBJT (eks-PB1), resep/bahan baku.

### Apa yang dipakai ulang dari TOKO-CLOUD

| Komponen TOKO-CLOUD | Dipakai di POS F&B |
|---|---|
| Stack Vanilla JS + Tailwind + SweetAlert2 + Chart.js | Sama (lihat §4.1: CSS Tailwind di-*build* sekali, library di-*vendor* lokal) |
| Pola `window.state`, fungsi global, urutan load script | Sama |
| Supabase Auth + tabel `tenants`, `super_admins`, `subscriptions` | Sama, ditambah `outlets`, `devices` & `staff` |
| RLS `my_tenant_id()` / `tenant_has_access()` | Diperluas menjadi `my_outlet_ids()` / `has_outlet_access()` |
| RPC atomic (`pos_checkout`, `close_shift`, `stock_opname`) | Diadaptasi: `fnb_checkout`, `fnb_open_order`, dst. |
| Shift kasir, pengeluaran, laporan CSV, PWA, keepalive | Dipakai, ditambah dimensi `outlet_id` |
| Integrasi WEB APP MANAGEMENT (superadmin) | Sama, ditambah jumlah paket/outlet per tenant |

> ⚠️ **Dua pola TOKO-CLOUD yang TIDAK boleh disalin apa adanya** (lihat §8):
> 1. `pwa.js` mengecek `version.json` **tiap 5 menit** dan `sw.js` memakai **network-first** untuk file aplikasi. Di POS F&B, tablet menyala ±14 jam/hari, sehingga pola ini menghabiskan kuota request hosting dan tidak tahan offline.
> 2. Tailwind **Play CDN** (kompilasi CSS di browser) lambat di tablet murah, dan memang tidak ditujukan untuk produksi.

### Perbedaan utama dari POS toko (retail)

| Aspek | TOKO-CLOUD (retail) | POS F&B |
|---|---|---|
| Unit jual | Produk + stok | Menu + varian + modifier, stok via **resep → bahan baku** |
| Alur transaksi | Scan → bayar (sekali jalan) | **Order dibuka** → tambah item berkali-kali → kirim dapur → bayar di akhir |
| Lokasi | 1 toko | **Banyak outlet** per tenant |
| Konteks pesanan | — | Tipe order (dine-in/take away/delivery), meja, jumlah tamu |
| Produksi | — | Kitchen ticket / KDS per stasiun (dapur, bar, pastry) |
| Pajak | PPN opsional | **Service charge + PBJT makan-minum (eks-PB1), maks. 10%, tarif per daerah** |
| Harga | 1 harga | Harga per outlet & **per channel** (online biasanya markup 20–30%) |
| Koneksi | Online-only | **Wajib tahan offline** (resto tidak boleh berhenti jualan saat internet putus) |

---

## 2. Peran Pengguna (Roles)

| Role | Cakupan | Kemampuan utama |
|---|---|---|
| **Superadmin** (developer) | Semua tenant | Kelola subscription/paket, suspend, extend trial (via WEB APP MANAGEMENT) |
| **Owner** | Semua outlet di tenant-nya | Semua fitur, dashboard gabungan, kelola outlet & staff, master menu |
| **Manajer Area** | Outlet yang ditugaskan (>1) | Dashboard & laporan outlet-outlet tersebut, approval void/diskon |
| **Manajer Outlet / Supervisor** | 1 outlet | Laporan outlet, stok, approval void/refund, tutup shift & tutup hari |
| **Kasir** | 1 outlet | POS, pembayaran, buka/tutup shift |
| **Waiter** | 1 outlet | Buka meja, input pesanan (tablet/HP), kirim ke dapur; tidak bisa menerima pembayaran |
| **Dapur / Bar** | 1 outlet, 1+ stasiun | Hanya layar KDS |

- Login owner/manajer: **email + password** (Supabase Auth).
- Login staff di perangkat outlet: **PIN** per staff (perangkat sudah di-*pair* ke outlet, seperti Moka). Kasir tidak perlu akun email.
- PIN kasir/waiter 4–6 digit; **PIN supervisor wajib 6 digit**. Ada rate limit & lockout (lihat §8).
- Hak akses granular per role (permission matrix), misalnya `void_item`, `give_discount`, `open_cash_drawer`, `view_reports`, `edit_menu`, `reprint_receipt`.

---

## 3. Fitur Lengkap

### 3.1 Manajemen Tenant, Outlet & Perangkat
- CRUD outlet: nama, alamat, telepon, jam operasional, **zona waktu (WIB/WITA/WIT)**, **jam tutup hari bisnis** (mis. 04:00), NPWP, pengaturan pajak & service charge sendiri.
- **Pairing perangkat**: owner membuat kode 6 digit (berlaku 10 menit), lalu kode dimasukkan di tablet sehingga perangkat terikat ke outlet tertentu (tabel `fnb_devices`).
- **Cabut perangkat** (jika tablet hilang/rusak): sesi perangkat dimatikan dari back office.
- Pengaturan struk per outlet (logo, header, footer, Wi-Fi password, sosial media, lebar 58/80 mm).
- Jumlah outlet aktif dibatasi oleh **jumlah paket** (§5).

### 3.2 Master Menu (terpusat, berlaku lintas outlet)
- Kategori menu (urutan, warna, ikon) + **stasiun produksi** default (Dapur / Bar / Pastry).
- Menu: nama, foto, SKU, harga dasar, deskripsi, kategori, stasiun, **kena pajak/tidak** (mis. barang retail titipan).
- **Varian** (Ukuran: Regular/Large; Suhu: Hot/Ice) dengan selisih harga.
- **Grup modifier** (Level Pedas, Topping, Gula): min/maks pilihan, wajib/opsional, harga tambahan.
- **Paket / combo** dengan pilihan isi.
- **Override per outlet**: harga beda, aktif/nonaktif, **habis hari ini** 1 klik dari kasir (sinkron realtime ke semua perangkat outlet).
- **Harga per channel**: Dine-in, Take Away, GoFood, GrabFood, ShopeeFood (markup % atau manual).
- **Item harga terbuka** (open price, mis. "Lain-lain") dengan izin khusus.
- Jadwal menu (sarapan 06–10, happy hour).
- Foto menu dikompres di browser ke WebP ±60 KB sebelum upload.

### 3.3 Inventori & Resep (Fase 6)
- Bahan baku dengan satuan (gram, ml, pcs) dan konversi satuan beli → satuan pakai.
- **Resep / BOM** per menu, varian, dan modifier (topping keju = 20 g keju).
- Stok bahan **per outlet**; penjualan otomatis memotong bahan di dalam RPC checkout. **Mutasi disimpan teragregasi per order** (1 baris per bahan per order), bukan per item, agar DB tidak cepat penuh (§9).
- Stok boleh minus (resto tidak boleh menolak order karena data stok), disertai laporan selisih.
- Pembelian dari supplier, stok opname, **transfer stok antar outlet / dari gudang pusat**, waste log.
- HPP (COGS) per menu → laporan margin. Peringatan stok minimum.

### 3.4 Kasir / Order (inti)
- Tipe order: **Dine-in, Take Away, Delivery sendiri, Online (GoFood/GrabFood/ShopeeFood)**. Channel menentukan harga & laporan.
- Grid menu dengan kategori, pencarian, favorit, badge "Habis".
- Modal varian/modifier + catatan item ("tanpa bawang").
- Keranjang: qty, catatan, diskon item. Item yang sudah dikirim ke dapur tidak bisa dihapus, harus **void** (PIN supervisor + alasan).
- **Open bill**: pesanan susulan berkali-kali; setiap "Kirim Dapur" = tiket baru.
- **Tahan / fire item** (*hold & fire*): mis. main course ditahan sampai appetizer selesai.
- Nomor antrean / nama pemesan untuk take away.
- Diskon order (%, nominal), promo otomatis (happy hour, B1G1, minimal belanja), voucher.
- Pelanggan & member (poin loyalitas, Fase 7).
- Perhitungan: Subtotal → Diskon → **Service charge** (dine-in) → **PBJT** (basis termasuk service charge, dapat diatur per outlet) → Total. Mode "harga sudah termasuk pajak" dihitung **per order**, bukan per item, agar tidak ada selisih pembulatan.
- **Pembulatan hanya untuk pembayaran tunai** (QRIS/kartu harus nominal persis).
- **Tip** (opsional) dicatat terpisah dari penjualan.

### 3.5 Manajemen Meja
- Denah per **area** (Indoor, Outdoor, Lantai 2, VIP) dengan bentuk & kapasitas.
- Status: Kosong, Terisi, Sudah Pesan, Minta Bill, Perlu Dibersihkan; status disinkronkan realtime antar tablet.
- Timer lama duduk, jumlah tamu, total sementara, waiter.
- **Pindah meja, gabung meja, split bill** (per item / rata / nominal), cetak pre-bill.
- Reservasi sederhana & deposit/DP (Fase 7).

### 3.6 Dapur: KDS & Printer Dapur
- Setiap "Kirim ke Dapur" membuat **kitchen ticket** yang dipecah per stasiun.
- KDS (tablet/TV dapur): timer, warna (hijau < 10 mnt, kuning < 20, merah > 20), status **Baru → Diproses → Siap → Diantar**; bump & recall tiket.
- Notifikasi suara saat tiket baru (perlu 1 ketukan setelah app dibuka karena kebijakan autoplay browser); notifikasi "siap diantar" ke kasir/waiter.
- Alternatif tanpa KDS: **printer dapur per stasiun** (lihat §7 untuk batasannya).
- **Antrean cetak dengan retry**: jika printer mati/kertas habis, tiket tidak hilang; ada indikator "tiket belum tercetak".
- **Layar pickup** (opsional): nomor antrean "pesanan siap" untuk take away.

### 3.7 Pembayaran
- Metode: Tunai (uang pas & pecahan cepat), **QRIS**, Debit/Kredit (EDC), e-wallet, transfer, **piutang/City Ledger**, kompliment/entertain/staff meal (dengan alasan).
- Metode pembayaran dapat diatur per outlet.
- **Split payment** dan **split bill**.
- Struk: cetak thermal 58/80 mm (ESC/POS), kirim via WhatsApp (link e-receipt), download PNG.
- Refund / void transaksi (PIN supervisor, audit log). **Cetak ulang struk** dicatat dan dihitung.
- **Komisi channel online** (mis. GoFood 20%) dicatat agar laporan menampilkan penjualan bersih.
- QRIS dinamis via payment gateway (Midtrans/Xendit): Fase 7. Awalnya QRIS statis + konfirmasi manual.
- **Idempotent**: tombol Bayar yang ditekan dua kali atau retry saat jaringan lambat tidak menghasilkan transaksi ganda (UUID + unique constraint).

### 3.8 Shift, Kas & Tutup Hari
- Buka shift dengan modal awal; kas masuk/keluar (petty cash); **buka laci tanpa transaksi (no-sale) dicatat**.
- Tutup shift: setoran aktual vs sistem, selisih, rekap per metode bayar.
- **Tutup hari (End of Day / Z-report)** per outlet: menutup `business_date`, memastikan tidak ada open bill yang tertinggal, lalu mengirim ringkasan ke owner.
- Shift dan laporan dikelompokkan berdasarkan **`business_date`** (bukan tanggal kalender), sehingga resto yang buka sampai jam 02:00 tetap tercatat di hari yang benar.

### 3.9 Dashboard Pusat (Master Outlet) & Laporan
- **Pemilih outlet** di header: "Semua Outlet", outlet tertentu, atau grup/area.
- KPI real-time: penjualan kotor/bersih, transaksi, AOV, tamu, order terbuka.
- **Perbandingan outlet** + status live (shift buka/tutup, perangkat online, transaksi terakhir, **jumlah transaksi offline yang belum tersinkron**).
- **Feed transaksi live** semua outlet → detail & struk.
- Laporan (filter tanggal bisnis + outlet + channel): ringkasan, per jam, per menu/kategori/varian/modifier, per tipe order & channel (bruto/komisi/neto), per metode bayar, per kasir/waiter, diskon & promo, **void/refund/reprint/no-sale (anti-fraud)**, PBJT & service charge, shift & selisih kas, HPP & laba kotor (Fase 6).
- Data dashboard berasal dari **tabel ringkasan** (`fnb_daily_sales`, `fnb_hourly_sales`) yang diisi saat order lunas, bukan dari query mentah semua transaksi.
- Export CSV/Excel; ringkasan harian ke WhatsApp/email owner (Fase 7).

### 3.10 Mode Offline (Fase 5, fondasi sejak Fase 1)
- Master data (menu, harga outlet, meja, staff, pengaturan) di-cache di **IndexedDB**; sinkron **delta** berdasarkan `updated_at`.
- Saat offline, transaksi tetap jalan dan disimpan di **outbox** IndexedDB dengan **UUID dari klien** + nomor struk lokal `KODEOUTLET-KODEDEVICE-YYMMDD-0001`.
- Saat online, outbox dikirim berurutan ke `fnb_sync_events` (idempotent).
- **Desain anti-konflik**: order disimpan sebagai **event append-only** (`item_added`, `item_voided`, `sent_to_kitchen`, `paid`). Dua tablet yang sama-sama offline lalu menambah item ke meja yang sama tetap bisa digabung tanpa saling menimpa.
  - Operasi yang tidak aman dilakukan offline (pindah/gabung meja, split bill, void setelah bayar) **dinonaktifkan** saat offline.
  - Meja yang dibuka di tablet lain saat offline ditandai "mungkin tidak terbaru".
- **Harga saat offline**: server menerima snapshot harga dari klien untuk transaksi offline (agar struk = data), tetapi memvalidasi terhadap versi menu dan menandai anomali di audit log.
- Perlindungan data lokal: `navigator.storage.persist()`, indikator jumlah transaksi pending, **logout/ganti perangkat diblokir selama outbox belum kosong**, dan **Web Locks** agar hanya satu tab yang mengirim outbox.
- Token Supabase kedaluwarsa saat offline tidak menghentikan kasir; token di-refresh saat online kembali.
- Keterbatasan: KDS antar perangkat dan dashboard pusat tidak real-time selama offline (tertunda sampai sinkron); pairing & edit menu butuh online.

### 3.11 Fitur Lanjutan (Fase 7+)
- **QR Self-Order** di meja.
- Integrasi API GoFood/GrabFood (butuh kemitraan; awalnya input manual per channel).
- Loyalty & membership, voucher, deposit.
- Reservasi & waiting list.
- Gudang pusat / central kitchen & purchase order antar outlet.
- Absensi staff via PIN (clock-in/out).
- Akuntansi sederhana (laba rugi), ekspor ke Jurnal/Accurate.
- APK Android (opsional, §7.4).

---

## 4. Arsitektur Teknis

### 4.1 Tech Stack
| Komponen | Teknologi |
|---|---|
| Frontend | Vanilla JS (ES6+), tanpa framework |
| CSS | Tailwind v3 di-*compile* sekali dengan **Tailwind Standalone CLI** (1 file exe, tanpa npm) menjadi `css/app.css` |
| Library | SweetAlert2, Chart.js, FontAwesome, supabase-js **disimpan lokal di `/vendor`** (tidak bergantung CDN saat offline) |
| Database | Supabase PostgreSQL + RLS (project baru) |
| Realtime | Supabase Realtime **Broadcast (private channel)** dipicu trigger DB; bukan `postgres_changes` (lebih hemat & skalabel) |
| Auth | Supabase Auth (owner/manajer + akun perangkat) + PIN staff (hash, diverifikasi via RPC) |
| Offline | IndexedDB (cache + outbox) + Service Worker **cache-first** dengan cache bernomor versi |
| Printer | ESC/POS via **Web Serial (Bluetooth Classic)** / **Web Bluetooth (BLE)** / RawBT (fallback) |
| Hosting | Static hosting (lihat §9: **Vercel Hobby tidak boleh komersial**) |

> Satu-satunya "build step" adalah menjalankan `tailwindcss -i src.css -o css/app.css --minify` sebelum deploy. Kode JS tetap tanpa bundler.

### 4.2 Struktur Aplikasi

```
POS-FNB/
├── index.html              # Landing / login owner → redirect sesuai role
├── pos.html                # App Kasir & Waiter (tablet outlet)
├── kds.html                # Kitchen Display
├── backoffice.html         # Dashboard pusat & manajemen
├── css/app.css             # hasil build Tailwind
├── vendor/                 # supabase-js, sweetalert2, chart.js, fontawesome
├── js/
│   ├── core/
│   │   ├── supabase.js     # client + auth
│   │   ├── state.js        # window.state (+ activeOutletId, device)
│   │   ├── utils.js        # formatRupiah, tanggal bisnis, pagination, modal
│   │   ├── money.js        # hitung subtotal/diskon/service/pajak/pembulatan (dipakai klien & dicocokkan dengan RPC)
│   │   ├── idb.js          # wrapper IndexedDB
│   │   ├── sync.js         # delta sync master data + kirim outbox
│   │   ├── realtime.js     # subscribe channel per outlet
│   │   ├── license.js      # trial / paket
│   │   ├── printer.js      # antrean cetak + driver (webserial/webbluetooth/rawbt/browser)
│   │   ├── escpos.js       # builder perintah ESC/POS (teks, logo raster, cut, buka laci)
│   │   └── pwa.js          # update SW (cek versi 30 mnt + saat app aktif)
│   ├── pos/                # order.js, tables.js, payment.js, shift.js, app.js
│   ├── kds/app.js
│   └── backoffice/         # dashboard, transactions, reports, menu, outlets, staff, inventory, settings, app
├── database/
│   ├── schema.sql          # DDL idempotent
│   └── migrations/
├── mockup/
├── manifest.json, sw.js, version.json
```

### 4.3 Model Multi-Tenant & Multi-Outlet

```
tenants (brand/usaha) ── outlet_packs (jumlah paket 5 outlet)
  ├── outlets (cabang)            ← data operasional selalu punya tenant_id + outlet_id
  │     ├── devices (tablet kasir/KDS yang di-pair)
  │     ├── areas → tables (meja)
  │     ├── shifts, orders, order_events, payments, kitchen_tickets, stock
  │     └── outlet_menus (harga/aktif/habis)
  ├── staff (+ staff_outlets: role per outlet)
  └── master data: categories, menus, variants, modifier_groups, modifiers, ingredients, recipes
```

**RLS:**
- `my_tenant_id()`: sama dengan TOKO-CLOUD.
- `my_outlet_ids()`: owner → semua outlet tenant; manajer → `staff_outlets`; perangkat → outlet perangkat.
- Tabel operasional: `tenant_id = my_tenant_id() AND outlet_id = ANY(my_outlet_ids())`.
- Master data: baca untuk semua anggota tenant; tulis hanya untuk role `edit_menu`.
- Policy superadmin tetap.
- **Fungsi RLS dipanggil dengan pola `(SELECT my_outlet_ids())`** agar Postgres mengevaluasinya sekali per query, bukan per baris (penting untuk performa dashboard).
- Semua operasi uang/stok **hanya lewat RPC `SECURITY DEFINER`** dengan `SET search_path = public`. Insert/update langsung ke tabel transaksi diblokir oleh RLS.
- Kanal Realtime privat: RLS pada `realtime.messages` memastikan perangkat hanya bisa subscribe ke `outlet:{id}` miliknya.

**Autentikasi perangkat:** saat pairing, Edge Function membuat akun Supabase khusus perangkat (terikat `outlet_id`). Staff lalu memilih nama + PIN. Setiap transaksi mencatat `staff_id` dan `device_id`.

### 4.4 Skema Database (ringkas)

| Tabel | Kolom penting |
|---|---|
| `tenants` | id, name, slug, owner_uid, trial_ends_at, **outlet_packs**, status |
| `subscriptions`, `subscription_logs`, `super_admins` | dari TOKO-CLOUD; `subscriptions` + kolom **`packs`** |
| `fnb_outlets` | id, tenant_id, name, code, address, timezone, **day_cutoff**, tax_rate, service_rate, tax_on_service, tax_inclusive, cash_rounding, receipt_*, is_active |
| `fnb_devices` | id, tenant_id, outlet_id, code, name, type (`pos`/`kds`/`waiter`), auth_uid, pair_code, pair_expires_at, revoked_at, last_seen_at, app_version |
| `fnb_staff` | id, tenant_id, name, pin_hash, failed_attempts, locked_until, auth_uid (manajer), is_active |
| `fnb_staff_outlets` | staff_id, outlet_id, role, permissions JSONB |
| `fnb_categories` | id, tenant_id, name, color, sort, station, updated_at |
| `fnb_menus` | id, tenant_id, category_id, name, sku, price, taxable, image_url, station, is_active, updated_at |
| `fnb_variants` / `fnb_modifier_groups` / `fnb_modifiers` / `fnb_menu_modifier_groups` | struktur varian & modifier |
| `fnb_outlet_menus` | outlet_id, menu_id, price_override, is_available, sold_out_date |
| `fnb_channel_prices` | tenant_id, channel, menu_id, price / markup_pct, commission_pct |
| `fnb_areas` / `fnb_tables` | outlet_id, area_id, name, capacity, pos_x, pos_y, shape |
| `fnb_shifts` | outlet_id, device_id, staff_id, business_date, opening_cash, closing_cash, expected_cash, status |
| `fnb_cash_movements` | shift_id, type (in/out/no_sale), amount, note |
| `fnb_orders` | **id UUID (dari klien)**, tenant_id, outlet_id, order_no, business_date, type, channel, table_id, guest_count, customer_name, status, subtotal, discount, service, tax, rounding, tip, total, commission, is_offline, waiter_id, cashier_id, shift_id, device_id, opened_at, closed_at |
| `fnb_order_items` | id UUID, order_id, menu_id, variant_id, name_snapshot, qty, price, modifiers JSONB, note, discount, status (`new`/`held`/`sent`/`void`), void_reason, void_by |
| `fnb_order_events` | id UUID, order_id, type, payload JSONB, device_id, staff_id, created_at (log append-only, dasar sinkron offline) |
| `fnb_payments` | id UUID, order_id, outlet_id, method, amount, reference, paid_at |
| `fnb_kitchen_tickets` / `fnb_kitchen_ticket_items` | outlet_id, order_id, station, ticket_no, status, printed_at |
| `fnb_daily_sales` / `fnb_hourly_sales` | tenant_id, outlet_id, business_date, (hour), channel, gross, discount, service, tax, net, trx_count, guests (**sumber dashboard**) |
| `fnb_customers`, `fnb_promos` | — |
| `fnb_ingredients`, `fnb_recipes`, `fnb_stock`, `fnb_stock_mutations` (agregat per order), `fnb_stock_transfers` | Fase 6 |
| `fnb_audit_logs` | void, refund, diskon manual, reprint, no-sale, anomali sinkron |

Index wajib: `(tenant_id, outlet_id, business_date)` pada orders/payments/daily_sales; unique `(outlet_id, order_no)`.

### 4.5 RPC Utama
| RPC | Fungsi |
|---|---|
| `fnb_pair_device(code)` | Pairing (via Edge Function, membuat akun perangkat) |
| `fnb_verify_pin(staff_id, pin)` | Login staff, rate limit + lockout 5x salah = kunci 5 menit |
| `fnb_open_order(p)` / `fnb_add_items(order_id, items)` | Idempotent by UUID |
| `fnb_send_to_kitchen(order_id)` | Item `new` → `sent`, buat tiket per stasiun, broadcast |
| `fnb_void_item(item_id, reason, approver_staff_id, approver_pin)` | Void + audit |
| `fnb_move_table` / `fnb_merge_tables` / `fnb_split_bill` | `SELECT … FOR UPDATE` pada order terkait |
| `fnb_checkout(order_id, payments)` | Hitung ulang total di server, simpan pembayaran, potong stok, update tabel ringkasan, tutup order |
| `fnb_sync_events(events)` | Terima outbox offline (idempotent, berurutan per order) |
| `fnb_close_shift`, `fnb_close_day` | Shift & EOD |
| `fnb_sales_summary(from, to, outlet_ids[])`, `fnb_outlet_live_status()` | Data dashboard |

> Prinsip: saat **online**, total dihitung ulang di server dan server yang menjadi acuan. Untuk transaksi **offline**, snapshot klien diterima, divalidasi, dan anomali ditandai (§3.10).

### 4.6 Realtime Channels (Broadcast, private)
- `outlet:{id}`: tiket dapur, status meja, menu habis. Event dikirim oleh trigger DB (`realtime.broadcast_changes`/`realtime.send`).
- `tenant:{id}:sales`: dashboard owner menerima ringkasan transaksi baru (hanya saat dashboard terbuka).
- Satu koneksi WebSocket per tab; semua channel di-*multiplex*.

---

## 5. Model Bisnis / Lisensi
- Trial 14 hari (maks. 1 outlet), lalu langganan **per paket 5 outlet**: `max_outlets = outlet_packs × 5`.
- Tenant dengan 6 outlet membutuhkan 2 paket. Outlet di luar kuota tidak bisa diaktifkan (data lama tetap terbaca).
- Add-on (opsional, nanti): KDS, inventori, QR self-order.
- Saat langganan habis: back office tetap bisa dibuka (lihat laporan), POS terkunci **setelah masa tenggang 3 hari** (agar outlet tidak mendadak berhenti jualan), dan outbox offline tetap boleh disinkronkan.
- Superadmin mengatur jumlah paket & masa aktif lewat WEB APP MANAGEMENT.

---

## 6. Tahapan Pengerjaan (Milestone)

| Fase | Isi | Estimasi |
|---|---|---|
| **0. Desain** | Plan + mockup UI + simulasi limit | ✅ selesai |
| **1. Fondasi** | Supabase project baru, schema + RLS + RPC dasar, auth owner, outlet, staff + PIN, pairing perangkat, master menu (kategori, menu, varian, modifier, override outlet), build Tailwind + vendor lokal, SW cache-first, **backup harian otomatis**, **monitor ukuran DB** (peringatan ke superadmin di 70% dari 500 MB, karena Free tier read-only saat penuh) | 1–2 minggu |
| **2. POS Kasir MVP** | Order take away & dine-in, meja & open bill (event append-only), modifier, diskon, service + PBJT, pembayaran (tunai/QRIS/debit/split), **cetak struk ESC/POS via Bluetooth**, shift & tutup hari | 2–3 minggu |
| **3. Dashboard Pusat** | Tabel ringkasan, pemilih outlet, KPI, perbandingan outlet, feed transaksi live, laporan utama + export CSV | 1–2 minggu |
| **4. Dapur** | Kitchen ticket per stasiun, KDS realtime, printer dapur + antrean retry | 1 minggu |
| **5. Offline Mode** | IndexedDB cache + outbox + `fnb_sync_events`, penanganan konflik, indikator pending | 1–2 minggu |
| **6. Inventori** | Bahan, resep, potong stok teragregasi, opname, transfer, HPP | 2 minggu |
| **7. Lanjutan** | Harga & komisi channel, promo, QR self-order, loyalty, QRIS dinamis, APK (opsional) | bertahap |

**Uji perangkat nyata wajib sejak Fase 2**: minimal 1 tablet Android kelas bawah (RAM 3 GB) + 2 model printer Bluetooth (58 & 80 mm).

---

## 7. Tablet Android & Printer Bluetooth: PWA atau APK?

### 7.1 Kabar baik: PWA sekarang bisa cetak langsung ke printer Bluetooth biasa
Mayoritas printer thermal murah (58/80 mm) memakai **Bluetooth Classic (SPP)**. Dulu browser hanya mendukung BLE (Web Bluetooth), sehingga printer ini tidak bisa dipakai. **Sejak Chrome 138, Chrome Android mendukung Web Serial lewat Bluetooth RFCOMM/SPP** (chromestatus feature 5139978918821888). Artinya PWA bisa mengirim perintah ESC/POS langsung ke printer, tanpa dialog print dan tanpa aplikasi tambahan.

`printer.js` menyediakan beberapa driver, dipilih otomatis:
1. **Web Serial** (Bluetooth Classic/SPP): utama untuk printer thermal umum.
2. **Web Bluetooth** (BLE): untuk printer yang hanya BLE.
3. **RawBT** (aplikasi Android pihak ketiga, dipanggil via intent): cadangan jika Chrome versi lama atau printer bermasalah.
4. **`window.print()`**: untuk PC/laptop & printer USB/Windows.

### 7.2 Kendala jika berbasis web (dan solusinya)

| Kendala | Dampak | Solusi |
|---|---|---|
| Hanya **Chrome ≥ 138**. Tidak berlaku di Samsung Internet, Mi Browser, atau WebView | Tablet lama/Chrome tidak bisa di-update → tidak bisa cetak langsung | Cek versi saat pairing perangkat; fallback RawBT; daftar tablet yang direkomendasikan |
| Pilih printer pertama kali harus lewat **ketukan pengguna** (dialog izin) | Setup awal manual | Hanya sekali; selanjutnya `navigator.serial.getPorts()` menyambung ulang otomatis (perlu diuji per model printer) |
| Event `connect/disconnect` belum didukung di Android | Printer mati tidak langsung terdeteksi | Deteksi dari error saat menulis → antrean cetak + tombol "sambung ulang" + indikator status |
| Satu printer SPP hanya bisa dipegang **satu koneksi** | Dua tablet tidak bisa berbagi satu printer Bluetooth | Tiap printer dipasangkan ke satu tablet; tablet kasir meneruskan tiket ke tablet dapur via realtime/KDS |
| **Printer LAN/Wi-Fi (port 9100) tidak bisa diakses browser** | Dapur yang memakai printer jaringan tidak didukung PWA | Pakai printer Bluetooth di dekat tablet dapur, KDS, atau APK (§7.4) |
| Cetak hanya saat app **terbuka di layar** (tidak ada background printing) | Tablet tidur → tiket dapur tertunda | Wake Lock API (layar tetap menyala) + charger + Android "Sematkan layar" |
| Suara notifikasi butuh 1 ketukan setelah app dibuka | KDS diam setelah reload | Layar "Ketuk untuk mulai" saat app dibuka |
| Data offline bisa hilang jika pengguna **menghapus data Chrome** | Outbox belum tersinkron hilang | `storage.persist()`, peringatan pending, blokir logout, sinkron sesering mungkin |
| iPad/Safari tidak mendukung Web Serial/Web Bluetooth | iPad tidak bisa cetak Bluetooth | Fokus Android; iPad hanya untuk waiter/dashboard |
| Font/logo printer berbeda-beda | Struk berantakan di model tertentu | `escpos.js`: lebar 32/48 kolom, codepage, logo raster `GS v 0`, uji per model |

### 7.3 Rekomendasi: **cukup PWA** untuk MVP dan produksi awal
PWA di Chrome Android sudah memenuhi: install ke home screen, fullscreen, offline, cetak Bluetooth langsung, buka laci kas, update otomatis tanpa Play Store. Ini juga lebih murah untuk di-maintain (satu kode, tanpa build Android).

### 7.4 Kapan perlu APK?
Buat APK hanya jika muncul kebutuhan berikut:
- Printer **LAN/Wi-Fi** di dapur.
- Cetak di **background**, app otomatis jalan saat tablet menyala, mode kiosk penuh.
- Tablet yang **tidak bisa memakai Chrome terbaru**.
- Ingin terdaftar di **Play Store**.

Pilihan APK:
- **TWA (Trusted Web Activity, via Bubblewrap)**: APK yang menjalankan PWA di dalam Chrome, sehingga fitur Chrome (termasuk Web Serial) tetap tersedia (perlu diuji). Cocok jika tujuannya hanya Play Store.
- **Capacitor**: kode yang sama dibungkus WebView + plugin native (Bluetooth Classic, TCP/LAN printer, auto-start). **Perhatian: WebView tidak memiliki Web Serial**, jadi printer harus lewat plugin native, sehingga driver `printer.js` perlu ditambah `capacitor`. Karena itu `printer.js` sejak awal dibuat berbasis driver.

---

## 8. Hasil Review: Potensi Error & Perbaikannya

| # | Potensi masalah | Perbaikan (sudah dimasukkan ke plan) |
|---|---|---|
| 1 | Pola TOKO-CLOUD: cek `version.json` tiap 5 menit + SW network-first → ±168 request/tablet/hari, gagal saat offline | SW cache-first dengan cache bernomor versi; cek update tiap 30 mnt & saat app aktif; **update hanya diterapkan saat keranjang kosong / shift tutup** |
| 2 | Tailwind Play CDN & library CDN: lambat di tablet murah, gagal saat offline pertama | Build CSS sekali (Standalone CLI), library di `/vendor`, semuanya di-precache |
| 3 | Open bill diedit 2 tablet saat offline → saling menimpa | Event append-only + operasi berisiko dinonaktifkan saat offline (§3.10) |
| 4 | Tombol Bayar ditekan 2x / retry saat timeout → transaksi ganda | UUID dari klien + unique constraint + RPC idempotent |
| 5 | Harga dihitung ulang server ≠ struk yang sudah dicetak offline | Snapshot harga offline diterima + ditandai anomali |
| 6 | Laporan "per hari" salah untuk resto yang buka lewat tengah malam & outlet beda zona waktu | `business_date` + `day_cutoff` + timezone per outlet |
| 7 | PIN 4 digit bisa ditebak (10.000 kombinasi) | Rate limit + lockout di RPC; PIN supervisor 6 digit; audit login |
| 8 | Tablet hilang → masih bisa akses data | Cabut perangkat (revoke sesi) dari back office |
| 9 | Pajak: PB1 sudah diganti **PBJT** (UU HKPD 1/2022), tarif per daerah, basis bisa termasuk service | Tarif & `tax_on_service` per outlet; perhitungan per order; label pajak dapat diubah |
| 10 | Pembulatan diterapkan ke QRIS/kartu → selisih saat rekonsiliasi | Pembulatan hanya untuk tunai |
| 11 | `postgres_changes` + RLS → beban DB naik dan boros kuota | Broadcast private channel dari trigger |
| 12 | Dashboard multi-outlet menarik semua transaksi mentah → lambat & boros egress | Tabel ringkasan harian/per jam |
| 13 | Mutasi stok per item per bahan → DB cepat penuh | Agregasi per order (§9 menunjukkan selisihnya) |
| 14 | Pemanggilan fungsi RLS per baris | Pola `(SELECT fn())` + index `tenant_id, outlet_id` |
| 15 | Dua tab POS di satu perangkat mengirim outbox bersamaan | Web Locks API (satu pemimpin) |
| 16 | Printer mati / kertas habis → tiket dapur hilang | Antrean cetak + retry + indikator |
| 17 | **Supabase Free tanpa backup otomatis** | Backup harian `pg_dump` via GitHub Actions ke storage terpisah (Fase 1) |
| 18 | **Vercel Hobby melarang penggunaan komersial**, dan jika kuota habis situs berhenti hingga 30 hari | Lihat §9: Cloudflare Pages (gratis, boleh komersial) atau Vercel Pro |
| 19 | POS langsung terkunci saat langganan habis di tengah jam ramai | Masa tenggang 3 hari + sinkron outbox tetap diizinkan |
| 20 | `SECURITY DEFINER` tanpa `search_path` → celah keamanan | Semua RPC `SET search_path = public` + cek tenant/outlet di awal fungsi |

### Fitur yang ditambahkan dari review
Tutup hari / Z-report, hold & fire item, layar pickup take away, tip, komisi channel online (penjualan neto), menu kena/tidak kena pajak, item harga terbuka, log no-sale & reprint (anti-fraud), cabut perangkat, masa tenggang langganan, status "transaksi offline belum tersinkron" di dashboard pusat, absensi staff (lanjutan).

---

## 9. Simulasi Limit: Supabase Free + Vercel Hobby

Kuota per Oktober 2026 (sumber: supabase.com/pricing, docs Supabase "Database size", vercel.com/docs/plans/hobby). Simulator interaktif: [`mockup/simulasi-limit.html`](./mockup/simulasi-limit.html).

### 9.1 Kuota gratis yang relevan
| Layanan | Kuota | Jika terlewati |
|---|---|---|
| Supabase: ukuran database | **500 MB (kumulatif)** | **Read-only**: INSERT gagal, kasir tidak bisa transaksi |
| Supabase: egress | 5 GB / bulan | Pembatasan layanan (fair use) |
| Supabase: pesan realtime | 2 juta / bulan | Realtime dibatasi |
| Supabase: koneksi realtime puncak | 200 | Koneksi baru ditolak |
| Supabase: storage | 1 GB | Upload gagal |
| Supabase: lainnya | Tanpa backup, pause setelah 1 minggu tidak aktif, maks. 2 project | — |
| Vercel Hobby: CDN requests | 1 juta / bulan | Fitur berhenti **hingga 30 hari** |
| Vercel Hobby: Fast Data Transfer | 100 GB / bulan | idem |
| Vercel Hobby: **syarat** | **Hanya non-komersial / pribadi** | Melanggar fair use |

### 9.2 Asumsi
150 transaksi/hari/outlet (100 untuk pilot), 3,5 item/transaksi, 60% dine-in, 3 perangkat/outlet, buka 14 jam. Satu transaksi ≈ **5 KB** di database (order + item + bayar + tiket dapur + index & bloat), atau ≈ **7,8 KB** jika inventori aktif (dengan agregasi).

### 9.3 Hasil (dengan optimasi di plan ini)

| Skenario | DB tumbuh/bulan | **DB 500 MB penuh dalam** | + Inventori | Egress | Pesan realtime | Vercel requests |
|---|---|---|---|---|---|---|
| Pilot 1 outlet × 100 trx | 15 MB | **± 32 bulan** | ± 20 bulan | 1% | 3% | 0,5% |
| **1 paket: 5 outlet** | 111 MB | **± 4,3 bulan** | ± 2,7 bulan | 7% | 23% | 2% |
| 10 outlet | 223 MB | **± 2,1 bulan** | ± 1,4 bulan | 14% | 46% | 4% |
| 20 outlet | 445 MB | **± 1,1 bulan** | ± 0,7 bulan | 28% | **92%** | 8% |
| 40 outlet | 890 MB | **± 2 minggu** | ± 1 minggu | 55% | **184% ✗** | 15% |

**Tanpa optimasi** (pola TOKO-CLOUD apa adanya), kuota bulanan habis jauh lebih cepat: pesan realtime penuh di ±15 outlet, egress di ±30 outlet, dan **Vercel requests di ±36 outlet** (karena cek versi tiap 5 menit).

### 9.4 Kesimpulan
1. **Limit pertama yang selalu tercapai adalah ukuran database 500 MB.** Contohnya: 1 tenant dengan 5 outlet akan penuh dalam **± 4 bulan** (± 2,5–3 bulan jika inventori aktif). Saat penuh, database menjadi read-only dan **semua outlet berhenti bisa bertransaksi**.
2. Kuota bulanan lain baru menjadi masalah di sekitar **20 outlet** (pesan realtime), lalu ±70 outlet (egress, koneksi realtime).
3. **Vercel Hobby secara teknis cukup sampai ratusan outlet** setelah optimasi, **tetapi tidak boleh dipakai untuk produk komersial.**

### 9.5 Status
Simulasi di atas dipakai sebagai dasar keputusan untuk **meninggalkan Supabase Free + Vercel Hobby**. Hosting pindah ke Cloudflare, dan pengganti Supabase dibahas di **§12**.

---

## 10. Mockup UI

| File | Layar |
|---|---|
| `mockup/pos.html` | Kasir: tipe order, kategori, grid menu, modal varian/modifier, keranjang, service + pajak, pembayaran (tunai/QRIS/split), struk |
| `mockup/tables.html` | Denah meja: area, status, timer, aksi meja |
| `mockup/kds.html` | Kitchen Display: tiket per stasiun dengan timer & status |
| `mockup/dashboard.html` | Dashboard pusat: "Semua Outlet", KPI, grafik per outlet, status live, feed transaksi |
| `mockup/menu.html` | Master menu: modifier, harga & ketersediaan per outlet, channel, resep |
| `mockup/simulasi-limit.html` | Simulator limit Supabase Free + Vercel Hobby |

---

## 11. Pertanyaan Terbuka (tidak menghalangi Fase 1)
1. ~~Hosting produksi~~ → Cloudflare (diputuskan). Backend: konfirmasi pilihan di §12.
2. Harga paket 5 outlet per bulan (untuk halaman langganan & WEB APP MANAGEMENT).
3. Model printer & tablet yang akan dipakai untuk uji (agar `escpos.js` diuji sejak Fase 2).

---

## 12. Pengganti Supabase (usulan — menunggu konfirmasi)

Kuota dicek 2026-10-02 dari halaman resmi pricing/limits masing-masing layanan.
**Perbandingan detail Supabase vs Cloudflare dan daftar lengkap perubahannya: [PERBANDINGAN-BACKEND.md](PERBANDINGAN-BACKEND.md).**

### 12.1 Kebutuhan yang harus dipenuhi
Database SQL dengan transaksi atomik (checkout, stok), isolasi data per tenant, autentikasi owner + perangkat + PIN, realtime (KDS, meja, dashboard), backup, storage foto, dan **paket gratis yang tidak penuh dalam hitungan bulan**.

### 12.2 Perbandingan kandidat

| Opsi | Storage gratis | Batas tulis gratis | Realtime | Auth | Biaya naik kelas | Catatan |
|---|---|---|---|---|---|---|
| **Cloudflare** (Workers + Durable Objects SQLite + D1 + R2) | **5 GB** (DO), 10 GB/objek | 100 rb baris/hari | WebSocket di Durable Object (dibuat sendiri) | Dibuat sendiri | **Workers Paid $5/bln**: 50 jt baris tulis/bln, storage tanpa batas ($0,20/GB) | Satu vendor dengan hosting; tanpa biaya egress; **direkomendasikan** |
| Turso + Workers | 5 GB, 100 DB | 10 jt baris/bln | Tidak ada | Tidak ada | $4,99/bln | Tetap butuh Workers untuk API & auth; vendor tambahan; sync offline masih beta |
| Firebase Firestore | 1 GiB | **20 rb dokumen/hari**, baca 50 rb/hari | Ya | Ya | Blaze (bayar per pakai) | Offline bawaan (+), tapi NoSQL: laporan/agregasi sulit, kuota baca cepat habis oleh dashboard & listener |
| Neon (Postgres) | 0,5 GB/project | 100 CU-jam/project/bln | Tidak ada | Neon Auth | ±$0,106/CU-jam + $0,35/GB | POS menyala ±14 jam/hari ≈ 105 CU-jam → **compute di-suspend sampai bulan berikutnya**. Tidak cocok |
| PocketBase di VPS | Sesuai disk VPS | Tanpa batas | Bawaan | Bawaan | Harga VPS | Sederhana, tapi server, update, keamanan & backup diurus sendiri; satu node |
| Supabase (tetap) | 500 MB | — | Ya | Ya | $25/bln | Pembanding |

### 12.3 Rekomendasi: Full Cloudflare

```
Tablet / Browser (PWA, vanilla JS — tidak berubah)
        │  HTTPS (API JSON)            │  WebSocket
        ▼                              ▼
Cloudflare Worker  ── aset statis (gratis, tanpa batas) ──► pos.html, kds.html, backoffice.html
  ├─ /api/auth/*        → D1 "core"  (tenants, users, devices, subscriptions, superadmin)
  ├─ /api/t/:tenant/*   → Durable Object TenantDO  (1 per tenant, SQLite: semua data bisnis)
  │                          ├─ transaksi atomik (pengganti RPC plpgsql)
  │                          └─ hub WebSocket per outlet (pengganti Supabase Realtime)
  ├─ R2                 → foto menu, arsip transaksi lama, backup harian
  └─ Cron / Alarm       → backup ke R2, tabel ringkasan, peringatan kuota
```

- **Isolasi tenant secara fisik**: tiap tenant punya database SQLite sendiri di dalam Durable Object miliknya, jadi kebocoran data antar-tenant lewat query yang lupa `WHERE tenant_id` tidak mungkin terjadi. Ini menggantikan RLS. Akses antar-outlet dalam satu tenant dicek di layer API (role & `outlet_ids` dari token).
- **Dashboard pusat** cukup query ke satu TenantDO, karena semua outlet satu tenant ada di objek yang sama.
- **Realtime**: WebSocket Hibernation API, sehingga koneksi tablet yang idle tidak memakan kuota durasi.
- **Auth**: owner login dengan email + password (hash PBKDF2 via WebCrypto), sesi berupa JWT. Perangkat memakai token hasil pairing, staff memakai PIN (rate limit di TenantDO). Email reset password lewat penyedia email transaksional (mis. Resend).
- **Backup**: export harian TenantDO ke R2 (alarm), ditambah point-in-time recovery Cloudflare.
- **Migrasi skema**: setiap TenantDO menjalankan migrasi bernomor versi saat aktif pertama kali setelah deploy.
- **Offline**: desain §3.10 (IndexedDB + outbox + event append-only) tetap sama; endpoint sync ditangani TenantDO.

### 12.4 Simulasi limit Cloudflare Free
Asumsi sama dengan §9 (150 trx/hari/outlet, 3 perangkat). Skema dirancang hemat tulis: item tiket dapur & event disimpan sebagai JSON, index minimal. Hasilnya ±25 baris tertulis per transaksi (termasuk baris index) dan ±3,5 KB per transaksi (SQLite tanpa overhead MVCC Postgres). **Angka ini estimasi dan harus diverifikasi saat pilot.**

| Kuota (Free) | Pemakaian per outlet | **Kapasitas** | Jika terlewati |
|---|---|---|---|
| Baris tertulis 100 rb/hari | ±4.150/hari | **±24 outlet** ← limit pertama | Tulis gagal sampai reset **07:00 WIB** (00:00 UTC) |
| Request Worker 100 rb/hari | ±1.200/hari | ±80 outlet | Request ditolak sampai reset |
| Request Durable Object 100 rb/hari | ±1.200/hari | ±80 outlet | idem |
| Baris dibaca 5 jt/hari | ±20 rb/hari (dengan index & tabel ringkasan) | ±250 outlet | idem |
| Storage 5 GB (total) | ±16 MB/bulan | 5 outlet: **±5 tahun**; 24 outlet: ±13 bulan | Tulis gagal |
| CPU 10 ms/request | — | Risiko per request (dashboard berat, hash password) | Error 1102 → perlu optimasi atau Paid |
| Aset statis | — | Tanpa batas | — |

**Dibandingkan Supabase Free**, limitnya berubah dari "penuh setelah ±4 bulan untuk 5 outlet" menjadi "**kapasitas ±24 outlet**, tanpa batas waktu dekat". Setelah ada tenant berbayar, **Workers Paid $5/bln (±Rp 82 rb)** menaikkan kapasitas ke ratusan outlet, menghapus batas CPU 10 ms, dan memperpanjang point-in-time recovery menjadi 30 hari.

### 12.5 Konsekuensi (jujur)
| Yang hilang dari Supabase | Penggantinya | Tambahan kerja |
|---|---|---|
| Auth siap pakai (login, reset password, session) | Modul auth sendiri di Worker | ±3–4 hari |
| RLS | Isolasi per-TenantDO + cek role di API | Termasuk di desain |
| RPC plpgsql & SQL dari TOKO-CLOUD | Fungsi JS di TenantDO (logika sama, ditulis ulang) | Bagian dari tiap fase |
| Realtime bawaan | WebSocket hub di TenantDO | ±2 hari |
| Dashboard tabel & SQL editor Supabase | D1 console (untuk core) + endpoint admin/export per tenant | ±1–2 hari |
| Tanpa build step di backend | Backend memakai **Wrangler CLI** (Node.js) untuk dev lokal & deploy. Frontend tetap vanilla tanpa bundler | Setup sekali |

Total: **Fase 1 bertambah ±1–1,5 minggu**, sebagai ganti biaya infrastruktur yang jauh lebih murah ($5 vs $25 per bulan) dan limit gratis yang jauh lebih longgar.

### 12.6 Jika disetujui, yang akan diubah di plan
§4 (arsitektur, struktur folder `worker/`, skema SQLite, endpoint API pengganti RPC, realtime), §6 (Fase 1 + auth & migrasi), §9 (simulator ditambah mode Cloudflare), serta `.cursorrules`/README proyek ini.
