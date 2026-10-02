# Perbandingan Backend: Supabase vs Cloudflare Full

**Tanggal:** 2026-10-02 · **Konteks:** POS F&B multi-tenant/multi-outlet (lihat [PLAN.md](PLAN.md))
**Sumber kuota:** supabase.com/pricing, docs Supabase (database size), developers.cloudflare.com (D1, Durable Objects, Workers pricing & limits). Kuota diambil per tanggal di atas.
**Cloudflare Full** = Workers (API + aset statis) + Durable Objects SQLite (1 objek per tenant) + D1 (database inti) + R2 (file).

> Angka pemakaian (MB/bulan, baris/transaksi) adalah **estimasi** dari model di PLAN §9 & §12.4, dengan asumsi 150 transaksi/hari/outlet dan 3 perangkat/outlet. Wajib diverifikasi dengan data nyata saat pilot.

---

## 1. Perbandingan Detail

### 1.1 Biaya & Kuota

| Aspek | Supabase | Cloudflare Full |
|---|---|---|
| Paket gratis | Free $0 | Workers Free $0 |
| Paket berbayar pertama | **Pro $25/bln** (± Rp 410 rb), sudah termasuk compute Micro | **Workers Paid $5/bln** (± Rp 82 rb) + pemakaian |
| Storage database gratis | **500 MB per project** (kumulatif) | **5 GB total** (DO SQLite), maks. 10 GB per tenant |
| Storage database berbayar | 8 GB, lalu $0,125/GB | 5 GB, lalu $0,20/GB-bulan (DO SQLite); tidak ada batas akun |
| Batas tulis | Tidak dihitung per baris | Free 100 rb baris/hari; Paid 50 jt/bln, lalu $1/juta |
| Batas baca | Tidak dihitung per baris | Free 5 jt baris/hari; Paid 25 miliar/bln |
| Request API | Tanpa batas | Free 100 rb/hari (Worker) + 100 rb/hari (DO); Paid 10 jt/bln + $0,30/juta |
| Egress (data keluar) | Free 5 GB, Pro 250 GB, lalu $0,09/GB | **Tanpa biaya egress** |
| Realtime | Free 200 koneksi & 2 jt pesan; Pro 500 & 5 jt | Tanpa kuota pesan khusus; pesan keluar WebSocket gratis, pesan masuk dihitung 20:1 sebagai request DO |
| Storage file | Free 1 GB, Pro 100 GB (egress dihitung) | R2 Free 10 GB, **tanpa egress** |
| Hosting frontend | Tidak termasuk (butuh Vercel/Cloudflare) | Termasuk; **aset statis gratis tanpa batas** |
| Jika kuota gratis habis | DB penuh → **read-only** (transaksi gagal sampai upgrade/hapus data) | Kuota harian habis → tulis/request gagal **sampai 07:00 WIB** (reset 00:00 UTC) |
| Pause otomatis | Free: pause setelah 1 minggu tidak aktif; maks. 2 project | Tidak ada |
| Penggunaan komersial di paket gratis | Boleh | Boleh |

### 1.2 Kapasitas untuk POS ini (estimasi)

| Skenario | Supabase Free | Cloudflare Free | Supabase Pro ($25) | Cloudflare Paid ($5) |
|---|---|---|---|---|
| 1 outlet (pilot) | DB penuh ± 32 bulan | Aman bertahun-tahun | Aman | Aman |
| **5 outlet (1 paket)** | **DB penuh ± 4 bulan** | Storage ± 5 tahun, tulis ±21% kuota harian | ± 6 tahun | Aman |
| 20 outlet | DB penuh ± 1 bulan; pesan realtime 92% | Tulis ±85% kuota harian; storage ± 15 bulan | DB 8 GB penuh ± 17 bulan, lalu bayar disk | Aman (~$5–6) |
| 24+ outlet | — | **Kuota tulis harian terlewati** | — | Aman |
| 100 outlet | Tidak mungkin | Tidak mungkin | ± $50–60/bln (disk + pesan realtime + compute Small) | ± $8–10/bln |
| **Limit pertama** | **Ukuran DB (waktu)** | **Baris tulis/hari (jumlah outlet)** | Ukuran DB (murah ditambah) | — |

