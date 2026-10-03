// Isi panduan & training RasaPOS (data saja, tanpa DOM).
// Dipakai halaman tutorial (browser) dan Worker (asisten AI) — jangan menaruh kode browser di sini.
(function (root) {
    const ROLES = { owner: 'Pemilik / Owner', manager: 'Manager outlet', cashier: 'Kasir', waiter: 'Waiter / Pelayan', kitchen: 'Dapur / Bar' };

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

    root.RasaTutorial = { ROLES, MODULES, FAQ };
})(typeof globalThis !== 'undefined' ? globalThis : window);
