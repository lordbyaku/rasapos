// Tutorial interaktif RasaPOS: modul per peran, simulator latihan, kuis, progres & sertifikat.
// Simulator memakai Money.calc / Money.settle yang sama dengan aplikasi kasir, jadi angka latihan = angka asli.
(function () {
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
    const rp = n => (n < 0 ? '-Rp ' : 'Rp ') + Math.abs(Math.round(n)).toLocaleString('id-ID');
    const store = {
        get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
        set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* penyimpanan diblokir */ } }
    };

    const ROLES = { owner: 'Pemilik / Owner', manager: 'Manager outlet', cashier: 'Kasir', waiter: 'Waiter / Pelayan', kitchen: 'Dapur / Bar' };
    const OUTLET = { tax_rate: 10, service_rate: 5, tax_on_service: true, tax_inclusive: false, cash_rounding: 100 };

    // Kotak info
    const tip = t => `<div class="my-3 p-3 rounded-xl bg-sky-50 text-sky-900 text-sm flex gap-2"><i class="fas fa-lightbulb mt-0.5 text-sky-500"></i><div>${t}</div></div>`;
    const warn = t => `<div class="my-3 p-3 rounded-xl bg-amber-50 text-amber-900 text-sm flex gap-2"><i class="fas fa-triangle-exclamation mt-0.5 text-amber-500"></i><div>${t}</div></div>`;
    const danger = t => `<div class="my-3 p-3 rounded-xl bg-red-50 text-red-800 text-sm flex gap-2"><i class="fas fa-ban mt-0.5 text-red-500"></i><div>${t}</div></div>`;
    const where = t => `<div class="my-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-stone-100 text-stone-700 text-xs font-semibold"><i class="fas fa-location-dot text-brand-500"></i>${t}</div>`;
    const sim = (id, title) => `<div class="my-4 card overflow-hidden border-brand-200"><div class="px-4 py-2.5 bg-brand-50 border-b border-brand-100 flex items-center gap-2 text-sm font-bold text-brand-700"><i class="fas fa-gamepad"></i>Latihan: ${title}<span class="ml-auto text-[11px] font-normal text-brand-600">simulasi — tidak menyimpan data asli</span></div><div class="p-4" data-sim="${id}"></div></div>`;
    const table = (head, rows) => `<div class="overflow-x-auto my-3"><table class="tbl border border-stone-200 rounded-xl"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td class="!align-top">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

    // =====================================================================================
    // MODUL
    // =====================================================================================
    const MODULES = [
        {
            id: 'intro', icon: 'fa-flag-checkered', title: 'Mulai di sini', roles: ['owner', 'manager', 'cashier', 'waiter', 'kitchen'], minutes: 8,
            desc: 'Kenali RasaPOS, istilah penting, peran, dan perangkat yang dibutuhkan.',
            lessons: [
                {
                    title: 'Apa itu RasaPOS?', html: `
                    <p><b>RasaPOS</b> adalah aplikasi kasir (Point of Sale) khusus <b>restoran, kafe, dan kedai</b> yang bisa dipakai di <b>banyak outlet sekaligus</b>. Semua transaksi dari setiap outlet langsung terlihat oleh pemilik di <b>dashboard pusat</b> secara realtime.</p>
                    <p>RasaPOS terdiri dari 4 aplikasi yang saling terhubung:</p>
                    ${table(['Aplikasi', 'Dipakai oleh', 'Dibuka di', 'Fungsi'], [
                        ['<i class="fas fa-chart-line text-brand-500 mr-1"></i><b>Back Office</b>', 'Pemilik, manager', 'Laptop / HP', 'Atur menu, harga, outlet, staff; lihat laporan semua outlet'],
                        ['<i class="fas fa-cash-register text-brand-500 mr-1"></i><b>Kasir (POS)</b>', 'Kasir, waiter, manager', 'Tablet di outlet', 'Terima pesanan, meja, pembayaran, struk, shift'],
                        ['<i class="fas fa-fire-burner text-brand-500 mr-1"></i><b>Layar Dapur (KDS)</b>', 'Koki, barista', 'Tablet/TV di dapur', 'Melihat & menyelesaikan pesanan per stasiun'],
                        ['<i class="fas fa-book text-brand-500 mr-1"></i><b>Panduan</b>', 'Semua', 'Di mana saja', 'Halaman yang sedang Anda baca']
                    ])}
                    ${tip('Semua aplikasi dibuka dari alamat yang sama di <b>Google Chrome</b>. Tablet kasir & dapur cukup dipasangkan sekali dengan kode 6 digit, setelah itu langsung terbuka ke aplikasinya masing-masing.')}`
                },
                {
                    title: 'Istilah penting', html: `
                    ${table(['Istilah', 'Arti'], [
                        ['<b>Outlet</b>', 'Satu cabang/lokasi usaha. Setiap outlet punya pajak, service, meja, staff, dan perangkat sendiri.'],
                        ['<b>Perangkat</b>', 'Tablet kasir atau layar dapur yang sudah dipasangkan ke satu outlet.'],
                        ['<b>Staff & PIN</b>', 'Kasir, waiter, manager, dapur login di tablet dengan memilih nama + PIN (4–6 digit). Manager wajib PIN 6 digit.'],
                        ['<b>Shift</b>', 'Periode kerja kasir dari buka laci (modal awal) sampai tutup laci (hitung uang). Pembayaran hanya bisa saat shift terbuka.'],
                        ['<b>Channel</b>', 'Sumber pesanan: Dine-in, Take Away, GoFood, GrabFood, dll. Channel menentukan harga & komisi.'],
                        ['<b>Open bill</b>', 'Order yang masih terbuka (belum dibayar). Bisa ditambah pesanan berkali-kali, umumnya untuk meja dine-in.'],
                        ['<b>Kirim dapur</b>', 'Mengirim item baru ke dapur/bar. Setelah dikirim, item hanya bisa dibatalkan lewat <b>void</b>.'],
                        ['<b>Stasiun</b>', 'Bagian produksi: Dapur, Bar, Pastry. Tiket dipecah otomatis per stasiun.'],
                        ['<b>Void</b>', 'Membatalkan item yang sudah dikirim ke dapur. Butuh alasan & persetujuan manager.'],
                        ['<b>PBJT</b>', 'Pajak Barang & Jasa Tertentu (dulu PB1) — pajak restoran daerah, umumnya 10%.'],
                        ['<b>Service charge</b>', 'Biaya layanan (mis. 5%), hanya untuk dine-in.'],
                        ['<b>Tutup hari (Z-report)</b>', 'Penutupan hari bisnis outlet setelah semua order dibayar & semua shift ditutup.'],
                        ['<b>Hari bisnis</b>', 'Tanggal operasional. Resto yang buka lewat tengah malam tetap dihitung hari sebelumnya sampai "jam pergantian hari" (default 04:00).'],
                        ['<b>Mode offline / tertunda</b>', 'Saat internet putus, transaksi disimpan di tablet & dikirim otomatis nanti. Jumlah yang belum terkirim tampil sebagai "tertunda".']
                    ])}`
                },
                {
                    title: 'Peran & hak akses', html: `
                    <p>Setiap orang hanya bisa melakukan tindakan sesuai perannya. Pemilik bisa menyesuaikan hak akses per staff di Back Office → <b>Staff & Akses</b>.</p>
                    ${table(['Tindakan', 'Waiter', 'Kasir', 'Manager', 'Dapur'], [
                        ['Input pesanan & kirim dapur', '✅', '✅', '✅', '—'],
                        ['Pindah / gabung / split meja', '✅', '✅', '✅', '—'],
                        ['Terima pembayaran', '—', '✅', '✅', '—'],
                        ['Buka/tutup shift, kas masuk/keluar', '—', '✅', '✅', '—'],
                        ['Tandai menu habis', '—', '✅', '✅', '—'],
                        ['Void item yang sudah dikirim', 'PIN manager', 'PIN manager', '✅', '—'],
                        ['Diskon di atas batas', 'PIN manager', 'PIN manager', '✅', '—'],
                        ['Refund', '—', 'PIN manager', '✅', '—'],
                        ['Tutup hari', '—', '—', '✅', '—'],
                        ['Layar dapur (KDS)', '—', '—', '✅', '✅']
                    ])}
                    <p>Selain staff di tablet, ada dua jenis akun yang login dengan <b>email</b> ke Back Office:</p>
                    <ul><li><b>Pemilik</b> — akses penuh semua outlet, satu-satunya yang bisa mengubah menu master, outlet baru, dan langganan.</li>
                    <li><b>Manager (akun email)</b> — dibuat pemilik, hanya melihat & mengatur outlet yang ditugaskan.</li></ul>`
                },
                {
                    title: 'Perangkat yang dibutuhkan', html: `
                    <ul>
                        <li><b>Tablet Android</b> (disarankan layar 10", RAM ≥ 3 GB) dengan <b>Google Chrome versi 138 atau lebih baru</b>.</li>
                        <li><b>Printer thermal Bluetooth</b> 58 mm atau 80 mm (opsional, untuk struk & tiket dapur). Laci kas bisa disambungkan ke printer.</li>
                        <li><b>Tablet/TV untuk dapur</b> (opsional) jika memakai layar dapur. Tanpa layar dapur, tiket bisa dicetak.</li>
                        <li><b>Internet</b> — disarankan stabil, tetapi kasir tetap berjalan saat internet putus.</li>
                    </ul>
                    ${warn('Gunakan <b>Google Chrome</b>, bukan browser bawaan (Samsung Internet, Mi Browser, dll.). Printer Bluetooth & mode offline hanya teruji di Chrome.')}
                    ${tip('Pasang aplikasi ke layar utama: di Chrome ketuk menu ⋮ → <b>Tambahkan ke layar utama / Instal aplikasi</b>. Aplikasi akan terbuka layar penuh seperti aplikasi biasa.')}`
                }
            ],
            quiz: [
                { q: 'Item yang sudah dikirim ke dapur ternyata salah. Apa yang harus dilakukan?', o: ['Hapus item seperti biasa', 'Void item dengan alasan & persetujuan manager', 'Biarkan saja, nanti diskon'], a: 1, e: 'Item yang sudah dikirim hanya bisa dibatalkan melalui void, dengan alasan dan PIN manager (jika Anda bukan manager).' },
                { q: 'Kapan pembayaran bisa diterima di tablet kasir?', o: ['Kapan saja', 'Hanya saat shift kasir terbuka', 'Hanya setelah tutup hari'], a: 1, e: 'Pembayaran membutuhkan shift terbuka agar uang di laci bisa dicocokkan.' },
                { q: 'Browser yang disarankan untuk tablet kasir adalah…', o: ['Browser bawaan HP', 'Google Chrome versi terbaru', 'Browser apa saja'], a: 1, e: 'Chrome ≥ 138 dibutuhkan agar printer Bluetooth dan mode offline berfungsi.' }
            ]
        },

        // ---------------------------------------------------------------------------------
        {
            id: 'setup', icon: 'fa-screwdriver-wrench', title: 'Setup awal usaha', roles: ['owner'], minutes: 20,
            desc: 'Langkah pertama pemilik: akun, outlet, pajak, meja, menu, staff, dan perangkat.',
            lessons: [
                {
                    title: 'Urutan setup yang disarankan', html: `
                    <p>Ikuti urutan ini agar tablet kasir siap dipakai di hari pertama:</p>
                    <ol>
                        <li><b>Daftar akun</b> usaha (trial 14 hari gratis).</li>
                        <li><b>Atur outlet</b>: alamat, pajak, service charge, pembulatan, struk.</li>
                        <li><b>Buat area & meja</b> (jika ada dine-in).</li>
                        <li><b>Buat kategori</b> beserta stasiun produksinya (Dapur/Bar).</li>
                        <li><b>Buat grup modifier/varian</b> (Ukuran, Level Pedas, Topping…).</li>
                        <li><b>Buat menu</b> + pasang modifier + (opsional) foto & resep.</li>
                        <li><b>Tambahkan staff</b> dengan PIN.</li>
                        <li><b>Pasangkan tablet</b> kasir (& layar dapur) dengan kode 6 digit.</li>
                        <li><b>Hubungkan printer</b> di tablet & lakukan tes cetak.</li>
                        <li>Lakukan <b>transaksi uji</b>, lalu cek di Dashboard.</li>
                    </ol>
                    ${tip('Setiap langkah di bawah ini punya tanda centang. Tandai selesai agar progres Anda tercatat.')}`
                },
                {
                    title: 'Daftar akun & langganan', html: `
                    ${where('Halaman depan → tab "Daftar"')}
                    <ol><li>Isi nama usaha/brand, nama Anda, no. HP, nama outlet pertama, email, dan password (min. 8 karakter).</li>
                    <li>Klik <b>Daftar & mulai trial</b>. Anda langsung masuk ke Back Office.</li></ol>
                    <h3>Trial & paket</h3>
                    <ul><li><b>Trial 14 hari</b>: semua fitur, maksimal <b>1 outlet</b>.</li>
                    <li><b>Paket berbayar</b>: dihitung per <b>5 outlet</b> (1 paket = 5 outlet, 2 paket = 10 outlet, dst.).</li>
                    <li>Setelah masa aktif habis ada <b>masa tenggang 3 hari</b>. Setelah itu kasir tidak bisa membuat transaksi baru, tetapi laporan tetap bisa dilihat dan data offline tetap tersinkron.</li></ul>
                    ${where('Back Office → Pengaturan → Langganan')}
                    <p>Status langganan, jumlah paket, dan riwayatnya terlihat di sana. Perpanjangan dilakukan oleh admin RasaPOS — sebutkan <b>ID usaha</b> Anda.</p>`
                },
                {
                    title: 'Pengaturan outlet, pajak & service', html: `
                    ${where('Back Office → Outlet & Meja → tombol "Pengaturan" pada kartu outlet')}
                    ${table(['Pengaturan', 'Penjelasan', 'Contoh'], [
                        ['Kode outlet', 'Singkatan unik untuk laporan', 'JKT-SDM'],
                        ['Zona waktu', 'WIB / WITA / WIT sesuai lokasi outlet', 'WIB'],
                        ['Jam pergantian hari bisnis', 'Transaksi sebelum jam ini masuk ke hari sebelumnya', '04:00'],
                        ['Nama & tarif pajak', 'PBJT/PB1 sesuai Perda setempat', 'PBJT 10%'],
                        ['Service charge', 'Hanya untuk order dine-in', '5%'],
                        ['Pajak termasuk service', 'Jika dicentang, pajak dihitung dari (penjualan + service)', 'Ya'],
                        ['Harga sudah termasuk pajak', 'Centang jika harga di menu sudah termasuk pajak', 'Tidak'],
                        ['Pembulatan tunai', 'Dibulatkan hanya untuk pembayaran tunai', 'Rp 100'],
                        ['Header/footer struk', 'Nama usaha, Wi-Fi, Instagram, ucapan', 'WiFi: kopi123']
                    ])}
                    ${sim('tax', 'Kalkulator pajak & service')}
                    ${tip('Pembulatan hanya berlaku untuk uang tunai. QRIS/kartu selalu ditagih persis sampai rupiah terakhir.')}`
                },
                {
                    title: 'Area & meja', html: `
                    ${where('Back Office → Outlet & Meja → bagian "Area & Meja"')}
                    <ol><li>Klik <b>+ Area</b> untuk membuat area (Indoor, Outdoor, Lantai 2, VIP).</li>
                    <li>Klik <b>+ Meja</b> untuk menambah satu meja, atau <b>Tambah banyak meja</b> (mis. awalan "A", mulai 1, jumlah 10 → A1–A10).</li>
                    <li>Klik meja untuk mengubah nama, kapasitas, area, atau menghapusnya.</li></ol>
                    ${tip('Meja dengan kapasitas ≥ 6 ditampilkan lebih lebar di denah kasir agar mudah dikenali.')}`
                },
                {
                    title: 'Kategori & stasiun produksi', html: `
                    ${where('Back Office → Menu & Harga → tab "Kategori"')}
                    <p>Setiap kategori punya <b>stasiun produksi default</b>. Saat pesanan dikirim, item otomatis masuk ke tiket stasiun yang sesuai: Makanan → <b>Dapur</b>, Minuman → <b>Bar</b>.</p>
                    <ul><li>Daftar stasiun bisa diubah di <b>Pengaturan → Aturan Kasir → Stasiun produksi</b> (mis. Dapur, Bar, Pastry).</li>
                    <li>Menu tertentu bisa memakai stasiun berbeda dari kategorinya (mis. Croissant → Pastry).</li>
                    <li>Atur <b>urutan</b> dan <b>warna</b> kategori agar mudah dicari kasir.</li></ul>`
                },
                {
                    title: 'Grup modifier & varian', html: `
                    ${where('Back Office → Menu & Harga → tab "Grup Modifier / Varian"')}
                    <p>Satu grup bisa dipakai banyak menu. Aturannya diatur dengan <b>minimal</b> dan <b>maksimal pilih</b>:</p>
                    ${table(['Jenis', 'Min', 'Maks', 'Contoh'], [
                        ['Varian wajib (pilih satu)', '1', '1', 'Ukuran: Regular / Large (+6.000); Suhu: Hot / Ice'],
                        ['Pilihan wajib', '1', '1', 'Level Pedas: Tidak / Sedang / Pedas / Extra (+2.000)'],
                        ['Opsional satu', '0', '1', 'Gula: Normal / Less / No Sugar'],
                        ['Tambahan (banyak)', '0', '3', 'Topping: Telur +5.000, Keju +6.000, Kerupuk +3.000']
                    ])}
                    <p>Setiap pilihan bisa diberi <b>harga tambahan</b> dan <b>pemakaian bahan</b> (mis. Extra Shot memakai 18 gr kopi) agar stok ikut terpotong.</p>`
                },
                {
                    title: 'Membuat menu', html: `
                    ${where('Back Office → Menu & Harga → tab "Menu" → "Menu baru"')}
                    <ol>
                        <li>Isi <b>nama</b>, <b>kategori</b>, <b>harga dasar</b>, SKU (opsional).</li>
                        <li>Pilih <b>stasiun produksi</b> (atau ikuti kategori).</li>
                        <li>Centang <b>grup modifier/varian</b> yang berlaku.</li>
                        <li>Unggah <b>foto</b> (otomatis dikompres ke WebP agar ringan).</li>
                        <li>Isi <b>resep</b> (bahan & takaran per porsi) jika memakai inventori.</li>
                        <li>Centang <b>Kena pajak</b> (matikan untuk barang titipan yang tidak kena pajak) dan <b>Aktif dijual</b>.</li>
                    </ol>
                    ${tip('Menonaktifkan menu tidak menghapus riwayat penjualan. Gunakan "Nonaktifkan" daripada membuat ulang menu.')}`
                },
                {
                    title: 'Harga per outlet & per channel', html: `
                    ${where('Back Office → Menu & Harga → tab "Harga per Outlet"')}
                    <p>Pilih outlet, lalu isi harga khusus outlet tersebut (kosongkan = pakai harga dasar). Matikan <b>Dijual</b> jika menu tidak tersedia di outlet itu.</p>
                    ${where('Back Office → Menu & Harga → tab "Harga per Channel"')}
                    <p>Untuk GoFood/GrabFood/ShopeeFood: harga otomatis dinaikkan sesuai <b>markup %</b> channel (diatur di Pengaturan → Channel). Isi <b>harga khusus</b> jika ingin harga tertentu.</p>
                    <p>Urutan penentuan harga di kasir: <b>harga channel khusus</b> → <b>markup channel</b> dari harga outlet → <b>harga outlet</b> → <b>harga dasar</b>.</p>
                    ${tip('Komisi channel (mis. GoFood 20%) dicatat terpisah, sehingga laporan menunjukkan penjualan neto yang benar-benar Anda terima.')}`
                },
                {
                    title: 'Staff, PIN & akun manager', html: `
                    ${where('Back Office → Staff & Akses → tab "Staff Outlet (PIN)"')}
                    <ol><li>Klik <b>+ Staff</b>, isi nama dan pilih peran (Kasir, Waiter, Manager, Dapur).</li>
                    <li>Buat PIN 4–6 digit (<b>manager wajib 6 digit</b>) dan pilih outlet tempat staff bisa login.</li>
                    <li>Opsional: centang <b>Atur hak akses manual</b> untuk menambah/mengurangi izin tertentu.</li></ol>
                    ${danger('Jangan pernah membagikan PIN manager ke kasir. PIN manager dipakai untuk menyetujui void, diskon besar, dan refund — semuanya tercatat di Audit atas nama manager.')}
                    <p>PIN yang salah 5 kali akan <b>terkunci 5 menit</b>. Staff yang keluar kerja cukup dinonaktifkan (jangan dihapus) agar riwayatnya tetap ada.</p>
                    ${where('Back Office → Staff & Akses → tab "Akun Manajer (email)"')}
                    <p>Buat akun email untuk manager area/outlet yang perlu melihat laporan dari luar outlet. Pilih outlet yang boleh diakses. Sistem memberi <b>password sementara</b> yang harus diganti saat login pertama.</p>`
                },
                {
                    title: 'Memasangkan tablet (pairing)', html: `
                    ${where('Back Office → Perangkat → "Pasangkan perangkat"')}
                    <ol><li>Pilih outlet, jenis (<b>Kasir</b> atau <b>Layar dapur</b>), beri nama (mis. Kasir-01).</li>
                    <li>Muncul <b>kode 6 digit</b> yang berlaku <b>15 menit</b> dan hanya bisa dipakai sekali.</li>
                    <li>Di tablet, buka alamat aplikasi di Chrome → tab <b>Perangkat Outlet</b> → masukkan kode → <b>Pasangkan</b>.</li></ol>
                    ${sim('pairing', 'Pairing perangkat')}
                    ${warn('Tablet hilang/rusak? Segera klik <b>Cabut</b> di daftar perangkat. Tablet tersebut langsung keluar dan tidak bisa mengakses data lagi.')}`
                },
                {
                    title: 'Channel, metode bayar & aturan kasir', html: `
                    ${where('Back Office → Pengaturan')}
                    <ul><li><b>Channel penjualan</b>: aktifkan/nonaktifkan, ubah nama, markup harga, dan komisi. Bisa menambah channel baru (mis. Maxim Food).</li>
                    <li><b>Metode pembayaran</b>: Tunai, QRIS, Debit, Kredit, Transfer, e-wallet, Kompliment, Piutang. Tambahkan metode baru (mis. DANA, EDC Mandiri) dan tandai Tunai/Non-tunai.</li>
                    <li><b>Batas diskon tanpa persetujuan</b>: diskon manual di atas persen ini butuh PIN manager (default 10%).</li>
                    <li><b>Poin pelanggan</b>: aktifkan dan atur 1 poin setiap belanja Rp berapa.</li>
                    <li><b>Backup</b>: unduh seluruh data usaha (JSON) secara berkala.</li></ul>`
                }
            ],
            quiz: [
                { q: 'Masa trial berlaku untuk berapa outlet?', o: ['1 outlet', '5 outlet', 'Tidak terbatas'], a: 0, e: 'Trial dibatasi 1 outlet; paket berbayar dihitung per 5 outlet.' },
                { q: 'Grup "Ukuran: Regular/Large" sebaiknya diatur dengan…', o: ['Min 0, Maks 3', 'Min 1, Maks 1', 'Min 0, Maks 1'], a: 1, e: 'Varian wajib pilih satu = minimal 1, maksimal 1.' },
                { q: 'Kode pairing perangkat berlaku…', o: ['Selamanya', '15 menit dan sekali pakai', '1 hari'], a: 1, e: 'Kode pairing berlaku 15 menit dan hanya untuk satu perangkat.' },
                { q: 'Harga menu Rp 40.000, service 5%, PBJT 10% termasuk service, order dine-in. Total yang ditagih?', o: ['Rp 44.000', 'Rp 46.200', 'Rp 46.000'], a: 1, e: '40.000 + service 2.000 = 42.000; pajak 10% × 42.000 = 4.200; total 46.200.' }
            ]
        },

        // ---------------------------------------------------------------------------------
        {
            id: 'reports', icon: 'fa-chart-line', title: 'Dashboard & laporan', roles: ['owner', 'manager'], minutes: 12,
            desc: 'Memantau semua outlet secara realtime, membaca laporan, dan mencegah kecurangan.',
            lessons: [
                {
                    title: 'Dashboard pusat (semua outlet)', html: `
                    ${where('Back Office → Dashboard')}
                    <ul><li><b>Pilih outlet</b> di kiri atas: "Semua Outlet" atau centang outlet tertentu.</li>
                    <li><b>Pilih periode</b>: Hari ini, Kemarin, 7 hari, 30 hari, Bulan ini, Bulan lalu, atau tanggal sendiri.</li>
                    <li><b>KPI</b>: Penjualan, Transaksi, Rata-rata per transaksi, Tamu, Order terbuka — lengkap dengan perbandingan periode sebelumnya.</li>
                    <li><b>Grafik</b> per jam (1 hari) atau per hari (beberapa hari), ditumpuk per outlet; grafik channel penjualan.</li>
                    <li><b>Performa & status outlet</b>: penjualan, kontribusi, perangkat online, shift buka, kasir aktif, transaksi terakhir. Klik baris untuk fokus ke outlet itu.</li>
                    <li><b>Transaksi terbaru</b> masuk otomatis (badge <b>Live</b>), baris hijau = baru saja.</li></ul>
                    ${tip('Ikon <i class="fas fa-wifi"></i> di samping nomor order artinya transaksi dibuat saat tablet offline dan disinkronkan belakangan.')}`
                },
                {
                    title: 'Transaksi, detail & refund', html: `
                    ${where('Back Office → Transaksi')}
                    <ul><li>Cari berdasarkan nomor order, meja, atau nama pelanggan; filter status & channel.</li>
                    <li>Klik baris untuk melihat <b>detail</b>: item, modifier, void (dicoret + alasan), diskon, pajak, pembayaran, kembalian.</li>
                    <li><b>Cetak</b> salinan struk atau <b>Refund</b> (wajib alasan). Refund tercatat di laporan & audit.</li>
                    <li><b>Export CSV</b> untuk diolah di Excel/Google Sheets.</li></ul>`
                },
                {
                    title: 'Membaca laporan', html: `
                    ${where('Back Office → Laporan')}
                    ${table(['Tab', 'Isi', 'Dipakai untuk'], [
                        ['Penjualan Harian', 'Kotor, diskon, bersih, service, pajak, total, komisi, HPP, refund per tanggal', 'Rekap harian & bulanan'],
                        ['Menu', 'Qty terjual, penjualan, HPP, margin per menu & kategori', 'Menu terlaris / tidak laku'],
                        ['Kasir', 'Transaksi, total, diskon, void, batal, refund per staff', 'Evaluasi & anti-fraud'],
                        ['Shift', 'Modal, penjualan, kas seharusnya vs aktual, selisih', 'Kontrol uang tunai'],
                        ['Pembayaran & Channel', 'Nominal per metode; channel + komisi + neto', 'Rekonsiliasi QRIS/EDC & ojol'],
                        ['Pajak & Service', 'DPP, service, PBJT per tanggal', 'Lapor pajak daerah'],
                        ['Tutup Hari', 'Z-report per outlet per hari', 'Arsip penutupan'],
                        ['Audit', 'Void, refund, diskon, buka laci, selisih kas, harga offline', 'Investigasi'],
                        ['HPP & Margin', 'Biaya resep vs harga jual', 'Menetapkan harga']
                    ])}
                    <p>Semua tab memakai filter outlet & tanggal di header dan punya tombol <b>Export CSV</b>.</p>`
                },
                {
                    title: 'Tanda bahaya (anti-fraud)', html: `
                    <p>Periksa rutin hal-hal berikut di <b>Laporan → Kasir</b> dan <b>Laporan → Audit</b>:</p>
                    <ul><li>Satu kasir dengan <b>void</b> atau <b>batal order</b> jauh lebih banyak dari yang lain.</li>
                    <li><b>Buka laci</b> (no-sale) berulang tanpa alasan jelas.</li>
                    <li><b>Selisih kas</b> negatif berulang pada staff yang sama.</li>
                    <li><b>Diskon manual</b> besar di luar promo.</li>
                    <li><b>Selisih harga (offline)</b>: harga di tablet berbeda dari harga server saat offline — biasanya karena harga baru diubah; pastikan tablet tersinkron.</li>
                    <li><b>Cetak ulang bill</b> berkali-kali untuk meja yang sama.</li></ul>
                    ${tip('Void & diskon besar selalu mencatat siapa yang menyetujui. Pastikan PIN manager tidak diketahui kasir.')}`
                }
            ],
            quiz: [
                { q: 'Di mana melihat selisih uang laci per kasir?', o: ['Laporan → Shift', 'Menu & Harga', 'Perangkat'], a: 0, e: 'Laporan Shift menampilkan kas seharusnya, kas aktual, dan selisih.' },
                { q: 'Ikon wifi kecil di samping nomor order berarti…', o: ['Order dibayar via QRIS', 'Order dibuat saat tablet offline', 'Order dari GoFood'], a: 1, e: 'Transaksi offline disinkronkan belakangan dan ditandai ikon tersebut.' },
                { q: 'Laporan untuk pelaporan pajak daerah adalah…', o: ['Pajak & Service', 'Menu', 'Audit'], a: 0, e: 'Tab Pajak & Service berisi DPP, service, dan PBJT per tanggal.' }
            ]
        },

        // ---------------------------------------------------------------------------------
        {
            id: 'pos-start', icon: 'fa-right-to-bracket', title: 'Kasir: memulai hari', roles: ['cashier', 'manager', 'waiter'], minutes: 8,
            desc: 'Login PIN, buka shift, dan memahami indikator di layar kasir.',
            lessons: [
                {
                    title: 'Login dengan PIN', html: `
                    <ol><li>Buka aplikasi RasaPOS di tablet kasir. Layar gelap <b>"Siapa yang bertugas?"</b> akan muncul.</li>
                    <li>Ketuk <b>nama Anda</b>, lalu masukkan PIN. PIN 6 digit otomatis masuk; PIN 4–5 digit tekan <kbd>✓</kbd>.</li>
                    <li>Jika PIN salah 5 kali, PIN terkunci 5 menit — minta bantuan manager.</li></ol>
                    ${sim('pin', 'Login PIN (nama: Rina, PIN: 1234)')}
                    ${tip('Saat internet putus, login PIN tetap bisa (diverifikasi di tablet). Setelah internet kembali, muncul banner kuning — ketuk dan masukkan PIN sekali lagi agar transaksi tersinkron.')}`
                },
                {
                    title: 'Membuka shift', html: `
                    <p>Setelah login, kasir diminta <b>membuka shift</b>. Hitung uang tunai di laci, lalu masukkan sebagai <b>modal awal</b>.</p>
                    <ul><li>Gunakan tombol cepat (Rp 200.000 / 300.000 / 500.000) atau ketik nominal.</li>
                    <li>Tombol <b>Nanti</b> boleh dipakai, tetapi pembayaran tidak bisa diterima sebelum shift dibuka.</li>
                    <li>Satu tablet = satu shift terbuka. Ganti kasir di tengah hari? Tutup shift lama dulu, lalu kasir baru membuka shift sendiri.</li></ul>
                    ${sim('shiftopen', 'Buka shift dengan modal Rp 500.000')}`
                },
                {
                    title: 'Mengenal layar kasir', html: `
                    <p>Layar kasir punya 3 tab di atas:</p>
                    <ul><li><b><i class="fas fa-cash-register"></i> Kasir</b> — kategori (kiri), grid menu (tengah), keranjang (kanan).</li>
                    <li><b><i class="fas fa-chair"></i> Meja</b> — denah meja & status.</li>
                    <li><b><i class="fas fa-receipt"></i> Order</b> — order terbuka & riwayat transaksi hari ini (angka oranye = jumlah order terbuka).</li></ul>
                    <h3>Indikator di kanan atas</h3>
                    ${table(['Tampilan', 'Arti', 'Yang perlu dilakukan'], [
                        ['<span class="badge bg-emerald-50 text-emerald-700">● Online</span>', 'Terhubung & semua data terkirim', 'Tidak ada'],
                        ['<span class="badge bg-amber-50 text-amber-700">● Sinkron 3</span>', 'Sedang mengirim 3 data', 'Tunggu sebentar'],
                        ['<span class="badge bg-red-50 text-red-600">Offline · 5 tertunda</span>', 'Internet putus, 5 data tersimpan di tablet', 'Tetap layani pelanggan; jangan hapus data browser'],
                        ['<span class="badge bg-red-50 text-red-600">Printer error</span>', 'Gagal mencetak', 'Cek printer, ketuk badge untuk pengaturan'],
                        ['<span class="badge bg-stone-100">Shift 08.00</span>', 'Shift dibuka jam 08.00', 'Ketuk untuk kas masuk/keluar & tutup shift']
                    ])}
                    <h3>Menu nama Anda (kanan atas)</h3>
                    <p>Shift & kas · Riwayat transaksi · Menu habis hari ini · Tutup hari (manager) · Sinkronisasi · Pengaturan perangkat · <b>Kunci / ganti staff</b>.</p>
                    ${warn('Selalu <b>Kunci</b> layar saat meninggalkan kasir, agar orang lain tidak bertransaksi atas nama Anda.')}`
                }
            ],
            quiz: [
                { q: 'Badge "Offline · 5 tertunda" muncul. Apa yang Anda lakukan?', o: ['Berhenti melayani sampai internet kembali', 'Tetap melayani; data tersimpan dan terkirim otomatis', 'Hapus data browser lalu login ulang'], a: 1, e: 'Kasir tetap berjalan offline. Jangan pernah menghapus data browser selama ada data tertunda.' },
                { q: 'Kenapa harus membuka shift?', o: ['Agar menu muncul', 'Agar pembayaran bisa diterima dan uang laci bisa dicocokkan', 'Agar printer menyala'], a: 1, e: 'Shift mencatat modal dan semua uang tunai sehingga selisih kas bisa dihitung.' }
            ]
        },

        // ---------------------------------------------------------------------------------
        {
            id: 'pos-order', icon: 'fa-utensils', title: 'Kasir: membuat pesanan', roles: ['cashier', 'waiter', 'manager'], minutes: 15,
            desc: 'Channel, meja, menu, varian, catatan, kirim ke dapur, dan open bill.',
            lessons: [
                {
                    title: 'Pilih channel & meja', html: `
                    <ol><li>Di keranjang, pilih <b>channel</b>: Dine-in, Take Away, GoFood, GrabFood, dll.</li>
                    <li><b>Dine-in</b>: ketuk <b>Pilih meja</b> dan atur jumlah tamu dengan tombol − / +. Service charge otomatis berlaku.</li>
                    <li><b>Take away / online</b>: isi <b>nama pemesan atau nomor antrean</b> (mis. "GF-123 Andi").</li></ol>
                    ${tip('Channel hanya bisa diganti selama keranjang masih kosong, karena harga tiap channel bisa berbeda. Jika salah, batalkan order lalu buat baru.')}`
                },
                {
                    title: 'Menambah menu, varian & catatan', html: `
                    <ul><li>Ketuk kategori di kiri atau cari nama menu.</li>
                    <li>Menu tanpa pilihan langsung masuk keranjang. Ketuk lagi untuk menambah jumlah.</li>
                    <li>Menu dengan ikon <i class="fas fa-sliders text-stone-400"></i> membuka jendela pilihan: varian <span class="badge bg-red-50 text-red-600">Wajib</span> harus dipilih, tambahan <span class="badge bg-stone-100">Opsional</span> boleh dilewati.</li>
                    <li>Tulis <b>catatan item</b> (mis. "tanpa bawang", "es dipisah") — catatan tercetak tebal di tiket dapur.</li>
                    <li>Menu berlabel <span class="badge bg-red-500 text-white">HABIS</span> tidak bisa dipesan. Kasir/manager bisa menandai menu habis lewat menu nama → <b>Menu habis hari ini</b> (otomatis tersedia lagi besok).</li>
                    <li>Butuh item di luar menu? Tombol <b>Custom</b> untuk item dengan nama & harga bebas (tercatat di audit).</li></ul>
                    ${sim('order', 'Membuat pesanan dine-in')}`
                },
                {
                    title: 'Kirim ke dapur', html: `
                    <p>Item di keranjang berwarna <b class="text-brand-600">oranye "Baru"</b> belum diketahui dapur. Tekan <b>Kirim</b> untuk mengirimnya.</p>
                    <ul><li>Tiket otomatis dipecah per stasiun: makanan ke <b>Dapur</b>, minuman ke <b>Bar</b>.</li>
                    <li>Item berubah menjadi <b class="text-emerald-600">✓✓ Terkirim</b>.</li>
                    <li>Pesanan susulan untuk meja yang sama → tambah item → Kirim lagi. Tiket kedua ditandai <b>(tambahan)</b> di dapur.</li>
                    <li><b>Tahan item</b>: ketuk item baru → <b>Tahan (kirim nanti)</b>, mis. main course ditahan sampai appetizer habis. Lepas tahan lalu Kirim saat siap.</li>
                    <li>Jika langsung dibayar tanpa Kirim, item tetap dikirim ke dapur saat pembayaran.</li></ul>
                    ${warn('Sebelum dikirim, item bisa diubah/dihapus bebas. Setelah dikirim, perubahan harus lewat <b>void</b> (lihat modul Koreksi pesanan).')}`
                },
                {
                    title: 'Open bill & order terbuka', html: `
                    <ul><li>Order dine-in biasanya tetap <b>terbuka</b> sampai tamu minta bill.</li>
                    <li>Tombol <b>+ Baru</b> di keranjang memulai order lain; order sebelumnya tetap tersimpan.</li>
                    <li>Lihat semua order terbuka di tab <b>Order</b> atau di denah <b>Meja</b>. Ketuk untuk melanjutkan.</li>
                    <li>Order terbuka terlihat di <b>semua tablet</b> outlet yang sama (realtime), sehingga waiter & kasir bisa bekerja bersama.</li>
                    <li><b>Waiter</b> tidak punya tombol Bayar; tombolnya <b>Selesai</b> (mengirim item baru lalu kembali ke denah meja).</li></ul>`
                },
                {
                    title: 'Pelanggan & member', html: `
                    <ul><li>Ketuk kolom <b>Pelanggan</b> di keranjang.</li>
                    <li>Saat online: cari nama/no. HP member, atau <b>Daftarkan pelanggan baru</b> agar mendapat poin.</li>
                    <li>Saat offline: cukup ketik nama pemesan (pencarian member butuh internet).</li>
                    <li>Poin ditambahkan otomatis setelah pembayaran dan tertera di struk.</li></ul>`
                }
            ],
            quiz: [
                { q: 'Item berlabel "Baru" artinya…', o: ['Item belum dikirim ke dapur', 'Menu baru minggu ini', 'Item sudah dibayar'], a: 0, e: 'Item baru belum diterima dapur sampai Anda menekan Kirim.' },
                { q: 'Kopi dan nasi goreng dikirim bersamaan. Berapa tiket yang muncul di dapur?', o: ['1 tiket gabungan', '2 tiket (Bar & Dapur)', 'Tidak ada tiket'], a: 1, e: 'Tiket dipecah otomatis per stasiun produksi.' },
                { q: 'Pelanggan GoFood memesan, tetapi kasir memilih channel Dine-in dan sudah menambah item. Apa yang dilakukan?', o: ['Ganti channel di keranjang', 'Batalkan order lalu buat order baru dengan channel GoFood', 'Biarkan saja'], a: 1, e: 'Channel terkunci setelah ada item karena harganya berbeda; buat order baru.' }
            ]
        },

        // ---------------------------------------------------------------------------------
        {
            id: 'pos-pay', icon: 'fa-wallet', title: 'Kasir: pembayaran', roles: ['cashier', 'manager'], minutes: 12,
            desc: 'Tunai, QRIS, split payment, pembulatan, kembalian, struk, dan pre-bill.',
            lessons: [
                {
                    title: 'Alur pembayaran', html: `
                    <ol><li>Tekan <b>Bayar</b> di keranjang (atau di detail meja).</li>
                    <li><b>Promo otomatis</b> (mis. Happy Hour) langsung diterapkan jika syaratnya terpenuhi.</li>
                    <li>Pilih <b>metode</b>: Tunai, QRIS, Debit, dll.</li>
                    <li>Masukkan nominal dengan numpad, atau tombol cepat: <b>Uang pas</b>, 50.000, 100.000, …</li>
                    <li>Tekan <b>Selesaikan</b>. Layar menampilkan <b>kembalian</b> besar dan pratinjau struk.</li></ol>
                    ${tip('Untuk metode non-tunai, nominal otomatis terisi sisa tagihan. Ketikan pertama Anda <b>mengganti</b> nominal tersebut.')}`
                },
                {
                    title: 'Pembulatan tunai', html: `
                    <p>Pembulatan (mis. ke Rp 100) <b>hanya</b> diterapkan untuk bagian yang dibayar tunai:</p>
                    <ul><li>Total Rp 103.950 bayar tunai → ditagih <b>Rp 104.000</b> (pembulatan +50).</li>
                    <li>Total Rp 103.950 bayar QRIS → ditagih <b>Rp 103.950</b> persis.</li>
                    <li>Split: QRIS 50.000 + sisa tunai → sisa Rp 53.950 dibulatkan menjadi Rp 54.000.</li></ul>
                    <p>Pembulatan tercetak di struk dan tercatat di laporan.</p>`
                },
                {
                    title: 'Split payment', html: `
                    <ol><li>Pilih metode pertama (mis. QRIS), ketik nominal, tekan <b>Split payment</b>.</li>
                    <li>Baris pembayaran muncul di kiri. Pilih metode berikutnya (mis. Tunai) untuk sisanya.</li>
                    <li>Tekan <b>Selesaikan</b> saat sisa = 0.</li></ol>
                    ${danger('Tunai tidak bisa ditambahkan jika pembayaran non-tunai sudah melunasi seluruh tagihan. Hapus baris yang salah dengan tanda ✕.')}
                    ${sim('pay', 'Pembayaran split')}`
                },
                {
                    title: 'Struk, WhatsApp & pre-bill', html: `
                    <ul><li>Dengan printer thermal tersambung, struk <b>tercetak otomatis</b> dan laci kas terbuka (jika ada pembayaran tunai).</li>
                    <li>Tombol <b>Cetak</b> untuk salinan, <b>WhatsApp</b> untuk mengirim struk teks ke pelanggan.</li>
                    <li><b>Pre-bill</b> (bill sementara untuk tamu dine-in): tab Meja → pilih meja → <b>Pre-bill</b>, atau keranjang → Lainnya → Cetak pre-bill. Meja berubah status menjadi <span class="badge bg-red-50 text-red-600">Minta bill</span>.</li>
                    <li>Cetak ulang struk lama: menu nama → <b>Riwayat transaksi</b> → ikon printer.</li></ul>`
                }
            ],
            quiz: [
                { q: 'Total Rp 103.950, pelanggan bayar QRIS. Berapa yang ditagih?', o: ['Rp 104.000', 'Rp 103.950', 'Rp 103.900'], a: 1, e: 'Pembulatan hanya untuk tunai; non-tunai ditagih persis.' },
                { q: 'Total Rp 48.400. QRIS Rp 20.000, sisanya tunai uang pas (pembulatan Rp 100). Berapa tunainya?', o: ['Rp 28.400', 'Rp 28.500', 'Rp 30.000'], a: 0, e: 'Sisa Rp 28.400 sudah kelipatan 100, jadi tidak ada pembulatan.' }
            ]
        },

        // ---------------------------------------------------------------------------------
        {
            id: 'pos-fix', icon: 'fa-pen-to-square', title: 'Koreksi pesanan', roles: ['cashier', 'waiter', 'manager'], minutes: 10,
            desc: 'Hapus vs void, persetujuan manager, diskon, batal order, refund.',
            lessons: [
                {
                    title: 'Hapus atau void?', html: `
                    ${table(['Status item', 'Cara koreksi', 'Butuh persetujuan?'], [
                        ['<span class="text-brand-600 font-semibold">Baru</span> (belum dikirim)', 'Tombol − / tempat sampah, atau ketuk item → Hapus / ubah catatan', 'Tidak'],
                        ['<span class="text-emerald-600 font-semibold">Terkirim</span> (sudah di dapur)', 'Ketuk item → <b>Void item</b> → jumlah & alasan', 'Ya — PIN manager (kecuali Anda manager)']
                    ])}
                    <p>Void sebagian: item 3× bisa di-void 1× saja. Item yang di-void tetap terlihat dicoret, dan tiket di dapur ditandai dibatalkan.</p>
                    ${sim('void', 'Void item yang sudah dikirim (PIN manager: 111111)')}`
                },
                {
                    title: 'Diskon', html: `
                    <ul><li>Ketuk <b>Diskon</b> di keranjang: pilih promo manual, diskon cepat (5/10/15/20%), atau isi persen/nominal sendiri.</li>
                    <li>Diskon di atas batas (default 10%) atau diskon nominal butuh <b>PIN manager</b>.</li>
                    <li>Diskon per item: ketuk item baru → <b>Diskon item</b>.</li>
                    <li>Hapus diskon dengan tombol <b>Hapus diskon</b>.</li></ul>`
                },
                {
                    title: 'Batalkan order', html: `
                    <ol><li>Keranjang → <b>Lainnya</b> → <b>Batalkan order</b>.</li>
                    <li>Isi alasan (wajib).</li>
                    <li>Jika sudah ada item terkirim, butuh PIN manager.</li></ol>
                    <p>Order batal tercatat di laporan Kasir dan Audit.</p>`
                },
                {
                    title: 'Refund', html: `
                    <ol><li>Menu nama → <b>Riwayat transaksi</b> → tombol <b>Refund</b> pada transaksi lunas (atau dari Back Office → Transaksi).</li>
                    <li>Isi alasan, lalu persetujuan manager.</li>
                    <li>Kembalikan uang ke pelanggan. Jika dibayar tunai, refund mengurangi kas seharusnya di shift berjalan.</li></ol>
                    ${warn('Refund hanya bisa dilakukan saat <b>online</b>.')}`
                }
            ],
            quiz: [
                { q: 'Item belum dikirim ke dapur dan pelanggan membatalkannya. Apa yang dilakukan?', o: ['Void dengan PIN manager', 'Hapus langsung dari keranjang', 'Refund'], a: 1, e: 'Item yang belum dikirim bisa dihapus tanpa persetujuan.' },
                { q: 'Kasir memberi diskon 20% (batas 10%). Apa yang terjadi?', o: ['Langsung diterapkan', 'Butuh PIN manager', 'Tidak bisa sama sekali'], a: 1, e: 'Diskon di atas batas butuh persetujuan manager dan tercatat di audit.' }
            ]
        },

        // ---------------------------------------------------------------------------------
        {
            id: 'tables', icon: 'fa-chair', title: 'Manajemen meja', roles: ['cashier', 'waiter', 'manager'], minutes: 8,
            desc: 'Status meja, buka meja, pindah, gabung, split bill, bersihkan meja.',
            lessons: [
                {
                    title: 'Arti warna meja', html: `
                    ${sim('tables', 'Kenali status meja')}`
                },
                {
                    title: 'Buka meja & tambah pesanan', html: `
                    <ol><li>Tab <b>Meja</b> → ketuk meja kosong → pilih <b>jumlah tamu</b>.</li>
                    <li>Layar kasir terbuka dengan meja & tamu terisi. Tambah menu → Kirim.</li>
                    <li>Pesanan susulan: ketuk meja → <b>Tambah</b>.</li></ol>
                    ${tip('Timer di kartu meja menunjukkan lama tamu duduk. Lebih dari 60 menit ditandai merah.')}`
                },
                {
                    title: 'Pindah, gabung, split bill', html: `
                    ${table(['Aksi', 'Kapan dipakai', 'Caranya'], [
                        ['<b>Pindah</b>', 'Tamu pindah ke meja lain', 'Meja → Pindah → pilih meja kosong'],
                        ['<b>Gabung</b>', 'Dua meja jadi satu tagihan', 'Meja tujuan → Gabung → pilih bill yang digabung'],
                        ['<b>Split</b>', 'Tamu bayar sendiri-sendiri', 'Meja → Split → pilih item & jumlah → bill baru langsung bisa dibayar']
                    ])}
                    ${warn('Pindah, gabung, dan split hanya bisa saat <b>online</b>, agar semua tablet melihat data yang sama.')}`
                },
                {
                    title: 'Setelah tamu pulang', html: `
                    <p>Setelah dibayar, meja berstatus <b>Perlu dibersihkan</b>. Setelah dibersihkan, ketuk meja → <b>Tandai sudah bersih</b>. Membuka order baru di meja tersebut juga otomatis menandainya bersih.</p>`
                }
            ],
            quiz: [
                { q: 'Meja berkedip merah artinya…', o: ['Tamu minta bill (pre-bill dicetak)', 'Meja rusak', 'Meja kosong'], a: 0, e: 'Status "Minta bill" muncul setelah pre-bill dicetak.' },
                { q: 'Dua keluarga di meja A3 ingin membayar sendiri-sendiri. Fitur yang dipakai?', o: ['Pindah meja', 'Gabung', 'Split bill'], a: 2, e: 'Split bill memindahkan item tertentu ke bill baru.' }
            ]
        },

        // ---------------------------------------------------------------------------------
        {
            id: 'shift', icon: 'fa-cash-register', title: 'Shift, kas & tutup hari', roles: ['cashier', 'manager'], minutes: 10,
            desc: 'Kas masuk/keluar, buka laci, X-report, tutup shift, Z-report.',
            lessons: [
                {
                    title: 'Kas masuk, kas keluar, buka laci', html: `
                    ${where('Badge Shift di kanan atas, atau menu nama → Shift & kas')}
                    <ul><li><b>Kas masuk</b>: menambah uang ke laci di luar penjualan (mis. tambahan uang kecil dari manager).</li>
                    <li><b>Kas keluar</b>: mengambil uang untuk keperluan operasional (mis. beli es batu) — wajib keterangan.</li>
                    <li><b>Buka laci</b> tanpa transaksi (mis. tukar uang): wajib alasan, tercatat di audit.</li>
                    <li><b>Cetak X-report</b>: ringkasan shift berjalan tanpa menutup shift.</li></ul>`
                },
                {
                    title: 'Tutup shift', html: `
                    <ol><li>Buka <b>Shift & kas</b> → <b>Tutup shift</b> (butuh online).</li>
                    <li>Hitung uang fisik di laci, ketik di <b>Kas aktual</b>.</li>
                    <li>Sistem membandingkan dengan <b>kas seharusnya</b> dan menampilkan <b>selisih</b>.</li>
                    <li>Cetak laporan shift; layar terkunci untuk kasir berikutnya.</li></ol>
                    <p><b>Kas seharusnya</b> = modal awal + penjualan tunai (setelah kembalian) + kas masuk − kas keluar − refund tunai.</p>
                    ${sim('shiftclose', 'Hitung kas seharusnya & selisih')}
                    ${tip('Order terbuka tidak harus dibayar sebelum tutup shift; order tersebut bisa dibayar di shift berikutnya.')}`
                },
                {
                    title: 'Tutup hari (Z-report)', html: `
                    ${where('Menu nama → Tutup hari (khusus manager)')}
                    <p>Syarat tutup hari:</p>
                    <ul><li>Tidak ada <b>order terbuka</b> untuk hari bisnis tersebut.</li>
                    <li>Semua <b>shift sudah ditutup</b>.</li>
                    <li>Tablet <b>online</b>.</li></ul>
                    <p>Z-report berisi total transaksi, penjualan kotor/bersih, diskon, service, pajak, pembayaran per metode, menu terlaris, dan rekap shift. Tiket dapur yang tersisa otomatis dituntaskan.</p>`
                }
            ],
            quiz: [
                { q: 'Modal 500.000, penjualan tunai 300.000, kas keluar 20.000. Kas seharusnya?', o: ['Rp 780.000', 'Rp 800.000', 'Rp 820.000'], a: 0, e: '500.000 + 300.000 − 20.000 = 780.000.' },
                { q: 'Tutup hari gagal dengan pesan "Masih ada shift terbuka". Apa yang dilakukan?', o: ['Tutup semua shift dulu', 'Coba lagi besok', 'Cabut perangkat'], a: 0, e: 'Semua shift harus ditutup sebelum tutup hari.' }
            ]
        },

        // ---------------------------------------------------------------------------------
        {
            id: 'kds', icon: 'fa-fire-burner', title: 'Layar dapur (KDS)', roles: ['kitchen', 'manager'], minutes: 8,
            desc: 'Membaca tiket, timer, Mulai/Siap, pesanan tambahan, riwayat.',
            lessons: [
                {
                    title: 'Memulai layar dapur', html: `
                    <ol><li>Pasangkan tablet sebagai <b>Layar dapur</b> (kode dari Back Office → Perangkat).</li>
                    <li>Setiap kali dibuka, ketuk layar <b>"Ketuk untuk mulai"</b> agar suara notifikasi aktif dan layar tetap menyala.</li>
                    <li>Pilih stasiun di atas: <b>Semua</b>, Dapur, Bar, atau Pastry. Pilihan diingat tablet.</li>
                    <li>Gunakan tombol <i class="fas fa-expand"></i> untuk layar penuh.</li></ol>
                    ${tip('Badge <b>Live</b> hijau berarti tiket baru akan muncul otomatis. Jika Offline, layar memuat ulang tiket setiap 30 detik setelah internet kembali.')}`
                },
                {
                    title: 'Membaca & menyelesaikan tiket', html: `
                    <ul><li>Judul tiket: <b>Meja A3</b> atau nomor order + nama pemesan (take away/online).</li>
                    <li>Warna header: <span class="badge bg-emerald-600 text-white">hijau</span> &lt; 10 menit, <span class="badge bg-amber-500 text-white">kuning</span> 10–20 menit, <span class="badge bg-red-600 text-white">merah berkedip</span> &gt; 20 menit.</li>
                    <li>Catatan pelanggan tampil <b class="text-amber-600">kuning</b> — baca sebelum memasak!</li>
                    <li>Ketuk item untuk mencentang yang sudah jadi.</li>
                    <li><b>Mulai</b> → tiket berstatus diproses; <b>Siap</b> → tiket hilang dari layar & kasir/waiter mendapat notifikasi "siap diantar".</li>
                    <li>Label <b>PESANAN TAMBAHAN</b> = pesanan susulan untuk meja yang sama.</li>
                    <li>Item yang di-void muncul di bawah tiket sebagai <b class="text-red-500">Dibatalkan</b> — jangan dibuat.</li>
                    <li><b>Riwayat</b>: tiket selesai 3 jam terakhir; <b>Panggil ulang</b> jika ditandai siap tidak sengaja.</li></ul>
                    ${sim('kds', 'Mengelola tiket dapur')}`
                },
                {
                    title: 'Printer dapur', html: `
                    <p>Jika dapur memakai printer (tanpa atau bersama layar):</p>
                    <ul><li><b>Di layar dapur</b>: ⚙️ → centang <b>Cetak otomatis setiap tiket baru</b> → sambungkan printer.</li>
                    <li><b>Di tablet kasir</b>: Pengaturan perangkat → Tiket dapur: <b>Cetak saat kirim dari perangkat ini</b> (berfungsi juga saat offline) atau <b>Cetak semua tiket outlet</b>.</li></ul>`
                }
            ],
            quiz: [
                { q: 'Tiket berwarna merah berkedip artinya…', o: ['Pesanan dibatalkan', 'Pesanan menunggu lebih dari 20 menit', 'Pesanan VIP'], a: 1, e: 'Merah berkedip menandakan tiket sudah lebih dari 20 menit.' },
                { q: 'Setelah membuka layar dapur, apa yang harus dilakukan agar suara notifikasi berbunyi?', o: ['Tidak perlu apa-apa', 'Ketuk layar "Ketuk untuk mulai"', 'Restart tablet'], a: 1, e: 'Browser mewajibkan satu ketukan sebelum suara boleh diputar.' }
            ]
        },

        // ---------------------------------------------------------------------------------
        {
            id: 'offline', icon: 'fa-wifi', title: 'Mode offline', roles: ['owner', 'manager', 'cashier', 'waiter'], minutes: 7,
            desc: 'Apa yang tetap berjalan saat internet putus dan apa yang harus dihindari.',
            lessons: [
                {
                    title: 'Yang tetap bisa & tidak bisa', html: `
                    ${table(['Tetap bisa saat offline', 'Butuh online'], [
                        ['Login PIN staff', 'Pindah / gabung / split meja'],
                        ['Buka shift, kas masuk/keluar', 'Tutup shift & tutup hari'],
                        ['Membuat order, varian, catatan, diskon', 'Refund'],
                        ['Kirim dapur (tiket dicetak jika printer diatur "cetak saat kirim")', 'Cari/daftar member pelanggan'],
                        ['Pembayaran semua metode & cetak struk', 'Tiket muncul di layar dapur perangkat lain'],
                        ['Void (PIN manager dicek di tablet)', 'Perubahan menu dari Back Office']
                    ])}
                    ${sim('offline', 'Offline lalu online kembali')}`
                },
                {
                    title: 'Aturan emas saat offline', html: `
                    ${danger('<b>JANGAN</b> menghapus data browser/Chrome, uninstall aplikasi, atau "Lepas pasangan perangkat" selama ada data <b>tertunda</b>. Data yang belum terkirim akan hilang.')}
                    <ul><li>Tablet yang offline tetap memakai menu & harga terakhir yang tersimpan. Jika harga diubah saat itu, selisihnya dicatat di Audit.</li>
                    <li>Saat internet kembali, data terkirim otomatis (lihat badge "Sinkron …"). Bisa dipaksa lewat menu nama → <b>Sinkronisasi</b> → <b>Sinkron sekarang</b>.</li>
                    <li>Jika login dilakukan saat offline, setelah online muncul <b>banner kuning</b> — ketuk & masukkan PIN lagi.</li>
                    <li>Transaksi offline ditandai ikon wifi di Back Office.</li></ul>`
                }
            ],
            quiz: [
                { q: 'Ada 7 data tertunda dan tablet lambat. Bolehkah menghapus data browser?', o: ['Boleh', 'Tidak boleh — 7 transaksi akan hilang', 'Boleh jika sudah tutup shift'], a: 1, e: 'Data tertunda hanya ada di tablet itu sampai terkirim.' },
                { q: 'Saat offline, fitur mana yang TIDAK bisa dipakai?', o: ['Pembayaran tunai', 'Split bill', 'Kirim dapur'], a: 1, e: 'Pindah, gabung, dan split meja butuh online.' }
            ]
        },

        // ---------------------------------------------------------------------------------
        {
            id: 'printer', icon: 'fa-print', title: 'Printer & tablet', roles: ['owner', 'manager', 'cashier'], minutes: 10,
            desc: 'Menyambungkan printer Bluetooth, laci kas, dan mengatasi masalah cetak.',
            lessons: [
                {
                    title: 'Menyambungkan printer Bluetooth', html: `
                    <ol><li>Nyalakan printer. Di <b>Pengaturan Android → Bluetooth</b>, pasangkan printer (PIN biasanya <kbd>0000</kbd> atau <kbd>1234</kbd>).</li>
                    <li>Di kasir: menu nama → <b>Pengaturan perangkat</b>.</li>
                    <li>Pilih cara cetak <b>Bluetooth / USB (Web Serial)</b> → tekan <b>Pilih printer (Serial)</b> → pilih nama printer → izinkan.</li>
                    <li>Atur <b>lebar kertas</b> (58 / 80 mm), centang <b>Cetak struk otomatis</b> dan <b>Buka laci kas</b>.</li>
                    <li>Tekan <b>Tes cetak</b>.</li></ol>
                    ${table(['Cara cetak', 'Kapan dipakai'], [
                        ['<b>Web Serial</b> (disarankan)', 'Printer thermal Bluetooth biasa di Chrome Android ≥ 138'],
                        ['<b>Bluetooth BLE</b>', 'Printer khusus BLE (tertulis "BLE" di spesifikasi)'],
                        ['<b>RawBT</b>', 'Chrome lama / printer bermasalah; pasang aplikasi RawBT dari Play Store'],
                        ['<b>Print browser</b>', 'Laptop/PC dengan printer terinstal; muncul dialog print setiap kali']
                    ])}`
                },
                {
                    title: 'Masalah cetak & solusinya', html: `
                    ${table(['Masalah', 'Solusi'], [
                        ['Badge "Printer error"', 'Cek printer menyala & kertas ada, lalu Pengaturan perangkat → Cetak ulang (job yang gagal tidak hilang)'],
                        ['Tombol Pilih printer tidak bisa ditekan', 'Browser tidak mendukung Web Serial: perbarui Chrome atau pakai RawBT'],
                        ['Printer tidak muncul di daftar', 'Pastikan sudah dipasangkan di Bluetooth Android & tidak sedang tersambung ke HP/aplikasi lain'],
                        ['Huruf kacau / terpotong', 'Sesuaikan lebar kertas 58/80 mm'],
                        ['Struk keluar tapi laci tidak terbuka', 'Centang "Buka laci kas"; pastikan kabel laci ke printer (RJ11)'],
                        ['Satu printer dipakai 2 tablet', 'Tidak bisa; satu printer Bluetooth hanya untuk satu tablet']
                    ])}
                    ${tip('Tablet kasir sebaiknya selalu dicas dan layar tidak mati otomatis. Aplikasi menjaga layar tetap menyala selama terbuka.')}`
                }
            ],
            quiz: [
                { q: 'Cara cetak yang disarankan untuk printer thermal Bluetooth biasa di Chrome Android terbaru?', o: ['Print browser', 'Web Serial', 'Email'], a: 1, e: 'Web Serial mendukung Bluetooth Classic yang dipakai mayoritas printer thermal.' }
            ]
        },

        // ---------------------------------------------------------------------------------
        {
            id: 'inventory', icon: 'fa-boxes-stacked', title: 'Inventori & resep', roles: ['owner', 'manager'], minutes: 10,
            desc: 'Bahan baku, resep, pembelian, waste, opname, transfer, HPP.',
            lessons: [
                {
                    title: 'Bahan baku & resep', html: `
                    ${where('Back Office → Inventori → Bahan Baku')}
                    <ul><li>Tambah bahan dengan <b>satuan pakai</b> (gr, ml, pcs…) dan <b>stok minimum</b>.</li>
                    <li>Atur resep di <b>Menu & Harga → Menu</b> (takaran per porsi) dan di opsi modifier (mis. Extra Shot).</li>
                    <li>Setiap transaksi lunas otomatis <b>memotong stok outlet</b> sesuai resep.</li></ul>
                    ${tip('Stok boleh minus agar penjualan tidak terhambat. Stok minus adalah tanda resep perlu dicek atau perlu stok opname.')}`
                },
                {
                    title: 'Mutasi stok', html: `
                    ${where('Back Office → Inventori → Stok (pilih outlet di header)')}
                    ${table(['Tombol', 'Fungsi'], [
                        ['<b>Pembelian</b>', 'Stok masuk dari supplier; isi harga per satuan → harga rata-rata bahan diperbarui otomatis'],
                        ['<b>Opname</b>', 'Isi stok hasil hitung fisik; selisih dicatat otomatis'],
                        ['<b>Waste</b>', 'Bahan rusak/terbuang'],
                        ['<b>Transfer</b>', 'Kirim bahan ke outlet lain (stok berkurang di asal, bertambah di tujuan)']
                    ])}
                    <p>Semua mutasi tercatat di tab <b>Riwayat Mutasi</b> (90 hari) dan bisa diekspor CSV.</p>`
                },
                {
                    title: 'HPP & margin', html: `
                    ${where('Back Office → Laporan → HPP & Margin')}
                    <p>HPP per menu = jumlah (takaran bahan × harga rata-rata bahan). Margin di bawah 50% ditandai merah sebagai sinyal untuk meninjau harga atau resep.</p>`
                }
            ],
            quiz: [
                { q: 'Hasil hitung fisik beras 4.200 gr, di sistem 4.600 gr. Gunakan…', o: ['Pembelian', 'Stok opname', 'Transfer'], a: 1, e: 'Stok opname menyesuaikan stok ke hasil hitung fisik dan mencatat selisihnya.' }
            ]
        },

        // ---------------------------------------------------------------------------------
        {
            id: 'promo', icon: 'fa-tags', title: 'Promo & pelanggan', roles: ['owner', 'manager', 'cashier'], minutes: 6,
            desc: 'Promo otomatis/manual, jadwal, dan poin pelanggan.',
            lessons: [
                {
                    title: 'Membuat promo', html: `
                    ${where('Back Office → Promo & Pelanggan → Promo')}
                    <ul><li><b>Jenis</b>: persen atau nominal; <b>minimal belanja</b>.</li>
                    <li><b>Jadwal</b>: hari (Sen–Min), jam (mis. 14:00–17:00), tanggal mulai/selesai.</li>
                    <li><b>Berlaku di</b>: outlet & channel tertentu (kosong = semua).</li>
                    <li><b>Otomatis</b>: diterapkan sendiri saat kasir membuka pembayaran (diskon terbesar dipilih). <b>Manual</b>: kasir memilih dari tombol Diskon.</li></ul>
                    ${tip('Promo dari daftar tidak butuh persetujuan manager, karena sudah disetujui pemilik saat dibuat.')}`
                },
                {
                    title: 'Poin pelanggan', html: `
                    <ul><li>Aktifkan di <b>Pengaturan → Aturan Kasir → Poin pelanggan</b>, atur 1 poin setiap Rp berapa.</li>
                    <li>Pilih pelanggan di keranjang sebelum bayar; poin bertambah otomatis dan tercetak di struk.</li>
                    <li>Daftar pelanggan, kunjungan, total belanja, dan poin ada di <b>Promo & Pelanggan → Pelanggan</b>.</li></ul>`
                }
            ],
            quiz: [
                { q: 'Promo "Happy Hour 15%" diset otomatis jam 14:00–17:00. Pukul 15:00 kasir membuka pembayaran. Apa yang terjadi?', o: ['Kasir harus memilih promo', 'Promo langsung diterapkan jika syarat terpenuhi', 'Butuh PIN manager'], a: 1, e: 'Promo otomatis diterapkan saat pembayaran dibuka.' }
            ]
        },

        // ---------------------------------------------------------------------------------
        {
            id: 'faq', icon: 'fa-circle-question', title: 'FAQ & pemecahan masalah', roles: ['owner', 'manager', 'cashier', 'waiter', 'kitchen'], minutes: 6,
            desc: 'Pertanyaan yang sering muncul di lapangan.', noQuiz: true,
            lessons: [{ title: 'Pertanyaan umum', html: '<div data-faq></div>' }]
        }
    ];

    const FAQ = [
        ['Lupa PIN', 'Minta manager/pemilik mengganti PIN di Back Office → Staff & Akses → edit staff → isi PIN baru.'],
        ['"PIN terkunci sementara"', 'PIN salah 5 kali. Tunggu 5 menit, atau minta pemilik mengatur ulang PIN.'],
        ['Lupa password Back Office', 'Halaman login → Lupa password. Jika email tidak masuk, minta pemilik (untuk akun manager) atau admin RasaPOS mereset password.'],
        ['Menu baru tidak muncul di kasir', 'Tablet memuat ulang data setiap 10 menit. Paksa: menu nama → Sinkronisasi → Muat ulang data. Pastikan menu aktif dan "Dijual" di outlet tersebut.'],
        ['Tablet menampilkan "Perangkat tidak terdaftar"', 'Perangkat dicabut aksesnya. Minta kode pairing baru dari Back Office → Perangkat.'],
        ['Order tidak muncul di tablet lain', 'Pastikan kedua tablet online. Order realtime hanya terlihat di outlet yang sama.'],
        ['"Tidak tersinkron" muncul setelah online', 'Operasi ditolak server (mis. order sudah dibayar di tablet lain). Baca pesannya; data di layar otomatis disesuaikan dengan server.'],
        ['Tidak bisa membuat outlet baru', 'Kuota paket penuh (trial: 1 outlet; 1 paket: 5 outlet). Nonaktifkan outlet lain atau tambah paket.'],
        ['Banner merah "Langganan berakhir"', 'Hubungi admin RasaPOS untuk perpanjangan. Laporan tetap bisa dibuka, transaksi baru tidak bisa dibuat.'],
        ['Struk tidak tercetak otomatis', 'Cetak otomatis hanya untuk printer thermal (Web Serial/BLE/RawBT). Dengan Print browser, tekan tombol Cetak.'],
        ['Selisih kas setelah tutup shift', 'Cek Laporan → Audit (kas keluar, buka laci, refund) dan Laporan → Shift. Pastikan semua kas keluar dicatat dengan keterangan.'],
        ['Tanggal laporan terasa "mundur"', 'Transaksi sebelum jam pergantian hari bisnis (default 04:00) masuk ke hari sebelumnya. Ubah di Pengaturan outlet.'],
        ['Mengganti tablet kasir', 'Pastikan tidak ada data tertunda di tablet lama, Cabut perangkat lama, lalu pasangkan tablet baru dengan kode baru.']
    ];

    const GLOSSARY_LINK = '<a data-go="intro" class="text-brand-600 font-semibold cursor-pointer">Kamus istilah ada di modul "Mulai di sini"</a>';

    // =====================================================================================
    // PROGRES
    // =====================================================================================
    const prog = store.get('rp_tutorial', { lessons: {}, quiz: {}, role: 'all' });
    const save = () => store.set('rp_tutorial', prog);
    const lessonKey = (m, i) => `${m.id}:${i}`;
    const modulesForRole = role => MODULES.filter(m => role === 'all' || m.roles.includes(role));
    const moduleDone = m => m.lessons.every((_, i) => prog.lessons[lessonKey(m, i)]) && (m.noQuiz || (prog.quiz[m.id] || 0) >= 70);
    const modulePct = m => {
        const total = m.lessons.length + (m.noQuiz ? 0 : 1);
        const done = m.lessons.filter((_, i) => prog.lessons[lessonKey(m, i)]).length + (!m.noQuiz && (prog.quiz[m.id] || 0) >= 70 ? 1 : 0);
        return Math.round(done / total * 100);
    };
    function updateProgress() {
        const mods = modulesForRole(prog.role);
        const pct = mods.length ? Math.round(mods.reduce((s, m) => s + modulePct(m), 0) / mods.length) : 0;
        $('#t-progress-text').textContent = pct + '%';
        $('#t-progress-bar').style.width = pct + '%';
        renderNav();
    }

    // =====================================================================================
    // NAVIGASI & HALAMAN
    // =====================================================================================
    let current = 'home';
    let query = '';

    function renderNav() {
        const mods = modulesForRole(prog.role);
        $('#t-nav').innerHTML = `<button data-go="home" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left ${current === 'home' ? 'bg-brand-50 text-brand-700 font-semibold' : 'hover:bg-stone-50'}"><i class="fas fa-house w-4"></i>Beranda</button>` +
            mods.map((m, i) => {
                const pct = modulePct(m);
                return `<button data-go="${m.id}" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left ${current === m.id ? 'bg-brand-50 text-brand-700 font-semibold' : 'hover:bg-stone-50'}">
                    <span class="w-6 h-6 rounded-full grid place-items-center text-[11px] font-bold shrink-0 ${pct === 100 ? 'bg-emerald-500 text-white' : 'bg-stone-100 text-stone-500'}">${pct === 100 ? '<i class="fas fa-check"></i>' : i + 1}</span>
                    <span class="flex-1 min-w-0"><span class="block truncate">${m.title}</span><span class="block h-1 bg-stone-100 rounded-full mt-1"><span class="block h-1 rounded-full ${pct === 100 ? 'bg-emerald-500' : 'bg-brand-500'}" style="width:${pct}%"></span></span></span></button>`;
            }).join('');
        $$('#t-nav [data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
    }

    function go(id) {
        current = id;
        location.hash = id;
        toggleSide(false);
        if (id === 'home') renderHome(); else renderModule(MODULES.find(m => m.id === id) || MODULES[0]);
        renderNav();
        window.scrollTo({ top: 0, behavior: 'instant' });
    }

    function renderHome() {
        const mods = modulesForRole(prog.role);
        const done = mods.filter(moduleDone).length;
        const minutes = mods.reduce((s, m) => s + m.minutes, 0);
        $('#t-content').innerHTML = `
            <div class="rounded-3xl bg-stone-900 text-white p-6 lg:p-8 relative overflow-hidden">
                <div class="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-brand-500/20"></div>
                <div class="text-xs uppercase tracking-widest text-brand-500 font-bold">Training RasaPOS</div>
                <h1 class="text-2xl lg:text-3xl font-extrabold mt-2">Selamat datang! 👋</h1>
                <p class="text-stone-300 mt-2 max-w-xl">Pelajari RasaPOS langkah demi langkah sesuai tugas Anda. Setiap modul berisi penjelasan, <b class="text-white">latihan simulasi</b> yang aman (tidak mengubah data asli), dan kuis singkat.</p>
                <div class="flex flex-wrap gap-3 mt-5 text-sm">
                    <span class="px-3 py-1.5 rounded-lg bg-white/10"><i class="fas fa-layer-group mr-1"></i>${mods.length} modul</span>
                    <span class="px-3 py-1.5 rounded-lg bg-white/10"><i class="fas fa-clock mr-1"></i>± ${minutes} menit</span>
                    <span class="px-3 py-1.5 rounded-lg bg-white/10"><i class="fas fa-circle-check mr-1"></i>${done} selesai</span>
                </div>
            </div>
            <h2 class="font-bold text-lg mt-8 mb-3">Pilih peran Anda</h2>
            <div class="grid grid-cols-2 md:grid-cols-5 gap-3">${Object.entries(ROLES).map(([k, v]) => `<button data-role="${k}" class="card p-4 text-left hover:border-brand-500 ${prog.role === k ? 'border-brand-500 bg-brand-50' : ''}">
                <i class="fas ${{ owner: 'fa-crown', manager: 'fa-user-tie', cashier: 'fa-cash-register', waiter: 'fa-bell-concierge', kitchen: 'fa-fire-burner' }[k]} text-brand-500 text-xl"></i>
                <div class="font-semibold mt-2 text-sm">${v}</div><div class="text-[11px] text-stone-500">${modulesForRole(k).length} modul</div></button>`).join('')}</div>
            <h2 class="font-bold text-lg mt-8 mb-3">Modul ${prog.role === 'all' ? '' : 'untuk ' + ROLES[prog.role]}</h2>
            <div class="grid md:grid-cols-2 gap-3">${mods.map((m, i) => { const pct = modulePct(m); return `<button data-go="${m.id}" class="card p-4 text-left hover:border-brand-500 flex gap-4">
                <div class="w-12 h-12 rounded-xl ${pct === 100 ? 'bg-emerald-500' : 'bg-brand-500'} text-white grid place-items-center text-lg shrink-0"><i class="fas ${pct === 100 ? 'fa-check' : m.icon}"></i></div>
                <div class="flex-1 min-w-0"><div class="text-[11px] text-stone-400 font-semibold">MODUL ${i + 1} · ${m.minutes} MENIT</div><div class="font-bold">${m.title}</div><div class="text-xs text-stone-500 mt-0.5">${m.desc}</div>
                <div class="h-1.5 bg-stone-100 rounded-full mt-2"><div class="h-1.5 rounded-full ${pct === 100 ? 'bg-emerald-500' : 'bg-brand-500'}" style="width:${pct}%"></div></div></div></button>`; }).join('')}</div>
            <div class="card p-5 mt-8 flex flex-wrap items-center gap-4"><i class="fas fa-award text-4xl text-brand-500"></i><div class="flex-1 min-w-[200px]"><b>Sertifikat training</b><p class="text-sm text-stone-500">Selesaikan semua modul untuk peran Anda (kuis minimal 70%) untuk mencetak sertifikat.</p></div><button class="btn-primary" data-cert>Lihat sertifikat</button></div>`;
        $$('#t-content [data-role]').forEach(b => b.onclick = () => { prog.role = b.dataset.role; $('#t-role').value = prog.role; save(); updateProgress(); renderHome(); });
        $$('#t-content [data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
        $('[data-cert]').onclick = showCertificate;
    }

    function renderModule(m) {
        const mods = modulesForRole(prog.role);
        const idx = mods.indexOf(m);
        const next = mods[idx + 1];
        const prev = mods[idx - 1];
        $('#t-content').innerHTML = `
            <div class="text-xs text-stone-500 mb-1"><button data-go="home" class="hover:text-brand-600">Beranda</button> / Modul ${idx + 1}</div>
            <div class="flex items-start gap-4"><div class="w-14 h-14 rounded-2xl bg-brand-500 text-white grid place-items-center text-2xl shrink-0"><i class="fas ${m.icon}"></i></div>
                <div class="flex-1"><h1 class="text-2xl font-extrabold">${m.title}</h1><p class="text-stone-500">${m.desc}</p>
                <div class="flex flex-wrap gap-1 mt-2">${m.roles.map(r => `<span class="badge bg-stone-100 text-stone-600">${ROLES[r]}</span>`).join('')}<span class="badge bg-stone-100 text-stone-600"><i class="fas fa-clock mr-1"></i>${m.minutes} menit</span></div></div></div>
            <div class="mt-6 space-y-3">${m.lessons.map((l, i) => {
                const done = prog.lessons[lessonKey(m, i)];
                const hidden = query && !(l.title + l.html).toLowerCase().includes(query);
                return `<section class="card overflow-hidden ${hidden ? 'hidden' : ''}" data-lesson="${i}">
                    <button class="w-full flex items-center gap-3 p-4 text-left" data-toggle="${i}">
                        <span class="w-8 h-8 rounded-full grid place-items-center text-sm font-bold shrink-0 ${done ? 'bg-emerald-500 text-white' : 'bg-brand-50 text-brand-700'}">${done ? '<i class="fas fa-check"></i>' : i + 1}</span>
                        <span class="flex-1 font-bold">${l.title}</span><i class="fas fa-chevron-down text-stone-400 transition-transform" data-chev></i></button>
                    <div class="lesson px-4 pb-4 ${i === firstOpen(m) || query ? '' : 'hidden'}" data-body>${l.html}
                        <div class="mt-4 pt-4 border-t border-stone-100 flex justify-end"><button class="${done ? 'btn-light' : 'btn-success'}" data-done="${i}">${done ? '<i class="fas fa-rotate-left"></i>Tandai belum' : '<i class="fas fa-check"></i>Saya sudah paham'}</button></div></div></section>`;
            }).join('')}</div>
            ${m.noQuiz ? '' : `<div class="card p-5 mt-6" id="quiz"></div>`}
            <div class="flex justify-between gap-2 mt-6">${prev ? `<button class="btn-light" data-go="${prev.id}"><i class="fas fa-arrow-left"></i>${prev.title}</button>` : '<span></span>'}${next ? `<button class="btn-primary" data-go="${next.id}">${next.title}<i class="fas fa-arrow-right"></i></button>` : `<button class="btn-primary" data-cert><i class="fas fa-award"></i>Sertifikat</button>`}</div>`;
        $$('#t-content [data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
        const cert = $('#t-content [data-cert]'); if (cert) cert.onclick = showCertificate;
        $$('[data-toggle]').forEach(b => b.onclick = () => { const s = b.closest('section'); $('[data-body]', s).classList.toggle('hidden'); $('[data-chev]', s).classList.toggle('rotate-180'); initSims(s); });
        $$('[data-done]').forEach(b => b.onclick = () => {
            const k = lessonKey(m, Number(b.dataset.done));
            prog.lessons[k] = !prog.lessons[k];
            save(); updateProgress();
            const open = $$('section[data-lesson]').map(s => !$('[data-body]', s).classList.contains('hidden'));
            renderModule(m);
            // buka pelajaran berikutnya setelah ditandai selesai
            $$('section[data-lesson]').forEach((s, i) => { const show = prog.lessons[k] ? i === Number(b.dataset.done) + 1 || (open[i] && i !== Number(b.dataset.done)) : open[i]; $('[data-body]', s).classList.toggle('hidden', !show); });
            initSims(document);
        });
        $$('[data-faq]').forEach(el => renderFaq(el));
        if (!m.noQuiz) renderQuiz(m);
        initSims(document);
    }

    function firstOpen(m) {
        const i = m.lessons.findIndex((_, j) => !prog.lessons[lessonKey(m, j)]);
        return i === -1 ? 0 : i;
    }

    function renderFaq(el) {
        el.innerHTML = FAQ.filter(f => !query || (f[0] + f[1]).toLowerCase().includes(query)).map(f => `<details class="border-b border-stone-100 py-3"><summary class="font-semibold cursor-pointer">${f[0]}</summary><p class="text-stone-600 mt-2">${f[1]}</p></details>`).join('') + `<p class="mt-4 text-sm">${GLOSSARY_LINK}</p>`;
        $$('[data-go]', el).forEach(b => b.onclick = () => go(b.dataset.go));
    }

    // =====================================================================================
    // KUIS
    // =====================================================================================
    function renderQuiz(m) {
        const box = $('#quiz');
        const best = prog.quiz[m.id];
        const answers = {};
        box.innerHTML = `<div class="flex items-center gap-3 mb-4"><i class="fas fa-clipboard-question text-2xl text-brand-500"></i><div class="flex-1"><b>Kuis: ${m.title}</b><div class="text-xs text-stone-500">Nilai lulus 70%. ${best !== undefined ? `Nilai terbaik Anda: <b class="${best >= 70 ? 'text-emerald-600' : 'text-red-600'}">${best}%</b>` : ''}</div></div></div>
            ${m.quiz.map((q, i) => `<div class="mb-5" data-q="${i}"><div class="font-semibold mb-2">${i + 1}. ${q.q}</div><div class="grid gap-2">${q.o.map((o, j) => `<button data-a="${j}" class="text-left px-4 py-3 rounded-xl border-2 border-stone-200 hover:border-brand-300 text-sm">${o}</button>`).join('')}</div><div data-exp class="hidden mt-2 text-sm p-3 rounded-xl"></div></div>`).join('')}
            <div class="flex items-center gap-3"><button id="q-submit" class="btn-primary"><i class="fas fa-paper-plane"></i>Periksa jawaban</button><span id="q-result" class="font-bold"></span></div>`;
        $$('[data-q]', box).forEach(qel => $$('[data-a]', qel).forEach(b => b.onclick = () => {
            if (box.dataset.checked) return;
            answers[qel.dataset.q] = Number(b.dataset.a);
            $$('[data-a]', qel).forEach(x => x.classList.toggle('!border-brand-500', x === b));
            $$('[data-a]', qel).forEach(x => x.classList.toggle('bg-brand-50', x === b));
        }));
        $('#q-submit', box).onclick = () => {
            if (box.dataset.checked) { delete box.dataset.checked; renderQuiz(m); return; }
            if (Object.keys(answers).length < m.quiz.length) { $('#q-result').textContent = 'Jawab semua pertanyaan dulu'; $('#q-result').className = 'font-bold text-amber-600'; return; }
            let right = 0;
            m.quiz.forEach((q, i) => {
                const qel = $(`[data-q="${i}"]`, box);
                const ok = answers[i] === q.a;
                if (ok) right++;
                $$('[data-a]', qel).forEach((x, j) => {
                    x.classList.remove('!border-brand-500', 'bg-brand-50');
                    if (j === q.a) x.classList.add('!border-emerald-500', 'bg-emerald-50');
                    else if (j === answers[i]) x.classList.add('!border-red-400', 'bg-red-50');
                });
                const exp = $('[data-exp]', qel);
                exp.className = `mt-2 text-sm p-3 rounded-xl ${ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`;
                exp.innerHTML = `<b>${ok ? '✅ Benar.' : '❌ Kurang tepat.'}</b> ${q.e}`;
            });
            const score = Math.round(right / m.quiz.length * 100);
            prog.quiz[m.id] = Math.max(prog.quiz[m.id] || 0, score);
            save(); updateProgress();
            box.dataset.checked = '1';
            $('#q-result').innerHTML = `Nilai ${score}% ${score >= 70 ? '— <span class="text-emerald-600">LULUS 🎉</span>' : '— <span class="text-red-600">belum lulus, coba lagi</span>'}`;
            $('#q-submit').innerHTML = '<i class="fas fa-rotate-left"></i>Ulangi kuis';
        };
    }

    // =====================================================================================
    // SIMULATOR
    // =====================================================================================
    const done = (el, msg) => { el.insertAdjacentHTML('beforeend', `<div class="mt-3 p-3 rounded-xl bg-emerald-50 text-emerald-800 text-sm font-semibold"><i class="fas fa-circle-check mr-1"></i>${msg}</div>`); };
    const numpad = (keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫']) => `<div class="grid grid-cols-3 gap-2">${keys.map(k => `<button data-k="${k}" class="py-3 rounded-xl bg-stone-100 hover:bg-stone-200 text-lg font-semibold active:scale-95">${k}</button>`).join('')}</div>`;

    const SIMS = {
        // ---------- Login PIN ----------
        pin(el) {
            const staff = [['Budi', 'Waiter', '2222'], ['Rina', 'Kasir', '1234'], ['Ayu', 'Manager', '111111']];
            let sel = null, pin = '', tries = 0;
            el.innerHTML = `<div class="rounded-2xl bg-stone-900 text-white p-4 grid md:grid-cols-2 gap-4">
                <div><div class="text-sm font-bold mb-2">Siapa yang bertugas?</div><div class="grid grid-cols-3 gap-2" data-staff>${staff.map((s, i) => `<button data-s="${i}" class="p-3 rounded-xl bg-stone-800 text-left"><div class="w-8 h-8 rounded-full bg-brand-500 grid place-items-center font-bold text-sm">${s[0][0]}</div><div class="text-sm font-semibold mt-1">${s[0]}</div><div class="text-[10px] text-stone-400">${s[1]}</div></button>`).join('')}</div></div>
                <div class="flex flex-col items-center"><div data-who class="text-stone-400 text-sm mb-2">Pilih nama Anda</div><div data-dots class="flex gap-2 h-4 mb-3"></div>
                <div class="grid grid-cols-3 gap-2 w-56">${['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '✓'].map(k => `<button data-k="${k}" class="py-2.5 rounded-xl ${k === '✓' ? 'bg-brand-500' : 'bg-stone-800'} font-semibold active:scale-95">${k}</button>`).join('')}</div><div data-err class="text-red-400 text-xs h-4 mt-2"></div></div></div>`;
            const dots = () => { $('[data-dots]', el).innerHTML = Array.from({ length: Math.max(4, pin.length) }, (_, i) => `<span class="w-3 h-3 rounded-full ${i < pin.length ? 'bg-brand-500' : 'bg-stone-700'}"></span>`).join(''); };
            const submit = () => {
                if (!sel || pin.length < 4) return;
                if (pin === sel[2]) {
                    $('[data-err]', el).textContent = '';
                    if (sel[0] === 'Rina') done(el, `Berhasil login sebagai ${sel[0]} (${sel[1]}). Di aplikasi asli, langkah berikutnya adalah membuka shift.`);
                    else $('[data-err]', el).textContent = `Login sebagai ${sel[0]} berhasil — tapi latihan ini meminta login sebagai Rina.`;
                } else { tries++; $('[data-err]', el).textContent = tries >= 5 ? 'PIN salah 5 kali — di aplikasi asli PIN terkunci 5 menit.' : `PIN salah (${tries}/5)`; }
                pin = ''; dots();
            };
            $$('[data-s]', el).forEach(b => b.onclick = () => { sel = staff[b.dataset.s]; pin = ''; dots(); $('[data-who]', el).innerHTML = `PIN untuk <b class="text-white">${sel[0]}</b>`; $$('[data-s]', el).forEach(x => x.classList.toggle('ring-2', x === b)); $$('[data-s]', el).forEach(x => x.classList.toggle('ring-brand-500', x === b)); });
            $$('[data-k]', el).forEach(b => b.onclick = () => {
                const k = b.dataset.k;
                if (!sel) { $('[data-err]', el).textContent = 'Pilih nama dulu'; return; }
                if (k === 'C') pin = ''; else if (k === '✓') return submit(); else if (pin.length < 6) pin += k;
                dots(); if (pin.length === 6) submit();
            });
            dots();
        },

        // ---------- Buka shift ----------
        shiftopen(el) {
            let buf = '';
            el.innerHTML = `<div class="max-w-sm mx-auto"><p class="text-sm text-stone-500 mb-2">Hitung uang di laci lalu masukkan sebagai modal awal.</p>
                <div data-v class="text-3xl font-extrabold text-center border-b-2 border-brand-500 py-2">Rp 0</div>
                <div class="grid grid-cols-4 gap-2 my-3">${[0, 200000, 300000, 500000].map(v => `<button data-q="${v}" class="py-2 rounded-xl bg-brand-50 text-brand-700 text-xs font-semibold">${rp(v)}</button>`).join('')}</div>
                ${numpad(['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', '⌫'])}<button data-open class="btn-primary w-full mt-3 py-3">Buka shift</button><div data-msg></div></div>`;
            const draw = () => { $('[data-v]', el).textContent = rp(Number(buf) || 0); };
            $$('[data-q]', el).forEach(b => b.onclick = () => { buf = b.dataset.q; draw(); });
            $$('[data-k]', el).forEach(b => b.onclick = () => { const k = b.dataset.k; buf = k === '⌫' ? buf.slice(0, -1) : (buf + k).slice(0, 9); draw(); });
            $('[data-open]', el).onclick = () => {
                $('[data-msg]', el).innerHTML = '';
                if (Number(buf) === 500000) done($('[data-msg]', el), 'Shift dibuka dengan modal Rp 500.000. Badge "Shift" kini tampil di kanan atas kasir.');
                else $('[data-msg]', el).innerHTML = `<div class="mt-3 p-3 rounded-xl bg-amber-50 text-amber-800 text-sm">Modal yang dimasukkan ${rp(Number(buf) || 0)}. Latihan ini meminta Rp 500.000 — coba tombol cepat atau ketik 500000.</div>`;
            };
        },

        // ---------- Kalkulator pajak ----------
        tax(el) {
            el.innerHTML = `<div class="grid md:grid-cols-2 gap-4"><div class="space-y-3 text-sm">
                <div><label class="label">Harga menu (subtotal)</label><input data-f="price" type="number" value="100000" class="input"></div>
                <div class="grid grid-cols-2 gap-2"><div><label class="label">Service %</label><input data-f="service" type="number" value="5" class="input"></div><div><label class="label">Pajak %</label><input data-f="tax" type="number" value="10" class="input"></div></div>
                <label class="flex items-center gap-2"><input data-f="dine" type="checkbox" checked class="accent-orange-500 w-4 h-4">Order dine-in (service berlaku)</label>
                <label class="flex items-center gap-2"><input data-f="tos" type="checkbox" checked class="accent-orange-500 w-4 h-4">Pajak termasuk service</label>
                <label class="flex items-center gap-2"><input data-f="incl" type="checkbox" class="accent-orange-500 w-4 h-4">Harga sudah termasuk pajak</label>
                <div><label class="label">Pembulatan tunai</label><select data-f="round" class="input"><option value="0">Tanpa</option><option value="100" selected>Rp 100</option><option value="500">Rp 500</option><option value="1000">Rp 1.000</option></select></div></div>
                <div class="bg-stone-50 rounded-2xl p-4 font-mono text-sm space-y-1" data-out></div></div>`;
            const calc = () => {
                const f = k => $(`[data-f="${k}"]`, el);
                const cfg = { tax_rate: Number(f('tax').value) || 0, service_rate: Number(f('service').value) || 0, tax_on_service: f('tos').checked, tax_inclusive: f('incl').checked };
                const t = Money.calc({ type: f('dine').checked ? 'dine_in' : 'take_away', items: [{ price: Number(f('price').value) || 0, qty: 1 }] }, cfg);
                const cash = Money.cashDue(t.total, Number(f('round').value));
                const row = (l, v, b) => `<div class="flex justify-between ${b ? 'font-bold text-base border-t border-stone-300 pt-1 mt-1' : ''}"><span>${l}</span><span>${v}</span></div>`;
                $('[data-out]', el).innerHTML = row('Subtotal', rp(t.subtotal)) + row(`Service ${cfg.service_rate}%`, rp(t.service)) + row(`Pajak ${cfg.tax_rate}%${cfg.tax_inclusive ? ' (termasuk)' : ''}`, rp(t.tax)) + row('TOTAL (QRIS/kartu)', rp(t.total), true) + row('Jika bayar tunai', rp(cash)) + `<div class="text-[11px] text-stone-500 font-sans mt-2">${cfg.tax_inclusive ? 'Pajak sudah termasuk dalam harga menu, hanya diekstrak untuk laporan.' : `Pajak dihitung dari ${cfg.tax_on_service ? 'subtotal + service' : 'subtotal saja'}.`}</div>`;
            };
            $$('[data-f]', el).forEach(i => i.oninput = calc);
            calc();
        },

        // ---------- Pairing ----------
        pairing(el) {
            let code = null;
            el.innerHTML = `<div class="grid md:grid-cols-2 gap-4"><div class="rounded-2xl border border-stone-200 p-4"><div class="text-xs font-bold text-stone-500 mb-2"><i class="fas fa-laptop mr-1"></i>BACK OFFICE (pemilik)</div>
                <button data-gen class="btn-primary w-full"><i class="fas fa-link"></i>Pasangkan perangkat</button><div data-code class="text-4xl font-extrabold tracking-[0.3em] text-center text-brand-600 my-4 h-10"></div></div>
                <div class="rounded-2xl bg-stone-900 text-white p-4"><div class="text-xs font-bold text-stone-400 mb-2"><i class="fas fa-tablet-screen-button mr-1"></i>TABLET KASIR</div>
                <input data-in maxlength="6" inputmode="numeric" class="w-full rounded-xl bg-stone-800 text-center text-2xl tracking-[0.4em] font-bold py-3 outline-none" placeholder="••••••"><button data-pair class="btn-primary w-full mt-3">Pasangkan</button><div data-msg class="text-sm mt-2"></div></div></div>`;
            $('[data-gen]', el).onclick = () => { code = String(Math.floor(100000 + Math.random() * 900000)); $('[data-code]', el).textContent = code; };
            $('[data-pair]', el).onclick = () => {
                const v = $('[data-in]', el).value.trim();
                const msg = $('[data-msg]', el);
                if (!code) { msg.innerHTML = '<span class="text-amber-300">Buat kode dulu di Back Office.</span>'; return; }
                if (v !== code) { msg.innerHTML = '<span class="text-red-400">Kode pairing salah atau sudah kedaluwarsa.</span>'; return; }
                msg.innerHTML = '<span class="text-emerald-300"><i class="fas fa-circle-check"></i> Terpasang! Tablet langsung membuka layar login PIN.</span>';
                code = null; $('[data-code]', el).textContent = '✓';
            };
        },

        // ---------- Membuat pesanan ----------
        order(el) {
            const MENU = [
                { id: 1, name: 'Kopi Susu Gula Aren', price: 25000, station: 'Bar', color: '#92400e', mods: [{ g: 'Ukuran', req: true, o: [['Regular', 0], ['Large', 6000]] }, { g: 'Suhu', req: true, o: [['Hot', 0], ['Ice', 0]] }] },
                { id: 2, name: 'Americano', price: 22000, station: 'Bar', color: '#57534e', mods: [] },
                { id: 3, name: 'Nasi Goreng Kampung', price: 35000, station: 'Dapur', color: '#ea580c', mods: [{ g: 'Level Pedas', req: true, o: [['Tidak Pedas', 0], ['Pedas', 0], ['Extra Pedas', 2000]] }] },
                { id: 4, name: 'Kentang Goreng', price: 22000, station: 'Dapur', color: '#eab308', mods: [] },
                { id: 5, name: 'Air Mineral', price: 8000, station: 'Bar', color: '#0ea5e9', mods: [] },
                { id: 6, name: 'Pisang Goreng Keju', price: 24000, station: 'Dapur', color: '#ca8a04', mods: [] }
            ];
            const TASKS = [
                ['dine', 'Pilih channel Dine-in & meja A2'],
                ['kopi', 'Tambahkan 2× Kopi Susu Gula Aren ukuran Large, Ice'],
                ['nasgor', 'Tambahkan 1× Nasi Goreng "Extra Pedas" dengan catatan "tanpa bawang"'],
                ['send', 'Kirim ke dapur (tiket terpecah Bar & Dapur)']
            ];
            const st = { channel: 'take_away', table: null, items: [], sent: [], done: {} };
            el.innerHTML = `<div class="mb-3 p-3 rounded-xl bg-stone-50"><b class="text-sm">Tugas:</b><ol data-tasks class="text-sm mt-1 !ml-0 !list-none space-y-1"></ol></div>
                <div class="grid lg:grid-cols-[1fr_300px] gap-3"><div class="grid grid-cols-2 sm:grid-cols-3 gap-2 content-start" data-grid></div><div class="rounded-2xl border border-stone-200 flex flex-col" data-cart></div></div>
                <div data-modal class="hidden"></div><div data-tickets class="mt-3"></div>`;
            const check = () => {
                const big = st.items.find(i => i.m.id === 1 && i.mods.includes('Large') && i.mods.includes('Ice'));
                st.done.dine = st.channel === 'dine_in' && st.table === 'A2';
                st.done.kopi = !!big && big.qty === 2;
                const ng = st.items.find(i => i.m.id === 3 && i.mods.includes('Extra Pedas') && /bawang/i.test(i.note));
                st.done.nasgor = !!ng;
                st.done.send = st.done.kopi && st.done.nasgor && st.items.every(i => i.sent);
                $('[data-tasks]', el).innerHTML = TASKS.map(([k, t]) => `<li><i class="fas ${st.done[k] ? 'fa-circle-check text-emerald-500' : 'fa-circle text-stone-300'} mr-2"></i>${t}</li>`).join('');
                if (TASKS.every(([k]) => st.done[k]) && !st.finished) { st.finished = true; done(el, 'Hebat! Pesanan dine-in meja A2 terkirim. Perhatikan tiket terpecah per stasiun di bawah.'); }
            };
            const totals = () => Money.calc({ type: st.channel === 'dine_in' ? 'dine_in' : 'take_away', items: st.items.map(i => ({ price: i.price, qty: i.qty })) }, OUTLET);
            const drawGrid = () => {
                $('[data-grid]', el).innerHTML = MENU.map(m => `<button data-m="${m.id}" class="rounded-2xl border border-stone-200 p-2 text-left hover:border-brand-500 bg-white active:scale-95"><div class="h-12 rounded-xl grid place-items-center text-white font-extrabold text-xl" style="background:${m.color}">${m.name[0]}</div><div class="text-xs font-semibold mt-1 leading-tight h-8">${m.name}</div><div class="text-xs text-brand-600 font-bold flex justify-between">${rp(m.price)}${m.mods.length ? '<i class="fas fa-sliders text-stone-300"></i>' : ''}</div></button>`).join('');
                $$('[data-m]', el).forEach(b => b.onclick = () => pick(MENU.find(x => x.id === Number(b.dataset.m))));
            };
            const drawCart = () => {
                const t = totals();
                $('[data-cart]', el).innerHTML = `<div class="p-2 border-b border-stone-100 space-y-2"><div class="grid grid-cols-2 gap-1 bg-stone-100 p-1 rounded-lg text-xs font-semibold">${[['dine_in', 'Dine-in'], ['take_away', 'Take Away']].map(c => `<button data-ch="${c[0]}" ${st.items.length && st.channel !== c[0] ? 'disabled' : ''} class="py-1 rounded-md ${st.channel === c[0] ? 'bg-white text-brand-600 shadow-sm' : 'text-stone-500 disabled:opacity-40'}">${c[1]}</button>`).join('')}</div>
                    ${st.channel === 'dine_in' ? `<div class="flex gap-1">${['A1', 'A2', 'A3'].map(n => `<button data-tb="${n}" class="flex-1 py-1 rounded-lg border text-xs font-semibold ${st.table === n ? 'border-brand-500 bg-brand-50' : 'border-stone-200'}">Meja ${n}</button>`).join('')}</div>` : ''}</div>
                    <div class="flex-1 p-2 space-y-1.5 min-h-[120px]">${st.items.map((i, k) => `<div class="rounded-lg border p-2 text-xs ${i.sent ? 'bg-stone-50 border-stone-200' : 'bg-brand-50/50 border-brand-100'}"><div class="flex justify-between gap-1"><b>${i.qty}× ${i.m.name}</b><span>${rp(i.price * i.qty)}</span></div>
                        ${i.mods.length ? `<div class="text-stone-500">${i.mods.join(', ')}</div>` : ''}${i.note ? `<div class="text-amber-700">📝 ${i.note}</div>` : ''}
                        <div class="flex justify-between items-center mt-1"><span class="font-semibold ${i.sent ? 'text-emerald-600' : 'text-brand-600'}">${i.sent ? '✓✓ Terkirim ' + i.m.station : '● Baru'}</span>${i.sent ? '' : `<span class="flex gap-1"><button data-minus="${k}" class="w-6 h-6 rounded bg-white border">−</button><button data-plus="${k}" class="w-6 h-6 rounded bg-white border">+</button></span>`}</div></div>`).join('') || '<div class="text-center text-stone-400 text-xs py-8">Pilih menu</div>'}</div>
                    <div class="p-2 border-t border-stone-100 text-xs space-y-0.5"><div class="flex justify-between"><span>Subtotal</span><span>${rp(t.subtotal)}</span></div>${t.service ? `<div class="flex justify-between"><span>Service 5%</span><span>${rp(t.service)}</span></div>` : ''}<div class="flex justify-between"><span>PBJT 10%</span><span>${rp(t.tax)}</span></div><div class="flex justify-between font-extrabold text-sm"><span>Total</span><span>${rp(t.total)}</span></div>
                    <button data-send class="btn-outline w-full mt-2 !border-brand-500 !text-brand-600" ${st.items.some(i => !i.sent) ? '' : 'disabled'}><i class="fas fa-paper-plane"></i>Kirim</button></div>`;
                $$('[data-ch]', el).forEach(b => b.onclick = () => { st.channel = b.dataset.ch; if (st.channel !== 'dine_in') st.table = null; drawCart(); check(); });
                $$('[data-tb]', el).forEach(b => b.onclick = () => { st.table = b.dataset.tb; drawCart(); check(); });
                $$('[data-minus]', el).forEach(b => b.onclick = () => { const i = st.items[b.dataset.minus]; i.qty--; if (!i.qty) st.items.splice(b.dataset.minus, 1); drawCart(); check(); });
                $$('[data-plus]', el).forEach(b => b.onclick = () => { st.items[b.dataset.plus].qty++; drawCart(); check(); });
                $('[data-send]', el).onclick = () => {
                    const fresh = st.items.filter(i => !i.sent);
                    const by = {};
                    fresh.forEach(i => { (by[i.m.station] ||= []).push(i); i.sent = true; });
                    $('[data-tickets]', el).innerHTML = `<div class="text-xs font-bold text-stone-500 mb-2">TIKET YANG DITERIMA DAPUR:</div><div class="flex flex-wrap gap-2">${Object.entries(by).map(([s, list]) => `<div class="w-56 rounded-xl bg-neutral-900 text-white overflow-hidden"><div class="bg-emerald-600 px-3 py-1.5 font-bold text-sm">${st.table ? 'Meja ' + st.table : 'Take away'} · ${s}</div><div class="p-2 text-xs space-y-1">${list.map(i => `<div><b>${i.qty}× ${i.m.name}</b>${i.mods.length ? `<div class="text-neutral-400">${i.mods.join(' · ')}</div>` : ''}${i.note ? `<div class="text-amber-400">📝 ${i.note}</div>` : ''}</div>`).join('')}</div></div>`).join('')}</div>`;
                    drawCart(); check();
                };
            };
            const add = (m, mods, price, qty, note) => {
                const same = st.items.find(i => !i.sent && i.m.id === m.id && i.mods.join() === mods.join() && i.note === note);
                if (same) same.qty += qty; else st.items.push({ m, mods, price, qty, note, sent: false });
                drawCart(); check();
            };
            const pick = m => {
                if (!m.mods.length) return add(m, [], m.price, 1, '');
                const sel = m.mods.map(() => 0);
                let qty = 1;
                const box = $('[data-modal]', el);
                const draw = () => {
                    const unit = m.price + m.mods.reduce((s, g, k) => s + g.o[sel[k]][1], 0);
                    box.className = 'mt-3 rounded-2xl border-2 border-brand-500 p-4 bg-white';
                    box.innerHTML = `<div class="flex justify-between"><b>${m.name}</b><button data-x class="text-stone-400"><i class="fas fa-xmark"></i></button></div>
                        ${m.mods.map((g, k) => `<div class="mt-3"><div class="text-xs font-bold mb-1">${g.g} <span class="badge bg-red-50 text-red-600">Wajib</span></div><div class="flex flex-wrap gap-2">${g.o.map((o, j) => `<button data-g="${k}" data-o="${j}" class="px-3 py-2 rounded-xl border-2 text-sm ${sel[k] === j ? 'border-brand-500 bg-brand-50 font-semibold' : 'border-stone-200'}">${o[0]}${o[1] ? ' +' + o[1] / 1000 + 'rb' : ''}</button>`).join('')}</div></div>`).join('')}
                        <input data-note class="input mt-3" placeholder="Catatan item (mis. tanpa bawang)" value="${box.dataset.note || ''}">
                        <div class="flex items-center gap-2 mt-3"><button data-qm class="w-10 h-10 rounded-xl border">−</button><b class="w-6 text-center">${qty}</b><button data-qp class="w-10 h-10 rounded-xl border">+</button><button data-add class="btn-primary flex-1">Tambah · ${rp(unit * qty)}</button></div>`;
                    const keepNote = () => { box.dataset.note = $('[data-note]', box).value; };
                    $$('[data-g]', box).forEach(b => b.onclick = () => { keepNote(); sel[b.dataset.g] = Number(b.dataset.o); draw(); });
                    $('[data-qm]', box).onclick = () => { keepNote(); qty = Math.max(1, qty - 1); draw(); };
                    $('[data-qp]', box).onclick = () => { keepNote(); qty++; draw(); };
                    $('[data-x]', box).onclick = () => { box.className = 'hidden'; box.dataset.note = ''; };
                    $('[data-add]', box).onclick = () => { add(m, m.mods.map((g, k) => g.o[sel[k]][0]), unit, qty, $('[data-note]', box).value.trim()); box.className = 'hidden'; box.dataset.note = ''; };
                };
                draw();
            };
            drawGrid(); drawCart(); check();
        },

        // ---------- Pembayaran ----------
        pay(el) {
            const items = [{ price: 22000, qty: 1 }, { price: 22000, qty: 1 }];
            const total = Money.calc({ type: 'take_away', items }, OUTLET).total; // 48.400
            const methods = [['cash', 'Tunai', 'cash'], ['qris', 'QRIS', 'noncash'], ['debit', 'Debit', 'noncash']];
            let method = 'cash', buf = '', fresh = true;
            const lines = [];
            el.innerHTML = `<div class="mb-3 p-3 rounded-xl bg-stone-50 text-sm"><b>Tugas:</b> tagihan take away <b>${rp(total)}</b>. Pelanggan membayar <b>Rp 20.000 via QRIS</b>, sisanya <b>tunai uang pas</b>.</div>
                <div class="grid md:grid-cols-[220px_1fr] gap-3"><div class="rounded-2xl bg-stone-50 p-3 text-sm flex flex-col"><div class="text-xs text-stone-500">Total tagihan</div><div class="text-2xl font-extrabold">${rp(total)}</div><div data-lines class="space-y-1 my-2 flex-1"></div>
                    <div class="border-t border-stone-200 pt-2 space-y-0.5"><div class="flex justify-between"><span>Dibayar</span><b data-paid></b></div><div class="flex justify-between"><span>Sisa</span><b data-rem class="text-red-500"></b></div><div class="flex justify-between"><span>Kembali</span><b data-chg class="text-emerald-600"></b></div></div></div>
                <div><div class="grid grid-cols-3 gap-2" data-methods></div><div data-input class="text-2xl font-bold border-b-2 border-brand-500 py-1 my-3">Rp 0</div><div data-quick class="grid grid-cols-3 gap-2 mb-2"></div>${numpad(['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', '⌫'])}
                <div class="grid grid-cols-2 gap-2 mt-2"><button data-split class="btn-outline"><i class="fas fa-plus"></i>Split payment</button><button data-done class="btn-success"><i class="fas fa-check"></i>Selesaikan</button></div><div data-msg></div></div></div>`;
            const type = m => methods.find(x => x[0] === m)[2];
            const remaining = m => { const paid = lines.reduce((s, l) => s + l.amount, 0); const rem = Math.max(0, total - paid); return type(m) === 'cash' ? Money.cashDue(rem, 100) : rem; };
            const all = () => [...lines, ...(Number(buf) > 0 ? [{ method, type: type(method), amount: Number(buf) }] : [])];
            const draw = () => {
                const s = Money.settle(total, all(), 100);
                $('[data-methods]', el).innerHTML = methods.map(m => `<button data-m="${m[0]}" class="py-2.5 rounded-xl border-2 text-sm font-semibold ${method === m[0] ? 'border-brand-500 bg-brand-50' : 'border-stone-200'}">${m[1]}</button>`).join('');
                $$('[data-m]', el).forEach(b => b.onclick = () => { method = b.dataset.m; buf = type(method) === 'cash' ? '' : String(remaining(method)); fresh = true; draw(); });
                $('[data-input]', el).textContent = rp(Number(buf) || 0) + ` (${methods.find(x => x[0] === method)[1]})`;
                const rem = remaining(method);
                $('[data-quick]', el).innerHTML = (type(method) === 'cash' ? [rem, 50000, 100000] : [rem]).map((v, i) => `<button data-qv="${v}" class="py-2 rounded-xl bg-brand-50 text-brand-700 text-xs font-semibold">${i === 0 ? 'Uang pas · ' : ''}${rp(v)}</button>`).join('');
                $$('[data-qv]', el).forEach(b => b.onclick = () => { buf = b.dataset.qv; fresh = true; draw(); });
                $('[data-lines]', el).innerHTML = lines.map((l, i) => `<div class="flex justify-between bg-white rounded-lg px-2 py-1 border border-stone-200 text-xs"><span>${methods.find(x => x[0] === l.method)[1]}</span><span>${rp(l.amount)} <button data-del="${i}" class="text-red-500 ml-1">✕</button></span></div>`).join('');
                $$('[data-del]', el).forEach(b => b.onclick = () => { lines.splice(b.dataset.del, 1); draw(); });
                $('[data-paid]', el).textContent = rp(s.paid); $('[data-rem]', el).textContent = rp(s.remaining); $('[data-chg]', el).textContent = rp(s.change);
            };
            $$('[data-k]', el).forEach(b => b.onclick = () => { const k = b.dataset.k; if (fresh && k !== '⌫') buf = ''; fresh = false; buf = k === '⌫' ? buf.slice(0, -1) : (buf + k).slice(0, 9); draw(); });
            $('[data-split]', el).onclick = () => {
                if (!(Number(buf) > 0)) return;
                lines.push({ method, type: type(method), amount: type(method) === 'cash' ? Number(buf) : Math.min(Number(buf), remaining(method)) });
                method = method === 'cash' ? 'qris' : 'cash'; buf = type(method) === 'cash' ? '' : String(remaining(method)); fresh = true; draw();
            };
            $('[data-done]', el).onclick = () => {
                const pays = all(), s = Money.settle(total, pays, 100);
                const msg = $('[data-msg]', el);
                msg.innerHTML = '';
                if (!s.ok) { msg.innerHTML = `<div class="mt-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">${s.remaining > 0 ? 'Pembayaran kurang ' + rp(s.remaining) : 'Tidak valid: tunai tidak boleh ditambahkan jika non-tunai sudah melunasi tagihan.'}</div>`; return; }
                const q = pays.filter(p => p.method === 'qris').reduce((a, p) => a + p.amount, 0), c = pays.filter(p => p.type === 'cash').reduce((a, p) => a + p.amount, 0);
                if (q === 20000 && c === total - 20000 && s.change === 0) done(msg, `Benar! QRIS ${rp(20000)} + tunai ${rp(c)}, kembalian Rp 0. Di aplikasi asli struk tercetak & laci terbuka.`);
                else msg.innerHTML = `<div class="mt-3 p-3 rounded-xl bg-amber-50 text-amber-800 text-sm">Pembayaran valid (kembali ${rp(s.change)}), tapi belum sesuai tugas: QRIS Rp 20.000 + tunai uang pas. Hapus baris dengan ✕ dan coba lagi.</div>`;
            };
            draw();
        },

        // ---------- Void ----------
        void(el) {
            const st = { qty: 3, voided: 0 };
            const draw = () => {
                el.innerHTML = `<div class="rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm"><div class="flex justify-between"><b>${st.qty - st.voided}× Es Teh Leci</b><span>${rp((st.qty - st.voided) * 20000)}</span></div><div class="text-xs text-emerald-600 font-semibold">✓✓ Terkirim Bar</div>
                    ${st.voided ? `<div class="mt-2 line-through text-stone-400">${st.voided}× Es Teh Leci — void: Salah input</div>` : ''}</div>
                    <p class="text-sm mt-3">Pelanggan hanya memesan 2, bukan 3. Void <b>1</b> Es Teh Leci sebagai kasir.</p>
                    <div class="grid sm:grid-cols-3 gap-2 mt-2"><div><label class="label">Jumlah</label><input data-q type="number" min="1" max="${st.qty}" value="1" class="input"></div><div class="sm:col-span-2"><label class="label">Alasan</label><select data-r class="input"><option value="">— pilih —</option><option>Salah input</option><option>Pelanggan batal</option><option>Menu habis</option></select></div></div>
                    <div class="grid sm:grid-cols-2 gap-2 mt-2"><div><label class="label">Manager yang menyetujui</label><select class="input"><option>Ayu (Manager)</option></select></div><div><label class="label">PIN manager</label><input data-p type="password" maxlength="6" class="input" placeholder="••••••"></div></div>
                    <button data-v class="btn-danger mt-3"><i class="fas fa-ban"></i>Void item</button><div data-msg></div>`;
                $('[data-v]', el).onclick = () => {
                    const msg = $('[data-msg]', el);
                    const q = Number($('[data-q]', el).value), r = $('[data-r]', el).value, p = $('[data-p]', el).value;
                    const err = t => { msg.innerHTML = `<div class="mt-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">${t}</div>`; };
                    if (!r) return err('Alasan void wajib diisi.');
                    if (p !== '111111') return err('PIN manager salah. (Petunjuk latihan: 111111)');
                    if (q !== 1) return err('Jumlah void seharusnya 1.');
                    st.voided = 1; draw();
                    done($('[data-msg]', el), 'Void berhasil. Dapur melihat item ini dibatalkan, dan audit mencatat alasan serta nama manager yang menyetujui.');
                };
            };
            draw();
        },

        // ---------- Meja ----------
        tables(el) {
            const S = {
                empty: ['Kosong', 'bg-white border-stone-200', 'Siap dipakai. Ketuk → pilih jumlah tamu untuk membuka meja.'],
                seated: ['Terisi, belum pesan', 'bg-sky-50 border-sky-300', 'Meja sudah dibuka tetapi belum ada pesanan. Segera tawarkan menu.'],
                ordered: ['Sudah pesan', 'bg-brand-50 border-brand-500', 'Pesanan sudah masuk. Timer menunjukkan lama tamu duduk.'],
                bill: ['Minta bill', 'bg-red-50 border-red-500 pulse-red', 'Pre-bill sudah dicetak. Tamu siap membayar — prioritaskan!'],
                dirty: ['Perlu dibersihkan', 'bg-stone-200 border-stone-300', 'Sudah dibayar. Setelah dibersihkan, ketuk → Tandai sudah bersih.']
            };
            const tables = [['A1', 'empty'], ['A2', 'ordered', 24], ['A3', 'bill', 67], ['A4', 'seated', 3], ['A5', 'dirty'], ['A6', 'ordered', 72]];
            el.innerHTML = `<p class="text-sm mb-3"><b>Tugas:</b> ketuk meja yang <b>harus didahulukan kasir</b> karena tamu ingin membayar.</p>
                <div class="grid grid-cols-3 sm:grid-cols-6 gap-2">${tables.map(([n, s, m]) => `<button data-t="${n}" data-s="${s}" class="rounded-xl border-2 ${S[s][1]} p-2 h-24 text-left flex flex-col"><b class="text-lg">${n}</b><span class="text-[10px] font-semibold">${S[s][0]}</span>${m ? `<span class="mt-auto text-[10px] ${m > 60 ? 'text-red-600 font-bold' : 'text-stone-500'}"><i class="fas fa-clock"></i> ${m} mnt</span>` : ''}</button>`).join('')}</div><div data-info class="mt-3"></div>`;
            $$('[data-t]', el).forEach(b => b.onclick = () => {
                const s = b.dataset.s;
                $('[data-info]', el).innerHTML = `<div class="p-3 rounded-xl bg-stone-50 text-sm"><b>Meja ${b.dataset.t} — ${S[s][0]}:</b> ${S[s][2]}</div>`;
                if (s === 'bill') done($('[data-info]', el), 'Tepat! Meja berkedip merah = minta bill. Ketuk meja → Bayar.');
            });
        },

        // ---------- Tutup shift ----------
        shiftclose(el) {
            const fields = [['open', 'Modal awal', 500000], ['cash', 'Penjualan tunai (setelah kembalian)', 1250000], ['in', 'Kas masuk', 100000], ['out', 'Kas keluar', 45000], ['refund', 'Refund tunai', 30000], ['actual', 'Uang fisik dihitung di laci', 1770000]];
            el.innerHTML = `<div class="grid md:grid-cols-2 gap-4"><div class="space-y-2">${fields.map(([k, l, v]) => `<div><label class="label">${l}</label><input data-f="${k}" type="number" value="${v}" class="input"></div>`).join('')}</div>
                <div><div data-out class="bg-stone-50 rounded-2xl p-4 text-sm space-y-1"></div><div class="mt-3"><label class="label">Berapa selisihnya? (tebak dulu)</label><div class="flex gap-2"><input data-guess type="number" class="input" placeholder="mis. -5000"><button data-check class="btn-primary">Cek</button></div><div data-msg></div></div></div></div>`;
            const vals = () => Object.fromEntries(fields.map(([k]) => [k, Number($(`[data-f="${k}"]`, el).value) || 0]));
            const calc = () => {
                const v = vals();
                const exp = v.open + v.cash + v.in - v.out - v.refund;
                const diff = v.actual - exp;
                $('[data-out]', el).innerHTML = `<div class="flex justify-between"><span>Modal awal</span><span>${rp(v.open)}</span></div><div class="flex justify-between"><span>+ Penjualan tunai</span><span>${rp(v.cash)}</span></div><div class="flex justify-between"><span>+ Kas masuk</span><span>${rp(v.in)}</span></div><div class="flex justify-between"><span>− Kas keluar</span><span>${rp(v.out)}</span></div><div class="flex justify-between"><span>− Refund tunai</span><span>${rp(v.refund)}</span></div>
                    <div class="flex justify-between font-bold border-t border-stone-300 pt-1"><span>Kas seharusnya</span><span>${rp(exp)}</span></div><div class="flex justify-between"><span>Kas aktual</span><span>${rp(v.actual)}</span></div>
                    <div data-diffrow class="hidden flex justify-between font-bold ${diff < 0 ? 'text-red-600' : diff > 0 ? 'text-amber-600' : 'text-emerald-600'}"><span>Selisih</span><span>${rp(diff)}</span></div>`;
                return diff;
            };
            $$('[data-f]', el).forEach(i => i.oninput = () => { calc(); $('[data-msg]', el).innerHTML = ''; });
            $('[data-check]', el).onclick = () => {
                const diff = calc();
                $('[data-diffrow]', el).classList.remove('hidden');
                $('[data-diffrow]', el).classList.add('flex');
                const g = Number($('[data-guess]', el).value);
                const msg = $('[data-msg]', el);
                msg.innerHTML = '';
                if (g === diff) done(msg, `Benar, selisih ${rp(diff)}. ${diff < 0 ? 'Uang kurang — cek kas keluar yang belum dicatat.' : diff > 0 ? 'Uang lebih — mungkin kembalian kurang diberikan.' : 'Kas cocok sempurna!'}`);
                else msg.innerHTML = `<div class="mt-2 p-3 rounded-xl bg-amber-50 text-amber-800 text-sm">Belum tepat. Selisih = kas aktual − kas seharusnya = ${rp(diff)}.</div>`;
            };
            calc();
        },

        // ---------- KDS ----------
        kds(el) {
            let seq = 40;
            const pool = [['Meja A2', 'Dapur', [['2', 'Nasi Goreng Kampung', 'Pedas', 'tanpa bawang'], ['1', 'Kentang Goreng', '', '']]], ['TA-031 · Andi', 'Bar', [['2', 'Kopi Susu Gula Aren', 'Large · Ice', '']]], ['Meja B1', 'Dapur', [['1', 'Ayam Bakar Madu', 'Sedang', '']]], ['GoFood · GF-118', 'Bar', [['1', 'Matcha Latte', 'Ice · Oat Milk', 'less sugar']]]];
            const tickets = [{ id: ++seq, label: 'Meja A8', station: 'Dapur', age: 23, status: 'progress', items: [['2', 'Mie Goreng Jawa', 'Tidak Pedas', ''], ['1', 'Pisang Goreng Keju', '', '']] }, { id: ++seq, label: 'Meja C1', station: 'Bar', age: 12, status: 'new', items: [['3', 'Es Teh Leci', 'Less Sugar', '']] }];
            let served = 0, filter = 'Semua';
            el.innerHTML = `<div class="rounded-2xl bg-neutral-950 text-neutral-100 p-3"><div class="flex items-center gap-2 mb-3 text-sm"><div data-st class="flex bg-neutral-800 rounded-lg p-1"></div><span class="ml-auto text-neutral-400" data-count></span><button data-add class="px-3 py-1.5 rounded-lg bg-neutral-800 text-xs"><i class="fas fa-plus mr-1"></i>Simulasikan pesanan masuk</button></div><div data-board class="flex gap-3 overflow-x-auto thin-scroll pb-2 min-h-[220px]"></div></div><div data-msg></div>`;
            const draw = () => {
                $('[data-st]', el).innerHTML = ['Semua', 'Dapur', 'Bar'].map(s => `<button data-f="${s}" class="px-3 py-1 rounded-md text-xs font-semibold ${filter === s ? 'bg-brand-500 text-white' : 'text-neutral-400'}">${s}</button>`).join('');
                $$('[data-f]', el).forEach(b => b.onclick = () => { filter = b.dataset.f; draw(); });
                const list = tickets.filter(t => filter === 'Semua' || t.station === filter);
                $('[data-count]', el).textContent = `${tickets.filter(t => t.status === 'new').length} baru · ${tickets.filter(t => t.status === 'progress').length} diproses · ${served} selesai`;
                $('[data-board]', el).innerHTML = list.map(t => `<div class="w-56 shrink-0 bg-neutral-900 rounded-xl overflow-hidden border ${t.status === 'new' ? 'border-sky-500' : 'border-neutral-800'}"><div class="${t.age >= 20 ? 'bg-red-600' : t.age >= 10 ? 'bg-amber-500' : 'bg-emerald-600'} px-3 py-1.5 flex justify-between"><div><b class="text-sm">${t.label}</b><div class="text-[10px]">#${t.id} · ${t.station}</div></div><b class="font-mono ${t.age >= 20 ? 'blink' : ''}">${String(t.age).padStart(2, '0')}m</b></div>
                    <div class="p-2 space-y-1.5 text-xs">${t.items.map(i => `<div class="flex gap-2"><span class="w-6 h-6 rounded bg-neutral-800 grid place-items-center font-bold">${i[0]}</span><span><b>${i[1]}</b>${i[2] ? `<div class="text-neutral-400">${i[2]}</div>` : ''}${i[3] ? `<div class="text-amber-400 font-semibold">📝 ${i[3]}</div>` : ''}</span></div>`).join('')}</div>
                    <div class="p-2 pt-0 flex gap-1">${t.status === 'new' ? `<button data-start="${t.id}" class="flex-1 py-2 rounded-lg bg-sky-600 text-xs font-bold">Mulai</button>` : ''}<button data-ready="${t.id}" class="flex-1 py-2 rounded-lg bg-emerald-600 text-xs font-bold">Siap</button></div></div>`).join('') || '<div class="m-auto text-neutral-500 text-sm">Tidak ada tiket 🎉</div>';
                $$('[data-start]', el).forEach(b => b.onclick = () => { tickets.find(t => t.id === Number(b.dataset.start)).status = 'progress'; draw(); });
                $$('[data-ready]', el).forEach(b => b.onclick = () => {
                    tickets.splice(tickets.findIndex(t => t.id === Number(b.dataset.ready)), 1);
                    served++; draw();
                    if (served === 3 && !el.dataset.done) { el.dataset.done = 1; done($('[data-msg]', el), '3 tiket selesai! Di aplikasi asli, kasir/waiter langsung mendapat notifikasi "siap diantar". Tip: kerjakan tiket merah lebih dulu.'); }
                });
            };
            $('[data-add]', el).onclick = () => { const p = pool[seq % pool.length]; tickets.push({ id: ++seq, label: p[0], station: p[1], age: 0, status: 'new', items: p[2] }); draw(); };
            const timer = setInterval(() => { if (!document.body.contains(el)) return clearInterval(timer); tickets.forEach(t => t.age++); draw(); }, 6000);
            draw();
        },

        // ---------- Offline ----------
        offline(el) {
            let online = true, pending = 0, synced = 0, n = 0;
            el.innerHTML = `<div class="flex flex-wrap items-center gap-2 mb-3"><button data-net class="btn"></button><span data-badge class="badge"></span></div>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-2">${['Buat order', 'Kirim dapur', 'Terima bayar', 'Split bill'].map((a, i) => `<button data-act="${i}" class="btn-light py-3 text-sm">${a}</button>`).join('')}</div>
                <div data-log class="mt-3 text-xs space-y-1 max-h-40 overflow-y-auto thin-scroll"></div><div data-msg></div>`;
            const log = (t, cls = '') => $('[data-log]', el).insertAdjacentHTML('afterbegin', `<div class="${cls}">${new Date().toLocaleTimeString('id-ID')} — ${t}</div>`);
            const draw = () => {
                const b = $('[data-net]', el);
                b.className = 'btn ' + (online ? 'bg-red-50 text-red-600' : 'bg-emerald-500 text-white');
                b.innerHTML = online ? '<i class="fas fa-plug-circle-xmark"></i>Putuskan internet' : '<i class="fas fa-wifi"></i>Sambungkan internet';
                const badge = $('[data-badge]', el);
                badge.className = 'badge ' + (online ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600');
                badge.innerHTML = online ? '● Online' : `<i class="fas fa-plug-circle-xmark mr-1"></i>Offline${pending ? ' · ' + pending + ' tertunda' : ''}`;
            };
            $('[data-net]', el).onclick = () => {
                online = !online;
                if (online && pending) {
                    log(`Internet kembali — mengirim ${pending} data…`, 'text-amber-600');
                    const k = pending;
                    setTimeout(() => { synced += k; pending = 0; log(`✔ ${k} data tersinkron ke server. Muncul di dashboard pemilik.`, 'text-emerald-600 font-semibold'); draw(); if (synced >= 3 && !el.dataset.done) { el.dataset.done = 1; done($('[data-msg]', el), 'Anda melihat sendiri: transaksi offline tidak hilang dan terkirim otomatis.'); } }, 1200);
                } else log(online ? 'Online' : 'Internet putus — kasir tetap berjalan', online ? '' : 'text-red-600');
                draw();
            };
            $$('[data-act]', el).forEach(b => b.onclick = () => {
                const i = Number(b.dataset.act);
                if (i === 3 && !online) { log('✖ Split bill butuh online. Tunggu internet kembali.', 'text-red-600'); return; }
                n++;
                if (online) log(`✔ ${b.textContent} #${n} langsung terkirim`, 'text-stone-600');
                else { pending++; log(`💾 ${b.textContent} #${n} disimpan di tablet (tertunda)`, 'text-amber-700'); }
                draw();
            });
            log('Tugas: putuskan internet, lakukan beberapa transaksi, lalu sambungkan lagi.', 'text-stone-500');
            draw();
        }
    };

    function initSims(root) {
        $$('[data-sim]', root).forEach(el => {
            if (el.dataset.ready || el.closest('.hidden')) return;
            el.dataset.ready = '1';
            try { SIMS[el.dataset.sim](el); } catch (e) { el.innerHTML = `<p class="text-red-600 text-sm">Simulasi gagal dimuat: ${e.message}</p>`; }
        });
    }

    // =====================================================================================
    // SERTIFIKAT
    // =====================================================================================
    function showCertificate() {
        const role = prog.role === 'all' ? null : prog.role;
        const mods = modulesForRole(prog.role);
        const finished = mods.filter(moduleDone);
        const ok = role && finished.length === mods.length;
        const box = $('#certificate');
        if (!ok) {
            const left = mods.filter(m => !moduleDone(m));
            $('#t-content').insertAdjacentHTML('afterbegin', `<div class="card p-5 mb-4 border-amber-300 bg-amber-50" data-cert-msg>
                <div class="flex gap-3"><i class="fas fa-award text-3xl text-amber-500"></i><div class="flex-1"><b>Sertifikat belum tersedia</b>
                <p class="text-sm text-stone-600 mt-1">${role ? `Selesaikan semua modul untuk peran <b>${ROLES[role]}</b> (tandai semua pelajaran & lulus kuis ≥ 70%). Sisa:` : 'Pilih peran Anda terlebih dahulu di menu kiri.'}</p>
                ${role ? `<div class="flex flex-wrap gap-2 mt-2">${left.map(m => `<button data-go="${m.id}" class="badge bg-white border border-amber-300 text-amber-800 !py-1">${m.title} — ${modulePct(m)}%</button>`).join('')}</div>` : ''}</div>
                <button data-x class="w-8 h-8 rounded-lg hover:bg-amber-100"><i class="fas fa-xmark"></i></button></div></div>`);
            const msg = $('[data-cert-msg]');
            $$('[data-go]', msg).forEach(b => b.onclick = () => go(b.dataset.go));
            $('[data-x]', msg).onclick = () => msg.remove();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            toggleSide(false);
            return;
        }
        box.classList.remove('hidden'); box.classList.add('flex');
        $('#cert-role').textContent = ROLES[role];
        const avg = Math.round(mods.filter(m => !m.noQuiz).reduce((s, m) => s + (prog.quiz[m.id] || 0), 0) / Math.max(1, mods.filter(m => !m.noQuiz).length));
        $('#cert-detail').textContent = `${mods.length} modul · rata-rata nilai kuis ${avg}%`;
        $('#cert-date').textContent = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
        const name = $('#cert-name');
        name.value = store.get('rp_tutorial_name', '');
        const sync = () => { $('#cert-name-print').textContent = name.value || ' '; store.set('rp_tutorial_name', name.value); };
        name.oninput = sync; sync();
        $('#cert-close').onclick = () => { box.classList.add('hidden'); box.classList.remove('flex'); };
        $('#cert-print').onclick = () => { if (!name.value.trim()) { name.focus(); return; } window.print(); };
    }

    // =====================================================================================
    // INIT
    // =====================================================================================
    function toggleSide(open) {
        $('#t-side').classList.toggle('-translate-x-full', !open);
        $('#t-backdrop').classList.toggle('hidden', !open);
    }
    const onSearch = e => {
        query = e.target.value.trim().toLowerCase();
        if (!query) { go(current); return; }
        const hit = MODULES.find(m => (m.title + m.desc + m.lessons.map(l => l.title + l.html).join('')).toLowerCase().includes(query) && (prog.role === 'all' || m.roles.includes(prog.role))) || MODULES.find(m => (m.title + m.lessons.map(l => l.html).join('')).toLowerCase().includes(query));
        if (hit) { current = hit.id; renderModule(hit); renderNav(); }
        else $('#t-content').innerHTML = `<div class="card p-10 text-center text-stone-500"><i class="fas fa-magnifying-glass text-3xl text-stone-300"></i><p class="mt-3">Tidak ditemukan untuk "<b>${e.target.value.replace(/[<>&]/g, '')}</b>". Coba kata lain atau buka FAQ.</p></div>`;
    };
    $('#t-search').oninput = onSearch;
    $('#t-search-m').oninput = onSearch;
    $('#t-role').value = prog.role;
    $('#t-role').onchange = e => { prog.role = e.target.value; save(); updateProgress(); go(current === 'home' || modulesForRole(prog.role).some(m => m.id === current) ? current : 'home'); };
    $('#t-menu').onclick = () => toggleSide(true);
    $('#t-backdrop').onclick = () => toggleSide(false);
    $('#t-cert').onclick = showCertificate;
    $('#t-reset').onclick = () => { if (confirm('Hapus semua progres training di perangkat ini?')) { prog.lessons = {}; prog.quiz = {}; save(); updateProgress(); go('home'); } };

    // Peran otomatis dari sesi aplikasi (jika ada)
    if (!store.get('rp_tutorial', null)) {
        const staff = store.get('rp_staff', null), user = store.get('rp_user', null), dev = store.get('rp_device', null);
        if (staff && staff.staff) prog.role = staff.staff.role;
        else if (dev && dev.device && dev.device.type === 'kds') prog.role = 'kitchen';
        else if (user && user.user) prog.role = user.user.role === 'owner' ? 'owner' : 'manager';
        $('#t-role').value = prog.role;
        save();
    }
    const start = location.hash.slice(1);
    updateProgress();
    go(MODULES.some(m => m.id === start) ? start : 'home');
})();