### 1.3 Database & Logika Bisnis

| Aspek | Supabase | Cloudflare Full |
|---|---|---|
| Mesin | **PostgreSQL** penuh (JSONB, window function, CTE, extension) | **SQLite** (JSON functions, window function, CTE, trigger; tanpa stored procedure) |
| Tipe data | Kaya: NUMERIC, TIMESTAMPTZ, UUID, JSONB, ENUM | Sederhana: INTEGER, REAL, TEXT, BLOB (pakai tabel `STRICT`) |
| Uang (Rupiah) | NUMERIC | INTEGER (Rupiah tidak punya sen, jadi aman) |
| Logika transaksi (checkout, stok) | RPC plpgsql `SECURITY DEFINER` | Method JavaScript di Durable Object dengan `transactionSync()` |
| Konkurensi | Banyak koneksi paralel; perlu `SELECT … FOR UPDATE` | 1 tenant = 1 thread, sehingga **request diproses berurutan** (tanpa race condition). Batas lunak ±1.000 request/detik per tenant |
| Query lintas tenant (superadmin) | SQL biasa | Tidak bisa langsung; perlu statistik ringkasan di D1 inti atau fan-out ke tiap tenant |
| Laporan/agregasi | Sangat kuat | Cukup kuat untuk 1 tenant (data tenant ada di satu SQLite) |
| Batas ukuran per tenant | Tidak ada (satu DB bersama) | 10 GB per tenant (tidak bisa dinaikkan), sehingga butuh arsip data lama ke R2 |
| Migrasi skema | SQL migration sekali jalan | Migrasi bernomor versi dijalankan **di tiap tenant** saat objek aktif |
| SQL console | Dashboard Supabase (lengkap) | D1 console untuk DB inti; data tenant lewat endpoint admin/export buatan sendiri |

### 1.4 Keamanan & Multi-Tenant

| Aspek | Supabase | Cloudflare Full |
|---|---|---|
| Isolasi tenant | **Logis**: semua tenant di satu DB, dipisah oleh RLS | **Fisik**: 1 database SQLite per tenant |
| Risiko kebocoran antar-tenant | Policy RLS salah/terlupa → data bocor | Hampir nol: request hanya diarahkan ke DO tenant milik token |
| Hak akses outlet/role | RLS (`my_outlet_ids()`) | Middleware API (cek role & outlet dari token) |
| Akses dari browser | Langsung ke DB via PostgREST (anon key publik) | Hanya lewat API buatan sendiri; DB tidak bisa diakses langsung |
| Permukaan serangan | API otomatis untuk semua tabel (harus dikunci RLS) | Hanya endpoint yang ditulis |
| Rate limit login/PIN | Auth bawaan + buat sendiri untuk PIN | Buat sendiri (mudah di DO) |

### 1.5 Auth

| Aspek | Supabase | Cloudflare Full |
|---|---|---|
| Email + password | ✅ Bawaan | Buat sendiri (hash PBKDF2 via WebCrypto + JWT) |
| Verifikasi email, reset password | ✅ Bawaan (SMTP bawaan sangat terbatas, perlu SMTP sendiri) | Buat sendiri + penyedia email (mis. Resend) |
| OAuth Google, MFA, magic link | ✅ Bawaan | Buat sendiri / library (mis. Better Auth) jika dibutuhkan |
| Session & refresh token | ✅ Bawaan (supabase-js) | Buat sendiri (access token pendek + refresh token di D1) |
| Akun perangkat (tablet) | Akun Auth per perangkat via Edge Function | Token perangkat dari pairing, bisa dicabut |
| PIN staff | RPC buatan sendiri | Method DO buatan sendiri |
| Catatan Free tier | — | Batas CPU 10 ms/request bisa terlewati oleh hashing password yang kuat → perlu diuji; hilang di Paid |

### 1.6 Realtime (KDS, meja, dashboard)

