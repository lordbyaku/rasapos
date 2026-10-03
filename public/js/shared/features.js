// Fitur per tenant yang bisa diaktifkan/dinonaktifkan superadmin. Dipakai Worker, Durable Object, dan semua halaman.
// Disimpan sebagai JSON { kunci: true|false } — kunci yang tidak ada memakai nilai default (aktif),
// sehingga tenant lama & fitur baru otomatis aktif.
(function (root) {
    const LIST = [
        { key: 'kds', icon: 'fa-fire-burner', label: 'Layar Dapur (KDS)', desc: 'Tablet/TV dapur menampilkan pesanan. Jika nonaktif: perangkat KDS tidak bisa dipasangkan & dibuka. Tiket dapur tetap bisa dicetak dari kasir.' },
        { key: 'tables', icon: 'fa-chair', label: 'Meja & denah', desc: 'Area, meja, pindah meja. Jika nonaktif: dine-in tanpa nomor meja (cukup nama pemesan).' },
        { key: 'inventory', icon: 'fa-boxes-stacked', label: 'Inventori & resep', desc: 'Bahan baku, resep, stok otomatis, HPP. Jika nonaktif: penjualan tidak memotong stok.' },
        { key: 'marketing', icon: 'fa-tags', label: 'Promo, pelanggan & poin', desc: 'Promo otomatis/manual, data pelanggan, poin loyalitas. Diskon manual kasir tetap ada.' },
        { key: 'ai', icon: 'fa-robot', label: 'Asisten AI panduan', desc: 'Jawaban AI (Gemini) di halaman panduan. Jika nonaktif: hanya pencarian panduan.' }
    ];
    const KEYS = LIST.map(f => f.key);

    /** JSON/objek tersimpan → objek lengkap { kds: true, ... } */
    function resolve(stored) {
        let v = stored;
        if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
        const out = {};
        for (const k of KEYS) out[k] = !(v && v[k] === false);
        return out;
    }

    /** Hanya simpan kunci yang dikenal, nilai boolean. */
    function sanitize(input) {
        const out = {};
        for (const k of KEYS) if (input && typeof input[k] === 'boolean') out[k] = input[k];
        return out;
    }

    root.Features = { LIST, KEYS, resolve, sanitize };
})(typeof globalThis !== 'undefined' ? globalThis : window);