| Aspek | Supabase | Cloudflare Full |
|---|---|---|
| Mekanisme | Supabase Realtime (Broadcast / Postgres Changes / Presence) | WebSocket langsung ke Durable Object tenant |
| Setup | Konfigurasi + RLS `realtime.messages` | Kode hub sendiri (±150–250 baris) |
| Batas | Koneksi & pesan per bulan | Praktis tanpa kuota pesan; hibernation membuat koneksi idle gratis |
| Konsistensi | Event dari trigger DB → server realtime terpisah | Event dikirim **dari tempat yang sama dengan transaksi** (DO), sehingga pasti berurutan |
| Reconnect & resume | Ditangani supabase-js | Buat sendiri (reconnect + muat ulang state) |

### 1.7 Operasional

| Aspek | Supabase | Cloudflare Full |
|---|---|---|
| Backup | Free: **tidak ada**; Pro: harian 7 hari; PITR +$100/bln | D1: Time Travel 7 hari (Free) / 30 hari (Paid); DO SQLite: point-in-time recovery 30 hari via API; ditambah export harian ke R2 |
| Lokasi data | Pilih region (mis. Singapura) | Worker di edge (dekat pengguna); DO dibuat dekat request pertama (bisa diberi hint `apac`) |
| Pengembangan lokal | Supabase CLI (butuh **Docker**) | `wrangler dev` (tanpa Docker) |
| Deploy | Migrasi SQL + deploy frontend terpisah | `wrangler deploy` (frontend + backend sekali jalan) |
| Build step | Tidak ada | Backend butuh **Node.js + Wrangler** (frontend tetap tanpa bundler) |
| Log & monitoring | Dashboard (Free: log 1 hari) | Workers Logs & analytics, metrik baris baca/tulis per objek |
| Cron/background job | pg_cron / Edge Functions | Cron Triggers (Free: 5 per akun) + DO Alarms |
| Testing | SQL test / pgTAP | Vitest + `@cloudflare/vitest-pool-workers` |

### 1.8 Strategis

| Aspek | Supabase | Cloudflare Full |
|---|---|---|
| Vendor lock-in | **Rendah**: Postgres standar, open source, bisa self-host | **Lebih tinggi**: Durable Objects proprietary (data SQLite tetap bisa diekspor) |
| Reuse dari TOKO-CLOUD | Tinggi (schema, RLS, RPC, pola supabase-js) | Rendah di backend (logika dipindah ke JS); frontend tetap |
| Kecepatan mulai (Fase 1) | Lebih cepat | **± 1–1,5 minggu lebih lama** |
| Biaya jangka panjang | Lebih mahal ($25 → $50+) | Jauh lebih murah ($5 → $10) |
| Skala per tenant | Tidak dibatasi per tenant | Maks. 10 GB per tenant (arsip > 12 bulan ke R2) |
| Kecocokan dengan offline-first | Netral | Baik: sync idempotent & berurutan per tenant secara alami |
| Ekosistem/dokumentasi | Sangat besar, banyak contoh POS/SaaS | Besar, tapi pola multi-tenant DO lebih jarang |

### 1.9 Ringkasan Skor (untuk proyek ini)

| Kriteria | Bobot | Supabase | Cloudflare |
|---|---|---|---|
| Biaya & kuota gratis | Tinggi | ★★☆☆☆ | ★★★★★ |
| Keamanan isolasi tenant | Tinggi | ★★★☆☆ | ★★★★★ |
| Kecepatan pengembangan | Sedang | ★★★★★ | ★★★☆☆ |
| Fitur siap pakai (auth, realtime, console) | Sedang | ★★★★★ | ★★☆☆☆ |
| Laporan & query lintas tenant | Sedang | ★★★★★ | ★★★☆☆ |
| Portabilitas / lock-in | Rendah | ★★★★★ | ★★★☆☆ |
| Biaya saat skala | Tinggi | ★★★☆☆ | ★★★★★ |

**Kesimpulan:** Supabase menang di kecepatan membangun dan fitur siap pakai. Cloudflare menang di biaya, kuota gratis, dan isolasi tenant. Karena keputusan proyek adalah **tetap gratis selama pilot** dan **hosting di Cloudflare**, Cloudflare Full lebih cocok. Harga yang dibayar adalah ±1–1,5 minggu kerja tambahan di Fase 1 dan lock-in yang lebih tinggi.

---

## 2. Yang Harus Diubah Jika Memakai Cloudflare Full

### 2.1 Yang TIDAK berubah
- Seluruh **UI/mockup**, alur kasir, meja, KDS, dashboard, menu.
- Frontend **vanilla JS tanpa bundler**, pola `window.state`, fungsi global.
- Desain **offline** (IndexedDB, outbox, event append-only, UUID dari klien).
- Printer (Web Serial/Web Bluetooth/RawBT), PWA, model lisensi paket 5 outlet, urutan fase.

### 2.2 Struktur Proyek

```
POS-FNB/
├── public/                     # ← frontend (dulu di root)
│   ├── index.html, pos.html, kds.html, backoffice.html
│   ├── css/, vendor/, js/core, js/pos, js/kds, js/backoffice
│   ├── manifest.json, sw.js, version.json
│   └── _headers                # CSP & cache header (pengganti vercel.json)
├── worker/                     # ← BARU: backend
│   ├── index.js                # router: /api/auth, /api/t/:tenant, /api/admin, aset statis
│   ├── auth.js                 # login, refresh, reset password, JWT, PBKDF2
│   ├── core-db.js              # query D1 inti
│   ├── tenant-do.js            # class TenantDO (SQLite + WebSocket)
│   ├── services/               # orders.js, payments.js, shifts.js, menu.js, reports.js, sync.js
│   ├── migrations/
│   │   ├── core/0001_init.sql  # D1
│   │   └── tenant/0001_init.js # dijalankan per TenantDO
│   └── lib/                    # validate.js, money.js (dipakai bersama frontend), errors.js
├── test/                       # vitest
├── wrangler.jsonc              # binding: D1 CORE, DO TENANT, R2 FILES, cron, vars
├── package.json                # hanya untuk wrangler & vitest
└── PLAN.md, PERBANDINGAN-BACKEND.md, mockup/
```

### 2.3 Database

| Dari (Supabase/Postgres) | Menjadi (Cloudflare) |
|---|---|
| 1 database untuk semua tenant + kolom `tenant_id` + RLS | **D1 `core`**: `tenants`, `users` (owner/manajer), `sessions`, `devices`, `subscriptions`, `subscription_logs`, `super_admins`, `tenant_stats`. **TenantDO SQLite** (1 per tenant): semua tabel `fnb_*` lainnya **tanpa** kolom `tenant_id` |
| `BIGINT`, `SERIAL` | `INTEGER PRIMARY KEY` / UUID `TEXT` |
| `NUMERIC` (uang) | `INTEGER` (Rupiah) |
| `TIMESTAMPTZ` | `INTEGER` epoch ms (atau `TEXT` ISO-8601) + `business_date TEXT` |
| `JSONB` | `TEXT` + fungsi `json_extract`/`json_each` |
| `BOOLEAN` | `INTEGER` 0/1 |
| `ENUM` | `TEXT` + `CHECK (...)` |
| `gen_random_uuid()` | `crypto.randomUUID()` di JS / UUID dari klien |
| Sequence nomor order | Tabel counter di TenantDO (aman karena single-thread) |
| Index `(tenant_id, outlet_id, business_date)` | Index `(outlet_id, business_date)` |
| `schema.sql` sekali jalan | Migrasi berversi: `core` via `wrangler d1 migrations`, tenant via runner di constructor DO (`PRAGMA user_version`) |

### 2.4 Keamanan (pengganti RLS)
1. Setiap request API wajib membawa token (owner/manajer: JWT; perangkat: token perangkat).
2. Worker memverifikasi token, lalu mengambil `tenant_id`, `role`, `outlet_ids` dari token, bukan dari URL atau body.
3. Request diteruskan **hanya** ke `TENANT.idFromName(tenant_id)`. Tenant lain tidak bisa disentuh.
4. Di TenantDO, setiap method memeriksa permission (`void_item`, `view_reports`, …) dan apakah `outlet_id` termasuk akses token.
5. Endpoint superadmin (`/api/admin/*`) memakai token terpisah + daftar `super_admins` di D1.
6. Rate limit login & PIN, audit log, revoke perangkat/sesi.
7. Header keamanan & CSP di `_headers`; `connect-src 'self'` (tidak ada lagi `*.supabase.co`).

### 2.5 Logika Bisnis (pengganti RPC)

| RPC Supabase (rencana lama) | Endpoint / method Cloudflare |
|---|---|
| `fnb_verify_pin` | `POST /api/t/staff/login-pin` → `TenantDO.verifyPin()` |
| `fnb_open_order`, `fnb_add_items` | `POST /api/t/orders`, `POST /api/t/orders/:id/items` |
| `fnb_send_to_kitchen` | `POST /api/t/orders/:id/send` (+ broadcast WebSocket) |
| `fnb_void_item` | `POST /api/t/orders/:id/items/:item/void` |
| `fnb_move_table` / `merge` / `split` | `POST /api/t/orders/:id/move` dst. |
| `fnb_checkout` | `POST /api/t/orders/:id/checkout` → `transactionSync()` (order, bayar, stok, ringkasan) |
| `fnb_sync_events` | `POST /api/t/sync` (idempotent, berurutan) |
| `fnb_close_shift`, `fnb_close_day` | `POST /api/t/shifts/:id/close`, `POST /api/t/days/close` |
| `fnb_sales_summary`, `fnb_outlet_live_status` | `GET /api/t/reports/summary`, `GET /api/t/outlets/status` |
| Query CRUD langsung `supabase.from(...)` | Endpoint REST per resource (`/api/t/menus`, `/api/t/tables`, …) |

### 2.6 Auth (dibuat sendiri)
- `POST /api/auth/register` (buat tenant + owner + TenantDO), `login`, `refresh`, `logout`, `forgot-password`, `reset-password`, `verify-email`.
- Password: PBKDF2-SHA256 (WebCrypto) + salt. Jumlah iterasi diuji terhadap batas CPU 10 ms di Free.
- Token: access JWT (15 menit, HMAC) + refresh token (30 hari, rotasi, disimpan hash-nya di D1).
- Perangkat: `POST /api/auth/pair` dengan kode 6 digit menghasilkan token perangkat jangka panjang, bisa dicabut.
- Email: penyedia email transaksional (mis. Resend) via `fetch` dari Worker.

### 2.7 Realtime
- Frontend: `new WebSocket('/api/t/ws?outlet=ID')` dengan token; reconnect eksponensial + sinkron ulang state setelah tersambung.
- TenantDO: WebSocket Hibernation API, tag per outlet (`ctx.acceptWebSocket(ws, ['outlet:3'])`), broadcast setelah transaksi berhasil.
- Pesan: `{type: 'ticket.new' | 'ticket.status' | 'table.status' | 'menu.soldout' | 'sale.new', data}`.

### 2.8 Frontend (perubahan kode)

| File | Perubahan |
|---|---|
| `js/core/supabase.js` | **Dihapus** → diganti `js/core/api.js` (fetch + token + refresh otomatis + idempotency key + mapping error) |
| `js/core/realtime.js` | Ditulis ulang untuk WebSocket native |
| `js/core/sync.js` | Endpoint diganti ke `/api/t/sync`; logika outbox tetap |
| `js/core/license.js` | Status langganan dibaca dari `/api/auth/me` |
| Semua modul | `supabase.from('x').select().eq()` → `api.get('/x', {query})` |
| `vendor/` | supabase-js tidak dipakai lagi |
| `sw.js` | Precache path `public/`; jangan cache `/api/*` |
| Upload foto | `PUT /api/t/files` → R2 (dikompres WebP di browser dulu) |

### 2.9 Storage, Background Job & Backup
- **R2**: foto menu, logo struk, arsip transaksi > 12 bulan (JSON/CSV terkompresi), backup.
- **Cron Trigger** (maks. 5 di Free): backup harian, rekap `tenant_stats` ke D1, peringatan kuota.
- **DO Alarm** per tenant: tutup hari otomatis, export backup tenant ke R2, pembersihan data.
- **Backup**: D1 Time Travel + DO point-in-time recovery + export harian ke R2. GitHub Actions `pg_dump` tidak dipakai lagi.

### 2.10 WEB APP MANAGEMENT (superadmin)
Saat ini aplikasi tersebut membaca tabel Supabase langsung, jadi harus diubah agar memanggil `/api/admin/*`:
- daftar tenant, status, paket, jumlah outlet, transaksi 30 hari (dari `tenant_stats`)
- aktivasi, suspend, extend, ubah jumlah paket
- export data tenant (untuk support / jika tenant berhenti berlangganan)

### 2.11 Deploy, Konfigurasi & Tooling

| Dari | Menjadi |
|---|---|
| `vercel.json` | `wrangler.jsonc` + `public/_headers` |
| `.env` + `window.env` di HTML | `vars` & `wrangler secret` (JWT secret, API key email); frontend tidak butuh key apa pun |
| `keepalive.md` (anti-pause Supabase) | Tidak dibutuhkan |
| Supabase CLI / SQL editor | `wrangler dev`, `wrangler d1`, `wrangler deploy`, endpoint admin |
| Tanpa Node.js | **Node.js LTS** di laptop developer (hanya untuk Wrangler & test) |
| — | Monitoring: Workers Logs + peringatan saat baris tulis harian > 70% kuota |

### 2.12 Perubahan Dokumen PLAN.md

| Bagian | Perubahan |
|---|---|
| §0 Keputusan | Backend = Cloudflare Full |
| §1 Reuse TOKO-CLOUD | Backend tidak di-reuse; hanya pola frontend & logika bisnis (dipindah ke JS) |
| §2 Roles | Login owner via auth sendiri; selebihnya sama |
| §4 Arsitektur | **Ditulis ulang**: struktur folder, skema SQLite, endpoint API, realtime WebSocket, keamanan |
| §6 Milestone | Fase 1 + auth, router API, runner migrasi, TenantDO dasar (+1–1,5 minggu) |
| §8 Risiko | Hapus risiko khusus RLS/`search_path`/`postgres_changes`; tambah: batas CPU 10 ms, batas tulis harian, 10 GB per tenant, migrasi per tenant, lock-in |
| §9 Simulasi | Tambah mode Cloudflare di `simulasi-limit.html` |
| §12 | Diganti menjadi ringkasan keputusan + tautan ke dokumen ini |
| Baru | `.cursorrules`/`CLAUDE.md` proyek: aturan coding backend (Worker/DO) |

### 2.13 Risiko Baru & Mitigasinya

| Risiko | Mitigasi |
|---|---|
| Kuota tulis 100 rb/hari habis di siang hari → kasir tidak bisa simpan transaksi | Skema hemat tulis; peringatan di 70%; **upgrade ke Paid ($5) sebelum ±15 outlet**; outbox offline otomatis menahan transaksi saat API gagal |
| CPU 10 ms/request (Free) terlewati | Query ber-index, dashboard dari tabel ringkasan, hashing diuji; Paid menghapus batas ini |
| Migrasi skema gagal di sebagian tenant | Migrasi kecil & idempotent, versi dicatat per tenant, endpoint admin untuk cek versi |
| Tenant > 10 GB | Arsip otomatis > 12 bulan ke R2; tabel ringkasan tetap disimpan |
| Bug di auth buatan sendiri | Pakai algoritma standar (PBKDF2, HMAC-JWT), test otomatis, rate limit, tanpa kriptografi buatan sendiri |
| Lock-in Cloudflare | Logika bisnis di modul JS murni (`services/`) yang tidak bergantung pada API DO; data SQLite bisa diekspor |
| Superadmin butuh data lintas tenant | Rekap harian ke `tenant_stats` di D1 |
